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
// Deliberately free of IO. Its ONE import is lib/aicost.ts's price book, which is
// itself pure, so the whole economics model stays unit testable in isolation.
// Everything that spends money reads from here.
//
// ⚠️ 31 JULY 2026: THE FLAT 0.5p PER AI CALL ASSUMPTION IS GONE. Every cap this
// file derives used to divide the AI budget by a hand picked 0.5p, while
// lib/aicost.ts sat next door knowing the real per model prices, and NOTHING that
// gates a send ever consulted it. An Anthropic price change would have moved our
// bill and not our caps. costPerAiCallPence() now derives from the aicost.ts
// price book and the call profile below (blended 0.52p at today's prices, so the
// derived AI caps tightened by about 4 percent). AI_COST_PER_CALL_PENCE still
// forces a figure by hand, exactly as before. Deliberate, tested in
// test/margin.test.mjs.
//
// Same day, the WhatsApp side of the gating maths became regime aware: the daily
// proactive ceiling derives from the CONVERSATION price before 1 October 2026 and
// from the PER MESSAGE price after it, so the cap re-derives itself on the day
// with nobody editing anything. Before the change it returns exactly what it
// always did, and a test pins that.
//
// The per customer month (UsageMonth, marginForUsage) is read by lib/messagecost.ts
// and shown BY NAME on /team, so a heavy user is visible months before a Meta
// invoice says it in aggregate.

import { PRICE_PENCE_PER_MTOK, estimateCostPence, type AiModel } from './aicost';

// --- the model --------------------------------------------------------------

// Revenue basis: the annual plan's monthly equivalent (£129/12 = £10.75).
export const REVENUE_PENCE_PER_USER_MONTH = 1075;

// Costs that do not vary with how much someone uses the product.
export const FIXED_COGS_PENCE_PER_USER_MONTH = 49;

// The gross margin we refuse to go below. THE FLOOR IS THE PROMISE; the 82 target
// is the headroom we run with so a price rise by Meta or Anthropic does not bite
// the floor on day one. The floor is exported so the console can read a customer's
// month against the actual promise, not against the comfortable target.
export const MARGIN_FLOOR_PCT = 80;
const DEFAULT_MARGIN_TARGET_PCT = 82;

// How the variable budget splits. AI gets the larger share on purpose: parsing
// receipts is what customers pay for; a nudge is a retention nicety.
const DEFAULT_WA_SHARE_OF_VARIABLE = 0.40;

// Unit costs, rounded UP so an estimate is never rosier than the bill. The AI
// call cost is no longer a flat constant here: see blendedAiCallCostPence below,
// which reads the real per model prices from lib/aicost.ts.
const DEFAULT_COST_PER_SEND_PENCE = 3;   // Meta utility CONVERSATION, UK, pre 1 Oct 2026

// Per MESSAGE, from 1 October 2026. Inferred from industry sources, not from Meta. Set this to the
// real figure once Meta publishes per-market rates, promised for 1 September 2026.
const DEFAULT_COST_PER_MESSAGE_PENCE = 2.2;

// The date the unit changes. Held as a constant rather than hidden in a comment so the model can
// answer "what will this cost us" BEFORE it happens, which is the entire point of having a model.
export const PER_MESSAGE_PRICING_FROM = '2026-10-01';

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

// --- what one AI call really costs -------------------------------------------
//
// The token profile of a typical call, per model. Sourced from lib/claude.ts: the
// Haiku parses cap output at 300 to 500 tokens and carry a receipt photo (about
// 1,600 image tokens) or a short text; the Sonnet accountant answers carry the
// system prompt, the facts and the retrieved knowledge in, and reason before
// answering (max_tokens 4000 there is a ceiling for reasoning bursts, observed
// spend runs well under half of it). Rounded UP so the estimate is never rosier
// than the bill. Re-check against the [ai] logUsage lines when the prompts grow.
export const AI_CALL_TOKENS: Record<AiModel, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 2200, output: 300 },
  'claude-sonnet-5': { input: 5000, output: 1500 },
};

