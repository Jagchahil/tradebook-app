// THE SCHEDULE AND THE DISPATCHER MUST AGREE, AND THE FAST SLOT MUST STAY ONE JOB.
//
//   node test/cronschedule.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE FAULT. 10 AUGUST 2026, FOUND WHILE FIXING A DIFFERENT ONE.
//
// A man said "remind me to price up Dave's job tomorrow at 8am". He got nothing, and the reason
// looked like a template gate, and it was. But underneath it was something worse and completely
// silent:
//
//     /api/cron/daily?slot=am   0 7 * * *   was the ONLY slot that dispatched job=due
//
// So THE REMINDER ENGINE COULD ONLY EVER DELIVER AT ABOUT 08:00. A reminder set for 3pm fell due
// at 3pm and was texted the FOLLOWING MORNING. Up to twenty four hours late, every single time, on
// the one feature whose entire promise is that he can stop carrying the thing himself.
//
// ⚠️ NOTHING WAS BROKEN. The cron fired on time. The job returned 200. cronwatch's ceiling was 26
// hours and was never breached. /api/health was green throughout. A ceiling that matches a
// schedule nobody has questioned will watch a broken feature for ever and report success.
//
// ⚠️ AND IT HID BEHIND THE GATE. His reminder happened to be set for 08:00, so the schedule looked
// innocent. Fixing only the gate would have left every 3pm reminder still arriving next morning,
// and it would have LOOKED fixed, which is the worse outcome.
//
// So this suite pins the three things that have to stay true together:
//
//   1. vercel.json actually schedules the fast slot, fast.
//   2. The dispatcher knows that slot, and dispatches `due` in it.
//   3. 🔴 THE FAST SLOT CARRIES EXACTLY ONE JOB. Everything else in that file is daily work, and
//      the cheapest way to turn a fast tick into a bill is to let a job drift into it because
//      it happened to be nearby. The agent walk did exactly that by living inside `due`.
//
// ⚠️ 11 AUGUST: HOURLY WAS STILL A PROMISE WE COULD NOT KEEP, so the slot is `tick`, every five
// minutes. The bot answers to the MINUTE ("I will remind you on Mon 10 Aug, 08:00") and an hourly
// tick makes an 08:01 reminder wait until 09:00. Fifty nine minutes on a sentence naming a minute
// is the fault above wearing a smaller number. Worst case is now five minutes, and point 3 matters
// twelve times more than it did: this slot is 288 dispatches a day.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const vercel = JSON.parse(read('vercel.json'));
const daily = codeOnly(read('app/api/cron/daily/route.ts'));
const reminders = codeOnly(read('app/api/cron/reminders/route.ts'));

