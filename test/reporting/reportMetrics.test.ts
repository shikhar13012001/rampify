/**
 * All fixture data in this file is SYNTHETIC — invented session ids,
 * timestamps, and acquisition values for testing the calculation logic in
 * scripts/lib/reportMetrics.mjs only. None of it represents real visitors,
 * real traffic, or real revenue. Per this task's explicit instruction, this
 * synthetic data must never appear in docs/validation/WEEKLY_REPORT.md —
 * see scripts/generate-weekly-report.mjs and its own tests for how the real
 * report handles an empty/missing validation-data/ directory instead.
 */
import { describe, it, expect } from 'vitest';
import {
  toMillis,
  isQualifiedEvent,
  groupKey,
  buildSessionIndex,
  firstActivation,
  computeFunnelByAcquisition,
  computePaymentTotals,
  parseCsv,
  normalizeGscRow,
  summarizeGscRows,
  splitBranded,
} from '../../scripts/lib/reportMetrics.mjs';

describe('parseCsv (minimal GSC-export parser)', () => {
  it('parses a simple header + rows CSV into objects keyed by header', () => {
    const csv = 'Query,Clicks,Impressions\nsynthetic a,5,50\nsynthetic b,3,80\n';
    expect(parseCsv(csv)).toEqual([
      { Query: 'synthetic a', Clicks: '5', Impressions: '50' },
      { Query: 'synthetic b', Clicks: '3', Impressions: '80' },
    ]);
  });

  it('handles a quoted field containing a comma', () => {
    const csv = 'Query,Clicks\n"synthetic query, with a comma",7\n';
    expect(parseCsv(csv)).toEqual([{ Query: 'synthetic query, with a comma', Clicks: '7' }]);
  });

  it('handles an escaped double-quote inside a quoted field', () => {
    const csv = 'Query,Clicks\n"synthetic ""quoted"" query",2\n';
    expect(parseCsv(csv)).toEqual([{ Query: 'synthetic "quoted" query', Clicks: '2' }]);
  });

  it('strips a UTF-8 BOM and handles CRLF line endings', () => {
    const csv = '﻿Query,Clicks\r\nsynthetic a,1\r\n';
    expect(parseCsv(csv)).toEqual([{ Query: 'synthetic a', Clicks: '1' }]);
  });

  it('returns an empty array for an empty or header-only file', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('Query,Clicks\n')).toEqual([]);
  });
});

describe('toMillis', () => {
  it('parses an ISO string', () => {
    expect(toMillis('2026-09-01T00:00:00.000Z')).toBe(Date.parse('2026-09-01T00:00:00.000Z'));
  });
  it('passes through a numeric epoch', () => {
    expect(toMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
  });
  it('handles a Firestore-Timestamp-like {seconds} shape', () => {
    expect(toMillis({ seconds: 1700000000, nanoseconds: 0 })).toBe(1700000000 * 1000);
  });
  it('handles a {_seconds} shape (some export tools use the underscore-prefixed field)', () => {
    expect(toMillis({ _seconds: 1700000000 })).toBe(1700000000 * 1000);
  });
  it('returns null for unparseable input', () => {
    expect(toMillis('not a date')).toBeNull();
    expect(toMillis(null)).toBeNull();
    expect(toMillis(undefined)).toBeNull();
    expect(toMillis({})).toBeNull();
  });
});

describe('isQualifiedEvent / groupKey', () => {
  it('a non-test event is qualified; a test event is not', () => {
    expect(isQualifiedEvent({ isTestSession: false })).toBe(true);
    expect(isQualifiedEvent({ isTestSession: true })).toBe(false);
  });

  it('groups missing acquisition fields under explicit unknown labels, not blank strings', () => {
    const g = groupKey(null);
    expect(g.source).toBe('(direct/unknown)');
    expect(g.landingPath).toBe('(unknown)');
    expect(g.key).toBe('(direct/unknown) | (unknown)');
  });

  it('uses the real source/landingPath when present', () => {
    const g = groupKey({ source: 'synthetic-newsletter', medium: 'email', landingPath: '/features/speed-ramp' });
    expect(g.key).toBe('synthetic-newsletter | /features/speed-ramp');
  });
});

describe('buildSessionIndex', () => {
  it('groups events by sessionId and sorts each session by time', () => {
    const events = [
      { sessionId: 's1', name: 'export_started', timestamp: '2026-09-01T00:00:05.000Z', isTestSession: false },
      { sessionId: 's1', name: 'landing_view', timestamp: '2026-09-01T00:00:00.000Z', isTestSession: false },
    ];
    const { sessions } = buildSessionIndex(events);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].events.map((e) => e.name)).toEqual(['landing_view', 'export_started']);
  });

  it('drops events with no sessionId, except payment_succeeded (which never has one by design)', () => {
    const events = [
      { name: 'clip_loaded', timestamp: '2026-09-01T00:00:00.000Z', isTestSession: false }, // no sessionId
      { name: 'payment_succeeded', timestamp: '2026-09-01T00:00:00.000Z', isTestSession: false, uid: 'synthetic-uid-1' },
    ];
    const { sessions, dropped } = buildSessionIndex(events);
    expect(sessions).toHaveLength(0);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].reason).toBe('no sessionId');
  });

  it('drops events with an unparseable timestamp rather than silently mis-sorting', () => {
    const events = [{ sessionId: 's1', name: 'landing_view', timestamp: 'garbage', isTestSession: false }];
    const { sessions, dropped } = buildSessionIndex(events);
    expect(sessions).toHaveLength(0);
    expect(dropped[0].reason).toBe('unparseable timestamp');
  });

  it('marks a session unqualified if ANY of its events is a test event', () => {
    const events = [
      { sessionId: 's1', name: 'landing_view', timestamp: '2026-09-01T00:00:00.000Z', isTestSession: false },
      { sessionId: 's1', name: 'editor_opened', timestamp: '2026-09-01T00:00:01.000Z', isTestSession: true },
    ];
    const { sessions } = buildSessionIndex(events);
    expect(sessions[0].isQualified).toBe(false);
  });
});

