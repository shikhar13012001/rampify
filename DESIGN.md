# Rampify — Design System & Improvement Plan

A living design reference for Claude (and any contributor) when improving the Rampify UI. This document captures the **current** design language, audits friction and inconsistency, and prescribes a **target** system plus concrete next steps.

Rampify is a browser-native, curve-first speed-ramp video editor. The product is dense and technical (timeline, curve editor, segments, export pipeline), so the design's job is to make precision work feel calm and fast — not to decorate it.

---

## 1. Product reality (design constraints)

These shape every visual decision and must not be violated:

- **Runs in the browser, local-first.** No upload state, no "processing on server" UX. All progress UI reflects in-browser ffmpeg.wasm / ONNX work.
- **Two surfaces**: a marketing **Landing** page (`/`) and the **Editor** app (`/editor`). The editor is the product; the landing is a 30-second pitch.
- **Two user tiers**: Free (3 exports/month, locked blur / OF / beat-sync) and Pro. Every locked control must clearly communicate its state and how to unlock it.
- **SharedArrayBuffer required** (COOP+COEP). Third-party popups (Google One Tap) are tuned for FedCM to avoid COEP breakage. Avoid UI patterns that depend on cross-origin iframes.
- **Dense canvas work**: timeline, curve editor, waveform. These are DPR-scaled and time-critical — overlays and chrome must not steal attention from the canvas.
- **Heavy compute moments**: OF "ultra" can run 2–5 minutes on CPU. Progress, time estimates, and cancellation are first-class UX, not afterthoughts.

---

## 2. Current design system (as built)

### 2.1 Color tokens (`src/styles/globals.css`)

Two layers exist: `@theme {}` (Tailwind v4) and `:root {}` (CSS custom props used by inline styles). They overlap but are not 1:1. **Inline styles throughout the codebase reference hex values directly** (e.g. `#EEEEF8`, `#8B6FFF`) rather than tokens — see §4 issue D1.

| Role | Token | Hex |
|---|---|---|
| Primary (violet) | `--color-primary` | `#8B6FFF` |
| Primary hover | `--color-primary-hover` | `#7A5EEF` |
| Primary active | `--color-primary-active` | `#6A4EDF` |
| Accent (teal, success, curve) | `--color-accent` | `#1CE4B8` |
| Warning (fast speed, ultra) | `--color-warning` | `#F59E0B` |
| Error | `--color-error` | `#FF6B78` |
| Info | `--color-info` | `#60A5FA` |
| BG (deep-space navy) | `--color-bg` | `#07080F` |
| Surface | `--color-surface` | `#0E0F1E` |
| Panel | `--color-panel` | `#13142A` |
| Overlay | `--color-overlay` | `#1A1B36` |
| Border | `--color-border` | `#1E2040` |
| Border subtle | `--color-border-subtle` | `#151628` |
| Border strong | `--color-border-strong` | `#2A2C52` |
| Text | `--color-text` | `#EEEEF8` |
| Text muted | `--color-text-muted` | `#7878A0` |
| Text subtle | `--color-text-subtle` | `#44446A` |
| Text disabled | `--color-text-disabled` | `#24244A` |
| Speed slow (<0.5×) | `--color-speed-slow` | `#1CE4B8` |
| Speed normal | `--color-speed-normal` | `#8B6FFF` |
| Speed fast (≤2×) | `--color-speed-fast` | `#F59E0B` |
| Speed very fast (>2×) | `--color-speed-vfast` | `#FF6B78` |

**Contrast checks (WCAG AA against `#07080F`):**

| Token | Hex | Ratio | AA body | AA large | Notes |
|---|---|---|---|---|---|
| `--color-text` | `#EEEEF8` | ~18:1 | ✓ | ✓ | Excellent |
| `--color-text-muted` | `#7878A0` | ~5.2:1 | ✓ | ✓ | OK; borderline on `--color-surface` (`#0E0F1E`) |
| `--color-text-subtle` | `#44446A` | ~2.4:1 | ✗ | ✗ | **Fails AA.** Used for captions, "No file loaded", slider labels. Decorative-only — never use for essential info. |
| `--color-accent` on bg | `#1CE4B8` | ~13:1 | ✓ | ✓ | Strong |
| `--color-primary` on bg | `#8B6FFF` | ~6.5:1 | ✓ | ✓ | OK for text; on white buttons use `#fff` text |
| `--color-warning` | `#F59E0B` | ~8.7:1 | ✓ | ✓ | OK |
| `--color-error` | `#FF6B78` | ~6.8:1 | ✓ | ✓ | OK |

