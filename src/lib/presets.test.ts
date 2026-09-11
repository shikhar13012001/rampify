import { describe, it, expect } from 'vitest';
import { PRESETS, heroMoment } from './presets';

describe('PRESETS catalog', () => {
  it('every preset id is unique', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every curve has at least 2 points spanning 0 to 1', () => {
    for (const preset of PRESETS) {
      expect(preset.curve.points.length).toBeGreaterThanOrEqual(2);
      expect(preset.curve.points[0].time).toBe(0);
      expect(preset.curve.points[preset.curve.points.length - 1].time).toBe(1);
    }
  });

  it('points are sorted by time within each curve', () => {
    for (const preset of PRESETS) {
      const times = preset.curve.points.map((p) => p.time);
      const sorted = [...times].sort((a, b) => a - b);
      expect(times).toEqual(sorted);
    }
  });

  it('"Hero Moment" is in the catalog — this is the homepage demo clip\'s preset (DropZone.tsx\'s DEMO_PRESET) and must stay a real, selectable preset so PresetPanel.tsx highlights it correctly', () => {
    const entry = PRESETS.find((p) => p.id === 'heroMoment');
    expect(entry).toBeDefined();
    expect(entry?.curve).toBe(heroMoment);
    expect(entry?.label).toBe('Hero Moment');
  });
});
