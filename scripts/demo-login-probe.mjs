// SIGN IN AS THE APPLE REVIEWER. Holding only what he holds.
//
//   node scripts/demo-login-probe.mjs
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS
//
// After scripts/demo-account.mjs ran, three separate things each looked correct:
//
//   . the auth user exists, with its phone confirmed
//   . the test OTP is configured in the Supabase dashboard
//   . the subscription is active and the transactions are there
//
// And NOT ONE OF THEM IS THE THING WE ACTUALLY NEED, which is: can a man in California, holding
// nothing but the app, type a phone number and a six digit code and get into Lekhio?
//
// Every bug this week was found by doing the thing rather than by checking that the parts of the
// thing existed. The trial "existed" in a button that called router.replace. The AIA differ was
// green for six days by reading GOV.UK's JSON-LD instead of GOV.UK. The demo account has "been
// ready" since the day someone wrote demo_seed.sql, and it had never once been run.
//
// So this holds ONLY THE ANON KEY, which is what ships inside the app, and does exactly what the
// reviewer will do:
//
//   1. Ask for a code on +447700900123.  (No SMS is sent. The test OTP intercepts it.)
//   2. Verify the fixed code 123456.
//   3. Read his transactions THROUGH RLS, as himself, with no service role anywhere.
//   4. Ask /api/billing/status whether he is entitled, which is what the paywall gate reads.
//
// If step 4 says entitled:false, the reviewer sees "This account is not active" and rejects us,
// and we would never have known until the email arrived.
//
// IT NEEDS NO SERVICE KEY. That is the point. If this passes, the reviewer gets in.

import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.env.PROBE_SITE_URL || 'https://lekhio.app';

const missing = [
  ['NEXT_PUBLIC_SUPABASE_URL', URL],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`[demo-login] fatal: missing env: ${missing.join(', ')}`);
  process.exit(1);
}

const PHONE = '+447700900123';
const OTP = '123456';

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS ✓' : 'FAIL ✗'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// The anon key. Exactly what is compiled into the app the reviewer downloads. Nothing else.
const app = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log(`[demo-login] signing in as the Apple reviewer would, on ${PHONE}, with only the anon key.\n`);

  // 1. "Send me a code." With a test OTP configured, Supabase sends no SMS and accepts the fixed code.
  const sent = await app.auth.signInWithOtp({ phone: PHONE });
  check('the app can request a code for the demo number', !sent.error, sent.error?.message);
  if (sent.error) return finish();

  // 2. The code. THE STEP THAT DECIDES WHETHER APPLE EVER SEES THE PRODUCT.
  const v = await app.auth.verifyOtp({ phone: PHONE, token: OTP, type: 'sms' });
  check('THE FIXED CODE 123456 SIGNS HIM IN  <-- if this fails, Apple rejects us at screen one',
    !v.error && Boolean(v.data.session), v.error?.message);
  if (v.error || !v.data.session) return finish();

  const token = v.data.session.access_token;
  const uid = v.data.user?.id;

  // 3. His books, read as himself, through RLS. A service key would prove nothing here: RLS is the
  //    only thing standing between him and an empty screen, and an empty app reads as a broken app.
  const me = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tx = await me.from('transactions').select('id,vendor,amount,confirmed').eq('user_id', uid);
  const rows = tx.data ?? [];
  check('he can see his 14 transactions THROUGH RLS, as himself', rows.length === 14, `${rows.length} rows`);

  const unconfirmed = rows.filter((r) => r.confirmed === false).length;
  check('2 are unconfirmed, so the reviewer can SEE the approval gate doing something',
    unconfirmed === 2, `${unconfirmed} unconfirmed`);

  const named = rows.filter((r) => r.vendor).length;
  check('every row has a shop name (the app aliases vendor -> merchant_name; get this wrong and he sees a wall of "Expense")',
    named === rows.length, `${named}/${rows.length} named`);

  // 4. THE PAYWALL GATE. The one that would show him "This account is not active".
  const res = await fetch(`${SITE}/api/billing/status`, { headers: { Authorization: `Bearer ${token}` } });
  const billing = await res.json().catch(() => ({}));
  check('the server says he is ENTITLED, so the paywall never appears',
    billing.entitled === true, `entitled=${billing.entitled}, status=${billing.status}`);

  await app.auth.signOut();
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.passed);
  console.log('\n===============================================');
  if (failed.length === 0) {
    console.log(`THE REVIEWER CAN GET IN. ${results.length}/${results.length} passed.`);
    console.log('A man in California, holding only the app, types the number and the code and sees a');
    console.log("working month of an electrician's books. Paste the credentials into App Store Connect.");
    process.exitCode = 0;
  } else {
    console.log(`🔴 ${failed.length} of ${results.length} FAILED:`);
    for (const f of failed) console.log(`   - ${f.name}`);
    console.log('DO NOT SUBMIT. Apple will reject us before seeing a single screen, under guideline 2.1.');
    process.exitCode = 1;
  }
  console.log('===============================================');
}

main().catch((e) => { console.error('[demo-login] fatal:', e.message); process.exit(1); });
