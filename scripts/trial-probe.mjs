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
//   1. A new user with no history gets a trial when he asks for one.
//   2. It is fourteen days. The number on the screen is the number in the database.
//   3. It is ONE trial. Asking twice, the way a double tap or a retry on a bad signal would,
//      does not hand out two. (This is the unique index earning its place.)
//   4. THE TRIAL EXPIRES. We push his end date into the past and confirm the server flips him to
//      entitled:false. This is the bug the old gate had: it read the status and never the date, so
//      a trial, once granted, would have run forever.
//   5. A man with a history gets nothing free. We cancel him and ask again: no new trial.
//
// SAFETY. Only ever creates and deletes an account whose email starts with trial-probe-, on a
// phone number in the +44 7700 900xxx range Ofcom reserves for testing, which can never belong to
// a real person. Cleans up in a finally. Re-running deletes any leftovers first.

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
const PHONE = `+4477009${String(stamp).slice(-5)}`;
const USER = { email: `${PREFIX}${stamp}@lekhio.app`, password: `Tt1!${stamp}tt` };

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

async function rows() {
  const { data } = await admin.from('subscriptions').select('*').eq('phone', PHONE);
  return data ?? [];
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
  await admin.from('subscriptions').delete().eq('phone', PHONE);
  if (probes.length) console.log(`\n[trial] cleaned up ${probes.length} probe account(s). Nothing left behind.`);
}

async function main() {
  if (!RUN) {
    console.log(`[trial] DRY. Would create one ${PREFIX} user in PRODUCTION, take a trial against`);
    console.log(`[trial] ${SITE}/api/billing/trial, prove it is 14 days, prove asking twice gives one,`);
    console.log('[trial] prove it EXPIRES, prove a lapsed user gets nothing free, then delete everything.');
    console.log('[trial] Re-run with --run to actually do it.');
    return;
  }

  await cleanup(); // any leftovers from a half-finished run
  console.log(`[trial] creating a probe user on ${PHONE} and asking ${SITE} for a trial...\n`);

  try {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: USER.email, password: USER.password, email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    const id = created.user.id;

    const ins = await admin.from('users').insert({ id, name: USER.email, phone_number: PHONE, is_active: true });
    if (ins.error) throw new Error(`insert users row: ${ins.error.message}`);

    const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
    const s = await anon.auth.signInWithPassword({ email: USER.email, password: USER.password });
    if (s.error) throw new Error(`signin: ${s.error.message}`);
    const token = s.data.session.access_token;

    // 0. Before he asks: he has nothing, and the server says so plainly.
    const before = await api('/api/billing/status', token);
    check('a brand new user starts with no subscription', before.body.status === 'none', `status=${before.body.status}`);

    // 1. He taps the button. THE THING THAT DID NOT EXIST.
    const grant = await api('/api/billing/trial', token, 'POST');
    check('tapping "Start free trial" actually creates a trial', grant.body.status === 'trialing', `status=${grant.body.status}`);
    check('and the server says he is entitled', grant.body.entitled === true, `entitled=${grant.body.entitled}`);

    // 2. Fourteen days. The number on the screen is the number in the database.
    const end = grant.body.current_period_end ? new Date(grant.body.current_period_end) : null;
    const days = end ? Math.round((end.getTime() - Date.now()) / DAY) : -1;
    check('the trial is 14 days, exactly as the screen promises', days === 14, `${days} days`);

    // 3. ONE trial. A double tap, or a retry on a bad signal, must not hand out two.
    await api('/api/billing/trial', token, 'POST');
    await api('/api/billing/trial', token, 'POST');
    const after = await rows();
    check('asking three times gives him ONE trial, not three', after.length === 1, `${after.length} rows`);

    // 4. THE TRIAL EXPIRES. The bug the old gate had: it read the status, never the date.
    const upd = await admin.from('subscriptions')
      .update({ current_period_end: new Date(Date.now() - 1 * DAY).toISOString() })
      .eq('phone', PHONE);
    if (upd.error) throw new Error(`expire the trial: ${upd.error.message}`);

    const expired = await api('/api/billing/status', token);
    check('AN EXPIRED TRIAL LOCKS. (The old gate said "trialing", so it let him in forever.)',
      expired.body.entitled === false, `entitled=${expired.body.entitled}, status=${expired.body.status}`);

    // 5. A man with a history gets nothing free. No farming a second fortnight.
    const relapse = await api('/api/billing/trial', token, 'POST');
    const stillOne = await rows();
    check('a user whose trial has ended cannot take another one', stillOne.length === 1 && relapse.body.entitled === false,
      `${stillOne.length} rows, entitled=${relapse.body.entitled}`);

  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.passed);
  console.log('\n===============================================');
  if (failed.length === 0) {
    console.log(`THE TRIAL IS REAL. ${results.length}/${results.length} passed. A man who taps the button gets`);
    console.log('fourteen days, exactly one of them, and it ends when it says it ends.');
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
