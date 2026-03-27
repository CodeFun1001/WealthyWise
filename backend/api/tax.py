
import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import Optional

from agents.tax_graph import run_tax_pipeline
from models.tax_models import (
    NewsImpactRequest, NewsImpactResponse, TaxAnalysisResponse,
    ParsedFormData, TaxComparison, ITRStep
)
from services.news_service import get_news_impact
from utils.validators import check_prompt_injection

router = APIRouter()


# ── Sample data ────────────────────────────────────────────────────────────────

SAMPLE_DATA = {
    "gross_salary": 1200000,
    "hra_received": 240000,
    "rent_paid": 180000,
    "is_metro": True,
    "epf": 72000,
    "elss": 50000,
    "ppf": 0,
    "lic": 15000,
    "home_principal": 0,
    "nps_80ccd1b": 0,
    "health_insurance_80d": 12000,
    "home_loan_interest": 0,
    "tds_deducted": 95000,
    "_label": "Arjun Sharma · Software Engineer · Mumbai · ₹12L CTC"
}


@router.get("/sample")
async def get_sample_data():
    """Return pre-filled sample data for the 'Load Sample' button."""
    return SAMPLE_DATA


# ── Main analysis ──────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_taxes(
    # Form fields (for multipart upload)
    gross_salary: float = Form(...),
    hra_received: float = Form(0),
    rent_paid: float = Form(0),
    is_metro: bool = Form(False),
    epf: float = Form(0),
    elss: float = Form(0),
    ppf: float = Form(0),
    lic: float = Form(0),
    home_principal: float = Form(0),
    nps_80ccd1b: float = Form(0),
    health_insurance_80d: float = Form(0),
    home_loan_interest: float = Form(0),
    tds_deducted: float = Form(0),
    pdf_file: Optional[UploadFile] = File(None),
):
    raw_input = {
        "gross_salary": gross_salary,
        "hra_received": hra_received,
        "rent_paid": rent_paid,
        "is_metro": is_metro,
        "epf": epf,
        "elss": elss,
        "ppf": ppf,
        "lic": lic,
        "home_principal": home_principal,
        "nps_80ccd1b": nps_80ccd1b,
        "health_insurance_80d": health_insurance_80d,
        "home_loan_interest": home_loan_interest,
        "tds_deducted": tds_deducted,
    }

    pdf_bytes = None
    if pdf_file and pdf_file.filename:
        if not pdf_file.filename.lower().endswith(".pdf"):
            raise HTTPException(400, "Only PDF files are accepted for Form 16 upload.")
        pdf_bytes = await pdf_file.read()
        if len(pdf_bytes) > 10 * 1024 * 1024:  # 10MB cap
            raise HTTPException(400, "PDF file too large (max 10MB).")

    # Run LangGraph pipeline
    state = run_tax_pipeline(raw_input, pdf_bytes)

    if state.get("error") and not state.get("tax_comparison"):
        raise HTTPException(422, detail=state["error"])

    tc = state["tax_comparison"]
    pd_data = state["parsed_data"] or ParsedFormData(gross_salary=gross_salary)

    return {
        "input_source": state["input_source"],
        "confidence_score": state["confidence_score"],

        "parsed_data": pd_data.dict(),
        "tax_comparison": tc.dict() if tc else {},
        "deduction_suggestions": [s.dict() for s in state["deduction_suggestions"]],

        "ai_explanation": state["ai_explanation"],
        "ai_action_steps": state["ai_action_steps"],
        "itr_steps": state["itr_steps"],

        "news_impacts": [n.dict() for n in state["news_impacts"]],
        "validation_warnings": state["validation_warnings"],
    }


# ── JSON-only analyze (for programmatic / non-form use) ───────────────────────

@router.post("/analyze-json")
async def analyze_taxes_json(payload: dict):
    """Alternative endpoint accepting plain JSON body."""
    if check_prompt_injection(str(payload)):
        raise HTTPException(400, "Invalid input detected.")

    state = run_tax_pipeline(payload)

    if state.get("error") and not state.get("tax_comparison"):
        raise HTTPException(422, detail=state["error"])

    tc = state["tax_comparison"]
    pd_data = state["parsed_data"] or ParsedFormData(
        gross_salary=payload.get("gross_salary", 0)
    )

    return {
        "input_source": state["input_source"],
        "confidence_score": state["confidence_score"],
        "parsed_data": pd_data.dict(),
        "tax_comparison": tc.dict() if tc else {},
        "deduction_suggestions": [s.dict() for s in state["deduction_suggestions"]],
        "ai_explanation": state["ai_explanation"],
        "ai_action_steps": state["ai_action_steps"],
        "itr_steps": state["itr_steps"],
        "news_impacts": [n.dict() for n in state["news_impacts"]],
        "validation_warnings": state["validation_warnings"],
    }


# ── News impact ────────────────────────────────────────────────────────────────

@router.post("/news")
async def news_impact(req: NewsImpactRequest):
    try:
        impacts = get_news_impact(
            gross_salary=req.gross_salary,
            better_regime=req.better_regime,
            sec80C=req.sec80C,
            nps=req.nps,
        )
        return NewsImpactResponse(
            impacts=impacts,
            summary=f"Analysed {len(impacts)} recent news items affecting your tax profile."
        )
    except Exception as e:
        raise HTTPException(500, f"News analysis failed: {e}")