import pytest 
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

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
    assert b"StreamMusic" in response.data

def test_get_files_redirects_when_logged_out(client):
    # explicitly verify session before testing
    with client.session_transaction() as sess:
        assert "access_token" not in sess

    response = client.get("/get_files", follow_redirects=False)
    print("🧪 REDIRECT TO:", response.headers.get("Location"))
    assert response.status_code == 302
    assert "/login" in response.headers["Location"] or "login" in response.headers["Location"].lower()
