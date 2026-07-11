import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// A tiny health check for uptime monitoring. Reports whether the app is up and
// whether the database answers, and nothing else: no counts, no data, no
// configuration details, so it is safe to expose publicly and poll often.
export const runtime = 'nodejs';

// THE SECRETS THAT, IF MISSING, BREAK A FEATURE SILENTLY.
//
// Each of these signs one kind of link. They all fail CLOSED: no secret means no token
// is issued and no token verifies. That is the safe direction, but it is also the QUIET
// one. Quarter packs and confirmation emails would simply stop working, with no error
// anywhere, and the first person to notice would be a customer.
//
// So there is a way to ASK. Behind the cron bearer, because a public endpoint that lists
// which of our secrets are unset is a map drawn for whoever wants to forge a link.
//
//     curl -H "Authorization: Bearer $CRON_SECRET" https://lekhio.app/api/health?config=1
const SIGNING_SECRETS = [
  'SHARE_TOKEN_SECRET',   // the books a man shares with his accountant
  'PACK_TOKEN_SECRET',    // quarter end pack links
  'LEAD_TOKEN_SECRET',    // email confirm and unsubscribe
  'HMRC_STATE_SECRET',    // the OAuth state, i.e. the CSRF guard on tax filing
] as const;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('config') && authorised(req)) {
    // Presence only. Never the value, not even a prefix.
    const missing = SIGNING_SECRETS.filter((k) => !process.env[k]);
    return NextResponse.json({ ok: missing.length === 0, missing }, { status: missing.length === 0 ? 200 : 503 });
  }

  let db = false;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const res = await fetch(`${url}/rest/v1/users?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4000),
      });
      db = res.ok;
    }
  } catch {
    db = false;
  }
  return NextResponse.json({ ok: true, db }, { status: db ? 200 : 503 });
}
