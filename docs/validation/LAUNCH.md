# Rampcut — Distribution Kit & Fix Log

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md` / `RESEARCH.md`. A kit of
> drafts, templates, and a status log — not a marketing application. Every
> product claim below is checked against this repo's own verified behavior
> or a live, read-only check against production (cited inline). No
> endorsement, testimonial, or result is invented anywhere in this
> document, consistent with `WORKING_AGREEMENT.md` §6. Nothing in this kit
> has been posted, sent, or purchased by an agent — every send/post is the
> owner's own action.

## Where things actually stand (2026-09-15)

**Real payments are live.** Dodo Payments is in `live_mode` on production.
All three plans exist as real, live products and were verified consistent
end-to-end:

| Plan | Price | What it verifies against |
|---|---|---|
| Pro Monthly | $12.00/month | `src/lib/planConfig.ts` |
| Pro Annual | $96.00/**year** | Owner-confirmed "Year" interval in the Dodo dashboard — this closes the 12×-overcharge risk that blocked launch since the first audit |
| **Founder** (new) | **$59 one-time**, lifetime Pro, first 25 seats | Live-checked via `GET /api/founder-seats` → `{"configured":true,"available":true,"total":25,"sold":0,"remaining":25,"priceUsd":59}` |

**Still needed before real promotion**: one real-card test purchase per
plan (monthly, annual, founder), then refund each — see `BILLING.md`'s
checklist. Nothing below should be posted publicly until that's done.

### What changed since the last audit of this product

- **Rebrand**: Rampify → **Rampcut**, live at **`rampcut.astralbuild.dev`**
  (not `rampify.astralbuild.dev` or `rampify-eight.vercel.app` — both old
  hosts now 308-redirect here, path-preserved, so any link already shared
  still resolves and consolidates authority instead of splitting it).
- **The sign-in wall is gone for a first try.** `GUEST_EXPERIMENT.enabled`
  is now `true` (`src/lib/planConfig.ts`): a stranger gets **one real
  export, 1080p, no account**, before any wall appears. This was the
  single biggest thing capping conversion in the previous audit — fixed.
  Every demo script and community-post draft below is written around this.
- **Founder tier** — see table above. A one-time $59 converts a cold
  stranger far more easily than asking them to start a subscription with
  zero social proof; it also clears a "first $50" goal in a single sale.
- **Curve Library** (`/curves` + 12 real `/curves/:slug` pages, e.g.
  `/curves/hero-moment`, `/curves/bullet-time`) — every named preset is
  now its own shareable page with a one-click "use this curve" deep link
  into the editor. This is a genuine acquisition loop no competitor in this
  category has: every curve page is simultaneously a landing page and a
  piece of content that explains itself.
- **Installable, offline-capable (PWA)** — confirmed in the live deployed
  bundle (`manifest.webmanifest`, service worker). A second, independent
  "your footage, your machine" proof point alongside the no-upload claim.
- **Feature pages rewritten** — `AiSlowMotion`, `BeatSync`, `FourKExport`,
  `PrivacyFeature` went from ~300-word stubs to 800-1000+ words each, with
  worked examples and their own FAQ (own `FAQPage` JSON-LD per page, not
  one duplicated block sitewide).

### Still open, lower priority (compounding SEO work, not first-sale-blocking)

Per the original audit's own sequencing — these matter for month 2-6, not
the first $50: `/guides/*` and `/compare/*` pages (audio-desync guide,
CapCut-alternative comparison, etc. — the winnable long-tail queries), a
`/docs` URL split (currently one page, five in-page sections), per-route
OG images (currently one generic image for every route), and the
pricing-page before/after clips (§1 below is exactly how those get made —
recording the demo scripts *is* producing that missing asset).

---

## The positioning, restated

The one claim no competitor in this category can make: every cloud-upload
editor (FlexClip, Kapwing, Clideo, VEED, Flixier) requires uploading raw
footage to a server before you ever see a result. Rampcut never does — the
entire pipeline (ffmpeg.wasm, RIFE frame interpolation via onnxruntime-web,
motion blur, beat detection) runs in a Web Worker in the browser. That's
the headline for every reply, every listicle pitch, every comparison page —
not "speed ramping," which CapCut already owns the SERP for. Two supporting
proof points that didn't exist at the time of the first audit: the Curve
Library (a real acquisition loop, not just a feature) and offline/installable
support (no competitor in this category offers this).

---

## 1. Three demonstration scripts

Each is a script/shot list for the **owner to record themselves**, using
the real, live app — not a description of a recording that already exists.
All three use the same real asset (the "Hero Moment" preset and its curve)
so they're consistent with each other, with `/features/speed-ramp`, and
with `/curves/hero-moment`.

### 1a. Before/after result (~20-25s)

> **[0:00-0:03]** Cold open on the raw clip playing at normal speed — no
> narration yet, just let the motion read.
> **[0:03-0:05]** Text overlay: "One clip. One curve. No sign-in." Cut to
> the Rampcut editor, clip already loaded.
> **[0:05-0:15]** Screen-record drawing/applying the Hero Moment curve
> (or clicking the preset — both are real, verified UI paths). Let the
> preview scrub across the ramp — slow start, punch to 2.5×, settle back
> down — so the viewer sees the curve shape and the result at the same time.
> **[0:15-0:22]** Cut to the exported result playing full-speed, same clip —
> this export can now happen as a guest, on camera, with no sign-in step
> breaking the flow (`GUEST_EXPERIMENT`, one free 1080p export).
> **[0:22-0:25]** Text overlay: "Free to start. Runs in your browser —
> nothing uploaded." End card with the Rampcut wordmark and the tracked
> URL from §5 below.
>
> **Recording note**: use the real demo clip
> (`public/demo/sample-clip.mp4`, loaded via "Try a demo clip" on the
> homepage) or the creator's own footage — either way, the export shown on
> screen must be a real export from the live app, not a mockup. This is
> also the exact missing asset for the pricing page (before/after clips) —
> recording this script closes that gap too; reuse the same footage there.

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
> **[0:25-0:32]** "Twelve named curves to start from, or draw your own —
> and every one has its own page." Quick cut through 2-3 other real preset
> names (Bullet Time, Whip Pan, Montage — `src/content/curves.mjs`) applied
> to the same clip; show one `/curves/:slug` page briefly.
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
> **[0:04-0:12]** Drop a clip into Rampcut, watch the Network tab — no
> upload request fires for the video file (verified: the export pipeline
> runs in a Web Worker, `ffmpegBridge.ts`; the only network calls this app
> makes are for auth/billing/analytics, not video data). Export it as a
> guest — no sign-in interrupts the flow. Still nothing uploaded.
> **[0:12-0:18]** "It runs on WebAssembly, in your browser. Your footage
> never leaves your machine. You can even install it and use it offline."
> End card, tracked URL.
>
> **Accuracy note**: don't claim "100% private" or "no data collected" in
> absolute terms — this app does send analytics events (non-video, see
> `docs/validation/METRICS.md`) and auth/billing calls. The claim that's
> actually true and verifiable is narrower and stronger for this purpose:
> the video file itself never leaves the browser. Say that, not more.

---

## 2. Two community-post drafts (useful without clicking through)

Both give a real, usable technique — the link is a bonus, not the point.
Both disclose founder involvement explicitly. **Not posted — drafts only.**

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
> worth: I built a free browser-based one (Rampcut) because I wanted to draw
> these as literal curves instead of stacking keyframes — disclosure, I'm
> the founder, so take the recommendation with that in mind. You can try
> one export with no account. [link]
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
> Rampcut, that has both paths — wrote this up because it's the single
> most common question I expect to get, not to pitch it. [link] if you want
> to see the frame-rate math laid out with a real clip — no account needed
> to try it.)

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
> I'm [Your name], founder of Rampcut — a browser-based speed-ramp editor
> (disclosure: I built it, this isn't a neutral recommendation). It does
> [the one specific thing relevant to their content — e.g. "curve-based
> speed ramping with a live preview, no upload" — only claim what's actually
> true; see the verified list above].
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
outcomes in §6's experiment log.

---

## 4. Invitation to an observed usability session

Reuses `RESEARCH.md`'s Section 1 task verbatim — the point of an observed
session is comparing what real people do against a fixed script, so the
invite and the task must not drift from what's already defined there.

> Subject: 15 minutes, unpaid, to try a video tool and tell me what's confusing
>
> Hi [Name],
>
> I'm building Rampcut, a browser video-speed-ramping tool (disclosure: I'm
> the founder). I'd like to watch someone who edits [action/travel/reveal]
> clips try it cold, with no explanation from me first — the goal is
> finding what's confusing, not a demo or a sales pitch.
>
> If you're up for it: about 15 minutes, screen-share, think-aloud. The
> task would be exactly this —
>
> > "You have a short video clip. Using Rampcut, make part of it play in
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
`analytics_events` / `scripts/inspect-journey.mjs`. Vercel Web Analytics
(cookieless page views/referrers) is also wired in (`src/main.tsx`) — check
it's turned on for this project in the Vercel dashboard's Analytics tab,
since that toggle isn't controlled from this repo.

### Naming convention

```
utm_campaign = {channel}-{audience}-{yyyymm}-{variant}
```

- `channel`: where it's posted (`community`, `dm`, `usability-invite`, `demo-video`)
- `audience`: short label (`editors`, `traveledit`, `actionedit`)
- `yyyymm`: e.g. `202609`
- `variant`: a short label for A/B tracking (`curvedemo`, `noupload`, `beforeafter`, `founder`)

Example full campaign name: `community-editors-202609-founder`

### UTM parameters per kit item

| Item | utm_source | utm_medium | utm_campaign example |
|---|---|---|---|
| §1 demo videos | the platform it's posted to (`youtube`, `tiktok`) | `demo-video` | `demo-video-actionedit-202609-beforeafter` |
| §2a/2b community posts | the community (`videoediting-community`, `capcut-community`) | `community-post` | `community-editors-202609-curveshapes` |
| §3 outreach | `creator-outreach` | `dm` | `dm-tutorialcreators-202609-partnership` |
| §4 usability invite | `usability-recruit` | `usability-invite` | `usability-invite-editors-202609-round1` |

### Tracked landing URLs (real, existing routes)

```
https://rampcut.astralbuild.dev/?utm_source=<channel>&utm_medium=<medium>&utm_campaign=<campaign>
https://rampcut.astralbuild.dev/features/speed-ramp?utm_source=<channel>&utm_medium=<medium>&utm_campaign=<campaign>
https://rampcut.astralbuild.dev/curves/hero-moment?utm_source=<channel>&utm_medium=<medium>&utm_campaign=<campaign>
https://rampcut.astralbuild.dev/pricing?utm_source=<channel>&utm_medium=<medium>&utm_campaign=<campaign>
```

Prefer `/features/speed-ramp` or a specific `/curves/:slug` page for
anything tied to §1b/§1c or §2's curve/no-upload content specifically —
both are built around exactly that content. Use `/pricing` when the
founder offer is the point. Use `/` for anything more general.

---

## 6. Sequenced plan — day 1 through week 6

Design for one outcome: a single $59 founder sale, or an equivalent. Nothing
below should be promoted until the real-card test purchase (top of this
doc) is done.

**Day 1 — proof, not more building.** Record the three demo scripts in §1
using the live app. This closes the pricing page's missing before/after
asset at the same time. Reuse the same footage everywhere below.

**Week 1-2 — go where the pain already is.** Not a launch; a reply
campaign, in this order:
1. Adobe Community threads about audio desync when speed-ramping — explain
   the cause, link a guide page once one exists, mention the tool once.
2. r/VideoEditing, r/CapCut, r/editors, r/privacy — answer real "how do I
   do X without CapCut" posts. Rule: value first, link second, ten useful
   replies before anything that reads as a launch post. **Check that
   specific subreddit's current self-promotion rules yourself, in a logged-
   in browser, immediately before posting** — §7 below documents what could
   and couldn't be verified in advance, and rules change without notice.
3. Email authors of existing "CapCut alternatives" / "speed ramp tools"
   listicles — you're the only browser-local tool in that category; a
   listicle link outlasts a launch-day spike.
4. Product Hunt + Show HN, same day, week 2, with the founder offer as the
   exclusive. Lead the HN title with "ffmpeg.wasm + RIFE running entirely
   in the browser," not "video editor" — that's the audience that upvotes
   it. Verified rules for both are in §7.
5. Twenty personalized emails via §3's template, offering free Pro for a
   mention.
6. Post the Curve Library and offline/installable support as their own
   small announcements — genuinely differentiated, worth a separate mention
   from the main launch.

**Week 2-6 — let the reply campaign become the SEO engine.** Every reply
written in week 1-2 is a draft of a guide page. Build the `/guides/*` and
`/compare/*` pages once there's real traffic and real questions to answer —
not before, so the pages answer questions people actually asked instead of
ones guessed at. Submit each new URL in Search Console the day it ships.

**What not to do in the next three weeks**: no more validation docs, no
team tier, no further editor features, no paid ads before the founder
offer has sold a handful of organic seats, no rename debate. The
bottleneck from here is exposure, not product.

---

## 7. Weekly experiment log

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
- **Offer**: what was actually offered (nothing / free Pro account / the
  founder $59 seat / usability session invite) — keep this explicit.
- **Hypothesis**: written *before* running the experiment, not fitted to
  the result afterward — same discipline `RESEARCH.md` asks for.
- **Spend**: $0 for everything in this kit as drafted (no placements
  purchased) — only fill in a nonzero number if a paid placement is
  separately decided on, which is outside what this kit authorizes.
- **Result**: the real metric plus its qualification status (e.g. "3
  qualified sessions, 1 clip_loaded source=own, 1 checkout_started
  offer=founder" — not "went well").

---

## 8. Communities — verified where possible, otherwise flagged for the owner

Browsing was available when this was drafted; used it. Results below are
honest about what actually got verified vs. what didn't — several attempts
were blocked or inconclusive, and those are labeled as such rather than
filled in with unverified third-party summaries. **Re-check anything below
before posting — rules change, and this was verified once, not continuously.**

### Verified via direct fetch of the platform's own guidelines

- **Product Hunt** — fetched `producthunt.com/launch/how-product-hunt-works`
  directly. Real rules confirmed: no paying for upvotes/traffic (permanent
  ban risk), personal accounts only (no brand/company accounts — "we don't
  allow company or brand accounts to post products or comment"), ask
  people to visit/comment/try, not to upvote. A real, working, triable
  product without signup barriers is the stated fit — and now Rampcut's
  export path itself needs no signup for a guest's first try, so this fits
  even more directly than it did before. Word any Product Hunt copy around
  the founder offer and the no-signup-to-try experience.
  Source: [producthunt.com/launch/how-product-hunt-works](https://www.producthunt.com/launch/how-product-hunt-works)

- **Hacker News — "Show HN"** — fetched `news.ycombinator.com/showhn.html`
  directly. Real rules confirmed: must be something people can actively
  try/use (not a blog post or signup page), no asking friends to upvote/
  comment, maker must be personally involved and available to answer
  questions in the thread, early/unpolished work is acceptable. Fits
  Rampcut's actual state reasonably well (a real, workable tool, built and
  maintained by one identifiable founder) — but Show HN's audience skews
  developer/technical, not specifically short-form video creators, so
  treat this as a secondary channel (dev-tool-curious audience, drawn in by
  "ffmpeg.wasm + RIFE in the browser") rather than the core fit for the
  primary creator audience.
  Source: [news.ycombinator.com/showhn.html](https://news.ycombinator.com/showhn.html)

### Attempted, blocked or inconclusive — investigate directly before posting

- **Reddit (r/VideoEditing, r/editors, r/NewTubers, r/travel, r/CapCut,
  r/privacy)** — the natural fit for this audience, but **could not be
  verified**: direct fetches to `reddit.com` and `old.reddit.com` rules
  pages were blocked outright (not a rules judgment — the fetch itself
  failed). A web search surfaced only third-party SEO summary sites, not
  Reddit's own current rules, so nothing from that search is cited here as
  fact. **Before posting anything to any subreddit**: open the subreddit
  itself, read the sidebar/About → Rules page directly (a logged-in
  browser, not an agent, can reach it), and check specifically for a
  self-promotion policy, a required post flair, and any rule against
  linking your own product. Subreddit rules vary widely and change without
  notice — do not reuse a rule set from one subreddit for another.

- **Indie Hackers** — a natural fit (build-in-public audience), but the
  platform's own posting-guidelines page wasn't reachable with a usable
  result; a web search surfaced third-party claims about a self-promotion
  cadence that could not be confirmed against a first-party source and are
  **not** presented here as verified. Investigate indiehackers.com's own
  current group-posting guidelines directly (rules are set per-group and
  viewable when composing a post there) before posting.

- **Discord servers for video editors/creators** — plausible fit, not
  investigated at all: Discord servers generally require joining to see
  rules. Own-investigation-only, no shortcut available.

- **Facebook Groups (travel creator / content creator groups)** —
  same situation as Discord: typically membership-gated, not fetchable
  without an account. Own-investigation-only.

**General rule for anything not explicitly verified above**: read the
community's current rules yourself immediately before posting (rules
change), post as a real, disclosed founder account (never a brand/company
account where the platform disallows it — confirmed a hard rule on
Product Hunt specifically), and lead with the value in §2's drafts, not
the link.
