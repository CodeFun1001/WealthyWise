"""
backend/services/tax_calculator.py
Accurate FY 2024-25 (AY 2025-26) Indian income tax calculation.
Handles both Old and New regimes, HRA exemption, 87A rebate, 4% cess.
"""
from models.tax_models import RegimeTax, TaxComparison


# ── Constants ──────────────────────────────────────────────────────────────────

STD_DEDUCTION_OLD = 50_000   # FY2024-25 old regime
STD_DEDUCTION_NEW = 75_000   # Budget 2024 — new regime raised from 50K to 75K

MAX_80C           = 1_50_000
MAX_NPS_80CCD1B   = 50_000
MAX_80D           = 25_000
MAX_HOME_INTEREST = 2_00_000

CESS_RATE         = 0.04


# ── Helpers ────────────────────────────────────────────────────────────────────

def _apply_cess(tax: float) -> float:
    return round(tax * (1 + CESS_RATE), 2)


def _slab_tax_old(taxable: float) -> float:
    """Old regime slab tax (pre-cess, pre-rebate)."""
    if taxable <= 2_50_000:
        return 0
    elif taxable <= 5_00_000:
        return (taxable - 2_50_000) * 0.05
    elif taxable <= 10_00_000:
        return 12_500 + (taxable - 5_00_000) * 0.20
    else:
        return 1_12_500 + (taxable - 10_00_000) * 0.30


def _slab_tax_new(taxable: float) -> float:
    """New regime slab tax FY2024-25 (pre-cess, pre-rebate)."""
    if taxable <= 3_00_000:
        return 0
    elif taxable <= 7_00_000:
        return (taxable - 3_00_000) * 0.05
    elif taxable <= 10_00_000:
        return 20_000 + (taxable - 7_00_000) * 0.10
    elif taxable <= 12_00_000:
        return 50_000 + (taxable - 10_00_000) * 0.15
    elif taxable <= 15_00_000:
        return 80_000 + (taxable - 12_00_000) * 0.20
    else:
        return 1_40_000 + (taxable - 15_00_000) * 0.30


def _rebate_87a(tax: float, taxable: float, regime: str) -> tuple[float, bool]:
    """
    87A rebate:
    - Old regime: full rebate if taxable ≤ ₹5L
    - New regime: full rebate if taxable ≤ ₹7L
    Returns (tax_after_rebate, rebate_applied).
    """
    limit = 7_00_000 if regime == "new" else 5_00_000
    if taxable <= limit:
        return 0.0, True
    return tax, False


def _hra_exemption(gross: float, hra_received: float, rent_paid: float, is_metro: bool) -> float:
    """
    HRA exemption = min of:
      1. Actual HRA received
      2. Actual rent paid − 10% of basic salary
      3. 50% of basic (metro) / 40% of basic (non-metro)
    Assumes basic = 40% of CTC (common Indian payroll norm).
    """
    if hra_received <= 0 or rent_paid <= 0:
        return 0.0
    basic = gross * 0.40
    c1 = hra_received
    c2 = max(rent_paid - 0.10 * basic, 0)
    c3 = basic * (0.50 if is_metro else 0.40)
    return round(min(c1, c2, c3), 2)


def _calc_deductions(
    epf: float, elss: float, ppf: float, lic: float, home_principal: float,
    nps: float, health: float, home_interest: float
) -> dict:
    sec80C = min(epf + elss + ppf + lic + home_principal, MAX_80C)
    nps_d  = min(nps, MAX_NPS_80CCD1B)
    health_d = min(health, MAX_80D)
    home_int = min(home_interest, MAX_HOME_INTEREST)
    return {
        "sec80C": sec80C,
        "nps": nps_d,
        "health": health_d,
        "home_interest": home_int,
        "total": sec80C + nps_d + health_d + home_int,
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def calculate_taxes(
    gross_salary: float,
    hra_received: float = 0,
    rent_paid: float = 0,
    is_metro: bool = False,
    epf: float = 0,
    elss: float = 0,
    ppf: float = 0,
    lic: float = 0,
    home_principal: float = 0,
    nps_80ccd1b: float = 0,
    health_insurance_80d: float = 0,
    home_loan_interest: float = 0,
) -> TaxComparison:

    ded = _calc_deductions(epf, elss, ppf, lic, home_principal,
                           nps_80ccd1b, health_insurance_80d, home_loan_interest)
    hra_exempt = _hra_exemption(gross_salary, hra_received, rent_paid, is_metro)

    # ── OLD REGIME ──────────────────────────────────────────────────────────────
    taxable_old = max(
        gross_salary - STD_DEDUCTION_OLD - ded["total"] - hra_exempt, 0
    )
    raw_tax_old = _slab_tax_old(taxable_old)
    tax_old, rebate_old = _rebate_87a(raw_tax_old, taxable_old, "old")
    cess_old = round(tax_old * CESS_RATE, 2)
    total_old = tax_old + cess_old
    eff_old = round((total_old / gross_salary) * 100, 2) if gross_salary > 0 else 0

    # ── NEW REGIME ──────────────────────────────────────────────────────────────
    taxable_new = max(gross_salary - STD_DEDUCTION_NEW, 0)
    raw_tax_new = _slab_tax_new(taxable_new)
    tax_new, rebate_new = _rebate_87a(raw_tax_new, taxable_new, "new")
    cess_new = round(tax_new * CESS_RATE, 2)
    total_new = tax_new + cess_new
    eff_new = round((total_new / gross_salary) * 100, 2) if gross_salary > 0 else 0

    better = "old" if total_old <= total_new else "new"
    savings = abs(total_old - total_new)

    return TaxComparison(
        old_regime=RegimeTax(
            taxable_income=taxable_old,
            tax_before_cess=tax_old,
            cess=cess_old,
            total_tax=total_old,
            effective_rate=eff_old,
            rebate_87a_applied=rebate_old,
        ),
        new_regime=RegimeTax(
            taxable_income=taxable_new,
            tax_before_cess=tax_new,
            cess=cess_new,
            total_tax=total_new,
            effective_rate=eff_new,
            rebate_87a_applied=rebate_new,
        ),
        better_regime=better,
        savings_by_better=round(savings, 2),
        hra_exemption_old=hra_exempt,
    )