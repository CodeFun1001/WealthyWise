"""
backend/utils/validators.py
Input validation, sanity checks, and prompt injection prevention.
"""
import re
from typing import Tuple, List


INJECTION_PATTERNS = [
    r"ignore\s+(previous|above|all)\s+instructions",
    r"system\s*prompt",
    r"jailbreak",
    r"act\s+as\s+(dan|an?\s+ai\s+without)",
    r"<\s*script",
    r"you\s+are\s+now",
]


def check_prompt_injection(text: str) -> bool:
    """Returns True if suspicious injection pattern detected."""
    t = text.lower()
    return any(re.search(p, t) for p in INJECTION_PATTERNS)


def sanitize_string(s: str, max_len: int = 500) -> str:
    """Strip dangerous characters, limit length."""
    s = re.sub(r"[<>\"'`{}\\]", "", s)
    return s[:max_len].strip()


def validate_tax_input(data: dict) -> Tuple[bool, List[str]]:
    """
    Returns (is_valid, list_of_warnings).
    Never raises — always returns warnings for the UI.
    """
    warnings = []
    gross = float(data.get("gross_salary", 0))

    if gross <= 0:
        return False, ["Gross salary must be greater than zero."]

    tds = float(data.get("tds_deducted", 0))
    if tds > gross:
        warnings.append("TDS seems higher than gross salary — please verify.")

    sec80C = (
        float(data.get("epf", 0)) +
        float(data.get("elss", 0)) +
        float(data.get("ppf", 0)) +
        float(data.get("lic", 0)) +
        float(data.get("home_principal", 0))
    )
    if sec80C > 300_000:
        warnings.append("80C investments seem unusually high — system will cap at ₹1,50,000.")

    nps = float(data.get("nps_80ccd1b", 0))
    if nps > 100_000:
        warnings.append("NPS contribution unusually high — 80CCD(1B) cap is ₹50,000.")

    hra = float(data.get("hra_received", 0))
    if hra > gross * 0.6:
        warnings.append("HRA seems disproportionately high — please verify with Form 16.")

    return True, warnings


def confidence_from_completeness(data: dict) -> float:
    """Score 0-1 based on how many key fields are filled."""
    key_fields = ["gross_salary", "hra_received", "tds_deducted", "epf",
                  "nps_80ccd1b", "health_insurance_80d"]
    filled = sum(1 for f in key_fields if float(data.get(f, 0)) > 0)
    return round(filled / len(key_fields), 2)