// THE MILEAGE CALCULATOR, /mileage-calculator. Run: node test/mileage.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS DEFENDS.
//
// 🔴 1. THE RATE IS NOT WRITTEN DOWN ON THE PAGE. HMRC moved the car rate from 45p to 55p with
// effect from 6 April 2026. lib/newsletter.ts was still saying 45p on 6 August, four months later,
// because it had the number in prose. app/api/whatsapp/route.ts carried a hardcoded 55p that
// ignored an approved override. Khoji compares GOV.UK to lib/taxengine.ts AND TO NOTHING ELSE, so
// a rate repeated in a component is a rate standing outside the watch: the alarm reads the engine,
// finds it correct, reports green, and the site hands every visitor last year's number.
//
// This suite holds the page to reading FACTS, including in the <title>, which is the copy Google
// caches and an assistant quotes back.
//
// 🔴 2. THE BAND IS THE WHOLE SUM. The rate drops after the first 10,000 business miles and the
// commonest way to get this wrong is to apply the higher rate to everything, which over claims for
// exactly the high mileage tradesman this page is aimed at. Behavioural, at the edge and either
// side of it.
//
// 🔴 3. IT IS A DEDUCTION, NOT A REFUND. A mileage claim comes off PROFIT. A visitor who reads
// "£5,170" as money coming back has been misled by this screen, so the headline says what it is,
// and this suite refuses the refund vocabulary.
//
// 🔴 4. THE DOUBLE CLAIM WARNING IS ON THE PAGE. Mileage is a simplified expense that already
// covers the fuel. Claiming mileage AND the fuel receipts is the one mistake here that costs money
// at an enquiry rather than merely leaving some behind, and lib/capital.ts calls it out in its own
// header. A calculator that prints a bigger number without that sentence is selling the error.
//
// 🔴 5. THE LOCK RULE SURVIVES THE JOURNEY TO THE PAGE. You pick mileage or you pick capital
// allowances, per vehicle, and you cannot switch later. lib/capital.ts vehicleAdvice() puts that
// first in its reasoning. The page must RENDER those lines rather than paraphrase them, because a
// paraphrase on a marketing page is how a hard rule gets softened into a nice-to-know.
//
// 🔴 6. A FREE TOOL NOBODY CAN FIND IS NOT A FREE TOOL. Four manifests carry the route and every
// one of them has been forgotten before: the sitemap, the footer, /resources, and llms.txt.
//
// Behavioural where it can be. lib/ is staged and the real functions run.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'mileage-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
for (const f of readdirSync(lib)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const load = (n) => import(pathToFileURL(path.join(stage, n + '.ts')).href);
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
// Strip block and line comments. A comment EXPLAINING why a rate was removed must not itself trip
// the guard against that rate, which is the trap this corpus has fallen into three times.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
const near = (a, b) => Math.abs(a - b) < 0.005;

const ENG = await load('taxengine');
const CAP = await load('capital');
const { FACTS, mileageClaim } = ENG;
const { vehicleAdvice } = CAP;

const PAGE = 'app/mileage-calculator/page.tsx';
const CALC = 'app/mileage-calculator/Calc.tsx';

console.log('\nmileage calculator');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 1. the route exists ===\n');
ok('app/mileage-calculator/page.tsx exists', existsSync(path.join(root, PAGE)));
ok('app/mileage-calculator/Calc.tsx exists', existsSync(path.join(root, CALC)));

const pageSrc = read(PAGE);
const calcSrc = read(CALC);
const pageCode = strip(pageSrc);
const calcCode = strip(calcSrc);

ok('the page is a server component and the calculator is the client half',
  !/^'use client'/m.test(pageSrc) && /^'use client';/m.test(calcSrc));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 2. the band, at the edge and either side of it ===\n');

const B = FACTS.mileageFirstBandMiles;
const hi = FACTS.mileageCarFirst10k;
const lo = FACTS.mileageCarOver10k;

ok(`the band is a real number of miles (${B.toLocaleString('en-GB')})`, Number.isFinite(B) && B > 0);
ok(`🔴 the rate DROPS after the band, ${Math.round(hi * 100)}p then ${Math.round(lo * 100)}p`, lo < hi);
ok('🔴 and the first band rate is the raised one, not the 45p it was until 2025/26', hi > 0.45);

ok('nothing claimed on no miles', mileageClaim(0) === 0);
ok('nothing claimed on negative miles, rather than a negative deduction', mileageClaim(-500) === 0);
ok('one mile is one mile at the first rate', near(mileageClaim(1), hi));
ok('exactly at the band edge, every mile is at the higher rate', near(mileageClaim(B), B * hi));
ok('🔴 one mile over the edge, only THAT mile drops to the lower rate',
  near(mileageClaim(B + 1), B * hi + lo));
ok('🔴 well over the edge, the first band is still paid in full',
  near(mileageClaim(B * 2), B * hi + B * lo));
ok('🔴 the higher rate is NOT applied to everything, which is the over claim this guards',
  mileageClaim(B * 2) < B * 2 * hi);

// Monotonic. More miles can never be worth less, at the edge or anywhere near it.
let monotonic = true;
let prev = -1;
for (const m of [0, 1, 100, B - 1, B, B + 1, B + 100, B * 3]) {
  const c = mileageClaim(m);
  if (c < prev) monotonic = false;
  prev = c;
}
ok('more miles is never a smaller claim, across the band edge', monotonic);

console.log('\n--- the vehicles that have no band ---\n');
ok('a van is a car for this purpose, same rate, same band',
  near(mileageClaim(B * 2, 'van'), mileageClaim(B * 2, 'car')));
ok('a motorcycle is one flat rate with no band at all',
  near(mileageClaim(B * 2, 'motorcycle'), B * 2 * FACTS.mileageMotorcycle));
ok('a bicycle is one flat rate with no band at all',
  near(mileageClaim(B * 2, 'bicycle'), B * 2 * FACTS.mileageBicycle));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 3. not one rate is written down on the page ===\n');

// The CURRENT rates, in every shape somebody would type them. The historical 45p is allowed in one
// place and one place only, checked separately below, because the page explains the change.
const TYPED = [
  [String(hi), 'the first band rate as a decimal'],
  [String(lo), 'the over band rate as a decimal'],
  [String(FACTS.mileageMotorcycle), 'the motorcycle rate as a decimal'],
  [String(B), 'the band, in miles'],
  [B.toLocaleString('en-GB'), 'the band, written out'],
  [`${Math.round(hi * 100)}p`, 'the first band rate in pence'],
  [`${Math.round(lo * 100)}p`, 'the over band rate in pence'],
];
for (const [file, code] of [[PAGE, pageCode], [CALC, calcCode]]) {
  for (const [needle, what] of TYPED) {
    ok(`${file.split('/')[1]}: does not type ${what} (${needle})`, !code.includes(needle));
  }
}

ok(`${PAGE.split('/')[1]}/page.tsx reads FACTS`, /from '\.\.\/\.\.\/lib\/taxengine'/.test(pageSrc) && /FACTS\./.test(pageCode));
ok('and the <title> itself interpolates the rate rather than spelling it out',
  /title: `[^`]*\$\{p\(FACTS\.mileageCarFirst10k\)\}/.test(pageCode));

