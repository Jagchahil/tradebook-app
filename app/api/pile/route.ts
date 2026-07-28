import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared } from '../../../lib/ratelimit';
import {
  pileEntries,
  readOwnNames,
  readAccountUse,
  confirmPile,
  setManyPersonal,
  learnVendor,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { buildPile, summarisePile, canBulkConfirm, bulkConfirmPlan } from '../../../lib/reviewpile';
import { normaliseVendor } from '../../../lib/memory';
import { looksPersonal } from '../../../lib/personal';
import { CATEGORIES, categoriseBankLine } from '../../../lib/categories';

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
  return sessionUser(req);
}

export async function GET(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`pile:${user.id}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  // In parallel: the rows, and every name that means him. A payment to himself is drawings, and
  // drawings are never a business cost, so it must never reach the one tap path.
  const [rows, ownNames, accountUse] = await Promise.all([
    pileEntries(user.id), readOwnNames(user.id), readAccountUse(user.id),
  ]);
  // categoriseBankLine is passed in so a row imported under an older keyword map is read against
  // the CURRENT one. Nothing is written: the stored category still only changes when he confirms.
  const groups = buildPile(rows, normaliseVendor, ownNames, categoriseBankLine);

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
      fast: canBulkConfirm(g, accountUse),
      // For the careful ones, say WHY, in his words. "This looks like a benefit" is a reason a
      // man can argue with. A silent refusal to let him proceed is not.
      //
      // We send the SENTENCE (`why`), not the enum. lib/personal.ts already writes the words,
      // and the app translating an enum back into English would be a second copy of the same
      // fact, drifting quietly out of step with the first. That is exactly how TX_COLS and
      // TX_SELECT drifted and blinded the detail screen to is_personal tonight.
      reason: g.kind === 'careful' ? looksPersonal(g.vendor, null, ownNames)?.why ?? null : null,
    })),
  });
}

interface Decision {
  ids: string[];
  vendor: string;
  // 'business'  yes, file these, under `category`
  // 'personal'  no, this is not business money. Out of the books, and remembered.
  // 'confirm_known' files every group the SERVER decides it was confident about. It carries no ids.
  verdict: 'business' | 'personal' | 'confirm_known';
  category?: string;
  // Remember the answer for next time, so this shop is never asked about again. Default true:
  // the whole point is that he tells us once. He can turn it off per decision.
  remember?: boolean;
}

// 303 AND NOT 302, AND THAT IS NOT PEDANTRY. A 303 tells the browser to follow with a GET, so his
// back button and a refresh do not re-post the decision and file the same rows twice. The outcome
// rides in the query string because this page ships no script and has nowhere else to put it, and
// it carries a count and never an id: see test/webauth.test.mjs section 1.
function backToPile(req: NextRequest, done: string, n: number) {
  const url = new URL(`/app/pile?done=${done}&n=${n}`, req.url);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`pile:${user.id}`, 300, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  // ⚠️ TWO ENCODINGS, ONE DECISION. The phone app posts JSON. The web page posts a plain HTML form,
  // because it ships no client script: a man on a bad signal must be able to answer a question
  // before JavaScript has arrived, and a form needs none.
  //
  // What must NOT happen is a second route for the web, because then there are two implementations
  // of "file these under materials and remember it", and the one that drifts is the one he used.
  // Everything below this block is identical for both callers.
  const form = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  let body: Decision;
  if (form) {
    const f = await req.formData().catch(() => null);
    if (!f) return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
    body = {
      ids: String(f.get('ids') ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      vendor: String(f.get('vendor') ?? ''),
      verdict: f.get('verdict') === 'personal'
        ? 'personal'
        : f.get('verdict') === 'confirm_known'
          ? ('confirm_known' as Decision['verdict'])
          : 'business',
      category: String(f.get('category') ?? ''),
    };
  } else {
    try {
      body = (await req.json()) as Decision;
    } catch {
      return NextResponse.json({ error: 'Bad request.' }, { status: 400 });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // CONFIRM EVERYTHING WE ARE SURE ABOUT, IN ONE TAP.
  //
  // ⚠️ THE CLIENT SENDS NO IDS, AND THAT IS THE WHOLE SECURITY DESIGN OF THIS BRANCH.
  //
  // This is the most dangerous button in the product: one tap files many rows into a man's tax
  // figures. If the page posted a list of ids, a crafted post could file anything at all, including
  // the careful ones that the own name check and the benefit detector exist to protect.
  //
  // So the intent comes from the client and NOTHING else. The server re-reads his pile, rebuilds
  // the groups with the same functions that drew the screen, and asks bulkConfirmPlan which of them
  // it was confident about. confirm_pile then re-applies its own rules in SQL on top. Three layers,
  // and not one of them trusts the browser.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (body.verdict === 'confirm_known') {
    const [freshRows, ownNames, accountUse] = await Promise.all([
      pileEntries(user.id), readOwnNames(user.id), readAccountUse(user.id),
    ]);
    const plan = bulkConfirmPlan(
      buildPile(freshRows, normaliseVendor, ownNames, categoriseBankLine),
      accountUse,
    );
    let applied = 0;
    let asked = 0;
    for (const item of plan) {
      asked += item.ids.length;
      applied += await confirmPile(user.id, item.ids, item.category);
      // Remembering is the point: he has now agreed our guess for this shop, so it becomes his
      // answer and the next payment there is filed without asking. Shared with the crowd, because a
      // shop's category is not private. Nothing personal is ever shared.
      if (item.key) await learnVendor(user.id, item.key, item.category, null, true);
    }
    if (form) {
      if (applied === 0) return backToPile(req, 'nothing', 0);
      if (applied < asked) return backToPile(req, 'partial', applied);
      return backToPile(req, 'filed', applied);
    }
    return NextResponse.json({ ok: true, applied, asked, skipped: asked - applied, groups: plan.length });
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
    if (form) return backToPile(req, n > 0 ? 'personal' : 'nothing', n);
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
  if (form) {
    // The three outcomes are told apart on purpose. A partial apply is the one that matters: SQL
    // refuses rows that look like they might not be business money, so "filed 14" when 11 were
    // filed is how a man ends up with three transactions he believes are in his books.
    if (applied === 0) return backToPile(req, 'nothing', 0);
    if (applied < ids.length) return backToPile(req, 'partial', applied);
    return backToPile(req, 'filed', applied);
  }

  return NextResponse.json({
    ok: true,
    applied,
    asked: ids.length,
    skipped: ids.length - applied,
    learned: remember && Boolean(key),
  });
}
