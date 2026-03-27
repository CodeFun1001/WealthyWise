import React, { useState, useRef, useEffect } from 'react';
import {
  Activity, ChevronRight, ChevronLeft, Loader, RefreshCw,
  AlertCircle, Check, Zap, Shield, CreditCard,
  PiggyBank, Receipt, Target, AlertTriangle, ArrowRight,
  Share2, BarChart3, TrendingUp, Flame, Heart, Info,
  CheckCircle2, XCircle, Clock, Star
} from 'lucide-react';
import { callGemini } from '../utils/gemini';

// ── Enhanced System Prompt ─────────────────────────────────────────────────────
const HEALTH_SYSTEM = `You are India's top personal finance health advisor. Evaluate financial wellness across 6 dimensions for an Indian individual.

CRITICAL RULES:
- Score each dimension 0–100 using strict Indian personal finance standards
- 80C under ₹1.5L = low tax score; emergency fund under 6 months = low emergency score
- Be specific with rupee amounts in insights; name actual instruments (ELSS, PPF, NPS, etc.)
- Roast must be funny, India-specific, and reference a real weakness
- Crisis alert only if there is a genuinely critical risk (skip if finances are okay)
- Timeline milestones must be concrete and achievable

Return EXACTLY this JSON format (no markdown fences, no extra text):
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
  "summary": "one warm, specific, encouraging sentence about their overall financial health",
  "roast": "one brutally honest but funny India-specific sentence about their biggest weakness (reference chai, cricket, or relatable Indian scenarios)",
  "insights": {
    "emergency": "specific insight with rupee target and current gap",
    "insurance": "specific insight mentioning cover amount adequacy vs income",
    "diversification": "specific insight with equity/debt ratio and recommendation",
    "debt": "specific insight with EMI-to-income ratio and priority action",
    "tax": "specific insight with 80C gap amount and best instrument to use",
    "retirement": "specific insight with corpus projection and recommended SIP amount"
  },
  "moneyLosing": {
    "taxLost": <annual rupees lost to suboptimal tax planning>,
    "emergencyGap": <months of expenses not covered>,
    "investmentDrag": <estimated annual return lost from poor diversification>
  },
  "potentialGain": <total rupees they could save/gain per year with optimal planning>,
  "top3_actions": [
    "action 1 with specific rupee amount and exact step",
    "action 2 with specific instrument and timeline",
    "action 3 with exact deadline (e.g. before March 31)"
  ],
  "timeline": [
    {"months": 3, "milestone": "specific, achievable 3-month financial goal with rupee target", "phase": "Foundation"},
    {"months": 12, "milestone": "specific 12-month milestone with measurable outcome", "phase": "Stability"},
    {"months": 36, "milestone": "specific 36-month wealth goal with corpus target", "phase": "Growth"}
  ],
  "crisis_alert": null or "one urgent, specific sentence about their biggest financial vulnerability"
}`;

