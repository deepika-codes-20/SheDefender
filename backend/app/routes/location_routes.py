import secrets
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from backend.app.models import db, LocationSession, LocationUpdate, Notification, EmergencyAlert
from backend.app.auth.decorators import token_required, role_required
from backend.app.services.intelligence_service import evaluate_location_safety
from backend.app.utils.time_utils import utc_iso

location_bp = Blueprint('location', __name__, url_prefix='/api/location')

@location_bp.route('/start', methods=['POST'])
@token_required
@role_required(['USER'])
def start_live_tracking(current_user):
    """
    Start live location tracking session.
    Optional body: { 'authorized_contact_ids': [1, 2], 'initial_lat': 12.97, 'initial_lng': 77.59, 'accuracy': 10 }
    """
    data = request.get_json() or {}
    contact_ids = data.get('authorized_contact_ids', [])
    if not isinstance(contact_ids, list):
        return jsonify({'success': False, 'message': 'Authorized contacts must be a list.'}), 400
    from backend.app.models import TrustedContact
    valid_contact_ids = {c.id for c in TrustedContact.query.filter_by(user_id=current_user.id, can_view_live_location=True).all()}
    if any(not isinstance(cid, int) or cid not in valid_contact_ids for cid in contact_ids):
        return jsonify({'success': False, 'message': 'One or more selected contacts do not belong to your account.'}), 403
    contact_ids = list(dict.fromkeys(contact_ids))
    initial_lat = data.get('initial_lat')
    initial_lng = data.get('initial_lng')
    accuracy = data.get('accuracy', 10.0)
    if (initial_lat is None) != (initial_lng is None):
        return jsonify({'success': False, 'message': 'Provide both initial latitude and longitude.'}), 400
    if initial_lat is not None:
        try:
            initial_lat, initial_lng = float(initial_lat), float(initial_lng)
            accuracy = max(0.0, float(accuracy or 0.0))
            if not (-90 <= initial_lat <= 90 and -180 <= initial_lng <= 180):
                raise ValueError()
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Initial GPS coordinates are invalid.'}), 400

    # Deactivate any previous active sessions for this user
    active_sessions = LocationSession.query.filter_by(user_id=current_user.id, status='ACTIVE').all()
    for s in active_sessions:
        s.status = 'STOPPED'
        s.ended_at = datetime.now(timezone.utc)

    # Generate unique session token for authorized sharing link
    session_token = secrets.token_urlsafe(32)

    new_session = LocationSession(
        session_token=session_token,
        user_id=current_user.id,
        status='ACTIVE',
        started_at=datetime.now(timezone.utc)
    )
    new_session.set_authorized_contacts(contact_ids)
    db.session.add(new_session)
    db.session.flush()

    # Record initial location if provided
    if initial_lat is not None and initial_lng is not None:
        update = LocationUpdate(
            session_id=new_session.id,
            user_id=current_user.id,
            latitude=float(initial_lat),
            longitude=float(initial_lng),
            accuracy=float(accuracy)
        )
        db.session.add(update)

    # Notification
    notif = Notification(
        user_id=current_user.id,
        type='LOCATION_SHARING',
        title='Live Location Active',
        message=f'Live tracking started. Location is being shared with {len(contact_ids)} authorized contact(s).'
    )
    db.session.add(notif)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Live tracking session started.',
        'session': new_session.to_dict(),
        'share_url': f"/track/{session_token}"
    }), 201


