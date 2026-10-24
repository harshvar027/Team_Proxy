"""
Baari — app/simulation.py
Discrete-event simulation engine comparing OPD crowding and wait times
with vs. without Baari. Fully deterministic given a random seed.
"""

import random
from typing import Dict, Any


def run_opd_simulation(
    patients_per_day: int = 100,
    num_doctors: int = 3,
    follow_rate: float = 0.7,
    seed: int = 42,
) -> Dict[str, Any]:
    """
    Simulate a day at an Indian government hospital OPD.
    Baseline (Without Baari):
      - 75% of patients arrive between 4:00 AM and 7:30 AM to secure early tokens.
      - 25% arrive between 7:30 AM and 11:00 AM.
      - Doctors start seeing patients at 8:00 AM (minute 480).
      - Hall crowd reaches massive peaks before doors open.

    With Baari:
      - Patients receive a slot estimate.
      - follow_rate fraction of patients arrive 15 minutes before their estimated slot.
      - (1 - follow_rate) fraction of patients continue arriving early (habit/walk-in).
      - Doctors still start at 8:00 AM.
      - Waiting hall congestion is smoothed and drastically reduced.
    """
    rng = random.Random(seed)

    # 1. Generate patient consultation durations (log-normal or normal around 8 mins)
    service_durations = [
        max(3.0, min(20.0, rng.gauss(8.0, 2.5)))
        for _ in range(patients_per_day)
    ]

    # Doctor shift starts at 8:00 AM (minute 480) and runs until done or 2:30 PM
    OPD_START_MIN = 480  # 8:00 AM

    # --- BASELINE SIMULATION ---
    # Arrival times in minutes from midnight (4:00 AM = 240, 8:00 AM = 480, etc.)
    baseline_arrivals = []
    for _ in range(patients_per_day):
        if rng.random() < 0.75:
            # Pre-dawn rush: between 4:00 AM (240) and 7:45 AM (465)
            arr = rng.uniform(240, 465)
        else:
            # Morning stragglers: 7:45 AM (465) to 11:00 AM (660)
            arr = rng.uniform(465, 660)
        baseline_arrivals.append(arr)

    # Patients queued in order of arrival
    baseline_patients = sorted(
        [{"id": i, "arr": baseline_arrivals[i], "dur": service_durations[i]} for i in range(patients_per_day)],
        key=lambda x: x["arr"],
    )

    # Doctors availability simulation (start at 8:00 AM)
    doc_free_at = [float(OPD_START_MIN)] * num_doctors
    baseline_waits = []
    baseline_departures = []

    for p in baseline_patients:
        # First available doctor
        earliest_doc_idx = min(range(num_doctors), key=lambda d: doc_free_at[d])
        service_start = max(p["arr"], doc_free_at[earliest_doc_idx])
        service_end = service_start + p["dur"]
        doc_free_at[earliest_doc_idx] = service_end

        wait_time = service_start - p["arr"]
        baseline_waits.append(wait_time)
        baseline_departures.append((p["arr"], service_end))

    # --- BAARI SIMULATION ---
    # Expected service times calculated by the algorithm
    avg_service = 8.0
    baari_arrivals = []

    for i in range(patients_per_day):
        baseline_arr = baseline_arrivals[i]
        # Predicted start time for patient i if doctors work at average pace:
        predicted_start = OPD_START_MIN + (i * avg_service) / num_doctors

        if rng.random() < follow_rate:
            # Compliant patient arrives ~15 min before predicted slot
            # (never earlier than 7:45 AM)
            intended_arrival = max(465.0, predicted_start - 15.0)
            # Add minor travel jitter (+/- 5 mins)
            actual_arr = intended_arrival + rng.uniform(-5.0, 5.0)
        else:
            # Non-compliant patient arrives at old pre-dawn baseline time
            actual_arr = baseline_arr

        baari_arrivals.append(actual_arr)

    # In Baari, token sequence is established when requested.
    # When doctors call next, tokens are served in assigned sequence
    baari_patients = [
        {"id": i, "arr": baari_arrivals[i], "dur": service_durations[i], "token_seq": i}
        for i in range(patients_per_day)
    ]

    doc_free_at = [float(OPD_START_MIN)] * num_doctors
    baari_waits = []
    baari_departures = []

    # Process in token order
    for p in baari_patients:
        earliest_doc_idx = min(range(num_doctors), key=lambda d: doc_free_at[d])
        # If patient arrives after doctor is free, they are called immediately upon arrival
        service_start = max(p["arr"], doc_free_at[earliest_doc_idx])
        service_end = service_start + p["dur"]
        doc_free_at[earliest_doc_idx] = service_end

        # Time physically spent waiting in the hospital hall
        wait_in_hall = max(0.0, service_start - p["arr"])
        baari_waits.append(wait_in_hall)
        baari_departures.append((p["arr"], service_end))

    # --- TIME-SERIES CROWD METRICS (Every 30 mins from 4:00 AM to 2:30 PM) ---
    time_labels = []
    crowd_data = {}

    # 4:00 AM (240) to 2:30 PM (870) in 30-minute intervals
    for m in range(240, 871, 30):
        hours = m // 60
        mins = m % 60
        period = "AM" if hours < 12 else "PM"
        disp_h = hours if hours <= 12 else hours - 12
        if disp_h == 0:
            disp_h = 12
        label = f"{disp_h:02d}:{mins:02d} {period}"
        time_labels.append(label)

        # Baseline count of patients in hall at minute m
        b_count = sum(1 for (arr, dep) in baseline_departures if arr <= m < dep)
        # Baari count of patients in hall at minute m
        a_count = sum(1 for (arr, dep) in baari_departures if arr <= m < dep)

        crowd_data[label] = {
            "baseline": b_count,
            "baari": a_count,
        }

    # Aggregate summaries
    b_avg_wait = round(sum(baseline_waits) / len(baseline_waits), 1)
    a_avg_wait = round(sum(baari_waits) / len(baari_waits), 1)

    b_peak_crowd = max(d["baseline"] for d in crowd_data.values())
    a_peak_crowd = max(d["baari"] for d in crowd_data.values())

    b_total_wait_hours = round(sum(baseline_waits) / 60.0, 1)
    a_total_wait_hours = round(sum(baari_waits) / 60.0, 1)
    hours_saved = round(max(0.0, b_total_wait_hours - a_total_wait_hours), 1)

    wait_reduction_pct = round(max(0.0, (b_avg_wait - a_avg_wait) / b_avg_wait * 100), 1) if b_avg_wait > 0 else 0
    crowd_reduction_pct = round(max(0.0, (b_peak_crowd - a_peak_crowd) / b_peak_crowd * 100), 1) if b_peak_crowd > 0 else 0

    return {
        "baseline": {
            "average_wait_minutes": b_avg_wait,
            "longest_wait_minutes": round(max(baseline_waits), 1),
            "peak_crowd": b_peak_crowd,
            "total_patient_hours": b_total_wait_hours,
        },
        "with_baari": {
            "average_wait_minutes": a_avg_wait,
            "longest_wait_minutes": round(max(baari_waits), 1),
            "peak_crowd": a_peak_crowd,
            "total_patient_hours": a_total_wait_hours,
        },
        "improvement_pct": {
            "wait_time_reduction": wait_reduction_pct,
            "peak_crowd_reduction": crowd_reduction_pct,
            "hours_saved": hours_saved,
        },
        "crowd_over_time": crowd_data,
        "note": f"Discrete-event OPD model based on {patients_per_day} patients, {num_doctors} doctors, and {int(follow_rate * 100)}% adherence.",
    }
