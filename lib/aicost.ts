// lib/aicost.ts. Central cost governance for every AI call.
//
// The philosophy: the Anthropic console monthly cap is the outer wall (a spend
// there simply cannot be exceeded), but we never want to lean on it. These are
// the in-code rings inside that wall, so the app throttles itself long before
// the console ever bites, and so a runaway loop or an abusive user hits a wall
// in milliseconds, not pounds.
//
// Five controls:
//   1. Kill switch. AI_KILL_SWITCH=on disables every AI call instantly, no deploy.
//   2. Global daily cap. Total AI calls per day across all users.
//   3. Global monthly cap. Total per calendar month (the console cap's twin).
//   4. Per user daily cap. One person can never drain the shared budget.
//   5. Model tiering + cost estimate, so spend is visible and Haiku carries the
//      bulk while Sonnet is reserved for answers where a wrong reply costs more
//      than the tokens.
//
// This module is pure and deterministic. The live counters come from the
// existing ai_usage table via bumpAiUsage; decideSpend just judges the numbers,
// which is what makes it unit testable.

export type AiModel = 'claude-haiku-4-5-20251001' | 'claude-sonnet-5';

// Approximate list price in pence per 1,000,000 tokens, input and output. Rounded
// up deliberately so our estimate is never rosier than the bill. Re-check at any
// Anthropic pricing change (Khoji will flag it).
export const PRICE_PENCE_PER_MTOK: Record<AiModel, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 80, output: 400 },
  'claude-sonnet-5': { input: 240, output: 1200 },
};

// A rough pence cost for one call, for logging and for the monthly projection.
export function estimateCostPence(model: AiModel, inputTokens: number, outputTokens: number): number {
  const p = PRICE_PENCE_PER_MTOK[model];
  if (!p) return 0;
  const pence = (Math.max(0, inputTokens) * p.input + Math.max(0, outputTokens) * p.output) / 1_000_000;
  return Math.round(pence * 100) / 100;
}

export interface AiCaps {
  killed: boolean;
  globalDaily: number; // max AI calls per day, everyone combined
  globalMonthly: number; // max AI calls per calendar month
  userDaily: number; // max AI calls per user per day
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Resolve the caps from the environment, with conservative defaults that are
// generous for real use but lethal to a runaway loop. Tune per launch scale.
export function resolveCaps(env: Record<string, string | undefined> = process.env): AiCaps {
  return {
    killed: (env.AI_KILL_SWITCH ?? '').toLowerCase() === 'on',
    globalDaily: num(env.AI_GLOBAL_DAILY, 5000),
    globalMonthly: num(env.AI_GLOBAL_MONTHLY, 60000),
    userDaily: num(env.AI_USER_DAILY, 40),
  };
}

export interface SpendCounts {
  globalDay: number; // calls already made today, all users
  globalMonth: number; // calls already made this month, all users
  userDay: number; // calls already made today by this user
}

export type SpendReason = 'ok' | 'kill_switch' | 'global_daily_cap' | 'global_monthly_cap' | 'user_daily_cap';

export interface SpendDecision {
  allowed: boolean;
  reason: SpendReason;
}

// The pure decision. Counts are the values BEFORE this call. Order matters: the
// kill switch and the global caps are checked before the per-user cap, so a
// system-wide stop always wins. A count that equals the cap blocks (the cap is
// the number of calls allowed, so the Nth+1 is refused).
export function decideSpend(counts: SpendCounts, caps: AiCaps): SpendDecision {
  if (caps.killed) return { allowed: false, reason: 'kill_switch' };
  if (counts.globalDay >= caps.globalDaily) return { allowed: false, reason: 'global_daily_cap' };
  if (counts.globalMonth >= caps.globalMonthly) return { allowed: false, reason: 'global_monthly_cap' };
  if (counts.userDay >= caps.userDaily) return { allowed: false, reason: 'user_daily_cap' };
  return { allowed: true, reason: 'ok' };
}

// True when AI is usable at all: a key is configured and the kill switch is off.
// Call this at the top of every AI entry point so the switch is real.
export function aiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) && (env.AI_KILL_SWITCH ?? '').toLowerCase() !== 'on';
}