// How the call mix splits. Haiku carries the bulk because receipt and voice
// capture ARE the product; the open ended Sonnet answer is the exception, roughly
// one call in twelve. Overridable so the blend can be re-weighted from the
// console if the observed mix drifts.
const DEFAULT_SONNET_SHARE_OF_CALLS = 0.08;
export function sonnetShareOfCalls(): number {
  return envNum('AI_SONNET_SHARE_OF_CALLS', DEFAULT_SONNET_SHARE_OF_CALLS, 0, 1);
}

// The real cost of one call on one model, read off the lib/aicost.ts price book.
// The book can be injected so a test can prove the caps move when Anthropic's
// prices do, which is the entire point of the wiring.
export function perCallCostPence(
  model: AiModel,
  prices: Record<AiModel, { input: number; output: number }> = PRICE_PENCE_PER_MTOK,
): number {
  const t = AI_CALL_TOKENS[model];
  return estimateCostPence(model, t.input, t.output, prices);
}

// The mix weighted cost of a typical call, rounded UP to the next hundredth of a
// penny. At today's book: 0.3p Haiku, 3p Sonnet, blended 0.52p.
export function blendedAiCallCostPence(
  prices: Record<AiModel, { input: number; output: number }> = PRICE_PENCE_PER_MTOK,
): number {
  const share = sonnetShareOfCalls();
  const blended =
    perCallCostPence('claude-haiku-4-5-20251001', prices) * (1 - share) +
    perCallCostPence('claude-sonnet-5', prices) * share;
  return Math.ceil(blended * 100) / 100;
}

// What the gating maths divides the AI budget by. A hand set
// AI_COST_PER_CALL_PENCE still wins (unchanged behaviour); when it is unset the
// figure comes from the real price book above rather than the old flat 0.5p.
export function costPerAiCallPence(): number {
  return envNum('AI_COST_PER_CALL_PENCE', blendedAiCallCostPence(), 0.01, 100);
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

// --- WhatsApp -----------------------------------------------------------------
//
// 🔴 READ THIS BEFORE TRUSTING ANY NUMBER BELOW. THE BILLING UNIT CHANGES ON 1 OCTOBER 2026.
//
// This section used to end with the sentence: "Inbound SERVICE replies (the user texts first, we
// answer inside the free 24h window) cost nothing and are NOT gated by any of this."
//
// That was true when it was written and it stops being true on 1 October 2026, when Meta begins
// charging for free-form service replies at the same per-message rate as utility and authentication
// templates. So the single largest source of WhatsApp messages in this product was DELIBERATELY
// UNMETERED, on an assumption with an expiry date on it.
//
// ⚠️ AND IT IS NOT A PRICE RISE, IT IS A CHANGE OF UNIT, WHICH IS MUCH WORSE.
//
// Today Meta bills per 24 HOUR CONVERSATION: one charge covers all the back and forth inside the
// window. From 1 October it bills per MESSAGE. So a conversation of twenty messages goes from ONE
// charge of about 3p to TWENTY charges of about 2.2p, which is roughly 44p. That is about fifteen
// times more for a chatty customer, not a modest increase, and it is why "cost scales with
// engagement and revenue does not" is the shape problem rather than the rate being the problem.
//
// ⚠️ THE 2.2p IS INFERRED, NOT OBSERVED. Industry sources quote it for the UK; Meta's own pricing
// page still describes service messages as free. Meta committed to publishing exact per-market
// rates by 1 SEPTEMBER 2026. Check it then and set WA_COST_PER_MESSAGE_PENCE to the real figure.
//
// The strategic answer is not to budget harder, it is to move the conversation off a metered
// channel entirely: the Lekhio thread on the web and in the app, with WhatsApp keeping capture
// (inbound is free for ever) and the few alerts that must be read.

export function sendsPerUserPerMonth(): number {
  const cost = costPerSendPence();
  return cost <= 0 ? 0 : Math.floor(waBudgetPence() / cost);
}
export function waSpendAtFullBudgetPence(): number {
  return sendsPerUserPerMonth() * costPerSendPence();
}

// The day's global send ceiling, derived from the paying base, unless overridden.
//
// REGIME AWARE since 31 July 2026: the ceiling divides the WhatsApp budget by
// whichever unit Meta is actually billing in (waUnitCostPence). Before 1 October
// that is the conversation price and this returns exactly what it always did,
// pinned by test. On the day, it re-derives itself from the per message price
// with nobody editing anything.
export function globalDailyCapFor(activeSubscribers: number, now: Date = new Date()): number {
  const override = Number(process.env.WA_SEND_GLOBAL_DAILY ?? '');
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  return dailyCapFor(activeSubscribers, waUnitsPerUserPerMonth(now));
}

// The emergency brake. Only the exact string "false" disables, so a typo never
// silently mutes real reminders.
//
// ⚠️ THE env PARAMETER EXISTS SO THERE IS ONLY EVER ONE READ OF THIS VARIABLE. lib/routing.ts asks
// this question on behalf of BOTH the reminder cron and the WhatsApp agent's promise. A second
// hand rolled read of WHATSAPP_SENDS_ENABLED somewhere else is precisely how a promise and a send
// drift apart, which is the 10 August fault. Injectable so routing's test can exercise the real
// function rather than a copy of it.
export function waSendsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.WHATSAPP_SENDS_ENABLED ?? '') !== 'false';
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

