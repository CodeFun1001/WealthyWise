import React, { useState, useRef, useEffect } from 'react';
import {
  Zap, RotateCcw, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Sparkles, Calculator, Lightbulb,
  Newspaper, Upload, X, ExternalLink, ArrowRight,
  BookOpen, FileCheck, TrendingUp,
  Shield, HelpCircle, AlertTriangle, Target,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts';
import { callGemini } from '../utils/gemini';

const parseAmt = v => Number(String(v || 0).replace(/,/g, '')) || 0;

function calcDeductions(d) {
  const sec80C  = Math.min(parseAmt(d.epf) + parseAmt(d.elss) + parseAmt(d.ppf) + parseAmt(d.lic) + parseAmt(d.homePrincipal), 150000);
  const nps     = Math.min(parseAmt(d.nps), 50000);
  const health  = Math.min(parseAmt(d.health), 25000);
  const homeInt = Math.min(parseAmt(d.homeInterest), 200000);
  return { sec80C, nps, health, homeInt, total: sec80C + nps + health + homeInt };
}

function calcOldRegime(gross, ded, hraExemption, stdDed, ay, taxableIncomeOverride) {
  const taxable = taxableIncomeOverride > 0
    ? taxableIncomeOverride
    : Math.max(gross - (stdDed || 50000) - ded.total - hraExemption, 0);
  const rawTax  = applySlabsOld(taxable, ay);
  const totalTax = Math.round(rawTax * 1.04);
  return {
    total_tax:         totalTax,
    taxable_income:    Math.round(taxable),
    hraEx:             Math.round(hraExemption),
    effective_rate:    gross > 0 ? +((totalTax / gross) * 100).toFixed(2) : 0,
    rebate_87a_applied: taxable <= 500000,
    tax_before_cess:   Math.round(rawTax),
    cess:              Math.round(rawTax * 0.04),
  };
}

function calcNewRegime(gross, ay, taxableIncomeOverride) {
  const stdDed = newRegimeStdDedForAY(ay);
  const taxable = taxableIncomeOverride > 0
    ? taxableIncomeOverride           
    : Math.max(gross - stdDed, 0);
  const rawTax  = applySlabsNew(taxable, ay);
  const totalTax = Math.round(rawTax * 1.04);
  return {
    total_tax:         totalTax,
    taxable_income:    Math.round(taxable),
    effective_rate:    gross > 0 ? +((totalTax / gross) * 100).toFixed(2) : 0,
    rebate_87a_applied: taxable <= (parseInt((ay||'').split('-')[0]) >= 2024 ? 700000 : 500000),
    tax_before_cess:   Math.round(rawTax),
    cess:              Math.round(rawTax * 0.04),
  };
}

function computeHraExemption(gross, hra, rent, metro) {
  if (!hra || !rent) return 0;
  const basic = gross * 0.40;
  return Math.max(0, Math.min(hra, rent - basic * 0.1, basic * (metro ? 0.5 : 0.4)));
}

/* ─── Format helpers ────────────────────────────────────────────────────────── */
const fmt = n => {
  if (!n && n !== 0) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

const EXTRACTION_PROMPT = `You are an expert Indian Chartered Accountant AI that reads Form 16 documents (Part A and Part B / Annexure-I).

Extract EXACTLY the following fields and return ONLY a valid JSON object - no markdown, no explanation, no preamble, no backticks.

{
  "gross_salary": 0,
  "hra_exemption": 0,
  "standard_deduction": 50000,
  "taxable_income": 0,
  "tds_deducted": 0,
  "sec80C": 0,
  "sec80D": 0,
  "nps_80ccd1b": 0,
  "home_loan_interest": 0,
  "rent_paid": 0,
  "is_metro": false,
  "assessment_year": ""
}

Field definitions (read from Part B / Annexure-I):
- gross_salary       : Row 1(a) Salary as per provisions contained in section 17(1)
- hra_exemption      : Row 2(e) House rent allowance under section 10(13A) - the EXEMPT amount already computed by employer
- standard_deduction : Row 4(a) Standard deduction under section 16(ia) - typically 50000 for FY21-22 to FY23-24, 75000 for FY24-25
- taxable_income     : Row 12 Total taxable income (9-11) after all deductions including Chapter VI-A
- tds_deducted       : Part A summary Total row under Amount of tax deducted column
- sec80C             : Row 10(a) deductible amount for life insurance premia, contributions to provident fund etc. under section 80C
- sec80D             : Row 10(g) deductible amount for health insurance premia under section 80D
- nps_80ccd1b        : Row 10(e) deductible amount for pension scheme under section 80CCD(1B)
- home_loan_interest : Home loan interest u/s 24(b) if mentioned
- rent_paid          : Annual rent paid by employee only if explicitly stated
- is_metro           : true ONLY if employee city is Mumbai/Delhi/Kolkata/Chennai
- assessment_year    : e.g. 2022-23 or 2024-25 from the form header

Rules:
- All monetary values are plain numbers - no rupee symbol, no commas
- Indian lakh format examples: 2,55,7983.00 = 2557983 and 1,80,150.00 = 180150
- Use 0 for any monetary field not found in the document
- For taxable_income prefer row 12 Total taxable income which is after Chapter VI-A deductions
- Do NOT invent or estimate any value - only extract what is explicitly printed`;

async function extractFromPdfBase64(base64Data) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY not set in .env');

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: base64Data } },
        { text: EXTRACTION_PROMPT },
      ],
    }],
    generationConfig: { temperature: 0 },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error: ${res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Empty response from Gemini');
  return parseExtractionJSON(text);
}

async function extractFromText(pastedText) {
  const prompt = `${EXTRACTION_PROMPT}\n\n--- FORM 16 TEXT ---\n${pastedText.slice(0, 8000)}`;
  const text = await callGemini(prompt);
  return parseExtractionJSON(text);
}

function parseExtractionJSON(raw) {
  try {
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    throw new Error('Could not parse extracted fields from document. Please try manual entry.');
  }
}

function extractedToState(ex) {
  return {
    gross:          String(ex.gross_salary   || ''),
    hra:            String(ex.hra_exemption  || ''),   
    rent:           String(ex.rent_paid      || ''),
    isMetro:        Boolean(ex.is_metro),
    tds:            String(ex.tds_deducted   || ''),
    epf:            String(Math.min(ex.sec80C || 0, 150000)),
    elss:           '',
    ppf:            '',
    lic:            '',
    homePrincipal:  '',
    nps:            String(Math.min(ex.nps_80ccd1b || 0, 50000)),
    health:         String(Math.min(ex.sec80D || 0, 25000)),
    homeInterest:   String(Math.min(ex.home_loan_interest || 0, 200000)),
    // Extra fields from PDF — stored but not in form inputs
    _taxableIncome:    ex.taxable_income    || 0,
    _stdDeduction:     ex.standard_deduction || 50000,
    _assessmentYear:   ex.assessment_year   || '',
    _hraExemption:     ex.hra_exemption     || 0,
  };
}

function fyFromAY(ay) {
  if (!ay) return 'FY2024-25';
  const year = parseInt(ay.split('-')[0]);
  return `FY${year - 1}-${String(year).slice(2)}`;
}

/* ─── Tax slabs by FY ────────────────────────────────────────────────────── */
function calcOldRegimeTaxable(gross, sec80C, nps, health, homeInt, hraExemption, stdDed) {
  const totalDed = sec80C + nps + health + homeInt;
  return Math.max(gross - stdDed - hraExemption - totalDed, 0);
}

