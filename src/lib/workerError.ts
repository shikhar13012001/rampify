/**
 * Turns a Worker `error` event into a non-empty, classifiable message.
 *
 * Why this exists: `ErrorEvent.message` is the empty string (not null/undefined)
 * when a worker dies without throwing a JS error - the typical shape of a WASM
 * out-of-memory kill or a crashed encoder. The old code did
 * `new Error(ev.message ?? 'Worker error')`, and `'' ?? x` is `''`, so the
 * export failed with `Error('')`: stage `unknown`, a generic "Export failed"
 * toast, and a "Technical details" panel that hid itself because the message
 * was falsy. Nothing about the failure survived.
 *
 * The two cases are told apart by whether the worker had ever talked to us:
 *   - never replied  -> it failed to start/load            ("Worker error: ...")
 *   - replied before -> it died mid-job (usually memory)   ("Worker crashed ...")
 * exportFailure.ts classifies these two prefixes.
 */
export const WORKER_FAILED_TO_START = 'Worker error: the video engine failed to start';
export const WORKER_CRASHED = 'Worker crashed during processing (no error message was reported)';

export function workerErrorMessage(event: { message?: string | null } | null | undefined, hadMessageFromWorker: boolean): string {
  const real = typeof event?.message === 'string' ? event.message.trim() : '';
  if (real) return real;
  return hadMessageFromWorker ? WORKER_CRASHED : WORKER_FAILED_TO_START;
}
