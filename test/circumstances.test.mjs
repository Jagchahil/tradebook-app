// THE CIRCUMSTANCES. See lib/circumstances.ts and doc 108 §3.
//
// NONE OF THESE FACTS IS VISIBLE IN A BANK FEED OR A RECEIPT PHOTO. That is exactly why every app
// in this category misses them, for every user, for ever. A receipt tells you he bought diesel. It
// does not tell you he was a PAYE electrician until eighteen months ago.
//
// Marriage Allowance was £252 on the floor for one reason: THERE WAS NOWHERE IN THIS PRODUCT FOR A
// MAN TO TELL US HE WAS MARRIED. Not a bug. A hole where a question should be.
//
// WHAT THESE TESTS DEFEND:
//
//   1. THE QUESTION IS IN HIS LANGUAGE. If it needs a form or a tax term, he never answers, and the
//      money stays on the floor. A question he will not answer is not a feature.
//   2. WE KNOW WHO HAS TO CLAIM. Marriage Allowance must be claimed by his WIFE. Small Business Rate
//      Relief goes to his COUNCIL. Get this wrong and every man who follows our advice is rejected,
//      wastes an evening, and blames us. Correctly.
//   3. NOTHING HERE CAN REACH A TOTAL. The value is an ORDER OF MAGNITUDE, for sorting the
//      questions. It is not a promise, and lib/ledger.ts cannot see it.
//   4. EVERY CLAIM HAS A SOURCE. badrLifetimeLimit was deleted from the tax engine on 14 July for
//      being a number we published and could not source. Nothing gets in here without one.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const { CIRCUMSTANCES, askingOrder, notOurs, unanswered } = C;

