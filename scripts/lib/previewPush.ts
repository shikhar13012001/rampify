/**
 * Plans which variables from a local values file may be pushed to Vercel's PREVIEW scope.
 * Pure (no I/O, no Vercel calls): scripts/push-preview-env.ts executes the plan.
 *
 * The rules exist because Vercel makes it easy to put a production secret in the wrong scope:
 *  - only an allowlist of names may be pushed (a typo or a stray production variable cannot ride along);
 *  - the same safety checks the preflight uses run on the FILE before anything is pushed, so
 *    `live_mode`, the production Firebase project/Admin key, or the dev-bypass flag can never
 *    reach Preview from here;
 *  - "missing" variables are reported as pending, not as a block, so you can push in stages.
 * Output contains NAMES only, never values.
 */
import { evaluateDeploymentEnv, type EnvMap, type Finding } from './previewPreflight.js';

export const PUSHABLE_NAMES: readonly string[] = [
  'DODO_PAYMENTS_API_KEY', 'DODO_PAYMENTS_WEBHOOK_KEY', 'DODO_PAYMENTS_ENVIRONMENT',
  'DODO_PRO_MONTHLY_PRODUCT_ID', 'DODO_PRO_ANNUAL_PRODUCT_ID', 'DODO_PRO_FOUNDER_PRODUCT_ID',
  'ALLOWED_ORIGINS', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY', 'PRODUCTION_FIREBASE_PROJECT_ID',
  'ANALYTICS_INTERNAL_UIDS', 'RATE_LIMIT_SALT',
  'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID',
  'VITE_GOOGLE_CLIENT_ID',
];

/** Never pushed to a deployed environment, whatever the file says. */
export const FORBIDDEN_NAMES: readonly string[] = ['DODO_WEBHOOK_DEV_BYPASS', 'VITE_GA_MEASUREMENT_ID'];

export interface PushPlan {
  push: string[];
  /** Required variables not in the file yet (informational: push in stages). */
  pending: string[];
  /** Names in the file that are not allowed to be pushed, with the reason. */
  rejected: Array<{ name: string; reason: string }>;
  /** Safety failures that forbid ANY push. */
  blockers: Finding[];
  warnings: Finding[];
  ok: boolean;
}

export function planPreviewPush(env: EnvMap): PushPlan {
  const findings = evaluateDeploymentEnv(env, 'preview');
  // An UNSET payment mode is "pending" (it also appears as a missing variable); only a WRONG value blocks.
  const modeUnset = !env.DODO_PAYMENTS_ENVIRONMENT?.trim();
  const blockers = findings.filter((f) => f.level === 'fail' && !f.id.startsWith('set:') && !(modeUnset && f.id === 'dodo:mode'));
  const warnings = findings.filter((f) => f.level === 'warn');
  const pending = findings.filter((f) => f.level === 'fail' && f.id.startsWith('set:')).map((f) => f.id.slice(4));

  const rejected: PushPlan['rejected'] = [];
  const push: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.trim() === '') continue;
    if (FORBIDDEN_NAMES.includes(name)) rejected.push({ name, reason: 'must never be set on a deployed environment' });
    else if (!PUSHABLE_NAMES.includes(name)) rejected.push({ name, reason: 'not in the Preview allowlist' });
    else if (!/^[A-Z][A-Z0-9_]*$/.test(name)) rejected.push({ name, reason: 'invalid variable name' });
    else push.push(name);
  }
  return { push, pending, rejected, blockers, warnings, ok: blockers.length === 0 };
}
