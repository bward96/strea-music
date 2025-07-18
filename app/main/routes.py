import base64
import requests
import logging
import csv
import concurrent.futures
from urllib.parse import quote
from io import BytesIO, StringIO
from flask import Blueprint, render_template, session, request, redirect, url_for, jsonify, Response, flash
from mutagen.mp3 import MP3
from app.utils.auth import get_auth_headers
from app.models.user import User
from app import db
from app.auth.routes import LogoutForm

main_bp = Blueprint("main", __name__)

GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
http = requests.Session()
http_metadata = requests.Session()

@main_bp.route("/")
def home():
    logout_form = LogoutForm()
    return render_template("index.html", logout_form=logout_form)


@main_bp.route("/me")
def user_profile():
    headers = get_auth_headers()
    if not headers:
        return redirect(url_for("auth.login"))
    res = http.get(f"{GRAPH_BASE_URL}/me", headers=headers)
    return jsonify(res.json()) if res.status_code == 200 else (jsonify({"error": "Failed to fetch user info"}), res.status_code)


@main_bp.route("/get_files")
def get_files():
    if "access_token" not in session or not session.get("access_token"):
        return redirect(url_for("auth.login"))

    headers = get_auth_headers()
    if not headers:
        return redirect(url_for("auth.login"))

    folder_id = request.args.get("folder_id", "root")
    endpoint = "me/drive/root/children" if folder_id == "root" else f"me/drive/items/{folder_id}/children"
    drive_url = f"{GRAPH_BASE_URL}/{endpoint}"

    items = []
    while drive_url:
        res = http.get(drive_url, headers=headers)
        if res.status_code != 200:
            return jsonify({"error": "Failed to fetch files"}), 500
        data = res.json()
        items.extend(data.get("value", []))
        drive_url = data.get("@odata.nextLink")

    # — determine admin flag —
    user_email = session.get("user_email")
    user = User.query.filter_by(email=user_email).first() if user_email else None
    is_admin = bool(user and user.is_admin)

    logout_form = LogoutForm()
    return render_template(
        "files.html",
        files=items,
        logout_form=logout_form,
        is_admin=is_admin
    )


@main_bp.route("/stream/<file_id>")
def stream_file(file_id):
    headers = get_auth_headers()
    if not headers:
        return redirect(url_for("auth.login"))

    # forward Range header if present
    range_header = request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header

    res = http.get(
        f"{GRAPH_BASE_URL}/me/drive/items/{file_id}/content",
        headers=headers,
        stream=True,
    )

    if res.status_code not in (200, 206):
        return jsonify({"error": "Failed to stream file"}), res.status_code

    response_headers = {
        "Content-Type": res.headers.get("Content-Type", "application/octet-stream"),
    }

    # propagate content length
    content_length = res.headers.get("Content-Length")
    if content_length:
        response_headers["Content-Length"] = content_length

    status_code = 200

    # include range headers when partial content is returned
    content_range = res.headers.get("Content-Range")
    if content_range:
        response_headers["Content-Range"] = content_range
        response_headers["Accept-Ranges"] = "bytes"
        status_code = 206

    return Response(
        res.iter_content(chunk_size=1024),
        status=status_code,
        headers=response_headers,
    )


@main_bp.route("/metadata/<path:file_id>")
def metadata(file_id):
    headers = get_auth_headers()
    if not headers:
        return jsonify({"error": "Unauthorized"}), 401

    res = http_metadata.get(f"{GRAPH_BASE_URL}/me/drive/items/{file_id}/content", headers=headers, timeout=5)
    if res.status_code != 200:
        return jsonify({"error": "File fetch failed"}), res.status_code

    try:
        audio = MP3(BytesIO(res.content))
        tags = audio.tags or {}
        meta = {
            "title": tags.get("TIT2", {}).text[0] if tags.get("TIT2") else "",
            "artist": tags.get("TPE1", {}).text[0] if tags.get("TPE1") else "",
            "album": tags.get("TALB", {}).text[0] if tags.get("TALB") else "",
            "duration": int(audio.info.length) if audio.info else 0,
            "album_art": ""
        }
        if hasattr(tags, "getall"):
            apic = tags.getall("APIC")
            if apic:
                meta["album_art"] = f"data:{apic[0].mime};base64,{base64.b64encode(apic[0].data).decode()}"
        return jsonify(meta)
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": "An internal error occurred."}), 500


