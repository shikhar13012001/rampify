import { useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { PresetPanel } from '@/features/curve/PresetPanel';
import { formatTime } from '@/features/preview/formatTime';
import { hasSlowSegments, estimateOFSeconds } from '@/lib/ffmpegBridge';
import { subscribeModelStatus, waitForWorkerReady } from '@/lib/slowMotionPipeline';
import type { ModelStatus } from '@/lib/slowMotionPipeline';
import type { BlurIntensity, OpticalFlowQuality, Segment } from '@/types/editor';

function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '-';
  const m  = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  const t  = Math.floor((s % 1) * 10);
  if (m === 0) return `${sc}.${t}s`;
  return `${m}:${String(sc).padStart(2, '0')}.${t} (${s.toFixed(1)}s)`;
}

function fmtFileSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024)           return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function Sidebar() {
  const project = useEditorStore((state) => state.project);
  const selectedId = useEditorStore((state) => state.selectedSegmentId);
  const selectSegment = useEditorStore((state) => state.selectSegment);
  const updateCurve = useEditorStore((state) => state.updateSegmentCurve);
  const deleteSegment = useEditorStore((state) => state.deleteSegment);
  const undo = useEditorStore((state) => state.undo);
  const history = useEditorStore((state) => state.history);

  const minSpeed = useEditorStore((state) => state.minSpeed);
  const maxSpeed = useEditorStore((state) => state.maxSpeed);
  const setMinSpeed = useEditorStore((state) => state.setMinSpeed);
  const setMaxSpeed = useEditorStore((state) => state.setMaxSpeed);

  const isPro              = useEditorStore((state) => state.isPro);
  const blurSettings       = useEditorStore((state) => state.blurSettings);
  const setBlurEnabled     = useEditorStore((state) => state.setBlurEnabled);
  const setBlurIntensity   = useEditorStore((state) => state.setBlurIntensity);
  const ofSettings         = useEditorStore((state) => state.opticalFlowSettings);
  const setOFEnabled       = useEditorStore((state) => state.setOpticalFlowEnabled);
  const setOFQuality       = useEditorStore((state) => state.setOpticalFlowQuality);
  const setUpgradeModalOpen = useEditorStore((state) => state.setUpgradeModalOpen);

  // Count speed transitions above the 0.4 threshold across all segments.
  const transitionCount = useMemo(() => {
    if (!project) return 0;
    return project.segments.reduce((total, seg) => {
      const pts = [...seg.curve.points].sort((a, b) => a.time - b.time);
      let count = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        if (Math.abs(pts[i + 1].speed - pts[i].speed) > 0.4) count++;
      }
      return total + count;
    }, 0);
  }, [project]);

  const [lockAudio, setLockAudio] = useState(true);
  const [pitchCorrection, setPitchCorrection] = useState(true);
  const [muteDuringRamp, setMuteDuringRamp] = useState(false);

  if (!project) return null;

  const { file, segments } = project;
  const selected = segments.find((segment) => segment.id === selectedId) ?? segments[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* File info */}
      <SectionCard>
        <SectionLabel>File</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <InfoRow label="Name" value={file.name} mono clip />
          <InfoRow label="Duration" value={fmtDuration(file.duration)} />
          {file.width > 0 && file.height > 0 && (
            <InfoRow label="Resolution" value={`${file.width} × ${file.height}`} />
          )}
          {file.size != null && <InfoRow label="Size" value={fmtFileSize(file.size)} />}
        </div>
      </SectionCard>

      {/* Segments */}
      <SectionCard>
        <SectionLabel>{segments.length} {segments.length === 1 ? 'Segment' : 'Segments'}</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {segments.map((segment, index) => (
            <SegmentRow
              key={segment.id}
              segment={segment}
              index={index}
              isSelected={segment.id === selected?.id}
              onSelect={() => selectSegment(segment.id)}
              onDelete={segments.length > 1 ? () => deleteSegment(segment.id) : undefined}
            />
          ))}
        </div>
      </SectionCard>

      {/* Presets */}
      {selected && (
        <SectionCard>
          <SectionLabel>Curve presets</SectionLabel>
          <div style={{ paddingTop: 2 }}>
            <PresetPanel
              currentCurve={selected.curve}
              onSelect={(curve) => updateCurve(selected.id, curve)}
            />
          </div>
        </SectionCard>
      )}

      {/* Audio */}
      <SectionCard>
        <SectionLabel>Audio</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ToggleRow label="Lock audio to speed" checked={lockAudio} onChange={setLockAudio} />
          <ToggleRow label="Pitch correction" checked={pitchCorrection} onChange={setPitchCorrection} />
          <ToggleRow label="Mute during ramp" checked={muteDuringRamp} onChange={setMuteDuringRamp} />
        </div>
      </SectionCard>

      {/* Speed range */}
      <SectionCard>
        <SectionLabel>Speed range</SectionLabel>
        <div style={{ display: 'grid', gap: 14, paddingTop: 4 }}>
          <SliderRow
            label="Min speed"
            value={minSpeed}
            displayValue={`${minSpeed.toFixed(1)}x`}
            min={0.1}
            max={1}
            step={0.1}
            onChange={setMinSpeed}
            accentColor="var(--color-accent)"
          />
          <SliderRow
            label="Max speed"
            value={maxSpeed}
            displayValue={`${maxSpeed.toFixed(1)}x`}
            min={1}
            max={10}
            step={0.1}
            onChange={setMaxSpeed}
            accentColor="var(--color-warning)"
          />
        </div>
      </SectionCard>

      {/* Output */}
      <SectionCard>
        <SectionLabel>Output</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {isPro ? (
            <MotionBlurControl
              enabled={blurSettings.enabled}
              intensity={blurSettings.intensity}
              transitionCount={transitionCount}
              onToggle={setBlurEnabled}
              onIntensityChange={setBlurIntensity}
            />
          ) : (
            <LockedOption label="Motion blur" onUpgrade={() => setUpgradeModalOpen(true)} />
          )}
          {isPro ? (
            <OpticalFlowControl
              enabled={ofSettings.enabled}
              quality={ofSettings.quality}
              segments={segments}
              onToggle={setOFEnabled}
              onQualityChange={setOFQuality}
            />
          ) : (
            <LockedOption label="Frame interpolation" onUpgrade={() => setUpgradeModalOpen(true)} />
          )}
        </div>
      </SectionCard>

      {/* Undo */}
      <button
        type="button"
        onClick={undo}
        disabled={history.length === 0}
        style={{
          width: '100%',
          borderRadius: 11,
          border: `1px solid ${history.length > 0 ? 'rgba(184, 164, 237, 0.3)' : 'var(--color-border)'}`,
          background: history.length > 0 ? 'rgba(184, 164, 237, 0.1)' : 'transparent',
          color: history.length > 0 ? '#b8a4ed' : 'var(--color-text-subtle)',
          padding: '10px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: history.length === 0 ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          letterSpacing: '-0.01em',
          boxShadow: 'none',
        }}
      >
        <UndoIcon active={history.length > 0} />
        Undo
        {history.length > 0 && (
          <span
            style={{
              marginLeft: 2,
              fontSize: 10,
              color: '#8a8a8a',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ({history.length})
          </span>
        )}
      </button>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 13,
        border: '1px solid var(--color-border)',
        backgroundColor: 'rgba(255, 255, 255, 0.018)',
        padding: '11px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
        transition: 'border-color 0.2s',
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-text-subtle)',
        paddingLeft: 2,
      }}
    >
      {children}
    </span>
  );
}

