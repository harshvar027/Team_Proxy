"""
Baari — tests/test_priority.py
Tests for priority queue behavior and validation:
- Priority without reason is rejected
- Emergency tokens jump ahead of priority and normal tokens
"""

from tests.conftest import login_as


def test_priority_without_reason_rejected(client, seed_data):
    login = login_as(client, seed_data["staff_g"].username, seed_data["staff_pw"])
    csrf = login["csrf"]
    dept_id = seed_data["dept_g"].id

    res = client.post(
        "/api/staff/issue-token",
        headers={"X-CSRF-Token": csrf},
        json={
            "name": "Emergency Patient",
            "department_id": dept_id,
            "priority_class": "emergency",
            # priority_reason omitted or None
            "priority_reason": None,
        },
    )
    # Validation error 422
    assert res.status_code == 422


def test_emergency_token_called_first(client, seed_data):
    login = login_as(client, seed_data["staff_g"].username, seed_data["staff_pw"])
    csrf = login["csrf"]
    dept_id = seed_data["dept_g"].id

    # Normal patient arrives first
    res_norm = client.post(
        "/api/patient/token/request",
        json={"name": "Normal Patient", "department_id": dept_id},
    )
    assert res_norm.status_code == 201

    # Emergency patient arrives second via staff desk
    res_em = client.post(
        "/api/staff/issue-token",
        headers={"X-CSRF-Token": csrf},
        json={
            "name": "Trauma Patient",
            "department_id": dept_id,
            "priority_class": "emergency",
            "priority_reason": "Severe head injury",
        },
    )
    assert res_em.status_code == 201

    # Call next: Emergency patient MUST be called first despite arriving second!
    call_res = client.post(
        "/api/staff/call-next",
        headers={"X-CSRF-Token": csrf},
    )
    assert call_res.status_code == 200
    assert call_res.json()["patient_name"] == "Trauma Patient"
    assert call_res.json()["priority_class"] == "emergency"
