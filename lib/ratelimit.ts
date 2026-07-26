// Rate limiting for the open public endpoints.
//
// WHAT THIS DOES AND DOES NOT PROTECT. Worth being exact, because the previous comment in
// this file implied more than it delivered.
//
// It does NOT protect the AI spend. The daily and monthly caps live in add_ai_usage, in
// Postgres, and they are properly shared across every instance. That guard is real and it
// is elsewhere. This is abuse control on the fourteen open endpoints: stopping one source
// from hammering the invoice generator or the lead capture.
//
// THE BUG THIS FIXES. The counters lived in a Map in module memory. On Vercel that memory
// belongs to ONE warm instance. Fourteen endpoints were guarded by it, and under load Vercel
// runs many instances, each with its own private count. So the real ceiling was
// `limit x however many instances happen to be warm`, a number nobody chose, nobody set,
// and nobody could see. It looked like a rate limit and it read like a rate limit, and the
// harder you pushed it the more it let through, which is the exact opposite of the job.
//
// Now the counter lives in the same database as the spend caps, so there is one of it.

import { rateHit } from './supabase';

// The in-memory map survives as a LAST RESORT, not as the primary. See rateLimitedShared.
const buckets = new Map<string, number[]>();

export function clientIp(req: Request): string {
  // Prefer the platform-trusted client IP that Vercel sets and the client cannot
  // spoof. Only fall back to X-Forwarded-For, and then use the LAST hop (added by
  // the trusted proxy) rather than the first (which a client can forge).
  const vercel = req.headers.get('x-vercel-forwarded-for');
  if (vercel) return vercel.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((h) => h.trim()).filter(Boolean);
    return hops[hops.length - 1] || 'unknown';
  }
  return 'unknown';
}

// Per-instance, best effort. Kept because it is free, it is synchronous, and it catches the
// dumbest floods before they cost us a database round trip.
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);

  // Prune occasionally so memory does not grow without bound.
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || now - v[v.length - 1] > windowMs) buckets.delete(k);
    }
  }

  return recent.length > limit;
}

// THE REAL ONE. One counter, shared by every instance, in Postgres.
//
// Two layers, cheapest first:
//
//   1. The local map. If this instance alone has already seen the caller go over, we are
//      done, and we have not touched the database. A flood from one source usually lands on
//      one warm instance, so this catches most of it for nothing.
//   2. The shared counter. Authoritative, atomic, one round trip.
//
// FAILS OPEN, ON PURPOSE. If the database cannot answer, rateHit returns null and we let the
// request through rather than turning a database wobble into a total outage of every public
// page. That is the right call for an abuse control and the WRONG call for an auth gate, so
// it must never be used as one. The auth gates fail closed, and they are elsewhere.
export async function rateLimitedShared(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (rateLimited(key, limit, windowMs)) return true;

  const shared = await rateHit(key, limit, Math.max(1, Math.round(windowMs / 1000)));
  if (shared === null) return false; // fail open, and we have already applied the local cap
  return shared;
}

// A ceiling on a SIGNED IN caller, per route.
//
// Being logged in is not the same as being trusted. Every read behind these routes costs database
// time and Supabase compute, and one account, scripted or simply stuck in a retry loop in a bad
// build of the app, can generate more load than a thousand real plumbers. The open endpoints have
// been throttled per IP since the scale audit; this is the same idea applied to the authenticated
// ones, keyed on the user id, so one bad account pays for itself and nobody else does.
//
// Deliberately generous. 120 calls a minute is two a second sustained, which no honest screen in
// the app comes close to, so no real person will ever see this fire.
//
// Same failure posture as everything else in this file: it fails OPEN. It is abuse control, and a
// database wobble must never lock a man out of his own books. The auth gate above it is the thing
// that fails closed.
const PER_USER_DEFAULT = 120;
const PER_USER_WINDOW_MS = 60 * 1000;

export async function userBurst(
  route: string,
  userId: string,
  limit = PER_USER_DEFAULT,
): Promise<boolean> {
  return rateLimitedShared(`u:${route}:${userId}`, limit, PER_USER_WINDOW_MS);
}
