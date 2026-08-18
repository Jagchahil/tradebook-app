// SABOTAGE THE THIRD PARTY GATE'S EAR. B23, 17 AUGUST 2026.
//
//   node test/sabotage-b23gateear.mjs
//
// B22 hoisted the gate above the deadline lane on all three routers. That does nothing whatever
// for a sentence the gate cannot HEAR, and on production, signed in, "how much national insurance
// does jerome pay" came back "National Insurance this tax year: £303.24 Class 4 on your profit so
// far." Word for word the answer to his own question, about a man who is not him.
//
// TWO WIDENINGS AND A STOPLIST REPAIR, AND EVERY ONE OF THEM IS SABOTAGED IN BOTH DIRECTIONS.
// A matcher has two ways to be wrong and only one of them is the one you were looking for:
//
//   DEAFER   it stops hearing a third party, which is the defect coming back
//   GREEDIER it starts refusing a man asking about his own money, which costs him his answer
//
// The second is the one a "make it hear more" packet writes by accident, so the greedy direction
// gets as many sabotages here as the deaf one.
//
// FOUR suites hold this and this pass runs all four:
//   test/laneparity.test.mjs  section 9d, the four corpora and the derived order walk
//   test/run3fixes.test.mjs   the named person matcher and its own false positive set
//   test/thread.test.mjs      the chat surface actually running its chain
//   test/waintents.test.mjs   the predicate's own unit tests

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

// ⚠️ supabase/ IS ONE OF THE DIRECTORIES THE SUITES READ. A tree without it does not FAIL them, it
// CRASHES them, so every sabotage scores as caught and every control as broken. That cost a whole
// first run of the B18 pass and the rule is written into the backlog.
function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b23-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'supabase']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

const SUITES = [
  'test/laneparity.test.mjs',
  'test/run3fixes.test.mjs',
  'test/thread.test.mjs',
  'test/waintents.test.mjs',
];
function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\./.test(out)) return true;
      if (!/\d+ passed, 0 failed\./.test(out)) return true;
    } catch { return true; }
  }
  return false;
}

