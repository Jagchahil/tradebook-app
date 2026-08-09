// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE TWO SCREENS RATCHET. app/app/proof-of-income/page.tsx AND app/share/[token]/page.tsx,
// RENDERED, AGAINST THE DOCUMENT lib/incomeproof.ts ALREADY PRINTS.
//   node test/lenderscreens.test.mjs
//
// 7 August 2026. lib/incomeproof.ts was fixed so its printed document explains a writing down
// allowance even in the year AFTER the vehicle was bought, when capitalCost is back to zero but
// capitalAllowance is not. The two SCREENS that show the identical figures, from the identical
// engine, still guarded the sentence on capitalCost alone, so a lender reading the phone screen or
// the shared books link saw three figures that did not add up and nothing explaining why, every
// year after the first. That is fixed here.
//
// This file is modelled on test/lenderdirector.test.mjs, which is not edited: it renders the real
// server components with react-dom rather than reading the source and concluding, for the same
// reason that file gives at length. Only the database, the session and the capability token are
// stubbed.
//
// SCOPE. Two things are ratcheted here, both permanent, both green today and meant to stay green:
//
//   1. The capital allowance caption must appear on both screens whenever capitalAllowance is
//      claimed, whether or not a purchase happened inside this tax year, and it must say the SAME
//      thing the document already says. Screen A (proof of income) mirrors the document word for
//      word, the way it already does for the capitalCost > 0 sentence, so the two are compared for
//      exact equality. Screen B (share) has its own established wording for the sibling sentence
//      (see the block above it), so it is compared on the figure and the closing clause it already
//      uses, not forced into the document's exact words.
//
//   2. The company caption on the proof of income screen ("These are the company's figures...") is
//      a second hardcoded copy of a sentence lib/incomeproof.ts also hardcodes, with no field on
//      IncomeProof carrying it so the two could be read from one place. Until that field exists
//      (see the packet for this lane: it is a change to lib/incomeproof.ts, out of scope here) the
//      only guard available is a ratchet that renders both and asserts they say the byte identical
//      thing, so a future edit to either copy alone is caught here rather than by a lender.
//
// NOT IN SCOPE, ON PURPOSE. app/share/[token]/page.tsx's own company caption ("These are the
// company's books...") is intentionally different wording from the document's, already accepted by
// test/lenderdirector.test.mjs ("the shared books page names them as the company's too", matched by
// its own pattern, not the document's). This file does not force that page to match the document
// word for word: doing so would be inventing a change nobody asked for on a page whose divergence
// is already a decided, tested position elsewhere.
//
// A third finding, a director who also lets a flat personally, is NOT ratcheted here. It needs a
// change to lib/incomeproof.ts (which surface owns the caption, and whether the estimated tax on
// his own rent should really be zeroed by the company flag) and this lane does not own that file.
// It is reported as a specification, not fixed, and not half fixed on the screen alone.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

process.env.SHARE_TOKEN_SECRET = process.env.SHARE_TOKEN_SECRET || 'lenderscreens-suite-secret';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b, tol = 0.51) => Math.abs(a - b) <= tol;