function SegmentRow({
  segment,
  index,
  isSelected,
  onSelect,
  onDelete,
}: {
  segment: Segment;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const avgSpeed =
    segment.curve.points.length > 0
      ? segment.curve.points.reduce((sum, p) => sum + p.speed, 0) / segment.curve.points.length
      : 1;

  const speedCol = speedColor(avgSpeed);

  return (
    // div instead of button to avoid invalid <button>-in-<button> nesting (delete button is inside)
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        textAlign: 'left',
        padding: '9px 10px',
        borderRadius: 9,
        border: `1px solid ${isSelected ? 'rgba(10, 10, 10, 0.35)' : 'transparent'}`,
        background: isSelected ? 'rgba(184, 164, 237, 0.22)' : 'rgba(10, 10, 10, 0.03)',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        boxShadow: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(10, 10, 10, 0.06)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(10, 10, 10, 0.03)';
      }}
    >
      {/* Color bar — thicker for stronger contrast */}
      <div
        style={{
          width: 4,
          height: 32,
          borderRadius: 2,
          background: speedCol,
          flexShrink: 0,
          opacity: isSelected ? 1 : 0.55,
          transition: 'background 0.15s, opacity 0.15s',
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: isSelected ? '#0a0a0a' : '#4a4a4a',
            letterSpacing: '-0.01em',
          }}
        >
          Segment {index + 1}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 10,
            color: 'var(--color-text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
        </div>
      </div>

      {/* Speed badge */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 600,
          color: speedCol,
          background: `${speedCol}14`,
          border: `1px solid ${speedCol}26`,
          padding: '2px 6px',
          borderRadius: 5,
          flexShrink: 0,
          letterSpacing: '0.01em',
        }}
      >
        {avgSpeed.toFixed(1)}x
      </span>

      {onDelete && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--color-text-subtle)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.12s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--color-error)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-subtle)')}
          aria-label={`Delete segment ${index + 1}`}
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        fontSize: 12,
        color: checked ? '#4a4a4a' : 'var(--color-text-muted)',
        padding: '6px 2px',
        cursor: 'pointer',
        transition: 'color 0.12s',
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          border: `1px solid ${checked ? 'rgba(184, 164, 237, 0.5)' : 'rgba(10,10,10,0.08)'}`,
          backgroundColor: checked ? '#0a0a0a' : 'rgba(10,10,10,0.04)',
          padding: 2,
          cursor: 'pointer',
          position: 'relative',
          transition: 'background-color 0.2s, border-color 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: checked ? '#fff' : '#44446A',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s',
          }}
        />
      </button>
    </label>
  );
}

