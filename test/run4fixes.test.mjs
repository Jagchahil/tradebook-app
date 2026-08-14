// RUN 4. THE VAT INCLUSIVE TOTAL MUST NEVER BE BOOKED AS INCOME.
//
//   node test/run4fixes.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT, FOUND BY WALKING LIVE PRODUCTION ON 13 AUGUST 2026 AS DWAYNE OSEI, A VAT REGISTERED
// GROUNDWORKER IN BIRMINGHAM.
//
// He raised INV-0002 to an end user: net 2,000, VAT 400, total 2,400. He pressed "I have been
// paid". Then:
//
//   /app/money            In 2,400   Profit 600   "Endus Developments Ltd  2,400  income"
//   /app/proof-of-income  Gross income 2,400.00   Net profit 600.00
//
// The 400 is HMRC money passing through his hands. It is not turnover and it is not profit. His
// taxable profit was overstated by the VAT on every normally rated invoice he will ever raise,
// which flows into income tax, Class 4, the set aside figure, and the document a LENDER reads.
//
// 🔴 AND THERE WERE TWO DOORS DOING IT, 5,000 LINES APART. markInvoicePaidServer (the Stripe
// delivery) and markInvoicePaidByOwner (his own press) each selected the total column and booked
// the total column. Neither read subtotal, though createInvoice writes subtotal on every row.
//
// ⚠️ SO THE AGREEMENT IS A CALL, NOT AN EXPRESSION. Run 3's hardest lesson: a regex can only hold
// the places it is pointed at, so when one surface moves the guard holds the other still and stays
// green. Both doors now call invoiceIncomeAmount and this suite asserts THE CALL at both sites,
// then drives the function itself over the shapes a real invoices row arrives in.
//
// ⚠️ THE NO-OP CONTROL IN HERE IS THE STRIPE AMOUNT GUARD. markInvoicePaidServer compares what
// was collected against inv.total, and that comparison is CORRECT and must not move: the customer
// pays the gross. If a later edit "helpfully" nets that down too, Stripe payments stop matching
// and income stops being booked at all. The assertion below fails if anybody does it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

const stage = mkdtempSync(path.join(tmpdir(), 'run4fixes-'));
const fixTs = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (f.endsWith('.ts')) {
    writeFileSync(path.join(stage, f), fixTs(readFileSync(path.join(root, 'lib', f), 'utf8')));
  }
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

let pass = 0, fail = 0;
const ok = (desc, cond) => {
  if (cond) { pass++; } else { fail++; process.stdout.write(`  FAIL ${desc}\n`); }
};

const src = readFileSync(path.join(root, 'lib', 'supabase.ts'), 'utf8');
const between = (startAnchor, endAnchor) => {
  const a = src.indexOf(startAnchor);
  if (a < 0) return '';
  const b = src.indexOf(endAnchor, a + startAnchor.length);
  return b < 0 ? src.slice(a) : src.slice(a, b);
};

// ── The thing we are about to reason about is really there. ──────────────────────────────────
ok('lib/supabase.ts read as source, not empty', src.length > 10000);
ok('invoiceIncomeAmount is exported and is a function', typeof SB.invoiceIncomeAmount === 'function');

const amt = SB.invoiceIncomeAmount;

// ── The behaviour. Driven, not grepped. ──────────────────────────────────────────────────────
ok('a normally rated invoice books the NET, not the gross',
  amt({ subtotal: 2000, total: 2400 }) === 2000);
ok('Dwayne INV-0002 exactly: 2,000 net under a 2,400 total',
  amt({ subtotal: 2000, total: 2400 }) === 2000 && amt({ subtotal: 2000, total: 2400 }) !== 2400);
ok('a reverse charge invoice is unchanged, because its total already is its net',
  amt({ subtotal: 5000, total: 5000 }) === 5000);
ok('a trader who is not VAT registered is unaffected: tax 0, total equals subtotal',
  amt({ subtotal: 450, total: 450 }) === 450);
ok('PostgREST numerics arriving as strings are handled',
  amt({ subtotal: '2000.00', total: '2400.00' }) === 2000);
ok('pence survive: 1,234.56 net is not rounded away',
  amt({ subtotal: 1234.56, total: 1481.47 }) === 1234.56);

