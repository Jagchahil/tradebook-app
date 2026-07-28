// Tests for lib/elections.ts, THE USE OF HOME ELECTION.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS.
//
//   1. THE BAND BOUNDARIES ARE HMRC'S, EXACTLY. 24 hours claims nothing, 25 claims the first band,
//      50 is still the first band, 51 moves up. An off by one here is a man claiming the wrong
//      figure on a return he is legally responsible for.
//   2. NOT ONE RATE IS WRITTEN DOWN IN THE FILE. Every pound comes from lib/taxengine.ts, which
//      khoji/diff.mjs checks against GOV.UK every night. A rate copied into a second file is a rate
//      that goes stale silently, which is how the mileage decoy happened.
//   3. REALISED IS NOT PROJECTED. useOfHomeToDate is months that have actually happened.
//      useOfHomeFullYear is twelve. They are separate functions so a caller must choose by name.
//   4. THE LEDGER ADDS IT, IT DOES NOT MOVE IT. Mileage had to be MOVED off expenses or it would be
//      counted twice. Use of home is the opposite case and subtracting it would UNDERSTATE him.
//      Both directions are asserted here, against the real lib/ledger.ts.
//   5. HOUSE STYLE, and the one sentence he must read: you cannot claim this AND your actual bills.
//
// Run: node test/elections.test.mjs   (Node 22.6+, type stripping). Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'elections-'));

const SRC = readFileSync(path.join(lib, 'elections.ts'), 'utf8');
// Rewrite EVERY relative import to .ts rather than naming them one at a time. Listing them by
// hand meant that adding a single new dependency to a module under test broke this suite with a
// module-not-found rather than a real failure, which is noise that teaches people to ignore red.
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");

writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
// lib/money.ts is staged too: the one money formatter every conversational surface now uses.
writeFileSync(path.join(stage, 'money.ts'), readFileSync(path.join(lib, 'money.ts'), 'utf8'));
writeFileSync(path.join(stage, 'elections.ts'), fix(SRC));
writeFileSync(path.join(stage, 'ledger.ts'), fix(readFileSync(path.join(lib, 'ledger.ts'), 'utf8')));
writeFileSync(path.join(stage, 'housestyle.ts'), readFileSync(path.join(lib, 'housestyle.ts'), 'utf8'));

