"""
backend/agents/tax_graph.py
LangGraph StateGraph — 6-node tax analysis pipeline.
Nodes: parse → validate → tax_calc → deduction → news → explain
"""
import os
import logging
from typing import Optional, List, TypedDict, Annotated
import operator

from langgraph.graph import StateGraph, END
import google.generativeai as genai

from models.tax_models import (
    ParsedFormData, TaxComparison, DeductionSuggestion,
    NewsImpactItem, ITRStep, TaxAnalysisResponse
)
from services.tax_calculator import calculate_taxes
from services.deduction_engine import find_missed_deductions
from services.news_service import get_news_impact
from utils.context_builder import build_tax_context, build_explain_prompt, build_itr_guide
from utils.validators import validate_tax_input, confidence_from_completeness

logger = logging.getLogger(__name__)


# ── State schema ───────────────────────────────────────────────────────────────

class TaxState(TypedDict):
    # inputs
    raw_input: dict
    pdf_bytes: Optional[bytes]
    input_source: str               # "manual" | "pdf" | "text_paste"

    # intermediate
    parsed_data: Optional[ParsedFormData]
    validation_warnings: List[str]
    confidence_score: float

    # calculated
    tax_comparison: Optional[TaxComparison]
    deduction_suggestions: List[DeductionSuggestion]
    news_impacts: List[NewsImpactItem]

    # AI outputs
    ai_explanation: str
    ai_action_steps: List[str]
    itr_steps: List[dict]

    # error
    error: Optional[str]


# ── Node implementations ───────────────────────────────────────────────────────

def parse_node(state: TaxState) -> TaxState:
    """Parse input: PDF → regex/vision extraction, or manual → identity."""
    if state["pdf_bytes"]:
        from services.pdf_service import extract_form16
        try:
            parsed = extract_form16(state["pdf_bytes"])
            # Merge PDF-extracted data with any manual overrides
            raw = state["raw_input"]
            if parsed.gross_salary > 0 and not raw.get("gross_salary"):
                raw["gross_salary"] = parsed.gross_salary
            state["parsed_data"] = parsed
            state["input_source"] = parsed.parse_method
        except Exception as e:
            logger.error(f"PDF parse error: {e}")
            state["validation_warnings"] = [f"PDF parse failed: {e}. Using manual inputs."]
            state["input_source"] = "manual"
    else:
        # Build ParsedFormData directly from manual input
        r = state["raw_input"]
        state["parsed_data"] = ParsedFormData(
            gross_salary=float(r.get("gross_salary", 0)),
            hra_received=float(r.get("hra_received", 0)),
            tds_deducted=float(r.get("tds_deducted", 0)),
            sec80C_total=min(
                float(r.get("epf", 0)) + float(r.get("elss", 0)) +
                float(r.get("ppf", 0)) + float(r.get("lic", 0)) +
                float(r.get("home_principal", 0)),
                150000
            ),
            sec80D=float(r.get("health_insurance_80d", 0)),
            nps_80ccd1b=float(r.get("nps_80ccd1b", 0)),
            home_loan_interest=float(r.get("home_loan_interest", 0)),
            confidence=confidence_from_completeness(r),
            parse_method="manual",
        )

    return state


def validate_node(state: TaxState) -> TaxState:
    """Validate input data, add warnings, compute confidence."""
    is_valid, warnings = validate_tax_input(state["raw_input"])
    existing = state.get("validation_warnings", [])
    state["validation_warnings"] = existing + warnings
    state["confidence_score"] = state["parsed_data"].confidence if state["parsed_data"] else 0.0

    if not is_valid:
        state["error"] = "Validation failed: " + "; ".join(warnings)

    return state


def tax_calc_node(state: TaxState) -> TaxState:
    """Run the tax calculation engine."""
    if state.get("error"):
        return state

    r = state["raw_input"]
    p = state["parsed_data"]

    try:
        comparison = calculate_taxes(
            gross_salary=float(r.get("gross_salary", p.gross_salary or 0)),
            hra_received=float(r.get("hra_received", p.hra_received or 0)),
            rent_paid=float(r.get("rent_paid", 0)),
            is_metro=bool(r.get("is_metro", False)),
            epf=float(r.get("epf", 0)),
            elss=float(r.get("elss", 0)),
            ppf=float(r.get("ppf", 0)),
            lic=float(r.get("lic", 0)),
            home_principal=float(r.get("home_principal", 0)),
            nps_80ccd1b=float(r.get("nps_80ccd1b", p.nps_80ccd1b or 0)),
            health_insurance_80d=float(r.get("health_insurance_80d", p.sec80D or 0)),
            home_loan_interest=float(r.get("home_loan_interest", p.home_loan_interest or 0)),
        )
        state["tax_comparison"] = comparison
    except Exception as e:
        state["error"] = f"Tax calculation error: {e}"

    return state


