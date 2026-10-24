"""
Baari — tests/test_queue.py
Tests for queue ordering, wait estimation, EMA updates, and 'Come now' threshold.
"""

import datetime
from app.queue_logic import (
    format_token_number,
    parse_token_number,
    calculate_wait_estimate,
    update_department_ema,
    check_capacity_recommendation,
)
from app.models import Department, Token


def test_token_number_formatting():
    assert format_token_number("G", 1) == "G-01"
    assert format_token_number("O", 7) == "O-07"
    assert format_token_number("P", 123) == "P-123"

    code, num = parse_token_number("G-07")
    assert code == "G"
    assert num == 7

    code, num = parse_token_number("invalid")
    assert code is None
    assert num is None


def test_wait_estimate_first_in_queue():
    # Position 1: next to be called -> 0 minutes ahead -> arrive by 'Come now'
    est = calculate_wait_estimate(
        position_in_queue=1,
        avg_service_minutes=8.0,
        active_doctors=2,
        arrival_buffer_minutes=15,
    )
    assert est["arrive_by"] == "Come now"
    assert est["is_expected_in_hall"] is True
    assert est["wait_estimate_min"] == 0.0


def test_wait_estimate_far_in_queue():
    # Position 11: 10 people ahead with 2 doctors (5 intervals * 8 min = 40 min base wait)
    est = calculate_wait_estimate(
        position_in_queue=11,
        avg_service_minutes=8.0,
        active_doctors=2,
        arrival_buffer_minutes=15,
    )
    assert est["arrive_by"] != "Come now"
    assert est["is_expected_in_hall"] is False
    assert est["wait_estimate_min"] >= 30.0
    assert est["wait_estimate_max"] >= est["wait_estimate_min"]


def test_update_department_ema(db, seed_data):
    dept = seed_data["dept_g"]
    assert dept.avg_service_minutes == 8.0

    # Patient finished in 14 minutes. Alpha is 0.2
    # New avg = 0.8 * 8.0 + 0.2 * 14.0 = 6.4 + 2.8 = 9.2
    new_avg = update_department_ema(db, dept, actual_service_minutes=14.0, alpha=0.2)
    assert new_avg == 9.2
    assert dept.avg_service_minutes == 9.2


def test_capacity_recommendation():
    # 2 active doctors, 3 total doctors.
    # 15 patients waiting > 2 * 6 = 12 threshold -> recommend opening 3rd doctor
    should_open, savings = check_capacity_recommendation(
        waiting_count=15,
        active_doctors=2,
        total_doctors=3,
        avg_service_minutes=8.0,
    )
    assert should_open is True
    assert savings is not None
    assert savings > 0

    # If all doctors are already active, cannot recommend opening more
    should_open, _ = check_capacity_recommendation(
        waiting_count=20,
        active_doctors=3,
        total_doctors=3,
        avg_service_minutes=8.0,
    )
    assert should_open is False
