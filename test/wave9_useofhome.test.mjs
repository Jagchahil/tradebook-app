// WAVE NINE: THE USE OF HOME FLAT RATE, AND THE TWO MEN WHO WERE BEING TOLD TO CLAIM IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS BROKEN, FOUND BY AUDIT ON 31 JULY 2026.
//
// A limited company director and a landlord with no trade could BOTH claim the use of home flat
// rate, and the product actively told them to. Four files, no structure awareness between them:
//
//   lib/elections.ts             ElectionKey was 'use_of_home' with no structure dimension at all.
//                                Anyone could elect, and the amount landed in his figures.
//   app/api/elections/route.ts   POST wrote the election for any user, with no profile read.
//   lib/taxoptimiser.ts          Rule 4 emitted "Claim use of home" with a real pounds figure.
//                                Grep it for businessType or structure and you got nothing.
//   lib/ledger.ts                Drew a "Use of home" line off whatever amount reached it.
//
// THE LAW, AND ONLY THE LAW. The flat rate (per hours worked at home per month) is a SIMPLIFIED
// EXPENSE under ITTOIA 2005 s94H. HMRC BIM75010: "Only partnerships comprising solely individual
// partners can claim this simplified expenses."
//
//   A LIMITED COMPANY cannot use it at all. A company is outside ITTOIA. There are other ways a
//   company can deal with a director's use of his home, and they are paperwork rather than a tick
//   box. WE HAVE BUILT NONE OF THEM, so no refusal in this product may describe one.
//
//   A PROPERTY BUSINESS cannot use it either. s94H is a deduction in computing the profits of a
//   TRADE. A property business claims a proportion of its actual costs instead (HMRC PIM2220).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE HALF OF THIS SUITE THAT MATTERS MORE THAN THE REFUSALS: UNKNOWN IS UNCHANGED.
//
// Only a KNOWN 'limited_company' and a KNOWN 'property_only' may be refused anything. A failed
// profile read, an old surface that passes nothing, a null column: every one of those must behave
// exactly as it did before any of this existed. Showing a director a lever he cannot pull is a
// wrong sentence he can ignore. Silently stripping a sole trader of the flat rate because Postgres
// was slow is money off his return every month, with nothing on any screen to tell him why.
//
// Run: node test/wave9_useofhome.test.mjs   (Node 22.6+, type stripping). Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'wave9home-'));

// Stage the whole of lib/ and rewrite every relative import to .ts, the same trick
// test/numbers.test.mjs uses. Naming dependencies one at a time means that adding a single import
// to a module under test breaks the suite with a module-not-found rather than a real failure, and
// that is the kind of red that teaches people to ignore red.
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const load = (name) => import(pathToFileURL(path.join(stage, name + '.ts')).href);

const X = await load('elections');
const O = await load('taxoptimiser');
const L = await load('ledger');
const H = await load('housestyle');

const read = (p) => readFileSync(path.join(root, p), 'utf8');
const ELECTIONS_SRC = read('lib/elections.ts');
const ROUTE_SRC = read('app/api/elections/route.ts');
const OPTIMISER_SRC = read('lib/taxoptimiser.ts');
const LEDGER_SRC = read('lib/ledger.ts');
const SUPABASE_SRC = read('lib/supabase.ts');
const PERSONA_SRC = read('lib/persona.ts');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\nWAVE NINE: THE USE OF HOME FLAT RATE IS UNINCORPORATED AND TRADE ONLY');

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE DOOR. lib/elections.ts is the one place that knows who this election is for.');

const refuse = (who) => X.electionRefusal('use_of_home', who);

const ltd = refuse({ structure: 'limited_company', income: 'trade' });
ok('🔴 A LIMITED COMPANY IS REFUSED. It is outside ITTOIA, so this is no claim at all', !!ltd);
ok('the company refusal names the axis that refused him', ltd && ltd.reason === 'structure');
ok('the company refusal carries the election it is about', ltd && ltd.key === 'use_of_home');

