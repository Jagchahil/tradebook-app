import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared } from '../../../lib/ratelimit';
import {
  verifyAccessToken,
  pileEntries,
  confirmPile,
  setManyPersonal,
  learnVendor,
} from '../../../lib/supabase';
import { buildPile, summarisePile, canBulkConfirm } from '../../../lib/reviewpile';
import { normaliseVendor } from '../../../lib/memory';
import { looksPersonal } from '../../../lib/personal';
import { CATEGORIES } from '../../../lib/categories';

// The pile: what a man faces the morning after he connects his bank.
//
//   GET  /api/pile           what is waiting, grouped by shop, in the order he should be asked
//   POST /api/pile           one decision, applied to every row in a group
//
// The grouping is the feature. Ninety days of a working tradesman's bank is two to three
// hundred lines, and a swipe deck over two hundred cards is just a nicer way of asking two
// hundred questions. But it is not two hundred questions. He went to Screwfix fourteen times.
// That is ONE question, and answering it teaches a rule that files every future Screwfix
// payment without ever asking him again.
//
// See lib/reviewpile.ts for the rules and the tests.

export const runtime = 'nodejs';

async function userFrom(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token ? await verifyAccessToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`pile:${user.id}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const rows = await pileEntries(user.id);
  const groups = buildPile(rows, normaliseVendor);

  return NextResponse.json({
    // THE APP DOES NOT KEEP ITS OWN CATEGORY LIST. It renders what it is given.
    //
    // app/add.tsx has its own hard-coded list and it has ALREADY drifted: it offers "wages" and
    // has never heard of "van", "insurance" or "equipment", so a bank line categorised "van" shows
    // a category its picker cannot even select. Two lists that mean the same thing always drift.
    // This one has a single home, in lib/categories.ts, and travels down the wire.
    categories: CATEGORIES,
    summary: summarisePile(groups),
    groups: groups.map((g) => ({
      ...g,
      // Whether the FAST path is even on offer for this group. The app must not have to
      // re-derive this rule, and the database enforces it again anyway (confirm_pile), because
      // a guard that only lives in the client is a suggestion.
      fast: canBulkConfirm(g),
      // For the careful ones, say WHY, in his words. "This looks like a benefit" is a reason a
      // man can argue with. A silent refusal to let him proceed is not.
      //
      // We send the SENTENCE (`why`), not the enum. lib/personal.ts already writes the words,
      // and the app translating an enum back into English would be a second copy of the same
      // fact, drifting quietly out of step with the first. That is exactly how TX_COLS and
      // TX_SELECT drifted and blinded the detail screen to is_personal tonight.
      reason: g.kind === 'careful' ? looksPersonal(g.vendor)?.why ?? null : null,
    })),
  });
}

interface Decision {
  ids: string[];
  vendor: string;
  // 'business'  yes, file these, under `category`
  // 'personal'  no, this is not business money. Out of the books, and remembered.
  verdict: 'business' | 'personal';
  category?: string;
  // Remember the answer for next time, so this shop is never asked about again. Default true:
  // the whole point is that he tells us once. He can turn it off per decision.
  remember?: boolean;
}

export async function POST(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`pile:${user.id}`, 300, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  let body: Decision;
  try {
    body = (await req.json()) as Decision;
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
  }

  const ids = Array.isArray(body?.ids) ? body.ids.slice(0, 500) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Nothing to do.' }, { status: 400 });

  const vendor = (body.vendor ?? '').trim();
  const remember = body.remember !== false;
  const key = vendor ? normaliseVendor(vendor) : '';

  // NOT BUSINESS MONEY. His decision, and it is reversible: the row stays visible in his
  // transactions list, greyed out and struck through, and one tap puts it back.
  if (body.verdict === 'personal') {
    const n = await setManyPersonal(user.id, ids);
    if (remember && key) {
      await learnVendor(user.id, key, null, true, false); // never shared with anyone else
    }
    return NextResponse.json({ ok: true, applied: n, learned: remember && Boolean(key) });
  }

  const category = (body.category ?? '').trim().toLowerCase();
  if (!category) return NextResponse.json({ error: 'No category.' }, { status: 400 });

  // THE FAST PATH, AND THE GUARD.
  //
  // confirm_pile does the work in one statement AND re-applies the rules in SQL: money out
  // only, nothing flagged as looking personal, and only his own rows. So a hand-rolled POST
  // with a benefit's id in it confirms nothing, and the count that comes back says so.
  const applied = await confirmPile(user.id, ids, category);

  if (remember && key) {
    // Shared with the crowd, because a shop's category is not private and it helps the next
    // person. Nothing personal is ever shared. See lib/memory.ts.
    await learnVendor(user.id, key, category, null, true);
  }

  // Tell him the truth if we did fewer than he asked for. Silently applying 11 of 14 and
  // reporting success is how a man ends up with three transactions he thinks are filed.
  return NextResponse.json({
    ok: true,
    applied,
    asked: ids.length,
    skipped: ids.length - applied,
    learned: remember && Boolean(key),
  });
}
