from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from backend.app.models import db, CommunityResponder, EmergencyAlert, ResponseSession, Notification
from backend.app.auth.decorators import token_required, role_required
from backend.app.services.geo_service import format_distance_and_eta
from backend.app.utils.time_utils import as_utc

community_bp = Blueprint('community', __name__, url_prefix='/api/community')

@community_bp.route('/profile', methods=['GET'])
@token_required
@role_required(['COMMUNITY_RESPONDER'])
def get_responder_profile(current_user):
    responder = CommunityResponder.query.filter_by(user_id=current_user.id).first()
    if not responder:
        return jsonify({'success': False, 'message': 'Responder profile not found. Contact the administrator.'}), 404
    if responder.verification_status != 'VERIFIED':
        return jsonify({'success': False, 'message': 'Your responder account is awaiting administrator approval.'}), 403

    return jsonify({
        'success': True,
        'responder': responder.to_dict()
    }), 200


@community_bp.route('/availability', methods=['PUT'])
@token_required
@role_required(['COMMUNITY_RESPONDER'])
def set_availability(current_user):
    data = request.get_json() or {}
    availability = data.get('availability', '').upper()

    if availability not in ('AVAILABLE', 'RESPONDING', 'UNAVAILABLE'):
        return jsonify({'success': False, 'message': 'Invalid availability state.'}), 400

    responder = CommunityResponder.query.filter_by(user_id=current_user.id).first()
    if not responder:
        return jsonify({'success': False, 'message': 'Responder profile not found.'}), 404
    if responder.verification_status != 'VERIFIED':
        return jsonify({'success': False, 'message': 'Responder approval is required.'}), 403

    responder.availability = availability
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Availability set to {availability}.',
        'responder': responder.to_dict()
    }), 200


@community_bp.route('/location', methods=['POST'])
@token_required
@role_required(['COMMUNITY_RESPONDER'])
def update_responder_location(current_user):
    """
    Update responder's real smartphone GPS location.
    Body: { 'latitude': 12.97, 'longitude': 77.59, 'accuracy': 12.0 }
    """
    data = request.get_json() or {}
    lat = data.get('latitude')
    lng = data.get('longitude')
    accuracy = data.get('accuracy', 0.0)

    if lat is None or lng is None:
        return jsonify({'success': False, 'message': 'Latitude and longitude are required.'}), 400

    responder = CommunityResponder.query.filter_by(user_id=current_user.id).first()
    if not responder:
        return jsonify({'success': False, 'message': 'Responder profile not found.'}), 404
    if responder.verification_status != 'VERIFIED':
        return jsonify({'success': False, 'message': 'Responder approval is required.'}), 403

    try:
        lat, lng = float(lat), float(lng)
        accuracy = max(0.0, float(accuracy or 0.0))
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Responder GPS coordinates are invalid.'}), 400
    responder.current_lat = lat
    responder.current_lng = lng
    responder.accuracy = accuracy
    responder.last_location_update = datetime.now(timezone.utc)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Responder location updated.',
        'responder': responder.to_dict()
    }), 200


@community_bp.route('/emergencies', methods=['GET'])
@token_required
@role_required(['COMMUNITY_RESPONDER'])
def get_active_emergencies(current_user):
    """
    List active emergencies with computed distance and approximate ETA
    relative to responder's GPS position.
    """
    responder = CommunityResponder.query.filter_by(user_id=current_user.id).first()
    if not responder or responder.verification_status != 'VERIFIED':
        return jsonify({'success': False, 'message': 'A verified responder profile is required.'}), 403
    last_fix = as_utc(responder.last_location_update)
    gps_is_fresh = bool(last_fix and last_fix >= datetime.now(timezone.utc) - timedelta(minutes=5))
    resp_lat = responder.current_lat if gps_is_fresh else None
    resp_lng = responder.current_lng if gps_is_fresh else None

    # Emergencies that are ACTIVE, ACCEPTED, or RESPONDING
    active_emergencies = EmergencyAlert.query.filter(
        EmergencyAlert.status.in_(['ACTIVE', 'ACCEPTED', 'RESPONDING'])
    ).order_by(EmergencyAlert.id.desc()).all()

    results = []
    for em in active_emergencies:
        em_data = em.to_dict(include_user=True)
        # Compute real distance and ETA if responder location is known
        if resp_lat is not None and resp_lng is not None:
            dist_info = format_distance_and_eta(resp_lat, resp_lng, em.latitude, em.longitude)
            em_data.update(dist_info)
        else:
            em_data.update({
                'distance_km': None,
                'distance_display': 'GPS required on responder device',
                'eta_minutes': None,
                'eta_display': 'Waiting for responder GPS',
                'disclaimer': 'Turn on responder GPS to calculate distance'
            })
            
        # Check if current responder is currently assigned to this emergency
        my_response = ResponseSession.query.filter_by(emergency_id=em.id, responder_id=responder.id).order_by(ResponseSession.id.desc()).first()
        is_current_response = bool(my_response and my_response.status in ('ACCEPTED', 'RESPONDING'))
        em_data['is_my_response'] = is_current_response
        em_data['my_response_status'] = my_response.status if is_current_response else None

        results.append(em_data)

    return jsonify({
        'success': True,
        'count': len(results),
        'emergencies': results,
        'responder_location_active': (resp_lat is not None and resp_lng is not None)
    }), 200


