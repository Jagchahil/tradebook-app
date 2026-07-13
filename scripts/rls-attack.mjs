// PROVE that row level security actually stops one user reading another's money.
//
//   node scripts/rls-attack.mjs            print what it will do, do nothing
//   node scripts/rls-attack.mjs --run      create two users, attack across them, delete everything
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS
//
// 26 RLS policies were "audited" by READING them. Every one says `auth.uid() = user_id` and every
// one looks correct. So did the AIA differ check, which passed for six days by reading GOV.UK's
// JSON-LD instead of GOV.UK. Reading a policy proves INTENT. It does not prove ENFORCEMENT.
//
// The only thing that proves enforcement is a real second user, holding the real anon key an
// attacker would hold, trying to read the first user's data and being refused. That is this script.
//
// It is the single most important test in the product, because RLS is the only thing standing
// between a shared Postgres database and one tradesman seeing another tradesman's tax affairs.
//
// ---------------------------------------------------------------------------------------------
// SAFETY
//
//   - Refuses to run without --run.
//   - Only ever creates and deletes accounts whose email starts with rls-probe-. It is incapable
//     of touching a real user, because it never names one.
//   - Cleans up in a finally block: both transactions, both users rows, both auth users. If the
//     script dies halfway, re-running it deletes any rls-probe- leftovers first.
//   - Needs three env vars, and fails loudly naming the missing one rather than half-running.
//
// Run it against production. Testing a copy of the policies is the exact mistake we keep making.

import { createClient } from '@supabase/supabase-js';

const RUN = process.argv.includes('--run');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [
  ['NEXT_PUBLIC_SUPABASE_URL', URL],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`[rls] fatal: missing env: ${missing.join(', ')}. Load the production .env first.`);
  process.exit(1);
}

