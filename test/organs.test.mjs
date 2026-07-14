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
// ✅ AND TONIGHT IT IS CLOSED. rakha_runs is written by app/api/cron/agent/route.ts, in a `finally`,
// EVERY run, pass or fail. All three organs can now answer "what would make you go red", and the
// console has no dark rings left. Which is what makes the next thing it says worth believing.
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

console.log('\norgans: Lekhio in the middle, and three organs that can all now say how they go red');

const NOW = new Date('2026-07-14T09:00:00Z');
const goodRun = {
  ran_at: '2026-07-14T05:15:00Z', checked: 62, agreed: 62, drifted: 0, blind: 0, ok: true,
};
const qa = { answered: 41, lastAnswerAt: '2026-07-14T08:00:00Z' };

const rakhaRun = { ran_at: '2026-07-14T05:20:00Z', considered: 12, signalled: 3, sent: 1, ok: true };
const healthy = body([goodRun], [], qa, 12, [rakhaRun], NOW);

const R = healthy.organs.find((o) => o.key === 'rakha');
const rakhaOf = (runs, subs = 12) => body([goodRun], [], qa, subs, runs, NOW).organs.find((o) => o.key === 'rakha');

// ---------------------------------------------------------------------------------------------
// 🔴 1. RAKHA HAS A HEARTBEAT AT LAST, AND IT TELLS FOUR THINGS APART THAT USED TO BE ONE THING.
//
// Every state below was, until tonight, the SAME state: zero rows in agent_signals. Which read as
// a quiet week. Which read as GREEN.
//
//   we could not READ the heartbeat  ->  dark. Not green, and not red. WE DO NOT KNOW.
//   it ran and looked at NOBODY      ->  RED. A run that looked at nobody is not a run.
//   there is nobody to look at yet   ->  alive. Not a fault. (doc 103: the empty test.)
//   it stopped, or it died           ->  RED.
// ---------------------------------------------------------------------------------------------

ok('🔴 RAKHA IS ALIVE, AND IT SAYS THE NUMBERS RATHER THAN AN ADJECTIVE',
  R.pulse === 'alive'
  && /looked at 12 accounts/.test(R.says)
  && /1 of them heard from it/.test(R.says));

// 🔴 FOUND ON THE FIRST LIVE RUN, THIRTY SECONDS AFTER IT SHIPPED, BY LOOKING AT THE PAGE.
//
// The ring said "Rakha looked at 2 PEOPLE" while the centre of the same reactor said "1 PERSON is
// trusting this with his tax". Two counts of the same population, disagreeing, six inches apart.
//
// NEITHER NUMBER WAS WRONG. listAgentUsersPage walks EVERY row in `users`, which is correct for a
// heartbeat (the question is "did the machinery run"), so it includes the App Review demo. The
// centre counts customers and excludes it.
//
// THE BUG WAS THE NOUN. On this console "people" means customers. A word that drifts becomes a
// number that drifts, and this is the third time today two readers of one population have disagreed
// on screen. The ring now says ACCOUNTS, and says that it means every record we hold.
ok('🔴 ...AND IT SAYS "ACCOUNTS", BECAUSE ON THIS CONSOLE "PEOPLE" MEANS CUSTOMERS',
  !/\bpeople\b/.test(R.says) && /every record we hold/.test(R.says));

ok('🔴 ...AND IT CAN FINALLY ANSWER "WHAT WOULD MAKE YOU GO RED", WHICH IS THE WHOLE TEST',
  // It was `null` this morning. An organ that cannot answer this question is an organ nobody is
  // watching, and Rakha is the one that ACTS ON THE USER'S BEHALF.
  typeof R.redWhen === 'string' && /looks at nobody/.test(R.redWhen));

ok('🔴 A RAKHA THAT RUNS AND CONSIDERS NOBODY IS RED, NOT GREEN. THE WHOLE POINT.',
  // The lobotomy case. It walked every user, thought about none of them, and reported success.
  // cronFinished said ok. /api/health stayed green. THIS is the ring that catches it.
  (() => {
    const dead = rakhaOf([{ ran_at: '2026-07-14T05:20:00Z', considered: 0, signalled: 0, sent: 0, ok: true }], 12);
    return dead.pulse === 'broken' && /looked at nobody/.test(dead.says) && /12 people/.test(dead.says);
  })());

ok('...but NOBODY TO LOOK AT is not a fault, and the console does not shout about it',
  // doc 103, the empty test. A row that cries wolf on an empty database teaches you to stop reading
  // the console, and then you miss the week it matters.
  (() => {
    const quiet = rakhaOf([], 0);
    return quiet.pulse === 'alive' && /Nobody to watch yet/.test(quiet.says);
  })());

ok('🔴 A RUN THAT DIED IS RED, because a run that threw still writes a row (the `finally`)',
  rakhaOf([{ ran_at: '2026-07-14T05:20:00Z', considered: 40, signalled: 0, sent: 0, ok: false }]).pulse === 'broken');

