/**
 * Privacy-safe capture of errors that escape React's ErrorBoundary:
 * uncaught exceptions in event handlers/timers/workers' main-thread glue, and
 * unhandled promise rejections. Before this, only render-time errors
 * (ErrorBoundary → `ui_error` stage `ui_render`) were visible; a crash in an
 * async handler left no trace at all.
 *
 * It reuses the first-party pipeline (trackEvent → /api/track-event) instead
 * of a third-party monitor: no new vendor, no new data processor, no DSN.
 * The trade-off is deliberate and stated: this tells you THAT and HOW OFTEN a
 * class of error happens, per route/browser/version - not stack traces. A
 * stack-trace tool (e.g. Sentry) is a separate, opt-in decision.
 *
 * Only a closed-set error class goes out - never message text, stack, file
 * names or URLs, any of which can contain user paths or media names.
 */
import { trackEvent } from './analytics';

export type GlobalErrorStage = 'ui_unhandled' | 'ui_rejection';

const KNOWN_KINDS = new Set([
  'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'EvalError', 'URIError',
  'AbortError', 'NetworkError', 'NotAllowedError', 'NotFoundError', 'NotSupportedError',
  'QuotaExceededError', 'SecurityError', 'InvalidStateError', 'DataCloneError', 'EncodingError',
]);

/** Lower-snake error class from a closed set; anything else is `other`. */
export function errorKind(value: unknown): string {
  const name = value instanceof Error || (typeof DOMException !== 'undefined' && value instanceof DOMException)
    ? (value as { name?: string }).name
    : undefined;
  if (typeof name === 'string' && KNOWN_KINDS.has(name)) {
    return name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }
  return 'other';
}

/**
 * Known-noise filter. These are browser/extension artefacts that say nothing
 * about the app and would otherwise drown the signal.
 */
export function isIgnorableError(event: { message?: string; filename?: string; error?: unknown }): boolean {
  const message = event.message ?? '';
  if (/ResizeObserver loop/i.test(message)) return true;
  // Cross-origin scripts report only "Script error." with no detail.
  if (message === 'Script error.' && !event.filename) return true;
  if (/^(chrome|moz|safari)-extension:\/\//i.test(event.filename ?? '')) return true;
  return false;
}

export const MAX_GLOBAL_ERRORS_PER_PAGE = 5;

interface Reporter {
  report(stage: GlobalErrorStage, error: unknown): boolean;
}

/** Pure core (injectable sink) so the budget/dedupe rules are unit-testable. */
export function createErrorReporter(send: (stage: GlobalErrorStage, kind: string) => void, max = MAX_GLOBAL_ERRORS_PER_PAGE): Reporter {
  const seen = new Set<string>();
  let sent = 0;
  return {
    report(stage, error) {
      const kind = errorKind(error);
      const key = `${stage}:${kind}`;
      // One report per (stage, class) per page load, and a hard overall cap,
      // so an error in a render loop can't flood Firestore.
      if (seen.has(key) || sent >= max) return false;
      seen.add(key);
      sent += 1;
      try {
        send(stage, kind);
      } catch {
        // Monitoring must never throw.
      }
      return true;
    },
  };
}

type Target = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/** Installs the listeners; returns an uninstall function. Safe to call once at startup. */
export function installGlobalErrorTracking(target: Target = window): () => void {
  const reporter = createErrorReporter((stage, kind) => {
    trackEvent({
      name: 'ui_error',
      props: {
        stage,
        errorCode: kind,
        path: typeof location !== 'undefined' ? location.pathname.slice(0, 120) : '',
      },
    });
  });

  const onError = (event: Event) => {
    const e = event as ErrorEvent;
    // Resource load failures (img/script/link) bubble here as plain Events with
    // no message; those are network noise, not app errors.
    if (typeof e.message !== 'string') return;
    if (isIgnorableError(e)) return;
    reporter.report('ui_unhandled', e.error);
  };
  const onRejection = (event: Event) => {
    reporter.report('ui_rejection', (event as PromiseRejectionEvent).reason);
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
