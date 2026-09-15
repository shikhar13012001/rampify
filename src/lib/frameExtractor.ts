/**
 * Extracts frames from a video element at the specified timestamps.
 *
 * The returned ImageBitmaps must be closed by the caller after use to avoid
 * memory leaks: `frames.forEach(f => f.close())`.
 *
 * The video element should be paused before calling this function.
 * Uses requestVideoFrameCallback for accurate frame extraction when available,
 * falling back to the 'seeked' event for broader compatibility.
 */
export async function extractFrames(
  videoElement: HTMLVideoElement,
  times: number[],
): Promise<ImageBitmap[]> {
  const frames: ImageBitmap[] = [];
  for (const time of times) {
    frames.push(await seekAndCapture(videoElement, time));
  }
  return frames;
}

function seekAndCapture(video: HTMLVideoElement, time: number): Promise<ImageBitmap> {
  return new Promise<ImageBitmap>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Frame capture timed out at ${time}s`)),
      5000,
    );

    const done = () => {
      clearTimeout(timeout);
      createImageBitmap(video).then(resolve, reject);
    };

    // Assigning currentTime a value it already holds is a no-op in most
    // browsers: no real seek happens, so neither 'seeked' nor
    // requestVideoFrameCallback ever fire and this hangs until the 5s
    // timeout. This is the common case for time = 0 — a freshly created
    // <video> already starts at currentTime 0 (confirmed production bug:
    // "Frame capture timed out at 0s" on the first blur transition frame).
    // Wait for decoded frame data instead of a seek-completion event here.
    if (Math.abs(video.currentTime - time) < 0.001) {
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        done();
      } else {
        video.addEventListener('loadeddata', done, { once: true });
      }
      return;
    }

    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      // rVFC fires after the sought frame is composited — more accurate than 'seeked'.
      video.requestVideoFrameCallback(done);
    } else {
      video.addEventListener('seeked', function handler() {
        video.removeEventListener('seeked', handler);
        done();
      });
    }

    video.currentTime = time;
  });
}
