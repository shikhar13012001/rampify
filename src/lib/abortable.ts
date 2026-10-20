/** Settle immediately on abort, disposing values that arrive after cancellation. */
export function abortable<T>(work: Promise<T>, signal: AbortSignal, disposeLate?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    work.then(value => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) { disposeLate?.(value); abort(); } else resolve(value);
    }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
