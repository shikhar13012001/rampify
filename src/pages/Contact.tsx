import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClayNav } from '@/components/marketing/ClayNav';
import { Footer } from '@/components/marketing/Footer';

const CHANNELS = [
  {
    title: 'General inquiries',
    email: 'hello@rampify.app',
    description: 'Questions, feedback, partnership ideas, or just saying hi.',
    color: 'var(--color-clay-pink)',
  },
  {
    title: 'Support',
    email: 'support@rampify.app',
    description: 'Bugs, billing issues, or trouble with an export. Pro subscribers get priority.',
    color: 'var(--color-clay-teal-bright)',
  },
  {
    title: 'Privacy & legal',
    email: 'privacy@rampify.app',
    description: 'Data requests, GDPR questions, or terms-of-service clarifications.',
    color: 'var(--color-clay-lavender)',
  },
  {
    title: 'Education',
    email: 'education@rampify.app',
    description: '50% off Pro for verified students and educators. Send your .edu email or proof of enrollment.',
    color: 'var(--color-clay-ochre)',
  },
];

export function Contact() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Open the user's mail client with a pre-filled message.
    const subject = encodeURIComponent(`Rampify contact from ${name || 'a visitor'}`);
    const body = encodeURIComponent(`${message}\n\n— ${name}\n${email}`);
    window.location.href = `mailto:hello@rampify.app?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <div className="clay-page">
      <ClayNav ctaLabel="Open editor" />

      <section style={{ padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-clay-peach)',
            }}
          >
            Contact
          </p>
          <h1
            className="clay-display"
            style={{ margin: 0, fontSize: 'clamp(40px, 5vw, 56px)' }}
          >
            Say hello
          </h1>
          <p className="clay-body" style={{ margin: '16px 0 0', fontSize: 16, maxWidth: 520 }}>
            No ticketing system, no chatbot, no "we'll get back to you in 3–5 business days." You email a person and they email you back.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 24px 64px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
            }}
          >
            {CHANNELS.map((channel) => (
              <div
                key={channel.title}
                className="clay-lift"
                style={{
                  borderRadius: 16,
                  border: '1px solid var(--color-clay-line)',
                  backgroundColor: 'var(--color-clay-canvas)',
                  padding: '22px 20px',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    backgroundColor: `${channel.color}1f`,
                    marginBottom: 14,
                  }}
                />
                <h3
                  style={{
                    margin: '0 0 6px',
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    color: 'var(--color-clay-ink)',
                  }}
                >
                  {channel.title}
                </h3>
                <a
                  href={`mailto:${channel.email}`}
                  style={{
                    display: 'block',
                    margin: '0 0 10px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-clay-ink)',
                    textDecoration: 'none',
                  }}
                >
                  {channel.email}
                </a>
                <p className="clay-body" style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>
                  {channel.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2
            className="clay-display"
            style={{ margin: '0 0 24px', fontSize: 'clamp(24px, 3vw, 32px)' }}
          >
            Or write to us directly
          </h2>
          {sent ? (
            <div
              style={{
                borderRadius: 16,
                border: '1px solid var(--color-clay-line)',
                backgroundColor: 'var(--color-clay-canvas)',
                padding: '32px 28px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: 'rgba(45, 141, 141, 0.12)',
                  margin: '0 auto 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8.5l3.5 3.5L13 5" stroke="var(--color-clay-teal-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--color-clay-ink)' }}>
                Your mail app should be open
              </h3>
              <p className="clay-body" style={{ margin: '0 0 20px', fontSize: 13, lineHeight: 1.6 }}>
                If nothing happened, email us directly at{' '}
                <a href="mailto:hello@rampify.app" style={{ color: 'var(--color-clay-ink)', fontWeight: 600, textDecoration: 'none' }}>
                  hello@rampify.app
                </a>
                .
              </p>
              <Link
                to="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '9px 18px',
                  borderRadius: 999,
                  backgroundColor: 'var(--color-clay-ink)',
                  color: 'var(--color-clay-canvas)',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Back home
              </Link>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{
                borderRadius: 18,
                border: '1px solid var(--color-clay-line)',
                backgroundColor: 'var(--color-clay-canvas)',
                padding: '28px 26px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <Field label="Your name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Creator"
                  style={inputStyle}
                  required
                />
              </Field>
              <Field label="Your email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  style={inputStyle}
                  required
                />
              </Field>
              <Field label="Message">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  required
                />
              </Field>
              <button
                type="submit"
                style={{
                  padding: '12px 20px',
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: 'var(--color-clay-ink)',
                  color: 'var(--color-clay-canvas)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '-0.01em',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)')}
              >
                Open mail & send
              </button>
            </form>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-clay-line)',
  backgroundColor: 'var(--color-clay-canvas)',
  fontSize: 14,
  fontFamily: 'inherit',
  color: 'var(--color-clay-ink)',
  outline: 'none',
  transition: 'border-color 0.15s',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--color-clay-ink)',
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}