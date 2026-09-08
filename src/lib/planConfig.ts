/**
 * Single source of truth for plan entitlements — what each tier (guest,
 * free, pro) may export. Pricing copy (Pricing.tsx, PricingTable.tsx),
 * settings UI (Sidebar.tsx) and the export gate (ExportModal.tsx) must all
 * derive their behavior from these values so the advertised benefits and
 * the enforced limits can never drift apart again.
 *
 * The matrix mirrors the published pricing table:
 *   Free — 1080p export, Balanced motion blur, 3 exports/month
 *   Pro   — 4K export, all motion-blur presets, AI frame interpolation
 *           (optical flow), beat sync, unlimited exports
 *
 * Server-side entitlements remain authoritative for signed-in users
 * (api/record-export.ts enforces the free cap; api/check-subscription.ts
 * reports tier + usage). This module is the client-side mirror of those
 * rules, plus the capability limit that no tier can override.
 */

import type { BlurIntensity, BlurSettings, ExportResolution, OpticalFlowSettings } from '@/types/editor';

export type PlanTier = 'guest' | 'free' | 'pro';

/** The single motion-blur intensity advertised as free ("Balanced"). */
export const FREE_BLUR_INTENSITY: BlurIntensity = 'balanced';

export const ALL_BLUR_INTENSITIES: BlurIntensity[] = ['subtle', 'balanced', 'cinematic'];

/** Highest export resolution included in Free. */
export const FREE_EXPORT_RESOLUTION: ExportResolution = '1080p';

/** Monthly export cap for signed-in free users (server enforces the same number). */
export const SIGNED_IN_FREE_LIMIT = 3;

export function allowedBlurIntensities(isPro: boolean): BlurIntensity[] {
  return isPro ? ALL_BLUR_INTENSITIES : [FREE_BLUR_INTENSITY];
}

export function canUseBlurIntensity(intensity: BlurIntensity, isPro: boolean): boolean {
  return isPro || intensity === FREE_BLUR_INTENSITY;
}

export function canUseOpticalFlow(isPro: boolean): boolean {
  return isPro;
}

export function canUseResolution(resolution: ExportResolution, isPro: boolean): boolean {
  return isPro || resolution === FREE_EXPORT_RESOLUTION;
}

export interface ExportEntitlementContext {
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  resolution: ExportResolution;
}

/**
 * Why the current export configuration is blocked for this tier, or null if
 * it is allowed. Callers show the reason (and open the upgrade modal for
 * upgrade-gated items) BEFORE any rendering starts.
 */
export function exportBlockedReason(isPro: boolean, ctx: ExportEntitlementContext): string | null {
  if (ctx.blurSettings.enabled && !canUseBlurIntensity(ctx.blurSettings.intensity, isPro)) {
    const label = ctx.blurSettings.intensity === 'subtle' ? 'Subtle' : 'Cinematic';
    return `The ${label} motion-blur preset requires Pro. The Balanced preset exports on Free.`;
  }
  if (ctx.opticalFlowSettings.enabled && !canUseOpticalFlow(isPro)) {
    return 'AI frame interpolation requires Pro.';
  }
  if (!canUseResolution(ctx.resolution, isPro)) {
    return '4K export requires Pro.';
  }
  return null;
}

/**
 * Capability limit — NOT a plan gate. No tier can export 4K + AI frame
 * interpolation today: the in-browser WASM pipeline cannot reliably encode
 * it, and the former cloud route was removed (it never actually worked).
 * All users, Pro included, get an honest "not available yet" before any
 * render starts.
 */
export function isUnsupportedCombination(ctx: ExportEntitlementContext): boolean {
  return ctx.resolution === '4k' && ctx.opticalFlowSettings.enabled;
}

/**
 * Guest-export experiment (validation sprint). Disabled by default; do NOT
 * enable in production without following the steps in docs/validation/STATUS.md.
 *
 * While enabled, an anonymous visitor may perform up to `allowance` basic
 * exports at `resolution` before being asked to register. The count is kept
 * in sessionStorage (client-side only — see exportQuota.ts for the honest
 * limitations of that). Server-side billing entitlements stay auth-only and
 * authoritative; guest exports never touch Firestore.
 */
export interface GuestExportExperiment {
  enabled: boolean;
  resolution: ExportResolution;
  allowance: number;
}

export const GUEST_EXPERIMENT: GuestExportExperiment = {
  enabled: false,
  resolution: FREE_EXPORT_RESOLUTION,
  allowance: 1,
};