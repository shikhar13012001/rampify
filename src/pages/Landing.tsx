import { Link } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { PricingTable } from '@/components/marketing/PricingTable';
import { Seo } from '@/components/Seo';

export function Landing() {
  return (
    <div className="clay-page">
      <Seo
        title="Speed Ramp Videos Online — No Installs, No Uploads | Rampify"
        description="Draw speed curves, AI slow motion, beat sync, and 4K export — all in the browser. Your footage never leaves your machine. Free to start, no installs required."
        path="/"
      />
      <ClayNav />

      {/* ── Hero band ────────────────────────────────────────────────────── */}
      <HeroBand />

      {/* ── Logo cloud ───────────────────────────────────────────────────── */}
      <LogoCloud />

      {/* ── Feature grid (saturated cards) ──────────────────────────────── */}
      <FeatureGrid />

      {/* ── Product mockup (editor preview on cream) ─────────────────────── */}
      <ProductMockupSection />

      {/* ── How it works (3 steps) ───────────────────────────────────────── */}
      <HowItWorks />

      {/* ── Stats band ───────────────────────────────────────────────────── */}
      <StatsBand />

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <PricingSection />

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <TestimonialsSection />

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <FAQSection />

      {/* ── CTA band ─────────────────────────────────────────────────────── */}
      <CTABand />

      <Footer />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Hero Band — 7/5 grid: copy left, visual right
// ════════════════════════════════════════════════════════════════════════════

function HeroBand() {
  return (
    <section
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '80px 24px 96px',
        display: 'grid',
        gridTemplateColumns: '7fr 5fr',
        gap: 64,
        alignItems: 'center',
      }}
    >
      {/* Left — copy */}
      <div>
        <div
          className="clay-reveal"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            border: '1px solid var(--color-clay-line)',
            backgroundColor: 'var(--color-clay-card)',
            marginBottom: 28,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-clay-pink)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-clay-ink)', letterSpacing: '0.02em' }}>
            Browser-native speed ramping
          </span>
        </div>

        <h1
          className="clay-display clay-reveal"
          style={{
            margin: 0,
            fontSize: 'clamp(44px, 6vw, 76px)',
            animationDelay: '0.05s',
          }}
        >
          Speed ramp
          <br />
          your videos.
          <br />
          <span style={{ color: 'var(--color-clay-pink)' }}>No installs.</span>
        </h1>

        <p
          className="clay-body clay-reveal"
          style={{
            margin: '28px 0 0',
            maxWidth: 480,
            fontSize: 17,
            animationDelay: '0.1s',
          }}
        >
          Drop a clip, draw your speed curve, and export without leaving the browser. Precise timing control without the timeline clutter — powered by ffmpeg.wasm and RIFE AI interpolation.
        </p>

        <div
          className="clay-reveal"
          style={{ display: 'flex', gap: 12, marginTop: 36, flexWrap: 'wrap', animationDelay: '0.15s' }}
        >
          <Link
            to="/editor"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 28px',
              borderRadius: 999,
              backgroundColor: 'var(--color-clay-ink)',
              color: 'var(--color-clay-canvas)',
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 600,
              transition: 'transform 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
          >
            Start editing free
            <ArrowRight />
          </Link>

          <a
            href="#features"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '14px 28px',
              borderRadius: 999,
              border: '1px solid var(--color-clay-line)',
              color: 'var(--color-clay-ink)',
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--color-clay-card)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent'; }}
          >
            See how it works
          </a>
        </div>

        {/* Trust line */}
        <div
          className="clay-reveal"
          style={{
            marginTop: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
            animationDelay: '0.2s',
          }}
        >
          {['Runs in browser', 'No watermarks', 'Local processing'].map((label) => (
            <span
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--color-clay-ink-muted)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8.5l3.5 3.5L13 5" stroke="var(--color-clay-teal-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Right — visual (cream-card mockup with curve) */}
      <div className="clay-reveal clay-hero-visual" style={{ animationDelay: '0.1s' }}>
        <CurveMockup />
      </div>
    </section>
  );
}