describe('firstActivation (mirrors src/lib/exportAnalytics.ts qualifiesAsActivation)', () => {
  const base = { sessionId: 's1', isTestSession: false };

  it('qualifies: own-clip, validated render + matching download, same exportId', () => {
    const events = [
      { ...base, name: 'export_render_completed', exportId: 'exp1', props: { isDemoClip: false, validated: true }, _ms: 1000 },
      { ...base, name: 'download_initiated', exportId: 'exp1', props: {}, _ms: 1100 },
    ];
    expect(firstActivation(events)?.exportId).toBe('exp1');
  });

  it('does not qualify: demo clip, even with a validated render and a download', () => {
    const events = [
      { ...base, name: 'export_render_completed', exportId: 'exp1', props: { isDemoClip: true, validated: true }, _ms: 1000 },
      { ...base, name: 'download_initiated', exportId: 'exp1', props: {}, _ms: 1100 },
    ];
    expect(firstActivation(events)).toBeNull();
  });

  it('does not qualify: validated is null (inconclusive probe) — never treated as a pass', () => {
    const events = [
      { ...base, name: 'export_render_completed', exportId: 'exp1', props: { isDemoClip: false, validated: null }, _ms: 1000 },
      { ...base, name: 'download_initiated', exportId: 'exp1', props: {}, _ms: 1100 },
    ];
    expect(firstActivation(events)).toBeNull();
  });

  it('does not qualify: render completed but no matching download_initiated', () => {
    const events = [
      { ...base, name: 'export_render_completed', exportId: 'exp1', props: { isDemoClip: false, validated: true }, _ms: 1000 },
    ];
    expect(firstActivation(events)).toBeNull();
  });

  it('does not qualify: download exists but for a DIFFERENT exportId', () => {
    const events = [
      { ...base, name: 'export_render_completed', exportId: 'exp1', props: { isDemoClip: false, validated: true }, _ms: 1000 },
      { ...base, name: 'download_initiated', exportId: 'exp2', props: {}, _ms: 1100 },
    ];
    expect(firstActivation(events)).toBeNull();
  });

  it('picks the earliest qualifying activation when a session has two', () => {
    const events = [
      { ...base, name: 'export_render_completed', exportId: 'exp1', props: { isDemoClip: false, validated: true }, _ms: 1000 },
      { ...base, name: 'download_initiated', exportId: 'exp1', props: {}, _ms: 1100 },
      { ...base, name: 'export_render_completed', exportId: 'exp2', props: { isDemoClip: false, validated: true }, _ms: 2000 },
      { ...base, name: 'download_initiated', exportId: 'exp2', props: {}, _ms: 2100 },
    ];
    expect(firstActivation(events)?.exportId).toBe('exp1');
  });
});

