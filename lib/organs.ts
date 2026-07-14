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
// 🔴 RAKHA LEAVES NO TRACE. Its signals are computed on the way past and thrown away. There is no
// table. So we cannot tell you how many times Rakha has spoken to a user, whether it fired this week,
// or whether it has been silently dead since Tuesday. If it stopped, NOTHING WOULD GO RED.
//
// That is exactly the disease that killed this brain for five days in July: a component that only
// writes when something happens is indistinguishable, from the database, from a component that is
// dead. The differ has a heartbeat now. The amendment watcher has one. The Budget loop has one.
// The organ that ACTS ON THE USER'S BEHALF has none, and it is the one whose silence costs the most.
//
// The console says so, in the loudest way it can: it draws Rakha DARK, with the reason underneath.
// A blind spot you can see is a blind spot that gets closed. See supabase/APPLY_2026-07-14_rakha.sql.

import { type Run, type Item, didCheck, isKnowledge } from './brain';

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
function rakha(): Organ {
  return {
    key: 'rakha',
    name: 'Rakha',
    does: 'Watches his figures and speaks up first. The organ that acts on his behalf.',

    // ⚠️ `unwired` IS NOT A DEGRADED `alive`. IT IS A DIFFERENT ANSWER TO A DIFFERENT QUESTION.
    //
    // `alive` says: I checked, and it is working.
    // `unwired` says: I CANNOT CHECK. There is nothing to check.
    //
    // Collapsing the two is how a console lies. And it is precisely the lie that let this brain sit
    // dead for five days while launchd reported success every single morning.
    pulse: 'unwired',

    says: 'No heartbeat. Nothing Rakha does is recorded, so we cannot tell you whether it fired this week or died on Tuesday.',

    // 🔴 THE HONEST ANSWER TO "WHAT WOULD MAKE YOU GO RED" IS: NOTHING WOULD. THAT IS THE PROBLEM.
    redWhen: null,

    count: null,
  };
}

// ---------------------------------------------------------------------------------------------

export function body(
  runs: Run[],
  items: Item[],
  qa: { answered: number; lastAnswerAt: string | null },
  subscribers: number,
  now: Date = new Date(),
): Body {
  const organs = [khoji(runs, items, now), rakha(), puchio(qa.answered, qa.lastAnswerAt, now)];

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
