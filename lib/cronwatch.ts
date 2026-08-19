// The cron watchdog. Pure policy, no I/O, so the node test runner can load it directly.
//
// THE FAILURE THIS EXISTS TO CATCH. Our crons walk users in pages and hop to themselves
// with a cursor. If a hop dies, the walk does not slow down and it does not error. It STOPS,
// at whatever user id it had reached, and every user past that point gets nothing, forever,
// while the endpoint keeps answering 200 OK.
//
// That is not hypothetical. The daily digest shipped that way this morning: it returned
// `{more: true, next: "<id>"}` and absolutely nothing was reading it, so it reached the
// first two hundred users by id and no one else, and reported success every single day.
// Nothing was broken. Something simply never happened. Nothing alerts on that.
//
// So each job writes down when it last FINISHED A WHOLE WALK, and this decides when that
// silence has gone on too long.

export interface CronRun {
  job: string;
  last_started: string | null;
  last_finished: string | null;
  last_ok: boolean | null;
  last_error: string | null;
}

// How long a job may be quiet before it is a problem.
//
// Since 16 July these jobs are no longer six separate cron entries. Vercel HOBBY permits only two
// crons, and running six on it silently stopped half of them (this file's whole reason to exist).
// So vercel.json holds DISPATCHERS (app/api/cron/daily) that kick the real jobs, and the ceilings
// below are the windows those jobs still run within. A ceiling too tight cries wolf, and an alarm
// that cries wolf gets muted, and a muted alarm is worse than no alarm because it looks like cover.
//
// ⚠️ THERE ARE THREE DISPATCH SLOTS, NOT TWO, AND THIS PARAGRAPH SAID TWO UNTIL 10 AUGUST 2026.
// Push 27 added the fast slot that morning and the prose was never carried across, so the file
// read "two DISPATCHERS" and "the two dispatch slots" directly above a list of three. The Hobby
// limit sentence above is kept because it is why the dispatcher shape exists at all, but it no
// longer constrains us: Vercel and Supabase both moved to Pro on 4 August, which is what made a
// third entry possible. A reader who takes the count from the prose rather than from vercel.json
// ends up asking whether Vercel really registered all three, which is a question this file should
// answer rather than raise.
//
// ⚠️ AND THE FAST SLOT WAS CALLED `hourly` UNTIL 11 AUGUST, WHEN IT STOPPED BEING HOURLY. It is
// `tick` now, every five minutes, and it is named for what it does rather than for how often it
// used to do it. A slot called hourly running every five minutes is the same class of lie as a
// paragraph saying two above a list of three.
//
// The three dispatch slots, and what each still triggers:
//
//   tick   */5 * * * *  -> due
//   am     0 7  * * *   -> due, cleanup, bankfeed, agent, trial, and (Mon/Wed/Fri) nudge
//   pm     0 23 * * *   -> metrics, digest, and (Sunday) weekly
//
//   due     kicked every 5 min         -> 1h   (twelve missed ticks; see below)
//   digest  kicked pm, daily            -> 26h
//   agent   kicked am, daily            -> 26h
//   nudge   kicked am, Mon/Wed/Fri      -> 80h  (the real gap is Fri to Mon, 72h)
//   weekly  kicked pm, Sunday           -> 180h (a week, 168h, plus room)
//   trial   kicked am, daily            -> 26h
//   metrics kicked pm, daily            -> 26h  (and it CANNOT be backfilled. See below.)
export const MAX_QUIET_HOURS: Record<string, number> = {
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 26h, THEN 4h, NOW 1h. THE CEILING HAS FOLLOWED THE SCHEDULE DOWN TWICE. 11 AUGUST 2026.
  //
  // `due` ran once a day in the am slot, so a 26 hour ceiling was correct AND it meant the engine
  // could stop for most of a day without a word. Worse, a job that only ever runs at 08:00 can
  // only ever deliver at 08:00: a reminder set for 3pm arrived the following morning, every time,
  // and the watchdog had nothing to say because the job was running exactly as scheduled. That is
  // the lesson this whole file exists for: A CEILING THAT MATCHES AN UNQUESTIONED SCHEDULE WILL
  // WATCH A BROKEN FEATURE FOR EVER AND REPORT SUCCESS.
  //
  // It went hourly on 10 August and the ceiling went to 4h. It ticks every five minutes now, so
  // 4h would tolerate FORTY EIGHT missed dispatches, which is that same mistake a third time.
  //
  // ⚠️ ONE HOUR, NOT TEN MINUTES, AND THAT NUMBER IS DELIBERATE. This file's own header says a
  // ceiling too tight cries wolf, and an alarm that cries wolf gets muted, and a muted alarm is
  // worse than no alarm because it looks like cover. On 9 August a too eager alarm put
  // /api/health at 503 and paged the founder on launch eve over a job that was perfectly healthy.
  // An hour tolerates twelve consecutive missed ticks, which is an unarguable stoppage rather than
  // scheduler drift, and it catches a dead reminder engine inside an hour instead of half a day.
  //
  // ⚠️ THIS IS THE JOB'S HEARTBEAT, NOT THE CUSTOMER'S PROMISE. Whether any actual reminder went
  // out is a different question and it is answered further down, by reminderAlarm.
  due: 1,
  digest: 26,
  // The agent walk. It has no cron entry of its own: the am dispatcher kicks it. It was the one
  // walk with no watchdog at all, so it could die mid-chain and every user past the cursor would
  // silently stop getting signals while /api/health stayed green.
  //
  // ⚠️ IT USED TO BE KICKED BY `due`, WHICH IS EXACTLY WHY IT MOVED. When `due` went hourly, a kick
  // living inside it would have become twenty four agent walks a day. It is daily work and it is
  // now dispatched by the slot that is actually daily.
  agent: 26,
  nudge: 80,
  weekly: 180,
  // The daily metrics snapshot. THE HISTORY CANNOT BE BACKFILLED.
  //
  // Every other cron in this list can be re-run and catch up. This one cannot. If it stops for a
  // week, that week of the company's revenue history is gone FOREVER, because the subscriptions
  // table only holds the CURRENT status of each row. A hole in a revenue chart is not a gap, it is
  // a fabrication waiting to happen: somebody will draw a straight line across it.
  metrics: 26,

  // The trial ending nudge (docs/39, lib/trialnudge.ts).
  //
  // A CRON THAT IS NOT IN THIS MAP IS A CRON NOBODY IS WATCHING. If this one stops, every man on a
  // free trial reaches day fifteen, finds himself locked out of his own books with no warning, and
  // blames us. It is the most expensive silence available to us: it takes the customer at the exact
  // moment he had decided we were worth paying for. Registering it here is what makes /api/health
  // go red instead of staying green while nothing happens.
  trial: 26,

  // The voice note reaper (app/api/cron/voicereap). Kicked in BOTH daily slots, so 26 hours is
  // already generous: it should be seen twice a day.
  //
  // 🔴 THIS ONE'S SILENCE BREAKS A WRITTEN PROMISE, NOT JUST A FEATURE. Every other job in this map
  // fails by not DOING something. This one fails by LEAVING SOMETHING BEHIND: a stale voice_jobs row
  // keeps its audio_base64 for ever, while the privacy policy says "the audio is deleted the moment
  // it has been read" and the data inventory says it is "wiped as soon as it is transcribed". Both
  // sentences quietly stop being true, and the customer is still waiting on a note we told him we
  // were writing up.
  //
  // It shipped on 9 August wired into both slots and registered in neither this map nor the cron
  // runs table, which is precisely the hole the heading above warns about, left by the same hand
  // that wrote the warning. Found in a walkthrough audit that evening, not by anything going wrong.
  voicereap: 26,

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT IS DELIBERATELY NOT IN THIS MAP, SO THE NEXT READER CAN TELL A DECISION FROM A HOLE.
  //
  // "A cron that is not in this map is a cron nobody is watching" cuts both ways: an absence has to
  // be readable as a choice, or every audit re-litigates it and one of them eventually guesses wrong.
  //
  //   nurture  (app/api/cron/nurture) SHIPS DARK. It returns immediately unless NURTURE_ENABLED is
  //            'true', and it is not. An alarm on a job that is deliberately switched off is a red
  //            /api/health that means nothing, and a health check people learn to ignore is worse
  //            than no health check. ⚠️ IT WRITES cronStarted/cronFinished ANYWAY, so the run
  //            history is there the day it is switched on, and turning it on is then one line here.
  //            Whoever flips NURTURE_ENABLED adds `nurture: 26` in the same commit.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
};

