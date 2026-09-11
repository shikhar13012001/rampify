# Rampify — First-Export Usability Research

> Companion to `STATUS.md` / `WORKING_AGREEMENT.md`.

## Status: NO SESSIONS HAVE BEEN RUN

**This document is the research instrument (task script + observation
template), not a findings report.** A task was received asking to identify
"the largest first-export obstacles" from "actual user observations" —
checked this repo for any prior research under `docs/validation/RESEARCH.md`
and any other filename (grepped the whole `docs/` tree for
participant/observation/usability/think-aloud/user-test language): **zero
matches, no such file, no prior usability session of any kind on record in
this repository.**

Per that task's own explicit instruction — *"If the research notes are
absent or insufficient, produce the interview and observation template
instead of guessing what users need"* — nothing below is a finding. No
obstacle has been identified, ranked, or fixed as a result of this task.
Inventing participant counts, quotes, or "likely" obstacles here would
violate the same task's "do not invent missing research" instruction and
this project's `WORKING_AGREEMENT.md` §6 ("no invented test results").

**What this document is for**: run it with real participants, fill in the
tables below with what actually happens, and only then does a follow-up
task have real evidence to rank obstacles and implement fixes against.

---

## 1. The task (give this to every participant, verbatim)

Keep it outcome-based, not tool-based — don't name buttons or steps, so the
session observes what participants actually try, not whether they can
follow instructions.

> "You have a short video clip. Using Rampify, make part of it play in
> slow motion so it feels more dramatic, then export the result so you
> have a file you could share. Talk out loud as you go — what you're
> looking at, what you expect to happen, anything that confuses you."

Notes for whoever administers this:
- Give the participant a real, short (5-30s) test clip with visible motion
  — do not use their own footage for a moderated session unless they
  volunteer it (privacy). Any clip with clear, fast motion works; it does
  not need to be `public/demo/sample-clip.mp4` specifically, though that
  clip is available and licensing-clean if a ready one is wanted.
  `test/fixtures/normal-with-audio.mp4` (3s, has audio) or
  `test/fixtures/variable-speed-source.mp4` (6s) also work.
- Don't correct or guide the participant unless they explicitly ask for
  help or are fully stuck for >60s with no forward progress — and if you
  do help, **record it as an assist** (see the log below). The whole point
  is to see what happens without intervention.
- Stop the session once they have a downloaded file, or after they give up.
- "Export so you have a file you could share" deliberately doesn't specify
  sign-in/pricing — whether and how they hit the free-plan wall (sign-in
  requirement, monthly cap) is itself an observation to capture, not
  something to explain upfront.

## 2. Session logistics (fill in / adjust before running)

- **Recruit**: target participants who have not used Rampify before —
  prior familiarity would bias toward "already knows where things are."
  Aim for enough sessions that repeated obstacles are visible, not one or
  two anecdotes — three to five is a reasonable first round; more if
  results are inconsistent between sessions.
- **Format**: moderated (a researcher observes live or watches a recording),
  think-aloud. Remote screen-share or in-person both work as long as the
  full screen and audio narration are captured.
- **Consent**: get explicit recording consent before starting, per whatever
  this project's actual privacy commitments require — this repo's own
  marketing claims "no data collection" for the *product*; a research
  session recording is a separate, deliberate exception participants must
  knowingly agree to, not something to blur with the product's own privacy
  posture.
- **Environment**: note the real browser/OS/device per session (this
  matters — `docs/validation/RESULTS.md` already found the export pipeline
  itself has real device-dependent behavior; an obstacle seen once on one
  browser is different evidence than one seen across three).

## 3. Per-participant observation log

Copy this block once per participant. Fill in every field — an obstacle
entry missing "what happened" or "prevented usable export" isn't usable
evidence later.

