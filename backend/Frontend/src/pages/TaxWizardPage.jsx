import React, { useState } from 'react';
import {
  FileText, Calculator, Zap, RotateCcw, Upload,
  CheckCircle, AlertTriangle, TrendingDown, TrendingUp,
  ChevronRight, Info, Target, Lightbulb
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie
} from 'recharts';
import { callGemini, TAX_SYSTEM } from '../utils/gemini';
import ReactMarkdown from "react-markdown";

function parseAmt(v) {
  if (!v) return 0;
  return Number(v.toString().replace(/,/g, '')) || 0;
}

function calcHRAExemption(salary, hra, rent, isMetro) {
  const basic = salary * 0.5; 

  const actualHRA = hra;

  const rentMinus10 = Math.max(rent - 0.1 * basic, 0);

  const percentBasic = isMetro
    ? 0.5 * basic
    : 0.4 * basic;

  return Math.min(actualHRA, rentMinus10, percentBasic);
}

function calcTaxOldRegime(taxableIncome) {
  if (taxableIncome <= 250000) return 0;
  let tax = 0;
  if (taxableIncome > 1000000) {
    tax += (taxableIncome - 1000000) * 0.30;
    taxableIncome = 1000000;
  }
  if (taxableIncome > 500000) {
    tax += (taxableIncome - 500000) * 0.20;
    taxableIncome = 500000;
  }
  if (taxableIncome > 250000) {
    tax += (taxableIncome - 250000) * 0.05;
  }
  // 87A rebate — if taxable income ≤ 5L, tax = 0
  const baseTax = tax;
  if (baseTax <= 12500 && taxableIncome <= 500000) return 0;
  return Math.round(tax * 1.04); // +4% cess
}

function calcTaxNewRegime(income) {

  if (income <= 300000) return 0;

  let tax = 0;

  const slabs = [
    [300000, 600000, 0.05],
    [600000, 900000, 0.10],
    [900000, 1200000, 0.15],
    [1200000, 1500000, 0.20],
    [1500000, Infinity, 0.30],
  ];

  for (const [low, high, rate] of slabs) {
    if (income > low) {
      tax += (Math.min(income, high) - low) * rate;
    }
  }

  if (income <= 700000) return 0;

  return Math.round(tax * 1.04);
}

function analyzeDeductions(data) {
  const salary = parseAmt(data.salary);
  const c80 = Math.min(
    parseAmt(data.epf) + parseAmt(data.elss) + parseAmt(data.ppf) +
    parseAmt(data.lifeInsurance) + parseAmt(data.homeLoanPrincipal),
    150000
  );
  const nps = Math.min(parseAmt(data.nps), 50000);
  const health = Math.min(parseAmt(data.healthInsurance), 25000);
  const homeLoanInterest = Math.min(parseAmt(data.homeLoanInterest), 200000);
  const hra = calcHRAExemption(
    salary, parseAmt(data.hra), parseAmt(data.rent), data.isMetro
  );

  const unused80C = Math.max(150000 - c80, 0);
  const unusedNPS = Math.max(50000 - nps, 0);
  const unusedHealth = Math.max(25000 - health, 0);

  const totalDeductions = c80 + nps + health + homeLoanInterest + hra + 50000; // std deduction

  const taxableOld = Math.max(salary - totalDeductions, 0);
  const taxOld = calcTaxOldRegime(taxableOld);

  // New regime: only standard deduction of ₹75,000
  const taxableNew = Math.max(salary - 75000, 0);
  const taxNew = calcTaxNewRegime(taxableNew);

  const bestRegime = taxOld <= taxNew ? 'Old Regime' : 'New Regime';
  const savings = Math.abs(taxOld - taxNew);

  const missed = [];
  if (unused80C > 0) missed.push({ label: '80C Gap', amount: unused80C, tip: `Invest ₹${(unused80C/1000).toFixed(0)}K more in ELSS/PPF/LIC to fill 80C` });
  if (unusedNPS > 0) missed.push({ label: 'NPS (80CCD 1B)', amount: unusedNPS, tip: `Add ₹${(unusedNPS/1000).toFixed(0)}K to NPS for extra deduction` });
  if (unusedHealth > 0) missed.push({ label: 'Health Insurance (80D)', amount: unusedHealth, tip: `Buy/upgrade health insurance — ₹${(unusedHealth/1000).toFixed(0)}K more deductible` });
  if (!parseAmt(data.hra) && !parseAmt(data.rent)) missed.push({ label: 'HRA Exemption', amount: 0, tip: 'If you pay rent, claim HRA exemption from salary' });

  return {
    taxOld, taxNew, bestRegime, savings,
    taxableOld, taxableNew,
    totalDeductions, c80, nps, health, hra,
    missed, unused80C, unusedNPS,
    effectiveOld: salary > 0 ? ((taxOld / salary) * 100).toFixed(1) : 0,
    effectiveNew: salary > 0 ? ((taxNew / salary) * 100).toFixed(1) : 0,
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────

function InputRow({ label, placeholder, value, onChange, prefix = '₹', type = 'text', hint }) {
  return (
    <div>
      <label className="label" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {label}
        {hint && <span title={hint} style={{ color: 'var(--text-faint)', cursor: 'help' }}><Info size={12} /></span>}
      </label>
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-faint)', fontSize: '0.88rem', fontFamily: 'var(--font-mono)'
          }}>{prefix}</span>
        )}
        <input
          className="input-field"
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ paddingLeft: prefix ? 28 : 16 }}
        />
      </div>
    </div>
  );
}

