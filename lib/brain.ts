// KHOJI, SHAPED FOR A HUMAN. Pure functions, no I/O, so the test runner loads it directly.
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS SCREEN IS FOR, BECAUSE THE TEMPTATION IS OBVIOUS AND IT IS WRONG.
//
// Khoji is the one thing in this product that nobody else in the category has. Which means the pull,
// every time anybody opens this page, is to make it look impressive: a big green number, a rising
// line, the word LIVE somewhere. A brain, growing.
//
// A dashboard that only shows what is going well is a screensaver.
//
// So this file computes three things and two of them are uncomfortable:
//
//   1. WHAT IT CHECKED, and how long ago. Not "is it healthy". WHEN did something last look. An
//      empty incident table is only good news if something was looking, and until 14 July nothing
//      in this system could tell those two apart.
//
//   2. WHAT IT HAS NEVER CHECKED, BY NAME. "0 drift" does not mean our tax numbers are right. It
//      means the ones we look at are right. The difference between those two sentences is a Budget,
//      and the only defence against quietly starting to believe the first one is to print the gap,
//      in words, every single time.
//
//   3. WHAT IT HAS LEARNED, and how much of that is sitting unreviewed. Collecting is not learning.
//      A queue nobody approves is a brain that has stopped growing while looking busy.
// ---------------------------------------------------------------------------------------------

export interface Run {
  ran_at: string;
  tax_year: string | null;
  published: number;   // constants the engine publishes
  checked: number;     // of those, how many have an extractor
  agreed: number;
  drifted: number;
  blind: number;
  unwatched: string[];
  ok: boolean;
}

export interface Item {
  status: string;
  created_at: string;
  title: string | null;
  source_url: string | null;
}

// The differ runs nightly. Past this, it has stopped, and every green light downstream of it is an
// assumption. Same number as lib/knowledgewatch.ts, and it is not a coincidence: the page a human
// reads and the alarm that emails him must not be able to disagree about whether the brain is alive.
export const STALE_HOURS = 36;

// ⚠️ 'failed' EXISTS BECAUSE I WROTE THIS FILE WITHOUT IT AND IT LIED WITHIN THE HOUR.
//
// The differ crashed on a typo of mine, and the failure recorder did its job: it wrote an honest
// row saying the run had checked nothing. published 0, checked 0, agreed 0, drifted 0, blind 0.
//
// And this function read that row and returned:
//
//     Checking. "0 of 0 constants were compared to their GOV.UK page and every one matched."
//
// Green. A crashed differ, rendered as a perfect night, by the very screen built to make a dead
// differ impossible to miss. Zero drift out of zero checks is not a clean bill of health, it is an
// empty set wearing one.
//
// A RUN THAT CHECKED NOTHING IS NOT A RUN. It is a night on which nobody looked.
export type Pulse = 'checking' | 'wrong' | 'blind' | 'unwatched' | 'failed' | 'never';

export interface Vitals {
  pulse: Pulse;
  // The sentence. Written here, not in the component, so it is tested rather than reviewed.
  says: string;
  lastRunAt: string | null;
  hoursAgo: number | null;
  published: number;
  checked: number;
  agreed: number;
  drifted: number;
  blind: number;
  // Published, and never once compared to GOV.UK. The number we are least comfortable with, which
  // is exactly why it goes on the screen.
  unwatched: string[];
}

const EMPTY: Vitals = {
  pulse: 'never', says: '', lastRunAt: null, hoursAgo: null,
  published: 0, checked: 0, agreed: 0, drifted: 0, blind: 0, unwatched: [],
};

// A run that compared nothing to anything. It happened, it wrote a row, and it is NOT a heartbeat.
export const didCheck = (r: Run) => r.checked > 0;

