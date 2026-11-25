# Acceptance test matrix

## Functional video
- [ ] Supported short MP4 clip: load, preview, edit curve, export, validate decodable result.
- [ ] Demo clip flow and own-clip flow are distinguishable.
- [ ] Unsupported codec/container fails early with clear explanation.
- [ ] Repeated export succeeds without stale worker/memory state.
- [ ] Slow network/worker asset unavailable yields actionable failure and retry.
- [ ] Cancel during processing stops work, preserves edit and records cancellation.
- [ ] Failed export retry preserves curve and creates distinct export attempt ID.
- [ ] Exported output resolution, duration, orientation and audio match supported expectations.
- [ ] Login/logout during editing does not lose work or misattribute future events.
- [ ] Browser/device matrix reflects only verified support; no false compatibility claims.

## Analytics
- [ ] All event payloads pass allowlist and contain no raw footage, frames, filenames, secrets, emails, or local paths.
- [ ] Anonymous event -> sign-in -> authenticated event links correctly; logout resets identity.
- [ ] Staging/founder traffic excluded from production growth reports.
- [ ] Exactly one export attempt ID per attempt, same ID across lifecycle; retries distinct.
- [ ] Failure stage is actionable; unknown stage is fallback, not default.
- [ ] Duplicate download clicks do not count as additional successful creators.
- [ ] Analytics network outage does not block editor/export.

## Security and payments
- [ ] User A cannot access/modify user B's protected Firestore data.
- [ ] Client cannot grant itself Pro or bypass quotas.
- [ ] Webhook signatures, idempotency, out-of-order events and cancellation tested in sandbox.
- [ ] Test and live Dodo Payments credentials/data strictly separated; no unapproved live activation.
- [ ] No credential or Firestore dump committed.

## SEO, UX and operations
- [ ] Correct canonical URL and product brand (owner-approved), title/description, robots and sitemap.
- [ ] Public pages readable without running the editor; not-found routes return appropriate status.
- [ ] Supported input/output/browser limitations visible before users invest time.
- [ ] Keyboard access, labels, focus states and error text tested for core journey.
- [ ] CI runs typecheck/lint/tests; release rollback documented.
- [ ] Monitoring links errors to app release, export stage and sanitized exportId.
- [ ] Five observed external user sessions are recorded as qualitative findings (with consent).

## Evidence required
For each checked item, record exact command/test, observed result, browser/environment, and relevant changed files. Mark blocked items explicitly; do not fabricate passes.
