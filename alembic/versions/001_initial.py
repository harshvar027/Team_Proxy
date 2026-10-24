"""Initial migration — create all tables.

Revision ID: 001_initial
Revises: None
Create Date: 2024-10-24
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- departments ---
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("code", sa.String(10), nullable=False, unique=True),
        sa.Column("avg_service_minutes", sa.Float, nullable=False, server_default="8.0"),
    )

    # --- doctors ---
    op.create_table(
        "doctors",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("1")),
    )

    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(50), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(10), nullable=False),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id"), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("must_change_password", sa.Boolean, nullable=False, server_default=sa.text("1")),
        sa.Column("failed_logins", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("locked_until", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_login", sa.DateTime, nullable=True),
    )

    # --- patients ---
    op.create_table(
        "patients",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("language", sa.String(5), nullable=False, server_default="en"),
    )

    # --- tokens ---
    op.create_table(
        "tokens",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("number", sa.Integer, nullable=False),
        sa.Column("service_date", sa.Date, nullable=False),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("patient_id", sa.Integer, sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("priority_class", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("priority_reason", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="waiting"),
        sa.Column("pin_hash", sa.String(255), nullable=False),
        sa.Column("issued_by_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("called_at", sa.DateTime, nullable=True),
        sa.Column("finished_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("department_id", "service_date", "number", name="uq_dept_date_number"),
    )
    op.create_index(
        "ix_tokens_dept_status_created",
        "tokens",
        ["department_id", "status", "created_at"],
    )

    # --- service_logs ---
    op.create_table(
        "service_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("token_id", sa.Integer, sa.ForeignKey("tokens.id"), nullable=False),
        sa.Column("doctor_id", sa.Integer, sa.ForeignKey("doctors.id"), nullable=False),
        sa.Column("started_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime, nullable=True),
    )

    # --- audit_logs ---
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("timestamp", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("actor_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("actor_role", sa.String(20), nullable=False, server_default="anonymous"),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("details", sa.Text, nullable=True),
    )
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])

    # --- settings ---
    op.create_table(
        "settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.String(255), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("settings")
    op.drop_index("ix_audit_logs_timestamp", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_table("service_logs")
    op.drop_index("ix_tokens_dept_status_created", table_name="tokens")
    op.drop_table("tokens")
    op.drop_table("patients")
    op.drop_table("users")
    op.drop_table("doctors")
    op.drop_table("departments")
