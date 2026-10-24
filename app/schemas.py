"""
Baari — app/schemas.py
Pydantic request/response schemas with strict validation.
"""

from pydantic import BaseModel, Field, field_validator
from datetime import datetime, date
from typing import Optional


# ── Auth ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class LoginResponse(BaseModel):
    message: str
    role: str
    must_change_password: bool
    username: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class ErrorResponse(BaseModel):
    detail: str


# ── Departments ────────────────────────────────────────────────────────────

class DepartmentOut(BaseModel):
    id: int
    name: str
    code: str
    avg_service_minutes: float

    model_config = {"from_attributes": True}


class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=10)
    avg_service_minutes: float = Field(default=8.0, ge=1.0, le=60.0)


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
    active: bool
    must_change_password: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(..., min_length=8, max_length=128)
    role: str = Field(..., pattern=r"^(staff|admin)$")
    department_id: Optional[int] = None

    @field_validator("department_id")
    @classmethod
    def staff_needs_department(cls, v, info):
        # Validation at schema level; also enforced in the endpoint
        return v


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


# ── Tokens (patient queue) ────────────────────────────────────────────────

class TokenRequest(BaseModel):
    """Patient requests a new token."""
    name: str = Field(..., min_length=1, max_length=100)
    department_id: int
    phone: Optional[str] = Field(default=None, max_length=20)
    language: str = Field(default="en", pattern=r"^(en|hi|mr)$")


class TokenIssueByStaff(BaseModel):
    """Staff issues a walk-in token."""
    name: str = Field(..., min_length=1, max_length=100)
    department_id: int
    phone: Optional[str] = Field(default=None, max_length=20)
    language: str = Field(default="en", pattern=r"^(en|hi|mr)$")
    priority_class: str = Field(default="normal", pattern=r"^(normal|priority|emergency)$")
    priority_reason: Optional[str] = Field(default=None, max_length=255)

    @field_validator("priority_reason")
    @classmethod
    def reason_required_for_priority(cls, v, info):
        pc = info.data.get("priority_class", "normal")
        if pc != "normal" and not v:
            raise ValueError("priority_reason is required when priority_class is not normal")
        return v


class TokenOut(BaseModel):
    id: int
    token_number: str  # formatted like "G-07"
    service_date: date
    department_id: int
    department_name: str
    patient_name: str
    phone_masked: Optional[str] = None  # last 4 digits only
    priority_class: str
    priority_reason: Optional[str] = None
    status: str
    pin: Optional[str] = None  # only returned at creation time
    created_at: datetime
    called_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    wait_estimate_min: Optional[float] = None  # lower bound in minutes
    wait_estimate_max: Optional[float] = None  # upper bound in minutes
    arrive_by: Optional[str] = None  # formatted time string or "Come now"
    position_in_queue: Optional[int] = None
    issued_by_staff: bool = False

    model_config = {"from_attributes": True}


class TokenLookupRequest(BaseModel):
    """Patient checks their status with token number + PIN."""
    token_number: str = Field(..., min_length=1, max_length=20)
    pin: str = Field(..., min_length=4, max_length=4)


class SetPriorityRequest(BaseModel):
    priority_class: str = Field(..., pattern=r"^(normal|priority|emergency)$")
    priority_reason: Optional[str] = Field(default=None, max_length=255)

    @field_validator("priority_reason")
    @classmethod
    def reason_required(cls, v, info):
        pc = info.data.get("priority_class", "normal")
        if pc != "normal" and not v:
            raise ValueError("priority_reason is required when priority_class is not normal")
        return v


# ── Queue board (staff view) ──────────────────────────────────────────────

class QueueItem(BaseModel):
    token_id: int
    token_number: str
    patient_name: str
    phone_masked: Optional[str] = None
    priority_class: str
    priority_reason: Optional[str] = None
    status: str
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
    crowd_over_time: dict  # {time_label: {baseline: int, baari: int}}
    note: str = "Simulated data. Results depend on how many people follow the guidance."