def deduction_node(state: TaxState) -> TaxState:
    """Find missed deduction opportunities."""
    if state.get("error") or not state["tax_comparison"]:
        return state

    r = state["raw_input"]
    p = state["parsed_data"]

    sec80C = min(
        float(r.get("epf", 0)) + float(r.get("elss", 0)) +
        float(r.get("ppf", 0)) + float(r.get("lic", 0)) +
        float(r.get("home_principal", 0)),
        150000
    ) or p.sec80C_total

    state["deduction_suggestions"] = find_missed_deductions(
        gross_salary=float(r.get("gross_salary", p.gross_salary or 0)),
        sec80C=sec80C,
        nps=float(r.get("nps_80ccd1b", p.nps_80ccd1b or 0)),
        health=float(r.get("health_insurance_80d", p.sec80D or 0)),
        home_interest=float(r.get("home_loan_interest", p.home_loan_interest or 0)),
    )
    return state


def news_node(state: TaxState) -> TaxState:
    """Fetch ET news and personalise impact."""
    if state.get("error") or not state["tax_comparison"]:
        state["news_impacts"] = []
        return state

    r = state["raw_input"]
    p = state["parsed_data"]
    tc = state["tax_comparison"]

    try:
        state["news_impacts"] = get_news_impact(
            gross_salary=float(r.get("gross_salary", p.gross_salary or 0)),
            better_regime=tc.better_regime,
            sec80C=p.sec80C_total,
            nps=float(r.get("nps_80ccd1b", p.nps_80ccd1b or 0)),
        )
    except Exception as e:
        logger.warning(f"News fetch failed: {e}")
        state["news_impacts"] = []

    return state


def explain_node(state: TaxState) -> TaxState:
    """Generate AI explanation + ITR guidance steps."""
    if state.get("error") or not state["tax_comparison"]:
        state["ai_explanation"] = "Could not generate explanation — please check your inputs."
        state["ai_action_steps"] = []
        state["itr_steps"] = []
        return state

    p = state["parsed_data"]
    tc = state["tax_comparison"]
    r = state["raw_input"]

    missed_savings = sum(s.estimated_tax_saving for s in state.get("deduction_suggestions", []))
    context = build_tax_context(p, tc, missed_savings, state["input_source"])
    prompt = build_explain_prompt(context)

    try:
        api_key = os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash",
                                       generation_config=genai.GenerationConfig(temperature=0.5))
        response = model.generate_content(prompt)
        full_text = response.text.strip()

        # Split into explanation vs action steps
        lines = [l.strip() for l in full_text.split("\n") if l.strip()]
        action_lines = [l for l in lines if l.startswith(("1.", "2.", "3.", "4.", "5.", "•", "-"))]
        explanation_lines = [l for l in lines if l not in action_lines]

        state["ai_explanation"] = "\n".join(explanation_lines) or full_text
        state["ai_action_steps"] = action_lines[:5]
    except Exception as e:
        logger.error(f"Gemini explain failed: {e}")
        state["ai_explanation"] = "AI explanation unavailable. Please check your API key."
        state["ai_action_steps"] = []

    # ITR guidance
    gross = float(r.get("gross_salary", p.gross_salary or 0))
    sec80C = min(
        float(r.get("epf", 0)) + float(r.get("elss", 0)) +
        float(r.get("ppf", 0)) + float(r.get("lic", 0)) +
        float(r.get("home_principal", 0)),
        150000
    ) or p.sec80C_total
    tds = float(r.get("tds_deducted", p.tds_deducted or 0))

    state["itr_steps"] = build_itr_guide(tc, gross, sec80C, tds)
    return state


# ── Build the graph ────────────────────────────────────────────────────────────

def build_tax_graph():
    workflow = StateGraph(TaxState)

    workflow.add_node("parse",     parse_node)
    workflow.add_node("validate",  validate_node)
    workflow.add_node("tax_calc",  tax_calc_node)
    workflow.add_node("deduction", deduction_node)
    workflow.add_node("news",      news_node)
    workflow.add_node("explain",   explain_node)

    workflow.set_entry_point("parse")
    workflow.add_edge("parse",     "validate")
    workflow.add_edge("validate",  "tax_calc")
    workflow.add_edge("tax_calc",  "deduction")
    workflow.add_edge("deduction", "news")
    workflow.add_edge("news",      "explain")
    workflow.add_edge("explain",   END)

    return workflow.compile()


# Singleton — compiled once at import time
tax_graph = build_tax_graph()


def run_tax_pipeline(raw_input: dict, pdf_bytes: Optional[bytes] = None) -> TaxState:
    initial_state: TaxState = {
        "raw_input": raw_input,
        "pdf_bytes": pdf_bytes,
        "input_source": "pdf" if pdf_bytes else "manual",
        "parsed_data": None,
        "validation_warnings": [],
        "confidence_score": 0.0,
        "tax_comparison": None,
        "deduction_suggestions": [],
        "news_impacts": [],
        "ai_explanation": "",
        "ai_action_steps": [],
        "itr_steps": [],
        "error": None,
    }
    return tax_graph.invoke(initial_state)