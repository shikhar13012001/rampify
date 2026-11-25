/**
 * Single source of truth for "what went wrong with this export" — used by both
 * the user-facing message (ExportModal) and the analytics event, so the UI and
 * the data can never disagree about a failure's category.
 *
 * Before this module, ExportModal's friendlyErrorMessage and analytics.ts's
 * classifyErrorStage each substring-matched five patterns; every other failure
 * the pipeline can really throw (out-of-memory, soundtrack/caption asset
 * fetches, AI-model load, concat/mux errors, preflight rejections, expired
 * media URLs…) fell through to stage `unknown` and the generic "Export failed.
 * Please try again." — no cause, no next step, and nothing actionable in the
 * analytics. The rules below are derived from the error strings that
 * ffmpegWorker.ts, LocalWasmEngine.ts, exportCoordinator.ts, frameExtractor.ts,
 * slowMotionPipeline.ts and renderPlan.ts actually produce.
 *
 * Privacy: only the closed-set stage/code/retryable leave the device. The raw
 * message (which can contain a blob URL fragment or log lines) never does.
 */

export type ExportFailureStage =
  | 'worker_load'
  | 'input_validation'
  | 'processing'
  | 'muxing'
  | 'output_validation'
  | 'download_preparation'
  | 'unknown';

export interface ExportFailure {
  stage: ExportFailureStage;
  /** Stable snake_case code, safe to send to analytics. */
  code: string;
  /** Would simply trying again plausibly succeed? Drives the Retry affordance. */
  retryable: boolean;
  /** Plain-language explanation plus the next step — shown to the user. */
  userMessage: string;
}

/** Errors raised by the preflight gate carry its machine code (see exportCoordinator). */
export class ExportPreflightError extends Error {
  readonly preflightCode: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ExportPreflightError';
    this.preflightCode = code;
  }
}

interface Rule {
  test: (lower: string) => boolean;
  failure: ExportFailure;
}

const has = (...needles: string[]) => (lower: string) => needles.some((n) => lower.includes(n));

// Order matters: the first match wins, so specific causes precede general ones
// (e.g. out-of-memory is checked before the generic "ffmpeg exited" rule, since
// a WASM OOM is reported through that very exit path).
const RULES: Rule[] = [
  {
    test: has('out of memory', 'memory access out of bounds', 'cannot enlarge memory', 'array buffer allocation failed', 'allocation failed', 'invalid array length', 'wasm memory'),
    failure: {
      stage: 'processing',
      code: 'out_of_memory',
      retryable: true,
      userMessage: 'Your browser ran out of memory rendering this clip. Close other tabs, then try a shorter clip, 1080p instead of 4K, or turn off AI slow-motion.',
    },
  },
  {
    // Worker died mid-job without a message (see workerError.ts) - in practice
    // almost always the browser killing it for memory.
    test: has('worker crashed during processing'),
    failure: {
      stage: 'processing',
      code: 'worker_crashed',
      retryable: true,
      userMessage: 'The video engine stopped unexpectedly, most often because the browser ran out of memory. Close other tabs and try again, or try a shorter clip or 1080p instead of 4K.',
    },
  },
  {
    test: has('model initialization timed out', 'model unavailable', 'failed to download model', 'onnx', 'inference request'),
    failure: {
      stage: 'worker_load',
      code: 'ai_model_unavailable',
      retryable: true,
      userMessage: "The AI slow-motion model couldn't load. Check your connection and try again, or turn off AI slow-motion to export without it.",
    },
  },
  {
    test: has('[loadffmpeg]', 'failed to load', 'coreurl', 'worker error', 'importscripts', 'dynamically imported module', 'loading chunk', 'chunkloaderror', 'failed to construct \'url\'', 'script error'),
    failure: {
      stage: 'worker_load',
      code: 'worker_load_failed',
      retryable: true,
      userMessage: "The video engine couldn't load. Check your connection and try again. If it keeps failing, reload the page (your project is autosaved) or try a current Chrome, Edge or Firefox.",
    },
  },
  {
    test: has('caption font is unavailable'),
    failure: {
      stage: 'input_validation',
      code: 'caption_font_unavailable',
      retryable: true,
      userMessage: "The caption font couldn't be downloaded. Reconnect and try again, or turn captions off for this export.",
    },
  },
  {
    test: has('soundtrack is unavailable'),
    failure: {
      stage: 'input_validation',
      code: 'soundtrack_unavailable',
      retryable: false,
      userMessage: 'The music file is no longer available in this browser session. Re-add the soundtrack, then export again.',
    },
  },
  {
    test: has('video load error', 'metadata load timeout', 'could not decode source frame', 'frame capture timed out', '[fetchfile]', 'videourl is missing'),
    failure: {
      stage: 'input_validation',
      code: 'input_unreadable',
      retryable: false,
      userMessage: "This clip couldn't be read for processing. Re-load the video (MP4/H.264 or WebM work best) and try again.",
    },
  },
  {
    test: has('invalid or empty clip', 'invalid or overlapping', 'invalid speed curve', 'duplicate curve time', 'duplicate clip identity', 'duplicate segment identity', 'job exceeds supported timing'),
    failure: {
      stage: 'input_validation',
      code: 'invalid_timeline',
      retryable: false,
      userMessage: 'The timeline has a segment or speed curve this exporter cannot render. Simplify the curve (fewer points) or undo the last edit, then export again.',
    },
  },
  {
    test: has('account changed during export checks'),
    failure: {
      stage: 'input_validation',
      code: 'account_changed',
      retryable: true,
      userMessage: 'You signed in or out while the export was being prepared. Start the export again with the account you want to use.',
    },
  },
  {
    test: has('concatenated output', 'concat exited', 'concatenation failed', 'soundtrack mixing failed', 'audio/effects composition failed'),
    failure: {
      stage: 'muxing',
      code: 'mux_failed',
      retryable: true,
      userMessage: "The video was rendered but couldn't be combined with its audio. Try again; if it repeats, export without the soundtrack.",
    },
  },
  {
    test: has('suspiciously small', 'encode likely failed', 'export produced no file', 'no interpolated frames'),
    failure: {
      stage: 'output_validation',
      code: 'output_unusable',
      retryable: true,
      userMessage: 'The export finished but produced no usable video. Try again, or try a shorter clip or a simpler speed curve.',
    },
  },
  {
    test: has('usage synchronization', 'sign back into the account'),
    failure: {
      stage: 'download_preparation',
      code: 'usage_sync_pending',
      retryable: true,
      userMessage: 'Your file is ready, but usage syncing is pending. Reconnect or sign back into the account that started this export.',
    },
  },
  {
    test: has('already running', 'still in progress', 'already in progress'),
    failure: {
      stage: 'processing',
      code: 'already_running',
      retryable: true,
      userMessage: 'Another export is still running. Wait for it to finish (or cancel it), then try again.',
    },
  },
  {
    test: has('ffmpeg exited with code', 'ai chunk', 'encoding failed', 'chunk encoding'),
    failure: {
      stage: 'processing',
      code: 'encoder_failed',
      retryable: true,
      userMessage: 'The video encoder hit an error on this clip. Try again; if it repeats, try 1080p, a shorter clip, or fewer speed-curve points.',
    },
  },
];

