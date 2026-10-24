"""
Baari — app/routers/admin.py
Admin management endpoints: user management, departments, doctors,
audit logs, daily metrics summary, and queue reset.
Requires admin role.
"""

import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.dependencies import get_db, require_role, verify_csrf
from app.models import Department, Doctor, Token, ServiceLog, User, AuditLog
from app.schemas import (
    UserOut,
    UserCreate,
    ResetPasswordRequest,
    DepartmentOut,
    DepartmentCreate,
    DoctorOut,
    DoctorCreate,
    AuditLogOut,
    DailySummary,
    ErrorResponse,
)
from app.security import hash_password
from app.audit import log_event
from app.queue_logic import format_token_number

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all user accounts."""
    users = db.query(User).order_by(User.id.asc()).all()
    out = []
    for u in users:
        dept_name = u.department.name if u.department else None
        out.append(
            UserOut(
                id=u.id,
                username=u.username,
                role=u.role,
                department_id=u.department_id,
                department_name=dept_name,
                active=u.active,
                must_change_password=u.must_change_password,
                created_at=u.created_at,
                last_login=u.last_login,
            )
        )
    return out


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create a new staff or admin user."""
    verify_csrf(request)

    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{body.username}' is already taken",
        )

    if body.role == "staff" and not body.department_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Staff users must be assigned to a department",
        )

    dept = None
    if body.department_id:
        dept = db.query(Department).filter(Department.id == body.department_id).first()
        if not dept:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Department not found",
            )

    new_user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role=body.role,
        department_id=body.department_id if body.role == "staff" else None,
        active=True,
        must_change_password=True,
        failed_logins=0,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(new_user)
    db.flush()

    log_event(
        db,
        "account_created",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"created_user": body.username, "role": body.role},
    )

    db.commit()

    return UserOut(
        id=new_user.id,
        username=new_user.username,
        role=new_user.role,
        department_id=new_user.department_id,
        department_name=dept.name if dept else None,
        active=new_user.active,
        must_change_password=new_user.must_change_password,
        created_at=new_user.created_at,
        last_login=new_user.last_login,
    )


@router.post("/users/{user_id}/toggle", response_model=UserOut)
def toggle_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Enable or disable a user account."""
    verify_csrf(request)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if target.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot disable own account")

    target.active = not target.active

    log_event(
        db,
        "user_status_toggled",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"target_user": target.username, "active": target.active},
    )

    db.commit()
    dept_name = target.department.name if target.department else None
    return UserOut(
        id=target.id,
        username=target.username,
        role=target.role,
        department_id=target.department_id,
        department_name=dept_name,
        active=target.active,
        must_change_password=target.must_change_password,
        created_at=target.created_at,
        last_login=target.last_login,
    )


@router.post("/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: int,
    body: ResetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Reset a user's password, unlock account, and require password change on next login."""
    verify_csrf(request)
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    target.password_hash = hash_password(body.new_password)
    target.must_change_password = True
    target.failed_logins = 0
    target.locked_until = None

    log_event(
        db,
        "password_reset_by_admin",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"target_user": target.username},
    )

    db.commit()
    return {"message": f"Password reset for user '{target.username}'"}


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all departments."""
    return db.query(Department).order_by(Department.id.asc()).all()


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(
    body: DepartmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create a new department."""
    verify_csrf(request)
    existing = (
        db.query(Department)
        .filter((Department.name == body.name) | (Department.code == body.code.upper()))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department name or code already exists",
        )

    dept = Department(
        name=body.name.strip(),
        code=body.code.strip().upper(),
        avg_service_minutes=body.avg_service_minutes,
    )
    db.add(dept)
    db.flush()

    log_event(
        db,
        "department_created",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"name": dept.name, "code": dept.code},
    )

    db.commit()
    return dept


@router.get("/doctors", response_model=list[DoctorOut])
def list_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """List all doctors across all departments."""
    return db.query(Doctor).order_by(Doctor.department_id.asc(), Doctor.name.asc()).all()


