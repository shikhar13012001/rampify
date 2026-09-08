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
  type PlanTier,
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
  it('guest tier gets a basic export only — no blur, no AI interpolation', () => {
    expect(allowedBlurIntensities('guest')).toEqual([]);
    for (const intensity of ['subtle', 'balanced', 'cinematic'] as BlurIntensity[]) {
      expect(canUseBlurIntensity(intensity, 'guest')).toBe(false);
    }
    expect(canUseOpticalFlow('guest')).toBe(false);
  });

  it('guest tier may only use the experiment-configured resolution', () => {
    expect(canUseResolution(GUEST_EXPERIMENT.resolution, 'guest')).toBe(true);
    expect(canUseResolution('4k', 'guest')).toBe(GUEST_EXPERIMENT.resolution === '4k');
  });

  it('free tier may use exactly the advertised Balanced blur preset', () => {
    expect(FREE_BLUR_INTENSITY).toBe('balanced');
    expect(allowedBlurIntensities('free')).toEqual(['balanced']);
    expect(canUseBlurIntensity('balanced', 'free')).toBe(true);
    expect(canUseBlurIntensity('subtle', 'free')).toBe(false);
    expect(canUseBlurIntensity('cinematic', 'free')).toBe(false);
  });

  it('pro tier may use every blur preset', () => {
    expect(allowedBlurIntensities('pro')).toEqual(['subtle', 'balanced', 'cinematic']);
    for (const intensity of ['subtle', 'balanced', 'cinematic'] as BlurIntensity[]) {
      expect(canUseBlurIntensity(intensity, 'pro')).toBe(true);
    }
  });

  it('AI frame interpolation and 4K are Pro-only for signed-in tiers', () => {
    expect(canUseOpticalFlow('free')).toBe(false);
    expect(canUseOpticalFlow('pro')).toBe(true);
    expect(canUseResolution('1080p', 'free')).toBe(true);
    expect(canUseResolution('4k', 'free')).toBe(false);
    expect(canUseResolution('4k', 'pro')).toBe(true);
  });

  it('exportBlockedReason: free Balanced blur export is allowed', () => {
    expect(exportBlockedReason('free', ctx({ blur: blur(true, 'balanced') }))).toBeNull();
  });

  it('exportBlockedReason: free Subtle and Cinematic blur are gated with reasons', () => {
    expect(exportBlockedReason('free', ctx({ blur: blur(true, 'subtle') }))).toMatch(/Subtle/);
    expect(exportBlockedReason('free', ctx({ blur: blur(true, 'cinematic') }))).toMatch(/Cinematic/);
  });

  it('exportBlockedReason: guest blur of any intensity is gated (account required)', () => {
    for (const intensity of ['subtle', 'balanced', 'cinematic'] as BlurIntensity[]) {
      expect(exportBlockedReason('guest', ctx({ blur: blur(true, intensity) }))).toMatch(/account/i);
    }
  });

  it('exportBlockedReason: pro users pass every single-feature configuration', () => {
    expect(exportBlockedReason('pro', ctx({ blur: blur(true, 'cinematic') }))).toBeNull();
    expect(exportBlockedReason('pro', ctx({ of: flow(true) }))).toBeNull();
    expect(exportBlockedReason('pro', ctx({ res: '4k' }))).toBeNull();
  });

  it('exportBlockedReason: guest with the experiment-default basic config passes', () => {
    expect(exportBlockedReason('guest', ctx({ res: GUEST_EXPERIMENT.resolution }))).toBeNull();
  });

  it('exportBlockedReason: free AI frame interpolation and 4K are gated with reasons', () => {
    expect(exportBlockedReason('free', ctx({ of: flow(true) }))).toBe('AI frame interpolation requires Pro.');
    expect(exportBlockedReason('free', ctx({ res: '4k' }))).toBe('4K export requires Pro.');
  });

  it('exportBlockedReason: blur intensity is irrelevant when blur is disabled', () => {
    expect(exportBlockedReason('free', ctx({ blur: blur(false, 'cinematic') }))).toBeNull();
    expect(exportBlockedReason('guest', ctx({ blur: blur(false, 'cinematic') }))).toBeNull();
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

  it('every PlanTier value is handled by every entitlement function (no silent fallthrough)', () => {
    const tiers: PlanTier[] = ['guest', 'free', 'pro'];
    for (const tier of tiers) {
      expect(() => allowedBlurIntensities(tier)).not.toThrow();
      expect(() => canUseOpticalFlow(tier)).not.toThrow();
      expect(() => canUseResolution('1080p', tier)).not.toThrow();
      expect(() => exportBlockedReason(tier, ctx({}))).not.toThrow();
    }
  });
});
