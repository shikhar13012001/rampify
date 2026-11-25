import { describe, expect, it } from 'vitest';
import {
  ExportPreflightError,
  classifyExportFailure,
  durationBucket,
  fileSizeBucket,
} from './exportFailure';

// Every raw string below is one the pipeline can actually produce — taken from
// ffmpegWorker.ts, LocalWasmEngine.ts, exportCoordinator.ts, frameExtractor.ts,
// slowMotionPipeline.ts, renderPlan.ts and exportLimits.ts. Any new failure
// that lands in `unknown` in production is a signal to add a row here.
const CASES: Array<[string, string, string, boolean]> = [
  // raw message,                                                       stage,              code,                    retryable
  ['[loadFFmpeg] TypeError: Failed to construct \'URL\': Invalid URL (coreURL=/assets/x.js)', 'worker_load', 'worker_load_failed', true],
  ['Worker error', 'worker_load', 'worker_load_failed', true],
  ['Failed to fetch dynamically imported module: /assets/motionBlurWorker.js', 'worker_load', 'worker_load_failed', true],
  ['Model initialization timed out', 'worker_load', 'ai_model_unavailable', true],
  ['RuntimeError: memory access out of bounds', 'processing', 'out_of_memory', true],
  ['RangeError: Array buffer allocation failed', 'processing', 'out_of_memory', true],
  ['ffmpeg exited with code 1\n\nLast log lines:\nsomething', 'processing', 'encoder_failed', true],
  ['AI chunk encoding failed.', 'processing', 'encoder_failed', true],
  ['Invalid AI chunk order or size.', 'processing', 'encoder_failed', true],
  ['An export is already running.', 'processing', 'already_running', true],
  ['Another export is still in progress', 'processing', 'already_running', true],
  ['Video load error', 'input_validation', 'input_unreadable', false],
  ['Video metadata load timeout', 'input_validation', 'input_unreadable', false],
  ['Could not decode source frame.', 'input_validation', 'input_unreadable', false],
  ['Frame capture timed out at 3.2s', 'input_validation', 'input_unreadable', false],
  ['[fetchFile] videoUrl is missing or not a string (received: undefined)', 'input_validation', 'input_unreadable', false],
  ['Invalid speed curve', 'input_validation', 'invalid_timeline', false],
  ['Invalid or overlapping segments', 'input_validation', 'invalid_timeline', false],
  ['Job exceeds supported timing complexity', 'input_validation', 'invalid_timeline', false],
  ['Soundtrack is unavailable.', 'input_validation', 'soundtrack_unavailable', false],
  ['Caption font is unavailable. Reconnect and retry.', 'input_validation', 'caption_font_unavailable', true],
  ['Account changed during export checks. Start again with the current account.', 'input_validation', 'account_changed', true],
  ['ffmpeg concat exited with code 1.', 'muxing', 'mux_failed', true],
  ['Soundtrack mixing failed.', 'muxing', 'mux_failed', true],
  ['AI concatenation failed.', 'muxing', 'mux_failed', true],
  ['Output file is suspiciously small (12 bytes) — encode likely failed', 'output_validation', 'output_unusable', true],
  ['Export produced no file', 'output_validation', 'output_unusable', true],
  ['Export saved; usage synchronization is pending.', 'download_preparation', 'usage_sync_pending', true],
];

describe('classifyExportFailure', () => {
  it.each(CASES)('classifies %j', (raw, stage, code, retryable) => {
    const failure = classifyExportFailure(new Error(raw));
    expect(failure.stage).toBe(stage);
    expect(failure.code).toBe(code);
    expect(failure.retryable).toBe(retryable);
    expect(failure.userMessage.length).toBeGreaterThan(20);
  });

  it('classifies plain strings the same as Error objects', () => {
    expect(classifyExportFailure('ffmpeg exited with code 1').code).toBe('encoder_failed');
  });

  it('prefers a specific cause over a generic one: out-of-memory beats "ffmpeg exited"', () => {
    const failure = classifyExportFailure(new Error('ffmpeg exited with code 1: memory access out of bounds'));
    expect(failure.code).toBe('out_of_memory');
  });

  it('falls back to unknown for anything unrecognized, still retryable, never echoing the raw text', () => {
    const raw = 'some brand new failure involving /Users/me/Videos/private-birthday.mp4 and token abc123';
    const failure = classifyExportFailure(new Error(raw));
    expect(failure.stage).toBe('unknown');
    expect(failure.code).toBe('unknown');
    expect(failure.retryable).toBe(true);
    for (const value of [failure.stage, failure.code, failure.userMessage]) {
      expect(value).not.toContain('private-birthday');
      expect(value).not.toContain('abc123');
    }
  });

  it('never throws on hostile input', () => {
    for (const input of [null, undefined, 42, {}, [], Symbol('x'), { message: 'x' }]) {
      expect(() => classifyExportFailure(input)).not.toThrow();
      expect(classifyExportFailure(input).stage).toBe('unknown');
    }
  });

  it('only ever yields analytics-safe codes (snake_case, bounded)', () => {
    for (const [raw] of CASES) {
      expect(classifyExportFailure(new Error(raw)).code).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
    }
  });

  describe('preflight rejections', () => {
    it('keep their own user-facing message and are not retryable when the cause is the plan/quota', () => {
      const quota = classifyExportFailure(new ExportPreflightError('quota', 'You have used all 3 free exports this month.'));
      expect(quota).toMatchObject({ stage: 'input_validation', code: 'export_limit_reached', retryable: false });
      expect(quota.userMessage).toBe('You have used all 3 free exports this month.');
    });

    it('marks an in-progress app update as retryable', () => {
      expect(classifyExportFailure(new ExportPreflightError('update', 'The app is updating.'))).toMatchObject({
        code: 'app_updating',
        retryable: true,
      });
    });

    it('reports an unrecognized preflight code as preflight_rejected instead of echoing it', () => {
      const failure = classifyExportFailure(new ExportPreflightError('Weird Code!! /path/secret.mp4', 'Nope.'));
      expect(failure.code).toBe('preflight_rejected');
      expect(failure.stage).toBe('input_validation');
    });

    it('maps every code exportPolicy.ts can emit to a stable analytics code', () => {
      for (const code of ['plan', 'browser', 'capacity', 'combination', 'clips', 'media', 'soundtrack', 'timeline', 'update', 'quota']) {
        const failure = classifyExportFailure(new ExportPreflightError(code, 'msg that is long enough'));
        expect(failure.code).not.toBe('preflight_rejected');
      }
    });
  });
});

describe('size and duration buckets', () => {
  it('bucket file size without exposing exact bytes', () => {
    expect(fileSizeBucket(10 * 1024 * 1024)).toBe('lt50');
    expect(fileSizeBucket(120 * 1024 * 1024)).toBe('50_200');
    expect(fileSizeBucket(300 * 1024 * 1024)).toBe('200_500');
    expect(fileSizeBucket(900 * 1024 * 1024)).toBe('gt500');
    expect(fileSizeBucket(undefined)).toBe('unknown');
    expect(fileSizeBucket(0)).toBe('unknown');
    expect(fileSizeBucket(Number.NaN)).toBe('unknown');
  });

  it('bucket duration', () => {
    expect(durationBucket(5)).toBe('lt10');
    expect(durationBucket(10)).toBe('10_30');
    expect(durationBucket(45)).toBe('30_60');
    expect(durationBucket(120)).toBe('60_180');
    expect(durationBucket(600)).toBe('gt180');
    expect(durationBucket(null)).toBe('unknown');
  });
});
