import { NextRequest, NextResponse } from 'next/server';
import { rateLimitedShared } from '../../../lib/ratelimit';
import {
  pileEntries,
  readOwnNames,
  readAccountUse,
  confirmPile,
  setCapitalKind,
  confirmIncome,
  setManyPersonal,
  learnVendor,
  readVatProfile,
  confirmTransactionVat,
  recordCisOnIncome,
  readCircumstances,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { buildPile, summarisePile, canBulkConfirm, bulkConfirmPlan, cisCapture } from '../../../lib/reviewpile';
import { worksUnderCis } from '../../../lib/circumstances';
import { normaliseVendor } from '../../../lib/memory';
import { looksPersonal } from '../../../lib/personal';
import { CATEGORIES, categoriseBankLine } from '../../../lib/categories';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import { VAT_STANDARD_RATE, vatFromGross } from '../../../lib/vat';
import { isCapitalKind, isUseBand, type CapitalKind } from '../../../lib/capital';

// The pile: what a man faces the morning after he connects his bank.
//
//   GET  /api/pile           what is waiting, grouped by shop, in the order he should be asked
//   POST /api/pile           one decision, applied to every row in a group
//   POST /api/pile           verdict=vat: the VAT inside ONE cost, for a VAT registered man only.
//                            Its own sentence, never a side effect of filing the row.
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
  // 🔴 'income'  yes, this payment IN is mine, filed as income or as rent. Its own verdict because
  //             confirm_pile refuses a credit outright and always will: money in is never swept up
  //             in a one tap confirm across the whole pile. This is the one payer at a time door,
  //             and the reason it exists at all is that until 31 July 2026 there was no door and
  //             imported income was invisible everywhere. See the migration for what that cost.
  // 🔴 'vat'     yes, the VAT inside this one cost was this much. It files NOTHING and confirms no
  //             category: it is its own sentence, about its own column, and it is the only thing
  //             in the product that may set vat_confirmed. See the branch for why it is separate.
  // 🔴 'cis'     this payment in was £400 because a contractor took £100 off a £500 job. Two
  //             columns, one press: the gross into amount and the tax already paid into
  //             cis_deduction. Its own verdict because it is the only decision on this screen that
  //             CHANGES a figure the bank gave us, and a figure that moves needs a door of its own.
  verdict: 'business' | 'personal' | 'confirm_known' | 'income' | 'vat' | 'cis';
  category?: string;
  // Remember the answer for next time, so this shop is never asked about again. Default true:
  // the whole point is that he tells us once. He can turn it off per decision.
  remember?: boolean;
  // 🔴 WHAT HE SAID A LARGE PURCHASE WAS, ON THE 'business' VERDICT ONLY, AND ONLY WHERE THE PILE
  // ASKED. Absent on every other row and on every caller written before 2 August 2026, which is
  // why the whole thing is optional and an absent value changes nothing at all.
  capitalKind?: string;
  // The business use band, 100 / 75 / 50 / 25. Only ever set by /app/pile/car, which is the screen
  // that asks. Its ABSENCE on a car is meaningful: see the branch in POST below, which sends him
  // to that screen instead of filing on an assumption.
  businessUsePct?: string | number;
  // Only read by the 'vat' verdict. What HE says the VAT was, in pounds, as typed. Validated
  // against his own row server side and never trusted as it stands.
  vat?: string | number;
  // Only read by the 'cis' verdict. What HE says the contractor took off this one payment, in
  // pounds, as typed. The GROSS is never sent: it is derived from his own bank row plus this, so
  // the two columns cannot stop reconciling to the money that actually moved.
  cis?: string | number;
}

// The words the form is allowed to send. A nested ternary was readable at three verdicts and
// stopped being readable at five, and anything not on this list is read as 'business', which is
// what the plain file button has always meant.
const VERDICTS = ['personal', 'confirm_known', 'income', 'vat', 'cis'] as const;

