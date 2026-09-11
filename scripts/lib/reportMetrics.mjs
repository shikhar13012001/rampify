/**
 * Pure calculation functions for docs/validation/WEEKLY_REPORT.md — no I/O,
 * no Firestore, no file reads. scripts/generate-weekly-report.mjs is the
 * only caller in production; test/reporting/reportMetrics.test.ts imports
 * this directly with clearly-labeled synthetic fixtures (never real data).
 *
 * Event shape assumed throughout — matches exactly what api/track-event.ts
 * and api/webhooks/dodo.ts actually write (docs/validation/METRICS.md):
 *   { eventId, name, timestamp (ISO string or epoch ms), sessionId, anonId,
 *     uid, isTestSession, exportId, appVersion, acquisition, capabilities, props }
 */

// ─── Time helpers ───────────────────────────────────────────────────────────

export function toMillis(timestamp) {
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') {
    const ms = Date.parse(timestamp);
    return Number.isNaN(ms) ? null : ms;
  }
  // Firestore Timestamp shapes an owner's export script might produce,
  // depending on how they serialized it — tolerated, not assumed.
  if (timestamp && typeof timestamp === 'object') {
    const seconds = timestamp.seconds ?? timestamp._seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return null;
}

function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ─── Qualified session / acquisition grouping ──────────────────────────────

/** isQualifiedSession's server-side-data mirror — src/lib/analytics.ts's
 *  version is the client-side source of truth; this applies the identical
 *  rule to exported event docs. */
export function isQualifiedEvent(event) {
  return event?.isTestSession !== true;
}

const UNKNOWN_SOURCE = '(direct/unknown)';
const UNKNOWN_PATH = '(unknown)';

export function groupKey(acquisition) {
  const source = acquisition?.source?.trim() || UNKNOWN_SOURCE;
  const landingPath = acquisition?.landingPath?.trim() || UNKNOWN_PATH;
  return { source, landingPath, key: `${source} | ${landingPath}` };
}

/**
 * Builds one entry per sessionId: acquisition (first event's, since
 * captureAcquisitionOnce() means every event in a session already carries
 * the same value), isQualified, uid (if any event in the session has one),
 * and events sorted by time. Events with no parseable timestamp or no
 * sessionId are dropped (counted in the returned `dropped` list) rather
 * than silently mis-sorted — see "Missing identity" in the generated report.
 */
export function buildSessionIndex(events) {
  const sessions = new Map();
  const dropped = [];

  for (const event of events) {
    if (!event?.sessionId) {
      // payment_succeeded has no sessionId by design (METRICS.md) — expected,
      // handled separately in computePaymentTotals(), not an error here.
      if (event?.name !== 'payment_succeeded') dropped.push({ event, reason: 'no sessionId' });
      continue;
    }
    const ms = toMillis(event.timestamp);
    if (ms === null) {
      dropped.push({ event, reason: 'unparseable timestamp' });
      continue;
    }
    let session = sessions.get(event.sessionId);
    if (!session) {
      session = {
        sessionId: event.sessionId,
        acquisition: event.acquisition ?? null,
        isQualified: isQualifiedEvent(event),
        uid: event.uid ?? null,
        events: [],
      };
      sessions.set(event.sessionId, session);
    }
    // A session is qualified only if EVERY event in it is non-test — a
    // session that starts real and later gets flagged test (or vice versa)
    // shouldn't happen given how isTestSession is computed, but favor the
    // stricter reading if it ever does.
    if (!isQualifiedEvent(event)) session.isQualified = false;
    if (event.uid) session.uid = event.uid;
    if (!session.acquisition && event.acquisition) session.acquisition = event.acquisition;
    session.events.push({ ...event, _ms: ms });
  }

  for (const session of sessions.values()) {
    session.events.sort((a, b) => a._ms - b._ms);
  }

  return { sessions: [...sessions.values()], dropped };
}

// ─── Activation (mirrors exportAnalytics.ts's qualifiesAsActivation) ──────

