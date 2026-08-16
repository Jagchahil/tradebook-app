import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import {
  createInvoice, markInvoiceSentByOwner, markInvoicePaidByOwner, readVatProfile,
} from '../../../lib/supabase';
import { rateLimitedShared, userBurst } from '../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import {
  isVatRateKey, priceInvoice, treatmentFor, type ReverseChargeFacts, type VatRateKey,
} from '../../../lib/vat';
import { invoiceRef } from '../../app/invoiceref';

// AN INVOICE, MADE FROM THE WEB, AND KEPT STRAIGHT BY ITS OWNER.
//
//   POST { customer, contact?, item[], amount[], rate[] }  ->  one draft invoice, then the share
//   POST { action: 'sent' | 'paid', id, ref? }             ->  his own row's status, said by him
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS ROUTE WRITES NOTHING ITSELF. createInvoice in lib/supabase.ts is the one path every
// invoice in the product arrives through (the WhatsApp guided flow, "invoice this"), and this
// route is another CALLER of it, not another copy: the numbering, the fourteen day due date and
// the draft status are all its decisions, made once, for every surface.
//
// ⚠️ THE TWO MARK ACTIONS ARE STATEMENTS OF FACT ABOUT HIS OWN BUSINESS (31 July 2026). He sent
// the invoice from his own phone; his customer paid him. Until now the only path to 'paid' was
// the Stripe webhook, so a bank transfer or an envelope of cash left an invoice we would chase
// for ever. One press each, through markInvoiceSentByOwner and markInvoicePaidByOwner in lib,
// where the tenancy lives: the session names the owner, the id rides in the FORM BODY never the
// URL, and every query filters on user AND row, so another man's uuid matches nothing and is
// told so. Marking paid books the income through the same shape as the Stripe path, once.
//
// ⚠️ AND THE MARKS ARE NEVER GATED, the elections DELETE shape: keeping his own record straight
// is not the work, it is his record. Only creating an invoice is the work, so the gate sits on
// the create branch alone, checked after the body is read because the action decides the rule.
//
// ⚠️ THE FORM IS THE WHOLE PARSE. The WhatsApp flow needs draftInvoice (AI) because a man in a
// chat types "bathroom rewire 450, materials 80" as one breath. A form already has the amounts
// in their own boxes, so there is nothing to guess and no AI spend to ring fence. Deterministic
// in, deterministic out.
//
// ⚠️ AND NOTHING IS SENT TO HIS CUSTOMER, BY US, EVER. The WhatsApp flow emails the invoice when
// the man gave an address mid conversation. Here the next screen is the share step: the link
// rendered for HIM to send. A message to another human being always asks, and on this surface
// the send button is his, in his own apps.
//
// ⚠️ THE REDIRECT CARRIES A SEALED REFERENCE, NEVER THE NEW ROW'S ID. app/app/invoiceref.ts, the
// same rule as every app URL: nothing a customer can read or edit points at a row.
//
// ⚠️ AND THE VAT IS DECIDED HERE, FROM FACTS, NEVER COMPUTED HERE (1 August 2026). lib/vat.ts owns
// every figure: treatmentFor reads his profile and the three facts about this job, priceInvoice
// does the arithmetic, and createInvoice stores what it was handed. This route does one thing the
// library cannot: it puts the questions only to the man they belong to, and refuses to guess.
//
//   he is not VAT registered   ->  treatment 'none'. No VAT anywhere. Charging VAT when he is not
//                                  registered is an offence, so the answer is decided, not asked.
//   registered, not CIS        ->  the rate he picked on each line, charged the ordinary way.
//   registered AND a CIS       ->  the three reverse charge facts come off the form. On his
//   subcontractor                  commonest invoice, a main contractor's job, he charges NOTHING
//                                  and the customer accounts for the VAT. VATA 1994 s55A.
//
// 🔴 A NULL VAT PROFILE IS A FAILED READ, NOT "HE IS NOT REGISTERED". The two are different
// answers and only one of them is safe to act on. Treating a bad database minute as "unregistered"
// would quietly strip the VAT off a document his customer pays from and his accountant checks, and
// he would find out at his next return. So the create is refused, out loud, and he tries again.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

