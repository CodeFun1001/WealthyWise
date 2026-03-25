import React, { useState } from 'react';
import { Sparkles, ChevronRight, Loader, AlertCircle, RefreshCw, Gift, Heart, Baby, TrendingUp, Home, Briefcase, Plane, AlertTriangle } from 'lucide-react';
import { callGemini } from '../utils/gemini';

const LIFE_EVENT_SYSTEM = `You are a warm, expert Indian financial advisor who helps people navigate major life events.
RULES:
- Speak in plain English, warm tone
- Be specific — use numbers from user's data
- Bullet points only, no paragraphs
- Max 220 words total
- Give advice for the SPECIFIC event only

Structure EXACTLY as:

### Immediate Actions (Next 30 Days)
• Action 1 with specific amount
• Action 2 with specific step
• Action 3 with timeline

### Smart Money Moves
• Investment suggestion with rationale
• Tax angle for this event
• Insurance update needed

### What to Avoid
• Common mistake for this event
• Specific risk to watch

### 12-Month Roadmap
• Month 1–3 priority
• Month 4–6 priority
• Month 7–12 goal

### Key Numbers
• Suggested emergency fund: ₹X
• Investment allocation shift: X% equity, X% debt
• Tax saving opportunity: ₹X via [section]`;

const EVENTS = [
  { id: 'bonus',       label: 'Got a Bonus',          icon: <Gift size={20} />,        color: 'var(--gold)',  desc: 'Lump sum windfall strategy' },
  { id: 'marriage',    label: 'Getting Married',       icon: <Heart size={20} />,       color: 'var(--coral)', desc: 'Merge finances smartly' },
  { id: 'baby',        label: 'New Baby',              icon: <Baby size={20} />,        color: 'var(--teal)',  desc: 'Plan for child education & more' },
  { id: 'inheritance', label: 'Received Inheritance',  icon: <TrendingUp size={20} />,  color: 'var(--gold)',  desc: 'Manage windfall wisely' },
  { id: 'home',        label: 'Buying a Home',         icon: <Home size={20} />,        color: 'var(--teal)',  desc: 'Loan, down payment & tax' },
  { id: 'job_loss',    label: 'Job Loss / Sabbatical', icon: <Briefcase size={20} />,   color: 'var(--coral)', desc: 'Protect finances now' },
  { id: 'promotion',   label: 'Got Promoted',          icon: <Sparkles size={20} />,    color: 'var(--gold)',  desc: 'Level up your money game' },
  { id: 'travel',      label: 'Long-term Travel',      icon: <Plane size={20} />,       color: 'var(--teal)',  desc: 'Plan international finances' },
  { id: 'medical',     label: 'Major Medical Event',   icon: <AlertTriangle size={20} />,color: 'var(--coral)',desc: 'Manage costs & recovery' },
];

const EVENT_FIELDS = {
  bonus:       [['bonusAmount','Bonus Amount (₹)','500000'],['currentSavings','Current Savings (₹)','200000'],['existingInvest','Existing Investments (₹)','500000'],['taxBracket','Income Tax Bracket','30%']],
  marriage:    [['income1','Your Monthly Income (₹)','80000'],['income2','Partner Monthly Income (₹)','60000'],['combinedSavings','Combined Savings (₹)','500000'],['weddingBudget','Wedding Budget (₹)','1000000']],
  baby:        [['income','Monthly Income (₹)','100000'],['savings','Current Savings (₹)','300000'],['childAge','Child\'s Age (months)','0'],['education','Target Education Corpus (₹)','5000000']],
  inheritance: [['amount','Inheritance Amount (₹)','2000000'],['currentCorpus','Current Portfolio (₹)','500000'],['age','Your Age','35'],['taxBracket','Tax Bracket','30%']],
  home:        [['propertyValue','Property Value (₹)','8000000'],['downPayment','Down Payment Available (₹)','2000000'],['monthlyIncome','Monthly Income (₹)','150000'],['existingEMI','Existing EMIs (₹)','0']],
  job_loss:    [['lastSalary','Last Monthly Salary (₹)','100000'],['monthlyExpenses','Monthly Expenses (₹)','60000'],['emergencyFund','Emergency Fund (₹)','300000'],['investments','Investments (₹)','500000']],
  promotion:   [['oldSalary','Old Monthly Salary (₹)','80000'],['newSalary','New Monthly Salary (₹)','120000'],['currentInvest','Current Investments (₹)','400000'],['taxBracket','New Tax Bracket','30%']],
  travel:      [['duration','Travel Duration (months)','6'],['travelBudget','Total Budget (₹)','800000'],['currentSavings','Current Savings (₹)','500000'],['monthlyCommitments','Monthly Commitments (₹)','15000']],
  medical:     [['bills','Medical Bills (₹)','500000'],['healthCover','Insurance Claim (₹)','300000'],['savings','Accessible Savings (₹)','200000'],['monthlyIncome','Monthly Income (₹)','80000']],
};

const inputStyle = {
  width: '100%', padding: '10px 14px',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 10, color: 'var(--text)', fontSize: '0.9rem',
  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
};

