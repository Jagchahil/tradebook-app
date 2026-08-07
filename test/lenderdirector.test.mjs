// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE LENDER DOCUMENT RATCHET. EVERY SURFACE, RENDERED, FOR A LIMITED COMPANY DIRECTOR.
//   node test/lenderdirector.test.mjs
//
// 🔴 WHY THIS SUITE EXISTS AND WHY IT RENDERS RATHER THAN READS.
//
// A proof of income goes to a mortgage lender. If it is wrong a man is refused a house, or worse,
// given one on a figure that was never his. The queue's standing worry about this document is not
// that the maths is wrong: it is that a rule reaches ONE surface and not the others, and the
// surface it misses is the one that leaves the building. That has now happened three times:
//
//   2 Aug 2026  a £60,000 car went through expenses on the documents and not on the Overview
//   6 Aug 2026  Section 24 interest sat inside "Allowable expenses" on the lender sheet only
//   7 Aug 2026  the car's writing down allowance was explained on the SCREEN and on the SHARED
//               BOOKS page, and not on the HTML document, so the document did not add up
//
// Every one of those was found by a human opening the live app, because every suite read the
// engine and no suite read the PAGE. So this one executes the renderers. It calls the real GET
// handler in app/api/income-proof/route.ts and reads the response bytes, and it renders the real
// server components app/app/proof-of-income/page.tsx and app/share/[token]/page.tsx with
// react-dom and reads their markup. The libraries are real; only the database, the session and
// the capability token are stubbed, because those are the three things a test cannot have.
//
// ⚠️ THE CENSUS IS THE HALF THAT CANNOT BE FORGOTTEN. A future fourth surface that builds an
// income proof and forgets the director fails the census below before anybody has to remember
// this file exists. Adding a renderer means adding it here and giving it the same assertions.
//
// ⚠️ THE DIRECTOR IS THE CASE test/moneyspine.test.mjs CANNOT SEE. Its generator builds sole
// traders and partners only, and a limited company is not one of its six declared exceptions, so
// a rule that lands wrong on a director diverges on no seeded account and the spine stays green.
// The sweep at the end of this file is that missing axis.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, symlinkSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// lib/bookshare.ts reads its signing secret once, at module load, and refuses to mint a link
// without one. Set before the staged import below, never after.
process.env.SHARE_TOKEN_SECRET = process.env.SHARE_TOKEN_SECRET || 'lenderdirector-suite-secret';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b, tol = 0.51) => Math.abs(a - b) <= tol;

