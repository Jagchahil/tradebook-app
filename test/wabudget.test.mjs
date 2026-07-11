// Tests for lib/wabudget.ts, the proactive WhatsApp send budget (scale audit,
// 11 July 2026). The point of this suite is that the MARGIN is a tested property,
// not a hope: the send ceiling is derived from revenue, so WhatsApp spend cannot
// outgrow the business. Pure, no network. Helpers read env at CALL time, so we
// set process.env around each call. Run: node test/wabudget.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const M = await import(`${pathToFileURL(path.resolve(here, '../lib/wabudget.ts')).href}`);

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
// Clean slate: no overrides unless a test sets them.
const CLEAN = { WA_SEND_GLOBAL_DAILY: undefined, WA_COST_PER_SEND_PENCE: undefined, WA_REVENUE_SHARE: undefined, WHATSAPP_SENDS_ENABLED: undefined };

console.log('\n=== THE MARGIN FLOOR (the whole point) ===\n');
// The business rule: proactive WhatsApp must never drag gross margin below 80%.
withEnv(CLEAN, () => {
  const perMonth = M.sendsPerUserPerMonth();
  const margin = M.projectedMarginPct(perMonth);
  ok('a user gets a sane number of proactive sends a month', perMonth > 0 && perMonth < 200);
  ok(`margin at the full budget stays above 80% (actual ${margin.toFixed(1)}%)`, margin > 80);
  ok('margin at the full budget is comfortably above 80%, not scraping it', margin > 84);
});

// Even if Meta doubles its price, the ceiling shrinks and the floor holds.
withEnv({ ...CLEAN, WA_COST_PER_SEND_PENCE: '6' }, () => {
  const perMonth = M.sendsPerUserPerMonth();
  const margin = M.projectedMarginPct(perMonth);
  ok(`margin holds above 80% even if the send price DOUBLES (actual ${margin.toFixed(1)}%)`, margin > 80);
  ok('a dearer send buys fewer messages, it does not cost more', perMonth < M.sendsPerUserPerMonth(undefined, undefined, 3));
});

// The revenue share is the dial that sets the floor. Push it too far and margin
// should fall, which proves the dial is really the thing controlling margin.
withEnv({ ...CLEAN, WA_REVENUE_SHARE: '0.5' }, () => {
  const margin = M.projectedMarginPct(M.sendsPerUserPerMonth());
  ok('a reckless 50% revenue share WOULD break the floor (proves the dial is live)', margin < 80);
});

console.log('\n=== the ceiling scales with the paying base ===\n');
withEnv(CLEAN, () => {
  const perMonth = M.sendsPerUserPerMonth();
  ok('100k users get roughly 100k x monthly-allowance / 30 per day',
    M.globalDailyCapFor(100000) === Math.floor((100000 * perMonth) / 30));
  ok('10x the users means 10x the daily ceiling (margin is size independent)',
    M.globalDailyCapFor(100000) === 10 * Math.floor((10000 * perMonth) / 30) ||
    Math.abs(M.globalDailyCapFor(100000) - 10 * M.globalDailyCapFor(10000)) <= 10);
  ok('zero paying users still allows the small floor (pennies, keeps reminders working)',
    M.globalDailyCapFor(0) === 500);
  ok('a tiny base is floored, not zeroed', M.globalDailyCapFor(5) === 500);
  ok('a negative/garbage count cannot produce a negative ceiling', M.globalDailyCapFor(-100) === 500);
});

console.log('\n=== the manual override and kill switch ===\n');
ok('WA_SEND_GLOBAL_DAILY hard-overrides the derived ceiling',
  withEnv({ ...CLEAN, WA_SEND_GLOBAL_DAILY: '1234' }, () => M.globalDailyCapFor(100000) === 1234));
ok('kill switch defaults to ENABLED when unset', withEnv(CLEAN, () => M.waSendsEnabled() === true));
ok('exactly "false" stops all proactive sends', withEnv({ ...CLEAN, WHATSAPP_SENDS_ENABLED: 'false' }, () => M.waSendsEnabled() === false));
ok('any other value is treated as enabled (never silently mute reminders)',
  withEnv({ ...CLEAN, WHATSAPP_SENDS_ENABLED: 'yes' }, () => M.waSendsEnabled() === true));

console.log('\n=== waBudgetExceeded (pure) ===\n');
ok('not exceeded below the cap', M.waBudgetExceeded(9999, 10000) === false);
ok('exceeded exactly at the cap', M.waBudgetExceeded(10000, 10000) === true);
ok('exceeded above the cap', M.waBudgetExceeded(10001, 10000) === true);
ok('zero sent is never exceeded', M.waBudgetExceeded(0, 10000) === false);

console.log('\n=== revenue basis is conservative ===\n');
withEnv(CLEAN, () => {
  // We budget off the ANNUAL plan's monthly equivalent (10.75), not the monthly
  // price (12.99), so annual subscribers are never over-spent against.
  const onAnnual = M.sendsPerUserPerMonth(1075);
  const onMonthly = M.sendsPerUserPerMonth(1299);
  ok('the default basis is the cheaper annual equivalent, not the monthly price', onAnnual === M.sendsPerUserPerMonth());
  ok('budgeting off the monthly price would allow MORE sends (so we are conservative)', onMonthly > onAnnual);
});

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
