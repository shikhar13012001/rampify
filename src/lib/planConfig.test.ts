import { describe, expect, it } from 'vitest';
import {
  allowedBlurIntensities,
  canUseBlurIntensity,
  canUseOpticalFlow,
  canUseResolution,
  exportBlockedReason,
  isUnsupportedCombination,
  FREE_BLUR_INTENSITY,
  GUEST_EXPERIMENT,
  SIGNED_IN_FREE_LIMIT,
} from './planConfig';
import type { BlurIntensity, BlurSettings, ExportResolution, OpticalFlowSettings } from '@/types/editor';

const blur = (enabled: boolean, intensity: BlurIntensity = 'balanced'): BlurSettings => ({
  enabled,
  intensity,
});
const flow = (enabled: boolean): OpticalFlowSettings => ({ enabled, quality: 'quality' });
const ctx = (opts: { blur?: BlurSettings; of?: OpticalFlowSettings; res?: ExportResolution }) => ({
  blurSettings: opts.blur ?? blur(false),
  opticalFlowSettings: opts.of ?? flow(false),
  resolution: opts.res ?? '1080p',
});

describe('planConfig — entitlement matrix', () => {
  it('free tier may use exactly the advertised Balanced blur preset', () => {
    expect(FREE_BLUR_INTENSITY).toBe('balanced');
    expect(allowedBlurIntensities(false)).toEqual(['balanced']);
    expect(canUseBlurIntensity('balanced', false)).toBe(true);
    expect(canUseBlurIntensity('subtle', false)).toBe(false);
    expect(canUseBlurIntensity('cinematic', false)).toBe(false);
  });

  it('pro tier may use every blur preset', () => {
    expect(allowedBlurIntensities(true)).toEqual(['subtle', 'balanced', 'cinematic']);
    for (const intensity of ['subtle', 'balanced', 'cinematic'] as BlurIntensity[]) {
      expect(canUseBlurIntensity(intensity, true)).toBe(true);
    }
  });

  it('AI frame interpolation and 4K are Pro-only', () => {
    expect(canUseOpticalFlow(false)).toBe(false);
    expect(canUseOpticalFlow(true)).toBe(true);
    expect(canUseResolution('1080p', false)).toBe(true);
    expect(canUseResolution('4k', false)).toBe(false);
    expect(canUseResolution('4k', true)).toBe(true);
  });

  it('exportBlockedReason: free Balanced blur export is allowed', () => {
    expect(exportBlockedReason(false, ctx({ blur: blur(true, 'balanced') }))).toBeNull();
  });

  it('exportBlockedReason: free Subtle and Cinematic blur are gated with reasons', () => {
    expect(exportBlockedReason(false, ctx({ blur: blur(true, 'subtle') }))).toMatch(/Subtle/);
    expect(exportBlockedReason(false, ctx({ blur: blur(true, 'cinematic') }))).toMatch(/Cinematic/);
  });

  it('exportBlockedReason: pro users pass every single-feature configuration', () => {
    expect(exportBlockedReason(true, ctx({ blur: blur(true, 'cinematic') }))).toBeNull();
    expect(exportBlockedReason(true, ctx({ of: flow(true) }))).toBeNull();
    expect(exportBlockedReason(true, ctx({ res: '4k' }))).toBeNull();
  });

  it('exportBlockedReason: free AI frame interpolation and 4K are gated with reasons', () => {
    expect(exportBlockedReason(false, ctx({ of: flow(true) }))).toBe('AI frame interpolation requires Pro.');
    expect(exportBlockedReason(false, ctx({ res: '4k' }))).toBe('4K export requires Pro.');
  });

  it('exportBlockedReason: blur intensity is irrelevant when blur is disabled', () => {
    expect(exportBlockedReason(false, ctx({ blur: blur(false, 'cinematic') }))).toBeNull();
  });

  it('4K + AI frame interpolation is unsupported for every tier (capability limit, not a plan gate)', () => {
    expect(isUnsupportedCombination(ctx({ res: '4k', of: flow(true) }))).toBe(true);
    expect(isUnsupportedCombination(ctx({ res: '4k', of: flow(false) }))).toBe(false);
    expect(isUnsupportedCombination(ctx({ res: '1080p', of: flow(true) }))).toBe(false);
  });

  it('guest experiment ships disabled, targeting 1080p with allowance 1', () => {
    expect(GUEST_EXPERIMENT.enabled).toBe(false);
    expect(GUEST_EXPERIMENT.resolution).toBe('1080p');
    expect(GUEST_EXPERIMENT.allowance).toBe(1);
  });

  it('signed-in free limit matches the pricing page', () => {
    expect(SIGNED_IN_FREE_LIMIT).toBe(3);
  });
});