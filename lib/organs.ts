// THE FOUR ORGANS. Lekhio in the middle, and the three that do the work around it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AN ORGAN WE CANNOT MEASURE IS DRAWN DARK. IT IS NEVER DRAWN GREEN.
//
// This is the whole design, and it is the opposite of what a console like this normally does.
//
// The temptation is obvious: four glowing rings, pulsing, growing, and the thing looks alive. But a
// ring that glows whether or not the organ behind it is working is not a status light, it is a
// screensaver, and the day one of them dies the console will go on glowing exactly as before. Doc
// 103: a row that says nothing is worse than no row, because it teaches him to stop looking.
//
// So every organ on this screen must answer one question honestly: WHAT WOULD MAKE YOU GO RED?
// An organ that cannot answer it does not get a colour. It gets a hole, and the hole is labelled.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// AND BUILDING IT FOUND THE HOLE.
//
//   KHOJI  reads the world.       khoji_runs, three kinds, every night. RICH.
//   PUCHIO answers him.           qa_cache, conversations. REAL.
//   RAKHA  acts for him.          ...nothing. Nothing at all.
//
// ⚠️ CORRECTED 14 JULY. THE FIRST VERSION OF THIS COMMENT SAID "IF IT STOPPED, NOTHING WOULD GO
// RED." THAT WAS FALSE, AND I WROTE IT WITHOUT CHECKING.
//
// Rakha DOES have a transport heartbeat. app/api/cron/agent/route.ts calls cronStarted('agent') and
// cronFinished('agent'), MAX_QUIET_HOURS.agent = 26 in lib/cronwatch.ts, and /api/health goes red if
// the walk has not finished in 26 hours. A STOPPED RAKHA IS ALREADY CAUGHT.
//
// 🔴 WHAT IS NOT CAUGHT IS A RAKHA THAT RUNS AND THINKS ABOUT NOBODY.
//
// processUser() has three early returns, and every one of them writes NOTHING:
//
//     if (!agg) return { inserted: 0, pinged: 0 };
//     if (agg.months.length === 0 && agg.unconfirmed === 0) return ...;
//     if (signals.length === 0) return { inserted: 0, pinged: 0 };   <- the whole hole, in one line
//
// The only table Rakha ever writes is agent_signals, ONE ROW PER FINDING. So if agentAggregates()
// quietly began returning null for everyone, a renamed column, a changed RLS policy, a broken join,
// the cron would walk every user, find nothing, call cronFinished('agent', TRUE), and the health
// check would STAY GREEN. The job finished. Successfully. Having considered nobody.
//
// A quiet week and a lobotomised Rakha are the same thing in the database: ZERO ROWS.
//
// ✅ CLOSED, 14 JULY, LATE. `rakha_runs` is now written by app/api/cron/agent/route.ts, in a
// `finally`, EVERY run, pass or fail. `considered` is the load-bearing column, exactly as
// khoji_runs.checked is: A RUN THAT LOOKED AT NOBODY IS NOT A RUN.
//
// So all three organs now answer "what would make you go red", and the console has no dark rings.
// Which means the next thing it says will be worth believing, and that was the entire point.
//
// The console says so, in the loudest way it can: it draws Rakha DARK, with the reason underneath.
// A blind spot you can see is a blind spot that gets closed. See supabase/APPLY_2026-07-14_rakha.sql.

import { type Run, type Item, didCheck, isKnowledge } from './brain';

/** Rakha's heartbeat row. Structurally identical to lib/supabase.ts RakhaRun, declared here so this
 *  file stays pure policy with no I/O and the node test runner can load it directly. */
export interface RakhaRun {
  ran_at: string;
  considered: number;
  signalled: number;
  sent: number;
  ok: boolean;
}

export type Pulse =
  /** Running, recently, and nothing is wrong. */
  | 'alive'
  /** Running, but it has found something we ought to look at. */
  | 'attention'
  /** It ran and it failed, or it has not run in far too long. */
  | 'broken'
  /** 🔴 IT HAS NO HEARTBEAT. Not "it is fine". We genuinely cannot tell. */
  | 'unwired';

export interface Organ {
  key: 'khoji' | 'rakha' | 'puchio';
  name: string;
  /** One line. What this organ is FOR, in the words you would use to a person. */
  does: string;
  pulse: Pulse;
  /** The sentence under the ring. Always a fact, never an adjective. */
  says: string;
  /** 🔴 What would make this organ go red. An organ that cannot answer this is UNWIRED. */
  redWhen: string | null;
  /** A number worth watching, when there is one. */
  count: number | null;
}

