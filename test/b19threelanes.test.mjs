// ═══════════════════════════════════════════════════════════════════════════════════════════
// B19: THE ONE READER BEHIND THE NATIONAL INSURANCE, STUDENT LOAN AND PROPERTY LANES.
// lib/laneanswers.ts, 17 August 2026.
//
// test/laneparity.test.mjs section 11 holds the ROUTING: that all three routers dispatch these
// three lanes, in the same order, above the totals lane, above the shared cache and above the
// model. It cannot say anything about what the reader DOES, because it reads source and never
// runs it. This suite runs it.
//
// 🔴 WHAT IT DEFENDS, IN THE ORDER THE FAILURES WOULD HURT.
//
//   1. A FAILED READ NEVER BECOMES A FIGURE, AND ON THE PROPERTY LANE IT USED TO BECOME AN EMPTY
//      STATE. propertyYtdTotals answered an unreachable database with { rents: 0 }, and
//      propertyAnswer's first branch turns rents <= 0 into "No rental money logged this tax year
//      yet. Text it as it lands". So a landlord with a full year of rent behind him was told his
//      property stream was empty, in the words of a settled fact about his records. A guessed zero
//      and a read zero were the same value and nothing could tell them apart.
//
//   2. AND THE TRUE EMPTY CASE STILL GETS THE TRUE EMPTY ANSWER. Fixing (1) by refusing every
//      quiet answer would be the same defect wearing the other face: a man who genuinely has no
//      rent yet must still be told how to start, not told to try again in a minute.
//
//   3. NOT KNOWING IS NOT FAILING. No student loan plan is an ANSWER. An unknown income shape is
//      an ANSWER, and niAnswer's own header argues at length why an unknown shape must keep the
//      old words. Only a failure of a read the FIGURE turns on refuses.
//
//   4. ONE APRIL. taxYearSinceISO is the ONE definition for these three lanes, so a man cannot be
//      answered off two different year starts in one conversation.
//
// ⚠️ IT DRIVES THE REAL lib/supabase.ts OVER A FAKE fetch, not a stub of it. The whole finding in
// (1) lived inside propertyYtdTotals's `if (!res.ok)` branch, so a suite that stubbed that function
// would have tested the stub and passed on the day the defect shipped.
//
// ⚠️ AND THAT COSTS A SCRATCH COPY OF lib/, WHICH IS WORTH EXPLAINING ONCE. Node's type stripping
// cannot resolve an extensionless relative import, which is the reason lib/waintents.ts has no
// imports at all. lib/laneanswers.ts must have them: it is the other side of the line, the side
// that touches the database. So the whole of lib/ is copied to a temp directory with `.ts` added to
// every relative specifier, and the copy is imported. Nothing is rewritten but the specifiers, and
// the check below proves the copy is byte identical to the original apart from them, so this can
// never quietly become a test of an edited file.
//
// Run: node test/b19threelanes.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok  ${name}`); } else { fail += 1; console.log(`  FAIL ${name}`); }
};

const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// The env is read at module load in lib/supabase.ts, so it goes in before the import.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-the-test';

