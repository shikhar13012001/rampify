import { useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function SidebarDrawer({ open, onClose }: SidebarDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 240,
          backgroundColor: 'rgba(10,10,10,0.35)',
          animation: 'fadeIn 0.15s ease both',
        }}
      />
      {/* Panel — slides in from left */}
      <aside
        role="dialog"
        aria-label="Editor panels"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'min(300px, 86vw)',
          zIndex: 250,
          backgroundColor: 'var(--color-panel)',
          borderRight: '1px solid var(--color-border-subtle)',
          overflowY: 'auto',
          padding: 16,
          boxShadow: '4px 0 24px rgba(10,10,10,0.1), 16px 0 60px rgba(10,10,10,0.08)',
          animation: 'drawerSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        {/* Close handle */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panels"
          style={{
            position: 'sticky',
            top: 0,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'rgba(10,10,10,0.04)',
            color: '#4a4a4a',
            cursor: 'pointer',
            zIndex: 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <Sidebar />
      </aside>
    </>
  );
}