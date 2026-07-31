import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import { createInvoice, markInvoiceSentByOwner, markInvoicePaidByOwner } from '../../../lib/supabase';
import { rateLimitedShared, userBurst } from '../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import { invoiceRef } from '../../app/invoiceref';

// AN INVOICE, MADE FROM THE WEB, AND KEPT STRAIGHT BY ITS OWNER.
//
//   POST { customer, contact?, item[], amount[] }   ->  one draft invoice, then the share step
//   POST { action: 'sent' | 'paid', id, ref? }      ->  his own row's status, said by him
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
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

// Six lines is a real job's invoice. More is a spreadsheet, and the phone flow agrees.
const MAX_LINES = 6;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  let items: string[] = [];
  let amounts: string[] = [];
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return back('problem=bad');
    action = String(f.get('action') ?? '');
    markId = String(f.get('id') ?? '');
    markRef = String(f.get('ref') ?? '');
    customer = String(f.get('customer') ?? '');
    contact = String(f.get('contact') ?? '');
    items = f.getAll('item').map(String);
    amounts = f.getAll('amount').map(String);
  } else {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
    customer = typeof body.customer === 'string' ? body.customer : '';
    contact = typeof body.contact === 'string' ? body.contact : '';
    const li = Array.isArray(body.line_items) ? body.line_items : [];
    for (const raw of li) {
      const r = (raw ?? {}) as { description?: unknown; amount?: unknown };
      items.push(typeof r.description === 'string' ? r.description : '');
      amounts.push(typeof r.amount === 'string' || typeof r.amount === 'number' ? String(r.amount) : '');
    }
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

  // ⚠️ A HALF TYPED LINE IS REFUSED, NEVER DROPPED. Quietly skipping a row that has a
  // description but no readable amount would issue an invoice missing the £450 he meant to
  // charge, and he would only find out when the payment came up short. Fully empty rows are
  // just the spare boxes on the form, and they are ignored.
  const lineItems: Array<{ description: string; amount: number }> = [];
  for (let i = 0; i < Math.max(items.length, amounts.length); i += 1) {
    const description = (items[i] ?? '').trim().slice(0, 200);
    const amountRaw = (amounts[i] ?? '').trim();
    if (!description && !amountRaw) continue;
    // Pounds as a person types them, the same reading /api/money/manual gives them.
    const amount = Math.round(Number(amountRaw.replace(/[,\s]/g, '')) * 100) / 100;
    if (!description || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return isForm ? back('problem=line') : NextResponse.json({ error: 'bad_line' }, { status: 400 });
    }
    lineItems.push({ description, amount });
  }
  if (lineItems.length === 0) {
    return isForm ? back('problem=line') : NextResponse.json({ error: 'bad_line' }, { status: 400 });
  }
  if (lineItems.length > MAX_LINES) {
    return isForm ? back('problem=lines') : NextResponse.json({ error: 'too_many_lines' }, { status: 400 });
  }

  // 🔴 THE OWNER IS THE SESSION AND ONLY THE SESSION. Nothing in the request names an account.
  const inv = await createInvoice(user.id, {
    customer_name: customer,
    customer_contact: customerContact,
    line_items: lineItems,
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
