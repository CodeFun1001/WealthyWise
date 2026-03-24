import streamlit as st
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from utils.gemini_agent import init_gemini, call_agent, format_inr
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
from datetime import datetime, date

st.set_page_config(page_title="MF Portfolio X-Ray", page_icon="📊", layout="wide")

st.markdown("""
<style>
.xray-metric { background: #f8fafc; border-radius: 10px; padding: 1rem; text-align: center; border: 1px solid #e2e8f0; }
.overlap-high { color: #ef4444; font-weight: 600; }
.overlap-medium { color: #f97316; font-weight: 600; }
.overlap-low { color: #22c55e; font-weight: 600; }
.fund-row { padding: 0.75rem; border-radius: 8px; margin: 4px 0; border: 1px solid #e2e8f0; }
</style>
""", unsafe_allow_html=True)

st.title("📊 MF Portfolio X-Ray")
st.caption("Complete portfolio reconstruction · True XIRR · Overlap analysis · AI rebalancing plan")


XRAY_SYSTEM = """You are an expert Indian mutual fund analyst with knowledge of all major AMCs,
fund categories, SEBI categorization, benchmark indices, and portfolio construction principles.
You always return ONLY valid JSON. No markdown outside JSON.
Know major fund houses: Mirae, HDFC, SBI, ICICI Pru, Axis, Kotak, UTI, Nippon, Motilal Oswal, Parag Parikh, DSP, Quant.
Understand fund overlaps — HDFC Flexi Cap and Mirae Asset Large Cap both hold HDFC Bank, ICICI Bank, Reliance heavily.
Use SEBI fund categories: Large Cap, Mid Cap, Small Cap, Flexi Cap, ELSS, Debt, Hybrid, International, Sectoral.
"""

tab1, tab2 = st.tabs(["📝 Manual Entry", "📄 Paste CAMS/KFintech Text"])

holdings = []

with tab1:
    st.subheader("Add Your Mutual Fund Holdings")
    st.info("Add each fund separately. Include SIP amount or lump sum details for XIRR calculation.")

    if "mf_holdings" not in st.session_state:
        st.session_state.mf_holdings = [
            {"fund": "Mirae Asset Large Cap Fund - Direct Growth", "category": "Large Cap",
             "current_value": 150000, "invested": 120000, "monthly_sip": 5000,
             "sip_start": "2021-01", "units": 1250.5, "nav": 120.0},
        ]

    with st.expander("➕ Add New Fund"):
        col1, col2 = st.columns(2)
        with col1:
            new_fund = st.text_input("Fund Name", key="new_fund",
                                      placeholder="e.g. Parag Parikh Flexi Cap Fund Direct Growth")
            new_category = st.selectbox("Category", [
                "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap", "Multi Cap",
                "ELSS", "Large & Mid Cap", "Aggressive Hybrid", "Conservative Hybrid",
                "Debt - Short Duration", "Debt - Liquid", "International", "Sectoral - IT",
                "Sectoral - Banking", "Index Fund", "ETF"], key="new_cat")
            new_invested = st.number_input("Total Invested ₹", 0, 10000000, 100000, 5000, key="new_inv")
        with col2:
            new_value = st.number_input("Current Value ₹", 0, 10000000, 120000, 5000, key="new_val")
            new_sip = st.number_input("Monthly SIP ₹ (0 if lump sum)", 0, 100000, 0, 500, key="new_sip")
            new_sip_start = st.text_input("SIP Start (YYYY-MM)", "2022-01", key="new_sip_start")
            new_units = st.number_input("Units Held", 0.0, 1000000.0, 1000.0, 10.0, key="new_units")
            new_nav = st.number_input("Current NAV ₹", 0.0, 5000.0, 50.0, 0.5, key="new_nav")

        if st.button("Add Fund"):
            st.session_state.mf_holdings.append({
                "fund": new_fund, "category": new_category,
                "current_value": new_value, "invested": new_invested,
                "monthly_sip": new_sip, "sip_start": new_sip_start,
                "units": new_units, "nav": new_nav
            })
            st.rerun()

    if st.session_state.mf_holdings:
        st.subheader(f"📋 Your Holdings ({len(st.session_state.mf_holdings)} funds)")
        total_invested = sum(h["invested"] for h in st.session_state.mf_holdings)
        total_value = sum(h["current_value"] for h in st.session_state.mf_holdings)
        total_gain = total_value - total_invested
        gain_pct = (total_gain / total_invested * 100) if total_invested > 0 else 0

        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Total Invested", format_inr(total_invested))
        col2.metric("Current Value", format_inr(total_value))
        col3.metric("Total Gain/Loss", format_inr(total_gain),
                    delta=f"{gain_pct:.1f}%")
        col4.metric("No. of Funds", len(st.session_state.mf_holdings))

        df = pd.DataFrame(st.session_state.mf_holdings)
        df["Gain %"] = ((df["current_value"] - df["invested"]) / df["invested"] * 100).round(1)
        df["Weight %"] = (df["current_value"] / df["current_value"].sum() * 100).round(1)

        st.dataframe(
            df[["fund", "category", "invested", "current_value", "monthly_sip", "Gain %", "Weight %"]].rename(
                columns={"fund": "Fund", "category": "Category", "invested": "Invested ₹",
                         "current_value": "Value ₹", "monthly_sip": "SIP/mo ₹"}
            ),
            use_container_width=True, hide_index=True
        )

        col_del, _ = st.columns([1, 4])
        if col_del.button("🗑 Clear All"):
            st.session_state.mf_holdings = []
            st.rerun()

    holdings = st.session_state.mf_holdings
    cams_text = None

