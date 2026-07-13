import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getPhoneForUser, getSubscriptionByPhone, grantTrialIfNone } from '../../../../lib/supabase';
import { isEntitled } from '../../../../lib/entitlement';

// The one question the app asks about money: may this man open his books?
//
// IT ANSWERS WITH A BOOLEAN, AND THE APP DOES NOT ARGUE WITH IT.
//
// The app used to be handed a status string and left to work out what it meant, with
// `status === 'active' || status === 'trialing'`. That line reads the status and never the end
// date, so a trial, once granted, would have run forever. The rule now lives in lib/entitlement.ts,
// on the server, written once. See the long note in that file.
//
// IT ALSO BACKSTOPS THE TRIAL GRANT, and that is deliberate rather than lazy.
//
// The trial is normally granted by POST /api/billing/trial, when the man taps the button. But if
// that request failed, because he was in a lift or on site or on 3G, he would be left with no
// subscription row and would be shown the paywall on his next launch, having done nothing wrong
// and having been told he had a fortnight. So the read path grants it too. Two callers, one
// idempotent function, and a unique index in the database that makes a double grant impossible.
//
// A man is never locked out of his own books because one of our requests did not arrive.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const phone = await getPhoneForUser(user.id);
  if (!phone) return NextResponse.json({ status: 'none', entitled: false });

  const sub = (await getSubscriptionByPhone(phone)) ?? (await grantTrialIfNone(phone));

  if (!sub || !sub.status) return NextResponse.json({ status: 'none', entitled: false });
  return NextResponse.json({ ...sub, entitled: isEntitled(sub) });
}