/** First qualifying activation in a session's event list, or null. Mirrors
 *  src/lib/exportAnalytics.ts's qualifiesAsActivation() exactly: an
 *  own-clip export_render_completed (validated === true) joined to a
 *  download_initiated sharing the same exportId, from the SAME session
 *  (payment_succeeded-style cross-session joins are out of scope — an
 *  activation is a single-session behavioral proxy, per METRICS.md).
 *
 *  The returned object's `_ms` is the LATER of the two events' timestamps
 *  (in practice always download_initiated's, since a download can only be
 *  triggered from an already-completed render — ExportModal.tsx's download
 *  effect fires only once `downloadUrl` is set) — that's the actual moment
 *  both required conditions became true, not just the render finishing. */
export function firstActivation(sessionEvents) {
  const downloadsByExportId = new Map();
  for (const e of sessionEvents) {
    if (e.name === 'download_initiated' && e.exportId && !downloadsByExportId.has(e.exportId)) {
      downloadsByExportId.set(e.exportId, e);
    }
  }
  for (const event of sessionEvents) {
    if (event.name !== 'export_render_completed') continue;
    if (event.props?.isDemoClip === true) continue;
    if (event.props?.validated !== true) continue; // null (inconclusive) never qualifies, same as false
    const download = event.exportId ? downloadsByExportId.get(event.exportId) : undefined;
    if (!download) continue;
    // events are pre-sorted by time, so the first render match is the
    // first activation — but its completion moment is whichever of the
    // pair happened later.
    const completedAtMs = Math.max(event._ms, download._ms);
    return { ...event, _ms: completedAtMs };
  }
  return null;
}

// ─── Per-group funnel counts ────────────────────────────────────────────────

function emptyGroup(source, landingPath, key) {
  return {
    source,
    landingPath,
    key,
    qualifiedVisitors: 0,
    editorStarts: 0,
    clipLoadedDemo: 0,
    clipLoadedOwn: 0,
    activatedSessions: 0,
    exportStarted: 0,
    exportCompleted: 0,
    exportValidated: 0,
    exportFailed: 0,
    exportCancelled: 0,
    downloadInitiated: 0,
    signups: 0,
    checkoutStarted: 0,
    timeToActivationMsSamples: [],
    failureStages: {},
  };
}

/**
 * The main per-(source, landingPath) funnel table. `events` should already
 * be filtered to a date window by the caller (generate-weekly-report.mjs) —
 * this function itself doesn't filter by date, only by isTestSession.
 * payment_succeeded is deliberately NOT included here — see
 * computePaymentTotals() and its doc comment for why.
 */
export function computeFunnelByAcquisition(events) {
  const { sessions, dropped } = buildSessionIndex(events);
  const groups = new Map();

  const getGroup = (acquisition) => {
    const { source, landingPath, key } = groupKey(acquisition);
    let g = groups.get(key);
    if (!g) {
      g = emptyGroup(source, landingPath, key);
      groups.set(key, g);
    }
    return g;
  };

  for (const session of sessions) {
    if (!session.isQualified) continue; // excluded entirely, per METRICS.md's qualified-visitor rule
    const g = getGroup(session.acquisition);
    g.qualifiedVisitors += 1;

    const sessionStartMs = session.events[0]?._ms ?? null;
    if (session.events.some((e) => e.name === 'editor_opened')) g.editorStarts += 1;

    for (const event of session.events) {
      switch (event.name) {
        case 'clip_loaded':
          if (event.props?.source === 'demo') g.clipLoadedDemo += 1;
          else g.clipLoadedOwn += 1;
          break;
        case 'export_started':
          g.exportStarted += 1;
          break;
        case 'export_render_completed':
          g.exportCompleted += 1;
          if (event.props?.validated === true) g.exportValidated += 1;
          break;
        case 'export_failed': {
          g.exportFailed += 1;
          const stage = typeof event.props?.stage === 'string' ? event.props.stage : 'unknown';
          g.failureStages[stage] = (g.failureStages[stage] ?? 0) + 1;
          break;
        }
        case 'export_cancelled':
          g.exportCancelled += 1;
          break;
        case 'download_initiated':
          g.downloadInitiated += 1;
          break;
        case 'signup_completed':
          g.signups += 1;
          break;
        case 'checkout_started':
          g.checkoutStarted += 1;
          break;
        default:
          break;
      }
    }

    const activation = firstActivation(session.events);
    if (activation) {
      g.activatedSessions += 1;
      if (sessionStartMs !== null) {
        g.timeToActivationMsSamples.push(activation._ms - sessionStartMs);
      }
    }
  }

  const result = [...groups.values()]
    .map((g) => ({
      ...g,
      medianTimeToActivationMs: median(g.timeToActivationMsSamples),
    }))
    .sort((a, b) => b.qualifiedVisitors - a.qualifiedVisitors);

  return { groups: result, droppedEventCount: dropped.length, dropped };
}