function MarkdownResult({ text, accentColor }) {
  if (!text) return null;
  const sections = text.split('###').filter(Boolean);
  const colors = [accentColor, 'var(--teal)', 'var(--coral)', 'var(--gold)', accentColor];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sections.map((section, i) => {
        const lines = section.trim().split('\n').filter(Boolean);
        const title = lines[0].trim();
        const bullets = lines.slice(1);
        const color = colors[i % colors.length];
        return (
          <div key={i} style={{
            background: 'var(--surface-2)', borderRadius: 12,
            border: '1px solid var(--border)', padding: '16px 18px',
            borderLeft: `3px solid ${color}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color, marginBottom: 10 }}>{title}</div>
            {bullets.map((b, j) => {
              const clean = b.replace(/^[•\-*]\s*/, '').trim();
              if (!clean) return null;
              const parts = clean.split(/(\*\*[^*]+\*\*|₹[\d,.KLCr]+)/g);
              return (
                <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ color, marginTop: 3, flexShrink: 0, fontSize: '0.65rem' }}>▸</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.855rem', lineHeight: 1.55 }}>
                    {parts.map((p, k) =>
                      p.startsWith('**') ? <strong key={k} style={{ color: 'var(--text)', fontWeight: 700 }}>{p.replace(/\*\*/g, '')}</strong>
                      : p.match(/^₹/) ? <strong key={k} style={{ color, fontWeight: 700 }}>{p}</strong>
                      : p
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function LifeEventAdvisor() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formData, setFormData] = useState({});
  const [extraContext, setExtraContext] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setFormData(f => ({ ...f, [k]: v }));
  const event = EVENTS.find(e => e.id === selectedEvent);
  const fields = EVENT_FIELDS[selectedEvent] || [];

  async function handleAnalyze() {
    setError(''); setLoading(true); setResult('');
    try {
      const fieldSummary = fields.map(([k, lbl]) => `${lbl}: ${formData[k] || 'not provided'}`).join('\n');
      const prompt = `
Life event: ${event?.label}
${fieldSummary}
${extraContext ? `Additional context: ${extraContext}` : ''}
Risk profile: Moderate
Country: India
Provide personalized financial advice for this life event.`;
      const res = await callGemini(prompt, LIFE_EVENT_SYSTEM);
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() { setResult(''); setSelectedEvent(null); setFormData({}); setExtraContext(''); }

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 36px)', animation: 'fadeIn 0.4s ease', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div className="tag tag-gold" style={{ marginBottom: 12 }}><Sparkles size={12} /> Life Event Advisor</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.5rem, 3vw, 2.2rem)', color: 'var(--text)', marginBottom: 8 }}>
          Big life moment? Get AI financial advice.
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Major life events change your financial picture. Get personalized advice for your specific situation.
        </p>
      </div>

      {/* Event picker */}
      {!selectedEvent ? (
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
            What's happening in your life?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {EVENTS.map(e => (
              <button key={e.id} onClick={() => setSelectedEvent(e.id)} style={{
                all: 'unset', cursor: 'pointer', padding: '18px 20px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 14, transition: 'all 0.2s', textAlign: 'left',
              }}
              onMouseEnter={ev => { ev.currentTarget.style.borderColor = e.color; ev.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={ev => { ev.currentTarget.style.borderColor = 'var(--border)'; ev.currentTarget.style.transform = 'none'; }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: e.color === 'var(--gold)' ? 'var(--gold-dim)' : e.color === 'var(--coral)' ? 'var(--coral-dim)' : 'var(--teal-dim)',
                  color: e.color }}>
                  {e.icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', marginBottom: 4 }}>{e.label}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>{e.desc}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1.2fr' : '1fr', gap: 24, alignItems: 'start' }}>
          {/* Form */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: event.color === 'var(--gold)' ? 'var(--gold-dim)' : event.color === 'var(--coral)' ? 'var(--coral-dim)' : 'var(--teal-dim)',
                color: event.color }}>
                {event.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>{event.label}</div>
                <button onClick={() => { setSelectedEvent(null); setResult(''); setFormData({}); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: '0.75rem', padding: 0 }}>
                  ← Change event
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {fields.map(([k, lbl, ph]) => (
                <div key={k}>
                  <label style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block' }}>{lbl}</label>
                  <input style={inputStyle} type="text" placeholder={ph} value={formData[k] || ''}
                    onChange={e => set(k, e.target.value)}
                    onFocus={e => e.target.style.borderColor = event.color}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block' }}>
                Any other context? (optional)
              </label>
              <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                placeholder="e.g. planning to shift to a tier-2 city, have ageing parents…"
                value={extraContext} onChange={e => setExtraContext(e.target.value)}
                onFocus={e => e.target.style.borderColor = event.color}
                onBlur={e => e.target.style.borderColor = 'var(--border)'} />
            </div>

            {error && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'var(--coral-dim)', borderRadius: 10, marginBottom: 14 }}>
                <AlertCircle size={14} color="var(--coral)" />
                <span style={{ fontSize: '0.82rem', color: 'var(--coral)' }}>{error}</span>
              </div>
            )}

            <button onClick={handleAnalyze} disabled={loading} style={{
              width: '100%', padding: '12px', borderRadius: 11, border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'var(--surface-3)' : `linear-gradient(135deg, ${event.color}, ${event.color === 'var(--gold)' ? '#e8960f' : event.color})`,
              color: event.color === 'var(--coral)' || event.color === 'var(--teal)' ? '#fff' : 'var(--ink)',
              fontWeight: 700, fontSize: '0.92rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {loading ? <><Loader size={15} className="spin" /> Getting advice…</> : <>Get My Advice <ChevronRight size={15} /></>}
            </button>
          </div>

          {/* Result */}
          {(loading || result) && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={20} color="var(--gold)" className="pulse" />
                  </div>
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>Crafting personalized advice…</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>Your Personalized Plan</span>
                    <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
                      <RefreshCw size={12} /> Start over
                    </button>
                  </div>
                  <MarkdownResult text={result} accentColor={event.color} />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}