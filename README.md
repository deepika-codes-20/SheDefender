# SheDefender
## Smart Community-Based Women Protection and Incident Reporting Platform

**Your Safety. Your Circle. Your Voice.**

SheDefender is a web application prototype that brings together personal safety tools, trusted contacts, location sharing, emergency SOS, community responder dispatch, incident reporting, safety-zone visualization and activity history.

## 1. Main application areas

### User dashboard
- Create an account with name, email, phone and password.
- Verify the email address once using a six-digit OTP.
- Sign in on later visits using email and password (no routine login OTP).
- Manage trusted contacts and choose which contacts may view live location.
- Use browser GPS, start/stop live location sharing and activate/cancel SOS. SOS is added to the responder queue and email alerts are attempted for emergency contacts that have an email address. Verified available responders see the SOS in their active dispatch queue.
- Submit incident reports and view personal history. Reports become public map markers and contribute to safety-zone analytics only after Admin verification.

### Community responder dashboard
- A responder account must first be created by an Admin.
- The invited responder verifies the invitation email and creates a password.
- Admin approval is required before responder login and dispatch actions are enabled.
- Approved responders can set availability, share GPS, view active SOS requests, accept an emergency and update their response status.

### Admin dashboard
- The first Admin is created through the one-time, email-verified bootstrap script; there is no public Admin registration.
- View user and responder records and system counts; invite responders, resend invitations and approve/reject responder accounts.
- Review incident reports; create, edit or delete risk zones and manually identified isolated areas.

### Safety map and history
- View safety zones, permitted incident markers and the configured risk legend.
- Review incident, SOS, location-sharing and responder activity history according to the signed-in role.
- Risk keys are consistent across backend and frontend: `NORMAL`, `MODERATE`, `HIGH_WARNING`, `HIGH_CRITICAL`; isolated/low-accessibility zones use `ISOLATED_AREA` in the API and the purple map key.

## 2. Authentication behaviour

| Account type | Initial verification | Normal sign-in | Password reset |
|---|---|---|---|
| User | Email OTP during registration | Email + password | Email OTP only when requested |
| Community responder | Admin invitation + email OTP + password setup, then Admin approval | Email + password | Email OTP only when requested |
| Admin | One-time email OTP during secure CLI bootstrap | Email + password | Email OTP only when requested |

Passwords are stored as Werkzeug password hashes. OTP values are hashed before database storage, expire, are single-use, are purpose-bound and have attempt/rate limits. Admin accounts cannot be created through the public registration endpoint. JWTs are signed, time-limited and revoked on logout.

## 3. Date and time handling

- Backend timestamps are stored as UTC.
- API timestamps are serialized as ISO-8601 UTC values ending in `Z`.
- Browser date/time presentation is explicitly set to **Asia/Kolkata (IST, UTC+05:30)**, independent of the device's configured timezone.
- Browser `datetime-local` incident input without an offset is interpreted as IST and converted to UTC.
- SQLite-naive timestamps from existing databases are treated as UTC before arithmetic/serialization. Location-session duration calculations normalize both endpoints before subtraction.

## 4. Safety-zone classification

The default thresholds are configurable in `.env` and are evaluated over the configured recent-report window and geographic radius:

| API key | Default verified-report threshold | Map key |
|---|---:|---|
| `NORMAL` | 0–2 | Green |
| `MODERATE` | 3–5 | Yellow |
| `HIGH_WARNING` | 6–9 | Orange |
| `HIGH_CRITICAL` | 10+ | Red |
| `ISOLATED_AREA` | Set by an isolated-area zone flag | Purple |

Default analysis settings: 7 days and a 750-metre radius. Automatic clusters use only Admin-verified incident reports; Admins can also configure manual risk zones and isolated areas. These are software risk indicators based on submitted incident reports and configured isolated-area metadata; they are **not official police assessments or guarantees that an area is safe/unsafe**. Configure thresholds in `.env` using `HIGH_CRITICAL_INCIDENT_THRESHOLD`, `HIGH_WARNING_INCIDENT_THRESHOLD`, `MODERATE_INCIDENT_THRESHOLD`, `ZONE_CLUSTER_RADIUS_METERS` and `SAFETY_ANALYSIS_DAYS`.

## 5. Setup on Windows

