import { NextRequest, NextResponse } from 'next/server';
import { hasBankFeedConfig, getAccessToken, createRequisition } from '../../../../lib/bankfeed';
import { verifyAccessToken, createBankConnection } from '../../../../lib/supabase';
import { signState } from '../../../../lib/hmrc';

// Start a bank connection. The app posts the chosen institution id with the
// user's Supabase token; we create the GoCardless consent journey and hand back
// the hosted link. The reference is an HMAC signed state carrying the verified
// user id (same signer as the HMRC OAuth flow), so the callback can bind the
// requisition to the right account without trusting anything client supplied.
export const runtime = 'nodejs';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!hasBankFeedConfig()) {
    return NextResponse.json({ error: 'not_enabled', message: 'Bank feeds are not switched on yet.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { institution_id?: string };
  const institutionId = (body.institution_id || '').trim();
  if (!institutionId || institutionId.length > 80) {
    return NextResponse.json({ error: 'institution_required' }, { status: 400 });
  }

  const reference = signState(user.id);
  if (!reference) return NextResponse.json({ error: 'server_config' }, { status: 500 });

  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });

  const redirect = `${APP_URL}/api/bank/callback`;
  const requisition = await createRequisition(access, institutionId, redirect, reference);
  if (!requisition) return NextResponse.json({ error: 'provider_unavailable' }, { status: 502 });

  const stored = await createBankConnection(user.id, requisition.id, reference, institutionId);
  if (!stored) return NextResponse.json({ error: 'storage_failed' }, { status: 500 });

  return NextResponse.json({ link: requisition.link });
}
