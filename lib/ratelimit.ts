// Best effort in-memory rate limiting for the open public endpoints.
//
// This lives in module memory, so it only limits within a single warm serverless
// instance. It stops casual flooding from one source and protects the AI spend.
// For hard guarantees at scale, move to a shared store (for example Upstash) and
// require app authentication. See docs/19_SECURITY_AUDIT.md.

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

// Returns true if this key has gone over the limit in the window.
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
