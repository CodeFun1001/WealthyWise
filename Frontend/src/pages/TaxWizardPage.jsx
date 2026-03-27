import React, { useState, useRef, useEffect } from 'react';
import {
  Zap, RotateCcw, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Sparkles, Calculator, Lightbulb,
  Newspaper, Upload, X, Info, ExternalLink, ArrowRight,
  BookOpen, SlidersHorizontal, FileCheck, TrendingUp,
  Shield, HelpCircle, AlertTriangle, Target,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts';
import { callGemini } from '../utils/gemini';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const parseAmt = v => Number(String(v || 0).replace(/,/g, '')) || 0;

function calcOldRegime(gross, totalDed, hra, rent, metro) {
  const basic = gross * 0.40;
  const hraEx = (hra > 0 && rent > 0)
    ? Math.max(0, Math.min(hra, rent - basic * 0.1, basic * (metro ? 0.5 : 0.4)))
    : 0;
  const taxable = Math.max(gross - 50000 - totalDed - hraEx, 0);
  let rawTax =
    taxable > 1000000 ? 112500 + (taxable - 1000000) * 0.30 :
    taxable > 500000  ? 12500  + (taxable - 500000)  * 0.20 :
    taxable > 250000  ? (taxable - 250000) * 0.05 : 0;
  const rebate = taxable <= 500000;
  if (rebate) rawTax = 0;
  const totalTax = Math.round(rawTax * 1.04);
  return {
    total_tax: totalTax,
    taxable_income: Math.round(taxable),
    hraEx: Math.round(hraEx),
    effective_rate: gross > 0 ? +((totalTax / gross) * 100).toFixed(2) : 0,
    rebate_87a_applied: rebate,
    tax_before_cess: Math.round(rawTax),
    cess: Math.round(rawTax * 0.04),
  };
}

function calcNewRegime(gross) {
  const taxable = Math.max(gross - 75000, 0);
  let rawTax =
    taxable > 1500000 ? 140000 + (taxable - 1500000) * 0.30 :
    taxable > 1200000 ? 80000  + (taxable - 1200000) * 0.20 :
    taxable > 1000000 ? 50000  + (taxable - 1000000) * 0.15 :
    taxable > 700000  ? 20000  + (taxable - 700000)  * 0.10 :
    taxable > 300000  ? (taxable - 300000) * 0.05 : 0;
  const rebate = taxable <= 700000;
  if (rebate) rawTax = 0;
  const totalTax = Math.round(rawTax * 1.04);
  return {
    total_tax: totalTax,
    taxable_income: Math.round(taxable),
    effective_rate: gross > 0 ? +((totalTax / gross) * 100).toFixed(2) : 0,
    rebate_87a_applied: rebate,
    tax_before_cess: Math.round(rawTax),
    cess: Math.round(rawTax * 0.04),
  };
}

function calcDeductions(d) {
  const sec80C = Math.min(
    parseAmt(d.epf) + parseAmt(d.elss) + parseAmt(d.ppf) +
    parseAmt(d.lic) + parseAmt(d.homePrincipal), 150000
  );
  const nps    = Math.min(parseAmt(d.nps), 50000);
  const health = Math.min(parseAmt(d.health), 25000);
  const homeInt = Math.min(parseAmt(d.homeInterest), 200000);
  return { sec80C, nps, health, homeInt, total: sec80C + nps + health + homeInt };
}

/* ─── Format helpers ───────────────────────────────────────────────────────── */
const fmt = n => {
  if (!n && n !== 0) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(abs / 100000).toFixed(2)}L`;
  if (abs >= 1000)     return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

/* ═══════════════════════ MARKDOWN RENDERER ════════════════════════════════== */
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
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    const bq = line.match(/^> (.+)/);
    const hr = /^---+$/.test(line.trim());
    const ul = line.match(/^[-*•] (.+)/);
    const ol = line.match(/^\d+\. (.+)/);

    if (h3)          { closeList(); html += `<h3 class="md-h3">${inline(h3[1])}</h3>`; }
    else if (h2)     { closeList(); html += `<h2 class="md-h2">${inline(h2[1])}</h2>`; }
    else if (h1)     { closeList(); html += `<h1 class="md-h1">${inline(h1[1])}</h1>`; }
    else if (bq)     { closeList(); html += `<blockquote class="md-bq">${inline(bq[1])}</blockquote>`; }
    else if (hr)     { closeList(); html += `<hr class="md-hr"/>`; }
    else if (ul) {
      if (!inUl) { if (inOl) { html += '</ol>'; inOl = false; } html += '<ul class="md-ul">'; inUl = true; }
      html += `<li class="md-li">${inline(ul[1])}</li>`;
    } else if (ol) {
      if (!inOl) { if (inUl) { html += '</ul>'; inUl = false; } html += '<ol class="md-ol">'; inOl = true; }
      html += `<li class="md-li">${inline(ol[1])}</li>`;
    } else if (line.trim() === '') {
      closeList(); html += '<div class="md-gap"></div>';
    } else {
      closeList(); html += `<p class="md-p">${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

function Md({ children, className = '' }) {
  return (
    <div
      className={`md-root ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(children || '') }}
    />
  );
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
.md-code {
  font-family: var(--font-mono, monospace); font-size: 0.82em;
  background: var(--surface-3); color: var(--teal);
  padding: 1px 5px; border-radius: 4px;
}
.md-link { color: var(--teal); text-decoration: underline; }
.md-ul, .md-ol { padding-left: 1.25rem; margin: 0.4rem 0; }
.md-li { color: var(--text-dim); margin: 0.2rem 0; line-height: 1.65; }
.md-bq {
  border-left: 3px solid var(--gold); padding: 0.5rem 0.9rem;
  margin: 0.6rem 0; background: var(--gold-dim);
  color: var(--text-dim); font-style: italic; border-radius: 0 6px 6px 0;
}
.md-hr { border: none; border-top: 1px solid var(--border); margin: 0.75rem 0; }
`;

/* ─── Shared UI atoms ──────────────────────────────────────────────────────── */
function Field({ label, placeholder, value, onChange, prefix = '₹', hint, readOnly }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      {hint && <div style={{ fontSize: '0.66rem', color: 'var(--text-faint)', lineHeight: 1.4 }}>{hint}</div>}
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>{prefix}</span>
        )}
        <input
          className="input-field"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          readOnly={readOnly}
          style={{ paddingLeft: prefix ? 24 : 12, background: readOnly ? 'var(--surface-3)' : undefined, width: '100%', boxSizing: 'border-box', opacity: readOnly ? 0.7 : 1 }}
        />
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

function OverrideCollapse({ data, set, hint }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SlidersHorizontal size={13} color="var(--text-dim)" />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>Override / Add Deductions</div>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-faint)' }}>{hint}</div>
          </div>
        </div>
        {open ? <ChevronUp size={13} color="var(--text-faint)" /> : <ChevronDown size={13} color="var(--text-faint)" />}
      </button>
      {open && <div style={{ paddingTop: 14 }}><DeductionsPanel data={data} set={set} /></div>}
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

function AnalyseButton({ onClick, disabled }) {
  return (
    <button className="btn-primary" onClick={onClick} disabled={disabled} style={{ padding: '14px 28px', fontSize: '0.97rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
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

/* ─── ITR Guide Overlay with AI explanations per step ─────────────────────── */
function ITRGuide({ steps, onClose }) {
  const [active, setActive] = useState(0);
  const [reasonText, setReasonText] = useState('');
  const [loadingReason, setLoadingReason] = useState(false);
  const step = steps[active];

  const fetchReason = async (s) => {
    setLoadingReason(true);
    setReasonText('');
    try {
      const prompt = `You are an expert Indian Chartered Accountant helping a taxpayer file ITR for AY 2025-26.

ITR Filing Step: **"${s.field_name}"**
Portal section: ${s.portal_section}
Value to enter: ${s.value_to_enter}

Explain this step in markdown with these exact 4 points:

**Why this field matters** — legal or practical reason (1-2 sentences)

**Where to find this value** — exact document/section (Form 16 Part A or B, 26AS, investment proof, etc.)

**Common mistake** — the #1 error people make at this step

**Pro tip** — one actionable tip to make this easier or avoid issues

Use **bold** for key terms and document names. Keep each point concise. Friendly tone.`;
      const text = await callGemini(prompt);
      setReasonText(text);
    } catch {
      setReasonText('_AI explanation unavailable. Check your Gemini API key in .env_');
    }
    setLoadingReason(false);
  };

  useEffect(() => { if (step) fetchReason(step); }, [active]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(10px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 660, background: 'var(--surface)', border: '1px solid var(--border-bright)', borderRadius: 22, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(6,214,160,0.08),transparent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--teal-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={18} color="var(--teal)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.93rem' }}>ITR Filing Guide</div>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-dim)' }}>Step-by-step · AY 2025-26 · AI-explained</div>
            </div>
          </div>
          <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', padding: 6, color: 'var(--text-faint)', display: 'flex' }}><X size={18} /></button>
        </div>

        {/* Progress bar */}
        <div style={{ padding: '10px 22px 0', display: 'flex', gap: 4, flexShrink: 0 }}>
          {steps.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} style={{ all: 'unset', cursor: 'pointer', height: 4, flex: 1, borderRadius: 2, background: i <= active ? 'var(--teal)' : 'var(--surface-3)', transition: 'background 0.3s' }} />
          ))}
        </div>

        {/* Body */}
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
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0, animation: 'pulse 2s infinite' }} />
            <div>
              <div style={{ fontSize: '0.63rem', color: 'var(--text-faint)', marginBottom: 2 }}>Enter this value:</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--teal)', fontSize: '1rem' }}>{step.value_to_enter}</div>
            </div>
          </div>

          <div style={{ fontSize: '0.84rem', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 16 }}>{step.instruction}</div>

          {/* AI WHY explanation */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <HelpCircle size={14} color="var(--gold)" />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Why this step matters</span>
            </div>
            {loadingReason ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-faint)', fontSize: '0.82rem' }}>
                <div className="spinner" style={{ width: 13, height: 13 }} /> Generating AI explanation…
              </div>
            ) : (
              <Md>{reasonText}</Md>
            )}
          </div>

          <a href={step.url_hint} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--teal)', textDecoration: 'none', fontWeight: 600, marginTop: 14 }}>
            Open ITR Portal <ExternalLink size={12} />
          </a>
        </div>

        {/* Footer nav */}
        <div style={{ padding: '12px 22px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={() => setActive(a => Math.max(0, a-1))} disabled={active === 0} style={{ fontSize: '0.82rem', opacity: active === 0 ? 0.4 : 1 }}>← Prev</button>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-faint)' }}>{active + 1} / {steps.length}</span>
          {active < steps.length - 1
            ? <button className="btn-primary" onClick={() => setActive(a => a+1)} style={{ fontSize: '0.82rem' }}>Next →</button>
            : <button className="btn-primary" onClick={onClose} style={{ fontSize: '0.82rem', background: 'linear-gradient(135deg,var(--teal),#059669)' }}>✓ Done</button>
          }
        </div>
      </div>
    </div>
  );
}

/* ─── Samples ──────────────────────────────────────────────────────────────── */
const SAMPLES = [
  { label: 'Software Engineer · Mumbai · ₹12L', gross: '1200000', hra: '240000', rent: '180000', isMetro: true,  epf: '72000',  elss: '50000', ppf: '',       lic: '15000', homePrincipal: '', nps: '20000', health: '12000', homeInterest: '',       tds: '95000'  },
  { label: 'Teacher · Bangalore · ₹8L',         gross: '800000',  hra: '120000', rent: '96000',  isMetro: true,  epf: '48000',  elss: '',      ppf: '60000',  lic: '25000', homePrincipal: '', nps: '50000', health: '20000', homeInterest: '',       tds: '28000'  },
  { label: 'Manager · Pune · ₹18L (Home Loan)', gross: '1800000', hra: '',       rent: '',       isMetro: false, epf: '108000', elss: '42000', ppf: '',       lic: '',      homePrincipal: '', nps: '50000', health: '25000', homeInterest: '180000', tds: '230000' },
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
  const fileRef = useRef(null);

  const set = k => v => setData(p => ({ ...p, [k]: v }));

  const loadSample = idx => {
    setData({ ...DEFAULT, ...SAMPLES[idx] });
    setInputMode('manual');
  };

  /* ── Live preview ── */
  const livePreview = (inputMode === 'manual' && parseAmt(data.gross) > 0) ? (() => {
    const g = parseAmt(data.gross);
    const ded = calcDeductions(data);
    const o = calcOldRegime(g, ded.total, parseAmt(data.hra), parseAmt(data.rent), data.isMetro);
    const n = calcNewRegime(g);
    return { old: o.total_tax, new: n.total_tax, save: Math.abs(o.total_tax - n.total_tax), better: o.total_tax <= n.total_tax ? 'old' : 'new' };
  })() : null;

  /* ── AI prompts ── */
  const buildAdvicePrompt = (gross, old, nw, better, savings, missed, tds, hraEx) => {
    const bestTax = better === 'old' ? old.total_tax : nw.total_tax;
    const refund = tds > 0 ? tds - bestTax : 0;
    return `You are WealthyWise — India's premier AI financial advisor and Chartered Accountant. A real salaried taxpayer has shared their FY 2024-25 data. Give them **detailed, personalized, actionable advice**.

## Their Tax Profile (FY 2024-25)
- **Gross Salary**: ₹${(gross/100000).toFixed(2)}L
- **HRA Exemption**: ${fmt(hraEx)} (old regime, based on their rent & city)
- **Old Regime Tax**: ${fmt(old.total_tax)} | Taxable income: ${fmt(old.taxable_income)} | Rate: ${old.effective_rate}%
- **New Regime Tax**: ${fmt(nw.total_tax)} | Taxable income: ${fmt(nw.taxable_income)} | Rate: ${nw.effective_rate}%
- **Recommended**: **${better.toUpperCase()} REGIME** — saves **${fmt(savings)}**
- **TDS Paid**: ${tds > 0 ? fmt(tds) : 'Not provided'}${tds > 0 ? ` → ${refund >= 0 ? `**REFUND: ${fmt(refund)}**` : `**PAY: ${fmt(Math.abs(refund))}**`}` : ''}
- **Untapped Deductions**: ${missed.length > 0 ? missed.map(m => `${m.section} (can save ${fmt(m.estimated_tax_saving)} more)`).join(', ') : 'None — fully optimized!'}

## Your Task
Write a comprehensive, warm, personalized analysis. Structure it EXACTLY like this:

### 💡 Why ${better === 'old' ? 'Old' : 'New'} Regime Wins For You
2-3 sentences with their exact numbers. Explain the key factor (deduction level, income bracket, HRA situation).

### 🎯 Action Plan — Do This Before March 31, 2025
3-4 concrete steps with exact ₹ amounts. Each step should explain **WHY** it reduces tax (the mechanism).

### ⚠️ Don't Make These Common Mistakes
2-3 specific mistakes people at ₹${(gross/100000).toFixed(0)}L income make. Be precise.

### 💰 ${tds > 0 ? (refund >= 0 ? 'Your Refund Situation' : 'Tax Payment Due') : 'TDS & Advance Tax'}
${tds > 0 ? (refund >= 0 ? `Explain the ₹${(Math.abs(refund)/1000).toFixed(0)}K refund — how to claim it faster, e-verify timeline, etc.` : `Explain the ₹${(Math.abs(refund)/1000).toFixed(0)}K payment due — when to pay, how to avoid interest.`) : 'Advise on tracking TDS and what to do if no TDS is deducted.'}

### 📅 FY 2025-26 Planning Tip
One key insight to plan better next year based on their situation.

Rules: Use **bold** for all ₹ amounts and key terms. Use Indian number format. Max 320 words. Be specific, not generic. Speak directly to "you".`;
  };

  const buildRegimeWhyPrompt = (gross, old, nw, better) =>
    `As a senior Indian CA, explain in exactly 2 concise sentences why the **${better} tax regime** saves this person money:
Gross: ₹${(gross/100000).toFixed(1)}L | Old regime tax: ${fmt(old.total_tax)} | New regime tax: ${fmt(nw.total_tax)} | Difference: ${fmt(Math.abs(old.total_tax - nw.total_tax))}
Mention the specific reason (deduction level, slab benefit, etc.) with exact numbers. Use **bold** for ₹ amounts.`;

  /* ── Main analyze ── */
  const analyze = async () => {
    if (inputMode === 'manual' && !parseAmt(data.gross)) { setError('Please enter your gross salary.'); return; }
    if (inputMode === 'pdf' && !pdfFile)               { setError('Please upload a Form 16 PDF.'); return; }
    if (inputMode === 'text' && !pdfText.trim())       { setError('Please paste Form 16 text.'); return; }
    setError(''); setWarnings([]); setStep('loading'); setLoadingStage('Calculating taxes…');

    try {
      let result = null;

      // Try backend
      if (API_BASE) {
        setLoadingStage('Connecting to backend…');
        try {
          const fd = new FormData();
          const fields = { gross_salary: parseAmt(data.gross), hra_received: parseAmt(data.hra), rent_paid: parseAmt(data.rent), is_metro: data.isMetro, epf: parseAmt(data.epf), elss: parseAmt(data.elss), ppf: parseAmt(data.ppf), lic: parseAmt(data.lic), home_principal: parseAmt(data.homePrincipal), nps_80ccd1b: parseAmt(data.nps), health_insurance_80d: parseAmt(data.health), home_loan_interest: parseAmt(data.homeInterest), tds_deducted: parseAmt(data.tds) };
          Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
          if (pdfFile) fd.append('pdf_file', pdfFile);
          const resp = await fetch(`${API_BASE}/api/tax/analyze`, { method: 'POST', body: fd });
          if (resp.ok) result = await resp.json();
        } catch (_) {}
      }

      // Frontend-only calculation
      if (!result) {
        setLoadingStage('Running FY 2024-25 tax calculation…');
        const gross = parseAmt(data.gross);
        const ded   = calcDeductions(data);
        const old   = calcOldRegime(gross, ded.total, parseAmt(data.hra), parseAmt(data.rent), data.isMetro);
        const nw    = calcNewRegime(gross);
        const better  = old.total_tax <= nw.total_tax ? 'old' : 'new';
        const savings = Math.abs(old.total_tax - nw.total_tax);
        const tds     = parseAmt(data.tds);

        // Validation warnings
        const localWarnings = [];
        const raw80C = parseAmt(data.epf) + parseAmt(data.elss) + parseAmt(data.ppf) + parseAmt(data.lic) + parseAmt(data.homePrincipal);
        if (raw80C > 150000) localWarnings.push(`80C investments total ${fmt(raw80C)} — capped at ₹1,50,000 limit per Income Tax Act.`);
        if (parseAmt(data.nps) > 50000) localWarnings.push('NPS contribution capped at ₹50,000 under 80CCD(1B).');
        if (tds > gross * 0.5) localWarnings.push('TDS seems very high relative to salary — please verify with Form 26AS.');
        setWarnings(localWarnings);

        // Deduction opportunities (only useful in old regime context)
        const marginal = gross > 1000000 ? 0.312 : gross > 500000 ? 0.208 : 0.052;
        const missed = [];
        if (ded.sec80C < 150000) missed.push({ section: '80C', label: 'ELSS / PPF / LIC', current_amount: ded.sec80C, max_limit: 150000, unused_amount: 150000 - ded.sec80C, estimated_tax_saving: Math.round((150000 - ded.sec80C) * marginal), recommended_instrument: 'ELSS Mutual Fund (3-yr lock-in)', action_tip: `Invest ${fmt(150000 - ded.sec80C)} more in ELSS to fully utilize 80C.` });
        if (parseAmt(data.nps) < 50000) missed.push({ section: '80CCD(1B)', label: 'NPS Tier-1', current_amount: parseAmt(data.nps), max_limit: 50000, unused_amount: 50000 - parseAmt(data.nps), estimated_tax_saving: Math.round((50000 - parseAmt(data.nps)) * marginal), recommended_instrument: 'NPS Tier-1 via eNPS (NSDL)', action_tip: 'Open NPS Tier-1 — this deduction is OVER & ABOVE 80C.' });
        if (parseAmt(data.health) < 25000) missed.push({ section: '80D', label: 'Health Insurance', current_amount: parseAmt(data.health), max_limit: 25000, unused_amount: 25000 - parseAmt(data.health), estimated_tax_saving: Math.round((25000 - parseAmt(data.health)) * marginal), recommended_instrument: 'Family Floater (Star / HDFC Ergo / Niva Bupa)', action_tip: `Upgrade health cover — add ${fmt(25000 - parseAmt(data.health))} premium to claim full 80D.` });

        // ITR steps
        const localITRSteps = [
          { step_number: 1, portal_section: 'incometax.gov.in → e-File → Income Tax Returns', field_name: 'ITR Form Selection', value_to_enter: 'ITR-1 (salary only) or ITR-2 (capital gains / multiple sources)', instruction: 'Login to incometax.gov.in → click e-File → Income Tax Returns → File ITR → Select AY 2025-26. Use ITR-1 for salary-only income. If you have capital gains from stocks/MF, use ITR-2.', url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 2, portal_section: 'ITR Portal → Personal Information', field_name: 'Tax Regime Selection', value_to_enter: better === 'old' ? 'Old Tax Regime (must explicitly opt-in)' : 'New Tax Regime (default — no action needed)', instruction: `Select ${better === 'old' ? 'OLD REGIME' : 'NEW REGIME'}. This saves you ${fmt(savings)} vs the other option. IMPORTANT: New regime is now the DEFAULT. If you want old regime, you MUST explicitly opt for it before deadline — you cannot switch after filing.`, url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 3, portal_section: 'ITR Portal → Income Details → Salary', field_name: 'Gross Salary', value_to_enter: fmt(gross), instruction: 'Enter gross salary exactly as shown in Form 16 Part B under "Income chargeable under the head Salaries". This is BEFORE standard deduction. If you have multiple employers, add all salaries.', url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 4, portal_section: 'ITR Portal → Deductions (Chapter VI-A)', field_name: 'Section 80C Total', value_to_enter: `${fmt(ded.sec80C)} (hard cap: ₹1,50,000)`, instruction: 'Enter total of EPF + ELSS + PPF + LIC premium + Home Loan Principal. The portal will auto-cap at ₹1,50,000. Collect proofs: EPF passbook, ELSS statement, PPF passbook, LIC premium receipts. Keep these for 6 years.', url_hint: 'https://eportal.incometax.gov.in' },
          { step_number: 5, portal_section: 'ITR Portal → Tax Paid → TDS Details', field_name: 'TDS from Employer (Form 26AS)', value_to_enter: tds > 0 ? fmt(tds) : 'Verify on Form 26AS first', instruction: 'CRITICAL STEP: First verify TDS on Form 26AS. Go to incometax.gov.in → Services → View Form 26AS. The TDS in Form 26AS MUST match Form 16 Part A. If there is any mismatch, resolve with your employer BEFORE filing — a mismatch triggers an ITR notice.', url_hint: 'https://www.incometax.gov.in/iec/foportal/help/how-to-view-form-26as' },
          { step_number: 6, portal_section: 'ITR Portal → Submit & Verify', field_name: 'e-Verification', value_to_enter: 'Aadhaar OTP — instant (recommended)', instruction: 'After submitting ITR, e-verify WITHIN 30 DAYS. Use Aadhaar OTP (fastest), Net Banking, or Bank ATM. WITHOUT e-verification, your ITR is treated as NOT FILED. Faster e-verification = faster refund processing by CPC Bengaluru.', url_hint: 'https://eportal.incometax.gov.in/iec/foservices/#/e-verify-return' },
        ];

        result = {
          input_source: inputMode,
          confidence_score: 0.9,
          tax_comparison: {
            old_regime: { ...old },
            new_regime: { ...nw },
            better_regime: better,
            savings_by_better: savings,
            hra_exemption_old: old.hraEx,
          },
          deduction_suggestions: missed,
          itr_steps: localITRSteps,
          news_impacts: [],
          validation_warnings: localWarnings,
          parsed_data: { gross_salary: gross, confidence: 0.9 },
          _local: true,
        };
      }

      setResults(result);
      setItrSteps(result.itr_steps || []);

      const tc = result.tax_comparison;
      const gross = result.parsed_data?.gross_salary || parseAmt(data.gross);
      const missed = result.deduction_suggestions || [];
      const tds = parseAmt(data.tds) || 0;

      setLoadingStage('Generating personalized AI analysis…');
      const [adviceText, whyText] = await Promise.all([
        callGemini(buildAdvicePrompt(gross, tc.old_regime, tc.new_regime, tc.better_regime, tc.savings_by_better, missed, tds, tc.hra_exemption_old))
          .catch(() => '> _AI advice unavailable.'),
        callGemini(buildRegimeWhyPrompt(gross, tc.old_regime, tc.new_regime, tc.better_regime))
          .catch(() => ''),
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
    const tc = results.tax_comparison;
    const gross = results.parsed_data?.gross_salary || parseAmt(data.gross);

    try {
      if (API_BASE) {
        const resp = await fetch(`${API_BASE}/api/tax/news`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gross_salary: gross, better_regime: tc.better_regime, sec80C: 0, nps: parseAmt(data.nps) }) });
        if (resp.ok) { const d = await resp.json(); setNewsItems(d.impacts || []); setLoadingNews(false); return; }
      }

      const prompt = `You are an expert Indian financial journalist and CA. Write a thorough analysis of Budget 2024 tax changes for a salaried person earning ₹${(gross/100000).toFixed(1)}L on the **${tc.better_regime} regime**.

Structure your response in markdown:

## Budget 2024: Tax Changes That Impact You

### 1. New Regime Standard Deduction: Now ₹75,000
Previously ₹50K, now ₹75K. For this person's income, explain exact tax saving from this change vs last year. Should they reconsider their regime?

### 2. Capital Gains Tax Overhaul
LTCG on equity/equity MFs now **12.5%** (was 10%) above ₹1.25L threshold. STCG now **20%** (was 15%). How does this affect their ELSS redemptions? What should they do with investments before and after holding 1 year?

### 3. NPS Tax Benefits Update
Employer NPS contribution deduction raised. Explain NPS Vatsalya if relevant. What's the total tax benefit of NPS for their income bracket?

### 4. ITR Filing Deadline & Penalties
July 31, 2025 is the deadline. Penalty for late filing: ₹5,000 (income > ₹5L) or ₹1,000 (income ≤ ₹5L). Plus interest at 1%/month on unpaid tax. 3 urgent actions to take now.

Use **bold** for all numbers. Reference their specific income bracket. Keep under 280 words. Friendly but urgent tone.`;

      const text = await callGemini(prompt);
      setNewsItems([{
        headline: 'Budget 2024 — Complete Tax Impact Analysis',
        impact_on_user: text,
        action_required: 'File ITR before July 31, 2025 to avoid ₹5,000 penalty',
        urgency: 'high',
      }]);
    } catch {
      setNewsItems([{
        headline: 'Budget 2024 Key Changes',
        impact_on_user: `## Key Budget 2024 Changes\n\n**New regime standard deduction raised to ₹75,000** (from ₹50,000). For salaried taxpayers on new regime, this saves up to ₹7,500 in tax.\n\n**LTCG on equity raised to 12.5%** (from 10%) above ₹1.25L. **STCG raised to 20%** (from 15%). Plan your ELSS redemptions accordingly — hold equity MFs for 1+ year.\n\n**ITR deadline: July 31, 2025.** Late filing penalty: ₹5,000 + 1% monthly interest.`,
        action_required: 'Compare regimes, plan ELSS redemptions, file by July 31, 2025',
        urgency: 'high',
      }]);
    }
    setLoadingNews(false);
  };

  const tc = results?.tax_comparison;

  /* ══════════════════════════════ RENDER ══════════════════════════════════ */
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

            {/* Samples */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)', fontWeight: 600 }}>Load sample:</span>
              {SAMPLES.map((s, i) => (
                <button key={i} onClick={() => loadSample(i)} style={{ all: 'unset', cursor: 'pointer', padding: '5px 11px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 20, fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-body)', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                  {s.label}
                </button>
              ))}
            </div>

            {/* ── MANUAL ── */}
            {inputMode === 'manual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  style={{ padding: '32px 22px', border: `2px dashed ${pdfFile ? 'var(--teal)' : 'var(--border)'}`, borderRadius: 14, textAlign: 'center', background: pdfFile ? 'var(--teal-dim)' : 'var(--surface)', cursor: 'pointer', transition: 'all 0.3s' }}
                >
                  <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) setPdfFile(f); }} />
                  {pdfFile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}>
                      <FileCheck size={34} color="var(--teal)" />
                      <div style={{ fontWeight: 700, color: 'var(--teal)', fontSize: '0.93rem' }}>{pdfFile.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>AI will extract salary, HRA, TDS & deductions</div>
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
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <IncomePanel data={data} set={set} />
                  <OverrideCollapse data={data} set={set} hint="Override extracted values or add missing deductions" />
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
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', marginBottom: 8, lineHeight: 1.6 }}>Open Form 16 PDF → Ctrl+A → Ctrl+C → Paste below. AI extracts all fields automatically.</div>
                    <textarea
                      className="input-field"
                      placeholder="Paste your Form 16 text here…"
                      value={pdfText}
                      onChange={e => setPdfText(e.target.value)}
                      style={{ minHeight: 150, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.79rem', paddingLeft: 14, width: '100%', boxSizing: 'border-box' }}
                    />
                    {pdfText && <div style={{ marginTop: 5, fontSize: '0.69rem', color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={11} /> {pdfText.split(/\s+/).filter(Boolean).length} words detected — ready</div>}
                  </div>
                  <IncomePanel data={data} set={set} />
                  <OverrideCollapse data={data} set={set} hint="Override if AI extraction misses any deductions" />
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
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calculator size={24} color="var(--gold)" />
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--text)', marginBottom: 5 }}>
                {loadingStage || 'Analysing your taxes…'}
              </h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.84rem', margin: 0 }}>FY 2024-25 rules · 87A rebate · HRA formula · AI insights</p>
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
                { label: 'Tax — Old Regime',      value: fmt(tc.old_regime?.total_tax),  color: tc.better_regime === 'old' ? 'var(--teal)' : 'var(--coral)', bg: tc.better_regime === 'old' ? 'var(--teal-dim)' : 'var(--coral-dim)' },
                { label: 'Tax — New Regime',      value: fmt(tc.new_regime?.total_tax),  color: tc.better_regime === 'new' ? 'var(--teal)' : 'var(--coral)', bg: tc.better_regime === 'new' ? 'var(--teal-dim)' : 'var(--coral-dim)' },
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
                <BarChart data={[
                  { name: 'Old Regime', tax: Math.round((tc.old_regime?.total_tax || 0) / 1000) },
                  { name: 'New Regime', tax: Math.round((tc.new_regime?.total_tax || 0) / 1000) },
                ]} barSize={52}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-dim)', fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `₹${v}K`} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [`₹${v}K`, 'Tax']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }} />
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
                        {fmt(d.used)} / {fmt(d.max)}
                        {d.used >= d.max && ' ✓'}
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
            <button className="btn-secondary" onClick={() => { setStep('input'); setResults(null); setAiAdvice(''); setAiRegimeWhy(''); setNewsItems([]); setWarnings([]); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 'fit-content' }}>
              <RotateCcw size={13} /> Edit &amp; Recalculate
            </button>
          </div>
        )}
      </div>
    </>
  );
}