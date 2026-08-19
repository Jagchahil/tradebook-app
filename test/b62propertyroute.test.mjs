// B62. THE FOUR PROPERTY EXPENSE CATEGORIES WERE DEAD ENDS. 20 August 2026.
//
//   node test/b62propertyroute.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS PINS, AND WHY IT IS PINNED AS A SHAPE RATHER THAN AS A LIST OF FOUR.
//
// app/api/money/manual/route.ts set income_type only when the direction was rent IN, so money in
// had a property lane and money out had none. The four property categories in the picker were real
// categories a customer could choose, and choosing one filed the cost against his TRADE.
//
// Norah Whitby: 62,000 of rent, 14,000 of mortgage interest, 6,200 of letting agent, 1,800 of
// property repairs. Bill 11,832.00 against a correct 6,232.00. 5,600.00 too much, and the
// quarterly update reporting a 22,000 trade loss on a woman with no trade.
//
// ⚠️ AND THE NAIVE FIX IS WORSE THAN THE BUG. Route all four to the property stream as ordinary
// EXPENSES and Norah goes from 5,600.00 too high to 2,800.00 too LOW, which is the direction that
// earns a customer a penalty. Mortgage interest is a Section 24 basic rate reducer, never a
// deduction, and this suite proves that split on the row the route actually writes, read back by
// the real reader rather than by an assertion about it.
//
// ⚠️ EVERY LIST HERE IS DERIVED FROM lib/propertylanes.ts. A typed list of four rots the day a
// fifth is added, and that is exactly how this defect came to exist: the rule lived in one route
// while lib/voiceflow.ts and app/api/pile/route.ts both asked the module. The only figure typed
// here is a FLOOR (at least four), because shrinking the list silently un routes a customer's cost
// and a derived walker over an empty list passes while testing nothing.
//
// 🔴 VACUITY FIRST. Section 0 restores the exact line that shipped until today and asks the SAME
// walker to report it. A clean run below is only worth reading because that one is red first.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments in this codebase argue at length and name the very strings a source check is about, so
// a check for CODE strips them first. The helper is copied from test/landlord.test.mjs and
// test/moneyweb.test.mjs rather than reinvented: the comment stripping trap has been found seven
// times in this corpus and every instance was somebody writing their own.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// lib/supabase.ts reads its env at module load, so it goes in before any import of the stage.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-the-test';

// The whole of lib/ staged for bare node, specifiers only, the test/b19threelanes.test.mjs harness.
const libStage = mkdtempSync(path.join(tmpdir(), 'b62-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
let stagedCount = 0;
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(libStage, f), withExt(read(`lib/${f}`)));
  stagedCount += 1;
}
ok('the whole of lib/ was staged, so the reader under test is the shipping one', stagedCount > 100);
// 🔴 THE COPY IS THE ORIGINAL. If this drifts the suite is testing a file that does not ship.
ok('🔴 the staged lib/propertylanes.ts differs from the real one in nothing at all',
  readFileSync(path.join(libStage, 'propertylanes.ts'), 'utf8') === read('lib/propertylanes.ts'));

const LANES = await import(pathToFileURL(path.join(libStage, 'propertylanes.ts')).href);
const CATS = await import(pathToFileURL(path.join(libStage, 'categories.ts')).href);
const DB = await import(pathToFileURL(path.join(libStage, 'supabase.ts')).href);

const PROPS = [...LANES.PROPERTY_CATEGORIES];
const FIN = [...LANES.PROPERTY_FINANCE_CATEGORIES];

console.log('\n=== the module is the one source of truth, and it is checked as a shape ===\n');

// A FLOOR, NOT A FIGURE. Four exist today. A fifth must not fail this suite; losing one must.
ok('lib/propertylanes.ts names at least four property categories (a floor, not a figure)', PROPS.length >= 4);
ok('every property category is a real category a customer can pick in lib/categories.ts',
  PROPS.length > 0 && PROPS.every((c) => CATS.CATEGORIES.includes(c) && CATS.isCategory(c)));
ok('the finance subset is inside the property set and is not empty',
  FIN.length > 0 && FIN.every((c) => PROPS.includes(c)));
ok('and it is a strict subset: not every property cost is a finance cost',
  FIN.length < PROPS.length);

