import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initAdmin, loadLocalEnv, stripeClient, verifyIdToken } from './_adminInit';

/**
 * Resolves the safe origin to use for Stripe redirect URLs.
 *
 * Security: never trust the client-supplied `Origin` header directly — an
 * attacker can initiate a checkout from a server-side call or a compromised
 * host and redirect the user to an arbitrary URL after payment. We only
 * accept origins that match an explicit env-configured allowlist, plus the
 * Vercel-generated preview URL and localhost dev origins.
 *
 * Configure production origins via the `ALLOWED_ORIGINS` env var
 * (comma-separated), e.g. `ALLOWED_ORIGINS=https://rampify.app,https://www.rampify.app`.
 */
function resolveAllowedOrigin(reqOrigin: string | undefined): string | null {
  const allowed = new Set<string>();

  const envList = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const o of envList) allowed.add(o);

  // Vercel preview deployments get an auto-provided VERCEL_URL.
  if (process.env.VERCEL_URL) {
    allowed.add(`https://${process.env.VERCEL_URL}`);
  }

  // Local dev (Vite default + `vercel dev`).
  allowed.add('http://localhost:5173');
  allowed.add('http://localhost:3000');

  if (reqOrigin && allowed.has(reqOrigin)) return reqOrigin;

  // Fall back to the first configured production origin so redirects
  // always land on a trusted host even if the client omitted Origin.
  return envList[0] ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  loadLocalEnv();
  initAdmin();

  let decoded: Awaited<ReturnType<typeof verifyIdToken>>;
  try {
    decoded = await verifyIdToken(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Validate billingPeriod against a strict whitelist.
  const requested = (req.body ?? {}) as { billingPeriod?: unknown };
  const billingPeriod: 'monthly' | 'annual' =
    requested.billingPeriod === 'annual' ? 'annual' : 'monthly';

  const priceId =
    billingPeriod === 'annual'
      ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID
      : process.env.STRIPE_PRO_MONTHLY_PRICE_ID
        ?? process.env.STRIPE_PRO_PRICE_ID; // legacy fallback

  if (!priceId) {
    return res.status(500).json({ error: 'Stripe price ID not configured for billing period: ' + billingPeriod });
  }

  const origin = resolveAllowedOrigin(
    typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
  );
  if (!origin) {
    return res.status(400).json({ error: 'Unable to determine a trusted redirect origin. Set ALLOWED_ORIGINS.' });
  }

  try {
    const stripe  = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/upgrade/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/editor`,
      metadata:    { userId: decoded.uid },
      customer_email: decoded.email ?? undefined,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    // Log full error server-side; return a generic message to the client.
    console.error('[create-checkout-session]', err);
    return res.status(500).json({ error: 'Checkout session creation failed' });
  }
}
