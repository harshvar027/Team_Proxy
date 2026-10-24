"""
Baari — app/dependencies.py
Reusable FastAPI dependencies for DB sessions, auth, role checks, and department enforcement.
Security is enforced HERE, not in the frontend.
"""

import datetime
from typing import Annotated
from fastapi import Depends, Request, HTTPException, status
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import User
from app.security import decode_session_token, verify_csrf_token


# ── Database session ───────────────────────────────────────────────────────

def get_db():
    """Yield a DB session per request, auto-close after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Current user from session cookie ──────────────────────────────────────

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Extract and validate the session cookie. Returns the User ORM object.
    Raises 401 if no valid session.
    """
    session_token = request.cookies.get("session")
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_session_token(session_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
        )

    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if user is None or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found or disabled",
        )

    return user


# ── Optional current user (for routes accessible to both logged-in and anonymous) ──

def get_current_user_optional(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Returns the User if a valid session exists, else None. Never raises."""
    session_token = request.cookies.get("session")
    if not session_token:
        return None
    payload = decode_session_token(session_token)
    if payload is None:
        return None
    user = db.query(User).filter(User.id == payload["user_id"]).first()
    if user is None or not user.active:
        return None
    return user


# ── CSRF enforcement ──────────────────────────────────────────────────────

def verify_csrf(request: Request) -> None:
    """
    Verify CSRF token on state-changing requests (POST, PUT, DELETE, PATCH).
    The client must send the X-CSRF-Token header matching the session.
    GET/HEAD/OPTIONS are exempt.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    session_token = request.cookies.get("session")
    if not session_token:
        # No session = no CSRF needed (will fail auth anyway)
        return

    csrf_token = request.headers.get("X-CSRF-Token", "")
    if not verify_csrf_token(csrf_token, session_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing or invalid",
        )


# ── Role-based access ─────────────────────────────────────────────────────

def require_role(*allowed_roles: str):
    """
    Returns a dependency that checks the current user's role.
    Usage: Depends(require_role("admin")) or Depends(require_role("staff", "admin"))
    """
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user
    return checker


# ── Department enforcement for staff ───────────────────────────────────────

def require_department(current_user: User = Depends(get_current_user)) -> User:
    """
    Ensures staff users have a department_id set.
    Admins pass through (they can access all departments).
    The department_id is ALWAYS taken from the user record, never from the client.
    """
    if current_user.role == "staff" and current_user.department_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff user not assigned to a department",
        )
    return current_user


def get_staff_department_id(current_user: User = Depends(require_department)) -> int:
    """
    Returns the department_id for the current staff user.
    For admins, raises — admins should specify the department explicitly.
    This dependency enforces that staff can only act on their own department.
    """
    if current_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin must specify department_id explicitly",
        )
    return current_user.department_id
