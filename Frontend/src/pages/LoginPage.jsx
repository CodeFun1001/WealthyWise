import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { TrendingUp, Shield, Zap, ArrowRight, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import { FcGoogle } from "react-icons/fc";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../firebase';

// ─── Password validation rules ────────────────────────────────────────────────
const RULES = [
  { id: 'length',  label: 'At least 8 characters',           test: p => p.length >= 8 },
  { id: 'upper',   label: 'One uppercase letter (A-Z)',       test: p => /[A-Z]/.test(p) },
  { id: 'lower',   label: 'One lowercase letter (a-z)',       test: p => /[a-z]/.test(p) },
  { id: 'number',  label: 'One number (0-9)',                 test: p => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: p => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
];

function getStrength(password) {
  if (!password) return { score: 0, label: '', color: 'var(--border)' };
  const passed = RULES.filter(r => r.test(password)).length;
  if (passed <= 1) return { score: 1, label: 'Weak',        color: 'var(--coral)' };
  if (passed <= 2) return { score: 2, label: 'Fair',        color: '#f59e0b' };
  if (passed <= 3) return { score: 3, label: 'Good',        color: 'var(--gold)' };
  if (passed <= 4) return { score: 4, label: 'Strong',      color: 'var(--teal)' };
  return               { score: 5, label: 'Very Strong', color: '#10b981' };
}

function PasswordMeter({ password }) {
  const strength = getStrength(password);
  const results = RULES.map(r => ({ ...r, passed: r.test(password) }));
  if (!password) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= strength.score ? strength.color : 'var(--surface-3)', transition: 'background 0.3s ease' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>Password strength</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: strength.color }}>{strength.label}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {results.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.76rem', color: r.passed ? strength.color : 'var(--text-faint)', transition: 'color 0.2s' }}>
            {r.passed ? <CheckCircle size={13} color={strength.color} /> : <XCircle size={13} color="var(--surface-3)" />}
            {r.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Responsive styles injected once ─────────────────────────────────────────
const RESPONSIVE_CSS = `
  .login-root {
    min-height: 100vh;
    display: flex;
    position: relative;
    overflow: hidden;
  }
  .login-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px;
    position: relative;
    z-index: 1;
  }
  .login-right {
    width: 100%;
    max-width: 560px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    position: relative;
    z-index: 1;
    border-left: 1px solid var(--border);
  }
  .login-mobile-logo { display: none; }
  .login-features { display: flex; flex-direction: column; gap: 16px; }

  @media (max-width: 768px) {
    .login-root { flex-direction: column; }

    .login-left { display: none; }

    .login-right {
      max-width: 100%;
      padding: 32px 20px 48px;
      border-left: none;
      align-items: flex-start;
      min-height: 100vh;
    }

    .login-mobile-logo { display: flex; }

    .login-inner {
      width: 100% !important;
      max-width: 100% !important;
    }

    .login-heading {
      font-size: 1.35rem !important;
    }
  }

  @media (max-width: 400px) {
    .login-right { padding: 24px 16px 40px; }
  }
`;

// ─── Main component ───────────────────────────────────────────────────────────
export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => getStrength(password), [password]);
  const passwordReady = mode === 'login' || RULES.every(r => r.test(password));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill all fields.'); return; }
    if (mode === 'signup') {
      if (!name) { setError('Please enter your name.'); return; }
      if (!RULES.every(r => r.test(password))) {
        setError('Password must satisfy all security requirements.');
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
      }
    } catch (err) {
      const msgs = {
        'auth/user-not-found':     'No account found with this email.',
        'auth/wrong-password':     'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/weak-password':      'Password must be at least 6 characters.',
        'auth/invalid-email':      'Please enter a valid email address.',
        'auth/too-many-requests':  'Too many attempts. Please wait a moment.',
      };
      setError(msgs[err.code] || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{RESPONSIVE_CSS}</style>

      <div className="login-root">
        {/* Background glow */}
        <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at 20% 50%, rgba(245,166,35,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(6,214,160,0.06) 0%, transparent 50%)', zIndex: 0 }} />

        {/* ── Left panel (desktop only) ── */}
        <div className="login-left">
          <div style={{ maxWidth: 540 }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, var(--gold), #e8960f)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={22} color="var(--ink)" strokeWidth={2.5} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text)' }}>Wealthy Wise</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI Money Mentor</div>
              </div>
            </div>

            <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 'clamp(2.5rem, 4vw, 3.5rem)', lineHeight: 1.15, color: 'var(--text)', marginBottom: 24 }}>
              Your wealth,<br />
              <span className="gold-text">intelligently</span><br />
              managed.
            </h1>

            <p style={{ color: 'var(--text-dim)', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: 48 }}>
              AI-powered financial planning for every Indian. Tax optimization, FIRE planning, portfolio health — all in one place.
            </p>

            <div className="login-features">
              {[
                { icon: <Shield size={18} />, text: 'Bank-grade security for your financial data' },
                { icon: <Zap size={18} />,    text: 'Powered by Gemini AI for real-time analysis' },
                { icon: <TrendingUp size={18} />, text: 'Personalized for Indian tax laws & markets' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--gold-dim)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right panel (form) ── */}
        <div className="login-right">
          <div className="login-inner" style={{ width: '100%', maxWidth: 440, animation: 'fadeIn 0.5s ease' }}>

            {/* Mobile logo — hidden on desktop via CSS */}
            <div className="login-mobile-logo" style={{ alignItems: 'center', gap: 10, marginBottom: 32 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, var(--gold), #e8960f)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={18} color="var(--ink)" strokeWidth={2.5} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>Wealthy Wise</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI Money Mentor</div>
              </div>
            </div>

            <h2 className="login-heading" style={{ fontSize: '1.55rem', fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: 24, fontSize: '0.88rem' }}>
              {mode === 'login' ? 'Sign in to your financial dashboard' : 'Start your journey to financial freedom'}
            </p>

            {/* Mode switcher */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 4, marginBottom: 22, border: '1px solid var(--border)' }}>
              {['login', 'signup'].map(m => (
                <button key={m} onClick={() => { setMode(m); setError(''); setPassword(''); }}
                  style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.88rem', transition: 'all 0.2s', background: mode === m ? 'var(--surface-3)' : 'transparent', color: mode === m ? 'var(--text)' : 'var(--text-dim)', boxShadow: mode === m ? '0 2px 8px rgba(0,0,0,0.3)' : 'none' }}>
                  {m === 'login' ? 'Sign In' : 'Sign Up'}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {mode === 'signup' && (
                <div>
                  <label className="label">Full Name</label>
                  <input className="input-field" placeholder="Arjun Sharma" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              )}

              <div>
                <label className="label">Email</label>
                <input className="input-field" type="email" placeholder="arjun@gmail.com" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="label" style={{ margin: 0 }}>Password</label>
                  {mode === 'login' && (
                    <button type="button" style={{ all: 'unset', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--gold)', fontWeight: 600 }}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-field"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    style={{ paddingRight: 44, width: '100%', boxSizing: 'border-box' }}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {mode === 'signup' && <PasswordMeter password={password} />}
              </div>

              {error && (
                <div style={{ padding: '10px 13px', background: 'var(--coral-dim)', border: '1px solid rgba(239,71,111,0.2)', borderRadius: 8, color: 'var(--coral)', fontSize: '0.84rem' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={loading || !passwordReady}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4, opacity: loading || !passwordReady ? 0.6 : 1 }}
              >
                {loading
                  ? <><div className="spinner" style={{ width: 17, height: 17 }} /> Processing…</>
                  : <>{mode === 'login' ? 'Sign In' : 'Create Account'} <ArrowRight size={16} /></>
                }
              </button>
            </form>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: '0.73rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>or continue with</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <button
              onClick={loginWithGoogle}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', transition: 'all 0.2s ease', boxSizing: 'border-box' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <FcGoogle size={19} /> Continue with Google
            </button>

            <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.72rem', color: 'var(--text-faint)', lineHeight: 1.6 }}>
              By continuing, you agree to our Terms of Service & Privacy Policy. Your financial data is encrypted and never shared.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}