export function vitals(runs: Run[], now: Date = new Date()): Vitals {
  const attempt = runs[0];                  // the reader hands them newest first
  const real = runs.find(didCheck);         // the newest run that actually LOOKED at something

  // NEVER. Not "fine". This is the state the whole heartbeat exists to make visible: no incident
  // rows, nothing wrong anywhere, and nothing has ever looked.
  //
  // Note the denominator: a night full of CRASHED runs lands here too, and it should. A differ that
  // has crash-looped since Monday has written a row every night, and not one of them contains a
  // single comparison. It has been busy. It has not been checking.
  if (!real) {
    return {
      ...EMPTY,
      pulse: 'never',
      lastRunAt: attempt?.ran_at ?? null,
      says: attempt
        ? 'The differ has run and checked NOTHING. Not one constant has been compared to GOV.UK. It is failing, not idle.'
        : 'Nothing has ever compared our tax constants to GOV.UK. We are not saying we are wrong. We are saying nobody has looked.',
    };
  }

  // STALENESS IS MEASURED FROM THE LAST RUN THAT ACTUALLY CHECKED SOMETHING, never from the last
  // run that merely happened. Measure it from the attempt and a differ crashing every night at 3am
  // keeps the clock permanently fresh, which is a heartbeat monitor wired to the fact that the
  // patient is still in the bed.
  const hours = (now.getTime() - new Date(real.ran_at).getTime()) / 3_600_000;
  const base = {
    lastRunAt: real.ran_at,
    hoursAgo: Math.max(0, Math.round(hours)),
    published: real.published,
    checked: real.checked,
    agreed: real.agreed,
    drifted: real.drifted,
    blind: real.blind,
    unwatched: real.unwatched ?? [],
  };

  // ORDER IS THE ARGUMENT, and it is the same order as the alarms.
  //
  // WRONG beats BLIND beats THE JOB IS BROKEN beats NOBODY IS LOOKING beats fine. Being wrong is
  // worse than not knowing. What must never happen is any of them arriving dressed as the last one.
  if (real.drifted > 0) {
    return { ...base, pulse: 'wrong',
      says: `${real.drifted} of our tax constants disagree with GOV.UK right now. The engine is wrong and every figure resting on it is wrong.` };
  }
  if (real.blind > 0) {
    return { ...base, pulse: 'blind',
      says: `${real.blind} constants could not be read off their GOV.UK page. We do not know whether we are right about them, and a differ that reports "all clear" when it cannot see is lying by omission.` };
  }

  // THE MOST RECENT ATTEMPT DID NOT CHECK ANYTHING. The job is broken right now, and the reassuring
  // numbers below it are from the last night it worked. Say both, in that order.
  if (attempt && !didCheck(attempt)) {
    return { ...base, pulse: 'failed',
      says: `The last run compared NOTHING to GOV.UK. It started and it did not finish. The figures below are from ${Math.round(hours)}h ago, the last time anything actually looked.` };
  }

  if (hours > STALE_HOURS) {
    return { ...base, pulse: 'unwatched',
      says: `Nothing has checked our tax constants for ${Math.round(hours)} hours. It runs nightly. It has stopped.` };
  }

  return { ...base, pulse: 'checking',
    says: `${real.agreed} of ${real.checked} constants were compared to their GOV.UK page and every one matched.` };
}

// COVERAGE, SAID OUT LOUD AND WITHOUT FLATTERY.
//
// The honest denominator is what the engine PUBLISHES, not what the differ has an extractor for. A
// coverage figure computed over the things you already look at is always 100%, and it is the most
// comfortable lie a monitoring system can tell itself.
export function coverage(v: Vitals): { pct: number; watched: number; total: number; blind: number } {
  const total = v.published || 0;
  if (total === 0) return { pct: 0, watched: 0, total: 0, blind: 0 };
  return {
    pct: Math.round((v.checked / total) * 100),
    watched: v.checked,
    total,
    blind: v.unwatched.length,
  };
}

// IS THIS ACTUALLY LANDING, OR IS IT JUST RELEVANT?
//
// ⚠️ THE BADGE THAT LIED ON ITS FIRST DAY.
//
// The review queue shouted "CHANGES THE TAX ENGINE" on a GOV.UK page effective 1 JANUARY 2019, and
// on another from 6 April 2017. The trading allowance has been £1,000 since 2017. Our engine holds
// it. Khoji compares it to GOV.UK every single night. Nothing was changing.
//
// `engine_impact` is a MODEL'S GUESS, and the distiller had set it true on all 39 items in the
// queue. So the loudest label on the screen was on everything, which means it was on nothing, and
// the one item that genuinely moves a rate would have hidden inside the noise. It is the same
// disease as an alarm that always fires: somebody mutes it, and then there is no alarm.
//
// The row carries a FACT the model cannot fudge: the effective date. Use it. A change that already
// happened years ago is not news, it is the law we already implement and already check.
export const LANDING_WINDOW_DAYS = 120;

