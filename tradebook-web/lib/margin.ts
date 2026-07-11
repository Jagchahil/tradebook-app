// The single source of truth for unit economics (11 July 2026).
//
// WHY THIS EXISTS. WhatsApp sends and AI calls are the two variable costs that
// scale with usage, and both used to be capped by hand-picked numbers. Two
// independent budgets can each look affordable and still breach the margin floor
// TOGETHER. So both now draw from ONE budget defined here, and the margin floor
// is a tested property of the system rather than a hope.
//
// It also fixes a growth ceiling: the old caps were flat numbers (4,000 AI calls
// a day for the whole platform), which starve every user once there are real
// users. Ceilings here are DERIVED from the live paying base, so they grow with
// the business while margin stays bounded.
//
// The model, per paying user per month:
//
//   revenue            1075p   (the ANNUAL plan's monthly equivalent, £10.75.
//                               Deliberately the LOWER of our two prices, so an
//                               annual subscriber is never over-spent against.)
//   fixed COGS           49p   (Stripe fees ~40p, Twilio OTP ~4p, infra ~5p)
//   variable budget       ?    (WhatsApp + AI: whatever still clears the floor)
//
//   variable = revenue x (1 - marginTarget) - fixedCogs
//
// Deliberately dependency free (no imports at all), so the whole economics model
// is unit testable in isolation. Everything that spends money reads from here.

// --- the model --------------------------------------------------------------

// Revenue basis: the annual plan's monthly equivalent (£129/12 = £10.75).
export const REVENUE_PENCE_PER_USER_MONTH = 1075;

// Costs that do not vary with how much someone uses the product.
export const FIXED_COGS_PENCE_PER_USER_MONTH = 49;

// The gross margin we refuse to go below. The floor is 80; we run at 82 so there
// is headroom for a price rise by Meta or Anthropic before the floor bites.
const DEFAULT_MARGIN_TARGET_PCT = 82;

// How the variable budget splits. AI gets the larger share on purpose: parsing
// receipts is what customers pay for; a nudge is a retention nicety.
const DEFAULT_WA_SHARE_OF_VARIABLE = 0.40;

// Unit costs, rounded UP so an estimate is never rosier than the bill.
const DEFAULT_COST_PER_SEND_PENCE = 3;   // Meta utility conversation, UK
const DEFAULT_COST_PER_AI_CALL_PENCE = 0.5; // Haiku vision parse carries the bulk

// A small floor so an early, tiny user base still works (spend there is pennies).
export const MIN_DAILY_FLOOR = 500;

// A single user's daily burst ceiling. An ABUSE ceiling, not the budget: real
// people are bursty (a week of receipts photographed on a Sunday), and it is the
// AGGREGATE that protects margin, so one person may run well above the average.
const DEFAULT_USER_DAILY_BURST = 60;

