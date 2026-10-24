"""
Baari — app/schemas.py
Pydantic request/response schemas with strict validation.
Includes Hospital registration, 3-tier patient priority, and AI triage schemas.
"""

from pydantic import BaseModel, Field, field_validator
from datetime import datetime, date
from typing import Optional


# ── Auth & Registration ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)
    role: Optional[str] = Field(default=None, pattern=r"^(patient|hospital|staff|admin)?$")


class RegisterRequest(BaseModel):
    """Register either a Patient or a Hospital administrator."""
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(..., pattern=r"^(patient|hospital)$")
    full_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=30)
    
    # Hospital specific fields (required if role == "hospital")
    hospital_name: Optional[str] = Field(default=None, max_length=150)
    location: Optional[str] = Field(default=None, max_length=255)
    coordinator_name: Optional[str] = Field(default=None, max_length=100)
    coordinator_phone: Optional[str] = Field(default=None, max_length=30)
    emergency_phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=100)


class LoginResponse(BaseModel):
    message: str
    role: str
    must_change_password: bool
    username: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    coordinator_phone: Optional[str] = None
    full_name: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=6, max_length=128)


class ErrorResponse(BaseModel):
    detail: str


# ── Hospital ──────────────────────────────────────────────────────────────

class HospitalCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    location: str = Field(..., min_length=2, max_length=255)
    coordinator_name: str = Field(..., min_length=2, max_length=100)
    coordinator_phone: str = Field(..., min_length=5, max_length=30)
    emergency_phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=1000)


class HospitalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    location: Optional[str] = Field(default=None, max_length=255)
    coordinator_name: Optional[str] = Field(default=None, max_length=100)
    coordinator_phone: Optional[str] = Field(default=None, max_length=30)
    emergency_phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = Field(default=None, max_length=1000)


class HospitalOut(BaseModel):
    id: int
    name: str
    code: str
    location: str
    coordinator_name: str
    coordinator_phone: str
    emergency_phone: Optional[str] = None
    email: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime
    qr_code_url: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Departments ────────────────────────────────────────────────────────────

class DepartmentOut(BaseModel):
    id: int
    name: str
    code: str
    avg_service_minutes: float
    hospital_id: Optional[int] = None

    model_config = {"from_attributes": True}


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=10)
    avg_service_minutes: float = Field(default=8.0, ge=1.0, le=60.0)
    hospital_id: Optional[int] = None


# ── Doctors ────────────────────────────────────────────────────────────────

class DoctorOut(BaseModel):
    id: int
    name: str
    department_id: int
    active: bool

    model_config = {"from_attributes": True}


class DoctorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    department_id: int
    active: bool = True


# ── Users (admin management) ──────────────────────────────────────────────

class UserOut(BaseModel):
    id: int
    username: str
    role: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    active: bool
    must_change_password: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(..., pattern=r"^(hospital|patient|staff|admin)$")
    department_id: Optional[int] = None
    hospital_id: Optional[int] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128)


# ── Tokens (patient queue) ────────────────────────────────────────────────

class TokenRequest(BaseModel):
    """Patient requests a new token (self-service, hospital QR scan, or AI triage)."""
    name: str = Field(..., min_length=1, max_length=100)
    department_id: int
    hospital_id: Optional[int] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=100)
    priority_class: str = Field(default="routine", pattern=r"^(emergency|daily_life|routine|normal|priority)$")
    priority_reason: Optional[str] = Field(default=None, max_length=255)
    symptoms: Optional[str] = Field(default=None, max_length=500)
    hospital_code: Optional[str] = Field(default=None, max_length=50)
    language: str = Field(default="en", pattern=r"^(en|hi|mr|ta|te|bn)$")


class TokenIssueByStaff(BaseModel):
    """Staff or hospital admin issues a walk-in / emergency token."""
    name: str = Field(..., min_length=1, max_length=100)
    department_id: int
    hospital_id: Optional[int] = None
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=100)
    language: str = Field(default="en", pattern=r"^(en|hi|mr|ta|te|bn)$")
    priority_class: str = Field(default="routine", pattern=r"^(emergency|daily_life|routine|normal|priority)$")
    priority_reason: Optional[str] = Field(default=None, max_length=255)
    symptoms: Optional[str] = Field(default=None, max_length=500)