function applySlabsOld(taxable, ay) {
  // AY 2022-23 and AY 2023-24 use same slabs; AY 2024-25 same slabs too
  // Old regime slabs are unchanged: 0/5/20/30%
  let raw =
    taxable > 1000000 ? 112500 + (taxable - 1000000) * 0.30 :
    taxable > 500000  ? 12500  + (taxable - 500000)  * 0.20 :
    taxable > 250000  ? (taxable - 250000) * 0.05 : 0;
  // 87A rebate: if taxable <= 500000, tax = 0
  if (taxable <= 500000) raw = 0;
  return raw;
}

function applySlabsNew(taxable, ay) {
  const year = ay ? parseInt(ay.split('-')[0]) : 2025;
  if (year <= 2023) {
    // FY 2021-22 / FY 2022-23 new regime (AY 2022-23 / 2023-24)
    // Slabs: 0-2.5L=0, 2.5-5L=5%, 5-7.5L=10%, 7.5-10L=15%, 10-12.5L=20%, 12.5-15L=25%, >15L=30%
    let raw =
      taxable > 1500000 ? 187500 + (taxable - 1500000) * 0.30 :
      taxable > 1250000 ? 125000 + (taxable - 1250000) * 0.25 :
      taxable > 1000000 ? 75000  + (taxable - 1000000) * 0.20 :
      taxable > 750000  ? 37500  + (taxable - 750000)  * 0.15 :
      taxable > 500000  ? 12500  + (taxable - 500000)  * 0.10 :
      taxable > 250000  ? (taxable - 250000) * 0.05 : 0;
    if (taxable <= 500000) raw = 0; // 87A rebate
    return raw;
  }
  if (year === 2024) {
    // FY 2023-24 new regime (AY 2024-25)
    // Slabs: 0-3L=0, 3-6L=5%, 6-9L=10%, 9-12L=15%, 12-15L=20%, >15L=30% | std ded 50K
    let raw =
      taxable > 1500000 ? 150000 + (taxable - 1500000) * 0.30 :
      taxable > 1200000 ? 90000  + (taxable - 1200000) * 0.20 :
      taxable > 900000  ? 45000  + (taxable - 900000)  * 0.15 :
      taxable > 600000  ? 15000  + (taxable - 600000)  * 0.10 :
      taxable > 300000  ? (taxable - 300000) * 0.05 : 0;
    if (taxable <= 700000) raw = 0; // 87A rebate <=7L
    return raw;
  }
  // FY 2024-25 new regime (AY 2025-26) — Budget 2024 revised
  let raw =
    taxable > 1500000 ? 140000 + (taxable - 1500000) * 0.30 :
    taxable > 1200000 ? 80000  + (taxable - 1200000) * 0.20 :
    taxable > 1000000 ? 50000  + (taxable - 1000000) * 0.15 :
    taxable > 700000  ? 20000  + (taxable - 700000)  * 0.10 :
    taxable > 300000  ? (taxable - 300000) * 0.05 : 0;
  if (taxable <= 700000) raw = 0;
  return raw;
}

function stdDedForAY(ay) {
  if (!ay) return 50000;
  const year = parseInt(ay.split('-')[0]);
  if (year <= 2024) return 50000;   // AY up to 2024-25 = ₹50K
  return 75000;                      // AY 2025-26+ = ₹75K (Budget 2024)
}

function newRegimeStdDedForAY(ay) {
  if (!ay) return 75000;
  const year = parseInt(ay.split('-')[0]);
  if (year <= 2023) return 0;    // No std ded in new regime before FY23-24
  if (year === 2024) return 50000; // FY23-24 new regime added std ded ₹50K
  return 75000;                    // FY24-25+ ₹75K
}

