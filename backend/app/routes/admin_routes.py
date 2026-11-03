import re
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from backend.app.models import (
    db, User, Incident, EmergencyAlert, Notification,
    CommunityResponder, SafetyZone, OTPRequest
)
from backend.app.auth.decorators import token_required, role_required
from backend.app.auth.otp_service import request_new_otp
from backend.app.auth.email_service import send_otp_email
from flask import current_app
from backend.app.services.geo_service import calculate_haversine_distance_km
from backend.app.services.intelligence_service import classify_safety_level, get_safety_thresholds
from backend.app.utils.time_utils import as_utc

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


def refresh_safety_zone(latitude, longitude):
    """Recalculate a nearby zone from recent VERIFIED reports only."""
    radius_m = float(current_app.config.get('ZONE_CLUSTER_RADIUS_METERS', 750.0))
    days = int(current_app.config.get('SAFETY_ANALYSIS_DAYS', 7))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    verified = Incident.query.filter_by(status='VERIFIED').all()
    nearby_count = 0
    for report in verified:
        occurred = as_utc(report.occurred_at)
        if occurred and occurred >= cutoff:
            distance = calculate_haversine_distance_km(latitude, longitude, report.latitude, report.longitude)
            if distance is not None and distance <= radius_m / 1000.0:
                nearby_count += 1

    matching = None
    for zone in SafetyZone.query.all():
        distance = calculate_haversine_distance_km(latitude, longitude, zone.center_lat, zone.center_lng)
        if distance is not None and distance <= (zone.radius_meters or radius_m) / 1000.0:
            matching = zone
            break

    if matching and matching.is_manual:
        # Preserve the Admin's manual risk key while keeping the verified-report count current.
        matching.incident_count = nearby_count
        matching.updated_at = datetime.now(timezone.utc)
    elif matching:
        matching.incident_count = nearby_count
        matching.safety_level = classify_safety_level(nearby_count)
        matching.reason = f'{nearby_count} verified incident report(s) within {int(radius_m)} m over the last {days} days.'
        matching.updated_at = datetime.now(timezone.utc)
    elif not matching and nearby_count >= get_safety_thresholds()[2]:
        zone = SafetyZone(
            name=f'Safety Cluster {latitude:.3f}, {longitude:.3f}',
            center_lat=latitude, center_lng=longitude, radius_meters=radius_m,
            safety_level=classify_safety_level(nearby_count), incident_count=nearby_count,
            is_isolated_area=False,
            reason=f'{nearby_count} verified incident report(s) within {int(radius_m)} m over the last {days} days.'
        )
        db.session.add(zone)
    return nearby_count


def release_active_responder_assignments(responder):
    """Release live assignments while preserving their response history."""
    for response in responder.responses:
        if response.status in ('ACCEPTED', 'RESPONDING'):
            response.status = 'CANCELLED'
            if response.emergency and response.emergency.status in ('ACCEPTED', 'RESPONDING'):
                response.emergency.status = 'ACTIVE'


@admin_bp.route('/statistics', methods=['GET'])
@token_required
@role_required(['ADMIN'])
def get_admin_statistics(current_user):
    total_users = User.query.filter_by(role='USER').count()
    total_responders = CommunityResponder.query.count()
    verified_responders = CommunityResponder.query.filter_by(
        verification_status='VERIFIED'
    ).count()
    pending_responders = CommunityResponder.query.filter_by(
        verification_status='PENDING'
    ).count()
    total_incidents = Incident.query.count()
    active_emergencies = EmergencyAlert.query.filter(EmergencyAlert.status.in_(['ACTIVE', 'ACCEPTED', 'RESPONDING'])).count()
    resolved_emergencies = EmergencyAlert.query.filter_by(status='RESOLVED').count()
    high_critical_zones = SafetyZone.query.filter_by(
        safety_level='HIGH_CRITICAL'
    ).count()

    return jsonify({
        'success': True,
        'statistics': {
            'total_users': total_users,
            'total_responders': total_responders,
            'verified_responders': verified_responders,
            'pending_responders': pending_responders,
            'total_incidents': total_incidents,
            'active_emergencies': active_emergencies,
            'resolved_emergencies': resolved_emergencies,
            'high_critical_zones': high_critical_zones
        }
    }), 200


