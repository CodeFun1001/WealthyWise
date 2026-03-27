import React, { useState } from 'react';
import { Heart, Users, Zap, RotateCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { callGemini, COUPLES_SYSTEM } from '../utils/gemini';

const REGIME_COLORS = ['#f5a623', '#06d6a0'];

const defaultPartner = {
  name: '', age: '', income: '', employer: '', hra: '', rent: '',
  epf: '', nps: '', lifeInsurance: '', elss: '', ppf: '',
  homeLoanInterest: '', homeLoanPrincipal: '', healthInsurance: '', loans: ''
};

function InputRow({ label, placeholder, value, onChange, prefix = '₹', type = 'text' }) {
  return (
    <div>
      <label className="label">{label}</label>
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

function PartnerForm({ title, color, colorDim, data, onChange, icon }) {
  const field = (key, label, placeholder, prefix = '₹') => (
    <InputRow label={label} placeholder={placeholder} prefix={prefix}
      value={data[key]} onChange={v => onChange(key, v)} />
  );

  return (
    <div className="card" style={{ border: `1px solid ${color}22` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: colorDim, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Income & deductions</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <InputRow label="Full Name" placeholder="Arjun Sharma" value={data.name} onChange={v => onChange('name', v)} prefix="" type="text" />
        <InputRow label="Age" placeholder="32" value={data.age} onChange={v => onChange('age', v)} prefix="" type="number" />

        <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Income</div>
        </div>

        {field('income', 'Annual CTC', '15,00,000')}
        {field('hra', 'HRA Received / yr', '2,40,000')}
        {field('rent', 'Annual Rent Paid', '1,80,000')}

        <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>80C Investments (Annual)</div>
        </div>

        {field('epf', 'EPF Contribution', '72,000')}
        {field('elss', 'ELSS / Mutual Funds', '50,000')}
        {field('ppf', 'PPF Contribution', '1,50,000')}
        {field('lifeInsurance', 'Life Insurance Premium', '25,000')}
        {field('homeLoanPrincipal', 'Home Loan Principal', '0')}

        <div style={{ gridColumn: '1/-1', borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Other Deductions</div>
        </div>

        {field('nps', 'NPS (80CCD 1B)', '50,000')}
        {field('healthInsurance', 'Health Insurance (80D)', '25,000')}
        {field('homeLoanInterest', 'Home Loan Interest', '0')}
        {field('loans', 'Total EMIs / month', '0')}
      </div>
    </div>
  );
}

export default function CouplesPage() {
  const [p1, setP1] = useState({ ...defaultPartner, name: 'Partner 1' });
  const [p2, setP2] = useState({ ...defaultPartner, name: 'Partner 2' });
  const [step, setStep] = useState('input'); // input | loading | results
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const updateP1 = (k, v) => setP1(prev => ({ ...prev, [k]: v }));
  const updateP2 = (k, v) => setP2(prev => ({ ...prev, [k]: v }));
  const parseAmount = (value) => {
    if (!value) return 0;
    return Number(value.toString().replace(/,/g, ''));
  };

  const calcDeductions = (p) => {
    const epf = parseAmount(p.epf);
    const elss = parseAmount(p.elss);
    const ppf = parseAmount(p.ppf);
    const life = parseAmount(p.lifeInsurance);
    const homePrincipal = parseAmount(p.homeLoanPrincipal);

    const total80C = Math.min(epf + elss + ppf + life + homePrincipal, 150000);

    const nps = Math.min(parseAmount(p.nps), 50000);
    const health = Math.min(parseAmount(p.healthInsurance), 25000);
    const interest = Math.min(parseAmount(p.homeLoanInterest), 200000);

    return total80C + nps + health + interest;
  };

  const calcTax = (income, regime = 'new') => {
    const inc = parseAmount(income);
    if (regime === 'new') {
      if (inc <= 300000) return 0;
      if (inc <= 700000) return (inc - 300000) * 0.05;
      if (inc <= 1000000) return 20000 + (inc - 700000) * 0.1;
      if (inc <= 1200000) return 50000 + (inc - 1000000) * 0.15;
      if (inc <= 1500000) return 80000 + (inc - 1200000) * 0.2;
      return 140000 + (inc - 1500000) * 0.3;
    }
    if (inc <= 250000) return 0;
    if (inc <= 500000) return (inc - 250000) * 0.05;
    if (inc <= 1000000) return 12500 + (inc - 500000) * 0.2;
    return 112500 + (inc - 1000000) * 0.3;
  };


  const analyzeResults = () => {
    const income1 = parseAmount(p1.income) 
    const income2 = parseAmount(p2.income) 

    const deductions1 = calcDeductions(p1);
    const deductions2 = calcDeductions(p2);

    const taxableOld1 = Math.max(income1 - deductions1 - 50000, 0);
    const taxableOld2 = Math.max(income2 - deductions2 - 50000, 0);

    const taxOld1 = calcTax(taxableOld1, 'old');
    const taxOld2 = calcTax(taxableOld2, 'old');

    const taxNew1 = calcTax(income1, 'new');
    const taxNew2 = calcTax(income2, 'new');

    return {
      combined: income1 + income2,
      tax1New: taxNew1,
      tax1Old: taxOld1,
      tax2New: taxNew2,
      tax2Old: taxOld2,
      savings: (taxOld1 + taxOld2) - (taxNew1 + taxNew2),
      regimeAdvice1: taxNew1 < taxOld1 ? 'New Regime' : 'Old Regime',
      regimeAdvice2: taxNew2 < taxOld2 ? 'New Regime' : 'Old Regime'
    };
    };

  const handleAnalyze = async () => {
    if (!p1.income && !p2.income) { setError('Please enter income for at least one partner.'); return; }
    setError('');
    setStep('loading');

    try {
      const prompt = `
        You are India's top financial planner.

        Analyze this couple's financial situation and optimize across both partners.

        Goals:
        - minimize combined tax
        - maximize deductions
        - optimize investments

        Partner 1:
        Income ₹${p1.income}
        HRA ₹${p1.hra}
        Rent ₹${p1.rent}
        80C investments ₹${p1.epf + p1.elss + p1.ppf}

        Partner 2:
        Income ₹${p2.income}
        HRA ₹${p2.hra}
        Rent ₹${p2.rent}
        80C investments ₹${p2.epf + p2.elss + p2.ppf}

        Provide structured sections:

        1. Tax regime recommendation
        2. HRA optimization strategy
        3. 80C redistribution between partners
        4. NPS strategy
        5. Monthly SIP plan
        6. Insurance coverage gaps
        7. 5-year wealth roadmap
        8. Top 5 actions ranked by impact

        Be concise and practical.
        `;

      const response = await callGemini(prompt, COUPLES_SYSTEM);
      setResult(response);
      setStep('results');
    } catch (err) {
      setError('Gemini API error: ' + err.message + '. Please add your VITE_GEMINI_API_KEY.');
      setStep('input');
    }
  };

  const formatMarkdown = (text) => {
    return text
      .replace(/###\s(.+)/g, '<h3 style="color:var(--coral);font-family:var(--font-display);font-style:italic;font-size:1.1rem;margin:20px 0 8px">$1</h3>')
      .replace(/##\s(.+)/g, '<h3 style="color:var(--coral);font-family:var(--font-display);font-style:italic;font-size:1.1rem;margin:20px 0 8px">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--gold-light)">$1</strong>')
      .replace(/^-\s(.+)/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p style="margin:8px 0">');
  };

  const summary = analyzeResults();
  const regimeData = [
    { name: p1.name || 'Partner 1', old: Math.round(summary.tax1Old / 1000), new: Math.round(summary.tax1New / 1000) },
    { name: p2.name || 'Partner 2', old: Math.round(summary.tax2Old / 1000), new: Math.round(summary.tax2New / 1000) },
  ];

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', animation: 'fadeIn 0.5s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="tag tag-coral" style={{ marginBottom: 14 }}>
          <Heart size={12} /> Couple's Planner
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', color: 'var(--text)', marginBottom: 8 }}>
          Joint Financial Planning
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>
          India's first AI-powered couple's planner · Optimize tax, SIP & insurance across both incomes
        </p>
      </div>

      {step === 'input' && (
        <>
          {error && (
            <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--coral-dim)', border: '1px solid rgba(239,71,111,0.2)', borderRadius: 10, color: 'var(--coral)', fontSize: '0.88rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20, marginBottom: 24 }}>
            <PartnerForm
              title="Partner 1" color="var(--gold)" colorDim="var(--gold-dim)"
              data={p1} onChange={updateP1}
              icon={<Users size={18} />}
            />
            <PartnerForm
              title="Partner 2" color="var(--coral)" colorDim="var(--coral-dim)"
              data={p2} onChange={updateP2}
              icon={<Heart size={18} />}
            />
          </div>

          <button className="btn-primary" onClick={handleAnalyze} style={{ padding: '16px 36px', fontSize: '1rem' }}>
            <Zap size={18} /> Generate Joint Financial Plan
          </button>
        </>
      )}

      {step === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              border: '3px solid var(--border)',
              borderTop: '3px solid var(--coral)',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Heart size={28} color="var(--coral)" />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.3rem', color: 'var(--text)', marginBottom: 8 }}>
              Optimizing your joint finances...
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Calculating tax savings, SIP splits & insurance gaps</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="loading-dot" style={{ background: 'var(--coral)' }} />
            <div className="loading-dot" style={{ background: 'var(--coral)', animationDelay: '0.2s' }} />
            <div className="loading-dot" style={{ background: 'var(--coral)', animationDelay: '0.4s' }} />
          </div>
        </div>
      )}

      {step === 'results' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Summary metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16 }}>
            {[
              { label: 'Combined Income', value: `₹${(summary.combined / 100000).toFixed(1)}L`, color: 'var(--gold)', bg: 'var(--gold-dim)' },
              { label: `${p1.name || 'P1'} — Recommended`, value: summary.regimeAdvice1, color: 'var(--teal)', bg: 'var(--teal-dim)' },
              { label: `${p2.name || 'P2'} — Recommended`, value: summary.regimeAdvice2, color: 'var(--blue-bright)', bg: 'rgba(76,201,240,0.1)' },
              { label: 'Potential Tax Saved', value: `₹${(summary.savings / 1000).toFixed(0)}K`, color: 'var(--coral)', bg: 'var(--coral-dim)' },
            ].map((m, i) => (
              <div key={i} style={{ background: m.bg, border: `1px solid ${m.color}22`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: m.color, lineHeight: 1.2 }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Tax comparison chart */}
          <div className="card">
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 4, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Old vs New Tax Regime Comparison (₹ Thousands)
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-faint)', marginBottom: 20 }}>Lower bar = less tax = better regime for that partner</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={regimeData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `₹${v}K`} />
                <Tooltip formatter={(v, n) => [`₹${v}K`, n === 'old' ? 'Old Regime' : 'New Regime']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-body)' }} />
                <Bar dataKey="old" fill="var(--coral)" name="Old Regime" radius={[6, 6, 0, 0]} />
                <Bar dataKey="new" fill="var(--teal)" name="New Regime" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 20, marginTop: 16, justifyContent: 'center' }}>
              {[['Old Regime', 'var(--coral)'], ['New Regime', 'var(--teal)']].map(([l, c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* AI Report */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--coral-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={18} color="var(--coral)" />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>AI Joint Financial Plan</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Powered by Gemini AI · Personalized for Indian tax laws</p>
              </div>
            </div>
            <div
              className="prose-ai"
              style={{ fontSize: '0.9rem' }}
              dangerouslySetInnerHTML={{ __html: '<p>' + formatMarkdown(result) + '</p>' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-secondary" onClick={() => { setStep('input'); setResult(''); }}>
              <RotateCcw size={16} /> Edit & Recalculate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}