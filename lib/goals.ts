// lib/goals.ts. WHAT HE IS SAVING FOR, AND THE ONE TAX SENTENCE IT EARNS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A man saving for a van is not making a wish list, he is planning a capital purchase, and the
// tax system has a real opinion about when he makes it. This module holds the goal shapes and
// the one deterministic sentence that opinion supports: a van or tools bought for the business
// is a capital item, capital items can come off profit through capital allowances, and buying
// before the year end brings the relief into this year's bill. That is published rule, not
// advice to spend, and the sentence is written once here so every surface says the same words.
//
// ⚠️ NO FIGURES ARE EVER INVENTED. The sentence names no amounts and promises no saving. What a
// claim would actually be worth against his own numbers is lib/taxoptimiser.ts's job, rendered
// on /app/tax/ways-to-save, and the goals page points there rather than doing sums of its own.
// Two calculators that could disagree about one relief is the house disease.
//
// ⚠️ PURE, AND IMPORT FREE ON PURPOSE. No I/O, no clock of its own, no imports at all, so the
// suite loads it under bare node without staging. Same discipline as lib/diary.ts.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The kinds a goal can be. Constrained rather than free text, mirroring the CHECK in the table:
// 'van' and 'tools' are named because they are the capital items the sentence below can honestly
// reason about, and a kind the planner has never heard of would sit in the table looking like a
// plan and doing nothing.
export const GOAL_KINDS = ['van', 'tools', 'pension', 'income', 'other'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export function isGoalKind(x: unknown): x is GoalKind {
  return typeof x === 'string' && (GOAL_KINDS as readonly string[]).includes(x);
}

export type GoalStatus = 'open' | 'done';

export interface Goal {
  id: string;
  kind: GoalKind;
  label: string;
  amountPence: number | null;   // his own figure or nothing. Never estimated.
  targetDate: string | null;    // YYYY-MM-DD
  status: GoalStatus;
  createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}/;

// One raw database row becomes a typed goal, or nothing. A row that fails its shape is dropped
// rather than rendered wrong: a list missing a broken row is a smaller lie than a £NaN.
export function normaliseGoalRow(raw: unknown): Goal | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!UUID.test(id)) return null;
  if (!isGoalKind(r.kind)) return null;
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  if (!label) return null;
  const status = r.status === 'done' ? 'done' : r.status === 'open' ? 'open' : null;
  if (status === null) return null;
  const amount = Number(r.amount_pence);
  return {
    id,
    kind: r.kind,
    label,
    // A missing, zero or broken amount is honestly "he did not say", never zero pounds.
    amountPence: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null,
    targetDate: typeof r.target_date === 'string' && DAY.test(r.target_date) ? r.target_date.slice(0, 10) : null,
    status,
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
  };
}

