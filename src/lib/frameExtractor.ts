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
