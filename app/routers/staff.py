"""
Baari — app/routers/staff.py
Hospital & Staff queue console endpoints:
- View live queue board (single department or all queues across hospital)
- Call next patient (respecting Emergency > Daily Life > Routine priority)
- Mark done, mark no-show
- Issue walk-in / emergency tokens
- Update priority and reassign department
- Toggle doctor availability
"""

import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.dependencies import get_db, require_role, verify_csrf
from app.models import Department, Doctor, Patient, Token, ServiceLog, User, Hospital
from app.schemas import (
    QueueBoard,
    QueueItem,
    TokenOut,
    TokenIssueByStaff,
    SetPriorityRequest,
    DoctorOut,
    ErrorResponse,
)
from app.security import generate_pin, hash_pin
from app.audit import log_event
from app.config import settings
from app.queue_logic import (
    format_token_number,
    get_next_token_number,
    get_active_doctors_count,
    get_waiting_tokens,
    calculate_wait_estimate,
    update_department_ema,
    check_capacity_recommendation,
)
from app.routers.patient import _mask_phone, _build_token_out

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _resolve_department_id(user: User, requested_dept_id: int | None, db: Session) -> int:
    """
    Enforce department isolation:
    - Staff users are locked to user.department_id.
    - Hospital admins and Super admins can select any department, defaulting to first available.
    """
    if user.role == "staff":
        if not user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Staff member is not assigned to a department.",
            )
        return user.department_id

    # For hospital admin or super admin
    if requested_dept_id:
        dept = db.query(Department).filter(Department.id == requested_dept_id).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        return dept.id

    if user.hospital_id:
        dept = db.query(Department).filter(Department.hospital_id == user.hospital_id).first()
        if dept:
            return dept.id

    first_dept = db.query(Department).order_by(Department.id.asc()).first()
    if not first_dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No departments found")
    return first_dept.id