@location_bp.route('/update', methods=['POST'])
@token_required
@role_required(['USER'])
def update_location(current_user):
    """
    Update live location from smartphone Geolocation API.
    Body: { 'latitude': 12.93, 'longitude': 77.62, 'accuracy': 8.5, 'speed': 0, 'heading': 0 }
    """
    data = request.get_json() or {}
    lat = data.get('latitude')
    lng = data.get('longitude')
    accuracy = data.get('accuracy', 0.0)
    speed = data.get('speed')
    heading = data.get('heading')

    if lat is None or lng is None:
        return jsonify({'success': False, 'message': 'Latitude and longitude are required.'}), 400

    try:
        lat, lng = float(lat), float(lng)
        accuracy = max(0.0, float(accuracy or 0.0))
        speed = float(speed) if speed is not None else None
        heading = float(heading) if heading is not None else None
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'GPS coordinates or motion values are invalid.'}), 400

    # Find active session if any
    active_session = LocationSession.query.filter_by(user_id=current_user.id, status='ACTIVE').order_by(LocationSession.id.desc()).first()

    update = LocationUpdate(
        session_id=active_session.id if active_session else None,
        user_id=current_user.id,
        latitude=lat,
        longitude=lng,
        accuracy=accuracy,
        speed=speed,
        heading=heading
    )
    db.session.add(update)

    # Keep an active SOS coordinate current so responder dashboards receive the latest GPS fix.
    active_emergency = EmergencyAlert.query.filter(
        EmergencyAlert.user_id == current_user.id,
        EmergencyAlert.status.in_(['ACTIVE', 'ACCEPTED', 'RESPONDING'])
    ).order_by(EmergencyAlert.id.desc()).first()
    if active_emergency:
        active_emergency.latitude = lat
        active_emergency.longitude = lng
        active_emergency.accuracy = accuracy

    # Real-time safety evaluation for user's updated coordinate
    safety_info = evaluate_location_safety(lat, lng)

    # Trigger notice if entering high warning, high critical, or isolated area
    if safety_info['safety_level'] in ('HIGH_CRITICAL', 'HIGH_WARNING') or safety_info['is_isolated_area']:
        # Check if already notified recently to prevent spam
        notification_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        recent_notif = Notification.query.filter(
            Notification.user_id == current_user.id,
            Notification.title.like(f"%{safety_info['headline']}%"),
            Notification.created_at >= notification_cutoff
        ).order_by(Notification.id.desc()).first()

        if not recent_notif:
            notif = Notification(
                user_id=current_user.id,
                type='SAFETY_WARNING',
                title=f"⚠ Safety Alert: {safety_info['headline']}",
                message=safety_info['reason']
            )
            db.session.add(notif)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Location recorded.',
        'location': update.to_dict(),
        'safety_status': safety_info
    }), 200


@location_bp.route('/stop', methods=['POST'])
@token_required
@role_required(['USER'])
def stop_live_tracking(current_user):
    """
    Stop live tracking.
    """
    active_sessions = LocationSession.query.filter_by(user_id=current_user.id, status='ACTIVE').all()
    for s in active_sessions:
        s.status = 'STOPPED'
        s.ended_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify({
        'success': True,
        'message': 'Live tracking session stopped.'
    }), 200


@location_bp.route('/current', methods=['GET'])
@token_required
@role_required(['USER'])
def get_current_location(current_user):
    """
    Get the user's latest recorded location and tracking status.
    """
    active_session = LocationSession.query.filter_by(user_id=current_user.id, status='ACTIVE').order_by(LocationSession.id.desc()).first()
    latest_update = LocationUpdate.query.filter_by(user_id=current_user.id).order_by(LocationUpdate.id.desc()).first()

    safety_info = None
    if latest_update:
        safety_info = evaluate_location_safety(latest_update.latitude, latest_update.longitude)

    return jsonify({
        'success': True,
        'is_tracking_active': active_session is not None,
        'session': active_session.to_dict() if active_session else None,
        'location': latest_update.to_dict() if latest_update else None,
        'safety_status': safety_info
    }), 200


@location_bp.route('/track/<string:token>', methods=['GET'])
def get_shared_location_view(token):
    """
    Authorized view for trusted contacts who received the tracking token.
    Respects active/stopped status to maintain privacy.
    """
    session = LocationSession.query.filter_by(session_token=token).first()
    if not session:
        return jsonify({'success': False, 'message': 'Invalid or expired tracking link.'}), 404

    user = session.user
    latest_update = LocationUpdate.query.filter_by(session_id=session.id).order_by(LocationUpdate.id.desc()).first()
    
    # Check if there is an active emergency for this user
    from backend.app.models import EmergencyAlert
    active_emergency = EmergencyAlert.query.filter(
        EmergencyAlert.user_id == user.id,
        EmergencyAlert.status.in_(['ACTIVE', 'ACCEPTED', 'RESPONDING'])
    ).first()

    return jsonify({
        'success': True,
        'user_name': user.name,
        'session_status': session.status,
        'started_at': utc_iso(session.started_at),
        'ended_at': utc_iso(session.ended_at),
        'latest_location': latest_update.to_dict() if latest_update and session.status == 'ACTIVE' else None,
        'emergency_active': active_emergency is not None,
        'emergency_id': active_emergency.id if active_emergency else None
    }), 200
