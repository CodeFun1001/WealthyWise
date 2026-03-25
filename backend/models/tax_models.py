"""
backend/models/tax_models.py
All Pydantic schemas for the Tax Wizard API.
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, List


# ── Input ──────────────────────────────────────────────────────────────────────

class TaxInput(BaseModel):
    """Manual input OR pre-parsed PDF data — all fields optional except gross."""
    gross_salary: float = Field(..., gt=0, description="Annual gross salary / CTC in ₹")
    hra_received: float = Field(0, ge=0)
    rent_paid: float = Field(0, ge=0)
    is_metro: bool = False

    # 80C components (each individually captured)
    epf: float = Field(0, ge=0)
    elss: float = Field(0, ge=0)
    ppf: float = Field(0, ge=0)
    lic: float = Field(0, ge=0)
    home_principal: float = Field(0, ge=0)

    # Other deductions
    nps_80ccd1b: float = Field(0, ge=0, description="NPS contribution under 80CCD(1B) — max ₹50K")
    health_insurance_80d: float = Field(0, ge=0, description="Health insurance premium — max ₹25K")
    home_loan_interest: float = Field(0, ge=0, description="Home loan interest — max ₹2L")

    tds_deducted: float = Field(0, ge=0, description="TDS already deducted by employer")

    @validator("gross_salary")
    def gross_must_be_reasonable(cls, v):
        if v > 100_00_00_000:  # 100 Cr cap as sanity check
            raise ValueError("Gross salary seems unreasonably large")
        return v


# ── Parsed PDF output ──────────────────────────────────────────────────────────

class ParsedFormData(BaseModel):
    """Fields extracted from Form 16 PDF."""
    gross_salary: float = 0
    hra_received: float = 0
    tds_deducted: float = 0
    standard_deduction: float = 50000
    sec80C_total: float = 0
    sec80D: float = 0
    nps_80ccd1b: float = 0
    home_loan_interest: float = 0
    confidence: float = Field(0.0, ge=0.0, le=1.0, description="Extraction confidence 0-1")
    parse_method: str = "manual"   # "pdfplumber" | "gemini_vision" | "manual"
    warnings: List[str] = []


# ── Tax calculation results ────────────────────────────────────────────────────

class RegimeTax(BaseModel):
    taxable_income: float
    tax_before_cess: float
    cess: float
    total_tax: float
    effective_rate: float  # percentage
    rebate_87a_applied: bool


class TaxComparison(BaseModel):
    old_regime: RegimeTax
    new_regime: RegimeTax
    better_regime: str          # "old" | "new"
    savings_by_better: float    # ₹ saved by choosing the better regime
    hra_exemption_old: float    # HRA exemption applied in old regime


# ── Deduction suggestions ──────────────────────────────────────────────────────

class DeductionSuggestion(BaseModel):
    section: str              # "80C", "80CCD(1B)", "80D"
    label: str                # human-readable instrument name
    current_amount: float
    max_limit: float
    unused_amount: float
    estimated_tax_saving: float
    recommended_instrument: str   # "ELSS", "NPS Tier-1", "Health Insurance"
    action_tip: str               # one-line actionable advice


# ── News / budget impact ───────────────────────────────────────────────────────

class NewsImpactItem(BaseModel):
    headline: str
    impact_on_user: str
    action_required: str
    urgency: str   # "high" | "medium" | "low"


# ── Step-by-step ITR guidance ──────────────────────────────────────────────────

class ITRStep(BaseModel):
    step_number: int
    portal_section: str        # e.g. "ITR Portal → Income Details → Salary"
    field_name: str
    value_to_enter: str
    instruction: str
    url_hint: str = "https://www.incometax.gov.in/iec/foportal/"


# ── Full response ──────────────────────────────────────────────────────────────

class TaxAnalysisResponse(BaseModel):
    # Data provenance
    input_source: str          # "manual" | "pdf" | "text_paste"
    confidence_score: float    # 0–1 based on data completeness

    # Core results
    parsed_data: ParsedFormData
    tax_comparison: TaxComparison
    deduction_suggestions: List[DeductionSuggestion]

    # AI output
    ai_explanation: str        # Gemini-generated plain-English advice
    ai_action_steps: List[str] # Top 3-5 concrete actions

    # Guidance
    itr_steps: List[ITRStep]   # Step-by-step ITR portal guide

    # News
    news_impacts: List[NewsImpactItem] = []

    # Validation
    validation_warnings: List[str] = []


# ── News endpoint ──────────────────────────────────────────────────────────────

class NewsImpactRequest(BaseModel):
    gross_salary: float
    better_regime: str
    sec80C: float = 0
    nps: float = 0


class NewsImpactResponse(BaseModel):
    impacts: List[NewsImpactItem]
    summary: str