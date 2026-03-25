import React, { useState } from 'react';
import { Activity, ChevronRight, ChevronLeft, Loader, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { callGemini } from '../utils/gemini';

const HEALTH_SYSTEM = `You are an Indian personal finance health checker. Evaluate financial wellness across 6 dimensions.
RULES:
- Score each dimension 0–100
- Use bullet points only, no paragraphs
- Max 2 bullets per dimension explanation
- Total response under 200 words
- Be specific, warm, and actionable

Return EXACTLY this JSON format (nothing else, no markdown fences):
{
  "scores": {
    "emergency": <0-100>,
    "insurance": <0-100>,
    "diversification": <0-100>,
    "debt": <0-100>,
    "tax": <0-100>,
    "retirement": <0-100>
  },
  "overall": <0-100>,
  "grade": "A+/A/B+/B/C+/C/D",
  "summary": "one sentence overall assessment",
  "insights": {
    "emergency": "brief insight",
    "insurance": "brief insight",
    "diversification": "brief insight",
    "debt": "brief insight",
    "tax": "brief insight",
    "retirement": "brief insight"
  },
  "top3_actions": ["action 1", "action 2", "action 3"]
}`;

const DIMENSIONS = [
  { key: 'emergency',      label: 'Emergency Fund',     color: 'var(--teal)',  icon: '🛡️' },
  { key: 'insurance',      label: 'Insurance Cover',    color: 'var(--gold)',  icon: '❤️' },
  { key: 'diversification',label: 'Investment Mix',     color: 'var(--coral)', icon: '📊' },
  { key: 'debt',           label: 'Debt Health',        color: 'var(--teal)',  icon: '💳' },
  { key: 'tax',            label: 'Tax Efficiency',     color: 'var(--gold)',  icon: '🧾' },
  { key: 'retirement',     label: 'Retirement Readiness',color: 'var(--coral)',icon: '🎯' },
];

const STEPS = [
  {
    id: 'income', title: 'Income & Expenses',
    fields: [
      { key: 'income',    label: 'Monthly Income (₹)',   placeholder: '80000',  type: 'number' },
      { key: 'expenses',  label: 'Monthly Expenses (₹)', placeholder: '50000',  type: 'number' },
      { key: 'emiFix',    label: 'Monthly EMIs (₹)',      placeholder: '10000',  type: 'number' },
      { key: 'savings',   label: 'Monthly Savings (₹)',   placeholder: '20000',  type: 'number' },
    ]
  },
  {
    id: 'emergency', title: 'Emergency & Insurance',
    fields: [
      { key: 'emergencyFund', label: 'Emergency Fund (₹)',     placeholder: '100000', type: 'number' },
      { key: 'termCover',     label: 'Term Life Cover (₹ Cr)', placeholder: '1',      type: 'number' },
      { key: 'healthCover',   label: 'Health Cover (₹ L)',     placeholder: '5',      type: 'number' },
      { key: 'dependents',    label: 'No. of Dependents',      placeholder: '2',      type: 'number' },
    ]
  },
  {
    id: 'investments', title: 'Investments',
    fields: [
      { key: 'epf',      label: 'EPF Balance (₹)',    placeholder: '200000', type: 'number' },
      { key: 'mf',       label: 'Mutual Funds (₹)',   placeholder: '100000', type: 'number' },
      { key: 'stocks',   label: 'Direct Stocks (₹)',  placeholder: '0',      type: 'number' },
      { key: 'fd',       label: 'FD / Debt (₹)',      placeholder: '50000',  type: 'number' },
      { key: 'gold',     label: 'Gold (₹)',            placeholder: '0',      type: 'number' },
    ]
  },
  {
    id: 'debt', title: 'Debt & Tax',
    fields: [
      { key: 'homeLoan',     label: 'Home Loan Outstanding (₹)', placeholder: '0',      type: 'number' },
      { key: 'personalLoan', label: 'Personal Loan (₹)',          placeholder: '0',      type: 'number' },
      { key: 'creditCard',   label: 'Credit Card Dues (₹)',       placeholder: '0',      type: 'number' },
      { key: 'invest80C',    label: '80C Investments This Year (₹)', placeholder: '100000', type: 'number' },
    ]
  },
];

const inputStyle = {
  width: '100%', padding: '10px 14px',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--text)', fontSize: '0.9rem',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
};