// ── The legacy row. A null subtotal must mean "we only have the one figure", never zero. ─────
ok('a null subtotal falls back to the total rather than booking nothing',
  amt({ subtotal: null, total: 900 }) === 900);
ok('a missing subtotal falls back to the total',
  amt({ total: 900 }) === 900);
ok('a zero subtotal beside a real total falls back rather than booking zero',
  amt({ subtotal: 0, total: 900 }) === 900);
ok('a non numeric subtotal falls back to the total',
  amt({ subtotal: 'not a number', total: 900 }) === 900);

// ── It can never hand insertTransaction something that is not a number. ──────────────────────
ok('both columns missing gives 0, never NaN',
  amt({}) === 0 && !Number.isNaN(amt({})));
ok('both columns null gives 0, never NaN',
  amt({ subtotal: null, total: null }) === 0);
ok('a negative row is booked as a positive amount, as the callers always did',
  amt({ subtotal: -2000, total: -2400 }) === 2000);

// ── THE CALL, AT BOTH SITES. Anchored on the call, never on the import. ──────────────────────
const serverFn = between('export async function markInvoicePaidServer(', '\nexport ');
const ownerFn = between('export async function markInvoicePaidByOwner(', '\nexport ');
ok('markInvoicePaidServer body was located', serverFn.length > 500);
ok('markInvoicePaidByOwner body was located', ownerFn.length > 500);

ok('markInvoicePaidServer BOOKS INCOME BY CALLING invoiceIncomeAmount',
  /amount:\s*invoiceIncomeAmount\(inv\),/.test(serverFn));
ok('markInvoicePaidByOwner BOOKS INCOME BY CALLING invoiceIncomeAmount',
  /amount:\s*invoiceIncomeAmount\(inv\),/.test(ownerFn));

