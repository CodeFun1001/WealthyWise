import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageCircle, Sparkles } from 'lucide-react';
import { callGeminiChat, CHATBOT_SYSTEM } from '../utils/gemini';

const SUGGESTIONS = [
  "What is a FIRE number?",
  "Old vs New tax regime — which is better?",
  "How much emergency fund do I need?",
  "What is portfolio overlap in mutual funds?",
  "How should couples split SIP investments?",
  "Explain XIRR vs CAGR",
];

function renderMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•]\s(.+)/gm,  '<li>$1</li>')
    .replace(/\n/g, '<br/>');
}

function BotAvatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: 9, flexShrink: 0,
      background: 'linear-gradient(135deg, var(--gold), #e8960f)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.95rem',
    }}>
      🤖
    </div>
  );
}

export default function Chatbot() {
  const [open,    setOpen]    = useState(false);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [msgs,    setMsgs]    = useState([
    {
      role: 'ai',
      text: "Namaste! 👋 I'm your AI Money Mentor. Ask me anything about mutual funds, tax saving, FIRE planning, portfolio health — or anything else money-related. How can I help you today?",
    },
  ]);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading, open]);

  const send = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text }]);
    setLoading(true);

    try {
      const history = msgs
        .slice(-10)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
      history.push({ role: 'user', parts: [{ text }] });

      const reply = await callGeminiChat(history, CHATBOT_SYSTEM);
      setMsgs(m => [...m, { role: 'ai', text: reply }]);
    } catch (e) {
      setMsgs(m => [...m, { role: 'ai', text: '⚠️ ' + e.message, err: true }]);
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        title="AI Money Mentor Chat"
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, var(--gold), #e8960f)',
          boxShadow: open ? '0 4px 20px rgba(245,166,35,.25)' : '0 4px 24px rgba(245,166,35,.42)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: open ? '1.1rem' : '1.4rem',
          transition: 'all 0.25s ease',
          transform: open ? 'rotate(15deg) scale(0.92)' : 'scale(1)',
        }}
      >
        {open ? <X size={22} color="var(--ink)" strokeWidth={2.5} /> : <MessageCircle size={24} color="var(--ink)" strokeWidth={2.5} />}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 96, right: 28, zIndex: 999,
          width: 'min(390px, calc(100vw - 40px))',
          height: 'min(560px, calc(100vh - 130px))',
          background: 'var(--surface)', border: '1px solid var(--border-bright)',
          borderRadius: 20, display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          animation: 'fadeIn 0.28s ease', overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(135deg, rgba(245,166,35,0.07), rgba(6,214,160,0.04))',
            display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 11,
              background: 'linear-gradient(135deg, var(--gold), #e8960f)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem',
            }}>
              🤖
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>
                AI Money Mentor
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} />
                Online · Powered by Gemini
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="btn-ghost"
              style={{ padding: '4px 8px', color: 'var(--text-dim)' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                display: 'flex', gap: 9, alignItems: 'flex-end',
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              }}>
                {m.role === 'ai' && <BotAvatar />}
                <div style={{
                  maxWidth: '82%', padding: '11px 14px', fontSize: '0.84rem', lineHeight: 1.72,
                  background: m.role === 'user'
                    ? 'linear-gradient(135deg, var(--gold), #e8960f)'
                    : m.err
                    ? 'var(--coral-dim)'
                    : 'var(--surface-2)',
                  color: m.role === 'user' ? 'var(--ink)' : m.err ? 'var(--coral)' : 'var(--text)',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  border: m.role === 'ai' ? '1px solid var(--border)' : 'none',
                  fontWeight: m.role === 'user' ? 600 : 400,
                }}>
                  {m.role === 'ai'
                    ? <div dangerouslySetInnerHTML={{ __html: renderMd(m.text) }} />
                    : m.text
                  }
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
                <BotAvatar />
                <div style={{
                  padding: '12px 16px', background: 'var(--surface-2)',
                  border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {['var(--gold)', 'var(--gold-light)', 'var(--gold)'].map((c, i) => (
                    <div key={i} className="loading-dot" style={{ background: c, animationDelay: `${i * 0.18}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions — only show while conversation is still fresh */}
          {msgs.length <= 2 && (
            <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    padding: '5px 12px', background: 'var(--surface-3)',
                    border: '1px solid var(--border)', borderRadius: 20,
                    color: 'var(--text-dim)', fontSize: '0.72rem', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '10px 12px 14px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 9, flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              className="input-field"
              placeholder="Ask anything about money…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              style={{ flex: 1, padding: '10px 14px', fontSize: '0.86rem' }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: input.trim() && !loading
                  ? 'linear-gradient(135deg, var(--gold), #e8960f)'
                  : 'var(--surface-3)',
                border: 'none',
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              <Send
                size={17}
                color={input.trim() && !loading ? 'var(--ink)' : 'var(--text-faint)'}
                strokeWidth={2.2}
              />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
