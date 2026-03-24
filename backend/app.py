import streamlit as st

st.set_page_config(
    page_title="AI Money Mentor",
    page_icon="₹",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.markdown("""
<style>
    .main-header { font-size: 2.2rem; font-weight: 700; color: #1a1a2e; margin-bottom: 0; }
    .sub-header { font-size: 1rem; color: #6b7280; margin-top: 0; }
    .feature-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 1.5rem;
        margin: 0.5rem 0;
        transition: border-color 0.2s;
    }
    .feature-card:hover { border-color: #6366f1; }
</style>
""", unsafe_allow_html=True)

st.markdown('<p class="main-header">₹ AI Money Mentor</p>', unsafe_allow_html=True)
st.markdown('<p class="sub-header">Democratizing financial planning for every Indian</p>', unsafe_allow_html=True)

st.divider()

col1, col2, col3 = st.columns(3)

with col1:
    st.markdown("""
    <div class="feature-card">
        <h3>🧾 Tax Wizard</h3>
        <p>Upload Form 16 or enter salary. AI identifies every deduction you're missing, compares old vs new regime, and ranks tax-saving options by your risk profile.</p>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Open Tax Wizard →", use_container_width=True):
        st.switch_page("pages/1_Tax_Wizard.py")

with col2:
    st.markdown("""
    <div class="feature-card">
        <h3>💑 Couple's Money Planner</h3>
        <p>Both partners enter data. AI optimizes across both incomes — HRA claims, NPS matching, SIP splits, joint vs individual insurance.</p>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Open Couple's Planner →", use_container_width=True):
        st.switch_page("pages/2_Couples_Planner.py")

with col3:
    st.markdown("""
    <div class="feature-card">
        <h3>📊 MF Portfolio X-Ray</h3>
        <p>Paste your holdings or upload CAMS statement. Get true XIRR, overlap analysis, expense ratio drag, benchmark comparison, and AI rebalancing plan.</p>
    </div>
    """, unsafe_allow_html=True)
    if st.button("Open Portfolio X-Ray →", use_container_width=True):
        st.switch_page("pages/3_MF_Xray.py")

st.divider()
st.caption("Powered by Gemini 2.0 Flash · For educational purposes only · Not SEBI-registered advice")