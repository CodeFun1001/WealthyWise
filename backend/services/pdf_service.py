"""
backend/services/pdf_service.py
Form 16 PDF extraction:
  1. Try pdfplumber (text-based PDFs)
  2. Fallback → Gemini Vision (scanned/image PDFs)
Returns ParsedFormData with a confidence score.
"""
import re
import io
import os
import base64
import logging
from typing import Optional

import google.generativeai as genai

from models.tax_models import ParsedFormData

logger = logging.getLogger(__name__)

# ── Gemini setup ───────────────────────────────────────────────────────────────

def _get_gemini_model():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY not set in environment")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.5-flash")


# ── Regex field extractors for Form 16 text ───────────────────────────────────

_FIELD_PATTERNS = {
    "gross_salary": [
        r"(?:gross\s+salary|total\s+salary|salary\s+as\s+per\s+sec\s*17)[\s:₹Rs.]*([0-9,]+)",
        r"(?:income\s+under\s+head\s+salaries)[\s:₹Rs.]*([0-9,]+)",
    ],
    "hra_received": [
        r"(?:house\s+rent\s+allowance|hra)[\s:₹Rs.]*([0-9,]+)",
    ],
    "tds_deducted": [
        r"(?:total\s+tax\s+deducted|tds\s+deducted|tax\s+deducted\s+at\s+source)[\s:₹Rs.]*([0-9,]+)",
        r"(?:amount\s+of\s+tax\s+deducted)[\s:₹Rs.]*([0-9,]+)",
    ],
    "epf": [
        r"(?:provident\s+fund|epf|pf\s+contribution)[\s:₹Rs.]*([0-9,]+)",
    ],
    "sec80D": [
        r"(?:mediclaim|health\s+insurance|80d)[\s:₹Rs.]*([0-9,]+)",
    ],
    "nps_80ccd1b": [
        r"(?:nps|national\s+pension|80ccd)[\s:₹Rs.]*([0-9,]+)",
    ],
    "home_loan_interest": [
        r"(?:home\s+loan\s+interest|interest\s+on\s+housing\s+loan|24.b.)[\s:₹Rs.]*([0-9,]+)",
    ],
}


def _parse_num(s: str) -> float:
    return float(s.replace(",", "").strip())


def _extract_with_regex(text: str) -> dict:
    text_lower = text.lower()
    result = {}
    for field, patterns in _FIELD_PATTERNS.items():
        for pat in patterns:
            m = re.search(pat, text_lower)
            if m:
                try:
                    result[field] = _parse_num(m.group(1))
                    break
                except ValueError:
                    pass
    return result


# ── pdfplumber extraction ──────────────────────────────────────────────────────

def _extract_with_pdfplumber(pdf_bytes: bytes) -> tuple[str, float]:
    """Returns (text, confidence). confidence=0 if nothing extracted."""
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = []
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    pages.append(t)
            text = "\n".join(pages)
        conf = min(len(text) / 2000, 1.0)  # rough heuristic
        return text, conf
    except Exception as e:
        logger.warning(f"pdfplumber failed: {e}")
        return "", 0.0


# ── Gemini Vision fallback ─────────────────────────────────────────────────────

GEMINI_EXTRACT_PROMPT = """
You are a Form 16 parser. Extract ONLY these fields from the document image.
Return JSON with exactly these keys (use 0 for any field not found):
{
  "gross_salary": 0,
  "hra_received": 0,
  "tds_deducted": 0,
  "epf": 0,
  "elss": 0,
  "ppf": 0,
  "lic": 0,
  "sec80D": 0,
  "nps_80ccd1b": 0,
  "home_loan_interest": 0
}
Only return the JSON object. No explanation. All values in rupees (numbers only).
"""


def _extract_with_gemini_vision(pdf_bytes: bytes) -> tuple[dict, float]:
    """Use Gemini Vision on the first page of the PDF as an image."""
    import json, re as _re
    try:
        model = _get_gemini_model()
        # Encode PDF bytes directly as document part
        response = model.generate_content([
            {"mime_type": "application/pdf", "data": base64.b64encode(pdf_bytes).decode()},
            GEMINI_EXTRACT_PROMPT
        ])
        raw = response.text.strip()
        # Strip markdown fences if present
        raw = _re.sub(r"^```json\s*", "", raw)
        raw = _re.sub(r"\s*```$", "", raw)
        data = json.loads(raw)
        return data, 0.75  # Gemini Vision is reasonably reliable
    except Exception as e:
        logger.error(f"Gemini Vision extraction failed: {e}")
        return {}, 0.0


# ── Public API ─────────────────────────────────────────────────────────────────

def extract_form16(pdf_bytes: bytes) -> ParsedFormData:
    """
    Main entry point. Tries pdfplumber first; falls back to Gemini Vision.
    Always returns a ParsedFormData (fields default to 0 on failure).
    """
    warnings = []

    # Step 1: pdfplumber
    text, text_conf = _extract_with_pdfplumber(pdf_bytes)

    if text_conf > 0.3:
        fields = _extract_with_regex(text)
        method = "pdfplumber"
        confidence = text_conf * 0.9
    else:
        # Step 2: Gemini Vision
        warnings.append("PDF appears to be scanned — using AI vision extraction (may be less precise)")
        fields, confidence = _extract_with_gemini_vision(pdf_bytes)
        method = "gemini_vision"

    if not fields:
        warnings.append("Could not extract any data from PDF. Please enter details manually.")
        return ParsedFormData(
            parse_method="failed",
            confidence=0.0,
            warnings=warnings,
        )

    # Build sec80C total
    sec80C = min(
        fields.get("epf", 0) + fields.get("elss", 0) +
        fields.get("ppf", 0) + fields.get("lic", 0),
        150000
    )

    return ParsedFormData(
        gross_salary=fields.get("gross_salary", 0),
        hra_received=fields.get("hra_received", 0),
        tds_deducted=fields.get("tds_deducted", 0),
        standard_deduction=50000,
        sec80C_total=sec80C,
        sec80D=fields.get("sec80D", 0),
        nps_80ccd1b=fields.get("nps_80ccd1b", 0),
        home_loan_interest=fields.get("home_loan_interest", 0),
        confidence=round(confidence, 2),
        parse_method=method,
        warnings=warnings,
    )