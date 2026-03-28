import React, { useState } from 'react';
import { Flame, Zap, RotateCcw, TrendingUp, Target } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts';
import { callGemini, FIRE_SYSTEM } from '../utils/gemini';

// ─── helpers ────────────────────────────────────────────────────────────────
function parseNum(str) {
  return Number(String(str).replace(/,/g, '').trim()) || 0;
}
function fmt(n) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function calcFIRE(currentAge, retireAge, monthlyExp, existingCorpus, stepUpPct = 10, cagr = 12) {
  const fireNum   = monthlyExp * 12 * 25;
  const years     = Math.max(retireAge - currentAge, 1);
  const r         = cagr / 100 / 12;
  const n         = years * 12;
  const fvExist   = existingCorpus * Math.pow(1 + cagr / 100, years);
  const gap       = Math.max(fireNum - fvExist, 0);
  const monthlySIP = gap > 0 ? (gap * r) / (Math.pow(1 + r, n) - 1) : 0;
  const swp        = (fireNum * 0.04) / 12;

  // year-by-year growth for chart
  const yearlyData = [];
  let corpus = existingCorpus;
  let sip    = monthlySIP;
  for (let y = 1; y <= years; y++) {
    corpus = corpus * (1 + cagr / 100) + sip * 12;
    if (y % Math.ceil(years / 3) === 0) sip *= (1 + stepUpPct / 100); // step-up
    yearlyData.push({ year: `Yr ${y + currentAge}`, corpus: Math.round(corpus / 100000) });
  }

  return { fireNum, monthlySIP, swp, yearlyData, years };
}

function renderMd(text) {
  return text
    .replace(/###\s(.+)/g,   '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•]\s(.+)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>');
}

// ─── sub-components ──────────────────────────────────────────────────────────
function FieldRow({ label, value, onChange, prefix = '₹', type = 'text', hint }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-faint)', fontSize: '0.86rem', fontFamily: 'var(--font-mono)',
            pointerEvents: 'none',
          }}>{prefix}</span>
        )}
        <input
          className="input-field"
          type={type}
          placeholder={hint || ''}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ paddingLeft: prefix ? 26 : 14 }}
        />
      </div>
    </div>
  );
}

