// The reminder CLOCK. Not whether the job runs. Whether the promise is kept.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN ONE STORY.
//
// 13:23, Sunday 9 August 2026. A customer texts "remind me to price up Dave's job tomorrow at
// 8am". Lekhio works out the time correctly and says so: "I will remind you on Mon 10 Aug, 08:00."
//
// The text arrived at 12:43 on Monday. Four hours and forty three minutes late, first and only
// delivery. The cause is written out in app/api/cron/reminders/route.ts: the job ran on the hour,
// exactly as scheduled, and sent nothing because the WhatsApp template gate was shut. Nothing was
// claimed, so the row stayed due and went out on the first run after the gate opened. That part is
// correct behaviour and it is why the morning was recoverable.
//
// What was not correct is that FOR FOUR AND THREE QUARTER HOURS EVERY SIGNAL WE HAD WAS GREEN.
// /api/health said ok. cron_runs said the job finished and finished well. The log line was the
// same line it prints on a quiet morning when nothing happened to be due. The man waiting for his
// text was the only instrument that could see the fault, and he is not on our pager.
//
// The house disease, again: a signal that cannot tell "no" from "nothing".
//
// So these tests hold three things:
//   1. THE QUERY cannot start skipping rows that are already late.
//   2. THE ALARM goes red when a dispatch pass comes and goes without sending, and stays quiet
//      inside the wait that the schedule honestly explains.
//   3. THE WIRING is real, so the alarm reaches the endpoint UptimeRobot actually polls.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  reminderAlarm,
  remindersServing,
  blockingAlarms,
  REMINDER_DISPATCH_INTERVAL_MINUTES,
  REMINDER_MAX_LATE_MINUTES,
} from '../lib/cronwatch.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf(a) < indexOf(b) is true when a is missing
// entirely, because indexOf returns -1. Two security guards shipped vacuous on exactly that on 10
// August. This helper is the lesson, and every ordering claim below goes through it.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

const NOW = new Date('2026-08-10T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();
const backlog = (overdue, oldestMinutesAgo) => ({
  overdue,
  oldestDue: oldestMinutesAgo === null ? null : minutesAgo(oldestMinutesAgo),
});

console.log('\n--- 1. THE QUERY. A row that is already late must never be skipped ---\n');
{
  const src = read('lib/supabase.ts');
  const q = /export async function getDueReminders[\s\S]{0,700}?\n}/.exec(src)?.[0] ?? '';

  ok('getDueReminders exists and was read', q.length > 0);

  // lte, not lt. A reminder due at exactly T must go out on the pass at T, not the one after it.
  ok('🔴 the due filter is remind_at LESS THAN OR EQUAL to now, so due-at-T goes on the first pass at or after T',
    q.includes('remind_at=lte.'));
  ok('and it is not `lt`, which would strand a reminder due on the exact tick',
    !/remind_at=lt\.[^e]/.test(q));

  // ⚠️ NO LOWER BOUND. A "since the last run" window is the obvious optimisation and it is the one
  // that would have made 10 August unrecoverable: the moment a pass is missed or a send is blocked,
  // every row older than the window is invisible for ever. The set shrinks by CLAIMING, never by
  // narrowing the question.
  ok('🔴 there is NO lower bound on remind_at, so a reminder the last pass failed to send is still found',
    !/remind_at=gte?\./.test(q));

  ok('only unsent rows are considered', q.includes('reminded=eq.false'));
  ok('oldest first, so the man waiting longest is served first', q.includes('order=remind_at.asc'));

  // The backlog reader has to ask the SAME question, or it is a second opinion rather than a check.
  const b = /export async function getReminderBacklog[\s\S]{0,1200}?\n}/.exec(src)?.[0] ?? '';
  ok('getReminderBacklog exists', b.length > 0);
  for (const clause of ['reminded=eq.false', 'remind_at=lte.', 'order=remind_at.asc']) {
    ok(`the backlog reader uses the same clause as the due query: ${clause}`, b.includes(clause));
  }
  ok('🔴 and it returns null on a failed read rather than an empty backlog',
    before(b, 'if (!res.ok) return null', 'overdue:'));
}