export function isLive(effectiveDate: string | null | undefined, now: Date = new Date()): boolean {
  // No date at all means we do not know when it bites. Treat it as LIVE: not knowing is not the same
  // as being fine, and the cost of a false shout here is one person reading one extra page. The cost
  // of a false silence is a rate change nobody looked at.
  if (!effectiveDate) return true;
  const d = new Date(effectiveDate);
  if (Number.isNaN(d.getTime())) return true;
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  // In the future, or landed recently enough that we might not have acted on it yet.
  return days < LANDING_WINDOW_DAYS;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IS IT THE LAW YET? OR IS IT ONLY ANNOUNCED?
//
// THE BUG THIS EXISTS TO KILL, AND IT IS A WRONG-MONEY BUG:
//
// Every reviewed knowledge item gets folded into Rakha's prompt under this instruction (lib/claude.ts):
//
//     "Treat these as the latest confirmed position, PREFER them where they are relevant."
//
// and the effective date is passed as a bare string in the middle of a sentence: "(effective
// 2027-04-06)". So a Budget change ANNOUNCED in November 2026 and taking effect the following APRIL
// is handed to a language model, under an instruction to prefer it, with the date as decoration, and
// the model is left to work out for itself that it has not happened yet.
//
// Picture the man. It is January. He asks what he can claim per mile. Khoji has correctly distilled
// a Budget announcement that the rate changes on 6 April. Rakha, doing as it was told, prefers the
// latest confirmed position and quotes him the NEW rate. He logs three months of mileage at a number
// that is not the law yet, and every one of those entries is wrong, and he will sign the return.
//
// ⚠️ A MODEL MUST NEVER BE ASKED TO DO THE DATE ARITHMETIC THAT DECIDES WHICH LAW APPLIES.
//
// It is the same rule as everywhere else in this codebase: ARITHMETIC AND PROVENANCE DECIDE, THE
// MODEL ONLY DESCRIBES. So we do the comparison here, in TypeScript, against a real clock, and hand
// the model two clearly separated lists with the reasoning already done.
//
// AND THE SECOND HALF IS THE PRODUCT. "Announced, not yet law" is not a nuisance category to be
// filtered out and forgotten. It is the ANSWER TO "what is coming that will affect me", which is the
// thing every accountant charges for in March and nobody gets in January. Khoji already collects it.
// Nothing has ever read it. (doc 108: predicting the future.)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type Phase = 'in_force' | 'announced' | 'unknown';

export function phase(effectiveDate: string | null | undefined, now: Date = new Date()): Phase {
  // ⚠️ NO DATE IS `unknown`, NOT `in_force`.
  //
  // isLive() treats a missing date as live, and that is right for ITS question ("should a human look
  // at this?"): the cost of a false shout is one page read. This question is different. Here a wrong
  // answer changes a number on a tax return, so an item with no date is not quietly promoted into the
  // law. It goes to the model labelled as what it is: we do not know when this bites.
  if (!effectiveDate) return 'unknown';

  const d = new Date(effectiveDate);
  if (Number.isNaN(d.getTime())) return 'unknown';

  // Strictly after today = not law yet. Today itself IS in force: a rate that starts on 6 April is
  // the law on 6 April, and a man asking that morning must be told the new number, not the old one.
  return d.getTime() > now.getTime() ? 'announced' : 'in_force';
}

export interface Dated { effective_date: string | null }

// Split a pile of knowledge into what governs him TODAY and what is merely coming.
//
// Returned separately and never merged, because the whole point is that the caller cannot
// accidentally hand a language model one list and hope.
export function byPhase<T extends Dated>(items: T[], now: Date = new Date()): {
  inForce: T[];
  announced: T[];
  unknown: T[];
} {
  return {
    inForce: items.filter((i) => phase(i.effective_date, now) === 'in_force'),
    announced: items.filter((i) => phase(i.effective_date, now) === 'announced'),
    unknown: items.filter((i) => phase(i.effective_date, now) === 'unknown'),
  };
}

// How long until it bites. Null when it already has, or when we do not know.
//
// This is what turns "announced" into something a man can act on: "from 6 April, in 83 days" is a
// sentence he can plan around. "Effective 2027-04-06" is a database column.
export function daysUntil(effectiveDate: string | null | undefined, now: Date = new Date()): number | null {
  if (phase(effectiveDate, now) !== 'announced') return null;
  const d = new Date(effectiveDate as string);
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

// WHAT THE BRAIN HOLDS. knowledge_items, grouped the way a human asks about it.
export interface Knowledge {
  total: number;
  reviewed: number;    // approved by a human, and therefore the only rows that ever reach a user
  waiting: number;     // distilled and sitting in the queue. Collecting is not learning.
  raw: number;         // not yet distilled
  incidents: number;   // the differ's own open drift/blind rows. Not knowledge, alarms.
  newestAt: string | null;
}

// ⚠️ AN ALLOWLIST, NOT A BLOCKLIST, AND THE DIFFERENCE COST US 82 IMAGINARY FACTS.
//
// This was a blocklist: everything except `drift` and `extractor_broken` counted as knowledge. It
// read as careful. It was not, because a blocklist is a bet that you have thought of every status
// that will ever exist, and the differ had quietly invented one: `resolved`.
//
// `resolved` is what a drift incident becomes when we fix the engine and the constant agrees again.
// It is an alarm that has been switched off. And with a blocklist, every one of them fell through
// into the "things the brain has learned" pile. The console said:
//
//     9 approved. 39 waiting. 0 raw.        <- knowledge(), the allowlisted three
//     "130 things Khoji has learned"        <- growth(), everything that was not drift
//
// Two numbers, one panel, one table, three inches apart, disagreeing by 82. And the 82 were closed
// alarms, so the reading was: OUR TAX ENGINE WENT WRONG AND WAS FIXED, THEREFORE THE BRAIN GREW.
//
// That is exactly the sentence the comment on this function already warned about, and it warned
// about it while the code underneath was doing it.
//
// A status not on this list is not knowledge. If the differ invents another one tomorrow, it does
// not silently become a fact we know.
const KNOWLEDGE_STATUS = new Set(['needs_distillation', 'distilled', 'reviewed', 'actioned']);
const INCIDENT_STATUS = new Set(['drift', 'extractor_broken']);

export const isKnowledge = (i: Item) => KNOWLEDGE_STATUS.has((i.status || '').toLowerCase());
export const isIncident = (i: Item) => INCIDENT_STATUS.has((i.status || '').toLowerCase());

export function knowledge(items: Item[]): Knowledge {
  let reviewed = 0, waiting = 0, raw = 0, incidents = 0;
  let newestAt: string | null = null;

  for (const i of items) {
    const s = (i.status || '').toLowerCase();

    // An incident is not a thing the brain has learned. They share a table because the differ needed
    // somewhere to shout. Counted here, separately, where they belong.
    if (isIncident(i)) { incidents++; continue; }

    // Anything that is neither knowledge nor an OPEN incident (a `resolved` alarm, a `dismissed`
    // item) is simply not counted. It is not a fact and it is not a problem. It is history.
    if (!isKnowledge(i)) continue;

    if (s === 'reviewed' || s === 'actioned') reviewed++;
    else if (s === 'distilled') waiting++;
    else if (s === 'needs_distillation') raw++;

    if (i.created_at && (!newestAt || i.created_at > newestAt)) newestAt = i.created_at;
  }

  return { total: reviewed + waiting + raw, reviewed, waiting, raw, incidents, newestAt };
}

// The brain growing, by day. Real history: a created_at is written once and never rewritten.
export interface Day { day: string; n: number; total: number }

export function growth(items: Item[], days = 30, now: Date = new Date()): Day[] {
  const counts = new Map<string, number>();
  let before = 0;
  const cutoff = new Date(now.getTime() - (days - 1) * 86_400_000);
  cutoff.setUTCHours(0, 0, 0, 0);

  for (const i of items) {
    // THE SAME PREDICATE knowledge() USES. Not a similar one. The last time these two functions each
    // decided for themselves what counted, they disagreed by 82 on the same panel.
    if (!isKnowledge(i)) continue;
    if (!i.created_at) continue;
    const d = new Date(i.created_at);
    if (Number.isNaN(d.getTime())) continue;
    if (d < cutoff) { before++; continue; }
    const key = d.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out: Day[] = [];
  let total = before;   // the running total starts from everything learned BEFORE the window
  for (let k = 0; k < days; k++) {
    const d = new Date(cutoff.getTime() + k * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const n = counts.get(key) ?? 0;
    total += n;
    out.push({ day: key, n, total });
  }
  return out;
}
