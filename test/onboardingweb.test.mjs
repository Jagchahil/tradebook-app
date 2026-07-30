// SETTING UP ON THE WEB, AND THE SIX WAYS IT GOES WRONG WITHOUT ANYTHING GOING RED.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// On 29 July the whole customer journey was walked live and a green test run was sitting on top of an
// account takeover in production. So these are written against the failures that would ship quietly:
//
//   1. A SECOND COPY OF HIS ANSWERS. The obvious wizard accumulates answers and flushes them at the
//      end. This codebase has been caught three times by two readers over one number, and the copy
//      that drifts is the one he believes. There is no answers column, and nothing may write one.
//
//   2. TWO PROMISES ABOUT HOW LONG IT TAKES. /start said "About a minute" for a journey that is ten
//      to fifteen. One literal, in one module, or the front door starts lying again the day somebody
//      edits one of two strings.
//
//   3. A SKIP THAT RECORDS A SKIP. "He would not say" filed as an answer is never asked again, and
//      £252 a year is gone while we are certain we asked. There must be no skip that writes.
//
//   4. A QUESTION ASKED TWICE, OR NEVER. The household screen and the reliefs screen partition one
//      list. If they overlap he is asked twice, which teaches him we are not listening. If they leave
//      a gap, a question is never asked by anything, and nobody finds out.
//
//   5. A HEALTH QUESTION ON A SETUP SCREEN. lib/circumstances.ts refuses to hand out a special
//      category question, and both new selectors have to inherit that refusal rather than reopen it.
//
//   6. THE BROWSER CHOOSING THE DESTINATION. A post that carries where to go could stamp a completed
//      setup on an account that was never asked a question, and completed_at is what suppresses the
//      resume line on /app for ever. There would then be no screen left anywhere to tell him.
//
// These read source, because most of the above is a sentence or a field name rather than a crash.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const O = await import(pathToFileURL(path.join(root, 'lib/onboarding.ts')).href);
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const {
  STEPS, FIRST_STEP, LAST_STEP, isStep, toStep, nextStep, prevStep, isDone, stepIndex,
  walkedSteps, stepNumber, stepCount, progressPct, stepTitle, HOW_LONG,
} = O;
const { CIRCUMSTANCES, household, notHousehold, unanswered, progressIn } = C;

const onbSrc = read('lib/onboarding.ts');
const pageSrc = read('app/app/setup/page.tsx');
const routeSrc = read('app/api/onboarding/route.ts');
const dbSrc = read('lib/supabase.ts');
const startSrc = read('app/start/page.tsx');
const appSrc = read('app/app/page.tsx');
const verifySrc = read('app/api/signup/verify/route.ts');
const circRouteSrc = read('app/api/circumstances/route.ts');
const bizRouteSrc = read('app/api/business/route.ts');
const bankConnectSrc = read('app/api/bank/connect/route.ts');
const bankCallbackSrc = read('app/api/bank/callback/route.ts');
const checkoutSrc = read('app/api/billing/checkout/route.ts');
const stripeSrc = read('lib/stripe.ts');
const webhookSrc = read('app/api/stripe/webhook/route.ts');
const rowFromSrc = read('lib/stripewebhook.ts');
const migrationSrc = read('supabase/APPLY_2026-07-29_onboarding_and_walink.sql');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments are stripped before looking for a string a CUSTOMER sees. Every one of these files
// explains at length why the thing it does not do would be wrong, and a check that cannot tell an
// argument against a sentence from the sentence is a check that gets deleted rather than fixed.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

console.log('\nsetting up on the web: resumable, and holding nothing');

// ---------------------------------------------------------------------------------------------
// 🔴 1. NO SECOND COPY OF THE TRUTH. There is nowhere for an answer to be parked.
// ---------------------------------------------------------------------------------------------
ok('the migration created onboarding_progress with no answers column',
  /create table if not exists public\.onboarding_progress/.test(migrationSrc)
  && !/\banswers\b/.test(migrationSrc.split('onboarding_progress')[1]?.split('create table')[0] ?? ''));

