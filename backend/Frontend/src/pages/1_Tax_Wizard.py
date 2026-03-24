import streamlit as st
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from utils.gemini_agent import init_gemini, call_agent, format_inr
import plotly.graph_objects as go

st.set_page_config(page_title="Tax Wizard", page_icon="🧾", layout="wide")

st.markdown("""
<style>
.regime-card {
    padding: 1.2rem; border-radius: 12px; border: 2px solid transparent;
    margin: 0.5rem 0;
}
.regime-old { background: #fef3c7; border-color: #f59e0b; }
.regime-new { background: #d1fae5; border-color: #10b981; }
.winner-badge {
    display: inline-block; padding: 2px 10px; border-radius: 20px;
    font-size: 0.75rem; font-weight: 600; background: #10b981; color: white;
}
.deduction-row {
    display: flex; justify-content: space-between;
    padding: 6px 0; border-bottom: 1px solid #f1f5f9;
}
</style>
""", unsafe_allow_html=True)

st.title("🧾 Tax Wizard")
st.caption("Upload Form 16 text or enter your salary structure. AI finds every deduction and models both tax regimes.")

TAX_SYSTEM = """You are an expert Indian tax advisor with deep knowledge of Income Tax Act.
You always respond ONLY with valid JSON. No markdown, no explanation outside JSON.
Use current FY 2024-25 tax slabs.

OLD REGIME slabs: 0-2.5L=0%, 2.5-5L=5%, 5-10L=20%, >10L=30%. 87A rebate up to 5L tax=0.
NEW REGIME slabs (default): 0-3L=0%, 3-7L=5%, 7-10L=10%, 10-12L=15%, 12-15L=20%, >15L=30%. 87A rebate up to 7L tax=0.
Standard deduction: Old=50000, New=75000.

Key deductions (OLD regime only unless stated):
- 80C: max 1,50,000 (ELSS, PPF, EPF, LIC, home loan principal, ULIP, NSC, SSY, tuition fees)
- 80CCD(1B): NPS extra 50,000
- 80D: medical insurance (self+family max 25000, parents extra 25000, senior citizen parents 50000)
- 80E: education loan interest (full amount)
- 80G: donations (50% or 100% depending on org)
- 80TTA: savings account interest max 10000
- HRA: min of (actual HRA, rent paid - 10% basic, 50% basic metro / 40% non-metro)
- LTA: actual travel cost, twice in 4-year block
- Home loan interest: Section 24(b) max 2,00,000 for self-occupied

Surcharge: 10% if income 50L-1Cr, 15% if 1Cr-2Cr, 25% if 2Cr-5Cr, 37% if >5Cr (old). New: max 25%.
Health & Education Cess: 4% on (tax + surcharge).
"""

tab1, tab2 = st.tabs(["📝 Manual Entry", "📄 Paste Form 16 Text"])

with tab1:
    st.subheader("Salary & Income Details")
    col1, col2 = st.columns(2)

    with col1:
        basic = st.number_input("Basic Salary (annual ₹)", 0, 50000000, 600000, 10000,
                                 help="Usually 40-50% of CTC")
        hra_received = st.number_input("HRA Received (annual ₹)", 0, 10000000, 240000, 5000)
        special_allowance = st.number_input("Special Allowance (annual ₹)", 0, 20000000, 180000, 5000)
        other_income = st.number_input("Other Income (interest, rent, etc. ₹)", 0, 5000000, 0, 1000)
        rent_paid = st.number_input("Rent Paid (annual ₹)", 0, 5000000, 180000, 5000)
        city_type = st.selectbox("City Type", ["Metro (Delhi/Mumbai/Chennai/Kolkata)", "Non-Metro"])

    with col2:
        epf_employee = st.number_input("EPF Employee Contribution ₹", 0, 500000, 72000, 1000)
        ppf = st.number_input("PPF Investment ₹", 0, 150000, 0, 5000)
        elss = st.number_input("ELSS/Tax Saving MF ₹", 0, 150000, 0, 5000)
        lic_premium = st.number_input("LIC Premium ₹", 0, 150000, 0, 1000)
        nps = st.number_input("NPS Contribution (80CCD 1B) ₹", 0, 50000, 0, 5000)
        home_loan_interest = st.number_input("Home Loan Interest (Sec 24b) ₹", 0, 200000, 0, 5000)

    col3, col4 = st.columns(2)
    with col3:
        medical_insurance_self = st.number_input("Medical Insurance (self+family) ₹", 0, 25000, 15000, 1000)
        medical_insurance_parents = st.number_input("Medical Insurance (parents) ₹", 0, 50000, 0, 1000)
        parents_senior = st.checkbox("Parents are Senior Citizens (60+)")
    with col4:
        edu_loan_interest = st.number_input("Education Loan Interest ₹", 0, 1000000, 0, 5000)
        savings_interest = st.number_input("Savings Account Interest ₹", 0, 50000, 0, 500)
        risk_profile = st.selectbox("Your Risk Profile", ["Conservative", "Moderate", "Aggressive"])

    form16_text = None

