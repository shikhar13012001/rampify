import { describe, expect, it } from 'vitest';
import { WORKER_CRASHED, WORKER_FAILED_TO_START, workerErrorMessage } from './workerError';
import { classifyExportFailure } from './exportFailure';

describe('workerErrorMessage', () => {
  it('keeps a real worker message', () => {
    expect(workerErrorMessage({ message: 'Uncaught RangeError: x' }, true)).toBe('Uncaught RangeError: x');
  });

  it('REGRESSION: an empty ErrorEvent.message (what a crashed/OOM worker reports) is never turned into an empty Error', () => {
    // Old behaviour: new Error(ev.message ?? 'Worker error') === new Error('') for ''.
    expect(workerErrorMessage({ message: '' }, true)).not.toBe('');
    expect(workerErrorMessage({ message: '   ' }, false)).not.toBe('');
    expect(workerErrorMessage(undefined, true)).not.toBe('');
    expect(workerErrorMessage({ message: null }, false)).not.toBe('');
  });

  it('distinguishes a worker that never started from one that died mid-job', () => {
    expect(workerErrorMessage({ message: '' }, false)).toBe(WORKER_FAILED_TO_START);
    expect(workerErrorMessage({ message: '' }, true)).toBe(WORKER_CRASHED);
  });

  it('both generated messages are classified (not "unknown") with the right guidance', () => {
    const start = classifyExportFailure(new Error(workerErrorMessage({ message: '' }, false)));
    expect(start).toMatchObject({ stage: 'worker_load', code: 'worker_load_failed', retryable: true });
    const crash = classifyExportFailure(new Error(workerErrorMessage({ message: '' }, true)));
    expect(crash).toMatchObject({ stage: 'processing', code: 'worker_crashed', retryable: true });
    expect(crash.userMessage).toMatch(/memory/i);
  });

  it('the old empty-string behaviour would have been unclassifiable (documents the bug)', () => {
    expect(classifyExportFailure(new Error('')).code).toBe('unknown');
  });
});
