import { describe, expect, it } from 'vitest';
import { parseAnalyticsEvent, ANALYTICS_EVENT_NAMES } from './_analyticsEvents.js';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    eventId: '123e4567-e89b-12d3-a456-426614174000',
    name: 'export_started',
    timestamp: Date.now(),
    sessionId: 'session-1',
    anonId: 'anon-1',
    isTestSession: false,
    exportId: 'export-1',
    appVersion: '0.0.0',
    acquisition: { source: 'google.com', medium: null, campaign: null, landingPath: '/' },
    capabilities: { supported: true, missing: [] },
    props: { tier: 'free', resolution: '1080p' },
    ...overrides,
  };
}

describe('parseAnalyticsEvent', () => {
  it('accepts a well-formed payload for every documented event name', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      const result = parseAnalyticsEvent(validPayload({ name }));
      expect(result.ok).toBe(true);
    }
  });

  it('rejects an event name outside the fixed catalog', () => {
    const result = parseAnalyticsEvent(validPayload({ name: 'user_deleted_account' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a non-UUID eventId', () => {
    const result = parseAnalyticsEvent(validPayload({ eventId: 'not-a-uuid' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a missing required field', () => {
    const payload = validPayload();
    delete (payload as Record<string, unknown>).sessionId;
    const result = parseAnalyticsEvent(payload);
    expect(result.ok).toBe(false);
  });

  it('rejects props containing a nested object (PII-smuggling shape)', () => {
    const result = parseAnalyticsEvent(
      validPayload({ props: { nested: { filename: 'secret.mp4' } } }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects props containing an array', () => {
    const result = parseAnalyticsEvent(validPayload({ props: { list: [1, 2, 3] } }));
    expect(result.ok).toBe(false);
  });

  it('rejects more than 20 props (defends against a payload-size attack)', () => {
    const props: Record<string, number> = {};
    for (let i = 0; i < 21; i++) props[`k${i}`] = i;
    const result = parseAnalyticsEvent(validPayload({ props }));
    expect(result.ok).toBe(false);
  });

  it('rejects an oversized single string prop value', () => {
    const result = parseAnalyticsEvent(validPayload({ props: { note: 'x'.repeat(500) } }));
    expect(result.ok).toBe(false);
  });

  it('rejects a payload whose total size exceeds the cap', () => {
    const result = parseAnalyticsEvent({ ...validPayload(), padding: 'x'.repeat(5000) });
    expect(result.ok).toBe(false);
  });

  it('accepts acquisition/capabilities/exportId/appVersion as optional or null', () => {
    const minimal = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      name: 'landing_view',
      timestamp: Date.now(),
      sessionId: 'session-1',
      anonId: 'anon-1',
      isTestSession: true,
    };
    const result = parseAnalyticsEvent(minimal);
    expect(result.ok).toBe(true);
  });

  it('never throws on garbage input', () => {
    expect(() => parseAnalyticsEvent(null)).not.toThrow();
    expect(() => parseAnalyticsEvent(undefined)).not.toThrow();
    expect(() => parseAnalyticsEvent('a string')).not.toThrow();
    expect(() => parseAnalyticsEvent(42)).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => parseAnalyticsEvent(circular)).not.toThrow();
  });

  it('parses the same payload identically on repeat — the actual dedup mechanism is the Firestore write keyed by eventId (api/track-event.ts), not parsing, but a retried send must still produce the same data both times for that idempotent .set() to be a true no-op', () => {
    const payload = validPayload();
    const first = parseAnalyticsEvent(payload);
    const second = parseAnalyticsEvent(payload);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.data).toEqual(second.data);
    }
  });

  it('ignores a client-asserted uid shape mismatch gracefully (server never trusts it anyway)', () => {
    // api/track-event.ts re-resolves uid itself from a verified Authorization
    // header and discards whatever the client sent — this only checks that a
    // present-but-wrong-shaped uid field doesn't crash validation.
    const result = parseAnalyticsEvent(validPayload({ uid: 12345 }));
    expect(result.ok).toBe(false); // wrong type is still rejected — schema enforces string|null
  });
});
