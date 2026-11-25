/**
 * Pure environment checks for a Vercel PREVIEW (or production) deployment.
 * Takes an env map, returns pass/warn/fail findings. It never returns or logs
 * a variable's VALUE - only its name and a verdict - so its output is safe to
 * paste into a ticket. CLI wrapper: scripts/preview-preflight.ts.
 */
import { checkEnvironmentIsolation, KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS } from '../../api/_isolation.js';

export type Level = 'pass' | 'warn' | 'fail';
export interface Finding { id: string; level: Level; message: string }
export type EnvMap = Record<string, string | undefined>;

const PRODUCTION_ORIGINS = ['https://rampcut.astralbuild.dev'];

const SERVER_REQUIRED = [
  'DODO_PAYMENTS_API_KEY',
  'DODO_PAYMENTS_WEBHOOK_KEY',
  'DODO_PAYMENTS_ENVIRONMENT',
  'DODO_PRO_MONTHLY_PRODUCT_ID',
  'DODO_PRO_ANNUAL_PRODUCT_ID',
  'ALLOWED_ORIGINS',
  'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY',
  'PRODUCTION_FIREBASE_PROJECT_ID',
] as const;

const CLIENT_REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const present = (v: string | undefined) => typeof v === 'string' && v.trim() !== '' && v.trim() !== '{}';

