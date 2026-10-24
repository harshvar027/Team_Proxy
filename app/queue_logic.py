"""
Baari — app/queue_logic.py
Deterministic queue ordering, wait estimation, EMA service time update,
and token formatting.
"""

import datetime
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import Token, Department, Doctor, Setting
from app.config import settings


# Priority weights for sorting: lowest number = highest priority
PRIORITY_ORDER = {
    "emergency": 0,
    "priority": 1,
    "normal": 2,
}


def format_token_number(dept_code: str, number: int) -> str:
    """Format token number as e.g. 'G-07'."""
    return f"{dept_code.upper()}-{number:02d}"


def parse_token_number(token_str: str) -> Tuple[Optional[str], Optional[int]]:
    """Parse 'G-07' or 'g-7' into ('G', 7). Returns (None, None) if invalid."""
    try:
        parts = token_str.strip().split("-")
        if len(parts) != 2:
            return None, None
        code = parts[0].strip().upper()
        num = int(parts[1].strip())
        return code, num
    except Exception:
        return None, None


def get_next_token_number(db: Session, department_id: int, service_date: datetime.date) -> int:
    """
    Get the next token number for a department on a given day.
    Caller MUST execute this within an active transaction (e.g. BEGIN IMMEDIATE on SQLite)
    to prevent race conditions.
    """
    max_num = (
        db.query(func.max(Token.number))
        .filter(
            Token.department_id == department_id,
            Token.service_date == service_date,
        )
        .scalar()
    )
    return (max_num or 0) + 1


def get_active_doctors_count(db: Session, department_id: int) -> int:
    """Return count of currently active doctors in a department. At least 1 is assumed."""
    count = (
        db.query(func.count(Doctor.id))
        .filter(Doctor.department_id == department_id, Doctor.active.is_(True))
        .scalar()
    )
    return max(1, count or 1)


def get_waiting_tokens(db: Session, department_id: int, service_date: datetime.date) -> list[Token]:
    """
    Get all tokens in 'waiting' status for today, ordered by priority and creation time:
    1. Emergency (FIFO)
    2. Priority (FIFO)
    3. Normal (FIFO)
    """
    tokens = (
        db.query(Token)
        .filter(
            Token.department_id == department_id,
            Token.service_date == service_date,
            Token.status == "waiting",
        )
        .order_by(Token.created_at.asc())
        .all()
    )

    # Deterministic multi-tier sort: priority first, then creation timestamp
    return sorted(tokens, key=lambda t: (PRIORITY_ORDER.get(t.priority_class, 2), t.created_at))


def calculate_wait_estimate(
    position_in_queue: int,
    avg_service_minutes: float,
    active_doctors: int,
    arrival_buffer_minutes: int = 15,
) -> dict:
    """
    Calculate estimated wait time range and arrival advice based on position in queue.
    position_in_queue: 1-indexed (1 = next to be called, 2 = 1 person ahead, etc.)
    """
    if position_in_queue <= 0:
        return {
            "wait_estimate_min": 0.0,
            "wait_estimate_max": 0.0,
            "arrive_by": "Come now",
            "is_expected_in_hall": True,
        }

    # Number of patients ahead of this token
    people_ahead = max(0, position_in_queue - 1)
    doctors = max(1, active_doctors)
    service_time = max(1.0, avg_service_minutes)

    # Base wait time in minutes: (people ahead * avg service time) / active doctors
    base_wait = (people_ahead * service_time) / doctors

    # Asymmetric confidence interval: visits can take longer (emergencies, complications)
    # lower bound = 80% of base wait; upper bound = 130% + 5 min safety padding
    min_wait = max(0.0, round(base_wait * 0.8, 1))
    max_wait = max(min_wait + 2.0, round(base_wait * 1.3 + 5.0, 1))

    # Advice for arrival:
    # If base wait is less than or equal to arrival buffer, patient should be here now!
    if base_wait <= arrival_buffer_minutes:
        arrive_by = "Come now"
        is_expected = True
    else:
        # Suggested departure/arrival time (now + base_wait - buffer)
        target_minutes = max(0, base_wait - arrival_buffer_minutes)
        now_time = datetime.datetime.now()
        target_time = now_time + datetime.timedelta(minutes=target_minutes)
        arrive_by = target_time.strftime("%I:%M %p")
        is_expected = False

    return {
        "wait_estimate_min": min_wait,
        "wait_estimate_max": max_wait,
        "arrive_by": arrive_by,
        "is_expected_in_hall": is_expected,
    }


def update_department_ema(
    db: Session,
    department: Department,
    actual_service_minutes: float,
    alpha: float = 0.2,
) -> float:
    """
    Update exponential moving average (EMA) of service minutes for a department.
    Clamps actual service time to [1.0, 60.0] minutes to reject outliers.
    """
    clamped_actual = max(1.0, min(60.0, actual_service_minutes))
    old_avg = department.avg_service_minutes or 8.0
    new_avg = round((1.0 - alpha) * old_avg + alpha * clamped_actual, 2)
    department.avg_service_minutes = new_avg
    return new_avg


def check_capacity_recommendation(
    waiting_count: int,
    active_doctors: int,
    total_doctors: int,
    avg_service_minutes: float,
) -> Tuple[bool, Optional[float]]:
    """
    Check if a department should consider opening an additional doctor counter.
    Triggered when queue load exceeds capacity (> 6 patients per active doctor)
    and inactive doctors exist.
    """
    if active_doctors >= total_doctors or active_doctors <= 0:
        return False, None

    # Threshold: queue load is high
    if waiting_count > (active_doctors * 6):
        current_est = (waiting_count * avg_service_minutes) / active_doctors
        improved_est = (waiting_count * avg_service_minutes) / (active_doctors + 1)
        savings = round(current_est - improved_est, 1)
        return True, max(1.0, savings)

    return False, None
