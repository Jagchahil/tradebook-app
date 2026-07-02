// Tests for the pure bank feed logic in lib/bankfeed.ts: mapping GoCardless
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

console.log('\n=== bankfeed: mapping ===\n');

const spend = B.mapBankTransaction({
  transactionId: 'tx-1',
  transactionAmount: { amount: '-42.60', currency: 'GBP' },
  bookingDate: '2026-07-01',
  creditorName: 'SCREWFIX DIRECT LTD',
  remittanceInformationUnstructured: 'CARD PAYMENT SCREWFIX 1042',
});
ok('spend maps negative', spend && spend.amount === -42.6);
ok('spend categorised materials', spend && spend.category === 'materials');
ok('spend vendor from creditor', spend && /screwfix/i.test(spend.vendor));
ok('spend external id prefixed', spend && spend.external_id === 'bank:tx-1');
ok('spend date carried', spend && spend.transaction_date === '2026-07-01');

const income = B.mapBankTransaction({
  transactionId: 'tx-2',
  transactionAmount: { amount: '500.00', currency: 'GBP' },
  bookingDate: '2026-07-01',
  debtorName: 'DAVE JONES',
});
ok('income maps positive with income category', income && income.amount === 500 && income.category === 'income');
ok('income vendor is the payer', income && /dave/i.test(income.vendor));

const fuel = B.mapBankTransaction({
  transactionId: 'tx-3',
  transactionAmount: { amount: '-64.10', currency: 'GBP' },
  bookingDate: '2026-06-30',
  remittanceInformationUnstructured: 'SHELL WELLING 4021',
});
ok('fuel categorised from remittance', fuel && fuel.category === 'fuel');
ok('vendor falls back to remittance', fuel && /shell/i.test(fuel.vendor));

ok('no id rejected', B.mapBankTransaction({ transactionAmount: { amount: '-5' }, bookingDate: '2026-07-01' }) === null);
ok('internalTransactionId accepted as fallback id', B.mapBankTransaction({ internalTransactionId: 'i-9', transactionAmount: { amount: '-5.00', currency: 'GBP' }, bookingDate: '2026-07-01' }) !== null);
ok('zero amount rejected', B.mapBankTransaction({ transactionId: 't', transactionAmount: { amount: '0.00' }, bookingDate: '2026-07-01' }) === null);
ok('non GBP rejected', B.mapBankTransaction({ transactionId: 't', transactionAmount: { amount: '-5.00', currency: 'EUR' }, bookingDate: '2026-07-01' }) === null);
ok('bad date rejected', B.mapBankTransaction({ transactionId: 't', transactionAmount: { amount: '-5.00', currency: 'GBP' }, bookingDate: '01/07/2026' }) === null);
ok('missing currency defaults to GBP', B.mapBankTransaction({ transactionId: 't', transactionAmount: { amount: '-5.00' }, bookingDate: '2026-07-01' }) !== null);

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
