// THE RATCHET FOR TIER TWO ITEM H. A customer, or Jag reading a support message, must be able to
// read the actual day a trial ends off a screen. Run: node test/trialdate.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 FOUND 7 AUGUST 2026. Nowhere in the product showed the calendar date a trial ends, only a
// countdown ("with 6 days left"). An account called barber5 read trialing to 13 August though it
// was created 30 July, four days short of a plain 7 day grant, and nobody could settle from a
// screen whether that was a grant with an extension or a Stripe checkout that inherited an
// earlier deadline, because the one fact that would settle it was never printed anywhere.
//
// ⚠️ THE FIX READS THE SAME FIELD THE GATE ITSELF READS, row.current_period_end, resolved by
// app/app/you/billing/page.tsx exactly as /api/billing/status has always resolved it: the
// account first, then the phone, because most rows written before 29 July carry no user_id at
// all. A screen that computed its own date, from created_at or anywhere else, could disagree
// with the paywall, which lib/gateserver.ts and lib/entitlement.ts are the only law on. A screen
// that disagrees with the paywall is worse than no screen, so this suite pins the field name as
// well as the behaviour.
//
// ⚠️ NO NEW ROW, NO NEW BUTTON. The line that already told him "with 6 days left" now also says
// the date, on the one screen doc 103 already agrees he opens less than weekly:
// app/app/you/billing. See the return packet for what was rejected and why.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');

