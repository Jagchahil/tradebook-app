// Tests for the pure bank feed logic in lib/bankfeed.ts: mapping TrueLayer
// booked transactions to our rows, categorisation, and capture dedupe. No
// network. Run with:
//   node test/bankfeed.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const B = await import(`${pathToFileURL(path.resolve(here, '../lib/bankfeed.ts')).href}`);
// The REAL vendor rules, injected into the mapper, so this suite tests what production actually
// runs rather than a stand-in. See the Categoriser note in lib/bankfeed.ts: the rules cannot be
// imported there (Node ESM will not resolve an extensionless sibling and it would break this very
// file), and copying them would be a second source of truth. So they are passed in.
const { categoriseBankLine } = await import(`${pathToFileURL(path.resolve(here, '../lib/categories.ts')).href}`);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== bankfeed: mapping (TrueLayer Data API v1) ===\n');

const spend = B.mapBankTransaction({
  transaction_id: 'tx-1',
  normalised_provider_transaction_id: 'norm-1',
  transaction_type: 'DEBIT',
  amount: 42.6,
  currency: 'GBP',
  timestamp: '2026-07-01T09:12:00Z',
  merchant_name: 'Screwfix',
  description: 'CARD PAYMENT SCREWFIX 1042',
}, categoriseBankLine);
ok('debit maps negative regardless of sign', spend && spend.amount === -42.6);
ok('debit categorised materials', spend && spend.category === 'materials');
ok('vendor from merchant_name', spend && /screwfix/i.test(spend.vendor));
ok('stable normalised id preferred', spend && spend.external_id === 'bank:norm-1');
ok('date from timestamp', spend && spend.transaction_date === '2026-07-01');

const signedDebit = B.mapBankTransaction({
  transaction_id: 'tx-1b',
  transaction_type: 'DEBIT',
  amount: -18.5,
  currency: 'GBP',
  timestamp: '2026-07-01T09:12:00Z',
  description: 'SHELL WELLING',
}, categoriseBankLine);
ok('already negative debit stays negative once', signedDebit && signedDebit.amount === -18.5);
ok('falls back to transaction_id when no normalised id', signedDebit && signedDebit.external_id === 'bank:tx-1b');

const income = B.mapBankTransaction({
  transaction_id: 'tx-2',
  transaction_type: 'CREDIT',
  amount: 500,
  currency: 'GBP',
  timestamp: '2026-07-01T10:00:00Z',
  description: 'FASTER PAYMENT DAVE JONES',
}, categoriseBankLine);
ok('credit maps positive with income category', income && income.amount === 500 && income.category === 'income');
ok('vendor falls back to description', income && /dave/i.test(income.vendor));

ok('no id rejected', B.mapBankTransaction({ transaction_type: 'DEBIT', amount: 5, currency: 'GBP', timestamp: '2026-07-01T00:00:00Z' }, categoriseBankLine) === null);
ok('zero amount rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 0, currency: 'GBP', timestamp: '2026-07-01T00:00:00Z' }, categoriseBankLine) === null);
ok('non GBP rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 5, currency: 'EUR', timestamp: '2026-07-01T00:00:00Z' }, categoriseBankLine) === null);
ok('unknown type rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'PENDING', amount: 5, currency: 'GBP', timestamp: '2026-07-01T00:00:00Z' }, categoriseBankLine) === null);
ok('bad timestamp rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 5, currency: 'GBP', timestamp: 'yesterday' }, categoriseBankLine) === null);
ok('missing currency defaults to GBP', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 5, timestamp: '2026-07-01T00:00:00Z' }, categoriseBankLine) !== null);

console.log('\n=== bankfeed: auth link ===\n');
// buildAuthLink is null without config in this test environment (dormant).
ok('auth link dormant without keys', B.buildAuthLink('state') === null);
ok('config check dormant', B.hasBankFeedConfig() === false);

console.log('\n=== bankfeed: categorisation stays aligned with WhatsApp ===\n');
const W = await import(`${pathToFileURL(path.resolve(here, '../lib/waintents.ts')).href}`);
// TWO DOORS, AND THEY MUST NOT DISAGREE ABOUT THE SAME WORDS.
//
// WhatsApp has its OWN keyword map (EXPENSE_CATEGORY in lib/waintents.ts) and the bank feed now
// uses the canonical rules in lib/categories.ts. That is a KNOWN, DELIBERATE gap: waintents is the
// file every message goes through and its map is woven into its own parsing, so unifying it is a
// real refactor and not a midnight one.
//
// What must never happen is the two DISAGREEING about a word they both claim to know. "Diesel" has
// to mean fuel whichever way it reaches us, or a man's books depend on which door he walked in.
// This test is the tripwire.
//
// The bank map is now WIDER (it knows skips, training, subcontractors, software). WhatsApp simply
// returns 'other' for those, which is honest: it does not claim to know and it does not guess.
for (const [text, expected] of [
  ['diesel at the pump', 'fuel'],
  ['screwfix trade counter', 'materials'],
  ['liability insurance renewal', 'insurance'],
  ['parking by the job', 'travel'],
]) {
  ok(`aligned: "${text}" -> ${expected}`, W.expenseCategory(text) === expected && (categoriseBankLine(text) === expected));
}

// And every category WhatsApp CAN emit must be a real category, or it writes a label the app's
// picker does not have and the user cannot change it back.
const C = await import(`${pathToFileURL(path.resolve(here, '../lib/categories.ts')).href}`);
for (const word of ['diesel', 'screwfix', 'insurance', 'parking', 'greggs', 'drill', 'phone bill']) {
  const wa = W.expenseCategory(word);
  ok(`WhatsApp's "${word}" -> "${wa}" is a real category`, C.isCategory(wa));
}

console.log('\n=== bankfeed: capture dedupe ===\n');
const entry = { amount: -42.6, transaction_date: '2026-07-01' };
ok('same amount same day matches', B.matchesCapture(entry, { amount: -42.6, transaction_date: '2026-07-01' }));
ok('within 5p matches', B.matchesCapture(entry, { amount: -42.58, transaction_date: '2026-07-01' }));
ok('3 days apart matches', B.matchesCapture(entry, { amount: -42.6, transaction_date: '2026-06-28' }));
ok('4 days apart does not match', !B.matchesCapture(entry, { amount: -42.6, transaction_date: '2026-06-27' }));
ok('different amount does not match', !B.matchesCapture(entry, { amount: -55, transaction_date: '2026-07-01' }));
ok('opposite direction does not match', !B.matchesCapture(entry, { amount: 42.6, transaction_date: '2026-07-01' }));
ok('null capture date does not match', !B.matchesCapture(entry, { amount: -42.6, transaction_date: null }));

{
  console.log('\n--- history range (data minimisation) ---');
  const mid = new Date('2026-12-01T00:00:00Z'); // in the 2026-27 tax year
  ok('tax year start is 6 April of the current year', B.taxYearStartISO(mid) === '2026-04-06');
  const early = new Date('2026-03-01T00:00:00Z'); // before 6 April, so prior tax year
  ok('before 6 April belongs to the previous tax year', B.taxYearStartISO(early) === '2025-04-06');
  ok('this_year maps to the current tax year start', B.historyFromISO('this_year', mid) === '2026-04-06');
  ok('two_years reaches back to the previous tax year start', B.historyFromISO('two_years', mid) === '2025-04-06');
  ok('all uses a far past date', B.historyFromISO('all', mid) === '2015-01-01');
  ok('default choice is never someones whole history', B.historyFromISO('this_year', mid) > '2015-01-01');
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
