import { NextRequest, NextResponse } from 'next/server';
import { reconcileSignupToUser } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';

export const runtime = 'nodejs';

// SEAMLESS ONBOARDING. The app calls this once on first launch after sign-in. It pulls what the
// user already told us on the web /start signup (business structure, name/address, VAT, a PAYE job)
// into their account, so the app first-run wizard never asks any of it a second time.
//
// Idempotent and safe to call on every launch: reconcileSignupToUser is guarded by reconciled_at
// and does nothing once it has run. The phone (the join key) is read from the verified user server
// side, never from the request body, so nobody can reconcile another person's signup.

async function userFrom(req: NextRequest) {
  return sessionUser(req);
}

export async function POST(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app');
  const result = await reconcileSignupToUser(user.id);
  return NextResponse.json(result);
}
