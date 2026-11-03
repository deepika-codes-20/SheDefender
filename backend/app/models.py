from datetime import datetime, timezone
import json
from flask_sqlalchemy import SQLAlchemy
from backend.app.utils.time_utils import utc_iso, as_utc

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(160), unique=True, nullable=True)
    phone = db.Column(db.String(30), unique=True, nullable=True)
    role = db.Column(db.String(30), nullable=False, default='USER') # 'USER', 'COMMUNITY_RESPONDER', 'ADMIN'
    is_active = db.Column(db.Boolean, nullable=False, default=False)
    avatar_url = db.Column(db.String(255), nullable=True)
    password_hash = db.Column(db.String(255), nullable=True)
    email_verified = db.Column(db.Boolean, nullable=False, default=False)
    token_version = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    trusted_contacts = db.relationship('TrustedContact', backref='user', cascade='all, delete-orphan', lazy=True)
    location_sessions = db.relationship('LocationSession', backref='user', cascade='all, delete-orphan', lazy=True)
    emergencies = db.relationship('EmergencyAlert', backref='user', cascade='all, delete-orphan', lazy=True)
    incidents = db.relationship('Incident', backref='user', cascade='all, delete-orphan', lazy=True)
    notifications = db.relationship('Notification', backref='user', cascade='all, delete-orphan', lazy=True)
    responder_profile = db.relationship('CommunityResponder', backref='user', uselist=False, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'role': self.role,
            'is_active': self.is_active,
            'email_verified': self.email_verified,
            'avatar_url': self.avatar_url,
            'created_at': utc_iso(self.created_at)
        }


class OTPRequest(db.Model):
    __tablename__ = 'otp_requests'
    
    id = db.Column(db.Integer, primary_key=True)
    target = db.Column(db.String(160), nullable=False)
    # Stores a Werkzeug password hash of the OTP, never the plaintext code.
    otp_code = db.Column(db.String(255), nullable=False)
    purpose = db.Column(db.String(30), nullable=False, default='LOGIN')
    role = db.Column(db.String(30), nullable=False, default='USER')
    expires_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)
    is_used = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class RevokedToken(db.Model):
    __tablename__ = 'revoked_tokens'
    jti = db.Column(db.String(64), primary_key=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class TrustedContact(db.Model):
    __tablename__ = 'trusted_contacts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    relationship = db.Column(db.String(60), nullable=False)
    phone = db.Column(db.String(30), nullable=False)
    email = db.Column(db.String(160), nullable=True)
    is_emergency_contact = db.Column(db.Boolean, nullable=False, default=True)
    can_view_live_location = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'relationship': self.relationship,
            'phone': self.phone,
            'email': self.email,
            'is_emergency_contact': self.is_emergency_contact,
            'can_view_live_location': self.can_view_live_location,
            'created_at': utc_iso(self.created_at)
        }


class LocationSession(db.Model):
    __tablename__ = 'location_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    session_token = db.Column(db.String(64), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='ACTIVE') # 'ACTIVE', 'STOPPED'
    started_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = db.Column(db.DateTime, nullable=True)
    authorized_contacts_json = db.Column(db.Text, nullable=True) # JSON list of contact IDs

    updates = db.relationship('LocationUpdate', backref='session', lazy=True)

    def get_authorized_contacts(self):
        if not self.authorized_contacts_json:
            return []
        try:
            return json.loads(self.authorized_contacts_json)
        except Exception:
            return []

    def set_authorized_contacts(self, contact_ids):
        self.authorized_contacts_json = json.dumps(contact_ids)

    def to_dict(self):
        latest_update = LocationUpdate.query.filter_by(session_id=self.id).order_by(LocationUpdate.id.desc()).first()
        duration_minutes = 0
        if self.started_at:
            end_time = as_utc(self.ended_at or datetime.now(timezone.utc))
            start_time = as_utc(self.started_at)
            duration_minutes = max(0, round((end_time - start_time).total_seconds() / 60, 1))

        return {
            'id': self.id,
            'session_token': self.session_token,
            'user_id': self.user_id,
            'status': self.status,
            'started_at': utc_iso(self.started_at),
            'ended_at': utc_iso(self.ended_at),
            'duration_minutes': duration_minutes,
            'authorized_contacts': self.get_authorized_contacts(),
            'latest_location': latest_update.to_dict() if latest_update else None
        }


class LocationUpdate(db.Model):
    __tablename__ = 'location_updates'
    
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('location_sessions.id', ondelete='SET NULL'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    accuracy = db.Column(db.Float, default=0.0)
    speed = db.Column(db.Float, nullable=True)
    heading = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'user_id': self.user_id,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'accuracy': self.accuracy,
            'speed': self.speed,
            'heading': self.heading,
            'timestamp': utc_iso(self.created_at)
        }


class EmergencyAlert(db.Model):
    __tablename__ = 'emergency_alerts'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    accuracy = db.Column(db.Float, default=0.0)
    severity = db.Column(db.String(20), nullable=False, default='CRITICAL') # 'CRITICAL', 'HIGH', 'MEDIUM'
    status = db.Column(db.String(20), nullable=False, default='ACTIVE') # 'ACTIVE', 'ACCEPTED', 'RESPONDING', 'RESOLVED', 'CANCELLED'
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = db.Column(db.DateTime, nullable=True)

    response_sessions = db.relationship('ResponseSession', backref='emergency', lazy=True)

    def to_dict(self, include_user=True):
        response_query = ResponseSession.query.filter_by(emergency_id=self.id)
        if self.status in ('ACTIVE', 'ACCEPTED', 'RESPONDING'):
            response_query = response_query.filter(ResponseSession.status.in_(['ACCEPTED', 'RESPONDING']))
        active_responder = response_query.order_by(ResponseSession.id.desc()).first()
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'accuracy': self.accuracy,
            'severity': self.severity,
            'status': self.status,
            'notes': self.notes,
            'created_at': utc_iso(self.created_at),
            'resolved_at': utc_iso(self.resolved_at),
            'active_response': active_responder.to_dict() if active_responder else None
        }
        if include_user and self.user:
            data['user_name'] = self.user.name
            data['user_phone'] = self.user.phone
        return data