ok('🔴 A RAKHA THAT STOPPED IS RED. 36 hours of silence is not a quiet week.',
  rakhaOf([{ ran_at: '2026-07-10T05:20:00Z', considered: 12, signalled: 1, sent: 1, ok: true }]).pulse === 'broken');

ok('🔴 AND A HEARTBEAT WE COULD NOT READ IS DARK. NOT GREEN, AND NOT RED.',
  // null is "we could not ask". [] is "it has never run". THEY ARE DIFFERENT FACTS. A failed read is
  // not evidence of a failed organ, in either direction, and this is the distinction the entire
  // console was built to hold on to.
  (() => {
    const unknown = rakhaOf(null);
    return unknown.pulse === 'unwired' && unknown.redWhen === null
      && /not the same as Rakha being dead/.test(unknown.says)
      && /not the same as Rakha being fine/.test(unknown.says);
  })());

ok('...and a crashed run does NOT count as a heartbeat just because it is the newest row',
  // Same rule as the differ: the newest run is not evidence that anything was looked at. We take the
  // newest run WITH considered > 0. A crash-looping Rakha writes a fresh row every night.
  rakhaOf([
    { ran_at: '2026-07-14T05:20:00Z', considered: 0, signalled: 0, sent: 0, ok: false },
    { ran_at: '2026-07-13T05:20:00Z', considered: 12, signalled: 2, sent: 0, ok: true },
  ]).pulse === 'alive');

ok('🔴 THE CONSOLE IS NO LONGER HALF BLIND: every organ can say how it goes red',
  healthy.blind === false
  && healthy.organs.every((o) => typeof o.redWhen === 'string' && o.redWhen.length > 30));

ok('🔴 THE WHOLE BODY IS FLAGGED BLIND WHILE ANY ORGAN IS DARK',
  // Two green rings and one dark one, with no comment, reads as "mostly fine". It is not mostly
  // fine. It is two things we can see and one we cannot, and the one we cannot see is the one that
  // talks to users without being asked. This is now only reachable when a READ fails, which is the
  // only honest reason left to be dark.
  body([goodRun], [], qa, 12, null, NOW).blind === true);

// ---------------------------------------------------------------------------------------------
// 🔴 2. KHOJI CAN GO RED, AND EVERY WAY IT CAN HAS ACTUALLY HAPPENED.
// ---------------------------------------------------------------------------------------------

// ⚠️ [rakhaRun] BEFORE NOW. A POSITIONAL ARGUMENT I ADDED IN THE MIDDLE, AND THIS IS WHY IT BLEW UP.
//
// Adding `rakhaRuns` before `now` silently pushed a Date into the array slot in every existing call
// site. Two of them I fixed. This one I missed, and `runs.find is not a function` was the result.
//
// It is worth noting WHICH WAY IT FAILED, because it is the good way: it threw, loudly, at once. Had
// the parameter been optional and forgiving, `now` would have quietly defaulted to the real clock and
// every staleness assertion in this file would have gone on passing FOR THE WRONG REASON, right up
// until a night when it mattered. A test that passes for the wrong reason is worse than no test.
const K = (runs, items = []) => body(runs, items, qa, 12, [rakhaRun], NOW).organs.find((o) => o.key === 'khoji');

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

const P = (q) => body([goodRun], [], q, 12, [rakhaRun], NOW).organs.find((o) => o.key === 'puchio');

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
  /1 person is trusting this with his tax/.test(body([goodRun], [], qa, 1, [rakhaRun], NOW).centre.says));

ok('every organ says what it is FOR, in words you would use to a person',
  healthy.organs.every((o) => o.does.length > 30 && !/API|endpoint|service|module/i.test(o.does)));

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE HOLE IS BEING CLOSED, NOT JUST LABELLED.
// ---------------------------------------------------------------------------------------------

ok('there is a migration that gives Rakha a heartbeat',
  /create table if not exists public\.rakha_runs/.test(sqlSrc));

// 🔴 AND SOMETHING ACTUALLY WRITES TO IT NOW. A table nobody writes to is not a heartbeat, it is
// furniture, and it sat there as furniture for most of today while I told Jag it was "the fix".
const agentSrc = readFileSync(path.join(root, 'app/api/cron/agent/route.ts'), 'utf8');
const agentCode = agentSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok('🔴 THE AGENT CRON WRITES RAKHA\'S HEARTBEAT',
  /recordRakhaRun\(\{/.test(agentCode) && /considered:\s*users/.test(agentCode));

ok('🔴 ...AND IT WRITES IT IN A `finally`, SO A RUN THAT THREW STILL LEAVES A ROW',
  // A heartbeat written only on the happy path is not a heartbeat, it is a congratulation. A silent
  // absence and a loud failure look IDENTICAL from the database if only success ever writes, and
  // that is the disease that killed this brain for five days in July.
  /\}\s*finally\s*\{[\s\S]*recordRakhaRun/.test(agentCode));

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
