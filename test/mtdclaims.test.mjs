// Tests for WHAT WE ARE ALLOWED TO SAY ABOUT HMRC AND MAKING TAX DIGITAL.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THIS IS A COMPLIANCE GUARD, NOT A STYLE CHECK.
//
// HMRC's own terms permit exactly one phrase for software in their list: "HMRC recognised". Not
// approved, not accredited, not certified, not endorsed, not "in partnership with". Those words
// claim a warranty HMRC has not given, and using one is the sort of thing that ends a production
// application rather than delaying it.
//
// And the deeper rule, from CLAUDE.md and docs/05_COMPLIANCE: we PREPARE, the customer APPROVES.
// HMRC keeps the taxpayer legally responsible at all times. "We file your tax" is not a shortcut
// for "we prepare your return and send it once you have approved it", it is a different claim about
// who carries the liability, and it is not ours to make.
//
// A copy rule that lives only in a doc gets broken by the next person in a hurry. This walks every
// customer facing page and fails the build.
//
// Run: node test/mtdclaims.test.mjs   Pure, no network.

import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const SKIP = new Set(['node_modules', '.next', '.git', 'dist', '_to_delete']);
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = path.join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

// Comments are stripped first. A comment EXPLAINING that we may never write "HMRC approved" must
// not itself trip the rule. That trap is real: test/domain.test.mjs was caught by exactly this,
// when a comment about a forbidden domain spelled the domain out.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = [...walk(path.join(repo, 'app')), ...walk(path.join(repo, 'lib'))];
const rel = (p) => path.relative(repo, p);
// ⚠️ WHITESPACE IS NORMALISED. A phrase that wraps across two lines of JSX is still the phrase, and
// a guard that misses it because of a line break is worse than no guard: it reports clean.
const flat = (s) => s.replace(/\s+/g, ' ');
const sources = files.map((f) => [rel(f), flat(strip(readFileSync(f, 'utf8')))]);

// 🔴 ONE DECLARED EXCEPTION, AND IT HAS TO BE DECLARED BY HAND.
//
// lib/studioagent.ts is the file that FORBIDS these phrases to the copy generator. It necessarily
// quotes them, in a string rather than a comment, so stripping comments does not remove them. It is
// allowlisted here rather than by loosening a pattern, because loosening the pattern would let the
// real thing through everywhere. Anything else that quotes a forbidden phrase has to come here and
// say why, which is the friction working.
const QUOTES_THE_RULES = new Set(['lib/studioagent.ts']);

ok(`there is customer facing source to check (${sources.length} files)`, sources.length > 50);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE WORDS HMRC DOES NOT LET US USE');

// ⚠️ THE CLAIM, NOT THE WORD, AND A LOOKBEHIND IS NOT ENOUGH TO TELL THEM APART.
//
// Our own disclaimer reads "Lekhio is not endorsed by, affiliated with, or approved by HMRC". The
// negation is at the HEAD OF A LIST, so by the time you reach "approved by HMRC" the word "not" is
// six words back and no lookbehind will see it. The first draft of this guard failed the build over
// our own disclaimer, on five pages, which is exactly how a guard gets switched off.
//
// So the test is done at SENTENCE level: find the phrase, then read the sentence it sits in. A
// sentence that negates anywhere in it is a disclaimer. A sentence that does not is a claim.
function claimsIn(text, re) {
  const out = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (!re.test(sentence)) continue;
    if (/\b(not|never|nor|neither|no)\b/i.test(sentence)) continue; // a disclaimer, which is the point
    out.push(sentence.trim().slice(0, 90));
  }
  return out;
}