ok('markInvoicePaidServer no longer books the raw total as income',
  !/amount:\s*Math\.abs\(Number\(inv\.total\)/.test(serverFn));
ok('markInvoicePaidByOwner no longer books the raw total as income',
  !/amount:\s*Math\.abs\(Number\(inv\.total\)/.test(ownerFn));

ok('exactly two doors book invoice income, so a third has to come past this suite',
  (src.match(/amount:\s*invoiceIncomeAmount\(inv\),/g) || []).length === 2
  && (src.match(/source_type: 'invoice',/g) || []).length === 2);

// ── The read has to fetch the column the call needs, or the fallback fires for ever. ─────────
ok('markInvoicePaidServer selects subtotal', /select=user_id,number,customer_name,subtotal,total,status/.test(serverFn));
ok('markInvoicePaidByOwner selects subtotal', /select=number,customer_name,subtotal,total,status/.test(ownerFn));
ok('both row types carry subtotal so tsc holds the shape',
  /subtotal: number \| null;/.test(serverFn) && /subtotal: number \| string \| null;/.test(ownerFn));

// ── NO-OP CONTROL. Stripe still matches on the GROSS, because that is what was collected. ────
ok('🔴 the Stripe collected amount is still compared against inv.total, NOT the net',
  /const expected = Math\.round\(\(Number\(inv\.total\) \|\| 0\) \* 100\);/.test(serverFn));

// ── House rules. ─────────────────────────────────────────────────────────────────────────────
const added = between('🔴 A PAID INVOICE USED TO BOOK', 'export async function markInvoicePaidByOwner(');
ok('no en dash or em dash anywhere in the new block', added.length > 200 && !/[–—]/.test(added));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PART 2. THE REST OF THE RUN 4 PACKET. Everything else the walk found, down to the P3.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const readFile = (rel) => readFileSync(path.join(root, rel), 'utf8');
const nextConfig = readFile('next.config.mjs');
const vatQuarterPage = readFile('app/app/tax/vat/page.tsx');
const vatYouPage = readFile('app/app/you/vat/page.tsx');
const setupPage = readFile('app/app/setup/page.tsx');
const addPage = readFile('app/app/money/add/page.tsx');
const manualRoute = readFile('app/api/money/manual/route.ts');

// ── P3-8. /signup is the commonest guess in software and it 404ed. ───────────────────────────
ok('next.config sends /signup to the door rather than to the 404',
  /async redirects\(\)/.test(nextConfig)
  && /source: '\/signup', destination: '\/start', permanent: true/.test(nextConfig));
ok('and the other two guesses a stranger makes go the same way',
  /source: '\/sign-up', destination: '\/start'/.test(nextConfig)
  && /source: '\/register', destination: '\/start'/.test(nextConfig));

// ── P1-1. An issued invoice sits in draft, and the screen must SAY what it is holding back. ──
{
  const realFetch = globalThis.fetch;
  const rows = [
    { status: 'sent', tax: 400, total: 2400, reverse_charge_vat: 0 },
    { status: 'draft', tax: 0, total: 5000, reverse_charge_vat: 1000 },
    { status: 'draft', tax: 150, total: 900, reverse_charge_vat: 0 },
  ];
  globalThis.fetch = async () => new Response(JSON.stringify(rows), { status: 200 });
  const outv = await SB.getOutputVat('11111111-2222-3333-4444-555555555555', '2026-07-01', '2026-08-13');
  globalThis.fetch = realFetch;

  ok('getOutputVat still excludes drafts from the figure, because a draft is not a supply',
    outv !== null && outv.outputVat === 400 && outv.grossTurnover === 2400 && outv.reverseChargeVat === 0);
  ok('🔴 but it now REPORTS them: the count of what it held back',
    outv !== null && outv.unsentCount === 2);
  ok('...the net of what it held back', outv !== null && outv.unsentNet === 5900);
  ok('...and the VAT inside it, reverse charge included, because both are money he must account for',
    outv !== null && outv.unsentVat === 1150);
}
ok('the quarter page reads the held back figures',
  /out\.unsentCount/.test(vatQuarterPage) && /out\.unsentVat/.test(vatQuarterPage)
  && /out\.unsentNet/.test(vatQuarterPage));
ok('🔴 the empty sentence stops claiming nothing was raised when invoices are sitting there',
  /unsentCount > 0/.test(vatQuarterPage)
  && /though you have \$\{unsentCount\}/.test(vatQuarterPage));
ok('🔴 and the warning is drawn in EVERY branch, not only the empty one, because a figure that is short is worse than none',
  vatQuarterPage.includes('{unsentCount > 0 ? (')
  && vatQuarterPage.indexOf('are not in this figure.') > 0
  && vatQuarterPage.indexOf('{unsentCount > 0 ? (') < vatQuarterPage.indexOf('More VAT came back on what you bought'));
ok('it tells him the one press that fixes it', /press I have sent it/.test(vatQuarterPage));

// ── P1-3. A typed cost can carry its VAT, and only from a man who can reclaim it. ────────────
ok('NewTransaction can carry a confirmed VAT figure',
  /vat_amount\?: number \| null;/.test(src) && /vat_confirmed\?: boolean;/.test(src));
ok('🔴 the manual route reads a vat field on both the form and the JSON door',
  /f\.get\('vat'\)/.test(manualRoute) && /body\.vat/.test(manualRoute));
ok('🔴 it refuses a flat rate trader, who reclaims nothing on what he buys',
  /scheme !== 'flat_rate'/.test(manualRoute));
ok('it refuses anybody who is not registered', /vatProfile\.registered/.test(manualRoute));
ok('🔴 the ceiling is a sixth of the gross, which is the VAT inside a 20% price',
  /const ceiling = Math\.round\(\(magnitude \/ 6\) \* 100\) \/ 100;/.test(manualRoute)
  && /v > ceiling/.test(manualRoute));
ok('it only ever applies to money going OUT', /direction === 'out'/.test(manualRoute));
ok('🔴 vat_amount and vat_confirmed are written TOGETHER or not at all, which is what getConfirmedInputVat reads',
  /vat_amount: vatAmount, vat_confirmed: true/.test(manualRoute));
ok('a refused VAT figure saves nothing and says why in his words',
  /problem=vat/.test(manualRoute) && /cannot be more than a sixth of what you paid/.test(addPage));
ok('the form draws the box only for a registered man who is not on the flat rate',
  /canReclaimVat/.test(addPage) && /scheme !== 'flat_rate'/.test(addPage));
ok('and the box says nothing is assumed, which is this product s whole doctrine on costs',
  /a figure only counts towards your reclaim because you typed it/.test(addPage));
ok('the hint has a real style key, not a missing one on a Record that typechecks anyway',
  /^  hint: \{/m.test(addPage));

// ── AND THE COST COMES DOWN BY THE VAT, or the reclaim is a second bite at the same money. ───
// Found in the Phase 5 walk of the fix above, an hour after it shipped: a 1,200 cost with 200 of
// stated VAT was booking a 1,200 deduction AND a 200 reclaim.
ok('🔴 the row is recorded NET of any VAT he stated',
  /const netAmount = vatAmount === null/.test(manualRoute)
  && /Math\.round\(\(magnitude - vatAmount\) \* 100\) \/ 100/.test(manualRoute));
ok('🔴 and the insert uses that net, never the gross he typed',
  /amount: direction === 'out' \? -netAmount : netAmount,/.test(manualRoute)
  && !/amount: direction === 'out' \? -magnitude : magnitude,/.test(manualRoute));
ok('a man who states no VAT is untouched: his net is his gross',
  /vatAmount === null\s*\n?\s*\? magnitude/.test(manualRoute));
ok('🔴 and the form says so, because the figure in his books will not be the one he typed',
  /the cost in your books becomes the bit without it/.test(addPage)
  && /never as both/.test(addPage));

// ── P2-6. What we hold now holds the two settings that decide every invoice. ─────────────────
ok('the VAT page states the scheme in his words',
  vatYouPage.includes('<p style={S.fact}>{schemeSentence}</p>')
  && /You are on the standard scheme, so you charge VAT on what you sell/.test(vatYouPage));
ok('🔴 and states the reverse charge answer, which decides whether an invoice carries 20% or none',
  vatYouPage.includes('<p style={S.fact}>{reverseChargeSentence}</p>')
  && /Your invoices carry the CIS reverse charge/.test(vatYouPage));
ok('both are drawn inside What we hold, not somewhere else on the page',
  vatYouPage.indexOf('What we hold') < vatYouPage.indexOf('<p style={S.fact}>{schemeSentence}</p>'));

// ── P2-4. The reverse charge default stops being No for the man who needs it on. ─────────────
ok('🔴 the default reads his own CIS answer rather than the stored boolean alone',
  /const cisSuffered = rows\?\.find\(\(r\) => r\.key === 'cis'\)\?\.answer/.test(vatYouPage)
  && /cisSuffered === 'yes'/.test(vatYouPage));
ok('🔴 it only ever applies to a man who has saved NOTHING, so a deliberate No survives for ever',
  /const neverSavedVatDetails = !profile\.vrn && !profile\.registeredOn && !profile\.cisSubcontractor;/.test(vatYouPage));
ok('and both radios read that one default, so they cannot disagree with each other',
  (vatYouPage.match(/defaultChecked=\{reverseChargeDefault\}/g) || []).length === 1
  && (vatYouPage.match(/defaultChecked=\{!reverseChargeDefault\}/g) || []).length === 1);
ok('nothing is written by drawing it: the default is a render, and the save is still his press',
  /THIS CHANGES WHAT IS DRAWN, NEVER WHAT IS STORED/.test(vatYouPage));

// ── P2-7 and P2-5. The two signposts. ────────────────────────────────────────────────────────
ok('🔴 a VAT registered customer is told MTD already applies to his VAT',
  /Making Tax Digital already/.test(setupPage) && /since April 2022/.test(setupPage));
ok('...gated on his own answer, never inferred',
  /answers\.get\('vat_registered'\) === 'yes'/.test(setupPage));
ok('...and it does not promise we file it for him',
  /Lekhio\s+does\s+not send VAT returns/.test(setupPage.replace(/\s+/g, ' ')) 
  || /does not send VAT returns/.test(setupPage));
ok('🔴 the reveal signposts the reverse charge where VAT and CIS meet',
  /domestic reverse charge/.test(setupPage) && /March 2021/.test(setupPage));
ok('...drawn only where BOTH answers are his own yes',
  /said\.has\('vat_registered'\) && said\.has\('cis'\)/.test(setupPage));
ok('...and it points at the control rather than doing it for him',
  /Turn it on at your VAT page under You/.test(setupPage));

// ── House rules across every file the packet touched. ────────────────────────────────────────
for (const [name, text] of [
  ['next.config.mjs', nextConfig],
  ['the quarter page', vatQuarterPage],
  ['the VAT page', vatYouPage],
  ['the add form', addPage],
  ['the manual route', manualRoute],
]) {
  ok(`no en dash or em dash in ${name}`, !/[\u2013\u2014]/.test(text));
}

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
