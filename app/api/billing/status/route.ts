import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getPhoneForUser, getSubscriptionByPhone } from '../../../../lib/supabase';

// The app calls this with the user's Supabase access token to learn its real
// billing state. The account is keyed by phone, so we resolve token -> user ->
// phone -> subscription. All DB reads use the service role inside the helpers.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const phone = await getPhoneForUser(user.id);
  const sub = phone ? await getSubscriptionByPhone(phone) : null;
  if (!sub || !sub.status) return NextResponse.json({ status: 'none' });
  return NextResponse.json(sub);
}
