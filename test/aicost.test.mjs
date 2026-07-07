// Tests for lib/aicost.ts, the AI spend governance. Pure, no network.
//   node test/aicost.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const A = await import(`${pathToFileURL(path.resolve(here, '../lib/aicost.ts')).href}`);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

console.log('\n=== aicost: caps from env, with defaults ===\n');
const dflt = A.resolveCaps({});
ok('sensible default global daily', dflt.globalDaily === 5000);
ok('sensible default global monthly', dflt.globalMonthly === 60000);
ok('sensible default user daily', dflt.userDaily === 40);
ok('not killed by default', dflt.killed === false);
const tuned = A.resolveCaps({ AI_GLOBAL_DAILY: '100', AI_GLOBAL_MONTHLY: '2000', AI_USER_DAILY: '5', AI_KILL_SWITCH: 'ON' });
ok('env overrides caps', tuned.globalDaily === 100 && tuned.globalMonthly === 2000 && tuned.userDaily === 5);
ok('kill switch is case insensitive', tuned.killed === true);
ok('garbage cap falls back to default', A.resolveCaps({ AI_USER_DAILY: 'lots' }).userDaily === 40);

console.log('\n=== aicost: the spend decision ===\n');
const caps = { killed: false, globalDaily: 100, globalMonthly: 2000, userDaily: 5 };
ok('allows when all under cap', A.decideSpend({ globalDay: 10, globalMonth: 100, userDay: 1 }, caps).allowed === true);

ok('kill switch blocks everything first', A.decideSpend({ globalDay: 0, globalMonth: 0, userDay: 0 }, { ...caps, killed: true }).reason === 'kill_switch');
ok('global daily cap blocks (at the cap, the next call is refused)', A.decideSpend({ globalDay: 100, globalMonth: 0, userDay: 0 }, caps).reason === 'global_daily_cap');
ok('global monthly cap blocks', A.decideSpend({ globalDay: 0, globalMonth: 2000, userDay: 0 }, caps).reason === 'global_monthly_cap');
ok('per-user cap blocks one greedy user', A.decideSpend({ globalDay: 0, globalMonth: 0, userDay: 5 }, caps).reason === 'user_daily_cap');
ok('a blocked decision is not allowed', A.decideSpend({ globalDay: 0, globalMonth: 0, userDay: 5 }, caps).allowed === false);
ok('global stop wins over a fresh user', A.decideSpend({ globalDay: 100, globalMonth: 0, userDay: 0 }, caps).reason === 'global_daily_cap');

console.log('\n=== aicost: cost estimate (never rosier than reality) ===\n');
const c = A.estimateCostPence('claude-haiku-4-5-20251001', 1_000_000, 0);
ok('1M Haiku input tokens ~ 80p', c === 80);
ok('Sonnet costs more than Haiku for the same tokens', A.estimateCostPence('claude-sonnet-5', 100000, 100000) > A.estimateCostPence('claude-haiku-4-5-20251001', 100000, 100000));
ok('unknown model estimates 0, never NaN', A.estimateCostPence('made-up-model', 1000, 1000) === 0);
ok('negative tokens do not create a negative cost', A.estimateCostPence('claude-sonnet-5', -5, -5) === 0);

console.log('\n=== aicost: aiEnabled gate ===\n');
ok('enabled with a key and switch off', A.aiEnabled({ ANTHROPIC_API_KEY: 'sk-x' }) === true);
ok('disabled with no key', A.aiEnabled({}) === false);
ok('kill switch disables even with a key', A.aiEnabled({ ANTHROPIC_API_KEY: 'sk-x', AI_KILL_SWITCH: 'on' }) === false);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
