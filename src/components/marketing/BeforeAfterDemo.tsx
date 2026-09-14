/* eslint-disable react-refresh/only-export-components -- exports the
   BEFORE_AFTER_ASSET config + BeforeAfterAsset type alongside the
   component, same accepted pattern as src/lib/auth.tsx */
import { useEffect, useState } from 'react';

/**
 * Homepage "before/after" proof section — see docs/validation/HOMEPAGE.md
 * for the full requirement and reasoning.
 *
 * This task's instructions are explicit: the demonstration must be made
 * from an ACTUAL Rampcut export, and if the rights/authenticity of a real
 * asset aren't established, the integration must be prepared and the
 * required asset clearly listed — NOT a fabricated finished demonstration.
 * No such asset exists in this repo or this environment (no camera footage,
 * no license, and no way to produce a real export through the live app
 * without a browser — see docs/validation/RESULTS.md's Methodology section
 * for why real-browser automation isn't available in this session).
 *
 * So: `AVAILABLE` is false, and this component renders nothing on the live
 * page — no placeholder, no "coming soon" box shown to real visitors. The
 * full integration below (including the reduced-motion behavior this task
 * explicitly asks to be tested) is real, working code, ready to flip on the
 * moment `BEFORE_AFTER_ASSET` is filled in with a real, rights-cleared pair.
 */

export interface BeforeAfterAsset {
  available: boolean;
  beforeVideoSrc?: string;
  afterVideoSrc?: string;
  beforePosterSrc?: string;
  afterPosterSrc?: string;
  /** The exact preset used to produce afterVideoSrc — must match
   *  DropZone.tsx's DEMO_PRESET so the "try it yourself" demo project opens
   *  with the same curve shown here. See presets.ts for available presets. */
  presetLabel?: string;
}

// REQUIRED ASSET, not yet available — see docs/validation/HOMEPAGE.md for
// the full spec (source clip requirements, rights, export settings, exact
// preset to use). Once produced, fill this in and set available: true.
export const BEFORE_AFTER_ASSET: BeforeAfterAsset = {
  available: false,
};

function usePrefersReducedMotion(): boolean {
  // Computed as the INITIAL state value (lazy useState initializer) rather
  // than set from inside an effect — avoids both an unnecessary extra
  // render on mount and a synchronous setState-in-effect lint violation.
  // The effect below only ever updates it from a real async event callback.
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function BeforeAfterDemo({ asset = BEFORE_AFTER_ASSET }: { asset?: BeforeAfterAsset }) {
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!asset.available || !asset.beforeVideoSrc || !asset.afterVideoSrc) {
    return null;
  }

  return (
    <section style={{ padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--color-clay-pink)',
            textAlign: 'center',
          }}
        >
          A real export{asset.presetLabel ? ` — "${asset.presetLabel}" preset` : ''}
        </p>
        <div
          className="clay-shadow"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 2,
            borderRadius: 20,
            overflow: 'hidden',
            border: '1px solid var(--color-clay-line)',
          }}
        >
          {[
            { label: 'Before', src: asset.beforeVideoSrc, poster: asset.beforePosterSrc },
            { label: 'After',  src: asset.afterVideoSrc,  poster: asset.afterPosterSrc },
          ].map(({ label, src, poster }) => (
            <div key={label} style={{ position: 'relative', background: '#000' }}>
              <video
                src={src}
                poster={poster}
                // Reduced motion: show only the poster frame, never autoplay.
                autoPlay={!prefersReducedMotion}
                loop={!prefersReducedMotion}
                muted
                playsInline
                controls={prefersReducedMotion}
                style={{ width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'cover' }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: 12,
                  left: 12,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(10,10,10,0.55)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