@admin_bp.route('/users', methods=['GET'])
@token_required
@role_required(['ADMIN'])
def get_all_users(current_user):
    users = User.query.order_by(User.id.asc()).all()

    return jsonify({
        'success': True,
        'users': [u.to_dict() for u in users]
    }), 200


@admin_bp.route('/responders', methods=['GET'])
@token_required
@role_required(['ADMIN'])
def get_all_responders(current_user):
    responders = CommunityResponder.query.all()

    return jsonify({
        'success': True,
        'responders': [r.to_dict() for r in responders]
    }), 200


@admin_bp.route('/safety-zones', methods=['GET'])
@token_required
@role_required(['ADMIN'])
def get_admin_safety_zones(current_user):
    zones = SafetyZone.query.order_by(SafetyZone.id.desc()).all()
    return jsonify(success=True, zones=[zone.to_dict() for zone in zones]), 200


@admin_bp.route('/safety-zones', methods=['POST'])
@token_required
@role_required(['ADMIN'])
def create_admin_safety_zone(current_user):
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    reason = (data.get('reason') or '').strip() or None
    isolated = bool(data.get('is_isolated_area', False))
    try:
        latitude = float(data.get('center_lat'))
        longitude = float(data.get('center_lng'))
        radius = float(data.get('radius_meters', 750))
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180 and 50 <= radius <= 100000):
            raise ValueError()
    except (TypeError, ValueError):
        return jsonify(success=False, message='Enter valid coordinates and a radius between 50 and 100,000 metres.'), 400
    if not name or len(name) > 120 or (reason and len(reason) > 2000):
        return jsonify(success=False, message='Enter a zone name (maximum 120 characters) and a valid reason.'), 400
    level = (data.get('safety_level') or 'NORMAL').strip().upper()
    if level not in ('NORMAL', 'MODERATE', 'HIGH_WARNING', 'HIGH_CRITICAL'):
        return jsonify(success=False, message='Invalid safety-zone risk key.'), 400
    zone = SafetyZone(
        name=name, center_lat=latitude, center_lng=longitude, radius_meters=radius,
        safety_level='NORMAL' if isolated else level, incident_count=0,
        is_isolated_area=isolated, is_manual=True, reason=reason
    )
    db.session.add(zone)
    db.session.commit()
    return jsonify(success=True, message='Safety zone created.', zone=zone.to_dict()), 201


@admin_bp.route('/safety-zones/<int:zone_id>', methods=['PUT'])
@token_required
@role_required(['ADMIN'])
def update_admin_safety_zone(current_user, zone_id):
    zone = db.session.get(SafetyZone, zone_id)
    if not zone:
        return jsonify(success=False, message='Safety zone not found.'), 404
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name or len(name) > 120:
            return jsonify(success=False, message='Zone name is required and must be at most 120 characters.'), 400
        zone.name = name
    if 'reason' in data:
        reason = (data.get('reason') or '').strip()
        if len(reason) > 2000:
            return jsonify(success=False, message='Zone reason is too long.'), 400
        zone.reason = reason or None
    if 'center_lat' in data or 'center_lng' in data:
        try:
            latitude = float(data.get('center_lat', zone.center_lat))
            longitude = float(data.get('center_lng', zone.center_lng))
            if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise ValueError()
            zone.center_lat, zone.center_lng = latitude, longitude
        except (TypeError, ValueError):
            return jsonify(success=False, message='Zone coordinates are invalid.'), 400
    if 'radius_meters' in data:
        try:
            radius = float(data['radius_meters'])
            if not 50 <= radius <= 100000:
                raise ValueError()
            zone.radius_meters = radius
        except (TypeError, ValueError):
            return jsonify(success=False, message='Radius must be between 50 and 100,000 metres.'), 400
    if 'is_isolated_area' in data:
        zone.is_isolated_area = bool(data['is_isolated_area'])
    if 'safety_level' in data:
        level = (data.get('safety_level') or '').strip().upper()
        if level not in ('NORMAL', 'MODERATE', 'HIGH_WARNING', 'HIGH_CRITICAL'):
            return jsonify(success=False, message='Invalid safety-zone risk key.'), 400
        zone.safety_level = level
    if zone.is_isolated_area:
        zone.safety_level = 'NORMAL'
    db.session.commit()
    return jsonify(success=True, message='Safety zone updated.', zone=zone.to_dict()), 200


