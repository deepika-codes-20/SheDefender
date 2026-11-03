import math
from flask import current_app

def calculate_haversine_distance_km(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points on the Earth (in km)
    using the Haversine formula.
    """
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None

    # Radius of earth in kilometers
    r = 6371.0
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    distance = r * c
    return round(distance, 2)


def estimate_arrival_time_minutes(distance_km, speed_kmh=None):
    """
    Calculate approximate travel time in minutes.
    Per specification: Clearly labeled as approximate estimation.
    """
    if distance_km is None or distance_km < 0:
        return None
        
    if speed_kmh is None:
        speed_kmh = current_app.config.get('RESPONDER_AVG_SPEED_KMH', 20.0)
        
    if speed_kmh <= 0:
        speed_kmh = 20.0

    hours = distance_km / speed_kmh
    minutes = hours * 60.0
    
    # Add buffer for traffic and initial dispatch reaction (~2 minutes)
    estimated_minutes = max(1, round(minutes + 2))
    return estimated_minutes


def format_distance_and_eta(lat1, lon1, lat2, lon2):
    """
    Returns a dictionary with distance, unit, and approximate travel time.
    """
    dist_km = calculate_haversine_distance_km(lat1, lon1, lat2, lon2)
    if dist_km is None:
        return {
            'distance_km': None,
            'distance_display': 'Unknown',
            'eta_minutes': None,
            'eta_display': 'Calculating...',
            'disclaimer': 'Approximate travel time based on direct distance'
        }
        
    eta_min = estimate_arrival_time_minutes(dist_km)
    
    dist_display = f"{int(dist_km * 1000)} m" if dist_km < 1.0 else f"{dist_km} km"
    eta_display = f"~{eta_min} min"
    
    return {
        'distance_km': dist_km,
        'distance_display': dist_display,
        'eta_minutes': eta_min,
        'eta_display': eta_display,
        'disclaimer': 'Approximate travel time based on direct geographic distance'
    }
