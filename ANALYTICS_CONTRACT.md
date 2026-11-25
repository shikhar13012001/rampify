# Analytics contract (adapt to actual repository)

## Preserve existing event names
`page_view`, `landing_view`, `editor_opened`, `clip_loaded`, `curve_changed`, `export_started`, `export_render_completed`, `export_failed`, `export_cancelled`, `download_initiated`, `signup_completed`, `upgrade_viewed`, `ui_error`.

## Common properties (when available and consented)
`eventId` (unique, dedupe), `eventVersion`, `timestamp`, `anonId`, `sessionId`, `uid` (authenticated only), `isTestSession`, `environment`, `appVersion`, `route`, `source`/`acquisition` (first and last touch as separately named fields), `browserFamily`, `deviceClass`.

Never use raw email, IP, filenames, full local file paths, raw media, thumbnails, curve content that reveals private data, auth tokens, or arbitrary user-entered text. Avoid full user-agent string unless necessary and consented.

## Export lifecycle
- Generate `exportId` once per attempt; a retry gets a new attempt ID with optional `retryOfExportId`.
- `export_started`: `exportId`, `isDemoClip`, `resolution`, `tier`, bounded file size/duration buckets, enabled processing features.
- `export_render_completed`: `exportId`, `validated`, `durationMs`, `resolution`, `isDemoClip`.
- `export_failed`: `exportId`, stable `stage` (`worker_load`, `input_validation`, `processing`, `muxing`, `output_validation`, `download_preparation`, `unknown`), sanitized error code, retryable boolean.
- `export_cancelled`: `exportId`, stage, elapsedMs.
- `download_initiated`: `exportId`; distinct from saved-to-disk confirmation.
- A terminal attempt is one of completed, failed, cancelled. Handle duplicates/conflicting terminal events explicitly; report unresolved attempts separately.

## Identity and segmentation
- Keep anonymous tracking functional without signup; associate it with authenticated identity only when login occurs, using provider-recommended identify/alias behavior.
- Clear identified state on logout; do not merge separate users on shared browsers.
- Explicitly tag founder/internal/staging tests; avoid relying on a permanently false `isTestSession` flag.
- Separate demo edits from real own-clip usage and verified render from download initiation.

## Core metrics
1. Weekly successful own-clip creators = distinct non-test identities with `export_render_completed` and `validated=true` and `isDemoClip=false`.
2. Attempt success rate = completed attempts / attempts with a mature terminal outcome; report cancelled and unresolved separately.
3. Ordered session funnel = first editor open -> own clip loaded -> export started -> validated completed -> download initiated, within defined session/window.
4. Time to first validated export, p50/p90, from editor start.
5. Repeat creator = a successful own-clip exporter who completes another own-clip export on a later calendar day; specify cohort window.
6. Acquisition quality = attributed sessions -> own-clip validated creators; distinguish direct/unknown, internal cross-domain, organic search, and AI referrals.
7. Payment conversion = verified live successful payments only; never count sandbox webhook events.

## Dashboard caution
Small cohorts: show counts and denominators, not percentages alone. Nov 17 export is historical; Nov 20 signup requires fresh authorized data. Do not invent data for untracked behavior.