const landlord = refuse({ structure: 'sole_trader', income: 'property_only' });
ok('🔴 A PROPERTY ONLY CUSTOMER IS REFUSED. s94H computes the profits of a TRADE', !!landlord);
ok('the landlord refusal names the axis that refused him', landlord && landlord.reason === 'income');

ok('a director who is ALSO a landlord is refused, and told the thing that is true whatever changes',
  (() => { const r = refuse({ structure: 'limited_company', income: 'property_only' }); return !!r && r.reason === 'structure'; })());

ok('🔴 A SOLE TRADER WITH A TRADE IS UNTOUCHED', refuse({ structure: 'sole_trader', income: 'trade' }) === null);
ok('a partnership is untouched: BIM75010 allows partnerships of individuals',
  refuse({ structure: 'partnership', income: 'trade' }) === null);
ok("...and we never asked who his partners are, so we do not refuse him on a fact we have not collected",
  refuse({ structure: 'partnership' }) === null);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. 🔴 UNKNOWN BEHAVES EXACTLY AS IT DID TODAY. This is the half that costs real money.');

ok('nothing at all passed is not refused', refuse(undefined) === null);
ok('null passed is not refused', refuse(null) === null);
ok('an empty object is not refused', refuse({}) === null);
ok('an unknown structure with a known trade is not refused', refuse({ structure: null, income: 'trade' }) === null);
ok('a known sole trader with an unknown shape is not refused', refuse({ structure: 'sole_trader', income: null }) === null);
ok('both unknown is not refused', refuse({ structure: null, income: null }) === null);
ok('both undefined is not refused', refuse({ structure: undefined, income: undefined }) === null);
ok('a value we never wrote is not a refusal either, because it is not a KNOWN company',
  refuse({ structure: 'plc', income: 'crypto' }) === null);

ok('canElect is the same question the other way round, on every shape', [
  undefined, null, {}, { structure: 'sole_trader' }, { structure: 'partnership' },
  { structure: 'limited_company' }, { income: 'property_only' }, { income: 'trade' },
].every((who) => X.canElect('use_of_home', who) === (X.electionRefusal('use_of_home', who) === null)));

ok('canElect refuses exactly the two, and nobody else',
  X.canElect('use_of_home', { structure: 'limited_company' }) === false
  && X.canElect('use_of_home', { income: 'property_only' }) === false
  && X.canElect('use_of_home', { structure: 'sole_trader', income: 'trade' }) === true
  && X.canElect('use_of_home', undefined) === true);

// ⚠️ THE SIGNATURE OF THE MONEY DID NOT MOVE. The smallest honest change was a new function, not a
// third argument on the four functions lib/supabase.ts, the route and the WhatsApp webhook call.
ok('useOfHomeToDate still takes exactly the two arguments it always did', X.useOfHomeToDate.length === 2);
ok('useOfHomeFullYear still takes exactly one', X.useOfHomeFullYear.length === 1);
ok('electionConfirmation still takes exactly two', X.electionConfirmation.length === 2);
ok('bandOptions still takes none', X.bandOptions.length === 0);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. WHAT WE SAY WHEN WE REFUSE. One sentence, and not one word of a door we have not built.');

const messages = [ltd.message, landlord.message];

ok('both refusals say something', messages.every((m) => typeof m === 'string' && m.length > 40));
ok('each refusal is ONE sentence, not a tax lesson in an error string',
  messages.every((m) => (m.match(/\.\s/g) ?? []).length === 0 && m.trim().endsWith('.')));
ok('each refusal names the relief it is refusing', messages.every((m) => /use of home/i.test(m) && /flat rate/i.test(m)));
ok('each refusal says plainly that it cannot be claimed', messages.every((m) => /cannot claim it/i.test(m)));

