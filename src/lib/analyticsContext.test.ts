import { describe, expect, it } from 'vitest';
import {
  SESSION_IDLE_MS,
  advanceSession,
  browserFamilyFromUserAgent,
  classifyTraffic,
  createEventGate,
  deviceClassFor,
  identityTransition,
  isTestTraffic,
  resolveInternalFlag,
  routeLabel,
} from './analyticsContext';

const base = { hostname: 'rampcut.astralbuild.dev', isDev: false, internalFlag: false, testFlag: false };

describe('classifyTraffic', () => {
  it('treats an ordinary production visitor as a customer', () => {
    expect(classifyTraffic(base)).toEqual({ environment: 'production', trafficClass: 'customer' });
  });

  it('tags the founder (persistent internal flag) and manual test sessions as founder traffic', () => {
    expect(classifyTraffic({ ...base, internalFlag: true }).trafficClass).toBe('founder');
    expect(classifyTraffic({ ...base, testFlag: true }).trafficClass).toBe('founder');
    // Still the production environment — only the segment differs.
    expect(classifyTraffic({ ...base, internalFlag: true }).environment).toBe('production');
  });

  it.each(['localhost', '127.0.0.1', '[::1]', 'my-pc.local', 'app.localhost'])('treats %s as development', (hostname) => {
    expect(classifyTraffic({ ...base, hostname })).toEqual({ environment: 'development', trafficClass: 'development' });
  });

  it('treats the dev server as development regardless of hostname or flags', () => {
    expect(classifyTraffic({ ...base, isDev: true, internalFlag: true }).trafficClass).toBe('development');
  });

  it('treats Vercel preview deployments as staging, even with the founder flag', () => {
    expect(classifyTraffic({ ...base, hostname: 'rampify-git-feature-x.vercel.app', internalFlag: true })).toEqual({
      environment: 'staging',
      trafficClass: 'staging',
    });
  });

  it('only customer traffic counts as real', () => {
    expect(isTestTraffic('customer')).toBe(false);
    expect(isTestTraffic('founder')).toBe(true);
    expect(isTestTraffic('development')).toBe(true);
    expect(isTestTraffic('staging')).toBe(true);
  });
});

describe('resolveInternalFlag', () => {
  it('?rampcut_internal=1 sets, =0 clears, otherwise keeps the stored value', () => {
    expect(resolveInternalFlag('1', false)).toBe(true);
    expect(resolveInternalFlag('0', true)).toBe(false);
    expect(resolveInternalFlag(null, true)).toBe(true);
    expect(resolveInternalFlag('banana', false)).toBe(false);
  });
});