describe('computeFunnelByAcquisition — synthetic multi-source scenario', () => {
  const src = { source: 'synthetic-reddit', medium: 'community-post', campaign: 'synthetic-c1', landingPath: '/features/speed-ramp' };

  function ev(sessionId, name, tOffsetMs, extra = {}) {
    return {
      sessionId,
      name,
      timestamp: new Date(1_700_000_000_000 + tOffsetMs).toISOString(),
      isTestSession: false,
      acquisition: src,
      ...extra,
    };
  }

  it('counts qualified visitors, editor starts, and demo-vs-own clip loads for one group', () => {
    const events = [
      ev('s1', 'landing_view', 0),
      ev('s1', 'editor_opened', 100),
      ev('s1', 'clip_loaded', 200, { props: { source: 'own' } }),
      ev('s2', 'landing_view', 0),
      ev('s2', 'clip_loaded', 100, { props: { source: 'demo' } }),
    ];
    const { groups } = computeFunnelByAcquisition(events);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.qualifiedVisitors).toBe(2);
    expect(g.editorStarts).toBe(1);
    expect(g.clipLoadedOwn).toBe(1);
    expect(g.clipLoadedDemo).toBe(1);
  });

  it('excludes isTestSession sessions from every count, even though the events are present', () => {
    const events = [
      ev('s1', 'landing_view', 0, { isTestSession: true }),
      ev('s1', 'editor_opened', 100, { isTestSession: true }),
    ];
    const { groups } = computeFunnelByAcquisition(events);
    expect(groups).toHaveLength(0);
  });

  it('computes activation count and median time-to-activation for the group', () => {
    const events = [
      ev('s1', 'landing_view', 0),
      ev('s1', 'export_started', 1000, { exportId: 'exp1' }),
      ev('s1', 'export_render_completed', 5000, { exportId: 'exp1', props: { isDemoClip: false, validated: true } }),
      ev('s1', 'download_initiated', 5100, { exportId: 'exp1' }),
      // s2: a second, slower activation to give median something to compute.
      ev('s2', 'landing_view', 0),
      ev('s2', 'export_render_completed', 9000, { exportId: 'exp2', props: { isDemoClip: false, validated: true } }),
      ev('s2', 'download_initiated', 9100, { exportId: 'exp2' }),
    ];
    const { groups } = computeFunnelByAcquisition(events);
    const g = groups[0];
    expect(g.activatedSessions).toBe(2);
    // Activation "completed at" is the LATER of render-completed and
    // download-initiated (the true moment both conditions were satisfied).
    // s1: download at offset 5100ms. s2: download at offset 9100ms.
    expect(g.medianTimeToActivationMs).toBe((5100 + 9100) / 2);
  });

  it('tallies export_failed by sanitized stage, matching classifyErrorStage\'s closed enum', () => {
    const events = [
      ev('s1', 'landing_view', 0),
      ev('s1', 'export_failed', 100, { exportId: 'exp1', props: { stage: 'ffmpeg_exit' } }),
      ev('s2', 'landing_view', 0),
      ev('s2', 'export_failed', 100, { exportId: 'exp2', props: { stage: 'ffmpeg_exit' } }),
      ev('s2', 'export_failed', 200, { exportId: 'exp3', props: { stage: 'worker_load' } }),
    ];
    const { groups } = computeFunnelByAcquisition(events);
    const g = groups[0];
    expect(g.exportFailed).toBe(3);
    expect(g.failureStages).toEqual({ ffmpeg_exit: 2, worker_load: 1 });
  });

  it('separates two different acquisition sources into two groups', () => {
    const other = { source: 'synthetic-twitter', medium: 'dm', campaign: null, landingPath: '/' };
    const events = [
      ev('s1', 'landing_view', 0),
      { ...ev('s2', 'landing_view', 0), acquisition: other },
    ];
    const { groups } = computeFunnelByAcquisition(events);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.qualifiedVisitors)).toEqual([1, 1]);
  });
});

