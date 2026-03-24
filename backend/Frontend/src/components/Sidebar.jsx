import React, { useState } from 'react';
import { TrendingUp, PieChart, Heart, LogOut, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { id: 'dashboard', icon: <TrendingUp size={19} />, label: 'Dashboard', tag: null },
  { id: 'portfolio', icon: <PieChart size={19} />, label: 'Portfolio X-Ray', tag: 'AI' },
  { id: 'couples', icon: <Heart size={19} />, label: "Couple's Planner", tag: 'AI' },
];

export default function Sidebar({ activePage, setActivePage }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding: '28px 24px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--gold), #e8960f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <TrendingUp size={19} color="var(--ink)" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text)', lineHeight: 1.2 }}>
              Money Mentor
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
              Powered by ET
            </div>
          </div>
        </div>
      </div>

      {/* User */}
      <div style={{ padding: '20px 16px 16px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px', borderRadius: 12, background: 'var(--surface-2)'
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--gold), var(--teal))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '0.9rem', color: 'var(--ink)', flexShrink: 0
          }}>
            {user?.avatar}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ padding: '8px 12px', flex: 1 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '4px 12px 12px' }}>
          Features
        </div>
        {navItems.map(item => (
          <button key={item.id} onClick={() => { setActivePage(item.id); setMobileOpen(false); }} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            marginBottom: 3, transition: 'all 0.2s ease', textAlign: 'left',
            background: activePage === item.id
              ? 'linear-gradient(135deg, rgba(245,166,35,0.12), rgba(245,166,35,0.06))'
              : 'transparent',
            color: activePage === item.id ? 'var(--gold)' : 'var(--text-dim)',
            borderLeft: activePage === item.id ? '2px solid var(--gold)' : '2px solid transparent',
          }}>
            <span style={{ flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontWeight: 600, fontSize: '0.88rem', flex: 1 }}>{item.label}</span>
            {item.tag && (
              <span style={{
                padding: '2px 8px', borderRadius: 6,
                background: activePage === item.id ? 'var(--gold-dim)' : 'var(--surface-3)',
                color: activePage === item.id ? 'var(--gold)' : 'var(--text-faint)',
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em'
              }}>{item.tag}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '16px 16px 24px', borderTop: '1px solid var(--border)' }}>
        <button onClick={logout} className="btn-ghost" style={{
          width: '100%', justifyContent: 'flex-start', color: 'var(--coral)', fontSize: '0.85rem'
        }}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, height: '100vh', position: 'sticky', top: 0,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }} className="desktop-sidebar">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }} className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--gold), #e8960f)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <TrendingUp size={16} color="var(--ink)" strokeWidth={2.5} />
          </div>
          <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Money Mentor</span>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: 4
        }}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99, display: 'flex'
        }}>
          <div onClick={() => setMobileOpen(false)} style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)'
          }} />
          <aside style={{
            width: 260, height: '100%', background: 'var(--surface)',
            borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
            position: 'relative', zIndex: 1, animation: 'slideIn 0.3s ease'
          }}>
            <NavContent />
          </aside>
        </div>
      )}
    </>
  );
}