import os
from dotenv import load_dotenv

load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env')))
BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    # Development fallbacks are only for local testing. Set long random values in .env for deployment.
    SECRET_KEY = os.environ.get('SECRET_KEY', 'LOCAL-ONLY-change-this-secret-key-before-deployment')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'LOCAL-ONLY-change-this-jwt-secret-before-deployment')
    JWT_EXPIRATION_HOURS = int(os.environ.get('JWT_EXPIRATION_HOURS', 12))

    DATABASE_URL = os.environ.get('DATABASE_URL', f"sqlite:///{os.path.join(BASE_DIR, '..', 'instance', 'shedefender.db')}")
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}

    OTP_EXPIRY_MINUTES = int(os.environ.get('OTP_EXPIRY_MINUTES', 5))
    OTP_MAX_ATTEMPTS = int(os.environ.get('OTP_MAX_ATTEMPTS', 5))

    SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', 587))
    SMTP_USERNAME = os.environ.get('SMTP_USERNAME')
    SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')
    SMTP_SENDER_NAME = os.environ.get('SMTP_SENDER_NAME', 'SheDefender')

    HIGH_CRITICAL_INCIDENT_THRESHOLD = int(os.environ.get('HIGH_CRITICAL_INCIDENT_THRESHOLD', 10))
    HIGH_WARNING_INCIDENT_THRESHOLD = int(os.environ.get('HIGH_WARNING_INCIDENT_THRESHOLD', 6))
    MODERATE_INCIDENT_THRESHOLD = int(os.environ.get('MODERATE_INCIDENT_THRESHOLD', 3))
    ZONE_CLUSTER_RADIUS_METERS = float(os.environ.get('ZONE_CLUSTER_RADIUS_METERS', 750.0))
    SAFETY_ANALYSIS_DAYS = int(os.environ.get('SAFETY_ANALYSIS_DAYS', 7))
    RESPONDER_AVG_SPEED_KMH = 20.0
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')