### 2.2 Typography

- **Sans:** `Outfit` (300–800) via Google Fonts, with system fallbacks. Loaded in `index.html` via `<link>`.
- **Mono:** `JetBrains Mono` (400–600, italic 400) via Google Fonts. Used for: filenames, timestamps, speed values, progress %, model status, code-like labels (`clip_001.mp4`, `speed-curve.rampify`).
- Base: 14px / line-height 1.5, antialiased.
- Display weight: 800 with `letter-spacing: -0.04em` (hero) / `-0.03em` (titles).
- **No type scale tokens** — sizes are picked ad hoc per component (12, 13, 11, 10, 9, 17, 20, 22, 36, 42–72). See issue D2.

Observed size usage (informal scale):

| Use | Size | Weight |
|---|---|---|
| Hero h1 | clamp(42–72px) | 800 |
| Modal h2 | 18–22px | 700–800 |
| Section label (caps) | 10px | 700, tracking 0.08em |
| Body | 13–14px | 400–500 |
| UI label | 12px | 500–600 |
| Badge / chip | 9–11px | 600–700 |
| Mono readout | 10–12px | 600 |

### 2.3 Spacing & layout

- No spacing scale tokens. Components use raw px: `4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 64, 80, 100`.
- Layout shells:
  - **TopBar:** height `--toolbar-height: 56px`, grid `1fr auto 1fr`, 16px gutters.
  - **Editor grid:** `240px minmax(0, 1fr)` columns; main area `minmax(0,1fr) auto 176px 100px` rows (preview / beats / curve / timeline).
  - **Sidebar:** 10px outer padding, `gap: 6px` between `SectionCard`s.
  - **Modals:** `min(400–680px, 100%)`, 22–24px inner padding, 20px outer scrim padding.
- Radii: chips 5–8px, cards 10–12px, panels/modals 20–24px, pills 999px. Inconsistent — see D3.

### 2.4 Elevation & glow

- **No formal shadow tokens.** Three idioms are reused:
  - Card: `0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`
  - Modal: `0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)`
  - Primary CTA glow: `0 0 28–40px rgba(139,111,255,0.25–0.4)` + hover lift
- **Ambient orbs** (radial gradients) appear on Landing, modals, and drag-active DropZone. Same recipe: `radial-gradient(circle, rgba(139,111,255,0.06–0.12) 0%, transparent 70%)`.
- Inset top highlight `inset 0 1px 0 rgba(255,255,255,0.05)` is the de facto "glass" line.

### 2.5 Borders

- Default 1px solid `--color-border` (`#1E2040`).
- Hover lift pattern: `borderColor` from `rgba(255,255,255,0.08)` → `0.18`, color from muted → text. Implemented inline via `onMouseEnter`/`onMouseLeave` style mutation (see D4 — should be CSS `:hover`).
- Selected/active border: `rgba(139,111,255,0.4)` with `rgba(139,111,255,0.08)` fill.

### 2.6 Motion

Defined in `globals.css`:

| Keyframe | Use | Duration |
|---|---|---|
| `fadeUp` | Hero, modals | 0.6s `cubic-bezier(0.16, 1, 0.3, 1)` |
| `fadeIn` | Sections, overlays | 0.18–0.4s ease |
| `fadeUp` (modal) | Modal entrance | 0.26s same easing |
| `spin` | Spinners | 0.8s linear |
| `pulse-glow` | "Browser-native" dot, status | 2s ease-in-out |
| `shimmer` | Progress bar sheen | 1.5s ease-in-out |
| `playhead-move` | Landing visualizer | 3s alternate |
| `draw-path` | Landing curve draw-in | 2.5s |
| `float` | (defined, unused) | — |
| `beatPulse` | (defined, used by beat markers) | — |

