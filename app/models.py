"""
Baari — app/models.py
SQLAlchemy ORM models for hospitals, departments, doctors, users, patients, tokens, and audit logs.
"""

import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date,
    ForeignKey, UniqueConstraint, Index, Text,
)
from sqlalchemy.orm import relationship
from app.database import Base


def _utcnow():
    """Timezone-aware UTC now, avoids the deprecated datetime.utcnow()."""
    return datetime.datetime.now(datetime.UTC)


class Hospital(Base):
    """
    Hospital record with coordinator contact, location, and unique code.
    Used for QR generation and multi-hospital queue scoping.
    """
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    code = Column(String(30), nullable=False, unique=True)
    location = Column(String(255), nullable=False)
    coordinator_name = Column(String(100), nullable=False)
    coordinator_phone = Column(String(30), nullable=False)
    emergency_phone = Column(String(30), nullable=True)
    email = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    departments = relationship("Department", back_populates="hospital", lazy="selectin")
    users = relationship("User", back_populates="hospital", lazy="selectin")
    tokens = relationship("Token", back_populates="hospital", lazy="dynamic")


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    # Short code used in token numbers, e.g. "G" for General
    code = Column(String(10), nullable=False, unique=True)
    # Exponential moving average of service minutes; updated after each visit
    avg_service_minutes = Column(Float, nullable=False, default=8.0)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)

    hospital = relationship("Hospital", back_populates="departments")
    doctors = relationship("Doctor", back_populates="department", lazy="selectin")
    tokens = relationship("Token", back_populates="department", lazy="dynamic")
    staff_users = relationship("User", back_populates="department", lazy="dynamic")


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    active = Column(Boolean, nullable=False, default=True)

    department = relationship("Department", back_populates="doctors")
    service_logs = relationship("ServiceLog", back_populates="doctor", lazy="dynamic")


class User(Base):
    """Staff, hospital admin, or patient user."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)  # "hospital", "patient", "staff", "admin"
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    full_name = Column(String(100), nullable=True)
    phone = Column(String(30), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=False)
    failed_logins = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    last_login = Column(DateTime, nullable=True)

    hospital = relationship("Hospital", back_populates="users")
    department = relationship("Department", back_populates="staff_users")
    issued_tokens = relationship("Token", back_populates="issued_by_user", lazy="dynamic")
    audit_entries = relationship("AuditLog", back_populates="actor", lazy="dynamic")


class Patient(Base):
    """Minimal patient record — name and optional phone/email."""
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    language = Column(String(10), nullable=False, default="en")  # en, hi, mr

    tokens = relationship("Token", back_populates="patient", lazy="dynamic")


class Token(Base):
    """
    A queue token for one patient visit in one department on one day.
    Priority classes:
      - emergency: Level 1 (immediate attention)
      - daily_life: Level 2 (urgent daily life problem / high fever / severe pain)
      - routine: Level 3 (routine checkup / standard consult)
    """
    __tablename__ = "tokens"
    __table_args__ = (
        UniqueConstraint("department_id", "service_date", "number", name="uq_dept_date_number"),
        Index("ix_tokens_dept_status_created", "department_id", "status", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    number = Column(Integer, nullable=False)
    service_date = Column(Date, nullable=False, default=datetime.date.today)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    priority_class = Column(String(20), nullable=False, default="routine")  # emergency, daily_life, routine (legacy: priority, normal)
    priority_reason = Column(String(255), nullable=True)
    symptoms = Column(Text, nullable=True)  # AI triage extracted reason/symptoms
    status = Column(String(20), nullable=False, default="waiting")  # waiting, called, done, no_show
    pin_hash = Column(String(255), nullable=False)  # argon2id hash of 4-digit PIN
    issued_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL = self-service
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    called_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    hospital = relationship("Hospital", back_populates="tokens")
    department = relationship("Department", back_populates="tokens")
    patient = relationship("Patient", back_populates="tokens")
    issued_by_user = relationship("User", back_populates="issued_tokens")
    service_logs = relationship("ServiceLog", back_populates="token", lazy="selectin")


class ServiceLog(Base):
    """Records which doctor saw a token and how long it took."""
    __tablename__ = "service_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    started_at = Column(DateTime, nullable=False, default=_utcnow)
    ended_at = Column(DateTime, nullable=True)

    token = relationship("Token", back_populates="service_logs")
    doctor = relationship("Doctor", back_populates="service_logs")


class AuditLog(Base):
    """
    Immutable audit trail. Logs every security and operational event.
    """
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_timestamp", "timestamp"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, nullable=False, default=_utcnow)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_role = Column(String(20), nullable=False, default="anonymous")
    action = Column(String(100), nullable=False)
    details = Column(Text, nullable=True)  # JSON string with event-specific data

    actor = relationship("User", back_populates="audit_entries")


class Setting(Base):
    """Key-value store for runtime settings (arrival buffer, thresholds, etc.)."""
    __tablename__ = "settings"

    key = Column(String(100), primary_key=True)
    value = Column(String(255), nullable=False)
