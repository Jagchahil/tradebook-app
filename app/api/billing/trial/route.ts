import { NextRequest, NextResponse } from 'next/server';
import { getPhoneForUser, grantTrialIfNone, getSubscriptionByUser } from '../../../../lib/supabase';
import { sessionUser } from '../../../../lib/webauth';
import { gateForUser } from '../../../../lib/gateserver';

// Start the free trial. This is what makes the button in the app TRUE.
//
// The app's welcome screen says "Your trial starts the moment you tap below". Until today that was
// not a description of anything: the button called router.replace and the trial did not exist. A
// sentence in our own product that was not true. Doc 104, standing question five: is it true? Not
// is it defensible. True.
//
// NO CARD. NO PRICE. NO STRIPE. Nothing here is a purchase, so App Store Review Guideline 3.1.3(f)
// is untouched: "Free apps acting as a stand-alone companion to a paid web based tool ... do not
// need to use in-app purchase, provided there is no purchasing inside the app, or calls to action
// for purchase outside of the app." Giving a man a week for nothing is not selling him
// anything, and no price or checkout appears anywhere in the binary.
//
// Idempotent, and once per phone for the life of that number. Tapping twice, reinstalling, or
// coming back a year later gets him exactly one trial. See grantTrialIfNone.
export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // ⚠️ `entitled` COMES FROM THE GATE, THE SAME AS /api/billing/status.
  //
  // Two endpoints answering one question two ways is how this codebase gets caught, and it has been
  // caught three times over one number already. gateForUser reads both keys, tells an unreadable
  // subscription apart from a missing one, and opens the door on the first.
  const gate = await gateForUser(user.id);

  // A web signup already has a trial, granted against his account at /api/signup/verify. Hand it
  // back rather than looking for a phone he has deliberately never proved.
  const byAccount = await getSubscriptionByUser(user.id);
  if (byAccount) return NextResponse.json({ ...byAccount, entitled: gate === 'open' });

  const phone = await getPhoneForUser(user.id);
  if (!phone) return NextResponse.json({ status: 'none', entitled: gate === 'open' });

  const sub = await grantTrialIfNone(phone);

  // If the grant failed we do NOT tell him his trial did not start and we do not block him. The
  // read path will grant it on his next launch, and until then he is inside the app. Being wrong
  // in his favour for one session is the cheapest mistake available to us here.
  if (!sub || !sub.status) return NextResponse.json({ status: 'none', entitled: gate === 'open' });
  return NextResponse.json({ ...sub, entitled: gate === 'open' });
}
