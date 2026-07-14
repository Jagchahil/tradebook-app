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

export type Pulse = 'checking' | 'wrong' | 'blind' | 'unwatched' | 'never';

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

export function vitals(runs: Run[], now: Date = new Date()): Vitals {
  const last = runs[0];   // the reader hands them newest first

  // NEVER. Not "fine". This is the state the whole heartbeat exists to make visible: no incident
  // rows, nothing wrong anywhere, and nothing has ever looked.
  if (!last) {
    return {
      ...EMPTY,
      pulse: 'never',
      says: 'Nothing has ever compared our tax constants to GOV.UK. We are not saying we are wrong. We are saying nobody has looked.',
    };
  }

  const hours = (now.getTime() - new Date(last.ran_at).getTime()) / 3_600_000;
  const base = {
    lastRunAt: last.ran_at,
    hoursAgo: Math.max(0, Math.round(hours)),
    published: last.published,
    checked: last.checked,
    agreed: last.agreed,
    drifted: last.drifted,
    blind: last.blind,
    unwatched: last.unwatched ?? [],
  };

  // ORDER IS THE ARGUMENT, and it is the same order as the alarms.
  //
  // WRONG beats BLIND beats NOBODY IS LOOKING beats fine. Being wrong is worse than not knowing,
  // and not knowing is worse than a quiet night. What must never happen is any of the three
  // arriving dressed as the fourth.
  if (last.drifted > 0) {
    return { ...base, pulse: 'wrong',
      says: `${last.drifted} of our tax constants disagree with GOV.UK right now. The engine is wrong and every figure resting on it is wrong.` };
  }
  if (last.blind > 0) {
    return { ...base, pulse: 'blind',
      says: `${last.blind} constants could not be read off their GOV.UK page. We do not know whether we are right about them, and a differ that reports "all clear" when it cannot see is lying by omission.` };
  }
  if (hours > STALE_HOURS) {
    return { ...base, pulse: 'unwatched',
      says: `Nothing has checked our tax constants for ${Math.round(hours)} hours. It runs nightly. It has stopped.` };
  }

  return { ...base, pulse: 'checking',
    says: `${last.agreed} of ${last.checked} constants were compared to their GOV.UK page and every one matched.` };
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

// WHAT THE BRAIN HOLDS. knowledge_items, grouped the way a human asks about it.
export interface Knowledge {
  total: number;
  reviewed: number;    // approved by a human, and therefore the only rows that ever reach a user
  waiting: number;     // distilled and sitting in the queue. Collecting is not learning.
  raw: number;         // not yet distilled
  incidents: number;   // the differ's own open drift/blind rows. Not knowledge, alarms.
  newestAt: string | null;
}

const INCIDENT = new Set(['drift', 'extractor_broken']);

export function knowledge(items: Item[]): Knowledge {
  let reviewed = 0, waiting = 0, raw = 0, incidents = 0;
  let newestAt: string | null = null;

  for (const i of items) {
    const s = (i.status || '').toLowerCase();

    // ⚠️ AN INCIDENT IS NOT A THING THE BRAIN HAS LEARNED. They share a table because the differ
    // needed somewhere to shout, and if they are counted together then the day our tax engine goes
    // wrong is the day the console reports that the brain grew.
    if (INCIDENT.has(s)) { incidents++; continue; }

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
    if (INCIDENT.has((i.status || '').toLowerCase())) continue;   // alarms are not growth
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
