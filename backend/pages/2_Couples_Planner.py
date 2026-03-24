import streamlit as st
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from utils.gemini_agent import init_gemini, call_agent, format_inr
import plotly.graph_objects as go
import plotly.express as px

st.set_page_config(page_title="Couple's Money Planner", page_icon="💑", layout="wide")

st.markdown("""
<style>
.partner-card {
    border-radius: 12px; padding: 1.2rem; margin: 0.5rem 0;
}
.p1-card { background: #eff6ff; border: 1px solid #93c5fd; }
.p2-card { background: #fdf4ff; border: 1px solid #d8b4fe; }
.insight-box {
    background: #f0fdf4; border-left: 4px solid #22c55e;
    padding: 1rem; border-radius: 0 8px 8px 0; margin: 0.5rem 0;
}
.warning-box {
    background: #fff7ed; border-left: 4px solid #f97316;
    padding: 1rem; border-radius: 0 8px 8px 0; margin: 0.5rem 0;
}
</style>
""", unsafe_allow_html=True)

st.title("💑 Couple's Money Planner")
st.caption("India's first AI-powered joint financial planning — optimized across both incomes.")


COUPLES_SYSTEM = """You are an expert Indian financial planner specializing in dual-income household optimization.
You have deep knowledge of HRA splitting, NPS matching, tax bracket optimization across two incomes,
joint vs individual insurance, and SIP allocation across two salaries.
You always return ONLY valid JSON. No markdown outside JSON.
Use FY 2024-25 Indian tax laws.
"""

st.subheader("👤 Partner Details")

col1, col2 = st.columns(2, gap="large")

with col1:
    st.markdown('<div class="partner-card p1-card">', unsafe_allow_html=True)
    st.markdown("### 💙 Partner 1")
    p1_name = st.text_input("Name / Nickname", "Partner 1", key="p1_name")
    p1_income = st.number_input("Annual CTC (₹)", 0, 50000000, 1200000, 50000, key="p1_income")
    p1_basic_pct = st.slider("Basic % of CTC", 30, 60, 40, key="p1_basic")
    p1_hra_pct = st.slider("HRA % of Basic", 40, 50, 40, key="p1_hra",
                            help="50% for metro, 40% for non-metro")
    p1_epf = st.number_input("EPF Contribution ₹", 0, 500000, 0, 5000, key="p1_epf",
                               help="If employer PF applicable")
    p1_existing_80c = st.number_input("Existing 80C Investments ₹", 0, 150000, 50000, 5000, key="p1_80c")
    p1_existing_80d = st.number_input("Medical Insurance Premium ₹", 0, 25000, 15000, 500, key="p1_80d")
    p1_nps = st.number_input("NPS 80CCD(1B) ₹", 0, 50000, 0, 5000, key="p1_nps")
    p1_regime = st.selectbox("Current Tax Regime", ["New", "Old"], key="p1_regime")
    p1_city = st.selectbox("City", ["Metro", "Non-Metro"], key="p1_city")
    st.markdown("</div>", unsafe_allow_html=True)

with col2:
    st.markdown('<div class="partner-card p2-card">', unsafe_allow_html=True)
    st.markdown("### 💜 Partner 2")
    p2_name = st.text_input("Name / Nickname", "Partner 2", key="p2_name")
    p2_income = st.number_input("Annual CTC (₹)", 0, 50000000, 800000, 50000, key="p2_income")
    p2_basic_pct = st.slider("Basic % of CTC", 30, 60, 40, key="p2_basic")
    p2_hra_pct = st.slider("HRA % of Basic", 40, 50, 40, key="p2_hra")
    p2_epf = st.number_input("EPF Contribution ₹", 0, 500000, 0, 5000, key="p2_epf")
    p2_existing_80c = st.number_input("Existing 80C Investments ₹", 0, 150000, 30000, 5000, key="p2_80c")
    p2_existing_80d = st.number_input("Medical Insurance Premium ₹", 0, 25000, 0, 500, key="p2_80d")
    p2_nps = st.number_input("NPS 80CCD(1B) ₹", 0, 50000, 0, 5000, key="p2_nps")
    p2_regime = st.selectbox("Current Tax Regime", ["New", "Old"], key="p2_regime")
    p2_city = st.selectbox("City", ["Metro", "Non-Metro"], key="p2_city")
    st.markdown("</div>", unsafe_allow_html=True)

st.subheader("🏠 Joint Financial Details")
col3, col4 = st.columns(2)

