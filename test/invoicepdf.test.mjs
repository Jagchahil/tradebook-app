// THE INVOICE AS A FILE. lib/pdf.ts and lib/invoicepdf.ts, attacked at the bytes.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS SUITE READS THE FILE BACK RATHER THAN TRUSTING THE BUILDER.
//
// A PDF is written by hand here, with no library, so "the function returned a Buffer" proves
// nothing at all. A document can be the right length, contain the right words, and still be a
// file a reader refuses to open, and the man who finds that out is a tradesman whose customer
// said the invoice was broken. So every assertion below is made against the produced bytes: the
// header, the cross reference offsets, the trailer, and the text as it actually sits in the
// content stream after escaping.
//
// The streams are deliberately uncompressed, which is what makes this possible. That is a design
// choice in lib/pdf.ts worth keeping: an invoice is a few kilobytes either way, and a document
// whose contents can be read by grep is a document whose contents can be tested.
//
// ⚠️ THE FOUR SHAPES THAT MUST NOT DRIFT, all of them law rather than layout:
//   1. A VAT invoice carries the supplier's VAT number, a tax point and a rate per line.
//   2. A REVERSE CHARGE invoice carries the VAT the customer accounts for, the s55A wording, and
//      that figure is NEVER inside the total he is asked to pay.
//   3. An invoice raised before the product knew about VAT prints with NO rate, NO VAT number
//      and NO VAT line, exactly as it printed on the day it was sent.
//   4. Nothing splits a line item or the total across a page break.
//
//   node test/invoicepdf.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const stage = mkdtempSync(path.join(tmpdir(), 'invoicepdf-'));
const fix = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(libDir)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(libDir, f), 'utf8')));
}
const PDF = await import(pathToFileURL(path.join(stage, 'pdf.ts')).href);
const INV = await import(pathToFileURL(path.join(stage, 'invoicepdf.ts')).href);

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

const base = {
  number: 'INV-0002',
  customer_name: 'Ellis Roofing (Leyton) Ltd',
  customer_contact: 'ap@ellis.example',
  line_items: [
    { description: 'Rewire of the first floor including a new consumer unit and full testing', amount: 1200, rate: 'standard' },
    { description: 'Materials', amount: 250, rate: 'standard' },
  ],
  subtotal: 1450, tax: 290, total: 1740, reverse_charge_vat: 0,
  vat_treatment: 'charged', tax_point: '2026-08-01', status: 'sent',
  notes: 'Payment within 14 days please.', issued_date: '2026-08-01', due_date: '2026-08-15',
  business_name: 'Vasey Electrical', business_contact: 'ryan@vasey.example',
  business_address: '52 Harrington Road, London, E11 4QW', business_vrn: 'GB 100 0000 89',
};
const text = (buf) => buf.toString('latin1');

