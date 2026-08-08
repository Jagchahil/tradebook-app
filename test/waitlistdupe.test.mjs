// A SECOND TAP ON JOIN MUST NOT TELL A MAN HE FAILED, AND MUST NOT EMAIL HIM TWICE.
//
//   node test/waitlistdupe.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT. supabase/APPLY_2026-08-08_waitlist_unique.sql put a unique index on waitlist.email,
// which was right: two rows meant two "You are on the Lekhio list" emails. But nothing on the write
// path was told. PostgREST answered the second insert 409, insertWaitlistSignup threw, and
// /api/waitlist returned 500 with "Could not save. Please try again."
//
// He IS on the list. He is told he is not. So he taps again, and gets the same sentence, and the
// proof that it worked is an email he may never have been sent. The one thing a waitlist has to do
// is tell a man he is on it.
//
// ⚠️ AND THE FIX HAS A TRAP IN IT, WHICH IS THE REAL REASON THIS SUITE EXISTS.
//
// Until now the duplicate welcome email was prevented by the FAILURE: the throw short circuited
// the handler before it reached the send. Make the 409 succeed without also gating the send and
// the man who tapped twice gets a second copy of the same email, which is half of the exact fault
// the unique index was added to stop, coming back in through the front door. So this suite asserts
// the two halves together, always, because either one alone reads as fixed.
//
// It also pins the shape of the fix. `?on_conflict=email` is the obvious move and it does not work
// here: the index is on lower(trim(email)), Postgres infers a conflict target by matching the
// index's own expression, (email) does not match it, and the insert would raise 42P10 instead. The
// `on_conflict` parameter takes bare column names and cannot spell lower(trim(email)), so that fix
// would only swap a 500 for a 400 while reading as correct in review.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';
// The welcome email is dormant without a Resend key, and a dormant sender would make the "sent
// twice" assertion below pass for the wrong reason. Set so the send path is really exercised.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-resend-key';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'Lekhio <invoices@lekhio.app>';

let pass = 0, fail = 0;
const ok = (desc, cond) => {
  if (cond) { pass++; process.stdout.write(`  ok   ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL ${desc}\n`); }
};

// ── stage lib/, plus the real route, with node_modules reachable so next/server resolves ───────
const fixTs = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
const stage = mkdtempSync(path.join(tmpdir(), 'waitlistdupe-'));
let routeImportable = true;
try { symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'dir'); }
catch { routeImportable = false; }
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (f.endsWith('.ts')) {
    writeFileSync(path.join(stage, f), fixTs(readFileSync(path.join(root, 'lib', f), 'utf8')));
  }
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

// next's after() refuses to run outside a request scope, which this harness is not, so it is the
// ONE thing swapped for a stub. The stub keeps the semantics that matter here: the callback runs,
// and it runs after the response is built. What is under test is the CONDITION guarding the send,
// not next's scheduler, and section 3 below asserts on the source that the send is still deferred
// through after() rather than moved inline where it would slow the signup down.
writeFileSync(
  path.join(stage, 'afterstub.ts'),
  'export function after(fn: () => unknown): void { void Promise.resolve().then(fn); }\n',
);

// The REAL handler otherwise, with only its import specifiers rewritten so node can resolve them
// from the staging directory. Not a copy of its logic: the point is to drive the code that ships.
const rawRouteSrc = readFileSync(path.join(root, 'app/api/waitlist/route.ts'), 'utf8');
const routeSrc = rawRouteSrc
  .replace(
    "import { NextRequest, NextResponse, after } from 'next/server';",
    "import { NextRequest, NextResponse } from 'next/server.js';\nimport { after } from './afterstub.ts';",
  )
  .replace("'../../../lib/supabase'", "'./supabase.ts'")
  .replace("'../../../lib/ratelimit'", "'./ratelimit.ts'")
  .replace("'../../../lib/email'", "'./email.ts'");
writeFileSync(path.join(stage, 'waitlistroute.ts'), routeSrc);
let ROUTE = null;
try { ROUTE = await import(pathToFileURL(path.join(stage, 'waitlistroute.ts')).href); }
catch { routeImportable = false; }

const realFetch = globalThis.fetch;

// A transport that answers the waitlist insert however the test asks, counts welcome emails, and
// records everything, so the assertions read the wire rather than trusting a return value.
function makeFetch(insertStatus, insertBody) {
  const calls = [];
  let welcomeEmails = 0;
  const stub = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET', body: init.body ? String(init.body) : null });
    if (u.includes('/rest/v1/waitlist')) return new Response(insertBody, { status: insertStatus });
    if (u.includes('resend.com')) { welcomeEmails += 1; return new Response('{"id":"e1"}', { status: 200 }); }
    return new Response('[]', { status: 200 });
  };
  return { stub, calls, emails: () => welcomeEmails };
}

const DUPLICATE =
  '{"code":"23505","message":"duplicate key value violates unique constraint \\"waitlist_email_unique_idx\\""}';