// --- The 1 October change, modelled ------------------------------------------------------------
//
// Everything here exists so the answer to "what happens to our margin on 1 October" is a number on
// a screen today, rather than a surprise on a statement in November.

export function costPerMessagePence(): number {
  return envNum('WA_COST_PER_MESSAGE_PENCE', DEFAULT_COST_PER_MESSAGE_PENCE, 0.01, 100);
}

// Which billing regime applies. Defaults to the DATE, so this becomes true on its own without
// anybody remembering to flip it, and can be forced either way to model the before and after.
//
// The date is compared as an ISO string on purpose: no timezone, no clock arithmetic, no chance of
// a machine in the wrong region switching a day early or late on something that costs money.
export function perMessagePricing(now: Date = new Date()): boolean {
  const forced = (process.env.WA_PER_MESSAGE_PRICING ?? '').trim().toLowerCase();
  if (forced === 'true') return true;
  if (forced === 'false') return false;
  return now.toISOString().slice(0, 10) >= PER_MESSAGE_PRICING_FROM;
}

// THE PER MESSAGE COST LINE, wired into the gating maths. The billable unit we buy with the
// WhatsApp budget: a 24 hour conversation before 1 October, a single message after it. The daily
// proactive ceiling (globalDailyCapFor) divides by this, so the cap always reflects what Meta will
// actually invoice per unit.
export function waUnitCostPence(now: Date = new Date()): number {
  return perMessagePricing(now) ? costPerMessagePence() : costPerSendPence();
}
export function waUnitsPerUserPerMonth(now: Date = new Date()): number {
  const cost = waUnitCostPence(now);
  return cost <= 0 ? 0 : Math.floor(waBudgetPence() / cost);
}

// What one outbound WhatsApp message actually costs us right now. Before the change a service reply
// is free and only a proactive template opens a billable conversation; after it, every outbound
// message is billed the same whether we started the conversation or he did.
export function outboundCostPence(kind: 'service' | 'proactive', now: Date = new Date()): number {
  if (perMessagePricing(now)) return costPerMessagePence();
  return kind === 'proactive' ? costPerSendPence() : 0;
}

