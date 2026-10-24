"""
Baari — app/routers/auth.py
Authentication routes: login, logout, register (patient & hospital),
change-password, hospital profile management, and current user info.
"""

import datetime
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from app.dependencies import get_db, get_current_user, verify_csrf
from app.models import User, Hospital, Department
from app.schemas import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    ChangePasswordRequest,
    HospitalOut,
    HospitalUpdate,
    ErrorResponse,
)
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
    "/register",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Register a new user:
    - role='patient': Normal user / patient who can view and manage their queue tokens.
    - role='hospital': Healthcare organization / hospital admin who manages queues,
      doctors, coordinator information, and has a dedicated QR code for patients.
    """
    existing = db.query(User).filter(User.username == body.username.strip().lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken. Please choose another.",
        )

    hospital = None
    if body.role == "hospital":
        # Ensure hospital details
        h_name = (body.hospital_name or f"{body.username.title()} Hospital").strip()
        h_location = (body.location or "Medical Center").strip()
        h_coord_name = (body.coordinator_name or body.full_name or "Hospital Coordinator").strip()
        h_coord_phone = (body.coordinator_phone or body.phone or "+91 98000 00000").strip()
        h_emerg_phone = (body.emergency_phone or h_coord_phone).strip()

        # Generate unique hospital code
        base_code = "".join(c for c in h_name.upper() if c.isalnum())[:6] or "HOSP"
        h_code = f"HOSP-{base_code}-{secrets.token_hex(2).upper()}"

        hospital = Hospital(
            name=h_name,
            code=h_code,
            location=h_location,
            coordinator_name=h_coord_name,
            coordinator_phone=h_coord_phone,
            emergency_phone=h_emerg_phone,
            email=body.email or f"{body.username.lower()}@hospital.in",
            description=f"OPD & Emergency Queue Facility for {h_name}",
            created_at=datetime.datetime.now(datetime.UTC),
        )
        db.add(hospital)
        db.flush()

        # Seed initial departments for this hospital so queues work right away.
        # Use hospital-scoped names/codes to avoid UNIQUE constraint collisions.
        default_depts = [
            ("General Medicine", "G", 8.0),
            ("Pediatrics", "P", 10.0),
            ("Orthopedics", "O", 12.0),
            ("Gynecology", "Y", 10.0),
        ]
        for d_name, d_code, avg_m in default_depts:
            scoped_code = f"{d_code}_{hospital.id}"
            # Check if a department with this scoped code already exists
            existing_dept = db.query(Department).filter(
                Department.code == scoped_code
            ).first()
            if not existing_dept:
                # Also check if the plain name already exists (first hospital gets plain names)
                existing_by_name = db.query(Department).filter(
                    Department.name == d_name
                ).first()
                dept_name = d_name if not existing_by_name else f"{d_name} ({h_code})"
                dept = Department(
                    name=dept_name,
                    code=scoped_code,
                    avg_service_minutes=avg_m,
                    hospital_id=hospital.id,
                )
                db.add(dept)
        db.flush()

    pw_hash = hash_password(body.password)
    user = User(
        username=body.username.strip().lower(),
        password_hash=pw_hash,
        role=body.role,
        hospital_id=hospital.id if hospital else None,
        department_id=None,
        full_name=body.full_name.strip() if body.full_name else None,
        phone=body.phone.strip() if body.phone else None,
        active=True,
        must_change_password=False,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(user)
    db.flush()

    log_event(
        db,
        "register",
        actor_user_id=user.id,
        actor_role=user.role,
        details={
            "username": user.username,
            "role": user.role,
            "hospital_id": hospital.id if hospital else None,
            "hospital_name": hospital.name if hospital else None,
        },
    )
    db.commit()

    # Automatically issue session token
    session_token = create_session_token(user.id, user.role, user.department_id)
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

    return LoginResponse(
        message="Registration successful",
        role=user.role,
        must_change_password=user.must_change_password,
        username=user.username,
        department_id=user.department_id,
        department_name=None,
        hospital_id=hospital.id if hospital else None,
        hospital_name=hospital.name if hospital else None,
        coordinator_phone=hospital.coordinator_phone if hospital else None,
        full_name=user.full_name,
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={401: {"model": ErrorResponse}},
)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate with username + password.
    Supports Patient, Hospital, Staff, and Admin roles.
    """
    generic_error = "Invalid username or password"

    user = db.query(User).filter(User.username == body.username.strip().lower()).first()

    if user is None:
        log_event(db, "failed_login", details={"username": body.username, "reason": "user_not_found"})
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=generic_error)

    # Check lockout
    if user.locked_until and user.locked_until > datetime.datetime.now(datetime.UTC):
        remaining = int((user.locked_until - datetime.datetime.now(datetime.UTC)).total_seconds())
        log_event(
            db, "failed_login",
            actor_user_id=user.id,
            actor_role=user.role,
            details={"username": body.username, "reason": "account_locked"},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again in 10 minutes.",
            headers={"Retry-After": str(max(1, remaining))},
        )

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

    # Success
    user.failed_logins = 0
    user.locked_until = None
    user.last_login = datetime.datetime.now(datetime.UTC)

    log_event(
        db, "login",
        actor_user_id=user.id,
        actor_role=user.role,
        details={"username": body.username, "role": user.role},
    )
    db.commit()

    # Session token
    session_token = create_session_token(user.id, user.role, user.department_id)
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

    dept_name = None
    if user.department:
        dept_name = user.department.name

    h_name = None
    h_phone = None
    if user.hospital:
        h_name = user.hospital.name
        h_phone = user.hospital.coordinator_phone
    elif user.hospital_id:
        h = db.query(Hospital).filter(Hospital.id == user.hospital_id).first()
        if h:
            h_name = h.name
            h_phone = h.coordinator_phone

    return LoginResponse(
        message="Login successful",
        role=user.role,
        must_change_password=user.must_change_password,
        username=user.username,
        department_id=user.department_id,
        department_name=dept_name,
        hospital_id=user.hospital_id,
        hospital_name=h_name,
        coordinator_phone=h_phone,
        full_name=user.full_name,
    )


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Clear the session cookie and log the event."""
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
    """Change the current user's password."""
    verify_csrf(request)

    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if verify_password(body.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False

    log_event(
        db, "password_changed",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"username": current_user.username},
    )
    db.commit()

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


