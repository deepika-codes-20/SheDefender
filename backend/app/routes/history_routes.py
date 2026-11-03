
from flask import Blueprint, request, jsonify

from backend.app.models import (
    db,
    Incident,
    EmergencyAlert,
    LocationSession,
    ResponseSession,
    SafetyZone,
    TrustedContact
)

from backend.app.auth.decorators import token_required


history_bp = Blueprint('history', __name__, url_prefix='/api/history')


# ---------------------------------------------------------
# LOCATION SESSION ACCESS CONTROL
# ---------------------------------------------------------

def get_visible_location_sessions(current_user):

    # ADMIN: Can view all users' location sessions.
    if current_user.role == 'ADMIN':
        return LocationSession.query.order_by(
            LocationSession.id.desc()
        ).all()

    # USER: Can view only their own location sessions.
    if current_user.role == 'USER':
        return LocationSession.query.filter_by(
            user_id=current_user.id
        ).order_by(LocationSession.id.desc()).all()

    # RESPONDER: Must have a responder profile.
    if (
        current_user.role != 'COMMUNITY_RESPONDER'
        or not current_user.responder_profile
    ):
        return []

    responder_email = (
        current_user.email or ''
    ).strip().casefold()

    responder_phone = ''.join(
        char for char in (current_user.phone or '')
        if char.isdigit()
    )

    if not responder_email and not responder_phone:
        return []

    # Find trusted contacts matching this responder's
    # registered email or phone number.
    contacts = TrustedContact.query.filter_by(
        can_view_live_location=True
    ).all()

    authorized_contact_ids = {}

    for contact in contacts:

        contact_email = (
            contact.email or ''
        ).strip().casefold()

        contact_phone = ''.join(
            char for char in (contact.phone or '')
            if char.isdigit()
        )

        email_matches = (
            bool(responder_email)
            and contact_email == responder_email
        )

        phone_matches = (
            bool(responder_phone)
            and contact_phone == responder_phone
        )

        if email_matches or phone_matches:

            authorized_contact_ids.setdefault(
                contact.user_id, set()
            ).add(contact.id)

    if not authorized_contact_ids:
        return []

    # Fetch sessions belonging to users who added
    # this responder as a trusted contact.
    sessions = LocationSession.query.filter(
        LocationSession.user_id.in_(
            authorized_contact_ids.keys()
        )
    ).order_by(
        LocationSession.id.desc()
    ).all()

    # Show only sessions where the responder's
    # trusted-contact ID was selected at tracking start.
    visible_sessions = []

    for session in sessions:

        selected_ids = set(
            session.get_authorized_contacts()
        )

        allowed_ids = authorized_contact_ids.get(
            session.user_id, set()
        )

        if selected_ids.intersection(allowed_ids):
            visible_sessions.append(session)

    return visible_sessions


# ---------------------------------------------------------
# HISTORY OVERVIEW
# ---------------------------------------------------------

@history_bp.route('/overview', methods=['GET'])
@token_required
def get_history_overview(current_user):

    is_admin = current_user.role == 'ADMIN'

    # INCIDENTS
    incidents_query = (
        Incident.query
        if is_admin
        else Incident.query.filter(
            db.or_(
                Incident.user_id == current_user.id,
                Incident.status == 'VERIFIED'
            )
        )
    )

    total_incidents = incidents_query.count()

    recent_incidents = incidents_query.order_by(
        Incident.occurred_at.desc()
    ).limit(5).all()

    # EMERGENCIES
    if is_admin:

        emergencies_query = EmergencyAlert.query

    elif (
        current_user.role == 'COMMUNITY_RESPONDER'
        and current_user.responder_profile
    ):

        emergencies_query = EmergencyAlert.query.join(
            ResponseSession
        ).filter(
            ResponseSession.responder_id
            == current_user.responder_profile.id
        ).distinct()

    else:

        emergencies_query = EmergencyAlert.query.filter_by(
            user_id=current_user.id
        )

    total_emergencies = emergencies_query.count()

    recent_emergencies = emergencies_query.order_by(
        EmergencyAlert.id.desc()
    ).limit(5).all()

    # LOCATION SHARING SESSIONS
    visible_location_sessions = get_visible_location_sessions(
        current_user
    )

    total_location_sessions = len(
        visible_location_sessions
    )

    recent_location_sessions = (
        visible_location_sessions[:5]
    )

    # COMMUNITY RESPONSES
    if current_user.role == 'ADMIN':

        responses_query = ResponseSession.query

    elif (
        current_user.role == 'COMMUNITY_RESPONDER'
        and current_user.responder_profile
    ):

        responses_query = ResponseSession.query.filter_by(
            responder_id=current_user.responder_profile.id
        )

    else:

        responses_query = ResponseSession.query.join(
            EmergencyAlert
        ).filter(
            EmergencyAlert.user_id == current_user.id
        )

    total_responses = responses_query.count()

    recent_responses = responses_query.order_by(
        ResponseSession.id.desc()
    ).limit(5).all()

    # SAFETY TRENDS
    high_critical_count = SafetyZone.query.filter_by(
        safety_level='HIGH_CRITICAL'
    ).count()

    high_warning_count = SafetyZone.query.filter_by(
        safety_level='HIGH_WARNING'
    ).count()

    return jsonify({

        'success': True,

        'summary': {
            'total_incidents': total_incidents,
            'total_emergencies': total_emergencies,
            'total_location_sessions': total_location_sessions,
            'total_responses': total_responses,
            'high_critical_zones': high_critical_count,
            'high_warning_zones': high_warning_count
        },

        'recent_incidents': [
            i.to_dict() for i in recent_incidents
        ],

        'recent_emergencies': [
            e.to_dict(include_user=True)
            for e in recent_emergencies
        ],

        'recent_location_sessions': [
            s.to_dict()
            for s in recent_location_sessions
        ],

        'recent_responses': [
            r.to_dict()
            for r in recent_responses
        ]

    }), 200


