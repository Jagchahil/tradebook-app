// Tests for the pure bank feed logic in lib/bankfeed.ts: mapping TrueLayer
// booked transactions to our rows, categorisation, and capture dedupe. No
// network. Run with:
//   node test/bankfeed.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const B = await import(`${pathToFileURL(path.resolve(here, '../lib/bankfeed.ts')).href}`);

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
});
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
});
ok('already negative debit stays negative once', signedDebit && signedDebit.amount === -18.5);
ok('falls back to transaction_id when no normalised id', signedDebit && signedDebit.external_id === 'bank:tx-1b');

const income = B.mapBankTransaction({
  transaction_id: 'tx-2',
  transaction_type: 'CREDIT',
  amount: 500,
  currency: 'GBP',
  timestamp: '2026-07-01T10:00:00Z',
  description: 'FASTER PAYMENT DAVE JONES',
});
ok('credit maps positive with income category', income && income.amount === 500 && income.category === 'income');
ok('vendor falls back to description', income && /dave/i.test(income.vendor));

ok('no id rejected', B.mapBankTransaction({ transaction_type: 'DEBIT', amount: 5, currency: 'GBP', timestamp: '2026-07-01T00:00:00Z' }) === null);
ok('zero amount rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 0, currency: 'GBP', timestamp: '2026-07-01T00:00:00Z' }) === null);
ok('non GBP rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 5, currency: 'EUR', timestamp: '2026-07-01T00:00:00Z' }) === null);
ok('unknown type rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'PENDING', amount: 5, currency: 'GBP', timestamp: '2026-07-01T00:00:00Z' }) === null);
ok('bad timestamp rejected', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 5, currency: 'GBP', timestamp: 'yesterday' }) === null);
ok('missing currency defaults to GBP', B.mapBankTransaction({ transaction_id: 't', transaction_type: 'DEBIT', amount: 5, timestamp: '2026-07-01T00:00:00Z' }) !== null);

console.log('\n=== bankfeed: auth link ===\n');
// buildAuthLink is null without config in this test environment (dormant).
ok('auth link dormant without keys', B.buildAuthLink('state') === null);
ok('config check dormant', B.hasBankFeedConfig() === false);

console.log('\n=== bankfeed: categorisation stays aligned with WhatsApp ===\n');
const W = await import(`${pathToFileURL(path.resolve(here, '../lib/waintents.ts')).href}`);
// The same merchant words must land in the same category through either door.
for (const [text, expected] of [
  ['diesel at the pump', 'fuel'],
  ['screwfix trade counter', 'materials'],
  ['liability insurance renewal', 'insurance'],
  ['parking by the job', 'travel'],
]) {
  ok(`aligned: "${text}" -> ${expected}`, W.expenseCategory(text) === expected && (B.categoriseBankLine(text) === expected));
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

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
