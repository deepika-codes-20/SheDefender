from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app
from backend.app.models import db, EmergencyAlert, LocationSession, LocationUpdate, Notification, ResponseSession, CommunityResponder, TrustedContact
from backend.app.auth.decorators import token_required, role_required
from backend.app.utils.time_utils import india_time
from backend.app.auth.email_service import send_emergency_alert_emails

emergency_bp = Blueprint('emergency', __name__, url_prefix='/api/emergency')

@emergency_bp.route('', methods=['POST'])
@token_required
@role_required(['USER'])
def trigger_emergency_sos(current_user):
    """
    Trigger Emergency SOS.
    Body: { 'latitude': 12.93, 'longitude': 77.62, 'accuracy': 9.2, 'notes': 'Emergency assistance required' }
    """
    data = request.get_json() or {}
    lat = data.get('latitude')
    lng = data.get('longitude')
    accuracy = data.get('accuracy', 0.0)
    notes = str(data.get('notes') or 'Emergency SOS signal triggered by user.')[:2000]

    if lat is None or lng is None:
        return jsonify({'success': False, 'message': 'Valid GPS coordinates are required to trigger SOS.'}), 400

    try:
        lat = float(lat)
        lng = float(lng)
        accuracy = max(0.0, float(accuracy or 0.0))
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Valid GPS coordinates are required.'}), 400

    # Cancel any existing active alerts for this user to avoid duplicate chaos
    existing_alerts = EmergencyAlert.query.filter(
        EmergencyAlert.user_id == current_user.id,
        EmergencyAlert.status.in_(['ACTIVE', 'ACCEPTED', 'RESPONDING'])
    ).all()
    for alert in existing_alerts:
        alert.status = 'CANCELLED'
        alert.resolved_at = datetime.now(timezone.utc)
        for response in alert.response_sessions:
            if response.status in ('ACCEPTED', 'RESPONDING'):
                response.status = 'CANCELLED'
                response.resolved_at = datetime.now(timezone.utc)
                if response.responder:
                    response.responder.availability = 'AVAILABLE'

    # Create new EmergencyAlert
    emergency = EmergencyAlert(
        user_id=current_user.id,
        latitude=lat,
        longitude=lng,
        accuracy=float(accuracy),
        severity='CRITICAL',
        status='ACTIVE',
        notes=notes,
        created_at=datetime.now(timezone.utc)
    )
    db.session.add(emergency)
    db.session.flush()

    # Ensure location update is logged
    loc_update = LocationUpdate(
        user_id=current_user.id,
        latitude=lat,
        longitude=lng,
        accuracy=float(accuracy)
    )
    db.session.add(loc_update)

    # Notification
    notif = Notification(
        user_id=current_user.id,
        type='EMERGENCY',
        title='🚨 SOS Activated',
        message=f'Emergency #{emergency.id} initiated at {india_time(emergency.created_at).strftime("%I:%M:%S %p")} IST. Responders alerted.'
    )
    db.session.add(notif)
    db.session.commit()

    # Email only contacts explicitly marked as emergency contacts. The responder
    # dashboard independently polls the active dispatch queue.
    emergency_contacts = TrustedContact.query.filter_by(
        user_id=current_user.id, is_emergency_contact=True
    ).all()
    contact_emails = [contact.email for contact in emergency_contacts if contact.email]
    try:
        email_alerts_sent = send_emergency_alert_emails(
            contact_emails, current_user.name, emergency.latitude, emergency.longitude, emergency.created_at
        )
    except Exception:
        current_app.logger.warning('Trusted-contact emergency email delivery failed; SOS remains active.')
        email_alerts_sent = 0

    return jsonify({
        'success': True,
        'message': 'Emergency SOS activated. The responder queue is active and configured trusted-contact email alerts were attempted.',
        'emergency': emergency.to_dict(),
        'email_alerts_sent': email_alerts_sent,
        'emergency_contacts_count': len(contact_emails)
    }), 201


