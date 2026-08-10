// WHAT WAS IN THE BASKET, AND WHY A RECEIPT IS NEVER LOST OVER IT.
//
//   node test/receiptlines.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS GUARDS, AND IT IS NOT THE FEATURE.
//
// Nothing reads line_items yet. It is captured before launch because the data is PERISHABLE:
// receipt images leave as 7 day signed links, they are deleted on erasure, and nobody will ever
// re-process half a million photographs. Every receipt taken without it is permanently reduced to
// "Screwfix, £47.20".
//
// So the risk here is not that the feature breaks. It is that ADDING AN OPTIONAL FIELD TO THE
// MONEY PATH COSTS A MAN HIS RECEIPT. Three ways that happens, and all three are guarded:
//
//   1. 🔴 THE COLUMN DOES NOT EXIST YET. line_items arrives by an APPLY_*.sql pasted in by hand.
//      On a database where it has not been run, NAMING the column makes PostgREST refuse the
//      WHOLE insert, and he loses a real cost over a field he never asked for. The write gives
//      the basket up first and the VAT second, and never gives up the receipt.
//   2. 🔴 THE MODEL RETURNS RUBBISH. A hallucinated wall of lines, a 4,000 character string, a
//      missing amount. Bad lines are dropped, never the receipt.
//   3. 🔴 SOMEBODY RECONCILES THE LINES AGAINST THE TOTAL. It is the obvious next thought and it
//      is wrong: real receipts carry discounts, deposits, multi-buys and rounding, so lines that
//      do not sum to the total are NORMAL. A guard that refuses them would quietly throw away
//      good baskets, and worse, a guard that ADJUSTED the total to match the lines would change
//      a man's money to fit a model's reading.
//
// ⚠️ AND THE DESCRIPTIONS ARE COPIED, NEVER EXPANDED. "T&E 2.5MM 100M" stays as it is printed. A
// model that helpfully expands an abbreviation is inventing a fact about a purchase, and on this
// path an invented fact eventually becomes a tax position.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const claude = read('lib/claude.ts');
const ingest = read('lib/receiptingest.ts');
const claudeCode = codeOnly(claude);
// ⚠️ THE PROMPT IS BUILT FROM AN ARRAY OF STRINGS AND JOINED WITH NEWLINES, so the SOURCE reads
// `'... Never',` then `'invent a line ...'`. A regex for the sentence a model receives will never
// match the file. Both of the assertions below failed on correct code until this existed, which is
// the same trap as matching JSX prose that wraps. Strip the quote-comma-newline joins and the
// comment markers, and test what is actually read.
const claudeProse = claude
  .replace(/',\s*\n\s*'/g, ' ')     // the array joins
  .replace(/^\s*\/\/ ?/gm, '')      // comment markers
  .replace(/\s+/g, ' ');
