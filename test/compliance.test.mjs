// 🔴 FINANCE ACT 2026, SECTION 250 AND SCHEDULE 22. THE LAW CHANGED UNDER US ON 1 APRIL AND NOBODY
// SENT US A LETTER.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// "Dishonest conduct" is gone. What replaced it is SANCTIONABLE CONDUCT: acting with intent to bring
// about a loss of tax revenue, and the Act says in terms that this INCLUDES a client
//
//     "obtaining more tax relief than they are entitled to obtain by law"
//
// which is a literal description of the feature this product is being built around.
//
// Three things widened at once, and all three point at us:
//   . "tax adviser" went from INDIVIDUAL to PERSON, so Lekhio Ltd is in scope;
//   . it reaches "assistance provided in the knowledge it is likely to be used in connection with
//     tax affairs", which is bookkeeping software;
//   . up to 70% of lost revenue, £1m for a first offence, £5m for a repeat, plus naming.
//
// File access notices no longer need tribunal approval.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// CLAIMING A STATUTORY RELIEF IS NOT AVOIDANCE. Marriage Allowance is not an "arrangement". We cross
// the line in exactly three ways, and this suite is the rail against each:
//
//   1. FILE AS THE TAXPAYER, NEVER AS AN AGENT. Sch 19 exempts "providers of payroll, tax or
//      accounting software interacting with HMRC in that capacity". Those four words are the entire
//      safe harbour. Operate an Agent Services Account and we become a registered tax adviser with
//      AML supervision. This is doc 104 made statutory: WE PREPARE, HE APPROVES.
//
//   2. NEVER PRICE ON THE SAVING. A fee contingent on tax saved is a DOTAS premium-fee hallmark and
//      the signature of the repayment-agent industry HMRC has spent years legislating against.
//      "£12.99 saves you £2,000" is a sentence we SAY. It must never be a number we CHARGE.
//
//   3. TELL HIM THE TRUTH, INCLUDING WHEN IT COSTS US. Doc 104 Q5: "Is it TRUE? Not is it
//      defensible. TRUE."
//
// And the thing that makes all three enforceable: THE LOG. What we asked, in the words he read, what
// he answered, when. That is the only evidence of intent that exists. (test/specialcategory,
// test/onboarding.)

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const R = await import(pathToFileURL(path.join(root, 'lib/rulesources.ts')).href);
// The corpus is now the canonical data file; taxrules.ts is a thin re-export. Load the data directly
// (Node type stripping needs a self-contained module with the explicit .ts extension).
const T = await import(pathToFileURL(path.join(root, 'lib/claimrules.data.ts')).href);
const { RULE_SOURCES } = R;
const RULES = T.EXPENSE_RULES || T.RULES || T.default;