@admin_bp.route('/safety-zones/<int:zone_id>', methods=['DELETE'])
@token_required
@role_required(['ADMIN'])
def delete_admin_safety_zone(current_user, zone_id):
    zone = db.session.get(SafetyZone, zone_id)
    if not zone:
        return jsonify(success=False, message='Safety zone not found.'), 404
    db.session.delete(zone)
    db.session.commit()
    return jsonify(success=True, message='Safety zone deleted.'), 200


@admin_bp.route('/incidents', methods=['GET'])
@token_required
@role_required(['ADMIN'])
def get_incident_review_queue(current_user):
    reports = Incident.query.order_by(Incident.id.desc()).limit(250).all()
    return jsonify(success=True, incidents=[report.to_dict() for report in reports]), 200


@admin_bp.route('/incidents/<int:incident_id>/status', methods=['PUT'])
@token_required
@role_required(['ADMIN'])
def update_incident_review_status(current_user, incident_id):
    data = request.get_json(silent=True) or {}
    status = (data.get('status') or '').strip().upper()
    if status not in ('REPORTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'RESOLVED'):
        return jsonify(success=False, message='Invalid incident review status.'), 400
    incident = db.session.get(Incident, incident_id)
    if not incident:
        return jsonify(success=False, message='Incident report not found.'), 404
    incident.status = status
    db.session.flush()
    nearby_count = refresh_safety_zone(incident.latitude, incident.longitude)
    db.session.add(Notification(
        user_id=incident.user_id,
        type='COMMUNITY_UPDATE',
        title=f'Incident Report {status.replace("_", " ").title()}',
        message=f'Your incident report #{incident.id} has been marked {status.replace("_", " ").lower()} by the SheDefender review team.'
    ))
    db.session.commit()
    return jsonify(
        success=True,
        message=f'Incident #{incident.id} marked as {status}.',
        incident=incident.to_dict(),
        nearby_verified_reports=nearby_count
    ), 200


# Admin-created responder accounts can only be activated by the invited email owner.
@admin_bp.route('/responders', methods=['POST'])
@token_required
@role_required(['ADMIN'])
def create_community_responder(current_user):
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip() or None
    if phone:
        if not re.fullmatch(r'\+?\d{7,15}', re.sub(r'[\s()-]', '', phone)):
            return jsonify(success=False, message='Enter a valid responder phone number.'), 400
        phone = re.sub(r'[\s()-]', '', phone)
    badge_number = (data.get('badge_number') or '').strip() or None
    if not name or len(name) > 120 or len(email) > 160 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        return jsonify(success=False, message='Enter a valid responder name and email address.'), 400
    if User.query.filter(db.func.lower(User.email) == email).first():
        return jsonify(success=False, message='An account with this email already exists.'), 409
    if phone and (len(phone) > 30 or User.query.filter_by(phone=phone).first()):
        return jsonify(success=False, message='This phone number is already registered.'), 409
    try:
        new_user = User(name=name, email=email, phone=phone, role='COMMUNITY_RESPONDER', is_active=False, email_verified=False)
        db.session.add(new_user)
        db.session.flush()
        new_responder = CommunityResponder(
            user_id=new_user.id, badge_number=badge_number,
            verification_status='PENDING', verification_mode='ADMIN_INVITED', availability='UNAVAILABLE'
        )
        db.session.add(new_responder)
        db.session.commit()
        otp_record, code, otp_error = request_new_otp(email, role='COMMUNITY_RESPONDER', purpose='RESPONDER_SETUP')
        if otp_error:
            return jsonify(success=True, message=f'Responder record created, but the invitation code could not be generated: {otp_error} Use Resend Invitation later.', user=new_user.to_dict(), responder=new_responder.to_dict(), invitation_sent=False), 201
        try:
            send_otp_email(email, code, current_app.config.get('OTP_EXPIRY_MINUTES', 5), purpose='RESPONDER_SETUP')
        except Exception:
            otp_record.is_used = True
            db.session.commit()
            current_app.logger.exception('Could not send responder invitation')
            return jsonify(success=True, message='Responder record created, but the invitation email failed. Use Resend Invitation.', user=new_user.to_dict(), responder=new_responder.to_dict(), invitation_sent=False), 201
        return jsonify(success=True, message='Responder invitation sent. The responder must verify the email and create a password; Admin approval is still required.', user=new_user.to_dict(), responder=new_responder.to_dict()), 201
    except Exception:
        db.session.rollback()
        current_app.logger.exception('Could not create responder account')
        return jsonify(success=False, message='Could not register responder. Please try again.'), 500


@admin_bp.route('/responders/<int:responder_id>/invite', methods=['POST'])
@token_required
@role_required(['ADMIN'])
def resend_responder_invitation(current_user, responder_id):
    responder = db.session.get(CommunityResponder, responder_id)
    if not responder or responder.user.role != 'COMMUNITY_RESPONDER':
        return jsonify(success=False, message='Responder record not found.'), 404
    if responder.verification_status == 'REJECTED':
        return jsonify(success=False, message='This responder invitation was rejected. Set the status to PENDING before resending.') , 409
    if responder.user.email_verified:
        return jsonify(success=False, message='This responder account has already been set up.'), 409
    otp_record, code, error = request_new_otp(responder.user.email, role='COMMUNITY_RESPONDER', purpose='RESPONDER_SETUP')
    if error:
        return jsonify(success=False, message=error), 429
    try:
        send_otp_email(responder.user.email, code, current_app.config.get('OTP_EXPIRY_MINUTES', 5), purpose='RESPONDER_SETUP')
    except Exception:
        otp_record.is_used = True
        db.session.commit()
        current_app.logger.exception('Could not resend responder invitation')
        return jsonify(success=False, message='Invitation email could not be sent.'), 502
    return jsonify(success=True, message='Responder invitation resent.'), 200


@admin_bp.route('/responders/<int:responder_id>/verify', methods=['POST'])
@token_required
@role_required(['ADMIN'])
def verify_community_responder(current_user, responder_id):
    data = request.get_json() or {}
    status = (data.get('status') or 'VERIFIED').upper()

    responder = db.session.get(CommunityResponder, responder_id)

    if not responder:
        return jsonify({
            'success': False,
            'message': 'Responder record not found.'
        }), 404

    if status not in ('VERIFIED', 'REJECTED', 'PENDING'):
        return jsonify({
            'success': False,
            'message': 'Invalid verification status.'
        }), 400

    responder.verification_status = status
    if status == 'VERIFIED':
        responder.user.is_active = bool(responder.user.email_verified)
        responder.availability = 'AVAILABLE' if responder.user.is_active else 'UNAVAILABLE'
    else:
        responder.user.token_version = int(responder.user.token_version or 0) + 1
        responder.user.is_active = False
        responder.availability = 'UNAVAILABLE'
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'Responder {responder.id} marked as {status}.',
        'responder': responder.to_dict()
    }), 200