@router.get("/csrf")
def get_csrf(request: Request, response: Response, current_user: User = Depends(get_current_user)):
    """Issue a fresh CSRF header for an existing session."""
    session_token = request.cookies.get("session")
    if session_token:
        response.headers["X-CSRF-Token"] = create_csrf_token_signed(session_token)
    return {"ok": True, "username": current_user.username, "role": current_user.role}


@router.get("/me")
def get_me(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return current user info including hospital and coordinator contact."""
    session_token = request.cookies.get("session")
    if session_token:
        response.headers["X-CSRF-Token"] = create_csrf_token_signed(session_token)
    dept_name = None
    if current_user.department:
        dept_name = current_user.department.name

    h = None
    if current_user.hospital_id:
        h = db.query(Hospital).filter(Hospital.id == current_user.hospital_id).first()
    elif current_user.role in ("hospital", "admin", "staff"):
        # Default to first hospital if unassigned
        h = db.query(Hospital).first()

    return {
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "department_id": current_user.department_id,
        "department_name": dept_name,
        "hospital_id": h.id if h else None,
        "hospital_name": h.name if h else None,
        "hospital_code": h.code if h else None,
        "coordinator_name": h.coordinator_name if h else None,
        "coordinator_phone": h.coordinator_phone if h else None,
        "emergency_phone": h.emergency_phone if h else None,
        "hospital_location": h.location if h else None,
        "must_change_password": current_user.must_change_password,
    }


# ── Hospital Profile & Settings ───────────────────────────────────────────

@router.get("/hospital/profile", response_model=HospitalOut)
def get_hospital_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve hospital details for hospital admin or staff."""
    h_id = current_user.hospital_id
    if not h_id:
        h = db.query(Hospital).first()
    else:
        h = db.query(Hospital).filter(Hospital.id == h_id).first()

    if not h:
        raise HTTPException(status_code=404, detail="Hospital record not found")

    return HospitalOut(
        id=h.id,
        name=h.name,
        code=h.code,
        location=h.location,
        coordinator_name=h.coordinator_name,
        coordinator_phone=h.coordinator_phone,
        emergency_phone=h.emergency_phone,
        email=h.email,
        description=h.description,
        created_at=h.created_at,
        qr_code_url=f"/api/hospital/{h.id}/qr",
    )


@router.put("/hospital/profile", response_model=HospitalOut)
def update_hospital_profile(
    body: HospitalUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update hospital record details, coordinator contact info, and emergency numbers."""
    verify_csrf(request)
    if current_user.role not in ("hospital", "admin"):
        raise HTTPException(status_code=403, detail="Only hospital administrators can update hospital details")

    h_id = current_user.hospital_id
    if not h_id:
        h = db.query(Hospital).first()
    else:
        h = db.query(Hospital).filter(Hospital.id == h_id).first()

    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found")

    if body.name is not None:
        h.name = body.name.strip()
    if body.location is not None:
        h.location = body.location.strip()
    if body.coordinator_name is not None:
        h.coordinator_name = body.coordinator_name.strip()
    if body.coordinator_phone is not None:
        h.coordinator_phone = body.coordinator_phone.strip()
    if body.emergency_phone is not None:
        h.emergency_phone = body.emergency_phone.strip()
    if body.email is not None:
        h.email = body.email.strip()
    if body.description is not None:
        h.description = body.description.strip()

    log_event(
        db,
        "hospital_profile_updated",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"hospital_id": h.id, "hospital_name": h.name, "coordinator_phone": h.coordinator_phone},
    )
    db.commit()
    db.refresh(h)

    return HospitalOut(
        id=h.id,
        name=h.name,
        code=h.code,
        location=h.location,
        coordinator_name=h.coordinator_name,
        coordinator_phone=h.coordinator_phone,
        emergency_phone=h.emergency_phone,
        email=h.email,
        description=h.description,
        created_at=h.created_at,
        qr_code_url=f"/api/hospital/{h.id}/qr",
    )
