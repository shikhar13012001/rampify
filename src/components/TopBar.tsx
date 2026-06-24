import { Link } from 'react-router-dom';
import { useEditorStore } from '@/store/editorStore';
import { UserButton, SignInButton } from '@/lib/auth';
import { Logo } from '@/components/Logo';

interface TopBarProps {
  onExportClick?: () => void;
  onToggleSidebar?: () => void;
}

export function TopBar({ onExportClick, onToggleSidebar }: TopBarProps) {
  const project      = useEditorStore(s => s.project);
  const isExporting  = useEditorStore(s => s.isExporting);
  const isPro        = useEditorStore(s => s.isPro);
  const user         = useEditorStore(s => s.user);
  const isAuthLoading = useEditorStore(s => s.isAuthLoading);
  // Subscribe to the raw counts so the TopBar re-renders whenever
  // recordExport / setExportCounts updates the store. Reading via
  // getState() would not subscribe and would show stale quota.
  const exportsRemaining = useEditorStore(s => s.exportsRemaining);
  const exportDisabled = !project || isExporting;

  // While auth is loading (e.g. /check-subscription in flight), don't show
  // quota text or a Pro badge — we don't know the tier yet.
  const remaining = isPro ? 999 : exportsRemaining;
  const exportLabel = isPro
    ? isExporting ? 'Exporting…' : 'Export'
    : isAuthLoading
      ? (isExporting ? 'Exporting…' : 'Export')
      : isExporting ? 'Exporting…' : `Export (${remaining} left)`;

  return (
    <header
      className="editor-topbar"
      style={{
        height: 'var(--toolbar-height)',
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border-subtle)',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0 18px',
        gap: 16,
        flexShrink: 0,
        boxShadow: 'none',
      }}
    >
      {/* Logo + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {/* Mobile sidebar toggle — hidden on desktop via CSS */}
        {project && (
          <button
            type="button"
            className="editor-hamburger"
            onClick={onToggleSidebar}
            aria-label="Toggle panels"
            style={{
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: '#4a4a4a',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="7" x2="21" y2="7" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="17" x2="21" y2="17" />
            </svg>
          </button>
        )}
        <Link
          to="/"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}
        >
          <Logo size={22} />
          <span className="editor-wordmark" style={{ fontWeight: 600, fontSize: 15, letterSpacing: '-0.035em', color: '#0a0a0a' }}>
            rampify
          </span>
        </Link>
      </div>

      {/* Center — file name (hidden on mobile) */}
      <div className="editor-filename" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', maxWidth: 420 }}>
        {project ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 12px', borderRadius: 9,
              background: 'rgba(10,10,10,0.025)',
              border: '1px solid var(--color-border)',
              boxShadow: 'none',
            }}
          >
            <VideoFileIcon />
            <span
              title={project.file.name}
              style={{
                fontSize: 12, color: 'var(--color-text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', maxWidth: 320,
                fontFamily: 'var(--font-mono)',
                fontWeight: 500,
              }}
            >
              {project.file.name}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-text-subtle)', letterSpacing: '0.01em' }}>
            No file loaded
          </span>
        )}
      </div>

      {/* Right — auth + export */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
        {/* Pro badge — hidden while auth is loading to avoid a flash */}
        {isPro && !isAuthLoading && (
          <span
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#b8a4ed',
              background: 'rgba(184,164,237,0.14)',
              border: '1px solid rgba(184,164,237,0.3)',
              borderRadius: 5, padding: '3px 8px',
              boxShadow: 'none',
            }}
          >
            Pro
          </span>
        )}

        {/* Auth UI */}
        {user
          ? <UserButton user={user} />
          : <SignInButton />
        }

        {/* Export button */}
        <button
          type="button"
          onClick={exportDisabled ? undefined : onExportClick}
          disabled={exportDisabled}
          title={project ? 'Export video (Ctrl+E)' : 'Load a video first'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 18px', borderRadius: 10,
            border: exportDisabled
              ? '1px solid var(--color-border)'
              : '1px solid transparent',
            background: exportDisabled
              ? 'transparent'
              : '#0a0a0a',
            color: exportDisabled ? 'var(--color-text-subtle)' : '#fffaf0',
            fontSize: 13, fontWeight: 600,
            cursor: exportDisabled ? 'not-allowed' : 'pointer',
            opacity: exportDisabled ? 0.5 : 1,
            boxShadow: 'none',
            transition: 'opacity 0.15s, transform 0.15s',
            letterSpacing: '-0.01em',
          }}
          onMouseEnter={(e) => {
            if (exportDisabled) return;
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.88';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
          }}
        >
          {isExporting ? <SpinnerIcon /> : <ExportIcon />}
          {exportLabel}
        </button>
      </div>
    </header>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function VideoFileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(120,120,160,0.6)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 40 40" aria-hidden="true" style={{ animation: 'spin 0.8s linear infinite' }}>
      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,250,240,0.3)" strokeWidth="4" />
      <path d="M20 4 A16 16 0 0 1 36 20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
