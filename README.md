# WealthyWise — AI Money Mentor

> **AI-powered personal finance for every Indian.** Tax optimisation, portfolio health, FIRE planning, and more — advisor-grade intelligence at zero cost.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-wealthywise.vercel.app-teal?style=flat-square)](https://wealthywise-beta.vercel.app/)
[![Stack](https://img.shields.io/badge/Stack-React%20%2B%20FastAPI%20%2B%20LangGraph-blue?style=flat-square)]()
[![AI](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-orange?style=flat-square)]()

---

## What It Does

WealthyWise gives every Indian — not just HNIs — access to personalised financial guidance that used to cost ₹25,000+/year through a human advisor.

| Module | Description |
|---|---|
| 💰 **Money Health Score** | 5-minute onboarding → score across 6 dimensions → AI roast, fix plan, and what-if simulator |
| 📊 **MF Portfolio X-Ray** | Paste your CAMS statement → XIRR, overlap analysis, expense ratio drag, rebalancing plan |
| 👫 **Couple's Money Planner** | Joint financial planning — HRA splits, NPS matching, SIP allocation across both incomes |
| 🧮 **AI Tax Wizard** | Old vs new regime comparison, every missed deduction, Form 16 PDF upload |
| 🔥 **FIRE Path Planner** | Month-by-month retirement roadmap with corpus milestones and asset glidepath |
| 🎯 **Life Event Advisor** | AI action plans for 9 life events: bonus, marriage, baby, inheritance, job loss, and more |
| 🤖 **AI Chatbot** | Floating money mentor chatbot available across all pages |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts |
| Auth | Firebase Authentication (Google Sign In + email/password) |
| AI — frontend | Google Gemini 2.5 Flash (direct browser API calls) |
| AI — backend | Google Gemini via LangGraph agent graph |
| Agent framework | LangGraph (stateful multi-agent pipeline) |
| Backend | FastAPI, Python 3.11, Pydantic v2 |
| Frontend hosting | Vercel |
| Backend hosting | Render |

---

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- A [Google AI Studio](https://aistudio.google.com) account (free Gemini API key)
- A Firebase project ([create one free](https://console.firebase.google.com))

### 1. Clone

```bash
git clone https://github.com/your-username/wealthywise.git
cd wealthywise
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env
```

Fill in `.env`:

```env
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

```bash
npm run dev
# → http://localhost:5173
```

### 3. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Fill in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key
```

```bash
uvicorn main:app --reload --port 8000
# → http://localhost:8000
# → Swagger docs at http://localhost:8000/docs
```

---

## Deployment

### Frontend → Vercel

```bash
cd frontend && npm run build
vercel deploy --prod
```

Set these in Vercel **Settings → Environment Variables**:

```
VITE_GEMINI_API_KEY        your_gemini_key
VITE_API_BASE              https://your-backend.onrender.com
VITE_FIREBASE_API_KEY      your_firebase_key
VITE_FIREBASE_AUTH_DOMAIN  your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID   your-project-id
```
---

## Security & Compliance

- **Prompt injection guard** on all backend endpoints — user text is sanitised before any LLM call
- **No financial data stored** — all calculations are stateless per request
- **PDF isolation** — bytes processed in-memory, discarded after parsing, never written to disk
- **CORS hardening** — only whitelisted frontend origins permitted
- **AI disclaimer** on every output: *"This is AI-generated guidance for educational purposes only. Not licensed financial advice. Consult a SEBI-registered advisor before investing."*
- **Input size caps** — PDF ≤ 10 MB, all numerics validated by Pydantic

---

## Disclaimer

WealthyWise is an AI-powered educational tool. All financial calculations and suggestions are for informational purposes only and do not constitute licensed financial advice. Tax calculations are based on FY 2024-25 Indian tax laws. Please consult a SEBI-registered investment advisor before making financial decisions.