// ── Dimensions config ─────────────────────────────────────────────────────────
const DIMENSIONS = [
  { key: 'emergency',       label: 'Emergency Fund',       icon: Shield,     color: 'var(--teal)',  bgColor: 'rgba(6,214,160,0.1)',  description: 'Liquid cushion for life surprises' },
  { key: 'insurance',       label: 'Insurance Cover',      icon: Heart,      color: 'var(--coral)', bgColor: 'rgba(239,71,111,0.1)', description: 'Protection for you & your family' },
  { key: 'diversification', label: 'Investment Mix',       icon: BarChart3,  color: '#a78bfa',      bgColor: 'rgba(167,139,250,0.1)', description: 'Spread across equity, debt & gold' },
  { key: 'debt',            label: 'Debt Health',          icon: CreditCard, color: 'var(--gold)',  bgColor: 'rgba(245,166,35,0.1)', description: 'EMI burden & loan management' },
  { key: 'tax',             label: 'Tax Efficiency',       icon: Receipt,    color: 'var(--teal)',  bgColor: 'rgba(6,214,160,0.1)',  description: '80C, NPS & deduction utilization' },
  { key: 'retirement',      label: 'Retirement Readiness', icon: Target,     color: '#a78bfa',      bgColor: 'rgba(167,139,250,0.1)', description: 'FIRE corpus & long-term planning' },
];

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'income', title: 'Income & Savings', emoji: '💰',
    subtitle: 'Tell us about your monthly cash flow',
    fields: [
      { key: 'income',    label: 'Monthly Take-Home (₹)',  placeholder: '80,000',  hint: 'Your actual in-hand salary after tax' },
      { key: 'expenses',  label: 'Monthly Expenses (₹)',   placeholder: '50,000',  hint: 'Rent, food, bills, subscriptions — everything' },
      { key: 'emiFix',    label: 'Total EMIs per Month (₹)', placeholder: '10,000', hint: 'Home, car, personal loan EMIs combined' },
      { key: 'savings',   label: 'Monthly Savings/SIP (₹)', placeholder: '20,000', hint: 'What you actually set aside each month' },
    ]
  },
  {
    id: 'emergency', title: 'Safety Net', emoji: '🛡️',
    subtitle: 'How protected are you from life\'s surprises?',
    fields: [
      { key: 'emergencyFund', label: 'Emergency Fund (₹)',      placeholder: '1,00,000', hint: 'Cash in savings/liquid MF/short-term FD' },
      { key: 'termCover',     label: 'Term Life Cover (₹ Cr)',  placeholder: '1',        hint: 'Recommended: 15–20× annual income' },
      { key: 'healthCover',   label: 'Health Insurance (₹ L)', placeholder: '5',        hint: 'Family floater — min ₹10L recommended' },
      { key: 'dependents',    label: 'Number of Dependents',    placeholder: '2',        hint: 'Parents, spouse, children who need you' },
    ]
  },
  {
    id: 'investments', title: 'Investments', emoji: '📈',
    subtitle: 'Where is your money currently working?',
    fields: [
      { key: 'epf',    label: 'EPF / PF Balance (₹)',  placeholder: '2,00,000', hint: 'Current provident fund corpus' },
      { key: 'mf',     label: 'Mutual Funds (₹)',       placeholder: '1,00,000', hint: 'Total MF portfolio value today' },
      { key: 'stocks', label: 'Direct Stocks (₹)',      placeholder: '0',        hint: 'Direct equity holdings' },
      { key: 'fd',     label: 'FD / Bonds / Debt (₹)', placeholder: '50,000',   hint: 'Fixed deposits, NPS, debt funds' },
      { key: 'gold',   label: 'Gold (₹)',               placeholder: '0',        hint: 'Physical, SGBs, or digital gold' },
    ]
  },
  {
    id: 'debt', title: 'Debt & Tax', emoji: '📋',
    subtitle: 'Loans you owe and tax planning status',
    fields: [
      { key: 'homeLoan',     label: 'Home Loan Outstanding (₹)',    placeholder: '0',        hint: 'Remaining principal on home loan' },
      { key: 'personalLoan', label: 'Personal / Vehicle Loan (₹)', placeholder: '0',        hint: 'Unsecured loans — these cost the most' },
      { key: 'creditCard',   label: 'Credit Card Dues (₹)',         placeholder: '0',        hint: 'Unpaid CC balance (high interest risk!)' },
      { key: 'invest80C',    label: '80C Investments This Year (₹)', placeholder: '1,00,000', hint: 'ELSS + EPF + PPF + LIC (max: ₹1,50,000)' },
    ]
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtINR = (n) => {
  if (!n || isNaN(n)) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

const scoreStatus = (s) => {
  if (s >= 75) return { label: 'Excellent', color: 'var(--teal)', emoji: '🟢' };
  if (s >= 55) return { label: 'Good',      color: 'var(--gold)', emoji: '🟡' };
  if (s >= 35) return { label: 'Fair',      color: '#f97316',    emoji: '🟠' };
  return                { label: 'Critical', color: 'var(--coral)', emoji: '🔴' };
};

const gradeColor = (g) => {
  if (!g) return 'var(--text)';
  if (g.startsWith('A')) return 'var(--teal)';
  if (g.startsWith('B')) return 'var(--gold)';
  return 'var(--coral)';
};

// ── Radar Chart ────────────────────────────────────────────────────────────────
function RadarChart({ scores, size = 300 }) {
  const keys = Object.keys(scores);
  const n = keys.length;
  const cx = size / 2, cy = size / 2, r = size * 0.34;
  const toPoint = (i, val) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const dist = (val / 100) * r;
    return [cx + dist * Math.cos(angle), cy + dist * Math.sin(angle)];
  };
  const labelPoint = (i) => {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    return [cx + (r + 34) * Math.cos(angle), cy + (r + 34) * Math.sin(angle)];
  };
  const gridLevels = [25, 50, 75, 100];
  const dataPoints = keys.map((k, i) => toPoint(i, scores[k]));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
  const labels = ['Emergency', 'Insurance', 'Invest Mix', 'Debt', 'Tax', 'Retirement'];
  const COLORS = DIMENSIONS.map(d => d.color);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size }}>
      {gridLevels.map(lvl => {
        const pts = keys.map((_, i) => toPoint(i, lvl));
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z';
        return <path key={lvl} d={path} fill={lvl === 25 ? 'rgba(239,71,111,0.04)' : 'none'} stroke="var(--border)" strokeWidth={lvl === 100 ? 1.2 : 0.6} strokeDasharray={lvl < 100 ? '3,3' : 'none'} />;
      })}
      {keys.map((_, i) => {
        const [x, y] = toPoint(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="0.7" />;
      })}
      <path d={dataPath} fill="rgba(245,166,35,0.1)" stroke="var(--gold)" strokeWidth="2.5" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="5.5" fill={COLORS[i]} stroke="var(--surface)" strokeWidth="2" />
      ))}
      {labels.map((lbl, i) => {
        const [x, y] = labelPoint(i);
        const score = Object.values(scores)[i];
        const st = scoreStatus(score);
        return (
          <g key={i}>
            <text x={x} y={y - 5} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 9, fill: 'var(--text-dim)', fontWeight: 700, fontFamily: 'var(--font-body)' }}>
              {lbl}
            </text>
            <text x={x} y={y + 7} textAnchor="middle" dominantBaseline="middle"
              style={{ fontSize: 8.5, fill: st.color, fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
              {score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Score Ring ─────────────────────────────────────────────────────────────────
function ScoreRing({ score, grade }) {
  const r = 60, circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, score));
  const offset = circ * (1 - pct / 100);
  const color = pct >= 70 ? 'var(--teal)' : pct >= 40 ? 'var(--gold)' : 'var(--coral)';
  const gColor = gradeColor(grade);

  return (
    <div style={{ position: 'relative', width: 160, height: 160, flexShrink: 0 }}>
      <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="12" />
        <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 10px ${color}70)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.4rem', fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 1 }}>/ 100</div>
        <div style={{ fontWeight: 900, fontSize: '1.2rem', color: gColor, marginTop: 3, fontFamily: 'var(--font-mono)' }}>{grade}</div>
      </div>
    </div>
  );
}

// ── Dimension Card ─────────────────────────────────────────────────────────────
function DimCard({ label, icon: Icon, score, insight, color, bgColor, description }) {
  const pct = Math.min(100, Math.max(0, score));
  const st = scoreStatus(pct);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        padding: '16px 18px',
        background: 'var(--surface)',
        border: `1px solid ${pct < 40 ? color + '44' : 'var(--border)'}`,
        borderRadius: 14,
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '66'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = pct < 40 ? color + '44' : 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: bgColor, borderRadius: '50%', transform: 'translate(30px, -30px)', opacity: 0.5 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text)' }}>{label}</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', marginTop: 1 }}>{description}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color: st.color }}>{pct}</div>
          <div style={{ fontSize: '0.6rem', color: st.color, fontWeight: 700, textTransform: 'uppercase' }}>{st.label}</div>
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${st.color}, ${st.color}bb)`, borderRadius: 10, transition: 'width 1.2s cubic-bezier(.4,0,.2,1)' }} />
      </div>
      {expanded && insight && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: bgColor, borderRadius: 10, fontSize: '0.79rem', color: 'var(--text)', lineHeight: 1.6, animation: 'fadeIn 0.2s ease' }}>
          {insight}
        </div>
      )}
      {!expanded && insight && (
        <div style={{ marginTop: 8, fontSize: '0.76rem', color: 'var(--text-dim)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
          {insight}
        </div>
      )}
      <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', marginTop: 6, textAlign: 'right' }}>
        {expanded ? 'Tap to collapse ↑' : 'Tap for full insight ↓'}
      </div>
    </div>
  );
}

// ── What-If Simulator ─────────────────────────────────────────────────────────
function WhatIfSimulator({ formData, result }) {
  const [sip, setSip] = useState(0);
  const [expenseCut, setExpenseCut] = useState(0);
  const [healthCover, setHealthCover] = useState(0);
  const [emergencyBoost, setEmergencyBoost] = useState(0);
  const [simScore, setSimScore] = useState(result.overall);

  const income = Number(formData.income || 1);
  const expenses = Number(formData.expenses || 1);

  useEffect(() => {
    let delta = 0;
    if (sip > 0)           delta += Math.min((sip / income) * 22, 12);
    if (expenseCut > 0)    delta += Math.min((expenseCut / expenses) * 15, 8);
    if (healthCover > 0)   delta += Math.min(healthCover / 8, 6);
    if (emergencyBoost > 0) delta += Math.min(emergencyBoost / 15000 * 4, 7);
    setSimScore(Math.min(100, Math.round(result.overall + delta)));
  }, [sip, expenseCut, healthCover, emergencyBoost]);

  const diff = simScore - result.overall;
  const newGrade = simScore >= 90 ? 'A+' : simScore >= 80 ? 'A' : simScore >= 70 ? 'B+' : simScore >= 60 ? 'B' : simScore >= 50 ? 'C+' : simScore >= 40 ? 'C' : 'D';

  const sliders = [
    { label: 'Boost Monthly SIP',      val: sip,           set: setSip,           max: 50000,  step: 1000,  color: 'var(--teal)',  prefix: '₹', unit: '/mo', hint: 'More equity SIP = better diversification + retirement score' },
    { label: 'Cut Monthly Expenses',   val: expenseCut,    set: setExpenseCut,    max: 20000,  step: 500,   color: 'var(--gold)', prefix: '₹', unit: '/mo', hint: 'Lower burn rate = higher savings rate + emergency fund speed' },
    { label: 'Increase Health Cover',  val: healthCover,   set: setHealthCover,   max: 50,     step: 5,     color: 'var(--coral)', prefix: '₹', unit: 'L',  hint: 'Adequate health cover protects against medical emergencies' },
    { label: 'Top Up Emergency Fund',  val: emergencyBoost, set: setEmergencyBoost, max: 200000, step: 5000, color: '#a78bfa',     prefix: '₹', unit: '',    hint: 'Build your safety net — target 6× monthly expenses' },
  ];

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(167,139,250,0.06), transparent)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={20} color="#a78bfa" />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text)' }}>What-If Simulator 🎮</h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>Drag sliders to instantly see your score improve</p>
        </div>
        <div style={{ textAlign: 'center', padding: '8px 16px', background: 'rgba(167,139,250,0.1)', borderRadius: 12 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 900, color: '#a78bfa', lineHeight: 1 }}>{simScore}</div>
          {diff > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--teal)', fontWeight: 700 }}>+{diff} pts 🚀</div>}
        </div>
      </div>

      <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {sliders.map(({ label, val, set, max, step, color, prefix, unit, hint }) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text)' }}>{label}</div>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-faint)', marginTop: 1 }}>{hint}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 800, color, marginLeft: 12, whiteSpace: 'nowrap' }}>
                {prefix}{val.toLocaleString('en-IN')}{unit}
              </div>
            </div>
            <input type="range" min={0} max={max} step={step} value={val}
              onChange={e => set(Number(e.target.value))}
              style={{ width: '100%', accentColor: color, cursor: 'pointer', height: 4 }} />
          </div>
        ))}
      </div>

      {diff > 0 && (
        <div style={{ margin: '0 22px 20px', padding: '14px 16px', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '1.4rem' }}>🎯</div>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--teal)' }}>
              Grade improves to <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem' }}>{newGrade}</span> — +{diff} points gained!
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
              These changes are achievable within 3–6 months with disciplined planning.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── WhatsApp Share Text ────────────────────────────────────────────────────────
function buildSummary(result, formData) {
  const { overall, grade, scores, top3_actions } = result;
  const problems = DIMENSIONS.filter(d => scores[d.key] < 50).map(d => `❌ ${d.label}: ${scores[d.key]}/100`);
  const strong   = DIMENSIONS.filter(d => scores[d.key] >= 70).map(d => `✅ ${d.label}: ${scores[d.key]}/100`);
  return `💰 *WealthyWise Money Health Score*

