from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from backend.app.models import db, Incident, Notification
from backend.app.auth.decorators import token_required
from backend.app.utils.time_utils import parse_client_datetime

incident_bp = Blueprint('incidents', __name__, url_prefix='/api/incidents')

@incident_bp.route('', methods=['GET'])
@token_required
def get_incidents(current_user):
    """
    List incidents with optional filtering by type, severity, status.
    """
    incident_type = request.args.get('type')
    severity = request.args.get('severity')
    status = request.args.get('status')
    
    query = Incident.query
    if current_user.role != 'ADMIN':
        query = query.filter(db.or_(Incident.user_id == current_user.id, Incident.status == 'VERIFIED'))
    # Only Admin can review every unverified report.
    if incident_type:
        query = query.filter_by(incident_type=incident_type)
    if severity:
        query = query.filter_by(severity=severity.upper())
    if status:
        query = query.filter_by(status=status.upper())

    incidents = query.order_by(Incident.occurred_at.desc()).limit(100).all()

    return jsonify({
        'success': True,
        'count': len(incidents),
        'incidents': [i.to_dict() for i in incidents]
    }), 200


@incident_bp.route('/<int:incident_id>', methods=['GET'])
@token_required
def get_incident_detail(current_user, incident_id):
    incident = db.session.get(Incident, incident_id)
    if not incident:
        return jsonify({'success': False, 'message': 'Incident report not found.'}), 404
    if current_user.role != 'ADMIN' and incident.user_id != current_user.id and incident.status != 'VERIFIED':
        return jsonify({'success': False, 'message': 'You are not authorized to view this incident.'}), 403

    return jsonify({
        'success': True,
        'incident': incident.to_dict()
    }), 200


@incident_bp.route('', methods=['POST'])
@token_required
def report_incident(current_user):
    """
    Submit a new safety incident report.
    Body: {
      'incident_type': 'Harassment',
      'description': '...',
      'latitude': 12.93,
      'longitude': 77.62,
      'accuracy': 10,
      'severity': 'HIGH',
      'occurred_at': 'ISO-string or null',
      'evidence_url': 'optional'
    }
    """
    data = request.get_json() or {}
    incident_type = (data.get('incident_type') or '').strip()
    description = (data.get('description') or '').strip()
    lat = data.get('latitude')
    lng = data.get('longitude')
    accuracy = data.get('accuracy', 0.0)
    severity = (data.get('severity') or 'MEDIUM').strip().upper()
    occurred_at_str = data.get('occurred_at')
    evidence_url = data.get('evidence_url')

    valid_types = ['Harassment', 'Stalking', 'Threat', 'Suspicious Activity', 'Unsafe Area', 'Physical Incident', 'Other']
    if incident_type not in valid_types:
        return jsonify({'success': False, 'message': f'Invalid incident type. Must be one of: {", ".join(valid_types)}'}), 400

    if not description:
        return jsonify({'success': False, 'message': 'Incident description is required.'}), 400

    if lat is None or lng is None:
        return jsonify({'success': False, 'message': 'GPS location coordinates are required.'}), 400
    try:
        lat, lng = float(lat), float(lng)
        accuracy = max(0.0, float(accuracy or 0.0))
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError('Coordinates are outside valid ranges.')
        occurred_at = parse_client_datetime(occurred_at_str) if occurred_at_str else datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Coordinates, accuracy or incident date/time are invalid.'}), 400

    new_incident = Incident(
        user_id=current_user.id,
        incident_type=incident_type,
        description=description,
        latitude=lat,
        longitude=lng,
        accuracy=accuracy,
        severity=severity if severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') else 'MEDIUM',
        occurred_at=occurred_at,
        status='REPORTED',
        evidence_url=evidence_url
    )
    db.session.add(new_incident)
    db.session.flush()

    # User notification
    notif = Notification(
        user_id=current_user.id,
        type='COMMUNITY_UPDATE',
        title='Incident Report Received',
        message=f'Incident #{new_incident.id} ({incident_type}) was submitted and is awaiting administrator review.'
    )
    db.session.add(notif)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Incident report submitted successfully and is awaiting administrator review.',
        'incident': new_incident.to_dict(),
        'review_status': 'REPORTED'
    }), 201
