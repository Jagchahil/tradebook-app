// The same purchase, twice. See lib/dedupe.ts.
//
// The scenario, which is the ordinary one and not an edge case:
//   Monday   the card payment arrives from the bank      SCREWFIX 1234 LONDON  -84.30
//   Monday   he photographs the receipt that evening     Screwfix              -84.30
//
// One purchase. Before this, two entries, inflated costs, understated profit.

import * as D from '../lib/dedupe.ts';
import { normaliseVendor as key } from '../lib/memory.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

console.log('\nThe same purchase, twice\n');

const bank = { id: 'b1', vendor: 'SCREWFIX 1234 LONDON', amount: -84.3, transaction_date: '2026-07-06', source_type: 'bank_feed' };
const receipt = { id: 'r1', vendor: 'Screwfix', amount: -84.3, transaction_date: '2026-07-06', source_type: 'whatsapp_image' };

// --- THE CASE THAT WAS BROKEN -------------------------------------------------
ok('the bank line and the receipt are recognised as ONE purchase', D.matchStrength(bank, receipt, key) === 'same');
ok('and it works in the other direction too', D.matchStrength(receipt, bank, key) === 'same');

// The old code keyed on the raw vendor string, so these two never matched. That is
// the bug in one line.
ok('the raw strings really are different (this is why it used to miss)', bank.vendor !== receipt.vendor);
ok('but the normalised keys are the same', key(bank.vendor) === key(receipt.vendor));

// --- the tolerances ------------------------------------------------------------
ok('a card settling 2 days after the receipt still matches',
  D.matchStrength(bank, { ...receipt, transaction_date: '2026-07-08' }, key) === 'same');
ok('a penny of rounding still matches',
  D.matchStrength(bank, { ...receipt, amount: -84.31 }, key) === 'same');

// --- WHAT MUST NOT MERGE. These are the dangerous false positives. -------------
ok('two DIFFERENT shops, same amount, same day: NOT the same purchase',
  D.matchStrength(bank, { ...receipt, vendor: 'Toolstation' }, key) === 'no');

ok('same shop, DIFFERENT amount: two genuine visits',
  D.matchStrength(bank, { ...receipt, amount: -91.0 }, key) === 'no');

ok('same shop, same amount, but WEEKS apart: two genuine visits',
  D.matchStrength(bank, { ...receipt, transaction_date: '2026-08-06' }, key) === 'no');

ok('a REFUND is not the purchase (the sign must agree)',
  D.matchStrength(bank, { ...receipt, amount: 84.3 }, key) === 'no');

ok('a missing amount matches nothing', D.matchStrength(bank, { ...receipt, amount: null }, key) === 'no');
ok('a missing date matches nothing', D.matchStrength(bank, { ...receipt, transaction_date: null }, key) === 'no');

// --- 'maybe': same money, right time, but we cannot vouch for the shop ---------
const noVendor = { id: 'r2', vendor: '', amount: -84.3, transaction_date: '2026-07-07' };
ok('same money and time but an unreadable shop is a MAYBE, not a merge',
  D.matchStrength(bank, noVendor, key) === 'maybe');
ok('and a maybe six days out is still a maybe',
  D.matchStrength(bank, { ...noVendor, transaction_date: '2026-07-12' }, key) === 'maybe');
ok('but seven days out is nothing',
  D.matchStrength(bank, { ...noVendor, transaction_date: '2026-07-13' }, key) === 'no');

// --- findDuplicate --------------------------------------------------------------
const books = [
  { id: 'x', vendor: 'SHELL 4471', amount: -62.15, transaction_date: '2026-07-03' },
  bank,
  { id: 'y', vendor: 'COSTA', amount: -3.2, transaction_date: '2026-07-06' },
];

const hit = D.findDuplicate(receipt, books, key);
ok('finds the bank line the receipt duplicates', hit?.match.id === 'b1');
ok('and is confident about it', hit?.strength === 'same');

ok('finds nothing for an unrelated purchase',
  D.findDuplicate({ vendor: 'B&Q', amount: -19.99, transaction_date: '2026-07-06' }, books, key) === null);

ok('never matches a row against itself',
  D.findDuplicate(bank, books, key) === null);

// A confident match beats a possible one, however they are ordered.
const mixed = [{ id: 'm', vendor: '', amount: -84.3, transaction_date: '2026-07-06' }, bank];
ok('a confident match wins over a maybe', D.findDuplicate(receipt, mixed, key)?.strength === 'same');

// --- the merge: who wins on what -----------------------------------------------
const merged = D.merge(
  { ...bank, category: 'other' },
  { ...receipt, category: 'materials', raw_input_url: 'https://storage/receipt.jpg' },
);

ok('the BANK wins on the amount (a fact, not a reading of a photo)', merged.amount === -84.3);
ok('the BANK wins on the date (the day the money actually left)', merged.transaction_date === '2026-07-06');
ok('the RECEIPT wins on the shop name (banks write terminal ids)', merged.vendor === 'Screwfix');
ok('the RECEIPT wins on the category (the user chose it)', merged.category === 'materials');
ok('the receipt image is KEPT (it is the evidence HMRC would want)', merged.receipt_url === 'https://storage/receipt.jpg');

// If the receipt has no category, the bank's is kept rather than losing both.
const noCat = D.merge({ ...bank, category: 'materials' }, { ...receipt, category: null });
ok('nothing is lost when the receipt has no category', noCat.category === 'materials');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