export interface CronAlarm {
  job: string;
  reason: 'never_run' | 'never_finished' | 'stale' | 'failed' | 'overdue' | 'unreadable';
  hoursQuiet: number | null;
  detail: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 NOT EVERY ALARM IS AN OUTAGE, AND CONFLATING THE TWO PAGED THE FOUNDER ON LAUNCH EVE.
//
// never_run was added to cronAlarms at 21:00 on 9 August. /api/health answers 503 on any alarm and
// UptimeRobot watches it, so within two minutes the site was reporting itself DOWN, on the evening
// before launch, because a cron added ninety minutes earlier had not reached its first dispatch
// slot yet (pm is 23:00 UTC). Nothing was wrong. Nobody was affected. The pager went off anyway.
//
// That is exactly the crying wolf this file's own header calls worse than no alarm at all, and it
// was committed by the person who wrote that header, in the commit that quoted it.
//
// THE DISTINCTION THAT WAS MISSING. The severity is not the same and never was:
//
//   stale / failed / never_finished  Something that WAS working has stopped, or is finishing
//                                    badly. Users are being missed right now. That is an outage
//                                    and a 503 is correct.
//   never_run                        A job is registered and has not been seen yet. It may be
//                                    mis-wired, or it may simply be new. It is worth SEEING and it
//                                    is not worth waking somebody for, because nothing that was
//                                    working has stopped.
//
// Visibility and severity are different questions, and push 23 answered the first one correctly by
// getting the second one wrong. So the alarm still exists, still names the job, and is split out
// here so that a caller can surface it without calling the site down.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function blockingAlarms(alarms: CronAlarm[]): CronAlarm[] {
  return alarms.filter((a) => a.reason !== 'never_run');
}

