from datetime import datetime, timedelta, timezone
import secrets
import jwt
from flask import current_app


def generate_auth_token(user_id, role, expiration_hours=None, token_version=0):
    if expiration_hours is None:
        expiration_hours = current_app.config.get('JWT_EXPIRATION_HOURS', 12)
    secret = current_app.config.get('JWT_SECRET_KEY')
    now = datetime.now(timezone.utc)
    payload = {
        'sub': str(user_id),
        'role': role,
        'ver': int(token_version),
        'jti': secrets.token_urlsafe(24),
        'iat': now,
        'exp': now + timedelta(hours=expiration_hours),
        'iss': 'shedefender'
    }
    return jwt.encode(payload, secret, algorithm='HS256')


def decode_auth_token(token):
    secret = current_app.config.get('JWT_SECRET_KEY')
    try:
        return jwt.decode(token, secret, algorithms=['HS256'], issuer='shedefender')
    except jwt.ExpiredSignatureError:
        return {'error': 'Authentication token has expired. Please log in again.'}
    except jwt.InvalidTokenError:
        return {'error': 'Invalid authentication token.'}