// ── stage the real libraries, node_modules reachable so React and Next resolve, the same set
// test/lenderdirector.test.mjs stages ────────────────────────────────────────────────────────────
const fixTs = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'lenderscreens-'));
try { symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'dir'); } catch { /* absent is handled below */ }
for (const f of [
  'taxengine', 'money', 'capital', 'nistudentloan', 'ltdengine', 'personalincome',
  'propertyengine', 'autonomy', 'taxoptimiser', 'quarterpack', 'incomeproof', 'bookshare',
  // lib/scotland.ts, one exported sentence with no imports of its own, printed by both lender
  // documents staged above.
  'tokens', 'apptheme', 'scotland',
  // Which tax year the document is about. Staged as the REAL file and never stubbed, because it
  // is the thing that decides whether this handler prints 2026/27 or prints tax year zero.
  'proofyear',
]) {
  writeFileSync(path.join(stage, f + '.ts'), fixTs(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const BS = await import(pathToFileURL(path.join(stage, 'bookshare.ts')).href);

let ts = null, renderToStaticMarkup = null, NextRequest = null;
try {
  const req = createRequire(path.join(root, 'package.json'));
  ts = req('typescript');
  ({ renderToStaticMarkup } = await import(pathToFileURL(path.join(stage, 'node_modules/react-dom/server.js')).href));
  ({ NextRequest } = await import(pathToFileURL(path.join(stage, 'node_modules/next/server.js')).href));
} catch { ts = null; }
const canRender = Boolean(ts && renderToStaticMarkup && NextRequest);

const routeSrc = canRender ? readFileSync(path.join(root, 'app/api/income-proof/route.ts'), 'utf8')
  .replace("'next/server'", "'next/server.js'")
  .replace("'../../../lib/supabase'", "'./supabasestub.ts'")
  .replace("'../../../lib/webauth'", "'./webauthstub.ts'")
  .replace("'../../../lib/incomeproof'", "'./incomeproof.ts'")
  .replace("'../../../lib/proofyear'", "'./proofyear.ts'")
  .replace("'../../../lib/packtoken'", "'./packtokenstub.ts'") : '';

const tsx = (src, name) => ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
  fileName: name,
}).outputText;

const proofPageJs = canRender ? tsx(readFileSync(path.join(root, 'app/app/proof-of-income/page.tsx'), 'utf8')
  .replace("'next/navigation'", "'./navstub.ts'")
  .replace("'next/headers'", "'./headersstub.ts'")
  .replace("'../../../lib/webauth'", "'./webauthstub.ts'")
  .replace("'../../../lib/websession'", "'./websessionstub.ts'")
  .replace("'../../../lib/supabase'", "'./supabasestub.ts'")
  .replace("'../../../lib/incomeproof'", "'./incomeproof.ts'")
  // The Scotland sentence the screen prints beside the estimated tax figure, from the same constant
  // the document prints. See lib/scotland.ts and test/scotland.test.mjs.
  .replace("'../../../lib/scotland'", "'./scotland.ts'")
  .replace("'../../../lib/money'", "'./money.ts'")
  .replace("'../../../lib/tokens'", "'./tokens.ts'")
  .replace("'../../../lib/apptheme'", "'./apptheme.ts'")
  .replace("from '../AppNav'", "from './appnavstub.mjs'"), 'proof.tsx') : '';

const sharePageJs = canRender ? tsx(readFileSync(path.join(root, 'app/share/[token]/page.tsx'), 'utf8')
  .replace("'../../../lib/bookshare'", "'./bookshare.ts'")
  .replace("'../../../lib/supabase'", "'./supabasestub.ts'")
  .replace("'../../../lib/quarterpack'", "'./quarterpack.ts'")
  .replace("'../../../lib/tokens'", "'./tokens.ts'")
  .replace("'../../../lib/money'", "'./money.ts'"), 'share.tsx') : '';

if (canRender) {
  writeFileSync(path.join(stage, 'webauthstub.ts'), `
export async function sessionUser() { return { id: 'u1' }; }
export async function userFromSessionCookie() { return { id: 'u1' }; }
`);
  writeFileSync(path.join(stage, 'websessionstub.ts'), `export const SESSION_COOKIE = 'lek';`);
  writeFileSync(path.join(stage, 'navstub.ts'), `export function redirect() { throw new Error('redirected'); }`);
  writeFileSync(path.join(stage, 'headersstub.ts'), `export async function cookies() { return { get: () => ({ value: 'x' }) }; }`);
  writeFileSync(path.join(stage, 'appnavstub.mjs'), `export function AppNav() { return null; }`);
}

const GRANT = '11111111-2222-4333-8444-555555555555';
let seq = 0;

// Runs one account through the document and both screens, and hands back what each one printed.
// The shape mirrors test/lenderdirector.test.mjs's surfaces() helper on purpose.
async function surfaces({ rows, profile, capAllow = 0, name = 'Vasey Electrical' }) {
  seq += 1;
  const n = seq;
  writeFileSync(path.join(stage, `supabasestub.ts`), `
export async function getConfirmedTransactionsForRange() { return ${JSON.stringify(rows)}; }
export async function getConfirmedTransactionsForUser() { return ${JSON.stringify(rows.map((r) => ({ ...r, confirmed: true })))}; }
export async function getBusinessName() { return ${JSON.stringify(name)}; }
export async function getBusinessProfile() { return ${JSON.stringify(profile)}; }
export async function capitalAllowanceForYear() { return ${capAllow}; }
export async function getBookShare() { return { id: ${JSON.stringify(GRANT)}, user_id: 'u1', revoked_at: null, expires_at: '2099-01-01T00:00:00Z', recipient_name: 'A lender', from_date: '2026-04-06', exclude_categories: [] }; }
export async function touchBookShare() { return true; }
`);
  writeFileSync(path.join(stage, 'packtokenstub.ts'), `
export function packToken() { return 'tok'; }
export function verifyPackToken() { return null; }
export function siteBase() { return 'https://lekhio.app'; }
`);
  const bump = (s) => s.replace('./supabasestub.ts', `./supabasestub.ts?v=${n}`).replace('./packtokenstub.ts', `./packtokenstub.ts?v=${n}`);
  writeFileSync(path.join(stage, `route${n}.ts`), bump(routeSrc));
  writeFileSync(path.join(stage, `proof${n}.mjs`), bump(proofPageJs));
  writeFileSync(path.join(stage, `share${n}.mjs`), bump(sharePageJs));

  const R = await import(pathToFileURL(path.join(stage, `route${n}.ts`)).href);
  const doc = await (await R.GET(new NextRequest('https://lekhio.app/api/income-proof?year=2026'))).text();
  const P = await import(pathToFileURL(path.join(stage, `proof${n}.mjs`)).href);
  const screen = renderToStaticMarkup(await P.default({ searchParams: Promise.resolve({}) }));
  const S = await import(pathToFileURL(path.join(stage, `share${n}.mjs`)).href);
  const token = BS.shareToken(GRANT);
  const shared = renderToStaticMarkup(await S.default({ params: Promise.resolve({ token }) }));
  return { doc, screen, shared };
}

const unent = (s) => s.replace(/&#x27;|&apos;/g, "'").replace(/&middot;/g, '.').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const text = (s) => unent(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const docRows = (s) => [...s.matchAll(/<td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td>/g)].map((m) => `${unent(m[1])} = ${unent(m[2])}`);
const screenRows = (s) => [...s.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => `${unent(m[1])} = ${unent(m[2])}`);
const gbpNum = (s) => Number(String(s).replace(/[^0-9.-]/g, ''));

const SOLE = { businessType: 'sole_trader', partnershipShare: 100, incomeShape: 'trade' };
const LTD = { businessType: 'limited_company', partnershipShare: 100, incomeShape: 'trade' };

const oldVanRow = (income, expenses) => [
  { amount: income, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
  { amount: -expenses, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
  // No writtenDown: true row anywhere: the vehicle was bought in an earlier tax year, so there is no
  // purchase inside this range and capitalCost must come out at zero.
];

if (!canRender) {
  console.log('\n=== the rendered surfaces need react-dom, next and typescript ===');
  ok('rendering is only allowed to be unavailable where node_modules is absent',
    !existsSync(path.join(root, 'node_modules')));
} else {

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PROBLEM ONE. Jag's own numbers: gross 33,000, allowable expenses 8,000, a vehicle bought two
// Aprils ago still earning a 2,100 writing down allowance this year. capitalCost is 0. Net profit
// prints 22,900, which is not 33,000 less 8,000, and before this fix neither screen said why.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== PROBLEM ONE: a vehicle bought in an earlier year, still earning an allowance ===');
{
  const s = await surfaces({ rows: oldVanRow(33000, 8000), profile: SOLE, capAllow: 2100 });

  ok('the document (already shipped) explains the allowance', /writing down allowance/i.test(text(s.doc)));
  ok('the proof of income SCREEN now explains it too', /writing down allowance/i.test(text(s.screen)));
  ok('the SHARE screen now explains it too', /writing down allowance/i.test(text(s.shared)));

  const sentence = (body, endsAt) => text(body).match(new RegExp(`This year's writing down allowance[\\s\\S]*?${endsAt}`))?.[0];
  const docSentence = sentence(s.doc, 'allowable expenses\\.');
  const screenSentence = sentence(s.screen, 'allowable expenses\\.');
  const sharedSentence = sentence(s.shared, 'Income less Expenses\\.');

  ok('the document names the right figure, £2,100.00', /£2,100\.00/.test(docSentence ?? ''));
  ok('THE STRONG RATCHET: the proof of income screen says the BYTE IDENTICAL sentence as the document',
    Boolean(docSentence) && docSentence === screenSentence);
  ok('the share screen names the same £2,100.00 figure the document does',
    /£2,100\.00/.test(sharedSentence ?? '') && /£2,100\.00/.test(docSentence ?? ''));
  ok('the share screen keeps its own established closing clause ("not simply Income less Expenses"), not a third wording',
    /already taken off the Profit above, which is why it is not simply Income less Expenses\./.test(sharedSentence ?? ''));

  ok('the document reconciles: 33,000 less 8,000 less 2,100 is 22,900',
    docRows(s.doc).includes('Gross income = £33,000.00') && docRows(s.doc).includes('Net profit = £22,900.00'));
  ok('the proof of income screen prints the same three figures as the document',
    JSON.stringify(docRows(s.doc)) === JSON.stringify(screenRows(s.screen)));
}

// A director gets the identical treatment: the fix is not sole trader only.
console.log('\n=== PROBLEM ONE, a limited company director with the same old vehicle ===');
{
  const s = await surfaces({ rows: oldVanRow(90000, 30000), profile: LTD, capAllow: 2100, name: 'A. Sparky Ltd' });
  ok('the director\'s proof of income screen explains the allowance', /writing down allowance/i.test(text(s.screen)));
  ok('the director\'s share screen explains the allowance', /writing down allowance/i.test(text(s.shared)));
  ok('no personal tax is offered on the company\'s profit regardless (unrelated axis, must stay off)',
    !/Estimated Income Tax/.test(s.screen));
}

// ── regression: the ORIGINAL capitalCost > 0 sentence, unaffected ──────────────────────────────
console.log('\n=== PROBLEM ONE, regression: a vehicle bought THIS year still reads exactly as before ===');
{
  // The Vasey Electrical fixture from test/incomeproof.test.mjs, a car inside this year's range.
  const rows = [
    { amount: 33580, transaction_date: '2026-05-10', category: null, vendor: 'Customer' },
    { amount: -12088, transaction_date: '2026-06-01', category: 'materials', vendor: 'Wholesaler' },
    { amount: -60000, transaction_date: '2026-06-20', category: 'van', vendor: 'Motor dealer', writtenDown: true },
  ];
  const s = await surfaces({ rows, profile: SOLE, capAllow: 2100 });
  ok('the document still prints the capitalCost > 0 sentence', /£60,000\.00 more left the account on a car/.test(text(s.doc)));
  ok('the proof of income screen still prints the identical capitalCost > 0 sentence',
    /£60,000\.00 more left the account on a car/.test(text(s.screen)));
  ok('the share screen still prints its own established capitalCost > 0 sentence',
    /£60,000\.00 of the spending below went on a car/.test(text(s.shared)));
  ok('the NEW capitalCost === 0 sentence never ALSO fires when capitalCost is really > 0 (proof of income)',
    !/on a vehicle is already taken off the profit above, which is why/.test(text(s.screen)));
  ok('the NEW capitalCost === 0 sentence never ALSO fires when capitalCost is really > 0 (share)',
    !/on a vehicle is already taken off the Profit above, which is why/.test(text(s.shared)));
}

// ── regression: nobody with a car ever gets either sentence ────────────────────────────────────
console.log('\n=== PROBLEM ONE, regression: no vehicle, no allowance, no sentence at all ===');
{
  const s = await surfaces({ rows: oldVanRow(33000, 8000), profile: SOLE, capAllow: 0 });
  ok('the document says nothing about a writing down allowance', !/writing down allowance/i.test(text(s.doc)));
  ok('the proof of income screen says nothing about a writing down allowance', !/writing down allowance/i.test(text(s.screen)));
  ok('the share screen says nothing about a writing down allowance', !/writing down allowance/i.test(text(s.shared)));
}

// ── a sweep: many capitalCost === 0, capitalAllowance > 0 accounts, both screens must reconcile ─
//
// Generalises test/lenderdirector.test.mjs's document only reconciles() check to the two screens,
// which is the assertion that would have caught 7 August on the screens, not only on the document.
console.log('\n=== PROBLEM ONE, the sweep: every account must reconcile or say why, on every surface ===');
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260807);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const INCOMES = [12000, 33000, 45000, 90000, 125000];
const COSTS = [0, 4000, 8000, 20000];
const ALLOWS = [0, 900, 2100, 5400];

function reconciles(rows, body) {
  const map = Object.fromEntries(rows.map((r) => r.split(' = ')));
  const gross = gbpNum(map['Gross income'] ?? map['Income']);
  const exp = gbpNum(map['Allowable expenses'] ?? map['Expenses']);
  const net = gbpNum(map['Net profit'] ?? map['Profit']);
  if (near(gross - exp, net, 0.01)) return true;
  return /writing down allowance|mortgage interest|residential/.test(body);
}
// Reads the summary cards off the share page's grid (INCOME / EXPENSES / PROFIT), the same shape
// docRows/screenRows read off the document and the proof of income screen.
function shareCardRows(html) {
  const grab = (label) => text(html).match(new RegExp(`${label} ([^A-Z]*?)(?= [A-Z]|$)`))?.[1]?.trim();
  return [`Income = ${grab('INCOME')}`, `Expenses = ${grab('EXPENSES')}`, `Profit = ${grab('PROFIT')}`];
}

let swept = 0;
for (let i = 0; i < 24; i++) {
  const income = pick(INCOMES);
  const cost = pick(COSTS);
  const allow = pick(ALLOWS);
  const profile = i % 2 === 0 ? SOLE : LTD;
  const s = await surfaces({ rows: oldVanRow(income, cost), profile, capAllow: allow, name: 'Sweep Ltd' });
  const label = `#${i} income ${income} cost ${cost} allowance ${allow} (${profile.businessType})`;
  ok(`${label}: the document reconciles or explains itself`, reconciles(docRows(s.doc), text(s.doc)));
  ok(`${label}: the proof of income screen reconciles or explains itself`, reconciles(screenRows(s.screen), text(s.screen)));
  ok(`${label}: the share screen reconciles or explains itself`, reconciles(shareCardRows(s.shared), text(s.shared)));
  swept += 1;
}
ok(`the sweep ran ${swept} accounts, all with a vehicle bought in an earlier year`, swept === 24);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PROBLEM TWO. app/app/proof-of-income/page.tsx keeps its own literal copy of the company caption
// lib/incomeproof.ts also hardcodes. There is no field on IncomeProof carrying it (see the packet),
// so the only guard available today is a byte for byte equality ratchet between the two renders.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== PROBLEM TWO: the company caption on the proof of income screen must not drift from the document ===');
const companyCaption = (body, tag) => {
  const re = tag === 'div'
    ? /<div class="whose">These are the company's figures[\s\S]*?<\/div>/
    : /<p[^>]*>These are the company&#x27;s figures[\s\S]*?<\/p>/;
  const m = body.match(re);
  return m ? text(m[0]) : null;
};
const companyCases = [
  ['a plain director, no property', [
    { amount: 90000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
    { amount: -30000, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
  ]],
  ['a director with different figures, so this is not a coincidence of one number set', [
    { amount: 45500, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
    { amount: -12750, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
  ]],
];
for (const [label, rows] of companyCases) {
  const s = await surfaces({ rows, profile: LTD, name: 'A. Sparky Ltd' });
  const docCaption = companyCaption(s.doc, 'div');
  const screenCaption = companyCaption(s.screen, 'p');
  ok(`${label}: the document states the company caption`, Boolean(docCaption));
  ok(`${label}: the proof of income screen states the company caption`, Boolean(screenCaption));
  ok(`${label}: THE STRONG RATCHET, document and screen say the BYTE IDENTICAL thing`,
    Boolean(docCaption) && docCaption === screenCaption);
}

} // canRender

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