describe('coarse client labels', () => {
  it('derives browser family only (never version) and ranks Edge/Opera before Chrome', () => {
    expect(browserFamilyFromUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36')).toBe('chrome');
    expect(browserFamilyFromUserAgent('Mozilla/5.0 Chrome/126.0 Safari/537.36 Edg/126.0')).toBe('edge');
    expect(browserFamilyFromUserAgent('Mozilla/5.0 Chrome/126.0 Safari/537.36 OPR/110.0')).toBe('opera');
    expect(browserFamilyFromUserAgent('Mozilla/5.0 Gecko/20100101 Firefox/127.0')).toBe('firefox');
    expect(browserFamilyFromUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/605 Version/17.4 Safari/605')).toBe('safari');
    expect(browserFamilyFromUserAgent(undefined)).toBe('other');
    expect(browserFamilyFromUserAgent('curl/8.0')).toBe('other');
  });

  it('classifies device by viewport, falling back to the UA', () => {
    expect(deviceClassFor(390, undefined)).toBe('mobile');
    expect(deviceClassFor(900, undefined)).toBe('tablet');
    expect(deviceClassFor(1440, undefined)).toBe('desktop');
    expect(deviceClassFor(undefined, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148')).toBe('mobile');
    expect(deviceClassFor(undefined, undefined)).toBe('desktop');
  });

  it('keeps only a bounded pathname for the route — no query, hash or odd characters', () => {
    expect(routeLabel('/editor?curve=secret#frag')).toBe('/editor');
    expect(routeLabel('/features/speed ramp/<b>')).toBe('/features/speedramp/b');
    expect(routeLabel('/' + 'a'.repeat(300))).toHaveLength(120);
    expect(routeLabel('')).toBeNull();
    expect(routeLabel(undefined)).toBeNull();
  });
});

describe('advanceSession', () => {
  const ids = () => {
    let n = 0;
    return () => `session-${++n}`;
  };

  it('starts a new session when nothing is stored', () => {
    const { record, isNew } = advanceSession(null, 1000, ids());
    expect(isNew).toBe(true);
    expect(record).toEqual({ id: 'session-1', startedAt: 1000, lastSeen: 1000 });
  });

  it('keeps the same session while activity continues, and extends lastSeen', () => {
    const first = advanceSession(null, 1000, ids()).record;
    const second = advanceSession(JSON.stringify(first), 1000 + SESSION_IDLE_MS - 1, ids());
    expect(second.isNew).toBe(false);
    expect(second.record.id).toBe('session-1');
    expect(second.record.startedAt).toBe(1000);
    expect(second.record.lastSeen).toBe(1000 + SESSION_IDLE_MS - 1);
  });

  it('rotates after the idle timeout so an overnight tab is not one session forever', () => {
    const first = advanceSession(null, 1000, ids()).record;
    const later = advanceSession(JSON.stringify(first), 1000 + SESSION_IDLE_MS + 1, ids());
    expect(later.isNew).toBe(true);
    expect(later.record.id).toBe('session-1'); // fresh id generator in this call
    expect(later.record.startedAt).toBe(1000 + SESSION_IDLE_MS + 1);
  });

  it('adopts a legacy bare-UUID session instead of splitting it on upgrade', () => {
    const legacy = '123e4567-e89b-12d3-a456-426614174000';
    const { record, isNew } = advanceSession(legacy, 5000, ids());
    expect(isNew).toBe(false);
    expect(record.id).toBe(legacy);
  });

  it('recovers from corrupt stored values with a new session', () => {
    expect(advanceSession('{not json', 1000, ids()).isNew).toBe(true);
    expect(advanceSession(JSON.stringify({ id: 5 }), 1000, ids()).isNew).toBe(true);
    expect(advanceSession('"just a string"', 1000, ids()).isNew).toBe(true);
  });

  it('does not rotate when the clock moves backwards', () => {
    const first = advanceSession(null, 10_000, ids()).record;
    const { record, isNew } = advanceSession(JSON.stringify(first), 4000, ids());
    expect(isNew).toBe(false);
    expect(record.lastSeen).toBe(10_000);
  });
});

describe('createEventGate (duplicate suppression)', () => {
  it('suppresses an identical event inside its window and allows it afterwards', () => {
    let t = 0;
    const gate = createEventGate(() => t);
    expect(gate.allow('page_view', '/pricing', 's1')).toBe(true);
    t = 1000;
    expect(gate.allow('page_view', '/pricing', 's1')).toBe(false); // StrictMode double-fire
    t = 1600;
    expect(gate.allow('page_view', '/pricing', 's1')).toBe(true);
  });

  it('treats different keys (paths) and different sessions independently', () => {
    const gate = createEventGate(() => 0);
    expect(gate.allow('page_view', '/a', 's1')).toBe(true);
    expect(gate.allow('page_view', '/b', 's1')).toBe(true);
    expect(gate.allow('page_view', '/a', 's2')).toBe(true);
  });

  it('allows landing_view once per session only', () => {
    let t = 0;
    const gate = createEventGate(() => t);
    expect(gate.allow('landing_view', '', 's1')).toBe(true);
    t = 10 * 60_000;
    expect(gate.allow('landing_view', '', 's1')).toBe(false);
    expect(gate.allow('landing_view', '', 's2')).toBe(true);
  });

  it('never gates export lifecycle events — their guarantees live in exportAttempt', () => {
    const gate = createEventGate(() => 0);
    for (const name of ['export_started', 'export_render_completed', 'export_failed', 'export_cancelled', 'download_initiated']) {
      expect(gate.allow(name, 'exp-1', 's1')).toBe(true);
      expect(gate.allow(name, 'exp-1', 's1')).toBe(true);
    }
  });

  it('stays bounded in memory', () => {
    const gate = createEventGate(() => 0, 5);
    for (let i = 0; i < 100; i++) gate.allow('page_view', `/p${i}`, 's1');
    // The oldest keys were evicted, so the first path is allowed again.
    expect(gate.allow('page_view', '/p0', 's1')).toBe(true);
  });
});

describe('identityTransition', () => {
  it('does nothing for the first signed-out observation (an ordinary visitor)', () => {
    expect(identityTransition(undefined, null)).toEqual({ kind: 'none' });
    expect(identityTransition(null, null)).toEqual({ kind: 'none' });
  });

  it('links the anonymous identity when a user is first seen', () => {
    expect(identityTransition(undefined, 'u1')).toEqual({ kind: 'link', uid: 'u1' });
    expect(identityTransition(null, 'u1')).toEqual({ kind: 'link', uid: 'u1' });
  });

  it('is idempotent for repeated auth callbacks with the same user', () => {
    expect(identityTransition('u1', 'u1')).toEqual({ kind: 'none' });
  });

  it('rotates on sign-out so the next visitor on a shared browser is not merged', () => {
    expect(identityTransition('u1', null)).toEqual({ kind: 'rotate', thenLink: null });
  });

  it('rotates and re-links when the account switches directly', () => {
    expect(identityTransition('u1', 'u2')).toEqual({ kind: 'rotate', thenLink: 'u2' });
  });
});
