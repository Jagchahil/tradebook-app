import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, reconcileSignupToUser } from '../../../lib/supabase';

export const runtime = 'nodejs';

// SEAMLESS ONBOARDING. The app calls this once on first launch after sign-in. It pulls what the
// user already told us on the web /start signup (business structure, name/address, VAT, a PAYE job)
// into their account, so the app first-run wizard never asks any of it a second time.
//
// Idempotent and safe to call on every launch: reconcileSignupToUser is guarded by reconciled_at
// and does nothing once it has run. The phone (the join key) is read from the verified user server
// side, never from the request body, so nobody can reconcile another person's signup.

async function userFrom(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token ? verifyAccessToken(token) : null;
}

export async function POST(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const result = await reconcileSignupToUser(user.id);
  return NextResponse.json(result);
}