with col3:
    monthly_rent = st.number_input("Monthly Rent ₹", 0, 200000, 25000, 1000,
                                    help="Who claims HRA? AI will optimize.")
    home_loan = st.checkbox("Have a Home Loan?")
    if home_loan:
        home_loan_interest = st.number_input("Annual Home Loan Interest ₹", 0, 400000, 200000, 10000)
        home_loan_principal = st.number_input("Annual Principal Repayment ₹", 0, 500000, 120000, 10000)
        property_type = st.selectbox("Property", ["Self-Occupied", "Let Out"])
    else:
        home_loan_interest, home_loan_principal, property_type = 0, 0, "N/A"

with col4:
    monthly_sip_total = st.number_input("Current Total Monthly SIP ₹", 0, 500000, 15000, 1000)
    monthly_expenses = st.number_input("Combined Monthly Expenses ₹", 0, 1000000, 80000, 5000)
    financial_goals = st.multiselect(
        "Joint Financial Goals",
        ["Retirement", "Child Education", "Home Purchase", "Foreign Travel", "Emergency Fund", "Car"],
        default=["Retirement", "Emergency Fund"]
    )
    risk_profile = st.select_slider(
        "Combined Risk Appetite",
        options=["Very Conservative", "Conservative", "Moderate", "Aggressive", "Very Aggressive"],
        value="Moderate"
    )

st.divider()

if st.button("🧠 Optimize Our Finances Together", type="primary", use_container_width=True):

    with st.spinner("AI is analyzing combined financial landscape..."):
        model = init_gemini()

        p1_basic = p1_income * p1_basic_pct / 100
        p1_hra = p1_basic * p1_hra_pct / 100
        p2_basic = p2_income * p2_basic_pct / 100
        p2_hra = p2_basic * p2_hra_pct / 100

        prompt = f"""
Optimize finances for this Indian dual-income couple for FY 2024-25.

Partner 1 ({p1_name}):
- Annual CTC: {p1_income}, Basic: {p1_basic:.0f}, HRA: {p1_hra:.0f}
- EPF: {p1_epf}, Existing 80C: {p1_existing_80c}, Medical Insurance: {p1_existing_80d}
- NPS: {p1_nps}, Current Regime: {p1_regime}, City: {p1_city}

Partner 2 ({p2_name}):
- Annual CTC: {p2_income}, Basic: {p2_basic:.0f}, HRA: {p2_hra:.0f}
- EPF: {p2_epf}, Existing 80C: {p2_existing_80c}, Medical Insurance: {p2_existing_80d}
- NPS: {p2_nps}, Current Regime: {p2_regime}, City: {p2_city}

Joint Details:
- Monthly Rent: {monthly_rent}, Annual Rent: {monthly_rent * 12}
- Home Loan Interest: {home_loan_interest}, Principal: {home_loan_principal}, Type: {property_type}
- Current Monthly SIP: {monthly_sip_total}
- Monthly Expenses: {monthly_expenses}
- Goals: {financial_goals}
- Risk Profile: {risk_profile}
- Combined Income: {p1_income + p2_income}

Analyze:
1. HRA: Who should claim rent — compare tax benefit for each partner
2. Home loan: How to split interest deduction for maximum combined benefit
3. Insurance: Family floater vs individual plans
4. NPS: Who benefits more from 80CCD(1B) — compare marginal tax rates
5. 80C: Optimal split of investments across both
6. SIP allocation: How much each partner should invest
7. Tax regime: Optimal regime for each partner independently

Return JSON:
{{
  "combined_income": number,
  "combined_current_tax": number,
  "combined_optimized_tax": number,
  "combined_annual_savings": number,
  "partner1": {{
    "name": "{p1_name}",
    "gross_income": number,
    "recommended_regime": "old" or "new",
    "current_tax": number,
    "optimized_tax": number,
    "tax_saved": number,
    "effective_rate_current": number,
    "effective_rate_optimized": number
  }},
  "partner2": {{
    "name": "{p2_name}",
    "gross_income": number,
    "recommended_regime": "old" or "new",
    "current_tax": number,
    "optimized_tax": number,
    "tax_saved": number,
    "effective_rate_current": number,
    "effective_rate_optimized": number
  }},
  "hra_optimization": {{
    "who_should_claim": "Partner1 or Partner2 or Split",
    "p1_hra_benefit": number,
    "p2_hra_benefit": number,
    "optimal_claimant": "string",
    "annual_saving": number,
    "explanation": "string"
  }},
  "home_loan_optimization": {{
    "recommended_split": {{"p1_pct": number, "p2_pct": number}},
    "p1_interest_claimed": number,
    "p2_interest_claimed": number,
    "total_tax_benefit": number,
    "explanation": "string"
  }},
  "insurance_recommendation": {{
    "strategy": "Family Floater or Individual Plans",
    "recommended_cover": number,
    "p1_premium": number,
    "p2_premium": number,
    "annual_premium_total": number,
    "tax_benefit_80d": number,
    "explanation": "string"
  }},
  "nps_recommendation": {{
    "who_benefits_more": "Partner1 or Partner2 or Both",
    "p1_nps_recommended": number,
    "p2_nps_recommended": number,
    "combined_tax_saving": number,
    "explanation": "string"
  }},
  "sip_allocation": {{
    "total_monthly_sip": number,
    "p1_sip": number,
    "p2_sip": number,
    "allocation_rationale": "string",
    "recommended_funds": [
      {{"fund_type": "string", "allocation_pct": number, "reason": "string"}}
    ]
  }},
  "80c_split": {{
    "p1_additional_needed": number,
    "p2_additional_needed": number,
    "p1_instruments": ["string"],
    "p2_instruments": ["string"],
    "explanation": "string"
  }},
  "net_worth_tracker": {{
    "combined_monthly_savings": number,
    "combined_monthly_investments": number,
    "projected_corpus_10yr": number,
    "projected_corpus_20yr": number
  }},
  "top_5_actions": [
    {{"priority": number, "action": "string", "who": "P1/P2/Both", "annual_benefit": number, "effort": "Low/Medium/High"}}
  ],
  "money_fights_to_avoid": [
    "string"
  ],
  "headline_insight": "one powerful sentence about their combined financial picture"
}}
"""

        result = call_agent(model, prompt, COUPLES_SYSTEM)

    if "error" in result:
        st.error(f"Agent error: {result['error']}")
        st.stop()

    st.session_state["couples_result"] = result
    st.success("Analysis complete!")

