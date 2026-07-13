import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { trialsNeedingNudge, markTrialNudged, cronStarted, cronFinished, addWaSend } from '../../../../lib/supabase';
import { sendTemplate } from '../../../../lib/whatsapp';
import { decideTrialNudge, templateFor, paramsFor } from '../../../../lib/trialnudge';

export const runtime = 'nodejs';

// Tell a man his free trial is ending, on WhatsApp, before he finds out by being locked out.
//
// Day 11: three days left. Day 14: it has ended, and nothing has been deleted. Two messages, ever.
// The policy lives in lib/trialnudge.ts and is pinned by tests. This route only carries it out.
//
// WHY THIS IS NOT AN APP STORE PROBLEM. The app itself contains no price and no link to pay, which
// is guideline 3.1.3(f) and the reason we keep 82% instead of 70%. But 3.1.3 also says, in Apple's
// own words: "Developers can send communications outside of the app to their user base about
// purchasing methods other than in-app purchase." He came to us on WhatsApp. We may answer there.
//
// SHIPS DARK. Nothing is sent until the two templates are approved in Meta and
// TRIAL_TEMPLATES_APPROVED is 'true'. Same pattern as the agent pings. A template send to an
// unapproved template does not error loudly, it just fails, and this codebase's whole failure mode
// is a green light with nothing behind it. So the gate is explicit.
const SENDS_ENABLED = () => process.env.TRIAL_TEMPLATES_APPROVED === 'true';

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await cronStarted('trial');

  const rows = await trialsNeedingNudge();
  if (rows === null) {
    // We could not read. That is NOT "nobody needed telling", and we refuse to report it as such.
    // A cron that finishes ok having done nothing, because it could not see anything, is the exact
    // shape of every bug in this codebase. It finishes NOT ok, and the watchdog turns the light red.
    await cronFinished('trial', false, 0, 'could not read subscriptions');
    return NextResponse.json({ ok: false, error: 'unreadable' }, { status: 503 });
  }

  const now = new Date();
  let warned = 0;
  let ended = 0;
  let skipped = 0;

  for (const row of rows) {
    const nudge = decideTrialNudge(row, now);
    if (!nudge || !row.phone) continue;

    if (!SENDS_ENABLED()) {
      // Dark. Count what we WOULD have sent, and do not mark the row, so that switching the flag on
      // tomorrow still catches everyone. A dry run that quietly marks people as told is a dry run
      // that loses them.
      skipped++;
      continue;
    }

    // Mark BEFORE sending. A crash between the two costs him one message. The other order costs him
    // the same message every morning until he blocks us. See markTrialNudged.
    const claimed = await markTrialNudged(row.phone, nudge);
    if (!claimed) continue; // somebody else already has this one

    await sendTemplate(row.phone, templateFor(nudge), 'en_GB', paramsFor(nudge, row));
    await addWaSend(1);

    if (nudge === 'warn') warned++;
    else ended++;
  }

  await cronFinished('trial', true, warned + ended);

  // Never the phone numbers, never the names. A cron log is not a place to put a customer list.
  return NextResponse.json({
    ok: true,
    sends_enabled: SENDS_ENABLED(),
    warned,
    ended,
    would_have_sent: skipped,
  });
}
