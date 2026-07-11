// Tests for lib/margin.ts, the single source of truth for unit economics, plus
// the spend decision in lib/aicost.ts.
//
// The point of this suite: the MARGIN FLOOR is a tested property of the COMBINED
// WhatsApp + AI spend. Two budgets can each look affordable and together sink the
// business, which is exactly why they share one model. Pure, no network.
// Run: node test/margin.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => import(`${pathToFileURL(path.resolve(here, `../lib/${f}`)).href}`);
const G = await load('margin.ts');   // the economics
const A = await load('aicost.ts');   // the spend decision

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const withEnv = (vars, fn) => {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};
const CLEAN = {
  MARGIN_TARGET_PCT: undefined, WA_SHARE_OF_VARIABLE: undefined,
  WA_COST_PER_SEND_PENCE: undefined, AI_COST_PER_CALL_PENCE: undefined,
  WA_SEND_GLOBAL_DAILY: undefined, AI_GLOBAL_DAILY: undefined, AI_GLOBAL_MONTHLY: undefined,
  AI_USER_DAILY: undefined, AI_KILL_SWITCH: undefined, WHATSAPP_SENDS_ENABLED: undefined,
};

console.log('\n=== THE FLOOR: WhatsApp + AI TOGETHER must clear 80% ===\n');
withEnv(CLEAN, () => {
  const wa = G.waSpendAtFullBudgetPence();
  const ai = G.aiSpendAtFullBudgetPence();
  const margin = G.projectedMarginPct(wa, ai);
  ok(`BOTH budgets spent in full still clears 80% (actual ${margin.toFixed(1)}%)`, margin >= 80);
  ok(`clears the 82% target with headroom (actual ${margin.toFixed(1)}%)`, margin >= 81.5);
  ok('neither budget is zero (the product actually works)', wa > 0 && ai > 0);
  ok('AI gets the larger share (receipts are what people pay for)', ai > wa);
});

// The trap this shared model exists to prevent.
withEnv(CLEAN, () => {
  const wa = G.waSpendAtFullBudgetPence();
  const ai = G.aiSpendAtFullBudgetPence();
  const waAlone = G.projectedMarginPct(wa, 0);
  ok('either budget ALONE looks very healthy (this is the trap)', waAlone > 90);
  ok('scoring them TOGETHER is the only honest number, and it is lower', G.projectedMarginPct(wa, ai) < waAlone);
});

console.log('\n=== the floor holds when suppliers raise prices ===\n');
const combined = () => G.projectedMarginPct(G.waSpendAtFullBudgetPence(), G.aiSpendAtFullBudgetPence());
ok('holds if Meta DOUBLES the send price', withEnv({ ...CLEAN, WA_COST_PER_SEND_PENCE: '6' }, () => combined() >= 80));
ok('holds if Anthropic DOUBLES the call price', withEnv({ ...CLEAN, AI_COST_PER_CALL_PENCE: '1' }, () => combined() >= 80));
ok('holds if BOTH double at once', withEnv({ ...CLEAN, WA_COST_PER_SEND_PENCE: '6', AI_COST_PER_CALL_PENCE: '1' }, () => combined() >= 80));
ok('a dearer send buys FEWER sends, it does not raise the bill',
  withEnv({ ...CLEAN, WA_COST_PER_SEND_PENCE: '6' }, () => G.sendsPerUserPerMonth()) <
  withEnv({ ...CLEAN, WA_COST_PER_SEND_PENCE: '3' }, () => G.sendsPerUserPerMonth()));
ok('a dearer AI call buys FEWER calls, it does not raise the bill',
  withEnv({ ...CLEAN, AI_COST_PER_CALL_PENCE: '1' }, () => G.callsPerUserPerMonth()) <
  withEnv({ ...CLEAN, AI_COST_PER_CALL_PENCE: '0.5' }, () => G.callsPerUserPerMonth()));

console.log('\n=== the margin target really is the dial ===\n');
ok('asking for 90% margin shrinks the budget',
  withEnv({ ...CLEAN, MARGIN_TARGET_PCT: '90' }, () => G.variableBudgetPence()) <
  withEnv({ ...CLEAN, MARGIN_TARGET_PCT: '82' }, () => G.variableBudgetPence()));
ok('a target so high that fixed costs eat it yields ZERO variable spend, not a negative',
  withEnv({ ...CLEAN, MARGIN_TARGET_PCT: '99' }, () => G.variableBudgetPence() === 0));
