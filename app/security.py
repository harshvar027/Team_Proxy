"""
Baari — app/security.py
Password hashing (argon2id), PIN hashing, signed session cookies, and CSRF tokens.
"""

import secrets
import hashlib
import hmac
import time
import json
import base64
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError
from app.config import settings

ph = PasswordHasher(
    time_cost=2,
    memory_cost=19456,
    parallelism=1,
    hash_len=32,
    salt_len=16,
)


# ── Password hashing ──────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password with argon2id. Returns the full encoded hash string."""
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against an argon2id hash. Returns True/False, never raises."""
    try:
        return ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# ── PIN hashing (same algorithm, 4-digit PINs) ────────────────────────────

def generate_pin() -> str:
    """Generate a random 4-digit PIN as a string (e.g. '0742')."""
    return f"{secrets.randbelow(10000):04d}"


def hash_pin(pin: str) -> str:
    """Hash a 4-digit PIN with argon2id."""
    return ph.hash(pin)


def verify_pin(pin: str, pin_hash: str) -> bool:
    """Verify a PIN against its hash. Returns True/False."""
    try:
        return ph.verify(pin_hash, pin)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# ── Signed session token ──────────────────────────────────────────────────
# Format: base64(json payload).signature
# Payload: {"user_id": int, "role": str, "department_id": int|null, "exp": unix_ts}
# Stored in an HttpOnly, SameSite=Lax cookie.

def _sign(data: str) -> str:
    """Create HMAC-SHA256 signature of data using SECRET_KEY."""
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        data.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def create_session_token(user_id: int, role: str, department_id: int | None) -> str:
    """Create a signed session token with an 8-hour expiry."""
    payload = {
        "user_id": user_id,
        "role": role,
        "department_id": department_id,
        "exp": int(time.time()) + (settings.session_expiry_hours * 3600),
    }
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    sig = _sign(payload_b64)
    return f"{payload_b64}.{sig}"


def decode_session_token(token: str) -> dict | None:
    """
    Decode and verify a session token.
    Returns the payload dict or None if invalid/expired.
    """
    try:
        parts = token.split(".", 1)
        if len(parts) != 2:
            return None
        payload_b64, sig = parts
        # Verify signature
        if not hmac.compare_digest(_sign(payload_b64), sig):
            return None
        # Decode payload
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        # Check expiry
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


# ── CSRF token ─────────────────────────────────────────────────────────────
# Cookie-to-header pattern: server sends a CSRF token in a response header,
# client must echo it back as X-CSRF-Token on every state-changing request.

def generate_csrf_token() -> str:
    """Generate a random CSRF token."""
    return secrets.token_hex(32)


def create_csrf_token_signed(session_token: str) -> str:
    """
    Create a CSRF token tied to the session.
    We HMAC the session token to produce a deterministic CSRF token per session.
    This way we don't need to store CSRF tokens server-side.
    """
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        f"csrf:{session_token}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_csrf_token(csrf_token: str, session_token: str) -> bool:
    """Verify that the CSRF token matches the session."""
    expected = create_csrf_token_signed(session_token)
    return hmac.compare_digest(csrf_token, expected)
