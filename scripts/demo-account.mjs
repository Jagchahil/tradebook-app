// THE DEMO ACCOUNT APPLE NEEDS TO REVIEW US AT ALL.
//
//   node scripts/demo-account.mjs            print what it will do, change nothing
//   node scripts/demo-account.mjs --run      create/refresh the demo account
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS, AND WHY IT REPLACES supabase/demo_seed.sql
//
// Lekhio signs in with a phone OTP. An Apple reviewer sits in California and cannot receive an SMS
// sent to a UK mobile. App Store Review Guideline 2.1, in Apple's own words:
//
//     "Provide App Review with full access to your app. If your app includes account-based
//      features, provide either an active demo account or fully-featured demo mode."
//
// Without one they reject before they have seen a single screen. It is the most common rejection
// there is for an app like ours, and it costs a full review cycle every time.
//
// demo_seed.sql already existed and was well thought out. It has never been run. Why? Because it
// contained this line:
//
//     demo_id uuid := '00000000-0000-4000-8000-000000000001'; -- <-- REPLACE with the real auth uuid
//
// A HUMAN STEP IS A STEP THAT GETS SKIPPED. Somebody had to create an auth user in the dashboard,
// copy its uuid, paste it into a SQL file, and run it in the right order. That is four chances to
// stop, and we stopped. The password rotation taught us this exact lesson three days ago and cost
// an afternoon: when a human has to carry a value from one system to another, automate it or watch
// it rot.
//
// So this script creates the auth user AND the profile AND the subscription AND the data, in one
// command, and it is idempotent. There is no uuid to paste because nothing ever leaves the process.
//
// ---------------------------------------------------------------------------------------------
// THE ONE THING YOU MUST STILL DO BY HAND (it cannot be done over the API)
//
// In Supabase: Authentication -> Sign In / Providers -> Phone -> "Test OTP".
// Add:      +447700900123   =>   123456
//
// That maps the demo number to a fixed code with NO SMS ever sent. Apple's reviewer types the
// number and the code, and is in.
//
// +44 7700 900xxx is reserved by Ofcom for drama and testing. It is never allocated to a real
// person, so this account can never collide with a real user.
//
// ---------------------------------------------------------------------------------------------
// SAFETY
//
//   - Touches ONE phone number and nothing else. It is incapable of harming a real account,
//     because it never names one.
//   - Idempotent: wipes and rebuilds the demo user's own data every run, so the reviewer always
//     sees the same clean, identical account.
//   - The subscription it grants is a LOCAL grant with no Stripe ids. It can never be billed, and
//     it never appears in Stripe or in the paying-user count.

import { createClient } from '@supabase/supabase-js';

const RUN = process.argv.includes('--run');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [
  ['NEXT_PUBLIC_SUPABASE_URL', URL],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`[demo] fatal: missing env: ${missing.join(', ')}. Load the production .env first.`);
  process.exit(1);
}

const PHONE = '+447700900123';
const OTP = '123456';

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const log = (...a) => console.log('[demo]', ...a);

// A realistic, boring month of a working electrician. Mixed income and expenses, mixed sources,
// and SOME LEFT UNCONFIRMED ON PURPOSE, so the reviewer can see the approval gate actually doing
// something rather than an app that just agrees with itself.
//
// `vendor` is the real column name. The app aliases it to merchant_name on read (see TX_COLS in
// the mobile lib/supabase.ts). Get this wrong and the reviewer sees a wall of rows that all say
// "Expense", which reads as a broken app.
const DAY = 24 * 3600 * 1000;
const ago = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const TRANSACTIONS = [
  { amount: 1450.00, vendor: 'Harding Builders', category: 'Income',        d: 2,  description: 'Consumer unit upgrade, 3 bed semi', source_type: 'whatsapp_text',  confirmed: true },
  { amount: -84.30,  vendor: 'City Electrical',  category: 'Materials',     d: 2,  description: 'Cable, back boxes, breakers',       source_type: 'whatsapp_image', confirmed: true },
  { amount: -62.15,  vendor: 'Shell',            category: 'Fuel',          d: 3,  description: 'Diesel',                            source_type: 'whatsapp_image', confirmed: true },
  { amount: 980.00,  vendor: 'M. Okafor',        category: 'Income',        d: 5,  description: 'Rewire, first floor',               source_type: 'whatsapp_text',  confirmed: true },
  { amount: -213.40, vendor: 'Screwfix',         category: 'Tools',         d: 6,  description: 'Impact driver and bits',            source_type: 'whatsapp_image', confirmed: true },
  { amount: -45.00,  vendor: 'NICEIC',           category: 'Subscriptions', d: 9,  description: 'Monthly membership',                source_type: 'bank_feed',      confirmed: true },
  { amount: -128.90, vendor: 'City Electrical',  category: 'Materials',     d: 11, description: 'Consumer unit',                     source_type: 'whatsapp_image', confirmed: true },
  { amount: -18.60,  vendor: 'Costa',            category: 'Meals',         d: 12, description: 'Site coffee run',                   source_type: 'whatsapp_image', confirmed: false },
  { amount: 2100.00, vendor: 'Ravensworth Ltd',  category: 'Income',        d: 14, description: 'Commercial lighting install',       source_type: 'whatsapp_text',  confirmed: true },
  { amount: -74.25,  vendor: 'Toolstation',      category: 'Materials',     d: 15, description: 'Trunking and clips',                source_type: 'whatsapp_image', confirmed: false },
  { amount: -55.00,  vendor: 'Vodafone',         category: 'Phone',         d: 18, description: 'Monthly bill',                      source_type: 'bank_feed',      confirmed: true },
  { amount: -890.00, vendor: 'Ford Finance',     category: 'Vehicle',       d: 20, description: 'Van payment',                       source_type: 'bank_feed',      confirmed: true },
  { amount: 640.00,  vendor: 'J. Whitaker',      category: 'Income',        d: 23, description: 'EV charger install',                source_type: 'whatsapp_text',  confirmed: true },
  { amount: -32.80,  vendor: 'Shell',            category: 'Fuel',          d: 25, description: 'Diesel',                            source_type: 'whatsapp_image', confirmed: true },
];