// 🔴 THE BASELINE, ADDED 18 AUGUST 2026 BECAUSE THIS PASS IS BEING TOUCHED, WHICH IS EXACTLY THE
// RULE test/sabotage-b19savings.mjs WROTE DOWN: a pass that cannot prove an unmodified tree green
// scores nothing. A sabotage pass measures a DIFFERENCE and has no way of knowing whether the red
// it sees came from the sabotage or from a harness that reds on everything. It costs one tree.
function baseline() {
  const t = scratch();
  const red = runSuite(t.dir);
  rmSync(t.base, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory these suites READ is copied by scratch() (supabase/ is one)');
    console.log('   2. every suite tally line matches the regex in runSuite (ledger.test.mjs has no full stop)');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};

const W = 'lib/waintents.ts';
// 🔴 REPAIRED 18 AUGUST 2026, AND THE REPAIR IS A RULE RATHER THAN A STRING. This constant, the
// "rent and rentals go" sabotage below and the "widened with pension" control ALL quoted this
// list's CLOSING BRACKET, and B19's savings packet appended |savings?|saving to it hours later.
// All three died at once: two sabotages that could not be applied and a control that could not be
// applied either, and the pass went on reporting 18/20 and 6/7 with nobody able to see why from
// the tally alone. Found by the full loop on the Mac, which is the only thing that can see it.
//
// ⚠️ THE LESSON IS NOT "FIX THE STRING". AN ANCHOR THAT QUOTES THE EDGE OF A LIST BREAKS EVERY
// TIME THE LIST GROWS, AND THIS LIST IS DESIGNED TO GROW: B23's own rule is that the gate gains
// the nouns of every lane that gets wired, and two lanes have been wired since. All three anchors
// below now quote the INTERIOR of the list, which an append cannot touch.
const NOUNS = '|national insurance|ni|class ?[24]|student loan|propert(?:y|ies)|rentals?|rent';
const RUN = "(?:(?!of\\b|from\\b|to\\b|in\\b|on\\b|for\\b|with\\b|off\\b|out\\b|at\\b|by\\b|as\\b)[a-z0-9'\\u2019-]+\\s+){0,5}?";

const SABOTAGES = [
  // ── DEAF: THE POSSESSIVE NOUNS GO, ONE AT A TIME. Each is a noun 9d walks by name. ────────
  {
    name: '🔴 the whole B23 noun list goes, which is the state the finding was written about',
    apply: ({ dir }) => edit(dir, W, NOUNS, ''),
  },
  {
    name: '🔴 "student loan" goes, so "whats jerome\'s student loan" reads HIS threshold out loud again',
    apply: ({ dir }) => edit(dir, W, '|student loan|propert', '|propert'),
  },
  {
    name: '🔴 "propert(y|ies)" goes, so two of the nine come back',
    apply: ({ dir }) => edit(dir, W, '|propert(?:y|ies)|rentals?', '|rentals?'),
  },
  {
    name: '🔴 "national insurance" goes, which is the noun in the production transcript',
    apply: ({ dir }) => edit(dir, W, '|national insurance|ni|', '|'),
  },
  {
    name: '🔴 "ni" goes on its own, the abbreviation a man on a ladder actually types',
    apply: ({ dir }) => edit(dir, W, 'national insurance|ni|class', 'national insurance|class'),
  },
  {
    name: '🔴 "class 2 and class 4" goes, so the two questions HMRC actually names fall through',
    apply: ({ dir }) => edit(dir, W, '|class ?[24]|student loan', '|student loan'),
  },
  {
    name: '🔴 "rent" and "rentals" go, so a landlord asking about another landlord is answered from his own rows',
    apply: ({ dir }) => edit(dir, W, '|rentals?|rent', ''),
  },

  // ── DEAF: THE OBJECT NOUN RUN. Three of the six live here. ────────────────────────────────
  {
    name: '🔴 the object noun run goes entirely, which is the exact state before this packet',
    apply: ({ dir }) => edit(dir, W, `\\bhow much ${RUN}(?:has|have`, '\\bhow much (?:has|have'),
  },
  {
    name: '🔴 the run is capped at ZERO words, which reads as present and behaves as absent',
    apply: ({ dir }) => edit(dir, W, '){0,5}?(?:has|have', '){0,0}?(?:has|have'),
  },

  // ── GREEDY: THE DIRECTION A "HEAR MORE" PACKET BREAKS BY ACCIDENT. ────────────────────────
  {
    name: '🔴 GREEDY: the run stops refusing prepositions, so "how much OF MY INCOME does the taxman take" is refused',
    apply: ({ dir }) => edit(dir, W, RUN, "(?:[a-z'\\u2019-]+\\s+){0,3}?"),
  },
  {
    name: '🔴 GREEDY: only "of" is let through the preposition guard, which is the half fix that reads as a fix',
    apply: ({ dir }) => edit(dir, W, '(?!of\\b|from\\b', '(?!from\\b'),
  },
  {
    name: '🔴 the run is cut back to the three words the item guessed, so a long object noun falls through',
    apply: ({ dir }) => edit(dir, W, '){0,5}?(?:has|have', '){0,3}?(?:has|have'),
  },
  {
    name: '🔴 digits leave the run, so "how much income tax and class 4 does jerome pay" can never match',
    apply: ({ dir }) => edit(dir, W, "[a-z0-9'\\u2019-]+\\s+){0,5}?", "[a-z'\\u2019-]+\\s+){0,5}?"),
  },
  {
    name: '🔴 GREEDY: the apostrophe is made optional, so every plural noun becomes a named person',
    apply: ({ dir }) => edit(dir, W, "(?:'s|\\u2019s)\\s+(?:books", "(?:'s|\\u2019s|s)\\s+(?:books"),
  },

  // ── THE STOPLIST, IN BOTH DIRECTIONS. ────────────────────────────────────────────────────
  {
    name: '🔴 GREEDY: the plural strip goes, so "how much rent do the tenants pay" refuses a landlord his own income',
    apply: ({ dir }) => edit(dir, W,
      "    if (word.endsWith('s') && NOT_A_PERSON.has(word.slice(0, -1))) continue;\n", ''),
  },
  {
    name: '🔴 GREEDY: "tenant" leaves the stoplist, so "how much is the tenant\'s rent" is refused',
    apply: ({ dir }) => edit(dir, W, "  'tenant', 'landlord',\n", ''),
  },
  {
    name: '🔴 DEAF: the plural strip is turned on a REAL name, so a partner whose name ends in s is discussable',
    apply: ({ dir }) => edit(dir, W,
      "  'tenant', 'landlord',", "  'tenant', 'landlord', 'jerome', 'priya',"),
  },

  // ── AND THE GATE ITSELF, because a widened ear behind a deleted gate is nothing at all. ───
  {
    name: '🔴 the named person branch goes, so the whole ear is bypassed however wide it is',
    apply: ({ dir }) => edit(dir, W, '  if (named) return true;\n', ''),
  },
  {
    name: '🔴 the possessive pattern is dropped from the pair the matcher walks',
    apply: ({ dir }) => edit(dir, W,
      '  for (const re of [NAMED_PERSON_VERB_RE, NAMED_PERSON_POSSESSIVE_RE]) {',
      '  for (const re of [NAMED_PERSON_VERB_RE]) {'),
  },
  {
    name: '🔴 the verb pattern is dropped from the pair the matcher walks',
    apply: ({ dir }) => edit(dir, W,
      '  for (const re of [NAMED_PERSON_VERB_RE, NAMED_PERSON_POSSESSIVE_RE]) {',
      '  for (const re of [NAMED_PERSON_POSSESSIVE_RE]) {'),
  },
];

const CONTROLS = [
  {
    name: 'the B23 argument above the patterns is reworded, which changes nothing anybody types',
    apply: ({ dir }) => edit(dir, W,
      '// TWO SHAPES, MEASURED AGAINST THE NINE MISSES WRITTEN DOWN IN THE BACKLOG.',
      '// TWO SHAPES, MEASURED AGAINST THE NINE MISSES SET DOWN IN THE BACKLOG.'),
  },
  {
    name: 'a comment inside section 9d of the parity suite is reworded',
    apply: ({ dir }) => edit(dir, 'test/laneparity.test.mjs',
      '// Word for word the answer to his own question, about a man who is not him, and the second one',
      '// Word for word the answer to his own question, about a man who is not him, and the second of them'),
  },
  {
    name: '⚠️ THE EAR IS WIDENED FURTHER with "pension", which is somebody being MORE careful and must not be frozen',
    // 🔴 THE NEW NOUN IS INSERTED IN THE MIDDLE, NOT APPENDED. Appending is what killed this
    // control when the savings packet appended after it. An interior anchor cannot rot that way.
    apply: ({ dir }) => edit(dir, W, '|turnover|vat|', '|turnover|vat|pension|'),
  },
  {
    name: '⚠️ A ROLE WORD IS ADDED TO THE STOPLIST, which returns an honest question and must not be frozen',
    apply: ({ dir }) => edit(dir, W, "  'tenant', 'landlord',", "  'tenant', 'landlord', 'lodger',"),
  },
  {
    name: '⚠️ THE RUN IS WIDENED TO EIGHT WORDS, which is somebody being MORE careful and must not be frozen',
    apply: ({ dir }) => edit(dir, W, '){0,5}?(?:has|have', '){0,8}?(?:has|have'),
  },
  {
    // ⚠️ THIS WAS DRAFTED AS A SABOTAGE, RAN MISSED, AND WAS MOVED HERE ON THE EVIDENCE. The B19
    // deadline pass wrote the rule down: A NO OP IS A CONTROL, NOT A SABOTAGE. Making the run
    // greedy was measured against all four corpora of section 9d and every number is IDENTICAL,
    // because the run is followed by a required auxiliary and the engine backtracks to the same
    // match either way. So the laziness marker is a preference and not a behaviour, and a guard
    // that went red for it would be pinning a character rather than a promise.
    name: '⚠️ the object noun run is made GREEDY, which is measurably the same match and must not be frozen',
    apply: ({ dir }) => edit(dir, W, '){0,5}?(?:has|have', '){0,5}(?:has|have'),
  },
  {
    name: 'a blank line inside namesAPerson, which changes nothing about what it hears',
    apply: ({ dir }) => edit(dir, W,
      '  return false;\n}\n\nexport function isAboutSomeoneElse(',
      '  return false;\n}\n\n\nexport function isAboutSomeoneElse('),
  },
];

// ⚠️ A SLICE, BECAUSE THE FULL PASS DOES NOT FIT IN A COWORK SHELL CALL. Every call is capped at
// 45 seconds in a fresh sandbox and a detached process does not survive between calls. SAB_FROM and
// SAB_TO are indices into the sabotage list; unset means all of it, which is what CI and the Mac
// run. SAB_SKIP_CONTROLS skips the controls for the same reason.
const FROM = Number(process.env.SAB_FROM ?? 0);
const TO = Number(process.env.SAB_TO ?? SABOTAGES.length);
const RUNNING = SABOTAGES.slice(FROM, TO);
if (RUNNING.length !== SABOTAGES.length) {
  console.log(`SLICE: sabotages ${FROM}..${TO - 1} of ${SABOTAGES.length}. NOT THE WHOLE PASS.`);
}

baseline();

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of RUNNING) {
  const t = scratch();
  try { s.apply(t); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
const RUNNING_C = process.env.SAB_SKIP_CONTROLS ? [] : CONTROLS;
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of RUNNING_C) {
  const t = scratch();
  try { c.apply(t); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${RUNNING.length} sabotages caught, ${cOk}/${RUNNING_C.length} controls green.`);
if (missed > 0 || cBad > 0) process.exit(1);