console.log('\n--- 2. THE CLAIM. Nothing is burned on a send that cannot land ---\n');
{
  const src = read('app/api/cron/reminders/route.ts');
  const due = /if \(job === 'due'\)[\s\S]*?\} else if \(job === 'nudge'/.exec(src)?.[0] ?? '';
  ok('the due branch exists and was read', due.length > 0);

  ok('🔴 the row is CLAIMED before the send, so two overlapping passes cannot double text him',
    before(due, 'claimDueReminder', 'sendTemplate'));

  // The gate is asked ONCE, outside the loop, and when it is shut the loop never runs, so nothing
  // is claimed. That is what left 10 August recoverable, and it must stay that way.
  ok('🔴 the send gate is read before the loop and nothing is claimed while it is shut',
    before(due, 'templateLegBlock', 'claimDueReminder') && /for \(; !dueBlock; \)/.test(due));

  ok('a blocked run says WHY, rather than printing the same line as a quiet morning',
    due.includes('blocked:') && due.includes('sending blocked:'));
}

console.log('\n--- 3. THE ALARM. Red at a missed tick, quiet inside the honest wait ---\n');
{
  ok(`the dispatch interval is ${REMINDER_DISPATCH_INTERVAL_MINUTES} minutes`,
    REMINDER_DISPATCH_INTERVAL_MINUTES === 5);
  ok('🔴 the ceiling is THREE dispatch intervals: one is the honest wait, two more is a stoppage with room for drift',
    REMINDER_MAX_LATE_MINUTES === REMINDER_DISPATCH_INTERVAL_MINUTES * 3);

  ok('nothing due is not an alarm', reminderAlarm(backlog(0, null), NOW) === null);

  // Inside the first tick. A reminder due at 08:01 is not late at 08:03; the tick at 08:05 has it.
  ok('a reminder 3 minutes past due is waiting, not late', reminderAlarm(backlog(1, 3), NOW) === null);
  ok('a reminder exactly one interval late is not yet an alarm, that is the honest wait',
    reminderAlarm(backlog(1, 5), NOW) === null);
  ok('nor at 14 minutes, which is drift on top of a full wait',
    reminderAlarm(backlog(1, 14), NOW) === null);

  // 🔴 THE ONE THAT MATTERS. Ticks have come and gone.
  const missed = reminderAlarm(backlog(1, 16), NOW);
  ok('🔴 A MISSED TICK IS RED. 16 minutes past due raises the alarm', missed !== null);
  ok('and it is reported as overdue', missed?.reason === 'overdue');
  ok('and it names the job the pager will look for', missed?.job === 'due');
  ok('and it says how late, so nobody has to work it out at two in the morning', missed?.hoursQuiet === 0.3);
  ok('in minutes, which is the unit this cadence is actually measured in',
    missed?.detail?.includes('16 minutes') === true);

  // The 10 August case itself, as the regression fixture.
  const tenAugust = reminderAlarm(backlog(1, 4 * 60 + 43), NOW);
  ok('🔴 THE 10 AUGUST REMINDER, 4h43m late, WOULD HAVE BEEN RED THE WHOLE TIME',
    tenAugust !== null && tenAugust.reason === 'overdue' && tenAugust.hoursQuiet === 4.7);
  ok('and remindersServing() says no while it sits there',
    remindersServing(backlog(1, 4 * 60 + 43), NOW) === false);

  ok('the count reaches the detail, so a backlog of one reads differently from a backlog of two hundred',
    reminderAlarm(backlog(200, 180), NOW)?.detail?.includes('200 reminders') === true);
  ok('and one reminder is not called "1 reminders"',
    reminderAlarm(backlog(1, 180), NOW)?.detail?.includes('1 reminder due') === true);

  // 🔴 THE OLD CEILING WOULD NOW BE SILENT FOR TWO HOURS. Pinned so the regression is named.
  ok('🔴 A REMINDER AN HOUR LATE IS RED, which the hourly era tolerated in silence',
    reminderAlarm(backlog(1, 60), NOW)?.reason === 'overdue');

  // 🔴 THE HOUSE DISEASE. A read that did not happen is not an empty backlog.
  ok('🔴 A BACKLOG WE CANNOT READ IS NOT A HEALTHY ONE', reminderAlarm(null, NOW) !== null);
  ok('and it is reported as unreadable rather than overdue', reminderAlarm(null, NOW)?.reason === 'unreadable');
  ok('and remindersServing(null) is false', remindersServing(null, NOW) === false);

  // An unparseable due time is a third kind of nothing, and it is not a pass either.
  ok('an unreadable due time is not silence', reminderAlarm({ overdue: 1, oldestDue: 'not a date' }, NOW) !== null);

  // Both new reasons are OUTAGES, so blockingAlarms must carry them through to the 503.
  const both = [reminderAlarm(backlog(1, 300), NOW), reminderAlarm(null, NOW)].filter(Boolean);
  ok('🔴 neither new reason is filtered out of blockingAlarms, so both can reach a 503',
    blockingAlarms(both).length === 2);
}

