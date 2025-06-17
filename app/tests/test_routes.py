import pytest
import sys
import os

# ensure required environment variables so the app can be created
os.environ.setdefault("FLASK_SECRET_KEY", "testing-secret")
os.environ.setdefault("CLIENT_ID", "dummy-client")
os.environ.setdefault("CLIENT_SECRET", "dummy-secret")
os.environ.setdefault("REDIRECT_URI", "http://localhost/callback")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from streamusic import app as flask_app
print("✅ TEST using app from:", flask_app.import_name)

@pytest.fixture
def client():
    flask_app.config.update({
        "TESTING": True,
        "WTF_CSRF_ENABLED": False,
        "SERVER_NAME": "localhost.localdomain"
    })

    with flask_app.test_client() as client:
        with client.session_transaction() as sess:
            sess.clear()  # clear everything
        yield client

def test_home_renders(client):
    response = client.get("/", follow_redirects=True)
    assert b"StreaMusic" in response.data

def test_get_files_redirects_when_logged_out(client):
    # explicitly verify session before testing
    with client.session_transaction() as sess:
        assert "access_token" not in sess

    response = client.get("/get_files", follow_redirects=False)
    print("🧪 REDIRECT TO:", response.headers.get("Location"))
    assert response.status_code == 302
    assert "/login" in response.headers["Location"] or "login" in response.headers["Location"].lower()


def test_stream_endpoint_returns_audio(monkeypatch, client):
    """Stream endpoint should proxy audio with correct headers."""

    # mock authentication header
    monkeypatch.setattr("app.main.routes.get_auth_headers", lambda: {"Authorization": "Bearer token"})

    class DummyResponse:
        status_code = 200
        headers = {
            "Content-Type": "audio/mpeg",
            "Content-Length": "100",
        }

        def iter_content(self, chunk_size=1):
            yield b"data"

    monkeypatch.setattr("app.main.routes.http.get", lambda url, headers=None, stream=None: DummyResponse())

    resp = client.get("/stream/fid")

    assert resp.status_code == 200
    assert resp.headers["Content-Type"] == "audio/mpeg"
    assert resp.headers["Content-Length"] == "100"


def test_metadata_endpoint_returns_expected_fields(monkeypatch, client):
    """Metadata endpoint should return title, artist, album, duration and album_art."""

    monkeypatch.setattr("app.main.routes.get_auth_headers", lambda: {"Authorization": "Bearer token"})

    class DummyHttpResponse:
        status_code = 200
        content = b"mp3data"

    monkeypatch.setattr("app.main.routes.http_metadata.get", lambda *a, **kw: DummyHttpResponse())

    class DummyMP3:
        def __init__(self, _io):
            self.info = type("Info", (), {"length": 123})()
            self.tags = {
                "TIT2": type("T", (), {"text": ["Test Title"]})(),
                "TPE1": type("T", (), {"text": ["Test Artist"]})(),
                "TALB": type("T", (), {"text": ["Test Album"]})(),
            }

    monkeypatch.setattr("app.main.routes.MP3", DummyMP3)

    resp = client.get("/metadata/fid")

    assert resp.status_code == 200
    data = resp.get_json()
    assert data == {
        "title": "Test Title",
        "artist": "Test Artist",
        "album": "Test Album",
        "duration": 123,
        "album_art": "",
    }
