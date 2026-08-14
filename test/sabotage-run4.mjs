// SABOTAGE THE RUN 4 PACKET. A guard that passes is not evidence until you have made it fail.
//
//   node test/sabotage-run4.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Each sabotage below reintroduces ONE way the VAT inclusive total could get booked as income
// again, on a scratch copy of the repo, and test/run4fixes.test.mjs has to go RED. A sabotage that
// stays green is a hole in the guard, not a pass.
//
// The disciplines this repo has learned, and which this file is written to honour:
//   1. ANCHOR ON THE CALL, not the import. An import is not a wiring.
//   2. KILL EVERY CALL SITE, or the sabotage is a no-op and the green is meaningless. There are
//      TWO doors to invoice income and sabotage 3 kills both at once for exactly this reason.
//   3. THE ANCHOR MUST EXIST. edit() throws when its anchor is missing, so a sabotage that has
//      quietly stopped applying fails loudly instead of being counted as a pass.
//   4. NO-OP CONTROLS. Edits that change nothing must stay GREEN, or this runner is only
//      detecting that a file was touched.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-run4-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  // next.config.mjs carries the /signup redirect, so it has to be sabotageable too.
  cpSync(path.join(root, 'next.config.mjs'), path.join(dir, 'next.config.mjs'));
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/run4fixes.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 90)}`);
  writeFileSync(p, s.split(from).join(to));
};

let applied = 0, held = 0, holes = 0, broken = 0;

function sabotage(name, mutate, expectRed = true) {
  const dir = scratch();
  try {
    mutate(dir);
    applied += 1;
  } catch (e) {
    broken += 1;
    process.stdout.write(`  BROKEN SABOTAGE (anchor gone, NOT a pass)  ${name}\n    ${e.message}\n`);
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  const { red } = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red === expectRed) {
    held += 1;
  } else {
    holes += 1;
    process.stdout.write(
      expectRed
        ? `  HOLE (sabotage stayed GREEN)  ${name}\n`
        : `  HOLE (no-op control went RED)  ${name}\n`,
    );
  }
}

const OWNER_CALL = `      vendor: inv.customer_name,
      // The NET. invoiceIncomeAmount owns this rule: the VAT on this invoice is not his income.
      amount: invoiceIncomeAmount(inv),`;
const SERVER_CALL = `    vendor: inv.customer_name,
    // The NET. invoiceIncomeAmount owns this rule: the VAT on this invoice is not his income.
    amount: invoiceIncomeAmount(inv),`;

// ── 1 to 3. Put the raw total back, one door at a time and then both together. ───────────────
sabotage('markInvoicePaidServer books the gross again', (d) =>
  edit(d, 'lib/supabase.ts', SERVER_CALL,
    `    vendor: inv.customer_name,
    amount: Math.abs(Number(inv.total) || 0),`));

sabotage('markInvoicePaidByOwner books the gross again', (d) =>
  edit(d, 'lib/supabase.ts', OWNER_CALL,
    `      vendor: inv.customer_name,
      amount: Math.abs(Number(inv.total) || 0),`));

sabotage('BOTH doors book the gross again, which is the state Run 4 found', (d) => {
  edit(d, 'lib/supabase.ts', SERVER_CALL,
    `    vendor: inv.customer_name,
    amount: Math.abs(Number(inv.total) || 0),`);
  edit(d, 'lib/supabase.ts', OWNER_CALL,
    `      vendor: inv.customer_name,
      amount: Math.abs(Number(inv.total) || 0),`);
});

// ── 4. The function itself quietly returns the gross. The calls still look right. ────────────
sabotage('invoiceIncomeAmount returns the gross while both call sites still call it', (d) =>
  edit(d, 'lib/supabase.ts',
    '  if (Number.isFinite(net) && net !== 0) return Math.abs(net);',
    '  if (false) return Math.abs(net);'));

// ── 5. The legacy fallback becomes a zero, so old rows book nothing at all. ──────────────────
sabotage('a null subtotal books zero instead of falling back to the total', (d) =>
  edit(d, 'lib/supabase.ts',
    `  const gross = Number(inv.total);
  return Number.isFinite(gross) ? Math.abs(gross) : 0;`,
    '  return 0;'));

// ── 6. A zero subtotal stops falling back, which books nothing for a legacy row. ─────────────
sabotage('a zero subtotal is treated as a real net', (d) =>
  edit(d, 'lib/supabase.ts',
    '  if (Number.isFinite(net) && net !== 0) return Math.abs(net);',
    '  if (Number.isFinite(net)) return Math.abs(net);'));

// ── 7 and 8. The read stops fetching the column, so the fallback fires for ever. ─────────────
sabotage('markInvoicePaidServer stops selecting subtotal', (d) =>
  edit(d, 'lib/supabase.ts',
    'select=user_id,number,customer_name,subtotal,total,status',
    'select=user_id,number,customer_name,total,status'));

sabotage('markInvoicePaidByOwner stops selecting subtotal', (d) =>
  edit(d, 'lib/supabase.ts',
    'select=number,customer_name,subtotal,total,status',
    'select=number,customer_name,total,status'));

// ── 9. THE NO-OP CONTROL'S OWN SABOTAGE. Netting down the Stripe comparison breaks payments. ─
sabotage('the Stripe collected amount is netted down, which would stop matching', (d) =>
  edit(d, 'lib/supabase.ts',
    'const expected = Math.round((Number(inv.total) || 0) * 100);',
    'const expected = Math.round((invoiceIncomeAmount(inv) || 0) * 100);'));

// ── 10. The export disappears, so nothing can call it. ──────────────────────────────────────
sabotage('invoiceIncomeAmount stops being exported', (d) =>
  edit(d, 'lib/supabase.ts', 'export function invoiceIncomeAmount(', 'function invoiceIncomeAmount('));

// ── 11 and 12. NO-OP CONTROLS. These change nothing that matters and MUST stay green. ───────
sabotage('NO-OP: a word in the doctrine comment changes', (d) =>
  edit(d, 'lib/supabase.ts',
    '// The VAT is HMRC money passing through his hands.',
    '// The VAT is money belonging to HMRC passing through his hands.'), false);

sabotage('NO-OP: an unrelated console.error string changes', (d) =>
  edit(d, 'lib/supabase.ts',
    "console.error('[createInvoice] failed:', res.status);",
    "console.error('[createInvoice] insert failed:', res.status);"), false);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PART 2. THE REST OF THE PACKET.
// ═══════════════════════════════════════════════════════════════════════════════════════════

sabotage('/signup goes back to being a 404', (d) =>
  edit(d, 'next.config.mjs', "{ source: '/signup', destination: '/start', permanent: true },", ''));

sabotage('getOutputVat stops counting what it holds back', (d) =>
  edit(d, 'lib/supabase.ts', '        unsentCount += 1;', '        unsentCount += 0;'));

sabotage('getOutputVat stops totalling the VAT inside the held back invoices', (d) =>
  edit(d, 'lib/supabase.ts',
    '        unsentVat += (Number(r.tax) || 0) + (Number(r.reverse_charge_vat) || 0);',
    '        unsentVat += 0;'));

sabotage('the quarter page stops drawing the warning at all', (d) =>
  edit(d, 'app/app/tax/vat/page.tsx', '            {unsentCount > 0 ? (', '            {false ? ('));

sabotage('the empty sentence goes back to claiming nothing was raised', (d) =>
  edit(d, 'app/app/tax/vat/page.tsx',
    "                  ? `Nothing counted yet since ${pretty(from)}, though you have ${unsentCount} ${unsentCount === 1 ? 'invoice' : 'invoices'} waiting below.`",
    "                  ? `Nothing raised or confirmed since ${pretty(from)}.`"));

sabotage('the manual route lets a flat rate trader claim input VAT he cannot have', (d) =>
  edit(d, 'app/api/money/manual/route.ts', "vatProfile.scheme !== 'flat_rate'", 'true'));

sabotage('the manual route drops the sixth of gross ceiling', (d) =>
  edit(d, 'app/api/money/manual/route.ts', 'v > ceiling', 'false'));

sabotage('the manual route writes a VAT figure without confirming it, so nothing reads it', (d) =>
  edit(d, 'app/api/money/manual/route.ts',
    '{ vat_amount: vatAmount, vat_confirmed: true }',
    '{ vat_amount: vatAmount }'));

sabotage('the add form draws the VAT box for a man who is not registered', (d) =>
  edit(d, 'app/app/money/add/page.tsx',
    "const canReclaimVat = vatProfile !== null && vatProfile.registered && vatProfile.scheme !== 'flat_rate';",
    'const canReclaimVat = true;'));

sabotage('the hint style key goes missing again, so the copy renders unstyled', (d) =>
  edit(d, 'app/app/money/add/page.tsx',
    "  hint: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '6px 0 0' },", ''));

sabotage('What we hold stops saying the reverse charge answer', (d) =>
  edit(d, 'app/app/you/vat/page.tsx', '        <p style={S.fact}>{reverseChargeSentence}</p>', ''));

sabotage('What we hold stops saying the scheme', (d) =>
  edit(d, 'app/app/you/vat/page.tsx', '        <p style={S.fact}>{schemeSentence}</p>', ''));

sabotage('the reverse charge default reverts to the stored boolean alone', (d) =>
  edit(d, 'app/app/you/vat/page.tsx', "|| (neverSavedVatDetails && cisSuffered === 'yes')", ''));

sabotage('the default starts overriding a deliberate No', (d) =>
  edit(d, 'app/app/you/vat/page.tsx',
    'const neverSavedVatDetails = !profile.vrn && !profile.registeredOn && !profile.cisSubcontractor;',
    'const neverSavedVatDetails = true;'));

sabotage('the MTD for VAT note is drawn for everybody, registered or not', (d) =>
  edit(d, 'app/app/setup/page.tsx', "{answers.get('vat_registered') === 'yes' ? (", '{true ? ('));

sabotage('the MTD for VAT note disappears', (d) =>
  edit(d, 'app/app/setup/page.tsx', 'Making Tax Digital already', 'Nothing at all here about'));

sabotage('the reverse charge signpost is drawn without both answers', (d) =>
  edit(d, 'app/app/setup/page.tsx', "{said.has('vat_registered') && said.has('cis') ? (", '{true ? ('));

sabotage('the reverse charge signpost disappears', (d) =>
  edit(d, 'app/app/setup/page.tsx', 'domestic reverse charge', 'thing we will not name'));

sabotage('the cost goes back to the gross, so the reclaim is taken twice', (d) =>
  edit(d, 'app/api/money/manual/route.ts',
    "amount: direction === 'out' ? -netAmount : netAmount,",
    "amount: direction === 'out' ? -magnitude : magnitude,"));

sabotage('netAmount stops subtracting the VAT', (d) =>
  edit(d, 'app/api/money/manual/route.ts',
    ': Math.round((magnitude - vatAmount) * 100) / 100;',
    ': magnitude;'));

sabotage('the form stops warning that the cost will be netted down', (d) =>
  edit(d, 'app/app/money/add/page.tsx', 'the cost in your books becomes the bit without it', 'nothing happens to it'));

// ── NO-OP CONTROLS for part 2. ───────────────────────────────────────────────────────────────
sabotage('NO-OP: a comment word in the manual route changes', (d) =>
  edit(d, 'app/api/money/manual/route.ts',
    '// His sales carry no VAT at all,',
    '// The sales he makes carry no VAT at all,'), false);

sabotage('NO-OP: the redirect for /register changes destination spelling in a comment only', (d) =>
  edit(d, 'next.config.mjs',
    '  // on a page telling him it is not his fault. 308 so it is cached and never re-asked.',
    '  // on a page telling him it is not his fault. A permanent redirect, so it is never re-asked.'), false);

process.stdout.write(
  `\n  ${applied} sabotages applied, ${held} behaved, ${holes} holes, ${broken} broken anchors\n`,
);
if (holes > 0 || broken > 0) process.exit(1);
if (applied !== 35) {
  process.stdout.write(`  COUNT WRONG: expected 35 sabotages to apply, got ${applied}\n`);
  process.exit(1);
}
