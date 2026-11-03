import re
from flask import Blueprint, request, jsonify, current_app
from sqlalchemy import func
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timezone
from backend.app.models import db, User, CommunityResponder, RevokedToken
from backend.app.auth.otp_service import request_new_otp, verify_submitted_otp
from backend.app.auth.email_service import send_otp_email
from backend.app.auth.tokens import generate_auth_token, decode_auth_token
from backend.app.auth.decorators import token_required


auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
EMAIL_RE = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')


def normalize_email(value):
    return (value or '').strip().lower()


def valid_password(value):
    return isinstance(value, str) and len(value) >= 8 and len(value) <= 128


def send_code(email, role, purpose):
    record, code, error = request_new_otp(email, role=role, purpose=purpose)
    if error:
        return None, error, 429
    try:
        send_otp_email(
            email,
            code,
            current_app.config.get('OTP_EXPIRY_MINUTES', 5),
            purpose=purpose
        )
    except Exception:
        record.is_used = True
        db.session.commit()
        current_app.logger.exception('Unable to send SheDefender verification email')
        return None, 'Email delivery failed. Check the Gmail SMTP settings and try again.', 502
    return record, None, 200


@auth_bp.route('/register/request-otp', methods=['POST'])
def request_registration_otp():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    email = normalize_email(data.get('email'))
    phone = (data.get('phone') or '').strip()
    password = data.get('password')
    if not name or len(name) > 120:
        return jsonify(success=False, message='Enter your full name (maximum 120 characters).'), 400
    if not EMAIL_RE.fullmatch(email) or len(email) > 160:
        return jsonify(success=False, message='Enter a valid email address (maximum 160 characters).'), 400
    if not phone or not re.fullmatch(r'\+?\d{7,15}', re.sub(r'[\s()-]', '', phone)):
        return jsonify(success=False, message='Enter a valid phone number with 7 to 15 digits.'), 400
    phone = re.sub(r'[\s()-]', '', phone)
    if not valid_password(password):
        return jsonify(success=False, message='Password must contain 8 to 128 characters.'), 400

    user = User.query.filter(func.lower(User.email) == email).first()
    if user and (user.role != 'USER' or user.email_verified):
        return jsonify(success=False, message='This email is already registered. Please log in or reset your password.'), 409
    if phone:
        phone_owner = User.query.filter(User.phone == phone, User.email != email).first()
        if phone_owner:
            return jsonify(success=False, message='This phone number is already registered.'), 409

    if user is None:
        user = User(name=name, email=email, phone=phone, role='USER', is_active=False, email_verified=False)
        db.session.add(user)
    user.name = name
    user.phone = phone
    user.password_hash = generate_password_hash(password)
    user.is_active = False
    user.email_verified = False
    db.session.commit()

    _, error, status = send_code(email, 'USER', 'REGISTER')
    if error:
        return jsonify(success=False, message=error), status
    return jsonify(success=True, message=f'Verification code sent to {email}. It expires in {current_app.config.get("OTP_EXPIRY_MINUTES", 5)} minutes.'), 200


@auth_bp.route('/register/verify-otp', methods=['POST'])
def verify_registration_otp():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    code = (data.get('otp_code') or '').strip()
    if not EMAIL_RE.fullmatch(email) or not re.fullmatch(r'\d{6}', code):
        return jsonify(success=False, message='Enter a valid email and six-digit verification code.'), 400
    user = User.query.filter(func.lower(User.email) == email).first()
    if not user or user.role != 'USER' or not user.password_hash:
        return jsonify(success=False, message='Registration was not found. Please start registration again.'), 404
    valid, message = verify_submitted_otp(email, code, purpose='REGISTER')
    if not valid:
        return jsonify(success=False, message=message), 400
    user.email_verified = True
    user.is_active = True
    db.session.commit()
    token = generate_auth_token(user.id, user.role, token_version=user.token_version)
    return jsonify(success=True, message='Email verified. Your account is ready.', token=token, user=user.to_dict(), responder_profile=None), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    password = data.get('password') or ''
    selected_role = (data.get('role') or 'USER').strip().upper()
    if not EMAIL_RE.fullmatch(email) or not password:
        return jsonify(success=False, message='Enter your email address and password.'), 400
    if selected_role not in ('USER', 'COMMUNITY_RESPONDER', 'ADMIN'):
        return jsonify(success=False, message='Invalid account type.'), 400

    user = User.query.filter(func.lower(User.email) == email).first()
    try:
        password_matches = bool(user and user.password_hash and check_password_hash(user.password_hash, password))
    except (ValueError, TypeError):
        password_matches = False
    if not password_matches:
        return jsonify(success=False, message='Incorrect email or password.'), 401
    if user.role != selected_role:
        return jsonify(success=False, message=f'This account is not registered for {selected_role.replace("_", " ").title()} login.'), 403
    if not user.email_verified:
        return jsonify(success=False, message='Email verification is incomplete. Complete account verification first.'), 403
    responder_info = None
    if user.role == 'COMMUNITY_RESPONDER':
        responder = CommunityResponder.query.filter_by(user_id=user.id).first()
        if not responder:
            return jsonify(success=False, message='Responder profile is missing. Contact the administrator.'), 403
        if responder.verification_status == 'PENDING':
            return jsonify(success=False, message='Your email is verified, but administrator approval is still pending.'), 403
        if responder.verification_status != 'VERIFIED':
            return jsonify(success=False, message='Responder access has been rejected or suspended. Contact the administrator.'), 403
        responder_info = responder.to_dict()

    if not user.is_active:
        return jsonify(success=False, message='This account is deactivated. Contact an administrator.'), 403

    token = generate_auth_token(user.id, user.role, token_version=user.token_version)
    return jsonify(success=True, message='Login successful.', token=token, user=user.to_dict(), responder_profile=responder_info), 200


