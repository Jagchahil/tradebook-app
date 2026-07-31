// The billing page and the portal door. Run: node test/billingweb.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS.
//
//   1. 🔴 THE PORTAL ROUTE NEVER READS THE BODY. The Stripe customer is resolved from the
//      verified session and our own subscription rows, account first then email then phone. A
//      route that read a customer id out of a request would let anyone open another man's
//      billing portal, so the pin here is on the strongest possible shape: the body is never
//      opened at all, for anything.
//
//   2. 🔴 POST ONLY. A GET that opens a billing portal is a portal any other site can open for
//      him with an image tag.
//
//   3. THE PAGE SAYS ONLY WHAT THE ROW HOLDS. Trial with days left, paying with the renewal date
//      when the row has one, lapsed said plainly with the books still his. A row with no date
//      gets a sentence with no date, never an invented figure.
//
//   4. THE RAIL NO LONGER SENDS A WEB CUSTOMER TO /account, the old portal page that demands an
//      SMS code a web account cannot receive, while /account itself stays for phone era
//      customers.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');

const W = await import(pathToFileURL(path.resolve(repo, 'app/app/you/billing/words.ts')).href);
const { ruleFor } = await import(pathToFileURL(path.resolve(repo, 'lib/gate.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

console.log('\nbillingweb: the billing page, and the portal door it posts through');

// ── 1. WHERE HE STANDS, FROM THE ROW AND ONLY THE ROW ─────────────────────────────────────────
const now = new Date('2026-07-31T12:00:00Z');
const row = (over = {}) => ({
  status: null, plan: null, current_period_end: null, cancel_at_period_end: null, ...over,
});

{
  const s = W.standingFor(row({ status: 'trialing', current_period_end: '2026-08-03T12:00:00Z' }), 'open', now);
  ok('a trial with three days on the row says three days', s.kind === 'trial' && s.lines.join(' ').includes('with 3 days left'));
}
{
  const s = W.standingFor(row({ status: 'trialing', current_period_end: '2026-08-01T00:00:00Z' }), 'open', now);
  ok('the last day reads as a day, not as 1 days', s.lines.join(' ').includes('with a day left'));
}
{
  // 🔴 NO DATE ON THE ROW, NO NUMBER ON THE SCREEN. The whole point of the words module.
  const s = W.standingFor(row({ status: 'trialing' }), 'open', now);
  ok('🔴 a trial with no end date invents no figure', s.kind === 'trial' && !/\d/.test(s.lines.join(' ')));
}
{
  const s = W.standingFor(row({ status: 'active', plan: 'monthly', current_period_end: '2026-08-12T00:00:00Z' }), 'open', now);
  ok('paying monthly says monthly', s.kind === 'paying' && s.lines[0] === 'You are paying monthly.');
  ok('and the renewal date is the row\'s own, written out', s.lines.join(' ').includes('The next renewal is 12 August 2026.'));
}
{
  const s = W.standingFor(row({ status: 'active', plan: 'annual', current_period_end: '2027-07-01T00:00:00Z' }), 'open', now);
  ok('paying annually says yearly', s.lines[0] === 'You are paying yearly.');
}
{
  // 🔴 A ROW WITHOUT A PERIOD END CLAIMS NO RENEWAL DATE.
  const s = W.standingFor(row({ status: 'active', plan: 'monthly' }), 'open', now);
  ok('🔴 paying with no date on the row claims no date', !/renewal|\d/.test(s.lines.join(' ')));
}
{
  const s = W.standingFor(row({ status: 'active', plan: 'monthly', current_period_end: '2026-08-12T00:00:00Z', cancel_at_period_end: true }), 'open', now);
  ok('a cancelled but running subscription says when it stops, not when it renews',
    s.lines.join(' ').includes('You have cancelled. It runs until 12 August 2026') && !/renewal/.test(s.lines.join(' ')));
}
{
  const s = W.standingFor(row({ status: 'past_due', plan: 'monthly' }), 'open', now);
  ok('past_due says the card bounced and that nothing is locked, the lib/entitlement.ts judgement',
    s.kind === 'paying' && /retrying your card/.test(s.lines.join(' ')) && /Nothing is locked/.test(s.lines.join(' ')));
}
{
  // 🔴 LAPSED IS THE GATE'S CALL, AND THE COPY NEVER SUGGESTS HIS BOOKS ARE GONE.
  const s = W.standingFor(row({ status: 'trialing', current_period_end: '2026-07-01T00:00:00Z' }), 'readonly', now);
  ok('🔴 a lapsed trial says the trial ended and the books are still his',
    s.kind === 'lapsed' && /trial has ended/.test(s.lines[0]) && /still here and still yours/.test(s.lines.join(' ')));
  ok('🔴 the lapsed copy never suggests anything was deleted or lost',
    !/deleted|removed|lost|gone|wiped|no longer have/i.test(s.lines.join(' ')));
}
{
  const s = W.standingFor(row({ status: 'canceled' }), 'readonly', now);
  ok('a lapsed cancellation says cancelled, not trial', /subscription is cancelled/.test(s.lines[0]));
}
{
  const s = W.standingFor(null, 'open', now);
  ok('no row at all says so plainly, and that nothing has been charged',
    s.kind === 'none' && /no subscription on this account yet/.test(s.lines[0]) && /nothing has been charged/.test(s.lines[0]));
}
{
  const s = W.standingFor(row({ status: 'canceled' }), 'open', now);
  ok('a terminal row the gate still lets through claims only what the row says',
    s.kind === 'ended' && /has ended/.test(s.lines[0]));
}

ok('an unreadable date is never echoed', W.dateWords('rubbish') === null && W.dateWords(null) === null);
ok('daysLeft on an unreadable date is null, never a guess', W.daysLeft('rubbish', now) === null);

// ── 2. THE FIXED COPY, EXACTLY ────────────────────────────────────────────────────────────────
ok('the portal button says what it opens', W.PORTAL_BUTTON === 'Manage card, invoices and cancelling');
ok('the line under it is honest about where he is going and what cancelling does',
  W.PORTAL_UNDER === 'Opens Stripe, our payment provider, in this tab. Change your card, download invoices, or cancel there. Cancelling stops the next charge and your records stay yours to read.');
ok('the no card line says nothing is charged', W.NO_CARD_LINE === 'No card on file. Nothing is charged during your trial.');
ok('and its lapsed twin does not claim a trial that has ended',
  W.NO_CARD_LOCKED_LINE.startsWith('No card on file.') && !/trial/.test(W.NO_CARD_LOCKED_LINE));

// The notices are fixed sentences chosen by a token, the identity.ts discipline.
ok('an unknown problem token says nothing at all', W.portalNotice('__nope__') === null && W.portalNotice(undefined) === null);
ok('nosub is honest and offers the way to a human', /could not find a Stripe customer/.test(W.portalNotice('nosub')));
ok('unavailable says nothing has changed', /Nothing has changed/.test(W.portalNotice('unavailable')));

// No em dashes, no en dashes, anywhere a customer reads.
const allCopy = [
  W.PORTAL_BUTTON, W.PORTAL_UNDER, W.NO_CARD_LINE, W.NO_CARD_LOCKED_LINE,
  W.portalNotice('nosub'), W.portalNotice('unavailable'),
  ...['trialing', 'active', 'past_due', 'canceled'].flatMap((status) =>
    W.standingFor(row({ status, plan: 'monthly', current_period_end: '2026-08-12T00:00:00Z' }), 'open', now).lines),
  ...W.standingFor(row({ status: 'trialing' }), 'readonly', now).lines,
  ...W.standingFor(null, 'open', now).lines,
].join(' ');
ok('no em dash or en dash in any billing sentence', !/[–—]/.test(allCopy));

// ── 3. THE PORTAL ROUTE: POST ONLY, AND THE BODY IS NEVER OPENED ──────────────────────────────
const route = read('app/api/billing/portal/route.ts');

ok('🔴 the route exports POST and nothing else, so a GET is refused with 405 by Next itself',
  /export async function POST/.test(route)
  && !/export async function (GET|PUT|PATCH|DELETE|HEAD|OPTIONS)/.test(route));

// 🔴 THE STRONGEST SHAPE: not "the customer id is not read from the body" but "the body is not
// read". There is nothing in a request body this route could ever legitimately want.
ok('🔴 the route never opens the request body at all',
  !/req\.json\(/.test(route) && !/req\.formData\(/.test(route)
  && !/req\.text\(/.test(route) && !/req\.body/.test(route));

ok('🔴 the customer comes from the one resolver, keyed on the verified session',
  /sessionUser\(req\)/.test(route) && /getStripeCustomerForAccount\(\s*verified\.id/.test(route));
ok('and the identity keys come from identityForUser, never off the raw token fields',
  /identityForUser\(verified\)/.test(route));

ok('a form caller who fails lands back on the billing page with a flag, never on JSON',
  /\/app\/you\/billing\?problem=/.test(route.replace(/\s+/g, '')) || /BILLING_PAGE\}\?problem=\$\{why\}/.test(route) || /`\$\{BILLING_PAGE\}\?problem=/.test(route));
ok('a signed out form caller is sent to the sign in door with the way back',
  /\/in\?next=\$\{BILLING_PAGE\}/.test(route));
ok('the Stripe return_url is the billing page, built from NEXT_PUBLIC_APP_URL',
  /NEXT_PUBLIC_APP_URL/.test(route) && /\$\{base\}\$\{BILLING_PAGE\}/.test(route));
ok('🔴 no hardcoded domain anywhere in the route, ours or anybody else\'s', !/lekhio\./.test(route));

// The gate table row: reachable however little he has paid, because cancelling is the whole point.
ok('🔴 lib/gate.ts marks the portal always, so a read only account reaches it', ruleFor('app/api/billing/portal') === 'always');
ok('and the route never consults the gate to refuse', !/gateForUser/.test(route));

// ── 4. THE RESOLVER: ACCOUNT FIRST, THEN EMAIL, THEN PHONE ────────────────────────────────────
const supa = read('lib/supabase.ts');
const resolver = supa.slice(
  supa.indexOf('export async function getStripeCustomerForAccount'),
  supa.indexOf('export interface SubscriptionStatus'),
);
ok('the resolver exists and was found, so these checks are not vacuous', resolver.length > 100);
ok('🔴 account first, then email, then phone, in that order in the source',
  resolver.indexOf('getStripeCustomerByUser') > -1
  && resolver.indexOf('getStripeCustomerByUser') < resolver.indexOf('getStripeCustomerByEmail')
  && resolver.indexOf('getStripeCustomerByEmail') < resolver.indexOf('getStripeCustomerByPhone'));
ok('🔴 the account read skips rows with no Stripe id, or the no card trial row shades the paying one',
  /user_id=eq\.[\s\S]{0,120}stripe_customer_id=not\.is\.null/.test(supa));

// ── 5. THE PAGE: SERVER RENDERED, HONEST, AND POSTING THROUGH THE ONE DOOR ────────────────────
const page = read('app/app/you/billing/page.tsx');

ok('the page exists where the rail points', existsSync(path.join(repo, 'app/app/you/billing/page.tsx')));
ok('🔴 no client javascript', !/^'use client'/m.test(page));
ok('the button is a plain form post to the portal route',
  /action="\/api\/billing\/portal" method="post"/.test(page));
ok('the sentences come from the words module, not retyped in the page',
  /from '\.\/words'/.test(page) && /PORTAL_BUTTON/.test(page) && /PORTAL_UNDER/.test(page)
  && /standingFor\(/.test(page) && /portalNotice\(/.test(page));
ok('the no card state posts to the EXISTING checkout, no new checkout built',
  /action="\/api\/billing\/checkout" method="post"/.test(page));
ok('the subscription is read account first then phone, the /api/billing/status order',
  /getSubscriptionByUser/.test(page) && /getPhoneForUser/.test(page) && /getSubscriptionByPhone/.test(page));
ok('the button is drawn from the same resolver the route uses, so it cannot promise a door that 404s',
  /getStripeCustomerForAccount\(/.test(page));
ok('the page never blocks on the gate, it only chooses sentences with it',
  /gateForUser/.test(page) && !/redirect\([^)]*locked/.test(page));
ok('prices on the add card buttons come from PRICE_PENCE, the one place amounts live',
  /PRICE_PENCE/.test(page));

// ── 6. THE RAIL AND THE OLD DOOR ──────────────────────────────────────────────────────────────
const nav = read('app/app/AppNav.tsx');
ok('🔴 the rail\'s Billing row now opens the web billing page', /href: '\/app\/you\/billing', label: 'Billing'/.test(nav));
ok('🔴 nothing in the rail points at /account any more', !/href: '\/account'/.test(nav));
ok('but /account itself still exists for the phone era customers', existsSync(path.join(repo, 'app/account/page.tsx')));

const youPage = read('app/app/you/page.tsx');
ok('the You page\'s Billing door leads to the billing page too', /href="\/app\/you\/billing"/.test(youPage));
ok('and no door on the You page leads to /account', !/href="\/account"/.test(youPage));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
