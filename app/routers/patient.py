"""
Baari — app/routers/patient.py
Patient-facing endpoints: request token, check status, lookup by token+PIN,
voice intent parsing, and local transcription.
"""

import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.dependencies import get_db, get_current_user_optional
from app.models import Department, Doctor, Patient, Token, User
from app.schemas import (
    DepartmentOut,
    TokenRequest,
    TokenLookupRequest,
    TokenOut,
    ErrorResponse,
)
from app.security import generate_pin, hash_pin, verify_pin
from app.audit import log_event
from app.config import settings
from app.queue_logic import (
    format_token_number,
    parse_token_number,
    get_next_token_number,
    get_active_doctors_count,
    get_waiting_tokens,
    calculate_wait_estimate,
)
from app.voice import (
    parse_patient_request,
    parse_department_intent,
    extract_patient_name,
    transcribe_audio_file,
)

router = APIRouter(prefix="/api/patient", tags=["patient"])


def _mask_phone(phone: str | None) -> str | None:
    """Mask phone number, showing only the last 4 digits."""
    if not phone or len(phone) < 4:
        return None
    return f"••••••{phone[-4:]}"


def _build_token_out(token: Token, db: Session, plaintext_pin: str | None = None) -> TokenOut:
    """Helper to assemble a TokenOut schema with live queue calculations."""
    today = datetime.date.today()
    dept = token.department

    # Determine position in queue if waiting
    pos = None
    wait_min = None
    wait_max = None
    arrive_by = None

    if token.status == "waiting":
        waiting_list = get_waiting_tokens(db, token.department_id, token.service_date)
        for idx, t in enumerate(waiting_list, start=1):
            if t.id == token.id:
                pos = idx
                break

        if pos is not None:
            active_docs = get_active_doctors_count(db, token.department_id)
            est = calculate_wait_estimate(
                position_in_queue=pos,
                avg_service_minutes=dept.avg_service_minutes,
                active_doctors=active_docs,
                arrival_buffer_minutes=settings.arrival_buffer_minutes,
            )
            wait_min = est["wait_estimate_min"]
            wait_max = est["wait_estimate_max"]
            arrive_by = est["arrive_by"]
    elif token.status == "called":
        arrive_by = "Currently being called"
    elif token.status == "done":
        arrive_by = "Visit completed"
    elif token.status == "no_show":
        arrive_by = "Marked as no-show"

    return TokenOut(
        id=token.id,
        token_number=format_token_number(dept.code, token.number),
        service_date=token.service_date,
        department_id=dept.id,
        department_name=dept.name,
        patient_name=token.patient.name,
        phone_masked=_mask_phone(token.patient.phone),
        priority_class=token.priority_class,
        priority_reason=token.priority_reason,
        status=token.status,
        pin=plaintext_pin,
        created_at=token.created_at,
        called_at=token.called_at,
        finished_at=token.finished_at,
        wait_estimate_min=wait_min,
        wait_estimate_max=wait_max,
        arrive_by=arrive_by,
        position_in_queue=pos,
        issued_by_staff=token.issued_by_user_id is not None,
    )


@router.get("/departments", response_model=list[DepartmentOut])
def get_departments(db: Session = Depends(get_db)):
    """List all available hospital departments."""
    depts = db.query(Department).order_by(Department.id.asc()).all()
    return depts