// ---------------------------------------------------------------------------------------------
// THE ROUTE, STAGED AND RUN. The real file, with the session, the gate, the burst limit and the
// database stubbed, because none of those is what B62 is about. lib/categories.ts and
// lib/propertylanes.ts go in WHOLE: a stub of the thing under test would be a test of the stub.
// The harness is test/moneyweb.test.mjs section 5c, which stages the receipt route the same way.
// ---------------------------------------------------------------------------------------------
const ROUTE_SRC = read('app/api/money/manual/route.ts');

// ⚠️ THE MUTATION ANCHOR IS THE LINE'S SHAPE, NEVER ITS TEXT. An anchor typed character by
// character is exactly what test/landlord.test.mjs got wrong here, and it would also make a REORDER
// or a RENAME crash this suite, which would score as a caught sabotage on a change that broke
// nothing. So the decision line is found by its field name and there must be exactly one of it.
const replaceIncomeTypeLine = (src, replacement) => {
  const found = src.match(/^[ \t]*income_type:.*$/gm);
  if (!found || found.length !== 1) {
    throw new Error(`ANCHOR: expected exactly one income_type line in the manual route, found ${found ? found.length : 0}`);
  }
  return src.replace(found[0], `      ${replacement}`);
};
const OLD_LINE = "income_type: direction === 'rent' ? 'property' : undefined,";

