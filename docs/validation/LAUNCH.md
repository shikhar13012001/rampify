# Rampify — Focused Distribution Kit

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md` / `RESEARCH.md`. A small
> kit of drafts and templates, not a marketing application — nothing in
> here has been sent, posted, or purchased. Every product claim below is
> checked against this repo's own verified behavior (cited inline); no
> endorsement, testimonial, or result is invented anywhere in this document,
> consistent with `WORKING_AGREEMENT.md` §6.

## Before using any of this — one live blocker

`docs/validation/BILLING.md` found that the Dodo **annual** Pro product is
currently misconfigured to bill $96 every *month*, not every *year* — a
12× overcharge if a real customer selected it. **Do not mention or
emphasize annual pricing in any outreach, post, or ad copy below until that
provider-side fix is confirmed** (re-run
`node --env-file=.env.local scripts/verify-dodo-products.mjs`). Every draft
in this kit below sticks to "free to start" / the $12/month price or avoids
pricing specifics entirely for exactly this reason.

## Initial audience

Desktop-based short-form creators editing action, travel, or reveal clips
who need a quick speed-ramping workflow. Chosen because it's the workflow
this repo actually has a finished, reproducible example for
(`docs/validation/SPEED_RAMP_EXAMPLE.md` — the "Hero Moment" curve on
`/features/speed-ramp`) — not because of any researched audience data
(none exists yet; see `RESEARCH.md`).

## What's verified vs. what isn't, going into this

**Verified, safe to claim** (cited): footage is processed locally in the
browser via ffmpeg.wasm in a Web Worker, never uploaded
(`CLAUDE.md`'s architecture section; `src/lib/ffmpegBridge.ts` +
`src/workers/ffmpegWorker.ts`); the "Hero Moment" preset is a real 6-point
curve in `src/lib/presets.ts`; the demo clip is real and playable at
`/features/speed-ramp` and via "Try a demo clip" on the homepage
(`public/demo/sample-clip.mp4`, procedurally generated, not stock footage);
Free plan is 3 exports/month, sign-in required, 1080p, Balanced motion
blur — Pro is $12/month, unlimited exports, 4K, AI frame interpolation,
beat sync (`src/lib/planConfig.ts`).

**Not verified — do not imply otherwise**: no usability session has been
run (`RESEARCH.md`), so there is no evidence yet about how easily a new
user actually completes the workflow, no customer testimonial exists, and
no measured "faster than X" or "N creators use this" claim can be made.
Nothing below claims any of that.

---

## 1. Three demonstration scripts

Each is a script/shot list for the **owner to record themselves**, using
the real app — not a description of a recording that already exists. All
three use the same real asset (the "Hero Moment" example clip and curve)
so they're consistent with each other and with `/features/speed-ramp`.

### 1a. Before/after result (~20-25s)

> **[0:00-0:03]** Cold open on the raw clip playing at normal speed — no
> narration yet, just let the motion read.
> **[0:03-0:05]** Text overlay: "One clip. One curve." Cut to the Rampify
> editor, clip already loaded.
> **[0:05-0:15]** Screen-record drawing/applying the Hero Moment curve
> (or clicking the preset — both are real, verified UI paths). Let the
> preview scrub across the ramp — slow start, punch to 2.5×, settle back
> down — so the viewer sees the curve shape and the result at the same time.
> **[0:15-0:22]** Cut to the exported result playing full-speed, same clip.
> **[0:22-0:25]** Text overlay: "Free to start. Runs in your browser —
> nothing uploaded." End card with the Rampify wordmark and the tracked
> URL from Section 5 below.
>
> **Recording note**: use the real demo clip
> (`public/demo/sample-clip.mp4`) or the creator's own footage — either
> way, the export shown on screen must be a real export from the live app,
> not a mockup. This is the one asset `docs/validation/HOMEPAGE.md`
> flagged as still missing (a genuine before/after produced by the real
> pipeline) — recording this script *is* how that gap gets closed.

### 1b. How the curve creates the effect (~30-35s)

> **[0:00-0:05]** Open on the empty curve panel. Narration: "Speed ramping
> is just this — a line."
> **[0:05-0:10]** Point out the six real control points of the Hero Moment
> curve as it's applied: "Starts slow — 0.3×. Eases up to normal. Then a
> punch — two and a half times speed, right past the middle. Then it
> settles back down to 0.4× at the end."
> **[0:10-0:25]** Drag one point live to show the curve is editable, not
> fixed — re-apply the preset to reset. Show the preview updating in real
> time as the curve changes (real, verified behavior — `CurveEditor.tsx`
> updates the preview on every curve edit).
> **[0:25-0:32]** "Eight presets to start from, or draw your own." Quick
> cut through 2-3 other real preset names (Bullet Time, Whip Pan, Montage —
> `src/lib/presets.ts`) applied to the same clip.
> **[0:32-0:35]** End card, tracked URL.
>
> **Accuracy note**: don't claim the live preview and the exported file are
> pixel-identical for bezier-type curves like Hero Moment — they aren't
> quite (`docs/validation/RESULTS.md` documents a real, small preview/export
> difference for bezier curves). Nothing in this script claims otherwise;
> it only shows the preview, consistent with what a viewer would actually
> see if they tried it themselves.

### 1c. The local, no-upload workflow (~15-20s)

> **[0:00-0:04]** Screen-record opening devtools Network tab (or just state
> it — devtools is optional, more convincing if shown). Narration: "Most
> online editors upload your clip to a server first."
> **[0:04-0:12]** Drop a clip into Rampify, watch the Network tab — no
> upload request fires for the video file (verified: the export pipeline
> runs in a Web Worker, `ffmpegBridge.ts`; the only network calls this app
> makes are for auth/billing, not video data). Export it. Still nothing
> uploaded.
> **[0:12-0:18]** "It runs on WebAssembly, in your browser. Your footage
> never leaves your machine." End card, tracked URL.
>
> **Accuracy note**: don't claim "100% private" or "no data collected" in
> absolute terms — this app does send analytics events (non-video, see
> `docs/validation/METRICS.md`) and auth/billing calls. The claim that's
> actually true and verifiable is narrower and stronger for this purpose:
> the video file itself never leaves the browser. Say that, not more.

---

## 2. Two community-post drafts (useful without clicking through)

Both give a real, usable technique — the link is a bonus, not the point.
Both disclose founder involvement explicitly, per this task's instruction.
**Not posted by this task** — drafts only.

### 2a. "Three speed-curve shapes, and when to use each one"

> If you're speed-ramping action or reveal clips and it's not landing, it's
> usually the curve *shape*, not the footage. Three that consistently work:
>
> **The punch** — slow (0.3-0.5×) into normal into a short fast burst
> (2-2.5×) right past the midpoint, then settle back to slow. Good for a
> single hero moment — a jump, a reveal, a hit landing. This is the
> highest-drama shape and the easiest to overuse; one punch per clip, not
> three.
>
> **The freeze-punch** — fast in, a near-total freeze (0.1× or so) right at
> the moment of contact, hold briefly, ease back to normal. Good for
> impacts specifically — better than the punch shape when the "moment"
> is a single frame, not a motion.
>
> **The snap-whip** — near-instant jump to very high speed (8-10×) and back,
> as a transition rather than an effect on the shot itself. Good between
> two clips, not within one.
>
> Curve shape matters more than which tool draws it, but for what it's
> worth: I built a free browser-based one (Rampify) because I wanted to draw
> these as literal curves instead of stacking keyframes — disclosure, I'm
> the founder, so take the recommendation with that in mind. [link]
>
> Curious what curve shapes have worked for your own edits — anyone found
> one that reads well for travel/vlog pacing specifically? That's the one
> case I haven't nailed down yet.

### 2b. "Why your slow-motion looks stuttery (and when it's not fixable by 'just add interpolation')"

> Quick technical note for anyone hitting this: if you slow a clip down and
> it looks stuttery, it's almost always frame math, not your footage.
> Slowing a 30fps clip to 0.3× stretches every original frame across ~3.3×
> as much playback time — no new frames get created, so fast motion reads
> as held/duplicated frames, not smooth motion.
>
> AI frame interpolation (RIFE and similar) fixes this by generating real
> in-between frames instead of holding existing ones — but it's not free
> computationally, and quality depends on your GPU. On an integrated GPU it
> commonly falls back to a much slower CPU path.
>
> The more reliable fix, when you have the choice: shoot at a higher frame
> rate *before* you know you'll slow it down. Interpolation is the
> fallback for footage you already have, not a substitute for more source
> frames.
>
> (Disclosure: I'm the founder of a browser-based speed-ramp editor,
> Rampify, that has both paths — wrote this up because it's the single
> most common question I expect to get, not to pitch it. [link] if you want
> to see the frame-rate math laid out with a real clip.)

---

## 3. Personalized outreach template — tutorial creators

For creators who make video-editing tutorials relevant to this audience
(desktop editing, action/travel/reveal content). **Template only — not
sent.** Bracketed fields must be filled in per-recipient; do not send a
templated message that reads as mass-blasted.

> Subject: Quick question about your [specific video title] video
>
> Hi [Name],
>
> I watched your video on [specific technique/topic from their actual
> content — reference something real, not generic] — [one genuine,
> specific observation about it, not flattery].
>
> I'm [Your name], founder of Rampify — a browser-based speed-ramp editor
> (disclosure: I built it, this isn't a neutral recommendation). It does
> [the one specific thing relevant to their content — e.g. "curve-based
> speed ramping with a live preview" — only claim what's actually true;
> see the Verified section above].
>
> Reaching out because [specific reason tied to their content — e.g. "your
> [video] covers manual speed keyframing in [other tool] and I think the
> curve-first approach might be a useful contrast for your audience," not
> "you have a big audience"].
>
> No ask attached to this — if it's useful for a video, comparison, or
> just your own workflow, happy to set you up with a Pro account to try it
> properly (real offer, not a promotional gift card or payment — just
> product access). If not, no worries at all, and thanks for the [specific
> video] regardless.
>
> [Your name]
> [Contact info]
>
> P.S. — if you'd rather just watch someone else use it cold and tell me
> where they get stuck than review it yourself, I'm also running short,
> unpaid usability sessions right now (see the invite template below) —
> happy to send that instead if it's a better fit.

**Sending guidance**: personalize every bracketed field for real —
a template that reads as a template gets ignored or reported. Send to
creators whose content genuinely overlaps this workflow, not by audience
size. Track responses manually (this kit doesn't include a CRM); log
outcomes in Section 6's experiment log.

---

## 4. Invitation to an observed usability session

Reuses `RESEARCH.md`'s Section 1 task verbatim — the point of an observed
session is comparing what real people do against a fixed script, so the
invite and the task must not drift from what's already defined there.

> Subject: 15 minutes, unpaid, to try a video tool and tell me what's confusing
>
> Hi [Name],
>
> I'm building Rampify, a browser video-speed-ramping tool (disclosure: I'm
> the founder). I'd like to watch someone who edits [action/travel/reveal]
> clips try it cold, with no explanation from me first — the goal is
> finding what's confusing, not a demo or a sales pitch.
>
> If you're up for it: about 15 minutes, screen-share, think-aloud. The
> task would be exactly this —
>
> > "You have a short video clip. Using Rampify, make part of it play in
> > slow motion so it feels more dramatic, then export the result so you
> > have a file you could share. Talk out loud as you go — what you're
> > looking at, what you expect to happen, anything that confuses you."
>
> I won't help or explain unless you're fully stuck — that's the point.
> I'll record the screen+audio with your explicit consent (separate from
> anything about how the product itself handles your data — this is just
> for me to review the session afterward), and nothing you say gets
> attributed to you publicly without asking first.
>
> No payment for this round — happy to send a Pro account/credit as a
> thank-you if that's useful to you regardless of what you find.
>
> [Your name]

**Logistics**: use `RESEARCH.md`'s Section 2 (recruit/consent/environment
guidance) and Section 3 (observation log) for every session booked from
this invite — don't improvise a different format per session.

---

## 5. Campaign naming convention and tracked landing URLs

Built on the acquisition-tracking that already exists —
`src/lib/analytics.ts`'s `captureAcquisitionOnce()` reads
`utm_source`/`utm_medium`/`utm_campaign` from the query string on first
touch and attaches it to every event for that session
(`docs/validation/METRICS.md`). Nothing new needed to make these trackable
— just use real UTM parameters and the numbers already show up in
`analytics_events` / `scripts/inspect-journey.mjs`.

### Naming convention

```
utm_campaign = {channel}-{audience}-{yyyymm}-{variant}
```

- `channel`: where it's posted (`community`, `dm`, `usability-invite`, `demo-video`)
- `audience`: short label (`editors`, `traveledit`, `actionedit`)
- `yyyymm`: e.g. `202609`
- `variant`: a short label for A/B tracking (`curvedemo`, `nouload`, `beforeafter`)

Example full campaign name: `community-editors-202609-curvedemo`

### UTM parameters per kit item

| Item | utm_source | utm_medium | utm_campaign example |
|---|---|---|---|
| §1 demo videos | the platform it's posted to (`youtube`, `tiktok`) | `demo-video` | `demo-video-actionedit-202609-beforeafter` |
| §2a/2b community posts | the community (`videoediting-community`, `newtubers-community` — see §7 for exact source labels once verified) | `community-post` | `community-editors-202609-curveshapes` |
| §3 outreach | `creator-outreach` | `dm` | `dm-tutorialcreators-202609-partnership` |
| §4 usability invite | `usability-recruit` | `usability-invite` | `usability-invite-editors-202609-round1` |

### Tracked landing URLs (real, existing routes)

```
https://rampify-eight.vercel.app/?utm_source=<channel>&utm_medium=<medium>&utm_campaign=<campaign>
https://rampify-eight.vercel.app/features/speed-ramp?utm_source=<channel>&utm_medium=<medium>&utm_campaign=<campaign>
```

Prefer `/features/speed-ramp` for anything tied to §1b/§1c or §2's curve/
no-upload content specifically (it's the page built around exactly that
example — `docs/validation/SPEED_RAMP_EXAMPLE.md`); use `/` for anything
more general. Don't invent a third landing page for this kit — reuse what
exists, per this task's "small kit, not a new marketing application"
instruction.

---

## 6. Weekly experiment log

Copy one row per experiment run. "Result" must cite a real, existing
metric — `clip_loaded` (with `source`), `checkout_started`,
`payment_succeeded`, or a qualified-session count from
`docs/validation/METRICS.md` — not a vanity number (views, likes) unless
explicitly logged as context, not as the result.

| Week / Date | Audience | Message (§ ref) | Offer | Source / Channel | Hypothesis | Spend | Result |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

**Column notes**:
- **Message**: reference the section this kit drafted it from (e.g. "§2a
  curve shapes post"), so results trace back to an actual artifact, not a
  memory of what was said.
- **Offer**: what was actually offered (nothing / free Pro account / usability
  session invite) — keep this explicit since §0's pricing caution applies
  here too: no experiment should offer or emphasize annual billing until
  BILLING.md's fix is confirmed.
- **Hypothesis**: written *before* running the experiment, not fitted to
  the result afterward — same discipline `RESEARCH.md` asks for.
- **Spend**: $0 for everything in this kit as drafted (no placements
  purchased, per this task's constraints) — only fill in a nonzero number
  if the owner separately decides to run paid placement, which is outside
  what this kit authorizes.
- **Result**: the real metric plus its qualification status (e.g. "3
  qualified sessions, 1 clip_loaded source=own, 0 checkout_started" — not
  "went well").

---

## 7. Communities — verified where possible, otherwise flagged for the owner

Browsing was available this task; used it. Results below are honest about
what actually got verified vs. what didn't — several attempts were
blocked or inconclusive, and those are labeled as such rather than filled
in with unverified third-party summaries.

### Verified via direct fetch of the platform's own guidelines

- **Product Hunt** — fetched `producthunt.com/launch/how-product-hunt-works`
  directly. Real rules confirmed: no paying for upvotes/traffic (permanent
  ban risk), personal accounts only (no brand/company accounts — "we don't
  allow company or brand accounts to post products or comment"), ask
  people to visit/comment/try, not to upvote. A real, working, triable
  product without signup barriers is the stated fit — Rampify's *preview*
  path (load a clip, draw a curve) needs no signup, though export
  currently does; word any Product Hunt copy around the no-signup-to-try
  part specifically, not "no signup at all."
  Source: [producthunt.com/launch/how-product-hunt-works](https://www.producthunt.com/launch/how-product-hunt-works)

- **Hacker News — "Show HN"** — fetched `news.ycombinator.com/showhn.html`
  directly. Real rules confirmed: must be something people can actively
  try/use (not a blog post or signup page), no asking friends to upvote/
  comment, maker must be personally involved and available to answer
  questions in the thread, early/unpolished work is acceptable. Fits
  Rampify's actual state reasonably well (a real, workable tool, built and
  maintained by one identifiable founder) — but Show HN's audience skews
  developer/technical, not specifically short-form video creators, so
  treat this as a secondary channel (dev-tool-curious audience, not the
  primary target audience) rather than a core fit for THIS task's stated
  audience.
  Source: [news.ycombinator.com/showhn.html](https://news.ycombinator.com/showhn.html)

### Attempted, blocked or inconclusive — investigate directly before posting

- **Reddit (r/VideoEditing, r/editors, r/NewTubers, r/travel, and any
  other relevant subreddit)** — the natural fit for this audience (desktop
  editors, travel/action creators), but **could not be verified**: direct
  fetches to `reddit.com` and `old.reddit.com` rules pages were blocked
  outright by this session's fetch tool (not a rules judgment — the fetch
  itself failed). A web search surfaced only third-party SEO summary
  sites, not Reddit's own current rules, so nothing from that search is
  cited here as fact. **Before posting anything to any subreddit**: open
  the subreddit itself, read the sidebar/About → Rules page directly (a
  logged-in browser, not this tool, can reach it), and check specifically
  for a self-promotion policy, a required post flair, and any rule against
  linking your own product. Subreddit rules vary widely and change without
  notice — do not reuse a rule set from one subreddit for another, and do
  not assume the general "10% self-promotion" convention applies without
  checking the specific subreddit.

- **Indie Hackers** — a natural fit (build-in-public audience), but the
  platform's own posting-guidelines page wasn't reachable with a usable
  result via this session's tools; a web search surfaced third-party
  claims about an "r/indiehackers" self-promotion cadence (one post per
  product, feedback-framed) that could not be confirmed against a
  first-party source and are **not** presented here as verified — that
  search result conflates the indiehackers.com platform with a
  same-named subreddit, which may not be the same ruleset. Investigate
  indiehackers.com's own current group-posting guidelines directly (the
  platform has a real "Group Posting Guidelines" feature per the search
  results, meaning the actual rules are set per-group and viewable when
  composing a post there) before posting.

- **Discord servers for video editors/creators** — plausible fit, not
  investigated at all: Discord servers generally require joining to see
  rules, which this task's tools can't do and which this task's own
  constraints ("do not create accounts") wouldn't permit anyway.
  Own-investigation-only, no shortcut available.

- **Facebook Groups (travel creator / content creator groups)** —
  same situation as Discord: typically membership-gated, not fetchable
  without an account. Own-investigation-only.

**General rule for anything not explicitly verified above**: read the
community's current rules yourself immediately before posting (rules
change), post as a real, disclosed founder account (never a brand/company
account where the platform disallows it — confirmed a hard rule on
Product Hunt specifically), and lead with the value in §2's drafts, not
the link.
