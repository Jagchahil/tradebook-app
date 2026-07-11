import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, saveHmrcFraud } from '../../../../lib/supabase';
import { rateLimitedShared, clientIp } from '../../../../lib/ratelimit';
import { sanitizeClientFraud, fraudContextFromRequest } from '../../../../lib/fraud';
import { missingFraudHeaders } from '../../../../lib/hmrc';

// The device posts the fraud prevention values that only it can collect (a
// persisted device id, the browser JS user agent, screen and window geometry,
// timezone, and, if available, the public port and MFA state). We sanitize them,
// store the latest snapshot against the user, then report which required
// Gov-Client / Gov-Vendor headers are still missing once merged with the values
// the server derives from this request. That completeness check is the evidence
// that collection works end to end from the real client, per docs/66 section 8.
//
// This endpoint never contacts HMRC and never files anything. It only records
// what the device can see and tells the caller what is still absent.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Light hygiene throttle. The durable protection is that this is authed and
  // only touches the caller's own row.
  if (await rateLimitedShared(`fph:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const client = sanitizeClientFraud(body);
  await saveHmrcFraud(user.id, client as unknown as Record<string, unknown>);

  const ctx = fraudContextFromRequest(req, client, { userId: user.id });
  const missing = missingFraudHeaders(ctx);
  return NextResponse.json({ ok: true, missing });
}
