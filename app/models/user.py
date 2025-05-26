from app import db
from datetime import datetime

class User(db.Model):
    id = db.Column(db.String, primary_key=True)
    first_login = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)
    login_count = db.Column(db.Integer, default=0)
    display_name = db.Column(db.String)
    email = db.Column(db.String)
    job_title = db.Column(db.String)
    last_login = db.Column(db.DateTime)
    is_admin = db.Column(db.Boolean, default=False)
