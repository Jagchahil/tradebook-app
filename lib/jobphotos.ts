// lib/jobphotos.ts. WHAT A JOB WAS: THE PICTURES, THE HOURS AND WHAT IT COST HIM TO DO IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The diary knows a job was booked. This module holds the three decisions about what the job
// actually was, and performs none of them. The page renders, lib/supabase.ts reads and writes,
// and every judgement that could be wrong is made here on fixtures a test can attack.
//
// ⚠️ PURE, AND IMPORT FREE ON PURPOSE, the same property lib/diary.ts and lib/tokens.ts protect.
// No I/O, no database, no clock of its own: hoursFromSlot takes the two timestamps and
// materialsTotal takes the rows. The suite loads it under bare node with no staging.
//
// 🔴 THE THREE THINGS THIS FILE REFUSES TO DO, AND WHY EACH REFUSAL IS THE FEATURE.
//
//   IT NEVER INVENTS A FIGURE.   materialsTotal sums rows that are CONFIRMED and are COSTS, and
//                                counts nothing else. An unconfirmed receipt is a photograph he
//                                has not looked at yet, and putting it into a total on a job
//                                screen is the product deciding something he was going to be
//                                asked about.
//
//   IT NEVER WRITES A CAPTION.   captionOrNull trims what he typed and otherwise returns null. A
//                                caption nobody wrote is worth more empty than filled in by us,
//                                and a generated one is us describing his work back to him.
//
//   IT NEVER LETS HOURS BECOME MONEY. hoursFromSlot returns what the diary was told, and
//                                hoursGuessPhrase says out loud that it is a guess. See the
//                                block above hoursGuessPhrase: this is the one number on the job
//                                screen that is not a fact, and it sits next to totals that are.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const HOUR_MS = 3_600_000;

// ── His words about a picture, or nothing ────────────────────────────────────────────────────
//
// 120 characters because it is a note beside a photograph, not a description of the job. The job
// already has a title he typed. Whitespace only comes back null rather than as an empty string,
// so the column holds either something he wrote or nothing at all, and the page never has to
// tell the difference between "" and null.
export const CAPTION_MAX = 120;

export function captionOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().slice(0, CAPTION_MAX);
  return t.length > 0 ? t : null;
}

// ── The hours, and the sentence that admits what they are ────────────────────────────────────
//
// 🔴 THIS IS THE ONLY NUMBER ON THE JOB SCREEN THAT IS A GUESS, AND IT SITS BESIDE TOTALS THAT
// ARE NOT. The materials figure below it is summed from receipts he confirmed one at a time. The
// hours are the length of a slot he picked off a drop down before he did the work, and a job
// booked as "half a day" that took him until eight at night is four hours in this database and
// nine hours in his memory. Printed as a bare "11h" next to a real money total it LOOKS equally
// solid, and the man reading it has no way to tell which of the two figures the product actually
// knows.
//
// So the phrase says "About", and it says where it came from, and the screen puts an edit beside
// it. He corrects it by moving the slot, which is the single copy of the truth about when the job
// ran: a second stored "actual hours" column would be a second answer to one question, and the
// two would disagree within a month.
//
// ⚠️ AND IT MAY NEVER FEED A MONEY FIGURE WITHOUT HIM TOUCHING IT FIRST. Nothing in this
// codebase multiplies these hours by a rate, and test/jobdiary.test.mjs holds that line: an hours
// figure that quietly became an invoice total would be the product inventing what he earned.