- `prefers-reduced-motion: reduce` disables `.animate-fade-up*` and `.animate-fade-in` only. **Spinners, shimmer, pulse-glow, beatPulse, playhead, draw-path are NOT reduced** — see D5.
- Standard transition: `0.12–0.2s` on `background`, `border-color`, `color`, `opacity`, `box-shadow`. Lift on hover: `translateY(-1px)` + glow boost.

### 2.7 Components (informal inventory)

| Component | File | Notes |
|---|---|---|
| `Landing` | `pages/Landing.tsx` | Hero + features + CTA. SVG curve visualizer with draw-in. |
| `TopBar` | `components/TopBar.tsx` | 3-column grid: logo / filename / auth+export. Pro badge. |
| `DropZone` | `components/DropZone.tsx` | Drag-active card with grid pattern + glow. Restore-session chip. |
| `Sidebar` | `components/Sidebar.tsx` | `SectionCard` stack: File / Segments / Presets / Audio / Speed range / Output / Undo. |
| `SegmentRow` | (in Sidebar) | Color bar + label + mono timecode + speed badge + delete. |
| `ToggleRow` / `MotionBlurControl` / `OpticalFlowControl` | (in Sidebar) | Inline toggle pill + segmented control. |
| `LockedOption` | (in Sidebar) | Muted row with Pro chip; opens UpgradeModal. |
| `PresetPanel` | `features/curve/PresetPanel.tsx` | Preset curve buttons. |
| `CurveEditor` | `features/curve/CurveEditor.tsx` | Canvas speed curve with handles, slow-region overlay. |
| `Timeline` | `features/timeline/Timeline.tsx` | Canvas ruler, segment track, waveform, beat markers. |
| `VideoPlayer` | `features/preview/VideoPlayer.tsx` | Video + transport bar + blur preview hint. |
| `BeatSyncPanel` | `features/beatSync/BeatSyncPanel.tsx` | Collapsible beat detection + pattern selector. |
| `ExportModal` | `features/export/ExportModal.tsx` | Quota → estimate → progress → done/error. Phase steps for OF. |
| `UpgradeModal` | `components/UpgradeModal.tsx` | Two-panel: features + pricing toggle + CTA. |
| `UpgradeSuccess` | `pages/UpgradeSuccess.tsx` | Polling/confirmed/timeout states. |
| `UserButton` / `SignInButton` | `lib/auth.tsx` | Avatar + dropdown / Google button. |
| `KeyboardHints` | `components/KeyboardHints.tsx` | Shortcut overlay. |
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | React boundary. |

### 2.8 Iconography

All icons are inline SVG, `stroke=currentColor`, `strokeWidth 1.5–2.5`, `strokeLinecap="round"`. No icon library. Icons are redefined per file (`LogoMark` exists in both `Landing.tsx` and `TopBar.tsx` — see D6). Sizes: 9–28px.

### 2.9 Speed color semantics

`speedColor(speed)` (Sidebar) maps average speed to a color:
- `<0.5×` → accent teal (slow)
- `≤1.2×` → primary violet (normal)
- `≤2.0×` → warning amber (fast)
- `>2×` → error red (very fast)

This is the single most important semantic system in the product — it appears in segment color bars, speed badges, the curve line, timeline segments, and the landing visualizer legend. **It is not tokenized at the usage site** (hardcoded hex repeats).

---

## 3. UX flow notes (where the design lives)

### 3.1 First contact → Landing
- Hero: "Speed ramp your videos. No installs." with gradient text on the third line.
- Trust badges: ⚡ Runs in browser · ✓ No watermarks · 🔒 Local processing.
- Animated SVG curve draws in over 2.5s; playhead sweeps 3s alternate.
- Two CTAs: "Start editing free" (primary glow) and "See how it works" (ghost → `#features`).
- Features: one large card + two stacked cards (curve-first / timeline / local-first).
- Closing CTA "Open the editor".

### 3.2 Drop zone
- Empty editor state. Dashed violet icon tile, grid pattern background, ambient glow on drag.
- Recognizes a previously-saved file and offers a restore chip (teal).
- Rejection messaging differentiates audio vs. unsupported video.

### 3.3 Editor shell
- TopBar with centered filename pill (mono, truncated).
- Left sidebar: stacked section cards. Each card has a small-caps label.
- Main column rows: preview (black) / beat panel / curve editor / timeline.
- Keyboard shortcuts overlay.