// The dispatcher's job list for a slot, read out of jobsFor's source. Sliced to the slot's own
// branch: an assertion about one branch has to be scoped to that branch, or a path appearing
// anywhere in the function satisfies a claim about the hourly slot. That is the vacuous guard this
// codebase has now been bitten by six times.
function slotBranch(slot) {
  const i = daily.indexOf(`slot === '${slot}'`);
  if (i < 0) return '';
  const rest = daily.slice(i);
  const end = rest.indexOf("slot === '", 10);
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 900);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. The schedule says every five minutes.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const tick = vercel.crons.find((c) => c.path.includes('slot=tick'));
  ok('🔴 vercel.json SCHEDULES THE TICK SLOT', Boolean(tick));
  ok('🔴 AND IT IS ACTUALLY EVERY FIVE MINUTES, not another entry wearing the name',
    tick?.schedule === '*/5 * * * *');
  // The slot is named for what it does, not for how often it used to do it. It was `hourly` until
  // it stopped being hourly, and a slot whose name contradicts its schedule is the same class of
  // lie as a comment that contradicts its table.
  ok('🔴 AND NOTHING IS STILL CALLED hourly, because nothing is',
    !vercel.crons.some((c) => c.path.includes('slot=hourly')) && !daily.includes("slot === 'hourly'"));

  // The two daily dispatchers are untouched and must stay. The pm slot carries metrics, whose
  // history cannot be backfilled: a day it does not run is a day of revenue gone for ever.
  ok('the am slot is still there, daily', vercel.crons.some((c) => c.path.includes('slot=am') && c.schedule === '0 7 * * *'));
  ok('the pm slot is still there, daily', vercel.crons.some((c) => c.path.includes('slot=pm') && c.schedule === '0 23 * * *'));
  ok('every scheduled path is a dispatcher, so nothing bypasses the slot table',
    vercel.crons.every((c) => c.path.startsWith('/api/cron/daily?slot=')));

  // ⚠️ EVERY SLOT IN vercel.json MUST EXIST IN THE DISPATCHER. A cron entry pointing at a slot
  // jobsFor does not know returns an empty list and a cheerful 200: a scheduled job that runs
  // nothing, for ever, looking completely fine. That is the house disease with a cron entry on it.
  const scheduled = vercel.crons.map((c) => new URL(c.path, 'https://x').searchParams.get('slot'));
  ok('🔴 EVERY SCHEDULED SLOT IS ONE THE DISPATCHER KNOWS',
    scheduled.every((s) => daily.includes(`slot === '${s}'`)));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. The tick slot sends reminders, and does nothing else.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const tickBranch = slotBranch('tick');
  ok('the tick branch was found, so the assertions below are real', tickBranch.length > 20);
  ok('🔴 IT DISPATCHES THE DUE JOB', /\/api\/cron\/reminders\?job=due/.test(tickBranch));

  // 🔴 EXACTLY ONE. Counted rather than eyeballed, because "and nothing else" is the whole point:
  // an hourly tick is 24 runs a day, and the agent walk is an AI spend per user. A second job in
  // here arrives as a bill at the end of the month, not as an error anybody sees.
  const paths = tickBranch.match(/'\/api\/cron\/[^']+'/g) ?? [];
  ok(`🔴 AND EXACTLY ONE JOB RUNS ON THE TICK (found ${paths.length}: ${paths.join(', ')})`,
    paths.length === 1);

  const am = slotBranch('am');
  ok('the am branch was found', am.length > 20);
  ok('the am slot still runs due too, so a reminder is never waiting on the tick alone',
    /\/api\/cron\/reminders\?job=due/.test(am));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. The daily housekeeping left the hourly job.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // 🔴 THIS IS THE COST GUARD AND IT IS THE REASON THIS SUITE EXISTS AT ALL.
  //
  // pruneOldRows, the bank feed walk and the agent walk were kicked from inside `due` on hop 1,
  // under a comment saying housekeeping "rides along with the daily run". True while `due` ran
  // daily. The moment it went hourly that is 24 agent walks and 24 prunes a day.
  //
  // "hop === 1" was never a way of saying "once a day". It only behaved like one because of a
  // schedule written in a different file, and nothing connected the two.
  const iDue = reminders.indexOf("if (job === 'due')");
  const iNext = reminders.indexOf("} else if (job === 'nudge'");
  const dueBranch = iDue >= 0 && iNext > iDue ? reminders.slice(iDue, iNext) : '';
  ok('the due branch was found, so the assertions below are real', dueBranch.length > 400);

  ok('🔴 THE DUE JOB NO LONGER PRUNES: that is daily work on an hourly job',
    !/pruneOldRows/.test(dueBranch));
  ok('🔴 AND IT NO LONGER KICKS THE AGENT WALK, which is an AI spend per user',
    !/cron\/agent/.test(dueBranch));
  ok('🔴 AND IT NO LONGER KICKS THE BANK FEED WALK',
    !/'bankfeed'/.test(dueBranch));

  // Gone from the hourly job is only half of it. They still have to actually run.
  const am = slotBranch('am');
  ok('🔴 THE PRUNE RUNS DAILY, dispatched by the slot that is daily',
    /\/api\/cron\/reminders\?job=cleanup/.test(am));
  ok('🔴 THE AGENT WALK RUNS DAILY', /'\/api\/cron\/agent'/.test(am));
  ok('🔴 THE BANK FEED WALK RUNS DAILY', /\/api\/cron\/reminders\?job=bankfeed/.test(am));

  // bankfeed is dispatched unconditionally now, so its own dormancy guard is what keeps it quiet
  // without the keys. If that guard ever goes, an unconfigured deploy starts walking connections.
  ok('and the bank feed walk still refuses to run without its keys',
    /if \(!hasBankFeedConfig\(\)\) return;/.test(reminders));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. The watchdog ceiling matches the schedule it is watching.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // A 26 hour ceiling on a job that now runs 24 times a day would let the reminder engine stop for
  // most of a day in silence. The ceiling and the cron entry are in different files and nothing but
  // this assertion connects them.
  const watch = read('lib/cronwatch.ts');
  const m = watch.match(/\n\s*due: (\d+),/);
  ok('the due ceiling was found', Boolean(m));
  ok('🔴 THE due CEILING FOLLOWED THE SCHEDULE DOWN: 4h would now tolerate 48 missed ticks',
    Number(m?.[1]) <= 2);
  // ⚠️ AND NOT ONE HOUR. This file's header says a ceiling too tight cries wolf, an alarm that
  // cries wolf gets muted, and a muted alarm looks like cover. On 9 August an over eager alarm put
  // /api/health at 503 and paged Jag on launch eve over a job that was entirely healthy.
  ok('🔴 AND IT STILL TOLERATES DRIFT: an hour is twelve missed ticks, not one late dispatch',
    Number(m?.[1]) >= 1);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