// Read a number from the environment, or fall back.
//
// CAREFUL: Number('') and Number(undefined ?? '') are BOTH 0, so a naive
// `Number(env[name] ?? '')` silently turns every UNSET variable into zero. That
// once made every AI cap resolve to 0, which would have blocked all AI in
// production. Always reject an absent or blank value BEFORE converting.
function envNum(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function marginTargetPct(): number {
  return envNum('MARGIN_TARGET_PCT', DEFAULT_MARGIN_TARGET_PCT, 50, 99);
}
export function waShareOfVariable(): number {
  return envNum('WA_SHARE_OF_VARIABLE', DEFAULT_WA_SHARE_OF_VARIABLE, 0.01, 0.99);
}
export function costPerSendPence(): number {
  return envNum('WA_COST_PER_SEND_PENCE', DEFAULT_COST_PER_SEND_PENCE, 0.01, 100);
}
export function costPerAiCallPence(): number {
  return envNum('AI_COST_PER_CALL_PENCE', DEFAULT_COST_PER_AI_CALL_PENCE, 0.01, 100);
}

// The whole variable allowance (WhatsApp + AI) that still clears the floor. Never
// negative: if fixed costs ever ate the allowance we spend zero rather than
// knowingly sell at a loss.
export function variableBudgetPence(): number {
  const allowedCogs = REVENUE_PENCE_PER_USER_MONTH * (1 - marginTargetPct() / 100);
  return Math.max(allowedCogs - FIXED_COGS_PENCE_PER_USER_MONTH, 0);
}
export function waBudgetPence(): number {
  return variableBudgetPence() * waShareOfVariable();
}
export function aiBudgetPence(): number {
  return variableBudgetPence() * (1 - waShareOfVariable());
}

// The margin we would actually run at, given a month's REAL combined spend. This
// is the only honest number: scoring either budget alone always flatters us.
export function projectedMarginPct(waSpendPence: number, aiSpendPence: number): number {
  const rev = REVENUE_PENCE_PER_USER_MONTH;
  if (rev <= 0) return 0;
  const cogs = Math.max(waSpendPence, 0) + Math.max(aiSpendPence, 0) + FIXED_COGS_PENCE_PER_USER_MONTH;
  return ((rev - cogs) / rev) * 100;
}

// Turn a per-user monthly allowance into a global DAILY ceiling for the live base.
export function dailyCapFor(activeSubscribers: number, perUserPerMonth: number): number {
  const derived = Math.floor((Math.max(activeSubscribers, 0) * Math.max(perUserPerMonth, 0)) / 30);
  return Math.max(derived, MIN_DAILY_FLOOR);
}

// --- WhatsApp (proactive template sends) ------------------------------------
// Meta bills per 24h conversation, so every proactive template opens a billable
// conversation. Inbound SERVICE replies (the user texts first, we answer inside
// the free 24h window) cost nothing and are NOT gated by any of this.

export function sendsPerUserPerMonth(): number {
  const cost = costPerSendPence();
  return cost <= 0 ? 0 : Math.floor(waBudgetPence() / cost);
}
export function waSpendAtFullBudgetPence(): number {
  return sendsPerUserPerMonth() * costPerSendPence();
}

// The day's global send ceiling, derived from the paying base, unless overridden.
export function globalDailyCapFor(activeSubscribers: number): number {
  const override = Number(process.env.WA_SEND_GLOBAL_DAILY ?? '');
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return dailyCapFor(activeSubscribers, sendsPerUserPerMonth());
}

// The emergency brake. Only the exact string "false" disables, so a typo never
// silently mutes real reminders.
export function waSendsEnabled(): boolean {
  return (process.env.WHATSAPP_SENDS_ENABLED ?? '') !== 'false';
}

// Have we reached today's send budget? The caller stops the run when true, so a
// fan-out can overshoot by at most one page.
export function waBudgetExceeded(sentToday: number, cap: number): boolean {
  return sentToday >= cap;
}

// --- AI ---------------------------------------------------------------------

export function callsPerUserPerMonth(): number {
  const cost = costPerAiCallPence();
  return cost <= 0 ? 0 : Math.floor(aiBudgetPence() / cost);
}
export function aiSpendAtFullBudgetPence(): number {
  return callsPerUserPerMonth() * costPerAiCallPence();
}

// The AI caps to enforce, derived from the live paying base. Shape matches AiCaps
// in lib/aicost.ts (structurally typed; kept import free on purpose). An env
// override still wins on any individual cap, so a number can be forced by hand.
export interface DerivedAiCaps {
  killed: boolean;
  globalDaily: number;
  globalMonthly: number;
  userDaily: number;
}

export function aiCapsFor(activeSubscribers: number): DerivedAiCaps {
  const perMonth = callsPerUserPerMonth();
  const subs = Math.max(activeSubscribers, 0);
  const derivedDaily = dailyCapFor(subs, perMonth);
  const derivedMonthly = Math.max(Math.floor(subs * perMonth), MIN_DAILY_FLOOR);
  return {
    killed: (process.env.AI_KILL_SWITCH ?? '').toLowerCase() === 'on',
    // envNum rejects an unset/blank var before converting: see the warning there.
    // An override of 0 is honoured deliberately (a way to hard-stop one dimension).
    globalDaily: envNum('AI_GLOBAL_DAILY', derivedDaily, 0, Number.MAX_SAFE_INTEGER),
    globalMonthly: envNum('AI_GLOBAL_MONTHLY', derivedMonthly, 0, Number.MAX_SAFE_INTEGER),
    userDaily: envNum('AI_USER_DAILY', DEFAULT_USER_DAILY_BURST, 0, Number.MAX_SAFE_INTEGER),
  };
}