```
### Participant: [id/pseudonym]  Date: [YYYY-MM-DD]  Browser/OS/device: [ ]
Prior Rampify use: [none / some / regular]
Completed a usable export: [yes / no / gave up at step: ___]
Total time to first export attempt: [ ]
Total time to completed download (if reached): [ ]

Obstacle 1:
  - What they attempted: [specific action, in their words/behavior]
  - What happened: [actual system response/behavior observed]
  - Assistance needed: [none / verbal hint / pointed to control / took over]
  - Prevented a usable export: [yes / no / delayed but recovered]
  - Researcher's raw notes (verbatim quotes welcome, timestamped if recorded):

Obstacle 2:
  - ...

Feature requests mentioned (unprompted): [list, do not fold into obstacles]
Session notes / anything else observed:
```

## 4. Separating observations, interpretations, and feature requests

This distinction matters enough to get its own section — mixing them is
the single easiest way for this kind of research to quietly become
guesswork. Use these three buckets, and label every entry with which one
it is:

- **Observation** — what was directly seen or heard. *"Participant clicked
  the curve twice, then said 'wait, did that do anything?' and opened the
  browser back button."* Falsifiable, specific, no inference.
- **Interpretation** — a researcher's explanation for *why* an observation
  happened. *"The curve likely gave no visible feedback on click, so the
  participant assumed the click failed."* Useful, but explicitly a guess —
  mark it as one, and don't let it silently become the "what happened"
  field in the log above.
- **Feature request** — something the participant explicitly asked for or
  suggested. *"Could there be an undo button?"* This is not an obstacle
  unless the SESSION also shows them failing to complete the task without
  it — a request alone, with no observed failure, is product-roadmap input,
  not usability evidence for this task's ranking criteria.

When writing up the aggregated findings (Section 5), only obstacles built
from real Observations should be ranked/fixed. Interpretations can explain
*why* an obstacle matters when proposing a fix. Feature requests get their
own list and are explicitly out of scope for "smallest plausible fix"
reasoning — a feature request is (by definition) not a minimal fix to an
observed failure.

## 5. Cross-participant aggregation (fill in after ≥3 sessions)

One row per **distinct** obstacle observed in 2+ sessions independently
(a single-session anecdote can be logged but shouldn't drive a fix — note
it separately below the table instead of inflating the count).

| Obstacle | Participants affected / total run | Assistance needed | Prevented usable export | Smallest plausible fix |
|---|---|---|---|---|
| | | | | |

Single-session-only observations (kept for context, not ranked):
- [ ]

### Ranking rule

Rank strictly by **impact on completing the existing workflow** — how many
participants it stopped or slowed, and whether it blocked a usable export
— not by how interesting or novel the obstacle is. A boring, high-frequency
obstacle (e.g. "everyone paused at the same unlabeled icon") outranks a
striking one-off. Only obstacles with real observation counts in the table
above are eligible for the "implement at most the top two" step in a
follow-up task — do not promote an Interpretation or Feature request into
this ranking.

## 6. Retest script (after a fix ships)

Same task as Section 1, unchanged — the point of a retest is comparing
like-for-like, not writing a new task that happens to route around the
fixed obstacle.

> "You have a short video clip. Using Rampify, make part of it play in
> slow motion so it feels more dramatic, then export the result so you
> have a file you could share. Talk out loud as you go — what you're
> looking at, what you expect to happen, anything that confuses you."

Retest-specific additions to the log (Section 3):
```
Fix(es) being retested: [name/PR/commit]
Reached the specific point the fix targets: [yes / no]
Completed that point WITHOUT assistance: [yes / no]
Time at that point vs. pre-fix baseline (if known): [ ]
```

Run with **new** participants who haven't seen the pre-fix version — reusing
the same participants risks measuring memory of the previous session
instead of the fix itself. Same minimum session count guidance as Section 2.

## 7. What happens next

1. Recruit and run the sessions in Section 2, using the task in Section 1.
2. Fill in Section 3 per participant, in real time or from recordings —
   don't reconstruct from memory afterward.
3. Fill in Section 5 once there's enough data to see repeated obstacles.
4. Only then: a follow-up task can rank obstacles, pick at most the top two
   well-supported fixes, implement them, add regression tests for the
   changed behavior, and run Section 6's retest — with this same document
   as the evidence trail, not a fresh guess.

---

**Reminder, restated**: nothing above this line is a finding. If a future
task asks to "implement the top usability fixes" and this document still
has empty tables, the correct response is still the one this task received
— point back here, run the sessions first.