// 🔴 THE ONE THING A REFUSAL MUST NEVER DO. A company CAN pay its director for the use of his home
// and a property business DOES claim a proportion of its actual costs, and we have built neither.
// A man told about a door that does not open stops looking for one that does.
ok('🔴 NEITHER REFUSAL PROMISES AN ALTERNATIVE WE HAVE NOT BUILT', messages.every((m) => !new RegExp(
  'licen[cs]e|reimburse|rental agreement|charge (your|the) company|pay yourself|'
  + 'instead you can|you can still|we can still|we will|proportion of your actual|share of your actual',
  'i').test(m)));
ok('neither refusal quotes a figure it cannot stand behind', messages.every((m) => !/£|\d/.test(m)));
ok('neither refusal implies HMRC endorses us', messages.every((m) => !/approved|endorse|recognised by hmrc/i.test(m)));

ok('no forbidden dash in either refusal', messages.every((m) => !H.hasForbiddenDash(m)));
ok('no em dash or en dash anywhere in the four sources changed', [
  ELECTIONS_SRC, ROUTE_SRC, OPTIMISER_SRC, LEDGER_SRC,
].every((s) => !/[–—]/.test(s)));

// The sources for the refusal are ON the file, because the day HMRC asks why we refused a director
// the answer has to be a paragraph with citations rather than an archaeology exercise.
ok('the statute and the manual are cited where the rule lives',
  /ITTOIA 2005 s94H/.test(ELECTIONS_SRC) && /BIM75010/.test(ELECTIONS_SRC) && /PIM2220/.test(ELECTIONS_SRC));
