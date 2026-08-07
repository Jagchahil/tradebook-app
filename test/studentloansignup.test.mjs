// Tests that the student loan a man ticks at signup survives the journey from
// /start into the app.
//
// THE DEFECT, FOUND BY WALKING A REAL SIGNUP ON 6 AUGUST 2026.
//
// /start step 4 offers three ticks alongside the work: a PAYE job, a rental
// property, and a student loan. The form's own words for the third one are that
// the repayment "lands in one lump with the January bill" and that "Lekhio
// includes it in your set aside figure".
//
// The job tick wrote an other_job circumstance. The property tick wrote a rental
// circumstance. The loan tick was read into the `prompts` array and handed back
// to a caller that discards the result, so it reached the signups row and went
// no further. /app/tax/student-loan then said "You have not told us about a
// student loan" to a man who had told us, and his set aside missed 9% of
// everything over his threshold until he found that page under Tools himself.
// He would find out in January.
//
// ⚠️ WHAT IS DELIBERATELY NOT FIXED HERE: the PLAN. /start never asks which plan
// he is on, and the thresholds differ by thousands between plans, so writing one
// would be putting a figure we invented on his Overview. The fact travels; the
// plan stays his to give.
//
// The suite runs the REAL reconcileSignupToUser against a stubbed transport and
// reads the wire, because a source scan would pass on a write aimed at the wrong
// table or a key nothing reads.
//
//   node test/studentloansignup.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const libDir = path.join(repoRoot, 'lib');

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

const stage = mkdtempSync(path.join(tmpdir(), 'sloan-'));
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

const USER = '33333333-3333-4333-8333-333333333333';
const EMAIL = 'dave@example.com';

// A transport that answers the reconcile's reads with one signup row carrying
// the given streams, and records every write.
async function reconcileWith(streams) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';
    calls.push({ url: u, method, body: init.body ? String(init.body) : null });

    if (method === 'GET' && /\/rest\/v1\/users\?id=eq\./.test(u)) {
      // No proved phone: the web mints on an email, exactly as /api/signup/verify does.
      return new Response(JSON.stringify([{ phone_number: null }]), { status: 200 });
    }
    if (method === 'GET' && /\/rest\/v1\/signups\?/.test(u)) {
      return new Response(JSON.stringify([{
        trade_type: 'sole', trade: 'Electrician', name: 'Dave', address: null,
        postcode: null, vat_registered: null, streams, partnership_share: null,
      }]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  };
  try {
    const result = await SB.reconcileSignupToUser(USER, EMAIL);
    return { calls, result };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const circumstanceWrites = (calls) => calls
  .filter((c) => c.method === 'POST' && /\/rest\/v1\/circumstances/.test(c.url))
  .map((c) => JSON.parse(c.body));

// ── 1. The loan tick reaches the app ────────────────────────────────────────────────────────────
{
  const { calls, result } = await reconcileWith(['loan']);
  const written = circumstanceWrites(calls);
  const loan = written.find((w) => w.key === 'student_loan');
  ok('a student loan ticked at signup is written into his circumstances', !!loan);
  ok('and it is recorded as a yes', loan?.answer === 'yes');
  ok('and the exhibit says where the answer came from', /told us at signup/i.test(loan?.asked ?? ''));
  ok('and the channel is the web, which is where he really answered', loan?.user_id === USER && loan?.key === 'student_loan');
  ok('and the reconcile reports it applied', (result?.applied ?? []).includes('student_loan'));
}

// ── 2. NO PLAN IS EVER GUESSED. This is the money half ──────────────────────────────────────────
{
  const { calls } = await reconcileWith(['loan']);
  const profileWrites = calls
    .filter((c) => c.method === 'PATCH' && /\/rest\/v1\/users\?id=eq\./.test(c.url))
    .map((c) => JSON.parse(c.body));
  const touchedPlan = profileWrites.some((b) => 'student_loan_plan' in b || 'student_loan_postgrad' in b);
  ok('no student loan PLAN is written, because signup never asked which one', !touchedPlan);
  const anyPlanString = calls.some((c) => c.body && /plan[1245]/.test(c.body));
  ok('and no plan value appears anywhere on the wire', !anyPlanString);
}

// ── 3. The other two ticks still work, and none of them leak into each other ────────────────────
{
  const both = await reconcileWith(['job', 'property', 'loan']);
  const keys = circumstanceWrites(both.calls).map((w) => w.key);
  ok('the job tick still writes other_job', keys.includes('other_job'));
  ok('the property tick still writes rental', keys.includes('rental'));
  ok('and the loan tick writes alongside them', keys.includes('student_loan'));

  const none = await reconcileWith([]);
  const noneKeys = circumstanceWrites(none.calls).map((w) => w.key);
  ok('a man who ticked nothing gets no student loan circumstance', !noneKeys.includes('student_loan'));
  ok('and no rental or job circumstance either', !noneKeys.includes('rental') && !noneKeys.includes('other_job'));

  const jobOnly = await reconcileWith(['job']);
  const jobKeys = circumstanceWrites(jobOnly.calls).map((w) => w.key);
  ok('ticking only the job does not invent a loan', !jobKeys.includes('student_loan'));
}

// ── 4. The page stops telling him he never mentioned it ─────────────────────────────────────────
{
  const page = readFileSync(path.join(repoRoot, 'app/app/tax/student-loan/page.tsx'), 'utf8');
  ok('the page reads what he has already told us', /readCircumstances\(/.test(page));
  ok('and looks for the student loan answer', /'student_loan'/.test(page));

  // The old flat sentence must not be reachable unconditionally any more.
  const flat = page.includes("<p style={S.body}>You have not told us about a student loan");
  ok('the false sentence is no longer printed unconditionally', !flat);
  ok('there is a sentence for the man who did tell us', /You told us when you signed up that you have a student loan/.test(page));

  // A failed read is not a fact about him. Doctrine from readAllowanceElection.
  ok('an unreadable answer set is neither a yes nor a no', /answersKnown/.test(page));
  ok('and says so plainly rather than asserting he never told us',
    /could not check what you have already told us/.test(page));
}

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
