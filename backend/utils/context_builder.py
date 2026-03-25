
from models.tax_models import TaxComparison, ParsedFormData
from typing import List


def fmt(n: float) -> str:
    if n >= 1_00_00_000:
        return f"₹{n/1_00_00_000:.2f} Cr"
    elif n >= 1_00_000:
        return f"₹{n/1_00_000:.1f}L"
    elif n >= 1_000:
        return f"₹{n/1_000:.1f}K"
    return f"₹{n:,.0f}"


def build_tax_context(
    parsed: ParsedFormData,
    tax: TaxComparison,
    missed_savings: float = 0,
    input_source: str = "manual",
) -> str:
    """Returns a concise, structured prompt ready for Gemini."""

    lines = [
        "=== INDIAN TAXPAYER PROFILE FY 2024-25 ===",
        f"Data Source: {input_source.upper()} | Confidence: {int(parsed.confidence*100)}%",
        "",
        f"Gross Salary: {fmt(parsed.gross_salary)}",
        f"Standard Deduction Applied: ₹50K (Old) / ₹75K (New)",
        "",
        "TAX CALCULATION RESULTS:",
        f"  Old Regime Tax: {fmt(tax.old_regime.total_tax)} (taxable: {fmt(tax.old_regime.taxable_income)}, eff. rate: {tax.old_regime.effective_rate}%)",
        f"  New Regime Tax: {fmt(tax.new_regime.total_tax)} (taxable: {fmt(tax.new_regime.taxable_income)}, eff. rate: {tax.new_regime.effective_rate}%)",
        f"  87A Rebate — Old: {'YES (zero tax)' if tax.old_regime.rebate_87a_applied else 'No'} | New: {'YES (zero tax)' if tax.new_regime.rebate_87a_applied else 'No'}",
        f"  RECOMMENDED: {tax.better_regime.upper()} REGIME — saves {fmt(tax.savings_by_better)}",
    ]

    if tax.hra_exemption_old > 0:
        lines.append(f"  HRA Exemption (old regime): {fmt(tax.hra_exemption_old)}")

    if missed_savings > 0:
        lines.append(f"\nUNTAPPED DEDUCTIONS: Could save additional {fmt(missed_savings)} with better planning")

    if parsed.warnings:
        lines.append(f"\nWarnings: {'; '.join(parsed.warnings)}")

    return "\n".join(lines)


def build_explain_prompt(context: str) -> str:
    return f"""{context}

As an expert Indian CA, provide:
1. A 2-sentence plain-English explanation of WHY the recommended regime is better
2. Top 3 specific actions they must take before March 31 (with exact amounts)
3. One thing most people miss for their income bracket
Keep total under 200 words. Use ₹ and Indian number format. Be warm and direct."""


def build_itr_guide(tax: TaxComparison, gross: float, ded_sec80c: float, tds: float) -> List[dict]:
    """Generate step-by-step ITR filing instructions."""
    regime = tax.better_regime
    steps = [
        {
            "step_number": 1,
            "portal_section": "incometax.gov.in → e-File → Income Tax Returns → File ITR",
            "field_name": "ITR Form Selection",
            "value_to_enter": "ITR-1 (if salary only) or ITR-2 (if capital gains/multiple sources)",
            "instruction": "Login → click 'e-File' in top menu → 'Income Tax Returns' → 'File ITR'. Select Assessment Year 2025-26.",
            "url_hint": "https://eportal.incometax.gov.in/iec/foservices/#/login",
        },
        {
            "step_number": 2,
            "portal_section": "ITR Portal → Personal Information",
            "field_name": "Tax Regime Selection",
            "value_to_enter": f"{'New Tax Regime (Default)' if regime == 'new' else 'Old Tax Regime'}",
            "instruction": f"Under 'Tax Regime', select {'NEW REGIME' if regime == 'new' else 'OLD REGIME'}. This saves you money based on your profile.",
            "url_hint": "https://eportal.incometax.gov.in",
        },
        {
            "step_number": 3,
            "portal_section": "ITR Portal → Income Details → Salary",
            "field_name": "Gross Salary",
            "value_to_enter": f"₹{gross:,.0f}",
            "instruction": "Enter your gross salary exactly as shown in Form 16 Part B. This number comes from your employer's TDS certificate.",
            "url_hint": "https://eportal.incometax.gov.in",
        },
        {
            "step_number": 4,
            "portal_section": "ITR Portal → Deductions (Chapter VI-A)",
            "field_name": "Section 80C",
            "value_to_enter": f"₹{min(ded_sec80c, 150000):,.0f} (max ₹1,50,000)",
            "instruction": "Enter total of EPF + ELSS + PPF + LIC + Home Loan Principal. Cap is ₹1,50,000. Collect investment proofs (ELSS statement, PPF passbook, LIC receipts).",
            "url_hint": "https://eportal.incometax.gov.in",
        },
        {
            "step_number": 5,
            "portal_section": "ITR Portal → Tax Paid → TDS",
            "field_name": "TDS from Employer (Form 26AS)",
            "value_to_enter": f"₹{tds:,.0f} (verify on Form 26AS)",
            "instruction": "Go to incometax.gov.in → View Form 26AS → verify TDS matches your Form 16 Part A. Any mismatch must be corrected with your employer BEFORE filing.",
            "url_hint": "https://www.incometax.gov.in/iec/foportal/help/how-to-view-form-26as",
        },
        {
            "step_number": 6,
            "portal_section": "ITR Portal → Verify & Submit",
            "field_name": "e-Verify ITR",
            "value_to_enter": "Aadhaar OTP (recommended — instant)",
            "instruction": "After filing, e-verify within 30 days using Aadhaar OTP, Net Banking, or send signed ITR-V to CPC Bengaluru. Without e-verification, your return is not processed.",
            "url_hint": "https://eportal.incometax.gov.in/iec/foservices/#/e-verify-return",
        },
    ]
    return steps