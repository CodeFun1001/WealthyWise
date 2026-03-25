import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import PortfolioPage from './pages/PortfolioPage';
import CouplesPage from './pages/CouplesPage';
import FirePage from './pages/Fire';
import TaxWizardPage from './pages/TaxWizardPage';

import Sidebar from './components/Sidebar';
import Chatbot from './components/Chatbot';

function AppContent() {
  const { user } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');

  if (!user) return <LoginPage />;

  const pages = {
    dashboard: <Dashboard setActivePage={setActivePage} />,
    portfolio: <PortfolioPage />,
    couples: <CouplesPage />,
    fire: <FirePage />,
    tax : <TaxWizardPage />,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar activePage={activePage} setActivePage={setActivePage} />

      <main style={{ flex: 1, overflow: 'auto', background: 'var(--ink)', position: 'relative' }}>
        {/* Ambient glow */}
        <div style={{
          position: 'fixed', top: -200, right: -200, width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(245,166,35,0.04) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {pages[activePage] || pages.dashboard}
        </div>
      </main>

      {/* Floating AI chatbot — always available */}
      <Chatbot />

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          main { padding-top: 68px !important; }
        }
        @media (min-width: 769px) {
          .mobile-header { display: none !important; }
        }
        .tag-coral { background: var(--coral-dim); color: var(--coral); }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