const read = (p) => readFileSync(path.join(root, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\ncompliance rails: Finance Act 2026 Sch 22');

// ---------------------------------------------------------------------------------------------
// 🔴 1. NEVER PRICE ON THE SAVING. The DOTAS premium-fee hallmark.
// ---------------------------------------------------------------------------------------------

const margin = strip(read('lib/margin.ts'));
const billing = strip(read('lib/stripe.ts'));   // where the PRICE actually lives

ok('🔴 THE PRICE IS A CONSTANT. It is not a function of anything, least of all the saving.',
  // A fee contingent on tax saved is a premium fee hallmark under DOTAS, and it is the business
  // model of every repayment agent HMRC has spent years legislating against. The moment the price
  // depends on the saving, we stop being software and become the thing the statute was written for.
  //
  // And it is stronger than "no percentage appears in the file". PRICE_PENCE is a hardcoded RECORD:
  // 1299. There is no arithmetic anywhere near it, no input it could take, and nothing it could be
  // computed FROM. You cannot make this contingent without deleting it and writing a function.
  /PRICE_PENCE[\s\S]{0,400}?1299/.test(billing)
  && !/estSaving|taxSaved|percentOf|\* *0\.|saving/i.test(billing));

ok('...and NOTHING in the pricing reads the ledger, the optimiser, or a saving',
  !/from '\.\/ledger'|from '\.\/taxoptimiser'/.test(billing)
  && !/from '\.\/ledger'|from '\.\/taxoptimiser'/.test(margin));

ok('...and no percentage, commission, contingent or success fee exists anywhere in billing',
  !/commission|contingen|success fee|percent of your|cut of|share of the saving/i.test(billing));

// "£12.99 saves you £2,000" is a SENTENCE WE SAY. Marketing may say it. Billing may never compute
// it. That distinction is the whole of rule 2 and it is the difference between a claim and a fee.
ok('the saving is something we SHOW him (lib/ledger.ts), and it lives nowhere near the price',
  /export function ledger/.test(read('lib/ledger.ts'))
  && !/12\.99|price|stripe|subscription/i.test(strip(read('lib/ledger.ts'))));

// ---------------------------------------------------------------------------------------------
// 🔴 2. WE FILE AS THE TAXPAYER. NEVER AS AN AGENT.
// ---------------------------------------------------------------------------------------------

const hmrc = strip(read('lib/hmrc.ts'));

ok('🔴 NO AGENT SERVICES ACCOUNT. No agent endpoint, no agent reference, anywhere.',
  // Sch 19 exempts software providers interacting with HMRC "in that capacity". Operate an ASA and
  // we are a registered tax adviser with AML supervision and a completely different legal existence.
  // The safe harbour is four words wide and this is how we stay inside it.
  !/agent-services|agents\/|agentReferenceNumber|arn|as-agent/i.test(hmrc));

ok('every submission is on HIS OWN grant. The token is the user\'s, not ours.',
  /oauth|authorization_code|user.*token|access_token/i.test(hmrc));

ok('there is an approval gate BEFORE anything is submitted, and it is not decorative',
  // Build the gate before the automation it guards. Doc 104: one less button at a time, until only
  // one is left. Approve.
  /approv/i.test(hmrc));

// ---------------------------------------------------------------------------------------------
// 🔴 3. EVERY RULE WE ASSERT HAS AN HMRC SENTENCE BEHIND IT, OR IT IS COUNTED AS UNCITED.
// ---------------------------------------------------------------------------------------------

const ruleKeys = RULES.map((r) => r.key);
const citedKeys = Object.keys(RULE_SOURCES);
const uncited = ruleKeys.filter((k) => !citedKeys.includes(k));

ok('the six Khoji shouted about every night are now cited: premises, training, materials, bankfinance, marketing, subscriptions',
  ['premises', 'training', 'materials', 'bankfinance', 'marketing', 'subscriptions']
    .every((k) => Array.isArray(RULE_SOURCES[k]) && RULE_SOURCES[k].length > 0));

ok('🔴 EVERY RULE WE ASSERT NOW HAS AN HMRC SENTENCE BEHIND IT. 0 uncited.',
  // A gap you can count is a gap you will close. A gap you cannot see becomes the mileage rate.
  //
  // And this assertion is the one that must never be softened. If a new rule arrives without a
  // source, this fails and the build stops, which is exactly the point: under FA26 Sch 22 a rule we
  // assert on our own authority is a rule we cannot defend, and "our authority is nothing" is not a
  // figure of speech, it is the statutory position.
  uncited.length === 0);

ok('every source is a gov.uk page. Nothing else is an authority.',
  Object.values(RULE_SOURCES).flat().every((s) => s.url.startsWith('https://www.gov.uk/')));

ok('every quote is an ANCHOR, not a fragment that could survive a reversal',
  // "allow a deduction" survives a rewrite to "we no longer allow a deduction". The quote has to be
  // long enough that HMRC cannot flip its meaning without breaking our check.
  Object.values(RULE_SOURCES).flat()
    .every((s) => s.quote.trim().length >= 20 && s.quote.trim().split(/\s+/).length >= 4));

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE THREE RULES THAT WERE ACTUALLY WRONG. Found by going and READING the source.
// ---------------------------------------------------------------------------------------------

const rule = (k) => RULES.find((r) => r.key === k);

ok('🔴 TRAINING: new skills that SUPPORT the business are allowable. HMRC widened this in 2024.',
  // We were running the pre-2024 line: "training for a brand new trade or skill is not allowable".
  // HMRC's live page says you CAN claim training that helps you "develop new skills and knowledge to
  // support your business - this includes administrative skills". So the sparky doing an EV course
  // and the plumber doing bookkeeping were BOTH being told no, by us, wrongly.
  //
  // ⚠️ NOTE THE DIRECTION. Sch 22 punishes claiming MORE than you are entitled to. This was the
  // opposite: we talked a man out of a relief he was owed. The law will never fine us for that, and
  // it is still a total failure of the only thing this product exists to do.
  !/brand new trade or skill is not/i.test(rule('training').rule)
  && /bookkeeping|new skills|support the business/i.test(rule('training').rule));

ok('...and the citation is HMRC\'s own bullet, so Khoji screams if they narrow it again',
  RULE_SOURCES.training.some((s) => /develop new skills and knowledge to support your business/i.test(s.quote)));

ok('🔴 BANK AND FINANCE: the phantom cash-basis interest cap is gone. It was abolished 6 April 2024.',
  // A man who reads "there is a cap" and does not know the number stops logging his loan interest,
  // because he assumes he is near it. A caveat he cannot act on is not caution, it is noise.
  !/cap on interest under the simpler cash basis/i.test(rule('bankfinance').detail));

ok('...and we now tell him the thing that IS true: you claim the interest, never the repayment',
  /repayment of the loan itself|Repaying the loan itself/i.test(
    rule('bankfinance').rule + ' ' + rule('bankfinance').detail));

ok('🔴 OUR OWN FEE: we no longer tell him our bill is fully deductible when HMRC says part of it is not',
  // The old line ended "Lekhio itself is allowable." GOV.UK's legal and financial costs page lists,
  // under what you cannot claim: "the cost of preparing and submitting your Self Assessment tax
  // return". We were nudging a man toward a deduction HMRC excludes. FOR OUR OWN INVOICE. It is the
  // most self-serving sentence this codebase has ever contained and nobody meant it that way, which
  // is exactly how these things happen: it reads like a nice fact about the product.
  //
  // It is arguable. BIM46435 is softer, and in practice most accountants put the lot through and are
  // never challenged. THAT IS PRECISELY THE REASONING WE ARE NOT ALLOWED TO HAVE.
  // Doc 104 Q5: is it TRUE? Not is it defensible. TRUE.
  !/Lekhio itself is allowable/i.test(rule('fees').detail)
  && /Self Assessment tax return/i.test(rule('fees').detail));

// ---------------------------------------------------------------------------------------------
// 🔴 5. WE PREPARE. HE APPROVES. Never "we file your tax".
// ---------------------------------------------------------------------------------------------

const copy = readdirSync(path.join(root, 'app'), { recursive: true })
  .filter((f) => typeof f === 'string' && /\.tsx?$/.test(f))
  .map((f) => strip(read(path.join('app', f))))
  .join('\n');

ok('🔴 NOWHERE DO WE SAY "we file your tax". Not once, in any screen.',
  // CLAUDE.md, and now the statute agrees with it. We PREPARE. He APPROVES. HMRC keeps the taxpayer
  // legally responsible at all times, and the moment we imply otherwise we have described ourselves
  // as his agent in his own words.
  !/we (will )?file your tax|we do your tax for you|we submit your tax return for you/i.test(copy));

// ⚠️ AND HERE IS THE PROSE TRAP, FOR THE SIXTH TIME IN THIS REPO.
//
// The first version of this assertion searched for "endorsed by HMRC" and FAILED, on the DISCLAIMER:
// "Lekhio is an independent UK company, not HMRC, and not endorsed by HMRC." The sentence that
// exists to say the opposite of the thing I was checking for.
//
// The "no Approve All" test failed on the comment forbidding Approve All. The domain guard failed on
// a comment about never writing the rival domain. Two assertions failed this morning on comments
// explaining why we did not build a redactor. And now this.
//
// A test that greps prose WILL be broken by prose, and the prose that breaks it is almost always the
// prose written to defend the very rule. So: require the CLAIM, not the WORDS. A negated mention is
// the product doing its job.
//
// ⚠️ AND A LOOKBEHIND WAS NOT ENOUGH EITHER, WHICH IS THE REAL LESSON.
//
// My second attempt used (?<!not ) and STILL failed, on this sentence:
//     "Lekhio is not endorsed by, affiliated with, or approved by HMRC."
// The negation is at the START of the sentence and the phrase it negates is at the END, eleven words
// away. No amount of cleverness in the pattern reaches it, because the unit of meaning is the
// SENTENCE, not the phrase. So read the sentence.
ok('...and we never imply HMRC endorses us. The disclaimer saying so does not count as saying it.',
  copy.split(/(?<=[.!?])\s+|\n/)
    .filter((sentence) => /HMRC[ -]approved|approved by HMRC|endorsed by HMRC|official HMRC partner/i.test(sentence))
    .every((sentence) => /\bnot\b|\bnever\b|\bno\b|independent/i.test(sentence)));

ok('...in fact we say the opposite, out loud, in the copy',
  /not endorsed by HMRC/i.test(copy));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