async function post(insertStatus, insertBody, ip) {
  const f = makeFetch(insertStatus, insertBody);
  globalThis.fetch = f.stub;
  try {
    const req = new Request('https://lekhio.app/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ phone: '07700900123', email: 'dave@example.test' }),
    });
    const res = await ROUTE.POST(req);
    const body = await res.json();
    // The welcome email is queued with next's after(), which runs outside the handler. Give the
    // microtask queue a turn so a send that WAS scheduled is counted rather than missed.
    await new Promise((r) => setTimeout(r, 0));
    return { status: res.status, body, emails: f.emails(), calls: f.calls };
  } finally { globalThis.fetch = realFetch; }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE LIBRARY. A 409 is an outcome, not an exception.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe insert reports what happened instead of throwing on a duplicate.\n');
{
  const f = makeFetch(409, DUPLICATE);
  globalThis.fetch = f.stub;
  let outcome = null, threw = null;
  try { outcome = await SB.insertWaitlistSignup({ phone: '07700900123', email: 'dave@example.test' }); }
  catch (e) { threw = e; }
  globalThis.fetch = realFetch;
  ok('🔴 a duplicate address does not throw', threw === null);
  ok('and it says so, rather than pretending a row was written', outcome === 'already_listed');
}
{
  const f = makeFetch(201, '');
  globalThis.fetch = f.stub;
  const outcome = await SB.insertWaitlistSignup({ phone: '07700900123', email: 'dave@example.test' });
  globalThis.fetch = realFetch;
  ok('a first submit still reports a real insert', outcome === 'inserted');
}
// ⚠️ ONLY the 409 is forgiven. A dropped database, a refusal, a bad gateway are all still real
// failures, and a man whose signup genuinely did not save must still be told so.
for (const status of [400, 401, 403, 500, 502, 503]) {
  const f = makeFetch(status, '{"message":"boom"}');
  globalThis.fetch = f.stub;
  let threw = null;
  try { await SB.insertWaitlistSignup({ phone: '07700900123', email: 'dave@example.test' }); }
  catch (e) { threw = e; }
  globalThis.fetch = realFetch;
  ok(`a ${status} is still a real failure and still throws`, threw !== null);
}
{
  // The thrown message must never carry what he typed. It is written to the server log.
  const f = makeFetch(500, '{"message":"boom","details":"dave@example.test"}');
  globalThis.fetch = f.stub;
  let msg = '';
  try { await SB.insertWaitlistSignup({ phone: '07700900123', email: 'dave@example.test' }); }
  catch (e) { msg = e.message; }
  globalThis.fetch = realFetch;
  ok('the failure message carries neither his address nor his number',
    !msg.includes('dave@example.test') && !msg.includes('7700900123'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE SHAPE OF THE FIX. on_conflict cannot work against an expression index, so it must not be
//    what is written here, however plausible it looks in a diff.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe fix is not the one that only looks right.\n');
{
  const src = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');
  const fn = src.slice(src.indexOf('export async function insertWaitlistSignup'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 1);
  // Comment lines are stripped first. The trap is written up at length inside this function, and a
  // check that could not tell the warning from the mistake would fail on the explanation itself.
  const code = body.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  ok('the insert does not use on_conflict, which the lower(trim(email)) index cannot match',
    !code.includes('on_conflict'));
  ok('and the trap is written down where the next person will edit it', body.includes('on_conflict'));
  ok('it reads the status code instead', code.includes('res.status === 409'));

  // The route half. after() is stubbed above, so the fact that the send is still DEFERRED (rather
  // than moved inline where it would make the man wait on Resend) is asserted on the shipped
  // source, and so is the condition that stops the second email.
  const routeCode = rawRouteSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  ok('the route still defers the welcome email with after(), so a signup never waits on email',
    /after\(async \(\) => \{/.test(routeCode));
  ok("🔴 and the send is gated on a real insert, which is the only thing stopping the second email",
    /if \(email && outcome === 'inserted'\)/.test(routeCode));
  ok('the duplicate is no longer answered with a 500',
    !/return NextResponse\.json\(\{ error: 'Could not save[^]*?\n\s*\}\n\s*\/\/ A warm/.test(routeCode));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE ROUTE, DRIVEN FOR REAL. Both halves together, because either alone reads as fixed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe front door, driven for real.\n');
if (!routeImportable || !ROUTE) {
  // A partial checkout with no node_modules cannot import next/server. Reported honestly rather
  // than passed, so an environment that cannot run this half never reads as a green one.
  ok('SKIPPED: next/server is not importable in this checkout, route half not run', false);
} else {
  const first = await post(201, '', '203.0.113.10');
  ok('a first submit is accepted', first.status === 200 && first.body.ok === true);
  ok('and the welcome email goes out exactly once', first.emails === 1);

  const second = await post(409, DUPLICATE, '203.0.113.11');
  ok('🔴 a second submit tells him he is on the list, not that he failed',
    second.status === 200 && second.body.ok === true);
  ok('🔴 and does NOT send him the same welcome email a second time', second.emails === 0);
  ok('nothing about the duplicate is written to the log as his address',
    second.calls.every((c) => !String(c.url).includes('dave@example.test')));

  const broken = await post(500, '{"message":"boom"}', '203.0.113.12');
  ok('a genuine save failure is still a 500, so he is never told a lie the other way',
    broken.status === 500 && typeof broken.body.error === 'string');
  ok('and no welcome email goes out for a signup that did not save', broken.emails === 0);

  // A man who gave no address cannot be emailed, and the duplicate path must not change that.
  const f = makeFetch(409, DUPLICATE);
  globalThis.fetch = f.stub;
  const res = await ROUTE.POST(new Request('https://lekhio.app/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.13' },
    body: JSON.stringify({ phone: '07700900124' }),
  }));
  const body = await res.json();
  await new Promise((r) => setTimeout(r, 0));
  globalThis.fetch = realFetch;
  ok('a phone only signup is still accepted', res.status === 200 && body.ok === true);
  ok('and no email is attempted for a man who gave no address', f.emails() === 0);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