function SliderRow({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
  accentColor,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  accentColor: string;
}) {
  return (
    <label style={{ display: 'grid', gap: 6, padding: '0 2px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</span>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: accentColor,
          }}
        >
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ accentColor }}
      />
    </label>
  );
}

const INTENSITY_LABELS: { value: BlurIntensity; label: string }[] = [
  { value: 'subtle',     label: 'Subtle' },
  { value: 'balanced',   label: 'Balanced' },
  { value: 'cinematic',  label: 'Cinematic' },
];

function MotionBlurControl({
  enabled,
  intensity,
  transitionCount,
  onToggle,
  onIntensityChange,
}: {
  enabled: boolean;
  intensity: BlurIntensity;
  transitionCount: number;
  onToggle: (v: boolean) => void;
  onIntensityChange: (v: BlurIntensity) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Toggle row */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 12,
          color: enabled ? '#4a4a4a' : 'var(--color-text-muted)',
          padding: '6px 2px',
          cursor: 'pointer',
          transition: 'color 0.12s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Motion blur</span>
          {enabled && transitionCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#2d8d8d',
                background: 'rgba(28, 228, 184, 0.1)',
                border: '1px solid rgba(28, 228, 184, 0.2)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
              title={`Blur applied at ${transitionCount} speed ${transitionCount === 1 ? 'transition' : 'transitions'} in the curve`}
            >
              {transitionCount} {transitionCount === 1 ? 'transition' : 'transitions'}
            </span>
          )}
          {enabled && transitionCount === 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: 'var(--color-text-subtle)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                padding: '1px 5px',
              }}
              title="Add speed changes to your curve (delta > 0.4×) for blur to apply"
            >
              No speed changes
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          style={{
            width: 38,
            height: 22,
            borderRadius: 999,
            border: `1px solid ${enabled ? 'rgba(184, 164, 237, 0.5)' : 'rgba(10,10,10,0.08)'}`,
            backgroundColor: enabled ? '#0a0a0a' : 'rgba(10,10,10,0.04)',
            padding: 2,
            cursor: 'pointer',
            position: 'relative',
            transition: 'background-color 0.2s, border-color 0.2s',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: 'block',
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: enabled ? '#fff' : '#44446A',
              transform: enabled ? 'translateX(16px)' : 'translateX(0)',
              transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s',
            }}
          />
        </button>
      </label>

      {enabled && (
        <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--color-text-subtle)', padding: '0 2px', lineHeight: 1.4 }}>
          Applied at export time. Intensity controls blur amount at each speed change.
        </p>
      )}

      {/* Intensity segmented control — only visible when enabled */}
      {enabled && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 3,
            padding: '0 2px 4px',
          }}
        >
          {INTENSITY_LABELS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onIntensityChange(value)}
              style={{
                padding: '5px 0',
                borderRadius: 7,
                border: `1px solid ${intensity === value ? 'rgba(184, 164, 237, 0.45)' : 'var(--color-border)'}`,
                background: intensity === value ? 'rgba(184, 164, 237, 0.14)' : 'transparent',
                color: intensity === value ? '#b8a4ed' : 'var(--color-text-subtle)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '-0.01em',
                transition: 'background 0.12s, border-color 0.12s, color 0.12s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const OF_QUALITY_LABELS: { value: OpticalFlowQuality; label: string }[] = [
  { value: 'draft',   label: 'Draft' },
  { value: 'quality', label: 'Quality' },
  { value: 'ultra',   label: 'Ultra' },
];

function formatOFEstimate(secs: number): string {
  if (secs < 60) return `~${secs}s`;
  const m = Math.round(secs / 60);
  return `~${m}m`;
}

function OpticalFlowControl({
  enabled,
  quality,
  segments,
  onToggle,
  onQualityChange,
}: {
  enabled: boolean;
  quality: OpticalFlowQuality;
  segments: Segment[];
  onToggle: (v: boolean) => void;
  onQualityChange: (v: OpticalFlowQuality) => void;
}) {
  const [modelStatus, setModelStatusLocal] = useState<ModelStatus>('idle');

  useEffect(() => subscribeModelStatus(setModelStatusLocal), []);

  useEffect(() => {
    if (enabled) waitForWorkerReady();
  }, [enabled]);

  const hasSlowSegs = useMemo(() => hasSlowSegments(segments), [segments]);

  const estimateSecs = useMemo(
    () => (enabled && hasSlowSegs ? estimateOFSeconds(segments, quality) : null),
    [enabled, hasSlowSegs, segments, quality],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Toggle row */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 12,
          color: enabled ? '#4a4a4a' : 'var(--color-text-muted)',
          padding: '6px 2px',
          cursor: 'pointer',
          transition: 'color 0.12s',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Frame interpolation</span>
          {enabled && modelStatus === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 9, color: '#8a8a8a', fontFamily: 'var(--font-mono)' }}>
                Downloading AI model (6 MB)…
              </span>
              <div
                style={{
                  height: 3,
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.07)',
                  overflow: 'hidden',
                  width: '100%',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: '40%',
                    borderRadius: 999,
                    background: '#b8a4ed',
                    animation: 'sidebar-shimmer 1.4s ease-in-out infinite',
                  }}
                />
              </div>
            </div>
          )}
          {enabled && modelStatus === 'ready' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 9,
                fontWeight: 700,
                color: '#2d8d8d',
                background: 'rgba(28,228,184,0.08)',
                border: '1px solid rgba(28,228,184,0.2)',
                borderRadius: 4,
                padding: '1px 5px',
                width: 'fit-content',
              }}
            >
              <span style={{ fontSize: 7 }}>●</span> AI model ready
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          style={{
            width: 38,
            height: 22,
            borderRadius: 999,
            border: `1px solid ${enabled ? 'rgba(184, 164, 237, 0.5)' : 'rgba(10,10,10,0.08)'}`,
            backgroundColor: enabled ? '#0a0a0a' : 'rgba(10,10,10,0.04)',
            padding: 2,
            cursor: 'pointer',
            position: 'relative',
            transition: 'background-color 0.2s, border-color 0.2s',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: 'block',
              width: 16,
              height: 16,
              borderRadius: '50%',
              backgroundColor: enabled ? '#fff' : '#44446A',
              transform: enabled ? 'translateX(16px)' : 'translateX(0)',
              transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s',
            }}
          />
        </button>
      </label>

      {/* Quality selector + estimate */}
      {enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 2 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 3,
              padding: '0 2px',
            }}
          >
            {OF_QUALITY_LABELS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onQualityChange(value)}
                style={{
                  padding: '5px 0',
                  borderRadius: 7,
                  border: `1px solid ${quality === value ? 'rgba(184, 164, 237, 0.45)' : 'var(--color-border)'}`,
                  background: quality === value ? 'rgba(184, 164, 237, 0.14)' : 'transparent',
                  color: quality === value ? '#b8a4ed' : 'var(--color-text-subtle)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '-0.01em',
                  transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Time estimate or no-slow-segment warning */}
          {hasSlowSegs && estimateSecs !== null ? (
            <p
              style={{
                margin: 0,
                fontSize: 10,
                color: quality === 'ultra' ? '#e8b94a' : 'var(--color-text-subtle)',
                padding: '0 2px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {formatOFEstimate(estimateSecs)} estimated
              {quality === 'ultra' && ' · may take 2–5 min'}
            </p>
          ) : !hasSlowSegs ? (
            <p style={{ margin: 0, fontSize: 10, color: 'var(--color-text-subtle)', padding: '0 2px' }}>
              Add a &lt;0.6× segment to activate
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LockedOption({ label, onUpgrade }: { label: string; onUpgrade: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        fontSize: 12,
        color: 'var(--color-text-subtle)',
        padding: '6px 2px',
        opacity: 0.55,
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        {label}
      </span>
      <button
        type="button"
        onClick={onUpgrade}
        style={{
          borderRadius: 5,
          backgroundColor: 'rgba(184, 164, 237, 0.12)',
          border: '1px solid rgba(184, 164, 237, 0.3)',
          color: '#b8a4ed',
          padding: '2px 7px',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          flexShrink: 0,
          cursor: 'pointer',
          opacity: 1,
        }}
      >
        Upgrade
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  clip = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  clip?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        padding: '5px 2px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.025)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--color-text-subtle)', flexShrink: 0 }}>{label}</span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--color-text-muted)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          overflow: clip ? 'hidden' : undefined,
          textOverflow: clip ? 'ellipsis' : undefined,
          whiteSpace: 'nowrap',
          maxWidth: clip ? 110 : undefined,
          textAlign: 'right',
        }}
        title={clip ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function speedColor(speed: number): string {
  if (speed < 0.5) return '#2d8d8d';
  if (speed <= 1.2) return '#b8a4ed';
  if (speed <= 2.0) return '#e8b94a';
  return '#ff4d8b';
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UndoIcon({ active }: { active: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? '#b8a4ed' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
    </svg>
  );
}
