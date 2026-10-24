"""
Baari — app/routers/patient.py
Patient-facing endpoints: request token, check status, lookup by token+PIN,
AI Triage analysis, QR code generation, and voice/audio transcription.
"""

import io
import datetime
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.dependencies import get_db, get_current_user_optional
from app.models import Department, Doctor, Patient, Token, User, Hospital
from app.schemas import (
    DepartmentOut,
    HospitalOut,
    TokenRequest,
    TokenLookupRequest,
    TokenOut,
    AITriageRequest,
    AITriageResponse,
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
from app.ai_triage import triage_patient
from app.voice import (
    parse_patient_request,
    parse_department_intent,
    extract_patient_name,
    transcribe_audio_file,
)
from app.voice.tts import synthesize_speech_edge

router = APIRouter(prefix="/api/patient", tags=["patient"])


def _mask_phone(phone: str | None) -> str | None:
    """Mask phone number, showing only the last 4 digits."""
    if not phone or len(phone) < 4:
        return None
    return f"••••••{phone[-4:]}"


def _build_token_out(token: Token, db: Session, plaintext_pin: str | None = None) -> TokenOut:
    """Helper to assemble a TokenOut schema with live queue and hospital coordinator calculations."""
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

    # Hospital coordinator info
    h = token.hospital
    if not h and token.hospital_id:
        h = db.query(Hospital).filter(Hospital.id == token.hospital_id).first()
    if not h and dept.hospital_id:
        h = db.query(Hospital).filter(Hospital.id == dept.hospital_id).first()
    if not h:
        h = db.query(Hospital).first()

    return TokenOut(
        id=token.id,
        token_number=format_token_number(dept.code, token.number),
        service_date=token.service_date,
        department_id=dept.id,
        department_name=dept.name,
        hospital_id=h.id if h else None,
        hospital_name=h.name if h else "Baari City Care Hospital",
        hospital_location=h.location if h else "Central Medical Clinic",
        coordinator_name=h.coordinator_name if h else "Hospital Coordinator",
        coordinator_phone=h.coordinator_phone if h else "+91 98230 45678",
        emergency_phone=h.emergency_phone if h else "+91 98230 11223",
        patient_name=token.patient.name,
        phone_masked=_mask_phone(token.patient.phone),
        patient_email=token.patient.email,
        priority_class=token.priority_class,
        priority_reason=token.priority_reason,
        symptoms=token.symptoms,
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


@router.get("/hospitals", response_model=list[HospitalOut])
def get_hospitals(db: Session = Depends(get_db)):
    """List all registered hospitals."""
    hospitals = db.query(Hospital).order_by(Hospital.id.asc()).all()
    res = []
    for h in hospitals:
        res.append(
            HospitalOut(
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
                qr_code_url=f"/api/patient/hospital/{h.id}/qr",
            )
        )
    return res


@router.get("/hospital/{hospital_id}/info", response_model=HospitalOut)
def get_hospital_info(hospital_id: int, db: Session = Depends(get_db)):
    """Get hospital record details and coordinator info for patient check-in."""
    h = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found")
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
        qr_code_url=f"/api/patient/hospital/{h.id}/qr",
    )


@router.get("/hospital/{hospital_id}/qr")
def get_hospital_qr(hospital_id: int, request: Request, db: Session = Depends(get_db)):
    """
    Generate and serve a crisp high-res QR code for the hospital.
    Scanning opens the patient check-in portal with that hospital selected!
    """
    h = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Hospital not found")

    host_url = str(request.base_url).rstrip("/")
    target_url = f"{host_url}/token.html?hospital_id={h.id}&code={h.code}"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=3,
    )
    qr.add_data(target_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0066cc", back_color="#ffffff")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/departments", response_model=list[DepartmentOut])
def get_departments(
    hospital_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """List available departments, optionally filtered by hospital."""
    q = db.query(Department)
    if hospital_id:
        # Include departments for this hospital or global departments
        q = q.filter((Department.hospital_id == hospital_id) | (Department.hospital_id == None))
    depts = q.order_by(Department.id.asc()).all()
    if not depts:
        depts = db.query(Department).order_by(Department.id.asc()).all()
    return depts


@router.post(
    "/ai-triage",
    response_model=AITriageResponse,
)
def ai_triage(body: AITriageRequest, db: Session = Depends(get_db)):
    """
    AI Triage Assistant endpoint.
    Accepts patient symptoms / complaints in natural text (English, Hindi, Marathi).
    Extracts name, symptoms, classifies urgency into 3 tiers (Emergency, Daily Life Problem, Routine),
    and recommends the most appropriate hospital department.
    """
    triage = triage_patient(body.text, language=body.language)

    # Resolve department
    dept = None
    code = triage["suggested_department_code"]
    q = db.query(Department)
    if body.hospital_id:
        q = q.filter((Department.hospital_id == body.hospital_id) | (Department.hospital_id == None))

    dept = q.filter(Department.code.like(f"{code}%")).first()
    if not dept:
        dept = db.query(Department).first()

    return AITriageResponse(
        detected_name=triage["detected_name"],
        symptoms=triage["symptoms"],
        priority_class=triage["priority_class"],
        priority_label=triage["priority_label"],
        suggested_department_code=code,
        suggested_department_id=dept.id if dept else 1,
        suggested_department_name=dept.name if dept else "General Medicine",
        triage_reason=triage["triage_reason"],
        confidence=triage["confidence"],
    )


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
    Patient requests a new token (self-service, hospital QR scan, or AI triage).
    Atomically generates next daily number, sets random 4-digit PIN,
    and returns wait estimate + coordinator phone number.
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

    # Resolve hospital
    h_id = body.hospital_id
    if not h_id and dept.hospital_id:
        h_id = dept.hospital_id
    if not h_id and current_user and current_user.hospital_id:
        h_id = current_user.hospital_id
    if not h_id:
        h_def = db.query(Hospital).first()
        h_id = h_def.id if h_def else None

    # Use SQLite BEGIN IMMEDIATE via raw execution to lock the DB for atomic token number assignment
    try:
        db.execute(text("BEGIN IMMEDIATE"))
    except Exception:
        pass

    today = datetime.date.today()
    next_num = get_next_token_number(db, dept.id, today)

    # Patient record
    patient = Patient(
        name=clean_name,
        phone=body.phone.strip() if body.phone else None,
        email=body.email.strip() if body.email else None,
        language=body.language,
    )
    db.add(patient)
    db.flush()

    # Generate 4-digit PIN
    pin = generate_pin()
    pin_h = hash_pin(pin)

    # Priority determination (emergency, daily_life, routine)
    p_class = body.priority_class if body.priority_class in ["emergency", "daily_life", "routine", "priority", "normal"] else "routine"
    p_reason = body.priority_reason

    token = Token(
        number=next_num,
        service_date=today,
        department_id=dept.id,
        patient_id=patient.id,
        hospital_id=h_id,
        priority_class=p_class,
        priority_reason=p_reason,
        symptoms=body.symptoms,
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
            "priority": p_class,
            "hospital_id": h_id,
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
    Patient checks their status by entering Token Number and their 4-digit PIN.
    Secured by argon2id PIN verification.
    """
    generic_error = "Invalid token number or PIN"
    code, num = parse_token_number(body.token_number)
    if not code or num is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token format. Example: G-07")

    depts = db.query(Department).all()
    matched_ids = [
        d.id
        for d in depts
        if d.code.upper() == code or d.code.upper().startswith(f"{code}_")
    ]
    if not matched_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=generic_error)

    today = datetime.date.today()
    candidates = (
        db.query(Token)
        .filter(
            Token.department_id.in_(matched_ids),
            Token.service_date == today,
            Token.number == num,
        )
        .all()
    )
    pin = body.pin.strip()
    token = next((row for row in candidates if verify_pin(pin, row.pin_hash)), None)
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=generic_error)

    return _build_token_out(token, db)


@router.get("/my-tokens", response_model=list[TokenOut])
def get_my_tokens(
    current_user: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Retrieve active or recent tokens for logged-in patient."""
    if not current_user:
        return []
    
    tokens = (
        db.query(Token)
        .join(Patient)
        .filter(
            (Token.issued_by_user_id == current_user.id) |
            (Patient.name == (current_user.full_name or current_user.username))
        )
        .order_by(Token.created_at.desc())
        .limit(10)
        .all()
    )
    return [_build_token_out(t, db) for t in tokens]


@router.post("/voice/parse-intent")
def parse_voice_text_intent(payload: dict, db: Session = Depends(get_db)):
    """Parse natural text spoken by the patient in Hindi, Marathi, or English."""
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
    """Accepts uploaded audio, transcribes, and extracts intent."""
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


@router.api_route("/voice/tts", methods=["GET", "HEAD"])
async def get_speech_audio(
    text: str = Query(..., min_length=1, max_length=1000),
    language: str = Query(default="hi"),
    voice: str | None = Query(default=None),
):
    """Neural text-to-speech audio endpoint."""
    audio_data = await synthesize_speech_edge(text, language=language, voice=voice)
    if not audio_data:
        raise HTTPException(status_code=500, detail="Speech synthesis failed or offline")

    return Response(
        content=audio_data,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": 'inline; filename="speech.mp3"',
            "Accept-Ranges": "bytes",
        },
    )
