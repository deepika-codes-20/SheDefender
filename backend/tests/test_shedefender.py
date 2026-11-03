import pytest
from werkzeug.security import generate_password_hash, check_password_hash
from backend.app import create_app
from backend.config import Config
import backend.app.routes.auth_routes as auth_routes
import backend.app.routes.admin_routes as admin_routes
import backend.app.routes.emergency_routes as emergency_routes
from backend.app.models import db, User, CommunityResponder, OTPRequest, LocationSession
from backend.app.auth.tokens import generate_auth_token
from backend.app.services.geo_service import calculate_haversine_distance_km, estimate_arrival_time_minutes
from backend.app.services.intelligence_service import classify_safety_level, evaluate_location_safety
from backend.app.utils.time_utils import utc_iso, as_utc, parse_client_datetime
from datetime import datetime, timezone


@pytest.fixture
def client(monkeypatch):
    class TestConfig(Config):
        TESTING = True
        SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
        SECRET_KEY = 'test-secret-key-that-is-not-used-outside-tests'
        JWT_SECRET_KEY = 'test-jwt-secret-key-that-is-not-used-outside-tests'

    app = create_app(TestConfig)

    def fake_send(email, code, expiry, purpose='REGISTER'):
        app.config['TEST_OTP'] = code
        app.config['TEST_OTP_PURPOSE'] = purpose
        return {'success': True}

    monkeypatch.setattr(auth_routes, 'send_otp_email', fake_send)
    monkeypatch.setattr(admin_routes, 'send_otp_email', fake_send)
    monkeypatch.setattr(emergency_routes, 'send_emergency_alert_emails', lambda emails, *args: len(emails))
    with app.test_client() as test_client:
        with app.app_context():
            yield test_client


def register_user(client, email='testuser@example.com'):
    response = client.post('/api/auth/register/request-otp', json={
        'name': 'Test User', 'email': email, 'phone': '+919900000001', 'password': 'StrongPass123'
    })
    assert response.status_code == 200
    code = client.application.config['TEST_OTP']
    verify = client.post('/api/auth/register/verify-otp', json={'email': email, 'otp_code': code})
    assert verify.status_code == 201
    return verify.get_json()['token']


def add_admin():
    admin = User(
        name='Test Admin', email='admin@example.com', role='ADMIN', is_active=True,
        email_verified=True, password_hash=generate_password_hash('AdminPass123')
    )
    db.session.add(admin)
    db.session.commit()
    return admin


