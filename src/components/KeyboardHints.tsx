import { useState } from 'react';

const DISMISS_KEY = 'rampify_keyboard_hints_hidden';

const SHORTCUTS = [
  { key: 'Space', description: 'Play / pause' },
  { key: '← →', description: 'Seek 1 second' },
  { key: 'Shift + ←→', description: 'Seek 5 seconds' },
  { key: 'S', description: 'Split at playhead' },
  { key: 'Ctrl Z', description: 'Undo' },
  { key: 'Ctrl E', description: 'Export' },
];

export function KeyboardHints() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        width: 210,
        borderRadius: 14,
        border: '1px solid #e5dfd0',
        backgroundColor: 'rgba(255, 250, 240, 0.95)',
        padding: '12px 14px',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 8px 24px rgba(10,10,10,0.08), 0 24px 60px rgba(10,10,10,0.06)',
        animation: 'fadeIn 0.3s ease both',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--color-text-subtle)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Shortcuts
        </span>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, '1');
            } catch { /* ignore */ }
            setDismissed(true);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-subtle)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.12s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-subtle)')}
          aria-label="Dismiss keyboard shortcuts"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 10px', alignItems: 'center' }}>
        {SHORTCUTS.map(({ key, description }) => (
          <KeyLabel key={key} label={key} description={description} />
        ))}
      </div>
    </div>
  );
}

function KeyLabel({ label, description }: { label: string; description: string }) {
  return (
    <>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 500,
          color: '#0a0a0a',
          background: 'rgba(10,10,10,0.05)',
          border: '1px solid rgba(10,10,10,0.1)',
          borderRadius: 5,
          padding: '2px 6px',
          whiteSpace: 'nowrap',
          display: 'inline-block',
          lineHeight: '1.5',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.3 }}>{description}</span>
    </>
  );
}
