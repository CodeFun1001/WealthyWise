import React, { useState, useRef } from 'react';
import {
  FileText, Zap, RotateCcw, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Sparkles, Calculator, Lightbulb,
  Newspaper, Upload, X, Info, ExternalLink, ArrowRight,
  BookOpen, Target, DownloadCloud, Eye
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function callGeminiDirect(prompt) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, topP: 0.9 },
  };
  const res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Gemini API error');
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts || []).map(p => p.text).join('');
}

// ─── Local tax engine (fallback when backend is offline) ─────────────────────
const parseAmt = v => Number(String(v || 0).replace(/,/g, '')) || 0;

function localCalcOld(gross, ded, hra, rent, metro) {
  const basic = gross * 0.4;
  const hraEx = hra > 0 && rent > 0 ? Math.max(Math.min(hra, rent - basic * 0.1, basic * (metro ? 0.5 : 0.4)), 0) : 0;
  const taxable = Math.max(gross - 50000 - ded - hraEx, 0);
  let tax = taxable > 1000000 ? 112500 + (taxable - 1000000) * 0.3
          : taxable > 500000  ? 12500  + (taxable - 500000)  * 0.2
          : taxable > 250000  ? (taxable - 250000) * 0.05 : 0;
  if (taxable <= 500000) tax = 0;
  return { total_tax: Math.round(tax * 1.04), taxable_income: Math.round(taxable), hraEx: Math.round(hraEx), effective_rate: +((tax * 1.04 / gross) * 100).toFixed(2) };
}

function localCalcNew(gross) {
  const taxable = Math.max(gross - 75000, 0);
  let tax = taxable > 1500000 ? 150000 + (taxable - 1500000) * 0.3
          : taxable > 1200000 ? 90000  + (taxable - 1200000) * 0.2
          : taxable > 1000000 ? 60000  + (taxable - 1000000) * 0.15
          : taxable > 800000  ? 40000  + (taxable - 800000)  * 0.1
          : taxable > 400000  ? 20000  + (taxable - 400000)  * 0.05 : 0;
  if (taxable <= 700000) tax = 0;
  return { total_tax: Math.round(tax * 1.04), taxable_income: Math.round(taxable), effective_rate: +((tax * 1.04 / gross) * 100).toFixed(2) };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = n => {
  if (!n) return '₹0';
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

function fmtMd(text) {
  return text
    .replace(/###\s(.+)/g, '<h3 style="color:var(--gold);font-size:1rem;font-weight:700;margin:18px 0 7px">$1</h3>')
    .replace(/##\s(.+)/g,  '<h3 style="color:var(--gold);font-size:1rem;font-weight:700;margin:18px 0 7px">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
    .replace(/^[-•]\s(.+)/gm, '<li style="margin:4px 0;color:var(--text-dim)">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul style="padding-left:16px;margin:8px 0">$&</ul>')
    .replace(/\n\n/g, '</p><p style="margin:5px 0;color:var(--text-dim)">');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, placeholder, value, onChange, prefix = '₹', hint, readOnly }) {
  return (
    <div>
      <label className="label" style={{ marginBottom: 3 }}>{label}</label>
      {hint && <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginBottom: 4 }}>{hint}</div>}
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.83rem', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>{prefix}</span>}
        <input
          className="input-field"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange && onChange(e.target.value)}
          readOnly={readOnly}
          style={{ paddingLeft: prefix ? 24 : 12, background: readOnly ? 'var(--surface-3)' : undefined }}
        />
      </div>
    </div>
  );
}

