/**
 * Server-side schema + validation for analytics events (api/track-event.ts).
 * Pulled into its own module (rather than inlined in the handler) so it can
 * be unit-tested directly without spinning up a VercelRequest/VercelResponse
 * pair or touching firebase-admin — see _analyticsEvents.test.ts.
 *
 * This is the independent backstop for src/lib/analytics.ts's AnalyticsProps
 * contract: even a modified or malicious client can't smuggle nested
 * objects, arrays, oversized strings, or an unlisted event name through —
 * anything outside this shape is rejected before it ever reaches Firestore.
 */
import { z } from 'zod';

export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'landing_view',
  'editor_opened',
  'clip_loaded',
  'curve_changed',
  'export_started',
  'export_render_completed',
  'export_failed',
  'export_cancelled',
  'download_initiated',
  'signup_completed',
  'upgrade_viewed',
  'checkout_started',
  'ui_error',
  'curve_link_copied',
  'curve_link_opened',
  'pwa_installed',
  'identity_linked',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const AcquisitionSchema = z
  .object({
    source: z.string().max(80).nullable(),
    medium: z.string().max(80).nullable(),
    campaign: z.string().max(80).nullable(),
    landingPath: z.string().max(200).nullable(),
  })
  .nullable();

const CapabilitiesSchema = z
  .object({
    supported: z.boolean(),
    missing: z.array(z.string().max(80)).max(10),
  })
  .nullable();

// Primitive-only, bounded prop bag — the server-side mirror of
// src/lib/analytics.ts's AnalyticsProps type.
const string=z.string().max(200),number=z.number().finite();
const PropsSchema=z.object({
 tier:z.enum(['guest','free','pro']).optional(),resolution:z.enum(['1080p','4k']).optional(),
 blurEnabled:z.boolean().optional(),ofEnabled:z.boolean().optional(),isDemoClip:z.boolean().optional(),
 durationMs:number.nonnegative().optional(),elapsedMs:number.nonnegative().optional(),validated:z.boolean().nullable().optional(),
 // Legacy stage values stay valid so historical events remain parseable; the
 // contract stages (ANALYTICS_CONTRACT.md) are what current clients send.
 stage:z.enum(['worker_load','video_decode','output_too_small','ffmpeg_exit','already_running','unknown','ui_render','ui_unhandled','ui_rejection','input_validation','processing','muxing','output_validation','download_preparation']).optional(),
 errorCode:z.string().regex(/^[a-z][a-z0-9_]{1,39}$/).optional(),retryable:z.boolean().optional(),
 retryOfExportId:z.string().max(100).nullable().optional(),
 reason:z.enum(['user','abandoned']).optional(),
 fileSizeBucket:z.enum(['lt50','50_200','200_500','gt500','unknown']).optional(),
 durationBucket:z.enum(['lt10','10_30','30_60','60_180','gt180','unknown']).optional(),
 attempt:number.int().positive().max(1000).optional(),repeat:z.boolean().optional(),
 source:string.optional(),presetId:string.nullable().optional(),pointCount:number.int().nonnegative().optional(),segmentCount:number.int().nonnegative().optional(),
 isRestoredSession:z.boolean().optional(),durationSec:number.nonnegative().optional(),width:number.nonnegative().optional(),height:number.nonnegative().optional(),sizeMB:number.nonnegative().nullable().optional(),
 path:string.optional(),referrerHost:string.nullable().optional(),billingPeriod:z.enum(['monthly','annual','founder']).optional(),
}).strict();

export const AnalyticsEventSchema = z.object({
  eventId: z.string().uuid(),
  name: z.enum(ANALYTICS_EVENT_NAMES),
  timestamp: z.number().int().positive(),
  sessionId: z.string().min(1).max(100),
  anonId: z.string().min(1).max(100),
  // The client-asserted uid is accepted here for shape validation only —
  // api/track-event.ts never trusts it; it re-resolves uid itself from a
  // verified Authorization header, if one was sent.
  uid: z.string().max(128).nullable().optional(),
  isTestSession: z.boolean(),
  exportId: z.string().max(100).nullable().optional(),
  appVersion: z.string().max(40).optional(),
  // Shared properties (eventVersion 2+). All optional so older cached clients
  // keep working; the server never trusts environment/trafficClass blindly —
  // see deriveServerTraffic().
  eventVersion: z.number().int().min(1).max(100).optional(),
  environment: z.enum(['production', 'staging', 'development']).optional(),
  trafficClass: z.enum(['customer', 'founder', 'development', 'staging']).optional(),
  route: z.string().max(120).regex(/^\/[A-Za-z0-9/_\-.]*$/).nullable().optional(),
  browserFamily: z.enum(['chrome', 'edge', 'firefox', 'safari', 'opera', 'other']).optional(),
  deviceClass: z.enum(['mobile', 'tablet', 'desktop']).optional(),
  acquisition: AcquisitionSchema.optional(),
  capabilities: CapabilitiesSchema.optional(),
  props: PropsSchema.optional(),
});

