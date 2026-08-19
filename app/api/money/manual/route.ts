import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { insertTransaction, readVatProfile } from '../../../../lib/supabase';
import { isCategory } from '../../../../lib/categories';
import { streamFor } from '../../../../lib/propertylanes';
import { clampReceiptDate } from '../../../../lib/waintents';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

// A TYPED ENTRY BECOMING A LOGGED TRANSACTION. The web door for money no feed ever saw.
//
//   POST { direction, amount, vendor, date, category? }  ->  one row in his books
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ IT LANDS CONFIRMED, AND THAT IS THE ONE DELIBERATE DIFFERENCE FROM EVERY CAPTURE ROUTE.
//
// A receipt photo and a voice note land confirmed: false, because both are a MACHINE'S READING
// of his money and a reading always waits for his yes. There is no reading here. Every field is
// his own typing and the submit is his own hand, so asking him to approve his own statement on
// the next screen would be a question with one sensible answer, which doc 103 forbids. The form
// post IS the approval, exactly as a pile confirm is.
//
// ⚠️ MONEY IN IS ALWAYS 'income' WHATEVER THE FORM SAYS. The category list describes what money
// OUT can be. Letting a payment in arrive labelled 'materials' would put income on an expense
// line of a real return, so the server decides this one and the form is not consulted. The same
// judgement markInvoicePaidServer already makes when an invoice is paid.
//
// ⚠️ AND NOTHING HERE WRITES A ROW ITSELF. insertTransaction in lib/supabase.ts is the one path
// every confirmed transaction in the product arrives through (WhatsApp, voice, invoices), and
// this route is another caller of it, not another copy of it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const back = (q: string) => NextResponse.redirect(new URL(`/app/money/add?${q}`, req.url), 303);

  const user = await sessionUser(req);
  // A form caller with no session is a man whose session expired while the page sat open. Send
  // him to the door, not to a JSON error he cannot read.
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app/money/add', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'. His
  // records stay readable everywhere; a lapsed subscription means we do nothing NEW for him,
  // and a new row in his books is the definition of new.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/money/add');

  // Generous for a man typing in a week of cash jobs, lethal to a loop.
  if (await rateLimitedShared(`manual:${user.id}`, 60, 60 * 60 * 1000)) {
    return isForm ? back('problem=slow') : NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  let direction = '';
  let amountRaw = '';
  let vendor = '';
  let date = '';
  let category = '';
  let vatRaw = '';
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return back('problem=bad');
    direction = String(f.get('direction') ?? '');
    amountRaw = String(f.get('amount') ?? '');
    vendor = String(f.get('vendor') ?? '');
    date = String(f.get('date') ?? '');
    category = String(f.get('category') ?? '');
    vatRaw = String(f.get('vat') ?? '');
  } else {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    direction = typeof body.direction === 'string' ? body.direction : '';
    amountRaw = typeof body.amount === 'string' || typeof body.amount === 'number' ? String(body.amount) : '';
    vendor = typeof body.vendor === 'string' ? body.vendor : '';
    date = typeof body.date === 'string' ? body.date : '';
    category = typeof body.category === 'string' ? body.category : '';
    vatRaw = typeof body.vat === 'string' || typeof body.vat === 'number' ? String(body.vat) : '';
  }

  // 'rent' is money in for a property. It exists so a landlord's rent can be DISTINGUISHED from
  // trade income at the door: the two are taxed as separate streams (no National Insurance on
  // rent, Section 24 on the mortgage interest), and lib/propertyengine.ts can only keep them
  // separate if the row says which it is. It is accepted whether or not the form happened to draw
  // the choice, because a man typing his own rent is stating a fact about his own money.
  if (direction !== 'in' && direction !== 'out' && direction !== 'rent') {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Pounds as a person types them: commas and spaces stripped, then it is a number or it is not.
  // Two decimal places because that is what money has, and a hard ceiling because a fat finger
  // on a phone keyboard writes 1200000 more easily than anyone earns it.
  const magnitude = Math.round(Number(amountRaw.replace(/[,\s]/g, '')) * 100) / 100;
  if (!Number.isFinite(magnitude) || magnitude <= 0 || magnitude > 1_000_000) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_amount' }, { status: 400 });
  }

  vendor = vendor.trim().slice(0, 120);
  if (!vendor) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_vendor' }, { status: 400 });
  }

  // ⚠️ THE DATE WINDOW IS OWNED BY clampReceiptDate IN lib/waintents.ts, NOT REDECLARED HERE.
  // The clamp maps anything outside "last two years up to today" to today. A vision misread
  // deserves that silent rescue; a date a man CHOSE does not, because quietly moving his cash
  // job to today would file it in the wrong quarter without telling him. So the same rule is
  // asked a different question: if clamping would change his date, his date is refused, plainly.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || clampReceiptDate(date) !== date) {
    return isForm ? back('problem=date') : NextResponse.json({ error: 'bad_date' }, { status: 400 });
  }

  // Money in is income, decided here. Money out takes a real category from the one list in
  // lib/categories.ts, and an empty or unknown choice is 'other', which is the honest word for
  // "he did not say", never a guess. Rent in is 'rent', the same literal the WhatsApp rent
  // capture writes, so every property income row in the product looks the same to its readers.
  const trimmed = category.trim().toLowerCase();
  const filedAs = direction === 'in' ? 'income' : direction === 'rent' ? 'rent' : (isCategory(trimmed) ? trimmed : 'other');

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A TYPED COST COULD NEVER CARRY ITS INPUT VAT, SO A REPAYMENT TRADER WAS SHOWN A BILL.
  // Run 4, 14 August 2026.
  //
  // Dwayne Osei, VAT registered groundworker on the domestic reverse charge, typed in 1,200 of
  // materials from Jewson. /app/tax/vat then read "400 of VAT charged on the invoices you have
  // raised, less £0 on what you have bought and confirmed". The 200 he is owed on that receipt had
  // nowhere to be recorded: this form had no VAT field, getConfirmedInputVat filters on
  // vat_confirmed, and the only writer of vat_confirmed was the pile, which shows unconfirmed rows
  // only, while everything typed here lands confirmed by design. There was no door anywhere.
  //
  // His sales carry no VAT at all, so his input VAT IS his whole VAT position. He is owed money
  // every quarter and the product would have shown him a bill for ever. The refund branch on that
  // screen was already built and correct and simply could not be reached.
  //
  // ⚠️ HIS OWN TYPING, SO IT LANDS CONFIRMED, which is the same argument this route already makes
  // for the amount itself. A parser still may not set it.
  //
  // ⚠️ NOT ON THE FLAT RATE SCHEME. A flat rate trader pays a percentage of turnover and does not
  // reclaim on what he buys, so a VAT figure from him would be a number that never becomes money.
  // The form does not draw the field for him and this refuses it if it arrives anyway.
  const vatProfile = await readVatProfile(user.id).catch(() => null);
  const canReclaim = vatProfile !== null && vatProfile.registered && vatProfile.scheme !== 'flat_rate';
  let vatAmount: number | null = null;
  if (vatRaw.trim() !== '' && direction === 'out') {
    if (!canReclaim) {
      return isForm ? back('problem=vat') : NextResponse.json({ error: 'vat_not_reclaimable' }, { status: 400 });
    }
    const v = Math.round(Number(vatRaw.replace(/[,\s£]/g, '')) * 100) / 100;
    // A sixth of the gross is the VAT inside a 20% price. More than that is a typo every time,
    // and letting it through would put a reclaim on his return that no receipt stands behind.
    const ceiling = Math.round((magnitude / 6) * 100) / 100;
    if (!Number.isFinite(v) || v < 0 || v > ceiling) {
      return isForm ? back('problem=vat') : NextResponse.json({ error: 'bad_vat' }, { status: 400 });
    }
    if (v > 0) vatAmount = v;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND THE COST ITSELF COMES DOWN BY IT. Found in the Phase 5 walk of the fix above, 14 August
  // 2026, an hour after it shipped.
  //
  // Giving him the reclaim without netting the row was worse than the bug it replaced. He typed
  // 1,200 of materials and stated 200 of VAT, and his books then showed a 1,200 cost AND a 200
  // reclaim: the 200 came off his VAT bill and off his profit, twice, on one receipt.
  //
  // For a VAT registered trader the expense IS the net. The VAT is not his money and never was his
  // cost, which is the same sentence invoiceIncomeAmount enforces on the income side. That fix was
  // shipped without following the argument across to the other side of the ledger, which is Run 2's
  // lesson exactly: the arithmetic was never the problem, what reached the arithmetic was.
  //
  // ⚠️ NOTHING DOWNSTREAM CHANGES. Every profit reader in the product sums `amount`, so netting it
  // here is the whole fix and no surface has to learn about VAT. And a man who states no VAT is
  // untouched: netAmount is his gross, exactly as before.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const netAmount = vatAmount === null
    ? magnitude
    : Math.round((magnitude - vatAmount) * 100) / 100;

  try {
    await insertTransaction({
      user_id: user.id,
      vendor,
      // The sign convention every reader in the product shares: negative out, positive in.
      // The NET of any VAT he has stated. See the block above: the VAT is not his cost.
      amount: direction === 'out' ? -netAmount : netAmount,
      category: filedAs,
      transaction_date: date,
      source_type: 'web_manual',
      // Only ever set together. A vat_amount without vat_confirmed is invisible to
      // getConfirmedInputVat, and a vat_confirmed without a figure is a lie about a receipt.
      ...(vatAmount === null ? {} : { vat_amount: vatAmount, vat_confirmed: true }),
      // His own typing, approved by his own press. See the header for why this is the one
      // capture that does not wait.
      confirmed: true,
      // ════════════════════════════════════════════════════════════════════════════════════
      // 🔴 THE STREAM. B62, 20 August 2026. MONEY IN HAD A PROPERTY LANE AND MONEY OUT HAD
      // NONE, ON THE ONE DOOR IN THIS PRODUCT WHERE A ROW LANDS CONFIRMED.
      //
      // This line read `direction === 'rent' ? 'property' : undefined`. The four property
      // categories in the picker on /app/money/add are real categories in lib/categories.ts, every
      // customer is offered them, and every one of them was a DEAD END: chosen, filed, and
      // deducted against a TRADE.
      //
      // Norah Whitby, two flats and no trade at all, typed 62,000 of rent in and 22,000 of costs
      // out: 14,000 of mortgage interest, 6,200 of letting agent, 1,800 of property repairs. The
      // product asked her for 11,832.00 where the correct Self Assessment figure is 6,232.00. That
      // is 5,600.00 too much on the bill, 2,800.00 too much on each payment on account, and
      // 8,400.00 too much on what January 2028 asks, and the quarterly update reported a 22,000
      // TRADE LOSS on a woman with no trade.
      //
      // ⚠️ WHICH CATEGORIES THOSE ARE IS lib/propertylanes.ts's TO SAY AND NEVER THIS
      // ROUTE'S TO LIST. A list typed here rots the day a fifth category is added, and that is
      // exactly how this defect came to exist: the rule lived in one route while lib/voiceflow.ts
      // and app/api/pile/route.ts both asked the module. This is the third caller of streamFor,
      // not a third copy of the rule.
      //
      // ⚠️ AND THE FINANCE HALF IS NOT SET HERE, DELIBERATELY. Mortgage interest is
      // relieved as a Section 24 basic rate reducer rather than deducted, and every reader in the
      // product already makes that split at READ time from the category, through
      // isResidentialFinanceCost: propertyYtdTotals, lib/yeartodate.ts and lib/incomeproof.ts all
      // do it the same way. ONE FIELD ON THE WAY IN IS THE WHOLE FIX. A second field here would be
      // a second answer to a question that already has one, and the two would drift.
      //
      // 🔴 AND ROUTING ALL FOUR AS ORDINARY PROPERTY EXPENSES WOULD HAVE BEEN WORSE THAN
      // THE BUG IT FIXED. It moves Norah from 5,600.00 too high to 2,800.00 too LOW, which is the
      // direction that earns a customer a penalty. test/b62propertyroute.test.mjs proves the split
      // end to end, on the row this route actually writes, through the real reader.
      //
      // ⚠️ THE RENT BRANCH STAYS FIRST AND STAYS EXPLICIT. 'rent' is money IN and is not
      // one of the four cost categories, so streamFor has no opinion about it. Nothing here ever
      // rewrites an existing row.
      // ════════════════════════════════════════════════════════════════════════════════════
      income_type: direction === 'rent' || streamFor(filedAs) === 'property' ? 'property' : undefined,
    });
  } catch {
    // A failed write must not look like a successful one. Nothing landed, and the page says so.
    return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  // Back to the add screen rather than the month, because a man logging cash jobs usually has a
  // pocketful. The confirmation carries the month so one press shows him the row where it lives.
  return isForm
    ? back(`done=${direction}&m=${date.slice(0, 7)}`)
    : NextResponse.json({ ok: true, direction, month: date.slice(0, 7) });
}