@admin_bp.route('/responders/<int:responder_id>', methods=['PUT'])
@token_required
@role_required(['ADMIN'])
def update_community_responder(current_user, responder_id):
    """Allow Admin to correct responder details and restart email verification when needed."""
    responder = db.session.get(CommunityResponder, responder_id)
    if not responder or not responder.user or responder.user.role != 'COMMUNITY_RESPONDER':
        return jsonify(success=False, message='Responder record not found.'), 404

    user = responder.user
    data = request.get_json(silent=True) or {}
    name = (data.get('name', user.name) or '').strip()
    email = (data.get('email', user.email) or '').strip().lower()
    phone = (data.get('phone', user.phone) or '').strip() or None
    badge_number = (data.get('badge_number', responder.badge_number) or '').strip() or None

    if not name or len(name) > 120 or len(email) > 160 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        return jsonify(success=False, message='Enter a valid responder name and email address.'), 400
    if phone:
        phone = re.sub(r'[\s()-]', '', phone)
        if not re.fullmatch(r'\+?\d{7,15}', phone) or len(phone) > 30:
            return jsonify(success=False, message='Enter a valid responder phone number.'), 400
        duplicate_phone = User.query.filter(User.phone == phone, User.id != user.id).first()
        if duplicate_phone:
            return jsonify(success=False, message='This phone number is already registered.'), 409
    duplicate_email = User.query.filter(db.func.lower(User.email) == email, User.id != user.id).first()
    if duplicate_email:
        return jsonify(success=False, message='This email address is already used by another account.'), 409

    old_email = (user.email or '').lower()
    email_changed = email != old_email
    user.name = name
    user.email = email
    user.phone = phone
    responder.badge_number = badge_number

    if email_changed:
        # A new address must prove ownership. Invalidate old setup/reset codes and sessions.
        user.email_verified = False
        user.password_hash = None
        user.is_active = False
        user.token_version = int(user.token_version or 0) + 1
        responder.verification_status = 'PENDING'
        responder.availability = 'UNAVAILABLE'
        release_active_responder_assignments(responder)
        responder.current_lat = None
        responder.current_lng = None
        for otp in OTPRequest.query.filter(OTPRequest.target.in_([old_email, email]), OTPRequest.is_used.is_(False)).all():
            otp.is_used = True

    db.session.commit()
    return jsonify(
        success=True,
        message=('Responder details updated. The new email must be verified; resend the invitation to that address.' if email_changed else 'Responder details updated.'),
        email_changed=email_changed,
        responder=responder.to_dict()
    ), 200