export function evaluateDeploymentEnv(env: EnvMap, target: 'preview' | 'production' = 'preview'): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, level: Level, message: string) => out.push({ id, level, message });

  for (const name of [...SERVER_REQUIRED, ...CLIENT_REQUIRED]) {
    if (present(env[name])) add(`set:${name}`, 'pass', `${name} is set`);
    else add(`set:${name}`, 'fail', `${name} is missing or empty`);
  }

  // ── Payments ─────────────────────────────────────────────────────────────
  const dodoEnv = env.DODO_PAYMENTS_ENVIRONMENT;
  if (target === 'preview') {
    if (dodoEnv === 'test_mode') add('dodo:mode', 'pass', 'DODO_PAYMENTS_ENVIRONMENT is test_mode');
    else add('dodo:mode', 'fail', `DODO_PAYMENTS_ENVIRONMENT must be test_mode for a preview (is ${dodoEnv ? 'not test_mode' : 'unset'})`);
  } else if (dodoEnv === 'live_mode') {
    add('dodo:mode', 'warn', 'Production is in live_mode: live payments are enabled. Confirm this is intentional and approved.');
  }
  if (present(env.DODO_PAYMENTS_WEBHOOK_KEY) && !env.DODO_PAYMENTS_WEBHOOK_KEY!.startsWith('whsec_')) {
    add('dodo:webhook-format', 'warn', 'DODO_PAYMENTS_WEBHOOK_KEY does not start with whsec_ (Standard Webhooks secrets normally do); verify it is the endpoint signing secret, not the API key');
  }
  if (present(env.DODO_WEBHOOK_DEV_BYPASS)) {
    add('dodo:bypass', 'fail', 'DODO_WEBHOOK_DEV_BYPASS must never be set on a deployed environment');
  }
  if (!present(env.DODO_PRO_FOUNDER_PRODUCT_ID)) {
    add('dodo:founder', 'warn', 'DODO_PRO_FOUNDER_PRODUCT_ID is unset: the Founder plan is hidden and its checkout returns 503 (fine if intentional)');
  }

  // ── Firebase isolation ───────────────────────────────────────────────────
  let adminProject: string | null = null;
  if (present(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY)) {
    try {
      const parsed = JSON.parse(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY!) as { project_id?: unknown; private_key?: unknown };
      adminProject = typeof parsed.project_id === 'string' ? parsed.project_id : null;
      if (adminProject) add('firebase:admin-json', 'pass', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY parses and names a project');
      else add('firebase:admin-json', 'fail', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY has no project_id');
      if (typeof parsed.private_key !== 'string') add('firebase:admin-key', 'fail', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY has no private_key');
    } catch {
      add('firebase:admin-json', 'fail', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY is not valid JSON (paste it as ONE line)');
    }
  }
  const clientProject = env.VITE_FIREBASE_PROJECT_ID ?? null;
  const productionProject = env.PRODUCTION_FIREBASE_PROJECT_ID ?? null;

  if (adminProject && clientProject) {
    if (adminProject === clientProject) add('firebase:match', 'pass', 'Admin credential and client config refer to the same Firebase project');
    else add('firebase:match', 'fail', 'Admin service account and VITE_FIREBASE_PROJECT_ID are DIFFERENT projects: ID tokens would never verify');
  }
  if (target === 'preview') {
    const iso = checkEnvironmentIsolation({
      vercelEnv: 'preview',
      firebaseProjectId: adminProject,
      productionFirebaseProjectId: productionProject,
      dodoEnvironment: dodoEnv,
    });
    iso.errors.forEach((m, i) => add(`isolation:${i}`, 'fail', m));
    if (!iso.errors.length && productionProject && adminProject) add('isolation:admin', 'pass', 'Admin credential is NOT the production project');
    if (clientProject && productionProject) {
      if (clientProject === productionProject) add('isolation:client', 'fail', 'VITE_FIREBASE_PROJECT_ID is the PRODUCTION project: preview users would sign into production Auth');
      else add('isolation:client', 'pass', 'Client Firebase config is NOT the production project');
    }
  }

  // ── Origins / redirects ──────────────────────────────────────────────────
  if (present(env.ALLOWED_ORIGINS)) {
    const origins = env.ALLOWED_ORIGINS!.split(',').map((o) => o.trim()).filter(Boolean);
    if (target === 'preview') {
      const first = origins[0];
      if (PRODUCTION_ORIGINS.includes(first)) add('origins:first', 'warn', 'The FIRST ALLOWED_ORIGINS entry is the production site. On a Vercel preview the server now falls back to the deployment itself (not this entry), so a test payment will not redirect to production, but keep the preview origin first so the list is unambiguous and CORS does not advertise production.');
      else add('origins:first', 'pass', 'First ALLOWED_ORIGINS entry is not the production site');
    }
    origins.filter((o) => !/^https?:\/\/[^/\s]+$/.test(o)).forEach((_, i) => add(`origins:format:${i}`, 'fail', 'An ALLOWED_ORIGINS entry is not a bare origin (scheme + host, no path or trailing slash)'));
  }

  // ── Analytics ────────────────────────────────────────────────────────────
  if (target === 'preview' && present(env.VITE_GA_MEASUREMENT_ID)) {
    add('analytics:ga', 'warn', 'VITE_GA_MEASUREMENT_ID is set on preview: the GA script will load (events are suppressed for non-customer traffic, but prefer leaving it unset)');
  }
  if (present(env.ANALYTICS_INTERNAL_UIDS)) add('analytics:internal', 'pass', 'ANALYTICS_INTERNAL_UIDS is set');
  else add('analytics:internal', 'warn', 'ANALYTICS_INTERNAL_UIDS is unset: only ?rampcut_internal=1 browsers are tagged as founder traffic');

  return out;
}

/** Minimal dotenv parser for `vercel env pull` output (KEY="value", \n escapes). */
export function parseEnvFile(text: string): EnvMap {
  const env: EnvMap = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\n/g, '\n');
    env[key] = value;
  }
  return env;
}

export function summarize(findings: Finding[]): { fail: number; warn: number; pass: number; go: boolean } {
  const count = (l: Level) => findings.filter((f) => f.level === l).length;
  return { fail: count('fail'), warn: count('warn'), pass: count('pass'), go: count('fail') === 0 };
}

/**
 * Safety check for LOCAL development (`.env.local` + the `api/keys/keys.json` fallback).
 * Local runs must be able to do nothing that matters in production: no live payments, no
 * production Admin credential. Names and verdicts only - never values (project ids excepted:
 * they are public identifiers and are what makes the finding actionable).
 */
export function evaluateLocalEnv(env: EnvMap, opts: { localKeyProjectId?: string | null } = {}): Finding[] {
  const out: Finding[] = [];
  const add = (id: string, level: Level, message: string) => out.push({ id, level, message });

  const mode = env.DODO_PAYMENTS_ENVIRONMENT;
  if (mode === 'test_mode') add('local:dodo', 'pass', 'DODO_PAYMENTS_ENVIRONMENT is test_mode');
  else if (mode === 'live_mode') add('local:dodo', 'fail', 'DODO_PAYMENTS_ENVIRONMENT is live_mode. Local runs must use Dodo TEST credentials (the server now refuses to start with live_mode outside Vercel production). Move the live key to the Vercel Production scope only.');
  else add('local:dodo', 'warn', 'DODO_PAYMENTS_ENVIRONMENT is unset: the API will refuse to start until it is test_mode');

  const production = new Set<string>([...KNOWN_PRODUCTION_FIREBASE_PROJECT_IDS, ...(env.PRODUCTION_FIREBASE_PROJECT_ID ? [env.PRODUCTION_FIREBASE_PROJECT_ID] : [])]);

  let adminProject: string | null = null;
  if (present(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY)) {
    try { adminProject = (JSON.parse(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY!) as { project_id?: string }).project_id ?? null; } catch { add('local:admin-json', 'fail', 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY is not valid JSON'); }
  }
  const sources: Array<[string, string | null]> = [['FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY', adminProject], ['api/keys/keys.json (local fallback)', opts.localKeyProjectId ?? null]];
  for (const [label, project] of sources) {
    if (!project) continue;
    if (production.has(project)) add(`local:admin:${label}`, 'fail', `${label} is the PRODUCTION Firebase project (${project}): running the API locally would read and write production data. Use the Firebase emulators (GCLOUD_PROJECT=demo-..., FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST) or the preview project's key, and move/rename this credential.`);
    else add(`local:admin:${label}`, 'pass', `${label} is not the production project (${project})`);
  }
  if (!sources.some(([, p]) => p)) add('local:admin', 'pass', 'No Admin credential configured for local runs (the API will need the emulators)');

  const client = env.VITE_FIREBASE_PROJECT_ID;
  if (client && production.has(client)) add('local:client', 'warn', `VITE_FIREBASE_PROJECT_ID is the PRODUCTION project (${client}): signing in from localhost would create real users in production Auth. Prefer the preview project's web config or the Auth emulator.`);
  else if (client) add('local:client', 'pass', 'Client Firebase config is not the production project');

  const first = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)[0];
  if (first && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(first)) add('local:origins', 'warn', 'The first ALLOWED_ORIGINS entry is not localhost: a local checkout would return to that site. Put http://localhost:5173 first for local work.');

  if (present(env.DODO_WEBHOOK_DEV_BYPASS)) add('local:bypass', 'warn', 'DODO_WEBHOOK_DEV_BYPASS is set (the handler ignores it, but remove it)');
  return out;
}