// 🔴 IS THE CRON SIDE SERVING? null IN, false OUT, ON PURPOSE. listCronRuns() returns null on any
// failed read, and /api/health used to answer that with an empty alarm list, so a history it could
// NOT READ scored as healthy: the house disease, a signal that cannot tell "no" from "nothing".
// This is the one place that decides it, so a null read is a false here and the route cannot get it
// wrong again. A never_run job is a question, not an outage, so it does not block the public view.
export function cronsServing(runs: CronRun[] | null, now: Date = new Date()): boolean {
  return runs !== null && blockingAlarms(cronAlarms(runs, now)).length === 0;
}

export function unseenAlarms(alarms: CronAlarm[]): CronAlarm[] {
  return alarms.filter((a) => a.reason === 'never_run');
}

// Which jobs should be shouting? Empty array means all is well.
export function cronAlarms(runs: CronRun[], now: Date = new Date()): CronAlarm[] {
  const out: CronAlarm[] = [];
  const byJob = new Map(runs.map((r) => [r.job, r]));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 IS THE SCHEDULER DEMONSTRABLY ALIVE? Everything below about never-run jobs turns on this.
  //
  // If NOTHING in this map has ever finished, this is a fresh environment rather than a broken
  // one, and firing an alarm for every job in the list helps nobody and teaches whoever sees it
  // that the alarms are noise. If something HAS finished, the dispatcher demonstrably works, and
  // a job in this map with no history at all is a wiring fault rather than a waiting one.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const schedulerAlive = runs.some((r) => r.last_finished);

  for (const [job, maxHours] of Object.entries(MAX_QUIET_HOURS)) {
    const run = byJob.get(job);

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 A JOB THAT HAS NEVER RUN WAS SKIPPED FOR EVER, AND THE SKIP WAS THE WHOLE HOLE.
    // Closed 9 August 2026, the same evening a job walked straight into it.
    //
    // The line here read `if (!run || (!run.last_finished && !run.last_started)) continue;` and
    // its comment said, in as many words: "a job that has never even started has never been
    // scheduled, and that is a different problem with a different fix." That fix was never
    // written. So the state this file exists to catch, A CRON THAT DOES NOTHING, was the one
    // state it structurally could not report, and /api/health stayed green through it.
    //
    // ⚠️ IT WAS NOT HYPOTHETICAL FOR LONG. voicereap was added to this map earlier the same
    // evening, with a note saying its failure mode is a customer's audio never being wiped and a
    // written privacy promise quietly going untrue. Registering it bought exactly nothing while
    // this line stood: if the wiring were wrong, it would never write a row, never be seen here,
    // and never be mentioned by anything. The registration LOOKED like coverage, which is worse
    // than no registration, because somebody had then ticked it off.
    //
    // ⚠️ THE FALSE ALARM IS BOUNDED AND THE MISS IS NOT, and that asymmetry decides it. Adding a
    // cron can now show one alarm until the next dispatch, at most half a day, and it clears
    // itself. The other way round, a cron that never runs is never mentioned by anything, for
    // ever. So this alarms, and the sentence says the benign case out loud so that whoever reads
    // it at two in the morning is not hunting a bug that is about to fix itself.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (!run || (!run.last_finished && !run.last_started)) {
      if (!schedulerAlive) continue;
      out.push({
        job,
        reason: 'never_run',
        hoursQuiet: null,
        detail: 'in the watch list and has never run once, while other jobs are running normally. '
          + 'If it was added within the last day this clears itself on the next dispatch. If it '
          + 'does not, it is not wired into app/api/cron/daily.',
      });
      continue;
    }

    if (!run.last_finished) {
      out.push({
        job,
        reason: 'never_finished',
        hoursQuiet: null,
        detail: 'started but has never reported finishing a full walk',
      });
      continue;
    }

    const quietMs = now.getTime() - new Date(run.last_finished).getTime();
    const quietHours = quietMs / 3_600_000;

    if (quietHours > maxHours) {
      out.push({
        job,
        reason: 'stale',
        hoursQuiet: Math.round(quietHours * 10) / 10,
        detail: `last finished ${Math.round(quietHours)}h ago, ceiling is ${maxHours}h`,
      });
      continue;
    }

    // It finished, and it finished recently, and it finished BADLY. A hop cap means users
    // past the cursor were never reached, which is exactly the silent gap we are hunting.
    if (run.last_ok === false) {
      out.push({
        job,
        reason: 'failed',
        hoursQuiet: Math.round(quietHours * 10) / 10,
        detail: run.last_error,
      });
    }
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE JOB CAN BE PERFECTLY HEALTHY WHILE THE PROMISE IS BROKEN. 11 AUGUST 2026.
//
// Everything above this line watches the JOB: did it run, did it finish, did it finish badly. On
// 10 August the `due` job ran on time, finished, reported ok, and delivered nothing, because the
// WhatsApp template gate was shut. A man who asked at 13:23 on Sunday for a reminder at 08:00 on
// Monday got it at 12:43, four hours and forty three minutes after the sentence we sent him. The
// engine was green the whole time. Nothing in this file could have said otherwise, because nothing
// in this file was watching the thing he was promised.
//
// The gate was a launch day one off and it is shut no longer. What was NOT a one off is that it
// could happen again with nobody the wiser, which is the house disease wearing a different coat:
// a signal that cannot tell "nothing was due" from "everything was due and none of it went".
//
// So this watches the PROMISE. Is there a reminder that fell due, is still unsent, and has been
// waiting longer than the dispatch can honestly explain. That question has one right answer and it
// does not care why: a shut gate, a dead hop, a missing template, a scheduler that stopped. All of
// them look identical to the man waiting for his text, so all of them look identical here.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// How often the reminder engine is dispatched. vercel.json runs the tick slot at `*/5 * * * *` and
// app/api/cron/daily sends that slot to /api/cron/reminders?job=due.
//
// ⚠️ test/reminderclock.test.mjs READS vercel.json AND HOLDS THIS NUMBER TO IT. Change the
// dispatch and the ceiling below has to move in the same commit, or the alarm starts crying wolf,
// or worse stays quiet, on a schedule somebody else chose. That is exactly how `due: 26` came to
// be correct and useless.
export const REMINDER_DISPATCH_INTERVAL_MINUTES = 5;

// How late a reminder may be before it is a fault rather than a wait.
//
// THE ARITHMETIC, BECAUSE A CEILING NOBODY CAN DERIVE IS A CEILING SOMEBODY WILL LOOSEN.
//
//   A reminder due at 08:01 is not late at 08:03. The next tick is at 08:05 and it will go then.
//   The longest HONEST wait is therefore one whole dispatch interval, five minutes, plus whatever
//   drift the scheduler adds. Vercel triggers a cron within about a minute of its schedule.
//   A reminder still sitting there after THREE intervals has watched ticks come and go without
//   being sent. That is a stoppage, and a stoppage is a fault.
//
// Fifteen minutes, not five. Five would fire on ordinary drift, and this file's own header says a
// ceiling too tight cries wolf, and an alarm that cries wolf gets muted, and a muted alarm is
// worse than no alarm because it looks like cover. On 9 August a too eager alarm put /api/health
// at 503 and paged the founder on launch eve over a job that was perfectly healthy.
export const REMINDER_MAX_LATE_MINUTES = REMINDER_DISPATCH_INTERVAL_MINUTES * 3;

export interface ReminderBacklog {
  /** How many reminders have fallen due and are still unsent. */
  overdue: number;
  /** The oldest of them, ISO. null when there are none. */
  oldestDue: string | null;
}

// 🔴 null IN, ALARM OUT, THE SAME RULE cronsServing() SETS FOUR LINES ABOVE. getReminderBacklog()
// returns null on any failed read, and "I could not look" is not "there is nothing there". A
// backlog we cannot see is the one state most likely to be hiding something, so it is the one
// state that must never score as healthy.
export function reminderAlarm(backlog: ReminderBacklog | null, now: Date = new Date()): CronAlarm | null {
  if (backlog === null) {
    return {
      job: 'due',
      reason: 'unreadable',
      hoursQuiet: null,
      detail: 'the reminder backlog could not be read, so nothing here can say whether reminders are going out',
    };
  }

  if (backlog.overdue === 0 || !backlog.oldestDue) return null;

  const lateMs = now.getTime() - new Date(backlog.oldestDue).getTime();
  if (!Number.isFinite(lateMs)) {
    return {
      job: 'due',
      reason: 'unreadable',
      hoursQuiet: null,
      detail: 'the oldest overdue reminder has an unreadable due time',
    };
  }

  const lateMinutes = lateMs / 60_000;
  if (lateMinutes <= REMINDER_MAX_LATE_MINUTES) return null;

  const lateHours = lateMinutes / 60;

  return {
    job: 'due',
    reason: 'overdue',
    hoursQuiet: Math.round(lateHours * 10) / 10,
    detail: `${backlog.overdue} reminder${backlog.overdue === 1 ? '' : 's'} due and unsent, the oldest by `
      + `${Math.round(lateMinutes)} minutes. The dispatch runs every ${REMINDER_DISPATCH_INTERVAL_MINUTES} `
      + `minutes, so ticks have come and gone without sending it.`,
  };
}

// Is the promise being kept? Empty backlog, or a backlog young enough that the next pass will
// clear it, is a yes. Anything else, including a backlog we cannot read, is a no.
export function remindersServing(backlog: ReminderBacklog | null, now: Date = new Date()): boolean {
  return reminderAlarm(backlog, now) === null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE LOGIN DOOR. 11 August 2026, and it is the same disease a third time.
//
// The reminder watch above exists because a signal could not tell "nothing was due" from
// "everything was due and none of it went". This is that sentence again with the noun changed.
//
// On 11 August a customer asked for four sign in codes over sixty five minutes. None arrived. The
// screen said "We have sent you a code" every time, /api/health returned 200 every time, and the
// only place the truth existed was a column in auth_sends that nothing read. A man who had made an
// account the day before could not get back into it, and nothing in the product knew.
//
// So this watches the one email whose failure locks a customer out. Not "did a cron run", not "is
// the database up": did the codes we tried to send actually leave.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// How many attempts must be in the window before a clean sweep of failures means anything.
//
// THE ARITHMETIC, BECAUSE A THRESHOLD NOBODY CAN DERIVE IS A THRESHOLD SOMEBODY WILL LOOSEN.
//
//   One failure is a blip: a provider hiccup, a timeout, a bounced address. Two is bad luck.
//   THREE in an hour with not one success is not luck, it is a road that is shut. The observed
//   incident was four in sixty five minutes with zero successes.
//
// Three, not one, because this file's own header says an alarm that cries wolf gets muted, and a
// muted alarm is worse than no alarm because it looks like cover. Three, not ten, because Lekhio is
// a young product and ten failed sign ins is a week of being broken, not an hour.
export const AUTH_SEND_MIN_ATTEMPTS = 3;

/** What the login door has managed to send lately. Counts only, never an address. */
export interface AuthSendHealth {
  /** Sends we actually attempted in the window. Refusals are not attempts and are not counted. */
  attempted: number;
  /** How many of those the provider took. */
  sent: number;
  /** How many the provider refused or threw on. */
  failed: number;
  /** The window this covers, so the reader never has to assume it. */
  windowMinutes: number;
}

// 🔴 null IN, ALARM OUT. The same rule as cronsServing and reminderAlarm, for the same reason: a
// door we cannot see is the one most likely to be hiding something.
export function authSendAlarm(health: AuthSendHealth | null): CronAlarm | null {
  if (health === null) {
    return {
      job: 'signin',
      reason: 'unreadable',
      hoursQuiet: null,
      detail: 'the login send log could not be read, so nothing here can say whether sign in codes are going out',
    };
  }

  // A quiet hour is a quiet hour. Nobody asked for a code, so nothing failed, so there is nothing
  // to say. This is the branch that stops the alarm firing every night at three.
  if (health.attempted < AUTH_SEND_MIN_ATTEMPTS) return null;

  // One success in the window means the road is open and something else went wrong with the rest.
  // That is a different problem and it is not this one.
  if (health.sent > 0) return null;

  return {
    job: 'signin',
    reason: 'failed',
    hoursQuiet: Math.round((health.windowMinutes / 60) * 10) / 10,
    detail: `${health.failed} sign in code${health.failed === 1 ? '' : 's'} asked for in the last `
      + `${health.windowMinutes} minutes and not one of them was accepted by the mail provider. `
      + 'Anyone trying to sign in right now is being told a code is on its way and is not getting one.',
  };
}

/** Is the login door actually posting codes? A window we cannot read is a no. */
export function authSendsServing(health: AuthSendHealth | null): boolean {
  return authSendAlarm(health) === null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 B65. THE LAST STEP OF THE SIGNUP FUNNEL CAN LEAVE A PERSON UNLINKED AND NOTHING WATCHED FOR
// IT. 20 August 2026.
//
// findContactAccount resolves an address to an account ONLY through a signups row carrying a
// user_id, and public.users has no email column to fall back on. That link is written in exactly
// one place, setSignupUserId, from one route, /api/signup/verify, and the patch is scoped
// `&user_id=is.null`, so when it matches nothing it updates zero rows and SUCCEEDS SILENTLY.
//
// lib/supabase.ts already says it in its own comment, dated: "no row means no link... he is locked
// out tomorrow morning with the same neutral screen a stranger gets. Found on a real signup,
// 6 August 2026." He is not locked out that day. He is holding the session he just opened. He is
// locked out the next morning, and no amount of retrying gets him back without a human touching
// the database.
//
// ⚠️ THERE IS NO VICTIM TODAY AND THIS IS A MISSING WATCHER RATHER THAN A RUNNING INCIDENT.
// The four unlinked signups rows in production predate the user_id column and are Jag's own or
// named tests. Nobody was stranded by a bug that fired. What did not exist was anything that would
// tell us the day one is.
//
// 🔴 AND THE TELL IS NOT "A SIGNUP WITH NO user_id", WHICH IS THE OBVIOUS CHECK AND IS THE WRONG
// ONE. An abandoned signup is a row with no user_id for ever: he typed his email into /start, never
// went to his inbox, and no account was ever meant to exist. That is a CONVERSION fact, not an
// outage, and on a funnel with real traffic it is most of the rows. A watch built on it would be
// red within an hour of the first pound Jag spends and would be muted by the end of the week,
// which is this file's own header warning arriving for a second time.
//
// THE TELL IS A CONSUMED CODE. public.signup_codes.consumed_at is set inside /api/signup/verify,
// on the far side of a code we emailed and he typed back, and the spend is conditional on it being
// null. So a consumed code is PROOF that a person proved that address. If the address then has no
// signups row carrying a user_id, the bridge did not land and he is locked out. An abandoned
// signup has no consumed code and can never reach this check at all.
//
// 🟢 AND IT NEEDS NO CUT OFF DATE FOR THE FOUR LEGACY ROWS, WHICH THE OBVIOUS CHECK WOULD HAVE.
// public.signup_codes was created by the SAME statement batch that added signups.user_id
// (supabase/APPLY_2026-07-29_signup_codes.sql, the table at line 32 and the column at line 93).
// No code row can predate the column. The four rows have no code row at all, so they are outside
// this question by construction rather than by an excluded id list or a date somebody typed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// THE GRACE, AND THE ARGUMENT FOR THE NUMBER.
//
// The whole failure lives inside ONE HTTP request. /api/signup/verify consumes the code, mints the
// auth user, writes the users row, and only then calls setSignupUserId and ensureSignupBridge. The
// gap between "proved" and "linked" is those few statements, not a trip to an inbox: the human part
// of the signup happens BEFORE the code is consumed, and this clock starts after it.
//
// So the grace only has to cover one function invocation, and both timestamps are written by our
// own Node clock (consumeSignupCode uses new Date().toISOString(), not the database's now()), so
// there is no clock skew between the two sides to absorb either.
//
// Ten minutes is two orders of magnitude more than that request can take and still short enough
// that a locked out person is found in the same working session rather than the next morning. It is
// deliberately not one minute: this file's header says a ceiling too tight cries wolf, an alarm
// that cries wolf gets muted, and a muted alarm looks like cover. On 9 August a too eager alarm put
// /api/health at 503 and paged the founder on launch eve over a job that was perfectly healthy.
export const SIGNUP_LINK_GRACE_MINUTES = 10;

// HOW FAR BACK IT LOOKS, AND WHY THERE IS A BACK AT ALL.
//
// A stranded person stays stranded until a human links the row, so the honest instinct is to look
// for ever. The reason not to is the read: the set this walks is SUCCESSFUL signups, one row per
// person who ever completed, and an unbounded read of it grows with the customer base while the
// answer it produces almost never changes.
//
// Fourteen days is long enough that a red survives a weekend, a bank holiday and a week of nobody
// looking, and short enough that the read stays a handful of rows for a product this size. When it
// stops being a handful the read caps, and a capped read is reported as unreadable rather than as
// clean, so this can never go quietly blind.
export const SIGNUP_LINK_LOOKBACK_DAYS = 14;

export interface SignupLinkHealth {
  /** Addresses that PROVED themselves in the window: a signup_codes row with consumed_at set. */
  proved: number;
  /** Of those, how many have no signups row carrying a user_id. Each one is a person locked out. */
  unlinked: number;
  /** When the oldest of those proved, ISO, so a minute can be told from a day. null when none. */
  oldestProvedAt: string | null;
  /** The grace already applied at the young end, so no reader has to assume it. */
  graceMinutes: number;
  /** How far back it looked, for the same reason. */
  lookbackDays: number;
  /** True when the read hit its row limit. A partial answer must never read as a clean one. */
  capped: boolean;
}

// 🔴 null IN, ALARM OUT, the same rule cronsServing, reminderAlarm and authSendAlarm all follow.
// A link we cannot check is the one state most likely to be hiding somebody.
export function signupLinkAlarm(
  health: SignupLinkHealth | null,
  now: Date = new Date(),
): CronAlarm | null {
  if (health === null) {
    return {
      job: 'signups',
      reason: 'unreadable',
      hoursQuiet: null,
      detail: 'the signup link could not be checked, so nothing here can say whether anyone who '
        + 'finished signing up can get back in',
    };
  }

  // A READ THAT RAN OUT OF ROOM IS NOT A CLEAN READ. It is reported before the count, because a
  // capped read with zero unlinked is exactly the answer that looks like good news and is not one.
  if (health.capped) {
    return {
      job: 'signups',
      reason: 'unreadable',
      hoursQuiet: null,
      detail: `the signup link check hit its row limit over ${health.lookbackDays} days, so it has `
        + 'outgrown a two request read and is no longer looking at all of them',
    };
  }

  if (health.unlinked === 0) return null;

  const provedMs = health.oldestProvedAt ? Date.parse(health.oldestProvedAt) : NaN;
  const hoursQuiet = Number.isFinite(provedMs)
    ? Math.round(((now.getTime() - provedMs) / 3_600_000) * 10) / 10
    : null;

  return {
    job: 'signups',
    reason: 'failed',
    hoursQuiet,
    // ⚠️ COUNTS AND AGES, NEVER AN ADDRESS. The same rule the signin row follows: the operator
    // needs the shape of the failure, not who it happened to.
    detail: `${health.unlinked} of ${health.proved} people who proved their email address in the `
      + `last ${health.lookbackDays} days ${health.unlinked === 1 ? 'has' : 'have'} no account link, `
      + 'so the sign in door will not find them and they meet the same neutral screen a stranger '
      + 'gets. Nothing they try fixes it.',
  };
}

/** Can the people who finished signing up actually get back in? A check we cannot run is a no. */
export function signupLinksServing(health: SignupLinkHealth | null, now: Date = new Date()): boolean {
  return signupLinkAlarm(health, now) === null;
}