// Comment markers and line wraps stripped, because a quotation that happens to wrap is still a
// quotation and a test that cared where the line broke would be pinning the formatter, not the law.
const ELECTIONS_PROSE = ELECTIONS_SRC.replace(/\/\//g, ' ').replace(/\s+/g, ' ');
ok('BIM75010 is quoted verbatim, not paraphrased into something stronger',
  ELECTIONS_PROSE.includes('Only partnerships comprising solely individual partners can claim this simplified expenses'));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. THE TWO LITERAL UNIONS, PINNED. Re-declared rather than imported, so they can drift.');

// lib/elections.ts cannot import lib/persona.ts: a test that loads a lib module directly cannot
// resolve an extensionless relative import under Node's type stripping. So the literals are written
// twice, and this is the assertion that stops the two copies parting company in silence.
const literals = (src, name) => {
  const m = src.match(new RegExp(`export type ${name} =([^;]+);`));
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort().join(',') : null;
};

ok('elections BusinessStructure is exactly supabase BusinessType',
  literals(ELECTIONS_SRC, 'BusinessStructure') === literals(SUPABASE_SRC, 'BusinessType')
  && literals(ELECTIONS_SRC, 'BusinessStructure') === 'limited_company,partnership,sole_trader');
ok('elections IncomeShape is exactly persona IncomeShape',
  literals(ELECTIONS_SRC, 'IncomeShape') === literals(PERSONA_SRC, 'IncomeShape')
  && literals(ELECTIONS_SRC, 'IncomeShape') === 'property_only,trade');
ok('the optimiser carries the same two unions inline, and no third spelling',
  /'sole_trader' \| 'partnership' \| 'limited_company'/.test(OPTIMISER_SRC)
  && /'trade' \| 'property_only'/.test(OPTIMISER_SRC));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. THE ROUTE. It reads the profile, asks lib/elections.ts, and repeats the answer.');

const between = (src, from, to) => {
  const a = src.indexOf(from);
  const b = to ? src.indexOf(to) : src.length;
  return a < 0 ? '' : src.slice(a, b < 0 ? src.length : b);
};
const GET_BODY = between(ROUTE_SRC, 'export async function GET', 'export async function POST');
const POST_BODY = between(ROUTE_SRC, 'export async function POST', 'export async function DELETE');
const DELETE_BODY = between(ROUTE_SRC, 'export async function DELETE', 'async function auth');

ok('the route reads the business profile at all, which it never did before',
  ROUTE_SRC.includes('getBusinessProfile'));
ok('🔴 A FAILED PROFILE READ IS UNKNOWN, NEVER A REFUSAL', /getBusinessProfile\(userId\)\.catch\(\(\) => null\)/.test(ROUTE_SRC));
ok('it passes BOTH facts, structure and shape', /structure: biz\?\.businessType/.test(ROUTE_SRC) && /income: biz\?\.incomeShape/.test(ROUTE_SRC));

ok('🔴 THE POST REFUSES BEFORE IT WRITES', POST_BODY.includes('electionRefusal')
  && POST_BODY.indexOf('electionRefusal') < POST_BODY.indexOf('writeAllowanceElection'));
// ⚠️ REWRITTEN 1 AUGUST 2026. It used to demand that electionRefusal appear before req.json(),
// which was true when there was one election and became impossible when there were two: the route
// has to read ONE field, the key, to know which relief it is being asked about. The reason given
// for the old ordering still holds and is what is asserted now: the refusal is decided from the
// MAN, never from his request. So the argument handed to electionRefusal must be the profile read,
// and nothing off the body may reach it.
ok('...and the refusal is decided from the MAN, never from anything in his request',
  /electionRefusal\(key, await electingAs\(user\.id\)\)/.test(POST_BODY)
  && !/electionRefusal\([^)]*body\./.test(POST_BODY));
ok('the refusal returns the sentence lib/elections.ts wrote, never one of its own',
  /message: refusal\.message/.test(POST_BODY));
ok('the refusal is a 400, the same honest shape as under_threshold, not a 500',
  /error: 'not_eligible'[\s\S]{0,80}status: 400/.test(POST_BODY));

// The bands carry a pound figure each, so offering them to a man who cannot claim is the product
// telling him to. Loosened from the exact ternary to the property after a second election made the
// condition wider (a trading allowance request has no bands to offer either).
ok('🔴 THE GET STOPS OFFERING IT: no bands, no pound figures, for a man who cannot claim',
  GET_BODY.includes('electionRefusal') && /options: \(?refusal[^:]*\? \[\] :/.test(GET_BODY));
ok('...but an election already on his record is still shown, because DELETE is how it comes off',
  /elected: election/.test(GET_BODY) && /refused: refusal \?/.test(GET_BODY));

ok('🔴 THE DELETE IS DELIBERATELY NOT REFUSED. A claim he should never have had must always come off',
  !DELETE_BODY.includes('electionRefusal') && DELETE_BODY.includes('clearAllowanceElection'));

// The rule is a property of the election. A route that tested for 'limited_company' itself would be
// a second copy of the rule, and the copy that drifts is always the one nobody is looking at.
ok('🔴 THE ROUTE NEVER RESTATES THE RULE. It does not know what a limited company is',
  !/'limited_company'/.test(ROUTE_SRC) && !/'property_only'/.test(ROUTE_SRC));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. THE SUGGESTION. lib/taxoptimiser.ts stops telling him to claim what he cannot have.');

const find = (list, key) => list.find((o) => o.key === key);
const trader = {
  startYear: 2026, monthsElapsed: 12,
  ytdTradeIncome: 40_000, ytdTradeExpenses: 8_000, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'],
  homeOfficeClaimed: false, mileageClaimed: true, purchaseGoal: null,
};

ok('🔴 A LIMITED COMPANY IS NOT OFFERED THE LEVER',
  !find(O.findOptimisations({ ...trader, businessType: 'limited_company' }), 'home_office'));
ok('🔴 A PROPERTY ONLY CUSTOMER IS NOT OFFERED THE LEVER',
  !find(O.findOptimisations({ ...trader, incomeShape: 'property_only' }), 'home_office'));
ok('a director who is also a landlord is not offered it either',
  !find(O.findOptimisations({ ...trader, businessType: 'limited_company', incomeShape: 'property_only' }), 'home_office'));

ok('🔴 A SOLE TRADER WITH A TRADE STILL GETS IT, WITH HIS FIGURE',
  (() => {
    const o = find(O.findOptimisations({ ...trader, businessType: 'sole_trader', incomeShape: 'trade' }), 'home_office');
    return !!o && o.estSaving > 0 && o.action === 'apply_allowance_election';
  })());
ok('a partnership still gets it', !!find(O.findOptimisations({ ...trader, businessType: 'partnership' }), 'home_office'));

// 🔴 THE FIELD DEFAULTS TO UNDEFINED, AND EVERY CALLER THAT DOES NOT SET IT IS UNCHANGED TO THE
// LETTER. Not "still gets the lever": the WHOLE list is byte identical, so nothing else moved either.
const asToday = O.findOptimisations(trader);
ok('🔴 AN OPTIMISER INPUT WITH NEITHER FIELD BEHAVES EXACTLY AS IT DID TODAY',
  !!find(asToday, 'home_office'));
ok('...and explicit nulls give the byte identical list, not merely a similar one',
  JSON.stringify(O.findOptimisations({ ...trader, businessType: null, incomeShape: null })) === JSON.stringify(asToday));
ok('...and explicit undefineds too',
  JSON.stringify(O.findOptimisations({ ...trader, businessType: undefined, incomeShape: undefined })) === JSON.stringify(asToday));
ok('...and a KNOWN sole trader with a KNOWN trade changes nothing about the rest of the list',
  JSON.stringify(O.findOptimisations({ ...trader, businessType: 'sole_trader', incomeShape: 'trade' })) === JSON.stringify(asToday));

// Refusing the one lever must not quietly take the others with it.
ok('the company keeps every other lever it was getting',
  (() => {
    const before = asToday.map((o) => o.key).filter((k) => k !== 'home_office');
    const after = O.findOptimisations({ ...trader, businessType: 'limited_company' }).map((o) => o.key);
    return before.length > 0 && before.every((k) => after.includes(k)) && after.length === before.length;
  })());

// The optimiser restates the rule inline rather than importing lib/elections.ts, because three test
// suites stage it with a fixed dependency list and Node cannot resolve an extensionless import. That
// is a real constraint, so it is pinned: an import added here breaks those suites, not this one.
ok('the optimiser does not import lib/elections.ts, and says why', !/from '\.\/elections'/.test(OPTIMISER_SRC));
ok('🔴 the optimiser now knows about structure at all, which it did not on 31 July',
  /businessType/.test(OPTIMISER_SRC) && /incomeShape/.test(OPTIMISER_SRC));
ok('the lever cites the statute where it is refused', /s94H/.test(OPTIMISER_SRC) && /BIM75010/.test(OPTIMISER_SRC));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n7. THE LINE. lib/ledger.ts cannot draw a row for an amount that does not exist.');

// THE VERDICT, ASSERTED RATHER THAN ASSUMED. The "Use of home" row is filtered on amount > 0, so
// with the door shut no company and no landlord can produce an amount, and the row cannot draw.
const ledgerBase = {
  monthsElapsed: 6, grossIncome: 40_000, expenses: 8_000, mileage: 0,
  homeOffice: 0, capitalAllowances: 0, pension: 0, cisSuffered: 0,
};
ok('🔴 A ZERO ELECTION DRAWS NO ROW AT ALL, never an empty one',
  !L.ledger(ledgerBase).lines.find((l) => l.key === 'home_office'));
ok('a real election draws exactly one, by name', (() => {
  const line = L.ledger({ ...ledgerBase, homeOffice: 156 }).lines.filter((l) => l.key === 'home_office');
  return line.length === 1 && line[0].label === 'Use of home';
})());
ok('the row is conditional on the amount, in the source, not by accident of the data',
  /\.filter\(\(d\) => d\.amount > 0\)/.test(LEDGER_SRC));
// ⚠️ THE SOURCE HALF OF THIS WAS LOOSENED ON 1 AUGUST 2026, AND THE RUN IS NOW THE ASSERTION.
//
// It used to pin `homeOffice: Math.max(0, input.ytdHomeOffice ?? 0)` character for character. The
// trading allowance election made that a ternary (a man claiming the flat allowance deducts no use
// of home at all), and the assertion went red on a change that moves nobody's money. The floor is
// the property; where the ternary puts it is not. The regex now looks for the floor wherever it
// sits, and the negative fixture below is what actually proves it.
ok('the assembler floors the amount at zero, so a negative cannot draw one either',
  /Math\.max\(0, input\.ytdHomeOffice \?\? 0\)/.test(LEDGER_SRC)
  && !L.ledgerFor({ monthsElapsed: 6, ytdTradeIncome: 40_000, ytdTradeExpenses: 8_000, ytdCisSuffered: 0, ytdHomeOffice: -312 })
    .lines.find((l) => l.key === 'home_office'));

// ⚠️ AND THE HONEST LIMIT OF THAT VERDICT. The row is fed by ytdHomeOffice, which getOptimiserInput
// fills from a row in public.allowance_elections. Shutting the door stops NEW rows being written for
// a company or a landlord. It does not remove rows written before the door existed, and there is no
// migration here that could: an election is his own record, and taking a claim off a man's return
// without asking him is exactly the kind of acting-for-him CLAUDE.md forbids. The GET tells him, and
// the DELETE is how it comes off. This is the assertion that keeps that route honest.
ok('🔴 A LEGACY ROW IS STILL VISIBLE AND STILL REMOVABLE, which is why GET shows a refused election',
  /refused: refusal \?/.test(GET_BODY) && /elected: election/.test(GET_BODY));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n8. THE WHOLE CHAIN, END TO END.');

const chain = (who) => {
  const refusal = X.electionRefusal('use_of_home', who);
  const input = {
    ...trader,
    businessType: who.structure ?? undefined,
    incomeShape: who.income ?? undefined,
    // No election can exist for a man the door refuses, so nothing reaches the ledger.
    ytdHomeOffice: refusal ? 0 : X.useOfHomeToDate(25, 6),
  };
  return {
    refused: !!refusal,
    suggested: !!find(O.findOptimisations(input), 'home_office'),
    line: !!L.ledgerFor({ ...input, monthsElapsed: 6 }).lines.find((l) => l.key === 'home_office'),
  };
};

ok('🔴 A COMPANY: refused at the door, never suggested, no line on his ledger',
  (() => { const c = chain({ structure: 'limited_company', income: 'trade' }); return c.refused && !c.suggested && !c.line; })());
ok('🔴 A LANDLORD WITH NO TRADE: refused at the door, never suggested, no line on his ledger',
  (() => { const c = chain({ structure: 'sole_trader', income: 'property_only' }); return c.refused && !c.suggested && !c.line; })());
ok('🔴 A SOLE TRADER WITH A TRADE: nothing about his year changed',
  (() => { const c = chain({ structure: 'sole_trader', income: 'trade' }); return !c.refused && c.suggested && c.line; })());
ok('🔴 AN UNKNOWN STRUCTURE AND AN UNKNOWN SHAPE: nothing changed for him either',
  (() => { const c = chain({}); return !c.refused && c.suggested && c.line; })());
ok('an unknown structure with a known trade is treated as the trade he told us about',
  (() => { const c = chain({ income: 'trade' }); return !c.refused && c.suggested && c.line; })());
ok('a known sole trader with an unknown shape keeps everything',
  (() => { const c = chain({ structure: 'sole_trader' }); return !c.refused && c.suggested && c.line; })());

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;
