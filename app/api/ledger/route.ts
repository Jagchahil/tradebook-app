import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getOptimiserInput } from '../../../lib/supabase';
import { ledger, headline } from '../../../lib/ledger';

export const runtime = 'nodejs';

// WHAT LEKHIO ACTUALLY SAVED HIM. The Tesla screen.
//
// ⚠️ THIS ROUTE READS getOptimiserInput() AND DOES NOT ASSEMBLE ITS OWN FIGURES, AND THAT IS
// DELIBERATE.
//
// Three separate times today this codebase has been caught with TWO readers over the same numbers,
// disagreeing:
//
//   - the console said CUSTOMERS 1 and, three inches below, "2 people have signed up". A second
//     query had never heard of the word "internal".
//   - the brain panel said 9 approved + 39 waiting, and beside it "130 things Khoji has learned".
//     A blocklist and an allowlist over one table.
//   - the review queue's count froze at 31 while the database said 26, because every click fired a
//     re-read and an older response landed after a newer one.
//
// The lesson is not "be careful". It is that TWO READERS OVER THE SAME MONEY WILL DRIFT, AND THE ONE
// THAT DRIFTS IS THE ONE HE BELIEVES. There is exactly one function in this codebase that knows what
// a man has confirmed this year, and this route calls it.
//
// So the optimiser's "here is what you COULD save" and the ledger's "here is what we DID save" are
// computed from the same figures, by construction, and they can never contradict each other on his
// screen.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const input = await getOptimiserInput(user.id);

  // ⚠️ EVERY FIGURE BELOW IS ONE HE HAS CONFIRMED. Nothing "to review", nothing projected, nothing
  // conditional. lib/ledger.ts has no field you could put a "could" in, which is the strongest
  // guarantee available: you cannot pass one in even by accident.
  const l = ledger({
    monthsElapsed: input.monthsElapsed,
    grossIncome: input.ytdTradeIncome,
    expenses: input.ytdTradeExpenses,

    // NOT YET WIRED, AND THE ZEROS ARE HONEST RATHER THAN LAZY.
    //
    // A zero here UNDERSTATES what we saved him. It never overstates it. That is the direction of
    // failure we choose every time: the number is a floor, and when we wire these in it goes UP.
    // The opposite mistake, a ledger that flatters us on its first day, is the one he never forgives.
    mileage: 0,
    homeOffice: 0,
    capitalAllowances: 0,
    pension: 0,

    // HIS OWN MONEY, HELD BY HMRC. It gets its own number on the screen and it is never, ever added
    // to "saved". This product has already once quoted a man a CIS refund that did not exist.
    cisSuffered: input.ytdCisSuffered,
  });

  return NextResponse.json({ ...l, headline: headline(l) });
}