async function findAuthUser() {
  // No "get user by phone" in the admin API, so we page. There are not many users yet, and this
  // runs about twice in the product's life.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = (data.users ?? []).find((u) => u.phone === PHONE.replace('+', '') || u.phone === PHONE);
    if (hit) return hit;
    if (!data.users || data.users.length < 200) return null;
    page++;
  }
}

async function main() {
  if (!RUN) {
    log('DRY. Would create (or refresh) the App Review demo account:');
    log(`  phone         ${PHONE}   (Ofcom reserved, never a real person)`);
    log(`  fixed OTP     ${OTP}     (you add this in the Supabase dashboard, see the note in this file)`);
    log('  subscription  ACTIVE, local grant, no Stripe ids, can never be billed');
    log(`  data          ${TRANSACTIONS.length} transactions, 2 left unconfirmed so the approval gate is visible`);
    log('Re-run with --run to actually do it.');
    return;
  }

  // 1. The auth user. Created with the phone CONFIRMED, so the fixed-OTP sign in works first time.
  let authUser = await findAuthUser();
  if (authUser) {
    log(`auth user already exists (${authUser.id}). Reusing it, and rebuilding its data.`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({ phone: PHONE, phone_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    authUser = data.user;
    log(`auth user created (${authUser.id}).`);
  }
  const id = authUser.id;

  // 2. The profile. phone_number is NOT NULL in production, whatever schema.sql says.
  const up = await admin.from('users').upsert({
    id,
    phone_number: PHONE,
    name: 'Demo Account',
    trade_type: 'electrician',
    is_active: true,
  }, { onConflict: 'id' });
  if (up.error) throw new Error(`upsert users row: ${up.error.message}`);
  log('profile written.');

  // 3. Wipe and rebuild the demo data, so every review sees the identical account.
  const delTx = await admin.from('transactions').delete().eq('user_id', id);
  if (delTx.error) throw new Error(`clear transactions: ${delTx.error.message}`);
  const delSub = await admin.from('subscriptions').delete().eq('phone', PHONE);
  if (delSub.error) throw new Error(`clear subscription: ${delSub.error.message}`);

  // 4. ACTIVE subscription. Without this the reviewer hits the paywall and rejects us for the very
  //    thing we restructured the whole app to avoid. No Stripe ids: a local grant, never billable.
  const sub = await admin.from('subscriptions').insert({
    phone: PHONE,
    plan: 'monthly',
    status: 'active',
    amount_pence: 0, // nothing is being charged. Not 1299. Nothing.
    current_period_end: new Date(Date.now() + 365 * DAY).toISOString(),
    cancel_at_period_end: false,
  });
  if (sub.error) throw new Error(`insert subscription: ${sub.error.message}`);
  log('ACTIVE subscription granted (local, no Stripe, never billable).');

  const tx = await admin.from('transactions').insert(
    TRANSACTIONS.map((t) => ({
      user_id: id,
      amount: t.amount,
      vendor: t.vendor,
      category: t.category,
      transaction_date: ago(t.d),
      description: t.description,
      source_type: t.source_type,
      confirmed: t.confirmed,
    })),
  );
  if (tx.error) throw new Error(`insert transactions: ${tx.error.message}`);
  log(`${TRANSACTIONS.length} transactions written (2 unconfirmed, so the approval gate is visible).`);

  // 5. Prove it, rather than assume it. Read the system, not the file.
  const { data: check } = await admin.from('transactions').select('id').eq('user_id', id);
  const { data: subCheck } = await admin.from('subscriptions').select('status').eq('phone', PHONE);

  console.log('\n===============================================');
  console.log('THE DEMO ACCOUNT IS READY.');
  console.log('');
  console.log('  Phone     ' + PHONE);
  console.log('  Code      ' + OTP);
  console.log(`  Data      ${check?.length ?? 0} transactions, subscription "${subCheck?.[0]?.status}"`);
  console.log('');
  console.log('STILL TO DO BY HAND, ONCE, AND NOTHING WORKS WITHOUT IT:');
  console.log('  Supabase -> Authentication -> Sign In / Providers -> Phone -> Test OTP');
  console.log(`  Add:  ${PHONE}  =>  ${OTP}`);
  console.log('');
  console.log('THEN PASTE THIS INTO App Store Connect -> App Review Information -> Sign-In Required:');
  console.log(`  Username: ${PHONE}`);
  console.log(`  Password: ${OTP}`);
  console.log('  Notes:    Lekhio signs in with a phone number and a one-time code. Enter the number');
  console.log('            above, tap Send code, then enter the code above. No SMS is sent to this');
  console.log('            test number. Day to day, receipts are captured by photo and voice note on');
  console.log('            WhatsApp; the app is where the books and the tax figures are reviewed and');
  console.log('            approved. Subscriptions are purchased on our website, not in the app.');
  console.log('===============================================');
}

main().catch((e) => { console.error('[demo] fatal:', e.message); process.exit(1); });