function CurveMockup() {
  return (
    <div
      className="clay-shadow-lg"
      style={{
        borderRadius: 24,
        backgroundColor: 'var(--color-clay-card)',
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff4d8b', '#e8b94a', '#2d8d8d'].map((c) => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.8 }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-clay-ink-muted)', fontFamily: 'monospace', marginLeft: 6 }}>
          speed-curve.rampify
        </span>
      </div>

      {/* Curve SVG */}
      <div
        style={{
          borderRadius: 12,
          backgroundColor: 'var(--color-clay-canvas)',
          padding: 16,
        }}
      >
        <svg viewBox="0 0 460 200" style={{ width: '100%', display: 'block' }} aria-label="Speed curve visualization">
          {/* Grid */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={`h${i}`} x1="40" y1={20 + i * 40} x2="440" y2={20 + i * 40} stroke="rgba(10,10,10,0.06)" strokeWidth="1" />
          ))}
          {/* Y labels */}
          {[['2x', 20], ['1x', 100], ['0x', 180]].map(([label, y]) => (
            <text key={label as string} x="34" y={(y as number) + 3} textAnchor="end" fontSize="9" fill="rgba(10,10,10,0.3)" fontFamily="monospace">
              {label}
            </text>
          ))}
          {/* Curve */}
          <path
            d="M40,100 C100,100 120,180 160,180 C200,180 220,100 260,20 C300,-10 340,20 360,60 C380,100 400,100 440,100"
            fill="none"
            stroke="var(--color-clay-teal)"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ strokeDasharray: 600, strokeDashoffset: 0, animation: 'draw-path 2.5s 0.3s cubic-bezier(0.16, 1, 0.3, 1) both' }}
          />
          {/* Glow */}
          <path
            d="M40,100 C100,100 120,180 160,180 C200,180 220,100 260,20 C300,-10 340,20 360,60 C380,100 400,100 440,100"
            fill="none"
            stroke="var(--color-clay-pink)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.1"
          />
          {/* Control points */}
          {[[160, 180], [260, 20], [360, 60]].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r="5" fill="var(--color-clay-canvas)" stroke="var(--color-clay-ink)" strokeWidth="1.5" />
              <circle cx={cx} cy={cy} r="2.5" fill="var(--color-clay-pink)" />
            </g>
          ))}
        </svg>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          marginTop: 12,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--color-clay-canvas)',
          border: '1px solid var(--color-clay-line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-clay-ink-muted)', fontFamily: 'monospace' }}>
          clip_001.mp4
        </span>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {[['0.5x', 'var(--color-clay-teal-bright)'], ['1.0x', 'var(--color-clay-ink)'], ['2.0x', 'var(--color-clay-ochre)']].map(([s, c]) => (
            <span key={s} style={{ fontSize: 10, fontWeight: 600, color: c as string, fontFamily: 'monospace', letterSpacing: '0.06em' }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Logo Cloud
// ════════════════════════════════════════════════════════════════════════════

function LogoCloud() {
  const logos = ['YouTube', 'TikTok', 'Vimeo', 'Twitch', 'Instagram', 'X'];
  return (
    <section
      style={{
        padding: '32px 24px 64px',
        borderTop: '1px solid var(--color-clay-line)',
        borderBottom: '1px solid var(--color-clay-line)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-clay-ink-muted)',
          }}
        >
          Trusted by creators publishing to
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 48,
            flexWrap: 'wrap',
          }}
        >
          {logos.map((logo) => (
            <span
              key={logo}
              className="clay-display"
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'var(--color-clay-ink-muted)',
                opacity: 0.6,
                transition: 'opacity 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--color-clay-ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--color-clay-ink-muted)'; }}
            >
              {logo}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Feature Grid — 6 saturated Clay cards
// ════════════════════════════════════════════════════════════════════════════

const FEATURES = [
  {
    color: 'var(--color-clay-pink)',
    title: 'Curve-first editing',
    desc: 'Edit speed as a shape, not a stack of rate fields. Draw bezier or linear curves and see playback react in real time.',
    icon: 'curve',
  },
  {
    color: 'var(--color-clay-teal)',
    title: 'AI frame interpolation',
    desc: 'RIFE neural networks generate in-between frames for buttery slow motion at any frame rate. No judder, no ghosting.',
    icon: 'flow',
  },
  {
    color: 'var(--color-clay-lavender)',
    title: 'Beat sync',
    desc: 'Auto-detect beats with STFT spectral flux analysis, then snap velocity peaks to the music. Your edit hits every drop.',
    icon: 'beat',
  },
  {
    color: 'var(--color-clay-peach)',
    title: 'Motion blur',
    desc: 'Cinematic blur on every speed transition. Balanced, quality, or ultra presets — the kind of blur that sells a ramp.',
    icon: 'blur',
  },
  {
    color: 'var(--color-clay-ochre)',
    title: '4K export',
    desc: 'Full resolution output with no watermark. ffmpeg.wasm encodes right in your browser — your footage never leaves.',
    icon: 'export',
  },
  {
    color: 'var(--color-clay-card)',
    title: 'Local-first privacy',
    desc: 'All processing runs in WebAssembly. No uploads, no servers, no data collection. Your clips stay on your machine.',
    icon: 'lock',
  },
];

function FeatureGrid() {
  return (
    <section id="features" style={{ padding: '96px 24px', scrollMarginTop: 64 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ marginBottom: 56, maxWidth: 640 }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-pink)',
            }}
          >
            Features
          </p>
          <h2 className="clay-display" style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 48px)' }}>
            Everything you need to edit
            <br />
            like a pro. Nothing you don't.
          </h2>
        </div>

        {/* Card grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}
        >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: typeof FEATURES[number] }) {
  const isLight = feature.color === 'var(--color-clay-card)' || feature.color === 'var(--color-clay-ochre)' || feature.color === 'var(--color-clay-peach)' || feature.color === 'var(--color-clay-lavender)';
  const textColor = isLight ? 'var(--color-clay-ink)' : '#fffaf0';
  const descColor = isLight ? 'var(--color-clay-ink-soft)' : 'rgba(255,250,240,0.75)';

  return (
    <article
      className="clay-lift"
      style={{
        borderRadius: 24,
        backgroundColor: feature.color,
        padding: '32px 28px',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Icon */}
      <div style={{ marginBottom: 20 }}>
        <FeatureIcon name={feature.icon} color={textColor} />
      </div>

      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: textColor,
        }}
      >
        {feature.title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.6,
          color: descColor,
        }}
      >
        {feature.desc}
      </p>
    </article>
  );
}

