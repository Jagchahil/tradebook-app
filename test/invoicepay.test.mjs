// THE MONEY THAT MUST NOT MOVE. Invoice card payment, gated off until a payout route exists.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Found live on 31 July 2026: the public invoice page, the one a customer's customer opens,
// offered "Pay now" through OUR Stripe account, branded Lekhio Ltd. No user has any payout
// route, no Stripe Connect account exists anywhere in the codebase, so a payer's money would
// have landed in Lekhio's own balance with no way to reach the tradesman who did the work.
// Money paid to the wrong account is the worst class of bug this product can have: it is not a
// crash we can fix or a figure we can correct, it is us holding a stranger's money while a
// customer believes he has paid and a tradesman has not been paid.
//
// WHAT THIS SUITE DEFENDS, IN THE ORDER THE FAILURES WOULD HURT:
//
//   1. 🔴 NO LIVE CHECKOUT SESSION FOR AN INVOICE WHOSE OWNER HAS NO PAYOUT ROUTE, attacked at
//      runtime: a LIVE looking key is configured, fetch records every request, and
//      createInvoiceCheckout must return null with ZERO requests made. Today that is every
//      invoice, because hasInvoicePayoutRoute is false for all.
//
//   2. 🔴 THE GUARD SITS AT THE MINT. The refusal is inside createInvoiceCheckout itself,
//      before the key check and before any network line, so no future call site can reopen the
//      trap by forgetting a check.
//
//   3. 🔴 THE PAGE DRAWS NO DOOR. The public invoice page carries no link to /api/pay, no pay
//      button, just the document, the tradesman's own notes (where his bank details live if he
//      wrote them), and one honest line that card payment is coming.
//
//   4. OUR OWN BILLING IS UNTOUCHED. The subscription checkout still mints sessions: the
//      Lekhio subscription is the one thing our key is FOR.
//
// Run: node test/invoicepay.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments stripped before looking for code a file must not contain: these files explain at
// length why the thing they refuse to do would be wrong, and the check must read the code.
const codeOnly = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

console.log('\ninvoice card payment: no payout route, no session, no button');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE RUNTIME ATTACK. A live key is in place and the session must still refuse to exist.
// ---------------------------------------------------------------------------------------------
// The key is set BEFORE the import because lib/stripe.ts reads it at module load. This suite
// runs in its own node process (run-all spawns one per suite), so the env leaks nowhere.
process.env.STRIPE_SECRET_KEY = 'sk_live_test_attack_key_never_real';
const S = await import(pathToFileURL(path.join(root, 'lib/stripe.ts')).href);

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), body: init.body ? String(init.body) : null });
  return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }), { status: 200 });
};

