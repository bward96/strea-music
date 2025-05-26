import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_wtf import CSRFProtect
from flask_talisman import Talisman
from werkzeug.middleware.proxy_fix import ProxyFix
from dotenv import load_dotenv

load_dotenv()

csrf = CSRFProtect()
db = SQLAlchemy()

def create_app():
    app = Flask(__name__)

    app.secret_key = os.environ["FLASK_SECRET_KEY"]
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///users.db'
    app.config.update(
        SESSION_COOKIE_SECURE=True,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax'
    )
    app.permanent_session_lifetime = 1800

    app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

    # Only enforce HTTPS in production
    if os.environ.get("FLASK_ENV") == "production":
        Talisman(app, content_security_policy=None)

    csrf.init_app(app)
    db.init_app(app)

    from app.auth.routes import auth_bp
    from app.main.routes import main_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)

    return app