### 3.4 Curve editing
- Canvas curve in teal with white points and translucent teal handles.
- Slow-region dashed overlay below 0.6×.
- Preset buttons swap the curve.

### 3.5 Export pipeline
- Quota dots (3 for free, hidden for Pro).
- OF estimate card (amber when "ultra").
- Progress: bar with shimmer, % mono readout, "About Xm Ys remaining".
- OF phase steps: Interpolating → Encoding.
- Done: green check, auto-download starts.

### 3.6 Upgrade
- Two-panel modal: features (left) + pricing toggle (right).
- Monthly $12 / Annual $96 (SAVE 33%).
- "Start Pro" → Stripe Checkout (origin-allowlisted server-side).
- On return: `/upgrade/success` polls for `isPro` up to 30s, then redirects to `/editor`.

---

## 4. Design audit — issues to fix

Issues are tagged **D** (design system), **U** (UX), **A** (a11y), **P** (performance/consistency). Each has a priority.

### D1 — Hex values bypass tokens ★★★
**Where:** `Landing.tsx`, `TopBar.tsx`, `Sidebar.tsx`, `UpgradeModal.tsx`, `ExportModal.tsx`, `auth.tsx` — virtually everywhere.
**Problem:** Components hardcode `#8B6FFF`, `#EEEEF8`, `rgba(139,111,255,0.12)` instead of `var(--color-primary)` etc. Tokens defined in `globals.css` are mostly unused outside `TopBar` and `Sidebar`. Refactoring a color requires a repo-wide find/replace.
**Fix:** Use CSS variables in inline styles (`style={{ color: 'var(--color-primary)' }}`). For opacities, define additional tokens (`--color-primary-muted-12`, etc.) or use `color-mix(in srgb, var(--color-primary) 12%, transparent)`.

### D2 — No type scale ★★★
**Problem:** Sizes are ad hoc (9, 10, 11, 12, 13, 14, 17, 18, 20, 22, 36, 42–72). No `--text-xs/sm/base/lg/xl/2xl/display` tokens. Inconsistent: modal titles are 18 in ExportModal, 22 in UpgradeModal.
**Fix:** Define a 7-step scale in `:root` and `@theme`:
```
--text-xs:   11px;  /* badges, mono readouts */
--text-sm:   12px;  /* UI labels */
--text-base: 13px;  /* body, buttons */
--text-md:   14px;  /* section body */
--text-lg:   17px;  /* card titles */
--text-xl:   22px;  /* modal titles */
--text-2xl:  36px;  /* large numbers */
--text-display: clamp(42px, 6vw, 72px); /* hero */
```
Audit every `fontSize:` and snap to the nearest token.

### D3 — Radius inconsistency ★★
**Problem:** Cards use 10, 12, 20, 22, 24 interchangeably. Pills 999. Chips 4–8.
**Fix:** Define `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 20px`, `--radius-pill: 999px`. Modals → `lg`, cards → `md`, chips/segmented → `sm`, pills → `pill`.

### D4 — Hover states via JS instead of CSS ★★
**Problem:** Many buttons implement hover by mutating `e.currentTarget.style` in `onMouseEnter`/`onMouseLeave`. This is verbose, breaks with keyboard focus, doesn't survive re-renders, and can't be overridden by `prefers-reduced-motion`.
**Fix:** Extract repeated button styles into CSS classes in `globals.css` (or `@layer components` in Tailwind v4) using `:hover` and `:focus-visible`. Keep inline styles for one-off layout, but use classes for interactive primitives (primary button, ghost button, icon button, chip).

### D5 — `prefers-reduced-motion` is incomplete ★★
**Problem:** Only `.animate-fade-*` classes are disabled. `spin`, `shimmer`, `pulse-glow`, `beatPulse`, `playhead-move`, `draw-path` keep animating. For users with vestibular triggers, the infinite shimmer/pulse is the worst offender.
**Fix:** Wrap all keyframe animations in `@media (prefers-reduced-motion: reduce) { animation: none; }` or scope each class. Replace motion-dependent affordances with opacity-only or static equivalents where the animation is decorative.