class CommunityResponder(db.Model):
    __tablename__ = 'community_responders'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False)
    badge_number = db.Column(db.String(40), nullable=True)
    verification_status = db.Column(db.String(20), nullable=False, default='PENDING') # 'PENDING', 'VERIFIED', 'REJECTED'
    verification_mode = db.Column(db.String(60), nullable=False, default='ADMIN_INVITED')
    availability = db.Column(db.String(20), nullable=False, default='UNAVAILABLE') # 'AVAILABLE', 'RESPONDING', 'UNAVAILABLE'
    current_lat = db.Column(db.Float, nullable=True)
    current_lng = db.Column(db.Float, nullable=True)
    accuracy = db.Column(db.Float, nullable=True)
    last_location_update = db.Column(db.DateTime, nullable=True)

    responses = db.relationship('ResponseSession', backref='responder', lazy=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'responder_name': self.user.name if self.user else None,
            'responder_email': self.user.email if self.user else None,
            'email_verified': bool(self.user.email_verified) if self.user else False,
            'is_active': bool(self.user.is_active) if self.user else False,
            'responder_phone': self.user.phone if self.user else None,
            'badge_number': self.badge_number,
            'verification_status': self.verification_status,
            'verification_mode': self.verification_mode,
            'availability': self.availability,
            'current_lat': self.current_lat,
            'current_lng': self.current_lng,
            'accuracy': self.accuracy,
            'last_location_update': utc_iso(self.last_location_update)
        }


class ResponseSession(db.Model):
    __tablename__ = 'response_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    emergency_id = db.Column(db.Integer, db.ForeignKey('emergency_alerts.id', ondelete='CASCADE'), nullable=False)
    responder_id = db.Column(db.Integer, db.ForeignKey('community_responders.id', ondelete='CASCADE'), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='ACCEPTED') # 'ACCEPTED', 'RESPONDING', 'RESOLVED', 'CANCELLED'
    accepted_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    arrived_at = db.Column(db.DateTime, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    def to_dict(self):
        responder_user = self.responder.user if self.responder else None
        return {
            'id': self.id,
            'emergency_id': self.emergency_id,
            'responder_id': self.responder_id,
            'responder_name': responder_user.name if responder_user else 'Verified Community Responder',
            'responder_phone': responder_user.phone if responder_user else None,
            'responder_badge': self.responder.badge_number if self.responder else None,
            'responder_lat': self.responder.current_lat if self.responder else None,
            'responder_lng': self.responder.current_lng if self.responder else None,
            'status': self.status,
            'accepted_at': utc_iso(self.accepted_at),
            'arrived_at': utc_iso(self.arrived_at),
            'resolved_at': utc_iso(self.resolved_at),
            'notes': self.notes
        }


class Incident(db.Model):
    __tablename__ = 'incidents'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    incident_type = db.Column(db.String(60), nullable=False) # 'Harassment', 'Stalking', 'Threat', etc.
    description = db.Column(db.Text, nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    accuracy = db.Column(db.Float, default=0.0)
    severity = db.Column(db.String(20), nullable=False, default='MEDIUM') # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    occurred_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    status = db.Column(db.String(20), nullable=False, default='REPORTED') # 'REPORTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'RESOLVED'
    evidence_url = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'reporter_name': self.user.name if self.user else 'Anonymous',
            'incident_type': self.incident_type,
            'description': self.description,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'accuracy': self.accuracy,
            'severity': self.severity,
            'occurred_at': utc_iso(self.occurred_at),
            'status': self.status,
            'evidence_url': self.evidence_url,
            'created_at': utc_iso(self.created_at)
        }


class SafetyZone(db.Model):
    __tablename__ = 'safety_zones'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    center_lat = db.Column(db.Float, nullable=False)
    center_lng = db.Column(db.Float, nullable=False)
    radius_meters = db.Column(db.Float, nullable=False, default=500.0)
    safety_level = db.Column(db.String(30), nullable=False, default='NORMAL') # 'NORMAL', 'MODERATE', 'HIGH_WARNING', 'HIGH_CRITICAL'; isolated is represented by is_isolated_area
    incident_count = db.Column(db.Integer, nullable=False, default=0)
    is_isolated_area = db.Column(db.Boolean, nullable=False, default=False)
    is_manual = db.Column(db.Boolean, nullable=False, default=False)
    reason = db.Column(db.Text, nullable=True)
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'center_lat': self.center_lat,
            'center_lng': self.center_lng,
            'radius_meters': self.radius_meters,
            'safety_level': 'ISOLATED_AREA' if self.is_isolated_area else self.safety_level,
            'incident_count': self.incident_count,
            'is_isolated_area': self.is_isolated_area,
            'is_manual': self.is_manual,
            'reason': self.reason,
            'updated_at': utc_iso(self.updated_at)
        }


class Notification(db.Model):
    __tablename__ = 'notifications'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    type = db.Column(db.String(40), nullable=False)
    title = db.Column(db.String(160), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'title': self.title,
            'message': self.message,
            'is_read': self.is_read,
            'created_at': utc_iso(self.created_at)
        }