console.log('\n--- 4. THE WIRING. An alarm nobody reads is a diary, not a watchdog ---\n');
{
  const health = read('app/api/health/route.ts');

  ok('/api/health imports the backlog reader', health.includes('getReminderBacklog'));
  ok('/api/health imports the policy', health.includes('remindersServing') && health.includes('reminderAlarm'));

  ok('🔴 the public health verdict actually depends on it',
    /const healthy = [^;]*\bremindersOk\b/.test(health));
  ok('🔴 and the operator verdict does too',
    /const ok = [\s\S]{0,220}?lateReminders === null/.test(health));

  ok('the backlog is read before the verdict is formed',
    before(health, 'const backlog = await getReminderBacklog()', 'const healthy ='));

  ok('the public body reports it in one word', /reminders: backlog === null \? 'unknown'/.test(health));
  ok('🔴 and never the count, which is our business and not a stranger\'s',
    !/reminders: \{ overdue: backlog\.overdue[\s\S]{0,400}status: healthy/.test(health));

  // The ceiling has to be derived from the schedule somebody else controls, or it goes stale the
  // first time the dispatch is slowed down and starts crying wolf on a cadence nobody chose.
  const vercel = JSON.parse(read('vercel.json'));
  const tick = (vercel.crons ?? []).find((c) => /slot=tick/.test(c.path));
  ok('vercel.json still has a fast dispatch slot', Boolean(tick));
  // 🔴 DERIVED, NOT TYPED. The schedule is read out of vercel.json and turned into minutes, so
  // changing the cron without moving the constant fails here rather than going quietly wrong.
  const every = /^\*\/(\d+) \* \* \* \*$/.exec(tick?.schedule?.replace(/\s+/g, ' ').trim() ?? '');
  ok('the fast slot runs every N minutes', every !== null);
  ok(`🔴 AND N MATCHES REMINDER_DISPATCH_INTERVAL_MINUTES = ${REMINDER_DISPATCH_INTERVAL_MINUTES}`,
    Number(every?.[1]) === REMINDER_DISPATCH_INTERVAL_MINUTES);

  const daily = read('app/api/cron/daily/route.ts');
  ok('🔴 and the tick slot still dispatches the due job, which is the link the ceiling assumes',
    /slot === 'tick'[^\n]*reminders\?job=due/.test(daily));

  // The job heartbeat has to follow the schedule down too, or it tolerates 48 missed ticks.
  const quiet = /due: (\d+),/.exec(read('lib/cronwatch.ts'));
  ok('🔴 THE due CEILING FOLLOWED THE SCHEDULE DOWN', Number(quiet?.[1]) === 1);
}

console.log('\n--- 5. The operator question gets an operator answer, or none ---\n');
{
  const health = read('app/api/health/route.ts');

  // 🔴 A WRONG BEARER USED TO GET THE PUBLIC BODY AND A 200. Found 11 August by walking it: a
  // quoted value in .env.local meant the header carried the quotes, the bearer did not match, and
  // the reply looked like a clean bill of health for a question that had never been asked. Nothing
  // leaked. What was missing was any way to tell "my secret is wrong" from "nothing to report",
  // which is the house disease on the one endpoint whose whole job is to not have it.
  ok('🔴 A CONFIG REQUEST WITHOUT A VALID BEARER IS A 401, NOT SOMEBODY ELSE\'S ANSWER',
    /if \(req\.nextUrl\.searchParams\.get\('config'\) && !authorised\(req\)\) \{[\s\S]{0,160}?status: 401/.test(health));
  ok('and the refusal comes before any work is done', before(health, "status: 401", 'const runs = await listCronRuns()'));
  ok('🔴 AND IT CARRIES NOTHING BACK: no hint about whether the secret is set or how long it is',
    /\{ error: 'unauthorised' \}/.test(health)
    && !/status: 401[\s\S]{0,200}(CRON_SECRET|length|expected)/.test(health));

  // The public door is unchanged and must stay open: UptimeRobot polls it with no bearer at all.
  ok('the public health check still needs no authorisation', !/^\s*if \(!authorised\(req\)\) return/m.test(health));
  ok('and still answers with the one word summaries', /crons: runs === null \? 'unknown'/.test(health));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