### D6 — Duplicated primitives ★★
**Problem:** `LogoMark`, `SpinnerIcon`, `CloseIcon`, `ExportIcon` are redefined in multiple files. `ToggleRow` is duplicated inline in `MotionBlurControl` and `OpticalFlowControl`.
**Fix:** Create `src/components/ui/` with: `Logo`, `Spinner`, `IconButton`, `CloseButton`, `Toggle`, `SegmentedControl`, `Badge`, `Card`, `SectionLabel`, `ModalShell`, `Icon` (or adopt `lucide-react` for the last one). Consolidate the three segmented controls (`INTENSITY_LABELS`, `OF_QUALITY_LABELS`, billing toggle) into one generic `<SegmentedControl>`.

### D7 — Speed-color system is not centralized ★★
**Problem:** `speedColor()` lives in `Sidebar.tsx` and is re-implemented wherever speed is shown. The four speed colors have tokens but the mapping function doesn't.
**Fix:** Move to `src/lib/speedColor.ts` and export `speedColor(speed: number): string` plus a `SpeedChip` component. Reuse in Sidebar, Timeline, CurveEditor, Landing legend.

### D8 — Modal scrim is inconsistent ★
**Problem:** ExportModal scrim is `rgba(0,0,0,0.75)` + `blur(8px)`, UpgradeModal is `rgba(0,0,0,0.82)` + `blur(12px)`, auth dropdown has no scrim.
**Fix:** One `--scrim` token + a `<Modal>` primitive.

### U1 — Locked-feature affordance is weak ★★
**Problem:** `LockedOption` is a muted row with a small "PRO" chip. Visually it reads as "disabled" rather than "available, upgrade to unlock". Clicking opens the modal, but discoverability is low.
**Fix:** Keep the row at full text color, render the control in a disabled state with a small lock icon overlay, and make the whole row a clear button with a hover treatment that surfaces the Pro chip. Add a one-line preview ("Motion blur adds cinematic transitions at every speed change") so users know what they'd get.

### U2 — Export quota dots don't survive Pro flip ★
**Problem:** When `isPro` is true the quota block is hidden entirely, but on the Pro → Free downgrade path (subscription.deleted) the dots re-render with the old `exportsRemaining` until the next `/api/check-subscription` poll. Brief visual glitch.
**Fix:** Reset `exportsRemaining` to `SIGNED_IN_FREE_LIMIT` in the store when `isPro` flips to false, then re-fetch.

### U3 — Export "About Xm Ys remaining" can be misleading ★
**Problem:** `estimateTimeRemaining` is linear extrapolation from elapsed/progress; blur adds a flat 20s if `progress < 20`. Early in the run the estimate swings wildly.
**Fix:** Show "Estimating…" until progress ≥ 5%, then show the estimate. Use a smoothed rolling average of the last 3 progress samples.

### U4 — Landing visualizer doesn't reflect the user's actual curve ★
**Problem:** Marketing shows a hand-crafted SVG path. After a user drops a video, the editor curve looks different and there's no continuity.
**Fix:** (Optional, larger) When a returning user has a saved project, show their **actual** last curve in the hero card instead of the demo path, with a "Continue editing" button that loads it.

### U5 — Onboarding is empty ★
**Problem:** First-time users hit the DropZone with no guidance on what a speed curve is or how to draw one. The curve editor's empty state says "Select a segment to edit its speed curve" but there's no tutorial.
**Fix:** Add a 3-step inline coachmark on first editor load: (1) drop a video, (2) draw a curve, (3) export. Dismissable and remembered in `localStorage`.

### U6 — Error states are ad hoc ★
**Problem:** Each component renders its own error block with slightly different styling (DropZone vs ExportModal vs UpgradeModal vs auth error).
**Fix:** One `<Alert tone="error|warning|success|info">` primitive.

### A1 — `--color-text-subtle` fails AA ★★
**Problem:** `#44446A` on `#07080F` is ~2.4:1. Used for "No file loaded", slider labels, segment timecodes, mono readouts. Some of these are essential.
**Fix:** Either bump the token to `#5A5A7A` (~3.5:1, still fails AA body but passes AA large/UI 3:1) and reserve it for decorative text, or use `--color-text-muted` (`#7878A0`) for anything informative. Never put essential text in `--color-text-subtle`.