const stageRoute = (mutate) => {
  const rt = mkdtempSync(path.join(tmpdir(), 'b62-route-'));
  const w = (n, s) => writeFileSync(path.join(rt, n), s);
  w('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  json(body, init) { return { kind: 'json', status: (init && init.status) || 200, body }; },
  redirect(url, status) { return { kind: 'redirect', status, location: String(url) }; },
};
`);
  w('webauth.ts', "export async function sessionUser() { return { id: 'u-1' }; }\n");
  w('ratelimit.ts', 'export async function rateLimitedShared() { return false; }\n');
  w('gateserver.ts', `
export async function gateForUser() { return 'ok'; }
export function refuseUnentitled() { return { kind: 'json', status: 402, body: { error: 'locked' } }; }
`);
  w('waintents.ts', 'export function clampReceiptDate(d) { return d; }\n');
  w('supabase.ts', `
export const state = { writes: [] };
export async function insertTransaction(record) { state.writes.push({ ...record }); }
export async function readVatProfile() { return null; }
`);
  w('categories.ts', read('lib/categories.ts'));
  w('propertylanes.ts', read('lib/propertylanes.ts'));
  const src = ROUTE_SRC
    .replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'");
  w('route.ts', mutate ? mutate(src) : src);
  return rt;
};

const post = async (rt, { direction, category, amount, date = '2026-06-20' }) => {
  const R = await import(pathToFileURL(path.join(rt, 'route.ts')).href);
  const S = await import(pathToFileURL(path.join(rt, 'supabase.ts')).href);
  S.state.writes.length = 0;
  const req = {
    url: 'https://lekhio.app/api/money/manual',
    headers: { get: () => 'application/json' },
    json: async () => ({ direction, amount: String(amount), vendor: 'A payee', date, category }),
  };
  const res = await R.POST(req);
  return { res, row: S.state.writes[0] ?? null, writes: S.state.writes.length };
};

// THE WALKER. Every category the module calls a property category, posted as money OUT, and the
// ones that did not reach the property stream come back by name. Section 0 points it at the defect
// itself; section 1 points it at what ships.
const misroutedUnder = async (rt) => {
  const missed = [];
  for (const c of PROPS) {
    const { row } = await post(rt, { direction: 'out', category: c, amount: 100 });
    if (!row || String(row.income_type ?? '') !== 'property') missed.push(c);
  }
  return missed;
};

console.log('\n=== 0. VACUITY. The walker is pointed at the defect and must SEE every one of them ===\n');

const brokenRt = stageRoute((src) => replaceIncomeTypeLine(src, OLD_LINE));
const brokenMissed = await misroutedUnder(brokenRt);
ok('🔴 the exact line that shipped until today is restored and the walker reports EVERY property category as a dead end',
  brokenMissed.length === PROPS.length);
ok('...and it names them, so a clean run below is a measurement rather than an absence',
  PROPS.every((c) => brokenMissed.includes(c)));
{
  // The other direction of vacuity: a route that marks EVERYTHING property would pass the walker
  // above and be just as wrong. The walker alone is not enough and this says so out loud.
  const allRt = stageRoute((src) => replaceIncomeTypeLine(src, "income_type: 'property',"));
  const { row } = await post(allRt, { direction: 'out', category: 'materials', amount: 100 });
  ok('🔴 a route that marks EVERY cost property passes the walker, which is why the trade control below exists',
    (await misroutedUnder(allRt)).length === 0 && String(row?.income_type ?? '') === 'property');
}

console.log('\n=== 1. what ships: every property category reaches the property stream ===\n');

const liveRt = stageRoute(null);
const liveMissed = await misroutedUnder(liveRt);
ok('🔴 EVERY CATEGORY lib/propertylanes.ts CALLS A PROPERTY CATEGORY REACHES THE PROPERTY STREAM',
  liveMissed.length === 0);
if (liveMissed.length) console.log(`     still trade: ${liveMissed.join(', ')}`);

// The row is otherwise exactly what it always was. A stream fix that quietly changed the sign, the
// confirmation or the category would be a different bug wearing this one's clothes.
{
  const { row, res, writes } = await post(liveRt, { direction: 'out', category: PROPS[0], amount: 250.5 });
  ok('...and the row is otherwise untouched: negative, confirmed, its own category, one write',
    writes === 1 && row.amount === -250.5 && row.confirmed === true
    && row.category === PROPS[0] && row.source_type === 'web_manual' && res.kind === 'json');
}

console.log('\n=== 2. the controls. Nothing else moved, in either direction ===\n');
{
  const { row } = await post(liveRt, { direction: 'out', category: 'materials', amount: 100 });
  ok('🔴 A TRADE COST IS STILL TRADE: materials carries no income_type at all',
    row.category === 'materials' && row.income_type === undefined);
}
{
  const { row } = await post(liveRt, { direction: 'out', category: 'nonsense not in the list', amount: 100 });
  ok('an unknown category is still other, and other is still trade',
    row.category === 'other' && row.income_type === undefined);
}
{
  const { row } = await post(liveRt, { direction: 'in', category: PROPS[0], amount: 100 });
  ok('🔴 MONEY IN IS STILL INCOME AND STILL TRADE, whatever category the form claimed',
    row.category === 'income' && row.amount === 100 && row.income_type === undefined);
}
{
  const { row } = await post(liveRt, { direction: 'rent', category: '', amount: 950 });
  ok('rent in still lands in the property stream under the same literal the WhatsApp capture writes',
    row.category === 'rent' && row.amount === 950 && row.income_type === 'property');
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE SPLIT, END TO END, THROUGH THE READER THAT COMPUTES THE BILL.
//
// This is the half that matters. Routing all four as ordinary expenses moves Norah from 5,600.00
// too high to 2,800.00 too LOW. So the rows the ROUTE wrote above are handed to the REAL
// propertyYtdTotals in lib/supabase.ts, and its own answer is read back.
//
// The amounts are 100, 200, 400, 800 and so on, doubling, so every subset sums to a different
// number. A category landing on the wrong side of the split cannot coincidentally balance.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the finance split, on the rows the route wrote, through the real reader ===\n');

const realFetch = globalThis.fetch;
const readerSplit = async (rows) => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('income_type=eq.property')) return new Response(JSON.stringify(rows), { status: 200 });
    return new Response('[]', { status: 200 });
  };
  try {
    return await DB.propertyYtdTotals('u-1', '2026-04-06');
  } finally {
    globalThis.fetch = realFetch;
  }
};

const amountFor = (i) => 100 * (2 ** i);
const written = [];
for (let i = 0; i < PROPS.length; i += 1) {
  const { row } = await post(liveRt, { direction: 'out', category: PROPS[i], amount: amountFor(i) });
  written.push(row);
}
const rentRow = (await post(liveRt, { direction: 'rent', category: '', amount: 62000 })).row;

const expectedFinance = PROPS.reduce((t, c, i) => (FIN.includes(c) ? t + amountFor(i) : t), 0);
const expectedExpenses = PROPS.reduce((t, c, i) => (FIN.includes(c) ? t : t + amountFor(i)), 0);

const split = await readerSplit([...written, rentRow]);
ok('the reader answered at all, so a null is never read as a clean split', split !== null);
ok('🔴 THE RENTS ARE THE RENTS', split?.rents === 62000);
ok('🔴 EVERY MEMBER OF PROPERTY_FINANCE_CATEGORIES LANDS IN finance, TO THE PENNY',
  split?.finance === expectedFinance);
ok('🔴 AND EVERY OTHER PROPERTY COST LANDS IN expenses, TO THE PENNY',
  split?.expenses === expectedExpenses);
ok('...and neither side is vacuously zero, so a split that collapsed one way cannot pass',
  (split?.finance ?? 0) > 0 && (split?.expenses ?? 0) > 0);
ok('...and nothing was lost between the two: the split accounts for every pound written',
  (split?.finance ?? 0) + (split?.expenses ?? 0) === written.reduce((t, r) => t + Math.abs(r.amount), 0));

// The same question asked one category at a time, so the reader itself says which side each one is
// on. This is what catches a FIFTH category being added whose name the reader would call finance
// while PROPERTY_FINANCE_CATEGORIES does not, which is the drift lib/propertylanes.ts:64 warns of.
const wrongSide = [];
for (let i = 0; i < PROPS.length; i += 1) {
  const one = await readerSplit([written[i]]);
  const readAsFinance = (one?.finance ?? 0) > 0;
  if (readAsFinance !== FIN.includes(PROPS[i])) wrongSide.push(PROPS[i]);
}
ok('🔴 THE TWO LISTS CANNOT DRIFT: the reader puts each category on exactly the side PROPERTY_FINANCE_CATEGORIES says',
  wrongSide.length === 0);
if (wrongSide.length) console.log(`     on the wrong side: ${wrongSide.join(', ')}`);

console.log('\n=== 4. the wiring: one rulebook, three callers, and no list typed in a route ===\n');

const routeCode = codeOnly(ROUTE_SRC);
// ⚠️ NAME AGNOSTIC ON PURPOSE. The behavioural sections above already prove the routing; all
// this has to hold is that the decision is ASKED of the module rather than listed here. Pinning the
// local's name would make a rename red, and a guard that reds on a rename is a guard about an
// identifier rather than about the product.
ok('🔴 the route ASKS lib/propertylanes.ts rather than deciding for itself',
  /import \{ streamFor \} from '(\.\.\/)+lib\/propertylanes'/.test(routeCode)
  && /streamFor\(/.test(routeCode));
ok('🔴 AND IT TYPES NO PROPERTY CATEGORY OF ITS OWN, which is the list that would rot',
  PROPS.every((c) => !routeCode.includes(c)));
ok('the rent branch is still explicit, because rent is money IN and streamFor has no opinion on it',
  /direction === 'rent'/.test(routeCode));

// The other two doors that already asked the module, pinned here so a tidy cannot quietly make
// this route the only one again.
ok('lib/voiceflow.ts still routes a spoken cost through streamFor',
  /streamFor\(/.test(codeOnly(read('lib/voiceflow.ts'))));
ok('app/api/pile/route.ts still routes a confirmed cost through isPropertyCategory',
  /isPropertyCategory\(category\)/.test(codeOnly(read('app/api/pile/route.ts'))));

// 🔴 AND THE CAPTURE PATHS ARE NAMED HERE RATHER THAN LEFT TO BE REDISCOVERED. The receipt walk,
// the WhatsApp typed capture and the CSV statement import all write a row with NO income_type,
// which is correct for them and not a second B62: every one lands confirmed:false, so it is
// invisible to propertyYtdTotals (which filters confirmed=eq.true) until he files it on /app/pile,
// and the pile is the door that sets the stream. The manual route was the only writer whose rows
// land CONFIRMED, which is why it was the only one that could put a wrong figure on a tax screen.
{
  const ingest = codeOnly(read('lib/receiptingest.ts'));
  const statement = codeOnly(read('lib/statementingest.ts'));
  ok('the receipt walk still lands unconfirmed, so the pile is still its stream door',
    /confirmed: false/.test(ingest) && !/income_type/.test(ingest));
  ok('the CSV statement walk still lands unconfirmed too',
    !/income_type/.test(statement));
  ok('🔴 and the manual route is still the one door that lands CONFIRMED, which is why it needed this fix',
    /confirmed: true/.test(routeCode));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
