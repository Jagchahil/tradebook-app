// Tests for lib/messagecost.ts: the founder's settled message cost policy, the margin arithmetic
// against the 80 percent FLOOR (the promise, not the 82 target), and the privacy discipline of the
// cost per customer rows that reach /team.
//
// Pure, no network. The accessor is exercised only for its refusal: with no database configured it
// must say NULL (could not read), never an empty confident list.
// Run: node test/messagecost.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'messagecost-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const load = (f) => import(`${pathToFileURL(path.join(stage, f)).href}`);
const M = await load('messagecost.ts');
const G = await load('margin.ts');
const TEAM = await load('team.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;
const withEnv = (vars, fn) => {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};
const CLEAN = {
  MARGIN_TARGET_PCT: undefined, WA_SHARE_OF_VARIABLE: undefined,
  WA_COST_PER_SEND_PENCE: undefined, AI_COST_PER_CALL_PENCE: undefined,
  WA_COST_PER_MESSAGE_PENCE: undefined, WA_PER_MESSAGE_PRICING: undefined,
  AI_SONNET_SHARE_OF_CALLS: undefined,
};
const BEFORE = new Date('2026-09-30T12:00:00Z');
const AFTER = new Date('2026-10-01T12:00:00Z');

console.log('\n=== THE SETTLED POLICY, PINNED. Change a number here and you are changing the policy. ===\n');
withEnv(CLEAN, () => {
  ok('revenue is the annual plan\'s monthly equivalent, 1075p net', M.REVENUE_PENCE_PER_USER_MONTH === 1075);
  ok('the floor is 80', M.MARGIN_FLOOR_PCT === 80);
  ok('the UK service reply is 2.2p per message', M.SERVICE_REPLY_PENCE === 2.2);
  ok('🔴 AND IT IS FLAGGED AS INFERRED, because Meta has not published it', M.SERVICE_REPLY_PENCE_INFERRED === true);
  ok('the policy constant and the live dial cannot drift apart', M.SERVICE_REPLY_PENCE === G.costPerMessagePence());
  ok('template alerts are approved spend at 4p to 13p a month',
     M.TEMPLATE_ALERTS_APPROVED_PENCE_PER_MONTH.min === 4 && M.TEMPLATE_ALERTS_APPROVED_PENCE_PER_MONTH.max === 13);
  ok('the unit change date rides with lib/margin.ts', M.PER_MESSAGE_PRICING_FROM === '2026-10-01');
});

console.log('\n=== the cost budget at the floor ===\n');
withEnv(CLEAN, () => {
  ok('at 80 percent, COGS may spend 215p of the 1075p', near(M.cogsBudgetAtFloorPence(), 215));
  ok('after the fixed 49p, WhatsApp and AI share 166p', near(M.variableBudgetAtFloorPence(), 166));
  ok('the floor budget is looser than the 82 target budget (the target is the headroom)',
     M.variableBudgetAtFloorPence() > G.variableBudgetPence());
  ok('a floor eaten by fixed costs yields zero, never a negative', withEnv({ ...CLEAN, MARGIN_TARGET_PCT: '82' }, () => M.variableBudgetAtFloorPence() >= 0));
});

console.log('\n=== what N replies cost ===\n');
withEnv(CLEAN, () => {
  ok('before 1 October a service reply costs nothing', M.repliesCostPence(20, BEFORE) === 0);
  ok('🔴 AFTER IT, A TWENTY MESSAGE CONVERSATION IS ROUGHLY 44p', near(M.repliesCostPence(20, AFTER), 44));
  ok('one reply is 2.2p', near(M.repliesCostPence(1, AFTER), 2.2));
  ok('a negative count cannot mint money', M.repliesCostPence(-5, AFTER) === 0);
  ok('a month of replies and alerts adds both lines (pre change: only the alerts bill)',
     near(M.messageCostPence({ serviceReplies: 100, templateAlerts: 4 }, BEFORE), 12));
  ok('post change the same month bills every message',
     near(M.messageCostPence({ serviceReplies: 100, templateAlerts: 4 }, AFTER), 104 * 2.2));
});

console.log('\n=== the margin read, against the floor ===\n');
withEnv(CLEAN, () => {
  ok('a customer we spent nothing on runs at ~95.4 percent', near(M.customerMarginPct(0, 0), 95.44, 0.01));
  ok('the arithmetic IS lib/margin.ts projectedMarginPct, not a restatement',
     M.customerMarginPct(20.8, 228.8) === G.projectedMarginPct(228.8, 20.8));
  ok('a quiet month does not breach', M.floorBreached(3.12, 17.6) === false);
  ok('🔴 A CHATTY MONTH AFTER THE CHANGE BREACHES THE FLOOR BY NAME',
     M.floorBreached(20.8, M.repliesCostPence(104, AFTER)) === true);
  ok('the floor is the line: 166p of spend exactly clears it',
     M.customerMarginPct(83, 83) >= 80 && M.floorBreached(83, 83) === false);
});

console.log('\n=== replies within the floor (a number to look at, NEVER a cap on the customer) ===\n');
withEnv(CLEAN, () => {
  ok('before the change the headroom is infinite (replies are free)',
     M.repliesWithinFloor(0, 0, BEFORE) === Number.POSITIVE_INFINITY);
  ok('after it, a customer with no AI spend has 75 replies of headroom',
     M.repliesWithinFloor(0, 0, AFTER) === 75);
  ok('AI spend eats into it', M.repliesWithinFloor(50, 0, AFTER) < M.repliesWithinFloor(0, 0, AFTER));
  ok('so does template spend', M.repliesWithinFloor(0, 13, AFTER) < M.repliesWithinFloor(0, 0, AFTER));
  ok('a monstrous AI month yields zero, never a negative', M.repliesWithinFloor(9999, 0, AFTER) === 0);
  ok('the FLOOR allows more than the 82 target does (they are different lines)',
     M.repliesWithinFloor(0, 0, AFTER) > G.messagesBeforeFloorBreached(0, AFTER));
});

console.log('\n=== pencePretty: figures a human would write ===\n');
{
  ok('zero is 0p', M.pencePretty(0) === '0p');
  ok('a negative is 0p, never -0p', M.pencePretty(-4) === '0p');
  ok('NaN and Infinity never reach a screen', M.pencePretty(Number.NaN) === '0p' && M.pencePretty(Number.POSITIVE_INFINITY) === '0p');
  ok('2.2 pence is 2.2p', M.pencePretty(2.2) === '2.2p');
  ok('🔴 THE IEEE TAIL IS TAMED: 2.2 x 3 renders as 6.6p', M.pencePretty(2.2 * 3) === '6.6p');
  ok('44.00000000000001 is 44p', M.pencePretty(44.00000000000001) === '44p');
  ok('from a pound up it turns into pounds', M.pencePretty(228.8) === '£2.29');
  ok('a round pound keeps its pence', M.pencePretty(300) === '£3.00');
}

console.log('\n=== THE PRIVACY WALL. Our spend on him is OUR figure; nothing else of his leaves. ===\n');
{
  const fields = M.COST_ROW_FIELDS;
  ok('the customer is named (the whole point: BY NAME before the invoice)', fields.includes('name'));
  for (const forbidden of TEAM.FORBIDDEN_CUSTOMER_COLUMNS) {
    ok(`the cost row cannot carry "${forbidden}"`, !fields.includes(forbidden));
  }
  ok('no field is phone shaped, whatever it is called', fields.every((f) => !/phone/i.test(f)));
  // Every field is either already team visible (CUSTOMER_COLUMNS) or one of OUR cost figures.
  const OURS = /^(aiCalls|inboundMessages|serviceRepliesModelled|aiPence|messagePenceNow|messagePenceFromOct|marginNowPct|marginFromOctPct|repliesWithinFloor)$/;
  const stray = fields.filter((f) => !TEAM.CUSTOMER_COLUMNS.includes(f) && !OURS.test(f));
  ok(`every field is team visible identity or OUR spend (stray: ${stray.join(', ') || 'none'})`, stray.length === 0);

  // The source discipline, checked against the actual file: the phone is a join key that never
  // leaves, and the accessor touches only the usage counters and the users join, never a
  // customer's own records.
  const src = readFileSync(path.resolve(lib, 'messagecost.ts'), 'utf8');
  ok('the users select is exactly the join key and the name', src.includes('users?select=id,name,phone_number'));
  ok('the usage select is the two observed counters', src.includes('scope=in.(phone,wamsg)'));
  ok('🔴 THE ACCESSOR NEVER TOUCHES A CUSTOMER\'S TRANSACTIONS', !src.includes('rest/v1/transactions'));
  ok('the row type carries no phone field', !/phone\??:/.test(src.split('export interface CustomerCostRow')[1].split('}')[0]));
}

console.log('\n=== the accessor refuses honestly ===\n');
{
  const rows = await withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined },
    () => M.readCustomerCostMonth(),
  );
  ok('🔴 NO DATABASE MEANS NULL (could not read), NEVER AN EMPTY CONFIDENT LIST', rows === null);
  const bad = await withEnv(
    { NEXT_PUBLIC_SUPABASE_URL: 'http://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'k' },
    () => M.readCustomerCostMonth('2026-7'),
  );
  ok('a malformed month is refused the same way', bad === null);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