# ---------------------------------------------------------
# INCIDENT HISTORY
# ---------------------------------------------------------

@history_bp.route('/incidents', methods=['GET'])
@token_required
def get_incident_history(current_user):

    if current_user.role == 'ADMIN':

        query = Incident.query

    else:

        query = Incident.query.filter(
            db.or_(
                Incident.user_id == current_user.id,
                Incident.status == 'VERIFIED'
            )
        )

    search = request.args.get('search')
    incident_type = request.args.get('type')
    severity = request.args.get('severity')
    status = request.args.get('status')

    if search:
        query = query.filter(
            Incident.description.ilike(f"%{search}%")
        )

    if incident_type:
        query = query.filter_by(
            incident_type=incident_type
        )

    if severity:
        query = query.filter_by(
            severity=severity.upper()
        )

    if status:
        query = query.filter_by(
            status=status.upper()
        )

    results = query.order_by(
        Incident.occurred_at.desc()
    ).all()

    return jsonify({

        'success': True,
        'count': len(results),

        'incidents': [
            i.to_dict() for i in results
        ]

    }), 200


# ---------------------------------------------------------
# EMERGENCY HISTORY
# ---------------------------------------------------------

@history_bp.route('/emergencies', methods=['GET'])
@token_required
def get_emergency_history(current_user):

    if current_user.role == 'ADMIN':

        query = EmergencyAlert.query

    elif (
        current_user.role == 'COMMUNITY_RESPONDER'
        and current_user.responder_profile
    ):

        query = EmergencyAlert.query.join(
            ResponseSession
        ).filter(
            ResponseSession.responder_id
            == current_user.responder_profile.id
        ).distinct()

    else:

        query = EmergencyAlert.query.filter_by(
            user_id=current_user.id
        )

    status = request.args.get('status')
    severity = request.args.get('severity')

    if status:
        query = query.filter_by(
            status=status.upper()
        )

    if severity:
        query = query.filter_by(
            severity=severity.upper()
        )

    emergencies = query.order_by(
        EmergencyAlert.id.desc()
    ).all()

    return jsonify({

        'success': True,
        'count': len(emergencies),

        'emergencies': [
            e.to_dict(include_user=True)
            for e in emergencies
        ]

    }), 200


# ---------------------------------------------------------
# LOCATION SHARING HISTORY
# ---------------------------------------------------------

@history_bp.route('/location-sharing', methods=['GET'])
@token_required
def get_location_history(current_user):

    sessions = get_visible_location_sessions(
        current_user
    )

    status = request.args.get('status')

    if status:

        sessions = [
            session
            for session in sessions
            if session.status == status.upper()
        ]

    return jsonify({

        'success': True,
        'count': len(sessions),

        'sessions': [
            s.to_dict()
            for s in sessions
        ]

    }), 200


# ---------------------------------------------------------
# COMMUNITY RESPONSE HISTORY
# ---------------------------------------------------------

@history_bp.route('/responses', methods=['GET'])
@token_required
def get_response_history(current_user):

    if (
        current_user.role == 'COMMUNITY_RESPONDER'
        and current_user.responder_profile
    ):

        query = ResponseSession.query.filter_by(
            responder_id=current_user.responder_profile.id
        )

    elif current_user.role == 'ADMIN':

        query = ResponseSession.query

    else:

        query = ResponseSession.query.join(
            EmergencyAlert
        ).filter(
            EmergencyAlert.user_id == current_user.id
        )

    status = request.args.get('status')

    if status:
        query = query.filter_by(
            status=status.upper()
        )

    responses = query.order_by(
        ResponseSession.id.desc()
    ).all()

    return jsonify({

        'success': True,
        'count': len(responses),

        'responses': [
            r.to_dict()
            for r in responses
        ]

    }), 200
