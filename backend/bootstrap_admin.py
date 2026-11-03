"""One-time, email-verified administrator bootstrap. Run from project root."""
import os
import re
import sys
from getpass import getpass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from werkzeug.security import generate_password_hash
from backend.app import create_app
from backend.app.models import db, User
from backend.app.auth.otp_service import request_new_otp, verify_submitted_otp
from backend.app.auth.email_service import send_otp_email


def main():
    app = create_app()
    with app.app_context():
        if User.query.filter_by(role='ADMIN').count():
            print('An administrator account already exists. Public admin registration is disabled.')
            return
        name = input('Administrator full name: ').strip()
        email = input('Administrator email: ').strip().lower()
        phone = input('Phone number (optional): ').strip() or None
        if not name or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            print('A name and valid email address are required.')
            return
        if User.query.filter(db.func.lower(User.email) == email).first():
            print('That email is already assigned to another account.')
            return
        password = getpass('Create administrator password (minimum 8 characters): ')
        confirm = getpass('Confirm password: ')
        if len(password) < 8 or len(password) > 128 or password != confirm:
            print('Passwords must match and contain 8 to 128 characters.')
            return
        otp_record, code, error = request_new_otp(email, role='ADMIN', purpose='ADMIN_SETUP')
        if error:
            print(error)
            return
        try:
            send_otp_email(email, code, app.config.get('OTP_EXPIRY_MINUTES', 5), purpose='ADMIN_SETUP')
        except Exception as exc:
            otp_record.is_used = True
            db.session.commit()
            print(f'Could not send the administrator verification email: {exc}')
            return
        entered = input(f'Enter the six-digit code sent to {email}: ').strip()
        valid, message = verify_submitted_otp(email, entered, purpose='ADMIN_SETUP')
        if not valid:
            print(message)
            return
        admin = User(
            name=name,
            email=email,
            phone=phone,
            role='ADMIN',
            is_active=True,
            email_verified=True,
            password_hash=generate_password_hash(password)
        )
        db.session.add(admin)
        db.session.commit()
        print('Administrator account created and email verified. Sign in using the Admin tab.')


if __name__ == '__main__':
    main()
