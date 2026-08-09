// A 200 IS NOT A PROMISE OF JSON, ON THE PAYMENT PATH.
//
//   node test/stripebody.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, FOUND 9 AUGUST 2026 BY SWEEPING FOR THE ONE lib/claude.ts SHIPPED A FIX FOR THAT
// MORNING. THE SAME SHAPE, ON THE FOUR FUNCTIONS THAT TAKE MONEY.
//
// Every one of them read
//
//     if (!res.ok) { console.error(...); return null; }
//     const data = (await res.json()) as { url?: string };
//
// The guard catches a 402, a 429 and a 500. It does nothing about a TWO HUNDRED CARRYING HTML,
// which is what an edge, a proxy or a captive network returns when it answers for the origin.
// res.json() then THROWS.
//
// 🔴 AND HERE THE THROW JUMPS OVER AN APOLOGY SOMEBODY WROTE ON PURPOSE. Each of these returns
// null on failure, and each calling route has a graceful branch waiting for that null. NOT ONE of
// those routes wraps the call in a try:
//
//   /api/pay/[id]           `redirect(url ?? invoiceUrl, 303)` sends A TRADESMAN'S OWN CUSTOMER
//                           back to the invoice rather than nowhere.
//   /api/billing/checkout   redirects to a step saying the card could not be started and that his
//                           trial is running either way.
//   /api/billing/portal     hands a paying customer back to his billing page.
//
// So a throw leaves the handler, Next answers a raw 500, and the man clicking Pay, Subscribe or
// Manage billing gets an error page instead of the sentence written for him. A lost invoice and a
// lost sale, neither leaving a trace anyone would recognise as this.
//
// 🔴 THIS RATCHET GUARDS FOUR FAILURES.
//
//   1. ANY OF THE FOUR GOES BACK TO res.json(). One is enough to 500 a payment.
//   2. THE HELPER STARTS THROWING instead of returning null, which moves the 500 one frame down.
//   3. A GOOD REPLY STOPS BEING READ. A guard that rejects everything is not a fix, so the happy
//      path is exercised on every one of the four.
//   4. THE LOG STARTS CARRYING THE BODY. Stripe's error bodies quote the request they wrapped, and
//      on this file that carries a customer's email address.
//
// ⚠️ BEHAVIOUR, NOT SHAPE. fetch is stubbed and the REAL exported functions are called against a
// gateway page, so what is proved is what the route would actually receive: null, which it knows
// how to be honest about, rather than an exception nobody catches.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(root, rel), 'utf8');

const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'stripebody-'));
const staged = new Set();
const stageModule = (name) => {
  if (staged.has(name)) return;
  staged.add(name);
  const text = src(`lib/${name}.ts`);
  writeFileSync(path.join(stage, `${name}.ts`), fixImports(text));
  for (const m of text.matchAll(/from '\.\/([a-zA-Z0-9._-]+)'/g)) stageModule(m[1]);
};

// Read at load time. Neither is real and nothing is ever sent: fetch is stubbed for every call.
// STRIPE_PAYOUT_ROUTE is what hasInvoicePayoutRoute() reads, and without it createInvoiceCheckout
// refuses before any fetch, which would make the first assertion below vacuous.
process.env.STRIPE_SECRET_KEY = 'sk_test_stripe_body_suite_not_a_real_key';
process.env.STRIPE_CONNECT_ENABLED = 'true';
process.env.STRIPE_PRICE_MONTHLY = 'price_suite_monthly';
process.env.STRIPE_PRICE_ANNUAL = 'price_suite_annual';

stageModule('stripe');
const S = await import(pathToFileURL(path.join(stage, 'stripe.ts')).href);

const stripeSrc = src('lib/stripe.ts');
const payRoute = src('app/api/pay/[id]/route.ts');
const checkoutRoute = src('app/api/billing/checkout/route.ts');
const portalRoute = src('app/api/billing/portal/route.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    process.stdout.write(`\n  FAIL  ${name}`);
  }
};