const X = await import(pathToFileURL(path.join(stage, 'elections.ts')).href);
const E = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const L = await import(pathToFileURL(path.join(stage, 'ledger.ts')).href);
const H = await import(pathToFileURL(path.join(stage, 'housestyle.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE BAND BOUNDARIES ARE HMRC\'S, TO THE HOUR');

ok('0 hours claims nothing', X.bandForHours(0) === null);
ok('24 hours claims nothing, it is under the threshold', X.bandForHours(24) === null);
ok('24.99 hours still claims nothing', X.bandForHours(24.99) === null);
ok('25 hours is the first band', X.bandForHours(25) === 25);
ok('50 hours is STILL the first band', X.bandForHours(50) === 25);
ok('51 hours moves up', X.bandForHours(51) === 51);
ok('100 hours is still the middle band', X.bandForHours(100) === 51);
ok('101 hours is the top band', X.bandForHours(101) === 101);
ok('400 hours is still the top band, never off the end', X.bandForHours(400) === 101);
ok('a negative is refused, not floored into a band', X.bandForHours(-30) === null);
ok('NaN is refused', X.bandForHours(Number.NaN) === null);
ok('Infinity is refused, not treated as the top band', X.bandForHours(Number.POSITIVE_INFINITY) === null);

ok('isHoursBand accepts the three real bands', [25, 51, 101].every(X.isHoursBand));
ok('isHoursBand refuses a plausible looking wrong one', !X.isHoursBand(50) && !X.isHoursBand(100) && !X.isHoursBand(0));
ok('isHoursBand refuses a string', !X.isHoursBand('25'));
ok('isHoursBand refuses null and undefined', !X.isHoursBand(null) && !X.isHoursBand(undefined));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. NOT ONE RATE IS WRITTEN DOWN IN THIS FILE');

// The rates must come from lib/taxengine.ts, which is watched nightly against GOV.UK. A rate copied
// into a second file is a rate that goes stale in silence: exactly how the live mileage page came to
// say 45p while the engine said 55p.
const code = SRC.replace(/^\s*\/\/.*$/gm, '');
ok('the source quotes no pound amount', !/£\s*\d/.test(code));
ok('the source hardcodes none of the three rates', ![E.FACTS.homeFlatRate25to50, E.FACTS.homeFlatRate51to100, E.FACTS.homeFlatRate101plus]
  .some((r) => new RegExp(`\\b${r}\\b`).test(code)));
ok('the only numbers in the source are the hour boundaries and small maths', (() => {
  const nums = [...code.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((m) => Number(m[0]));
  // 50 and 100 are the upper edges of the first two bands and appear in the labels he reads.
  const allowed = new Set([0, 1, 2, 12, 25, 50, 51, 100, 101]);
  return nums.every((n) => allowed.has(n));
})());
ok('it imports the rates from the engine', /from '\.\/taxengine'/.test(SRC));

ok('the three rates are in ascending order', X.ratesAreOrdered() === true);
ok('band 25 pays the 25 to 50 rate', X.bandOptions().find((b) => b.band === 25).monthly === E.FACTS.homeFlatRate25to50);
ok('band 51 pays the 51 to 100 rate', X.bandOptions().find((b) => b.band === 51).monthly === E.FACTS.homeFlatRate51to100);
ok('band 101 pays the 101 plus rate', X.bandOptions().find((b) => b.band === 101).monthly === E.FACTS.homeFlatRate101plus);
ok('every band option carries a readable label', X.bandOptions().every((b) => b.label.length > 10));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. REALISED IS NOT PROJECTED');

const m25 = E.FACTS.homeFlatRate25to50;
ok('six months accrues six months', X.useOfHomeToDate(25, 6) === m25 * 6);
ok('zero months accrues nothing', X.useOfHomeToDate(25, 0) === 0);
ok('a part month does not accrue', X.useOfHomeToDate(25, 5.9) === m25 * 5);
ok('a thirteenth month cannot be invented', X.useOfHomeToDate(25, 13) === m25 * 12);
ok('a negative month count accrues nothing', X.useOfHomeToDate(25, -3) === 0);
ok('a NaN month count accrues nothing', X.useOfHomeToDate(25, Number.NaN) === 0);
ok('the full year is twelve months', X.useOfHomeFullYear(25) === m25 * 12);
ok('the full year is the top band at the top band', X.useOfHomeFullYear(101) === E.FACTS.homeFlatRate101plus * 12);
ok('realised and projected differ in April', X.useOfHomeToDate(25, 1) !== X.useOfHomeFullYear(25));
ok('realised equals projected only at twelve months', X.useOfHomeToDate(25, 12) === X.useOfHomeFullYear(25));
ok('the top band is worth more than the bottom over a year', X.useOfHomeFullYear(101) > X.useOfHomeFullYear(25));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. THE LEDGER ADDS IT. It does NOT move it off expenses.');

// 🔴 THE INVARIANT THAT IS THE OPPOSITE OF MILEAGE'S, AND THE WHOLE REASON THIS SECTION EXISTS.
//
// Mileage is already inside `expenses` as an ordinary confirmed transaction, so /api/ledger
// SUBTRACTS it before passing it separately, or it would be counted twice and overstate what Lekhio
// saved him. Use of home is not inside expenses and cannot be: lib/categories.ts refuses to create a
// home category precisely so a man's own household bills can never be swept into his books. So it is
// additive, and subtracting it would understate him by the same amount.
//
// Both directions are asserted against the real ledger, so a future refactor that "makes them
// consistent" has to break a test that explains why they are not.
const baseInput = {
  monthsElapsed: 6, grossIncome: 40000, expenses: 8000, mileage: 0,
  homeOffice: 0, capitalAllowances: 0, pension: 0, cisSuffered: 0,
};
const withoutHome = L.ledger(baseInput);
const home6 = X.useOfHomeToDate(25, 6);
const withHome = L.ledger({ ...baseInput, homeOffice: home6 });

ok('electing use of home increases the deductions', (() => {
  const a = withoutHome.lines.reduce((n, l) => n + l.deducted, 0);
  const b = withHome.lines.reduce((n, l) => n + l.deducted, 0);
  return b === a + Math.round(home6);
})());
ok('electing use of home lowers the tax he owes', withHome.withLekhio < withoutHome.withLekhio);
ok('electing use of home raises what Lekhio saved him', withHome.saved > withoutHome.saved);
ok('the baseline does not move, it never depends on his deductions', withHome.withoutLekhio === withoutHome.withoutLekhio);
ok('it gets its own line, by name', !!withHome.lines.find((l) => l.key === 'home_office'));
ok('the line is labelled in plain words', withHome.lines.find((l) => l.key === 'home_office').label === 'Use of home');
ok('the line carries the amount elected', withHome.lines.find((l) => l.key === 'home_office').deducted === Math.round(home6));
ok('the expenses line is untouched, nothing was moved off it', (() => {
  const a = withoutHome.lines.find((l) => l.key === 'expenses').deducted;
  const b = withHome.lines.find((l) => l.key === 'expenses').deducted;
  return a === b && a === 8000;
})());

// The attribution still sums to the exact total. The ledger splits one exact figure by share rather
// than adding independently computed per line savings, and a new line must not break that.
ok('the per line savings still sum to the exact total', (() => {
  const sum = withHome.lines.reduce((n, l) => n + l.saved, 0);
  return Math.abs(sum - withHome.saved) <= withHome.lines.length; // rounding, at most 1p per line
})());
ok('no line ever claims more saving than the total', withHome.lines.every((l) => l.saved <= withHome.saved));
ok('a zero election renders no line at all, never an empty row', !withoutHome.lines.find((l) => l.key === 'home_office'));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. WHAT WE SAY BACK');

const conf = X.electionConfirmation(25, 6);
ok('the confirmation states what was done, not a question', !conf.includes('?'));
ok('the confirmation names the monthly rate', conf.includes(`£${Math.round(m25)}`));
ok('the confirmation names the band in hours', conf.includes('25 to 50 hours a month'));
ok('the confirmation says there are no receipts to keep', /no receipts/i.test(conf));
ok('🔴 the confirmation says he cannot also claim his actual bills', /cannot have both/i.test(conf) && /actual home bills/i.test(conf));
ok('a month zero confirmation does not claim a figure it has not earned', (() => {
  const c = X.electionConfirmation(25, 0);
  return c.includes('starts building') && !/off your profit so far/.test(c);
})());
ok('every band produces a confirmation', X.HOURS_BANDS.every((b) => X.electionConfirmation(b, 3).length > 60));

ok('no forbidden dash in any confirmation', X.HOURS_BANDS.every((b) => [0, 3, 12].every((m) => !H.hasForbiddenDash(X.electionConfirmation(b, m)))));
ok('no forbidden dash in any band label', X.HOURS_BANDS.every((b) => !H.hasForbiddenDash(X.bandLabel(b))));
ok('the source file contains no em dash or en dash', !/[–—]/.test(SRC));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. STRUCTURAL');

// THE POINT OF THIS ASSERTION IS PURITY, NOT A HEADCOUNT.
//
// It used to demand exactly one import, './taxengine'. That was a proxy for the thing that actually
// matters: this module must never reach for I/O, a clock, a database or a network, so it can be
// reasoned about and swept by a test. On 28 July it started importing './money', the one money
// formatter, which is just as pure and is the whole reason "£-33" cannot reach a screen any more.
//
// A count is a brittle way to say "pure". An allowlist says it directly, and it still fails loudly
// the day somebody imports supabase or whatsapp in here.
ok('the module imports nothing but pure helpers', (() => {
  const PURE = new Set(['./taxengine', './money', './housestyle']);
  const imports = [...SRC.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  return imports.length > 0 && imports.every((i) => PURE.has(i));
})());
ok('...and reaches for nothing that touches the outside world', (() => {
  const imports = [...SRC.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  return !imports.some((i) => /supabase|whatsapp|claude|stripe|email|fetch/i.test(i));
})());
ok('an election is tied to ONE tax year, never rolled forward silently', /startYear/.test(SRC) && /it forward silently/i.test(SRC));
ok('nothing special category can be near this, it is hours and a year', !/health|disab|circumstance|specialCategory/i.test(code));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;
