import secrets
from datetime import datetime, timedelta, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from flask import current_app
from backend.app.models import db, OTPRequest
from backend.app.utils.time_utils import as_utc


def generate_numeric_otp(digits=6):
    return ''.join(secrets.choice('0123456789') for _ in range(digits))


def request_new_otp(target, role='USER', purpose='LOGIN'):
    """Create a purpose-bound, rate-limited OTP; only its hash is persisted."""
    target = target.strip().lower()
    purpose = purpose.strip().upper()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=15)
    recent = OTPRequest.query.filter(
        OTPRequest.target == target,
        OTPRequest.created_at >= cutoff
    ).count()
    if recent >= 8:
        return None, None, 'Too many OTP requests. Please wait 15 minutes before requesting another code.'

    previous = OTPRequest.query.filter_by(target=target, purpose=purpose, is_used=False).all()
    for record in previous:
        record.is_used = True

    expiry = int(current_app.config.get('OTP_EXPIRY_MINUTES', 5))
    code = generate_numeric_otp()
    record = OTPRequest(
        target=target,
        otp_code=generate_password_hash(code),
        purpose=purpose,
        role=role,
        expires_at=now + timedelta(minutes=expiry),
        attempts=0,
        is_used=False,
        created_at=now
    )
    db.session.add(record)
    db.session.commit()
    # Transient attribute: not mapped and never persisted.
    record.plain_code = code
    return record, code, None


def verify_submitted_otp(target, submitted_code, purpose='LOGIN'):
    target = target.strip().lower()
    submitted_code = submitted_code.strip()
    purpose = purpose.strip().upper()
    now = datetime.now(timezone.utc)
    record = OTPRequest.query.filter_by(
        target=target, purpose=purpose, is_used=False
    ).order_by(OTPRequest.id.desc()).first()
    if not record:
        return False, 'No active verification code found. Request a new code.'

    maximum = int(current_app.config.get('OTP_MAX_ATTEMPTS', 5))
    if record.attempts >= maximum:
        record.is_used = True
        db.session.commit()
        return False, 'Maximum verification attempts exceeded. Request a new code.'

    if now > as_utc(record.expires_at):
        record.is_used = True
        db.session.commit()
        return False, 'Verification code expired. Request a new code.'

    record.attempts += 1
    try:
        valid = check_password_hash(record.otp_code, submitted_code)
    except (ValueError, TypeError):
        valid = False
    if not valid:
        db.session.commit()
        return False, f'Invalid verification code. {maximum - record.attempts} attempt(s) remaining.'

    record.is_used = True
    db.session.commit()
    return True, 'Verification successful.'