with tab2:
    st.info("Copy-paste text from your CAMS or KFintech consolidated account statement. "
            "AI will extract all fund details, invested amounts, and current values.")
    cams_text = st.text_area(
        "Paste CAMS / KFintech Statement Text",
        height=350,
        placeholder="""Example:
Mirae Asset Large Cap Fund - Direct Plan - Growth
Folio No: 123456789  PAN: XXXXX1234X
Current Value: 1,52,340.50
Cost: 1,20,000.00
Units: 1250.54 | NAV: 121.82

SBI Small Cap Fund - Direct Plan - Growth  
Folio No: 987654321
Current Value: 85,000.00
Cost: 60,000.00
..."""
    )

    risk_profile_cams = st.selectbox("Risk Profile", ["Conservative", "Moderate", "Aggressive"], key="risk_cams")

st.subheader("📌 Additional Context")
col1, col2, col3 = st.columns(3)
with col1:
    investment_horizon = st.selectbox("Investment Horizon", ["< 1 year", "1-3 years", "3-5 years", "5-10 years", "10+ years"])
    risk_profile = st.selectbox("Risk Profile", ["Conservative", "Moderate", "Aggressive"])
with col2:
    goal = st.selectbox("Primary Goal", ["Wealth Creation", "Retirement", "Child Education", "Tax Saving", "Regular Income"])
    monthly_income = st.number_input("Monthly Income ₹", 0, 5000000, 100000, 5000)
with col3:
    benchmark = st.selectbox("Compare Against", ["Nifty 50", "Nifty 500", "BSE Sensex", "Nifty Midcap 150"])
    st.write("")
    st.write("")
    include_direct_links = st.checkbox("Include fund direct plan links", value=True)

# ── Analyze ──────────────────────────────────────────────────────────────────
st.divider()

