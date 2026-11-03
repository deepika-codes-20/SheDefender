import smtplib
from email.message import EmailMessage
from flask import current_app


def send_otp_email(email, otp_code, expiry_minutes=5, purpose='REGISTER'):
    """Send an OTP through configured Gmail SMTP."""
    smtp_host = current_app.config.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(current_app.config.get('SMTP_PORT', 587))
    smtp_username = current_app.config.get('SMTP_USERNAME')
    smtp_password = current_app.config.get('SMTP_PASSWORD')
    sender_name = current_app.config.get('SMTP_SENDER_NAME', 'SheDefender')
    if not smtp_username or not smtp_password:
        raise RuntimeError('Gmail SMTP username or app password is missing.')

    purpose = (purpose or 'REGISTER').upper()
    if purpose == 'ADMIN_SETUP':
        subject = 'Verify initial SheDefender administrator setup'
        heading = 'Administrator email verification'
        instruction = 'Use this one-time code to verify the initial administrator email and finish secure setup.'
    elif purpose == 'PASSWORD_RESET':
        subject = 'Reset your SheDefender password'
        heading = 'Password reset'
        instruction = 'Use this one-time code to reset your password.'
    elif purpose == 'RESPONDER_SETUP':
        subject = 'Complete your SheDefender responder account'
        heading = 'Community responder account setup'
        instruction = 'An administrator invited you. Open SheDefender, choose the Responder tab, select Set up account, then enter this code and create your password.'
    else:
        subject = 'Verify your SheDefender email address'
        heading = 'Email verification'
        instruction = 'Use this one-time code to verify your email address.'

    message = EmailMessage()
    message['Subject'] = subject
    message['From'] = f'{sender_name} <{smtp_username}>'
    message['To'] = email
    message.set_content(
        f'{instruction}\n\nYour SheDefender code is {otp_code}. '
        f'It expires in {int(expiry_minutes)} minutes and can only be used once. '
        'If you did not request this, ignore this email.'
    )
    message.add_alternative(f"""
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#202124">
        <h2>SheDefender {heading}</h2><p>{instruction}</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px">{otp_code}</p>
        <p>This code expires in {int(expiry_minutes)} minutes and can only be used once.</p>
        <p>If you did not request this, ignore this email.</p>
      </div>
    """, subtype='html')
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_username, smtp_password)
            server.send_message(message)
    except Exception as error:
        current_app.logger.exception('Gmail SMTP email delivery failed')
        raise RuntimeError('Gmail could not send the verification email.') from error
    return {'success': True, 'message': 'Verification email sent successfully.'}


def send_emergency_alert_emails(emails, user_name, latitude, longitude, created_at):
    """Deliver all trusted-contact SOS emails over one SMTP connection."""
    from html import escape
    from backend.app.utils.time_utils import india_time

    recipients = list(dict.fromkeys(email for email in emails if email))
    if not recipients:
        return 0
    smtp_host = current_app.config.get('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = int(current_app.config.get('SMTP_PORT', 587))
    smtp_username = current_app.config.get('SMTP_USERNAME')
    smtp_password = current_app.config.get('SMTP_PASSWORD')
    sender_name = current_app.config.get('SMTP_SENDER_NAME', 'SheDefender')
    if not smtp_username or not smtp_password:
        raise RuntimeError('Gmail SMTP username or app password is missing.')

    when = india_time(created_at).strftime('%d %b %Y, %I:%M:%S %p IST')
    safe_name = escape(str(user_name or 'SheDefender user'))
    maps_url = f'https://www.google.com/maps?q={float(latitude):.6f},{float(longitude):.6f}'
    sent = 0
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=12) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_username, smtp_password)
            for email in recipients:
                message = EmailMessage()
                message['Subject'] = 'SheDefender emergency SOS alert'
                message['From'] = f'{sender_name} <{smtp_username}>'
                message['To'] = email
                message.set_content(
                    f'A person in your trusted safety circle activated an emergency SOS. Please contact them and seek local emergency assistance if needed.\n\n'
                    f'Name: {user_name}\nTime: {when}\nCoordinates: {latitude}, {longitude}\nMap: {maps_url}\n\n'
                    'This is an automated application alert, not a verified emergency-services dispatch.'
                )
                message.add_alternative(f"""
                  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#202124">
                    <h2 style="color:#b91c1c">SheDefender Emergency SOS</h2>
                    <p>A person in your trusted safety circle activated an emergency SOS. Please contact them and seek local emergency assistance if needed.</p>
                    <p><strong>Name:</strong> {safe_name}<br><strong>Time:</strong> {escape(when)}</p>
                    <p><strong>GPS:</strong> {float(latitude):.6f}, {float(longitude):.6f}</p>
                    <p><a href="{maps_url}">Open reported location in Maps</a></p>
                    <p style="font-size:12px;color:#666">This is an automated application alert, not a verified emergency-services dispatch.</p>
                  </div>
                """, subtype='html')
                try:
                    server.send_message(message)
                    sent += 1
                except Exception:
                    current_app.logger.exception('Could not send SOS alert to one trusted contact.')
    except Exception as error:
        current_app.logger.exception('Gmail SMTP emergency alert connection failed')
        raise RuntimeError('Gmail could not send trusted-contact emergency alerts.') from error
    return sent
