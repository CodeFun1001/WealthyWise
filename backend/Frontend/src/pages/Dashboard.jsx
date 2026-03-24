import React from 'react';
import { TrendingUp, PieChart, Heart, ArrowRight, Sparkles, Calculator, Target, Zap, Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const features = [
  {
    id: 'portfolio',
    icon: <PieChart size={26} />,
    title: 'MF Portfolio X-Ray',
    desc: 'Upload your CAMS/KFintech statement. Get XIRR, overlap analysis, expense ratio drag, and AI-powered rebalancing plan in seconds.',
    color: 'var(--gold)',
    colorDim: 'var(--gold-dim)',
    tag: 'Portfolio Analysis',
    stats: '10 sec analysis',
  },
  {
    id: 'couples',
    icon: <Heart size={26} />,
    title: "Couple's Money Planner",
    desc: "India's first AI joint financial planning tool. Optimize HRA claims, NPS matching, SIP splits, and combined insurance across both incomes.",
    color: 'var(--coral)',
    colorDim: 'var(--coral-dim)',
    tag: 'Joint Planning',
    stats: 'Save ₹2L+ in taxes',
  },
  {
    id: 'tax',
    icon: <Calculator size={26} />,
    title: 'AI Tax Wizard',
    desc: "Enter your salary or paste Form 16. Get old vs new regime comparison, every deduction you're missing, and a personalised AI tax plan.",
    color: 'var(--teal)',
    colorDim: 'var(--teal-dim)',
    tag: 'Tax Optimiser',
    stats: 'Save ₹50K+ in tax',
  },
  {
    id: 'fire',
    icon: <Flame size={26} />,
    title: 'FIRE Path Planner',
    desc: 'Enter your age, income and goals. Get a complete month-by-month FIRE roadmap — SIP amounts, corpus milestones, asset allocation, and post-FIRE income plan.',
    color: '#a78bfa',
    colorDim: 'rgba(167,139,250,0.13)',
    tag: 'Retire Early',
    stats: 'Beat inflation',
  },
];

const stats = [
  { value: '90%+', label: 'Indians without a proper financial plan' },
  { value: '₹30K+', label: 'Average yearly financial advisor fee' },
  { value: '24/7',  label: 'AI-powered financial guidance' },
];

export default function Dashboard({ setActivePage }) {
  const { user } = useAuth();
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', animation: 'fadeIn 0.5s ease' }}>

      {/* Hero */}
      <div style={{ marginBottom: 40 }}>
        <div className="tag tag-gold" style={{ marginBottom: 16 }}>
          <Sparkles size={12} /> AI-Powered Financial Planning
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.2,
          color: 'var(--text)', marginBottom: 12,
        }}>
          {greeting}, {user?.name?.split(' ')[0]}.
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '1.05rem', lineHeight: 1.65, maxWidth: 520 }}>
          Your AI-powered financial mentor is ready. Where would you like to start today?
        </p>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1, background: 'var(--border)', borderRadius: 16,
        overflow: 'hidden', marginBottom: 40, border: '1px solid var(--border)',
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{ padding: '20px 24px', background: 'var(--surface-2)', textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 'clamp(1.4rem, 3vw, 1.8rem)',
              fontWeight: 700, color: 'var(--gold)', lineHeight: 1.1, marginBottom: 4,
            }}>{s.value}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{
          fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-faint)',
          textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16,
        }}>
          Available Features
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {features.map(f => (
            <button
              key={f.id}
              onClick={() => setActivePage(f.id)}
              style={{
                all: 'unset', cursor: 'pointer', display: 'block',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '26px',
                transition: 'all 0.3s ease', position: 'relative', overflow: 'hidden',
                textAlign: 'left',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = f.color;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = `0 12px 40px ${f.colorDim}`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Corner glow */}
              <div style={{
                position: 'absolute', top: 0, right: 0, width: 200, height: 200,
                background: `radial-gradient(circle, ${f.colorDim} 0%, transparent 70%)`,
                borderRadius: '50%', transform: 'translate(50%, -50%)',
              }} />

              <div style={{
                width: 50, height: 50, borderRadius: 14,
                background: f.colorDim, color: f.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 18, position: 'relative',
              }}>
                {f.icon}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: f.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {f.tag}
                </span>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-faint)' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {f.stats}
                </span>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
                {f.title}
              </h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.86rem', lineHeight: 1.65, marginBottom: 20 }}>
                {f.desc}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: f.color, fontSize: '0.86rem', fontWeight: 600 }}>
                Open Feature <ArrowRight size={14} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Trust bar */}
      <div style={{
        marginTop: 40, padding: '20px 24px',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'space-around',
      }}>
        {[
          { icon: <Zap size={15} />,        text: 'AI Powered Portfolio Analysis' },
          { icon: <Calculator size={15} />, text: 'Smart Tax Optimizer (Old vs New Regime)' },
          { icon: <Flame size={15} />,      text: 'FIRE Retirement Planner' },
          { icon: <PieChart size={15} />,   text: 'Mutual Fund Portfolio Health Check' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim)', fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--teal)' }}>{item.icon}</span>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
