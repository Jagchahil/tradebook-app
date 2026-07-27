import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
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
  if (await userBurst('ledger', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  const input = await getOptimiserInput(user.id);

  // ⚠️ EVERY FIGURE BELOW IS ONE HE HAS CONFIRMED. Nothing "to review", nothing projected, nothing
  // conditional. lib/ledger.ts has no field you could put a "could" in, which is the strongest
  // guarantee available: you cannot pass one in even by accident.
  // 🔴 THE MILEAGE IS MOVED, NOT ADDED. THE TOTAL DOES NOT CHANGE BY A PENNY.
  //
  // A mileage claim is already an ordinary transaction inside ytdTradeExpenses, so it has ALWAYS been
  // reducing his tax correctly. What it was not doing was showing up by name: the ledger's whole job
  // is to tell him WHERE the money came from, and mileage was buried inside "Costs you logged".
  //
  // So it is subtracted from the expenses line and passed on its own. Same deduction, same tax, same
  // `saved`, one more line he can read. If you are ever tempted to pass ytdMileage WITHOUT subtracting
  // it here, stop: that would count it twice and overstate what we saved him, and this file's own
  // header explains why that is the one lie the product cannot afford.
  const mileage = Math.max(0, input.ytdMileage ?? 0);
  const l = ledger({
    monthsElapsed: input.monthsElapsed,
    grossIncome: input.ytdTradeIncome,
    expenses: Math.max(0, input.ytdTradeExpenses - mileage),
    mileage,

    // STILL NOT WIRED, AND THESE ZEROS ARE HONEST RATHER THAN LAZY.
    //
    // homeOffice and pension are genuinely NOT CAPTURED ANYWHERE: there is no 'home' or 'pension'
    // category, and no allowance election exists. These zeros really do understate him, and the fix
    // is upstream (build the election), not here.
    //
    // capitalAllowances is a different case and the zero is LOAD BEARING. Tools and equipment are
    // logged as ordinary expense categories, so their cost is ALREADY inside the expenses line above.
    // Passing a figure here as well would count them twice. Splitting them out properly is the same
    // move the mileage line just had, and it needs its own pass over what actually qualifies as plant.
    homeOffice: 0,
    capitalAllowances: 0,
    pension: 0,

    // HIS OWN MONEY, HELD BY HMRC. It gets its own number on the screen and it is never, ever added
    // to "saved". This product has already once quoted a man a CIS refund that did not exist.
    cisSuffered: input.ytdCisSuffered,
  });

  return NextResponse.json({ ...l, headline: headline(l) });
}