### Prerequisites
- Python 3.10 or newer (Python 3.12 recommended).
- Node.js and npm.
- Gmail account with 2-Step Verification enabled and a Google App Password.

### Step 1 — Configure environment
1. In the project root, copy `.env.example` and rename the copy to `.env`.
2. Generate two different long random secrets and place them in `SECRET_KEY` and `JWT_SECRET_KEY`.
3. Set `SMTP_USERNAME` to the Gmail sender address and `SMTP_PASSWORD` to its 16-character Google App Password. Do not use your normal Gmail password.
4. Keep `.env` private. Never upload it to GitHub or share it publicly.

Generate a secret from PowerShell:
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```
Run it twice so the two secrets are different.

### Step 2 — Install backend packages
Open PowerShell in the project root:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```
If PowerShell blocks activation, use the Python executable directly: `\.venv\Scripts\python.exe -m pip install -r requirements.txt`.

### Step 3 — Create the first Admin account
After `.env` and SMTP are configured, run this once:
```powershell
python backend\bootstrap_admin.py
```
Enter the Admin name, email, optional phone and password. The script emails a one-time verification code and creates the Admin only after the code is verified. Do not run this for every login.

### Step 4 — Start the backend
From the project root:
```powershell
python backend\run.py
```
Backend health check: `http://127.0.0.1:5000/api/health`.

### Step 5 — Install and start the frontend
Open a second PowerShell terminal:
```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```
Open `http://localhost:5173`.

### Step 6 — Invite a responder
1. Sign in through the Admin tab.
2. Open the responder registration form in Admin Dashboard and enter the responder's name, email, phone and badge number.
3. SheDefender sends an invitation code to that email.
4. The invited responder chooses **Set up account** in the Responder tab, enters the invited email, code and a new password.
5. Admin approves the responder in the verification queue.
6. The responder can then sign in with email and password.

## 6. Testing

Backend tests:
```powershell
python -m pytest backend/tests -v
```

Frontend production build:
```powershell
cd frontend
npm.cmd run build
```

The backend tests cover registration OTP, password login, role separation, responder invitation/approval, password reset, JWT logout/revocation, UTC serialization, safety-level classification, Admin incident moderation, isolated-area management and SOS contact-email selection.

## 7. Important runtime requirements and limitations

- Gmail SMTP must be configured for registration, responder invitations and password resets.
- Browser GPS works on `localhost` or a secure HTTPS origin and requires user permission. SheDefender no longer substitutes a fabricated Bengaluru coordinate when GPS is unavailable; SOS and tracking need a real GPS fix.
- OpenStreetMap map tiles require an internet connection.
- Browser geolocation is not a native background-location service. Continuous tracking depends on browser/device permissions and the page remaining active; mobile operating systems may suspend background tabs.
- SOS and responder dispatch are application workflows. This source does not integrate directly with police control rooms, telecom SMS gateways or emergency calling services. Contacts without an email address do not receive an automated alert. Do not present it as a replacement for official emergency services.
- The archive intentionally contains no `.env`, SQLite database, old backup database, demo accounts, demo incidents or `node_modules`. The application creates an empty database on first backend startup. Keep your existing private `.env` separately or create one from `.env.example`.

## 8. Project layout

```text
backend/
  app/auth/          Password hashing, OTP, JWT and authorization
  app/routes/        Authentication, user, contacts, location, SOS, responder, incident, safety, history and Admin APIs
  app/services/      Geographic calculations and safety intelligence
  app/utils/         UTC/IST conversion and serialization helpers
  bootstrap_admin.py One-time verified Admin setup
  run.py             Flask server entry point
frontend/src/
  components/        Navigation, maps, trusted contacts, SOS and reporting components
  context/           Authentication and location state
  pages/              User, responder, Admin, history, map and tracking pages
  services/           API client and browser geolocation
  utils/              IST date/time formatting
```


### Admin responder account management

From the Admin Dashboard, an administrator can edit a responder's name, email, phone number and badge number. If the email address is changed, the account is disabled, previous verification codes and sessions are invalidated, and the responder must verify the new address and set a password again. Use **Resend invitation** to send the new verification code. Admin approval remains a separate step.

Administrators can also deactivate/reactivate approved responders. Deactivation prevents login and new emergency assignments and releases any active assignment while preserving its history. Permanent deletion is allowed only when the responder has no response history; otherwise, deactivate the account to preserve audit/history records.
