// PROVE the free trial actually exists, against PRODUCTION, end to end.
//
//   node scripts/trial-probe.mjs            print what it will do, do nothing
//   node scripts/trial-probe.mjs --run      create a probe user, take the trial, attack it, delete everything
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS
//
// The app had a button that said "Start free trial". It called router.replace('/(tabs)') and
// nothing else. Fourteen days free, no card needed, printed on the screen and advertised on the
// website, and NOTHING IN THE SYSTEM CREATED A TRIAL. Every new user would have tapped it and been
// shown "This account is not active" on the very next screen.
//
// Six audits read that file. The button looked fine. It IS fine, as a button.
//
// So this does not read anything. It signs in as a real user against the real API and asks the
// real database what happened. Twenty-four unit tests already pin lib/entitlement.ts, and they
// would all still have passed on the day the trial did not exist, because a pure function cannot
// tell you that nobody calls it.
//
// WHAT IT PROVES, IN ORDER
//
//   1. THE BUTTON. A new user taps "Start free trial" (POST /api/billing/trial) and a trial exists.
//   2. It is fourteen days. The number on the screen is the number in the database.
//   3. It is ONE trial. Asking three times, the way a double tap or a retry on a bad signal would,
//      does not hand out three. (This is the unique index earning its place.)
//   4. THE TRIAL EXPIRES. We push his end date into the past and confirm the server flips him to
//      entitled:false. This is the bug the old gate had: it read the status and never the date, so
//      a trial, once granted, would have run forever.
//   5. A man with a history gets nothing free. His trial has ended: asking again gets him nothing.
//   6. THE BACKSTOP. A SECOND user who NEVER taps the button, and only ever reads his status, still
//      gets his fortnight.
//
// ⚠️ WHY THERE ARE TWO USERS, AND WHY THE FIRST VERSION OF THIS SCRIPT WAS QUIETLY WRONG.
//
// The first run of this probe opened by asserting "a brand new user has no subscription", by
// calling GET /api/billing/status. It failed, reporting status=trialing on a user who had never
// asked for anything. That is not a bug: the status route grants the trial as a BACKSTOP, on
// purpose, so that a man whose POST died on a bad signal is not paywalled after we promised him a
// fortnight. The assertion was written as though status were a pure read. It is not.
//
// But it hid something worth proving. Because status had already granted the trial, the very next
// assertion, "tapping the button creates a trial", PASSED WITHOUT THE BUTTON DOING ANYTHING AT ALL.
// A green test that would have stayed green if POST /api/billing/trial returned nothing but an
// empty body. The order of the calls was doing the work, and the test was taking the credit.
//
// So: user A taps the button and never reads his status first. User B only reads his status and
// never taps anything. Each path is now proved alone, by a user who used only that path.
//
// SAFETY. Only ever creates and deletes accounts whose email starts with trial-probe-, on phone
// numbers in the +44 7700 900xxx range Ofcom reserves for testing, which can never belong to a
// real person. Cleans up in a finally. Re-running deletes any leftovers first.

import { createClient } from '@supabase/supabase-js';

const RUN = process.argv.includes('--run');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = process.env.PROBE_SITE_URL || 'https://lekhio.app';

const missing = [
  ['NEXT_PUBLIC_SUPABASE_URL', URL],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON],
  ['SUPABASE_SERVICE_ROLE_KEY', SERVICE],
].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`[trial] fatal: missing env: ${missing.join(', ')}. Load the production .env first.`);
  process.exit(1);
}

const PREFIX = 'trial-probe-';
const stamp = Date.now();
// Ofcom reserves +44 7700 900xxx for drama and testing. It is never allocated to a real person.
// A: taps the button, and never reads his status first.
// B: never taps anything, and only reads his status.
const A = { email: `${PREFIX}a-${stamp}@lekhio.app`, password: `Tt1!${stamp}tt`, phone: `+4477009${String(stamp).slice(-5)}` };
const B = { email: `${PREFIX}b-${stamp}@lekhio.app`, password: `Bb2!${stamp}bb`, phone: `+4477009${String(stamp + 7).slice(-5)}` };

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const results = [];
const check = (name, passed, detail) => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS ✓' : 'FAIL ✗'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const DAY = 24 * 3600 * 1000;