/**
 * payment_succeeded carries no sessionId/anonId/acquisition at all — a
 * documented, structural limitation (METRICS.md's "Anonymous identity &
 * deduplication" section): the Dodo webhook has no browser context, so a
 * payment can never be attributed to an acquisition source or landing page.
 * This is reported as a single total, explicitly NOT broken out by source —
 * doing so would require inventing an attribution this data cannot support.
 */
export function computePaymentTotals(events) {
  const initial = new Map(); // uid -> earliest payment_succeeded event with context:'initial'
  for (const event of events) {
    if (event.name !== 'payment_succeeded') continue;
    if (event.props?.context !== 'initial') continue;
    if (!event.uid) continue;
    const ms = toMillis(event.timestamp);
    const existing = initial.get(event.uid);
    if (!existing || (ms !== null && ms < existing._ms)) {
      initial.set(event.uid, { ...event, _ms: ms });
    }
  }
  return {
    verifiedPayingCustomers: initial.size,
    note: 'payment_succeeded has no sessionId/acquisition — cannot be broken out by source or landing page (see METRICS.md).',
  };
}

// ─── Minimal CSV parsing (GSC exports only — not a general-purpose parser) ─

/**
 * Parses a simple CSV (as exported by Google Search Console: header row +
 * data rows, comma-separated, double-quoted fields for values containing a
 * comma/quote). Returns an array of row objects keyed by header. Not a
 * general-purpose CSV library — deliberately small, per this task's
 * "smallest reusable... not a new application" instruction; if a
 * real-world export breaks this, prefer fixing this function over adding a
 * CSV dependency for one file format.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  // Normalize line endings and strip a UTF-8 BOM, which GSC's export includes.
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"' && normalized[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0] === ''));
  if (nonEmptyRows.length === 0) return [];
  const header = nonEmptyRows[0];
  return nonEmptyRows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
}

// ─── Search Console ─────────────────────────────────────────────────────────

const DEFAULT_BRAND_TERMS = ['rampify'];

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const cleaned = value.replace(/[,%]/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalizes a parsed GSC CSV row (header names vary by export type/locale —
 * see validation-data/README.md) into { key, clicks, impressions, position }.
 * `keyField` is whichever column holds the query text or page URL.
 */
export function normalizeGscRow(row, keyField) {
  const key = row[keyField] ?? row.Query ?? row.query ?? row['Top queries'] ?? row.Page ?? row.page ?? row['Top pages'] ?? '';
  return {
    key: String(key).trim(),
    clicks: toNumber(row.Clicks ?? row.clicks),
    impressions: toNumber(row.Impressions ?? row.impressions),
    // Position is kept per-row for display only — never aggregated into one
    // number that's presented as if it applies to every row (task instruction).
    position: row.Position ?? row.position ?? row['Average position'] ?? null,
  };
}

/** CTR from SUMMED clicks/impressions — never from averaging each row's own
 *  CTR (which over-weights low-impression rows). Per this task's instruction. */
export function summarizeGscRows(rows) {
  const totalClicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const totalImpressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  return {
    rowCount: rows.length,
    totalClicks,
    totalImpressions,
    ctr: totalImpressions > 0 ? totalClicks / totalImpressions : null,
  };
}

/** Splits normalized rows into branded/non-branded by substring match
 *  against `brandTerms` (default: ['rampify'], case-insensitive). Only
 *  meaningful for QUERY rows, not page rows. */
export function splitBranded(rows, brandTerms = DEFAULT_BRAND_TERMS) {
  const terms = brandTerms.map((t) => t.toLowerCase());
  const branded = [];
  const nonBranded = [];
  for (const row of rows) {
    const isBranded = terms.some((t) => row.key.toLowerCase().includes(t));
    (isBranded ? branded : nonBranded).push(row);
  }
  return { branded, nonBranded };
}