const ingestCode = codeOnly(ingest);

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe reading: lines are asked for, capped, and never invented.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  ok('🔴 THE PROMPT ASKS FOR THE LINES', /"line_items"/.test(claude));
  // ⚠️ THREE ASSERTIONS FOR ONE FACT, AND THE FIRST TWO WERE NOT ENOUGH. Deleting `line_items,`
  // from the return object left this suite GREEN: the prompt still asked for the lines and the
  // type still declared them, and nothing checked that the value made it out of the function.
  // tsc catches it today only because the field is REQUIRED, so that is pinned too. Anyone who
  // makes it optional to quiet a compiler error unlocks the silent drop.
  ok('and ParsedReceipt carries them, so no caller can forget they exist',
    /line_items: ReceiptLine\[\];/.test(claudeCode));
  ok('🔴 THE FIELD IS REQUIRED, NOT OPTIONAL: an optional one can be silently dropped and compile',
    !/line_items\?:/.test(claudeCode));
  // ⚠️ SLICED TO parseReceipt's OWN BODY, and that is the second bug in this one assertion.
  // Scanning the whole file, deleting `line_items,` from parseReceipt STILL passed, because
  // draftInvoice returns a field of the same name two hundred lines further down and the regex
  // happily found that one. An assertion about a function has to be scoped to the function.
  const iFn = claudeCode.indexOf('export async function parseReceipt');
  const iNext = claudeCode.indexOf('export interface ParsedEntry');
  const parseReceiptBody = iFn >= 0 && iNext > iFn ? claudeCode.slice(iFn, iNext) : '';
  ok('parseReceipt is where this file thinks it is, so the assertion below is real',
    parseReceiptBody.length > 500);
  ok('🔴 AND parseReceipt ACTUALLY RETURNS IT, which neither of the two above proves',
    /\n\s+line_items,\n/.test(parseReceiptBody));
  ok('🔴 THE MODEL IS TOLD NOT TO INVENT A LINE',
    /Never invent a line/.test(claudeProse));
  ok('🔴 AND NOT TO SPLIT THE TOTAL INTO LINES ITSELF, which would be a guess wearing a reading\'s clothes',
    /never split the total into lines yourself/i.test(claudeProse));
  ok('🔴 AND NOT TO EXPAND AN ABBREVIATION, because a wrong expansion reads as a fact',
    /not tidy them up, expand them, or guess what an abbreviation stands for/i.test(claudeProse));
  ok('the totals lines are excluded, because subtotal and change are not things he bought',
    /Ignore subtotal, VAT, total, change and card lines/i.test(claudeProse));

  ok('🔴 THE COUNT IS CAPPED, so a hallucinated wall of lines cannot reach the database',
    /MAX_RECEIPT_LINES = \d+/.test(claudeCode) && /\.slice\(0, MAX_RECEIPT_LINES\)/.test(claudeCode));
  ok('🔴 AND EACH DESCRIPTION IS CAPPED, so one enormous string cannot either',
    /MAX_LINE_CHARS = \d+/.test(claudeCode) && /\.slice\(0, MAX_LINE_CHARS\)/.test(claudeCode));
  ok('a line with no description is dropped rather than stored empty',
    /\.filter\(\(l\) => l\.description\.length > 0\)/.test(claudeCode));
  ok('an unreadable amount becomes 0 rather than NaN, which would not survive JSON',
    /Number\.isFinite\(amt\) \? Math\.abs\(amt\) : 0/.test(claudeCode));

  // 🔴 THE ONE THAT MATTERS MOST. See the header: reconciling lines against the total, or worse
  // adjusting the total to match the lines, changes a man's money to fit a model's reading.
  ok('🔴 THE TOTAL IS NEVER RECOMPUTED FROM THE LINES',
    !/line_items[\s\S]{0,400}?reduce\(/.test(claudeCode)
    && !/amount\s*=\s*[\s\S]{0,80}line_items/.test(claudeCode));
  ok('and the reasoning for that is written down where the next person will read it',
    /discounts,\s*deposits, multi-buys and rounding/i.test(claudeProse));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe write: the basket is given up before the money, and the receipt never is.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // ⚠️ OPTIONAL CHAINING IS THE POINT HERE, not an accident. ParsedReceipt declares line_items
  // required, and three test suites stubbed parseReceipt and returned an object without it, which
  // threw INSIDE the receipt walk and lost the row. A type is a promise between two files, not a
  // promise about every object that ever reaches this one. On the single path where a throw costs
  // a man his evidence, the boundary is defended rather than trusted.
  ok('the basket only rides when there is one, so "not itemised" and "not looked at" stay apart',
    /if \(parsed\.line_items\?\.length\) \{/.test(ingestCode));
  ok('🔴 AND A MISSING FIELD CANNOT THROW INSIDE THE RECEIPT WALK, which would cost him the row',
    /parsed\.line_items\?\./.test(ingestCode));

  ok('🔴 THERE IS A RETRY THAT DROPS OPTIONAL COLUMNS', /giveUpInOrder/.test(ingestCode));

  // ⚠️ ORDER, PROVED BY INDEX AND NOT BY PRESENCE. Both markers are checked for existence first:
  // indexOf returns -1 for a missing one and -1 is less than everything, so an ordering assertion
  // on a marker that is not there is an assertion that cannot fail.
  const iLines = ingestCode.indexOf('delete row.line_items;');
  const iVat = ingestCode.indexOf('delete row.vat_amount;');
  ok('both give-up markers exist, so the ordering below can actually fail',
    iLines >= 0 && iVat >= 0);
  ok('🔴 THE BASKET IS GIVEN UP FIRST AND THE VAT SECOND, because VAT is money he can reclaim',
    iLines < iVat);

  ok('🔴 AND THE RECEIPT ITSELF IS NEVER GIVEN UP: nothing deletes the amount, vendor or date',
    !/delete row\.amount/.test(ingestCode)
    && !/delete row\.vendor/.test(ingestCode)
    && !/delete row\.transaction_date/.test(ingestCode));

  // The loop shape is the point: a third optional column added later is covered by adding one
  // entry, rather than by remembering to widen a chain of ifs. The VAT retry was a chain of ifs
  // and it was the only one, on a file that already had two optional fields.
  ok('the retry is a list rather than a chain of ifs, so a third column cannot be forgotten',
    /for \(const giveUp of giveUpInOrder\)/.test(ingestCode));
  ok('and it stops the moment the row lands, so a healthy write drops nothing',
    /if \(landed\) break;/.test(ingestCode));

  ok('a write that never landed still answers failed, and never pretends',
    /if \(!landed\) return \{ outcome: 'failed' \};/.test(ingestCode));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe column, and the fact that it is more of him than a total was.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const sql = read('supabase/APPLY_2026-08-10_receipt_lines.sql');
  ok('the migration exists and is additive', /add column if not exists line_items jsonb/.test(sql));
  ok('🔴 IT IS NULLABLE, so an un-itemised receipt stores nothing rather than an empty array',
    !/not null/i.test(sql.split('add column')[1] ?? ''));
  ok('the column comment says null and empty are different things',
    /NULL means/.test(sql) && /different from an empty/i.test(sql.replace(/\s+/g, ' ')));
  ok('and it says out loud that nothing reads it yet, so it is not mistaken for a live feature',
    /read by nothing yet/i.test(sql));

  // 🔴 IT IS ON transactions ON PURPOSE. The erasure and the export both walk that table already,
  // so the basket is reached by both for free. A separate table would have needed adding to the
  // manifest, and the manifest is exactly the thing that goes stale.
  const supa = read('lib/supabase.ts');
  ok('🔴 transactions IS IN THE MANIFEST BOTH DATA RIGHTS DOORS WALK, so erasure reaches the basket',
    /table:\s*'transactions'/.test(supa));

  const inv = read('docs/14_DATA_INVENTORY.md');
  ok('🔴 THE INVENTORY RECORDS THAT WE NOW HOLD WHAT HE BOUGHT, not just what he spent',
    /line item|what was bought|itemised/i.test(inv));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
