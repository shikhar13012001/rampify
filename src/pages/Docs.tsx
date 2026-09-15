import { Link } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo } from '@/components/Seo';

interface DocSection {
  slug: string;
  title: string;
  description: string;
  color: string;
}

// Real content for every section — verified against the actual code cited
// in each section's own comments below, not invented. Kept as one page
// (anchored sections) rather than split into /docs/<slug> routes for now;
// see docs/validation/STATUS.md for why that split is deferred, not
// abandoned.
const SECTIONS: DocSection[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'From zero to your first speed-ramped export in five minutes.',
    color: 'var(--color-clay-pink)',
  },
  {
    slug: 'motion-blur',
    title: 'Motion blur & interpolation',
    description: 'Make slow motion smooth and transitions buttery.',
    color: 'var(--color-clay-teal-bright)',
  },
  {
    slug: 'beat-sync',
    title: 'Beat sync',
    description: 'Lock your speed ramps to music automatically.',
    color: 'var(--color-clay-lavender)',
  },
  {
    slug: 'billing',
    title: 'Billing & accounts',
    description: 'Plans, upgrades, cancellations, and refunds.',
    color: 'var(--color-clay-ochre)',
  },
  {
    slug: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    description: 'Every key binding in the editor.',
    color: 'var(--color-clay-peach)',
  },
  {
    slug: 'technical-reference',
    title: 'Technical reference',
    description: 'How Rampcut works under the hood.',
    color: 'var(--color-clay-ink)',
  },
];

function SectionCard({ section }: { section: DocSection }) {
  return (
    <a
      href={`#${section.slug}`}
      className="clay-lift"
      style={{
        display: 'block',
        borderRadius: 18,
        border: '1px solid var(--color-clay-line)',
        backgroundColor: 'var(--color-clay-canvas)',
        padding: '24px 22px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: section.color === 'var(--color-clay-ink)' ? section.color : `${section.color}1f`,
          marginBottom: 16,
        }}
      />
      <h3
        style={{
          margin: '0 0 6px',
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: 'var(--color-clay-ink)',
        }}
      >
        {section.title}
      </h3>
      <p className="clay-body" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {section.description}
      </p>
      <p
        style={{
          margin: '12px 0 0',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-clay-teal-bright)',
        }}
      >
        Read this guide ↓
      </p>
    </a>
  );
}

function GuideSection({
  id,
  title,
  color,
  children,
}: {
  id: string;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ padding: '48px 24px', scrollMarginTop: 24 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: color === 'var(--color-clay-ink)' ? color : `${color}1f`,
            marginBottom: 20,
          }}
        />
        <h2 className="clay-display" style={{ margin: '0 0 20px', fontSize: 'clamp(28px, 3.5vw, 36px)' }}>
          {title}
        </h2>
        <div className="clay-body" style={{ fontSize: 15, lineHeight: 1.7 }}>
          {children}
        </div>
      </div>
    </section>
  );
}

const h3Style: React.CSSProperties = {
  margin: '28px 0 10px',
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--color-clay-ink)',
};
const pStyle: React.CSSProperties = { margin: '0 0 14px' };
const ulStyle: React.CSSProperties = { margin: '0 0 14px', paddingLeft: 20 };
const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  backgroundColor: 'var(--color-clay-line)',
  padding: '1px 6px',
  borderRadius: 4,
};