function verdictFrom(raw: unknown): Decision['verdict'] {
  const v = String(raw ?? '');
  return (VERDICTS as readonly string[]).includes(v) ? (v as Decision['verdict']) : 'business';
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

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/pile');

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
      verdict: verdictFrom(f.get('verdict')),
      category: String(f.get('category') ?? ''),
      vat: String(f.get('vat') ?? ''),
      cis: String(f.get('cis') ?? ''),
      capitalKind: String(f.get('capital_kind') ?? ''),
      businessUsePct: String(f.get('business_use_pct') ?? ''),
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

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE VAT ON ONE COST. A SEPARATE SENTENCE FROM FILING THE COST, AND DELIBERATELY SO.
  //
  // "This payment was materials" and "the VAT inside it was £4.83" are two different claims about
  // two different columns, and rolling them into one press is precisely how a figure a model read
  // off a crumpled photograph ends up inside a reclaim he has never looked at. So filing a row
  // never touches its VAT, and this never files a row. He can do either, in either order, or one
  // and not the other. getConfirmedInputVat wants BOTH before a penny counts, which is the
  // arithmetic saying the same thing.
  //
  // 🔴 THIS IS THE ONLY PLACE IN THE PRODUCT THAT MAY SET vat_confirmed, and it is reached from a
  // form with the figure printed on it, which he read and pressed. No parser, no import, no
  // nightly job, and nothing here does it as a side effect of doing something else.
  //
  // ⚠️ AND ONLY FOR A MAN WHO IS VAT REGISTERED. Nobody else has input tax to reclaim, so nobody
  // else is ever shown this question. null from readVatProfile means the READ FAILED, which is
  // not a yes, so it refuses rather than guesses.
  //
  // 🔴 THE CEILING COMES FROM HIS OWN ROW, READ SERVER SIDE. The pile is read again, the row is
  // found by id among HIS unconfirmed money out, and the figure has to clear two limits: the
  // payment itself, and the most VAT that can arithmetically sit inside a gross amount at the
  // standard rate. lib/vat.ts owns that second sum and nothing here works it out again.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (body.verdict === 'vat') {
    // One row, one figure. A VAT amount cannot answer for fourteen different receipts, and a
    // branch that let it would be the bulk confirm with the dangerous column attached.
    if (ids.length !== 1) {
      return form ? backToPile(req, 'nothing', 0) : NextResponse.json({ error: 'One at a time.' }, { status: 400 });
    }

    const profile = await readVatProfile(user.id);
    if (profile === null || !profile.registered) {
      return form
        ? backToPile(req, 'novat', 0)
        : NextResponse.json({ error: 'not_vat_registered' }, { status: 403 });
    }

    // HIS row, still waiting, and money OUT. Input tax is what he paid on what he bought, so a
    // credit has none, and a row that is not in his pile is either not his or already answered.
    const row = (await pileEntries(user.id)).find((r) => r.id === ids[0]);
    if (!row || !(row.amount < 0)) {
      return form ? backToPile(req, 'nothing', 0) : NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const gross = Math.abs(Number(row.amount) || 0);
    // A pound sign and a stray comma are him typing what he sees on the paper, not him being
    // wrong. An empty box is not a zero: zero VAT is a real answer and he has to type it.
    const typed = String(body.vat ?? '').trim().replace(/[£,\s]/g, '');
    const claimed = typed === '' ? Number.NaN : Number(typed);
    const most = Math.min(gross, vatFromGross(gross, VAT_STANDARD_RATE));
    if (!Number.isFinite(claimed) || claimed < 0 || claimed > most) {
      return form
        ? backToPile(req, 'vatbad', 0)
        : NextResponse.json({ error: 'bad_vat', most }, { status: 400 });
    }

    const saved = await confirmTransactionVat(user.id, ids[0], claimed);
    if (form) return backToPile(req, saved ? 'vat' : 'nothing', saved ? 1 : 0);
    return NextResponse.json({ ok: saved, vat: claimed });
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 CIS. THE TAX A CONTRACTOR HANDED TO HMRC BEFORE THE MONEY EVER REACHED HIS BANK.
  //
  // Found 11 August 2026 by walking the live product as a groundworker: 62 contractor payments
  // totalling £34,400, and the £34,400 was NET of £4,400 and £2,800 already paid to HMRC across two
  // tax years. Every one went into his income at its bank value, so his turnover was understated by
  // exactly the tax taken and the tax already paid for him was invisible.
  //
  // TWO COLUMNS, ONE PRESS, AND THE ORDER OF THEM IS THE WHOLE THING:
  //
  //        transactions.amount IS THE GROSS.  transactions.cis_deduction IS THE TAX ALREADY PAID.
  //
  // lib/reviewpile.ts cisCapture() owns that arithmetic and returns a patch named after the two
  // columns, so no call site can put them the wrong way round. The gross is DERIVED from his own
  // bank row plus what he typed, never sent by the browser, so amount minus cis_deduction is always
  // the deposit that actually landed.
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND IT NEEDED NO MIGRATION IN THE END, WHICH IS WHY IT SHIPPED THE SAME DAY.
  //
  // This branch refused for a few hours on 11 August, on the reasoning that nothing in
  // lib/supabase.ts could write cis_deduction onto a row that already existed, and that raising
  // the amount without recording the deduction would be a half fix that LOOKS finished. That
  // reasoning was right and the conclusion was wrong: cis_deduction has been in schema.sql since
  // the beginning and the WhatsApp handler has been writing it for weeks. What the rpc was really
  // buying was atomicity, and PostgREST gives that away: every filter on a PATCH lands in the same
  // UPDATE ... WHERE that does the write. recordCisOnIncome() carries the argument in full.
  //
  // ⚠️ ONE ROW, NOT A GROUP. Every other verdict on this screen applies one decision to many rows,
  // because "these are all fuel" is a claim about a category. A CIS deduction is a fact about ONE
  // payment, off one contractor's statement, and no two are alike. Handing a group one figure
  // would put the same deduction on every row in it.
  //
  // ⚠️ AND HE HAS TO HAVE SAID HE IS IN THE SCHEME. Not because the arithmetic would break, but
  // because a man who never told us he works under CIS has no business posting one, and the
  // question is not drawn for him either. The check is here as well as on the page, because a page
  // is a suggestion and a route is a door.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (body.verdict === 'cis') {
    if (ids.length !== 1) {
      return form ? backToPile(req, 'nothing', 0)
        : NextResponse.json({ error: 'one_at_a_time', applied: 0 }, { status: 400 });
    }
    const answers = await readCircumstances(user.id).catch(() => null);
    if (!worksUnderCis(answers)) {
      return form ? backToPile(req, 'nocis', 0)
        : NextResponse.json({ error: 'not_cis', applied: 0 }, { status: 403 });
    }
    // His own row, read server side. The browser sends the id and what he typed, never the money.
    const row = (await pileEntries(user.id)).find((r) => r.id === ids[0]);
    if (!row || !(row.amount > 0)) {
      return form ? backToPile(req, 'nothing', 0)
        : NextResponse.json({ error: 'not_found', applied: 0 }, { status: 404 });
    }
    const patch = cisCapture(row.amount, body.cis ?? '');
    if (!patch) {
      return form ? backToPile(req, 'cisbad', 0)
        : NextResponse.json({ error: 'bad_cis', applied: 0 }, { status: 400 });
    }
    const applied = await recordCisOnIncome(user.id, row.id, row.amount, patch);
    return form ? backToPile(req, applied ? 'ok' : 'cisbad', applied)
      : NextResponse.json({ applied }, { status: applied ? 200 : 409 });
  }

  const vendor = (body.vendor ?? '').trim();
  const remember = body.remember !== false;
  const key = vendor ? normaliseVendor(vendor) : '';

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 MONEY IN. His income, filed as income or as rent, one payer at a time.
  //
  // The category NEVER comes from the browser here. The form sends 'income' or 'rent' and anything
  // else is read as 'income', which is the safe reading: a payment in is income unless he has told
  // us it is rent, and the worst case of guessing wrong that way is his Class 4 bill being slightly
  // high, not income going missing. The database then re-applies the same allowlist on top, so a
  // hand rolled post naming 'materials' files nothing at all.
  //
  // learnVendor is NOT called. A shop's category is a fact about the shop and worth remembering; a
  // customer paying him is not a rule, and filing every future payment from that name as income
  // without asking is exactly the automatic behaviour the control doctrine exists to refuse.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (body.verdict === 'income') {
    const kind = (body.category ?? '').trim().toLowerCase() === 'rent' ? 'rent' : 'income';
    const applied = await confirmIncome(user.id, ids, kind);
    if (form) {
      // A zero here is worth telling him about plainly rather than bouncing him back to a screen
      // that looks unchanged: the likeliest cause is the migration not being run yet.
      if (applied === 0) return backToPile(req, 'nothing', 0);
      if (applied < ids.length) return backToPile(req, 'partial', applied);
      return backToPile(req, kind === 'rent' ? 'rent' : 'incomefiled', applied);
    }
    return NextResponse.json({ ok: true, applied, asked: ids.length, skipped: ids.length - applied, kind });
  }

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

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WAS IT A CAR. THE QUESTION WORTH £52,000, AND THE ORDER IT HAS TO HAPPEN IN.
  //
  // A real 78 row Monzo export, 2 August 2026: AUDI LEEDS, £60,000, filed through this branch as
  // an ordinary cost. GOV.UK, business cars: "Cars do not qualify for: annual investment
  // allowance (AIA)." The whole £60,000 came off his profit, a £22,800 profit was reported as a
  // £37,224 LOSS, and his set aside went to zero.
  //
  // ⚠️ AN UNANSWERED BUSINESS USE SHARE STOPS THE FILING RATHER THAN DEFAULTING. CAA 2001 s205
  // restricts the allowance to the business proportion of a vehicle. Filing at 100% because
  // nobody asked would be a quieter version of the same over claim, so a car goes to
  // /app/pile/car, which asks, shows him what each answer is worth, and posts back here with the
  // band filled in. Nothing is written on the way past.
  //
  // ⚠️ AND THE ANSWER IS STORED BEFORE THE ROW IS CONFIRMED, NEVER AFTER. The moment confirm_pile
  // flips confirmed=true the row is inside every total in the product. A confirmed car whose
  // answer failed to save IS the original defect. So a failed write on a car refuses to file at
  // all: the row stays in the pile, which is a nuisance he can see and fix.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const kind: CapitalKind | null = isCapitalKind(body.capitalKind) ? body.capitalKind : null;
  const isCar = kind !== null && kind !== 'not_a_car';
  const bandRaw = Number(body.businessUsePct);
  const band = isUseBand(bandRaw) ? bandRaw : null;

  if (isCar && band === null) {
    if (form) {
      const to = new URL('/app/pile/car', req.url);
      to.searchParams.set('id', ids[0]);
      to.searchParams.set('kind', kind);
      to.searchParams.set('cat', category);
      return NextResponse.redirect(to, 303);
    }
    return NextResponse.json(
      { error: 'A vehicle needs a business use share. See lib/capital.ts USE_BANDS.' },
      { status: 400 },
    );
  }

  if (kind) {
    const recorded = await setCapitalKind(user.id, ids, kind, band);
    // 'not_a_car' failing changes no arithmetic: the row is an ordinary cost either way, and
    // losing his answer costs him nothing he can measure. A CAR failing changes everything.
    if (!recorded && isCar) {
      if (form) return backToPile(req, 'carfailed', 0);
      return NextResponse.json({ error: 'Could not record what that purchase was.' }, { status: 500 });
    }
  }

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
