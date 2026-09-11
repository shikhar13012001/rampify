# validation-data/ — owner-provided exports (gitignored)

This directory holds raw analytics and Search Console exports for
`scripts/generate-weekly-report.mjs`. **Everything in here except this
README is gitignored (`.gitignore`'s `validation-data/*` rule) — never
commit real analytics or research data.** This README is the one tracked
exception, so the expected format stays documented in the repo without any
real data ever landing in git.

## Expected files (all optional — the report says so honestly if missing)

### `analytics-events.json`

Produced by:
```
node --env-file=.env.local scripts/export-analytics-events.mjs --since YYYY-MM-DD --until YYYY-MM-DD
```

A plain JSON array of Firestore `analytics_events` documents, matching the
event catalog in `docs/validation/METRICS.md`. Each object:

```json
{
  "eventId": "...",
  "name": "clip_loaded",
  "timestamp": "2026-09-01T12:00:00.000Z",
  "sessionId": "...",
  "anonId": "...",
  "uid": null,
  "isTestSession": false,
  "exportId": null,
  "appVersion": "0.0.0",
  "acquisition": { "source": "google.com", "medium": null, "campaign": null, "landingPath": "/" },
  "capabilities": { "supported": true, "missing": [] },
  "props": { "source": "own", "durationSec": 6.0 }
}
```

`timestamp` may be an ISO string (what the export script above produces) or
a Firestore-Timestamp-like `{ seconds, nanoseconds }` / `{ _seconds }` shape
(what some other export tools produce) — `scripts/lib/reportMetrics.mjs`'s
`toMillis()` tolerates both.

### `search-console-queries.csv`, `search-console-pages.csv`, `search-console-totals.csv`

Manually exported from the Search Console UI's Performance report (export
the Queries tab, the Pages tab, and — optionally — the unfiltered
date-only view, each as CSV, for the **same complete date window** you
pass to `generate-weekly-report.mjs`'s `--since`/`--until`). Column header
names vary slightly by Search Console's current UI and locale —
`normalizeGscRow()` in `scripts/lib/reportMetrics.mjs` tolerates a few
known variants (`Query`/`query`/`Top queries`, `Page`/`page`/`Top pages`,
`Clicks`, `Impressions`, `Position`/`Average position`). If a real export
uses a header this doesn't recognize, fix `normalizeGscRow()` rather than
hand-editing the CSV.

**Known limitations of this data, already accounted for in the generated
report — do not try to "fix" these by editing the export**:
- Capped at up to 1,000 rows by Google's own UI export; some very-low-volume
  queries are omitted entirely regardless of the cap. The row count shown
  in the export is a lower bound, not every query that got an impression.
- Don't assume the Queries or Pages tab's summed totals equal the property
  totals — they measure different things and the row cap/omission above
  means they're not required to match.
- Search Console data typically lags 1-3 days — don't treat a window
  ending in the last few days as final.

### `experiment-log.csv`

Optional. A CSV export of `docs/validation/LAUNCH.md` §6's weekly
experiment log (Date, Audience, Message, Offer, Source/Channel, Hypothesis,
Spend, Result columns). If present, its Spend/Result columns are folded
into the generated report's "Cash spend and founder effort" section. If
absent, that section says "not supplied," not "$0" — no spend data
existing is different from confirmed zero spend.

## Regenerating the report

```
node --env-file=.env.local scripts/export-analytics-events.mjs --since 2026-09-01 --until 2026-09-08
# (manually export and drop in the Search Console CSVs for the same window, if wanted)
node scripts/generate-weekly-report.mjs --since 2026-09-01 --until 2026-09-08
```

Writes `docs/validation/WEEKLY_REPORT.md`. Re-run whenever you want a fresh
window — the report is regenerated, not hand-maintained.