def test_health_check(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.get_json()['status'] == 'healthy'


def test_haversine_and_eta():
    distance = calculate_haversine_distance_km(12.9352, 77.6245, 12.9750, 77.6000)
    assert distance is not None and 4.0 <= distance <= 6.0
    assert 10 <= estimate_arrival_time_minutes(distance, speed_kmh=20.0) <= 25


def test_user_email_is_verified_once_and_password_login(client):
    token = register_user(client)
    with client.application.app_context():
        user = User.query.filter_by(email='testuser@example.com').first()
        assert user.email_verified is True
        assert user.is_active is True
        assert user.password_hash != 'StrongPass123'
        assert check_password_hash(user.password_hash, 'StrongPass123')
        otp = OTPRequest.query.filter_by(target='testuser@example.com').first()
        assert otp.otp_code != client.application.config['TEST_OTP']
        assert otp.is_used is True
        assert otp.purpose == 'REGISTER'

    login = client.post('/api/auth/login', json={
        'email': 'testuser@example.com', 'password': 'StrongPass123', 'role': 'USER'
    })
    assert login.status_code == 200
    assert login.get_json()['token']
    assert token
    wrong_role = client.post('/api/auth/login', json={
        'email': 'testuser@example.com', 'password': 'StrongPass123', 'role': 'ADMIN'
    })
    assert wrong_role.status_code == 403


def test_admin_role_cannot_be_self_registered(client):
    response = client.post('/api/auth/register/request-otp', json={
        'name': 'Fake Admin', 'email': 'fakeadmin@example.com', 'phone': '+919900000003', 'password': 'StrongPass123', 'role': 'ADMIN'
    })
    assert response.status_code == 200
    verify = client.post('/api/auth/register/verify-otp', json={
        'email': 'fakeadmin@example.com', 'otp_code': client.application.config['TEST_OTP']
    })
    assert verify.status_code == 201
    assert verify.get_json()['user']['role'] == 'USER'
    admin_login = client.post('/api/auth/login', json={
        'email': 'fakeadmin@example.com', 'password': 'StrongPass123', 'role': 'ADMIN'
    })
    assert admin_login.status_code == 403


def test_responder_invitation_setup_and_admin_approval(client):
    with client.application.app_context():
        admin = add_admin()
        admin_token = generate_auth_token(admin.id, 'ADMIN')
    headers = {'Authorization': f'Bearer {admin_token}'}
    invite = client.post('/api/admin/responders', headers=headers, json={
        'name': 'Volunteer One', 'email': 'volunteer@example.com', 'phone': '+919900000002', 'badge_number': 'CR-001'
    })
    assert invite.status_code == 201
    responder_id = invite.get_json()['responder']['id']
    code = client.application.config['TEST_OTP']

    setup = client.post('/api/auth/responder/setup', json={
        'email': 'volunteer@example.com', 'otp_code': code, 'password': 'VolunteerPass123'
    })
    assert setup.status_code == 200
    pending_login = client.post('/api/auth/login', json={
        'email': 'volunteer@example.com', 'password': 'VolunteerPass123', 'role': 'COMMUNITY_RESPONDER'
    })
    assert pending_login.status_code == 403

    approve = client.post(f'/api/admin/responders/{responder_id}/verify', headers=headers, json={'status': 'VERIFIED'})
    assert approve.status_code == 200
    login = client.post('/api/auth/login', json={
        'email': 'volunteer@example.com', 'password': 'VolunteerPass123', 'role': 'COMMUNITY_RESPONDER'
    })
    assert login.status_code == 200


def test_password_reset_uses_one_time_otp(client):
    old_token = register_user(client, 'reset@example.com')
    request_reset = client.post('/api/auth/forgot-password/request-otp', json={'email': 'reset@example.com'})
    assert request_reset.status_code == 200
    code = client.application.config['TEST_OTP']
    reset = client.post('/api/auth/forgot-password/reset', json={
        'email': 'reset@example.com', 'otp_code': code, 'new_password': 'ChangedPass456'
    })
    assert reset.status_code == 200
    old_login = client.post('/api/auth/login', json={
        'email': 'reset@example.com', 'password': 'StrongPass123', 'role': 'USER'
    })
    new_login = client.post('/api/auth/login', json={
        'email': 'reset@example.com', 'password': 'ChangedPass456', 'role': 'USER'
    })
    assert old_login.status_code == 401
    assert new_login.status_code == 200
    old_session = client.get('/api/auth/me', headers={'Authorization': f'Bearer {old_token}'})
    assert old_session.status_code == 401


def test_jwt_logout_revokes_session(client):
    token = register_user(client, 'logout@example.com')
    headers = {'Authorization': f'Bearer {token}'}
    logout = client.post('/api/auth/logout', headers=headers)
    assert logout.status_code == 200
    after = client.get('/api/auth/me', headers=headers)
    assert after.status_code == 401


def test_datetime_serialization_normalizes_sqlite_naive_values():
    naive = datetime(2026, 10, 31, 12, 0, 0)
    assert utc_iso(naive) == '2026-10-31T12:00:00Z'
    assert as_utc(naive).tzinfo == timezone.utc
    assert utc_iso(parse_client_datetime('2026-10-31T12:00')) == '2026-10-31T06:30:00Z'


def test_safety_threshold_keys(client):
    assert evaluate_location_safety(None, None)['safety_level'] == 'UNKNOWN'
    with client.application.app_context():
        assert classify_safety_level(0) == 'NORMAL'
        assert classify_safety_level(3) == 'MODERATE'
        assert classify_safety_level(6) == 'HIGH_WARNING'
        assert classify_safety_level(10) == 'HIGH_CRITICAL'


def test_only_admin_verified_incidents_feed_public_safety_zones(client):
    user_token = register_user(client, 'reporter@example.com')
    user_headers = {'Authorization': f'Bearer {user_token}'}
    report_ids = []
    for index in range(3):
        report = client.post('/api/incidents', headers=user_headers, json={
            'incident_type': 'Harassment',
            'description': f'Test report {index + 1}',
            'latitude': 12.9355 + index * 0.0001,
            'longitude': 77.6246,
            'severity': 'HIGH'
        })
        assert report.status_code == 201
        report_ids.append(report.get_json()['incident']['id'])
    before_review = client.get('/api/safety/map-data', headers=user_headers).get_json()
    assert before_review['zones'] == []
    assert before_review['incidents'] == []

    with client.application.app_context():
        admin = add_admin()
        admin_token = generate_auth_token(admin.id, 'ADMIN')
    admin_headers = {'Authorization': f'Bearer {admin_token}'}
    for report_id in report_ids:
        reviewed = client.put(f'/api/admin/incidents/{report_id}/status', headers=admin_headers, json={'status': 'VERIFIED'})
        assert reviewed.status_code == 200

    after_review = client.get('/api/safety/map-data', headers=user_headers).get_json()
    assert len(after_review['incidents']) == 3
    assert len(after_review['zones']) == 1
    assert after_review['zones'][0]['safety_level'] == 'MODERATE'


def test_location_session_duration_handles_sqlite_naive_and_aware_datetimes(client):
    with client.application.app_context():
        user = User(name='Time Test', email='time@example.com', role='USER', is_active=True, email_verified=True)
        db.session.add(user)
        db.session.flush()
        session = LocationSession(
            session_token='test-location-token', user_id=user.id, status='STOPPED',
            started_at=datetime(2026, 10, 31, 10, 0, 0),
            ended_at=datetime(2026, 10, 31, 10, 30, 0, tzinfo=timezone.utc)
        )
        db.session.add(session)
        db.session.commit()
        assert session.to_dict()['duration_minutes'] == 30.0


def test_admin_can_manage_isolated_area_zone(client):
    with client.application.app_context():
        admin = add_admin()
        admin_token = generate_auth_token(admin.id, 'ADMIN')
    headers = {'Authorization': f'Bearer {admin_token}'}
    created = client.post('/api/admin/safety-zones', headers=headers, json={
        'name': 'Test isolated path', 'center_lat': 12.95, 'center_lng': 77.61,
        'radius_meters': 500, 'is_isolated_area': True,
        'safety_level': 'HIGH_CRITICAL', 'reason': 'Low lighting and limited access'
    })
    assert created.status_code == 201
    zone = created.get_json()['zone']
    assert zone['safety_level'] == 'ISOLATED_AREA'
    assert zone['is_isolated_area'] is True
    assert zone['is_manual'] is True

    update = client.put(f"/api/admin/safety-zones/{zone['id']}", headers=headers, json={'name': 'Updated isolated path'})
    assert update.status_code == 200
    assert update.get_json()['zone']['name'] == 'Updated isolated path'

    delete = client.delete(f"/api/admin/safety-zones/{zone['id']}", headers=headers)
    assert delete.status_code == 200


def test_sos_emails_only_explicit_emergency_contacts(client):
    token = register_user(client, 'sos-user@example.com')
    headers = {'Authorization': f'Bearer {token}'}
    invalid_contact = client.post('/api/trusted-contacts', headers=headers, json={
        'name': 'No Email', 'relationship': 'Friend', 'phone': '+919900000004',
        'is_emergency_contact': True, 'can_view_live_location': False
    })
    assert invalid_contact.status_code == 400

    contact = client.post('/api/trusted-contacts', headers=headers, json={
        'name': 'Emergency Contact', 'relationship': 'Friend', 'phone': '+919900000005',
        'email': 'contact@example.com', 'is_emergency_contact': True, 'can_view_live_location': True
    })
    assert contact.status_code == 201
    sos = client.post('/api/emergency', headers=headers, json={
        'latitude': 12.9355, 'longitude': 77.6246, 'accuracy': 10
    })
    assert sos.status_code == 201
    assert sos.get_json()['email_alerts_sent'] == 1