describe('computePaymentTotals — cannot be broken out by acquisition (documented limitation)', () => {
  it('counts distinct uids with an initial payment_succeeded, ignoring renewals and events with no uid', () => {
    const events = [
      { name: 'payment_succeeded', timestamp: '2026-09-01T00:00:00.000Z', uid: 'synthetic-uid-1', props: { context: 'initial' } },
      { name: 'payment_succeeded', timestamp: '2026-10-01T00:00:00.000Z', uid: 'synthetic-uid-1', props: { context: 'renewal' } },
      { name: 'payment_succeeded', timestamp: '2026-09-02T00:00:00.000Z', uid: 'synthetic-uid-2', props: { context: 'initial' } },
      { name: 'payment_succeeded', timestamp: '2026-09-03T00:00:00.000Z', uid: null, props: { context: 'initial' } },
    ];
    const totals = computePaymentTotals(events);
    expect(totals.verifiedPayingCustomers).toBe(2);
    expect(totals.note).toContain('cannot be broken out by source');
  });

  it('a renewal-only event for a new uid does not count as a verified paying customer', () => {
    const events = [
      { name: 'payment_succeeded', timestamp: '2026-09-01T00:00:00.000Z', uid: 'synthetic-uid-3', props: { context: 'renewal' } },
    ];
    expect(computePaymentTotals(events).verifiedPayingCustomers).toBe(0);
  });
});

describe('Search Console — CTR from summed clicks/impressions, not averaged per-row CTR', () => {
  it('produces a different (correct) number than averaging each row\'s own CTR would', () => {
    // Row A: 1 click / 1000 impressions = 0.1% CTR.
    // Row B: 100 clicks / 100 impressions = 100% CTR.
    // Averaging the two row CTRs gives (0.1% + 100%) / 2 = 50.05% — absurd.
    // Summing first gives 101 clicks / 1100 impressions = ~9.18%, the correct figure.
    const rows = [
      normalizeGscRow({ Query: 'synthetic query a', Clicks: '1', Impressions: '1000' }, 'Query'),
      normalizeGscRow({ Query: 'synthetic query b', Clicks: '100', Impressions: '100' }, 'Query'),
    ];
    const summary = summarizeGscRows(rows);
    expect(summary.totalClicks).toBe(101);
    expect(summary.totalImpressions).toBe(1100);
    expect(summary.ctr).toBeCloseTo(101 / 1100, 6);
    expect(summary.ctr).not.toBeCloseTo(0.5005, 2); // the wrong, averaged-CTR answer
  });

  it('handles GSC\'s comma-thousands and percent-sign formatting in raw CSV strings', () => {
    const row = normalizeGscRow({ Query: 'synthetic popular query', Clicks: '1,234', Impressions: '10,000', CTR: '12.3%' }, 'Query');
    expect(row.clicks).toBe(1234);
    expect(row.impressions).toBe(10000);
  });

  it('returns a null CTR (not zero, not NaN) when impressions are zero', () => {
    const summary = summarizeGscRows([{ clicks: 0, impressions: 0 }]);
    expect(summary.ctr).toBeNull();
  });

  it('splits branded vs non-branded queries by the brand term, case-insensitively', () => {
    const rows = [
      normalizeGscRow({ Query: 'synthetic Rampcut speed ramp', Clicks: '5', Impressions: '50' }, 'Query'),
      normalizeGscRow({ Query: 'synthetic slow motion editor online', Clicks: '3', Impressions: '80' }, 'Query'),
    ];
    const { branded, nonBranded } = splitBranded(rows);
    expect(branded).toHaveLength(1);
    expect(nonBranded).toHaveLength(1);
    expect(branded[0].key).toContain('Rampcut');
  });

  it('keeps per-row position for display but summarizeGscRows never produces one aggregate "position" figure', () => {
    const rows = [
      normalizeGscRow({ Query: 'synthetic a', Clicks: '1', Impressions: '10', Position: '2.1' }, 'Query'),
      normalizeGscRow({ Query: 'synthetic b', Clicks: '1', Impressions: '10', Position: '45.6' }, 'Query'),
    ];
    expect(rows[0].position).toBe('2.1');
    expect(rows[1].position).toBe('45.6');
    const summary = summarizeGscRows(rows);
    expect(summary).not.toHaveProperty('position');
    expect(summary).not.toHaveProperty('avgPosition');
  });
});