def fetch_and_process_metadata(file_id, headers):
    """
    Fetches content for a single file and processes its metadata.
    Designed to be run in a separate thread.
    """
    if not file_id:
        return file_id, {}
    try:
        # URL-encode the file_id to handle special characters.
        encoded_file_id = quote(file_id)
        res = http_metadata.get(
            f"{GRAPH_BASE_URL}/me/drive/items/{encoded_file_id}/content",
            headers=headers,
            timeout=10
        )
        if res.status_code == 200:
            audio = MP3(BytesIO(res.content))
            tags = audio.tags or {}
            meta = {
                "title": tags.get("TIT2", {}).text[0] if tags.get("TIT2") else "",
                "artist": tags.get("TPE1", {}).text[0] if tags.get("TPE1") else "",
                "album": tags.get("TALB", {}).text[0] if tags.get("TALB") else "",
                "album_art": ""
            }
            if hasattr(tags, "getall"):
                apic = tags.getall("APIC")
                if apic:
                    meta["album_art"] = f"data:{apic[0].mime};base64,{base64.b64encode(apic[0].data).decode()}"
            return file_id, meta
        else:
            logging.error(f"Graph API failed for file ID {file_id} with status {res.status_code}")
            return file_id, {}
    except Exception as e:
        logging.error(f"Failed to process metadata for {file_id}: {e}")
    return file_id, {}


@main_bp.route("/metadata/batch", methods=["POST"])
def batch_metadata():
    headers = get_auth_headers()
    if not headers:
        return jsonify({}), 401

    try:
        file_ids = request.json.get("ids", [])
        if not file_ids:
            return jsonify({})

        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            future_to_file_id = {executor.submit(fetch_and_process_metadata, file_id, headers): file_id for file_id in file_ids}
            
            for future in concurrent.futures.as_completed(future_to_file_id):
                file_id, meta = future.result()
                if meta:
                    results[file_id] = meta

        return jsonify(results)
    except Exception as e:
        logging.error(f"An unhandled error occurred in batch_metadata: {e}", exc_info=True)
        return jsonify({"error": "An internal server error occurred."}), 500


@main_bp.route("/users", methods=["GET", "POST"])
def list_users():
    headers = get_auth_headers()
    if not headers:
        return redirect(url_for("auth.login"))

    user_email = session.get("user_email")
    user = User.query.filter_by(email=user_email).first()
    if not user or not user.is_admin:
        return render_template("403.html"), 403

    if request.method == "POST":
        target_email = request.form.get("email")
        target_user = User.query.filter_by(email=target_email).first()
        if target_user and target_user.email != user.email:
            target_user.is_admin = not target_user.is_admin
            db.session.commit()
            flash(f"Admin rights {'granted' if target_user.is_admin else 'revoked'} for {target_user.display_name}")
        return redirect(url_for("main.list_users"))

    users = User.query.all()
    return render_template("users.html", users=users)
    
@main_bp.app_errorhandler(404)
def page_not_found(e):
    return render_template("404.html"), 404

@main_bp.route("/users/export")
def export_users():
    user_email = session.get("user_email")
    user = User.query.filter_by(email=user_email).first()
    if not user or not user.is_admin:
        return render_template("403.html"), 403

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["Display Name", "Email", "Job Title", "First Login", "Last Login", "Login Count", "Is Admin"])

    for u in User.query.all():
        writer.writerow([
            u.display_name,
            u.email,
            u.job_title or '',
            u.first_login.strftime('%Y-%m-%d %H:%M') if u.first_login else '',
            u.last_login.strftime('%Y-%m-%d %H:%M') if u.last_login else '',
            u.login_count,
            'Yes' if u.is_admin else 'No'
        ])

    output.seek(0)
    return Response(output.getvalue(), mimetype='text/csv', headers={
        "Content-Disposition": "attachment;filename=users.csv"
    })