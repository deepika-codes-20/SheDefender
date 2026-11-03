from flask import Blueprint, request, jsonify
from backend.app.models import db, SafetyZone, Incident
from backend.app.auth.decorators import token_required
from backend.app.services.intelligence_service import evaluate_location_safety, get_safety_thresholds

safety_bp = Blueprint('safety', __name__, url_prefix='/api/safety')

@safety_bp.route('/zones', methods=['GET'])
@token_required
def get_safety_zones(current_user):
    zones = SafetyZone.query.order_by(SafetyZone.incident_count.desc()).all()
    return jsonify({
        'success': True,
        'count': len(zones),
        'zones': [z.to_dict() for z in zones]
    }), 200


@safety_bp.route('/map-data', methods=['GET'])
@token_required
def get_safety_map_data(current_user):
    """
    Supplies all map layers for SheDefender Safety Map:
    - Safety zones (colored by risk level: RED, ORANGE, YELLOW)
    - Incident points with type & severity
    - Isolated area indicators
    """
    zones = SafetyZone.query.all()
    incident_query = Incident.query
    if current_user.role != 'ADMIN':
        incident_query = incident_query.filter(Incident.status == 'VERIFIED')
    incidents = incident_query.order_by(Incident.id.desc()).limit(150).all()

    zone_list = []
    for z in zones:
        color = '#10B981' # Normal Green
        if z.is_isolated_area:
            color = '#8B5CF6'
        elif z.safety_level == 'HIGH_CRITICAL':
            color = '#EF4444' # Red
        elif z.safety_level == 'HIGH_WARNING':
            color = '#F97316' # Orange
        elif z.safety_level == 'MODERATE':
            color = '#F59E0B' # Yellow


        zone_dict = z.to_dict()
        zone_dict['color'] = color
        zone_list.append(zone_dict)

    from flask import current_app
    critical, warning, moderate = get_safety_thresholds()
    return jsonify({
        'success': True,
        'zones': zone_list,
        'incidents': [i.to_dict() for i in incidents],
        'thresholds': {
            'high_critical': critical,
            'high_warning': warning,
            'moderate': moderate,
            'analysis_days': int(current_app.config.get('SAFETY_ANALYSIS_DAYS', 7)),
            'radius_meters': int(current_app.config.get('ZONE_CLUSTER_RADIUS_METERS', 750))
        }
    }), 200


@safety_bp.route('/evaluate', methods=['POST'])
@token_required
def evaluate_coordinates(current_user):
    """
    Evaluate real-time user coordinates against historical incident intelligence
    and low-accessibility / isolated area heuristics.
    """
    data = request.get_json() or {}
    lat = data.get('latitude')
    lng = data.get('longitude')

    if lat is None or lng is None:
        return jsonify({'success': False, 'message': 'Coordinates required for safety evaluation.'}), 400

    try:
        safety_evaluation = evaluate_location_safety(float(lat), float(lng))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': 'Valid latitude and longitude are required.'}), 400
    return jsonify({
        'success': True,
        'safety_evaluation': safety_evaluation
    }), 200