// The three functions that touch the table, and the complete set of keys they are allowed to write.
// Anything else appearing in one of their bodies is an answer being parked, which is the whole thing
// the missing column exists to prevent.
const ALLOWED_COLUMNS = ['user_id', 'step', 'completed_at', 'updated_at'];
const progressWrites = [...dbSrc.matchAll(/onboarding_progress[\s\S]{0,900}?JSON\.stringify\(\{([^}]*)\}\)/g)]
  .map((m) => m[1]);
ok('the progress helpers were actually found (not vacuous)', progressWrites.length === 2);
const strayColumn = progressWrites.flatMap((body) => [...body.matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1]))
  .filter((k) => !ALLOWED_COLUMNS.includes(k));
ok(`🔴 nothing but the step is ever written to onboarding_progress${strayColumn.length ? `\n     stray: ${strayColumn.join(', ')}` : ''}`,
  strayColumn.length === 0);

// And the page holds nothing either: every answer is a form posted to the route that owns that fact.
ok('the setup page posts the business type to the route that owns it',
  /action="\/api\/business"/.test(pageSrc));
ok('the setup page posts a relief to the route that owns it',
  /action="\/api\/circumstances"/.test(pageSrc));
ok('the setup page posts the account use to the route that owns it',
  /action="\/api\/bank\/connect"/.test(pageSrc));