try {
  ok('the stage is set: Stripe IS configured, so a refusal below is the gate and not a missing key',
    S.hasStripeConfig() === true);
  ok('🔴 no invoice owner has a payout route today', S.hasInvoicePayoutRoute() === false);

  const attempt = await S.createInvoiceCheckout({
    invoiceId: '5e6f7a8b-1111-4111-8111-222222222222',
    number: 'INV-0042',
    total: 450,
    customerEmail: 'payer@example.com',
    successUrl: 'https://lekhio.app/invoice/x?paid=1',
    cancelUrl: 'https://lekhio.app/invoice/x',
  });
  ok('🔴 NO CHECKOUT SESSION CAN BE CREATED FOR AN INVOICE: the call returns null', attempt === null);
  ok('🔴 AND NOT ONE REQUEST LEFT THE BUILDING: the refusal is before any network line',
    calls.length === 0);

  // For contrast: the subscription checkout, the one thing our key is for, still works. If this
  // ever fails alongside the two above, the gate has been widened past its argument.
  const sub = await S.createSubscriptionCheckout({
    plan: 'monthly',
    email: 'user@example.com',
    successUrl: 'https://lekhio.app/app?paid=1',
    cancelUrl: 'https://lekhio.app/pricing',
  });
  ok('our own subscription checkout still mints a session', sub === 'https://checkout.stripe.com/c/pay/cs_test_123');
  ok('and that one request went to Stripe checkout sessions',
    calls.length === 1 && calls[0].url.includes('/checkout/sessions'));
  ok('the subscription session is subscription mode, never a one off payment into our balance',
    calls[0].body !== null && calls[0].body.includes('mode=subscription'));
} finally {
  globalThis.fetch = realFetch;
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE GUARD SITS AT THE MINT, AND THE ROUTE CHECKS TOO.
// ---------------------------------------------------------------------------------------------
const stripeSrc = read('lib/stripe.ts');
const stripeCode = codeOnly(stripeSrc);
const payRoute = read('app/api/pay/[id]/route.ts');

{
  const mint = stripeCode.slice(stripeCode.indexOf('export async function createInvoiceCheckout'));
  ok('🔴 createInvoiceCheckout refuses on the payout route BEFORE the key and BEFORE the network',
    mint.indexOf('hasInvoicePayoutRoute()') > -1
    && mint.indexOf('hasInvoicePayoutRoute()') < mint.indexOf('if (!KEY)')
    && mint.indexOf('hasInvoicePayoutRoute()') < mint.indexOf('checkout/sessions'));
  ok('the subscription checkout carries no such gate: our key is for our subscription',
    !/hasInvoicePayoutRoute/.test(stripeCode.slice(stripeCode.indexOf('export async function createSubscriptionCheckout'))));
}

{
  // Inside the handler body, so the import line at the top of the file cannot satisfy the order.
  const handler = codeOnly(payRoute).slice(codeOnly(payRoute).indexOf('export async function GET'));
  ok('🔴 the pay route checks the payout route before the rate limiter and the database',
    handler.indexOf('hasInvoicePayoutRoute()') > -1
    && handler.indexOf('hasInvoicePayoutRoute()') < handler.indexOf('rateLimitedShared')
    && handler.indexOf('hasInvoicePayoutRoute()') < handler.indexOf('getPublicInvoice'));
}
ok('and on refusal it lands the payer on the invoice, never an error page',
  /NextResponse\.redirect\(invoiceUrl, 303\)/.test(payRoute));

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE PAGE DRAWS NO DOOR.
// ---------------------------------------------------------------------------------------------
const invoicePage = read('app/invoice/[id]/page.tsx');
const invoicePageCode = codeOnly(invoicePage);

ok('🔴 the public invoice page carries no link to /api/pay', !/api\/pay/.test(invoicePageCode));
ok('🔴 no pay button and no Stripe promise on the page',
  !/Pay .*now|hasStripeConfig|Stripe/.test(invoicePageCode));
ok('the tradesman\'s notes still render: his own bank details reach his customer if he wrote them',
  /invoice\.notes/.test(invoicePageCode));
// ⚠️ AND THE HONEST LINE NAMES NO DETAILS. The invoice carries no payment details unless the
// tradesman wrote them into his notes, so "pay using the details on this invoice" promised the
// payer something that was not there. Fixed 31 July: pay the sender the way the two of them agreed.
ok('🔴 the one honest line: card payment is coming, pay the way the two of you have agreed',
  invoicePage.includes('Card payment is coming.')
  && /the way the two of you have agreed/.test(invoicePage)
  && !/pay using the details on this invoice/.test(invoicePageCode));
ok('the page still ships no client script',
  !/'use client'|onClick|onChange|useState|<script/.test(invoicePage));

// ---------------------------------------------------------------------------------------------
// 4. THE HOUSE RULES, ON EVERY FILE THIS TRAP TOUCHES.
// ---------------------------------------------------------------------------------------------
for (const [name, src] of [['lib/stripe.ts', stripeSrc], ['pay route', payRoute], ['invoice page', invoicePage]]) {
  ok(`${name}: no em or en dash anywhere in it`, !/[–—]/.test(src));
  ok(`${name}: never writes the rival domain`, !/lekhio\.com/.test(src));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
