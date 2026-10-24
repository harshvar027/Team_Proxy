"""
Baari — tests/test_auth.py
Tests for authentication, argon2id hashing, lockout, generic error messages,
session cookies, CSRF protection, and role enforcement.
"""

from tests.conftest import login_as


def test_login_success_admin(client, seed_data):
    res = client.post(
        "/api/login",
        json={"username": seed_data["admin_user"].username, "password": seed_data["admin_pw"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["role"] == "admin"
    assert "session" in res.cookies
    assert "X-CSRF-Token" in res.headers


def test_login_wrong_password_generic_error(client, seed_data):
    res = client.post(
        "/api/login",
        json={"username": seed_data["admin_user"].username, "password": "WrongPassword123!"},
    )
    assert res.status_code == 401
    # Generic error message to prevent enumeration
    assert res.json()["detail"] == "Invalid username or password"


def test_login_nonexistent_user_generic_error(client, seed_data):
    res = client.post(
        "/api/login",
        json={"username": "nonexistent_user", "password": "AnyPassword123!"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid username or password"


def test_login_disabled_account_rejected(client, seed_data):
    res = client.post(
        "/api/login",
        json={"username": seed_data["disabled_user"].username, "password": "DisabledPass1!"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid username or password"


def test_staff_cannot_access_admin_endpoints(client, seed_data):
    login = login_as(client, seed_data["staff_g"].username, seed_data["staff_pw"])
    csrf = login["csrf"]

    res = client.get("/api/admin/users")
    assert res.status_code == 403
    assert "Insufficient permissions" in res.json()["detail"]


def test_csrf_token_required_on_post(client, seed_data):
    # Log in as staff
    login = login_as(client, seed_data["staff_g"].username, seed_data["staff_pw"])

    # Try calling next without X-CSRF-Token header
    res = client.post("/api/staff/call-next")
    assert res.status_code == 403
    assert "CSRF" in res.json()["detail"]