export interface Body {
  organs: Organ[];
  /** Lekhio, in the middle. The only number here that is a person rather than a process. */
  centre: { subscribers: number; says: string };
  /** True when any organ is dark. The console must not look healthy when it is half blind. */
  blind: boolean;
}

const STALE_HOURS = 36;

const hoursSince = (iso: string | null | undefined, now: Date): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 3_600_000;
};

// ---------------------------------------------------------------------------------------------
// KHOJI. The one organ that has always had a heartbeat, because it is the one that nearly died.
// ---------------------------------------------------------------------------------------------
function khoji(runs: Run[], items: Item[], now: Date): Organ {
  const base = {
    key: 'khoji' as const,
    name: 'Khoji',
    does: 'Reads GOV.UK every night and checks it against our own tax engine.',
    // It CAN go red, and here is exactly how. Every one of these has happened.
    redWhen: 'A tax constant stops matching GOV.UK, an extractor breaks, or a night goes by with nothing checked.',
  };

  // ⚠️ THE NEWEST RUN THAT ACTUALLY CHECKED SOMETHING. A crashing differ writes a row every night, and
  // the newest row is therefore NOT evidence that anything was looked at. A heartbeat monitor wired to
  // the fact that the patient is still in the bed.
  const real = runs.find(didCheck);
  if (!real) {
    return { ...base, pulse: 'broken', says: 'Nothing has been checked. Khoji is not running.', count: null };
  }

  const h = hoursSince(real.ran_at, now);
  const drifted = real.drifted ?? 0;
  const blind = real.blind ?? 0;

  if (drifted > 0) {
    return { ...base, pulse: 'attention', says: `${drifted} of our tax numbers no longer match GOV.UK.`, count: drifted };
  }
  if (blind > 0) {
    return { ...base, pulse: 'attention', says: `${blind} pages could not be read. Not knowing is not the same as being fine.`, count: blind };
  }
  if (h !== null && h > STALE_HOURS) {
    return { ...base, pulse: 'broken', says: `Nothing checked for ${Math.round(h)} hours.`, count: null };
  }

  const known = items.filter(isKnowledge).length;
  return {
    ...base,
    pulse: 'alive',
    says: `${real.agreed} of ${real.checked} tax constants matched GOV.UK last night.`,
    count: known,
  };
}

// ---------------------------------------------------------------------------------------------
// PUCHIO. He asks, it answers.
// ---------------------------------------------------------------------------------------------
function puchio(answered: number, lastAnswerAt: string | null, now: Date): Organ {
  const base = {
    key: 'puchio' as const,
    name: 'Puchio',
    does: 'Answers his questions about his own money, from sources we can name.',
    redWhen: 'It answers from a source nobody reviewed, or it stops answering at all.',
  };

  // NO QUESTIONS IS NOT A FAULT. A quiet week is a quiet week, and a console that shouts about it
  // teaches you to ignore the console. It is only broken when it is broken.
  if (answered === 0) {
    return { ...base, pulse: 'alive', says: 'Nobody has asked anything yet.', count: 0 };
  }

  const h = hoursSince(lastAnswerAt, now);
  return {
    ...base,
    pulse: 'alive',
    says: h !== null && h < 48
      ? `${answered} questions answered. The last one ${Math.round(h)} hours ago.`
      : `${answered} questions answered.`,
    count: answered,
  };
}

