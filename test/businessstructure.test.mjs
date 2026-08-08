// AN UNSET BUSINESS STRUCTURE MUST NOT LOOK LIKE AN ANSWERED ONE.
//
//   node test/businessstructure.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT. getBusinessProfile read a null users.business_type as 'sole_trader', in two places,
// and then threw away the fact that it had done so. Nothing on the object it returned could tell
// a caller whether the man had said "sole trader" or had never been asked.
//
// For a genuine sole trader the default is free and has always been right. For a LIMITED COMPANY
// DIRECTOR whose structure never saved it is not: he is charged income tax and Class 4 National
// Insurance personally on profit that belongs to his company, and MTD mandation arithmetic runs
// that should not run at all. isCompany is the FIRST condition on the lender document and on the
// tax summary, so a profile that lies sends every one of those correct branches down the wrong arm.
// It is the hardest kind of fault for him to spot, because it looks like a big tax bill rather
// than like a bug.
//
// WHAT WAS FIXED, AND WHAT DELIBERATELY WAS NOT. businessType still coerces, byte for byte, and
// this suite pins that it does. Turning null into a hard failure, or widening the union to a
// fourth state, would make twenty five call sites in files other lanes own take a branch nobody
// has written, and a screen that refuses to render is worse for a real sole trader than a default
// that has always been right for him. So the default stays and structureRecorded now carries the
// truth beside it: false means nobody ever told us.
//
// This suite is the ratchet on the part that matters: the flag must be FALSE for every shape of
// "we were never told", TRUE only for a value the product actually writes, and it must answer the
// same way on BOTH read paths, because two copies of one judgement drifting apart is the fault
// this file already carries elsewhere.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

const stage = mkdtempSync(path.join(tmpdir(), 'bizstructure-'));
const fixTs = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (f.endsWith('.ts')) {
    writeFileSync(path.join(stage, f), fixTs(readFileSync(path.join(root, 'lib', f), 'utf8')));
  }
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

let pass = 0, fail = 0;
const ok = (desc, cond) => {
  if (cond) { pass++; process.stdout.write(`  ok   ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL ${desc}\n`); }
};

const USER_ID = '11111111-2222-3333-4444-555555555555';
const realFetch = globalThis.fetch;

// The CURRENT read: one query, which selects income_shape and succeeds.
async function readCurrent(row) {
  globalThis.fetch = async () => new Response(JSON.stringify([row]), { status: 200 });
  try { return await SB.getBusinessProfile(USER_ID); } finally { globalThis.fetch = realFetch; }
}

// The LEGACY fallback, which is the second coercion site. It runs only when the first read fails,
// so the stub 400s anything asking for income_shape, exactly as a database without the migration
// would. reads is returned so the test can prove the fallback actually ran rather than assume it.
async function readLegacy(row) {
  let reads = 0;
  globalThis.fetch = async (url) => {
    reads += 1;
    if (String(url).includes('income_shape')) return new Response('{"code":"42703"}', { status: 400 });
    return new Response(JSON.stringify([row]), { status: 200 });
  };
  try {
    const profile = await SB.getBusinessProfile(USER_ID);
    return { profile, reads };
  } finally { globalThis.fetch = realFetch; }
}

