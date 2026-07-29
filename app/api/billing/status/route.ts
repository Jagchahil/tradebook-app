import { NextRequest, NextResponse } from 'next/server';
import {
  getPhoneForUser, getSubscriptionByPhone, grantTrialIfNone, getSubscriptionByUser,
} from '../../../../lib/supabase';
import { sessionUser } from '../../../../lib/webauth';
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
// and having been told he had a week. So the read path grants it too. Two callers, one
// idempotent function, and a unique index in the database that makes a double grant impossible.
//
// A man is never locked out of his own books because one of our requests did not arrive.
export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 🔴 TWO KEYS, AND THE ACCOUNT IS TRIED FIRST.
  //
  // A web signup has no proved phone by design (see /api/signup/verify), and its trial is keyed to
  // the account id. Reading only by phone, as this did, would answer "no subscription" for every
  // customer who joined on the web and show him a paywall on a trial he was told he had.
  //
  // The phone read stays for the mobile path, where the number IS proved and where the trial was
  // granted against it, and the backstop grant stays with it: that only fires for a man who has a
  // proved number, which is exactly the population grantTrialIfNone was written for.
  const byAccount = await getSubscriptionByUser(user.id);
  if (byAccount) return NextResponse.json({ ...byAccount, entitled: isEntitled(byAccount) });

  const phone = await getPhoneForUser(user.id);
  if (!phone) return NextResponse.json({ status: 'none', entitled: false });

  const sub = (await getSubscriptionByPhone(phone)) ?? (await grantTrialIfNone(phone));

  if (!sub || !sub.status) return NextResponse.json({ status: 'none', entitled: false });
  return NextResponse.json({ ...sub, entitled: isEntitled(sub) });
}