// ── A stub that answers the way a gateway does, and a quiet console. ─────────────────────────
const realFetch = globalThis.fetch;
const realError = console.error;
const errors = [];
const reply = (body, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body),
});
async function withFetch(body, fn, status = 200) {
  globalThis.fetch = reply(body, status);
  console.error = (...a) => errors.push(a.map(String).join(' '));
  try {
    return await fn();
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
}

const GATEWAY_HTML = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>'
  + '<h1>The origin is unreachable.</h1></body></html>';
const GOOD_URL = JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
const GOOD_SUB = JSON.stringify({ id: 'sub_1', status: 'trialing', items: { data: [] } });

// ── The four lanes a customer can be on. ─────────────────────────────────────────────────────
const lanes = [
  ['createSubscriptionCheckout', () => S.createSubscriptionCheckout({
    plan: 'monthly', offer: '', email: 'someone@example.com', phone: null, repCode: null,
    userId: 'u1', successUrl: 'https://lekhio.app/app', cancelUrl: 'https://lekhio.app/start',
  }), GOOD_URL, 'https://checkout.stripe.com/c/pay/cs_test_1'],
  ['createBillingPortal', () => S.createBillingPortal('cus_1', 'https://lekhio.app/app/you/billing'),
    GOOD_URL, 'https://checkout.stripe.com/c/pay/cs_test_1'],
  ['getStripeSubscription', () => S.getStripeSubscription('sub_1'), GOOD_SUB, null],
];

ok('🔴 THE PAYMENT FUNCTIONS EXIST AND ARE CALLABLE, without which everything below is vacuous',
  typeof S.createSubscriptionCheckout === 'function'
  && typeof S.createBillingPortal === 'function'
  && typeof S.getStripeSubscription === 'function'
  && typeof S.createInvoiceCheckout === 'function');

for (const [name, call, goodBody, wantUrl] of lanes) {
  // 🔴 THE GOOD ARM FIRST, so the bad arm below proves a difference rather than a broken stub.
  const good = await withFetch(goodBody, call);
  ok(`🔴 ${name}: a real reply is still read and still comes back`,
    wantUrl ? good === wantUrl : (good !== null && typeof good === 'object'));

  errors.length = 0;
  let threw = null;
  let out;
  try {
    out = await withFetch(GATEWAY_HTML, call);
  } catch (e) {
    threw = e;
  }
  ok(`🔴 ${name}: A GATEWAY PAGE IS NULL, NEVER AN EXCEPTION PAST THE ROUTE`,
    threw === null && out === null);
  ok(`${name}: and it says so in the log, naming it as html`,
    errors.some((e) => /not JSON/.test(e)) && errors.some((e) => /html/.test(e)));
  ok(`🔴 ${name}: AND THE LOG DOES NOT CARRY THE BODY`,
    !errors.some((e) => /Bad Gateway|origin is unreachable|DOCTYPE|<h1>/.test(e)));
}

// A stream cut off half way is the other shape of the same thing.
let cutthrew = null;
let cutout;
try {
  cutout = await withFetch('{"id":"cs_test_1","ur', () => S.createBillingPortal('cus_1', 'https://lekhio.app/x'));
} catch (e) {
  cutthrew = e;
}
ok('a truncated body is null too, and never an exception',
  cutthrew === null && cutout === null);

// ── The source: no payment function may quietly go back to the old line. ─────────────────────
ok('the helper exists and is the one thing that reads a body here',
  /async function readStripeJson<T>\(res: Response, where: string\): Promise<T \| null>/.test(stripeSrc));
// ⚠️ MATCHED ON THE CALL, NOT ON THE TYPE ARGUMENT. A first attempt used [^>]+ for the generic and
// silently missed readStripeJson<Record<string, unknown>>, because the class stops at the first
// closing angle bracket. It reported three of four and would have let one payment site rot.
const sites = (stripeSrc.match(/readStripeJson<[\s\S]*?>\(res, '([a-z ]+)'\)/g) || []);
ok('🔴 ALL FOUR PAYMENT SITES GO THROUGH IT',
  sites.length === 4);
ok('and each one names which payment it is, so a log line says what a customer was doing',
  ['invoice checkout', 'subscription checkout', 'subscription read', 'billing portal']
    .every((label) => stripeSrc.includes(`(res, '${label}')`)));

// ⚠️ COMMENTS STRIPPED FIRST. The block above the helper quotes the old line verbatim, because a
// defect note that will not name the defect is worth nothing to the next reader, and counting raw
// text would score that quotation as a live call site.
const codeOnly = stripeSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
ok('the comment stripper left the code behind rather than eating the file',
  /export async function createSubscriptionCheckout\(/.test(codeOnly) && codeOnly.length > 4000);
ok('🔴 THE ONLY BARE json() LEFT IN THE CODE IS THE ONE THAT ALREADY CATCHES',
  (codeOnly.match(/\.json\(\)/g) || []).length === 1
  && /res\.json\(\)\.catch\(\(\) => null\)/.test(codeOnly));

// ── The routes this protects, which is WHY it matters. ───────────────────────────────────────
// ⚠️ ASSERTED, NOT ASSUMED. If one of them ever grows its own try, this file is still correct but
// its reasoning is out of date, and the next reader should be told rather than left guessing.
ok('🔴 THE THREE ROUTES STILL HAVE THE GRACEFUL BRANCH THE THROW USED TO JUMP OVER',
  /url \?\? invoiceUrl/.test(payRoute)
  && /if \(!url\)/.test(checkoutRoute)
  && /createBillingPortal\(/.test(portalRoute));
ok('and none of them wraps the call in a try, which is exactly why null and not a throw',
  !/try \{/.test(payRoute) && !/try \{/.test(portalRoute));

// ── House rules. ─────────────────────────────────────────────────────────────────────────────
ok('no en dash or em dash in the new block',
  !/[–—]/.test(stripeSrc.slice(stripeSrc.indexOf('A 200 IS NOT A PROMISE OF JSON'))));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