function renderMarkdown(text = '') {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inUl = false, inOl = false;
  const closeList = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  const inline = s => s
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="md-em">$1</em>')
    .replace(/_(.+?)_/g, '<em class="md-em">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>');
  for (const line of lines) {
    const h3 = line.match(/^### (.+)/); const h2 = line.match(/^## (.+)/); const h1 = line.match(/^# (.+)/);
    const bq = line.match(/^> (.+)/);  const hr = /^---+$/.test(line.trim());
    const ul = line.match(/^[-*•] (.+)/); const ol = line.match(/^\d+\. (.+)/);
    if (h3)      { closeList(); html += `<h3 class="md-h3">${inline(h3[1])}</h3>`; }
    else if (h2) { closeList(); html += `<h2 class="md-h2">${inline(h2[1])}</h2>`; }
    else if (h1) { closeList(); html += `<h1 class="md-h1">${inline(h1[1])}</h1>`; }
    else if (bq) { closeList(); html += `<blockquote class="md-bq">${inline(bq[1])}</blockquote>`; }
    else if (hr) { closeList(); html += `<hr class="md-hr"/>`; }
    else if (ul) {
      if (!inUl) { if (inOl) { html += '</ol>'; inOl = false; } html += '<ul class="md-ul">'; inUl = true; }
      html += `<li class="md-li">${inline(ul[1])}</li>`;
    } else if (ol) {
      if (!inOl) { if (inUl) { html += '</ul>'; inUl = false; } html += '<ol class="md-ol">'; inOl = true; }
      html += `<li class="md-li">${inline(ol[1])}</li>`;
    } else if (line.trim() === '') { closeList(); html += '<div class="md-gap"></div>'; }
    else { closeList(); html += `<p class="md-p">${inline(line)}</p>`; }
  }
  closeList();
  return html;
}
function Md({ children, className = '' }) {
  return <div className={`md-root ${className}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(children || '') }} />;
}
const MD_CSS = `
.md-root { font-size: 0.875rem; line-height: 1.75; }
.md-h1 { color: var(--gold); font-size: 1.05rem; font-weight: 800; margin: 1rem 0 0.4rem; line-height: 1.3; }
.md-h2 { color: var(--gold); font-size: 0.95rem; font-weight: 700; margin: 0.9rem 0 0.35rem; line-height: 1.3; }
.md-h3 { color: var(--text); font-size: 0.88rem; font-weight: 700; margin: 0.75rem 0 0.3rem; line-height: 1.3; }
.md-p  { color: var(--text-dim); margin: 0.3rem 0; }
.md-gap { height: 0.4rem; }
.md-bold { color: var(--text); font-weight: 700; }
.md-em { color: var(--text-dim); font-style: italic; }
.md-code { font-family: var(--font-mono, monospace); font-size: 0.82em; background: var(--surface-3); color: var(--teal); padding: 1px 5px; border-radius: 4px; }
.md-link { color: var(--teal); text-decoration: underline; }
.md-ul, .md-ol { padding-left: 1.25rem; margin: 0.4rem 0; }
.md-li { color: var(--text-dim); margin: 0.2rem 0; line-height: 1.65; }
.md-bq { border-left: 3px solid var(--gold); padding: 0.5rem 0.9rem; margin: 0.6rem 0; background: var(--gold-dim); color: var(--text-dim); font-style: italic; border-radius: 0 6px 6px 0; }
.md-hr { border: none; border-top: 1px solid var(--border); margin: 0.75rem 0; }
`;

function Field({ label, placeholder, value, onChange, prefix = '₹', hint, readOnly }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      {hint && <div style={{ fontSize: '0.66rem', color: 'var(--text-faint)', lineHeight: 1.4 }}>{hint}</div>}
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>{prefix}</span>}
        <input className="input-field" placeholder={placeholder} value={value} onChange={e => onChange?.(e.target.value)} readOnly={readOnly}
          style={{ paddingLeft: prefix ? 24 : 12, background: readOnly ? 'var(--surface-3)' : undefined, width: '100%', boxSizing: 'border-box', opacity: readOnly ? 0.7 : 1 }} />
      </div>
    </div>
  );
}

function Collapse({ title, icon: Icon, color = 'var(--gold)', defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: open ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {Icon && <Icon size={13} color={color} />}
          <span style={{ fontSize: '0.67rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</span>
          {badge && <span style={{ fontSize: '0.62rem', padding: '1px 7px', borderRadius: 10, background: 'var(--gold-dim)', color: 'var(--gold)', fontWeight: 700 }}>{badge}</span>}
        </div>
        {open ? <ChevronUp size={12} color="var(--text-faint)" /> : <ChevronDown size={12} color="var(--text-faint)" />}
      </button>
      {open && children}
    </div>
  );
}

function IncomePanel({ data, set }) {
  return (
    <Collapse title="Income Details" icon={TrendingUp} color="var(--gold)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <Field label="Annual Gross Salary (CTC)" placeholder="12,00,000" value={data.gross} onChange={set('gross')} hint="From Form 16 Part B — before any deductions" />
        </div>
        <Field label="HRA Received / year" placeholder="2,40,000" value={data.hra} onChange={set('hra')} />
        <Field label="Annual Rent Paid" placeholder="1,80,000" value={data.rent} onChange={set('rent')} />
        <div style={{ gridColumn: '1/-1' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.83rem', color: 'var(--text-dim)' }}>
            <input type="checkbox" checked={data.isMetro} onChange={e => set('isMetro')(e.target.checked)} style={{ accentColor: 'var(--gold)', width: 15, height: 15 }} />
            Metro city (Mumbai / Delhi / Kolkata / Chennai) — HRA = 50% of basic
          </label>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <Field label="TDS Already Deducted" placeholder="95,000" value={data.tds} onChange={set('tds')} hint="From Form 16 Part A — for refund/payable calculation" />
        </div>
      </div>
    </Collapse>
  );
}

function DeductionsPanel({ data, set }) {
  const ded = calcDeductions(data);
  const pct80C = Math.min((ded.sec80C / 150000) * 100, 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Collapse title="80C Investments" icon={Shield} color="var(--teal)" badge={`${fmt(ded.sec80C)} / ₹1.5L`}>
        {pct80C >= 100 && (
          <div style={{ padding: '6px 10px', background: 'rgba(6,214,160,0.1)', borderRadius: 8, fontSize: '0.7rem', color: 'var(--teal)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={12} /> 80C fully utilized — great tax saving!
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="EPF" placeholder="72,000" value={data.epf} onChange={set('epf')} hint="Employee + Employer share" />
          <Field label="ELSS / MF" placeholder="50,000" value={data.elss} onChange={set('elss')} hint="3-yr lock-in, market-linked" />
          <Field label="PPF" placeholder="1,50,000" value={data.ppf} onChange={set('ppf')} />
          <Field label="LIC Premium" placeholder="25,000" value={data.lic} onChange={set('lic')} />
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="Home Loan Principal" placeholder="0" value={data.homePrincipal} onChange={set('homePrincipal')} hint="Under 80C (for self-occupied property)" />
          </div>
        </div>
      </Collapse>
      <Collapse title="Other Deductions" icon={Target} color="var(--coral)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Field label="NPS — 80CCD(1B) (Max ₹50K)" placeholder="50,000" value={data.nps} onChange={set('nps')} hint="Extra deduction OVER & ABOVE 80C — highly recommended" />
          </div>
          <Field label="Health Insurance 80D" placeholder="25,000" value={data.health} onChange={set('health')} hint="Max ₹25K (self + family)" />
          <Field label="Home Loan Interest (Max ₹2L)" placeholder="0" value={data.homeInterest} onChange={set('homeInterest')} hint="Sec 24(b) — Old regime only" />
        </div>
      </Collapse>
    </div>
  );
}

function ErrorBanner({ msg }) {
  return (
    <div style={{ padding: '10px 14px', background: 'var(--coral-dim)', border: '1px solid rgba(239,71,111,.2)', borderRadius: 9, color: 'var(--coral)', fontSize: '0.84rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
    </div>
  );
}

function InfoBanner({ msg }) {
  return (
    <div style={{ padding: '8px 12px', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: 9, color: 'var(--teal)', fontSize: '0.78rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <CheckCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
    </div>
  );
}

function AnalyseButton({ onClick, disabled }) {
  return (
    <button className="btn-primary" onClick={onClick} disabled={disabled}
      style={{ padding: '14px 28px', fontSize: '0.97rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <Zap size={16} /> Analyse My Taxes
    </button>
  );
}

function FooterNote() {
  return (
    <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', lineHeight: 1.7 }}>
      ✦ FY 2024-25 rules · Old regime: ₹50K std deduction · New regime: ₹75K std deduction (Budget 2024) · 4% health &amp; education cess · 87A rebate (old ≤₹5L / new ≤₹7L) · HRA exemption formula applied
    </div>
  );
}

/* ─── ITR Guide Overlay ─────────────────────────────────────────────────────── */
function ITRGuide({ steps, onClose }) {
  const [active, setActive] = useState(0);
  const [reasonText, setReasonText] = useState('');
  const [loadingReason, setLoadingReason] = useState(false);
  const step = steps[active];

  const fetchReason = async (s) => {
    setLoadingReason(true); setReasonText('');
    try {
      const text = await callGemini(`You are an expert Indian CA helping a taxpayer file ITR for AY 2025-26.

ITR Filing Step: **"${s.field_name}"**
Portal section: ${s.portal_section}
Value to enter: ${s.value_to_enter}

Explain in markdown with these 4 points:

**Why this field matters** — legal or practical reason (1-2 sentences)
**Where to find this value** — exact document/section
**Common mistake** — the #1 error people make here
**Pro tip** — one actionable tip

Use **bold** for key terms. Friendly tone.`);
      setReasonText(text);
    } catch {
      setReasonText('AI explanation unavailable.');
    }
    setLoadingReason(false);
  };

  useEffect(() => { if (step) fetchReason(step); }, [active]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 660, background: 'var(--surface)', border: '1px solid var(--border-bright)', borderRadius: 22, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(6,214,160,0.08),transparent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--teal-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={18} color="var(--teal)" /></div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.93rem' }}>ITR Filing Guide</div>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-dim)' }}>Step-by-step · AY 2025-26 · AI-explained</div>
            </div>
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', padding: 6, color: 'var(--text-faint)', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '10px 22px 0', display: 'flex', gap: 4, flexShrink: 0 }}>
          {steps.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{ all: 'unset', cursor: 'pointer', height: 4, flex: 1, borderRadius: 2, background: i <= active ? 'var(--teal)' : 'var(--surface-3)', transition: 'background 0.3s' }} />
          ))}
        </div>
        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--teal-dim)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.88rem', flexShrink: 0 }}>{step.step_number}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--teal)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{step.portal_section}</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-faint)', marginBottom: 3 }}>FIELD TO FILL</div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>{step.field_name}</div>
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--surface-2)', border: '2px solid var(--teal)', borderRadius: 10, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-faint)', marginBottom: 2 }}>Enter this value:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--teal)', fontSize: '1rem' }}>{step.value_to_enter}</div>
            </div>
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 16 }}>{step.instruction}</div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <HelpCircle size={14} color="var(--gold)" />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Why this step matters</span>
            </div>
            {loadingReason
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: '0.82rem' }}><div className="spinner" style={{ width: 13, height: 13 }} /> Generating AI explanation…</div>
              : <Md>{reasonText}</Md>}
          </div>
          <a href={step.url_hint} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--teal)', textDecoration: 'none', fontWeight: 600, marginTop: 14 }}>
            Open ITR Portal <ExternalLink size={12} />
          </a>
        </div>
        <div style={{ padding: '12px 22px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={() => setActive(a => Math.max(0, a - 1))} disabled={active === 0} style={{ fontSize: '0.82rem', opacity: active === 0 ? 0.4 : 1 }}>← Prev</button>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-faint)' }}>{active + 1} / {steps.length}</span>
          {active < steps.length - 1
            ? <button className="btn-primary" onClick={() => setActive(a => a + 1)} style={{ fontSize: '0.82rem' }}>Next →</button>
            : <button className="btn-primary" onClick={onClose} style={{ fontSize: '0.82rem', background: 'linear-gradient(135deg,var(--teal),#059669)' }}>✓ Done</button>}
        </div>
      </div>
    </div>
  );
}

/* ─── Sample data ───────────────────────────────────────────────────────────── */
const SAMPLES = [
  { label: 'Software Engineer · Mumbai · ₹12L', gross: '1200000', hra: '240000', rent: '180000', isMetro: true,  epf: '72000',  elss: '50000', ppf: '',      lic: '15000', homePrincipal: '', nps: '20000', health: '12000', homeInterest: '',       tds: '95000'  },
  { label: 'Teacher · Bangalore · ₹8L',         gross: '800000',  hra: '120000', rent: '96000',  isMetro: true,  epf: '48000',  elss: '',      ppf: '60000', lic: '25000', homePrincipal: '', nps: '50000', health: '20000', homeInterest: '',       tds: '28000'  },
  { label: 'Manager · Pune · ₹18L (Home Loan)', gross: '1800000', hra: '',       rent: '',       isMetro: false, epf: '108000', elss: '42000', ppf: '',      lic: '',      homePrincipal: '', nps: '50000', health: '25000', homeInterest: '180000', tds: '230000' },
];
const DEFAULT = { gross: '', hra: '', rent: '', isMetro: false, epf: '', elss: '', ppf: '', lic: '', homePrincipal: '', nps: '', health: '', homeInterest: '', tds: '' };

/* ═══════════════════════════ MAIN COMPONENT ════════════════════════════════ */
export default function TaxWizardPage() {
  const [data,         setData]         = useState(DEFAULT);
  const [step,         setStep]         = useState('input');  
  const [results,      setResults]      = useState(null);
  const [aiAdvice,     setAiAdvice]     = useState('');
  const [aiRegimeWhy,  setAiRegimeWhy]  = useState('');
  const [newsItems,    setNewsItems]    = useState([]);
  const [loadingNews,  setLoadingNews]  = useState(false);
  const [error,        setError]        = useState('');
  const [warnings,     setWarnings]     = useState([]);
  const [showITR,      setShowITR]      = useState(false);
  const [itrSteps,     setItrSteps]     = useState([]);
  const [inputMode,    setInputMode]    = useState('manual');
  const [pdfFile,      setPdfFile]      = useState(null);
  const [pdfText,      setPdfText]      = useState('');
  const [loadingStage, setLoadingStage] = useState('');
  const [extractInfo,  setExtractInfo]  = useState('');  
  const fileRef = useRef(null);

  const set = k => v => setData(p => ({ ...p, [k]: v }));
  const loadSample = idx => { setData({ ...DEFAULT, ...SAMPLES[idx] }); setInputMode('manual'); };

  const livePreview = (inputMode === 'manual' && parseAmt(data.gross) > 0) ? (() => {
    const g   = parseAmt(data.gross);
    const ded = calcDeductions(data);
    const hraEx = computeHraExemption(g, parseAmt(data.hra), parseAmt(data.rent), data.isMetro);
    const o = calcOldRegime(g, ded, hraEx, 50000, 'FY2024-25', 0);
    const n = calcNewRegime(g, 'FY2024-25', 0);
    return { old: o.total_tax, new: n.total_tax, save: Math.abs(o.total_tax - n.total_tax), better: o.total_tax <= n.total_tax ? 'old' : 'new' };
  })() : null;

  /* ── PDF → base64 ── */
  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  /* ── AI prompts ── */
  const buildAdvicePrompt = (gross, old, nw, better, savings, missed, tds, hraEx) => {
    const bestTax = better === 'old' ? old.total_tax : nw.total_tax;
    const refund  = tds > 0 ? tds - bestTax : 0;
    return `You are WealthyWise — India's premier AI financial advisor and CA. A real salaried taxpayer shared their FY 2024-25 data. Give **detailed, personalized, actionable advice**.

## Their Tax Profile (FY 2024-25)
- **Gross Salary**: ₹${(gross / 100000).toFixed(2)}L
- **HRA Exemption**: ${fmt(hraEx)} (old regime)
- **Old Regime Tax**: ${fmt(old.total_tax)} | Taxable: ${fmt(old.taxable_income)} | Rate: ${old.effective_rate}%
- **New Regime Tax**: ${fmt(nw.total_tax)} | Taxable: ${fmt(nw.taxable_income)} | Rate: ${nw.effective_rate}%
- **Recommended**: **${better.toUpperCase()} REGIME** — saves **${fmt(savings)}**
- **TDS Paid**: ${tds > 0 ? fmt(tds) : 'Not provided'}${tds > 0 ? ` → ${refund >= 0 ? `**REFUND: ${fmt(refund)}**` : `**PAY: ${fmt(Math.abs(refund))}**`}` : ''}
- **Untapped Deductions**: ${missed.length > 0 ? missed.map(m => `${m.section} (save ${fmt(m.estimated_tax_saving)} more)`).join(', ') : 'None — fully optimized!'}

## Task
Write a comprehensive, warm analysis. Structure EXACTLY like this:

### 💡 Why ${better === 'old' ? 'Old' : 'New'} Regime Wins For You
2-3 sentences with exact numbers.

### 🎯 Action Plan — Do This Before March 31, 2025
3-4 concrete steps with exact ₹ amounts.

### ⚠️ Don't Make These Common Mistakes
2-3 specific mistakes at ₹${(gross / 100000).toFixed(0)}L income.

### 💰 ${tds > 0 ? (refund >= 0 ? 'Your Refund Situation' : 'Tax Payment Due') : 'TDS & Advance Tax'}
${tds > 0 ? (refund >= 0 ? `Explain the ${fmt(Math.abs(refund))} refund — how to claim faster.` : `Explain the ${fmt(Math.abs(refund))} due — when to pay.`) : 'Advise on tracking TDS.'}

### 📅 FY 2025-26 Planning Tip
One key insight for next year.

Rules: **bold** for ₹ amounts. Indian number format. Max 320 words. Speak directly as "you".`;
  };

  const buildRegimeWhyPrompt = (gross, old, nw, better) =>
    `As a senior Indian CA, explain in exactly 2 concise sentences why the **${better} tax regime** saves this person money:
Gross: ₹${(gross / 100000).toFixed(1)}L | Old tax: ${fmt(old.total_tax)} | New tax: ${fmt(nw.total_tax)} | Difference: ${fmt(Math.abs(old.total_tax - nw.total_tax))}
Mention the specific reason with exact numbers. Use **bold** for ₹ amounts.`;

  /* ── Build ITR steps ── */
  const buildITRSteps = (better, savings, gross, ded, tds) => [
    { step_number: 1, portal_section: 'incometax.gov.in → e-File → Income Tax Returns', field_name: 'ITR Form Selection', value_to_enter: 'ITR-1 (salary only) or ITR-2 (capital gains / multiple sources)', instruction: 'Login → e-File → Income Tax Returns → File ITR → AY 2025-26. ITR-1 for salary-only. ITR-2 if you have capital gains from stocks/MF.', url_hint: 'https://eportal.incometax.gov.in' },
    { step_number: 2, portal_section: 'ITR Portal → Personal Information', field_name: 'Tax Regime Selection', value_to_enter: better === 'old' ? 'Old Tax Regime (must explicitly opt-in)' : 'New Tax Regime (default — no action needed)', instruction: `Select ${better === 'old' ? 'OLD REGIME' : 'NEW REGIME'}. Saves you ${fmt(savings)} vs the other option. New regime is the DEFAULT — if you want old regime you MUST explicitly opt in before deadline.`, url_hint: 'https://eportal.incometax.gov.in' },
    { step_number: 3, portal_section: 'ITR Portal → Income Details → Salary', field_name: 'Gross Salary', value_to_enter: fmt(gross), instruction: 'Enter gross salary exactly as shown in Form 16 Part B under "Income chargeable under the head Salaries". BEFORE standard deduction. Multiple employers? Add all salaries.', url_hint: 'https://eportal.incometax.gov.in' },
    { step_number: 4, portal_section: 'ITR Portal → Deductions (Chapter VI-A)', field_name: 'Section 80C Total', value_to_enter: `${fmt(ded.sec80C)} (hard cap: ₹1,50,000)`, instruction: 'Total of EPF + ELSS + PPF + LIC + Home Loan Principal. Portal auto-caps at ₹1,50,000. Collect proofs: EPF passbook, ELSS statement, PPF passbook, LIC receipts. Keep 6 years.', url_hint: 'https://eportal.incometax.gov.in' },
    { step_number: 5, portal_section: 'ITR Portal → Tax Paid → TDS Details', field_name: 'TDS from Employer (Form 26AS)', value_to_enter: tds > 0 ? fmt(tds) : 'Verify on Form 26AS first', instruction: 'CRITICAL: Verify TDS on Form 26AS first (incometax.gov.in → Services → View 26AS). TDS in 26AS MUST match Form 16 Part A. Any mismatch → resolve with employer BEFORE filing — triggers a notice.', url_hint: 'https://www.incometax.gov.in/iec/foportal/help/how-to-view-form-26as' },
    { step_number: 6, portal_section: 'ITR Portal → Submit & Verify', field_name: 'e-Verification', value_to_enter: 'Aadhaar OTP — instant (recommended)', instruction: 'e-verify WITHIN 30 DAYS of submitting. Aadhaar OTP is fastest. Without e-verification your ITR is treated as NOT FILED. Faster e-verify = faster refund from CPC Bengaluru.', url_hint: 'https://eportal.incometax.gov.in/iec/foservices/#/e-verify-return' },
  ];

  const analyze = async () => {
    if (inputMode === 'manual' && !parseAmt(data.gross)) { setError('Please enter your gross salary.'); return; }
    if (inputMode === 'pdf'    && !pdfFile)              { setError('Please upload a Form 16 PDF.'); return; }
    if (inputMode === 'text'   && !pdfText.trim())       { setError('Please paste Form 16 text.'); return; }

    setError(''); setWarnings([]); setExtractInfo(''); setStep('loading');

    try {
      let activeData = { ...data };  // the data state we'll calculate with

      /* ── Step 1: Extract from PDF or text using Gemini ── */
      if (inputMode === 'pdf') {
        setLoadingStage('Reading PDF with Gemini AI…');
        const base64 = await readFileAsBase64(pdfFile);
        const extracted = await extractFromPdfBase64(base64);

        if (!extracted.gross_salary) throw new Error('Could not detect salary in PDF. Try "Paste PDF Text" mode or manual entry.');

        const mapped = extractedToState(extracted);
        setData(mapped);       // update form fields so user can see/edit
        activeData = mapped;
        setExtractInfo(`Extracted from PDF: Salary ${fmt(extracted.gross_salary)}${extracted.tds_deducted ? ` · TDS ${fmt(extracted.tds_deducted)}` : ''}${extracted.sec80C ? ` · 80C ${fmt(extracted.sec80C)}` : ''}`);
      }

      if (inputMode === 'text') {
        setLoadingStage('Extracting fields with Gemini AI…');
        const extracted = await extractFromText(pdfText);

        if (!extracted.gross_salary) throw new Error('Could not detect salary in pasted text. Please check the text or use manual entry.');

        const mapped = extractedToState(extracted);
        setData(mapped);
        activeData = mapped;
        setExtractInfo(`Extracted from text: Salary ${fmt(extracted.gross_salary)}${extracted.tds_deducted ? ` · TDS ${fmt(extracted.tds_deducted)}` : ''}${extracted.sec80C ? ` · 80C ${fmt(extracted.sec80C)}` : ''}`);
      }

      /* ── Step 2: Calculate taxes ── */
      const ay       = activeData._assessmentYear || '';
      const stdDed   = activeData._stdDeduction   || stdDedForAY(ay);
      const gross    = parseAmt(activeData.gross);
      const ded      = calcDeductions(activeData);
      const tds      = parseAmt(activeData.tds);

      // HRA exemption: PDF mode gives us the employer-computed exempt amount directly.
      // Manual mode: we compute it from HRA received + rent + city.
      const hraExemption = activeData._hraExemption > 0
        ? activeData._hraExemption
        : computeHraExemption(gross, parseAmt(activeData.hra), parseAmt(activeData.rent), activeData.isMetro);

      const oldTaxableOverride = activeData._taxableIncome || 0;

      const fyLabel  = ay ? `AY ${ay}` : 'FY 2024-25';
      setLoadingStage(`Running ${fyLabel} tax calculation…`);

      const old     = calcOldRegime(gross, ded, hraExemption, stdDed, ay, oldTaxableOverride);
      const nw      = calcNewRegime(gross, ay, 0);
      const better  = old.total_tax <= nw.total_tax ? 'old' : 'new';
      const savings = Math.abs(old.total_tax - nw.total_tax);

      /* ── Step 3: Validation warnings ── */
      const localWarnings = [];
      if (ay) localWarnings.push(`This Form 16 is for ${fyLabel} — tax slabs applied accordingly.`);
      const raw80C = parseAmt(activeData.epf) + parseAmt(activeData.elss) + parseAmt(activeData.ppf) + parseAmt(activeData.lic) + parseAmt(activeData.homePrincipal);
      if (raw80C > 150000) localWarnings.push(`80C investments total ${fmt(raw80C)} — capped at ₹1,50,000 per Income Tax Act.`);
      if (parseAmt(activeData.nps) > 50000) localWarnings.push('NPS contribution capped at ₹50,000 under 80CCD(1B).');
      if (tds > gross * 0.6) localWarnings.push('TDS seems very high relative to salary — please verify with Form 26AS.');
      setWarnings(localWarnings);

      /* ── Step 4: Deduction opportunities ── */
      const marginal = old.taxable_income > 1500000 ? 0.312 : old.taxable_income > 1000000 ? 0.312 : old.taxable_income > 500000 ? 0.208 : 0.052;
      const missed = [];
      if (ded.sec80C < 150000) missed.push({ section: '80C', label: 'ELSS / PPF / LIC', current_amount: ded.sec80C, max_limit: 150000, unused_amount: 150000 - ded.sec80C, estimated_tax_saving: Math.round((150000 - ded.sec80C) * marginal), recommended_instrument: 'ELSS Mutual Fund (3-yr lock-in)', action_tip: `Invest ${fmt(150000 - ded.sec80C)} more in ELSS to fully utilise 80C.` });
      if (parseAmt(activeData.nps) < 50000) missed.push({ section: '80CCD(1B)', label: 'NPS Tier-1', current_amount: parseAmt(activeData.nps), max_limit: 50000, unused_amount: 50000 - parseAmt(activeData.nps), estimated_tax_saving: Math.round((50000 - parseAmt(activeData.nps)) * marginal), recommended_instrument: 'NPS Tier-1 via eNPS (NSDL)', action_tip: 'Open NPS Tier-1 — this deduction is OVER & ABOVE 80C.' });
      if (parseAmt(activeData.health) < 25000) missed.push({ section: '80D', label: 'Health Insurance', current_amount: parseAmt(activeData.health), max_limit: 25000, unused_amount: 25000 - parseAmt(activeData.health), estimated_tax_saving: Math.round((25000 - parseAmt(activeData.health)) * marginal), recommended_instrument: 'Family Floater (Star / HDFC Ergo / Niva Bupa)', action_tip: `Upgrade health cover — add ${fmt(25000 - parseAmt(activeData.health))} premium to claim full 80D.` });

      const localITRSteps = buildITRSteps(better, savings, gross, ded, tds);

      const result = {
        input_source: inputMode,
        confidence_score: inputMode === 'manual' ? 1.0 : 0.85,
        tax_comparison: {
          old_regime: { ...old },
          new_regime: { ...nw },
          better_regime: better,
          savings_by_better: savings,
          hra_exemption_old: old.hraEx,
        },
        deduction_suggestions: missed,
        itr_steps: localITRSteps,
        validation_warnings: localWarnings,
        parsed_data: { gross_salary: gross, confidence: 0.9 },
      };

      setResults(result);
      setItrSteps(localITRSteps);

      /* ── Step 5: Gemini AI advice (parallel) ── */
      setLoadingStage('Generating personalized AI analysis…');
      const [adviceText, whyText] = await Promise.all([
        callGemini(buildAdvicePrompt(gross, old, nw, better, savings, missed, tds, old.hraEx)).catch(() => '> _AI advice unavailable._'),
        callGemini(buildRegimeWhyPrompt(gross, old, nw, better)).catch(() => ''),
      ]);

      setAiAdvice(adviceText);
      setAiRegimeWhy(whyText);
      setStep('results');

    } catch (err) {
      setError('Analysis failed: ' + err.message);
      setStep('input');
    }
  };

  /* ── News fetch ── */
  const fetchNews = async () => {
    if (!results) return;
    setLoadingNews(true);
    const tc    = results.tax_comparison;
    const gross = results.parsed_data?.gross_salary || parseAmt(data.gross);
    try {
      const text = await callGemini(`You are an expert Indian financial journalist and CA. Write a thorough analysis of Budget 2024 tax changes for a salaried person earning ₹${(gross / 100000).toFixed(1)}L on the **${tc.better_regime} regime**.

Structure in markdown:

## Budget 2024: Tax Changes That Impact You

### 1. New Regime Standard Deduction: Now ₹75,000
Previously ₹50K, now ₹75K. Exact tax saving for this income. Should they reconsider their regime?

### 2. Capital Gains Tax Overhaul
LTCG on equity/MFs now **12.5%** (was 10%) above ₹1.25L. STCG now **20%** (was 15%). How does this affect ELSS redemptions?

### 3. NPS Tax Benefits Update
Employer NPS deduction raised. Total NPS benefit for their bracket.

### 4. ITR Filing Deadline & Penalties
July 31, 2025. Penalty: ₹5,000 (income > ₹5L). Interest: 1%/month. 3 urgent actions now.

**Bold** all numbers. Under 280 words. Urgent tone.`);
      setNewsItems([{ headline: 'Budget 2024 — Complete Tax Impact Analysis', impact_on_user: text, action_required: 'File ITR before July 31, 2025 to avoid ₹5,000 penalty', urgency: 'high' }]);
    } catch {
      setNewsItems([{ headline: 'Budget 2024 Key Changes', impact_on_user: `**New regime standard deduction raised to ₹75,000** (from ₹50,000).\n\n**LTCG on equity raised to 12.5%** (from 10%) above ₹1.25L. **STCG raised to 20%**.\n\n**ITR deadline: July 31, 2025.** Late penalty: ₹5,000 + 1%/month interest.`, action_required: 'File by July 31, 2025', urgency: 'high' }]);
    }
    setLoadingNews(false);
  };

  const tc = results?.tax_comparison;

  return (
    <>
      <style>{MD_CSS}</style>
      <div style={{ padding: 'clamp(16px, 4vw, 36px)', animation: 'fadeIn 0.5s ease' }}>

        {showITR && itrSteps.length > 0 && <ITRGuide steps={itrSteps} onClose={() => setShowITR(false)} />}

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div className="tag tag-gold" style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calculator size={12} /> Tax Wizard · WealthyWise
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.7rem,3vw,2.3rem)', color: 'var(--text)', marginBottom: 6, lineHeight: 1.2 }}>
            AI Tax Mentor
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', margin: 0 }}>
            FY 2024–25 · Old vs New Regime · Deduction Finder · Step-by-step ITR Guide
          </p>
        </div>

        {/* ══ INPUT ══ */}
        {step === 'input' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Mode tabs */}
            <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', width: 'fit-content', flexWrap: 'wrap' }}>
              {[['manual', '⌨️ Manual Entry'], ['pdf', '📄 Upload Form 16'], ['text', '📋 Paste PDF Text']].map(([id, label]) => (
                <button key={id} onClick={() => { setInputMode(id); setError(''); }} style={{ all: 'unset', cursor: 'pointer', padding: '8px 14px', borderRadius: 7, fontSize: '0.81rem', fontFamily: 'var(--font-body)', fontWeight: 600, transition: 'all 0.2s', background: inputMode === id ? 'var(--surface-3)' : 'transparent', color: inputMode === id ? 'var(--text)' : 'var(--text-dim)' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── MANUAL ── */}
            {inputMode === 'manual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)', fontWeight: 600 }}>Load sample:</span>
                  {SAMPLES.map((s, i) => (
                    <button key={i} onClick={() => loadSample(i)}
                      style={{ all: 'unset', cursor: 'pointer', padding: '5px 11px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  <IncomePanel data={data} set={set} />
                  <DeductionsPanel data={data} set={set} />
                </div>
                {livePreview && (
                  <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg,var(--gold-dim),transparent)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 13 }}>
                    <div style={{ fontSize: '0.63rem', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Live Preview</div>
                    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      {[['Old Regime', livePreview.old, livePreview.better === 'old'], ['New Regime', livePreview.new, livePreview.better === 'new'], ['You Save', livePreview.save, false]].map(([label, val, isWinner]) => (
                        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ fontSize: '0.63rem', color: 'var(--text-faint)' }}>{label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: isWinner ? 'var(--teal)' : label === 'You Save' ? 'var(--gold)' : 'var(--text-dim)' }}>{fmt(val)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {error && <ErrorBanner msg={error} />}
                <AnalyseButton onClick={analyze} />
                <FooterNote />
              </div>
            )}

            {/* ── PDF ── */}
            {inputMode === 'pdf' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setPdfFile(f); }}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileRef.current?.click()}
                  style={{ padding: '32px 22px', border: `2px dashed ${pdfFile ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 14, textAlign: 'center', background: pdfFile ? 'var(--teal-dim)' : 'var(--surface)', cursor: 'pointer', transition: 'all 0.3s' }}>
                  <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) setPdfFile(f); }} />
                  {pdfFile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                      <FileCheck size={34} color="var(--teal)" />
                      <div style={{ fontWeight: 700, color: 'var(--teal)', fontSize: '0.93rem' }}>{pdfFile.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}> AI will extract salary, HRA, TDS & deductions</div>
                      <button onClick={e => { e.stopPropagation(); setPdfFile(null); }} style={{ all: 'unset', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--coral)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <X size={12} /> Remove
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                      <Upload size={34} color="var(--text-faint)" />
                      <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.93rem' }}>Drop Form 16 PDF or click to browse</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>AI extracts all fields · Part A + Part B · Max 10 MB</div>
                    </div>
                  )}
                </div>
                {error && <ErrorBanner msg={error} />}
                <AnalyseButton onClick={analyze} disabled={!pdfFile} />
                <FooterNote />
              </div>
            )}

            {/* ── TEXT ── */}
            {inputMode === 'text' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Paste Form 16 Text</label>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginBottom: 8, lineHeight: 1.6 }}>Open Form 16 PDF → Ctrl+A → Ctrl+C → paste below. AI extracts all fields automatically.</div>
                    <textarea className="input-field" placeholder="Paste your Form 16 text here…" value={pdfText} onChange={e => setPdfText(e.target.value)}
                      style={{ minHeight: 150, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.79rem', paddingLeft: 14, width: '100%', boxSizing: 'border-box' }} />
                    {pdfText && <div style={{ marginTop: 5, fontSize: '0.69rem', color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={11} /> {pdfText.split(/\s+/).filter(Boolean).length} words detected — ready</div>}
                  </div>
                </div>
                {error && <ErrorBanner msg={error} />}
                <AnalyseButton onClick={analyze} disabled={!pdfText.trim()} />
                <FooterNote />
              </div>
            )}
          </div>
        )}

        {/* ══ LOADING ══ */}
        {step === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ width: 78, height: 78, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--gold)', animation: 'spin 1s linear infinite' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Calculator size={24} color="var(--gold)" /></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--text)', marginBottom: 5 }}>{loadingStage || 'Analysing your taxes…'}</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.84rem', margin: 0 }}>FY 2024-25 rules · 87A rebate · HRA formula </p>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              {['var(--gold)', 'var(--teal)', 'var(--coral)'].map((c, i) => (
                <div key={i} className="loading-dot" style={{ background: c, animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ══ RESULTS ══ */}
        {step === 'results' && results && tc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Extraction info banner */}
            {extractInfo && <InfoBanner msg={extractInfo + ' — review the fields below if needed.'} />}

            {/* Validation warnings */}
            {warnings.length > 0 && (
              <div style={{ padding: '11px 14px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.22)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: '0.81rem', color: 'var(--gold)', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2 }} />{w}
                  </div>
                ))}
              </div>
            )}

            {/* Regime recommendation banner */}
            <div style={{ padding: '18px 20px', background: tc.better_regime === 'old' ? 'linear-gradient(135deg,rgba(6,214,160,0.1),transparent)' : 'linear-gradient(135deg,rgba(245,166,35,0.1),transparent)', border: `1px solid ${tc.better_regime === 'old' ? 'rgba(6,214,160,0.28)' : 'rgba(245,166,35,0.28)'}`, borderRadius: 'var(--radius)', display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: tc.better_regime === 'old' ? 'var(--teal-dim)' : 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <CheckCircle size={21} color={tc.better_regime === 'old' ? 'var(--teal)' : 'var(--gold)'} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Recommended Regime</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.3, marginBottom: aiRegimeWhy ? 8 : 0 }}>
                  {tc.better_regime === 'old' ? 'Old Tax Regime' : 'New Tax Regime'} saves you{' '}
                  <span style={{ color: tc.better_regime === 'old' ? 'var(--teal)' : 'var(--gold)' }}>{fmt(tc.savings_by_better)}</span>
                </div>
                {aiRegimeWhy && <Md>{aiRegimeWhy}</Md>}
              </div>
              {itrSteps.length > 0 && (
                <button className="btn-secondary" onClick={() => setShowITR(true)} style={{ fontSize: '0.79rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <BookOpen size={13} /> ITR Filing Guide
                </button>
              )}
            </div>

            {/* Metric cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 11 }}>
              {[
                { label: 'Tax — Old Regime', value: fmt(tc.old_regime?.total_tax), color: tc.better_regime === 'old' ? 'var(--teal)' : 'var(--coral)', bg: tc.better_regime === 'old' ? 'var(--teal-dim)' : 'var(--coral-dim)' },
                { label: 'Tax — New Regime', value: fmt(tc.new_regime?.total_tax), color: tc.better_regime === 'new' ? 'var(--teal)' : 'var(--coral)', bg: tc.better_regime === 'new' ? 'var(--teal-dim)' : 'var(--coral-dim)' },
                { label: 'Effective Rate (Best)', value: `${tc[`${tc.better_regime}_regime`]?.effective_rate ?? 0}%`, color: 'var(--gold)', bg: 'var(--gold-dim)' },
                ...(parseAmt(data.tds) > 0 ? (() => {
                  const bestTax = tc[`${tc.better_regime}_regime`]?.total_tax || 0;
                  const tds = parseAmt(data.tds);
                  const diff = tds - bestTax;
                  return [{ label: diff >= 0 ? '🎉 Refund Due' : '⚠️ Tax Payable', value: fmt(Math.abs(diff)), color: diff >= 0 ? 'var(--blue-bright)' : 'var(--coral)', bg: diff >= 0 ? 'rgba(76,201,240,0.08)' : 'var(--coral-dim)' }];
                })() : []),
              ].map((m, i) => (
                <div key={i} style={{ background: m.bg, border: `1px solid ${m.color}22`, borderRadius: 12, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{m.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="card">
              <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>Tax Liability Comparison</h3>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', margin: '0 0 14px' }}>Green = better for you · After 4% cess &amp; 87A rebate · FY 2024-25</p>
              <ResponsiveContainer width="100%" height={175}>
                <BarChart data={[{ name: 'Old Regime', tax: Math.round((tc.old_regime?.total_tax || 0) / 1000) }, { name: 'New Regime', tax: Math.round((tc.new_regime?.total_tax || 0) / 1000) }]} barSize={52}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `₹${v}K`} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 8 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const isWinner = (label === 'Old Regime' && tc.better_regime === 'old') || (label === 'New Regime' && tc.better_regime === 'new');
                      return (
                        <div style={{ background: 'var(--surface-2)', border: `1px solid ${isWinner ? 'rgba(6,214,160,0.35)' : 'rgba(239,71,111,0.35)'}`, borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.05rem', color: isWinner ? 'var(--teal)' : 'var(--coral)' }}>₹{payload[0].value}K</div>
                          {isWinner && <div style={{ fontSize: '0.66rem', color: 'var(--teal)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={10} /> Better for you</div>}
                        </div>
                      );
                    }} />
                  <Bar dataKey="tax" radius={[7, 7, 0, 0]}>
                    <Cell fill={tc.better_regime === 'old' ? 'var(--teal)' : 'var(--coral)'} />
                    <Cell fill={tc.better_regime === 'new' ? 'var(--teal)' : 'var(--coral)'} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Deduction utilization */}
            <div className="card">
              <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>Deduction Utilisation</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {[
                  { label: '80C', used: calcDeductions(data).sec80C, max: 150000, color: 'var(--gold)', note: 'EPF + ELSS + PPF + LIC + Principal' },
                  { label: '80CCD(1B) NPS', used: Math.min(parseAmt(data.nps), 50000), max: 50000, color: 'var(--teal)', note: 'Extra, over & above 80C' },
                  { label: '80D Health', used: Math.min(parseAmt(data.health), 25000), max: 25000, color: 'var(--coral)', note: 'Self + family premium' },
                  { label: '24(b) Home Loan Interest', used: Math.min(parseAmt(data.homeInterest), 200000), max: 200000, color: 'var(--blue-bright)', note: 'Old regime only' },
                ].map((d, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: '0.79rem', color: 'var(--text-dim)', fontWeight: 600 }}>{d.label}</span>
                        <span style={{ fontSize: '0.63rem', color: 'var(--text-faint)' }}>{d.note}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', color: d.used >= d.max ? 'var(--teal)' : d.color, fontWeight: 600, fontSize: '0.79rem', flexShrink: 0 }}>
                        {fmt(d.used)} / {fmt(d.max)}{d.used >= d.max && ' ✓'}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min((d.used / d.max) * 100, 100)}%`, background: d.color, borderRadius: 3, transition: 'width 1.2s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deduction opportunities */}
            {results.deduction_suggestions?.length > 0 && (
              <div className="card" style={{ border: '1px solid rgba(245,166,35,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 33, height: 33, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Lightbulb size={16} color="var(--gold)" /></div>
                  <div>
                    <h3 style={{ fontSize: '0.91rem', fontWeight: 700, margin: '0 0 2px' }}>Deduction Opportunities</h3>
                    <p style={{ fontSize: '0.69rem', color: 'var(--text-dim)', margin: 0 }}>Unlock {fmt(results.deduction_suggestions.reduce((s, m) => s + m.estimated_tax_saving, 0))} more in tax savings this FY</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {results.deduction_suggestions.map((m, i) => (
                    <div key={i} style={{ padding: '11px 13px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 11, display: 'flex', gap: 11, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ padding: '3px 9px', borderRadius: 6, background: 'var(--gold-dim)', color: 'var(--gold)', fontSize: '0.67rem', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{m.section}</div>
                      <div style={{ flex: 1, minWidth: 170, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.83rem', color: 'var(--text)' }}>{m.label}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{m.action_tip}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)' }}>Recommended: {m.recommended_instrument}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--teal)', fontSize: '0.93rem' }}>Save {fmt(m.estimated_tax_saving)}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-faint)', marginTop: 1 }}>unused: {fmt(m.unused_amount)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Tax Advice */}
            {aiAdvice && (
              <div className="card" style={{ border: '1px solid rgba(245,166,35,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 35, height: 35, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={17} color="var(--gold)" /></div>
                  <div>
                    <h3 style={{ fontSize: '0.93rem', fontWeight: 700, margin: '0 0 2px' }}>AI Tax Advice</h3>
                    <p style={{ fontSize: '0.69rem', color: 'var(--text-dim)', margin: 0 }}>Powered by Gemini AI · Personalized for your FY 2024-25 profile · WealthyWise</p>
                  </div>
                </div>
                <Md>{aiAdvice}</Md>
              </div>
            )}

            {/* News impact */}
            <div className="card" style={{ border: '1px solid rgba(76,201,240,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: newsItems.length ? 14 : 0 }}>
                <div style={{ width: 33, height: 33, borderRadius: 10, background: 'rgba(76,201,240,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Newspaper size={16} color="var(--blue-bright)" /></div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '0.91rem', fontWeight: 700, margin: '0 0 2px' }}>Budget 2024 · News Impact</h3>
                  <p style={{ fontSize: '0.69rem', color: 'var(--text-dim)', margin: 0 }}>How recent tax changes affect your specific situation</p>
                </div>
                {!newsItems.length && (
                  <button className="btn-secondary" onClick={fetchNews} disabled={loadingNews} style={{ fontSize: '0.77rem', padding: '6px 13px', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    {loadingNews ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Loading…</> : <><Zap size={12} /> Analyse</>}
                  </button>
                )}
              </div>
              {newsItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {newsItems.map((n, i) => (
                    <div key={i} style={{ padding: '11px 13px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.83rem', color: 'var(--text)' }}>{n.headline}</div>
                        <div style={{ padding: '2px 8px', borderRadius: 5, fontSize: '0.64rem', fontWeight: 700, flexShrink: 0, background: n.urgency === 'high' ? 'var(--coral-dim)' : n.urgency === 'medium' ? 'var(--gold-dim)' : 'var(--teal-dim)', color: n.urgency === 'high' ? 'var(--coral)' : n.urgency === 'medium' ? 'var(--gold)' : 'var(--teal)' }}>
                          {(n.urgency || 'medium').toUpperCase()}
                        </div>
                      </div>
                      <Md>{n.impact_on_user}</Md>
                      <div style={{ fontSize: '0.73rem', color: 'var(--teal)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, marginTop: 9, padding: '5px 9px', background: 'var(--teal-dim)', borderRadius: 7, width: 'fit-content' }}>
                        <ArrowRight size={11} /> {n.action_required}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ITR CTA */}
            {itrSteps.length > 0 && (
              <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg,rgba(6,214,160,0.08),transparent)', border: '1px solid rgba(6,214,160,0.22)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 3 }}>Ready to file your ITR?</div>
                  <div style={{ fontSize: '0.79rem', color: 'var(--text-dim)' }}>6-step guide with exact values + AI explanation for every step</div>
                </div>
                <button className="btn-primary" onClick={() => setShowITR(true)} style={{ background: 'linear-gradient(135deg,var(--teal),#059669)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  <BookOpen size={14} /> Start ITR Filing Guide
                </button>
              </div>
            )}

            {/* Reset */}
            <button className="btn-secondary" onClick={() => { setStep('input'); setResults(null); setAiAdvice(''); setAiRegimeWhy(''); setNewsItems([]); setWarnings([]); setExtractInfo(''); setPdfFile(null); setPdfText(''); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 'fit-content' }}>
              <RotateCcw size={13} /> Edit &amp; Recalculate
            </button>
          </div>
        )}
      </div>
    </>
  );
}