// ── stage the real libraries, with node_modules reachable so React and Next resolve ──────────
const fixTs = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'lenderdir-'));
try { symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'dir'); } catch { /* absent is handled below */ }
for (const f of [
  'taxengine', 'money', 'capital', 'nistudentloan', 'ltdengine', 'personalincome',
  'propertyengine', 'autonomy', 'taxoptimiser', 'quarterpack', 'incomeproof', 'bookshare',
  'tokens', 'apptheme',
]) {
  writeFileSync(path.join(stage, f + '.ts'), fixTs(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const IP = await import(pathToFileURL(path.join(stage, 'incomeproof.ts')).href);
const BS = await import(pathToFileURL(path.join(stage, 'bookshare.ts')).href);
const QP = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);

// react-dom, next and typescript are needed to RENDER. Where they are missing (a partial checkout
// with no node_modules) the executed surfaces are reported as unavailable rather than failed, and
// every engine level assertion below still runs.
let ts = null, renderToStaticMarkup = null, NextRequest = null;
try {
  const req = createRequire(path.join(root, 'package.json'));
  ts = req('typescript');
  ({ renderToStaticMarkup } = await import(pathToFileURL(path.join(stage, 'node_modules/react-dom/server.js')).href));
  ({ NextRequest } = await import(pathToFileURL(path.join(stage, 'node_modules/next/server.js')).href));
} catch { ts = null; }
const canRender = Boolean(ts && renderToStaticMarkup && NextRequest);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE CENSUS. Every file in the shipping app that can produce an income figure for a third
//    party, named. A new one fails here until it is added and given the assertions below.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the census: every surface that can put an income figure in front of a lender ===');

const DECLARED = new Set([
  'app/api/income-proof/route.ts',   // the HTML document, the JSON, and the signed ?t= link
  'app/app/proof-of-income/page.tsx', // the in app screen, which is also a print path
  'app/share/[token]/page.tsx',      // share my books, read by the same brokers and lenders
  'lib/incomeproof.ts',              // the engine
  'lib/bookshare.ts',                // the shared books engine
  'lib/supabase.ts',                 // names them in comments only
]);
function walk(dir, out = []) {
  // withFileTypes and no symlink following: a stray toolchain directory under app/ carries broken
  // links, and a census that crashes on one is a census nobody keeps.
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const producers = [...walk(path.join(root, 'app')), ...walk(lib), ...walk(path.join(root, 'components'))]
  .filter((p) => /buildIncomeProof|renderIncomeProofHtml|shareTotals/.test(readFileSync(p, 'utf8')))
  .map((p) => path.relative(root, p))
  .sort();
const undeclared = producers.filter((p) => !DECLARED.has(p));
ok(`the shipping app has exactly the ${DECLARED.size} declared income proof surfaces`, undeclared.length === 0);
if (undeclared.length) console.log('       undeclared:', undeclared.join(', '));
for (const d of DECLARED) ok(`declared surface still exists: ${d}`, producers.includes(d));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE RENDERERS. Real handler, real server components, stubbed only at the database.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const routeSrc = canRender ? readFileSync(path.join(root, 'app/api/income-proof/route.ts'), 'utf8')
  .replace("'next/server'", "'next/server.js'")
  .replace("'../../../lib/supabase'", "'./supabasestub.ts'")
  .replace("'../../../lib/webauth'", "'./webauthstub.ts'")
  .replace("'../../../lib/incomeproof'", "'./incomeproof.ts'")
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

// Runs one account through every surface and hands back what each one actually printed.
async function surfaces({ rows, profile, capAllow = 0, name = 'A. Sparky Ltd', linkToken = false }) {
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
export function verifyPackToken() { return ${linkToken ? "{ userId: 'u1', year: 2026, quarter: 1 }" : 'null'}; }
export function siteBase() { return 'https://lekhio.app'; }
`);
  const bump = (s) => s.replace('./supabasestub.ts', `./supabasestub.ts?v=${n}`).replace('./packtokenstub.ts', `./packtokenstub.ts?v=${n}`);
  writeFileSync(path.join(stage, `route${n}.ts`), bump(routeSrc));
  writeFileSync(path.join(stage, `proof${n}.mjs`), bump(proofPageJs));
  writeFileSync(path.join(stage, `share${n}.mjs`), bump(sharePageJs));

  const R = await import(pathToFileURL(path.join(stage, `route${n}.ts`)).href);
  const url = linkToken ? 'https://lekhio.app/api/income-proof?t=abc' : 'https://lekhio.app/api/income-proof?year=2026';
  const doc = await (await R.GET(new NextRequest(url))).text();
  const json = linkToken ? null : await (await R.GET(new NextRequest(`${url}&format=json`))).json();
  const P = await import(pathToFileURL(path.join(stage, `proof${n}.mjs`)).href);
  const screen = renderToStaticMarkup(await P.default({ searchParams: Promise.resolve({}) }));
  const S = await import(pathToFileURL(path.join(stage, `share${n}.mjs`)).href);
  const token = BS.shareToken(GRANT);
  const shared = renderToStaticMarkup(await S.default({ params: Promise.resolve({ token }) }));
  return { doc, json, screen, shared };
}

// What a reader actually sees, with the entities turned back into characters.
const unent = (s) => s.replace(/&#x27;|&apos;/g, "'").replace(/&middot;/g, '.').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const docRows = (s) => [...s.matchAll(/<td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td>/g)].map((m) => `${unent(m[1])} = ${unent(m[2])}`);
const screenRows = (s) => [...s.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => `${unent(m[1])} = ${unent(m[2])}`);
const text = (s) => unent(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
const gbpNum = (s) => Number(String(s).replace(/[^0-9.-]/g, ''));

const LTD = { businessType: 'limited_company', partnershipShare: 100, incomeShape: 'trade' };
const SOLE = { businessType: 'sole_trader', partnershipShare: 100, incomeShape: 'trade' };
const PART35 = { businessType: 'partnership', partnershipShare: 35, incomeShape: 'trade' };

const CO_TRADE = [
  { amount: 90000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
  { amount: -30000, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE DIRECTOR. What every surface prints, executed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
if (!canRender) {
  // ⚠️ A SKIP THAT CAN HIDE IS NOT A SKIP, IT IS A HOLE. Rendering is allowed to be impossible in
  // a checkout with no node_modules, which is the partial cowork copy. Anywhere the modules ARE
  // installed, a render that will not run is this suite going quiet on the surfaces it exists for,
  // so it goes red instead.
  console.log('\n=== the rendered surfaces need react-dom, next and typescript ===');
  ok('rendering is only allowed to be unavailable where node_modules is absent',
    !existsSync(path.join(root, 'node_modules')));
} else {
  console.log('\n=== a limited company director, every surface, executed ===');
  const d = await surfaces({ rows: CO_TRADE, profile: LTD });

  // 🔴 THE ONE THAT WOULD BE A STOP ITEM: a personal tax figure on a company's profit.
  ok('the document offers NO personal tax figure on a company profit',
    !/Estimated Income Tax|National Insurance|Class 4/.test(d.doc));
  ok('the screen offers NO personal tax figure on a company profit',
    !/Estimated Income Tax|National Insurance|Class 4/.test(d.screen));
  ok('the JSON says the same: estimatedTax 0, no National Insurance, companyExcluded',
    d.json.estimatedTax === 0 && d.json.nationalInsurance === 0 && d.json.companyExcluded === true);

  // Whose money it is, said in words on every surface that prints the figures.
  const OWNS = /These are the company's figures, not this person's personal income/;
  ok('the document names the figures as the company\'s, not his', OWNS.test(text(d.doc)));
  ok('the screen names the figures as the company\'s, not his', OWNS.test(text(d.screen)));
  ok('the shared books page names them as the company\'s too',
    /These are the company's books/.test(text(d.shared))
    && /salary and dividends, which are not shown here/.test(text(d.shared)));

  // The figures themselves, byte for byte, across the two surfaces that print a money table.
  ok('the document and the screen print the SAME money rows, to the character',
    JSON.stringify(docRows(d.doc)) === JSON.stringify(screenRows(d.screen)));
  ok('the document prints the company figures under plain labels',
    docRows(d.doc).join(' | ') === 'Gross income = £90,000.00 | Allowable expenses = £30,000.00 | Net profit = £60,000.00');

  // The signed link is the same document. A capability token must not skip the structure read:
  // if it did, a director's link would print a personal tax estimate his own screen refuses.
  const linked = await surfaces({ rows: CO_TRADE, profile: LTD, linkToken: true });
  ok('the shareable ?t= link prints the identical money rows',
    JSON.stringify(docRows(linked.doc)) === JSON.stringify(docRows(d.doc)));
  ok('the shareable ?t= link carries the company sentence and no personal tax',
    OWNS.test(text(linked.doc)) && !/Estimated Income Tax/.test(linked.doc));

  // ── the document must RECONCILE, on every surface, for every account ────────────────────────
  //
  // 🔴 THIS IS THE ASSERTION THAT WOULD HAVE CAUGHT 7 AUGUST. Gross income less allowable
  // expenses is the sum a lender does in his head. Where the printed net profit is something
  // else, the document must say why on the document. A sentence on the screen does not help a
  // man reading the paper.
  function reconciles(rows, body) {
    const map = Object.fromEntries(rows.map((r) => r.split(' = ')));
    const gross = gbpNum(map['Gross income']);
    const exp = gbpNum(map['Allowable expenses']);
    const net = gbpNum(map['Net profit']);
    if (near(gross - exp, net, 0.01)) return true;
    return /writing down allowance|mortgage interest|residential/.test(body);
  }

  console.log('\n=== the document must add up, or say why it does not ===');
  const cases = [
    ['a director with no car', CO_TRADE, LTD, 0],
    ['a director with a company car bought this year', [...CO_TRADE,
      { amount: -35000, transaction_date: '2026-05-10', category: 'van', vendor: 'Motor dealer', writtenDown: true }], LTD, 2100],
    ['a director whose car was bought in an EARLIER year', CO_TRADE, LTD, 2100],
    ['a sole trader with a car bought this year', [
      { amount: 33000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
      { amount: -8000, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
      { amount: -35000, transaction_date: '2026-05-10', category: 'van', vendor: 'Motor dealer', writtenDown: true }], SOLE, 2100],
    ['a sole trader whose car was bought in an EARLIER year', [
      { amount: 33000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
      { amount: -8000, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' }], SOLE, 2100],
    ['a mortgaged landlord, Section 24 interest held out', [
      { amount: 60000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
      { amount: 20000, transaction_date: '2026-06-20', category: 'rent', vendor: 'Tenants', income_type: 'property' },
      { amount: -8000, transaction_date: '2026-06-22', category: 'mortgage interest', vendor: 'Lender', income_type: 'property' }], SOLE, 0],
  ];
  for (const [label, rows, profile, capAllow] of cases) {
    const s = await surfaces({ rows, profile, capAllow });
    ok(`${label}: the DOCUMENT reconciles or explains itself`, reconciles(docRows(s.doc), text(s.doc)));
    ok(`${label}: the document and the screen still print identical money rows`,
      JSON.stringify(docRows(s.doc)) === JSON.stringify(screenRows(s.screen)));
  }

  // ── the two regressions the 6 August work fixed, on the rendered document ───────────────────
  console.log('\n=== 6 August, still fixed, read off the rendered document ===');
  const partner = await surfaces({
    rows: [
      { amount: 53400, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
      { amount: -13400, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
      { amount: 70000, transaction_date: '2026-06-20', category: 'rent', vendor: 'Tenants', income_type: 'property' },
    ],
    profile: PART35, name: 'The Firm',
  });
  const pRows = Object.fromEntries(docRows(partner.doc).map((r) => r.split(' = ')));
  ok('a 35% partner: his trade is 35% of the firm, his RENT is his own in full (£18,690 + £70,000)',
    gbpNum(pRows['Gross income']) === 88690);
  ok('...and the document says so in words, not just in the arithmetic',
    /The property figures are their own, in full: rent is personal income, not the firm's/.test(text(partner.doc)));

  const loss = await surfaces({
    rows: [
      { amount: 10000, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
      { amount: -18000, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
    ], profile: SOLE, name: 'Struggling',
  });
  ok('a loss prints as a loss on the document, not a floored zero',
    docRows(loss.doc).includes('Net profit = -£8,000.00'));
  ok('...and on the screen, to the same character',
    screenRows(loss.screen).includes('Net profit = -£8,000.00'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE PROPERTY ALLOWANCE AND SECTION 24 ARE MUTUALLY EXCLUSIVE.
//    GOV.UK, "Tax free allowances on property and trading income": the property allowance cannot
//    be used alongside the tax reducer for residential finance costs. Relieving both would give
//    the same money away twice on a document a lender reads.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the property allowance and Section 24 never both apply ===');
const propRows = (rent, exp, fin, trade = 0) => {
  const r = [{ amount: rent, transaction_date: '2026-06-20', category: 'rent', vendor: 'Tenants', income_type: 'property' }];
  if (trade) r.unshift({ amount: trade, transaction_date: '2026-06-01', category: null, vendor: 'Customer' });
  if (exp) r.push({ amount: -exp, transaction_date: '2026-06-21', category: 'insurance', vendor: 'Letting agent', income_type: 'property' });
  if (fin) r.push({ amount: -fin, transaction_date: '2026-06-22', category: 'mortgage interest', vendor: 'Lender', income_type: 'property' });
  return r;
};
{
  // Costs under the £1,000 allowance, WITH interest: the allowance wins and the credit is forfeit.
  const p = IP.buildIncomeProof(propRows(9000, 300, 400, 60000), 'Landlord', 2026, new Date('2027-04-05'), { type: 'sole_trader' }, 0);
  ok('tiny costs plus interest: the allowance is taken (£9,000 less £1,000 = £8,000 property profit)',
    p.propertyProfit === 8000);
  ok('...and the Section 24 credit is ZERO, so the same £400 is not relieved twice', p.financeCredit === 0);
  ok('...and the document does not claim a credit it did not give',
    !/the credit of/.test(IP.renderIncomeProofHtml(p)));
}
{
  // Costs over the allowance: actual expenses, and the credit is real.
  const p = IP.buildIncomeProof(propRows(20000, 3000, 8000, 60000), 'Landlord', 2026, new Date('2027-04-05'), { type: 'sole_trader' }, 0);
  ok('real costs: actual expenses are deducted, not the allowance', p.propertyProfit === 17000);
  ok('...and the Section 24 credit is the basic rate on the interest (£1,600)', near(p.financeCredit, 1600, 0.01));
  ok('...and the interest is NOT inside allowable expenses', p.expenses === 3000 && p.financeCost === 8000);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE DIRECTOR SWEEP. The axis test/moneyspine.test.mjs cannot see.
//    Seeded company accounts, read by the proof of income, the quarter pack and the shared books.
//    A director never gets a personal tax estimate anywhere, and the three readers state one
//    taxable profit.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the director sweep: seeded company accounts, every reader, one truth ===');
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
const TURNOVER = [500, 12570, 33000, 50270, 90000, 125140, 200000];
const COSTS = [0, 800, 8000, 30000, 220000];
const RENTS = [0, 9000, 45000];

let swept = 0;
for (let i = 0; i < 60; i++) {
  const turnover = pick(TURNOVER);
  const cost = pick(COSTS);
  const rent = pick(RENTS);
  const capAllow = i % 4 === 0 ? 2100 : 0;
  const rows = [
    { amount: turnover, transaction_date: '2026-06-01', category: null, vendor: 'Customer' },
    { amount: -cost, transaction_date: '2026-06-02', category: 'materials', vendor: 'Wholesaler' },
  ];
  if (i % 3 === 0) rows.push({ amount: -35000, transaction_date: '2026-05-10', category: 'van', vendor: 'Motor dealer', writtenDown: true });
  if (rent) rows.push({ amount: rent, transaction_date: '2026-06-20', category: 'rent', vendor: 'Tenants', income_type: 'property' });

  const proof = IP.buildIncomeProof(rows, 'A. Sparky Ltd', 2026, new Date('2027-04-05'), { type: 'limited_company' }, capAllow);
  const pack = QP.buildQuarterPack({
    transactions: rows.map((t) => ({ ...t })), startYear: 2026, quarter: 4,
    now: new Date('2027-04-30'), mtdStated: 'no', structure: 'limited_company', capitalAllowance: capAllow,
  });
  const totals = BS.shareTotals(rows.map((r) => ({
    amount: r.amount, writtenDown: r.writtenDown === true, financeCost: false,
  })), capAllow);
  const label = `#${i} turnover ${turnover} costs ${cost}${rent ? ` rent ${rent}` : ''}${capAllow ? ' car' : ''}`;

  // 🔴 NOT ONE PENNY OF PERSONAL TAX ON A COMPANY'S PROFIT, on any reader.
  ok(`${label}: the proof of income offers no personal tax`, proof.estimatedTax === 0 && proof.nationalInsurance === 0);
  ok(`${label}: the quarter pack offers no personal tax`, pack.ytd.estimatedTax.total === 0 && pack.ytd.estimatedTax.class4 === 0);
  ok(`${label}: the proof says whose figures they are`, proof.companyExcluded === true && proof.shareNote === null);
  // The company's turnover is not his Making Tax Digital qualifying income; his rent is.
  ok(`${label}: the mandation test counts the rent and not the company's turnover`,
    near(pack.ytd.grossQualifyingIncome, rent, 0.01));
  // One taxable profit across the two documents a third party reads.
  ok(`${label}: the shared books and the proof state one profit`, totals.profit === proof.profit);
  // And a director is never scaled by a partnership share he does not have.
  const asShared = IP.buildIncomeProof(rows, 'A. Sparky Ltd', 2026, new Date('2027-04-05'), { type: 'limited_company', sharePercent: 50 }, capAllow);
  ok(`${label}: a stray sharePercent cannot halve a director's figures`, asShared.income === proof.income);
  swept += 1;
}
ok(`the director sweep ran ${swept} seeded company accounts`, swept === 60);

// One control: the same books read as a sole trader DO carry a personal estimate, so the zeroes
// above are the company rule and not a dead code path.
{
  const rows = CO_TRADE;
  const sole = IP.buildIncomeProof(rows, 'A. Sparky', 2026, new Date('2027-04-05'), { type: 'sole_trader' }, 0);
  const unknown = IP.buildIncomeProof(rows, 'A. Sparky', 2026, new Date('2027-04-05'), null, 0);
  ok('the control: the same books as a sole trader DO carry a personal estimate', sole.estimatedTax > 0);
  ok('the control: an unknown structure is unchanged from a sole trader, to the penny',
    unknown.estimatedTax === sole.estimatedTax && unknown.income === sole.income);
  const tp = O.taxPosition({
    startYear: 2026, monthsElapsed: 12, daysElapsed: 365,
    ytdTradeIncome: 90000, ytdTradeExpenses: 30000, ytdCisSuffered: 0, employmentIncome: 0,
    categoriesLogged: ['materials'], homeOfficeClaimed: false, mileageClaimed: false,
    businessType: 'sole_trader', incomeShape: 'trade',
  });
  ok('the control: and it agrees with the Overview to the penny', near(sole.estimatedTax, tp.setAside));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
