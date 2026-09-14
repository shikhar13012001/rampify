/**
 * Single source of truth for plan entitlements — what each tier (guest,
 * free, pro) may export. Pricing copy (Pricing.tsx, PricingTable.tsx),
 * settings UI (Sidebar.tsx) and the export gate (ExportModal.tsx) must all
 * derive their behavior from these values so the advertised benefits and
 * the enforced limits can never drift apart again.
 *
 * The matrix mirrors the published pricing table:
 *   Guest — 1080p export only, no blur, no AI interpolation (see
 *           GUEST_EXPERIMENT below — disabled by default)
 *   Free  — 1080p export, Balanced motion blur, 3 exports/month
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

// ─── Published prices (USD) ─────────────────────────────────────────────────
// Mirrored server-side in api/_plans.ts (the api/ tree can't import src/).
// scripts/verify-dodo-products.mjs checks the live Dodo products against
// these exact numbers; test/billing/founder-plan.test.ts checks the mirror.
export const PRO_MONTHLY_USD = 12;
export const PRO_ANNUAL_USD = 96; // = $8/month
/** One-time, lifetime Pro. Exists to give a cold visitor a way to pay that
 *  isn't "start a subscription for a tool you found ten minutes ago". */
export const FOUNDER_PRICE_USD = 59;
export const FOUNDER_SEATS = 25;

/** The single motion-blur intensity advertised as free ("Balanced"). */
export const FREE_BLUR_INTENSITY: BlurIntensity = 'balanced';

export const ALL_BLUR_INTENSITIES: BlurIntensity[] = ['subtle', 'balanced', 'cinematic'];

/** Highest export resolution included in Free. */
export const FREE_EXPORT_RESOLUTION: ExportResolution = '1080p';

/** Monthly export cap for signed-in free users (server enforces the same number). */
export const SIGNED_IN_FREE_LIMIT = 3;

/**
 * Guest-export experiment (validation sprint). Disabled by default; do NOT
 * enable in production without following the steps in docs/validation/STATUS.md
 * ("Guest export experiment" section).
 *
 * While enabled, an anonymous visitor may perform up to `allowance` *basic*
 * exports (no blur, no AI interpolation — see allowedBlurIntensities /
 * canUseOpticalFlow below, both return nothing/false for 'guest') at
 * `resolution` before being asked to register. The count is kept in
 * sessionStorage (client-side only — see exportQuota.ts for the honest
 * limitations of that). Server-side billing entitlements stay auth-only and
 * authoritative; guest exports never touch Firestore.
 */
export interface GuestExportExperiment {
  enabled: boolean;
  resolution: ExportResolution;
  allowance: number;
}

export const GUEST_EXPERIMENT: GuestExportExperiment = {
  // Enabled 2026-09-14 for the first exposure experiment: a visitor from a
  // Reddit thread or a shared curve link gets ONE real export before any
  // sign-in wall, so the wall arrives after value, not before it.
  enabled: true,
  resolution: FREE_EXPORT_RESOLUTION,
  allowance: 1,
};

export function allowedBlurIntensities(tier: PlanTier): BlurIntensity[] {
  if (tier === 'pro') return ALL_BLUR_INTENSITIES;
  if (tier === 'free') return [FREE_BLUR_INTENSITY];
  return []; // guest — basic export only, no blur, by design (see GUEST_EXPERIMENT doc above)
}

export function canUseBlurIntensity(intensity: BlurIntensity, tier: PlanTier): boolean {
  return allowedBlurIntensities(tier).includes(intensity);
}

export function canUseOpticalFlow(tier: PlanTier): boolean {
  return tier === 'pro';
}

export function canUseResolution(resolution: ExportResolution, tier: PlanTier): boolean {
  if (tier === 'pro') return true;
  if (tier === 'free') return resolution === FREE_EXPORT_RESOLUTION;
  return resolution === GUEST_EXPERIMENT.resolution;
}

export interface ExportEntitlementContext {
  blurSettings: BlurSettings;
  opticalFlowSettings: OpticalFlowSettings;
  resolution: ExportResolution;
}

/**
 * Why the current export configuration is blocked for this tier, or null if
 * it is allowed. Callers show the reason (and open the upgrade modal, or
 * prompt sign-in for guests) BEFORE any rendering starts — this is checked
 * reactively as soon as the export UI is shown, not only on click, so a user
 * never spends time waiting on a render that was never going to be allowed.
 */
export function exportBlockedReason(tier: PlanTier, ctx: ExportEntitlementContext): string | null {
  if (ctx.blurSettings.enabled && !canUseBlurIntensity(ctx.blurSettings.intensity, tier)) {
    if (tier === 'guest') return 'Motion blur requires an account. Sign in to use it — Balanced is free.';
    const label = ctx.blurSettings.intensity === 'subtle' ? 'Subtle' : 'Cinematic';
    return `The ${label} motion-blur preset requires Pro. The Balanced preset exports on Free.`;
  }
  if (ctx.opticalFlowSettings.enabled && !canUseOpticalFlow(tier)) {
    return tier === 'guest'
      ? 'AI frame interpolation requires an account and Pro.'
      : 'AI frame interpolation requires Pro.';
  }
  if (!canUseResolution(ctx.resolution, tier)) {
    if (tier === 'guest') return `Guest exports are limited to ${GUEST_EXPERIMENT.resolution}. Sign in for more.`;
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
