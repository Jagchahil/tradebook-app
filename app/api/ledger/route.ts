import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import { readOptimiserOrNull } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { ledgerFor, headline } from '../../../lib/ledger';

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
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('ledger', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 B50, D3. RECORDS UNREADABLE EXEMPT: this route is JSON to the phone app and has no customer
  // sentence on it, so it answers with an explicit ERROR rather than with a body of zeros, and no
  // new copy is written for a path nobody reads words on. A caller handed a ledger of zeros cannot
  // tell "nothing confirmed yet" from "the read failed", and it would then draw a screen saying he
  // has saved nothing, which is the same lie the eleven pages were telling. 503 is the shape
  // app/api/elections/route.ts already uses for exactly this, so there is one of them and not two.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const input = await readOptimiserOrNull(user.id);
  if (!input) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  // ⚠️ EVERY FIGURE BELOW IS ONE HE HAS CONFIRMED. Nothing "to review", nothing projected, nothing
  // conditional. lib/ledger.ts has no field you could put a "could" in, which is the strongest
  // guarantee available: you cannot pass one in even by accident.
  //
  // ⚠️ AND THE ASSEMBLY ITSELF NOW LIVES IN lib/ledger.ts, WHICH IS THE POINT OF THIS HEADER.
  //
  // The mileage subtraction and the use of home addition used to be written out here. The web app
  // needs exactly the same five lines, server rendered, and a second copy of them would have been
  // the fourth time this codebase put two readers over one figure. ledgerFor() is that one reader,
  // and it carries the reasoning for both directions with it.
  const l = ledgerFor(input);

  return NextResponse.json({ ...l, headline: headline(l) });
}
