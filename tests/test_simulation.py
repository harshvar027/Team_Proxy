"""
Baari — tests/test_simulation.py
Tests for discrete-event OPD simulation:
- Reproducibility with fixed random seed
- Baari significantly reduces hall crowding and wait times
"""

from app.simulation import run_opd_simulation


def test_simulation_reproducibility():
    sim1 = run_opd_simulation(patients_per_day=50, num_doctors=2, follow_rate=0.7, seed=42)
    sim2 = run_opd_simulation(patients_per_day=50, num_doctors=2, follow_rate=0.7, seed=42)

    assert sim1["baseline"]["average_wait_minutes"] == sim2["baseline"]["average_wait_minutes"]
    assert sim1["with_baari"]["average_wait_minutes"] == sim2["with_baari"]["average_wait_minutes"]
    assert sim1["improvement_pct"]["wait_time_reduction"] == sim2["improvement_pct"]["wait_time_reduction"]


def test_baari_improves_metrics():
    sim = run_opd_simulation(patients_per_day=100, num_doctors=3, follow_rate=0.8, seed=123)

    baseline_wait = sim["baseline"]["average_wait_minutes"]
    baari_wait = sim["with_baari"]["average_wait_minutes"]

    baseline_peak = sim["baseline"]["peak_crowd"]
    baari_peak = sim["with_baari"]["peak_crowd"]

    # Average wait in waiting hall must be significantly lower with Baari
    assert baari_wait < baseline_wait
    # Peak crowd standing in hall must be significantly lower with Baari
    assert baari_peak < baseline_peak
    assert sim["improvement_pct"]["wait_time_reduction"] > 40.0