const UNKNOWN: ExportFailure = {
  stage: 'unknown',
  code: 'unknown',
  retryable: true,
  userMessage: 'Export failed for an unexpected reason. Try again; if it repeats, reload the page (your project is autosaved) and use "Technical details" when you contact support.',
};

/**
 * Preflight gate rejections (exportCoordinator.ts + exportPolicy.ts) already
 * carry a user-facing message; this maps their machine code to a stable
 * analytics code. An allowlist - an unrecognized code is reported as
 * `preflight_rejected` rather than echoed, so a future caller can never push
 * arbitrary text into analytics through this path.
 */
const PREFLIGHT_CODES: Record<string, { code: string; retryable: boolean }> = {
  update: { code: 'app_updating', retryable: true },
  quota: { code: 'export_limit_reached', retryable: false },
  plan: { code: 'plan_restricted', retryable: false },
  browser: { code: 'browser_unsupported', retryable: false },
  capacity: { code: 'job_too_large', retryable: false },
  combination: { code: 'unsupported_combination', retryable: false },
  clips: { code: 'invalid_clips', retryable: false },
  media: { code: 'media_unavailable', retryable: false },
  soundtrack: { code: 'soundtrack_invalid', retryable: false },
  timeline: { code: 'invalid_timeline', retryable: false },
};

/**
 * Classifies anything thrown/rejected by the export pipeline. Never throws,
 * and never returns text derived from the raw message in `code`/`stage`.
 */
export function classifyExportFailure(error: unknown): ExportFailure {
  try {
    if (error instanceof ExportPreflightError) {
      const known = PREFLIGHT_CODES[error.preflightCode];
      return {
        stage: 'input_validation',
        code: known?.code ?? 'preflight_rejected',
        retryable: known?.retryable ?? false,
        userMessage: error.message || UNKNOWN.userMessage,
      };
    }
    const raw = error instanceof Error ? `${error.name}: ${error.message}` : typeof error === 'string' ? error : '';
    const lower = raw.toLowerCase();
    for (const rule of RULES) {
      if (rule.test(lower)) return rule.failure;
    }
    return UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/** Coarse buckets so size/length can be analysed without exact (identifying) values. */
export function fileSizeBucket(bytes: number | null | undefined): 'lt50' | '50_200' | '200_500' | 'gt500' | 'unknown' {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return 'unknown';
  const mb = bytes / (1024 * 1024);
  if (mb < 50) return 'lt50';
  if (mb < 200) return '50_200';
  if (mb < 500) return '200_500';
  return 'gt500';
}

export function durationBucket(seconds: number | null | undefined): 'lt10' | '10_30' | '30_60' | '60_180' | 'gt180' | 'unknown' {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return 'unknown';
  if (seconds < 10) return 'lt10';
  if (seconds < 30) return '10_30';
  if (seconds < 60) return '30_60';
  if (seconds < 180) return '60_180';
  return 'gt180';
}