const W = await import(pathToFileURL(path.resolve(repo, 'app/app/you/billing/words.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const row = (over = {}) => ({
  status: null, plan: null, current_period_end: null, cancel_at_period_end: null, ...over,
});

console.log('\n1. THE EXACT barber5 CASE: A CALENDAR DATE, SETTLEABLE FROM THE SCREEN');
{
  // Created 30 July, reads trialing to 13 August: the exact shape the ticket named. Today is 7
  // August in this session, so six days remain, and the screen must ALSO print the day itself.
  const barber5 = row({ status: 'trialing', current_period_end: '2026-08-13T00:00:00Z' });
  const now = new Date('2026-08-07T09:00:00Z');
  const standing = W.standingFor(barber5, 'open', now);
  const text = standing.lines.join(' ');
  ok('🔴 the barber5 row now prints 13 August 2026 somewhere on the screen', /13 August 2026/.test(text));
  ok('and it still says how long is left, the question he actually asked', /6 days left/.test(text));
  ok('kind is trial', standing.kind === 'trial');
}

console.log('\n2. THE DATE IS THE ROW\'S OWN, NEVER GUESSED, FOR EVERY SHAPE A TRIAL ROW TAKES');
{
  const now = new Date('2026-07-31T12:00:00Z');
  const s = W.standingFor(row({ status: 'trialing', current_period_end: '2026-08-03T12:00:00Z' }), 'open', now);
  ok('three days left also carries its own date', /with 3 days left/.test(s.lines.join(' ')) && /3 August 2026/.test(s.lines.join(' ')));
}
{
  const now = new Date('2026-07-31T12:00:00Z');
  const s = W.standingFor(row({ status: 'trialing', current_period_end: '2026-08-01T00:00:00Z' }), 'open', now);
  ok('the last day still reads as "a day", and still carries its date',
    /with a day left/.test(s.lines.join(' ')) && /1 August 2026/.test(s.lines.join(' ')));
}
{
  // 🔴 HONESTY. No date on the row: the screen says it does not know, in words, rather than
  // staying silent about it or computing one from anything else. Zero digits, still, because a
  // guess with a number in it is exactly the failure mode this line exists to refuse.
  const now = new Date('2026-07-31T12:00:00Z');
  const s = W.standingFor(row({ status: 'trialing' }), 'open', now);
  const text = s.lines.join(' ');
  ok('🔴 a trial with no end date still invents no figure', !/\d/.test(text));
  ok('🔴 AND IT SAYS SO, RATHER THAN STAYING QUIET ABOUT IT', /cannot show/i.test(text));
}
{
  // An unparseable date on the row must be treated exactly like no date at all, never echoed and
  // never used as the seed of a guess.
  const now = new Date('2026-07-31T12:00:00Z');
  const s = W.standingFor(row({ status: 'trialing', current_period_end: 'not-a-real-date' }), 'open', now);
  const text = s.lines.join(' ');
  ok('an unreadable date on the row is treated as no date, not echoed', !/\d/.test(text) && /cannot show/i.test(text));
}

console.log('\n3. THE FIELD IS THE SAME ONE THE GATE READS, NAME FOR NAME, NOT A SEPARATE CALCULATION');
{
  const words = read('app/app/you/billing/words.ts');
  ok('🔴 THE TRIAL LINE IS BUILT FROM dateWords(row.current_period_end)',
    /dateWords\(row\.current_period_end\)/.test(words));
  ok('and daysLeft reads the identical field, so the two can never disagree with each other',
    /daysLeft\(row\.current_period_end, now\)/.test(words));
  // ⚠️ NEVER A SECOND CLOCK. created_at is not part of BillingRow's own shape, and this asserts
  // the words module never reaches for it either, so a future edit cannot quietly grow a second,
  // weaker source of the date that could disagree with the row the gate itself trusts.
  ok('🔴 THE WORDS MODULE NEVER COMPUTES A DATE FROM created_at OR ACCOUNT AGE',
    !/created_at|accountAge|noRowGrace/.test(words));

  const entitlement = read('lib/entitlement.ts');
  const gateServer = read('lib/gateserver.ts');
  ok("lib/entitlement.ts's own trial rule reads the identical field name",
    /sub\.current_period_end/.test(entitlement));
  ok('lib/gateserver.ts hands the identical field name to isEntitled',
    /current_period_end: read\.current_period_end/.test(gateServer));
}

console.log('\n4. THE ROW ITSELF IS READ ACCOUNT FIRST THEN PHONE, THE GATE\'S OWN ORDER');
{
  const page = read('app/app/you/billing/page.tsx');
  // 🔴 MUST MATCH readGateInputs (lib/supabase.ts): user_id first, phone only when that comes
  // back empty. Most subscription rows written before 29 July carry no user_id at all, so a page
  // that read phone first, or account only, would show "no subscription" for a paying legacy
  // customer, exactly the wrong side of the honesty test to get wrong on a page about money.
  ok('🔴 THE ROW IS RESOLVED BY ACCOUNT FIRST', /getSubscriptionByUser\(user\.id\)/.test(page));
  ok('🔴 AND FALLS BACK TO PHONE, NEVER THE OTHER ORDER',
    /if \(!row\) \{[\s\S]{0,160}getPhoneForUser[\s\S]{0,160}getSubscriptionByPhone/.test(page));
  ok('the gate itself is read from the same two keyed source, gateForUser', /gateForUser\(user\.id\)/.test(page));

  const supa = read('lib/supabase.ts');
  const gateInputs = supa.slice(supa.indexOf('export async function readGateInputs'), supa.indexOf('export async function getSubscriptionByUser'));
  ok('and readGateInputs, which gateForUser calls, does the identical account-then-phone match',
    /user_id=eq\./.test(gateInputs) && /getPhoneForUser\(userId\)/.test(gateInputs) && /phone=eq\./.test(gateInputs));
}

console.log('\n5. THIS LANE NEVER WRITES A SUBSCRIPTION ROW');
{
  const page = read('app/app/you/billing/page.tsx');
  const words = read('app/app/you/billing/words.ts');

  // 🔴 THE ONLY FOUR THINGS THIS PAGE MAY ASK lib/supabase.ts FOR, AND ALL FOUR ARE READS. Named
  // explicitly rather than pattern matched, so a new import of anything else, in particular
  // anything that grants, writes or updates a subscription, fails this line rather than sailing
  // through a regex built to catch a different shape of mistake.
  const READ_ONLY = ['getPhoneForUser', 'getStripeCustomerForAccount', 'getSubscriptionByPhone', 'getSubscriptionByUser'];
  const fromIdx = page.indexOf("from '../../../../lib/supabase'");
  const openIdx = fromIdx === -1 ? -1 : page.lastIndexOf('import {', fromIdx);
  const importBlock = openIdx === -1 ? '' : page.slice(openIdx + 'import {'.length, fromIdx);
  const namedImports = importBlock.replace(/\s/g, '').split(',').filter((s) => s && s !== '}');
  ok('the supabase import was actually found, so this check is not vacuous', namedImports.length > 0);
  ok('🔴 EVERY NAME IMPORTED FROM lib/supabase.ts IS ON THE READ ONLY LIST',
    namedImports.every((n) => READ_ONLY.includes(n)));
  ok('🔴 AND NONE OF THE READ ONLY NAMES WAS QUIETLY DROPPED EITHER',
    READ_ONLY.every((n) => namedImports.includes(n)));

  ok('🔴 THE PAGE NEVER POSTS OR WRITES TO SUPABASE ITSELF', !/rest\/v1\/subscriptions/.test(page));
  ok('the words module performs no I/O at all: no fetch, no import of lib/supabase',
    !/fetch\(/.test(words) && !/from ['"][^'"]*lib\/supabase['"]/.test(words));
}

console.log('\n6. THE NEW COPY OBEYS THE SAME WRITING RULES AS EVERYTHING ELSE');
{
  const now = new Date('2026-08-07T09:00:00Z');
  const samples = [
    W.standingFor(row({ status: 'trialing', current_period_end: '2026-08-13T00:00:00Z' }), 'open', now).lines,
    W.standingFor(row({ status: 'trialing', current_period_end: '2026-08-08T00:00:00Z' }), 'open', now).lines,
    W.standingFor(row({ status: 'trialing' }), 'open', now).lines,
  ].flat().join(' ');
  ok('no em dash or en dash in the new trial copy', !/[–—]/.test(samples));
  ok('no hyphen used as a standalone dash (space-hyphen-space)', !/ - /.test(samples));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