### A2 — Focus rings rely on `:focus-visible` globally only ★★
**Problem:** The global `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }` is good, but many custom buttons use inline `border` styles that visually overpower the outline, and segmented controls don't show focus clearly.
**Fix:** Ensure every interactive primitive has a visible focus state that contrasts with its resting border. Add `:focus-visible` overrides for segmented controls and icon buttons.

### A3 — `aria-label` coverage ★
**Problem:** Icon-only buttons (close, delete segment, sign-in menu toggle) mostly have `aria-label`, but the export "Cancel" button does not (it has `aria-label="Cancel export"` — good). The DropZone's hidden file input has no accessible label beyond `accept`. The beat panel expand/collapse state may not be wired to `aria-expanded` everywhere.
**Fix:** Audit with axe-core. Add `aria-label`/`aria-labelledby` to the file input, ensure all collapsible sections use `aria-expanded` and `aria-controls`.

### A4 — Color is the only signal for speed tier ★
**Problem:** Speed badges and segment color bars encode speed purely by hue. Color-blind users lose the signal.
**Fix:** Add a glyph or pattern to speed badges (e.g. ▲ for fast, ▼ for slow) or a dashed underline for very-fast. The mono `2.0x` text already helps — keep it.

### P1 — Inline styles are hard to debug and theme ★★
**Problem:** Heavy inline style objects make DevTools "Computed" the only way to inspect, block hot-reload of design tokens, and prevent `:hover`/`:focus`/`@media` from working.
**Fix:** Migrate interactive primitives to CSS classes (Tailwind v4 `@layer components` or a small `src/styles/components.css`). Keep inline styles for layout-only one-offs.

### P2 — No dark/light toggle, no theme hook ★
**Problem:** All tokens are dark-only. If a light theme is ever needed, every hardcoded hex breaks.
**Fix:** Define semantic tokens (`--surface`, `--text`, `--border`) that map to dark-mode hexes today, and can be remapped in a `[data-theme="light"]` block tomorrow. Even if light mode ships later, the refactor pays off now in clarity.