@router.get("/queue", response_model=QueueBoard)
def get_queue_board(
    department_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """
    Get the live queue board for a department with live priority classification.
    """
    dept_id = _resolve_department_id(current_user, department_id, db)
    dept = db.query(Department).filter(Department.id == dept_id).first()
    today = datetime.date.today()

    # Active doctors in department
    doctors = db.query(Doctor).filter(Doctor.department_id == dept_id).all()
    total_docs = len(doctors)
    active_docs = max(1, sum(1 for d in doctors if d.active))

    # All tokens for today in this department
    all_today_tokens = (
        db.query(Token)
        .filter(Token.department_id == dept_id, Token.service_date == today)
        .all()
    )

    waiting_tokens = get_waiting_tokens(db, dept_id, today)
    waiting_count = len(waiting_tokens)
    called_count = sum(1 for t in all_today_tokens if t.status == "called")
    done_count = sum(1 for t in all_today_tokens if t.status == "done")

    queue_items = []
    expected_in_hall = 0

    called_tokens = [t for t in all_today_tokens if t.status == "called"]
    for ct in sorted(called_tokens, key=lambda x: x.called_at or x.created_at, reverse=True):
        queue_items.append(
            QueueItem(
                token_id=ct.id,
                token_number=format_token_number(dept.code, ct.number),
                patient_name=ct.patient.name,
                phone_masked=_mask_phone(ct.patient.phone),
                priority_class=ct.priority_class,
                priority_reason=ct.priority_reason,
                symptoms=ct.symptoms,
                status="called",
                department_id=dept.id,
                department_name=dept.name,
                created_at=ct.created_at,
                called_at=ct.called_at,
                wait_estimate_min=0.0,
                wait_estimate_max=0.0,
                position_in_queue=0,
                is_expected_in_hall=True,
            )
        )
        expected_in_hall += 1

    for idx, wt in enumerate(waiting_tokens, start=1):
        est = calculate_wait_estimate(
            position_in_queue=idx,
            avg_service_minutes=dept.avg_service_minutes,
            active_doctors=active_docs,
            arrival_buffer_minutes=settings.arrival_buffer_minutes,
        )
        if est["is_expected_in_hall"]:
            expected_in_hall += 1

        queue_items.append(
            QueueItem(
                token_id=wt.id,
                token_number=format_token_number(dept.code, wt.number),
                patient_name=wt.patient.name,
                phone_masked=_mask_phone(wt.patient.phone),
                priority_class=wt.priority_class,
                priority_reason=wt.priority_reason,
                symptoms=wt.symptoms,
                status="waiting",
                department_id=dept.id,
                department_name=dept.name,
                created_at=wt.created_at,
                called_at=None,
                wait_estimate_min=est["wait_estimate_min"],
                wait_estimate_max=est["wait_estimate_max"],
                position_in_queue=idx,
                is_expected_in_hall=est["is_expected_in_hall"],
            )
        )

    rec_open, rec_savings = check_capacity_recommendation(
        waiting_count=waiting_count,
        active_doctors=active_docs,
        total_doctors=total_docs,
        avg_service_minutes=dept.avg_service_minutes,
    )

    # Resolve hospital info
    h = dept.hospital
    if not h:
        h = db.query(Hospital).first()

    return QueueBoard(
        department_id=dept.id,
        department_name=dept.name,
        department_code=dept.code,
        hospital_id=h.id if h else None,
        hospital_name=h.name if h else "Baari City Care Hospital",
        coordinator_name=h.coordinator_name if h else "Hospital Coordinator",
        coordinator_phone=h.coordinator_phone if h else "+91 98230 45678",
        active_doctors=active_docs,
        total_doctors=total_docs,
        waiting_count=waiting_count,
        called_count=called_count,
        done_today=done_count,
        avg_service_minutes=dept.avg_service_minutes,
        queue=queue_items,
        consider_opening_counter=rec_open,
        estimated_improvement_minutes=rec_savings,
        expected_in_hall_count=expected_in_hall,
    )


@router.get("/all-queues")
def get_all_hospital_queues(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """
    Get all queues across all departments for the hospital.
    Allows hospital administrators to maintain, see, and edit all queues in one place.
    """
    today = datetime.date.today()
    h_id = current_user.hospital_id
    h = db.query(Hospital).filter(Hospital.id == h_id).first() if h_id else db.query(Hospital).first()

    # Query all tokens for today
    query = db.query(Token).filter(Token.service_date == today)
    if h_id:
        query = query.filter((Token.hospital_id == h_id) | (Token.hospital_id == None))

    all_tokens = query.order_by(Token.created_at.asc()).all()

    # Organize tokens
    items = []
    emergency_count = 0
    daily_life_count = 0
    routine_count = 0
    waiting_count = 0
    called_count = 0
    done_count = 0
    no_show_count = 0

    for t in all_tokens:
        p_class = t.priority_class
        if p_class == "emergency":
            emergency_count += 1
        elif p_class in ("daily_life", "priority"):
            daily_life_count += 1
        else:
            routine_count += 1

        if t.status == "waiting":
            waiting_count += 1
        elif t.status == "called":
            called_count += 1
        elif t.status == "done":
            done_count += 1
        elif t.status == "no_show":
            no_show_count += 1

        items.append({
            "token_id": t.id,
            "token_number": format_token_number(t.department.code, t.number),
            "patient_name": t.patient.name,
            "phone_masked": _mask_phone(t.patient.phone),
            "department_id": t.department.id,
            "department_name": t.department.name,
            "priority_class": t.priority_class,
            "priority_reason": t.priority_reason,
            "symptoms": t.symptoms,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "called_at": t.called_at.isoformat() if t.called_at else None,
            "finished_at": t.finished_at.isoformat() if t.finished_at else None,
        })

    # Sort items: called first, then waiting (emergency > daily_life > routine), then done
    priority_map = {"emergency": 0, "daily_life": 1, "priority": 1, "routine": 2, "normal": 2}
    status_map = {"called": 0, "waiting": 1, "done": 2, "no_show": 3}

    items.sort(key=lambda x: (
        status_map.get(x["status"], 4),
        priority_map.get(x["priority_class"], 2),
        x["created_at"] or ""
    ))

    return {
        "hospital_id": h.id if h else None,
        "hospital_name": h.name if h else "Baari City Care Hospital",
        "coordinator_name": h.coordinator_name if h else "Hospital Coordinator",
        "coordinator_phone": h.coordinator_phone if h else "+91 98230 45678",
        "emergency_phone": h.emergency_phone if h else "+91 98230 11223",
        "total_tokens": len(all_tokens),
        "waiting_count": waiting_count,
        "called_count": called_count,
        "done_count": done_count,
        "no_show_count": no_show_count,
        "emergency_count": emergency_count,
        "daily_life_count": daily_life_count,
        "routine_count": routine_count,
        "tokens": items,
    }


@router.post("/call-next", response_model=TokenOut, responses={404: {"model": ErrorResponse}})
def call_next(
    request: Request,
    department_id: int | None = Query(default=None),
    doctor_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """
    Call the next highest priority waiting token.
    Prioritizes Emergency (Level 1) > Daily Life Problem (Level 2) > Routine (Level 3).
    """
    verify_csrf(request)
    dept_id = _resolve_department_id(current_user, department_id, db)
    today = datetime.date.today()

    try:
        db.execute(text("BEGIN IMMEDIATE"))
    except Exception:
        pass

    waiting = get_waiting_tokens(db, dept_id, today)
    if not waiting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patients currently waiting in queue for this department.",
        )

    next_token = waiting[0]
    next_token.status = "called"
    now_dt = datetime.datetime.now(datetime.UTC)
    next_token.called_at = now_dt

    assigned_doctor = None
    if doctor_id:
        assigned_doctor = (
            db.query(Doctor)
            .filter(Doctor.id == doctor_id, Doctor.department_id == dept_id)
            .first()
        )
    if not assigned_doctor:
        assigned_doctor = (
            db.query(Doctor)
            .filter(Doctor.department_id == dept_id, Doctor.active.is_(True))
            .first()
        )
    if not assigned_doctor:
        assigned_doctor = db.query(Doctor).filter(Doctor.department_id == dept_id).first()

    if assigned_doctor:
        service_log = ServiceLog(
            token_id=next_token.id,
            doctor_id=assigned_doctor.id,
            started_at=now_dt,
        )
        db.add(service_log)

    log_event(
        db,
        "token_called",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={
            "token_id": next_token.id,
            "token_number": format_token_number(next_token.department.code, next_token.number),
            "doctor": assigned_doctor.name if assigned_doctor else None,
            "priority": next_token.priority_class,
        },
    )

    db.commit()
    return _build_token_out(next_token, db)


@router.post("/token/{token_id}/done", response_model=TokenOut)
def mark_token_done(
    token_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """
    Mark patient visit as completed.
    Calculates elapsed consultation time and updates department EMA service time.
    """
    verify_csrf(request)
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    if current_user.role == "staff" and token.department_id != current_user.department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    now_dt = datetime.datetime.now(datetime.UTC)
    token.status = "done"
    token.finished_at = now_dt

    active_log = (
        db.query(ServiceLog)
        .filter(ServiceLog.token_id == token.id, ServiceLog.ended_at.is_(None))
        .order_by(ServiceLog.started_at.desc())
        .first()
    )

    duration_minutes = 8.0
    if active_log:
        active_log.ended_at = now_dt
        if active_log.started_at:
            duration_minutes = max(1.0, (now_dt - active_log.started_at).total_seconds() / 60.0)

    new_ema = update_department_ema(db, token.department, duration_minutes)

    log_event(
        db,
        "token_done",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={
            "token_id": token.id,
            "token_number": format_token_number(token.department.code, token.number),
            "consultation_minutes": round(duration_minutes, 1),
            "updated_dept_ema": new_ema,
        },
    )

    db.commit()
    return _build_token_out(token, db)


@router.post("/token/{token_id}/no-show", response_model=TokenOut)
def mark_token_no_show(
    token_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """Mark called token as No-Show if patient did not appear."""
    verify_csrf(request)
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    if current_user.role == "staff" and token.department_id != current_user.department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    token.status = "no_show"

    active_log = (
        db.query(ServiceLog)
        .filter(ServiceLog.token_id == token.id, ServiceLog.ended_at.is_(None))
        .first()
    )
    if active_log:
        active_log.ended_at = datetime.datetime.now(datetime.UTC)

    log_event(
        db,
        "token_no_show",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={
            "token_id": token.id,
            "token_number": format_token_number(token.department.code, token.number),
        },
    )

    db.commit()
    return _build_token_out(token, db)


@router.post("/issue-token", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def staff_issue_token(
    body: TokenIssueByStaff,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """
    Hospital admin or staff issues walk-in / emergency token with 3-tier priority.
    """
    verify_csrf(request)
    dept_id = _resolve_department_id(current_user, body.department_id, db)
    dept = db.query(Department).filter(Department.id == dept_id).first()

    h_id = body.hospital_id or current_user.hospital_id or dept.hospital_id
    if not h_id:
        h_def = db.query(Hospital).first()
        h_id = h_def.id if h_def else None

    today = datetime.date.today()
    try:
        db.execute(text("BEGIN IMMEDIATE"))
    except Exception:
        pass

    next_num = get_next_token_number(db, dept.id, today)

    patient = Patient(
        name=body.name.strip(),
        phone=body.phone.strip() if body.phone else None,
        email=body.email.strip() if body.email else None,
        language=body.language,
    )
    db.add(patient)
    db.flush()

    pin = generate_pin()
    token = Token(
        number=next_num,
        service_date=today,
        department_id=dept.id,
        patient_id=patient.id,
        hospital_id=h_id,
        priority_class=body.priority_class,
        priority_reason=body.priority_reason,
        symptoms=body.symptoms,
        status="waiting",
        pin_hash=hash_pin(pin),
        issued_by_user_id=current_user.id,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(token)
    db.flush()

    log_event(
        db,
        "walk_in_issued",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={
            "token_number": format_token_number(dept.code, next_num),
            "priority": body.priority_class,
            "reason": body.priority_reason,
            "hospital_id": h_id,
        },
    )

    db.commit()
    return _build_token_out(token, db, plaintext_pin=pin)


@router.put("/token/{token_id}/priority", response_model=TokenOut)
def set_token_priority(
    token_id: int,
    body: SetPriorityRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """
    Hospital or staff updates priority class (emergency, daily_life, routine) or reassigns department.
    """
    verify_csrf(request)
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    if current_user.role == "staff" and token.department_id != current_user.department_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    old_priority = token.priority_class
    token.priority_class = body.priority_class
    token.priority_reason = body.priority_reason

    if body.department_id and body.department_id != token.department_id:
        new_dept = db.query(Department).filter(Department.id == body.department_id).first()
        if new_dept:
            token.department_id = new_dept.id

    log_event(
        db,
        "priority_changed",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={
            "token_id": token.id,
            "token_number": format_token_number(token.department.code, token.number),
            "old_priority": old_priority,
            "new_priority": body.priority_class,
            "reason": body.priority_reason,
        },
    )

    db.commit()
    return _build_token_out(token, db)


@router.put("/token/{token_id}/edit", response_model=TokenOut)
def edit_token_details(
    token_id: int,
    payload: dict,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """
    Full queue edit: edit patient name, symptoms, priority, or department.
    """
    verify_csrf(request)
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")

    if "patient_name" in payload and payload["patient_name"]:
        token.patient.name = payload["patient_name"].strip()
    if "phone" in payload:
        token.patient.phone = payload["phone"].strip() if payload["phone"] else None
    if "priority_class" in payload:
        token.priority_class = payload["priority_class"]
    if "priority_reason" in payload:
        token.priority_reason = payload["priority_reason"]
    if "symptoms" in payload:
        token.symptoms = payload["symptoms"]
    if "status" in payload and payload["status"] in ("waiting", "called", "done", "no_show"):
        token.status = payload["status"]
    if "department_id" in payload:
        d_id = int(payload["department_id"])
        new_d = db.query(Department).filter(Department.id == d_id).first()
        if new_d:
            token.department_id = new_d.id

    log_event(
        db,
        "token_edited",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={"token_id": token.id, "changes": payload},
    )

    db.commit()
    return _build_token_out(token, db)


@router.get("/doctors", response_model=list[DoctorOut])
def get_department_doctors(
    department_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """List doctors in current department."""
    dept_id = _resolve_department_id(current_user, department_id, db)
    docs = db.query(Doctor).filter(Doctor.department_id == dept_id).order_by(Doctor.id.asc()).all()
    return docs


@router.post("/doctors/{doctor_id}/toggle", response_model=DoctorOut)
def toggle_doctor_status(
    doctor_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin", "hospital")),
):
    """Toggle doctor availability status."""
    verify_csrf(request)
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not found")

    doctor.active = not doctor.active

    log_event(
        db,
        "doctor_status_toggled",
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        details={
            "doctor_id": doctor.id,
            "doctor_name": doctor.name,
            "active": doctor.active,
        },
    )

    db.commit()
    return doctor
