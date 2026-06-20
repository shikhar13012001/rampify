import { useState } from 'react';
import { PRESETS } from '@/lib/presets';
import type { SpeedCurve } from '@/types/editor';

interface PresetPanelProps {
  onSelect: (curve: SpeedCurve) => void;
  currentCurve?: SpeedCurve;
}

function pointsMatch(a: SpeedCurve, b: SpeedCurve): boolean {
  if (a.points.length !== b.points.length) return false;
  return a.points.every((p, i) =>
    Math.abs(p.time - b.points[i].time) < 0.001 &&
    Math.abs(p.speed - b.points[i].speed) < 0.001
  );
}

export function PresetPanel({ onSelect, currentCurve }: PresetPanelProps) {
  const [interpType, setInterpType] = useState<'linear' | 'bezier'>(
    currentCurve?.type ?? 'bezier'
  );

  const handleToggle = (type: 'linear' | 'bezier') => {
    setInterpType(type);
    if (currentCurve) {
      onSelect({ ...currentCurve, type });
    }
  };

  const handlePreset = (curve: SpeedCurve) => {
    onSelect({ ...curve, type: interpType });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Interpolation toggle */}
      <div
        style={{
          display: 'flex',
          gap: 3,
          padding: 3,
          borderRadius: 9,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--color-border)',
        }}
      >
        {(['linear', 'bezier'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleToggle(t)}
            style={{
              flex: 1,
              padding: '5px 0',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
              border: 'none',
              background: interpType === t
                ? 'rgba(139, 111, 255, 0.18)'
                : 'transparent',
              color: interpType === t ? '#C4B8FF' : 'var(--color-text-subtle)',
              transition: 'background 0.15s, color 0.15s',
              letterSpacing: '-0.01em',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Preset buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        {PRESETS.map((preset) => {
          const active = currentCurve ? pointsMatch(currentCurve, preset.curve) : false;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePreset(preset.curve)}
              style={{
                padding: '6px 8px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 500,
                textAlign: 'center',
                cursor: 'pointer',
                border: `1px solid ${active ? 'rgba(139, 111, 255, 0.4)' : 'var(--color-border)'}`,
                background: active ? 'rgba(139, 111, 255, 0.1)' : 'rgba(255,255,255,0.02)',
                color: active ? '#C4B8FF' : 'var(--color-text-muted)',
                transition: 'border-color 0.12s, background 0.12s, color 0.12s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                letterSpacing: '-0.01em',
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
