import time
import os
import logging
import requests
from flask import session

logger = logging.getLogger(__name__)

CLIENT_ID = os.environ["CLIENT_ID"]
CLIENT_SECRET = os.environ["CLIENT_SECRET"]
REDIRECT_URI = os.environ["REDIRECT_URI"]
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"

http = requests.Session()


def get_auth_headers():
    expires_at = session.get("expires_at")
    if expires_at and time.time() >= expires_at:
        logger.info("Access token expired. Attempting refresh...")
        if not refresh_access_token():
            return None

    token = session.get("access_token")
    return {"Authorization": f"Bearer {token}"} if token else None


def refresh_access_token():
    refresh_token = session.get("refresh_token")
    if not refresh_token:
        logger.warning("No refresh token available.")
        return False

    data = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "redirect_uri": REDIRECT_URI
    }
    res = http.post(TOKEN_URL, data=data)
    if res.status_code != 200:
        logger.error("Token refresh failed: %s", res.text)
        return False

    token_data = res.json()
    session["access_token"] = token_data["access_token"]
    session["refresh_token"] = token_data.get("refresh_token", refresh_token)
    session["expires_at"] = time.time() + int(token_data.get("expires_in", 3600)) - 60
    session.permanent = True
    return True
