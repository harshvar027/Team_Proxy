"""
Baari — app/models.py
SQLAlchemy ORM models for all 8 tables.
No hard deletes — use `active` flags or `status` columns.
"""

import datetime
from functools import partial
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date,
    ForeignKey, UniqueConstraint, Index, Text,
)
from sqlalchemy.orm import relationship
from app.database import Base


def _utcnow():
    """Timezone-aware UTC now, avoids the deprecated datetime.utcnow()."""
    return datetime.datetime.now(datetime.UTC)


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    # Short code used in token numbers, e.g. "G" for General
    code = Column(String(10), nullable=False, unique=True)
    # Exponential moving average of service minutes; updated after each visit
    avg_service_minutes = Column(Float, nullable=False, default=8.0)

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
    """Staff or admin user. Patients do NOT have user accounts."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(10), nullable=False)  # "staff" or "admin"
    # Staff are bound to exactly one department; admin has NULL
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=True)
    failed_logins = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    last_login = Column(DateTime, nullable=True)

    department = relationship("Department", back_populates="staff_users")
    issued_tokens = relationship("Token", back_populates="issued_by_user", lazy="dynamic")
    audit_entries = relationship("AuditLog", back_populates="actor", lazy="dynamic")


class Patient(Base):
    """Minimal patient record — name and optional phone only. No health data."""
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), nullable=True)
    language = Column(String(5), nullable=False, default="en")  # en, hi, mr

    tokens = relationship("Token", back_populates="patient", lazy="dynamic")


class Token(Base):
    """
    A queue token for one patient visit in one department on one day.
    Token numbers restart daily per department, formatted like G-07.
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
    priority_class = Column(String(20), nullable=False, default="normal")  # normal, priority, emergency
    priority_reason = Column(String(255), nullable=True)  # required if priority_class != "normal"
    status = Column(String(20), nullable=False, default="waiting")  # waiting, called, done, no_show
    pin_hash = Column(String(255), nullable=False)  # argon2id hash of 4-digit PIN
    issued_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # NULL = self-service
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    called_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

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
    actor_user_id is NULL for unauthenticated actions (failed login of unknown user).
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
