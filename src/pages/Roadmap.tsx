import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';
import { Seo } from '@/components/Seo';

interface RoadmapItem {
  title: string;
  description: string;
  status: 'next' | 'planned' | 'exploring';
}

const ROADMAP: { phase: string; eta: string; color: string; items: RoadmapItem[] }[] = [
  {
    phase: 'In progress',
    eta: 'Next 30 days',
    color: 'var(--color-clay-pink)',
    items: [
      {
        title: 'Studio plan with team workspaces',
        description: 'Shared preset libraries, team seats, and a batch processing API for high-volume production teams.',
        status: 'next',
      },
      {
        title: 'Export presets',
        description: 'Save your motion blur, interpolation, and curve settings as a reusable preset across projects.',
        status: 'next',
      },
    ],
  },
  {
    phase: 'Planned',
    eta: 'This quarter',
    color: 'var(--color-clay-teal-bright)',
    items: [
      {
        title: '8K export resolution',
        description: 'Pro and Studio tiers will support full 8K output with hardware-accelerated encoding where available.',
        status: 'planned',
      },
      {
        title: 'Curve templates library',
        description: 'A community-curated library of speed curves — ramp styles, beat-synced patterns, and genre presets.',
        status: 'planned',
      },
      {
        title: 'Keyboard shortcut customization',
        description: 'Remap every shortcut to match your muscle memory from Premiere, DaVinci, or Final Cut.',
        status: 'planned',
      },
    ],
  },
  {
    phase: 'Exploring',
    eta: 'Later this year',
    color: 'var(--color-clay-lavender)',
    items: [
      {
        title: 'WebGPU acceleration',
        description: 'Move RIFE inference and ffmpeg encoding to WebGPU compute shaders for 3–5× faster exports on supported GPUs.',
        status: 'exploring',
      },
      {
        title: 'Project file format',
        description: 'Portable .ramp project files so you can share editable projects, not just exported video.',
        status: 'exploring',
      },
      {
        title: 'Multi-clip timeline',
        description: 'Stitch multiple clips on one timeline with crossfade transitions between segments.',
        status: 'exploring',
      },
    ],
  },
];

const STATUS_LABEL: Record<RoadmapItem['status'], string> = {
  next: 'Next up',
  planned: 'Planned',
  exploring: 'Exploring',
};

export function Roadmap() {
  return (
    <div className="clay-page">
      <Seo
        title="Roadmap — What's Next for Rampify Speed Editor"
        description="Rampify public roadmap: timeline ruler, multi-clip project support, keyboard shortcut editor, LUTs, caption track, and more. Vote on what we build next."
        path="/roadmap"
      />
      <ClayNav ctaLabel="Start free" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
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
            Roadmap
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 56px)' }}
          >
            Where Rampify is going
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 16, maxWidth: 560 }}>
            A living look at what we're building next. Vote on features, file issues, or just keep an eye on the trajectory.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 48 }}>
          {ROADMAP.map((column) => (
            <div key={column.phase}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 }}>
                <h2
                  className="clay-display"
                  style={{ margin: 0, fontSize: 24, fontWeight: 600 }}
                >
                  {column.phase}
                </h2>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: column.color,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {column.eta}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {column.items.map((item) => (
                  <div
                    key={item.title}
                    className="clay-lift"
                    style={{
                      borderRadius: 16,
                      border: '1px solid var(--color-clay-line)',
                      backgroundColor: 'var(--color-clay-canvas)',
                      padding: '20px 22px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 15,
                          fontWeight: 600,
                          letterSpacing: '-0.01em',
                          color: 'var(--color-clay-ink)',
                        }}
                      >
                        {item.title}
                      </h3>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color: column.color,
                          padding: '3px 8px',
                          borderRadius: 999,
                          backgroundColor: `${column.color}1a`,
                          flexShrink: 0,
                        }}
                      >
                        {STATUS_LABEL[item.status]}
                      </span>
                    </div>
                    <p className="clay-body" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}