function FeatureIcon({ name, color }: { name: string; color: string }) {
  const props = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'curve':
      return <svg {...props}><path d="M3 12 C6 12 8 20 12 20 C16 20 18 4 21 4" /></svg>;
    case 'flow':
      return <svg {...props}><circle cx="6" cy="12" r="3" /><circle cx="18" cy="12" r="3" /><path d="M9 12h6" /></svg>;
    case 'beat':
      return <svg {...props}><polyline points="2 12 6 6 10 18 14 6 18 16 22 12" /></svg>;
    case 'blur':
      return <svg {...props}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" opacity="0.4" /><circle cx="12" cy="12" r="11" opacity="0.15" /></svg>;
    case 'export':
      return <svg {...props}><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>;
    case 'lock':
      return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
    default:
      return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Product Mockup — dark editor preview on cream background
// ════════════════════════════════════════════════════════════════════════════

function ProductMockupSection() {
  return (
    <section style={{ padding: '96px 24px', backgroundColor: 'var(--color-clay-card)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-teal-bright)',
            }}
          >
            The editor
          </p>
          <h2 className="clay-display" style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 48px)' }}>
            A pro editor that lives in your tab
          </h2>
        </div>

        {/* Dark editor mockup */}
        <div
          className="clay-shadow-lg"
          style={{
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: '#07080F',
            aspectRatio: '16 / 9',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top bar */}
          <div
            style={{
              height: 40,
              backgroundColor: '#fffaf0',
              borderBottom: '1px solid #e5dfd0',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {['#FF5F57', '#FFBD2E', '#28C840'].map((c) => (
                <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
              ))}
            </div>
            <span style={{ fontSize: 11, color: '#8a8a8a', fontFamily: 'monospace', marginLeft: 8 }}>
              rampify — editor
            </span>
          </div>

          {/* Editor body */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: 0 }}>
            {/* Sidebar */}
            <div
              style={{
                backgroundColor: '#faf5e8',
                borderRight: '1px solid #e5dfd0',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ height: 28, borderRadius: 6, background: 'rgba(184,164,237,0.15)', border: '1px solid rgba(184,164,237,0.3)' }} />
              <div style={{ height: 20, borderRadius: 6, background: 'rgba(10,10,10,0.04)' }} />
              <div style={{ height: 20, borderRadius: 6, background: 'rgba(10,10,10,0.04)' }} />
              <div style={{ height: 20, borderRadius: 6, background: 'rgba(45,141,141,0.1)', border: '1px solid rgba(45,141,141,0.25)' }} />
              <div style={{ height: 20, borderRadius: 6, background: 'rgba(10,10,10,0.03)' }} />
              <div style={{ height: 20, borderRadius: 6, background: 'rgba(10,10,10,0.03)' }} />
            </div>

            {/* Main area */}
            <div style={{ display: 'grid', gridTemplateRows: '1fr auto 120px 100px', minHeight: 0 }}>
              {/* Preview */}
              <div
                style={{
                  backgroundColor: '#0a1a1a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: '60%',
                    height: '60%',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(184,164,237,0.12), rgba(45,141,141,0.08))',
                    border: '1px solid rgba(255,250,240,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="rgba(255,250,240,0.25)" aria-hidden="true">
                    <polygon points="8 5 19 12 8 19" />
                  </svg>
                </div>
              </div>
              {/* Beat sync */}
              <div
                style={{
                  height: 56,
                  backgroundColor: '#faf5e8',
                  borderTop: '1px solid #e5dfd0',
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 3,
                      height: 8 + Math.abs(Math.sin(i * 0.5)) * 24,
                      borderRadius: 2,
                      background: i % 4 === 0 ? '#2d8d8d' : 'rgba(184,164,237,0.25)',
                    }}
                  />
                ))}
              </div>
              {/* Curve */}
              <div
                style={{
                  backgroundColor: '#faf5e8',
                  borderTop: '1px solid #e5dfd0',
                  borderBottom: '1px solid #e5dfd0',
                  padding: '12px 16px',
                }}
              >
                <svg viewBox="0 0 400 90" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true">
                  <path
                    d="M0,45 C60,45 80,80 120,80 C160,80 180,45 220,10 C260,-10 300,10 320,30 C340,50 360,45 400,45"
                    fill="none"
                    stroke="#2d8d8d"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              {/* Timeline */}
              <div
                style={{
                  backgroundColor: '#f5f0e0',
                  padding: '8px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {[
                  { w: '40%', c: 'rgba(184,164,237,0.25)' },
                  { w: '25%', c: 'rgba(45,141,141,0.25)', ml: '8%' },
                  { w: '50%', c: 'rgba(232,185,74,0.2)' },
                ].map((seg, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 18 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: seg.c, marginLeft: seg.ml || 0 }} />
                    <div style={{ flex: 1, height: 18, borderRadius: 4, background: '#f5f0e0', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', inset: 0, width: seg.w, background: seg.c, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="clay-body" style={{ textAlign: 'center', marginTop: 24, fontSize: 14 }}>
          Speed curve, beat sync, timeline, and live preview — all in one view. No clutter, no bloat.
        </p>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// How It Works — 3 steps
// ════════════════════════════════════════════════════════════════════════════

function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Drop your clip',
      desc: 'Drag any video file into the browser. No upload — it stays local. MP4, WebM, MOV, whatever ffmpeg supports.',
      color: 'var(--color-clay-pink)',
    },
    {
      num: '02',
      title: 'Draw your curve',
      desc: 'Click to add control points, drag to shape the speed ramp. Real-time playback shows exactly what you\'ll get.',
      color: 'var(--color-clay-lavender)',
    },
    {
      num: '03',
      title: 'Export',
      desc: 'Choose your resolution and hit export. ffmpeg.wasm encodes in a Web Worker. Download in seconds.',
      color: 'var(--color-clay-teal-bright)',
    },
  ];

  return (
    <section style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 56, textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-ochre)',
            }}
          >
            How it works
          </p>
          <h2 className="clay-display" style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 48px)' }}>
            Three steps. That's it.
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 32,
          }}
        >
          {steps.map((step) => (
            <div key={step.num} style={{ position: 'relative' }}>
              <div
                className="clay-display"
                style={{
                  fontSize: 56,
                  fontWeight: 500,
                  letterSpacing: '-0.04em',
                  color: step.color,
                  marginBottom: 16,
                  lineHeight: 1,
                }}
              >
                {step.num}
              </div>
              <h3
                style={{
                  margin: '0 0 12px',
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-clay-ink)',
                }}
              >
                {step.title}
              </h3>
              <p className="clay-body" style={{ margin: 0, fontSize: 14, maxWidth: 320 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Stats Band
// ════════════════════════════════════════════════════════════════════════════

function StatsBand() {
  const stats = [
    { value: '0', label: 'Installs required' },
    { value: '100%', label: 'Local processing' },
    { value: '4K', label: 'Max export resolution' },
    { value: '∞', label: 'Pro exports per month' },
  ];

  return (
    <section
      style={{
        padding: '64px 24px',
        backgroundColor: 'var(--color-clay-ink)',
        color: 'var(--color-clay-canvas)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 32,
          textAlign: 'center',
        }}
      >
        {stats.map((stat) => (
          <div key={stat.label}>
            <div
              className="clay-display"
              style={{
                fontSize: 'clamp(36px, 5vw, 56px)',
                fontWeight: 500,
                letterSpacing: '-0.04em',
                color: 'var(--color-clay-canvas)',
                lineHeight: 1,
                marginBottom: 8,
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,250,240,0.5)', fontWeight: 500 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Pricing Section
// ════════════════════════════════════════════════════════════════════════════

function PricingSection() {
  return (
    <section style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 56, textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-teal-bright)',
            }}
          >
            Pricing
          </p>
          <h2 className="clay-display" style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 48px)' }}>
            Start free. Upgrade when you ship.
          </h2>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 15 }}>
            No credit card to start. Cancel anytime.
          </p>
        </div>

        <PricingTable />
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Testimonials
// ════════════════════════════════════════════════════════════════════════════

const TESTIMONIALS = [
  {
    quote: "Replaced my Premiere speed-ramp workflow. The curve editor is faster than keyframing and the AI slow-mo is unreal.",
    name: 'Marcus Chen',
    role: 'Motion designer, 180k YouTube',
    color: 'var(--color-clay-pink)',
  },
  {
    quote: "I edit every TikTok in Rampify now. Beat sync alone saves me 20 minutes per video. The fact that it runs in browser is wild.",
    name: 'Sofia Ramirez',
    role: 'Content creator, 2.1M TikTok',
    color: 'var(--color-clay-teal)',
  },
  {
    quote: "The motion blur on speed transitions is the best I've seen outside of After Effects. And it exports in seconds, not minutes.",
    name: 'James Okafor',
    role: 'Video editor, freelance',
    color: 'var(--color-clay-ochre)',
  },
];

function TestimonialsSection() {
  return (
    <section style={{ padding: '96px 24px', backgroundColor: 'var(--color-clay-card)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 56 }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-pink)',
            }}
          >
            Testimonials
          </p>
          <h2 className="clay-display" style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 48px)' }}>
            Creators are shipping faster
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}
        >
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="clay-lift"
              style={{
                borderRadius: 24,
                backgroundColor: 'var(--color-clay-canvas)',
                border: '1px solid var(--color-clay-line)',
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Color bar */}
              <div
                style={{
                  width: 40,
                  height: 4,
                  borderRadius: 2,
                  background: t.color,
                  marginBottom: 20,
                }}
              />
              <p
                style={{
                  margin: '0 0 24px',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--color-clay-ink)',
                  fontWeight: 400,
                  flex: 1,
                }}
              >
                "{t.quote}"
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: t.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#fffaf0',
                    flexShrink: 0,
                  }}
                >
                  {t.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-clay-ink)' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-clay-ink-muted)' }}>
                    {t.role}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FAQ
// ════════════════════════════════════════════════════════════════════════════

const FAQS = [
  {
    q: 'Do I need to install anything?',
    a: 'No. Rampify runs entirely in your browser using WebAssembly. ffmpeg.wasm handles video encoding in a Web Worker, and AI interpolation runs via ONNX Runtime Web. No downloads, no plugins, no native apps.',
  },
  {
    q: 'Does my video get uploaded to a server?',
    a: 'No. All video processing happens locally in your browser. Your footage never leaves your machine. The only server calls are for authentication and subscription management.',
  },
  {
    q: 'What formats are supported?',
    a: 'Any format ffmpeg supports — MP4, WebM, MOV, MKV, AVI, and more. Export supports MP4 (H.264) and WebM (VP9) up to 4K resolution on Pro.',
  },
  {
    q: 'How does the AI slow motion work?',
    a: 'We use RIFE (Real-time Intermediate Flow Estimation), a neural network that generates intermediate frames between existing ones. This creates smooth slow motion without the judder of traditional frame duplication. It runs on GPU via WebGL when available, with CPU fallback.',
  },
  {
    q: 'Can I cancel my subscription anytime?',
    a: 'Yes. Cancel from the account menu with one click. No questions, no retention emails. Your Pro access continues until the end of your billing period, then you drop to the free plan.',
  },
  {
    q: 'Is there a team plan?',
    a: 'Studio is coming soon — it will include 5 seats, a shared preset library, batch processing API, and 8K export. Email hello@rampify.app to join the waitlist and get notified when it launches.',
  },
];

function FAQSection() {
  return (
    <section style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 48, textAlign: 'center' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-lavender)',
            }}
          >
            FAQ
          </p>
          <h2 className="clay-display" style={{ margin: 0, fontSize: 'clamp(32px, 4vw, 48px)' }}>
            Questions, answered
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              style={{
                borderBottom: '1px solid var(--color-clay-line)',
                padding: '20px 0',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--color-clay-ink)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  listStyle: 'none',
                }}
              >
                {faq.q}
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-clay-ink-muted)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  style={{ flexShrink: 0, transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <p
                className="clay-body"
                style={{
                  margin: '12px 0 0',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              >
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CTA Band
// ════════════════════════════════════════════════════════════════════════════

function CTABand() {
  return (
    <section style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div
          className="clay-cta-card"
          style={{
            borderRadius: 32,
            backgroundColor: 'var(--color-clay-ink)',
            color: 'var(--color-clay-canvas)',
            padding: '64px 48px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Decorative shapes */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -60,
              left: -60,
              width: 200,
              height: 200,
              borderRadius: '50%',
              background: 'var(--color-clay-pink)',
              opacity: 0.15,
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              bottom: -80,
              right: -40,
              width: 240,
              height: 240,
              borderRadius: '50%',
              background: 'var(--color-clay-teal-bright)',
              opacity: 0.1,
            }}
          />

          <h2
            className="clay-display"
            style={{
              margin: 0,
              fontSize: 'clamp(32px, 4vw, 48px)',
              color: 'var(--color-clay-canvas)',
              position: 'relative',
            }}
          >
            Ready to ramp?
          </h2>
          <p
            style={{
              margin: '16px 0 32px',
              fontSize: 17,
              color: 'rgba(255,250,240,0.6)',
              position: 'relative',
            }}
          >
            Open the editor and drop a clip. You'll be exporting in under a minute.
          </p>
          <Link
            to="/editor"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '16px 36px',
              borderRadius: 999,
              backgroundColor: 'var(--color-clay-canvas)',
              color: 'var(--color-clay-ink)',
              textDecoration: 'none',
              fontSize: 16,
              fontWeight: 600,
              position: 'relative',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)'; }}
          >
            Open the editor
            <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Shared icons
// ════════════════════════════════════════════════════════════════════════════

function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}