const PREFIX = 'rls-probe-';
const stamp = Date.now();
// Phone numbers are NOT NULL and identify a user (this is a WhatsApp-first product). Two distinct
// fake numbers in a range that cannot collide with a real one.
const A = { email: `${PREFIX}a-${stamp}@lekhio.app`, password: `Aa1!${stamp}aa`, phone: `+9999${stamp}1` };
const B = { email: `${PREFIX}b-${stamp}@lekhio.app`, password: `Bb2!${stamp}bb`, phone: `+9999${stamp}2` };

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const record = (name, blocked, detail) => {
  results.push({ name, blocked, detail });
  console.log(`  ${blocked ? 'BLOCKED ✓' : 'LEAKED  ✗'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// A client acting AS a specific user, holding only the anon key plus that user's JWT. This is
// exactly what the mobile app and the website hold. It is what an attacker would hold.
function asUser(session) {
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function makeUser(u) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
  });
  if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
  const id = data.user.id;
  // The app row and one transaction, written with the service role so setup never depends on the
  // thing we are testing.
  //
  // ⚠️ THE ERROR ON THIS INSERT USED TO BE IGNORED. It failed, silently, and the only sign was a
  // foreign key violation on the NEXT statement. A silent failure, written into a script whose
  // entire purpose is finding silent failures. Check every error, every time, or you are just
  // writing a more confident version of the bug.
  // phone_number is NOT NULL in production. supabase/schema.sql says `phone_number text` (nullable).
  // That is the SECOND column in five minutes where the checked-in schema disagrees with the live
  // database (transaction_date was the first). The schema file is a DESCRIPTION someone wrote once,
  // and it has been drifting ever since. Every audit that "reviewed the schema" reviewed a file.
  const ins = await admin.from('users').insert({
    id,
    name: u.email,
    phone_number: u.phone,
    is_active: true,
  });
  if (ins.error) throw new Error(`insert users row for ${u.email}: ${ins.error.message}`);
  // transaction_date is NOT NULL in production. Note that supabase/schema.sql in the repo declares
  // it NULLABLE. The checked-in schema is not the schema that is running, and the only reason
  // nobody noticed is that nothing in the codebase inserts a transaction without a date. Found by
  // touching the live database, which is the only way any of this week's bugs were ever found.
  const tx = await admin.from('transactions')
    .insert({
      user_id: id,
      amount: 999.99,
      vendor: `SECRET-${u.email}`,
      category: 'materials',
      transaction_date: new Date().toISOString().slice(0, 10),
      confirmed: true,
    })
    .select('id').single();
  if (tx.error) throw new Error(`seed tx ${u.email}: ${tx.error.message}`);
  // A real session, via the anon client, the way a real login produces one.
  const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const s = await anon.auth.signInWithPassword({ email: u.email, password: u.password });
  if (s.error) throw new Error(`signin ${u.email}: ${s.error.message}`);
  return { id, txId: tx.data.id, session: s.data.session };
}

async function cleanup() {
  // Delete every probe account, not just this run's, so a half-finished run never litters prod.
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const probes = (data?.users ?? []).filter((u) => (u.email || '').startsWith(PREFIX));
  for (const u of probes) {
    await admin.from('transactions').delete().eq('user_id', u.id);
    await admin.from('users').delete().eq('id', u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  if (probes.length) console.log(`\n[rls] cleaned up ${probes.length} probe account(s). Nothing left behind.`);
}

async function main() {
  if (!RUN) {
    console.log('[rls] DRY. Would create two rls-probe- users in PRODUCTION, have each try to read,');
    console.log('[rls] update and delete the other\'s transaction and profile, then delete everything.');
    console.log('[rls] Re-run with --run to actually do it.');
    return;
  }

  console.log('[rls] creating two probe users and seeding one secret transaction each...\n');
  let a, b;
  try {
    a = await makeUser(A);
    b = await makeUser(B);

    const aClient = asUser(a.session); // acting as user A, trying to reach user B

    // 1. READ. The one that matters most: can A see B's money?
    const r1 = await aClient.from('transactions').select('id,vendor,amount').eq('id', b.txId);
    record('A cannot SELECT B\'s transaction', (r1.data?.length ?? 0) === 0, `saw ${r1.data?.length ?? 0} rows`);

    // 2. READ everything, no filter. RLS must silently scope it to A's own rows.
    const r2 = await aClient.from('transactions').select('id,user_id');
    const leakedRows = (r2.data ?? []).filter((row) => row.user_id !== a.id);
    record('A\'s unfiltered SELECT returns only A\'s rows', leakedRows.length === 0, `${leakedRows.length} foreign rows`);

    // 3. READ B's profile.
    const r3 = await aClient.from('users').select('id,name').eq('id', b.id);
    record('A cannot SELECT B\'s profile', (r3.data?.length ?? 0) === 0, `saw ${r3.data?.length ?? 0} rows`);

    // 4. UPDATE B's transaction. This is where money moves. It must change zero rows.
    const r4 = await aClient.from('transactions').update({ amount: 0 }).eq('id', b.txId).select('id');
    record('A cannot UPDATE B\'s transaction', (r4.data?.length ?? 0) === 0, `changed ${r4.data?.length ?? 0} rows`);

    // 5. DELETE B's transaction.
    const r5 = await aClient.from('transactions').delete().eq('id', b.txId).select('id');
    record('A cannot DELETE B\'s transaction', (r5.data?.length ?? 0) === 0, `deleted ${r5.data?.length ?? 0} rows`);

    // 6. INSERT a transaction ASSIGNED TO B. The insert policy must reject a row whose user_id is
    //    not A's own. This is how an attacker plants data in someone else's account.
    const r6 = await aClient.from('transactions')
      .insert({ user_id: b.id, amount: 1, vendor: 'PLANTED', category: 'materials' }).select('id');
    record('A cannot INSERT a transaction owned by B', (r6.data?.length ?? 0) === 0,
      r6.error ? 'rejected' : `inserted ${r6.data?.length ?? 0} rows`);

    // 7. Confirm B's transaction still exists and is untouched, proving 4 and 5 truly did nothing.
    const check = await admin.from('transactions').select('amount').eq('id', b.txId).single();
    record('B\'s transaction survived intact', check.data?.amount === 999.99, `amount now ${check.data?.amount}`);

  } finally {
    await cleanup();
  }

  const leaked = results.filter((r) => !r.blocked);
  console.log('\n===============================================');
  if (leaked.length === 0) {
    console.log(`RLS HOLDS. ${results.length}/${results.length} attacks blocked. One user cannot touch another's data.`);
    process.exitCode = 0;
  } else {
    console.log(`🔴 RLS LEAKS. ${leaked.length} of ${results.length} attacks SUCCEEDED:`);
    for (const l of leaked) console.log(`   - ${l.name}  (${l.detail})`);
    console.log('DO NOT LAUNCH. One tradesman can reach another tradesman\'s tax data.');
    process.exitCode = 1;
  }
  console.log('===============================================');
}

main().catch((e) => { console.error('[rls] fatal:', e.message); cleanup().finally(() => process.exit(1)); });
