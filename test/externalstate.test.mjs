// A CLOCK ON EVERY FACT THAT BELONGS TO SOMEBODY ELSE, AND A FENCE ROUND THE TESTS THAT REST ON ONE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DEFECT THIS EXISTS FOR, WHICH HAPPENED FOUR TIMES IN FOUR DAYS. See lib/externalstate.ts
// for the four, named and dated.
//
// The shape every time: a belief about somebody else's decision goes into copy, a test is written
// to hold that copy in place, the world moves, and THE TEST IS NOW THE THING KEEPING THE LIE UP.
// The next person who tries to tell the truth has to delete a passing assertion first, which feels
// like vandalism, so they do not, and the false sentence outlives everyone who could correct it.
//
// A test that pins an optimistic claim is worse than no test at all, because a suite reporting
// green reads as proof. That is not a hypothetical. On 20 August 2026 test/mtdclaims.test.mjs,
// a COMPLIANCE GUARD, was green over a live public page telling strangers we would file their tax
// return, partly because its own section 3 required the page to say the filing was built.
//
// Two duties, and they are different jobs:
//
//   1. THE CLOCK. Every entry in lib/externalstate.ts has a day a human last looked and a shelf
//      life. Past it, this suite goes red and prints where to go and look. The red build IS the
//      product. It is the only mechanism here that makes anybody look again.
//
//   2. THE FENCE. A test may not REQUIRE a phrase that asserts motion or a date about a capability
//      unless it says which entry it rests on, with a "// CONTINGENT: <id>" comment above it. The
//      annotation is not paperwork. It is the thread from a green assertion back to the day
//      somebody checked, so the next reader can see it has gone stale instead of trusting it.
//
// ⚠️ ASSERTING THE ABSENCE OF SUCH A PHRASE IS ALWAYS FINE AND NEEDS NO ANNOTATION. !/soon/ is the
// good kind. This fence is only ever about assertions that DEMAND the claim be present.
//
// ⚠️ THIS SUITE IS DELIBERATELY NOT DETERMINISTIC ACROSS TIME, and that is the one thing about it
// that must never be "fixed". Freezing the date, or reading it from a fixture, turns the clock off
// and leaves a green suite in its place, which is the exact failure it was built to stop.
//
// Run: node test/externalstate.test.mjs   Pure, no network.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WAITING_ON, waitingOn, daysSinceChecked, isStale } from '../lib/externalstate.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(repo, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  ok    ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE REGISTER IS WELL FORMED');

ok(`there is a register, and it is not empty (${WAITING_ON.length} entries)`, WAITING_ON.length >= 3);
ok('every id is unique, so an annotation can only mean one thing',
  new Set(WAITING_ON.map((w) => w.id)).size === WAITING_ON.length);