// Open goals first, the ones with a date sorted soonest, the undated after them in the order he
// wrote them down. Done goals are history and sort newest first.
export function splitGoals(goals: ReadonlyArray<Goal>): { open: Goal[]; done: Goal[] } {
  const open = goals.filter((g) => g.status === 'open');
  const done = goals.filter((g) => g.status === 'done');
  open.sort((a, b) => {
    if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
    if (a.targetDate) return -1;
    if (b.targetDate) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  done.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { open, done };
}

// ── The capital sentence ─────────────────────────────────────────────────────────────────────

// The goals the sentence may speak about: an open van or tools goal with a figure he typed
// himself. Without an amount there is no purchase being planned, only a word, and the sentence
// stays quiet rather than lecturing about a van he never priced.
export function isCapitalGoal(g: Goal): boolean {
  return g.status === 'open' && (g.kind === 'van' || g.kind === 'tools') && g.amountPence !== null;
}

// The honest deterministic tax sentence, or null when no goal earns it. Null is the empty test
// applied to copy: a tax paragraph under a pension goal it does not apply to would teach him to
// stop reading the card that matters. The wording carries its own conditions ("bought for the
// business") and no figures, and the page points at /app/tax/ways-to-save for the sums, which
// are lib/taxoptimiser.ts's to make against his confirmed numbers.
export function capitalNote(goals: ReadonlyArray<Goal>): string | null {
  const capital = goals.filter(isCapitalGoal);
  if (capital.length === 0) return null;
  const hasVan = capital.some((g) => g.kind === 'van');
  const hasTools = capital.some((g) => g.kind === 'tools');
  const subject = hasVan && hasTools
    ? 'A van and tools bought for the business are capital items. Their cost'
    : hasVan
      ? 'A van bought for the business is a capital item. Its cost'
      : 'Tools bought for the business are capital items. Their cost';
  return `${subject} can come off your profit through capital allowances, and buying before the tax year ends brings that relief into this year's bill rather than next.`;
}

// ── The one goals store, and the honest bridge from the old one ──────────────────────────────
//
// ⚠️ THE FOUNDER DECIDED (31 July 2026): ONE GOALS STORE, public.goals, THIS MODULE'S SHAPE.
// user_goals was Rakha's store from doc 82 (kinds purchase, income, savings; pounds; written by
// the WhatsApp paths). Two tables that both mean "what he is saving for" is a second copy of a
// truth, the house disease, so the WhatsApp paths now write goals through the same accessors the
// web uses, and these two functions are the whole translation, written once, tested directly.
//
// 🔴 THE MAPPING IS HONEST, NEVER CLEVER. A legacy 'purchase' goal called "van" is NOT mapped to
// kind 'van': the man never chose from our kinds, and guessing a capital item from a label would
// hand the tax planner a fact nobody stated. So purchase and savings both land in 'other', and
// only 'income' survives as itself. The price is real and accepted: a WhatsApp "van for 24k"
// stops earning the capital sentence until he says so in a kind we can trust. Wrong quietly is
// worse than modest honestly.

// The kinds the legacy user_goals table and the WhatsApp parser speak.
export type LegacyGoalKind = 'purchase' | 'income' | 'savings';

// Legacy kind in, goals table kind out. The same mapping, in the same words, as the row
// migration in supabase/APPLY_2026-07-31_goals_consolidation.sql; if one changes the other must.
export function fromLegacyKind(kind: LegacyGoalKind): GoalKind {
  return kind === 'income' ? 'income' : 'other';
}

// Goals table kind in, legacy kind out, for the readers that still speak doc 82's tongue (the
// optimiser's purchaseGoal, Rakha's purchase filters, the WhatsApp goals answer). 'van' and
// 'tools' ARE planned purchases of capital items, so calling them 'purchase' states a fact and
// keeps the AIA reasoning honest. 'pension' and 'other' are money being put aside for something
// that is not a capital purchase, so they read as 'savings', the kind no tax rule fires on.
export function toLegacyKind(kind: GoalKind): LegacyGoalKind {
  if (kind === 'van' || kind === 'tools') return 'purchase';
  if (kind === 'income') return 'income';
  return 'savings';
}

// ── Words and parsing for the surfaces ───────────────────────────────────────────────────────

// The kind as a row reads it. The label is his own words; this is only the quiet word beside it.
export function kindWord(kind: GoalKind): string {
  if (kind === 'van') return 'a van';
  if (kind === 'tools') return 'tools';
  if (kind === 'pension') return 'pension';
  if (kind === 'income') return 'income';
  return 'a goal';
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "by March 2027". Month and year only: a goal is a horizon, not an appointment, and a full date
// would be precision the fact does not have.
export function targetPhrase(targetDate: string | null): string | null {
  if (!targetDate || !DAY.test(targetDate)) return null;
  const month = Number(targetDate.slice(5, 7));
  const year = targetDate.slice(0, 4);
  const name = MONTHS[month - 1];
  return name ? `by ${name} ${year}` : null;
}

// Pounds as a person types them, into pence, or null. Commas, spaces and a pound sign are
// stripped, then it is money or it is not. Capped at a million pounds because a fat finger
// writes 2400000 more easily than anyone saves it, and floored above zero because a goal
// costing nothing is not an amount, it is the amount field left honest and empty.
export function parseAmountPence(raw: string): number | null {
  const cleaned = raw.replace(/[£,\s]/g, '');
  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  if (!Number.isFinite(pence) || pence <= 0 || pence > 100_000_000) return null;
  return pence;
}
