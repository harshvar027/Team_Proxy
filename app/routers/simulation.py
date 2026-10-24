"""
Baari — app/routers/simulation.py
Discrete-event simulation endpoint for hospital administrators and event judges.
"""

from fastapi import APIRouter
from app.schemas import SimulationRequest, SimulationResult
from app.simulation import run_opd_simulation

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.post("/run", response_model=SimulationResult)
def run_simulation(body: SimulationRequest):
    """
    Run the discrete-event OPD crowd model comparing baseline (pre-dawn rush)
    against Baari's arrival window guidance.
    """
    result = run_opd_simulation(
        patients_per_day=body.patients_per_day,
        num_doctors=body.num_doctors,
        follow_rate=body.follow_rate,
        seed=body.seed,
    )
    return result
