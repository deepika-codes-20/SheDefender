# SheDefender: API Specification

Base URL: `/api`

All protected endpoints require HTTP Header:
```http
Authorization: Bearer <JWT_TOKEN>
```

---

## 1. Authentication Endpoints

Public registration and recovery endpoints:

- `POST /api/auth/register/request-otp`: body `{ "name", "email", "phone", "password" }`; creates a pending USER account and emails a purpose-bound OTP.
- `POST /api/auth/register/verify-otp`: body `{ "email", "otp_code" }`; verifies the initial email address, activates the USER account and returns a JWT.
- `POST /api/auth/login`: body `{ "email", "password", "role" }`, where role is `USER`, `COMMUNITY_RESPONDER` or `ADMIN`. Returns a JWT only when the email is verified, account is active and selected role matches the stored role.
- `POST /api/auth/responder/setup`: body `{ "email", "otp_code", "password" }`; completes an Admin-issued responder invitation. Admin approval remains required before responder login.
- `POST /api/auth/forgot-password/request-otp`: body `{ "email" }`; sends a reset code only when an eligible account exists.
- `POST /api/auth/forgot-password/reset`: body `{ "email", "otp_code", "new_password" }`; verifies the one-time code and changes the password.

Protected session endpoints:

- `GET /api/auth/me`: retrieve the current authenticated account.
- `POST /api/auth/logout`: revoke the current JWT until its expiry.

OTP codes are single-use, purpose-bound, time-limited, attempt-limited and stored as hashes. Normal login does not send an OTP. Public Admin registration is disabled; create the first Admin using `python backend/bootstrap_admin.py`.


## 2. Trusted Contacts Endpoints

- `GET /api/trusted-contacts`: List user's trusted contacts
- `POST /api/trusted-contacts`: Add new trusted contact
- `PUT /api/trusted-contacts/<id>`: Update contact details or permissions
- `DELETE /api/trusted-contacts/<id>`: Remove contact from circle

---

## 3. Location & Live Tracking Endpoints

### `POST /api/location/start`
Begin live location session.
- **Request Body**:
  ```json
  {
    "authorized_contact_ids": [1, 2],
    "initial_lat": 12.9352,
    "initial_lng": 77.6245,
    "accuracy": 10.0
  }
  ```
- **Response**: returns `session_token` and `share_url`.

### `POST /api/location/update`
Record continuous live updates from `navigator.geolocation.watchPosition()`.

### `POST /api/location/stop`
Terminate live location sharing session.

### `GET /api/location/track/<session_token>`
Public bearer-link viewer endpoint. The session token is secret; after tracking is stopped, the endpoint no longer returns the last coordinate.

---

## 4. Emergency & SOS Endpoints

### `POST /api/emergency`
Trigger emergency SOS with real smartphone coordinates.
- **Request Body**:
  ```json
  {
    "latitude": 12.9354,
    "longitude": 77.6247,
    "accuracy": 8.0,
    "notes": "Emergency assistance requested"
  }
  ```

### `GET /api/emergency/active`
Retrieve currently active SOS for the calling user.

### `PUT /api/emergency/<id>/status`
The owner can cancel their own SOS. Only the assigned responder or Admin can resolve it.

---

## 5. Community Responder Endpoints

- `GET /api/community/profile`: Responder badge & verification record
- `PUT /api/community/availability`: Set to `AVAILABLE`, `RESPONDING`, or `UNAVAILABLE`
- `POST /api/community/location`: Update responder smartphone GPS
- `GET /api/community/emergencies`: List active emergencies with real distance & ETA
- `POST /api/community/emergencies/<id>/accept`: Assign responder to active emergency
- `PUT /api/community/response/<id>/status`: Advance status (`RESPONDING`, `RESOLVED`)

---

## 6. Incidents & Safety Intelligence Endpoints

- `POST /api/incidents`: Report safety incident with GPS
- `GET /api/incidents`: Query incident list with filters
- `GET /api/safety/map-data`: Full layers for Safety Map
- `POST /api/safety/evaluate`: Real-time coordinate risk evaluation

---

Admin moderation endpoints:

- `GET /api/admin/safety-zones`, `POST /api/admin/safety-zones`, `PUT /api/admin/safety-zones/<id>` and `DELETE /api/admin/safety-zones/<id>`: manage risk zones and isolated-area markers. Isolated areas use the `ISOLATED_AREA` API key and purple map color.
- `GET /api/admin/incidents`: list reports for review.
- `PUT /api/admin/incidents/<id>/status`: set `REPORTED`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED` or `RESOLVED`. Only `VERIFIED` reports feed public map markers and risk-zone calculations.

## 7. History Endpoints

- `GET /api/history/overview`: Consolidated metrics across all 4 streams
- `GET /api/history/incidents`: Detailed incident reports
- `GET /api/history/emergencies`: Past SOS events
- `GET /api/history/location-sharing`: Past tracking sessions
- `GET /api/history/responses`: Community responder assist logs
