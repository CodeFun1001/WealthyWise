"""
backend/services/deduction_engine.py
Finds missed deduction opportunities and calculates exact tax savings.
"""
from typing import List
from models.tax_models import DeductionSuggestion


MAX_80C       = 150_000
MAX_NPS       = 50_000
MAX_80D       = 25_000
MAX_HOME_INT  = 200_000

# Marginal rate used for rough saving estimate (30% slab is most common for salaried > 10L)
DEFAULT_MARGINAL_RATE = 0.30


def _saving(unused: float, marginal_rate: float = DEFAULT_MARGINAL_RATE) -> float:
    return round(unused * marginal_rate * 1.04, 2)  # include 4% cess


def find_missed_deductions(
    gross_salary: float,
    sec80C: float,
    nps: float,
    health: float,
    home_interest: float,
) -> List[DeductionSuggestion]:

    suggestions: List[DeductionSuggestion] = []

    # Estimate marginal rate (simplified — a full implementation would use taxable income)
    if gross_salary > 10_00_000:
        marginal = 0.30
    elif gross_salary > 5_00_000:
        marginal = 0.20
    else:
        marginal = 0.05

    # ── 80C ───────────────────────────────────────────────────────────────────
    if sec80C < MAX_80C:
        unused = MAX_80C - sec80C
        suggestions.append(DeductionSuggestion(
            section="80C",
            label="ELSS / PPF / LIC Premium",
            current_amount=sec80C,
            max_limit=MAX_80C,
            unused_amount=unused,
            estimated_tax_saving=_saving(unused, marginal),
            recommended_instrument="ELSS Mutual Fund (3-year lock-in, market-linked returns)",
            action_tip=f"Invest ₹{int(unused):,} more in ELSS this month to max your 80C deduction.",
        ))

    # ── NPS 80CCD(1B) ─────────────────────────────────────────────────────────
    if nps < MAX_NPS:
        unused = MAX_NPS - nps
        suggestions.append(DeductionSuggestion(
            section="80CCD(1B)",
            label="NPS Tier-1 Contribution",
            current_amount=nps,
            max_limit=MAX_NPS,
            unused_amount=unused,
            estimated_tax_saving=_saving(unused, marginal),
            recommended_instrument="NPS Tier-1 Account (available via NSDL CRA or Aadhaar-based eNPS)",
            action_tip=f"Open/top-up NPS Tier-1 with ₹{int(unused):,} — this is OVER and ABOVE 80C limit.",
        ))

    # ── 80D ───────────────────────────────────────────────────────────────────
    if health < MAX_80D:
        unused = MAX_80D - health
        suggestions.append(DeductionSuggestion(
            section="80D",
            label="Health Insurance Premium",
            current_amount=health,
            max_limit=MAX_80D,
            unused_amount=unused,
            estimated_tax_saving=_saving(unused, marginal),
            recommended_instrument="Family Floater Health Insurance (Star Health / HDFC Ergo / Niva Bupa)",
            action_tip=f"Buy/upgrade health insurance worth ₹{int(unused):,} premium to claim full 80D.",
        ))

    # ── 24(b) Home Loan Interest ───────────────────────────────────────────────
    if 0 < home_interest < MAX_HOME_INT:
        unused = MAX_HOME_INT - home_interest
        suggestions.append(DeductionSuggestion(
            section="24(b)",
            label="Home Loan Interest (Old Regime only)",
            current_amount=home_interest,
            max_limit=MAX_HOME_INT,
            unused_amount=unused,
            estimated_tax_saving=_saving(unused, marginal),
            recommended_instrument="Claim remaining ₹2L limit via additional property or ensure correct certificate",
            action_tip="Get interest certificate from your bank and ensure full amount is claimed.",
        ))

    return suggestions