with tab2:
    st.info("Copy-paste the text content from your Form 16 PDF. The AI will extract all relevant figures.")
    form16_text = st.text_area(
        "Paste Form 16 / Salary Slip Text Here",
        height=300,
        placeholder="Paste the text content of your Form 16 here..."
    )
    risk_profile = st.selectbox("Your Risk Profile", ["Conservative", "Moderate", "Aggressive"],
                                 key="risk_f16")

st.divider()

if st.button("🔍 Analyze My Taxes", type="primary", use_container_width=True):
    
    with st.spinner("AI is analyzing your tax situation..."):
        model = init_gemini()

        if form16_text and len(form16_text) > 100:
            prompt = f"""
Extract salary components and compute tax for this Form 16 text.
Form 16 Content:
{form16_text}

Risk Profile: {risk_profile}

Return JSON in this exact structure:
{{
  "extracted": {{
    "gross_salary": number,
    "basic": number,
    "hra": number,
    "special_allowance": number,
    "epf": number,
    "existing_80c": number,
    "existing_80d": number
  }},
  "old_regime": {{
    "gross_income": number,
    "total_deductions": number,
    "taxable_income": number,
    "tax_before_cess": number,
    "cess": number,
    "total_tax": number,
    "effective_rate": number
  }},
  "new_regime": {{
    "gross_income": number,
    "standard_deduction": 75000,
    "taxable_income": number,
    "tax_before_cess": number,
    "cess": number,
    "total_tax": number,
    "effective_rate": number
  }},
  "savings": number,
  "recommended_regime": "old" or "new",
  "reason": "string",
  "missed_deductions": [
    {{"section": "80C", "description": "string", "max_limit": number, "currently_using": number, "can_save_more": number, "instruments": ["ELSS", "PPF"], "suitable_for": ["Conservative","Moderate","Aggressive"]}}
  ],
  "tax_saving_plan": [
    {{"rank": 1, "action": "string", "section": "string", "max_benefit": number, "effort": "Low/Medium/High", "liquidity": "High/Medium/Low", "risk": "Low/Medium/High"}}
  ],
  "monthly_tax_saved_if_optimized": number
}}
"""
        else:
            gross = basic + hra_received + special_allowance + other_income
            total_80c = min(epf_employee + ppf + elss + lic_premium, 150000)
            max_80d = (50000 if parents_senior else 25000) + 25000
            actual_80d = min(medical_insurance_self + medical_insurance_parents, max_80d)
            metro = "metro" in city_type.lower()

            prompt = f"""
Compute comprehensive tax analysis for this Indian salaried employee for FY 2024-25.

Income Details:
- Basic Salary: {basic}
- HRA Received: {hra_received}
- Special Allowance: {special_allowance}
- Other Income: {other_income}
- Gross Total: {gross}
- Rent Paid: {rent_paid}
- City: {"Metro" if metro else "Non-Metro"}

Investments/Deductions:
- EPF Employee: {epf_employee}
- PPF: {ppf}
- ELSS: {elss}
- LIC Premium: {lic_premium}
- NPS (80CCD 1B): {nps}
- Home Loan Interest (Sec 24b): {home_loan_interest}
- Medical Insurance Self+Family: {medical_insurance_self}
- Medical Insurance Parents: {medical_insurance_parents}
- Parents Senior Citizen: {parents_senior}
- Education Loan Interest: {edu_loan_interest}
- Savings Interest: {savings_interest}
- Risk Profile: {risk_profile}

Calculate HRA exemption correctly. Calculate 80C total (max 1.5L). 
Identify ALL missed deductions. Rank tax-saving suggestions by {risk_profile} profile.

Return JSON:
{{
  "old_regime": {{
    "gross_income": number,
    "deductions_breakup": {{
      "standard_deduction": 50000,
      "hra_exemption": number,
      "section_80c": number,
      "section_80ccd1b": number,
      "section_80d": number,
      "section_24b": number,
      "section_80e": number,
      "section_80tta": number,
      "other": number,
      "total": number
    }},
    "taxable_income": number,
    "tax_before_cess": number,
    "surcharge": number,
    "cess": number,
    "total_tax": number,
    "effective_rate": number,
    "monthly_tds": number
  }},
  "new_regime": {{
    "gross_income": number,
    "standard_deduction": 75000,
    "taxable_income": number,
    "tax_before_cess": number,
    "surcharge": number,
    "cess": number,
    "total_tax": number,
    "effective_rate": number,
    "monthly_tds": number
  }},
  "recommended_regime": "old" or "new",
  "savings_by_choosing_recommended": number,
  "reason": "2-3 sentence explanation",
  "missed_deductions": [
    {{
      "section": "string",
      "description": "string",
      "max_limit": number,
      "currently_using": number,
      "unused_limit": number,
      "potential_tax_saving": number,
      "instruments": ["list of products"],
      "suitable_for": ["risk profiles"]
    }}
  ],
  "tax_saving_investments_ranked": [
    {{
      "rank": number,
      "instrument": "string",
      "section": "string",
      "invest_amount": number,
      "tax_saved": number,
      "liquidity": "High/Medium/Low",
      "risk": "Low/Medium/High",
      "returns_approx": "string",
      "why_recommended": "string"
    }}
  ],
  "current_80c_utilization_pct": number,
  "optimized_total_tax": number,
  "total_possible_savings": number,
  "key_insight": "one powerful sentence about their tax situation"
}}
"""

        result = call_agent(model, prompt, TAX_SYSTEM)

    if "error" in result:
        st.error(f"Agent error: {result['error']}")
        if "raw" in result:
            with st.expander("Raw response"):
                st.code(result["raw"])
        st.stop()

    st.session_state["tax_result"] = result
    st.success("Analysis complete!")