console.log('\nAn unset structure is reported as unset, on both read paths.\n');

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SHAPES OF "WE WERE NEVER TOLD". Null is the common one, but a column that a failed or
//    half written migration left blank, or that some other writer filled with a value this
//    product does not use, is the same thing: not an answer. Treating 'ltd' as an answer would be
//    the same silent assumption wearing a different coat.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const NOT_AN_ANSWER = [
  ['null, the column was never written', null],
  ['an empty string', ''],
  ['whitespace', '   '],
  ['a value this product never writes', 'ltd'],
  ['a value with the wrong case', 'Sole Trader'],
];
for (const [label, value] of NOT_AN_ANSWER) {
  const row = { business_type: value, partnership_share: null, income_shape: null };
  const cur = await readCurrent(row);
  ok(`current read: ${label} reports structureRecorded false`, cur.structureRecorded === false);
  // 🔴 AND THE DEFAULT IS UNCHANGED. This is the half of the fix that protects the launch: every
  // existing caller sees exactly the value it saw before, so nothing takes a new branch today.
  ok(`current read: ${label} still defaults businessType to sole_trader`, cur.businessType === 'sole_trader');

  const { profile: leg, reads } = await readLegacy(row);
  ok(`legacy read: ${label} actually went through the fallback`, reads === 2);
  ok(`legacy read: ${label} reports structureRecorded false`, leg.structureRecorded === false);
  ok(`legacy read: ${label} still defaults businessType to sole_trader`, leg.businessType === 'sole_trader');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A REAL ANSWER IS REPORTED AS ONE. All three, because a flag that is false for everybody is
//    just as useless as one that is true for everybody, and would be just as green.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('');
for (const value of ['sole_trader', 'limited_company', 'partnership']) {
  const row = { business_type: value, partnership_share: null, income_shape: null };
  const cur = await readCurrent(row);
  ok(`current read: ${value} reports structureRecorded true`, cur.structureRecorded === true);
  ok(`current read: ${value} is carried through as itself`, cur.businessType === value);

  const { profile: leg } = await readLegacy(row);
  ok(`legacy read: ${value} reports structureRecorded true`, leg.structureRecorded === true);
  ok(`legacy read: ${value} is carried through as itself`, leg.businessType === value);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. 🔴 THE ONE THAT COSTS HIM MONEY, STATED ON ITS OWN. A director whose structure did save is
//    indistinguishable, on businessType alone, from a director whose structure did not. The flag
//    is the ONLY thing that separates them, so it is asserted as a difference and not as a value.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('');
{
  const director = await readCurrent({ business_type: 'limited_company', partnership_share: null, income_shape: null });
  const unsaved = await readCurrent({ business_type: null, partnership_share: null, income_shape: null });
  ok('a saved company and an unsaved profile are now distinguishable',
    director.structureRecorded !== unsaved.structureRecorded);
  ok('and the unsaved one is still handed the sole trader default it was always handed',
    unsaved.businessType === 'sole_trader' && director.businessType === 'limited_company');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE JUDGEMENT LIVES IN ONE FUNCTION, called by both reads. Two copies of it is how the two
//    data rights doors in this same file drifted apart, and it is the reason the manifest exists.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('');
{
  ok('isRecordedBusinessType is exported so both reads and any caller share one answer',
    typeof SB.isRecordedBusinessType === 'function');
  ok('it accepts exactly the three values the product writes',
    SB.isRecordedBusinessType('sole_trader') && SB.isRecordedBusinessType('limited_company')
    && SB.isRecordedBusinessType('partnership'));
  ok('and nothing else, including undefined and a non string',
    !SB.isRecordedBusinessType(null) && !SB.isRecordedBusinessType(undefined)
    && !SB.isRecordedBusinessType('') && !SB.isRecordedBusinessType(0) && !SB.isRecordedBusinessType({}));

  const src = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');
  const uses = (src.match(/structureRecorded: isRecordedBusinessType\(/g) || []).length;
  ok('both coercion sites compute the flag with that one function, never their own copy', uses === 2);
  const coercions = (src.match(/\? r\.business_type : 'sole_trader'/g) || []).length;
  ok('and there are still exactly the two coercion sites this suite covers', coercions === 2);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. A FAILED READ IS STILL NULL, NOT A CONFIDENT SOLE TRADER. The honesty this suite is about
//    cuts both ways: "we could not look" and "he never said" are different sentences, and neither
//    of them is "he is a sole trader".
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('');
{
  globalThis.fetch = async () => new Response('{"message":"boom"}', { status: 500 });
  const both = await SB.getBusinessProfile(USER_ID);
  globalThis.fetch = realFetch;
  ok('when both reads fail the profile is null and invents nobody', both === null);

  globalThis.fetch = async () => new Response('[]', { status: 200 });
  const missing = await SB.getBusinessProfile(USER_ID);
  globalThis.fetch = realFetch;
  ok('a user with no row at all is null, not a defaulted sole trader', missing === null);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