@emergency_bp.route('/active', methods=['GET'])
@token_required
def get_user_active_emergency(current_user):
    """
    Get the user's currently active emergency if any.
    """
    emergency = EmergencyAlert.query.filter(
        EmergencyAlert.user_id == current_user.id,
        EmergencyAlert.status.in_(['ACTIVE', 'ACCEPTED', 'RESPONDING'])
    ).order_by(EmergencyAlert.id.desc()).first()

    return jsonify({
        'success': True,
        'has_active_emergency': emergency is not None,
        'emergency': emergency.to_dict() if emergency else None
    }), 200


@emergency_bp.route('/<int:emergency_id>', methods=['GET'])
@token_required
def get_emergency_details(current_user, emergency_id):
    """
    Get emergency details.
    """
    emergency = db.session.get(EmergencyAlert, emergency_id)
    if not emergency:
        return jsonify({'success': False, 'message': 'Emergency record not found.'}), 404

    if emergency.user_id != current_user.id and current_user.role != 'ADMIN':
        assigned = ResponseSession.query.join(CommunityResponder).filter(
            ResponseSession.emergency_id == emergency.id,
            ResponseSession.status.in_(['ACCEPTED', 'RESPONDING']),
            CommunityResponder.user_id == current_user.id
        ).first() if current_user.role == 'COMMUNITY_RESPONDER' else None
        if not assigned:
            return jsonify({'success': False, 'message': 'Unauthorized access to emergency record.'}), 403

    return jsonify({
        'success': True,
        'emergency': emergency.to_dict()
    }), 200


@emergency_bp.route('/<int:emergency_id>/status', methods=['PUT'])
@token_required
def update_emergency_status(current_user, emergency_id):
    """
    Update status: CANCELLED, RESOLVED.
    Body: { 'status': 'CANCELLED' | 'RESOLVED', 'notes': 'Reason' }
    """
    emergency = db.session.get(EmergencyAlert, emergency_id)
    if not emergency:
        return jsonify({'success': False, 'message': 'Emergency record not found.'}), 404

    data = request.get_json() or {}
    new_status = (data.get('status') or '').upper()
    notes = data.get('notes')
    if new_status not in ('ACTIVE', 'ACCEPTED', 'RESPONDING', 'RESOLVED', 'CANCELLED'):
        return jsonify({'success': False, 'message': f'Invalid status: {new_status}'}), 400

    # The owner may cancel their own SOS. Only an assigned responder or Admin may resolve it.
    if current_user.role == 'USER':
        if emergency.status not in ('ACTIVE', 'ACCEPTED', 'RESPONDING'):
            return jsonify({'success': False, 'message': 'This emergency is no longer active.'}), 409
        if emergency.user_id != current_user.id or new_status != 'CANCELLED':
            return jsonify({'success': False, 'message': 'Users may only cancel their own emergency.'}), 403
    elif current_user.role == 'COMMUNITY_RESPONDER':
        assigned = ResponseSession.query.join(CommunityResponder).filter(
            ResponseSession.emergency_id == emergency.id,
            CommunityResponder.user_id == current_user.id
        ).first()
        if not assigned or new_status not in ('RESPONDING', 'RESOLVED'):
            return jsonify({'success': False, 'message': 'Only the assigned responder can update this emergency.'}), 403
    elif current_user.role != 'ADMIN':
        return jsonify({'success': False, 'message': 'Not authorized to update this emergency.'}), 403

    emergency.status = new_status
    if notes:
        emergency.notes = f"{emergency.notes or ''}\n[Update]: {notes}".strip()

    if new_status in ('RESOLVED', 'CANCELLED'):
        emergency.resolved_at = datetime.now(timezone.utc)
        
        # Also resolve any associated response sessions
        active_responses = ResponseSession.query.filter_by(emergency_id=emergency.id).all()
        for resp in active_responses:
            if resp.status in ('ACCEPTED', 'RESPONDING'):
                resp.status = new_status
                resp.resolved_at = datetime.now(timezone.utc)
                if resp.responder:
                    resp.responder.availability = 'AVAILABLE'

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Emergency status updated to {new_status}.',
        'emergency': emergency.to_dict()
    }), 200