ok('the two halves add back up to the whole budget',
  withEnv(CLEAN, () => Math.abs((G.waBudgetPence() + G.aiBudgetPence()) - G.variableBudgetPence()) < 0.001));

console.log('\n=== ceilings scale with the paying base (the growth ceiling is gone) ===\n');
withEnv(CLEAN, () => {
  // The bug this replaces: a flat 4,000/day global AI cap would starve everyone
  // after roughly the first 800 users' worth of activity at 100k users.
  const ai1k = G.aiCapsFor(1000).globalDaily;
  const ai100k = G.aiCapsFor(100000).globalDaily;
  ok('AI daily ceiling at 100k is ~100x the ceiling at 1k', ai100k > 50 * ai1k);
  ok('AI ceiling at 100k is far above the old flat 4,000', ai100k > 4000);
  ok('WhatsApp ceiling likewise scales with the base', G.globalDailyCapFor(100000) > 50 * G.globalDailyCapFor(1000));
  ok('a brand new/zero base still gets the small working floor', G.aiCapsFor(0).globalDaily === G.MIN_DAILY_FLOOR);
  ok('a negative/garbage count cannot produce a negative ceiling', G.globalDailyCapFor(-100) === G.MIN_DAILY_FLOOR);
  ok('one user still gets a generous daily burst allowance (people are bursty)', G.aiCapsFor(100000).userDaily >= 30);
  ok('the monthly AI ceiling also scales with the base', G.aiCapsFor(100000).globalMonthly > G.aiCapsFor(1000).globalMonthly);
});

console.log('\n=== switches and hard overrides ===\n');
ok('AI kill switch stops all spend', withEnv({ ...CLEAN, AI_KILL_SWITCH: 'on' }, () => G.aiCapsFor(100000).killed === true));
ok('WhatsApp kill switch stops all proactive sends', withEnv({ ...CLEAN, WHATSAPP_SENDS_ENABLED: 'false' }, () => G.waSendsEnabled() === false));
ok('WhatsApp defaults to enabled when unset (a typo never mutes reminders)', withEnv(CLEAN, () => G.waSendsEnabled() === true));
ok('a hard AI daily override wins', withEnv({ ...CLEAN, AI_GLOBAL_DAILY: '77' }, () => G.aiCapsFor(100000).globalDaily === 77));
ok('a hard WhatsApp daily override wins', withEnv({ ...CLEAN, WA_SEND_GLOBAL_DAILY: '88' }, () => G.globalDailyCapFor(100000) === 88));

console.log('\n=== waBudgetExceeded (the stop decision) ===\n');
ok('not exceeded below the cap', G.waBudgetExceeded(9999, 10000) === false);
ok('exceeded exactly at the cap', G.waBudgetExceeded(10000, 10000) === true);
ok('exceeded above the cap', G.waBudgetExceeded(10001, 10000) === true);
ok('zero sent is never exceeded', G.waBudgetExceeded(0, 10000) === false);

console.log('\n=== decideSpend fails closed, in the right order ===\n');
withEnv(CLEAN, () => {
  const caps = G.aiCapsFor(100000);
  ok('a healthy call is allowed', A.decideSpend({ globalDay: 0, globalMonth: 0, userDay: 0 }, caps).allowed === true);
  ok('kill switch beats everything', A.decideSpend({ globalDay: 0, globalMonth: 0, userDay: 0 }, { ...caps, killed: true }).reason === 'kill_switch');
  ok('global daily cap blocks', A.decideSpend({ globalDay: caps.globalDaily, globalMonth: 0, userDay: 0 }, caps).reason === 'global_daily_cap');
  ok('global monthly cap blocks', A.decideSpend({ globalDay: 0, globalMonth: caps.globalMonthly, userDay: 0 }, caps).reason === 'global_monthly_cap');
  ok('one abuser hits the per-user cap without stopping everyone else', A.decideSpend({ globalDay: 0, globalMonth: 0, userDay: caps.userDaily }, caps).reason === 'user_daily_cap');
});

console.log('\n=== the real allowances, stated ===\n');
withEnv(CLEAN, () => {
  const sends = G.sendsPerUserPerMonth();
  const calls = G.callsPerUserPerMonth();
  // A 3x-a-week nudge (13/mo) + the weekly summary (4.3/mo) must actually FIT, or
  // we would be silently throttling our own product.
  ok(`the nudge (3x/week) + weekly summary fits the send budget (${sends}/mo)`, sends >= 18);
  ok(`a user can parse a real day's receipts (${calls}/mo, ~${(calls / 30).toFixed(1)}/day)`, calls / 30 >= 5);
});

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
