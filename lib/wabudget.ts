// Proactive WhatsApp send budget, derived from the MARGIN TARGET (scale audit,
// 11 July 2026). Meta template sends are the single biggest uncapped cost at
// scale: a daily nudge to 100k users is 100k billable conversations a day.
//
// The controls, in order of what actually protects the business:
//
//   1. MARGIN-DERIVED CAP (the real guard). WhatsApp cost scales per user, and
//      so does revenue, so a fixed global number does NOT protect margin as the
//      base grows. Instead we allow each paying user a share of their own
//      revenue in proactive sends, and derive the day's global ceiling from the
//      live subscriber count. Margin is then bounded by construction, at any
//      size, without anyone tuning a number.
//   2. KILL SWITCH (WHATSAPP_SENDS_ENABLED=false). Stops all proactive sends
//      immediately, no code deploy, as an emergency brake.
//   3. HARD OVERRIDE (WA_SEND_GLOBAL_DAILY). A manual absolute ceiling that
//      wins if set, for belt and braces.
//
// Inbound SERVICE replies (the user texts first, we answer inside Meta's free
// 24h window) are FREE and are NOT gated by any of this. This governs only
// proactive, business-initiated template sends.
//
// Pure functions, no IO, so the economics are unit tested rather than trusted.

// --- the economics ----------------------------------------------------------

// What we charge, per user per month, in pence. Mirrors PRICE_PENCE.monthly in
// lib/stripe.ts. Annual users pay less per month (£129/12 = £10.75), so using
// the monthly price would overstate their revenue: we deliberately use the
// LOWER annual-equivalent as the safe basis, so the budget is never optimistic.
const SAFE_REVENUE_PENCE_PER_USER_MONTH = 1075; // £10.75, the annual plan's monthly equivalent

// What one proactive template send costs us, in pence. Meta bills per 24h
// conversation, UK utility. Rounded UP so we under-spend rather than over.
const DEFAULT_COST_PER_SEND_PENCE = 3;

// The share of a user's revenue we are willing to spend on proactive WhatsApp.
// This is the dial that sets the margin floor. At 10%, WhatsApp can never cost
// more than a tenth of revenue however many messages the product wants to send.
const DEFAULT_WA_REVENUE_SHARE = 0.10;

export function costPerSendPence(): number {
  const n = Number(process.env.WA_COST_PER_SEND_PENCE ?? '');
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_COST_PER_SEND_PENCE;
}

export function waRevenueShare(): number {
  const n = Number(process.env.WA_REVENUE_SHARE ?? '');
  return Number.isFinite(n) && n > 0 && n < 1 ? n : DEFAULT_WA_REVENUE_SHARE;
}

// How many proactive sends one paying user's revenue affords in a month, at the
// configured revenue share. This is the number that keeps margin honest.
export function sendsPerUserPerMonth(
  revenuePence: number = SAFE_REVENUE_PENCE_PER_USER_MONTH,
  share: number = waRevenueShare(),
  costPence: number = costPerSendPence(),
): number {
  if (costPence <= 0) return 0;
  return Math.floor((revenuePence * share) / costPence);
}

// The day's global ceiling on proactive sends, derived from the live paying
// base. A small floor so a tiny early user base still gets its reminders (the
// absolute spend there is pennies), and a hard env override if set.
const MIN_DAILY_FLOOR = 500;

export function globalDailyCapFor(activeSubscribers: number): number {
  const override = Number(process.env.WA_SEND_GLOBAL_DAILY ?? '');
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  const perMonth = sendsPerUserPerMonth();
  const derived = Math.floor((Math.max(activeSubscribers, 0) * perMonth) / 30);
  return Math.max(derived, MIN_DAILY_FLOOR);
}

// The margin we would run at, as a percentage, given a month's WhatsApp sends
// and the other known per-user costs. Exported so the economics are testable and
// so a report can state the real number rather than a guess.
//
// Other COGS per user per month, in pence (from the 100k cost model, doc 94):
//   Stripe fees ~40p, Anthropic AI ~9p (hard capped), Twilio OTP ~4p, infra ~5p.
const OTHER_COGS_PENCE_PER_USER_MONTH = 58;

export function projectedMarginPct(
  sendsPerUserMonth: number,
  revenuePence: number = SAFE_REVENUE_PENCE_PER_USER_MONTH,
  costPence: number = costPerSendPence(),
  otherCogsPence: number = OTHER_COGS_PENCE_PER_USER_MONTH,
): number {
  if (revenuePence <= 0) return 0;
  const cogs = sendsPerUserMonth * costPence + otherCogsPence;
  return ((revenuePence - cogs) / revenuePence) * 100;
}

// --- the switches -----------------------------------------------------------

// Is proactive sending on at all? Defaults to true; only the exact string
// "false" disables, so a missing var never silently mutes real reminders.
export function waSendsEnabled(): boolean {
  return (process.env.WHATSAPP_SENDS_ENABLED ?? '') !== 'false';
}

// Have we reached today's proactive send budget? Pure. The caller stops the run
// when true, so a fan-out can overshoot by at most one page.
export function waBudgetExceeded(sentToday: number, cap: number): boolean {
  return sentToday >= cap;
}
