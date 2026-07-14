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
// Rakha's signals are computed on the way past a request and thrown away. There is no table. We
// cannot tell you whether it fired this week or died on Tuesday. IF IT STOPPED, NOTHING WOULD GO RED.
//
// That is the exact disease that killed this brain for five days in July. The differ has a heartbeat
// now. The amendment watcher has one. The Budget loop has one. THE ORGAN THAT ACTS ON THE USER'S
// BEHALF HAS NONE, and it is the one whose silence costs the most: nobody is waiting for it, so
// nobody notices it is gone.

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

ok('...and it says so in a sentence a human can act on, not a status code',
  /No heartbeat/.test(R.says)
  && /whether it fired this week or died on Tuesday/.test(R.says));

ok('🔴 ITS "WHAT WOULD MAKE YOU GO RED" IS NULL, WHICH IS THE HONEST ANSWER, AND IT IS THE PROBLEM',
  // Nothing would make it go red. That is not reassurance. That is the finding.
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

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
