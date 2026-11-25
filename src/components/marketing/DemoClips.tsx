/* eslint-disable react-refresh/only-export-components -- exports the DEMO_CLIPS
   list alongside the component, same accepted pattern as BeforeAfterDemo.tsx */
import { useState } from 'react';

/**
 * Two extra demo clips shown on the home page so they can be looked at in the page.
 * They are NOT the synthetic "A real export" proof pair (see BeforeAfterDemo.tsx and
 * docs/validation/HOMEPAGE.md). The footage is third-party, so check the rights before
 * this section is deployed to the public site.
 */
export interface DemoClip {
  title: string;
  note: string;
  src: string;
  poster: string;
  /** Real, ffprobe-verified properties, shown so the clip can be judged on the page. */
  facts: string;
  /** Width / height, so each card keeps the clip's true shape. */
  aspect: string;
}

export const DEMO_CLIPS: DemoClip[] = [
  {
    title: 'Cinematic montage',
    note: 'Fast cuts with a warm grade: a planet, star trails, a hand on a wall, sunlit grass, a tunnel run, a wing at sunset.',
    src: '/demo/winter-montage.mp4',
    poster: '/demo/winter-montage-poster.jpg',
    facts: '9.8 s · 720×720 · H.264 + AAC · 1.4 MB',
    aspect: '1 / 1',
  },
  {
    title: 'Screen recording, exported with Rampcut',
    note: 'A vertical phone-render animation captured from a Reels screen, sped up by the editor.',
    src: '/demo/reel-rampified.mp4',
    poster: '/demo/reel-rampified-poster.jpg',
    facts: '0.57 s · 480×1080 · H.264 + AAC · 149 KB',
    aspect: '480 / 1080',
  },
];

function ClipCard({ clip }: { clip: DemoClip }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure
      className="clay-shadow"
      style={{ margin: 0, borderRadius: 20, overflow: 'hidden', border: '1px solid var(--color-clay-line)', background: 'var(--color-clay-card)' }}
    >
      <div style={{ background: '#000', display: 'flex', justifyContent: 'center' }}>
        {failed ? (
          <p role="alert" style={{ color: '#fff', padding: 32, margin: 0, fontSize: 14 }}>
            This clip could not be played in this browser.
          </p>
        ) : (
          <video
            src={clip.src}
            poster={clip.poster}
            controls
            loop
            muted
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            style={{ display: 'block', width: '100%', maxHeight: 520, aspectRatio: clip.aspect, objectFit: 'contain' }}
          />
        )}
      </div>
      <figcaption style={{ padding: '16px 20px 20px' }}>
        <strong style={{ display: 'block', fontSize: 16, marginBottom: 4 }}>{clip.title}</strong>
        <span style={{ display: 'block', fontSize: 14, lineHeight: 1.5, color: 'var(--color-text-muted)' }}>{clip.note}</span>
        <span style={{ display: 'block', marginTop: 8, fontSize: 12, color: 'var(--color-text-subtle)' }}>{clip.facts}</span>
      </figcaption>
    </figure>
  );
}

export function DemoClips({ clips = DEMO_CLIPS }: { clips?: DemoClip[] }) {
  if (!clips.length) return null;
  return (
    <section aria-label="Demo clips" style={{ padding: '0 24px 80px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <p
          style={{ margin: '0 0 20px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-clay-pink)', textAlign: 'center' }}
        >
          More demo clips
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'start' }}>
          {clips.map((clip) => (
            <ClipCard key={clip.src} clip={clip} />
          ))}
        </div>
      </div>
    </section>
  );
}