class TokenOut(BaseModel):
    id: int
    token_number: str  # formatted like "G-07"
    service_date: date
    department_id: int
    department_name: str
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    hospital_location: Optional[str] = None
    coordinator_name: Optional[str] = None
    coordinator_phone: Optional[str] = None
    emergency_phone: Optional[str] = None
    patient_name: str
    phone_masked: Optional[str] = None
    patient_email: Optional[str] = None
    priority_class: str
    priority_reason: Optional[str] = None
    symptoms: Optional[str] = None
    status: str
    pin: Optional[str] = None
    created_at: datetime
    called_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    wait_estimate_min: Optional[float] = None
    wait_estimate_max: Optional[float] = None
    arrive_by: Optional[str] = None
    position_in_queue: Optional[int] = None
    issued_by_staff: bool = False

    model_config = {"from_attributes": True}


class TokenLookupRequest(BaseModel):
    """Patient checks status with token number + PIN."""
    token_number: str = Field(..., min_length=1, max_length=40)
    pin: str = Field(..., min_length=4, max_length=4)


class SetPriorityRequest(BaseModel):
    priority_class: str = Field(..., pattern=r"^(emergency|daily_life|routine|normal|priority)$")
    priority_reason: Optional[str] = Field(default=None, max_length=255)
    department_id: Optional[int] = None


# ── AI Triage ─────────────────────────────────────────────────────────────

class AITriageRequest(BaseModel):
    text: str = Field(..., min_length=2, max_length=1000)
    language: str = Field(default="en", pattern=r"^(en|hi|mr)$")
    hospital_id: Optional[int] = None


class AITriageResponse(BaseModel):
    detected_name: Optional[str] = None
    symptoms: str
    priority_class: str  # "emergency", "daily_life", "routine"
    priority_label: str  # e.g. "Emergency / Critical"
    suggested_department_code: str
    suggested_department_id: Optional[int] = None
    suggested_department_name: Optional[str] = None
    triage_reason: str
    confidence: float = 0.95


# ── Queue board (Hospital / Staff view) ───────────────────────────────────

class QueueItem(BaseModel):
    token_id: int
    token_number: str
    patient_name: str
    phone_masked: Optional[str] = None
    priority_class: str
    priority_reason: Optional[str] = None
    symptoms: Optional[str] = None
    status: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    created_at: datetime
    called_at: Optional[datetime] = None
    wait_estimate_min: Optional[float] = None
    wait_estimate_max: Optional[float] = None
    position_in_queue: Optional[int] = None
    is_expected_in_hall: bool = False


class QueueBoard(BaseModel):
    department_id: int
    department_name: str
    department_code: str
    hospital_id: Optional[int] = None
    hospital_name: Optional[str] = None
    coordinator_name: Optional[str] = None
    coordinator_phone: Optional[str] = None
    active_doctors: int
    total_doctors: int
    waiting_count: int
    called_count: int
    done_today: int
    avg_service_minutes: float
    queue: list[QueueItem]
    consider_opening_counter: bool = False
    estimated_improvement_minutes: Optional[float] = None
    expected_in_hall_count: int = 0


# ── Audit log ─────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    timestamp: datetime
    actor_user_id: Optional[int] = None
    actor_username: Optional[str] = None
    actor_role: str
    action: str
    details: Optional[str] = None

    model_config = {"from_attributes": True}


class AuditLogFilter(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    actor: Optional[str] = None
    action: Optional[str] = None
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=50, ge=1, le=200)


# ── Daily summary ─────────────────────────────────────────────────────────

class DailySummary(BaseModel):
    date: date
    patients_served: int
    average_wait_minutes: float
    longest_wait_minutes: float
    peak_hour: Optional[str] = None
    no_show_count: int
    no_show_rate: float
    by_department: list[dict]


# ── Simulation ─────────────────────────────────────────────────────────────

class SimulationRequest(BaseModel):
    patients_per_day: int = Field(default=100, ge=10, le=500)
    num_doctors: int = Field(default=3, ge=1, le=20)
    follow_rate: float = Field(default=0.7, ge=0.0, le=1.0)
    seed: int = Field(default=42)


class SimulationResult(BaseModel):
    baseline: dict
    with_baari: dict
    improvement_pct: dict
    crowd_over_time: dict
    note: str = "Simulated data. Results depend on how many people follow the guidance."