for (const w of WAITING_ON) {
  // ⚠️ "us" IS A LEGAL ANSWER AND THE SHORTEST TRUE ONE. The first draft demanded more than two
  // characters and failed on reminders-channel, which really is our own decision. Pretending an
  // internal choice belongs to a third party is its own small dishonesty, and a length check is no
  // reason to commit it.
  ok(`${w.id} says whose decision it is`, typeof w.whose === 'string' && w.whose.length >= 2);
  ok(`${w.id} names EVIDENCE somebody actually looked at, not a summary`,
    typeof w.evidence === 'string' && w.evidence.length > 80);
  ok(`${w.id} says where to look again`, typeof w.lookHere === 'string' && w.lookHere.length > 10);
  ok(`${w.id} names the gates that rest on it`, Array.isArray(w.gates) && w.gates.length > 0);
  ok(`${w.id} has a real ISO date`, /^\d{4}-\d{2}-\d{2}$/.test(w.checkedOn));
  // 🔴 A DATE IN THE FUTURE IS THE SIGNATURE OF SOMEBODY CLEARING A RED BUILD RATHER THAN LOOKING.
  ok(`${w.id} was checked in the PAST, not post dated to buy silence`, daysSinceChecked(w) >= 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. 🔴 THE CLOCK. HAS ANYBODY LOOKED LATELY?');

for (const w of WAITING_ON) {
  const age = daysSinceChecked(w);
  const stale = isStale(w);
  ok(`${w.id}: last looked at ${age} days ago, shelf life ${w.recheckAfterDays}`
    + (stale
      ? `\n     🔴 GO AND LOOK: ${w.lookHere}`
        + `\n     We currently tell customers: ${w.weBelieve}`
        + `\n     Resting on it: ${w.gates.join(', ')}`
        + `\n     If it still holds, update checkedOn (and the evidence) in lib/externalstate.ts.`
        + `\n     IF YOU HAVE NOT LOOKED, LEAVE THIS RED. That is what it is for.`
      : ''),
    !stale);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. EVERY FLAG DECLARES WHOSE DECISION IT WAITS ON');

// A new capability flag is a new promise held back. Adding one without saying who has to move
// before it flips is how a belief gets into the estate with nobody owning the re-check.
const feats = read('lib/features.ts');
const flags = [...feats.matchAll(/^export function ([a-zA-Z]+Live)\(/gm)].map((m) => m[1]);
ok(`lib/features.ts still exposes its flags where this can read them (${flags.length})`, flags.length >= 3);
const covered = new Set(WAITING_ON.flatMap((w) => w.gates));
for (const f of flags) {
  ok(`${f}() is named as a gate by some entry in the register`, covered.has(f));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. 🔴 THE FENCE. NO TEST MAY DEMAND A DATE CLAIM WITHOUT SAYING WHOSE IT IS');

// Phrases that assert MOTION or a DATE about a capability. Not a style list: every one of these
// says, in customer facing prose, that something is on its way.
const CONTINGENT = /\b(in progress|is built|rather than a build|in flight|switching on|on the way|coming soon|very soon|shortly|is coming|are coming|will land|not yet switched on)\b/i;

// ⚠️ CODE SHAPED LITERALS ARE NOT CLAIMS. An assertion that the SOON chip renderer still exists is
// about plumbing, and plumbing is allowed: 'soon' has to stay renderable for the day something
// genuinely does have a date. What is fenced is prose a customer could read.
// 🔴 NOT "contains a brace". The first draft used /\{/ and immediately misfiled the real thing:
// /permission[\s\S]{0,40}rather than a build/ is a regex QUANTIFIER, not JSX, and the guard waved
// through one of the four assertions it was written for. Match JSX and JS syntax, nothing else.
const CODE_SHAPED = /<span|className|=>|===|type Cell|\breturn <|\bfunction /;

const suites = readdirSync(path.join(repo, 'test')).filter((f) => f.endsWith('.mjs')).sort();
const unfenced = [];
for (const f of suites) {
  if (f === 'externalstate.test.mjs') continue; // this file quotes the phrases in order to forbid them
  const lines = read(`test/${f}`).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/\bok\(/.test(lines[i])) continue;
    // ⚠️ A COMMENT QUOTING A BANNED ASSERTION MUST NOT TRIP THE RULE. test/llmstxt.test.mjs carries
    // the old false sentence in a comment block explaining why it was removed, which is exactly the
    // documentation we want people writing, and the first run of this fence reported it as a live
    // defect. test/mtdclaims.test.mjs and test/domain.test.mjs were both caught by this same trap
    // before it. Strip comments first, or the fence punishes the person who wrote down the lesson.
    if (/^\s*(\/\/|\*)/.test(lines[i])) continue;
    const stmt = lines.slice(i, i + 6)
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join(' ');
    if (/!\s*\//.test(stmt)) continue; // asserting ABSENCE is the good kind
    const lits = [...stmt.matchAll(/\/((?:[^/\\\n]|\\.)+)\/[gimsuy]*\.test\(/g)].map((m) => m[1])
      .concat([...stmt.matchAll(/\.includes\('([^']+)'\)/g)].map((m) => m[1]));
    // ⚠️ AND AN ASSERTION THAT DEMANDS A PROHIBITION IS THE OPPOSITE OF THE DEFECT.
    // test/predict.test.mjs requires the AI prompt to contain "do NOT tell him it is coming on a
    // particular date". That literal carries a contingency phrase because it is QUOTING the thing
    // it forbids, and firing on it would punish the best guard in the estate. Note the marker list
    // is deliberately narrow: a bare "not" would also excuse "bank feed is built but NOT yet
    // switched on", which is a claim, and is one of the four this fence exists to catch.
    const PROHIBITION = /\b(do not|never|must not|cannot|may not|forbid|refuse)\b/i;
    const claim = lits.find((l) => CONTINGENT.test(l) && !CODE_SHAPED.test(l) && !PROHIBITION.test(l));
    if (!claim) continue;
    // The annotation may sit anywhere in the six lines above the assertion.
    const near = lines.slice(Math.max(0, i - 6), i + 1).join('\n');
    const tag = near.match(/CONTINGENT:\s*([a-z0-9-]+)/i);
    if (tag && waitingOn(tag[1])) continue;
    unfenced.push(`${f}:${i + 1}  ${tag ? `unknown id "${tag[1]}"` : 'no CONTINGENT annotation'}\n       ${claim.slice(0, 96)}`);
  }
}
ok(`no suite demands a date claim without naming the entry it rests on`
  + (unfenced.length ? `\n     ${unfenced.join('\n     ')}` : ''), unfenced.length === 0);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. 🔴 AND THE GUARD ITSELF STILL BITES');

// A compliance guard that cannot fail is worse than none, because it reads as proof. These prove
// each of the three mechanisms still catches the thing it was built for.
const specimen = {
  id: 'specimen', whose: 'x', weBelieve: 'y', evidence: 'z', lookHere: 'w',
  checkedOn: '2026-01-01', recheckAfterDays: 10, gates: ['g'],
};
ok('the clock CATCHES a fact nobody has looked at since January',
  isStale(specimen, new Date(Date.UTC(2026, 7, 20))));
ok('...and FORGIVES one checked yesterday',
  !isStale({ ...specimen, checkedOn: '2026-08-19' }, new Date(Date.UTC(2026, 7, 20))));
ok('the clock counts whole days, so a morning check and an evening build agree',
  daysSinceChecked({ ...specimen, checkedOn: '2026-08-19' }, new Date(Date.UTC(2026, 7, 20))) === 1);

// The four real assertions that started this, as they were actually written. Every one must be
// recognised as a claim that needs an entry behind it.
const THE_FOUR = [
  'filing itself is built',
  'permission[\\s\\S]{0,40}rather than a build',
  "filingMark is STILL 'soon', because HMRC recognition genuinely is in flight",
  'bank feed is built but not yet switched on',
];
for (const line of THE_FOUR) {
  ok(`🔴 the fence recognises what shipped: "${line.slice(0, 46)}..."`,
    CONTINGENT.test(line) && !CODE_SHAPED.test(line));
}
// And it lets the plumbing through, or it becomes ceremony people route around.
ok('the fence FORGIVES an assertion about the SOON renderer, which is machinery not a claim',
  CODE_SHAPED.test('if \\(v === \'soon\'\\) return <span className="mk soon">SOON<\\/span>;'));
ok('an unknown CONTINGENT id is not a way through',
  waitingOn('made-up-id') === undefined);

// 🔴 THE PROHIBITION EXCUSE IS THE WIDEST DOOR IN THIS FENCE, so it is proved from both sides.
const PROHIBITION_PROBE = /\b(do not|never|must not|cannot|may not|forbid|refuse)\b/i;
ok('a required PROHIBITION is forgiven, because forbidding a date claim is the good kind',
  PROHIBITION_PROBE.test('do NOT tell him it is coming on a particular date'));
ok('🔴 ...and it does NOT excuse a claim that merely contains the word not',
  !PROHIBITION_PROBE.test('bank feed is built but not yet switched on')
  && CONTINGENT.test('bank feed is built but not yet switched on'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
