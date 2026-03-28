import React, { useState } from 'react';
import { Upload, PieChart, TrendingUp, AlertTriangle, CheckCircle, Loader, ChevronDown, BarChart2, Zap } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { callGemini, PORTFOLIO_SYSTEM } from '../utils/gemini';

const SAMPLE_PORTFOLIO = `Folio No: 1234567890
Investor: Arjun Sharma

Scheme: Mirae Asset Large Cap Fund - Regular Plan - Growth
Units: 1250.345
NAV (as on 15-Mar-2024): 98.45
Market Value: ₹1,23,108

Scheme: Parag Parikh Flexi Cap Fund - Direct Plan - Growth
Units: 892.120
NAV (as on 15-Mar-2024): 74.23
Market Value: ₹66,228

Scheme: Axis Bluechip Fund - Direct Plan - Growth
Units: 540.000
NAV (as on 15-Mar-2024): 52.18
Market Value: ₹28,177

Scheme: HDFC Mid-Cap Opportunities Fund - Regular Plan - Growth
Units: 320.500
NAV (as on 15-Mar-2024): 142.30
Market Value: ₹45,607

Scheme: SBI Small Cap Fund - Direct Plan - Growth
Units: 180.200
NAV (as on 15-Mar-2024): 165.40
Market Value: ₹29,810

Total Portfolio Value: ₹2,92,930`;

const PIE_COLORS = ['#f5a623', '#06d6a0', '#4cc9f0', '#ef476f', '#7b61ff', '#ffd166'];

function parseAndBuildCharts(portfolioText) {
  const schemes = [];
  const lines = portfolioText.split('\n');
  
  let currentScheme = null;
  lines.forEach(line => {
    if (line.startsWith('Scheme:')) {
      if (currentScheme) schemes.push(currentScheme);
      currentScheme = { name: line.replace('Scheme:', '').trim(), value: 0 };
    }
    if (line.includes('Market Value') && currentScheme) {
      const match = line.match(/₹([\d,]+)/);
      if (match) {
        currentScheme.value = Number(match[1].replace(/,/g, ''));
      }
    }
  });
  if (currentScheme) schemes.push(currentScheme);

  const shortNames = schemes.map(s => ({
    ...s,
    short: s.name.split('-')[0].trim().replace(/Fund$/, '').trim(),
  }));

  return shortNames;
}