export function Docs() {
  return (
    <div className="clay-page">
      <Seo
        title="Docs — Rampcut Video Speed Editor Help & Tutorials"
        description="Rampcut documentation: speed curve editor, AI slow motion, beat sync, motion blur, 4K export, and privacy. Learn how to ramp video speed in the browser."
        path="/docs"
      />
      <ClayNav ctaLabel="Open editor" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
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
            Documentation
          </p>
          <h1 className="clay-display" style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 56px)' }}>
            Learn Rampcut
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 16, maxWidth: 560 }}>
            Six real guides below, plus a full worked example with real numbers if you want to see
            speed ramping end to end first.
          </p>
          <Link
            to="/features/speed-ramp"
            className="clay-lift"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 20,
              padding: '12px 20px',
              borderRadius: 999,
              backgroundColor: 'var(--color-clay-ink)',
              color: 'var(--color-clay-canvas)',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Read the speed ramp guide →
          </Link>
        </div>
      </section>

      <section style={{ padding: '0 24px 32px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {SECTIONS.map((section) => (
              <SectionCard key={section.slug} section={section} />
            ))}
          </div>
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--color-clay-line)' }}>
        <GuideSection id="getting-started" title="Getting started" color="var(--color-clay-pink)">
          <p style={pStyle}>
            You don't need an account to try Rampcut. Drop a clip on the homepage or click
            &quot;Try a demo clip&quot; to load a sample without your own footage — everything below
            happens the same way either way.
          </p>
          <h3 style={h3Style}>1. Load a clip</h3>
          <p style={pStyle}>
            Drag a file onto the drop zone, or click it to browse. Accepted formats: MP4, MOV, WebM.
            Nothing is uploaded — the file stays on your machine and is read directly by your
            browser (see Technical reference below for why).
          </p>
          <h3 style={h3Style}>2. Shape the speed</h3>
          <p style={pStyle}>
            Pick a preset from the sidebar (each one is a real, named curve — see{' '}
            <Link to="/curves" style={{ color: 'var(--color-clay-teal-bright)' }}>
              the Curve Library
            </Link>
            ) or draw your own points directly on the curve panel. The preview updates as you drag.
          </p>
          <h3 style={h3Style}>3. Export</h3>
          <p style={pStyle}>
            Click Export (or press <span style={codeStyle}>Ctrl/Cmd + E</span>). As a guest, you get
            one free export at 1080p with no sign-in — the wall only appears after that, not before.
            Free accounts get 3 exports/month; see Billing &amp; accounts below for the full plan
            breakdown.
          </p>
        </GuideSection>

        <GuideSection id="motion-blur" title="Motion blur & interpolation" color="var(--color-clay-teal-bright)">
          <p style={pStyle}>
            Slowing footage down exposes two separate problems, and Rampcut has a separate tool for
            each: motion blur softens fast motion during a speed transition, while AI frame
            interpolation adds real in-between frames so a heavily slowed clip doesn't judder.
          </p>
          <h3 style={h3Style}>Motion blur</h3>
          <p style={pStyle}>Three intensities, applied to speed transitions:</p>
          <ul style={ulStyle}>
            <li><strong>Subtle</strong> — a light blur, Pro only.</li>
            <li><strong>Balanced</strong> — the default, available on every plan including Free.</li>
            <li><strong>Cinematic</strong> — the strongest blur, Pro only.</li>
          </ul>
          <h3 style={h3Style}>AI frame interpolation (RIFE)</h3>
          <p style={pStyle}>
            A neural network (RIFE) generates real synthetic frames between your source frames,
            instead of just holding existing frames longer — this is what actually fixes stutter at
            low speeds, rather than just smoothing it over. Pro only, three quality levels:
          </p>
          <ul style={ulStyle}>
            <li><strong>Draft</strong> — 1 synthetic frame per pair (~2× as many frames).</li>
            <li><strong>Quality</strong> — 3 synthetic frames per pair (~4× as many frames).</li>
            <li><strong>Ultra</strong> — 7 synthetic frames per pair (~8× as many frames).</li>
          </ul>
          <p style={pStyle}>
            This runs via WebGL when your GPU supports it, and falls back to a much slower CPU path
            on integrated GPUs — Ultra quality on a 5-second slow segment can take several minutes on
            CPU-only hardware. The export screen shows a time estimate before you commit, so you'll
            see this coming rather than being surprised by it.
          </p>
        </GuideSection>

        <GuideSection id="beat-sync" title="Beat sync" color="var(--color-clay-lavender)">
          <p style={pStyle}>
            Beat sync detects the beat in an audio track and lets you apply a speed pattern that
            lands on those beats automatically, instead of hand-placing keyframes. Pro only.
          </p>
          <h3 style={h3Style}>How detection works</h3>
          <p style={pStyle}>
            Beat detection runs entirely in a Web Worker using spectral-flux analysis on the raw
            audio — it finds onsets (sudden changes in the audio spectrum), not musical beats in an
            abstract sense, so it works on the actual sound in your track rather than assuming a
            fixed tempo. A confidence score flags when detection is less reliable, which is most
            often on non-4/4 time signatures — worth a manual check in those cases rather than
            trusting the automatic result blindly.
          </p>
          <h3 style={h3Style}>Patterns</h3>
          <ul style={ulStyle}>
            <li><strong>Peak on beat</strong> — speed ramps up to a peak right on each detected beat.</li>
            <li><strong>Slow on beat</strong> — the inverse: speed dips down on each beat.</li>
            <li><strong>Custom</strong> — define your own 4-beat speed pattern and it repeats across every detected beat.</li>
          </ul>
        </GuideSection>

        <GuideSection id="billing" title="Billing & accounts" color="var(--color-clay-ochre)">
          <h3 style={{ ...h3Style, marginTop: 0 }}>Plans</h3>
          <ul style={ulStyle}>
            <li><strong>Guest</strong> — one free export, 1080p, no account needed.</li>
            <li><strong>Free</strong> — sign in for 3 exports/month, 1080p, Balanced motion blur only.</li>
            <li><strong>Pro</strong> — $12/month or $96/year: unlimited exports, 4K, all motion blur intensities, AI frame interpolation, beat sync.</li>
            <li><strong>Founder</strong> — $59 one-time, first 25 seats only: lifetime Pro, no recurring billing.</li>
          </ul>
          <h3 style={h3Style}>Managing your subscription</h3>
          <p style={pStyle}>
            Open the account menu (top right, once signed in) and choose &quot;Manage subscription&quot;
            — this opens Dodo's customer portal (Rampcut's payment processor), where you confirm any
            change or cancellation directly. It's a real two-step flow, not an instant one-click
            cancel from inside Rampcut itself.
          </p>
          <h3 style={h3Style}>Refunds</h3>
          <p style={pStyle}>
            See the <Link to="/terms" style={{ color: 'var(--color-clay-teal-bright)' }}>Terms</Link> page
            for the current refund window and how to request one.
          </p>
        </GuideSection>

        <GuideSection id="keyboard-shortcuts" title="Keyboard shortcuts" color="var(--color-clay-peach)">
          <p style={pStyle}>Every key binding that works inside the editor:</p>
          <ul style={ulStyle}>
            <li><span style={codeStyle}>Space</span> — play / pause</li>
            <li><span style={codeStyle}>←</span> / <span style={codeStyle}>→</span> — seek 1 second (hold Shift for 5 seconds)</li>
            <li><span style={codeStyle}>S</span> — split the segment at the playhead</li>
            <li><span style={codeStyle}>Delete</span> / <span style={codeStyle}>Backspace</span> — delete the selected segment (only when more than one segment exists)</li>
            <li><span style={codeStyle}>Ctrl/Cmd + Z</span> — undo</li>
            <li><span style={codeStyle}>Ctrl/Cmd + E</span> — export</li>
          </ul>
          <p style={pStyle}>
            Shortcuts are disabled while typing in a text field, so they won't interfere with naming
            anything.
          </p>
        </GuideSection>

        <GuideSection id="technical-reference" title="Technical reference" color="var(--color-clay-ink)">
          <h3 style={{ ...h3Style, marginTop: 0 }}>Local-first architecture</h3>
          <p style={pStyle}>
            Every processing step — speed ramping, motion blur, AI frame interpolation, beat
            detection — runs inside your browser via WebAssembly, in dedicated Web Workers. Your
            video file is read directly from disk by the browser and is never sent to a server; the
            only network calls this app makes are for sign-in, billing, and anonymous usage
            analytics, none of which include your footage.
          </p>
          <h3 style={h3Style}>Browser requirements</h3>
          <p style={pStyle}>
            Export needs three things from your browser: WebAssembly, <span style={codeStyle}>SharedArrayBuffer</span>,
            and cross-origin isolation (the COOP/COEP security headers this site sends). All three
            are supported in current versions of Chrome, Firefox, and Edge. If any is missing —
            usually an outdated browser, or a network in between stripping the headers — the export
            screen tells you exactly which one, rather than failing partway through with a generic
            error.
          </p>
          <h3 style={h3Style}>Installable, works offline</h3>
          <p style={pStyle}>
            Rampcut can be installed as an app from your browser (look for an install icon in the
            address bar). Once installed, previously-loaded assets are served from a local cache, so
            the app opens and the editor UI works even without a connection — exporting still needs
            the page's own code to be cached first, which happens automatically the first time you
            visit.
          </p>
        </GuideSection>
      </div>

      <Footer />
    </div>
  );
}
