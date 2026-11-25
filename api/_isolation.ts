/**
 * Environment isolation guards: make it structurally hard for a Vercel PREVIEW
 * (or local dev) deployment to touch production data or take real payments,
 * even if its environment variables are misconfigured.
 *
 * Vercel env vars default to "All environments". A preview that inherits the
 * production FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY can read and write production
 * Firestore (the Admin SDK bypasses security rules), and one that inherits a
 * live Dodo key can create real charges. These checks turn that misconfiguration
 * into a loud startup failure instead of silent production writes.
 *
 * They are defence in depth, not a substitute for scoping variables per
 * environment in the Vercel dashboard (see docs/rampify/PREVIEW_READINESS.md).
 * The knowledge of what "production" is comes from PRODUCTION_FIREBASE_PROJECT_ID,
 * which must be set on every environment so each deployment can recognise it.
 */

/**
 * Firebase projects that are PRODUCTION, known to the code itself. A project id is a public
 * identifier (it ships in the client bundle), so recording it here is not a secret, and it means
 * the guard works even when PRODUCTION_FIREBASE_PROJECT_ID is missing from an environment.
 * Add a new id here if production ever moves to a different project.
 */
export const KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS: readonly string[] = ['rampify-720b4'];

export interface IsolationInput {
  /** process.env.VERCEL_ENV: 'production' | 'preview' | 'development' | undefined (not on Vercel: a local run). */
  vercelEnv?: string | null;
  /** Firebase project the Admin credential belongs to (service account `project_id`). */
  firebaseProjectId?: string | null;
  /** The production Firebase project id, as configured on every environment (in addition to the built-in list). */
  productionFirebaseProjectId?: string | null;
  /** DODO_PAYMENTS_ENVIRONMENT. */
  dodoEnvironment?: string | null;
}

export interface IsolationResult {
  errors: string[];
  warnings: string[];
}

/**
 * Only the Vercel PRODUCTION deployment may use live payments or the production Firebase project's
 * Admin credential. Everything else - preview, `vercel dev`, and a plain local run (no VERCEL_ENV)
 * - is non-production. Local runs used to be exempt, which let `.env.local` + `api/keys/keys.json`
 * (both pointing at production) drive live payments and write production Firestore from a laptop.
 * Emulator runs are unaffected: they use a `demo-` project and never reach this check.
 */
export function checkEnvironmentIsolation(input: IsolationInput): IsolationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = input.vercelEnv === 'production';
  const onVercel = input.vercelEnv === 'production' || input.vercelEnv === 'preview' || input.vercelEnv === 'development';
  const where = onVercel ? `${input.vercelEnv} deployment` : 'local run (no VERCEL_ENV)';

  if (input.dodoEnvironment === 'live_mode' && !isProduction) {
    errors.push(
      `DODO_PAYMENTS_ENVIRONMENT=live_mode is not allowed on a ${where}. ` +
        'Live payments may only run on the Vercel production deployment. For local work use Dodo TEST-mode ' +
        'credentials (DODO_PAYMENTS_ENVIRONMENT=test_mode); keep the live key in the Production scope only.',
    );
  }

  if (!isProduction) {
    const productionIds = new Set<string>([...KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS, ...(input.productionFirebaseProjectId ? [input.productionFirebaseProjectId] : [])]);
    if (input.firebaseProjectId && productionIds.has(input.firebaseProjectId)) {
      errors.push(
        `This ${where} is configured with the PRODUCTION Firebase project (${input.firebaseProjectId}). ` +
          'The Admin SDK bypasses security rules, so it could read and write production data. Use the Firebase ' +
          'emulators (GCLOUD_PROJECT=demo-..., FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST) or a separate ' +
          'preview project, and scope FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY per environment.',
      );
    } else if (onVercel && !input.productionFirebaseProjectId) {
      warnings.push(
        `PRODUCTION_FIREBASE_PROJECT_ID is not set, so this ${where} relies on the built-in production project list only. ` +
          'Set it (same value on every environment) so a future production project move cannot be missed.',
      );
    }
  }
  return { errors, warnings };
}

/** Throws when the configuration would let a non-production run (preview, vercel dev, or local) reach production. */
export function assertEnvironmentIsolation(input: IsolationInput): IsolationResult {
  const result = checkEnvironmentIsolation(input);
  if (result.errors.length) {
    throw new Error(`Refusing to start: unsafe environment configuration.\n${result.errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  return result;
}
