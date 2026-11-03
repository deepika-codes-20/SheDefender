
from sqlalchemy import inspect, text
from flask import Flask
from flask_cors import CORS
from backend.config import Config
from backend.app.models import db


def migrate_legacy_schema():
    """Add authentication columns without dropping existing data."""
    inspector = inspect(db.engine)
    tables = set(inspector.get_table_names())
    dialect = db.engine.dialect.name

    boolean_default = 'FALSE' if dialect == 'postgresql' else '0'

    migrations = {
        'users': {
            'password_hash': 'VARCHAR(255)',
            'email_verified': f'BOOLEAN NOT NULL DEFAULT {boolean_default}',
            'token_version': 'INTEGER NOT NULL DEFAULT 0'
        },
        'otp_requests': {
            'purpose': "VARCHAR(30) NOT NULL DEFAULT 'LOGIN'"
        },
        'safety_zones': {
            'is_manual': f'BOOLEAN NOT NULL DEFAULT {boolean_default}'
        }
    }

    for table, columns in migrations.items():
        if table not in tables:
            continue

        existing = {
            column['name']
            for column in inspect(db.engine).get_columns(table)
        }

        for column, definition in columns.items():
            if column not in existing:
                db.session.execute(
                    text(
                        f'ALTER TABLE {table} ADD COLUMN {column} {definition}'
                    )
                )

                if table == 'otp_requests' and column == 'purpose':
                    db.session.execute(
                        text('UPDATE otp_requests SET is_used = :used'),
                        {'used': True}
                    )

    # Require fresh Admin review for legacy responder profiles.
    if 'community_responders' in tables and 'users' in tables:
        db.session.execute(text(
            "UPDATE community_responders SET "
            "verification_status = 'PENDING', "
            "verification_mode = 'LEGACY_REQUIRES_REVIEW', "
            "availability = 'UNAVAILABLE' "
            "WHERE verification_mode NOT IN "
            "('ADMIN_INVITED', 'LEGACY_REQUIRES_REVIEW')"
        ))

        db.session.execute(
            text(
                "UPDATE users SET is_active = :active, "
                "token_version = COALESCE(token_version, 0) + 1 "
                "WHERE role = 'COMMUNITY_RESPONDER' "
                "AND id IN (SELECT user_id FROM community_responders "
                "WHERE verification_mode = 'LEGACY_REQUIRES_REVIEW')"
            ),
            {'active': False}
        )

    # Expand the OTP hash column when upgrading an existing database.
    if 'otp_requests' in tables:
        otp_column = next(
            (
                column
                for column in inspect(db.engine).get_columns('otp_requests')
                if column['name'] == 'otp_code'
            ),
            None
        )

        if (
            otp_column
            and getattr(otp_column['type'], 'length', None)
            and otp_column['type'].length < 255
        ):
            if dialect == 'mysql':
                db.session.execute(text(
                    'ALTER TABLE otp_requests '
                    'MODIFY otp_code VARCHAR(255) NOT NULL'
                ))
            elif dialect == 'postgresql':
                db.session.execute(text(
                    'ALTER TABLE otp_requests '
                    'ALTER COLUMN otp_code TYPE VARCHAR(255)'
                ))

    db.session.commit()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    origins = app.config.get(
        'CORS_ORIGINS',
        ['http://localhost:5173', 'http://127.0.0.1:5173']
    )

    if isinstance(origins, str):
        origins = [
            item.strip()
            for item in origins.split(',')
            if item.strip()
        ]

    CORS(
        app,
        resources={r'/api/*': {'origins': origins}},
        supports_credentials=False
    )

    db.init_app(app)

    from backend.app.routes.auth_routes import auth_bp
    from backend.app.routes.user_routes import user_bp
    from backend.app.routes.contact_routes import contact_bp
    from backend.app.routes.location_routes import location_bp
    from backend.app.routes.emergency_routes import emergency_bp
    from backend.app.routes.community_routes import community_bp
    from backend.app.routes.incident_routes import incident_bp
    from backend.app.routes.safety_routes import safety_bp
    from backend.app.routes.history_routes import history_bp
    from backend.app.routes.admin_routes import admin_bp

    for blueprint in (
        auth_bp,
        user_bp,
        contact_bp,
        location_bp,
        emergency_bp,
        community_bp,
        incident_bp,
        safety_bp,
        history_bp,
        admin_bp
    ):
        app.register_blueprint(blueprint)

    @app.get('/api/health')
    def health_check():
        return {
            'status': 'healthy',
            'platform': (
                'SheDefender: Smart Community-Based Women Protection '
                '& Incident Reporting'
            ),
            'version': '1.1.0',
            'tagline': 'Your Safety. Your Circle. Your Voice.'
        }, 200

    with app.app_context():
        db.create_all()
        migrate_legacy_schema()

    return app
