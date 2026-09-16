import { describe, expect, it } from 'vitest';
import { buildCaptionSrt, hasStrongSpeedRamp } from './ffmpegBridge';
import type { Segment } from '@/types/editor';

function flatSegment(speed = 1, duration = 10): Segment {
  return {
    id: 'seg1',
    startTime: 0,
    endTime: duration,
    curve: { type: 'linear', points: [{ time: 0, speed }, { time: 1, speed }] },
  };
}

function rampedSegment(duration = 10): Segment {
  return {
    id: 'seg1',
    startTime: 0,
    endTime: duration,
    curve: { type: 'linear', points: [{ time: 0, speed: 0.3 }, { time: 0.5, speed: 3 }, { time: 1, speed: 0.3 }] },
  };
}

describe('hasStrongSpeedRamp', () => {
  it('is false for a flat (constant-speed) segment', () => {
    expect(hasStrongSpeedRamp(flatSegment())).toBe(false);
  });

  it('is true for a segment with a steep speed transition', () => {
    expect(hasStrongSpeedRamp(rampedSegment())).toBe(true);
  });
});

describe('buildCaptionSrt', () => {
  it('returns null for no cues', () => {
    expect(buildCaptionSrt([], flatSegment(), 10)).toBeNull();
  });

  it('produces valid SRT with remapped (2x -> half the duration) timestamps for a flat 2x segment', () => {
    const srt = buildCaptionSrt(
      [{ start: 2, end: 4, text: 'hello' }],
      flatSegment(2, 10),
      10,
    );
    expect(srt).toBeTruthy();
    // At a flat 2x speed, input second 2-4 maps to output second 1-2.
    expect(srt).toContain('00:00:01,000 --> 00:00:02,000');
    expect(srt).toContain('hello');
  });

  it('drops cues entirely outside [0, duration]', () => {
    const srt = buildCaptionSrt(
      [{ start: 20, end: 25, text: 'stale cue from a longer clip' }],
      flatSegment(1, 10),
      10,
    );
    expect(srt).toBeNull();
  });

  it('drops a cue whose end exceeds duration but keeps one that fits', () => {
    const srt = buildCaptionSrt(
      [
        { start: 8, end: 15, text: 'too long' },
        { start: 1, end: 2, text: 'fits fine' },
      ],
      flatSegment(1, 10),
      10,
    );
    expect(srt).toContain('fits fine');
    expect(srt).not.toContain('too long');
  });
});