// 🔴 THE NUMBER THIS WHOLE FILE EXISTS TO PRODUCE.
//
// Given how a real customer actually behaves in a month, what margin do we run at? Feed it real
// counts from public.auth_sends and the message log and it stops being a model and becomes a
// measurement. The team console shows it per customer so a heavy user is visible BY NAME, months
// before an aggregate invoice would show it.
export interface UsageMonth {
  // Outbound WhatsApp messages we sent in reply to him, inside his 24 hour window.
  serviceReplies: number;
  // Outbound WhatsApp messages we started: alerts, nudges, anything template based.
  proactiveSends: number;
  aiCalls: number;
}

export function whatsappSpendPence(u: UsageMonth, now: Date = new Date()): number {
  const service = Math.max(0, u.serviceReplies) * outboundCostPence('service', now);
  const proactive = Math.max(0, u.proactiveSends) * outboundCostPence('proactive', now);
  return service + proactive;
}

export function marginForUsage(u: UsageMonth, now: Date = new Date()): number {
  return projectedMarginPct(whatsappSpendPence(u, now), Math.max(0, u.aiCalls) * costPerAiCallPence());
}

// --- observed against modelled outbound (31 July 2026) -----------------------
//
// Outbound sends used to be recorded NOWHERE per customer, so the per customer
// margin could only MODEL one service reply per inbound message. Since 31 July
// 2026 every send Meta accepts becomes a row in public.wa_out (written by
// lib/whatsapp.ts through lib/supabase.ts, this file stays free of IO), and the
// arithmetic below prefers what was observed over what the model guesses.
//
// WHICH MODE IS WHICH, stated plainly:
//
//   OBSERVED  wa_out rows existed for the period. serviceReplies is the counted
//             freeform sends and proactiveSends is the counted template sends
//             (templates are the paid ones). This is a measurement.
//
//   MODELLED  the table was empty or unreadable. The founder pastes SQL by
//             hand, so until supabase/APPLY_2026-07-31_wa_out.sql is run the
//             table does not exist and every read refuses. serviceReplies falls
//             back to one reply per inbound message, the floor of what we
//             actually send, and proactiveSends to zero. This is a guess, and
//             the surface says so.
export interface ObservedOutbound {
  freeform: number;
  template: number;
}
export type OutboundMode = 'observed' | 'modelled';

// Whether a period's wa_out read should be preferred: any rows at all means the
// counter is live and observation wins. null (unreadable or missing table) or
// zero (counter not recording yet) means fall back to the model.
export function preferObserved(readTotal: number | null | undefined): boolean {
  return typeof readTotal === 'number' && readTotal > 0;
}

export function usageForMargin(
  observed: ObservedOutbound | null,
  inboundMessages: number,
  aiCalls: number,
): { usage: UsageMonth; mode: OutboundMode } {
  const calls = Math.max(0, aiCalls);
  if (observed) {
    return {
      usage: {
        serviceReplies: Math.max(0, observed.freeform),
        proactiveSends: Math.max(0, observed.template),
        aiCalls: calls,
      },
      mode: 'observed',
    };
  }
  return {
    usage: { serviceReplies: Math.max(0, inboundMessages), proactiveSends: 0, aiCalls: calls },
    mode: 'modelled',
  };
}

// How many outbound messages a month a single customer can have before HE ALONE breaches the floor.
// Not a cap to enforce, a number to look at: when it drops into the range a normal customer reaches,
// the channel is the wrong shape and no amount of budgeting fixes it.
export function messagesBeforeFloorBreached(aiCalls: number, now: Date = new Date()): number {
  const perMessage = outboundCostPence('service', now);
  if (perMessage <= 0) return Number.POSITIVE_INFINITY;
  const allowed = REVENUE_PENCE_PER_USER_MONTH * (1 - marginTargetPct() / 100);
  const left = allowed - FIXED_COGS_PENCE_PER_USER_MONTH - Math.max(0, aiCalls) * costPerAiCallPence();
  return Math.max(0, Math.floor(left / perMessage));
}
