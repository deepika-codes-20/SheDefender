-- SheDefender: Relational Database Schema
-- Compatible with MySQL 8.0+ and SQLite3

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) UNIQUE,
    phone VARCHAR(30) UNIQUE,
    role VARCHAR(30) NOT NULL DEFAULT 'USER', -- 'USER', 'COMMUNITY_RESPONDER', 'ADMIN'
    is_active BOOLEAN NOT NULL DEFAULT 0,
    avatar_url VARCHAR(255),
    password_hash VARCHAR(255),
    email_verified BOOLEAN NOT NULL DEFAULT 0,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target VARCHAR(160) NOT NULL, -- Email or phone number
    otp_code VARCHAR(255) NOT NULL, -- Werkzeug hash; never store plaintext OTPs
    purpose VARCHAR(30) NOT NULL DEFAULT 'LOGIN',
    role VARCHAR(30) NOT NULL DEFAULT 'USER',
    expires_at DATETIME NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    is_used BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(64) PRIMARY KEY,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trusted_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name VARCHAR(120) NOT NULL,
    relationship VARCHAR(60) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(160),
    is_emergency_contact BOOLEAN NOT NULL DEFAULT 1,
    can_view_live_location BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'STOPPED'
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    authorized_contacts_json TEXT, -- JSON array of contact IDs authorized
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    user_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL DEFAULT 0,
    speed REAL,
    heading REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES location_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS emergency_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL DEFAULT 0,
    severity VARCHAR(20) NOT NULL DEFAULT 'CRITICAL', -- 'CRITICAL', 'HIGH', 'MEDIUM'
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'ACCEPTED', 'RESPONDING', 'RESOLVED', 'CANCELLED'
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_responders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    badge_number VARCHAR(40),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'VERIFIED', 'REJECTED'
    verification_mode VARCHAR(60) NOT NULL DEFAULT 'ADMIN_INVITED',
    availability VARCHAR(20) NOT NULL DEFAULT 'UNAVAILABLE', -- 'AVAILABLE', 'RESPONDING', 'UNAVAILABLE'
    current_lat REAL,
    current_lng REAL,
    accuracy REAL,
    last_location_update DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS response_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emergency_id INTEGER NOT NULL,
    responder_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACCEPTED', -- 'ACCEPTED', 'RESPONDING', 'RESOLVED', 'CANCELLED'
    accepted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    arrived_at DATETIME,
    resolved_at DATETIME,
    notes TEXT,
    FOREIGN KEY (emergency_id) REFERENCES emergency_alerts(id) ON DELETE CASCADE,
    FOREIGN KEY (responder_id) REFERENCES community_responders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    incident_type VARCHAR(60) NOT NULL, -- 'Harassment', 'Stalking', 'Threat', 'Suspicious Activity', 'Unsafe Area', 'Physical Incident', 'Other'
    description TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL DEFAULT 0,
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'REPORTED', -- 'REPORTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'RESOLVED'
    evidence_url VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS safety_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(120) NOT NULL,
    center_lat REAL NOT NULL,
    center_lng REAL NOT NULL,
    radius_meters REAL NOT NULL DEFAULT 500,
    safety_level VARCHAR(30) NOT NULL DEFAULT 'NORMAL', -- 'NORMAL', 'MODERATE', 'HIGH_WARNING', 'HIGH_CRITICAL'; ISOLATED_AREA is represented by is_isolated_area
    incident_count INTEGER NOT NULL DEFAULT 0,
    is_isolated_area BOOLEAN NOT NULL DEFAULT 0,
    is_manual BOOLEAN NOT NULL DEFAULT 0,
    reason TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type VARCHAR(40) NOT NULL, -- 'SAFETY_WARNING', 'ISOLATED_AREA', 'EMERGENCY', 'LOCATION_SHARING', 'COMMUNITY_UPDATE'
    title VARCHAR(160) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indices for rapid querying & spatial proximity searches
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_emergencies_status ON emergency_alerts(status);
CREATE INDEX IF NOT EXISTS idx_location_updates_session ON location_updates(session_id);
CREATE INDEX IF NOT EXISTS idx_incidents_lat_lng ON incidents(latitude, longitude);