export function hoursFromSlot(startsAt: string, endsAt: string): number | null {
  const a = Date.parse(startsAt);
  const b = Date.parse(endsAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const ms = b - a;
  if (ms <= 0) return null;
  // Rounded to the nearest hour and never below one. A slot is booked in hours and days off a
  // short list, so a fraction here is a rounding artefact rather than something he chose.
  return Math.max(1, Math.round(ms / HOUR_MS));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A DAY'S CLEANING IS NOT TWENTY FOUR HOURS. Run 6, 14 August 2026.
//
// A job booked as "One day" at 8:30am read, on the job screen: "About 24h, from your diary". The
// same job read "one day" correctly two lines above it in the diary list. Both came off the same
// pair of timestamps.
//
// The two halves of parseDurationHours() in lib/diary.ts mean different things by an hour. Below a
// day it stores WORKING hours, which is why half a day is 4. At a day and above it stores CALENDAR
// hours, because a day job occupies the day on a diary and the week strip has to place it. Half of
// one day is four hours on one branch and twelve on the other.
//
// ⚠️ AND THE SLOT IS NOT THE THING TO CHANGE. Compressing a two day job into sixteen contiguous
// working hours would end it at midnight on the first day, and the week strip, "Coming up" and the
// job_soon nudge all place jobs off that slot. The calendar is right. The SENTENCE was wrong.
//
// So below a day this still says hours, which is what he booked and what he means. At a day and
// over it says the same words the diary list says, because that is what the slot actually knows.
// One booking cannot be described two ways on two screens: that was the whole finding.
//
// ⚠️ THERE IS STILL NO EIGHT HOUR OPTION on either duration list, so a man who wants to say "a
// working day" rather than "a day" cannot. That is deliberately NOT fixed here. It is a change to
// what the product offers rather than to what it says, doc 103 asks what comes off the screen to
// make room, and it is not answerable from a defect report.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE WORDS FOR A DAY OR MORE ARE PASSED IN, NOT IMPORTED. durationPhrase lives in lib/diary.ts
// and this module is IMPORT FREE ON PURPOSE, which is not a style preference: test/jobdiary.test.mjs
// imports this file DIRECTLY off disk with no staging and no specifier rewriting, so a single
// import here fails the whole suite with a module not found. The header four lines up says so and
// I added one anyway on the first attempt. The caller already holds the phrase the diary list is
// drawn from, so handing it over costs nothing and keeps both properties.
export function hoursGuessPhrase(hours: number | null, dayPhrase?: string | null): string | null {
  if (hours === null) return null;
  if (hours >= 24) return dayPhrase ? `About ${dayPhrase}, from your diary` : null;
  return `About ${hours}h, from your diary`;
}

// ── What the job cost him, off rows he has already confirmed ─────────────────────────────────
//
// ⚠️ CONFIRMED AND A COST. Two filters, both of them load bearing.
//
// Confirmed, because an unconfirmed row is a receipt sitting in his pile waiting to be looked at.
// Counting it here would put a figure on the job screen that changes by itself when he gets round
// to the pile, and a total that moves without him doing anything is a total he stops believing.
//
// A cost, because amount is signed and income is positive: an invoice payment that happened to be
// tagged to this job is money IN, and adding it to a materials total would net his own earnings
// off against what he spent and print the difference as though it were what the job cost him.
//
// The sum is of absolute values, so the total reads as a positive amount of money spent, which is
// what "materials" means to the man reading it.

export interface JobCostRow {
  amount: number | string | null;
  confirmed?: boolean | null;
}

export interface MaterialsTotal {
  // What he has confirmed spending against this job, positive pounds.
  total: number;
  // How many rows that came off, so the screen can say "from 3 receipts" rather than assert a
  // figure with no provenance.
  count: number;
  // Rows tagged to the job that he has NOT confirmed yet. Never in the total, and named
  // separately so the screen can point him at his pile instead of pretending they do not exist.
  waiting: number;
}

export function materialsTotal(rows: ReadonlyArray<JobCostRow>): MaterialsTotal {
  let total = 0;
  let count = 0;
  let waiting = 0;
  for (const r of rows) {
    const n = Number(r?.amount);
    if (!Number.isFinite(n) || n === 0) continue;
    // Income tagged to a job is not what the job cost. Skipped entirely, in both counts.
    if (n > 0) continue;
    if (r?.confirmed === true) {
      total += Math.abs(n);
      count += 1;
    } else {
      waiting += 1;
    }
  }
  // Pennies, kept honest. Floating point addition of 12.30 and 47.20 lands a hair off, and a
  // materials total that prints 59.499999 is a total somebody has to explain.
  return { total: Math.round(total * 100) / 100, count, waiting };
}
