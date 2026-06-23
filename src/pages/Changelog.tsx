import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';

const ENTRIES = [
  {
    version: '2.4.0',
    date: 'June 24, 2026',
    tag: 'New',
    tagColor: 'var(--color-clay-pink)',
    title: 'AI frame interpolation now supports ultra quality (×8)',
    changes: [
      'Added ultra quality preset for RIFE interpolation — generates 8× frames for dramatic slow motion.',
      'Model weights now cached in IndexedDB on first load, eliminating the 6MB download on subsequent sessions.',
      'WebGL EP auto-detection improved — falls back to WASM only when GPU is unavailable.',
    ],
  },
  {
    version: '2.3.0',
    date: 'June 10, 2026',
    tag: 'New',
    tagColor: 'var(--color-clay-teal-bright)',
    title: 'Beat sync with auto-detection',
    changes: [
      'STFT spectral flux beat detection runs in a Web Worker — no UI jank during analysis.',
      'Four built-in velocity patterns: peak on beat, dip on beat, ramp up, ramp down.',
      'Confidence scoring warns when beat detection is unreliable (non-4/4 time signatures).',
    ],
  },
  {
    version: '2.2.0',
    date: 'May 28, 2026',
    tag: 'Improved',
    tagColor: 'var(--color-clay-ochre)',
    title: 'Export pipeline overhaul',
    changes: [
      'Export recording moved server-side — export limits are now enforced by the API, not the client.',
      'Idempotent export logging prevents double-counting on retry.',
      'Webhook idempotency via stripe_events collection prevents duplicate Pro grants.',
    ],
  },
  {
    version: '2.1.0',
    date: 'May 15, 2026',
    tag: 'Fixed',
    tagColor: 'var(--color-clay-lavender)',
    title: 'Auth and subscription stability',
    changes: [
      'Fixed race condition where Pro status could flash after sign-out.',
      'Google One Tap now uses FedCM — no popup blocked under COEP.',
      'UpgradeSuccess polling window extended to 60s with per-poll timeout.',
    ],
  },
  {
    version: '2.0.0',
    date: 'April 30, 2026',
    tag: 'Major',
    tagColor: 'var(--color-clay-ink)',
    title: 'Rampify 2.0 — the curve-first rewrite',
    changes: [
      'Complete rewrite with curve-based speed editing — no more keyframe stacks.',
      'Added motion blur with balanced, quality, and ultra presets.',
      'New timeline with waveform lane and beat markers.',
      'Local-first architecture — all processing in WebAssembly.',
    ],
  },
];

export function Changelog() {
  return (
    <div className="clay-page">
      <ClayNav />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
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
            Changelog
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 56px)' }}
          >
            What's new
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 16 }}>
            Every update to Rampify, newest first.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {ENTRIES.map((entry, i) => (
              <div
                key={entry.version}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr',
                  gap: 32,
                  padding: '32px 0',
                  borderBottom: i < ENTRIES.length - 1 ? '1px solid var(--color-clay-line)' : 'none',
                }}
              >
                {/* Date column */}
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--color-clay-ink)',
                    }}
                  >
                    {entry.version}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-clay-ink-muted)',
                      marginTop: 4,
                    }}
                  >
                    {entry.date}
                  </div>
                </div>

                {/* Content column */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                        color: entry.tagColor === 'var(--color-clay-ink)' ? 'var(--color-clay-canvas)' : 'var(--color-clay-ink)',
                        backgroundColor: entry.tagColor,
                      }}
                    >
                      {entry.tag}
                    </span>
                  </div>
                  <h3
                    style={{
                      margin: '0 0 16px',
                      fontSize: 18,
                      fontWeight: 600,
                      letterSpacing: '-0.02em',
                      color: 'var(--color-clay-ink)',
                    }}
                  >
                    {entry.title}
                  </h3>
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {entry.changes.map((change) => (
                      <li
                        key={change}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: 'var(--color-clay-ink-soft)',
                        }}
                      >
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: 'var(--color-clay-ink-muted)',
                            flexShrink: 0,
                            marginTop: 8,
                          }}
                        />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}