from flask import Blueprint, session, redirect, url_for, request, jsonify, render_template
import os
import requests
import time
from datetime import datetime
from app.models.user import User
from app import db, csrf
from flask_wtf import FlaskForm
from wtforms import SubmitField
from werkzeug.exceptions import BadRequest

CLIENT_ID = os.environ["CLIENT_ID"]
CLIENT_SECRET = os.environ["CLIENT_SECRET"]
REDIRECT_URI = os.environ["REDIRECT_URI"]
AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
SCOPES = "openid offline_access Files.Read User.Read"

http = requests.Session()

class LogoutForm(FlaskForm):
    submit = SubmitField("Logout")

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login")
def login():
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "response_mode": "query"
    }
    auth_req = requests.Request('GET', AUTH_URL, params=params).prepare()
    return redirect(auth_req.url)


@auth_bp.route("/logout", methods=["POST"])
@csrf.exempt
def logout():
    form = LogoutForm()
    if form.validate_on_submit():
        session.clear()
        return redirect(url_for("main.home"))
    return "Invalid logout request", 400


@auth_bp.route("/callback")
def callback():
    code = request.args.get("code")
    if not code:
        raise BadRequest("No code in request.")

    token_data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    res = http.post(TOKEN_URL, data=token_data)
    token_json = res.json()

    if "access_token" not in token_json:
        return jsonify({"error": "Token acquisition failed", "details": token_json}), 400

    session["access_token"] = token_json["access_token"]
    session["refresh_token"] = token_json.get("refresh_token")
    session["expires_at"] = time.time() + int(token_json.get("expires_in", 3600)) - 60
    session.permanent = True

    headers = {"Authorization": f"Bearer {token_json['access_token']}"}
    user_info_res = http.get(f"{GRAPH_BASE_URL}/me", headers=headers)
    if user_info_res.status_code == 200:
        user_info = user_info_res.json()
        user = User.query.get(user_info["id"])
        if not user:
            user = User(id=user_info["id"])
        user.display_name = user_info.get("displayName")
        user.email = user_info.get("userPrincipalName")
        user.job_title = user_info.get("jobTitle")
        user.updated_at = datetime.utcnow()
        user.login_count = (user.login_count or 0) + 1
        if not user.first_login:
            user.first_login = datetime.utcnow()
        user.last_login = datetime.utcnow()
        session["user_email"] = user.email
        db.session.add(user)
        db.session.commit()

    return redirect(url_for("main.get_files"))

