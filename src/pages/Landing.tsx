import { Link } from 'react-router-dom';

export function Landing() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        color: '#EEEEF8',
        background: '#07080F',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Ambient background orbs */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            left: '-10%',
            width: 900,
            height: 900,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139, 111, 255, 0.12) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '40%',
            right: '-15%',
            width: 700,
            height: 700,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(28, 228, 184, 0.07) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-10%',
            left: '20%',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139, 111, 255, 0.06) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Nav */}
      <nav
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 40px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark />
          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#EEEEF8',
            }}
          >
            rampify
          </span>
        </div>

        <Link
          to="/editor"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            borderRadius: 999,
            border: '1px solid rgba(139, 111, 255, 0.35)',
            background: 'rgba(139, 111, 255, 0.1)',
            color: '#c4b8ff',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(139, 111, 255, 0.6)';
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(139, 111, 255, 0.18)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(139, 111, 255, 0.35)';
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(139, 111, 255, 0.1)';
          }}
        >
          Open editor
        </Link>
      </nav>

      {/* Hero */}
      <section
        className="animate-fade-in"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(1200px, calc(100% - 48px))',
          margin: '0 auto',
          padding: '80px 0 64px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 64,
          alignItems: 'center',
        }}
      >
        {/* Left — copy */}
        <div>
          <div
            className="animate-fade-up"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 999,
              border: '1px solid rgba(28, 228, 184, 0.2)',
              background: 'rgba(28, 228, 184, 0.07)',
              color: '#1CE4B8',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#1CE4B8',
                animation: 'pulse-glow 2s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            Browser-native speed ramping
          </div>

          <h1
            className="animate-fade-up-delay-1"
            style={{
              margin: 0,
              fontSize: 'clamp(42px, 6vw, 72px)',
              lineHeight: 1.0,
              letterSpacing: '-0.04em',
              fontWeight: 800,
              color: '#EEEEF8',
            }}
          >
            Speed ramp
            <br />
            your videos.
            <br />
            <span
              style={{
                background: 'linear-gradient(135deg, #8B6FFF, #1CE4B8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              No installs.
            </span>
          </h1>

          <p
            className="animate-fade-up-delay-2"
            style={{
              margin: '24px 0 0',
              maxWidth: 480,
              fontSize: 17,
              lineHeight: 1.65,
              color: '#7878A0',
              fontWeight: 400,
            }}
          >
            Drop a clip, draw your speed curve, and export without leaving the browser. Precise timing control without the timeline clutter.
          </p>

          <div
            className="animate-fade-up-delay-3"
            style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap' }}
          >
            <Link
              to="/editor"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 24px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #8B6FFF 0%, #6A4EDF 100%)',
                color: '#fff',
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: 700,
                boxShadow: '0 0 32px rgba(139, 111, 255, 0.3), 0 4px 12px rgba(0,0,0,0.3)',
                transition: 'box-shadow 0.2s, transform 0.1s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 48px rgba(139, 111, 255, 0.4), 0 8px 20px rgba(0,0,0,0.35)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 0 32px rgba(139, 111, 255, 0.3), 0 4px 12px rgba(0,0,0,0.3)';
              }}
            >
              <ArrowRightIcon />
              Start editing free
            </Link>

            <a
              href="#features"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '14px 24px',
                borderRadius: 999,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#AAABB8',
                textDecoration: 'none',
                fontSize: 15,
                fontWeight: 600,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.18)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#EEEEF8';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLAnchorElement).style.color = '#AAABB8';
              }}
            >
              See how it works
            </a>
          </div>

          {/* Trust line */}
          <div
            className="animate-fade-up-delay-3"
            style={{
              marginTop: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'Runs in browser', icon: '⚡' },
              { label: 'No watermarks', icon: '✓' },
              { label: 'Local processing', icon: '🔒' },
            ].map(({ label, icon }) => (
              <span
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  color: '#5A5A7A',
                  fontWeight: 500,
                }}
              >
                <span style={{ fontSize: 11 }}>{icon}</span>
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Right — animated curve visualizer */}
        <div
          style={{
            borderRadius: 24,
            border: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'linear-gradient(180deg, rgba(14, 15, 30, 0.95) 0%, rgba(7, 8, 15, 0.95) 100%)',
            padding: 24,
            boxShadow: '0 40px 120px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Window chrome */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {['#FF5F57', '#FFBD2E', '#28C840'].map((c) => (
                <div
                  key={c}
                  style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }}
                />
              ))}
            </div>
            <span
              style={{
                fontSize: 11,
                color: '#44446A',
                fontFamily: 'var(--font-mono)',
                marginLeft: 8,
              }}
            >
              speed-curve.rampify
            </span>
          </div>

          <SpeedCurveVisualizer />

          {/* Bottom bar */}
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(139, 111, 255, 0.06)',
              border: '1px solid rgba(139, 111, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: 11, color: '#7878A0', fontFamily: 'var(--font-mono)' }}>
              clip_001.mp4
            </span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {[['0.5x', '#1CE4B8'], ['1.0x', '#8B6FFF'], ['2.0x', '#F59E0B']].map(([s, c]) => (
                <span
                  key={s}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: c as string,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="features"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(1200px, calc(100% - 48px))',
          margin: '0 auto',
          paddingBottom: 100,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          {/* Big feature */}
          <article
            style={{
              borderRadius: 24,
              border: '1px solid rgba(139, 111, 255, 0.15)',
              background: 'linear-gradient(135deg, rgba(139, 111, 255, 0.08) 0%, rgba(7, 8, 15, 0.6) 100%)',
              padding: '36px 36px 40px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -80,
                right: -80,
                width: 300,
                height: 300,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139, 111, 255, 0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'rgba(139, 111, 255, 0.15)',
                border: '1px solid rgba(139, 111, 255, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <CurveIcon />
            </div>
            <h3
              style={{
                margin: '0 0 12px',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#EEEEF8',
              }}
            >
              Curve-first editing
            </h3>
            <p style={{ margin: 0, color: '#7878A0', lineHeight: 1.65, fontSize: 14, maxWidth: 360 }}>
              Edit speed as a shape, not a stack of rate fields. Draw bezier or linear curves and see playback react in real time.
            </p>
          </article>

          {/* Two stacked features */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 16 }}>
            <article
              style={{
                borderRadius: 24,
                border: '1px solid rgba(28, 228, 184, 0.12)',
                background: 'linear-gradient(135deg, rgba(28, 228, 184, 0.06) 0%, rgba(7, 8, 15, 0.6) 100%)',
                padding: '28px 30px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(28, 228, 184, 0.12)',
                  border: '1px solid rgba(28, 228, 184, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <WaveformIcon />
              </div>
              <h3
                style={{
                  margin: '0 0 8px',
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#EEEEF8',
                }}
              >
                Timeline feedback
              </h3>
              <p style={{ margin: 0, color: '#7878A0', lineHeight: 1.55, fontSize: 13 }}>
                Segments, playhead, and waveform lane in one compact view.
              </p>
            </article>

            <article
              style={{
                borderRadius: 24,
                border: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '28px 30px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <LockIcon />
              </div>
              <h3
                style={{
                  margin: '0 0 8px',
                  fontSize: 17,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#EEEEF8',
                }}
              >
                Local-first export
              </h3>
              <p style={{ margin: 0, color: '#7878A0', lineHeight: 1.55, fontSize: 13 }}>
                ffmpeg.wasm runs entirely in your browser. Your footage never leaves your machine.
              </p>
            </article>
          </div>
        </div>

        {/* CTA */}
        <div
          style={{
            marginTop: 64,
            textAlign: 'center',
          }}
        >
          <Link
            to="/editor"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '16px 32px',
              borderRadius: 999,
              background: 'linear-gradient(135deg, #8B6FFF 0%, #6A4EDF 100%)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 16,
              fontWeight: 700,
              boxShadow: '0 0 40px rgba(139, 111, 255, 0.28), 0 4px 16px rgba(0,0,0,0.3)',
            }}
          >
            Open the editor
            <ArrowRightIcon />
          </Link>
          <p style={{ marginTop: 14, fontSize: 13, color: '#44446A' }}>
            Free to use. No account needed.
          </p>
        </div>
      </section>
    </main>
  );
}

function SpeedCurveVisualizer() {
  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: 'rgba(4, 5, 11, 0.8)' }}>
      <svg
        viewBox="0 0 560 220"
        style={{ width: '100%', display: 'block' }}
        aria-label="Speed curve visualization"
      >
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={`h${i}`}
            x1="48"
            y1={20 + i * 45}
            x2="540"
            y2={20 + i * 45}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line
            key={`v${i}`}
            x1={48 + i * 98}
            y1="20"
            x2={48 + i * 98}
            y2="200"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        ))}

        {/* Y-axis labels */}
        {[['2x', 20], ['1.5x', 65], ['1x', 110], ['0.5x', 155], ['0x', 200]].map(([label, y]) => (
          <text
            key={label as string}
            x="40"
            y={(y as number) + 4}
            textAnchor="end"
            fontSize="9"
            fill="rgba(120,120,160,0.6)"
            fontFamily="JetBrains Mono, monospace"
          >
            {label}
          </text>
        ))}

        {/* Speed curve - a dramatic ramp with ease in/out */}
        <path
          d="M48,110 C120,110 140,200 180,200 C220,200 240,110 280,20 C320,-20 360,20 380,65 C400,110 430,110 540,110"
          fill="none"
          stroke="#1CE4B8"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            strokeDasharray: 800,
            strokeDashoffset: 0,
            animation: 'draw-path 2.5s 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
        />

        {/* Glow effect */}
        <path
          d="M48,110 C120,110 140,200 180,200 C220,200 240,110 280,20 C320,-20 360,20 380,65 C400,110 430,110 540,110"
          fill="none"
          stroke="#1CE4B8"
          strokeWidth="8"
          strokeLinecap="round"
          opacity="0.12"
        />

        {/* Control points */}
        {[[180, 200], [280, 20], [380, 65]].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="5" fill="#0E0F1E" stroke="#8B6FFF" strokeWidth="1.5" />
            <circle cx={cx} cy={cy} r="2.5" fill="#8B6FFF" />
          </g>
        ))}

        {/* Animated playhead */}
        <line
          x1="48"
          y1="20"
          x2="48"
          y2="200"
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          style={{
            animation: 'playhead-move 3s 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate',
          }}
        />

        {/* Speed at playhead indicator */}
        <circle
          cx="48"
          cy="110"
          r="4"
          fill="#EEEEF8"
          style={{
            animation: 'playhead-move 3s 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate',
          }}
        />
      </svg>
    </div>
  );
}

function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect width="22" height="22" rx="6" fill="rgba(139, 111, 255, 0.18)" />
      <polyline
        points="4,15 8,10 13,5 18,9"
        stroke="#8B6FFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="18" cy="9" r="2" fill="#1CE4B8" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CurveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B6FFF" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 12 C6 12 8 20 12 20 C16 20 18 4 21 4" />
    </svg>
  );
}

function WaveformIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1CE4B8" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <polyline points="2 12 6 6 10 18 14 6 18 16 22 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(200,200,220,0.7)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
