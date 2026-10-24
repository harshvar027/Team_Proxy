"""
Baari — tests/test_voice.py
Tests for Neural TTS voice endpoint and caching.
"""

from unittest.mock import patch


def test_voice_tts_endpoint_get(client):
    """Verify GET /api/voice/tts streams mp3 audio."""
    # Test with sample text
    res = client.get("/api/voice/tts?text=Token+G-01&language=hi")
    assert res.status_code == 200
    assert "audio/mpeg" in res.headers.get("content-type", "")
    assert len(res.content) > 0


def test_voice_tts_endpoint_head(client):
    """Verify HEAD /api/voice/tts returns 200 OK."""
    res = client.head("/api/voice/tts?text=Token+G-01&language=hi")
    assert res.status_code == 200
    assert "audio/mpeg" in res.headers.get("content-type", "")


def test_patient_token_with_email_and_priority(client, seed_data):
    """Verify patient registration persists email and priority tier."""
    dept_id = seed_data["dept_g"].id

    res = client.post(
        "/api/patient/token/request",
        json={
            "name": "Lakshmi Narayana",
            "department_id": dept_id,
            "phone": "9845012345",
            "email": "lakshmi@example.com",
            "language": "hi",
            "priority_class": "priority",
            "priority_reason": "Senior citizen aged 78 with walker",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["token_number"] == "G-01"
    assert data["priority_class"] == "priority"
    assert data["priority_reason"] == "Senior citizen aged 78 with walker"
    assert data["phone_masked"] == "••••••2345"
