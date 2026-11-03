from functools import wraps
from flask import request, jsonify
from backend.app.auth.tokens import decode_auth_token
from backend.app.models import db, User, RevokedToken, CommunityResponder


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        header = request.headers.get('Authorization', '')
        parts = header.split()
        token = parts[1] if len(parts) == 2 and parts[0].lower() == 'bearer' else None
        if not token:
            return jsonify(success=False, message='Authentication token is missing. Please log in.'), 401
        payload = decode_auth_token(token)
        if 'error' in payload or not payload.get('jti'):
            return jsonify(success=False, message=payload.get('error', 'Invalid authentication token.')), 401
        if RevokedToken.query.filter_by(jti=payload['jti']).first():
            return jsonify(success=False, message='This session has been logged out. Please log in again.'), 401
        try:
            user_id = int(payload.get('sub'))
        except (TypeError, ValueError):
            return jsonify(success=False, message='Invalid authentication token.'), 401
        current_user = db.session.get(User, user_id)
        if not current_user or not current_user.is_active or not current_user.email_verified:
            return jsonify(success=False, message='User account is unavailable or not verified.'), 401
        if int(payload.get('ver', -1)) != int(current_user.token_version or 0):
            return jsonify(success=False, message='This session is no longer valid. Please log in again.'), 401
        if current_user.role == 'COMMUNITY_RESPONDER':
            responder = CommunityResponder.query.filter_by(user_id=current_user.id).first()
            if not responder or responder.verification_status != 'VERIFIED':
                return jsonify(success=False, message='Responder access is not currently approved.'), 401
        return f(current_user, *args, **kwargs)
    return decorated


def role_required(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated(current_user, *args, **kwargs):
            if current_user.role not in allowed_roles:
                return jsonify(success=False, message='You do not have permission to access this resource.'), 403
            return f(current_user, *args, **kwargs)
        return decorated
    return decorator