function Section({ title, color = 'var(--gold)', open: defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <button onClick={() => setOpen(!open)} style={{ all: 'unset', cursor: 'pointer', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: open ? 14 : 0 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</span>
        {open ? <ChevronUp size={13} color="var(--text-faint)" /> : <ChevronDown size={13} color="var(--text-faint)" />}
      </button>
      {open && children}
    </div>
  );
}

// ─── ITR Guide Overlay ────────────────────────────────────────────────────────
function ITRGuide({ steps, onClose }) {
  const [active, setActive] = useState(0);
  const step = steps[active];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 620, background: 'var(--surface)', border: '1px solid var(--border-bright)', borderRadius: 20, overflow: 'hidden', animation: 'fadeIn 0.3s ease' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg, rgba(6,214,160,0.08), transparent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--teal-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={18} color="var(--teal)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>ITR Filing Guide</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Step-by-step · AY 2025-26</div>
            </div>
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-faint)', padding: 6 }}><X size={18} /></button>
        </div>

        {/* Progress dots */}
        <div style={{ padding: '14px 24px 0', display: 'flex', gap: 6 }}>
          {steps.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{ all: 'unset', cursor: 'pointer', height: 4, flex: 1, borderRadius: 2, background: i <= active ? 'var(--teal)' : 'var(--surface-3)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--teal-dim)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0 }}>
              {step.step_number}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {step.portal_section}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginBottom: 4 }}>FIELD TO FILL</div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>{step.field_name}</div>
          </div>

          {/* Value box — like a form mockup */}
          <div style={{ padding: '12px 16px', background: 'var(--surface-2)', border: '2px solid var(--teal)', borderRadius: 10, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, animation: 'pulse 2s infinite' }} />
            <div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginBottom: 2 }}>Enter this value:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--teal)', fontSize: '1rem' }}>{step.value_to_enter}</div>
            </div>
          </div>

          <div style={{ fontSize: '0.86rem', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 18 }}>
            {step.instruction}
          </div>

          <a href={step.url_hint} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>
            Open ITR Portal <ExternalLink size={13} />
          </a>
        </div>

        {/* Navigation */}
        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0} style={{ fontSize: '0.85rem', opacity: active === 0 ? 0.4 : 1 }}>
            ← Prev
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>{active + 1} / {steps.length}</span>
          {active < steps.length - 1
            ? <button className="btn-primary" onClick={() => setActive(a => a + 1)} style={{ fontSize: '0.85rem' }}>Next Step →</button>
            : <button className="btn-primary" onClick={onClose} style={{ fontSize: '0.85rem', background: 'linear-gradient(135deg, var(--teal), #059669)' }}>✓ Done</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── Sample profiles ──────────────────────────────────────────────────────────
const SAMPLES = [
  { label: 'Software Engineer · Mumbai · ₹12L', gross: '1200000', hra: '240000', rent: '180000', isMetro: true, epf: '72000', elss: '50000', ppf: '', lic: '15000', nps: '', health: '12000', tds: '95000' },
  { label: 'Teacher · Bangalore · ₹8L', gross: '800000', hra: '120000', rent: '96000', isMetro: true, epf: '48000', elss: '', ppf: '60000', lic: '25000', nps: '50000', health: '20000', tds: '28000' },
  { label: 'Manager · Pune · ₹18L (Home Loan)', gross: '1800000', hra: '', rent: '', isMetro: false, epf: '108000', elss: '42000', ppf: '', lic: '', nps: '50000', health: '25000', homeInterest: '180000', tds: '230000' },
];

const DEFAULT = { gross: '', hra: '', rent: '', isMetro: false, epf: '', elss: '', ppf: '', lic: '', homePrincipal: '', nps: '', health: '', homeInterest: '', tds: '' };

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TaxWizardPage() {
  const [data, setData] = useState(DEFAULT);
  const [step, setStep] = useState('input'); // input | loading | results
  const [results, setResults] = useState(null);
  const [aiText, setAiText] = useState('');
  const [newsItems, setNewsItems] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [showITRGuide, setShowITRGuide] = useState(false);
  const [itrSteps, setItrSteps] = useState([]);
  const [inputMode, setInputMode] = useState('manual'); // 'manual' | 'pdf' | 'text'
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfText, setPdfText] = useState('');
  const [pdfParsed, setPdfParsed] = useState(null);
  const fileRef = useRef(null);

  const set = k => v => setData(p => ({ ...p, [k]: v }));

  const loadSample = (idx) => {
    const s = SAMPLES[idx];
    setData({ gross: s.gross, hra: s.hra || '', rent: s.rent || '', isMetro: s.isMetro, epf: s.epf || '', elss: s.elss || '', ppf: s.ppf || '', lic: s.lic || '', homePrincipal: s.homePrincipal || '', nps: s.nps || '', health: s.health || '', homeInterest: s.homeInterest || '', tds: s.tds || '' });
    setInputMode('manual');
  };

  const handleFileChange = e => {
    const f = e.target.files[0];
    if (f) { setPdfFile(f); setInputMode('pdf'); }
  };

  const handleDrop = e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') { setPdfFile(f); setInputMode('pdf'); }
  };

  // ── Analyze via backend (preferred) or local fallback ─────────────────────
  const analyze = async () => {
    if (!data.gross && inputMode === 'manual') { setError('Please enter your gross salary, or upload Form 16.'); return; }
    setError(''); setWarnings([]); setStep('loading');

    try {
      // Try backend first
      let result = null;
      let backendSuccess = false;

      if (import.meta.env.VITE_API_BASE) {
        try {
          const formData = new FormData();
          formData.append('gross_salary', parseAmt(data.gross));
          formData.append('hra_received', parseAmt(data.hra));
          formData.append('rent_paid', parseAmt(data.rent));
          formData.append('is_metro', data.isMetro);
          formData.append('epf', parseAmt(data.epf));
          formData.append('elss', parseAmt(data.elss));
          formData.append('ppf', parseAmt(data.ppf));
          formData.append('lic', parseAmt(data.lic));
          formData.append('home_principal', parseAmt(data.homePrincipal));
          formData.append('nps_80ccd1b', parseAmt(data.nps));
          formData.append('health_insurance_80d', parseAmt(data.health));
          formData.append('home_loan_interest', parseAmt(data.homeInterest));
          formData.append('tds_deducted', parseAmt(data.tds));
          if (pdfFile) formData.append('pdf_file', pdfFile);

          const resp = await fetch(`${API_BASE}/api/tax/analyze`, { method: 'POST', body: formData });
          if (resp.ok) {
            result = await resp.json();
            backendSuccess = true;
          }
        } catch (_) { /* fall through to local */ }
      }

      if (!backendSuccess) {
        // Local calculation fallback
        const gross = parseAmt(data.gross);
        const ded = Math.min(parseAmt(data.epf) + parseAmt(data.elss) + parseAmt(data.ppf) + parseAmt(data.lic) + parseAmt(data.homePrincipal), 150000) + Math.min(parseAmt(data.nps), 50000) + Math.min(parseAmt(data.health), 25000) + Math.min(parseAmt(data.homeInterest), 200000);
        const old = localCalcOld(gross, ded, parseAmt(data.hra), parseAmt(data.rent), data.isMetro);
        const nw = localCalcNew(gross);
        const better = old.total_tax <= nw.total_tax ? 'old' : 'new';
        const savings = Math.abs(old.total_tax - nw.total_tax);

        const sec80C = Math.min(parseAmt(data.epf) + parseAmt(data.elss) + parseAmt(data.ppf) + parseAmt(data.lic) + parseAmt(data.homePrincipal), 150000);
        const missed = [];
        if (sec80C < 150000) missed.push({ section: '80C', label: 'ELSS / PPF / LIC', current_amount: sec80C, max_limit: 150000, unused_amount: 150000 - sec80C, estimated_tax_saving: Math.round((150000 - sec80C) * 0.3), recommended_instrument: 'ELSS Mutual Fund', action_tip: `Invest ₹${((150000 - sec80C) / 1000).toFixed(0)}K more in ELSS.` });
        if (parseAmt(data.nps) < 50000) missed.push({ section: '80CCD(1B)', label: 'NPS Tier-1', current_amount: parseAmt(data.nps), max_limit: 50000, unused_amount: 50000 - parseAmt(data.nps), estimated_tax_saving: Math.round((50000 - parseAmt(data.nps)) * 0.3), recommended_instrument: 'NPS Tier-1', action_tip: 'Open NPS Tier-1 for exclusive ₹50K deduction.' });
        if (parseAmt(data.health) < 25000) missed.push({ section: '80D', label: 'Health Insurance', current_amount: parseAmt(data.health), max_limit: 25000, unused_amount: 25000 - parseAmt(data.health), estimated_tax_saving: Math.round((25000 - parseAmt(data.health)) * 0.3), recommended_instrument: 'Family Floater Health Insurance', action_tip: 'Buy health insurance to claim 80D.' });

        const tds = parseAmt(data.tds);
        const aiPrompt = `Indian taxpayer FY2024-25: Gross ₹${(gross/100000).toFixed(1)}L. Old regime tax: ${fmt(old.total_tax)}, New regime: ${fmt(nw.total_tax)}. Better: ${better} regime, saves ${fmt(savings)}. Missed deductions: ${missed.map(m => m.section).join(', ') || 'none'}. TDS paid: ${fmt(tds)}. Give 3 specific actions in bullet points, under 150 words.`;
        const aiResponse = await callGeminiDirect(aiPrompt);

        // Build local ITR steps
        const localITRSteps = [
          { step_number: 1, portal_section: 'incometax.gov.in → e-File → Income Tax Returns', field_name: 'ITR Form Selection', value_to_enter: 'ITR-1 (salary only)', instruction: 'Login → e-File → Income Tax Returns → File ITR → AY 2025-26.', url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 2, portal_section: 'ITR Portal → Personal Info', field_name: 'Tax Regime', value_to_enter: `${better === 'new' ? 'New Tax Regime' : 'Old Tax Regime'}`, instruction: `Select ${better.toUpperCase()} REGIME — this is better for your income profile.`, url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 3, portal_section: 'ITR Portal → Income Details → Salary', field_name: 'Gross Salary', value_to_enter: fmt(gross), instruction: 'Enter gross salary from Form 16 Part B.', url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 4, portal_section: 'ITR Portal → Deductions (Chapter VI-A)', field_name: 'Section 80C', value_to_enter: `${fmt(sec80C)} (max ₹1,50,000)`, instruction: 'Sum of EPF + ELSS + PPF + LIC + Home Loan Principal. Keep all investment proofs.', url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 5, portal_section: 'ITR Portal → Tax Paid → TDS', field_name: 'TDS from Employer', value_to_enter: fmt(tds), instruction: 'Verify against Form 26AS before entering. Login to incometax.gov.in → e-File → View Form 26AS.', url_hint: 'https://www.incometax.gov.in/iec/foportal/help/how-to-view-form-26as' },
          { step_number: 6, portal_section: 'ITR Portal → Verify & Submit', field_name: 'e-Verify', value_to_enter: 'Aadhaar OTP (instant)', instruction: 'After submission, e-verify within 30 days. Without this, return is not processed.', url_hint: 'https://eportal.incometax.gov.in/iec/foservices/#/e-verify-return' },
        ];

        result = {
          input_source: 'manual',
          confidence_score: 0.7,
          tax_comparison: {
            old_regime: { ...old },
            new_regime: { ...nw },
            better_regime: better,
            savings_by_better: savings,
            hra_exemption_old: old.hraEx || 0,
          },
          deduction_suggestions: missed,
          ai_explanation: aiResponse,
          ai_action_steps: [],
          itr_steps: localITRSteps,
          news_impacts: [],
          validation_warnings: [],
          parsed_data: { gross_salary: gross, confidence: 0.7 },
        };
      }

      setResults(result);
      setItrSteps(result.itr_steps || []);
      setWarnings(result.validation_warnings || []);
      setAiText(result.ai_explanation || '');
      setStep('results');

    } catch (err) {
      setError('Analysis failed: ' + err.message + '. Check your API key.');
      setStep('input');
    }
  };

  const fetchNews = async () => {
    if (!results) return;
    setLoadingNews(true);
    try {
      if (import.meta.env.VITE_API_BASE) {
        const resp = await fetch(`${API_BASE}/api/tax/news`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gross_salary: results.parsed_data?.gross_salary || parseAmt(data.gross),
            better_regime: results.tax_comparison?.better_regime || 'new',
            sec80C: results.tax_comparison?.old_regime?.taxable_income ? 0 : 0,
            nps: parseAmt(data.nps),
          })
        });
        if (resp.ok) { const d = await resp.json(); setNewsItems(d.impacts || []); setLoadingNews(false); return; }
      }
      // Fallback: Gemini direct
      const prompt = `Budget 2024 Indian tax changes — how do they affect someone earning ₹${((results.parsed_data?.gross_salary || parseAmt(data.gross)) / 100000).toFixed(1)}L following ${results.tax_comparison?.better_regime || 'new'} regime? Give 3 specific bullet points, each with: headline, impact, action. Under 120 words.`;
      const text = await callGeminiDirect(prompt);
      setNewsItems([{ headline: 'Budget 2024 Impact', impact_on_user: text, action_required: 'Review your tax plan', urgency: 'medium' }]);
    } catch { setNewsItems([]); }
    setLoadingNews(false);
  };

  const tc = results?.tax_comparison;
  const chartData = tc ? [
    { name: 'Old Regime', tax: Math.round((tc.old_regime?.total_tax || 0) / 1000), fill: tc.better_regime === 'old' ? 'var(--teal)' : 'var(--coral)' },
    { name: 'New Regime', tax: Math.round((tc.new_regime?.total_tax || 0) / 1000), fill: tc.better_regime === 'new' ? 'var(--teal)' : 'var(--coral)' },
  ] : [];

  // Live preview
  const livePreview = data.gross ? (() => {
    const g = parseAmt(data.gross);
    const ded = Math.min(parseAmt(data.epf)+parseAmt(data.elss)+parseAmt(data.ppf)+parseAmt(data.lic), 150000) + Math.min(parseAmt(data.nps), 50000) + Math.min(parseAmt(data.health), 25000);
    const o = localCalcOld(g, ded, parseAmt(data.hra), parseAmt(data.rent), data.isMetro);
    const n = localCalcNew(g);
    return { old: o.total_tax, new: n.total_tax, save: Math.abs(o.total_tax - n.total_tax), better: o.total_tax <= n.total_tax ? 'old' : 'new' };
  })() : null;

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', animation: 'fadeIn 0.5s ease' }}>

      {showITRGuide && itrSteps.length > 0 && <ITRGuide steps={itrSteps} onClose={() => setShowITRGuide(false)} />}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div className="tag tag-gold" style={{ marginBottom: 14 }}>
          <Calculator size={12} /> Tax Wizard
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', color: 'var(--text)', marginBottom: 8 }}>
          AI Tax Mentor
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.92rem' }}>
          FY 2024–25 · Old vs New Regime · Deduction Finder · Step-by-step ITR Guide
        </p>
      </div>

      {/* ── INPUT STEP ── */}
      {step === 'input' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Input mode tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
            {[['manual', '⌨️ Manual Entry'], ['pdf', '📄 Upload Form 16 PDF'], ['text', '📋 Paste PDF Text']].map(([id, label]) => (
              <button key={id} onClick={() => setInputMode(id)} style={{ all: 'unset', cursor: 'pointer', padding: '9px 16px', borderRadius: 7, fontSize: '0.83rem', fontFamily: 'var(--font-body)', fontWeight: 600, transition: 'all 0.2s', background: inputMode === id ? 'var(--surface-3)' : 'transparent', color: inputMode === id ? 'var(--text)' : 'var(--text-dim)' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Sample data loader */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)', fontWeight: 600 }}>Load sample:</span>
            {SAMPLES.map((s, i) => (
              <button key={i} onClick={() => loadSample(i)} style={{ all: 'unset', cursor: 'pointer', padding: '5px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* PDF Upload */}
          {inputMode === 'pdf' && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              style={{ padding: '32px', border: `2px dashed ${pdfFile ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 14, textAlign: 'center', background: pdfFile ? 'var(--teal-dim)' : 'var(--surface)', cursor: 'pointer', transition: 'all 0.3s' }}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />
              {pdfFile ? (
                <div>
                  <CheckCircle size={32} color="var(--teal)" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>{pdfFile.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 12 }}>Form 16 ready — AI will extract all fields automatically</div>
                  <button onClick={e => { e.stopPropagation(); setPdfFile(null); }} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--coral)', display: 'flex', alignItems: 'center', gap: 5, margin: '0 auto' }}>
                    <X size={13} /> Remove file
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={32} color="var(--text-faint)" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Drop Form 16 PDF here or click to browse</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>pdfplumber extraction + Gemini Vision fallback · Max 10MB</div>
                </>
              )}
            </div>
          )}

          {/* Text paste */}
          {inputMode === 'text' && (
            <div className="card">
              <label className="label" style={{ marginBottom: 8 }}>Paste PDF Text from Form 16</label>
              <textarea
                className="input-field"
                placeholder="Paste text copied from your Form 16 PDF here..."
                value={pdfText}
                onChange={e => setPdfText(e.target.value)}
                style={{ minHeight: 160, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', paddingLeft: 14 }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: 8 }}>
                AI will extract gross salary, HRA, TDS, deductions from the pasted text.
              </div>
            </div>
          )}

          {/* Manual form */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Section title="Income Details" color="var(--gold)">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="Annual Gross Salary (CTC)" placeholder="12,00,000" value={data.gross} onChange={set('gross')} hint="From Form 16 Part B — before any deductions" />
                  </div>
                  <Field label="HRA Received / year" placeholder="2,40,000" value={data.hra} onChange={set('hra')} />
                  <Field label="Annual Rent Paid" placeholder="1,80,000" value={data.rent} onChange={set('rent')} />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text-dim)' }}>
                      <input type="checkbox" checked={data.isMetro} onChange={e => setData(p => ({ ...p, isMetro: e.target.checked }))} style={{ accentColor: 'var(--gold)', width: 15, height: 15 }} />
                      Metro city (Mumbai / Delhi / Kolkata / Chennai)
                    </label>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="TDS Already Deducted" placeholder="1,20,000" value={data.tds} onChange={set('tds')} hint="From Form 16 Part A — optional" />
                  </div>
                </div>
              </Section>

              <Section title="80C Investments (Max ₹1.5L)" color="var(--teal)">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="EPF" placeholder="72,000" value={data.epf} onChange={set('epf')} />
                  <Field label="ELSS / MF" placeholder="50,000" value={data.elss} onChange={set('elss')} />
                  <Field label="PPF" placeholder="1,50,000" value={data.ppf} onChange={set('ppf')} />
                  <Field label="LIC Premium" placeholder="25,000" value={data.lic} onChange={set('lic')} />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <Field label="Home Loan Principal" placeholder="0" value={data.homePrincipal} onChange={set('homePrincipal')} />
                  </div>
                </div>
              </Section>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <Section title="Other Deductions" color="var(--coral)">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <Field label="NPS — 80CCD(1B) (Max ₹50K)" placeholder="50,000" value={data.nps} onChange={set('nps')} hint="Exclusive deduction — over & above 80C" />
                    </div>
                    <Field label="Health Insurance 80D" placeholder="25,000" value={data.health} onChange={set('health')} />
                    <Field label="Home Loan Interest (Max ₹2L)" placeholder="0" value={data.homeInterest} onChange={set('homeInterest')} />
                  </div>
                </Section>
              </div>

              {/* Live preview */}
              {livePreview && (
                <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, var(--gold-dim), transparent)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 14 }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Live Preview</div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    {[['Old Regime', livePreview.old, livePreview.better === 'old'], ['New Regime', livePreview.new, livePreview.better === 'new'], ['You Save', livePreview.save, false]].map(([label, val, isWinner]) => (
                      <div key={label}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color: isWinner ? 'var(--teal)' : label === 'You Save' ? 'var(--gold)' : 'var(--text-dim)' }}>{fmt(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <div style={{ padding: '10px 14px', background: 'var(--coral-dim)', border: '1px solid rgba(239,71,111,.2)', borderRadius: 9, color: 'var(--coral)', fontSize: '0.85rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}><AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}</div>}

              <button className="btn-primary" onClick={analyze} style={{ padding: '15px 30px', fontSize: '0.98rem' }}>
                <Zap size={17} /> Analyse My Taxes
              </button>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)', lineHeight: 1.5 }}>
                ✦ FY 2024-25 slabs · 4% cess · 87A rebate · HRA exemption · New regime ₹75K std deduction
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {step === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 22 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--gold)', animation: 'spin 1s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calculator size={26} color="var(--gold)" />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.35rem', color: 'var(--text)', marginBottom: 7 }}>
              {pdfFile ? 'Parsing your Form 16…' : 'Crunching your numbers…'}
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Tax calc · deduction gaps · AI advice · ITR steps</p>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {['var(--gold)', 'var(--teal)', 'var(--coral)'].map((c, i) => (
              <div key={i} className="loading-dot" style={{ background: c, animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {step === 'results' && results && tc && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div style={{ padding: '12px 16px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 10 }}>
              {warnings.map((w, i) => <div key={i} style={{ fontSize: '0.83rem', color: 'var(--gold)', display: 'flex', gap: 7, alignItems: 'flex-start' }}><Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />{w}</div>)}
            </div>
          )}

          {/* Confidence badge (only if from PDF) */}
          {results.input_source !== 'manual' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              <div style={{ padding: '3px 10px', background: results.confidence_score > 0.7 ? 'var(--teal-dim)' : 'rgba(245,166,35,0.12)', borderRadius: 20, color: results.confidence_score > 0.7 ? 'var(--teal)' : 'var(--gold)', fontWeight: 700, fontSize: '0.72rem' }}>
                {results.input_source.toUpperCase()} · {Math.round(results.confidence_score * 100)}% confidence
              </div>
              <span>Fields extracted from your Form 16. Review and adjust if needed.</span>
            </div>
          )}

          {/* Regime recommendation */}
          <div style={{ padding: '20px 24px', background: tc.better_regime === 'old' ? 'linear-gradient(135deg, rgba(6,214,160,0.1), transparent)' : 'linear-gradient(135deg, rgba(245,166,35,0.1), transparent)', border: `1px solid ${tc.better_regime === 'old' ? 'rgba(6,214,160,0.25)' : 'rgba(245,166,35,0.25)'}`, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ width: 46, height: 46, borderRadius: 13, background: tc.better_regime === 'old' ? 'var(--teal-dim)' : 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle size={22} color={tc.better_regime === 'old' ? 'var(--teal)' : 'var(--gold)'} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Recommended Regime</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>
                {tc.better_regime === 'old' ? 'Old Tax Regime' : 'New Tax Regime'} saves you{' '}
                <span style={{ color: tc.better_regime === 'old' ? 'var(--teal)' : 'var(--gold)' }}>{fmt(tc.savings_by_better)}</span> this year
              </div>
            </div>
            {itrSteps.length > 0 && (
              <button className="btn-secondary" onClick={() => setShowITRGuide(true)} style={{ fontSize: '0.83rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <BookOpen size={15} /> ITR Filing Guide
              </button>
            )}
          </div>

          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 14 }}>
            {[
              { label: 'Tax — Old Regime', value: fmt(tc.old_regime?.total_tax), color: tc.better_regime === 'old' ? 'var(--teal)' : 'var(--coral)', bg: tc.better_regime === 'old' ? 'var(--teal-dim)' : 'var(--coral-dim)' },
              { label: 'Tax — New Regime', value: fmt(tc.new_regime?.total_tax), color: tc.better_regime === 'new' ? 'var(--teal)' : 'var(--coral)', bg: tc.better_regime === 'new' ? 'var(--teal-dim)' : 'var(--coral-dim)' },
              { label: 'Effective Rate (Best)', value: `${tc[`${tc.better_regime}_regime`]?.effective_rate || 0}%`, color: 'var(--gold)', bg: 'var(--gold-dim)' },
              ...(parseAmt(data.tds) > 0 ? [{ label: tc.better_regime === 'old' ? (parseAmt(data.tds) >= tc.old_regime.total_tax ? 'Refund Due' : 'Tax Payable') : (parseAmt(data.tds) >= tc.new_regime.total_tax ? 'Refund Due' : 'Tax Payable'), value: fmt(Math.abs(parseAmt(data.tds) - (tc.better_regime === 'old' ? tc.old_regime.total_tax : tc.new_regime.total_tax))), color: 'var(--blue-bright)', bg: 'rgba(76,201,240,0.1)' }] : []),
            ].map((m, i) => (
              <div key={i} style={{ background: m.bg, border: `1px solid ${m.color}22`, borderRadius: 13, padding: '16px 18px' }}>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{m.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="card">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Tax Liability Comparison</h3>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-faint)', marginBottom: 18 }}>Green = better for you · After 4% cess & 87A rebate</p>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={chartData} barSize={60}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 13, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `₹${v}K`} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => [`₹${v}K`, 'Tax']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }} />
                <Bar dataKey="tax" radius={[8, 8, 0, 0]}>{chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Deduction progress bars */}
          <div className="card">
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>Deduction Utilisation</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: '80C', used: Math.min(parseAmt(data.epf)+parseAmt(data.elss)+parseAmt(data.ppf)+parseAmt(data.lic)+parseAmt(data.homePrincipal), 150000), max: 150000, color: 'var(--gold)' },
                { label: '80CCD(1B) NPS', used: Math.min(parseAmt(data.nps), 50000), max: 50000, color: 'var(--teal)' },
                { label: '80D Health', used: Math.min(parseAmt(data.health), 25000), max: 25000, color: 'var(--coral)' },
                { label: '24(b) Home Loan Interest', used: Math.min(parseAmt(data.homeInterest), 200000), max: 200000, color: 'var(--blue-bright)' },
              ].map((d, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-dim)' }}>{d.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: d.color, fontWeight: 600 }}>{fmt(d.used)} / {fmt(d.max)}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min((d.used / d.max) * 100, 100)}%`, background: d.color, borderRadius: 3, transition: 'width 1s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Missed deductions */}
          {results.deduction_suggestions?.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(245,166,35,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lightbulb size={17} color="var(--gold)" /></div>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Deduction Opportunities</h3>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Unlock {fmt(results.deduction_suggestions.reduce((s, m) => s + m.estimated_tax_saving, 0))} more in savings</p>
                </div>
              </div>
              {results.deduction_suggestions.map((m, i) => (
                <div key={i} style={{ marginBottom: 10, padding: '13px 15px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 11, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ padding: '3px 9px', borderRadius: 6, background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>{m.section}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text)', marginBottom: 2 }}>{m.label}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginBottom: 3 }}>{m.action_tip}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>Recommended: {m.recommended_instrument}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--teal)', fontSize: '0.98rem' }}>Save {fmt(m.estimated_tax_saving)}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)' }}>unused: {fmt(m.unused_amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* AI Advice */}
          {aiText && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={17} color="var(--gold)" /></div>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>AI Tax Advice</h3>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Powered by Gemini AI · FY 2024-25</p>
                </div>
              </div>
              <div className="prose-ai" style={{ fontSize: '0.88rem', lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: '<p>' + fmtMd(aiText) + '</p>' }} />
            </div>
          )}

          {/* News impact */}
          <div className="card" style={{ border: '1px solid rgba(76,201,240,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: newsItems.length ? 18 : 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(76,201,240,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Newspaper size={17} color="var(--blue-bright)" /></div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Budget 2024 · News Impact</h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>How recent changes affect you specifically</p>
              </div>
              {!newsItems.length && (
                <button className="btn-secondary" onClick={fetchNews} disabled={loadingNews} style={{ fontSize: '0.8rem', padding: '7px 14px' }}>
                  {loadingNews ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Loading…</> : <><Zap size={13} /> Analyse</>}
                </button>
              )}
            </div>
            {newsItems.map((n, i) => (
              <div key={i} style={{ marginBottom: 10, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text)' }}>{n.headline}</div>
                  <div style={{ padding: '2px 8px', borderRadius: 5, fontSize: '0.67rem', fontWeight: 700, flexShrink: 0, background: n.urgency === 'high' ? 'var(--coral-dim)' : n.urgency === 'medium' ? 'var(--gold-dim)' : 'var(--teal-dim)', color: n.urgency === 'high' ? 'var(--coral)' : n.urgency === 'medium' ? 'var(--gold)' : 'var(--teal)' }}>{n.urgency?.toUpperCase()}</div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 4 }}>{n.impact_on_user}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--teal)', fontWeight: 600, display: 'flex', gap: 5, alignItems: 'center' }}><ArrowRight size={12} />{n.action_required}</div>
              </div>
            ))}
          </div>

          {/* ITR CTA */}
          {itrSteps.length > 0 && (
            <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, rgba(6,214,160,0.08), transparent)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.98rem', marginBottom: 4 }}>Ready to file your ITR?</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>We've prepared a 6-step guide with exact values to enter on the ITR portal</div>
              </div>
              <button className="btn-primary" onClick={() => setShowITRGuide(true)} style={{ background: 'linear-gradient(135deg, var(--teal), #059669)', whiteSpace: 'nowrap' }}>
                <BookOpen size={16} /> Start ITR Filing Guide
              </button>
            </div>
          )}

          <button className="btn-secondary" onClick={() => { setStep('input'); setResults(null); setAiText(''); setNewsItems([]); setWarnings([]); }} style={{ width: 'fit-content' }}>
            <RotateCcw size={15} /> Edit & Recalculate
          </button>
        </div>
      )}
    </div>
  );
}