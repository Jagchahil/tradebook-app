import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  createAccountantGrant,
  listAccountantGrants,
  revokeAccountantGrant,
} from '../../../lib/supabase';
import { accountantToken, clampGrantDays, expiryFor } from '../../../lib/accountant';
import { clientIp, rateLimited } from '../../../lib/ratelimit';
import { siteBase } from '../../../lib/packtoken';

// Accountant read only access, from the account owner's side.
//
//   GET                      -> { grants: [...] }   the links they have issued
//   POST { name, email, days } -> { grant, url }    issue a new one
//   POST { revoke: <id> }      -> { ok: true }      kill one, immediately
//
// Everything here is authenticated as the OWNER. The accountant never touches
// these routes; they only ever open the public view. Every query is scoped by the
// authenticated user's own id, so a caller cannot read or revoke anyone else's
// grant even if they learn its id.
//
// The link is shown to the user ONCE, here, at the moment of creation. We do not
// store it: it is derivable from the grant id at any time, and showing it back on
// the list would mean a shoulder surfer with the phone gets the books.

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const grants = await listAccountantGrants(user.id);
  return NextResponse.json({ grants });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Minting a link hands out access to someone's whole books, so it is rate
  // limited hard, per account, not per IP.
  if (rateLimited(`acct:${user.id}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  let body: { name?: string; email?: string; days?: number; revoke?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Revoke. Scoped by user id in the query, so this can only ever kill their own.
  if (body.revoke) {
    const ok = await revokeAccountantGrant(user.id, String(body.revoke));
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  const days = clampGrantDays(body.days);
  const grant = await createAccountantGrant(
    user.id,
    (body.name ?? '').trim().slice(0, 120) || null,
    (body.email ?? '').trim().slice(0, 200) || null,
    expiryFor(days),
  );
  if (!grant) return NextResponse.json({ error: 'could_not_create' }, { status: 500 });

  void clientIp(req); // reserved for the audit trail

  return NextResponse.json({
    grant,
    // Shown once. Derivable later, but never listed back.
    url: `${siteBase()}/accountant/${accountantToken(grant.id)}`,
    days,
  });
}
