import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, Shield, Zap, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill all fields.'); return; }
    if (mode === 'signup' && !name) { setError('Please enter your name.'); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    login(email, mode === 'signup' ? name : email.split('@')[0]);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', position: 'relative', overflow: 'hidden' }}>
      {/* Background */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(245,166,35,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(6,214,160,0.06) 0%, transparent 50%)',
        zIndex: 0
      }} />

      {/* Left panel - branding */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px', position: 'relative', zIndex: 1
      }} className="hide-mobile">
        <div style={{ maxWidth: 480 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--gold), #e8960f)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <TrendingUp size={22} color="var(--ink)" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text)', letterSpacing: '-0.02em' }}>
                AI Money Mentor
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                by Economic Times
              </div>
            </div>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)', fontStyle: 'italic',
            fontSize: 'clamp(2.5rem, 4vw, 3.5rem)', lineHeight: 1.15,
            color: 'var(--text)', marginBottom: 24
          }}>
            Your wealth,<br />
            <span className="gold-text">intelligently</span><br />
            managed.
          </h1>

          <p style={{ color: 'var(--text-dim)', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: 48 }}>
            AI-powered financial planning for every Indian. From SIP optimization to couples' tax planning — all in one place.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: <Shield size={18} />, text: 'Bank-grade security for your financial data' },
              { icon: <Zap size={18} />, text: 'Powered by Gemini AI for real-time analysis' },
              { icon: <TrendingUp size={18} />, text: 'Personalized for Indian tax laws & markets' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'var(--gold-dim)', color: 'var(--gold)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {item.icon}
                </div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div style={{
        width: '100%', maxWidth: 480, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '40px 40px', position: 'relative', zIndex: 1,
        borderLeft: '1px solid var(--border)'
      }}>
        <div style={{ width: '100%', maxWidth: 400, animation: 'fadeIn 0.5s ease' }}>
          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, var(--gold), #e8960f)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <TrendingUp size={18} color="var(--ink)" strokeWidth={2.5} />
            </div>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>AI Money Mentor</span>
          </div>

          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 32, fontSize: '0.9rem' }}>
            {mode === 'login' ? 'Sign in to access your financial dashboard' : 'Start your journey to financial freedom'}
          </p>

          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: 'var(--surface-2)', borderRadius: 10,
            padding: 4, marginBottom: 28, border: '1px solid var(--border)'
          }}>
            {['login', 'signup'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '10px', border: 'none', borderRadius: 7, cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                background: mode === m ? 'var(--surface-3)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
              }}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {mode === 'signup' && (
              <div>
                <label className="label">Full Name</label>
                <input
                  className="input-field"
                  placeholder="Arjun Sharma"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <input
                className="input-field"
                type="email"
                placeholder="arjun@gmail.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input-field"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight: 48 }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)'
                }}>
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', background: 'var(--coral-dim)',
                border: '1px solid rgba(239,71,111,0.2)', borderRadius: 8,
                color: 'var(--coral)', fontSize: '0.85rem'
              }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading} style={{
              width: '100%', justifyContent: 'center', marginTop: 4,
              opacity: loading ? 0.7 : 1
            }}>
              {loading ? (
                <><div className="spinner" style={{ width: 18, height: 18 }} /> Processing...</>
              ) : (
                <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={17} /></>
              )}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center' }}>
            <button onClick={() => {
              login('demo@et.com', 'Demo User');
            }} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', color: 'var(--gold)' }}>
              Try with Demo Account →
            </button>
          </div>

          <p style={{ textAlign: 'center', marginTop: 28, fontSize: '0.75rem', color: 'var(--text-faint)', lineHeight: 1.6 }}>
            By continuing, you agree to our Terms of Service and Privacy Policy. Your financial data is encrypted and never shared.
          </p>
        </div>
      </div>
    </div>
  );
}