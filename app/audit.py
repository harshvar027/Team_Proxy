"""
Baari — app/audit.py
Audit-log helper. Every security and operational event goes here.
"""

import json
import datetime
from sqlalchemy.orm import Session
from app.models import AuditLog


def log_event(
    db: Session,
    action: str,
    *,
    actor_user_id: int | None = None,
    actor_role: str = "anonymous",
    details: dict | None = None,
) -> None:
    """
    Write an audit log entry. Called after every significant event:
    login, failed_login, logout, account_created, password_reset,
    priority_change, no_show, manager_override, token_issued, etc.
    """
    entry = AuditLog(
        timestamp=datetime.datetime.now(datetime.UTC),
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        details=json.dumps(details, default=str) if details else None,
    )
    db.add(entry)
    # Don't commit here — let the caller's transaction handle it.
    # If the caller commits, this is included. If it rolls back, so does the log.
    # For failed login attempts where we want to guarantee the log, the caller
    # should commit explicitly.