// ---------------------------------------------------------------------------------------------
// 🔴 RAKHA. THE HOLE.
// ---------------------------------------------------------------------------------------------
// ⚠️ FOUR STATES THAT USED TO LOOK IDENTICAL, AND THE WHOLE JOB IS TELLING THEM APART.
//
//   runs === null            we could not READ the heartbeat.  NOT the same as not having one.
//   no run with considered>0 Rakha ran and looked at NOBODY.   A run that looked at nobody is not a run.
//   considered 0, 0 people   there is nobody to look at yet.   NOT a fault. A quiet start.
//   stale / ok === false     it stopped, or it died.
//
// Every one of those was, until tonight, "zero rows in agent_signals", i.e. a quiet week, i.e. green.
function rakha(runs: RakhaRun[] | null, subscribers: number, now: Date): Organ {
  const base = {
    key: 'rakha' as const,
    name: 'Rakha',
    does: 'Watches his figures and speaks up first. The organ that acts on his behalf.',
    redWhen: 'It stops running, it dies mid-walk, or it runs and looks at nobody while there are people to look at.',
  };

  // 1. WE COULD NOT ASK. This is the one state that is still genuinely dark, and it is honest: a
  //    failed read is not evidence of a failed organ, and it must not be drawn as one, in EITHER
  //    direction. Not green, and not red.
  if (runs === null) {
    return {
      ...base,
      pulse: 'unwired',
      says: 'We could not read Rakha\'s heartbeat. That is not the same as Rakha being dead, and it is not the same as Rakha being fine. We do not know.',
      redWhen: null,
      count: null,
    };
  }

  // 2. IT HAS NEVER RUN, OR EVERY RUN LOOKED AT NOBODY.
  //
  // ⚠️ AND THE EMPTY CASE IS NOT A FAULT. With no subscribers there is nobody for Rakha to watch, and
  // a console that shouts about that is a console you learn to ignore (doc 103, the empty test).
  const real = runs.find((r) => r.considered > 0);
  if (!real) {
    if (subscribers === 0) {
      return { ...base, pulse: 'alive', says: 'Nobody to watch yet. Rakha starts the day the first man does.', count: 0 };
    }
    return {
      ...base,
      pulse: 'broken',
      says: `Rakha has looked at nobody, and there ${subscribers === 1 ? 'is 1 person' : `are ${subscribers} people`} to look at. It is running and thinking about no one.`,
      count: 0,
    };
  }

  // 3. IT RAN, AND IT DIED.
  if (!real.ok) {
    return { ...base, pulse: 'broken', says: 'The last real run did not finish. People past the cursor were never reached.', count: real.considered };
  }

  // 4. IT RAN, AND THEN IT STOPPED.
  const h = hoursSince(real.ran_at, now);
  if (h !== null && h > STALE_HOURS) {
    return { ...base, pulse: 'broken', says: `Rakha has not looked at anybody for ${Math.round(h)} hours.`, count: real.considered };
  }

  // 5. ALIVE. And it says the NUMBERS, not an adjective.
  //
  // ⚠️ "ACCOUNTS", NOT "PEOPLE". THE FIRST LIVE RUN SAID "Rakha looked at 2 people" WHILE THE CENTRE
  // OF THE SAME REACTOR SAID "1 person is trusting this with his tax". Two counts of the same
  // population, disagreeing, six inches apart, for the third time today.
  //
  // Neither number was wrong. listAgentUsersPage walks EVERY row in `users`, which is exactly right
  // for a heartbeat (the question is "did the machinery run", not "did it bill anyone"), so it
  // legitimately includes the App Review demo and anyone who has never subscribed. The CENTRE counts
  // paying and trialing humans and excludes internal accounts.
  //
  // So the fix is not the number. IT IS THE NOUN. On this console "people" means customers, and it
  // must not quietly mean something else in one ring. A word that drifts is a number that drifts.
  const spoke = real.sent > 0
    ? `${real.sent} of them heard from it.`
    : 'Nobody needed telling.';
  return {
    ...base,
    pulse: 'alive',
    says: `Rakha looked at ${real.considered === 1 ? '1 account' : `${real.considered} accounts`}, every record we hold. ${spoke}`,
    count: real.considered,
  };
}

// ---------------------------------------------------------------------------------------------

export function body(
  runs: Run[],
  items: Item[],
  qa: { answered: number; lastAnswerAt: string | null },
  subscribers: number,
  // ⚠️ null is "we could not read it", NOT "there is none". The whole console turns on that.
  rakhaRuns: RakhaRun[] | null = null,
  now: Date = new Date(),
): Body {
  const organs = [
    khoji(runs, items, now),
    rakha(rakhaRuns, subscribers, now),
    puchio(qa.answered, qa.lastAnswerAt, now),
  ];

  return {
    organs,
    centre: {
      subscribers,
      // The centre is the only thing on this screen that is a PERSON and not a process. Everything
      // else in the reactor exists to be right for him.
      says: subscribers === 1 ? '1 person is trusting this with his tax.' : `${subscribers} people are trusting this with their tax.`,
    },

    // 🔴 THE CONSOLE MUST NOT LOOK HEALTHY WHILE IT IS HALF BLIND.
    //
    // If any organ is unwired, the whole body is flagged blind, and the screen says so at the top.
    // Three green rings and one dark one, with no comment, reads as "mostly fine". It is not mostly
    // fine. It is three things we can see and one we cannot, and the one we cannot see is the one
    // that talks to users without being asked.
    blind: organs.some((o) => o.pulse === 'unwired'),
  };
}