// The scratch copy of lib/, specifiers only. `./x` becomes `./x.ts`; a specifier that already
// carries an extension, and every bare package specifier, is left exactly as it was.
const stage = mkdtempSync(path.join(tmpdir(), 'b19lanes-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
let copied = 0;
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
  copied += 1;
}
ok('the whole of lib/ was staged for import, so nothing under test is a hand written stub', copied > 30);
// 🔴 THE COPY IS THE ORIGINAL. If this ever drifts the suite is testing a file that does not ship.
ok('🔴 the staged lib/laneanswers.ts differs from the real one ONLY in its import specifiers',
  readFileSync(path.join(stage, 'laneanswers.ts'), 'utf8').replace(/\.ts';/g, "';") === read('lib/laneanswers.ts'));

const L = await import(pathToFileURL(path.join(stage, 'laneanswers.ts')).href);
const W = await import(pathToFileURL(path.join(root, 'lib/waintents.ts')).href);
const SCOT = await import(pathToFileURL(path.join(root, 'lib/scotland.ts')).href);

const UID = 'aaaaaaaa-1111-4111-8111-bbbbbbbbbbbb';

// The fake transport. Every read lib/laneanswers.ts makes is answered by URL shape, so the plan is
// written the way a reader thinks about it rather than in call order, and an extra or missing call
// shows up in `seen` rather than shifting the whole script by one.
let plan = {};
let seen = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  seen.push(u);
  const pick = () => {
    if (u.includes('/rpc/user_totals')) return plan.totals;
    if (u.includes('/properties?')) return plan.properties;
    if (u.includes('income_type=eq.property')) return plan.propertyRows;
    if (u.includes('select=student_loan_plan')) return plan.settings;
    if (u.includes('select=business_type')) return plan.profile;
    return { status: 200, json: [] };
  };
  const r = pick() ?? { status: 200, json: [] };
  return new Response(JSON.stringify(r.json ?? []), { status: r.status ?? 200 });
};

const OK = (json) => ({ status: 200, json });
const DEAD = { status: 500, json: { message: 'boom' } };
const NO_ROWS = OK([]);
const setPlan = (p) => { plan = p; seen = []; };

console.log('\nB19: the one reader for the National Insurance, student loan and property lanes');

// ---------------------------------------------------------------------------------------------
// 0. THE REFUSAL HAS ONE HOME AND ONE SET OF WORDS.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 0. one refusal, one home ===\n');

ok('lib/waintents.ts exports LANE_UNREADABLE', typeof W.LANE_UNREADABLE === 'string');
ok('...and it names no figure, because a failed read has none',
  !/[0-9]/.test(W.LANE_UNREADABLE) && !W.LANE_UNREADABLE.includes('£'));
ok('...and it is declared exactly once',
  (read('lib/waintents.ts').match(/export const LANE_UNREADABLE/g) || []).length === 1);
// 🔴 THE ROUTERS MUST NOT KEEP A COPY OF THE SENTENCE FOR THESE LANES. The webhook held it three
// times over, one per handler, which is how three channels come to refuse in three different words.
{
  const laneCode = stripComments(read('lib/laneanswers.ts'));
  ok('lib/laneanswers.ts refuses with the shared constant and types no sentence of its own',
    laneCode.includes('return LANE_UNREADABLE;') && !laneCode.includes('Try again in a minute.'));
}

// ---------------------------------------------------------------------------------------------
// 1. ONE APRIL, FOR ALL THREE LANES.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. the year starts on 6 April, in one place ===\n');

ok('5 April 2027 still belongs to the year that started 6 April 2026',
  L.taxYearSinceISO(new Date('2027-04-05T12:00:00Z')) === '2026-04-06');
ok('6 April 2027 starts the new one',
  L.taxYearSinceISO(new Date('2027-04-06T00:00:00Z')) === '2027-04-06');
ok('and mid winter reads back to the April behind it',
  L.taxYearSinceISO(new Date('2027-01-31T00:00:00Z')) === '2026-04-06');
// 🔴 AND IT WAS LIFTED OUT OF THE WEBHOOK, WHERE IT WAS PRIVATE. A second copy is a second answer
// to "what has he made this year", and matchTotalsQuestion is the other reader of that boundary.
ok('🔴 app/api/whatsapp/route.ts no longer declares its own',
  !/function taxYearSinceISO/.test(stripComments(read('app/api/whatsapp/route.ts'))));
ok('🔴 and lib/laneanswers.ts declares exactly one',
  (read('lib/laneanswers.ts').match(/export function taxYearSinceISO/g) || []).length === 1);

// ---------------------------------------------------------------------------------------------
// 2. NATIONAL INSURANCE.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. national insurance, from his own rows ===\n');

setPlan({
  totals: OK([{ income: 48000, expenses: 8000, cis: 0, count: 40 }]),
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
  profile: OK([{ business_type: 'sole_trader', partnership_share: 100, income_shape: 'trade' }]),
});
{
  const a = await L.niAnswerForUser(UID);
  ok('a sole trader on £40,000 of profit is told his Class 4', /Class 4 on your profit so far/.test(a));
  ok('...with a figure in it', /£[\d,]+/.test(a));
  ok('...and it is not the refusal', a !== W.LANE_UNREADABLE);
}

// 🔴 THE ROWS FAILING IS A REFUSAL, NEVER A ZERO. niAnswer's own no-NI branch says "No National
// Insurance is due on your figures so far this tax year", which is a statement about his books.
setPlan({
  totals: DEAD,
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
  profile: OK([{ business_type: 'sole_trader', partnership_share: 100, income_shape: 'trade' }]),
});
{
  const a = await L.niAnswerForUser(UID);
  ok('🔴 an unreadable ledger refuses rather than reporting no National Insurance due',
    a === W.LANE_UNREADABLE);
  ok('🔴 ...and says nothing about his figures so far', !/figures so far this tax year/.test(a));
}

// NOT KNOWING IS NOT FAILING. A dead profile read is an unknown income shape, and NIM74250 says a
// guest house is a trade, so the safe direction is the answer he always had.
setPlan({
  totals: OK([{ income: 48000, expenses: 8000, cis: 0, count: 40 }]),
  settings: DEAD,
  profile: DEAD,
});
{
  const a = await L.niAnswerForUser(UID);
  ok('an unreadable profile is UNKNOWN, so he still gets his Class 4', /Class 4 on your profit so far/.test(a));
  ok('...and is never told the landlord sentence on an unknown shape',
    !/letting property is not treated as self employed work/.test(a));
}

// A KNOWN landlord gets the sentence NIM74250 requires. This is the gate that was inert on the only
// channel that reached it until 31 July, and it is now reached by three.
setPlan({
  totals: OK([{ income: 4000, expenses: 1000, cis: 0, count: 6 }]),
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
  profile: OK([{ business_type: 'sole_trader', partnership_share: 100, income_shape: 'property_only' }]),
});
{
  const a = await L.niAnswerForUser(UID);
  ok('🔴 a KNOWN landlord is told voluntary Class 2 is not open to him',
    /voluntary Class 2 is not open to you/.test(a));
  ok('...and is pointed at Class 3 rather than a price we do not hold', /Class 3/.test(a) && !/£\s*17/.test(a));
}

// ---------------------------------------------------------------------------------------------
// 3. THE STUDENT LOAN.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. the student loan, from the plan on his account ===\n');

setPlan({ settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]) });
{
  const a = await L.studentLoanAnswerForUser(UID);
  ok('no plan stored is an ANSWER, and it asks him for the plan',
    /I do not know your student loan plan yet/.test(a));
  ok('...and it is not the refusal', a !== W.LANE_UNREADABLE);
  // 🔴 AND IT DOES NOT READ HIS LEDGER TO SAY SO. There is no figure to compute, so there is no
  // reason to make him wait on a query, and a lane that queries anyway is a lane whose failure
  // modes are larger than its job.
  ok('🔴 ...and his rows were never read for it', !seen.some((u) => u.includes('/rpc/user_totals')));
}

