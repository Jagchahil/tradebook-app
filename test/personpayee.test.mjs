// R2-F6. THREE HOUSEHOLDS BECAME ONE ASKING GROUP, AND THE PRODUCT OFFERED TO LEARN A RULE ABOUT
// ALL THREE AT ONCE.
// Run with: node test/personpayee.test.mjs   (Node 22.6+, pure type stripping)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Rosa's three wedding customers shared one vendor key. She answered once, which was right, because
// the answer happened to be the same for all three. The next one will not be.
//
// 🔴 AND lib/memory.ts ALREADY WROTE DOWN WHY THIS IS THE WORSE FAILURE, in its own words:
//
//   "a COLLISION (two different merchants share a key) writes the wrong category into someone's
//    books, silently, and they have no reason to doubt it. So we fail towards missing."
//
// That reasoning is right, and the design it produced defends well against SHOP against SHOP. It
// has no defence against PERSON against PERSON, where surnames collide constantly and the one part
// that tells two people apart is deliberately discarded by a line reading "a stray single letter is
// debris from a stripped reference, never a name". On a UK statement, "M OKAFOR" is exactly what a
// person looks like.
//
// ⚠️ THE KEY IS NOT CHANGED, AND THAT IS THE POINT. vendor_rules.vendor_key IS that normalisation,
// so changing it orphans every rule every customer has ever taught this product. The collision is
// tolerable. Turning a collision into a RULE is not.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'ppay-'));
for (const f of ['personal', 'receiptconfidence', 'reviewpile', 'capital', 'taxengine', 'money', 'propertylanes', 'memory']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const P = await import(pathToFileURL(path.join(stage, 'personal.ts')).href);
const R = await import(pathToFileURL(path.join(stage, 'reviewpile.ts')).href);
const M = await import(pathToFileURL(path.join(stage, 'memory.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error(`  FAIL ${name}`); } };
const person = (v) => P.looksLikePerson(v);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('A. The collision is real, and this suite proves it rather than assuming it');
// ════════════════════════════════════════════════════════════════════════════════════════
{
  // 🔴 THE ACTUAL MECHANISM, DEMONSTRATED. Two different people, one key.
  const a = M.normaliseVendor('FP CREDIT M OKAFOR WEDDING');
  const b = M.normaliseVendor('FP CREDIT J OKAFOR WEDDING');
  ok('🔴 two different households normalise to the SAME vendor key', a === b && a.length > 0);
  ok('and the initial, which is the only thing telling them apart, is gone', !a.includes('m') || !a.includes('j') || a === b);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('B. Who is a person');
// ════════════════════════════════════════════════════════════════════════════════════════

ok('initial and surname, the standard bank payee shape', person('M OKAFOR') === true);
ok('surname and initial, the other way round', person('OKAFOR M') === true);
ok('a title', person('MR J SMITH') === true);
ok('mrs with just a surname', person('MRS OKAFOR') === true);
ok('two initials and a surname', person('L J WYATT') === true);

console.log('C. 🔴 Who is NOT, which is the half that must not break anything');

ok('🔴 a wholesaler', person('PORTERS WHOLESALE FLOWERS') === false);
ok('🔴 a limited company', person('SUMUP PAYOUTS LTD') === false);
ok('a utility', person('EDF ENERGY DD') === false);
ok('a waste contractor', person('BIFFA WASTE SERVICES') === false);
ok('a letting agent', person('CITYLETS PROPERTY MGMT FEE') === false);
ok('a lender', person('HALIFAX BTL MORTGAGE DD') === false);
ok('a landlord company', person('SO BLOOM PROPERTIES LTD SHOP RENT') === false);
ok('a supermarket', person('TESCO STORES') === false);
// A company word anywhere refuses, even beside a person shaped name.
ok('🔴 a company word beside a name still refuses', person('J SMITH PLUMBING SERVICES') === false);
// Anything with a digit is a reference, not a name.
ok('a store number is not a name', person('SCREWFIX 1234') === false);
ok('a card reference is not a name', person('M OKAFOR 4429') === false);
// Plain single words and long strings are not claimed either way.
ok('one bare word is not claimed', person('OKAFOR') === false);
// 🔴 A SHORT SECOND WORD IS NOT A SURNAME. Without a minimum length, "B&Q" normalises to "b q" and
// reads as an initial beside a surname called "q". The sabotage pass caught this: the suite had no
// input that exercised the length rule at all.
ok('🔴 B&Q is a shop, not a Mr Q', person('B&Q') === false);
ok('🔴 nor is O2 a person', person('O2') === false);
ok('an initial beside a three letter word is not claimed', person('J FOX') === false);
ok('a long line is not claimed', person('DIRECT DEBIT PAYMENT TO SOME LONG THING HERE') === false);
ok('empty', person('') === false);
ok('null', person(null) === false);
ok('undefined', person(undefined) === false);

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('D. It reaches the group, and the group still groups');
// ════════════════════════════════════════════════════════════════════════════════════════

const entry = (id, vendor, amount, extra = {}) => ({
  id, vendor, amount, category: 'income', looks_personal: false, source_type: 'bank_feed', ...extra,
});
const cat = () => 'income';
{
  const groups = R.buildPile([
    entry('a', 'FP CREDIT M OKAFOR WEDDING', 380),
    entry('b', 'FP CREDIT J OKAFOR WEDDING', 420),
  ], M.normaliseVendor, [], cat);
  ok('🔴 they still GROUP, because one press for two payments is the kindness', groups.length === 1);
  ok('🔴 and the group knows the payee is a person', groups[0].personLike === true);
  ok('both rows are in it', groups[0].count === 2);
}
{
  const groups = R.buildPile([
    entry('a', 'PORTERS WHOLESALE FLOWERS', -324.69),
    entry('b', 'PORTERS WHOLESALE FLOWERS', -81.43),
  ], M.normaliseVendor, [], cat);
  ok('a shop is not marked as a person', groups[0].personLike === false);
}

// ════════════════════════════════════════════════════════════════════════════════════════
console.log('E. 🔴 And the RULE is what stops, not the filing');
// ════════════════════════════════════════════════════════════════════════════════════════

const routeSrc = read('app/api/pile/route.ts');
const pageSrc = read('app/app/pile/page.tsx');
const pileSrc = read('lib/reviewpile.ts');

// ⚠️ THE CALL, not the import. Anchored on the guard in the call itself.
ok('🔴 no rule is learned about a person',
  /if \(item\.key && !item\.personLike\) await learnVendor\(/.test(routeSrc));
ok('the plan carries the flag, so the caller can decide', /personLike: g\.personLike,/.test(pileSrc));
ok('and the plan type declares it', /ids: string\[\]; personLike: boolean/.test(pileSrc));

// The filing itself must be untouched: he still gets his one press.
const loopAt = routeSrc.indexOf('for (const item of plan)');
const planLoop = routeSrc.slice(loopAt, routeSrc.indexOf('if (form)', loopAt));
ok('🔴 the press still files every row, person or not', /applied \+= await confirmPile\(user\.id, item\.ids, item\.category\);/.test(planLoop));
ok('and nothing skips the confirm itself', !/personLike[\s\S]{0,40}confirmPile/.test(planLoop));

// The screen must not promise what the code no longer does.
ok('the promise is conditional on a shop being there', /groups\.some\(\(g\) => !g\.personLike\)/.test(pageSrc));
ok('and a person is named as the exception, in his words', /paid by a person rather than a shop/.test(pageSrc));
ok('🔴 saying plainly that nothing is learned', /learn nothing: the next one is somebody else/.test(pageSrc));

// 🔴 THE KEY MUST NOT HAVE MOVED. Changing it orphans every rule every customer has taught.
ok('🔴 normaliseVendor still takes two words', /return words\.slice\(0, 2\)\.join\(' '\);/.test(read('lib/memory.ts')));
ok('🔴 and still strips single letters, deliberately unchanged',
  /\.filter\(\(w\) => w\.length > 1\)/.test(read('lib/memory.ts')));

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