@community_bp.route('/emergencies/<int:emergency_id>/accept', methods=['POST'])
@token_required
@role_required(['COMMUNITY_RESPONDER'])
def accept_emergency(current_user, emergency_id):
    """
    Verified responder accepts an active emergency.
    """
    responder = CommunityResponder.query.filter_by(user_id=current_user.id).first()
    if not responder:
        return jsonify({'success': False, 'message': 'Responder record not found.'}), 404
    if responder.verification_status != 'VERIFIED':
        return jsonify({'success': False, 'message': 'Responder approval is required.'}), 403

    emergency = db.session.get(EmergencyAlert, emergency_id)
    if not emergency:
        return jsonify({'success': False, 'message': 'Emergency not found.'}), 404

    if emergency.status in ('RESOLVED', 'CANCELLED'):
        return jsonify({'success': False, 'message': f'Cannot accept emergency: status is {emergency.status}.'}), 400
    existing_active_response = ResponseSession.query.filter(
        ResponseSession.responder_id == responder.id,
        ResponseSession.status.in_(['ACCEPTED', 'RESPONDING'])
    ).first()
    if existing_active_response and existing_active_response.emergency_id != emergency.id:
        return jsonify({'success': False, 'message': 'You already have an active emergency response. Resolve it before accepting another.'}), 409
    if responder.availability == 'UNAVAILABLE':
        return jsonify({'success': False, 'message': 'Set your availability to AVAILABLE before accepting an emergency.'}), 409

    # Prevent two different responders from taking the same SOS as primary response.
    if emergency.status in ('ACCEPTED', 'RESPONDING'):
        existing_assignment = ResponseSession.query.filter(
            ResponseSession.emergency_id == emergency.id,
            ResponseSession.status.in_(['ACCEPTED', 'RESPONDING'])
        ).first()
        if existing_assignment and existing_assignment.responder_id != responder.id:
            return jsonify({'success': False, 'message': 'This emergency has already been accepted by another responder.'}), 409

    # Create or update response session
    response = ResponseSession.query.filter_by(emergency_id=emergency.id, responder_id=responder.id).first()
    if not response:
        response = ResponseSession(
            emergency_id=emergency.id,
            responder_id=responder.id,
            status='ACCEPTED',
            accepted_at=datetime.now(timezone.utc)
        )
        db.session.add(response)
    else:
        response.status = 'ACCEPTED'
        response.accepted_at = datetime.now(timezone.utc)
        response.arrived_at = None
        response.resolved_at = None

    emergency.status = 'ACCEPTED'
    responder.availability = 'RESPONDING'

    # Notify emergency owner
    notif = Notification(
        user_id=emergency.user_id,
        type='COMMUNITY_UPDATE',
        title='Responder Accepted SOS',
        message=f'Verified community responder {current_user.name} has accepted your emergency request.'
    )
    db.session.add(notif)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Accepted Emergency #{emergency.id}. Response initiated.',
        'emergency': emergency.to_dict(),
        'response': response.to_dict()
    }), 200


@community_bp.route('/response/<int:response_id>/status', methods=['PUT'])
@token_required
@role_required(['COMMUNITY_RESPONDER'])
def update_response_status(current_user, response_id):
    """
    Update status: RESPONDING -> RESOLVED
    """
    response = db.session.get(ResponseSession, response_id)
    if not response:
        return jsonify({'success': False, 'message': 'Response session not found.'}), 404
    responder = CommunityResponder.query.filter_by(user_id=current_user.id).first()
    if not responder or response.responder_id != responder.id:
        return jsonify({'success': False, 'message': 'You are not assigned to this response.'}), 403
    if responder.verification_status != 'VERIFIED':
        return jsonify({'success': False, 'message': 'Responder approval is required.'}), 403

    data = request.get_json() or {}
    new_status = data.get('status', '').upper()
    notes = data.get('notes')

    if new_status not in ('RESPONDING', 'RESOLVED', 'CANCELLED'):
        return jsonify({'success': False, 'message': f'Invalid status: {new_status}'}), 400
    if response.status not in ('ACCEPTED', 'RESPONDING'):
        return jsonify({'success': False, 'message': 'This response is already closed and cannot be changed.'}), 409

    response.status = new_status
    if notes:
        response.notes = notes

    emergency = response.emergency
    responder = response.responder

    if new_status == 'RESPONDING':
        emergency.status = 'RESPONDING'
        response.arrived_at = datetime.now(timezone.utc)
    elif new_status == 'RESOLVED':
        emergency.status = 'RESOLVED'
        emergency.resolved_at = datetime.now(timezone.utc)
        response.resolved_at = datetime.now(timezone.utc)
        responder.availability = 'AVAILABLE'
    elif new_status == 'CANCELLED':
        responder.availability = 'AVAILABLE'
        response.resolved_at = datetime.now(timezone.utc)
        emergency.status = 'ACTIVE'

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Response status updated to {new_status}.',
        'response': response.to_dict(),
        'emergency': emergency.to_dict()
    }), 200