// ── 1. It is a real file ────────────────────────────────────────────────────────────────────
{
  const buf = INV.buildInvoicePdf(base);
  const s = text(buf);
  ok('it starts with a PDF header', s.startsWith('%PDF-1.'));
  ok('and ends with the end of file marker', s.trimEnd().endsWith('%%EOF'));
  ok('it has a cross reference table and a trailer', s.includes('\nxref\n') && s.includes('trailer'));
  ok('it declares a catalog, a pages node and a page', /\/Type \/Catalog/.test(s) && /\/Type \/Pages/.test(s) && /\/Type \/Page[^s]/.test(s));
  ok('the page is A4', /\/MediaBox \[0 0 595\.28 841\.89\]/.test(s));

  // 🔴 THE OFFSETS. Every number in the xref must point at the object it claims to, or a reader
  // opens the file as damaged. Checked by seeking to each one and reading what is there.
  const m = s.match(/startxref\s+(\d+)/);
  ok('there is a startxref', !!m);
  const xrefAt = Number(m[1]);
  ok('and it points at the xref table', s.slice(xrefAt, xrefAt + 4) === 'xref');
  const rows = s.slice(xrefAt).split('\n').filter((l) => /^\d{10} \d{5} n\s*$/.test(l));
  ok('every object has an offset', rows.length >= 6);
  const everyOffsetLands = rows.every((row, i) => {
    const at = Number(row.slice(0, 10));
    return new RegExp(`^${i + 1} 0 obj`).test(s.slice(at, at + 20));
  });
  ok('🔴 and every offset lands exactly on its own object', everyOffsetLands);

  // The declared stream length must match the bytes, or readers truncate the page.
  const lengths = [...s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
  ok('every content stream declares a length', lengths.length >= 1);
  ok('🔴 and every declared length is the real byte length of the stream', lengths.every((mm) => {
    const from = mm.index + mm[0].length;
    const to = s.indexOf('\nendstream', from);
    return Buffer.byteLength(s.slice(from, to), 'latin1') === Number(mm[1]);
  }));
}

// ── 2. The escaping that stops a customer's name breaking the file ──────────────────────────
{
  const nasty = INV.buildInvoicePdf({
    ...base,
    customer_name: 'Ellis (Leyton) \\ Sons "Ltd"',
    notes: 'Ref (job 12) \\ site B',
  });
  const s = text(nasty);
  ok('a bracket in a name is escaped rather than closing the string', s.includes('Ellis \\(Leyton\\)'));
  ok('and a backslash is escaped too', s.includes('\\\\ Sons'));
  ok('🔴 and the file still parses after it', s.startsWith('%PDF-1.') && s.trimEnd().endsWith('%%EOF'));
  const stream = s.slice(s.indexOf('stream'), s.indexOf('endstream'));
  const brackets = (stream.match(/(?<!\\)\(/g) || []).length;
  const closes = (stream.match(/(?<!\\)\)/g) || []).length;
  ok('🔴 and every unescaped bracket in the stream is balanced', brackets === closes && brackets > 0);
}

// ── 3. The pound sign, which is the whole reason encoding is declared ────────────────────────
{
  const s = text(INV.buildInvoicePdf(base));
  ok('the fonts declare WinAnsi, which is the encoding that has a pound in it',
    (s.match(/\/Encoding \/WinAnsiEncoding/g) || []).length === 2);
  ok('🔴 and the pound is written as its WinAnsi byte, not dropped or mangled', s.includes('\\243'));
  ok('and figures carry their pence, because paper always does', s.includes('1,740.00'));
}

// ── 4. A VAT invoice carries what the law asks for ──────────────────────────────────────────
{
  const s = text(INV.buildInvoicePdf(base));
  ok('a VAT invoice names the supplier', s.includes('Vasey Electrical'));
  ok('and his address', s.includes('52 Harrington Road'));
  ok('🔴 and his VAT number', s.includes('VAT number GB 100 0000 89'));
  ok('🔴 and the TAX POINT rather than an issue date', s.includes('Tax point') && !s.includes('Issued 1 August'));
  ok('and the rate on the line', s.includes('20%'));
  ok('and the amount before VAT and the VAT itself', s.includes('1,450.00') && s.includes('290.00'));
  ok('and an identifying number', s.includes('INV-0002'));
  ok('and the customer', s.includes('Ellis Roofing'));
}

// ── 5. The reverse charge, and the figure that is NOT in the total ──────────────────────────
{
  const rc = INV.buildInvoicePdf({ ...base, vat_treatment: 'reverse_charge', tax: 0, total: 1450, reverse_charge_vat: 290 });
  const s = text(rc);
  ok('the reverse charge invoice carries the section 55A wording', s.includes('Section 55A'));
  ok('and says the customer accounts for the VAT', /customer is to account for the VAT/i.test(s));
  ok('and shows the VAT the customer must account for', s.includes('290.00'));
  ok('🔴 and the total he is asked to pay EXCLUDES it', s.includes('1,450.00') && !s.includes('1,740.00'));
}

// ── 6. The old world prints as the old world ────────────────────────────────────────────────
{
  const legacy = INV.buildInvoicePdf({
    ...base,
    vat_treatment: null, tax: 0, total: 1450, reverse_charge_vat: 0,
    line_items: base.line_items.map(({ description, amount }) => ({ description, amount })),
  });
  const s = text(legacy);
  ok('🔴 an invoice raised before VAT support shows NO VAT number', !s.includes('VAT number'));
  ok('🔴 and no rate on any line', !s.includes('20%'));
  ok('🔴 and no VAT line at all', !s.includes('Total before VAT'));
  ok('and it says Issued rather than Tax point, because there is no tax point', s.includes('Issued') && !s.includes('Tax point'));
  ok('and it still shows the work and the total', s.includes('Materials') && s.includes('1,450.00'));
}

// ── 7. Long invoices paginate, and nothing important is orphaned ────────────────────────────
{
  const many = INV.buildInvoicePdf({
    ...base,
    line_items: Array.from({ length: 40 }, (_, i) => ({
      description: `Day ${i + 1} of second fix across the whole site including containment and testing`,
      amount: 120, rate: 'standard',
    })),
  });
  const s = text(many);
  const pages = (s.match(/\/Type \/Page[^s]/g) || []).length;
  ok('forty lines run onto more than one page', pages > 1);
  ok('and the pages node counts them all', new RegExp(`/Type /Pages /Count ${pages}`).test(s));
  ok('🔴 and the total still appears, never dropped off the end', s.includes('Total'));
  ok('every page is A4', (s.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g) || []).length === pages);
}