@router.post("/doctors", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
def create_doctor(
    body: DoctorCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Add a new doctor to a department."""
    verify_csrf(request)
    dept = db.query(Department).filter(Department.id == body.department_id).first()
    if not dept:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")

    doc = Doctor(
        name=body.name.strip(),
        department_id=dept.id,
        active=body.active,
    )
    db.add(doc)
    db.flush()

    log_event(
        db,
        "doctor_created",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"doctor_name": doc.name, "department": dept.name},
    )

    db.commit()
    return doc


@router.get("/audit", response_model=list[AuditLogOut])
def get_audit_logs(
    action: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Retrieve audit logs with optional filtering and pagination."""
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if actor:
        q = q.filter(AuditLog.actor_role == actor)

    logs = q.order_by(AuditLog.timestamp.desc()).offset((page - 1) * per_page).limit(per_page).all()

    out = []
    for l in logs:
        actor_name = l.actor.username if l.actor else None
        out.append(
            AuditLogOut(
                id=l.id,
                timestamp=l.timestamp,
                actor_user_id=l.actor_user_id,
                actor_username=actor_name,
                actor_role=l.actor_role,
                action=l.action,
                details=l.details,
            )
        )
    return out


@router.get("/summary", response_model=DailySummary)
def get_daily_summary(
    date_str: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Get aggregated daily performance report: patients served, average wait time,
    peak hour, no-show rate, and breakdown by department.
    """
    today = datetime.date.today()
    if date_str:
        try:
            today = datetime.date.fromisoformat(date_str)
        except Exception:
            pass

    tokens = db.query(Token).filter(Token.service_date == today).all()
    total_tokens = len(tokens)
    done_tokens = [t for t in tokens if t.status == "done"]
    no_show_tokens = [t for t in tokens if t.status == "no_show"]

    # Calculate wait times for completed tokens
    wait_times = []
    hourly_counts = {}

    for t in done_tokens:
        if t.called_at and t.created_at:
            # Replace naive/aware mismatch if needed
            c_at = t.called_at
            cr_at = t.created_at
            if c_at.tzinfo is None and cr_at.tzinfo is not None:
                c_at = c_at.replace(tzinfo=datetime.UTC)
            elif c_at.tzinfo is not None and cr_at.tzinfo is None:
                cr_at = cr_at.replace(tzinfo=datetime.UTC)

            wait_min = max(0.0, (c_at - cr_at).total_seconds() / 60.0)
            wait_times.append(wait_min)

        if t.created_at:
            hr_label = t.created_at.strftime("%I:00 %p")
            hourly_counts[hr_label] = hourly_counts.get(hr_label, 0) + 1

    avg_wait = round(sum(wait_times) / len(wait_times), 1) if wait_times else 0.0
    longest_wait = round(max(wait_times), 1) if wait_times else 0.0
    peak_hour = max(hourly_counts, key=hourly_counts.get) if hourly_counts else "None"

    no_show_cnt = len(no_show_tokens)
    no_show_rate = round((no_show_cnt / total_tokens * 100), 1) if total_tokens > 0 else 0.0

    # Department breakdown
    depts = db.query(Department).all()
    by_dept = []
    for d in depts:
        d_tokens = [t for t in tokens if t.department_id == d.id]
        d_done = sum(1 for t in d_tokens if t.status == "done")
        d_waiting = sum(1 for t in d_tokens if t.status == "waiting")
        d_called = sum(1 for t in d_tokens if t.status == "called")
        d_noshow = sum(1 for t in d_tokens if t.status == "no_show")
        by_dept.append({
            "department_id": d.id,
            "department_name": d.name,
            "department_code": d.code,
            "total_tokens": len(d_tokens),
            "done": d_done,
            "waiting": d_waiting,
            "called": d_called,
            "no_show": d_noshow,
            "avg_service_minutes": d.avg_service_minutes,
        })

    return DailySummary(
        date=today,
        patients_served=len(done_tokens),
        average_wait_minutes=avg_wait,
        longest_wait_minutes=longest_wait,
        peak_hour=peak_hour,
        no_show_count=no_show_cnt,
        no_show_rate=no_show_rate,
        by_department=by_dept,
    )


@router.post("/reset-day")
def reset_today_queue(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """
    Convenience endpoint for testing/demonstration.
    Clears all tokens and service logs for today so testers can run fresh demo flows.
    """
    verify_csrf(request)
    today = datetime.date.today()

    today_tokens = db.query(Token).filter(Token.service_date == today).all()
    token_ids = [t.id for t in today_tokens]

    if token_ids:
        db.query(ServiceLog).filter(ServiceLog.token_id.in_(token_ids)).delete(synchronize_session=False)
        db.query(Token).filter(Token.id.in_(token_ids)).delete(synchronize_session=False)

    log_event(
        db,
        "queue_reset",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"cleared_tokens_count": len(token_ids), "date": str(today)},
    )

    db.commit()
    return {"message": f"Successfully reset {len(token_ids)} tokens for today."}