@auth_bp.route('/responder/setup', methods=['POST'])
def complete_responder_setup():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    code = (data.get('otp_code') or '').strip()
    password = data.get('password') or ''
    if not EMAIL_RE.fullmatch(email) or not re.fullmatch(r'\d{6}', code):
        return jsonify(success=False, message='Enter a valid email and six-digit invitation code.'), 400
    if not valid_password(password):
        return jsonify(success=False, message='Password must contain 8 to 128 characters.'), 400
    user = User.query.filter(func.lower(User.email) == email).first()
    if not user or user.role != 'COMMUNITY_RESPONDER':
        return jsonify(success=False, message='No responder invitation was found for this email.'), 404
    responder = CommunityResponder.query.filter_by(user_id=user.id).first()
    if not responder or responder.verification_status == 'REJECTED':
        return jsonify(success=False, message='This responder invitation is not valid. Contact the administrator.'), 403
    if user.email_verified or user.password_hash:
        return jsonify(success=False, message='This responder account has already been set up. Please log in.'), 409
    valid, message = verify_submitted_otp(email, code, purpose='RESPONDER_SETUP')
    if not valid:
        return jsonify(success=False, message=message), 400
    user.password_hash = generate_password_hash(password)
    user.email_verified = True
    # Email verification alone does not replace the separate Admin approval step.
    user.is_active = responder.verification_status == 'VERIFIED'
    responder.availability = 'AVAILABLE' if user.is_active else 'UNAVAILABLE'
    db.session.commit()
    return jsonify(success=True, message='Email verified and password created. Your account will be available after administrator approval.'), 200


@auth_bp.route('/forgot-password/request-otp', methods=['POST'])
def request_password_reset():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    if not EMAIL_RE.fullmatch(email):
        return jsonify(success=False, message='Enter a valid email address.'), 400
    user = User.query.filter(func.lower(User.email) == email).first()
    # Do not disclose whether an email exists.
    if user and user.email_verified and user.is_active:
        _, error, status = send_code(email, user.role, 'PASSWORD_RESET')
        if error:
            return jsonify(success=False, message=error), status
    return jsonify(success=True, message='If this email belongs to an active account, a password reset code has been sent.'), 200


@auth_bp.route('/forgot-password/reset', methods=['POST'])
def reset_password():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get('email'))
    code = (data.get('otp_code') or '').strip()
    password = data.get('new_password') or ''
    if not EMAIL_RE.fullmatch(email) or not re.fullmatch(r'\d{6}', code):
        return jsonify(success=False, message='Enter a valid email and six-digit reset code.'), 400
    if not valid_password(password):
        return jsonify(success=False, message='New password must contain 8 to 128 characters.'), 400
    user = User.query.filter(func.lower(User.email) == email).first()
    if not user or not user.email_verified or not user.is_active:
        return jsonify(success=False, message='Password reset request is invalid or expired.'), 400
    valid, message = verify_submitted_otp(email, code, purpose='PASSWORD_RESET')
    if not valid:
        return jsonify(success=False, message=message), 400
    user.password_hash = generate_password_hash(password)
    user.token_version = int(user.token_version or 0) + 1
    db.session.commit()
    return jsonify(success=True, message='Password reset successfully. You can now log in with your new password.'), 200


@auth_bp.route('/me', methods=['GET'])
@token_required
def handle_get_current_user(current_user):
    responder_info = current_user.responder_profile.to_dict() if current_user.role == 'COMMUNITY_RESPONDER' and current_user.responder_profile else None
    return jsonify(success=True, user=current_user.to_dict(), responder_profile=responder_info), 200


@auth_bp.route('/logout', methods=['POST'])
@token_required
def handle_logout(current_user):
    header = request.headers.get('Authorization', '')
    parts = header.split()
    token = parts[1] if len(parts) == 2 and parts[0].lower() == 'bearer' else None
    payload = decode_auth_token(token) if token else {}
    if payload.get('jti') and payload.get('exp'):
        if not RevokedToken.query.filter_by(jti=payload['jti']).first():
            db.session.add(RevokedToken(
                jti=payload['jti'],
                expires_at=datetime.fromtimestamp(payload['exp'], tz=timezone.utc)
            ))
            db.session.commit()
    return jsonify(success=True, message='Logged out successfully.'), 200
