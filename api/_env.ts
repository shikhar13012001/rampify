/**
 * Server-side environment validation for the Dodo Payments integration.
 * Call `getServerEnv()` once per cold start (dodoClient() does this) — it
 * throws a single, clear error listing every missing/invalid variable
 * instead of failing on whichever one happens to be read first.
 */
import { z } from 'zod';

const ServerEnvSchema = z.object({
  DODO_PAYMENTS_API_KEY: z.string().min(1, 'DODO_PAYMENTS_API_KEY is required'),
  DODO_PAYMENTS_WEBHOOK_KEY: z.string().min(1, 'DODO_PAYMENTS_WEBHOOK_KEY is required'),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(['test_mode', 'live_mode'], {
    message: 'DODO_PAYMENTS_ENVIRONMENT must be "test_mode" or "live_mode"',
  }),
  DODO_PRO_MONTHLY_PRODUCT_ID: z.string().min(1, 'DODO_PRO_MONTHLY_PRODUCT_ID is required'),
  DODO_PRO_ANNUAL_PRODUCT_ID: z.string().min(1, 'DODO_PRO_ANNUAL_PRODUCT_ID is required'),
  // Optional: the one-time "Founder Pro" product (see api/_plans.ts). When
  // unset, /api/founder-seats reports configured:false and the founder
  // option is hidden client-side; a direct checkout attempt returns 503.
  DODO_PRO_FOUNDER_PRODUCT_ID: z.string().optional(),
  // Optional — checked as a raw string ('1' enables it), same convention as
  // the removed STRIPE_WEBHOOK_DEV_BYPASS.
  DODO_WEBHOOK_DEV_BYPASS: z.string().optional(),
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),
  FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY: z.string().optional(), // falls back to api/keys/keys.json locally
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Validates process.env against ServerEnvSchema. Throws a single Error
 * listing every problem found — call this before constructing the Dodo
 * client so a misconfigured deploy fails loudly on the first request
 * instead of surfacing as a confusing downstream SDK error.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const result = ServerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid or missing environment variables:\n${issues}`);
  }

  cached = result.data;
  return cached;
}