function MetricCard({ label, value, color, bg, sub }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color, lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────
const PURPLE     = '#a78bfa';
const PURPLE_DIM = 'rgba(167,139,250,0.13)';

export default function FirePage() {
  const [form, setForm] = useState({
    age: '',
    retireAge: '',
    monthlyExp: '',
    existingCorpus: '',
    monthlySavings: '',
    risk: 'moderate',
    goals: '',
  });
  const [step, setStep]       = useState('input'); 
  const [result, setResult]   = useState('');
  const [calcs, setCalcs]     = useState(null);
  const [err, setErr]         = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const CAGR_BY_RISK = { conservative: 10, moderate: 12, aggressive: 14 };

  const handleAnalyze = async () => {
    if (!form.age || !form.retireAge || !form.monthlyExp) {
      setErr('Please fill Age, Target FIRE Age, and Monthly Expenses at minimum.');
      return;
    }
    const currentAge     = parseInt(form.age, 10);
    const retireAge      = parseInt(form.retireAge, 10);
    if (retireAge <= currentAge) { setErr('Target FIRE age must be greater than current age.'); return; }

    setErr(''); setStep('loading');

    const cagr          = CAGR_BY_RISK[form.risk] || 12;
    const monthlyExp    = parseNum(form.monthlyExp);
    const existingCorpus = parseNum(form.existingCorpus);
    const c             = calcFIRE(currentAge, retireAge, monthlyExp, existingCorpus, 10, cagr);
    setCalcs(c);

    const prompt = `Create a personalised FIRE roadmap for this Indian investor:

Current Age: ${form.age} | Target FIRE Age: ${form.retireAge} | Years to FIRE: ${c.years}
Monthly Expenses: ₹${Number(form.monthlyExp).toLocaleString('en-IN')}
Existing Corpus: ₹${Number(form.existingCorpus).toLocaleString('en-IN')}
Monthly Savings Capacity: ₹${Number(form.monthlySavings).toLocaleString('en-IN')}
Risk Appetite: ${form.risk} (assuming ${cagr}% CAGR)
Life Goals: ${form.goals}

Pre-calculated numbers:
- FIRE Number (25× annual expenses): ${fmt(c.fireNum)}
- Required Monthly SIP: ${fmt(c.monthlySIP)}
- Post-FIRE monthly income (4% SWR): ${fmt(c.swp)}`;

    try {
      const r = await callGemini(prompt, FIRE_SYSTEM);
      setResult(r);
      setStep('results');
    } catch (e) {
      setErr('Gemini error: ' + e.message);
      setStep('input');
    }
  };

  const reset = () => { setStep('input'); setResult(''); setCalcs(null); };

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', animation: 'fadeIn 0.5s ease' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div className="tag" style={{ background: PURPLE_DIM, color: PURPLE, marginBottom: 14 }}>
          <Flame size={12} /> FIRE Planner
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', color: 'var(--text)', marginBottom: 8,
        }}>
          FIRE Path Planner
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>
          Financial Independence, Retire Early · AI-powered month-by-month roadmap
        </p>
      </div>

      {/* ── INPUT ── */}
      {step === 'input' && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: PURPLE_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Flame size={18} color={PURPLE} />
              </div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Your Financial Profile</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <FieldRow label="Current Age"          value={form.age}           onChange={v => set('age', v)}           prefix="" type="number" hint="28" />
              <FieldRow label="Target FIRE Age"      value={form.retireAge}     onChange={v => set('retireAge', v)}     prefix="" type="number" hint="45" />
              <FieldRow label="Monthly Expenses (₹)" value={form.monthlyExp}    onChange={v => set('monthlyExp', v)}    hint="60000" />
              <FieldRow label="Existing Corpus (₹)"  value={form.existingCorpus} onChange={v => set('existingCorpus', v)} hint="5,00,000" />
              <FieldRow label="Monthly Savings (₹)"  value={form.monthlySavings} onChange={v => set('monthlySavings', v)} hint="40000" />

              {/* Risk appetite */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Risk Appetite</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {[
                    { key: 'conservative', label: 'Conservative', cagr: '10%', color: 'var(--teal)' },
                    { key: 'moderate',     label: 'Moderate',     cagr: '12%', color: 'var(--gold)' },
                    { key: 'aggressive',   label: 'Aggressive',   cagr: '14%', color: PURPLE },
                  ].map(r => (
                    <button
                      key={r.key}
                      onClick={() => set('risk', r.key)}
                      style={{
                        flex: 1, padding: '10px 8px', cursor: 'pointer',
                        border: `1px solid ${form.risk === r.key ? r.color : 'var(--border)'}`,
                        borderRadius: 9,
                        background: form.risk === r.key ? `${r.color}18` : 'var(--surface-2)',
                        color: form.risk === r.key ? r.color : 'var(--text-dim)',
                        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.83rem',
                        transition: 'all 0.2s',
                      }}
                    >
                      {r.label}
                      <div style={{ fontSize: '0.68rem', opacity: 0.8, marginTop: 2 }}>~{r.cagr} CAGR</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Goals */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Life Goals</label>
                <textarea
                  className="input-field"
                  placeholder="Travel annually, kids education, own a home by 35..."
                  value={form.goals}
                  onChange={e => set('goals', e.target.value)}
                  style={{ minHeight: 72, resize: 'none', paddingLeft: 14 }}
                />
              </div>
            </div>
          </div>

          {err && (
            <div style={{ padding: '10px 14px', background: 'var(--coral-dim)', border: '1px solid rgba(239,71,111,.2)', borderRadius: 9, color: 'var(--coral)', fontSize: '0.85rem' }}>
              {err}
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleAnalyze}
            style={{ padding: '15px 34px', fontSize: '0.98rem', background: `linear-gradient(135deg, ${PURPLE}, #7c3aed)`, width: 'fit-content' }}
          >
            <Flame size={17} color="#fff" /> Generate My FIRE Roadmap
          </button>

          {/* What is FIRE explainer */}
          <div className="card" style={{ background: PURPLE_DIM, border: `1px solid ${PURPLE}22` }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: PURPLE, marginBottom: 10 }}>
              💡 What is FIRE?
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.8 }}>
              Financial Independence, Retire Early (FIRE) is about saving aggressively so you can live off investments — long before the traditional age 60.{' '}
              The formula: save <strong style={{ color: 'var(--text)' }}>25× your annual expenses</strong> and you can withdraw{' '}
              <strong style={{ color: 'var(--text)' }}>4% per year</strong> indefinitely (safe withdrawal rate).
            </p>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {step === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 78, height: 78, borderRadius: '50%',
              border: `3px solid var(--border)`, borderTopColor: PURPLE,
              animation: 'spin 1s linear infinite',
            }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem' }}>
              🔥
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--text)', marginBottom: 7 }}>
              Charting your FIRE path…
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>
              Building your month-by-month roadmap, SIP splits & milestones
            </p>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {[PURPLE, '#c4b5fd', '#ddd6fe'].map((c, i) => (
              <div key={i} className="loading-dot" style={{ background: c, animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {step === 'results' && calcs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
            <MetricCard label="FIRE Number"            value={fmt(calcs.fireNum)}    color={PURPLE}              bg={PURPLE_DIM}                    sub="25× annual expenses" />
            <MetricCard label="Monthly SIP Needed"     value={fmt(calcs.monthlySIP)} color="var(--gold)"         bg="var(--gold-dim)"               sub={`${CAGR_BY_RISK[form.risk]}% CAGR assumed`} />
            <MetricCard label="Years to FIRE"          value={`${calcs.years} yrs`}  color="var(--teal)"         bg="var(--teal-dim)"               sub={`Retire at ${form.retireAge}`} />
            <MetricCard label="Monthly Passive Income" value={fmt(calcs.swp)}        color="var(--blue-bright)"  bg="rgba(76,201,240,0.1)"          sub="4% safe withdrawal rate" />
          </div>

          {/* Corpus growth chart */}
          <div className="card">
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 4, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Projected Corpus Growth (₹ Lakhs)
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-faint)', marginBottom: 18 }}>
              Assuming {CAGR_BY_RISK[form.risk]}% CAGR with 10% annual SIP step-up
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={calcs.yearlyData}>
                <defs>
                  <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={PURPLE} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={PURPLE} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="year"
                  tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
                  interval={Math.max(Math.floor(calcs.yearlyData.length / 8) - 1, 0)}
                />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `₹${v}L`} />
                <Tooltip
                  formatter={v => [`₹${v}L`, 'Corpus']}
                  contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="corpus" stroke={PURPLE} strokeWidth={2.5} fill="url(#purpleGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Two info cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ background: PURPLE_DIM, border: `1px solid ${PURPLE}22` }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🎯</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Your FIRE Number
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: PURPLE, marginBottom: 8 }}>
                {fmt(calcs.fireNum)}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.65 }}>
                Based on ₹{Number(form.monthlyExp).toLocaleString('en-IN')}/month expenses × 12 × 25.
                Once you hit this, you are financially free forever.
              </p>
            </div>
            <div className="card" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(245,166,35,.2)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📈</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Monthly SIP Required
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 8 }}>
                {fmt(calcs.monthlySIP)}
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.65 }}>
                Invest this every month at {CAGR_BY_RISK[form.risk]}% CAGR to reach your FIRE number in {calcs.years} years. Increase by 10% every year.
              </p>
            </div>
          </div>

          {/* AI report */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: PURPLE_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                🔥
              </div>
              <div>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700 }}>Your Personalised FIRE Roadmap</h3>
                <p style={{ fontSize: '0.73rem', color: 'var(--text-dim)' }}>Powered by Gemini AI · Indian instruments & tax laws</p>
              </div>
            </div>
            <div
              className="prose-ai"
              style={{ fontSize: '0.9rem' }}
              dangerouslySetInnerHTML={{ __html: '<p>' + renderMd(result) + '</p>' }}
            />
          </div>

          <button className="btn-secondary" onClick={reset} style={{ width: 'fit-content' }}>
            <RotateCcw size={15} /> Recalculate FIRE Plan
          </button>
        </div>
      )}
    </div>
  );
}