if st.button("🔬 Run X-Ray Analysis", type="primary", use_container_width=True):
    
    active_holdings = holdings if not (cams_text and len(cams_text) > 100) else []

    with st.spinner("Running deep portfolio analysis..."):
        model = init_gemini()

        if cams_text and len(cams_text) > 100:
            holdings_prompt = f"Extract from CAMS statement:\n{cams_text}\n\nRisk: {risk_profile_cams}"
        else:
            holdings_str = "\n".join([
                f"- {h['fund']} | Category: {h['category']} | Invested: {h['invested']} | "
                f"Value: {h['current_value']} | SIP: {h['monthly_sip']}/mo since {h['sip_start']} | "
                f"Units: {h['units']} | NAV: {h['nav']}"
                for h in active_holdings
            ])
            holdings_prompt = f"Portfolio:\n{holdings_str}"

        total_inv = sum(h["invested"] for h in active_holdings) if active_holdings else 0
        total_val = sum(h["current_value"] for h in active_holdings) if active_holdings else 0

        prompt = f"""
Perform a complete MF Portfolio X-Ray analysis for an Indian investor.

{holdings_prompt}

Context:
- Risk Profile: {risk_profile}
- Investment Horizon: {investment_horizon}
- Primary Goal: {goal}
- Monthly Income: {monthly_income}
- Benchmark: {benchmark}
- Total Invested (approx): {total_inv}
- Current Value (approx): {total_val}

Perform comprehensive analysis:
1. XIRR calculation for each fund and overall
2. Overlap analysis between funds (identify common stocks)
3. Asset allocation vs ideal for their profile
4. Expense ratio analysis
5. Benchmark comparison
6. AI rebalancing recommendation

Return JSON:
{{
  "portfolio_summary": {{
    "total_invested": number,
    "current_value": number,
    "absolute_return_pct": number,
    "overall_xirr": number,
    "benchmark_xirr": number,
    "alpha_generated": number,
    "total_funds": number,
    "monthly_sip_total": number,
    "avg_expense_ratio": number,
    "annual_expense_drag": number
  }},
  "funds_analysis": [
    {{
      "fund_name": "string",
      "category": "string",
      "amc": "string",
      "invested": number,
      "current_value": number,
      "absolute_return_pct": number,
      "estimated_xirr": number,
      "expense_ratio": number,
      "portfolio_weight_pct": number,
      "direct_plan": true/false,
      "rating": "Excellent/Good/Average/Poor",
      "rating_reason": "string",
      "benchmark_name": "string",
      "outperforming_benchmark": true/false
    }}
  ],
  "overlap_analysis": {{
    "overlap_risk": "High/Medium/Low",
    "total_unique_stocks": number,
    "overlapping_pairs": [
      {{
        "fund1": "string",
        "fund2": "string",
        "overlap_pct": number,
        "common_stocks": ["string"],
        "risk_level": "High/Medium/Low"
      }}
    ],
    "most_held_stocks": [
      {{"stock": "string", "held_by_funds": number, "sector": "string"}}
    ],
    "concentrated_sectors": ["string"],
    "diversification_score": number
  }},
  "asset_allocation": {{
    "current": {{
      "large_cap_pct": number,
      "mid_cap_pct": number,
      "small_cap_pct": number,
      "debt_pct": number,
      "international_pct": number,
      "other_pct": number
    }},
    "recommended_for_profile": {{
      "large_cap_pct": number,
      "mid_cap_pct": number,
      "small_cap_pct": number,
      "debt_pct": number,
      "international_pct": number,
      "other_pct": number
    }},
    "deviation": "string"
  }},
  "expense_analysis": {{
    "funds_on_direct_plan": number,
    "funds_on_regular_plan": number,
    "regular_plan_funds": ["string"],
    "annual_extra_cost_regular": number,
    "10yr_cost_of_regular": number,
    "recommendation": "string"
  }},
  "rebalancing_plan": {{
    "action_needed": true/false,
    "urgency": "Immediate/Within 3 months/Annual review",
    "exit_recommendations": [
      {{
        "fund": "string",
        "action": "Exit/Reduce SIP/Switch",
        "reason": "string",
        "suggested_alternative": "string",
        "stcg_ltcg_note": "string"
      }}
    ],
    "add_recommendations": [
      {{
        "fund": "string",
        "category": "string",
        "reason": "string",
        "suggested_sip": number
      }}
    ],
    "rebalancing_rationale": "string"
  }},
  "tax_efficiency": {{
    "estimated_ltcg": number,
    "estimated_stcg": number,
    "ltcg_tax": number,
    "stcg_tax": number,
    "tax_harvesting_opportunity": "string",
    "note": "string"
  }},
  "health_score": number,
  "health_verdict": "Excellent/Good/Needs Attention/Critical",
  "top_3_strengths": ["string"],
  "top_3_weaknesses": ["string"],
  "one_line_verdict": "string"
}}
"""

        result = call_agent(model, prompt, XRAY_SYSTEM)

    if "error" in result:
        st.error(f"Agent error: {result['error']}")
        st.stop()

    st.session_state["xray_result"] = result
    st.success("X-Ray complete!")