Score: *${overall}/100* (${grade})

*Strong Areas:*
${strong.slice(0, 2).join('\n') || '— Working on it!'}

*Needs Attention:*
${problems.slice(0, 3).join('\n') || '— Great financial health!'}

*Top 3 Actions:*
${top3_actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}

_Get your free score → wealthywise.app_`;
}

// ── Input Field ────────────────────────────────────────────────────────────────
function InputField({ field, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'block' }}>
        {field.label}
      </label>
      {field.hint && (
        <div style={{ fontSize: '0.67rem', color: 'var(--text-faint)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Info size={10} color="var(--text-faint)" />
          {field.hint}
        </div>
      )}
      <input
        style={{
          width: '100%', padding: '11px 14px',
          background: focused ? 'var(--surface-2)' : 'var(--surface-3)',
          border: `1px solid ${focused ? 'var(--gold)' : 'var(--border)'}`,
          borderRadius: 10, color: 'var(--text)', fontSize: '0.9rem',
          outline: 'none', boxSizing: 'border-box',
          transition: 'all 0.2s ease', fontFamily: 'var(--font-body)',
          boxShadow: focused ? '0 0 0 3px rgba(245,166,35,0.12)' : 'none',
        }}
        type="number"
        placeholder={field.placeholder.replace(/,/g, '')}
        value={value || ''}
        onChange={e => onChange(field.key, e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MoneyHealthScore() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showRoast, setShowRoast] = useState(false);
  const [activeTab, setActiveTab] = useState('breakdown');
  const resultsRef = useRef(null);

  const set = (k, v) => setFormData(f => ({ ...f, [k]: v }));
  const income   = Number(formData.income   || 0);
  const expenses = Number(formData.expenses || 0);

  const liveEmergencyMonths = income > 0 && expenses > 0
    ? (Number(formData.emergencyFund || 0) / Math.max(expenses, 1)).toFixed(1)
    : null;

  const savingsRate = income > 0
    ? Math.round((Number(formData.savings || 0) / income) * 100)
    : 0;

  async function handleSubmit() {
    setLoading(true); setError('');
    try {
      const totalInvestments = ['epf','mf','stocks','fd','gold'].reduce((s,k) => s + Number(formData[k]||0), 0);
      const equityPct = totalInvestments > 0
        ? Math.round(((Number(formData.mf||0) + Number(formData.stocks||0)) / totalInvestments) * 100) : 0;

      const prompt = `Evaluate financial health for this Indian individual:

