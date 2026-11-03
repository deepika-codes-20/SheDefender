# SheDefender test and verification checklist

## Automated checks

Run from the project root:

```powershell
python -m pytest backend/tests -v
```

Run the frontend build:

```powershell
cd frontend
npm.cmd run build
```

## Manual authentication checks

1. Create the first Admin using `python backend\bootstrap_admin.py`; confirm the email OTP is required only during this one-time setup.
2. Sign out and sign in as Admin with email and password. Confirm no OTP is requested.
3. Register a new User with name, email, phone and password. Confirm the account remains inactive until the emailed OTP is verified.
4. Sign out and sign in as that User with email and password. Confirm no OTP is requested.
5. From Admin, invite a responder. Confirm the responder receives an invitation code and cannot sign in before setup and approval.
6. Complete responder setup, approve the responder from Admin, then sign in using email and password.
7. Request a password reset. Confirm an OTP is sent only after the request and the new password works while the old password fails.
8. Sign out and confirm the previous JWT cannot access `/api/auth/me`.

## Manual feature checks

- Add, edit and delete trusted contacts. Confirm a contact who is not permitted to view live location cannot be selected for a tracking session.
- Deny GPS permission. Confirm the app reports that GPS is unavailable and does not create an SOS using a fake location.
- Allow GPS on a secure origin. Start tracking, observe updates, stop tracking and confirm the public share link no longer exposes the last coordinate.
- Trigger SOS with a real GPS fix. Confirm it appears in the responder feed, can be accepted by one responder and progresses through RESPONDING to RESOLVED.
- Submit an incident and confirm it appears in the reporter's own list. It should become public on the User map only when its status is VERIFIED.
- Submit enough reports within the configured 7-day / 750-metre window to exercise NORMAL, MODERATE, HIGH_WARNING and HIGH_CRITICAL thresholds.
- Create an isolated-area zone from Admin and confirm it uses the purple key and `ISOLATED_AREA` API label; then delete it and confirm it disappears from the map.
- Create a manual risk zone and confirm its risk key/color matches the Admin selection.
- Compare all dashboard/history/map timestamps; they should display India Standard Time even if the device timezone differs.

## Important

Browser geolocation and OpenStreetMap tiles require appropriate browser permissions/network access. Gmail SMTP requires a valid Google App Password. This prototype does not call external police, SMS or emergency-call services.