if "xray_result" in st.session_state:
    r = st.session_state["xray_result"]
    ps = r.get("portfolio_summary", {})

    st.divider()

    score = r.get("health_score", 0)
    verdict = r.get("health_verdict", "")
    verdict_color = {"Excellent": "#22c55e", "Good": "#84cc16",
                     "Needs Attention": "#f97316", "Critical": "#ef4444"}.get(verdict, "#6b7280")

    col1, col2 = st.columns([1, 3])
    with col1:
        fig_gauge = go.Figure(go.Indicator(
            mode="gauge+number",
            value=score,
            domain={"x": [0, 1], "y": [0, 1]},
            title={"text": "Portfolio Health", "font": {"size": 14}},
            gauge={
                "axis": {"range": [0, 100]},
                "bar": {"color": verdict_color},
                "steps": [
                    {"range": [0, 40], "color": "#fef2f2"},
                    {"range": [40, 70], "color": "#fff7ed"},
                    {"range": [70, 100], "color": "#f0fdf4"}
                ]
            }
        ))
        fig_gauge.update_layout(height=200, margin=dict(l=20, r=20, t=40, b=20))
        st.plotly_chart(fig_gauge, use_container_width=True)

    with col2:
        st.markdown(f"### {verdict}")
        if r.get("one_line_verdict"):
            st.write(r["one_line_verdict"])

        col_a, col_b, col_c = st.columns(3)
        if r.get("top_3_strengths"):
            with col_a:
                st.write("**Strengths**")
                for s in r["top_3_strengths"]:
                    st.write(f"✅ {s}")
        if r.get("top_3_weaknesses"):
            with col_b:
                st.write("**Weaknesses**")
                for w in r["top_3_weaknesses"]:
                    st.write(f"⚠️ {w}")

    st.subheader("📈 Portfolio Metrics")
    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Total Value", format_inr(ps.get("current_value", 0)))
    col2.metric("Overall XIRR", f"{ps.get('overall_xirr', 0):.1f}%",
                delta=f"{ps.get('alpha_generated', 0):.1f}% vs {benchmark}")
    col3.metric("Absolute Returns", f"{ps.get('absolute_return_pct', 0):.1f}%")
    col4.metric("Avg Expense Ratio", f"{ps.get('avg_expense_ratio', 0):.2f}%")
    col5.metric("Annual Expense Drag", format_inr(ps.get("annual_expense_drag", 0)))

    funds = r.get("funds_analysis", [])
    if funds:
        st.subheader("🔍 Fund-wise Analysis")
        rating_color = {"Excellent": "🟢", "Good": "🔵", "Average": "🟡", "Poor": "🔴"}

        for f in funds:
            with st.expander(f"{rating_color.get(f.get('rating', ''), '⚪')} {f.get('fund_name', 'Fund')} — XIRR: {f.get('estimated_xirr', 0):.1f}% | Weight: {f.get('portfolio_weight_pct', 0):.0f}%"):
                col1, col2, col3, col4 = st.columns(4)
                col1.metric("Invested", format_inr(f.get("invested", 0)))
                col2.metric("Current Value", format_inr(f.get("current_value", 0)))
                col3.metric("XIRR", f"{f.get('estimated_xirr', 0):.1f}%")
                col4.metric("Expense Ratio", f"{f.get('expense_ratio', 0):.2f}%")

                st.write(f"**Category:** {f.get('category')} | **AMC:** {f.get('amc')} | "
                         f"**Direct Plan:** {'Yes ✅' if f.get('direct_plan') else 'No ❌'} | "
                         f"**Benchmark:** {'Beating ✅' if f.get('outperforming_benchmark') else 'Lagging ⚠️'} {f.get('benchmark_name', '')}")
                if f.get("rating_reason"):
                    st.caption(f.get("rating_reason"))

    alloc = r.get("asset_allocation", {})
    if alloc:
        st.subheader("🥧 Asset Allocation vs Ideal")
        current = alloc.get("current", {})
        recommended = alloc.get("recommended_for_profile", {})

        categories = ["Large Cap", "Mid Cap", "Small Cap", "Debt", "International", "Other"]
        current_vals = [
            current.get("large_cap_pct", 0), current.get("mid_cap_pct", 0),
            current.get("small_cap_pct", 0), current.get("debt_pct", 0),
            current.get("international_pct", 0), current.get("other_pct", 0)
        ]
        rec_vals = [
            recommended.get("large_cap_pct", 0), recommended.get("mid_cap_pct", 0),
            recommended.get("small_cap_pct", 0), recommended.get("debt_pct", 0),
            recommended.get("international_pct", 0), recommended.get("other_pct", 0)
        ]

        col1, col2 = st.columns(2)
        with col1:
            fig_cur = go.Figure(go.Pie(
                labels=categories, values=current_vals, hole=0.5,
                title="Current Allocation", textinfo="label+percent"
            ))
            fig_cur.update_layout(height=280, margin=dict(l=0, r=0, t=40, b=0), showlegend=False)
            st.plotly_chart(fig_cur, use_container_width=True)
        with col2:
            fig_rec = go.Figure(go.Pie(
                labels=categories, values=rec_vals, hole=0.5,
                title="Recommended for Profile", textinfo="label+percent"
            ))
            fig_rec.update_layout(height=280, margin=dict(l=0, r=0, t=40, b=0), showlegend=False)
            st.plotly_chart(fig_rec, use_container_width=True)

        if alloc.get("deviation"):
            st.warning(f"⚠️ Deviation: {alloc['deviation']}")

    overlap = r.get("overlap_analysis", {})
    if overlap:
        st.subheader("🔄 Fund Overlap Analysis")
        risk_colors = {"High": "overlap-high", "Medium": "overlap-medium", "Low": "overlap-low"}

        col1, col2, col3 = st.columns(3)
        col1.metric("Overlap Risk", overlap.get("overlap_risk", "-"))
        col2.metric("Unique Stocks", overlap.get("total_unique_stocks", 0))
        col3.metric("Diversification Score", f"{overlap.get('diversification_score', 0)}/100")

        pairs = overlap.get("overlapping_pairs", [])
        if pairs:
            st.write("**Fund Pairs with Overlap:**")
            for pair in pairs:
                risk = pair.get("risk_level", "Low")
                color = {"High": "🔴", "Medium": "🟡", "Low": "🟢"}.get(risk, "⚪")
                with st.expander(f"{color} {pair.get('fund1', '')} ↔ {pair.get('fund2', '')} — {pair.get('overlap_pct', 0):.0f}% overlap"):
                    st.write(f"**Common Stocks:** {', '.join(pair.get('common_stocks', []))}")

        most_held = overlap.get("most_held_stocks", [])
        if most_held:
            st.write("**Most Duplicated Stocks in Your Portfolio:**")
            cols = st.columns(min(len(most_held), 5))
            for i, stock in enumerate(most_held[:5]):
                cols[i].metric(stock["stock"], f"In {stock['held_by_funds']} funds", stock.get("sector", ""))

    exp = r.get("expense_analysis", {})
    if exp:
        st.subheader("💸 Expense Ratio Analysis")
        col1, col2, col3 = st.columns(3)
        col1.metric("Funds on Direct Plan", exp.get("funds_on_direct_plan", 0))
        col2.metric("Funds on Regular Plan ⚠️", exp.get("funds_on_regular_plan", 0))
        col3.metric("Extra Cost (Regular Plans)", format_inr(exp.get("annual_extra_cost_regular", 0)) + "/yr")

        if exp.get("funds_on_regular_plan", 0) > 0:
            st.error(f"💰 Switching to Direct plans saves {format_inr(exp.get('annual_extra_cost_regular', 0))}/yr "
                     f"= {format_inr(exp.get('10yr_cost_of_regular', 0))} over 10 years!")
            if exp.get("regular_plan_funds"):
                st.write("**Switch these to Direct:**", ", ".join(exp["regular_plan_funds"]))

    rebal = r.get("rebalancing_plan", {})
    if rebal:
        st.subheader("🔧 AI Rebalancing Plan")
        urgency_color = {"Immediate": "🔴", "Within 3 months": "🟡", "Annual review": "🟢"}
        st.write(f"{urgency_color.get(rebal.get('urgency', ''), '⚪')} **Urgency: {rebal.get('urgency', '-')}**")
        st.write(rebal.get("rebalancing_rationale", ""))

        exits = rebal.get("exit_recommendations", [])
        if exits:
            st.write("**Exit / Reduce:**")
            for e in exits:
                action_icon = {"Exit": "🚪", "Reduce SIP": "📉", "Switch": "🔄"}.get(e.get("action", ""), "▸")
                with st.expander(f"{action_icon} {e.get('action')} — {e.get('fund', '')}"):
                    st.write(f"**Reason:** {e.get('reason', '')}")
                    if e.get("suggested_alternative"):
                        st.write(f"**Switch to:** {e['suggested_alternative']}")
                    if e.get("stcg_ltcg_note"):
                        st.caption(f"Tax note: {e['stcg_ltcg_note']}")

        adds = rebal.get("add_recommendations", [])
        if adds:
            st.write("**Add / Start SIP in:**")
            for a in adds:
                st.write(f"✅ **{a.get('fund', '')}** ({a.get('category', '')}) — SIP: "
                         f"{format_inr(a.get('suggested_sip', 0))}/mo | {a.get('reason', '')}")

    tax = r.get("tax_efficiency", {})
    if tax:
        st.subheader("🧾 Tax Efficiency")
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Estimated LTCG", format_inr(tax.get("estimated_ltcg", 0)))
        col2.metric("LTCG Tax (10%)", format_inr(tax.get("ltcg_tax", 0)))
        col3.metric("Estimated STCG", format_inr(tax.get("estimated_stcg", 0)))
        col4.metric("STCG Tax (15%)", format_inr(tax.get("stcg_tax", 0)))

        if tax.get("tax_harvesting_opportunity"):
            st.info(f"💡 **Tax Harvesting:** {tax['tax_harvesting_opportunity']}")
        if tax.get("note"):
            st.caption(tax["note"])

    st.divider()
    st.subheader("💬 Ask the Portfolio Analyst")
    q = st.text_input("Ask about your portfolio...",
                       placeholder="e.g. Should I exit Axis Bluechip and move to Nifty 50 Index Fund?",
                       key="xray_q")
    if st.button("Ask", key="xray_ask") and q :
        with st.spinner("Analyzing..."):
            model = init_gemini()
            ans = call_agent(model,
                             f"Portfolio context: {str(r)[:2000]}\nQuestion: {q}\n"
                             f"Return JSON: {{\"answer\": \"string\", \"action\": \"string or null\"}}",
                             XRAY_SYSTEM)
            if "answer" in ans:
                st.write(ans["answer"])
                if ans.get("action"):
                    st.success(f"**Recommended Action:** {ans['action']}")