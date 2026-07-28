import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { authorizeUrl, isHmrcConfigured, signState } from '../../../../lib/hmrc';

// Start the HMRC "connect your account" flow. The app calls this with the user's
// own Supabase token. We mint a signed state that carries the user id, then hand
// back the HMRC authorize URL for the app to open in the browser. We never file
// anything here; this only links the account so the user can later approve a
// submission. Returns 503 until HMRC credentials are set (dormant by default).
export async function GET(req: NextRequest) {
  if (!isHmrcConfigured()) {
    return NextResponse.json({ error: 'hmrc_not_configured' }, { status: 503 });
  }
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = authorizeUrl(signState(user.id));
  if (!url) return NextResponse.json({ error: 'hmrc_not_configured' }, { status: 503 });
  return NextResponse.json({ url });
}
