"""
Baari — app/routers/auth.py
Authentication routes: login, logout, change-password.
Handles lockout, audit logging, session cookies, and CSRF.
"""

import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.dependencies import get_db, get_current_user, verify_csrf
from app.models import User
from app.schemas import LoginRequest, LoginResponse, ChangePasswordRequest, ErrorResponse
from app.security import (
    verify_password,
    hash_password,
    create_session_token,
    create_csrf_token_signed,
)
from app.audit import log_event
from app.config import settings

router = APIRouter(prefix="/api", tags=["auth"])


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={401: {"model": ErrorResponse}},
)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate with username + password.
    - Returns a generic error for both wrong username and wrong password (no enumeration).
    - Locks account after max_failed_logins attempts for lockout_minutes.
    - Sets HttpOnly session cookie and X-CSRF-Token header.
    """
    generic_error = "Invalid username or password"

    user = db.query(User).filter(User.username == body.username).first()

    if user is None:
        # User not found — log and return generic error
        log_event(db, "failed_login", details={"username": body.username, "reason": "user_not_found"})
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=generic_error)

    # Check if account is locked
    if user.locked_until and user.locked_until > datetime.datetime.now(datetime.UTC):
        remaining = (user.locked_until - datetime.datetime.now(datetime.UTC)).seconds // 60
        log_event(
            db, "failed_login",
            actor_user_id=user.id,
            actor_role=user.role,
            details={"username": body.username, "reason": "account_locked"},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=generic_error,
        )

    # Check if account is disabled
    if not user.active:
        log_event(
            db, "failed_login",
            actor_user_id=user.id,
            actor_role=user.role,
            details={"username": body.username, "reason": "account_disabled"},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=generic_error)

    # Verify password
    if not verify_password(body.password, user.password_hash):
        user.failed_logins += 1
        reason = "wrong_password"

        # Lock account if too many failures
        if user.failed_logins >= settings.max_failed_logins:
            user.locked_until = datetime.datetime.now(datetime.UTC) + datetime.timedelta(
                minutes=settings.lockout_minutes
            )
            reason = "account_locked_after_max_failures"

        log_event(
            db, "failed_login",
            actor_user_id=user.id,
            actor_role=user.role,
            details={
                "username": body.username,
                "reason": reason,
                "failed_attempts": user.failed_logins,
            },
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=generic_error)

    # Success — reset failed logins, update last_login
    user.failed_logins = 0
    user.locked_until = None
    user.last_login = datetime.datetime.now(datetime.UTC)

    log_event(
        db, "login",
        actor_user_id=user.id,
        actor_role=user.role,
        details={"username": body.username},
    )
    db.commit()

    # Create session token
    session_token = create_session_token(user.id, user.role, user.department_id)

    # Set cookie (only set secure=True if request is over HTTPS)
    is_insecure = (
        request.url.hostname in ("localhost", "127.0.0.1", "0.0.0.0", "testserver")
        or request.url.scheme != "https"
    )
    response.set_cookie(
        key="session",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=not is_insecure,
        max_age=settings.session_expiry_hours * 3600,
        path="/",
    )

    # Set CSRF token header
    csrf_token = create_csrf_token_signed(session_token)
    response.headers["X-CSRF-Token"] = csrf_token

    # Get department name for staff
    dept_name = None
    if user.department and user.department_id:
        dept_name = user.department.name

    return LoginResponse(
        message="Login successful",
        role=user.role,
        must_change_password=user.must_change_password,
        username=user.username,
        department_id=user.department_id,
        department_name=dept_name,
    )


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Clear the session cookie and log the event."""
    # Try to get the current user for audit logging
    session_token = request.cookies.get("session")
    user_id = None
    user_role = "anonymous"
    if session_token:
        from app.security import decode_session_token
        payload = decode_session_token(session_token)
        if payload:
            user_id = payload.get("user_id")
            user_role = payload.get("role", "anonymous")

    log_event(db, "logout", actor_user_id=user_id, actor_role=user_role)
    db.commit()

    response.delete_cookie("session", path="/")
    return {"message": "Logged out"}


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Change the current user's password.
    Requires the current password for verification.
    Clears must_change_password flag.
    Issues a new session token after password change.
    """
    # Verify CSRF
    verify_csrf(request)

    # Verify current password
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Don't allow reusing the same password
    if verify_password(body.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    # Update password
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False

    log_event(
        db, "password_changed",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"username": current_user.username},
    )
    db.commit()

    # Issue a new session token
    session_token = create_session_token(
        current_user.id, current_user.role, current_user.department_id
    )
    is_insecure = (
        request.url.hostname in ("localhost", "127.0.0.1", "0.0.0.0", "testserver")
        or request.url.scheme != "https"
    )
    response.set_cookie(
        key="session",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=not is_insecure,
        max_age=settings.session_expiry_hours * 3600,
        path="/",
    )
    csrf_token = create_csrf_token_signed(session_token)
    response.headers["X-CSRF-Token"] = csrf_token

    return {"message": "Password changed successfully"}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return current user info (for the frontend to know who's logged in)."""
    dept_name = None
    if current_user.department:
        dept_name = current_user.department.name

    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "department_id": current_user.department_id,
        "department_name": dept_name,
        "must_change_password": current_user.must_change_password,
    }