@admin_bp.route('/responders/<int:responder_id>/active', methods=['PUT'])
@token_required
@role_required(['ADMIN'])
def set_community_responder_active(current_user, responder_id):
    responder = db.session.get(CommunityResponder, responder_id)
    if not responder or not responder.user or responder.user.role != 'COMMUNITY_RESPONDER':
        return jsonify(success=False, message='Responder record not found.'), 404
    data = request.get_json(silent=True) or {}
    active = data.get('is_active')
    if not isinstance(active, bool):
        return jsonify(success=False, message='is_active must be true or false.'), 400
    if active and (not responder.user.email_verified or responder.verification_status != 'VERIFIED'):
        return jsonify(success=False, message='Only an email-verified and Admin-approved responder can be activated.'), 409
    responder.user.is_active = active
    responder.user.token_version = int(responder.user.token_version or 0) + 1
    responder.availability = 'AVAILABLE' if active else 'UNAVAILABLE'
    if not active:
        release_active_responder_assignments(responder)
    db.session.commit()
    return jsonify(success=True, message=('Responder activated.' if active else 'Responder deactivated. They can no longer log in or receive assignments.'), responder=responder.to_dict()), 200


@admin_bp.route('/responders/<int:responder_id>', methods=['DELETE'])
@token_required
@role_required(['ADMIN'])
def delete_community_responder(current_user, responder_id):
    responder = db.session.get(CommunityResponder, responder_id)
    if not responder or not responder.user or responder.user.role != 'COMMUNITY_RESPONDER':
        return jsonify(success=False, message='Responder record not found.'), 404
    if responder.responses:
        return jsonify(success=False, message='This responder has response history. Deactivate the account instead so the project history remains intact.'), 409
    user = responder.user
    try:
        # Remove any outstanding verification codes before deleting the unassigned account.
        if user.email:
            for otp in OTPRequest.query.filter_by(target=user.email.lower(), is_used=False).all():
                otp.is_used = True
        db.session.delete(user)
        db.session.commit()
        return jsonify(success=True, message='Responder account permanently deleted.'), 200
    except Exception:
        db.session.rollback()
        current_app.logger.exception('Could not delete responder account')
        return jsonify(success=False, message='Could not delete this responder. Deactivate the account instead.'), 500