@router.post(
    "/token/request",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}},
)
def request_token(
    body: TokenRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    Patient requests a new token (self-service or assisted kiosk).
    Atomically generates next daily number, sets random 4-digit PIN,
    and returns estimated arrival time.
    """
    dept = db.query(Department).filter(Department.id == body.department_id).first()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department not found",
        )

    clean_name = body.name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Patient name cannot be blank",
        )

    # Use SQLite BEGIN IMMEDIATE via raw execution to lock the DB for atomic token number assignment
    try:
        db.execute(text("BEGIN IMMEDIATE"))
    except Exception:
        pass  # If transaction is already active

    today = datetime.date.today()
    next_num = get_next_token_number(db, dept.id, today)

    # Patient record
    patient = Patient(
        name=clean_name,
        phone=body.phone.strip() if body.phone else None,
        language=body.language,
    )
    db.add(patient)
    db.flush()

    # Generate 4-digit PIN
    pin = generate_pin()
    pin_h = hash_pin(pin)

    token = Token(
        number=next_num,
        service_date=today,
        department_id=dept.id,
        patient_id=patient.id,
        priority_class="normal",
        priority_reason=None,
        status="waiting",
        pin_hash=pin_h,
        issued_by_user_id=current_user.id if current_user else None,
        created_at=datetime.datetime.now(datetime.UTC),
    )
    db.add(token)
    db.flush()

    log_event(
        db,
        "token_issued",
        actor_user_id=current_user.id if current_user else None,
        actor_role=current_user.role if current_user else "patient",
        details={
            "token_number": format_token_number(dept.code, next_num),
            "department": dept.name,
            "patient_name": clean_name,
            "mode": "kiosk_self_service" if not current_user else "staff_assisted",
        },
    )

    db.commit()

    return _build_token_out(token, db, plaintext_pin=pin)


@router.get(
    "/token/{token_id}/status",
    response_model=TokenOut,
    responses={404: {"model": ErrorResponse}},
)
def get_token_status(token_id: int, db: Session = Depends(get_db)):
    """Check live token status and recompute wait estimate."""
    token = db.query(Token).filter(Token.id == token_id).first()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Token not found",
        )
    return _build_token_out(token, db)


@router.post(
    "/token/lookup",
    response_model=TokenOut,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def lookup_token_by_pin(body: TokenLookupRequest, db: Session = Depends(get_db)):
    """
    Patient checks their status by entering Token Number (e.g. 'G-07') and their 4-digit PIN.
    Secured by argon2id PIN verification.
    """
    generic_error = "Invalid token number or PIN"
    code, num = parse_token_number(body.token_number)
    if not code or num is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token format. Example: G-07")

    dept = db.query(Department).filter(Department.code == code).first()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=generic_error)

    today = datetime.date.today()
    token = (
        db.query(Token)
        .filter(
            Token.department_id == dept.id,
            Token.service_date == today,
            Token.number == num,
        )
        .first()
    )
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=generic_error)

    if not verify_pin(body.pin.strip(), token.pin_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=generic_error)

    return _build_token_out(token, db)


@router.post("/voice/parse-intent")
def parse_voice_text_intent(payload: dict, db: Session = Depends(get_db)):
    """
    Parse natural text spoken by the patient in Hindi, Marathi, or English.
    Returns detected department and patient name.
    """
    text_input = payload.get("text", "")
    detected_name, dept_code = parse_patient_request(text_input)

    matched_dept = None
    if dept_code:
        dept = db.query(Department).filter(Department.code == dept_code).first()
        if dept:
            matched_dept = {
                "id": dept.id,
                "name": dept.name,
                "code": dept.code,
            }

    return {
        "text": text_input,
        "patient_name": detected_name,
        "department": matched_dept,
    }


@router.post("/voice/transcribe")
async def transcribe_voice(
    file: UploadFile = File(...),
    language: str = Form(default="en"),
    db: Session = Depends(get_db),
):
    """
    Accepts uploaded audio, transcribes with local faster-whisper,
    deletes file immediately, and extracts intent entities.
    """
    audio_bytes = await file.read()
    result = transcribe_audio_file(audio_bytes, filename=file.filename or "recording.wav", language=language)

    text_transcribed = result.get("text", "")
    detected_name, dept_code = parse_patient_request(text_transcribed)

    matched_dept = None
    if dept_code:
        dept = db.query(Department).filter(Department.code == dept_code).first()
        if dept:
            matched_dept = {
                "id": dept.id,
                "name": dept.name,
                "code": dept.code,
            }

    return {
        "transcription": result,
        "patient_name": detected_name,
        "department": matched_dept,
    }
