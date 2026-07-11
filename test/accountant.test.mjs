// Accountant read only access.
//
// What these tests actually protect:
//   . a revoked or expired grant must be DEAD, however good the signature is
//   . a token must not be forgeable or enumerable
//   . the accountant must never see an unconfirmed figure, or anything personal
//
// The middle one is why the grant lives in a table at all. See lib/accountant.ts.

process.env.ACCOUNTANT_TOKEN_SECRET = 'test-secret-for-accountant-tokens';

const A = await import('../lib/accountant.ts');

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

const ID = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const OTHER = '9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b';

console.log('\nAccountant read only access\n');

// --- the token --------------------------------------------------------------
const tok = A.accountantToken(ID);
ok('round trips a grant id', A.verifyAccountantToken(tok) === ID);
ok('carries the id, not the books', tok.startsWith(ID));

ok('rejects a tampered signature', A.verifyAccountantToken(`${ID}.deadbeef`) === null);
ok('rejects a swapped grant id (signature is bound to the id)', A.verifyAccountantToken(`${OTHER}.${tok.split('.')[1]}`) === null);
ok('rejects a bare uuid with no signature', A.verifyAccountantToken(ID) === null);
ok('rejects junk', A.verifyAccountantToken('nonsense') === null);
ok('rejects empty', A.verifyAccountantToken('') === null);
ok('rejects null', A.verifyAccountantToken(null) === null);
ok('rejects a non uuid id even when correctly signed for itself', A.verifyAccountantToken(A.accountantToken('../../etc/passwd')) === null);

// The whole point: the token does NOT encode expiry, so it can never outlive a
// revocation that happened after it was signed.
ok('token contains no expiry to outlive a revocation', tok.split('.').length === 2);

// --- the live check: this is what makes revocation real ----------------------
const now = new Date('2026-07-11T12:00:00Z');
const live = { id: ID, user_id: 'u', revoked_at: null, expires_at: '2027-01-01T00:00:00Z' };

ok('a live grant is ok', A.grantState(live, now) === 'ok');
ok('a REVOKED grant is dead even with a perfect signature', A.grantState({ ...live, revoked_at: '2026-07-10T00:00:00Z' }, now) === 'revoked');
ok('an EXPIRED grant is dead', A.grantState({ ...live, expires_at: '2026-07-10T00:00:00Z' }, now) === 'expired');
ok('expiry is exclusive at the exact moment', A.grantState({ ...live, expires_at: now.toISOString() }, now) === 'expired');
ok('a missing row is null, never ok', A.grantState(null, now) === null);

// --- grant length -----------------------------------------------------------
ok('defaults to a year', A.clampGrantDays(undefined) === A.DEFAULT_GRANT_DAYS);
ok('rejects zero', A.clampGrantDays(0) === A.DEFAULT_GRANT_DAYS);
ok('rejects negative', A.clampGrantDays(-5) === A.DEFAULT_GRANT_DAYS);
ok('rejects junk', A.clampGrantDays('forever') === A.DEFAULT_GRANT_DAYS);
ok('caps an absurd request', A.clampGrantDays(99999) === A.MAX_GRANT_DAYS);
ok('honours a short grant', A.clampGrantDays(30) === 30);
ok('expiry is in the future', new Date(A.expiryFor(30, now)).getTime() > now.getTime());

// --- redaction: least privilege ---------------------------------------------
const raw = {
  id: 'tx1',
  user_id: 'SECRET-USER-ID',
  amount: -84.3,
  vendor: 'City Electrical',
  category: 'Materials',
  transaction_date: '2026-07-09',
  description: 'Cable',
  confirmed: true,
  raw_input_url: 'https://storage/receipts/private.jpg',
  raw_whatsapp_message_id: 'wamid.PRIVATE',
  source_type: 'whatsapp_image',
};
const red = A.redactTransaction(raw);
const keys = Object.keys(red);

ok('redacted shape is exactly the six fields we intend', keys.length === 6);
ok('NEVER leaks the user id', !('user_id' in red) && !JSON.stringify(red).includes('SECRET-USER-ID'));
ok('NEVER leaks the receipt image url', !JSON.stringify(red).includes('storage'));
ok('NEVER leaks the WhatsApp message id', !JSON.stringify(red).includes('wamid'));
ok('keeps the figures the accountant needs', red.amount === -84.3 && red.vendor === 'City Electrical' && red.category === 'Materials');

// --- confirmed only: the approval gate, honoured ----------------------------
const rows = [
  { amount: 100, confirmed: true, transaction_date: '2026-07-01', category: 'Income' },
  { amount: -40, confirmed: true, transaction_date: '2026-07-05', category: 'Fuel' },
  { amount: -999, confirmed: false, transaction_date: '2026-07-06', category: 'Tools' }, // a GUESS
  { amount: -10, confirmed: true, transaction_date: '2026-07-03', category: 'Fuel' },
];
const shared = A.accountantTransactions(rows);

ok('an UNCONFIRMED entry is never shared (it is our guess, not their books)', shared.length === 3);
ok('the unconfirmed amount is nowhere in the output', !JSON.stringify(shared).includes('999'));
ok('newest first', shared[0].date === '2026-07-05');

const totals = A.accountantTotals(shared);
ok('income totals only the positives', totals.income === 100);
ok('expenses total the negatives as positives', totals.expenses === 50);
ok('profit is income minus expenses', totals.profit === 50);
ok('count matches what is shown', totals.count === 3);

const cats = A.byCategory(shared);
ok('groups expenses by category', cats.length === 1 && cats[0].category === 'Fuel');
ok('sums a category', cats[0].total === 50);
ok('income is not an expense category', !cats.some((c) => c.category === 'Income'));

// --- rounding ---------------------------------------------------------------
const pennies = A.accountantTotals([
  { date: '2026-07-01', vendor: null, category: null, description: null, amount: 0.1, confirmed: true },
  { date: '2026-07-01', vendor: null, category: null, description: null, amount: 0.2, confirmed: true },
]);
ok('no floating point dust in the totals', pennies.income === 0.3);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