if "tax_result" in st.session_state:
    r = st.session_state["tax_result"]
    old = r.get("old_regime", {})
    new = r.get("new_regime", {})
    recommended = r.get("recommended_regime", "new")

    st.divider()
    st.subheader("📊 Regime Comparison")

    if r.get("key_insight"):
        st.info(f"💡 **Key Insight:** {r['key_insight']}")

    col1, col2 = st.columns(2)

    with col1:
        is_winner = recommended == "old"
        st.markdown(f"""
        <div class="regime-card regime-old">
            <h4>🏛️ Old Regime {"✅ RECOMMENDED" if is_winner else ""}</h4>
            <p><b>Taxable Income:</b> {format_inr(old.get('taxable_income', 0))}</p>
            <p><b>Total Tax:</b> {format_inr(old.get('total_tax', 0))}</p>
            <p><b>Effective Rate:</b> {old.get('effective_rate', 0):.1f}%</p>
            <p><b>Monthly TDS:</b> {format_inr(old.get('monthly_tds', old.get('total_tax',0)/12))}</p>
        </div>
        """, unsafe_allow_html=True)

    with col2:
        is_winner = recommended == "new"
        st.markdown(f"""
        <div class="regime-card regime-new">
            <h4>✨ New Regime {"✅ RECOMMENDED" if is_winner else ""}</h4>
            <p><b>Taxable Income:</b> {format_inr(new.get('taxable_income', 0))}</p>
            <p><b>Total Tax:</b> {format_inr(new.get('total_tax', 0))}</p>
            <p><b>Effective Rate:</b> {new.get('effective_rate', 0):.1f}%</p>
            <p><b>Monthly TDS:</b> {format_inr(new.get('monthly_tds', new.get('total_tax',0)/12))}</p>
        </div>
        """, unsafe_allow_html=True)

    savings = r.get("savings_by_choosing_recommended", 0)
    if savings > 0:
        st.success(f"💰 You save **{format_inr(savings)}** annually by choosing the **{recommended.upper()} regime**")

    if r.get("reason"):
        st.write(r["reason"])

    if old.get("deductions_breakup"):
        st.subheader("🔍 Old Regime Deductions Breakdown")
        deductions = old["deductions_breakup"]
        deduction_data = {k: v for k, v in deductions.items() if k != "total" and v > 0}
        if deduction_data:
            fig = go.Figure(go.Bar(
                x=list(deduction_data.values()),
                y=[k.replace("_", " ").title() for k in deduction_data.keys()],
                orientation="h",
                marker_color="#f59e0b",
                text=[format_inr(v) for v in deduction_data.values()],
                textposition="outside"
            ))
            fig.update_layout(
                height=300, margin=dict(l=0, r=60, t=20, b=20),
                xaxis_title="Amount (₹)", plot_bgcolor="white",
                xaxis=dict(showgrid=True, gridcolor="#f1f5f9")
            )
            st.plotly_chart(fig, use_container_width=True)

    st.subheader("📈 Tax Comparison")
    fig2 = go.Figure(data=[
        go.Bar(name="Old Regime", x=["Tax Amount"], y=[old.get("total_tax", 0)],
               marker_color="#f59e0b", text=[format_inr(old.get("total_tax", 0))], textposition="outside"),
        go.Bar(name="New Regime", x=["Tax Amount"], y=[new.get("total_tax", 0)],
               marker_color="#10b981", text=[format_inr(new.get("total_tax", 0))], textposition="outside")
    ])
    fig2.update_layout(
        barmode="group", height=280, margin=dict(l=0, r=0, t=20, b=20),
        plot_bgcolor="white", yaxis=dict(showgrid=True, gridcolor="#f1f5f9")
    )
    st.plotly_chart(fig2, use_container_width=True)

    # Missed Deductions
    missed = r.get("missed_deductions", [])
    if missed:
        st.subheader(f"🚨 {len(missed)} Missed Deductions Found!")
        total_potential = sum(m.get("potential_tax_saving", 0) for m in missed)
        st.warning(f"You're leaving **{format_inr(total_potential)}** in tax savings on the table!")

        for m in missed:
            with st.expander(f"📌 {m.get('section')} — {m.get('description', '')} (Save up to {format_inr(m.get('potential_tax_saving', 0))})"):
                col1, col2, col3 = st.columns(3)
                col1.metric("Max Limit", format_inr(m.get("max_limit", 0)))
                col2.metric("Currently Using", format_inr(m.get("currently_using", 0)))
                col3.metric("Unused Limit", format_inr(m.get("unused_limit", m.get("max_limit", 0) - m.get("currently_using", 0))))

                if m.get("instruments"):
                    st.write("**Instruments:**", ", ".join(m["instruments"]))
                if m.get("suitable_for"):
                    st.write("**Suitable for:**", ", ".join(m["suitable_for"]))

    ranked = r.get("tax_saving_investments_ranked", [])
    if ranked:
        st.subheader("🏆 Tax-Saving Investment Plan (Ranked for You)")
        for inv in ranked:
            col1, col2, col3, col4 = st.columns([3, 1, 1, 1])
            col1.write(f"**#{inv.get('rank')} {inv.get('instrument')}** — {inv.get('section')}")
            col2.metric("Invest", format_inr(inv.get("invest_amount", 0)))
            col3.metric("Tax Saved", format_inr(inv.get("tax_saved", 0)))
            col4.write(f"Risk: {inv.get('risk', '-')}")
            if inv.get("why_recommended"):
                st.caption(f"  → {inv['why_recommended']}")

    possible = r.get("total_possible_savings", 0)
    if possible > 0:
        st.success(f"🎯 By following this plan, you can save **{format_inr(possible)}** more in taxes this year!")

    st.divider()
    st.subheader("💬 Ask the Tax Agent")
    q = st.text_input("Ask any tax question...", placeholder="e.g. Should I invest in NPS or ELSS first?")
    if st.button("Ask", key="tax_ask") and q :
        with st.spinner("Thinking..."):
            model = init_gemini()
            chat_prompt = f"""
User's tax analysis context:
{str(r)[:2000]}

User question: {q}

Answer in plain language as a friendly Indian CA. Be specific with numbers where possible.
Return JSON: {{"answer": "string", "action_item": "string or null"}}
"""
            ans = call_agent(model, chat_prompt, "You are a friendly Indian CA. Return only JSON.")
            if "answer" in ans:
                st.write(ans["answer"])
                if ans.get("action_item"):
                    st.info(f"**Action:** {ans['action_item']}")