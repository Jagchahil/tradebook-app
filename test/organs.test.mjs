// 🔴 THE FOUR ORGANS. AND THE ONE THAT HAS NO PULSE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AN ORGAN WE CANNOT MEASURE IS DRAWN DARK. IT IS NEVER DRAWN GREEN.
//
// The temptation with a console like this is four glowing rings, pulsing, growing, and the whole
// thing looks alive. But a ring that glows whether or not the organ behind it is working is not a
// status light, it is a screensaver, and the day one of them dies the console goes on glowing
// exactly as before.
//
// So every organ must answer one question honestly: WHAT WOULD MAKE YOU GO RED? An organ that cannot
// answer it does not get a colour. It gets a hole, and the hole is labelled.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// AND BUILDING IT FOUND THE HOLE.
//
//   KHOJI  reads the world.   khoji_runs, three kinds, every night.  RICH.
//   PUCHIO answers him.       qa_cache, conversations.               REAL.
//   RAKHA  acts for him.      ...nothing. Nothing at all.
//
// ⚠️ CORRECTED 14 JULY. This header used to end "IF IT STOPPED, NOTHING WOULD GO RED", and that was
// FALSE. A stopped Rakha IS caught: cronStarted/cronFinished('agent'), MAX_QUIET_HOURS.agent = 26,
// and /api/health goes red. I wrote the dramatic version without checking.
//
// The real hole is narrower and nastier. Rakha writes ONLY when it FINDS something, so a Rakha that
// runs, considers NOBODY, and reports ok=true is indistinguishable in the database from a quiet week.
// Both are zero rows. That IS the disease that killed this brain for five days in July, and the fix
// is khoji_runs.checked: A RUN THAT CHECKED NOTHING IS NOT A RUN.
//
// AND THE SAME DISEASE PUT A SECOND HOLE IN THIS CONSOLE, WHICH IS ALSO TESTED BELOW.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
// organs.ts imports brain.ts by extensionless specifier (Next resolves it, bare node does not).
// Stage both with the extension patched in, exactly as the engine suites do.
const { mkdtempSync, writeFileSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const stage = mkdtempSync(path.join(tmpdir(), 'organs-'));
for (const f of ['brain', 'organs']) {
  writeFileSync(
    path.join(stage, f + '.ts'),
    readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8')
      .replace("from './brain'", "from './brain.ts'"),
  );
}
const O = await import(pathToFileURL(path.join(stage, 'organs.ts')).href);
const { body } = O;

const sqlSrc = readFileSync(path.join(root, 'supabase/APPLY_2026-07-14_rakha.sql'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\norgans: Lekhio in the middle, and the one that has no pulse');

const NOW = new Date('2026-07-14T09:00:00Z');
const goodRun = {
  ran_at: '2026-07-14T05:15:00Z', checked: 62, agreed: 62, drifted: 0, blind: 0, ok: true,
};
const qa = { answered: 41, lastAnswerAt: '2026-07-14T08:00:00Z' };

const healthy = body([goodRun], [], qa, 12, NOW);

// ---------------------------------------------------------------------------------------------
// 🔴 1. RAKHA IS DARK, AND THE CONSOLE SAYS WHY.
// ---------------------------------------------------------------------------------------------

const R = healthy.organs.find((o) => o.key === 'rakha');

ok('🔴 RAKHA IS UNWIRED. Not "alive". Not "we assume it is fine". UNWIRED.',
  // `alive` says: I checked, and it is working.
  // `unwired` says: I CANNOT CHECK. There is nothing to check.
  // Collapsing the two is how a console lies, and it is the lie that let this brain sit dead for
  // five days while launchd reported success every morning.
  R.pulse === 'unwired');

// 🔴 CORRECTED 14 JULY. THIS TEST USED TO ASSERT THAT RAKHA HAD "No heartbeat", AND THAT WAS FALSE.
//
// Rakha has a TRANSPORT heartbeat and always did: cronStarted('agent') / cronFinished('agent'), and
// MAX_QUIET_HOURS.agent = 26 in cronwatch.ts, so a STOPPED Rakha already turns /api/health red.
//
// The hole is narrower and nastier than the one I claimed. processUser() returns early and writes
// NOTHING when it finds no signals, and agent_signals is the only table Rakha touches. So a Rakha
// that runs, walks every user, considers NOBODY, and finishes ok=true is indistinguishable, in the
// database, from a genuinely quiet week. Both are zero rows. The cron says it finished. It did.
//
// So the sentence must claim the narrow thing, not the dramatic thing. An overstated finding is a
// finding that gets disproved and then ignored.
ok('...and it says the PRECISE thing: the walk finished, but we cannot show it looked at anybody',
  /We know the walk finished/.test(R.says)
  && /do not know that it looked at anybody/.test(R.says)
  && /indistinguishable from a quiet week/.test(R.says));

ok('🔴 ITS "WHAT WOULD MAKE THIS RING GO RED" IS STILL NULL, AND THAT IS STILL THE FINDING',
  // Not because nothing anywhere would go red (the cron watchdog would). Because the only signal
  // THIS RING could read is agent_signals, where zero rows means either "nobody needed telling" or
  // "the engine is dead", and we cannot tell which. An organ we cannot measure is drawn dark.
  R.redWhen === null);

ok('...while every organ that CAN go red says exactly how',
  healthy.organs
    .filter((o) => o.pulse !== 'unwired')
    .every((o) => typeof o.redWhen === 'string' && o.redWhen.length > 30));

ok('🔴 THE WHOLE BODY IS FLAGGED BLIND WHILE ANY ORGAN IS DARK',
  // Three green rings and one dark one, with no comment, reads as "mostly fine". It is not mostly
  // fine. It is three things we can see and one we cannot, and the one we cannot see is the one that
  // talks to users without being asked.
  healthy.blind === true);

// ---------------------------------------------------------------------------------------------
// 🔴 2. KHOJI CAN GO RED, AND EVERY WAY IT CAN HAS ACTUALLY HAPPENED.
// ---------------------------------------------------------------------------------------------

const K = (runs, items = []) => body(runs, items, qa, 12, NOW).organs.find((o) => o.key === 'khoji');

ok('a clean night is ALIVE, and it says the numbers, not an adjective',
  K([goodRun]).pulse === 'alive'
  && /62 of 62 tax constants matched GOV.UK/.test(K([goodRun]).says));

ok('🔴 DRIFT IS ATTENTION. A constant no longer matching GOV.UK is the whole reason Khoji exists.',
  K([{ ...goodRun, drifted: 1, agreed: 61 }]).pulse === 'attention');

ok('🔴 BLIND IS ATTENTION TOO. NOT KNOWING IS NOT THE SAME AS BEING FINE.',
  K([{ ...goodRun, blind: 3 }]).pulse === 'attention'
  && /Not knowing is not the same as being fine/.test(K([{ ...goodRun, blind: 3 }]).says));

ok('🔴 A CRASHED RUN THAT CHECKED NOTHING IS NOT A HEARTBEAT',
  // A differ crash-looping at 3am writes a fresh row every night. The newest row is therefore NOT
  // evidence that anything was checked. It is a heartbeat monitor wired to the fact that the patient
  // is still in the bed.
  K([{ ...goodRun, checked: 0, agreed: 0, ok: false }]).pulse === 'broken');

ok('...and a stale one is BROKEN, however cheerful the last row was',
  K([{ ...goodRun, ran_at: '2026-07-10T05:15:00Z' }]).pulse === 'broken');

ok('no runs at all is BROKEN, never "alive with nothing to report"',
  K([]).pulse === 'broken');

// ---------------------------------------------------------------------------------------------
// 🔴 3. PUCHIO. And the discipline of NOT crying wolf.
// ---------------------------------------------------------------------------------------------

const P = (q) => body([goodRun], [], q, 12, NOW).organs.find((o) => o.key === 'puchio');

ok('a quiet week is NOT a fault. It is a quiet week.',
  // A console that shouts about silence teaches you to ignore the console. cisGrossRate died of this.
  P({ answered: 0, lastAnswerAt: null }).pulse === 'alive'
  && /Nobody has asked anything yet/.test(P({ answered: 0, lastAnswerAt: null }).says));

ok('...and when it IS answering, it says how many and how recently',
  /41 questions answered/.test(P(qa).says) && /hours ago/.test(P(qa).says));

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE CENTRE IS A PERSON, NOT A PROCESS.
// ---------------------------------------------------------------------------------------------

ok('the middle of the reactor counts PEOPLE, and says what they are trusting us with',
  /12 people are trusting this with their tax/.test(healthy.centre.says));

ok('...and it gets the grammar right for one man, because one man is the whole point',
  /1 person is trusting this with his tax/.test(body([goodRun], [], qa, 1, NOW).centre.says));

ok('every organ says what it is FOR, in words you would use to a person',
  healthy.organs.every((o) => o.does.length > 30 && !/API|endpoint|service|module/i.test(o.does)));

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE HOLE IS BEING CLOSED, NOT JUST LABELLED.
// ---------------------------------------------------------------------------------------------

ok('there is a migration that gives Rakha a heartbeat',
  /create table if not exists public\.rakha_runs/.test(sqlSrc));

ok('🔴 ...with the load-bearing field: A RUN THAT LOOKED AT NOBODY IS NOT A RUN',
  // Same rule as khoji_runs.checked. It is the field that stops a crash-loop from holding the light
  // green for ever.
  /considered\s+integer not null/.test(sqlSrc)
  && /A RUN THAT LOOKED AT NOBODY IS NOT A RUN/i.test(sqlSrc));

ok('...and a row is written on FAILURE too, or a silent absence looks like a quiet success',
  /ok\s+boolean not null/.test(sqlSrc));

ok('🔴 ...AND IT CARRIES NO FINANCIAL DATA. The team console rule does not bend for a new table.',
  // Task 13: the team console is forbidden financial data. What we need to know Rakha is ALIVE is
  // that it ran, when, and how many it looked at. Nothing about the man, nothing about his money.
  /NO financial data, ever/i.test(sqlSrc)
  && !/amount|balance|income|profit|tax_due/i.test(sqlSrc.replace(/--.*$/gm, '')));

// ---------------------------------------------------------------------------------------------
// 🔴 6. THE HEADCOUNT THAT BLACKED OUT THE TAX ENGINE.
//
// LIVE, on lekhio.app/team, 14 July: "Tax knowledge: ok" in green, and six inches below it,
// "Could not read the brain. We could not reach the database." Both on screen at once.
//
// readBrain() asked for `users?select=id&subscription_status=in.(active,trialing)`. THERE IS NO SUCH
// COLUMN. Verified against production: information_schema returns 0. It lives on
// `subscriptions.status`, which is where every other count in supabase.ts has always read it.
//
// PostgREST 400d, the throw was caught by a bare `catch { return null }`, and FIVE QUERIES IN A
// Promise.all WENT DOWN WITH IT. So a HEADCOUNT silenced the one panel that says whether our tax
// numbers still match GOV.UK. And then the copy invented a cause, "could not reach the database",
// while the database was up and rendering the rest of the page around it.
//
// THREE ASSERTIONS, AND EACH ONE IS A RULE, NOT A LINE OF CODE.
// ---------------------------------------------------------------------------------------------

// ⚠️ COMMENTS STRIPPED FIRST. Eight tests today were broken by prose, and the prose that broke them
// was ALWAYS the comment explaining the very rule being tested. This file is now full of the words
// "users" and "subscription_status" in exactly that way.
const dbSrc = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

ok('🔴 THE SUBSCRIBER COUNT READS `subscriptions`, THE TABLE THAT EXISTS',
  /q\('subscriptions\?select=[^']*status=in\.\(active,trialing\)/.test(dbSrc));

ok('🔴 ...AND NOTHING ANYWHERE READS users.subscription_status, WHICH DOES NOT EXIST',
  // The whole outage, in one absent column. Verified against production, not assumed.
  !/subscription_status/.test(dbSrc));

ok('🔴 A HEADCOUNT MAY NOT BLACK OUT THE BRAIN: the garnish reads are allSettled, not all',
  // khoji_runs and knowledge_items stay in a Promise.all, because if we cannot read THOSE we truly
  // do not know whether the tax engine agrees with GOV.UK, and going dark is the honest answer.
  // qa_cache and the subscriber count are garnish. Garnish that fails is a missing number.
  /Promise\.allSettled\(\[/.test(dbSrc)
  && /degraded/.test(dbSrc));

const brainTsx = readFileSync(path.join(root, 'app/team/Brain.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

ok('🔴 AND THE ERROR NO LONGER GUESSES AT A CAUSE IT NEVER ESTABLISHED',
  // "We could not reach the database" was a diagnosis, not an observation, and it was false. The
  // sin of the entire week, sitting in one catch block: NOT KNOWING TURNED INTO A CONFIDENT CLAIM.
  !/could not reach the database/i.test(brainTsx));

// ---------------------------------------------------------------------------------------------
// 🔴 7. THE DEMO ACCOUNT WAS BEING COUNTED AS A MAN TRUSTING US WITH HIS TAX.
//
// LIVE on the console, 14 July, minutes after the fix above shipped:
//
//     CUSTOMERS  1                 (the box, which excludes internal accounts)
//     "2 people are trusting this with their tax."   (the reactor, which did not)
//
// An INTERNAL account is a subscription row with no Stripe id: the App Review demo, and any comp.
// It is `active`. So the query counted it as a person, and DOUBLED the only number that means
// anything this early, on the screen we would use to decide whether to keep going.
//
// ⚠️ THIS IS THE THIRD TIME. The warning about the SECOND time is a comment in supabase.ts, ~1,100
// lines above the query I wrote, and I read straight past it.
//
// TWO QUERIES OVER THE SAME PEOPLE WILL DRIFT, AND THE ONE THAT DRIFTS IS THE ONE THAT FLATTERS YOU.
// That is not luck. A number that comes in too LOW gets investigated by lunchtime.
// ---------------------------------------------------------------------------------------------

ok('🔴 THE SUBSCRIBER COUNT EXCLUDES INTERNAL ACCOUNTS. THE DEMO IS NOT A CUSTOMER.',
  // No Stripe id means no money means not a person trusting us with his tax. It means US.
  /subscriptions\?select=stripe_subscription_id[^']*'\s*\+\s*'&stripe_subscription_id=not\.is\.null/.test(dbSrc)
  || /stripe_subscription_id=not\.is\.null/.test(dbSrc));

ok('🔴 AND THE RAKHA RING NO LONGER CLAIMS "NOTHING WOULD MAKE THIS GO RED"',
  // It was false, it was on the live console an hour after I disproved it, and Jag saw it before I
  // did. A stopped Rakha IS caught by the cron watchdog. Overstate a finding and it gets disproved,
  // and the real finding gets thrown out with it.
  !/Nothing would make this go red/i.test(brainTsx)
  && /cron watchdog/i.test(brainTsx));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