ok('the setup page posts only the step to the onboarding route',
  /action="\/api\/onboarding"/.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE PROMISE IS WRITTEN ONCE.
// ---------------------------------------------------------------------------------------------
ok('the promise is a real sentence about time', /\d+ to \d+ minutes/.test(HOW_LONG));
const literal = HOW_LONG;
const promiseFiles = ['lib/onboarding.ts', 'app/start/page.tsx', 'app/app/setup/page.tsx', 'app/app/page.tsx',
  'app/page.tsx', 'app/_shared/site.tsx', 'lib/ledger.ts', 'lib/circumstances.ts']
  .filter((f) => codeOnly(read(f)).includes(`'${literal}'`) || codeOnly(read(f)).includes(`"${literal}"`));
ok(`🔴 the ${literal} promise is a literal in exactly one module${promiseFiles.length ? `\n     ${promiseFiles.join('\n     ')}` : ''}`,
  promiseFiles.length === 1 && promiseFiles[0] === 'lib/onboarding.ts');
ok('/start reads the promise rather than spelling it out',
  /HOW_LONG/.test(startSrc) && /from '\.\.\/\.\.\/lib\/onboarding'/.test(startSrc));
ok('🔴 /start no longer promises about a minute', !/About a minute/i.test(codeOnly(startSrc)));

// ---------------------------------------------------------------------------------------------
// 🔴 3. NO SKIP THAT WRITES. Continue is the skip, and Continue writes no answer.
// ---------------------------------------------------------------------------------------------
ok('🔴 the setup page never posts an answer of skip', !/name="answer"\s+value="skip"/.test(pageSrc));
ok('🔴 and posts no answer but yes and no',
  [...pageSrc.matchAll(/name="answer"\s+value=\{?([^}\s/>]+)/g)]
    .map((m) => m[1].replace(/["']/g, ''))
    .every((v) => v === 'a' || v === 'yes' || v === 'no'));
// The queue is what makes leaving safe: an unanswered question is still unanswered, so it comes back.
// ⚠️ THE MONEY QUEUE, WHICH IS NOT EVERY QUESTION. It refuses the special category one as a matter
// of law and the compliance ones as a matter of what the queue is FOR. Both refusals are asserted
// in their own sections; this one only checks that nothing else was quietly dropped.
ok('an unanswered question stays in the queue',
  unanswered([]).length
    === CIRCUMSTANCES.filter((c) => !c.specialCategory && !c.mtd && !c.dependsOn).length);

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE TWO SCREENS PARTITION ONE LIST. No overlap, no gap.
// ---------------------------------------------------------------------------------------------
const hKeys = household().map((c) => c.key);
const nKeys = notHousehold().map((c) => c.key);
const askable = CIRCUMSTANCES.filter((c) => !c.specialCategory).map((c) => c.key);
// The two MONEY screens partition the money questions. The compliance ones are a third group with
// its own screen and are checked in their own section, so they are not expected here.
const moneyAskable = CIRCUMSTANCES.filter((c) => !c.specialCategory && !c.mtd).map((c) => c.key);
ok('both groups have questions in them', hKeys.length > 0 && nKeys.length > 0);
const overlap = hKeys.filter((k) => nKeys.includes(k));
ok(`🔴 no question is on both screens${overlap.length ? `\n     ${overlap.join(', ')}` : ''}`, overlap.length === 0);
const missed = moneyAskable.filter((k) => !hKeys.includes(k) && !nKeys.includes(k));
ok(`🔴 no money question falls between the two money screens${missed.length ? `\n     ${missed.join(', ')}` : ''}`,
  missed.length === 0);

// ---------------------------------------------------------------------------------------------
// 🔴 THE COUNT HE IS SHOWN. Found live on 30 July, and it is run here rather than grepped for.
//
// The household screen told a brand new customer "1 of 4 answered" before he had answered anything,
// because a question held back by an unmet premise was being counted as done. Then, once he answered
// his first, it still said "1 of 4", so it was right by coincidence, which is the harder failure to
// spot and the reason this is a fixture test and not a regex.
// ---------------------------------------------------------------------------------------------
const hGroup = household();
const fresh = progressIn(hGroup, []);
ok(`🔴 a man who has answered nothing is told he has answered nothing (got ${fresh.answered} of ${fresh.askable})`,
  fresh.answered === 0);
ok('and the denominator is only what is askable of him today, not the module total',
  fresh.askable === unanswered([]).filter((c) => hGroup.some((g) => g.key === c.key)).length
  && fresh.askable < hGroup.length);

// Answering the premise reveals the follow-up, so BOTH numbers move. This is the honest shape: he
// has answered one, and answering it earned him one more question worth asking.
const afterMarried = progressIn(hGroup, [{ key: 'married', answer: 'yes' }]);
ok(`🔴 answering one counts as one (got ${afterMarried.answered} of ${afterMarried.askable})`,
  afterMarried.answered === 1);
ok('🔴 and the denominator GROWS when an answer unlocks a follow-up',
  afterMarried.askable === fresh.askable + 1);

// Saying no to the premise must not unlock it, or a single man is asked what his wife earns.
const afterSingle = progressIn(hGroup, [{ key: 'married', answer: 'no' }]);
ok('a no on the premise counts, and unlocks nothing',
  afterSingle.answered === 1 && afterSingle.askable === fresh.askable);

// Answered questions from another group never leak into this one's count.
const other = progressIn(hGroup, [{ key: 'vat_registered', answer: 'yes' }]);
ok('an answer from the other screen does not count on this one',
  other.answered === 0 && other.askable === fresh.askable);

ok('🔴 the page does not work the count out for itself',
  /progressIn\(group, rows\)/.test(pageSrc) && !/!open\.has\(c\.key\)\)\.length/.test(pageSrc));

// The two Jag named on 28 July, and the reason this step exists at all: there was nowhere in this
// product for a man to say he was married, and nowhere to say who claims the Child Benefit.
ok('🔴 marriage is asked, and on the household screen', hKeys.includes('married'));
ok('🔴 child benefit is asked, and on the household screen', hKeys.includes('children'));
// It comes FIRST because by the money sort marriage sits ninth, and a man who answers four and
// leaves would never be asked. See lib/onboarding.ts.
ok('🔴 the household screen comes before the reliefs screen',
  stepIndex('household') < stepIndex('about'));

// The grouping may never re-order the money. worthOrder is a tax judgement; a screen is not.
const worthOrder = ['huge', 'large', 'real', 'small'];
const sortedWithin = (list) => list.every((c, i) => i === 0
  || worthOrder.indexOf(list[i - 1].worthOrder) <= worthOrder.indexOf(c.worthOrder));
ok('🔴 the household screen keeps the module ordering', sortedWithin(household()));
ok('🔴 the reliefs screen keeps the module ordering', sortedWithin(notHousehold()));

// ---------------------------------------------------------------------------------------------
// 🔴 5. NO HEALTH QUESTION ON A SETUP SCREEN. Inherited, never reopened.
// ---------------------------------------------------------------------------------------------
const special = CIRCUMSTANCES.filter((c) => c.specialCategory).map((c) => c.key);
ok('there is a special category question to be wrong about', special.length > 0);
ok('🔴 neither selector will hand out a special category question',
  special.every((k) => !hKeys.includes(k) && !nKeys.includes(k)));
ok('🔴 and the setup page names no question key of its own, so it cannot smuggle one in',
  !special.some((k) => pageSrc.includes(`'${k}'`)) && !/CIRCUMSTANCES/.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 6. THE SERVER DECIDES WHERE HE GOES NEXT.
// ---------------------------------------------------------------------------------------------
ok('the route asks lib/onboarding what comes next', /nextStep\(/.test(routeSrc));
ok('🔴 the step posted is validated before it is used', /isStep\(from\)/.test(routeSrc));
ok('🔴 the route reads no destination from the request',
  !/\b(get|body)\.?\(?['"]?(to|target|next|destination|redirect)['"]?\)?/.test(codeOnly(routeSrc)));
ok('the page posts which step he FINISHED, never where to go',
  /name="from" value=\{step\}/.test(pageSrc) && !/name="to"/.test(pageSrc));
ok('🔴 his recorded place only ever moves forward', /alreadyFurther/.test(routeSrc));
ok('🔴 an unreadable progress row does not rewind him',
  /progress === null/.test(routeSrc) && /progress === null/.test(pageSrc));
ok('finishing is stamped by the server, off the last step', /completeOnboarding\(/.test(routeSrc));

// A redirect target is a step name and never a URL, on all three routes that send him back, or an
// authenticated POST becomes an open redirect.
for (const [name, src] of [['circumstances', circRouteSrc], ['business', bizRouteSrc]]) {
  ok(`🔴 /api/${name} builds the return path itself from a validated step`,
    /isStep\(step\)/.test(src) && /\/app\/setup\?step=\$\{/.test(src));
}
ok('🔴 the setup page sends a step name back, never a path',
  /name="step" value="(business|household|about)"/.test(pageSrc) && !/name="(back|next|return)" value="\//.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// THE STEP ORDER ITSELF. Pure, and a test can run it.
// ---------------------------------------------------------------------------------------------
ok('lib/onboarding is pure, so this suite can load it',
  !/from '\.\/supabase'|from 'next|from 'react|require\(/.test(onbSrc));
ok('the walk starts at the welcome and ends at done',
  STEPS[0] === FIRST_STEP && STEPS[STEPS.length - 1] === LAST_STEP);
ok('done is a destination, not a screen', !walkedSteps().includes(LAST_STEP) && isDone(LAST_STEP));
ok('every step walks forward to the next one',
  walkedSteps().every((s, i) => nextStep(s) === STEPS[i + 1]));
ok('the end does not walk past itself', nextStep(LAST_STEP) === LAST_STEP);
ok('there is nothing behind the welcome', prevStep(FIRST_STEP) === null);
ok('back and forward round trip', walkedSteps().slice(1).every((s) => nextStep(prevStep(s)) === s));
ok('an unknown step is the beginning, never the end',
  toStep('a_step_from_a_later_build') === FIRST_STEP && toStep(undefined) === FIRST_STEP
  && !isStep('a_step_from_a_later_build'));
ok('the bar is never empty and never full before he finishes',
  walkedSteps().every((s) => progressPct(s) >= 8 && progressPct(s) < 100) && progressPct(LAST_STEP) === 100);
ok('the count he is shown never exceeds the number of screens',
  walkedSteps().every((s) => stepNumber(s) >= 1 && stepNumber(s) <= stepCount()));
ok('every step has a name he can be shown',
  STEPS.every((s) => typeof stepTitle(s) === 'string' && stepTitle(s).length > 2));

// ---------------------------------------------------------------------------------------------
// THE JOURNEY IT SITS IN.
// ---------------------------------------------------------------------------------------------
ok('🔴 proving the email lands him in setup, not on an empty dashboard',
  /redirect: '\/app\/setup'/.test(verifySrc));
ok('the money screen offers the way back into setup', /\/app\/setup\?step=\$\{resumeAt\}/.test(appSrc));
ok('🔴 and it never draws that line once he has finished',
  /!progress\.completedAt/.test(appSrc));
ok('🔴 he is never redirected into setup from his own money screen',
  !/redirect\('\/app\/setup/.test(appSrc));
ok('setup always offers the way out', /Do this later/.test(pageSrc) && /href="\/app"/.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// THE BANK STEP. Skippable, and returnable, because it hands him to somebody else's website.
// ---------------------------------------------------------------------------------------------
const pageUses = [...pageSrc.matchAll(/'(business|mixed|personal)'/g)].map((m) => m[1]);
const routeTakes = ['business', 'personal', 'mixed'].filter((v) => bankConnectSrc.includes(`=== '${v}'`));
ok('🔴 the account use values on screen are the three the route accepts',
  routeTakes.length === 3 && ['business', 'mixed', 'personal'].every((v) => pageUses.includes(v)));
ok('🔴 the cautious answer is the default, never the confident one',
  /defaultChecked=\{value === 'mixed'\}/.test(pageSrc));
ok('the bank step is skippable, and says so', /would rather do it later/.test(pageSrc));
ok('🔴 a web customer is brought back to his setup, not bounced at an app he has not got',
  /WEB_RETURN_URL = '\/app\/setup/.test(bankCallbackSrc) && /startedOnWeb/.test(bankCallbackSrc));
ok('🔴 and which surface he came from never decides whose connection it is',
  /session\.id === userId/.test(bankCallbackSrc) && /verifyState/.test(bankCallbackSrc));
ok('🔴 a failed connection still offers the way back into setup',
  (bankCallbackSrc.match(/surface,\n/g) ?? []).length >= 3);
ok('the web return needs no script to follow it',
  /back === 'app'/.test(bankCallbackSrc) && /<script>/.test(bankCallbackSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 THE REVEAL. The screen that can be empty, and the card that sits on it.
// ---------------------------------------------------------------------------------------------
ok('the reveal is the last step he walks, after the bank', 
  stepIndex('reveal') > stepIndex('bank') && nextStep('reveal') === 'done');
ok('the setup page has a screen for it', /step === 'reveal' \? <RevealStep/.test(pageSrc));

// 🔴 IT READS THE SAME LEDGER THE DASHBOARD DOES. Two readers over one number is the mistake this
// codebase has been caught by three times, and here it would be the screen he is asked to pay on
// disagreeing with the screen he opens tomorrow.
ok('🔴 the reveal reads ledgerFor, the same function /app and the quarter pack read',
  /ledgerFor\(/.test(pageSrc) && /ledgerFor\(/.test(appSrc));
ok('🔴 and it computes no money of its own',
  !/soleTraderTax|incomeTax\s*[+*]|\.reduce\(\(n, [a-z]\) => n \+/.test(codeOnly(pageSrc)));

// 🔴 THE EMPTY REVEAL HAS THREE HONEST ANSWERS AND NOT ONE OF THEM IS A ZERO.
ok('🔴 the reveal never prints a saving of zero as an achievement',
  !/£0 saved|saved you £0|You have saved £0/.test(pageSrc));
ok('the fallback names what his answers opened', /just opened up/.test(pageSrc));
ok('and the true empty case says so plainly rather than dressing it up',
  /We have nothing to look at yet/.test(pageSrc) && /Connect your bank and this page fills itself in/.test(pageSrc));

// ⚠️ AND THE FALLBACK NEVER SUMS THE RELIEFS. lib/circumstances.ts rule 4: worthOrder is an order of
// magnitude for SORTING and may never enter a total. A number we cannot stand behind, on the screen
// we ask for money on, is the worst place in the product to invent one.
// Comments stripped: the block above this in the page cites rule 4 by name in order to explain why
// it is obeyed, and a check that cannot tell the reasoning from the code would teach the next person
// to delete the reasoning.
ok('🔴 the reveal never totals what a relief might be worth',
  !/worthOrder/.test(codeOnly(pageSrc)) && !/opened\.reduce|\.reduce\([^)]*worth/.test(codeOnly(pageSrc)));
ok('and it says out loud that there is no figure, on purpose',
  /No figures on this page, on purpose/.test(pageSrc));

// The card is an ask, never a wall.
ok('🔴 the card can be walked past', /Not now\? Use the button below and carry on/.test(pageSrc));
ok('🔴 and setup is never gated on it: nothing checks a card before letting him finish',
  !/hasCardOnFile[\s\S]{0,200}redirect/.test(pageSrc));
ok('a man who already paid is thanked, not asked again', /Your card is already on file/.test(pageSrc));
ok('the card says plainly that today is free',
  /you are not charged today/.test(pageSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 THE SUBSCRIPTION MUST BIND TO THE ACCOUNT, OR A PAYING CUSTOMER IS NEVER FOUND.
//
// upsertSubscription keys on stripe_subscription_id. A web customer's no card trial row carries a
// user_id and NO stripe id, so adding a card inserts a SECOND row. Without a user_id on it,
// getSubscriptionByUser returns the old trial for ever: he pays, is still cut off on day eight, and
// every screen agrees he was not entitled.
// ---------------------------------------------------------------------------------------------
ok('🔴 checkout carries the account id to Stripe', /userId: user\?\.id/.test(checkoutSrc));
ok('🔴 on the session AND the subscription, so renewals keep it',
  /subscription_data\[metadata\]\[user_id\]/.test(stripeSrc) && /metadata\[user_id\]/.test(stripeSrc));
ok('🔴 the webhook reads it back on the checkout path', /metadata\.user_id/.test(webhookSrc));
ok('🔴 and on every later subscription event', /user_id: metadata\.user_id/.test(rowFromSrc));

// 🔴 AND THE ACCOUNT ID IS NEVER TAKEN FROM THE REQUEST BODY. This route is unauthenticated by
// design for the pre signup funnel, so a body that could name a user id would let anyone attach a
// card, or a cancelled one, to somebody else's books.
ok('🔴 the account comes from the session, never the body',
  /const user = await sessionUser\(req\)/.test(checkoutSrc)
  && !/body\.user_id|body\.userId/.test(checkoutSrc));
ok('and his proved email beats the one he typed',
  /identity\?\.email \|\| str\(body\.email/.test(checkoutSrc));
ok('🔴 the checkout return is a step name, never a URL',
  /isStep\(from\)/.test(checkoutSrc) && !/body\.successUrl|body\.returnTo/.test(checkoutSrc));
ok('a form caller never sees JSON from the billing route',
  /card=failed/.test(checkoutSrc) && /card=unavailable/.test(checkoutSrc));

// ---------------------------------------------------------------------------------------------
// AND IT SHIPS NO CLIENT SCRIPT, like every other screen in the web app.
// ---------------------------------------------------------------------------------------------
ok('🔴 the setup page is server rendered', !/'use client'/.test(pageSrc) && /export const runtime = 'nodejs'/.test(pageSrc));
ok('🔴 and carries no handler, no script tag and no state',
  !/onClick|onChange|onSubmit|<script|useState|dangerouslySetInnerHTML/.test(pageSrc));
ok('every decision on it is a form post', (pageSrc.match(/method="post"/g) ?? []).length >= 4);

// A failed read is never drawn as an empty result. "You have nothing to claim" and "we could not
// check" are different things to tell a man about his money.
ok('🔴 an unreadable answer list says so rather than showing a clean slate',
  /rows === null/.test(pageSrc) && /Nothing is lost/.test(pageSrc));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