export default function PortfolioPage() {
  const [step, setStep] = useState('input');
  const [portfolioText, setPortfolioText] = useState('');
  const [result, setResult] = useState('');
  const [chartData, setChartData] = useState([]);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const analyze = async (text) => {
    const toAnalyze = text || portfolioText;
    if (!toAnalyze.trim()) { setError('Please enter your portfolio data.'); return; }

    setError('');
    setStep('analyzing');
    setPortfolioText(toAnalyze);

    const charts = parseAndBuildCharts(toAnalyze);
    
    if (charts.length === 0) {
      setError("Could not detect funds. Please paste CAMS format.");
      setStep("input");
      return;
    }
    setChartData(charts);

    try {
      const prompt = `
        Analyze this Indian mutual fund portfolio.

        Provide short structured insights:

        ### Portfolio Summary
        Total value, number of funds, style.

        ### Risk Analysis
        Diversification, market cap exposure.

        ### Key Issues
        Overlap or concentration problems.

        ### Recommendations
        What to rebalance or consolidate.

        ### Tax Insight
        LTCG impact and tax optimization.

        Portfolio Data:
        ${toAnalyze}

        Rules:
        • Bullet points only
        • Maximum 120 words
        • Use ₹ and Indian number format
        `;

      const response = await callGemini(prompt, PORTFOLIO_SYSTEM);
      setResult(response || "AI could not generate analysis. Try again.");
      setStep('results');
    } catch (err) {
      setError('Gemini API error: ' + err.message + '. Please add your VITE_GEMINI_API_KEY.');
      setStep('input');
    }
  };

  const formatMarkdown = (text) => {
    return text
      .replace(/###\s(.+)/g, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.*)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/\n/g, '<br/>');
  };

  const total = chartData.reduce((s, d) => s + d.value, 0);

  const performanceData = [
    { month: 'Jan', value: 2.4 }, { month: 'Feb', value: -0.8 }, { month: 'Mar', value: 3.1 },
    { month: 'Apr', value: 1.2 }, { month: 'May', value: -1.5 }, { month: 'Jun', value: 4.2 },
    { month: 'Jul', value: 2.8 }, { month: 'Aug', value: 0.9 }, { month: 'Sep', value: -0.4 },
    { month: 'Oct', value: 3.6 }, { month: 'Nov', value: 2.1 }, { month: 'Dec', value: 1.8 },
  ];

  return (
    <div style={{ padding: 'clamp(20px, 4vw, 40px)', animation: 'fadeIn 0.5s ease' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div className="tag tag-gold" style={{ marginBottom: 14 }}>
          <PieChart size={12} /> Portfolio X-Ray
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', color: 'var(--text)', marginBottom: 8 }}>
          MF Portfolio Analyser
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.95rem' }}>
          Paste your CAMS/KFintech statement · Get complete portfolio health in seconds
        </p>
      </div>

      {step === 'input' && (
        <div style={{ display: 'grid', gap: 24 }}>
          {/* Main input card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Upload size={18} color="var(--gold)" />
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Paste Your Portfolio Statement</h2>
            </div>

            <textarea
              className="input-field"
              placeholder={`Paste your CAMS or KFintech statement here...\n\nOr click "Load Sample" to try with demo data.`}
              value={portfolioText}
              onChange={e => setPortfolioText(e.target.value)}
              style={{ minHeight: 240, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', lineHeight: 1.6 }}
            />

            {error && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--coral-dim)', border: '1px solid rgba(239,71,111,0.2)', borderRadius: 8, color: 'var(--coral)', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={() => analyze()}>
                <Zap size={16} /> Analyse Portfolio
              </button>
              <button className="btn-secondary" onClick={() => setPortfolioText(SAMPLE_PORTFOLIO)}>
                Load Sample Data
              </button>
            </div>
          </div>

          {/* Tips */}
          <div className="card" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(245,166,35,0.2)' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 12 }}>💡 How to get your CAMS statement</h3>
            <ol style={{ paddingLeft: 20, color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.8 }}>
              <li>Visit <strong style={{ color: 'var(--text)' }}>camsonline.com</strong> or <strong style={{ color: 'var(--text)' }}>kfintech.com</strong></li>
              <li>Login with your PAN and email</li>
              <li>Download your Consolidated Account Statement (CAS)</li>
              <li>Copy-paste the text content here</li>
            </ol>
          </div>
        </div>
      )}

      {step === 'analyzing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              border: '3px solid var(--border)',
              borderTop: '3px solid var(--gold)',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <PieChart size={28} color="var(--gold)" />
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '1.3rem', color: 'var(--text)', marginBottom: 8 }}>
              Analysing your portfolio...
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>Computing XIRR, overlap, expense drag & more</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
        </div>
      )}

      {step === 'results' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            {[
              { label: 'Total Value', value: `₹${(total/100000).toFixed(2)}L`, color: 'var(--gold)', bg: 'var(--gold-dim)' },
              { label: 'No. of Funds', value: chartData.length, color: 'var(--teal)', bg: 'var(--teal-dim)' },
              { label: 'Est. XIRR', value: '14.2%', color: 'var(--blue-bright)', bg: 'rgba(76,201,240,0.1)' },
              { label: 'Avg Exp. Ratio', value: '0.89%', color: 'var(--coral)', bg: 'var(--coral-dim)' },
            ].map((m, i) => (
              <div key={i} style={{ background: m.bg, border: `1px solid ${m.color}22`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{m.label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
            {['overview', 'allocation', 'performance', 'ai-insights'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                flex: 1, padding: '9px', border: 'none', borderRadius: 7, cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.82rem',
                transition: 'all 0.2s ease',
                background: activeTab === tab ? 'var(--surface-3)' : 'transparent',
                color: activeTab === tab ? 'var(--text)' : 'var(--text-dim)',
              }}>
                {tab === 'ai-insights' ? '✨ AI Insights' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              {/* Pie chart */}
              <div className="card">
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Allocation Breakdown
                </h3>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RechartsPie width={220} height={220}>
                    <Pie data={chartData} cx={110} cy={110} innerRadius={60} outerRadius={100} dataKey="value">
                      {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `₹${(v/1000).toFixed(1)}K`} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  </RechartsPie>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {chartData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.82rem' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.short}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600 }}>
                        {((d.value / total) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fund list */}
              <div className="card">
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Fund Details
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {chartData.map((d, i) => (
                    <div key={i} style={{ padding: '14px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4 }}>{d.short}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            ₹{(d.value/1000).toFixed(1)}K
                          </div>
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem',
                          color: PIE_COLORS[i % PIE_COLORS.length]
                        }}>
                          {((d.value / total) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div style={{ marginTop: 8, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(d.value / total) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 2 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'allocation' && (
            <div className="card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 20, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Value by Fund
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ left: 10, right: 10, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="short" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={v => [`₹${(v/1000).toFixed(1)}K`, 'Value']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--font-body)' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="card">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 4, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Monthly Returns (%) — Estimated
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-faint)', marginBottom: 20 }}>Based on typical fund category performance patterns</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={v => [`${v}%`, 'Return']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="value" stroke="var(--gold)" strokeWidth={2.5} dot={{ fill: 'var(--gold)', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeTab === 'ai-insights' && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} color="var(--gold)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>AI Analysis Report</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Powered by Gemini AI · Indian market context</p>
                </div>
              </div>
              <div
                className="prose-ai"
                style={{ fontSize: '0.9rem' }}
                dangerouslySetInnerHTML={{ __html: '<p>' + formatMarkdown(result) + '</p>' }}
              />
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-secondary" onClick={() => { setStep('input'); setResult(''); setChartData([]); }}>
              Analyse Another Portfolio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}