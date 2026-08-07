// Tests for ensureSignupBridge in lib/supabase.ts, and for the account minting
// path calling it.
//
// THE DEFECT THIS SUITE GUARDS AGAINST, WHICH WAS FOUND BY WALKING A REAL SIGNUP.
//
// A man finished the six questions at /start, typed the six digit code from his
// inbox, and got his account. His answers were never saved, because /start posts
// them to /api/onboard and asks for the code without waiting to see whether the
// post landed. That much was known and accepted: the file said so, and called it
// a nuisance rather than a wall.
//
// It stopped being a nuisance in July. findContactAccount resolves an email to
// an account ONLY through a signups row carrying a user_id, because that link is
// the sole proof the address was ever proved into the account, and resolving
// through the typed phone instead is exactly how the 29 July takeover worked. So
// with no signups row there is no link, and with no link the sign in door never
// sends him a code. It shows him the same neutral screen it shows a stranger, so
// he concludes he mistyped his own address, and every retry does the same thing.
//
// He does not notice tonight: he is holding the session from the signup he just
// finished. He notices the next morning, and nothing he can do gets him back in.
//
// setSignupUserId cannot fix this on its own. It PATCHES rows whose user_id is
// null, and a patch that matches no rows is not an error. So the minting path
// confirms the bridge and lays one down when nobody holds the address.
//
// The suite runs the REAL ensureSignupBridge against a stubbed transport and
// reads the wire, because a source scan would pass on a bridge that is written
// to the wrong table or never written at all.
//
//   node test/signupbridge.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');

// The module reads its url and service key at import time, so they go in first.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const stage = mkdtempSync(path.join(tmpdir(), 'signupbridge-'));
const fix = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(libDir)) {
  if (f.endsWith('.ts')) writeFileSync(path.join(stage, f), fix(readFileSync(path.join(libDir, f), 'utf8')));
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

let pass = 0;
let fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

const ME = '11111111-1111-4111-8111-111111111111';
const SOMEBODY_ELSE = '22222222-2222-4222-8222-222222222222';
const ADDR = 'dave@example.com';

// A transport that answers each request from a script and records every call.
const realFetch = globalThis.fetch;
async function capture(reply, run) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? 'GET', body: init.body ? String(init.body) : null };
    calls.push(call);
    return reply(call);
  };
  try {
    const value = await run();
    return { calls, value };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const okJson = (rows) => new Response(JSON.stringify(rows), { status: 200 });
const posts = (calls) => calls.filter((c) => c.method === 'POST');
const signupWrites = (calls) => posts(calls).filter((c) => /\/rest\/v1\/signups\b/.test(c.url));

// ── 1. NOBODY holds the address: the bridge is laid down ────────────────────────────────────────
{
  const { calls, value } = await capture(
    (c) => (c.method === 'POST' ? new Response('', { status: 201 }) : okJson([])),
    () => SB.ensureSignupBridge(ME, ADDR),
  );
  const write = signupWrites(calls)[0];
  const body = write ? JSON.parse(write.body) : null;
  ok('an address nobody holds gets a bridge row', !!write);
  ok('ensureSignupBridge reports the bridge written', value === true);
  ok('the row carries this account', body?.user_id === ME);
  ok('the row carries the proved address', body?.email === ADDR);
  ok('the row carries no phone, because nothing here proved one', body?.phone === '');
  ok('the row is stamped reconciled, so it cannot eat a later real signup', typeof body?.reconciled_at === 'string');
  ok('exactly one signups row is written', signupWrites(calls).length === 1);
}

// ── 2. The link is already his: nothing is written ──────────────────────────────────────────────
{
  const { calls, value } = await capture(
    () => okJson([{ user_id: ME }]),
    () => SB.ensureSignupBridge(ME, ADDR),
  );
  ok('an address already linked to him writes nothing', signupWrites(calls).length === 0);
  ok('and reports the bridge is there', value === true);
}

// ── 3. SOMEBODY ELSE holds it: refuse, and never move the link ──────────────────────────────────
{
  const { calls, value } = await capture(
    () => okJson([{ user_id: SOMEBODY_ELSE }]),
    () => SB.ensureSignupBridge(ME, ADDR),
  );
  ok('an address another account holds writes nothing', signupWrites(calls).length === 0);
  ok('and no PATCH is issued against the other row either', calls.every((c) => c.method !== 'PATCH'));
  ok('and it reports failure rather than success', value === false);
}

// ── 4. The check could not be read: that is NOT a clean sheet ───────────────────────────────────
{
  const { calls, value } = await capture(
    (c) => (c.method === 'POST' ? new Response('', { status: 201 }) : new Response('', { status: 500 })),
    () => SB.ensureSignupBridge(ME, ADDR),
  );
  ok('an unreadable ownership check writes nothing', signupWrites(calls).length === 0);
  ok('and reports failure, fail closed', value === false);
}

// ── 5. A refused insert is reported, never claimed ──────────────────────────────────────────────
{
  const { value } = await capture(
    (c) => (c.method === 'POST' ? new Response('', { status: 409 }) : okJson([])),
    () => SB.ensureSignupBridge(ME, ADDR),
  );
  ok('an insert the database refuses is reported as failure', value === false);
}

// ── 6. Nothing to work with: no calls at all ────────────────────────────────────────────────────
{
  const a = await capture(() => okJson([]), () => SB.ensureSignupBridge('', ADDR));
  const b = await capture(() => okJson([]), () => SB.ensureSignupBridge(ME, '   '));
  ok('no account id means no calls', a.calls.length === 0 && a.value === false);
  ok('no address means no calls', b.calls.length === 0 && b.value === false);
}

// ── 7. The address is normalised the same way the door reads it ─────────────────────────────────
{
  const { calls } = await capture(
    (c) => (c.method === 'POST' ? new Response('', { status: 201 }) : okJson([])),
    () => SB.ensureSignupBridge(ME, '  Dave@Example.COM '),
  );
  const body = JSON.parse(signupWrites(calls)[0].body);
  ok('the stored address is trimmed and lower cased', body.email === ADDR);
  const lookup = calls.find((c) => c.method === 'GET');
  ok('and the ownership check reads the same normalised address', lookup.url.includes(encodeURIComponent(ADDR)));
}

// ── 8. The minting path calls it, and the door still depends on the link ────────────────────────
{
  const verify = readFileSync(path.join(repoRoot, 'app/api/signup/verify/route.ts'), 'utf8');
  const setAt = verify.indexOf('setSignupUserId(verifiedEmail, userId)');
  const bridgeAt = verify.indexOf('ensureSignupBridge(userId, verifiedEmail)');
  ok('the account minting path calls ensureSignupBridge', bridgeAt > 0);
  ok('and calls it after setSignupUserId, so a patch that landed is left alone', setAt > 0 && bridgeAt > setAt);
  ok('and awaits it', /await ensureSignupBridge\(/.test(verify));

  // WHY the bridge matters, pinned so a future change to the door does not quietly
  // strand this. If findContactAccount stops requiring the link, this pin fails and
  // whoever changed it reads the reasoning above.
  const lib = readFileSync(path.join(libDir, 'supabase.ts'), 'utf8');
  const doorAt = lib.indexOf('export async function findContactAccount');
  const door = lib.slice(doorAt, doorAt + 4000);
  ok('the email sign in door still resolves only through a linked signups row',
    door.includes('user_id=not.is.null'));
}

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