// The one allowed mention of the old rate: the sentence that explains the rise.
const olds = (pageCode.match(/45p/g) ?? []).length;
ok('the historical 45p appears at most once, and only in the sentence explaining the rise',
  olds <= 1 && (olds === 0 || /raised the car rate from 45p/.test(pageCode)));
ok('the calculator itself never mentions 45p in code at all', !calcCode.includes('45p'));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4. the maths is the engine, not the page ===\n');

ok('the calculator imports mileageClaim from the canonical engine',
  /from '\.\.\/\.\.\/lib\/taxengine'/.test(calcSrc) && /mileageClaim\(/.test(calcCode));
ok('it imports the vehicle engine rather than reimplementing the comparison',
  /from '\.\.\/\.\.\/lib\/capital'/.test(calcSrc) && /vehicleAdvice\(/.test(calcCode));
ok('🔴 it prices the claim by running the tax engine twice, not by a flat marginal rate',
  (calcCode.match(/soleTraderTax\(/g) ?? []).length >= 2);
// 🔴 AND THE MARGINAL RATE IS MEASURED, NOT IMPORTED, AND NOT TYPED.
// lib/taxoptimiser.ts exports marginalRate() and it is the correct function. It is also the door to
// propertyengine, ltdengine, personalincome, autonomy and nistudentloan, and NO client component in
// this repo imports it, which is a fact worth keeping true: this is a marketing page a stranger
// loads on a phone off a search result. So the page measures the rate off soleTraderTax instead.
// Section 4b below proves the two agree at every band, including the taper.
ok('🔴 the client bundle does not pull lib/taxoptimiser and its five engines in behind it',
  // \u26a0\ufe0f ON THE STRIPPED CODE. The Calc file carries a comment explaining why it does not
  // import the optimiser, and a guard reading the raw source goes red on the explanation for the
  // thing it is guarding. That trap has been sprung three times in this corpus.
  !/from '[^']*taxoptimiser'/.test(calcCode));
ok('it measures the marginal rate off the engine and hands that to the vehicle comparison',
  /function measuredMarginalRate/.test(calcCode) && /marginalRate: measuredMarginalRate\(/.test(calcCode));
ok('it writes its pounds with lib/money like every other public tool',
  /from '\.\.\/\.\.\/lib\/money'/.test(calcSrc) && /gbp0\(/.test(calcCode));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 4b. the measured rate IS the optimiser rate, at every band ===\n');

// The saving on this page has to match the saving the app quotes the same man. Substituting a
// cheaper calculation for lib/taxoptimiser.ts marginalRate() is only safe if it returns the SAME
// number, so this runs both, on the real engines, across every band including the 62% taper.
const OPT = await load('taxoptimiser');
const { soleTraderTax } = ENG;
const measured = (p) => {
  if (p <= 0) return 0;
  const probe = Math.min(100, p);
  return Math.max(0, Math.min(1, (soleTraderTax(p).total - soleTraderTax(p - probe).total) / probe));
};
const disagreed = [];
for (const p of [0, 1, 5000, 12000, 20000, 34000, 60000, 90000, 110000, 125000, 130000, 200000]) {
  if (Math.abs(measured(p) - OPT.marginalRate(p)) > 0.011) disagreed.push(p);
}
ok(`🔴 the page's measured rate matches lib/taxoptimiser at every band${disagreed.length ? `, APART AT: ${disagreed.join(', ')}` : ''}`,
  disagreed.length === 0);
ok('...including inside the personal allowance taper, where the true rate is 62%',
  Math.abs(measured(110000) - 0.62) < 0.011);
ok('...and it is zero below the personal allowance, so no saving is claimed where none exists',
  measured(5000) === 0 && measured(0) === 0);

// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 5. a deduction, not a refund ===\n');

ok('🔴 the headline says the claim comes off PROFIT', /Comes off your profit/.test(calcCode));
ok('🔴 and nothing on either screen calls it a refund or money back',
  !/refund/i.test(calcCode) && !/refund/i.test(pageCode));
ok('the tax it saves is shown as a second, smaller figure, not as the headline',
  /less tax and National Insurance/.test(calcCode));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 6. the two rules that cost money if they are missing ===\n');

ok('🔴 the double claim warning is on the page in its own block',
  /Do not claim the fuel as well/.test(calcCode) && /claimed the fuel twice/.test(calcCode));
ok('...and it names what the rate already covers, so it is not just a slogan',
  /insurance/i.test(calcCode) && /servicing/i.test(calcCode));

// The lock rule is vehicleAdvice()'s own first line. Assert it is STILL there in the engine, and
// that the page renders the engine's lines rather than a paraphrase of them.
const sample = vehicleAdvice({
  cost: 18000, kind: 'car_other', businessMilesPerYear: 12000,
  businessUsePct: 75, runningCostsPerYear: 3200, marginalRate: 0.26,
});
ok('🔴 the engine still leads with the lock rule',
  /cannot switch to mileage/.test(sample.lines[0]) && /cannot start\s*\n?\s*claiming|cannot start claiming/.test(sample.lines[0].replace(/\s+/g, ' ')));
ok('the engine still says the mileage rate covers the running costs',
  sample.lines.some((l) => /covers the lot/.test(l)));
ok('🔴 the page RENDERS those lines rather than rewriting them',
  /advice\.lines\.map\(/.test(calcCode));
ok('and the comparison shows a later year too, where the two routes diverge',
  /mileageLaterYear/.test(calcCode) && /purchaseLaterYear/.test(calcCode));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 7. the caveats a stranger gets exactly once ===\n');

ok('🔴 it carries the Scotland line, like its four sibling free tools',
  /from '\.\.\/\.\.\/lib\/scotland'/.test(calcSrc) && (calcSrc.match(/SCOTLAND_LINE/g) ?? []).length >= 2);
ok('the page says it is an estimate and not a filed figure',
  /not a filed figure/.test(pageCode));
ok('it never claims to file or submit anything on his behalf',
  !/we (will )?(file|submit) your/i.test(pageCode + calcCode));
ok('the record keeping duty is stated, because a claim with nothing behind it is the risk',
  /record/i.test(calcCode + pageCode));

console.log('\n--- the consent engine, on the same terms as the other tools ---\n');
ok('the capture only appears once there is a result, so an email is never the price of the tool',
  /hasInput \? \(\s*<LeadCapture/.test(calcSrc));
ok('and it is tagged with its own source', /source="mileage-calculator"/.test(calcSrc));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== 8. every manifest that has to know the route knows it ===\n');

const MANIFESTS = [
  ['app/sitemap.ts', "'mileage-calculator'", 'the sitemap, so it can be indexed at all'],
  ['app/_shared/site.tsx', "'/mileage-calculator'", 'the footer free tools column, so it is not an orphan'],
  ['app/resources/page.tsx', "href: '/mileage-calculator'", 'the all tools page'],
  ['app/llms.txt/route.ts', '/mileage-calculator', 'what the machines read'],
];
for (const [file, needle, why] of MANIFESTS) {
  ok(`${file} lists it: ${why}`, read(file).includes(needle));
}
ok('🔴 and the page carries the canonical the sitemap entry requires',
  /canonical: '\/mileage-calculator'/.test(pageCode));
ok('it publishes FAQ structured data, which is how a free tool earns its search traffic',
  /"?@type"?: 'FAQPage'|'@type': 'FAQPage'/.test(pageCode));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
