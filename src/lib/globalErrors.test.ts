import { describe, expect, it, vi } from 'vitest';
import { createErrorReporter, errorKind, installGlobalErrorTracking, isIgnorableError, MAX_GLOBAL_ERRORS_PER_PAGE } from './globalErrors';

describe('errorKind', () => {
  it('maps known error classes to a closed lower-snake set', () => {
    expect(errorKind(new TypeError('x'))).toBe('type_error');
    expect(errorKind(new RangeError('x'))).toBe('range_error');
    expect(errorKind(new DOMException('x', 'QuotaExceededError'))).toBe('quota_exceeded_error');
    expect(errorKind(new DOMException('x', 'AbortError'))).toBe('abort_error');
  });

  it('reports anything else — custom errors, strings, objects, null — as "other", never echoing text', () => {
    class SecretLeakError extends Error { constructor() { super('/Users/me/private.mp4'); this.name = 'SecretLeakError'; } }
    expect(errorKind(new SecretLeakError())).toBe('other');
    expect(errorKind('boom /Users/me/private.mp4')).toBe('other');
    expect(errorKind({ message: 'x' })).toBe('other');
    expect(errorKind(null)).toBe('other');
    expect(errorKind(undefined)).toBe('other');
  });

  it('every output is a valid analytics errorCode', () => {
    for (const v of [new TypeError(), new DOMException('', 'SecurityError'), 1, 'x', null]) {
      expect(errorKind(v)).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
    }
  });
});

describe('isIgnorableError', () => {
  it('drops browser/extension noise but keeps real app errors', () => {
    expect(isIgnorableError({ message: 'ResizeObserver loop completed with undelivered notifications.' })).toBe(true);
    expect(isIgnorableError({ message: 'Script error.' })).toBe(true);
    expect(isIgnorableError({ message: 'x', filename: 'chrome-extension://abc/content.js' })).toBe(true);
    expect(isIgnorableError({ message: 'Cannot read properties of undefined', filename: 'https://rampcut.astralbuild.dev/assets/index.js' })).toBe(false);
    // "Script error." WITH a filename is a real same-origin error message.
    expect(isIgnorableError({ message: 'Script error.', filename: 'https://rampcut.astralbuild.dev/a.js' })).toBe(false);
  });
});

describe('createErrorReporter', () => {
  it('reports each (stage, class) once per page load', () => {
    const send = vi.fn();
    const reporter = createErrorReporter(send);
    expect(reporter.report('ui_unhandled', new TypeError())).toBe(true);
    expect(reporter.report('ui_unhandled', new TypeError())).toBe(false);
    expect(reporter.report('ui_rejection', new TypeError())).toBe(true);
    expect(reporter.report('ui_unhandled', new RangeError())).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledWith('ui_unhandled', 'type_error');
  });

  it('has a hard cap so an error loop cannot flood storage', () => {
    const send = vi.fn();
    const reporter = createErrorReporter(send);
    const kinds = [TypeError, ReferenceError, RangeError, SyntaxError, EvalError, URIError];
    for (const K of kinds) reporter.report('ui_unhandled', new K());
    for (const K of kinds) reporter.report('ui_rejection', new K());
    expect(send).toHaveBeenCalledTimes(MAX_GLOBAL_ERRORS_PER_PAGE);
  });

  it('never throws even if the sink does', () => {
    const reporter = createErrorReporter(() => { throw new Error('sink down'); });
    expect(() => reporter.report('ui_unhandled', new TypeError())).not.toThrow();
  });
});

describe('installGlobalErrorTracking', () => {
  function fakeTarget() {
    const handlers = new Map<string, (e: Event) => void>();
    return {
      target: {
        addEventListener: (type: string, fn: (e: Event) => void) => { handlers.set(type, fn); },
        removeEventListener: (type: string) => { handlers.delete(type); },
      } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
      handlers,
    };
  }

  it('registers both listeners and removes them on uninstall', () => {
    const { target, handlers } = fakeTarget();
    const uninstall = installGlobalErrorTracking(target);
    expect([...handlers.keys()].sort()).toEqual(['error', 'unhandledrejection']);
    uninstall();
    expect(handlers.size).toBe(0);
  });

  it('ignores resource-load failures (plain Events without a message) and noise, never throwing', () => {
    const { target, handlers } = fakeTarget();
    installGlobalErrorTracking(target);
    const onError = handlers.get('error')!;
    expect(() => onError({ type: 'error' } as unknown as Event)).not.toThrow();
    expect(() => onError({ message: 'ResizeObserver loop limit exceeded' } as unknown as Event)).not.toThrow();
    expect(() => handlers.get('unhandledrejection')!({ reason: new TypeError('x') } as unknown as Event)).not.toThrow();
  });
});