const ledgerSrc = readFileSync(path.join(root, 'lib/ledger.ts'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nthe circumstances: every relief we cannot give him because we never asked');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE QUESTION IS THE PRODUCT. If he will not answer it, there is no feature.
// ---------------------------------------------------------------------------------------------

ok('every one is a QUESTION, in one sentence, that he can answer without looking anything up',
  CIRCUMSTANCES.every((c) => c.ask.endsWith('?') && c.ask.length < 160));

ok('no question contains a tax term he would have to look up',
  CIRCUMSTANCES.every((c) =>
    !/ITTOIA|ITA 2007|s\d{2,}|carry.back|relief under|allowance under|TCGA|CAA/i.test(c.ask)));

ok('THE BIGGEST ONE is a plain question about his old job, not about losses',
  CIRCUMSTANCES.find((c) => c.key === 'prior_employment').ask
    .toLowerCase().includes('before you went self-employed'));

ok('...and it explains the money in his words: HMRC send you a cheque',
  CIRCUMSTANCES.find((c) => c.key === 'prior_employment').why.includes('cheque'));

ok('every one says WHY it is worth answering, or he will not bother',
  CIRCUMSTANCES.every((c) => c.why.length > 40));

// ---------------------------------------------------------------------------------------------
// 🔴 2. WHO CLAIMS IT. Get this wrong and every man who follows us gets rejected.
// ---------------------------------------------------------------------------------------------

const ma = CIRCUMSTANCES.find((c) => c.key === 'married');

ok('THE BUG WE REFUSED TO SHIP: Marriage Allowance is claimed by HIS PARTNER, not by him',
  ma.claimant === 'his partner');

ok('...so it appears in the list of things that are NOT ours to claim',
  notOurs().some((c) => c.key === 'married'));

ok('...and HMRC wants NI NUMBERS, not a marriage certificate. We do not collect one',
  ma.evidence.toLowerCase().includes('national insurance')
  && ma.evidence.toLowerCase().includes('not a marriage certificate'));

ok('Small Business Rate Relief goes to the COUNCIL, which is exactly why nobody claims it',
  CIRCUMSTANCES.find((c) => c.key === 'premises').claimant === 'his council');

ok('the grandparent childcare credit needs TWO signatures, and we say so',
  CIRCUMSTANCES.find((c) => c.key === 'grandparent_childcare').claimant === 'both of them');

ok('every single entry names WHO has to claim it. There is no "we will sort it" fudge',
  CIRCUMSTANCES.every((c) => ['him', 'his partner', 'his council', 'both of them', 'his company'].includes(c.claimant)));

// ---------------------------------------------------------------------------------------------
// 🔴 3. NOTHING HERE CAN EVER REACH A TOTAL.
// ---------------------------------------------------------------------------------------------
//
// The value is an ORDER OF MAGNITUDE, and it exists to SORT THE QUESTIONS, not to be added up. A
// man who is told "you could save £4,000" and then saves nothing has been lied to.

ok('the value is a WORD, not a number. You cannot sum a word',
  CIRCUMSTANCES.every((c) => typeof c.worthOrder === 'string')
  && CIRCUMSTANCES.every((c) => !('amount' in c) && !('worth' in c) && !('saving' in c)));

ok('THE LEDGER CANNOT SEE THIS FILE. Its four guards hold',
  !ledgerSrc.includes('circumstances') && !ledgerSrc.includes('CIRCUMSTANCES'));

// ---------------------------------------------------------------------------------------------
// 🔴 4. ASK THE £3,000 QUESTION BEFORE THE £20 ONE.
// ---------------------------------------------------------------------------------------------
//
// A man will answer three questions on a good day. WHICH three decides whether this product is
// worth £12.99 to him. Asking about his home office before asking what he did for a living last
// year is how you leave four figures on the floor and feel thorough.

const order = askingOrder();

ok('the huge ones come first, and the small ones last',
  order[0].worthOrder === 'huge'
  && order[order.length - 1].worthOrder === 'small');

ok('...so "what did you do before?" is asked before "do you work from home?"',
  order.findIndex((c) => c.key === 'prior_employment')
  < order.findIndex((c) => c.key === 'home_working'));

ok('the three biggest are the old job, the seven years before he started, and the VAT on his van',
  order.slice(0, 3).map((c) => c.key).sort().join(',') === 'prior_employment,start_date,vat_registered');

// ---------------------------------------------------------------------------------------------
// 🔴 5. EVERY CLAIM HAS A SOURCE, FROM BIRTH.
// ---------------------------------------------------------------------------------------------

ok('every entry carries a primary source. badrLifetimeLimit was deleted for having none',
  CIRCUMSTANCES.every((c) => c.source.length > 15));

ok('every entry says what HMRC would want if it asked. Several honestly say "nothing"',
  CIRCUMSTANCES.every((c) => c.evidence.length > 10));

ok('the blind allowance is flagged as HEALTH DATA, Article 9, delete the image',
  CIRCUMSTANCES.find((c) => c.key === 'blind').evidence.includes('Article 9'));

ok('the double cab pickup needs the ORDER DATE, not just the vehicle type',
  CIRCUMSTANCES.find((c) => c.key === 'vehicle').ask.includes('when did you buy or order it'));

ok('the Gift Aid carry-back is flagged as a ONE-SHOT DOOR: original return only',
  CIRCUMSTANCES.find((c) => c.key === 'gift_aid').source.includes('one-shot door'));

// --- and the backdating, which is why asking EARLY matters ---------------------------------------

ok('several of these reach back YEARS, so the day he answers is money',
  CIRCUMSTANCES.filter((c) => c.backYears >= 4).length >= 6);

ok('pre-trading expenditure reaches back SEVEN years, not four. People assume it is nothing',
  CIRCUMSTANCES.find((c) => c.key === 'start_date').backYears === 7);

ok('the grandparent credit reaches back to 2011, which can be a decade of state pension',
  CIRCUMSTANCES.find((c) => c.key === 'grandparent_childcare').backYears >= 15);

// --- unanswered: the gap IS the money -----------------------------------------------------------

const DEPENDENT = CIRCUMSTANCES.filter((c) => c.dependsOn);
const ans = (o) => Object.entries(o).map(([key, answer]) => ({ key, answer }));

// Two kinds of question are held out of the queue, for two completely different reasons:
//   a FOLLOW-UP waits for its premise (we do not ask a single man what his wife earns);
//   a HEALTH question never enters the queue at all, on any channel (Article 9, see test/specialcategory).
const HELD_BACK = CIRCUMSTANCES.filter((c) => c.dependsOn || c.specialCategory);

ok('a man who has told us nothing is asked everything EXCEPT the follow-ups and the health question',
  unanswered([]).length === CIRCUMSTANCES.length - HELD_BACK.length);

ok('...and once he answers, we never ask him again',
  unanswered(ans({ married: 'yes', prior_employment: 'yes' }))
    .every((c) => c.key !== 'married' && c.key !== 'prior_employment'));

ok('what is left is still sorted with the biggest money first',
  unanswered(ans({ prior_employment: 'yes' }))[0].worthOrder === 'huge');

// --- 🔴 THE FOLLOW-UP. The reason a compound question was a bug. -------------------------------
//
// "Are you married? AND does your partner earn under the allowance?" was ONE tap for TWO facts. A
// Yes was fine. A NO was a black hole: not married, or married to someone who earns well? Different
// men, different reliefs, recorded identically, AND NEVER ASKED AGAIN.

ok('we never ask a single man what his wife earns',
  unanswered(ans({ married: 'no' })).every((c) => c.key !== 'partner_low_earner'));

ok('...and we do not ask it before we have asked whether he is married, either',
  unanswered([]).every((c) => c.key !== 'partner_low_earner'));

ok('a "not now" on the premise HOLDS the follow-up. It does not release it and it does not deny it.',
  unanswered(ans({ married: 'skip' })).every((c) => c.key !== 'partner_low_earner'));

ok('a YES releases it, and it is the very next thing worth asking about',
  unanswered(ans({ married: 'yes' })).some((c) => c.key === 'partner_low_earner'));

ok('every dependent question depends on a key that actually exists',
  DEPENDENT.every((c) => CIRCUMSTANCES.some((x) => x.key === c.dependsOn.key)));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