// ── 8. Measuring, wrapping and the file name ────────────────────────────────────────────────
{
  ok('a wider string measures wider', PDF.textWidth('WWWW', 10) > PDF.textWidth('iiii', 10));
  ok('bold is at least as wide as regular for the same word', PDF.textWidth('Total', 10, 'bold') >= PDF.textWidth('Total', 10, 'regular'));
  ok('measuring scales with the size', Math.abs(PDF.textWidth('Total', 20) - PDF.textWidth('Total', 10) * 2) < 0.01);
  const lines = PDF.wrapText('one two three four five six seven eight nine ten', 60, 10);
  ok('wrapping breaks into more than one line', lines.length > 1);
  ok('🔴 and never breaks inside a word', lines.every((l) => l.split(' ').every((w) => /^[a-z]+$/.test(w))));
  ok('and loses no words', lines.join(' ').split(' ').length === 10);
  ok('an empty description wraps to one empty line rather than crashing', PDF.wrapText('', 100, 10).length === 1);

  ok('the file name is the invoice number', INV.invoiceFileName({ number: 'INV-0002' }) === 'INV-0002.pdf');
  const nastyName = INV.invoiceFileName({ number: '../../etc/passwd' });
  ok('🔴 and a nasty number cannot escape into a path',
    nastyName === 'etc-passwd.pdf' && !nastyName.includes('/') && !nastyName.includes('..'));
  ok('and a quote cannot break out of the Content-Disposition header it sits in',
    !INV.invoiceFileName({ number: 'a"; drop' }).includes('"'));
  ok('and a missing number still produces a file name', INV.invoiceFileName({ number: '' }) === 'invoice.pdf');
}

// ── 9. The route hands it over as a file, and never gates a document ────────────────────────
{
  const route = readFileSync(path.join(repoRoot, 'app/invoice/[id]/pdf/route.ts'), 'utf8');
  ok('the route builds the pdf from the same row the page reads', /getPublicInvoice/.test(route) && /buildInvoicePdf/.test(route));
  ok('and serves it as a pdf', /application\/pdf/.test(route));
  ok('🔴 and as an ATTACHMENT, so it reaches his share sheet rather than a viewer', /attachment; filename=/.test(route));
  ok('and is never cached, indexed, or allowed to leak the id through a referrer',
    /no-store/.test(route) && /noindex/.test(route) && /no-referrer/.test(route));
  ok('a missing invoice is a 404 and says so plainly', /status: 404/.test(route));
  ok('🔴 and it only ever reads: no mutating handler lives in this file',
    !/export async function (POST|PUT|PATCH|DELETE)/.test(route));
}

// ── 10. House rules ─────────────────────────────────────────────────────────────────────────
for (const [name, src] of [
  ['pdf', readFileSync(path.join(libDir, 'pdf.ts'), 'utf8')],
  ['invoicepdf', readFileSync(path.join(libDir, 'invoicepdf.ts'), 'utf8')],
  ['route', readFileSync(path.join(repoRoot, 'app/invoice/[id]/pdf/route.ts'), 'utf8')],
]) {
  ok(`${name}: no em or en dash anywhere in it`, !/[—–]/.test(src));
  ok(`${name}: never writes the rival domain`, !new RegExp('lekhio' + '\\.' + 'com').test(src));
}

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