// Simple SVG radar chart — no external lib needed
function RadarChart({ scores }) {
  const keys = Object.keys(scores);
  const n = keys.length;
  const cx = 130, cy = 130, r = 100;
  const toPoint = (i, val) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const dist = (val / 100) * r;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  };
  const labelPoint = (i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    return [cx + (r + 24) * Math.cos(angle), cy + (r + 24) * Math.sin(angle)];
  };
  const gridLevels = [25, 50, 75, 100];
  const dataPoints = keys.map((k, i) => toPoint(i, scores[k]));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
  const labels = ['Emergency', 'Insurance', 'Invest Mix', 'Debt', 'Tax', 'Retirement'];

  return (
    <svg viewBox="0 0 260 260" style={{ width: '100%', maxWidth: 280 }}>
      {/* Grid */}
      {gridLevels.map(lvl => {
        const pts = keys.map((_, i) => toPoint(i, lvl));
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
        return <path key={lvl} d={path} fill="none" stroke="var(--border)" strokeWidth="0.8" />;
      })}
      {/* Spokes */}
      {keys.map((_, i) => {
        const [x, y] = toPoint(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="0.8" />;
      })}
      {/* Data fill */}
      <path d={dataPath} fill="var(--gold)" fillOpacity="0.15" stroke="var(--gold)" strokeWidth="2" />
      {/* Dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="var(--gold)" />
      ))}
      {/* Labels */}
      {labels.map((lbl, i) => {
        const [x, y] = labelPoint(i);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 9, fill: 'var(--text-dim)', fontWeight: 600 }}>
            {lbl}
          </text>
        );
      })}
    </svg>
  );
}

function ScoreBar({ label, score, color, insight }) {
  const pct = Math.min(100, Math.max(0, score));
  const barColor = pct >= 70 ? 'var(--teal)' : pct >= 40 ? 'var(--gold)' : 'var(--coral)';
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: barColor }}>{pct}/100</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 10, transition: 'width 0.8s ease' }} />
      </div>
      {insight && <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', margin: 0, lineHeight: 1.4 }}>{insight}</p>}
    </div>
  );
}