async function api(path, token, method = 'GET') {
  const res = await fetch(`${SITE}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function rows(phone) {
  const { data } = await admin.from('subscriptions').select('*').eq('phone', phone);
  return data ?? [];
}

async function makeUser(u) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: u.email, password: u.password, email_confirm: true,
  });
  if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
  const id = created.user.id;
  const ins = await admin.from('users').insert({ id, name: u.email, phone_number: u.phone, is_active: true });
  if (ins.error) throw new Error(`insert users row for ${u.email}: ${ins.error.message}`);
  const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const s = await anon.auth.signInWithPassword({ email: u.email, password: u.password });
  if (s.error) throw new Error(`signin ${u.email}: ${s.error.message}`);
  return { id, token: s.data.session.access_token };
}

async function cleanup() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const probes = (data?.users ?? []).filter((u) => (u.email || '').startsWith(PREFIX));
  for (const u of probes) {
    const { data: row } = await admin.from('users').select('phone_number').eq('id', u.id).single();
    if (row?.phone_number) await admin.from('subscriptions').delete().eq('phone', row.phone_number);
    await admin.from('transactions').delete().eq('user_id', u.id);
    await admin.from('users').delete().eq('id', u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
  for (const p of [A.phone, B.phone]) await admin.from('subscriptions').delete().eq('phone', p);
  if (probes.length) console.log(`\n[trial] cleaned up ${probes.length} probe account(s). Nothing left behind.`);
}

async function main() {
  if (!RUN) {
    console.log(`[trial] DRY. Would create TWO ${PREFIX} users in PRODUCTION.`);
    console.log(`[trial] A taps the button (POST ${SITE}/api/billing/trial) and never reads his status.`);
    console.log('[trial] B never taps anything and only reads his status, to prove the backstop.');
    console.log('[trial] Then: 14 days, one trial only, it EXPIRES, no second helping. Then delete everything.');
    console.log('[trial] Re-run with --run to actually do it.');
    return;
  }

  await cleanup(); // any leftovers from a half-finished run
  console.log(`[trial] creating two probe users and asking ${SITE} for a trial...\n`);

  try {
    // =========================================================================================
    // USER A: HE TAPS THE BUTTON. He never calls /status first, so nothing but the button itself
    // can possibly be what creates his trial. (In the first version of this script, status was
    // called first, granted the trial as a backstop, and the button assertion passed on its
    // coat-tails. It would have stayed green with an empty POST handler.)
    // =========================================================================================
    const a = await makeUser(A);

    check('BEFORE the button, the database holds no subscription for him', (await rows(A.phone)).length === 0);

    const grant = await api('/api/billing/trial', a.token, 'POST');
    check('tapping "Start free trial" ACTUALLY creates a trial  <-- the thing that did not exist',
      grant.body.status === 'trialing', `status=${grant.body.status}`);
    check('and the server says he is entitled', grant.body.entitled === true, `entitled=${grant.body.entitled}`);
    check('the trial is really in the database, not just in the reply', (await rows(A.phone)).length === 1);

    // Fourteen days. The number on the screen is the number in the database.
    const end = grant.body.current_period_end ? new Date(grant.body.current_period_end) : null;
    const days = end ? Math.round((end.getTime() - Date.now()) / DAY) : -1;
    check('the trial is 14 days, exactly as the screen promises', days === 14, `${days} days`);

    // ONE trial. A double tap, or a retry on a bad signal, must not hand out three.
    await api('/api/billing/trial', a.token, 'POST');
    await api('/api/billing/trial', a.token, 'POST');
    check('asking three times gives him ONE trial, not three', (await rows(A.phone)).length === 1);

    // THE TRIAL EXPIRES. The bug the old gate had: it read the status, never the date.
    const upd = await admin.from('subscriptions')
      .update({ current_period_end: new Date(Date.now() - 1 * DAY).toISOString() })
      .eq('phone', A.phone);
    if (upd.error) throw new Error(`expire the trial: ${upd.error.message}`);

    const expired = await api('/api/billing/status', a.token);
    check('AN EXPIRED TRIAL LOCKS. (The old gate said "trialing", so it let him in forever.)',
      expired.body.entitled === false, `entitled=${expired.body.entitled}, status=${expired.body.status}`);

    // A man with a history gets nothing free. No farming a second fortnight.
    const relapse = await api('/api/billing/trial', a.token, 'POST');
    check('a user whose trial has ended cannot take another one',
      (await rows(A.phone)).length === 1 && relapse.body.entitled === false,
      `entitled=${relapse.body.entitled}`);

    // =========================================================================================
    // USER B: HE NEVER TAPS ANYTHING. He only ever reads his status, which is what happens if the
    // POST dies on a bad signal, or if he force-quits the app on the welcome screen and comes back
    // tomorrow. He was promised a fortnight. He must have one.
    // =========================================================================================
    const b = await makeUser(B);

    const backstop = await api('/api/billing/status', b.token);
    check('THE BACKSTOP: a man who never taps the button still gets his fortnight',
      backstop.body.status === 'trialing' && backstop.body.entitled === true,
      `status=${backstop.body.status}, entitled=${backstop.body.entitled}`);
    check('and reading his status ten times still leaves him exactly one trial',
      await (async () => {
        for (let i = 0; i < 9; i++) await api('/api/billing/status', b.token);
        return (await rows(B.phone)).length === 1;
      })());

  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n===============================================');
  if (failed.length === 0) {
    console.log(`THE TRIAL IS REAL. ${results.length}/${results.length} passed. A man who taps the button gets`);
    console.log('fourteen days, exactly one of them, and it ends when it says it ends. A man who never');
    console.log('taps it gets his fortnight anyway.');
    process.exitCode = 0;
  } else {
    console.log(`🔴 ${failed.length} of ${results.length} FAILED:`);
    for (const f of failed) console.log(`   - ${f.name}`);
    console.log('DO NOT SWITCH THE PAYWALL ON. The button is still a promise we do not keep.');
    process.exitCode = 1;
  }
  console.log('===============================================');
}

main().catch((e) => { console.error('[trial] fatal:', e.message); cleanup().finally(() => process.exit(1)); });