setPlan({
  settings: OK([{ student_loan_plan: 'plan2', student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
  totals: OK([{ income: 60000, expenses: 10000, cis: 0, count: 50 }]),
});
{
  const a = await L.studentLoanAnswerForUser(UID);
  ok('a plan 2 borrower over the threshold is given his figure', /student loan \(Plan 2\)/.test(a));
  ok('...and the monthly set aside that keeps January quiet', /a month aside/.test(a));
}

setPlan({
  settings: OK([{ student_loan_plan: 'plan2', student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
  totals: DEAD,
});
{
  const a = await L.studentLoanAnswerForUser(UID);
  ok('🔴 a known plan with an unreadable ledger refuses rather than saying nothing is due',
    a === W.LANE_UNREADABLE);
  ok('🔴 ...and never says his income is under the threshold', !/is under the/.test(a));
}

// ---------------------------------------------------------------------------------------------
// 4. THE PROPERTY STREAM. THIS IS THE ONE THAT WAS LYING.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. the property stream, and the empty state that was a guess ===\n');

const RENT_ROWS = OK([
  { amount: 11400, category: 'Rent received', vendor: 'Flat 2' },
  { amount: -1200, category: 'Repairs', vendor: 'Plumber' },
  { amount: -3000, category: 'Mortgage interest', vendor: 'Lender' },
]);

setPlan({
  propertyRows: RENT_ROWS,
  totals: OK([{ income: 11400, expenses: 4200, cis: 0, count: 12 }]),
  properties: OK([{ id: 'p1', nickname: 'Flat 2', joint_share: 1 }]),
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
});
{
  const a = await L.propertyAnswerForUser(UID);
  ok('a landlord with rent in gets his stream', /^Property this tax year/.test(a));
  ok('...counted across the properties he has', /across 1 property/.test(a));
  ok('...and it is not the refusal', a !== W.LANE_UNREADABLE);
}

// 🔴 THE FINDING. Before today this returned "No rental money logged this tax year yet".
setPlan({
  propertyRows: DEAD,
  totals: OK([{ income: 11400, expenses: 4200, cis: 0, count: 12 }]),
  properties: OK([{ id: 'p1', nickname: 'Flat 2', joint_share: 1 }]),
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
});
{
  const a = await L.propertyAnswerForUser(UID);
  ok('🔴 UNREADABLE PROPERTY ROWS REFUSE', a === W.LANE_UNREADABLE);
  ok('🔴 ...and a landlord is NEVER told his property stream is empty on a failed read',
    !/No rental money logged this tax year yet/.test(a));
}

// 🔴 AND THE TRADE ROWS ARE A MONEY READ TOO, because tradeProfit is what puts the rent in a band.
// A null trade position would price a higher rate landlord's rent at basic rate, which is a wrong
// figure rather than a missing one.
setPlan({
  propertyRows: RENT_ROWS,
  totals: DEAD,
  properties: OK([{ id: 'p1', nickname: 'Flat 2', joint_share: 1 }]),
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
});
{
  const a = await L.propertyAnswerForUser(UID);
  ok('🔴 an unreadable TRADE position refuses too, rather than banding his rent off a guess',
    a === W.LANE_UNREADABLE);
  ok('🔴 ...and no tax figure is quoted at all', !/adding about/.test(a));
}

// 🔴 AND THE TRUE EMPTY CASE IS STILL THE TRUE EMPTY ANSWER. Refusing everything quiet would be the
// same defect with the hands changed over.
setPlan({
  propertyRows: NO_ROWS,
  totals: OK([{ income: 0, expenses: 0, cis: 0, count: 0 }]),
  properties: NO_ROWS,
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
});
{
  const a = await L.propertyAnswerForUser(UID);
  ok('🔴 a man with genuinely no rent yet still gets the real empty state',
    /No rental money logged this tax year yet/.test(a));
  ok('🔴 ...and is NOT refused', a !== W.LANE_UNREADABLE);
  // 🔴 AND HE GETS NO SCOTLAND CAVEAT EITHER, because he has been given no figure to be misled by.
  // Doc 103's own bar: a row he has to read and reject teaches him to stop reading the rows.
  ok('🔴 ...and carries no caveat about a band derived figure he was never given',
    !/England, Wales and Northern Ireland rates/.test(a));
}

// 🔴 AND THE CAVEAT IS ON THE BRANCH THAT CARRIES ONE. The property tax figure is his rent stacked
// on his trade profit at rUK rates, so a Scottish landlord is misled by it exactly as he is by the
// set aside. test/scotland.test.mjs section 3 discovers the surface; this proves the words arrive.
setPlan({
  propertyRows: RENT_ROWS,
  totals: OK([{ income: 11400, expenses: 4200, cis: 0, count: 12 }]),
  properties: OK([{ id: 'p1', nickname: 'Flat 2', joint_share: 1 }]),
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
});
{
  const a = await L.propertyAnswerForUser(UID);
  ok('🔴 a landlord WITH a tax figure is told which rates it was worked at',
    a.includes(SCOT.SCOTLAND_LINE));
  ok('🔴 ...and the caveat comes LAST, after the figure it is about', a.trim().endsWith(SCOT.SCOTLAND_LINE));
}

// A failed PROPERTY LIST read is not a money read: it only costs the "across N properties" clause,
// so it degrades rather than refusing.
setPlan({
  propertyRows: RENT_ROWS,
  totals: OK([{ income: 11400, expenses: 4200, cis: 0, count: 12 }]),
  properties: DEAD,
  settings: OK([{ student_loan_plan: null, student_loan_postgrad: false, employment_income: 0, savings_income: 0, dividend_income: 0 }]),
});
{
  const a = await L.propertyAnswerForUser(UID);
  ok('an unreadable property LIST still answers, without the count', /^Property this tax year: / .test(a));
  ok('...and never claims a count it could not read', !/across/.test(a));
}

// ---------------------------------------------------------------------------------------------
// 5. propertyYtdTotals ITSELF. The finding lived in this function, so it is pinned here.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 5. the read that used to answer a dead database with a zero ===\n');
{
  const db = stripComments(read('lib/supabase.ts'));
  const at = db.indexOf('export async function propertyYtdTotals(');
  ok('propertyYtdTotals was located', at !== -1);
  const body = at === -1 ? '' : db.slice(at, db.indexOf('\n}\n', at));
  ok('🔴 a failed read returns null and NOT a zeroed shape',
    /if \(!res\.ok\) return null;/.test(body) && !/if \(!res\.ok\) return \{ rents: 0/.test(body));
  ok('🔴 ...and the type says so, so a caller cannot forget',
    /finance: number \} \| null>/.test(body));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
