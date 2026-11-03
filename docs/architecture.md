# SheDefender: System Architecture Documentation

## 1. System Overview
**SheDefender** is a modular, community-centric safety platform designed to transform women's personal safety emergencies into coordinated, location-aware community responses.

### Core Workflow:
```text
DETECT → LOCATE → ALERT → CONNECT → RESPOND → REPORT → ANALYZE → PREVENT
```

---

## 2. Three Dedicated Dashboards
1. **User Dashboard (`/dashboard`)**:
   - High-contrast, tactile Emergency SOS button
   - Real-time smartphone GPS acquisition (`navigator.geolocation.getCurrentPosition()`)
   - Continuous live tracking session (`navigator.geolocation.watchPosition()`)
   - Interactive OpenStreetMap/Leaflet integration with custom visual indicators
   - Dynamic safety level evaluation (Normal, Moderate, High Warning, High Critical, Isolated Area)
   - Trusted Safety Circle multi-selection for authorized tracking links (`/track/<token>`)
   - Quick safety incident reporting modal with current GPS capture

2. **Community Dashboard (`/community/dashboard`)**:
   - Admin invitation, one-time email verification, password setup and explicit Admin approval
   - Availability state manager (`AVAILABLE`, `RESPONDING`, `UNAVAILABLE`)
   - Real-time responder smartphone GPS synchronization
   - Live Emergency feed with Haversine distance and approximate ETA estimation
   - Dual-marker geographic response map connecting responder to victim
   - Acceptance and safe resolution workflow

3. **History Dashboard (`/history`)**:
   - Incident History: filterable by severity, status, keyword search
   - SOS History: emergency logs with resolution duration
   - Location Sharing Sessions: tracking history and authorized recipient counts
   - Community Responses: volunteer assist audit trail
   - Safety Trends & Hotspots: geographic clustering of incident frequency

---

## 3. Technology Stack
- **Frontend**: React 19, Vite, React Router v7, Leaflet 1.9, Lucide React, Modern CSS3
- **Backend**: Python 3.12, Flask 3.0, Flask-SQLAlchemy, PyJWT, Flask-CORS
- **Database**: Relational SQLite / MySQL with normalized schema and foreign key cascades
- **Analytics**: Configurable report thresholds and Haversine geospatial calculations

---

## 4. Mobile & Desktop Design Philosophy
- **Smartphone-First Mobile Experience**: Thumb-friendly bottom navigation, high tactile touch targets (>= 44px), viewport-fit=cover, and direct HTML5 Geolocation API integration.
- **Desktop Command Experience**: Wide-screen geographic dispatch layout for community responders and administrators.

## 5. Authentication and Time Standards
- User registration, responder invitation setup and first Admin provisioning use purpose-specific email OTP verification. Routine login uses email and password. Passwords and OTPs are stored as hashes.
- JWTs carry a unique token identifier and expiry; logout revokes the active token.
- Database timestamps are UTC. API timestamps are ISO-8601 UTC (`Z`); the frontend renders dates and times in `Asia/Kolkata`.
- Empty startup does not seed demonstration data. The first Admin is created through the verified bootstrap script.