### P3 — Google Fonts render-blocking ★
**Problem:** `index.html` loads Outfit + JetBrains Mono via `<link>` without `font-display: swap` (Google's CSS handles it, but the CSS itself is render-blocking). First paint flashes fallback fonts.
**Fix:** Add `media="print" onload="this.media='all'"` trick or self-host the two families (woff2 subset) with `font-display: swap`.

---

## 5. Target design system

### 5.1 Token taxonomy (to implement in `globals.css`)

```css
@theme {
  /* Color families (semantic, not hue-named) */
  --color-bg:          #07080F;
  --color-surface:     #0E0F1E;
  --color-surface-2:   #13142A;
  --color-overlay:     #1A1B36;

  --color-border:        #1E2040;
  --color-border-subtle: #151628;
  --color-border-strong: #2A2C52;

  --color-text:        #EEEEF8;
  --color-text-muted:  #9898C0;   /* bumped from #7878A0 for AA on surface */
  --color-text-subtle: #5A5A7A;   /* decorative only, ~3.5:1 */
  --color-text-disabled:#24244A;

  --color-primary:        #8B6FFF;
  --color-primary-hover:  #7A5EEF;
  --color-primary-active: #6A4EDF;
  --color-primary-soft:   color-mix(in srgb, var(--color-primary) 12%, transparent);
  --color-primary-border: color-mix(in srgb, var(--color-primary) 28%, transparent);

  --color-accent:        #1CE4B8;
  --color-accent-soft:   color-mix(in srgb, var(--color-accent) 12%, transparent);
  --color-accent-border: color-mix(in srgb, var(--color-accent) 25%, transparent);

  --color-warning: #F59E0B;
  --color-error:   #FF6B78;
  --color-info:    #60A5FA;

  /* Speed tiers — referenced by speedColor() */
  --color-speed-slow:   #1CE4B8;
  --color-speed-normal: #8B6FFF;
  --color-speed-fast:   #F59E0B;
  --color-speed-vfast:  #FF6B78;

  /* Typography scale */
  --text-xs:      11px;
  --text-sm:      12px;
  --text-base:    13px;
  --text-md:      14px;
  --text-lg:      17px;
  --text-xl:      22px;
  --text-2xl:     36px;
  --text-display: clamp(42px, 6vw, 72px);

  /* Radii */
  --radius-xs:   6px;
  --radius-sm:   8px;
  --radius-md:   12px;
  --radius-lg:   20px;
  --radius-pill: 999px;

  /* Spacing scale (4px base) */
  --space-1: 4px;  --space-2: 8px;   --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px;  --space-8: 32px; --space-10: 40px;
  --space-12: 48px; --space-16: 64px; --space-20: 80px;

  /* Elevation */
  --shadow-card:  0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  --shadow-modal: 0 40px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
  --shadow-glow-primary: 0 0 28px rgba(139,111,255,0.28);
  --shadow-glow-accent:  0 0 28px rgba(28,228,184,0.22);

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 400ms;

  /* Layout */
  --toolbar-height: 56px;
  --panel-width: 240px;
  --scrim: rgba(0,0,0,0.78);
}
```

### 5.2 Primitive component API (to build in `src/components/ui/`)

```tsx
<Button variant="primary|ghost|subtle" size="sm|md|lg" loading?>…</Button>
<IconButton label="Close" variant="ghost">…</IconButton>
<Card padding="sm|md|lg" interactive?>…</Card>
<SectionLabel>File</SectionLabel>
<Toggle checked onChange>…</Toggle>
<SegmentedControl options={[{value,label}]} value onChange />
<Badge tone="primary|accent|warning|error|pro">…</Badge>
<Chip>…</Chip>
<Alert tone="error|warning|success|info" title?>…</Alert>
<Modal open onClose size="sm|md|lg">…</Modal>     // handles scrim, ESC, focus trap, reduced-motion
<Spinner size={13|16|24} />
<SpeedChip speed={1.2} />                          // wraps speedColor()
<ProgressBar value={0..100} phase?>…</ProgressBar> // shimmer + reduced-motion aware
```

### 5.3 Motion policy

- All decorative infinite animations (shimmer, pulse-glow, beatPulse, playhead, draw-path, spin) must be disabled under `@media (prefers-reduced-motion: reduce)`. Replace spinners with a static "Loading…" label where the spinner is the only signal.
- Entrance animations (`fadeUp`, `fadeIn`) cap at 600ms and stagger ≤ 350ms total.
- Hover transforms: max `translateY(-1px)`; never scale > 1.02 on interactive elements inside dense panels (jiggles the grid).

### 5.4 Accessibility floor

- All interactive text ≥ 4.5:1 against its bg. `--color-text-subtle` is decorative only.
- All icon-only buttons: `aria-label` + visible `:focus-visible` ring.
- All collapsible sections: `aria-expanded` + `aria-controls`.
- Speed tier signaled by glyph + color, not color alone.
- Modals: focus trap, restore focus on close, ESC to close, scroll lock.
- Keyboard shortcuts overlay reachable via `?` and from a menu (not just `?`).

---

## 6. Improvement roadmap (prioritized)

Each item is scoped to be independently shippable.

### Phase 1 — Foundation (no visual change, unblocks everything)
1. **Token-ize globals.css** per §5.1. Keep old tokens as aliases for one release.
2. **Build `src/components/ui/` primitives** per §5.2. Don't migrate callers yet.
3. **Centralize `speedColor` + `SpeedChip`** in `src/lib/speedColor.ts`.
4. **Add axe-core to Vitest** as a smoke test on key rendered components (Modal, Sidebar, TopBar).

### Phase 2 — Consistency pass (visible but low-risk)
5. **Replace inline hex with tokens** across Landing, TopBar, Sidebar, modals, auth (D1).
6. **Snap font sizes to type scale** (D2).
7. **Snap radii to scale** (D3).
8. **Migrate hover/focus to CSS classes** for Button, IconButton, SegmentedControl, Toggle (D4). Delete the `onMouseEnter`/`onMouseLeave` style-mutation pattern.
9. **Complete `prefers-reduced-motion` coverage** (D5).
10. **Bump `--color-text-muted` to `#9898C0` and `--color-text-subtle` to `#5A5A7A`**, audit essential-text usages and promote to `--color-text-muted` (A1).
11. **Consolidate modals** via the `Modal` primitive (D8) — same scrim, same entrance, same close button.

### Phase 3 — UX upgrades
12. **Locked-feature affordance redesign** (U1): full-color control + lock overlay + one-line preview.
13. **Pro → Free downgrade count reset** (U2).
14. **Smoothed export time estimate** (U3): "Estimating…" until 5%, then rolling average.
15. **Returning-user hero curve** (U4): show saved curve in Landing visualizer with "Continue editing".
16. **First-run coachmarks** (U5): 3-step inline tutorial, dismissable, remembered.
17. **Unified `<Alert>`** across DropZone, ExportModal, UpgradeModal, auth (U6).

### Phase 4 — Polish
18. **Self-host Outfit + JetBrains Mono** woff2 subsets with `font-display: swap` (P3).
19. **Color-blind speed glyphs** (A4): ▲/▼ on speed badges.
20. **`aria-expanded` audit** on beat panel and any collapsible UI (A3).
21. **Focus-visible polish** on segmented controls and icon buttons (A2).

### Phase 5 — Optional, bigger bets
22. **Light theme** via `[data-theme="light"]` semantic remap (P2).
23. **Adopt `lucide-react`** for icons to stop hand-rolling SVGs (D6).
24. **Skeleton loaders** for the heavy first-paint moments (model download, ffmpeg init) so users see structure before interactivity.

---

## 7. Anti-patterns to avoid (rules of the house)

- **No new hardcoded hex in components.** Use tokens or `color-mix` on tokens.
- **No inline `onMouseEnter`/`onMouseLeave` for hover.** Use CSS `:hover`.
- **No infinite animation without a reduced-motion guard.**
- **No essential text in `--color-text-subtle`.**
- **No speed color without the mono numeric label alongside it.**
- **No modal without a focus trap and ESC handler.**
- **No new `SectionCard`/`ToggleRow`/`SegmentedControl` duplication.** Import from `ui/`.
- **No marketing animation that doesn't pause under reduced-motion.**
- **No `console.log` in shipped UI** (the auth code has one — remove in a polish pass).

---

## 8. Quick reference — file → role map

When improving a specific surface, start here:

| Surface | Files |
|---|---|
| Tokens / motion | `src/styles/globals.css` |
| Marketing | `src/pages/Landing.tsx` |
| Editor shell | `src/App.tsx`, `src/components/TopBar.tsx`, `src/components/Sidebar.tsx` |
| Import | `src/components/DropZone.tsx` |
| Curve | `src/features/curve/CurveEditor.tsx`, `useCurveEditor.ts`, `PresetPanel.tsx` |
| Timeline | `src/features/timeline/Timeline.tsx`, `useTimeline.ts` |
| Preview | `src/features/preview/VideoPlayer.tsx`, `formatTime.ts` |
| Beat sync | `src/features/beatSync/BeatSyncPanel.tsx`, `src/lib/beatMapper.ts` |
| Export | `src/features/export/ExportModal.tsx`, `src/lib/exportLimits.ts`, `src/lib/ffmpegBridge.ts` |
| Upgrade | `src/components/UpgradeModal.tsx`, `src/pages/UpgradeSuccess.tsx` |
| Auth | `src/lib/auth.tsx`, `src/lib/firebase.ts` |
| Primitives (to build) | `src/components/ui/*` |
| Speed color (to centralize) | `src/lib/speedColor.ts` |

---

## 9. How to use this doc when making changes

1. **Before** touching a component, check §8 for the file's role and §2 for the current conventions it follows.
2. **Pick tokens from §5.1.** If a token doesn't exist, add it there rather than inventing a hex.
3. **Check §4** to see if the change addresses an open issue; if so, mark the issue closed in your PR description.
4. **Run the checklist:** tokens used (D1), type scale (D2), radius scale (D3), CSS hover (D4), reduced-motion guarded (D5), no duplicated primitive (D6), speed color centralized (D7), AA contrast (A1), focus visible (A2), aria labels (A3), color+glyph for speed (A4).
5. **Update this doc** if you introduce a new token, primitive, or motion rule.  