export type AnalyticsEventPayload = z.infer<typeof AnalyticsEventSchema>;

export type ParseResult =
  | { ok: true; data: AnalyticsEventPayload }
  | { ok: false; error: string };

const MAX_PAYLOAD_BYTES = 4000;

/**
 * Validates a raw, untrusted request body. Never throws — always returns a
 * discriminated result, so the handler doesn't need its own try/catch around
 * parsing. Rejects oversized payloads before handing them to zod, since a
 * single huge string value would otherwise still cost real parsing time.
 */
export function parseAnalyticsEvent(body: unknown): ParseResult {
  let approxSize: number;
  try {
    approxSize = Buffer.byteLength(JSON.stringify(body ?? {}),'utf8');
  } catch {
    return { ok: false, error: 'Payload is not serializable' };
  }
  if (approxSize > MAX_PAYLOAD_BYTES) {
    return { ok: false, error: `Payload too large (${approxSize} > ${MAX_PAYLOAD_BYTES} bytes)` };
  }

  const result = AnalyticsEventSchema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { ok: false, error: issues };
  }
  return { ok: true, data: result.data };
}

// ─── Server-authoritative traffic classification ────────────────────────────

export type ServerTrafficClass = 'customer' | 'founder' | 'development' | 'staging';
export type ServerEnvironment = 'production' | 'staging' | 'development';
export type AuthState = 'verified' | 'anonymous' | 'token_invalid';

export interface TrafficInputs {
  clientIsTestSession: boolean;
  clientTrafficClass?: ServerTrafficClass;
  clientEnvironment?: ServerEnvironment;
  /** process.env.VERCEL_ENV — 'production' | 'preview' | 'development' | undefined. */
  vercelEnv?: string;
  /** Firebase emulator / demo project. */
  isEmulator?: boolean;
  /** Verified uid (never the client-asserted one). */
  uid: string | null;
  /** Comma-separated founder/internal uids from ANALYTICS_INTERNAL_UIDS. */
  internalUids?: string;
}

/**
 * The client labels its own traffic, but a label that only ever *excludes*
 * itself from metrics is safe to accept; what the server must not do is let
 * the client claim "customer" from a place that is demonstrably not
 * production. Precedence (most restrictive wins):
 *   emulator / Vercel non-production deployment → development / staging
 *   verified uid on the internal list           → founder
 *   client's own label (founder/dev/staging)    → as claimed
 *   otherwise                                   → customer
 *
 * Deliberately NOT an input: the Dodo payment mode. A production site running
 * Dodo in test mode still has real visitors; payment sandboxing is flagged on
 * the payment events themselves (api/_billingLedger.ts), not on all traffic.
 */
export function deriveServerTraffic(input: TrafficInputs): {
  environment: ServerEnvironment;
  trafficClass: ServerTrafficClass;
  isTestSession: boolean;
} {
  const internal = new Set((input.internalUids ?? '').split(',').map((v) => v.trim()).filter(Boolean));
  let environment: ServerEnvironment = input.clientEnvironment ?? 'production';
  let trafficClass: ServerTrafficClass = input.clientTrafficClass ?? (input.clientIsTestSession ? 'founder' : 'customer');

  if (input.isEmulator || input.vercelEnv === 'development') {
    environment = 'development';
    trafficClass = 'development';
  } else if (input.vercelEnv === 'preview') {
    environment = 'staging';
    trafficClass = 'staging';
  } else if (input.vercelEnv === 'production') {
    environment = 'production';
    // A production deployment can't be development/staging traffic.
    if (trafficClass === 'development' || trafficClass === 'staging') trafficClass = 'customer';
    if (input.uid && internal.has(input.uid)) trafficClass = 'founder';
  } else if (input.uid && internal.has(input.uid)) {
    trafficClass = 'founder';
  }

  const isTestSession = input.clientIsTestSession || trafficClass !== 'customer';
  return { environment, trafficClass, isTestSession };
}
