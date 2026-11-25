#!/usr/bin/env node
/**
 * Read-only health summary of an analytics export: export-attempt outcomes and
 * identity coverage. Answers, after a deploy: "Does every attempt now end in
 * exactly one terminal event?" and "Are signed-in users' events carrying a
 * verified uid?"
 *
 * Usage:  node scripts/report-export-health.mjs <events.json> [--since=ISO]
 *   <events.json> - the file produced by scripts/export-analytics-events.mjs
 *                   (an array of analytics_events documents). It contains
 *                   pseudonymous identifiers: keep it under validation-data/
 *                   (git-ignored) and never commit it.
 *
 * Makes no network calls and writes nothing.
 */
import { readFileSync } from 'node:fs';
import { computeExportAttemptOutcomes, computeIdentityCoverage, toMillis } from './lib/reportMetrics.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: node scripts/report-export-health.mjs <events.json> [--since=ISO]');
  process.exit(2);
}
const sinceArg = args.find((a) => a.startsWith('--since='))?.slice('--since='.length);
const since = sinceArg ? Date.parse(sinceArg) : null;
if (sinceArg && Number.isNaN(since)) {
  console.error(`Invalid --since value: ${sinceArg}`);
  process.exit(2);
}

let events;
try {
  events = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`Could not read ${file}: ${error instanceof Error ? error.message : error}`);
  process.exit(2);
}
if (!Array.isArray(events)) {
  console.error('Expected a JSON array of analytics events.');
  process.exit(2);
}
if (since !== null) events = events.filter((e) => (toMillis(e.timestamp) ?? 0) >= since);

const outcomes = computeExportAttemptOutcomes(events);
const identity = computeIdentityCoverage(events);

console.log(`Events analysed: ${events.length}${since !== null ? ` (since ${sinceArg})` : ''}  [test/founder/dev traffic excluded]\n`);
console.log('Export attempts (grouped by exportId)');
console.log(`  attempts started        ${outcomes.attempts}`);
console.log(`  completed               ${outcomes.completed}`);
console.log(`  failed                  ${outcomes.failed}`);
console.log(`  cancelled               ${outcomes.cancelled}  (of which abandoned: ${outcomes.cancelledAbandoned})`);
console.log(`  in flight (<30 min)     ${outcomes.inFlight}`);
console.log(`  UNRESOLVED (no outcome) ${outcomes.unresolved}   <- should trend to ~0 after the Phase 1 client ships`);
console.log(`  CONFLICTING outcomes    ${outcomes.conflicting}   <- should be 0`);
console.log(`  terminal w/o start      ${outcomes.terminalWithoutStart}`);
console.log(`  retries                 ${outcomes.retries}`);
const { completed, denominator } = outcomes.completedOfTerminal;
console.log(`  completed / terminal    ${completed} / ${denominator}${denominator ? `  (${Math.round((completed / denominator) * 100)}%)` : ''}`);
const causes = Object.entries(outcomes.failuresByCause).sort((a, b) => b[1] - a[1]);
if (causes.length) {
  console.log('\nFailures by stage/code');
  for (const [cause, n] of causes) console.log(`  ${String(n).padStart(4)}  ${cause}`);
}

console.log('\nIdentity coverage');
console.log(`  verified uid            ${identity.verified}`);
console.log(`  anonymous               ${identity.anonymous}`);
console.log(`  token rejected          ${identity.token_invalid}   <- signed-in clients the server could not verify; should be ~0`);
console.log(`  legacy (pre-fix) events ${identity.legacy}  (uid present on ${identity.legacyEventsWithUid})`);
console.log(`  anon ids seen / linked  ${identity.anonIdsSeen} / ${identity.anonIdsLinkedToUid}`);
