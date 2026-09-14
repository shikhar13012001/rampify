import type { VideoFile } from '@/types/editor';

function hasValidMetadata(duration: number) {
  return Number.isFinite(duration) && duration > 0;
}

/**
 * Reads duration/width/height out of a video File via a hidden <video> element.
 * Some browsers report 0×0 dimensions until a seek is forced, hence the
 * `currentTime = 1e10` trick (clamped to the real duration, which then fires
 * a 'seeked' event with real dimensions populated).
 */
export function readVideoMetadata(file: File): Promise<VideoFile> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let done = false;
    let seekTriggered = false;

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('loadeddata', tryFinish);
      video.removeEventListener('canplay', tryFinish);
      video.removeEventListener('durationchange', tryFinish);
      video.removeEventListener('seeked', tryFinish);
      video.removeEventListener('error', onError);
      video.src = '';
    };

    const finish = () => {
      const duration = video.duration;
      const width    = video.videoWidth;
      const height   = video.videoHeight;
      done = true;
      cleanup();
      resolve({ name: file.name, url, duration, width, height, size: file.size });
    };

    const tryFinish = () => {
      if (done) return;
      if (!hasValidMetadata(video.duration)) return;
      if (video.videoWidth === 0 && video.videoHeight === 0) {
        if (!seekTriggered) {
          seekTriggered = true;
          try { video.currentTime = 1e10; } catch { /* ignore */ }
        }
        return;
      }
      finish();
    };

    const onMetadata = () => {
      tryFinish();
      if (!done && !seekTriggered) {
        seekTriggered = true;
        try {
          video.currentTime = 1e10;
        } catch { /* ignore */ }
      }
    };

    const onError = () => {
      if (done) return;
      done = true;
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read video metadata'));
    };

    const timeout = setTimeout(() => {
      if (done) return;
      if (hasValidMetadata(video.duration)) {
        finish();
        return;
      }
      done = true;
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('No video track could be decoded from this file.'));
    }, 8000);

    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('loadeddata', tryFinish);
    video.addEventListener('canplay', tryFinish);
    video.addEventListener('durationchange', tryFinish);
    video.addEventListener('seeked', tryFinish);
    video.addEventListener('error', onError);
    video.src = url;
    video.load();
  });
}

const ACCEPTED_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const ACCEPTED_EXT = /\.(mp4|mov|webm)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|flac|ogg)$/i;

export function isAcceptedVideoFile(file: File): boolean {
  return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXT.test(file.name);
}

export function getRejectedFileMessage(file: File): string {
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) {
    return `"${file.name}" is an audio file, not a video. Rampcut only accepts MP4, MOV, or WebM video files.`;
  }
  return 'Only MP4, MOV, and WebM video files are supported.';
}