// Six lines is a real job's invoice. More is a spreadsheet, and the phone flow agrees.
const MAX_LINES = 6;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The VAT questions the form says it put to him. The route works out what it SHOULD have asked
// from his profile, so a form rendered before he registered, or a hand made post, cannot make an
// invoice out of questions nobody answered.
type VatFormShape = 'none' | 'rates' | 'rc';

// Yes, no, or nothing. Silence is never read as no on the reverse charge: an unanswered question
// there is the difference between a legal invoice and one that charges VAT he must not charge.
function answer(v: unknown): 'yes' | 'no' | null {
  if (v === true || v === 'yes') return 'yes';
  if (v === false || v === 'no') return 'no';
  return null;
}

// The highest rate on the invoice, lib/vat.ts's own ordering. A wholly zero rated supply, a new
// build, is outside the reverse charge, so which rate is on top decides the question.
const RATE_ORDER: readonly VatRateKey[] = ['standard', 'reduced', 'zero', 'exempt', 'outside'];
function topRate(lines: Array<{ rate: VatRateKey }>): VatRateKey {
  return RATE_ORDER.find((k) => lines.some((li) => li.rate === k)) ?? 'standard';
}

export async function POST(req: NextRequest) {
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const back = (q: string) => NextResponse.redirect(new URL(`/app/invoices/new?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app/invoices/new', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let action = '';
  let markId = '';
  let markRef = '';
  let customer = '';
  let contact = '';
  let address = '';
  let workedOn = '';
  let items: string[] = [];
  let amounts: string[] = [];
  let rates: string[] = [];
  let vatForm = '';
  let customerVat: 'yes' | 'no' | null = null;
  let customerCis: 'yes' | 'no' | null = null;
  let endUser: 'yes' | 'no' | null = null;
  // 🔴 IS THIS JOB WITHIN CIS. A PER INVOICE FACT, and it used to be hardcoded true. See below.
  let withinCis: 'yes' | 'no' | null = null;
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return back('problem=bad');
    action = String(f.get('action') ?? '');
    markId = String(f.get('id') ?? '');
    markRef = String(f.get('ref') ?? '');
    customer = String(f.get('customer') ?? '');
    contact = String(f.get('contact') ?? '');
    address = String(f.get('address') ?? '');
    workedOn = String(f.get('worked_on') ?? '');
    items = f.getAll('item').map(String);
    amounts = f.getAll('amount').map(String);
    rates = f.getAll('rate').map(String);
    vatForm = String(f.get('vatform') ?? '');
    customerVat = answer(f.get('customer_vat'));
    customerCis = answer(f.get('customer_cis'));
    endUser = answer(f.get('end_user'));
    withinCis = answer(f.get('within_cis'));
  } else {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    customer = typeof body.customer === 'string' ? body.customer : '';
    contact = typeof body.contact === 'string' ? body.contact : '';
    address = typeof body.address === 'string' ? body.address : '';
    workedOn = typeof body.worked_on === 'string' ? body.worked_on : '';
    const li = Array.isArray(body.line_items) ? body.line_items : [];
    for (const raw of li) {
      const r = (raw ?? {}) as { description?: unknown; amount?: unknown; rate?: unknown };
      items.push(typeof r.description === 'string' ? r.description : '');
      amounts.push(typeof r.amount === 'string' || typeof r.amount === 'number' ? String(r.amount) : '');
      rates.push(typeof r.rate === 'string' ? r.rate : '');
    }
    vatForm = typeof body.vatform === 'string' ? body.vatform : '';
    customerVat = answer(body.customer_vat);
    customerCis = answer(body.customer_cis);
    endUser = answer(body.end_user);
    withinCis = answer(body.within_cis);
  }

  // ── His own row's status, said by him. Form posts from /app/invoice, never gated. ──────────
  if (action === 'sent' || action === 'paid') {
    // The way back is the detail page he pressed the button on, via the sealed reference he
    // already held. The reference is not trusted here: the detail page re-verifies it on
    // landing, and a stale or borrowed one lands on his own list, the invoiceref rule. The
    // destination is always a path of ours resolved against req.url, the same origin shape
    // test/csp.test.mjs walks every form route for.
    const backTo = (q: string) => {
      const to = markRef
        ? `/app/invoice?ref=${encodeURIComponent(markRef)}&${q}`
        : `/app/invoices?${q}`;
      return NextResponse.redirect(new URL(to, req.url), 303);
    };
    // A man pressing a button, not a loop flipping rows.
    if (await userBurst('invoicemark', user.id, 30)) return backTo('problem=slow');
    // The id rides in the form body, shape checked before it goes near a query. Ownership is
    // the lib accessor's: both filters, his row or nothing.
    if (!UUID.test(markId)) return backTo('problem=save');
    const done = action === 'sent'
      ? await markInvoiceSentByOwner(user.id, markId)
      : await markInvoicePaidByOwner(user.id, markId);
    return done ? backTo(`did=${action}`) : backTo('problem=save');
  }

  // ── Making one: the work, gated and rate limited. ──────────────────────────────────────────
  // The work stops when he stops paying. lib/gate.ts row: 'entitled'. Raising a new invoice is
  // us doing something new for him, the same judgement as a typed cash entry. The gate sits
  // after the body read because the action decides the rule, and visibly not nested under any
  // earlier early return.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/invoices/new');

  // A man invoicing a week of jobs, not a loop minting rows.
  if (await rateLimitedShared(`invoices:${user.id}`, 20, 60 * 60 * 1000)) {
    return isForm ? back('problem=slow') : NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  customer = customer.trim().slice(0, 120);
  if (!customer) {
    return isForm ? back('problem=customer') : NextResponse.json({ error: 'bad_customer' }, { status: 400 });
  }
  // The contact is stored for HIS reference and prefills HIS mailto link. We never message it.
  const customerContact = contact.trim().slice(0, 160) || null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE TWO BULLETS THAT APPLY TO EVERYBODY. GOV.UK, "Invoices: what they must include":
  // "the company name and address of the customer you're invoicing" and "the date the goods or
  // service were provided (supply date)". This file already implements the HARDER standard, VAT
  // Regulations 1995 reg 14, and reg 14 only reaches the minority of users who are registered.
  // A rule only holds where it is pointed, and this one was pointed at reg 14.
  //
  // ⚠️ THE FORM MUST CARRY BOTH. THE API MUST NOT DEMAND THEM. That is a deliberate split and
  // not an oversight. /app/invoices/new is a man filling in a document, and asking him is the
  // right pressure on the one page in this product that leaves the building. /api/whatsapp posts
  // here from a sentence a man dictated with one hand, where there is no address to have. The
  // rule is the same in both places: what he did not say is never invented, it is left blank,
  // and the document simply does not print that line.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const customerAddress = address.trim().replace(/[ \t]+\n/g, '\n').slice(0, 300) || null;
  if (isForm && !customerAddress) {
    return back('problem=address');
  }

  // A date this product wrote or a date he picked, and nothing else. An unreadable one is refused
  // rather than quietly becoming today: a supply date is a fact about when the work happened, and
  // guessing it wrong on a document is worse than the form asking him again.
  const supplyDate = workedOn.trim();
  let supply: string | null = null;
  if (supplyDate) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(supplyDate) && !Number.isNaN(Date.parse(supplyDate));
    if (!ok) {
      return isForm ? back('problem=worked') : NextResponse.json({ error: 'bad_supply_date' }, { status: 400 });
    }
    supply = supplyDate;
  }
  if (isForm && !supply) {
    return back('problem=worked');
  }

  // ⚠️ A HALF TYPED LINE IS REFUSED, NEVER DROPPED. Quietly skipping a row that has a
  // description but no readable amount would issue an invoice missing the £450 he meant to
  // charge, and he would only find out when the payment came up short. Fully empty rows are
  // just the spare boxes on the form, and they are ignored.
  const lineItems: Array<{ description: string; amount: number; rate: VatRateKey }> = [];
  for (let i = 0; i < Math.max(items.length, amounts.length); i += 1) {
    const description = (items[i] ?? '').trim().slice(0, 200);
    const amountRaw = (amounts[i] ?? '').trim();
    if (!description && !amountRaw) continue;
    // Pounds as a person types them, the same reading /api/money/manual gives them.
    const amount = Math.round(Number(amountRaw.replace(/[,\s]/g, '')) * 100) / 100;
    if (!description || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return isForm ? back('problem=line') : NextResponse.json({ error: 'bad_line' }, { status: 400 });
    }
    // 🔴 THE RATE IS READ AT THIS ROW'S OWN INDEX, AND NEVER TRUSTED AS IT ARRIVES. lineItems
    // skips the spare empty rows, so reading the rates afterwards would slide a 5% line onto the
    // wrong work. Anything that is not one of lib/vat.ts's five keys becomes the standard rate,
    // which is the highest: a bent value can only ever raise the VAT he charges, never hide it.
    const rateRaw = (rates[i] ?? '').trim();
    const rate: VatRateKey = isVatRateKey(rateRaw) ? rateRaw : 'standard';
    lineItems.push({ description, amount, rate });
  }
  if (lineItems.length === 0) {
    return isForm ? back('problem=line') : NextResponse.json({ error: 'bad_line' }, { status: 400 });
  }
  if (lineItems.length > MAX_LINES) {
    return isForm ? back('problem=lines') : NextResponse.json({ error: 'too_many_lines' }, { status: 400 });
  }

  // ── The VAT on it. Decided from his profile and this job, priced by lib/vat.ts. ─────────────
  //
  // 🔴 NULL IS A FAILED READ. It is not "he is not registered", and acting on it as though it
  // were would put a document in front of his customer with the VAT quietly missing. Nothing has
  // been saved at this point, so the honest answer is to refuse and let him press it again.
  const profile = await readVatProfile(user.id);
  if (!profile) {
    return isForm ? back('problem=vat') : NextResponse.json({ error: 'vat_unavailable' }, { status: 503 });
  }

  // The three reverse charge facts are only ever PUT to a VAT registered CIS subcontractor. For
  // everybody else they are decided here, because for everybody else there is only one answer.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 EVERY VAT REGISTERED TRADER IS ASKED. IT USED TO DEPEND ON A FLAG NOTHING EVER SET.
  //
  // This read `profile.cisSubcontractor ? 'rc' : 'rates'`, and cis_subcontractor is `not null
  // default false`, written by exactly ONE radio on /app/you/vat that nothing in the product ever
  // pointed him at. So the commonest customer this product has, a VAT registered subcontractor
  // billing a main contractor, was never asked and silently charged 20%.
  //
  // Proven on the live site on 2 August with a control: the same customer, the same work, the same
  // day, only that answer moved. Yes gave £3,013.50 with no VAT and the s55A wording. No, which is
  // what everybody has by default, gave £3,616.20 with £602.70 of VAT on it. That VAT is not his
  // to charge under VATA 1994 s55A and his contractor cannot reclaim it.
  //
  // ⚠️ AND withinCis WAS HARDCODED TRUE below, which was the same mistake pointing the other way:
  // a flagged subcontractor doing a NON CIS supply (plant hire without an operator, professional
  // services, materials only) had the reverse charge applied to work it does not cover. Whether a
  // JOB is within CIS is a fact about the job, so it is now asked about the job.
  //
  // The profile flag survives as what it always should have been: the DEFAULT on that radio, so a
  // man who has told us he works under CIS does not answer the same thing every week.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const asked: VatFormShape = profile.registered ? 'rc' : 'none';

  let facts: Omit<ReverseChargeFacts, 'supplierRegistered'>;
  if (asked === 'rc') {
    // 🔴 THE FORM MUST HAVE ACTUALLY ASKED, AND HE MUST HAVE ACTUALLY ANSWERED. A form rendered
    // before he told us he was a CIS subcontractor, or a post made by hand, carries no answers,
    // and reading that silence as three noes would charge 20% on the one invoice in this product
    // that must carry none. Refused, and the fresh form asks him properly.
    // ⚠️ THE THREE CUSTOMER ANSWERS ARE ONLY REQUIRED WHEN THE JOB IS WITHIN CIS. Outside it they
    // decide nothing, and demanding them would put three questions on every invoice a VAT
    // registered trader sends for work the scheme has never covered. The within_cis answer itself
    // is ALWAYS required, because its silence is the thing that caused this.
    if (vatForm !== 'rc' || !withinCis) {
      return isForm ? back('problem=vatasked') : NextResponse.json({ error: 'vat_answers_missing' }, { status: 400 });
    }
    if (withinCis === 'yes' && (!customerVat || !customerCis || !endUser)) {
      return isForm ? back('problem=vatasked') : NextResponse.json({ error: 'vat_answers_missing' }, { status: 400 });
    }
    facts = {
      withinCis: withinCis === 'yes',
      customerVatRegistered: customerVat === 'yes',
      customerCisRegistered: customerCis === 'yes',
      customerIsEndUser: endUser === 'yes',
      rateKey: topRate(lineItems),
    };
  } else {
    // ⚠️ AND THE OTHER TWO SHAPES NEED NO SUCH CHECK, WHICH IS WORTH SAYING OUT LOUD. If the form
    // is older than his profile the worst it can do is arrive with no rates, and a missing rate
    // becomes the standard one, which is the right default for a registered man and the highest
    // rate there is. If he has DEREGISTERED since the form was drawn, treatment is 'none' below
    // and lib/vat.ts strips every rate off every line, which is the only safe answer for a man
    // who may not charge VAT at all. Neither can produce an invoice that understates it.
    facts = {
      withinCis: false,
      customerVatRegistered: false,
      customerCisRegistered: false,
      customerIsEndUser: false,
      rateKey: topRate(lineItems),
    };
  }

  const { treatment } = treatmentFor(profile, facts);
  const priced = priceInvoice(lineItems, treatment);

  // 🔴 THE OWNER IS THE SESSION AND ONLY THE SESSION. Nothing in the request names an account.
  const inv = await createInvoice(user.id, {
    customer_name: customer,
    customer_contact: customerContact,
    customer_address: customerAddress,
    supply_date: supply,
    // The priced lines, so the rate that was applied is stored beside the work it was applied to.
    // A VAT invoice has to show the rate on each line: VAT Regulations 1995 reg 14.
    line_items: priced.lines.map((li) => ({
      description: li.description,
      amount: li.amount,
      rate: li.rate,
    })),
    vat: {
      treatment: priced.treatment,
      tax: priced.vat,
      total: priced.total,
      reverseChargeVat: priced.reverseChargeVat,
    },
  });
  if (!inv) {
    // A failed write must not look like a made invoice. Nothing was saved, and the page says so.
    return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  if (!isForm) return NextResponse.json({ ok: true, number: inv.number, total: inv.total });

  // Onward to the share step: the detail view, pointed at by a sealed reference minted for THIS
  // session. If references are unconfigured the list still confirms the invoice exists, which
  // fails closed without losing his work.
  const ref = invoiceRef(user.id, inv.id, 'invoice');
  return ref
    ? NextResponse.redirect(new URL(`/app/invoice?ref=${encodeURIComponent(ref)}&made=1`, req.url), 303)
    : NextResponse.redirect(new URL('/app/invoices?done=made', req.url), 303);
}