INCOME & CASH FLOW:
- Monthly take-home: ₹${formData.income || 0}
- Monthly expenses: ₹${formData.expenses || 0}
- Monthly EMIs: ₹${formData.emiFix || 0}
- Monthly savings/SIP: ₹${formData.savings || 0}
- Savings rate: ${savingsRate}%
- EMI-to-income ratio: ${income > 0 ? Math.round((Number(formData.emiFix||0)/income)*100) : 0}%

SAFETY NET:
- Emergency fund: ₹${formData.emergencyFund || 0} (covers ${liveEmergencyMonths || 0} months; target: 6 months = ₹${expenses*6})
- Term life cover: ₹${formData.termCover || 0} Cr (recommended: ₹${Math.round(income*12*15/10000000)} Cr for this income)
- Health insurance: ₹${formData.healthCover || 0} L (minimum recommended: ₹10L)
- Dependents: ${formData.dependents || 0}

INVESTMENTS:
- EPF: ₹${formData.epf || 0}
- Mutual Funds: ₹${formData.mf || 0}
- Direct Stocks: ₹${formData.stocks || 0}
- FD/Debt: ₹${formData.fd || 0}
- Gold: ₹${formData.gold || 0}
- Total portfolio: ₹${totalInvestments}
- Equity allocation: ${equityPct}% (recommended: ${savingsRate > 20 ? '60-70%' : '50-60%'} at this life stage)

