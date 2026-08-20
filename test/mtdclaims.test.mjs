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

// 🔴 EXCEPTIONS HAVE TO BE DECLARED BY HAND, AND RIGHT NOW THERE ARE NONE.
//
// There used to be exactly one: lib/studioagent.ts, the file that FORBADE these phrases to the AI
// copy generator and therefore had to quote them, in a string rather than a comment, so stripping
// comments did not remove them. That file was deleted on 31 Jul 2026 along with the whole AI drafting
// path, so the allowlist is empty and every forbidden phrase is now forbidden everywhere.
//
// Anything that wants to quote one has to come here and say why. That friction is the point: loosening
// the pattern instead would let the real thing through in every file at once.
const QUOTES_THE_RULES = new Set([]);

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
console.log('\n2b. AND THE PROMISE OF A FILING, WHICH IS THE SAME CLAIM IN THE FUTURE TENSE.');

// 🔴 THE HOLE THIS SUITE HAD UNTIL 20 AUGUST 2026, AND EXACTLY WHAT WALKED THROUGH IT.
//
// Every pattern in section 2 requires our PRONOUN and HMRC's OBJECT in one clause: "we file your
// tax return". /free-mtd-filing was live, public and indexed saying "we will prepare and file it
// for free", "prepared and filed free, forever", "Free Making Tax Digital filing", and a step
// three headed "You approve, we send it". Not one of them matched. The suite reported clean for
// weeks over the one claim a tax company does not get to make twice, and it was caught by a human
// forty minutes before the first outreach went out.
//
// Two lessons, and the second is the one worth keeping:
//   1. THE FUTURE TENSE IS NOT A HEDGE. "We will file it" is a delivery date, not a disclaimer.
//      To the man reading it there is no difference between that and "we file it".
//   2. A PROMISE DOES NOT NEED OUR GRAMMAR. "prepared and filed free, forever" has no subject at
//      all and promises more than either sentence above. So these match the SHAPE of the offer:
//      a verb of sending with anything as its object, and the free-filing offer in any wording.
//
// ⚠️ WHY THESE ARE NOT JUST ADDED TO FILING_CLAIMS. That list is about who carries the liability
// and it is deliberately narrow, so "we prepare it and you file it" stays legal. This list is
// about a capability we do not have at all. Two different wrongs, kept apart so neither gets
// loosened to make room for the other.
const FILING_PROMISES = [
  { re: /\bwe\s+(will\s+)?(prepare\s+and\s+)?(file|submit)\s+it\b/i, why: '"we will prepare and file it" is still we file it' },
  { re: /\byou\s+approve,?\s+we\s+(send|file|submit)\b/i, why: 'his approval is not our licence to send' },
  // 🔴 strict: THESE THREE IGNORE THE NEGATION ESCAPE HATCH, AND HERE IS WHY THEY HAVE TO.
  //
  // claimsIn() forgives any sentence containing "not" or "no", because our own disclaimer reads
  // "not endorsed by, affiliated with, or approved by HMRC" and a guard that fails the build over
  // that gets switched off by Friday. Sound rule, real hole: after whitespace flattening, a JSX
  // "sentence" is whatever sits between two full stops in the SOURCE, and the hero here reads
  // "...at no cost, ever.</h1>...we will prepare and file it for free." Two lines of markup apart,
  // one chunk to this regex, and the "no" in "no cost" pardoned the claim underneath it. That is
  // how "we will prepare and file it" passed while three of its neighbours failed.
  //
  // The three below are shapes of an OFFER, not of a sentence. There is no truthful negative use
  // of "prepared and filed", "filed free, forever" or "free MTD filing" in our copy: you cannot
  // disclaim a thing by naming it as the product. So they read the raw text and no "no" saves them.
  // The pronoun patterns keep the escape hatch, because "Lekhio does not file your return" is a
  // sentence we genuinely want to be able to write.
  { re: /\b(prepared|prepare)\s+and\s+(filed?|sent?|submitted?)\b/i, strict: true, why: 'we prepare; the sending is his' },
  { re: /\bfiled?\s+free,?\s+forever\b/i, strict: true, why: 'filing is not ours to give away, because it is not ours' },
  { re: /\bfree\s+(mtd|making\s+tax\s+digital)\s+filing\b/i, strict: true, why: 'the offer itself may not be named as a filing' },
  { re: /\bLekhio\s+will\s+(prepare\s+and\s+)?(file|submit|send)\b/i, why: 'a future tense is a delivery date, not a hedge' },
  { re: /\b(when|the\s+moment)\s+you\s+can\s+(file|submit|send)\b[^.]{0,60}\bfree\b/i, why: 'promises a free filing date nobody has given us' },
];

