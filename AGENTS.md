# Rampify — Codex Guide

## Stack

- React 19 + TypeScript 6 + Vite 8 + Tailwind CSS v4
- Zustand v5 for global state
- @ffmpeg/ffmpeg (wasm) for video processing, loaded in a Web Worker
- Vitest 4 for unit tests

## Path alias

`@/` maps to `./src/` — set in both `vite.config.ts` (resolve.alias) and `tsconfig.app.json` (paths).

## Key conventions

### SpeedPoint.time is NORMALIZED [0, 1]

All `SpeedCurve.points[*].time` values are in the range [0, 1] representing the fraction of a segment's
duration. They are only converted to seconds inside `curveMath.ts` (`buildSegments` multiplies by duration).
Do **not** store absolute seconds in SpeedPoint.time.

### Tailwind v4 config

Tailwind v4 uses a CSS-based config in `src/styles/globals.css` (no `tailwind.config.js`).
Custom design tokens live in the `@theme {}` block and `:root {}`.
Do **not** create a `tailwind.config.js`.

### TypeScript 6 quirks

- Use `RefObject<T | null>` (not `RefObject<T>`) for ref types passed to hooks.
- `"ignoreDeprecations": "6.0"` in `tsconfig.app.json` is required for `baseUrl`.
- Separate `vitest.config.ts` (using `defineConfig` from `vitest/config`) — do NOT merge into `vite.config.ts`.

### Canvas DPR scaling

All canvas hooks (`useTimeline`, `useCurveEditor`) scale by `window.devicePixelRatio` and render at CSS
pixel dimensions. Always call `ctx.save() / ctx.scale(dpr, dpr) / ctx.restore()`.

### SharedArrayBuffer (ffmpeg.wasm)

Requires COOP + COEP headers. Set in `vite.config.ts` (dev/preview) and `vercel.json` (production).

## Commands

```bash
npm run dev       # start dev server
npm run build     # type-check + bundle
npm run test      # run Vitest once
npm run test:watch
```

## Architecture

```
src/
  types/editor.ts          — shared interfaces (VideoFile, SpeedPoint, SpeedCurve, Segment, EditorProject)
  store/editorStore.ts     — Zustand store with undo history
  lib/
    curveMath.ts           — pure math: interpolation, remapTime, curveToFFmpegFilter
    presets.ts             — 5 built-in speed curves (normalized times)
    ffmpegBridge.ts        — manages Web Worker lifecycle
    exportLimits.ts        — localStorage guest export counter
  components/
    TopBar.tsx             — header with export button
    DropZone.tsx           — drag/drop video import
    Sidebar.tsx            — segment list + curve editor + presets
    ErrorBoundary.tsx      — React error boundary
  features/
    preview/VideoPlayer.tsx   — video element + transport bar + playbackRate preview
    timeline/Timeline.tsx     — canvas ruler + segment track + waveform
    timeline/useTimeline.ts   — canvas drawing hook
    curve/CurveEditor.tsx     — canvas speed curve editor
    curve/useCurveEditor.ts   — canvas drawing + mouse interaction hook
    curve/PresetPanel.tsx     — preset selector buttons
    export/ExportModal.tsx    — ffmpeg export UI
  workers/
    ffmpegWorker.ts        — Web Worker: @ffmpeg/ffmpeg setpts+atempo pipeline
  hooks/
    useKeyboardShortcuts.ts  — Space, arrows, S (split), Delete, Ctrl+Z, Ctrl+E
```
