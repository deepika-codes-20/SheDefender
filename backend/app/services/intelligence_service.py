from datetime import datetime, timedelta, timezone
from flask import current_app
from backend.app.models import Incident, SafetyZone
from backend.app.services.geo_service import calculate_haversine_distance_km
from backend.app.utils.time_utils import as_utc


def get_safety_thresholds():
    """Return validated (critical, warning, moderate) incident thresholds."""
    critical = int(current_app.config.get('HIGH_CRITICAL_INCIDENT_THRESHOLD', 10))
    warning = int(current_app.config.get('HIGH_WARNING_INCIDENT_THRESHOLD', 6))
    moderate = int(current_app.config.get('MODERATE_INCIDENT_THRESHOLD', 3))
    if not (critical > warning > moderate >= 1):
        return 10, 6, 3
    return critical, warning, moderate


def classify_safety_level(incident_count):
    critical, warning, moderate = get_safety_thresholds()
    if incident_count >= critical:
        return 'HIGH_CRITICAL'
    if incident_count >= warning:
        return 'HIGH_WARNING'
    if incident_count >= moderate:
        return 'MODERATE'
    return 'NORMAL'


def evaluate_location_safety(lat, lng):
    if lat is None or lng is None:
        return {
            'safety_level': 'UNKNOWN', 'color': 'gray',
            'headline': 'Location not evaluated',
            'reason': 'Allow location access to evaluate this area. No safety rating is available without a real GPS coordinate.',
            'is_isolated_area': False, 'nearby_incidents_count': 0
        }
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        raise ValueError('Latitude and longitude must be numeric.')
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValueError('Latitude or longitude is outside its valid range.')

    radius_m = float(current_app.config.get('ZONE_CLUSTER_RADIUS_METERS', 750.0))
    days = int(current_app.config.get('SAFETY_ANALYSIS_DAYS', 7))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    nearby_count = 0
    for incident in Incident.query.all():
        occurred = as_utc(incident.occurred_at)
        if occurred and occurred >= cutoff and incident.status == 'VERIFIED':
            distance = calculate_haversine_distance_km(lat, lng, incident.latitude, incident.longitude)
            if distance is not None and distance <= radius_m / 1000.0:
                nearby_count += 1

    closest_zone = None
    min_distance = float('inf')
    for zone in SafetyZone.query.all():
        distance = calculate_haversine_distance_km(lat, lng, zone.center_lat, zone.center_lng)
        if distance is not None and distance <= (zone.radius_meters or 500.0) / 1000.0 and distance < min_distance:
            closest_zone, min_distance = zone, distance

    if closest_zone and closest_zone.is_isolated_area:
        return {
            'safety_level': 'ISOLATED_AREA', 'color': 'purple',
            'headline': 'Potentially isolated area',
            'reason': closest_zone.reason or 'This area may have limited access to roads or emergency facilities. Consider sharing your live location.',
            'is_isolated_area': True, 'nearby_incidents_count': nearby_count,
            'zone_name': closest_zone.name
        }

    level = classify_safety_level(nearby_count)
    if closest_zone and closest_zone.safety_level in ('HIGH_CRITICAL', 'HIGH_WARNING', 'MODERATE'):
        # A manually reviewed zone can raise the risk, but cannot lower the calculated level.
        order = {'NORMAL': 0, 'MODERATE': 1, 'HIGH_WARNING': 2, 'HIGH_CRITICAL': 3}
        if order[closest_zone.safety_level] > order[level]:
            level = closest_zone.safety_level
            nearby_count = max(nearby_count, closest_zone.incident_count)

    definitions = {
        'HIGH_CRITICAL': ('red', 'High critical area', 'A high concentration of verified safety reports has been recorded nearby.'),
        'HIGH_WARNING': ('orange', 'High warning area', 'Frequent verified safety reports have been recorded nearby. Consider sharing your live location.'),
        'MODERATE': ('yellow', 'Moderate caution area', 'Some verified safety reports have been recorded nearby. Stay aware of your surroundings.'),
        'NORMAL': ('green', 'Normal area', 'No elevated concentration of recent verified safety reports was detected nearby.')
    }
    color, headline, reason = definitions[level]
    if closest_zone and closest_zone.reason and level != 'NORMAL':
        reason = closest_zone.reason
    return {
        'safety_level': level, 'color': color, 'headline': headline,
        'reason': f'{reason} ({nearby_count} report(s) within approximately {int(radius_m)} m over {days} days.)',
        'is_isolated_area': False, 'nearby_incidents_count': nearby_count,
        'zone_name': closest_zone.name if closest_zone else None
    }