// ⚠️ AND THE SENTENCE HAS TO BE ABOUT TAX BEFORE ANY OF THAT COUNTS.
//
// The first run of this list failed the build on lib/signupcode.ts: "Ask for a new one and we will
// send it straight away", about a six digit sign in code. That is a true sentence about a text
// message and it has nothing to do with HMRC. A compliance guard that fires on it is a guard
// somebody deletes by Friday, and then the real claim goes through the hole where it used to be.
//
// This list is about ONE capability we do not have. A sentence that never mentions tax cannot be
// claiming it, so the tax word is the price of entry. Note "filing" is NOT in this list: it is in
// half the patterns above, so admitting it here would let a sentence qualify itself.
const ABOUT_TAX = /\b(hmrc|tax|return|returns|self\s*assessment|making\s+tax\s+digital|mtd|quarterly\s+update)\b/i;
function promisesIn(text, re, strict) {
  const sentences = strict
    ? text.split(/(?<=[.!?])\s+/).filter((s) => re.test(s)).map((s) => s.trim().slice(0, 90))
    : claimsIn(text, re);
  return sentences.filter((c) => ABOUT_TAX.test(c));
}

for (const { re, why, strict } of FILING_PROMISES) {
  const hits = sources
    .filter(([f]) => !QUOTES_THE_RULES.has(f))
    .flatMap(([f, s]) => promisesIn(s, re, strict).map((c) => `${f}: ${c}`));
  ok(`nothing promises ${re.source.slice(0, 38)}  (${why})${hits.length ? `\n     ${hits.join('\n     ')}` : ''}`, hits.length === 0);
}

// 🔴 AND THE NEW PATTERNS MUST BITE ON THE REAL BYTES THAT SHIPPED, not on a tidy specimen written
// to pass. Every string below is verbatim from the live page on the morning of 20 August 2026.
const SHIPPED = [
  'If your return is straightforward, just profits, losses and the essentials HMRC asks for, we will prepare and file it for free.',
  'Basic Self Assessment, prepared and filed free, forever.',
  'Free Making Tax Digital filing. For the basics, at no cost, ever.',
  'Lekhio will prepare and file your Making Tax Digital return for free.',
  'Pop your email in and we will tell you the moment you can file your basic return free, before anyone else.',
];
for (const line of SHIPPED) {
  ok(`🔴 the guard now catches what shipped: "${line.slice(0, 52)}..."`,
    FILING_PROMISES.some(({ re, strict }) => promisesIn(line, re, strict).length > 0));
}
// And it still forgives the true sentence, which is the whole point of a guard that stays on.
const forgives = (line) => FILING_PROMISES.every(({ re, strict }) => promisesIn(line, re, strict).length === 0);
ok('the guard FORGIVES the honest version, so it cannot be switched off as noise',
  forgives('Lekhio gets your quarterly update ready and you send it to HMRC yourself.'));
// 🔴 AND IT FORGIVES THE SENTENCES THAT WOULD OTHERWISE GET IT DELETED. A compliance guard earns
// its place by being quiet on true copy; each of these failed a draft of this list on 20 August.
ok('the guard FORGIVES a sign in code, which has nothing to do with HMRC',
  forgives('Ask for a new one and we will send it straight away.'));
ok('the guard FORGIVES our own plain disclaimer about filing',
  forgives('Lekhio does not file your tax return for you, and nothing is ever sent to HMRC without your approval.'));
ok('the guard FORGIVES telling him to file it himself, which is the whole offer',
  forgives('You file the normal Self Assessment return once a year, and Lekhio prepares every figure in it.'));

// 🔴 AND THE strict FLAG MUST ACTUALLY DO SOMETHING, or it is decoration on a comment.
// This is the real hero, flattened the way the walker flattens it: a "no" two lines of markup
// above the claim. The lenient path pardons it. The strict path does not, and that gap is the bug.
const MASKED = 'Free Making Tax Digital filing. For the basics, at no cost, ever. we will prepare and file it for free.';
ok('🔴 a nearby "no" still pardons the pronoun patterns, which is the known limit',
  promisesIn(MASKED, FILING_PROMISES[0].re, false).length === 0);