const SAMPLE = {
  salary: '1200000', hra: '240000', rent: '180000', isMetro: true,
  epf: '72000', elss: '30000', ppf: '0', lifeInsurance: '20000',
  homeLoanPrincipal: '0', nps: '0', healthInsurance: '15000',
  homeLoanInterest: '0',
};

const TAX_COLORS = ['#ef476f', '#06d6a0'];

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function TaxWizardPage() {
  const [mode, setMode] = useState('manual'); // 'manual' | 'form16'
  const [step, setStep] = useState('input'); // 'input' | 'loading' | 'results'
  const [data, setData] = useState({
    salary: '', hra: '', rent: '', isMetro: true,
    epf: '', elss: '', ppf: '', lifeInsurance: '',
    homeLoanPrincipal: '', nps: '', healthInsurance: '', homeLoanInterest: '',
  });
  const [form16Text, setForm16Text] = useState('');
  const [result, setResult] = useState(null);
  const [aiExplanation, setAiExplanation] = useState('');
  const [error, setError] = useState('');

  const set = (k, v) => setData(prev => ({ ...prev, [k]: v }));

  const loadSample = () => {
    setData(SAMPLE);
  };

  const handleAnalyze = async () => {
    const salary = parseAmt(mode === 'form16' ? extractSalaryFromText(form16Text) : data.salary);
    if (!salary) { setError('Please enter your annual salary.'); return; }

    setError('');
    setStep('loading');

    const calcData = mode === 'form16' ? parseForm16(form16Text) : data;
    const analysis = analyzeDeductions(calcData);
    setResult(analysis);

    const prompt = buildTaxPrompt(calcData, analysis);
    try {
      const explanation = await callGemini(prompt, TAX_SYSTEM);
      setAiExplanation(explanation);
    } catch (err) {
      setAiExplanation('AI explanation unavailable. Please check your Gemini API key.');
    }
    setStep('results');
  };

  if (step === 'results' && result) {
    const barData = [
      { name: 'Old Regime', tax: Math.round(result.taxOld / 1000) },
      { name: 'New Regime', tax: Math.round(result.taxNew / 1000) },
    ];
    const deductionBreakdown = [
      { name: '80C', value: result.c80 || 0 },
      { name: 'NPS', value: result.nps || 0 },
      { name: '80D', value: result.health || 0 },
      { name: 'HRA', value: result.hra || 0 },
      { name: 'Std. Ded.', value: 50000 },
    ].filter(d => d.value > 0);
    const PIE_COLORS = ['#f5a623', '#06d6a0', '#4cc9f0', '#ef476f', '#7b61ff'];

    return (
      <div style={{ padding: 'clamp(20px, 4vw, 40px)', animation: 'fadeIn 0.5s ease' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div className="tag" style={{ marginBottom: 14, background: 'rgba(6,214,160,0.1)', color: 'var(--teal)', border: '1px solid rgba(6,214,160,0.2)' }}>
            <Calculator size={12} /> Tax Analysis Complete
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', color: 'var(--text)', marginBottom: 8 }}>
            Your Tax Report
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>
            FY 2024-25 · Old vs New Regime · AI-powered recommendations
          </p>
        </div>

        {/* Top metric cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'Old Regime Tax', value: `₹${(result.taxOld / 1000).toFixed(1)}K`, sub: `${result.effectiveOld}% effective`, color: 'var(--coral)', bg: 'var(--coral-dim)' },
            { label: 'New Regime Tax', value: `₹${(result.taxNew / 1000).toFixed(1)}K`, sub: `${result.effectiveNew}% effective`, color: 'var(--teal)', bg: 'var(--teal-dim)' },
            { label: 'Best Regime', value: result.bestRegime, sub: 'Recommended', color: 'var(--gold)', bg: 'var(--gold-dim)' },
            { label: 'You Can Save', value: `₹${(result.savings / 1000).toFixed(1)}K`, sub: 'by switching', color: '#7b61ff', bg: 'rgba(123,97,255,0.1)' },
          ].map((m, i) => (
            <div key={i} style={{ background: m.bg, border: `1px solid ${m.color}22`, borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: m.color, lineHeight: 1.2 }}>{m.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 4 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          {/* Regime bar chart */}
          <div className="card">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
              Tax Comparison (₹ Thousands)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginBottom: 20 }}>Lower bar = less tax = better choice</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} barSize={52}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `₹${v}K`} />
                <Tooltip formatter={v => [`₹${v}K`, 'Tax']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="tax" radius={[8, 8, 0, 0]}>
                  {barData.map((_, i) => <Cell key={i} fill={TAX_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Deduction pie */}
          <div className="card">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 20 }}>
              Deductions Claimed
            </h3>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <PieChart width={180} height={180}>
                <Pie data={deductionBreakdown} cx={90} cy={90} innerRadius={50} outerRadius={85} dataKey="value">
                  {deductionBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => [`₹${(v/1000).toFixed(1)}K`]} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
              </PieChart>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'center' }}>
              {deductionBreakdown.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name}: ₹{(d.value/1000).toFixed(0)}K
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Missed Deductions */}
        {result.missed.length > 0 && (
          <div className="card" style={{ marginBottom: 24, border: '1px solid rgba(245,166,35,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lightbulb size={18} color="var(--gold)" />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Missed Tax-Saving Opportunities</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Act on these to reduce your tax further</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {result.missed.map((m, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px', background: 'var(--surface-2)',
                  borderRadius: 10, border: '1px solid var(--border)'
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <Target size={14} color="var(--gold)" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>{m.label}</span>
                      {m.amount > 0 && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--gold)', fontWeight: 700 }}>
                          ₹{(m.amount / 1000).toFixed(0)}K unused
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>{m.tip}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Explanation */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,214,160,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={18} color="var(--teal)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>AI Tax Advisor</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Powered by Gemini · Plain English, no jargon</p>
            </div>
          </div>
          {aiExplanation ? (
            <div className="prose-ai" style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>
            <ReactMarkdown>
                {aiExplanation}
            </ReactMarkdown>
            </div>
            ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-faint)', fontSize: '0.88rem' }}>
            <div className="spinner" style={{ width: 16, height: 16 }} />
            Generating AI advice...
            </div>
            )}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-secondary" onClick={() => { setStep('input'); setResult(null); setAiExplanation(''); }}>
            <RotateCcw size={16} /> Recalculate
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 500, gap: 24 }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%',
            border: '3px solid var(--border)',
            borderTop: '3px solid var(--teal)',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calculator size={30} color="var(--teal)" />
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.4rem', color: 'var(--text)', marginBottom: 8 }}>
            Crunching your taxes...
          </h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Comparing regimes, finding deductions, writing your plan</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['var(--teal)', 'var(--gold)', 'var(--coral)'].map((c, i) => (
            <div key={i} className="loading-dot" style={{ background: c, animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Input Form ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', animation: 'fadeIn 0.5s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="tag" style={{ marginBottom: 14, background: 'rgba(6,214,160,0.1)', color: 'var(--teal)', border: '1px solid rgba(6,214,160,0.2)' }}>
          <Calculator size={12} /> Tax Wizard
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', color: 'var(--text)', marginBottom: 8 }}>
          AI Tax Optimizer
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>
          Enter your salary structure · Get old vs new regime comparison · Find every deduction you're missing
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--coral-dim)', border: '1px solid rgba(239,71,111,0.2)', borderRadius: 10, color: 'var(--coral)', fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      {/* Mode switcher */}
      <div style={{
        display: 'flex', background: 'var(--surface-2)', borderRadius: 10,
        padding: 4, marginBottom: 28, border: '1px solid var(--border)', maxWidth: 360
      }}>
        {[['manual', <Calculator size={14} />, 'Manual Input'], ['form16', <FileText size={14} />, 'Form 16 Text']].map(([m, icon, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            flex: 1, padding: '10px 12px', border: 'none', borderRadius: 7, cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'all 0.2s ease',
            background: mode === m ? 'var(--surface-3)' : 'transparent',
            color: mode === m ? 'var(--text)' : 'var(--text-dim)',
            boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
          }}>
            {icon} {label}
          </button>
        ))}
      </div>

      {mode === 'form16' ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <FileText size={18} color="var(--teal)" />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Paste Form 16 / Salary Slip Text</h2>
          </div>
          <textarea
            className="input-field"
            placeholder={`Paste the text content from your Form 16 or salary slip here...\n\nExample:\nGross Salary: 12,00,000\nHRA: 2,40,000\nPF Contribution: 72,000\nTDS: 85,000\n...`}
            value={form16Text}
            onChange={e => setForm16Text(e.target.value)}
            style={{ minHeight: 260, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.6 }}
          />
          <p style={{ fontSize: '0.78rem', color: 'var(--text-faint)', marginTop: 10 }}>
            💡 Copy-paste from your PDF. The AI will extract salary, HRA, PF, and deductions automatically.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Income section */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(6,214,160,0.1)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Income Details</h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Annual figures for FY 2024-25</p>
                </div>
              </div>
              <button onClick={loadSample} className="btn-ghost" style={{ fontSize: '0.8rem', padding: '6px 14px', color: 'var(--teal)' }}>
                Load Sample →
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InputRow label="Annual CTC / Gross Salary" placeholder="12,00,000" value={data.salary} onChange={v => set('salary', v)} hint="Your total annual cost to company" />
              <InputRow label="HRA Received (Annual)" placeholder="2,40,000" value={data.hra} onChange={v => set('hra', v)} hint="House Rent Allowance from salary slip" />
              <InputRow label="Annual Rent Paid" placeholder="1,80,000" value={data.rent} onChange={v => set('rent', v)} hint="Total rent paid in a year" />
              <div>
                <label className="label">City Type</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {[['Metro (Delhi/Mumbai/Kolkata/Chennai)', true], ['Non-Metro', false]].map(([label, val]) => (
                    <button key={String(val)} onClick={() => set('isMetro', val)} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 8, border: '1px solid',
                      fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                      borderColor: data.isMetro === val ? 'var(--teal)' : 'var(--border)',
                      background: data.isMetro === val ? 'rgba(6,214,160,0.1)' : 'var(--surface-2)',
                      color: data.isMetro === val ? 'var(--teal)' : 'var(--text-dim)',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 80C section */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gold-dim)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>80C Investments</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Max deduction: ₹1,50,000 combined</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InputRow label="EPF Contribution" placeholder="72,000" value={data.epf} onChange={v => set('epf', v)} hint="Your share of Provident Fund" />
              <InputRow label="ELSS / Mutual Funds" placeholder="50,000" value={data.elss} onChange={v => set('elss', v)} hint="Tax-saving equity mutual funds" />
              <InputRow label="PPF" placeholder="1,50,000" value={data.ppf} onChange={v => set('ppf', v)} />
              <InputRow label="Life Insurance Premium" placeholder="25,000" value={data.lifeInsurance} onChange={v => set('lifeInsurance', v)} />
              <InputRow label="Home Loan Principal" placeholder="0" value={data.homeLoanPrincipal} onChange={v => set('homeLoanPrincipal', v)} />
            </div>
          </div>

          {/* Other deductions */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(76,201,240,0.1)', color: 'var(--blue-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Other Deductions</h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>NPS, health insurance, home loan interest</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <InputRow label="NPS Contribution (80CCD 1B)" placeholder="50,000" value={data.nps} onChange={v => set('nps', v)} hint="Extra ₹50K deduction over 80C limit" />
              <InputRow label="Health Insurance 80D" placeholder="25,000" value={data.healthInsurance} onChange={v => set('healthInsurance', v)} hint="Self + parents' health insurance premium" />
              <InputRow label="Home Loan Interest (24B)" placeholder="0" value={data.homeLoanInterest} onChange={v => set('homeLoanInterest', v)} hint="Interest on home loan, max ₹2L" />
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
        <button className="btn-primary" onClick={handleAnalyze} style={{ padding: '16px 36px', fontSize: '1rem' }}>
          <Zap size={18} /> Calculate My Tax
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractSalaryFromText(text) {
  const patterns = [
    /gross\s*salary[:\s₹,]*([0-9,]+)/i,
    /annual\s*salary[:\s₹,]*([0-9,]+)/i,
    /ctc[:\s₹,]*([0-9,]+)/i,
    /salary[:\s₹,]*([0-9,]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/,/g, '');
  }
  return '';
}

function extractField(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/,/g, '');
  }
  return '';
}

function parseForm16(text) {
  return {
    salary: extractField(text, [/gross\s*salary[:\s₹,]*([0-9,]+)/i, /ctc[:\s₹,]*([0-9,]+)/i, /salary[:\s₹,]*([0-9,]+)/i]),
    hra: extractField(text, [/hra[:\s₹,]*([0-9,]+)/i, /house\s*rent\s*allowance[:\s₹,]*([0-9,]+)/i]),
    rent: '0',
    isMetro: true,
    epf: extractField(text, [/pf\s*contribution[:\s₹,]*([0-9,]+)/i, /epf[:\s₹,]*([0-9,]+)/i, /provident\s*fund[:\s₹,]*([0-9,]+)/i]),
    elss: extractField(text, [/elss[:\s₹,]*([0-9,]+)/i]),
    ppf: extractField(text, [/ppf[:\s₹,]*([0-9,]+)/i]),
    lifeInsurance: extractField(text, [/life\s*insurance[:\s₹,]*([0-9,]+)/i, /lic[:\s₹,]*([0-9,]+)/i]),
    homeLoanPrincipal: extractField(text, [/home\s*loan\s*principal[:\s₹,]*([0-9,]+)/i]),
    nps: extractField(text, [/nps[:\s₹,]*([0-9,]+)/i]),
    healthInsurance: extractField(text, [/health\s*insurance[:\s₹,]*([0-9,]+)/i, /mediclaim[:\s₹,]*([0-9,]+)/i]),
    homeLoanInterest: extractField(text, [/home\s*loan\s*interest[:\s₹,]*([0-9,]+)/i]),
  };
}

function buildTaxPrompt(data, analysis) {
  const fmt = v => `₹${(parseAmt(v) / 1000).toFixed(0)}K`;
  return `You are helping an Indian taxpayer understand their tax situation for FY 2024-25.

THEIR DATA:
- Annual Salary: ${fmt(data.salary)}
- Old Regime Tax: ₹${(analysis.taxOld / 1000).toFixed(1)}K (effective rate: ${analysis.effectiveOld}%)
- New Regime Tax: ₹${(analysis.taxNew / 1000).toFixed(1)}K (effective rate: ${analysis.effectiveNew}%)
- Recommended: ${analysis.bestRegime} (saves ₹${(analysis.savings / 1000).toFixed(0)}K)
- Total deductions claimed: ₹${(analysis.totalDeductions / 1000).toFixed(0)}K
- Unused 80C: ₹${(analysis.unused80C / 1000).toFixed(0)}K
- Missed deductions: ${analysis.missed.map(m => m.label).join(', ') || 'None'}

Write a personalized tax advice in 4 short sections:
### Which regime should I choose?
### Why is this better for me?
### What should I do right now?
### How much more can I save?

Keep each section to 2-3 bullet points. Use ₹ symbol. Be specific to their numbers. Speak like a friendly CA, not a textbook.`;
}