DEBT:
- Home loan: ₹${formData.homeLoan || 0}
- Personal/vehicle loan: ₹${formData.personalLoan || 0}
- Credit card dues: ₹${formData.creditCard || 0}
- Total debt: ₹${Number(formData.homeLoan||0) + Number(formData.personalLoan||0) + Number(formData.creditCard||0)}

TAX PLANNING:
- 80C invested this year: ₹${formData.invest80C || 0} (max: ₹1,50,000; gap: ₹${Math.max(0, 150000 - Number(formData.invest80C||0))})
- 80C utilization: ${Math.min(100, Math.round(Number(formData.invest80C||0)/1500))}%

Score each dimension strictly. A poor emergency fund should score 20-35. Missing 80C should score 10-25. Be blunt but warm.`;

      const raw = await callGemini(prompt, HEALTH_SYSTEM);
      const clean = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setResult(parsed);
      setStep(5);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) {
      setError('Could not parse the AI response. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  function reset() { setResult(null); setStep(0); setFormData({}); setError(''); setShowRoast(false); setActiveTab('breakdown'); }

  function copyShareText() {
    if (!result) return;
    navigator.clipboard.writeText(buildSummary(result, formData));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const progress = ((step + 1) / (STEPS.length + 1)) * 100;
  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  // ── Results View ──────────────────────────────────────────────────────────────
  if (result && step === 5) {
    const overallColor = result.overall >= 70 ? 'var(--teal)' : result.overall >= 40 ? 'var(--gold)' : 'var(--coral)';
    const weakDims = DIMENSIONS.filter(d => result.scores[d.key] < 50);
    const strongDims = DIMENSIONS.filter(d => result.scores[d.key] >= 70);
    const tab = (id, label) => (
      <button
        onClick={() => setActiveTab(id)}
        style={{
          padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: 700,
          background: activeTab === id ? 'var(--gold)' : 'var(--surface-2)',
          color: activeTab === id ? 'var(--ink)' : 'var(--text-dim)',
          transition: 'all 0.2s ease',
        }}
      >{label}</button>
    );

    return (
      <div ref={resultsRef} style={{ padding: 'clamp(18px, 4vw, 36px)', animation: 'fadeIn 0.4s ease', maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="tag tag-gold" style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Activity size={12} /> Money Health Score
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', color: 'var(--text)', margin: '0 0 4px' }}>
              Your Financial Health Report
            </h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.83rem', margin: 0 }}>Based on your inputs · AI-powered analysis</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={copyShareText} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Share2 size={13} /> {copied ? '✓ Copied!' : 'Share'}
            </button>
            <button onClick={reset} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} /> Retake
            </button>
          </div>
        </div>

        {/* Crisis Alert */}
        {result.crisis_alert && (
          <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(239,71,111,0.07)', border: '1px solid rgba(239,71,111,0.3)', borderRadius: 14, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,71,111,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertTriangle size={18} color="var(--coral)" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--coral)', marginBottom: 4 }}>🚨 Risk Alert — Read This First</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.55 }}>{result.crisis_alert}</div>
            </div>
          </div>
        )}

        {/* Hero Score Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, marginBottom: 20, alignItems: 'stretch' }}>

          {/* Score Ring Card */}
          <div className="card" style={{ padding: '24px 20px', textAlign: 'center', minWidth: 190, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, justifyContent: 'center' }}>
            <ScoreRing score={result.overall} grade={result.grade} />
            <div style={{ width: '100%' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.55, margin: '0 0 14px' }}>{result.summary}</p>
              <button
                onClick={() => setShowRoast(r => !r)}
                style={{ width: '100%', padding: '9px 14px', background: showRoast ? 'rgba(239,71,111,0.12)' : 'rgba(239,71,111,0.06)', border: '1px solid rgba(239,71,111,0.25)', borderRadius: 10, cursor: 'pointer', fontSize: '0.78rem', color: 'var(--coral)', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}>
                <Flame size={13} /> {showRoast ? 'Hide Roast' : '🔥 AI Roast Mode'}
              </button>
              {showRoast && result.roast && (
                <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(239,71,111,0.07)', borderRadius: 10, fontSize: '0.79rem', color: 'var(--text)', lineHeight: 1.6, fontStyle: 'italic', textAlign: 'left', border: '1px solid rgba(239,71,111,0.15)', animation: 'fadeIn 0.2s ease' }}>
                  💬 "{result.roast}"
                </div>
              )}
            </div>
          </div>

          {/* What You're Losing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '16px 18px', background: 'rgba(239,71,111,0.06)', border: '1px solid rgba(239,71,111,0.2)', borderRadius: 14, flex: 1 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--coral)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>💸 What You're Losing</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.moneyLosing?.taxLost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Annual tax overpaid</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--coral)', fontSize: '0.88rem' }}>{fmtINR(result.moneyLosing.taxLost)}</span>
                  </div>
                )}
                {result.moneyLosing?.emergencyGap > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Emergency coverage gap</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--coral)', fontSize: '0.88rem' }}>{result.moneyLosing.emergencyGap} months</span>
                  </div>
                )}
                {result.moneyLosing?.investmentDrag > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Investment drag/yr</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--coral)', fontSize: '0.88rem' }}>{fmtINR(result.moneyLosing.investmentDrag)}</span>
                  </div>
                )}
              </div>
            </div>
            {result.potentialGain > 0 && (
              <div style={{ padding: '16px 18px', background: 'rgba(6,214,160,0.06)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: 14, flex: 1, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>🚀 Your Upside Potential</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', fontWeight: 900, color: 'var(--teal)', lineHeight: 1 }}>{fmtINR(result.potentialGain)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 3 }}>additional savings/gains per year</div>
                </div>
                <TrendingUp size={40} color="rgba(6,214,160,0.2)" style={{ flexShrink: 0 }} />
              </div>
            )}
          </div>

          {/* Radar */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', minWidth: 220 }}>
            <RadarChart scores={result.scores} size={260} />
          </div>
        </div>

        {/* Quick summary chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {strongDims.map(d => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: 20, fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 700 }}>
              <CheckCircle2 size={11} /> {d.label}
            </div>
          ))}
          {weakDims.map(d => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(239,71,111,0.07)', border: '1px solid rgba(239,71,111,0.2)', borderRadius: 20, fontSize: '0.72rem', color: 'var(--coral)', fontWeight: 700 }}>
              <XCircle size={11} /> {d.label}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {tab('breakdown', '📊 6 Dimensions')}
          {tab('actions', '⚡ Fix Plan')}
          {tab('timeline', '📅 Timeline')}
          {tab('simulator', '🎮 Simulator')}
          {tab('share', '💬 Share')}
        </div>

        {/* Tab: Breakdown */}
        {activeTab === 'breakdown' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, animation: 'fadeIn 0.3s ease' }}>
            {DIMENSIONS.map(d => (
              <DimCard key={d.key} {...d} score={result.scores[d.key]} insight={result.insights?.[d.key]} />
            ))}
          </div>
        )}

        {/* Tab: Fix Plan */}
        {activeTab === 'actions' && result.top3_actions && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="card" style={{ border: '1px solid rgba(245,166,35,0.25)', background: 'linear-gradient(135deg, rgba(245,166,35,0.04), transparent)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={20} color="var(--gold)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0 }}>Your 1-Click Fix Plan</h3>
                  <p style={{ fontSize: '0.73rem', color: 'var(--text-dim)', margin: '2px 0 0' }}>3 specific actions to improve your score this week</p>
                </div>
              </div>
              {result.top3_actions.map((action, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: i < result.top3_actions.length - 1 ? 12 : 0, padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)', transition: 'border-color 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--gold-dim)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 900, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.87rem', color: 'var(--text)', lineHeight: 1.6, fontWeight: 500 }}>{action}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} /> Do this week
                    </div>
                  </div>
                  <ArrowRight size={15} color="var(--gold)" style={{ flexShrink: 0, marginTop: 4 }} />
                </div>
              ))}
            </div>

            {/* Dimension scores as mini table */}
            <div className="card">
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Score Impact Summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {DIMENSIONS.map(d => {
                  const s = result.scores[d.key];
                  const st = scoreStatus(s);
                  return (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <d.icon size={14} color={d.color} style={{ flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.81rem', color: 'var(--text-dim)' }}>{d.label}</span>
                      <div style={{ width: 100, height: 5, background: 'var(--surface-3)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s}%`, background: st.color, borderRadius: 5 }} />
                      </div>
                      <span style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', fontWeight: 800, color: st.color, minWidth: 30, textAlign: 'right' }}>{s}</span>
                      <span style={{ fontSize: '0.67rem', color: st.color, fontWeight: 700, minWidth: 50 }}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Timeline */}
        {activeTab === 'timeline' && result.timeline && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 22 }}>
                📅 Your Financial Journey — 3 Milestones
              </div>
              {/* Timeline connector */}
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 20, top: 36, bottom: 36, width: 2, background: 'linear-gradient(180deg, var(--coral), var(--gold), var(--teal))', opacity: 0.3, borderRadius: 2 }} />
                {result.timeline.map((t, i) => {
                  const colors = ['var(--coral)', 'var(--gold)', 'var(--teal)'];
                  const dimColors = ['rgba(239,71,111,0.08)', 'rgba(245,166,35,0.08)', 'rgba(6,214,160,0.08)'];
                  const borderColors = ['rgba(239,71,111,0.2)', 'rgba(245,166,35,0.2)', 'rgba(6,214,160,0.2)'];
                  const icons = ['🌱', '🏗️', '🚀'];
                  const labels = ['Foundation', 'Stability', 'Growth'];
                  return (
                    <div key={i} style={{ display: 'flex', gap: 20, marginBottom: i < 2 ? 24 : 0 }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: colors[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 900, color: 'var(--ink)', fontFamily: 'var(--font-mono)', zIndex: 1, position: 'relative', boxShadow: `0 0 0 4px ${dimColors[i].replace('0.08', '0.15')}` }}>
                          {t.months}m
                        </div>
                      </div>
                      <div style={{ flex: 1, padding: '12px 16px', background: dimColors[i], border: `1px solid ${borderColors[i]}`, borderRadius: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: '1rem' }}>{icons[i]}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: colors[i], textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t.phase || labels[i]}</span>
                        </div>
                        <div style={{ fontSize: '0.86rem', color: 'var(--text)', lineHeight: 1.6 }}>{t.milestone}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Simulator */}
        {activeTab === 'simulator' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <WhatIfSimulator formData={formData} result={result} />
          </div>
        )}

        {/* Tab: Share */}
        {activeTab === 'share' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="card" style={{ background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.18)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#25d366', display: 'flex', alignItems: 'center', gap: 8 }}>
                  💬 WhatsApp Ready Summary
                </div>
                <button onClick={copyShareText} style={{ padding: '7px 16px', background: '#25d36618', border: '1px solid #25d36640', borderRadius: 8, cursor: 'pointer', fontSize: '0.76rem', color: '#25d366', fontFamily: 'var(--font-body)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {copied ? <><Check size={12} /> Copied!</> : <><Share2 size={12} /> Copy</>}
                </button>
              </div>
              <pre style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.75, margin: 0, fontFamily: 'var(--font-body)', whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {buildSummary(result, formData)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Form / Loading View ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 'clamp(20px, 4vw, 36px)', animation: 'fadeIn 0.4s ease' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div className="tag tag-gold" style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Activity size={12} /> Money Health Score
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', color: 'var(--text)', marginBottom: 8, lineHeight: 1.2 }}>
          5-Minute Financial Wellness Check
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.7, maxWidth: 480 }}>
          Get a comprehensive score across 6 dimensions — with an AI-powered fix plan, what-if simulator, and personalised 3-year roadmap.
        </p>
      </div>

      {/* Progress stepper */}
      {!loading && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
            {STEPS.map((s, i) => (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: i < step ? 'var(--teal)' : i === step ? 'var(--gold)' : 'var(--surface-3)',
                    border: `2px solid ${i <= step ? (i < step ? 'var(--teal)' : 'var(--gold)') : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: i < step ? '0.8rem' : '0.9rem',
                    transition: 'all 0.3s ease',
                    boxShadow: i === step ? '0 0 0 4px rgba(245,166,35,0.15)' : 'none',
                  }}>
                    {i < step ? <Check size={14} color="var(--ink)" strokeWidth={3} /> : s.emoji}
                  </div>
                  <span style={{ fontSize: '0.62rem', color: i === step ? 'var(--gold)' : i < step ? 'var(--teal)' : 'var(--text-faint)', fontWeight: i === step ? 800 : 600, textAlign: 'center', lineHeight: 1.3 }}>
                    {s.title}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ height: 2, flex: 1.5, background: i < step ? 'var(--teal)' : 'var(--border)', marginBottom: 20, transition: 'background 0.3s ease', borderRadius: 2 }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 340, gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 88, height: 88, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--gold)', animation: 'spin 1s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.9rem' }}>🏥</div>
          </div>
          <div style={{ textAlign: 'center', maxWidth: 300 }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.3rem', color: 'var(--text)', marginBottom: 8 }}>Analysing your finances…</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.84rem', lineHeight: 1.6 }}>Scoring 6 dimensions · Calculating what you're losing · Building your personalised fix plan</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['var(--gold)', 'var(--teal)', 'var(--coral)'].map((c, i) => (
              <div key={i} className="loading-dot" style={{ background: c, animationDelay: `${i * 0.18}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* Step form */}
      {!loading && (
        <div style={{ animation: 'fadeIn 0.25s ease' }}>
          <div className="card" style={{ borderColor: 'rgba(245,166,35,0.15)' }}>
            {/* Step header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22, paddingBottom: 18, borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                {currentStep.emoji}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)' }}>{currentStep.title}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: 2 }}>{currentStep.subtitle}</div>
              </div>
              <div style={{ marginLeft: 'auto', padding: '4px 10px', background: 'var(--surface-3)', borderRadius: 8, fontSize: '0.68rem', color: 'var(--text-faint)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {step + 1}/{STEPS.length}
              </div>
            </div>

            {/* Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: currentStep.fields.length > 4 ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr 1fr', gap: 16 }}>
              {currentStep.fields.map(f => (
                <InputField key={f.key} field={f} value={formData[f.key]} onChange={set} />
              ))}
            </div>

            {/* Live hints */}
            {step === 0 && income > 0 && expenses > 0 && (
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ padding: '10px 14px', background: savingsRate >= 20 ? 'rgba(6,214,160,0.08)' : savingsRate >= 10 ? 'rgba(245,166,35,0.08)' : 'rgba(239,71,111,0.08)', border: `1px solid ${savingsRate >= 20 ? 'rgba(6,214,160,0.2)' : savingsRate >= 10 ? 'rgba(245,166,35,0.2)' : 'rgba(239,71,111,0.2)'}`, borderRadius: 10, fontSize: '0.78rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-dim)' }}>Savings rate: </span>
                  <span style={{ color: savingsRate >= 20 ? 'var(--teal)' : savingsRate >= 10 ? 'var(--gold)' : 'var(--coral)' }}>
                    {savingsRate}% {savingsRate >= 20 ? '✅ Excellent' : savingsRate >= 10 ? '⚠️ Improve' : '🚨 Too low'}
                  </span>
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-dim)' }}>EMI burden: </span>
                  <span style={{ color: income > 0 && (Number(formData.emiFix||0)/income) > 0.4 ? 'var(--coral)' : 'var(--gold)' }}>
                    {income > 0 ? Math.round(Number(formData.emiFix||0)/income*100) : 0}% of income
                  </span>
                </div>
              </div>
            )}

            {step === 1 && liveEmergencyMonths && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: Number(liveEmergencyMonths) >= 6 ? 'rgba(6,214,160,0.08)' : Number(liveEmergencyMonths) >= 3 ? 'rgba(245,166,35,0.08)' : 'rgba(239,71,111,0.08)', border: `1px solid ${Number(liveEmergencyMonths) >= 6 ? 'rgba(6,214,160,0.25)' : Number(liveEmergencyMonths) >= 3 ? 'rgba(245,166,35,0.25)' : 'rgba(239,71,111,0.25)'}`, borderRadius: 10, fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1rem' }}>{Number(liveEmergencyMonths) >= 6 ? '✅' : Number(liveEmergencyMonths) >= 3 ? '⚠️' : '🚨'}</span>
                <span style={{ color: Number(liveEmergencyMonths) >= 6 ? 'var(--teal)' : Number(liveEmergencyMonths) >= 3 ? 'var(--gold)' : 'var(--coral)' }}>
                  Emergency fund covers <strong>{liveEmergencyMonths} months</strong> of expenses
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-faint)', fontWeight: 500 }}>
                  Target: 6 months ({fmtINR(expenses * 6)})
                </span>
              </div>
            )}

            {step === 3 && Number(formData.invest80C) > 0 && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: Number(formData.invest80C) >= 150000 ? 'rgba(6,214,160,0.08)' : 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim)' }}>80C utilization</span>
                <span style={{ color: Number(formData.invest80C) >= 150000 ? 'var(--teal)' : 'var(--gold)' }}>
                  {fmtINR(Number(formData.invest80C))} / ₹1.5L
                  {Number(formData.invest80C) < 150000 && <span style={{ color: 'var(--coral)', marginLeft: 8 }}>({fmtINR(150000 - Number(formData.invest80C))} gap!)</span>}
                </span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', background: 'rgba(239,71,111,0.07)', border: '1px solid rgba(239,71,111,0.2)', borderRadius: 12, marginTop: 14 }}>
              <AlertCircle size={16} color="var(--coral)" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: '0.84rem', color: 'var(--coral)', lineHeight: 1.5 }}>{error}</span>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.88rem', fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            {!isLastStep ? (
              <button onClick={() => setStep(s => s + 1)}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, var(--gold), #e8960f)', color: 'var(--ink)', fontWeight: 800, fontSize: '0.92rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-body)', boxShadow: '0 4px 18px rgba(245,166,35,0.3)', transition: 'all 0.2s' }}>
                Next Step <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={loading}
                style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: loading ? 'var(--surface-3)' : 'linear-gradient(135deg, var(--gold), #e8960f)', color: loading ? 'var(--text-dim)' : 'var(--ink)', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-body)', boxShadow: loading ? 'none' : '0 4px 20px rgba(245,166,35,0.35)', transition: 'all 0.2s' }}>
                {loading ? <><Loader size={16} /> Analysing…</> : <><Star size={16} /> Get My Health Score 🚀</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* What you'll get (first step only) */}
      {step === 0 && !loading && (
        <div style={{ marginTop: 24, padding: '18px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14 }}>
            What You'll Get — Free
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['🏆', 'Score out of 100', '6-dimension breakdown'],
              ['💸', 'What you\'re losing', 'Exact ₹ lost to bad planning'],
              ['🎮', 'What-If Simulator', 'Drag to see score improve live'],
              ['📅', 'Your roadmap', '3-month, 1-year, 3-year plan'],
              ['⚡', '1-Click Fix Plan', '3 actions to take this week'],
              ['🔥', 'AI Roast Mode', 'Brutally honest about your gaps'],
            ].map(([emoji, title, sub]) => (
              <div key={title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10 }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{emoji}</span>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>{title}</div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-faint)', marginTop: 1 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}