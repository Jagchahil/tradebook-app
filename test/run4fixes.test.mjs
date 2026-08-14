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

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
