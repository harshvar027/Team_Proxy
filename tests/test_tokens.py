"""
Baari — tests/test_tokens.py
Tests for token request, daily sequential numbers, PIN generation,
status lookup, and phone masking.
"""

from tests.conftest import login_as


def test_patient_token_request_and_pin(client, seed_data):
    dept_id = seed_data["dept_g"].id

    res = client.post(
        "/api/patient/token/request",
        json={
            "name": "Arjun Sharma",
            "department_id": dept_id,
            "phone": "9876543210",
            "language": "hi",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["token_number"] == "G-01"
    assert data["patient_name"] == "Arjun Sharma"
    assert data["phone_masked"] == "••••••3210"
    assert "pin" in data
    assert len(data["pin"]) == 4

    pin = data["pin"]

    # Verify lookup with token number and PIN
    lookup_res = client.post(
        "/api/patient/token/lookup",
        json={"token_number": "G-01", "pin": pin},
    )
    assert lookup_res.status_code == 200
    assert lookup_res.json()["token_number"] == "G-01"


def test_token_lookup_wrong_pin_fails(client, seed_data):
    dept_id = seed_data["dept_g"].id

    res = client.post(
        "/api/patient/token/request",
        json={"name": "Kavita Rao", "department_id": dept_id, "phone": "9123456789"},
    )
    assert res.status_code == 201

    lookup_res = client.post(
        "/api/patient/token/lookup",
        json={"token_number": "G-01", "pin": "9999"},
    )
    assert lookup_res.status_code in (401, 404)


def test_sequential_token_numbers(client, seed_data):
    dept_id = seed_data["dept_g"].id

    res1 = client.post(
        "/api/patient/token/request",
        json={"name": "Patient One", "department_id": dept_id},
    )
    res2 = client.post(
        "/api/patient/token/request",
        json={"name": "Patient Two", "department_id": dept_id},
    )

    assert res1.json()["token_number"] == "G-01"
    assert res2.json()["token_number"] == "G-02"