const FORBIDDEN = [
  { re: /HMRC[\s-]*(approved|accredited|certified|endorsed)/i, why: 'HMRC permits only "HMRC recognised"' },
  { re: /(approved|accredited|certified|endorsed)\s+by\s+HMRC/i, why: 'HMRC permits only "HMRC recognised"' },
  { re: /in\s+partnership\s+with\s+HMRC/i, why: 'we are not in partnership with HMRC' },
  { re: /official\s+HMRC\s+(software|app|partner)/i, why: 'implies an endorsement HMRC has not given' },
];
for (const { re, why } of FORBIDDEN) {
  const hits = sources
    .filter(([f]) => !QUOTES_THE_RULES.has(f))
    .flatMap(([f, s]) => claimsIn(s, re).map((c) => `${f}: ${c}`));
  ok(`nothing says ${re.source.slice(0, 44)}  (${why})${hits.length ? `\n     ${hits.join('\n     ')}` : ''}`, hits.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. WE PREPARE, HE APPROVES. WE NEVER SAY WE FILE IT FOR HIM.');

// ⚠️ Written to catch the CLAIM, not the word "file". "File your tax return" as a page name, or
// "we prepare it and you file it", are both fine and must stay fine, or the guard becomes noise
// somebody switches off.
const FILING_CLAIMS = [
  { re: /\bwe\s+(will\s+)?file\s+(your|his|their)\s+(tax|return|self\s*assessment)/i, why: 'we prepare, he approves' },
  { re: /\bwe\s+(will\s+)?do\s+your\s+tax\b/i, why: 'we prepare, he approves' },
  { re: /\bwe\s+(will\s+)?submit\s+(it\s+)?(to\s+HMRC\s+)?for\s+you\b/i, why: 'he approves before anything is sent' },
  { re: /\bfiled?\s+automatically\b/i, why: 'there is always a human approval step' },
  { re: /\bno\s+need\s+to\s+approve\b/i, why: 'the approval is the product, not a chore' },
];
for (const { re, why } of FILING_CLAIMS) {
  const hits = sources
    .filter(([f]) => !QUOTES_THE_RULES.has(f))
    .flatMap(([f, s]) => claimsIn(s, re).map((c) => `${f}: ${c}`));
  ok(`nothing claims ${re.source.slice(0, 40)}  (${why})${hits.length ? `\n     ${hits.join('\n     ')}` : ''}`, hits.length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. THE MTD PAGE IS HONEST ABOUT WHERE IT HAS GOT TO');

// Flattened for the same reason: this copy is JSX and wraps mid sentence.
const mtd = flat(readFileSync(path.join(repo, 'app/free-mtd-filing/page.tsx'), 'utf8'));
ok('it no longer just says coming soon', !/COMING SOON/i.test(strip(mtd)));
ok('the exception list is not a way to smuggle a claim in', QUOTES_THE_RULES.size === 1);

// 🔴 THE GUARD MUST STILL BITE. A sentence-level negation check could be written so loosely that it
// passes everything, and a compliance test that cannot fail is worse than none because it reads as
// proof. These two prove it still catches a real claim and still forgives a real disclaimer.
ok('the guard CATCHES a real claim', claimsIn('Lekhio is HMRC approved.', FORBIDDEN[0].re).length === 1);
ok('the guard FORGIVES our real disclaimer',
  claimsIn('Lekhio is not endorsed by, affiliated with, or approved by HMRC.', FORBIDDEN[1].re).length === 0);
ok('the guard CATCHES a real filing claim', claimsIn('We file your tax return for you.', FILING_CLAIMS[0].re).length === 1);
ok('it says the filing is built', /filing itself is built/i.test(mtd));
ok('it says it has been tested against HMRC systems', /own test systems/i.test(mtd));
ok('it names the fraud prevention headers, which is the hard part', /fraud prevention headers/i.test(mtd));
ok('it says what is missing is permission, not software', /permission/i.test(mtd) && /rather than a build/i.test(mtd));
ok('it explains WHY we are taking the time, rather than apologising', /matters more than being first/i.test(mtd));
ok('🔴 it points at the 7 November deadline', /7 November 2026/.test(mtd));
ok('it never claims we can file today', !/\byou can file (now|today)\b/i.test(strip(mtd)));

// The one phrase we ARE allowed, and only once it is true. Today it is not, so it should not
// appear yet. This assertion is a reminder, not a prohibition: when HMRC grants production access,
// flip it to assert the phrase IS present.
ok('"HMRC recognised" is not claimed yet, because it is not true yet',
  !/HMRC[\s-]*recognised/i.test(strip(mtd)));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;