export default function MoneyHealthScore() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setFormData(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    setLoading(true); setError('');
    try {
      const prompt = `
Evaluate financial health for this Indian individual:
- Monthly income: ₹${formData.income || 0}, expenses: ₹${formData.expenses || 0}
- Monthly EMIs: ₹${formData.emiFix || 0}, savings: ₹${formData.savings || 0}
- Emergency fund: ₹${formData.emergencyFund || 0} (target: 6× monthly expenses = ₹${(formData.expenses || 0) * 6})
- Term cover: ₹${formData.termCover || 0} Cr, Health: ₹${formData.healthCover || 0} L, Dependents: ${formData.dependents || 0}
- EPF: ₹${formData.epf || 0}, MF: ₹${formData.mf || 0}, Stocks: ₹${formData.stocks || 0}, FD: ₹${formData.fd || 0}, Gold: ₹${formData.gold || 0}
- Home loan: ₹${formData.homeLoan || 0}, Personal loan: ₹${formData.personalLoan || 0}, CC dues: ₹${formData.creditCard || 0}
- 80C invested this year: ₹${formData.invest80C || 0} (max: ₹150000)
Score each of the 6 dimensions and return JSON as specified.`;
      const raw = await callGemini(prompt, HEALTH_SYSTEM);
      const clean = raw.replace(/```json|```/g, '').trim();
      setResult(JSON.parse(clean));
    } catch (e) {
      setError('Could not parse response. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function reset() { setResult(null); setStep(0); setFormData({}); }

  const gradeColor = (g) => {
    if (!g) return 'var(--text-dim)';
    if (g.startsWith('A')) return 'var(--teal)';
    if (g.startsWith('B')) return 'var(--gold)';
    return 'var(--coral)';
  };

  if (result) {
    return (
      <div style={{ padding: 'clamp(20px, 4vw, 36px)', animation: 'fadeIn 0.4s ease', maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="tag tag-gold" style={{ marginBottom: 8 }}><Activity size={12} /> Money Health Score</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: 'var(--text)', margin: 0 }}>
              Your Financial Health Report
            </h2>
          </div>
          <button onClick={reset} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', color: 'var(--text-dim)', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
            <RefreshCw size={13} /> Retake
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, marginBottom: 24, alignItems: 'start' }}>
          {/* Grade */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', textAlign: 'center', minWidth: 180 }}>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: gradeColor(result.grade), lineHeight: 1, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
              {result.grade}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>{result.overall}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall Score</div>
            <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.5, margin: 0 }}>{result.summary}</p>
          </div>

          {/* Radar */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RadarChart scores={result.scores} />
          </div>
        </div>

        {/* Score bars */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18 }}>Dimension Breakdown</div>
          {DIMENSIONS.map(d => (
            <ScoreBar key={d.key} label={`${d.icon} ${d.label}`} score={result.scores[d.key]}
              color={d.color} insight={result.insights?.[d.key]} />
          ))}
        </div>

        {/* Top actions */}
        {result.top3_actions && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Top 3 Actions</div>
            {result.top3_actions.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: 8, background: 'var(--gold-dim)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                <span style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.55 }}>{a}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const currentStep = STEPS[step];
  const progress = ((step + 1) / (STEPS.length + 1)) * 100;

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 36px)', animation: 'fadeIn 0.4s ease', maxWidth: 560 }}>
      <div style={{ marginBottom: 28 }}>
        <div className="tag tag-gold" style={{ marginBottom: 12 }}><Activity size={12} /> Money Health Score</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: 'var(--text)', marginBottom: 8 }}>
          5-minute financial wellness check
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 20 }}>
          Answer 4 quick sets of questions and get scored across 6 dimensions of financial health.
        </p>
        {/* Progress bar */}
        <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--gold)', borderRadius: 10, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {STEPS.map((s, i) => (
            <span key={i} style={{ fontSize: '0.7rem', color: i <= step ? 'var(--gold)' : 'var(--text-faint)', fontWeight: i === step ? 700 : 400 }}>
              {i + 1}. {s.title}
            </span>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px', animation: 'fadeIn 0.3s ease' }}>
        <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>
          Step {step + 1} / {STEPS.length} — {currentStep.title}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {currentStep.fields.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block' }}>{f.label}</label>
              <input style={inputStyle} type={f.type} placeholder={f.placeholder}
                value={formData[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                onFocus={e => e.target.style.borderColor = 'var(--gold)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--coral-dim)', borderRadius: 10, marginTop: 12 }}>
          <AlertCircle size={14} color="var(--coral)" />
          <span style={{ fontSize: '0.82rem', color: 'var(--coral)' }}>{error}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{
            padding: '11px 20px', borderRadius: 11, border: '1px solid var(--border)',
            cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-dim)',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', fontWeight: 600,
          }}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(s => s + 1)} style={{
            flex: 1, padding: '12px', borderRadius: 11, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--gold), #e8960f)',
            color: 'var(--ink)', fontWeight: 700, fontSize: '0.92rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            Next <ChevronRight size={15} />
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={loading} style={{
            flex: 1, padding: '12px', borderRadius: 11, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? 'var(--surface-3)' : 'linear-gradient(135deg, var(--gold), #e8960f)',
            color: loading ? 'var(--text-dim)' : 'var(--ink)', fontWeight: 700, fontSize: '0.92rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {loading ? <><Loader size={15} className="spin" /> Calculating…</> : <><Check size={15} /> Get My Score</>}
          </button>
        )}
      </div>
    </div>
  );
}