if "couples_result" in st.session_state:
    r = st.session_state["couples_result"]
    p1 = r.get("partner1", {})
    p2 = r.get("partner2", {})

    st.divider()

    if r.get("headline_insight"):
        st.info(f"💡 {r['headline_insight']}")

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Combined Income", format_inr(r.get("combined_income", 0)))
    col2.metric("Current Tax (Both)", format_inr(r.get("combined_current_tax", 0)))
    col3.metric("After Optimization", format_inr(r.get("combined_optimized_tax", 0)))
    col4.metric("You'll Save Together",
                format_inr(r.get("combined_annual_savings", 0)),
                delta=f"₹{r.get('combined_annual_savings',0)//12:,.0f}/month")

    st.subheader("📊 Individual Tax Optimization")
    col1, col2 = st.columns(2)

    with col1:
        st.markdown(f'<div class="partner-card p1-card"><h4>💙 {p1.get("name", "Partner 1")}</h4>', unsafe_allow_html=True)
        col_a, col_b = st.columns(2)
        col_a.metric("Current Tax", format_inr(p1.get("current_tax", 0)))
        col_b.metric("After Optimization", format_inr(p1.get("optimized_tax", 0)),
                     delta=f"-{format_inr(p1.get('tax_saved', 0))}")
        st.write(f"**Recommended Regime:** {p1.get('recommended_regime', '-').upper()}")
        st.write(f"Effective Rate: {p1.get('effective_rate_current', 0):.1f}% → {p1.get('effective_rate_optimized', 0):.1f}%")
        st.markdown("</div>", unsafe_allow_html=True)

    with col2:
        st.markdown(f'<div class="partner-card p2-card"><h4>💜 {p2.get("name", "Partner 2")}</h4>', unsafe_allow_html=True)
        col_a, col_b = st.columns(2)
        col_a.metric("Current Tax", format_inr(p2.get("current_tax", 0)))
        col_b.metric("After Optimization", format_inr(p2.get("optimized_tax", 0)),
                     delta=f"-{format_inr(p2.get('tax_saved', 0))}")
        st.write(f"**Recommended Regime:** {p2.get('recommended_regime', '-').upper()}")
        st.write(f"Effective Rate: {p2.get('effective_rate_current', 0):.1f}% → {p2.get('effective_rate_optimized', 0):.1f}%")
        st.markdown("</div>", unsafe_allow_html=True)

    hra = r.get("hra_optimization", {})
    if hra:
        st.subheader("🏠 HRA Optimization")
        col1, col2 = st.columns([2, 1])
        with col1:
            st.markdown(f"""
            <div class="insight-box">
                <b>Who should claim rent: {hra.get("optimal_claimant", "-")}</b><br>
                {hra.get("explanation", "")}
            </div>
            """, unsafe_allow_html=True)
        with col2:
            st.metric("Annual HRA Tax Saving", format_inr(hra.get("annual_saving", 0)))

    loan_opt = r.get("home_loan_optimization", {})
    if loan_opt and home_loan:
        st.subheader("🏦 Home Loan Deduction Split")
        split = loan_opt.get("recommended_split", {})
        col1, col2, col3 = st.columns(3)
        col1.metric(f"{p1.get('name')} claims", f"{split.get('p1_pct', 50)}%",
                    help=f"Interest: {format_inr(loan_opt.get('p1_interest_claimed', 0))}")
        col2.metric(f"{p2.get('name')} claims", f"{split.get('p2_pct', 50)}%",
                    help=f"Interest: {format_inr(loan_opt.get('p2_interest_claimed', 0))}")
        col3.metric("Combined Tax Benefit", format_inr(loan_opt.get("total_tax_benefit", 0)))
        st.caption(loan_opt.get("explanation", ""))

    ins = r.get("insurance_recommendation", {})
    if ins:
        st.subheader("🏥 Insurance Strategy")
        col1, col2 = st.columns([2, 1])
        with col1:
            st.markdown(f"""
            <div class="insight-box">
                <b>Recommended: {ins.get("strategy", "-")}</b><br>
                Cover: {format_inr(ins.get("recommended_cover", 0))} | 
                Annual Premium: {format_inr(ins.get("annual_premium_total", 0))}<br>
                {ins.get("explanation", "")}
            </div>
            """, unsafe_allow_html=True)
        with col2:
            st.metric("80D Tax Benefit", format_inr(ins.get("tax_benefit_80d", 0)))

    nps_rec = r.get("nps_recommendation", {})
    if nps_rec:
        st.subheader("💰 NPS Recommendation")
        col1, col2, col3 = st.columns(3)
        col1.metric(f"{p1.get('name')} NPS", format_inr(nps_rec.get("p1_nps_recommended", 0)))
        col2.metric(f"{p2.get('name')} NPS", format_inr(nps_rec.get("p2_nps_recommended", 0)))
        col3.metric("Combined 80CCD Saving", format_inr(nps_rec.get("combined_tax_saving", 0)))
        st.caption(nps_rec.get("explanation", ""))

    sip = r.get("sip_allocation", {})
    if sip:
        st.subheader("📈 SIP Allocation Plan")
        col1, col2 = st.columns(2)
        with col1:
            col_a, col_b = st.columns(2)
            col_a.metric(f"{p1.get('name')} SIP", format_inr(sip.get("p1_sip", 0)) + "/mo")
            col_b.metric(f"{p2.get('name')} SIP", format_inr(sip.get("p2_sip", 0)) + "/mo")
            st.caption(sip.get("allocation_rationale", ""))
        with col2:
            funds = sip.get("recommended_funds", [])
            if funds:
                fig = go.Figure(go.Pie(
                    labels=[f["fund_type"] for f in funds],
                    values=[f["allocation_pct"] for f in funds],
                    hole=0.5,
                    textinfo="label+percent"
                ))
                fig.update_layout(height=220, margin=dict(l=0, r=0, t=0, b=0),
                                   showlegend=False)
                st.plotly_chart(fig, use_container_width=True)

    nw = r.get("net_worth_tracker", {})
    if nw:
        st.subheader("🚀 Combined Wealth Projection")
        col1, col2, col3 = st.columns(3)
        col1.metric("Monthly Savings", format_inr(nw.get("combined_monthly_savings", 0)))
        col2.metric("Corpus in 10 Years", format_inr(nw.get("projected_corpus_10yr", 0)))
        col3.metric("Corpus in 20 Years", format_inr(nw.get("projected_corpus_20yr", 0)))

    actions = r.get("top_5_actions", [])
    if actions:
        st.subheader("✅ Top 5 Actions — Do These First")
        for a in actions:
            who_color = "💙" if a.get("who") == "P1" else "💜" if a.get("who") == "P2" else "💚"
            effort_color = {"Low": "🟢", "Medium": "🟡", "High": "🔴"}.get(a.get("effort", ""), "⚪")
            st.write(f"**{a.get('priority')}. {a.get('action')}** — {who_color} {a.get('who')} | "
                     f"{effort_color} Effort: {a.get('effort')} | 💰 Save {format_inr(a.get('annual_benefit', 0))}/yr")

    fights = r.get("money_fights_to_avoid", [])
    if fights:
        st.subheader("🕊️ Common Money Conflicts to Avoid")
        for f in fights:
            st.markdown(f"- {f}")

    st.divider()
    st.subheader("💬 Ask the Couples Finance Agent")
    q = st.text_input("Ask anything...", placeholder="e.g. Should we buy a house jointly or in one name?",
                       key="couples_q")
    if st.button("Ask", key="couples_ask") and q :
        with st.spinner("Thinking..."):
            model = init_gemini()
            ans = call_agent(model,
                             f"Context: {str(r)[:1500]}\nQuestion: {q}\nReturn JSON: {{\"answer\": \"string\"}}",
                             COUPLES_SYSTEM)
            if "answer" in ans:
                st.write(ans["answer"])