/**
 * Client helper for GET /api/founder-seats (see api/founder-seats.ts).
 * One in-memory cache per page load — the pricing card and the upgrade modal
 * both read it, and neither needs a fresher number than "this page view".
 */
import { FOUNDER_PRICE_USD, FOUNDER_SEATS } from './planConfig';

export interface FounderSeats {
  configured: boolean;
  available: boolean;
  total: number;
  sold: number;
  remaining: number;
  priceUsd: number;
}

/** A seat is available only after a verified server response. */
export const OPTIMISTIC_FOUNDER_SEATS: FounderSeats = {
  configured: false,
  available: false,
  total: FOUNDER_SEATS,
  sold: 0,
  remaining: 0,
  priceUsd: FOUNDER_PRICE_USD,
};

let cache: Promise<FounderSeats> | null = null;

export function fetchFounderSeats(): Promise<FounderSeats> {
  if (!cache) {
    cache = fetch('/api/founder-seats')
      .then(async (res) => {
        if (!res.ok) throw new Error(`founder-seats ${res.status}`);
        const data = (await res.json()) as Partial<FounderSeats>;
        return {
          configured: Boolean(data.configured),
          available: Boolean(data.available),
          total: Number(data.total ?? FOUNDER_SEATS),
          sold: Number(data.sold ?? 0),
          remaining: Number(data.remaining ?? 0),
          priceUsd: Number(data.priceUsd ?? FOUNDER_PRICE_USD),
        };
      })
      .catch(() => OPTIMISTIC_FOUNDER_SEATS);
  }
  return cache;
}

/** Test seam. */
export function resetFounderSeatsCache(): void {
  cache = null;
}