ok('🔴 but the offer patterns are strict, so the same text still fails the build',
  promisesIn(MASKED, FILING_PROMISES[4].re, true).length === 1);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. THE MTD PAGE IS HONEST ABOUT WHERE IT HAS GOT TO');

// Flattened for the same reason: this copy is JSX and wraps mid sentence.
const mtd = flat(readFileSync(path.join(repo, 'app/free-mtd-filing/page.tsx'), 'utf8'));
ok('it no longer just says coming soon', !/COMING SOON/i.test(strip(mtd)));
// The allowlist is pinned at EMPTY. It held one entry until 31 Jul 2026 (lib/studioagent.ts, the AI
// copy generator, deleted that day). Pinning the size is the whole point of it: adding a file to the
// allowlist has to fail the build first, so it is argued for out loud rather than slipped in.
ok('the exception list is not a way to smuggle a claim in', QUOTES_THE_RULES.size === 0);

// 🔴 THE GUARD MUST STILL BITE. A sentence-level negation check could be written so loosely that it
// passes everything, and a compliance test that cannot fail is worse than none because it reads as
// proof. These two prove it still catches a real claim and still forgives a real disclaimer.
ok('the guard CATCHES a real claim', claimsIn('Lekhio is HMRC approved.', FORBIDDEN[0].re).length === 1);
ok('the guard FORGIVES our real disclaimer',
  claimsIn('Lekhio is not endorsed by, affiliated with, or approved by HMRC.', FORBIDDEN[1].re).length === 0);
ok('the guard CATCHES a real filing claim', claimsIn('We file your tax return for you.', FILING_CLAIMS[0].re).length === 1);
// 🔴 THESE FOUR USED TO REQUIRE THE VERY WORDING THAT WAS WRONG. Until 20 August 2026 this suite
// asserted the page said "the filing itself is built" and that what was left was "permission ...
// rather than a build". Both read as a switch in our own hand. HMRC's Developer Hub says
// otherwise: Lekhio is listed under Sandbox applications only and the production application
// reads "Credentials requested". A test that PINS an optimistic claim in place is worse than a
// missing test, because the next person to tell the truth has to delete a passing assertion first.
ok('it still says the pipeline is built, which is true and worth saying', /built the pipeline/i.test(mtd));
ok('it says it has been tested against HMRC systems', /own test systems/i.test(mtd));
ok('it names the fraud prevention headers, which is the hard part', /fraud prevention headers/i.test(mtd));
ok('🔴 it says production access has NOT been granted', /has not been granted/i.test(mtd));
ok('🔴 it refuses to put a date on a decision that is not ours', /will not put a date/i.test(mtd));
ok('🔴 it tells him plainly that HE is the one who sends it', /you send it to HMRC yourself/i.test(mtd));
ok('🔴 the offer on this page is preparation, and is never named as a filing',
  !/free (mtd|making tax digital) filing/i.test(strip(mtd)) && !/prepared and filed/i.test(strip(mtd)));
ok('it explains WHY we are taking the time, rather than apologising', /matters more than being first/i.test(mtd));
// 🔴 THIS USED TO ASSERT THE PAGE NAMED 7 NOVEMBER 2026. It did, and on 31 July 2026 that was
// four months early: the next quarterly update was 7 AUGUST, one week away, and the page was
// telling a man to relax about it. The fix was to derive the date, so the assertion is now that
// the page CANNOT name a single fixed deadline: it has to carry the list and choose.
ok('🔴 the next quarterly deadline is derived, never a single hardcoded date',
  /nextQuarterlyDeadline\s*\(/.test(mtd) && /QUARTERLY_DEADLINES/.test(mtd));
ok('the deadline list covers all four quarters', /7 August|7 November|7 February|7 May/.test(mtd)
  && (mtd.match(/said: '/g) || []).length >= 4);
ok('the page is revalidated, so a derived date cannot freeze at deploy time',
  /export const revalidate/.test(mtd));
ok('it never claims we can file today', !/\byou can file (now|today)\b/i.test(strip(mtd)));

// The one phrase we ARE allowed, and only once it is true. Today it is not, so it should not
// appear yet. This assertion is a reminder, not a prohibition: when HMRC grants production access,
// flip it to assert the phrase IS present.
ok('"HMRC recognised" is not claimed yet, because it is not true yet',
  !/HMRC[\s-]*recognised/i.test(strip(mtd)));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;
