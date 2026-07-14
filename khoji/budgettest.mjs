// 🔴 INSTANT. The Budget must be read in minutes, not the next morning.
//
// At 12:21, 12:22 and 12:24 yesterday, three tax measures landed on GOV.UK. Three minutes apart.
// The nightly watcher would have found them at 05:15 the next day, seventeen hours later, which on a
// Budget day is the difference between answering a customer and watching every accountant on the
// internet answer him first.
//
// THE ONE THING THAT MATTERS IN THIS FILE IS operativeDate().
//
// A Tax Information and Impact Note is the ONLY document in UK tax that states its effective date
// EXPLICITLY, IN PROSE:
//
//     "Detailed proposal  Operative date  This measure will have effect from 6 April 2027."
//
// Get that date wrong and the measure lands in the wrong half of lib/brain.ts phase(): a change
// taking effect in 2027 gets filed as IN FORCE, and Rakha answers a man from it today.

import { operativeDate, commencement, gist, isRecent } from './budget.mjs';

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nkhoji budget: reading the Budget in minutes');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE OPERATIVE DATE. Verbatim from the live TIIN published 13 July 2026.
// ---------------------------------------------------------------------------------------------

// This is the REAL text, lifted off GOV.UK, and it is deliberately the whole shape of the document
// rather than a tidy fragment: the trap is what comes BEFORE the heading, not what comes after it.
const REAL_TIIN = `
This measure will defer Capital Gains Tax in certain circumstances until an economic disposal.

Who is likely to be affected Individuals and trustees entering into cryptoasset loans.
Background to the measure HMRC published a call for evidence which was open from 5 July 2022 to
31 August 2022 seeking views on the taxation of cryptoasset loans and liquidity pools. This was
followed by a consultation that ran from 27 April 2023 to 22 June 2023. At Budget 2025, HMRC
published a summary of responses. This measure was announced on 13 July 2026.
Detailed proposal Operative date This measure will have effect from 6 April 2027. Current law This
measure will amend the current law dealing with Capital Gains Tax. This is found in the Taxation of
Chargeable Gains Act 1992.
`;

ok('🔴 IT READS THE DATE UNDER "OPERATIVE DATE", NOT THE FIRST DATE IN THE DOCUMENT',
  // The first date in that TIIN is 5 JULY 2022, a call for evidence four years ago. The document is
  // thick with dates: consultations, previous Budgets, the day it was announced, the year an Act was
  // passed. A regex that grabs the first one it sees would file a measure taking effect in APRIL 2027
  // as though it were four years old. phase() would call it IN FORCE. Rakha would answer from it.
  // Today. And the man would log three months of the wrong law and sign the return himself.
  operativeDate(REAL_TIIN) === '2027-04-06');

ok('...and it is NOT 2022, and it is NOT 1992, both of which are sitting right there in the text',
  operativeDate(REAL_TIIN) !== '2022-07-05' && !operativeDate(REAL_TIIN).startsWith('1992'));

// The phrasings HMRC actually uses. They vary, and they all mean the same thing.
ok('"will have effect from 6 April 2027"',
  operativeDate('Operative date This measure will have effect from 6 April 2027.') === '2027-04-06');

ok('"will have effect on and after 1 April 2026"',
  operativeDate('Operative date The measure will have effect on and after 1 April 2026.') === '2026-04-01');

ok('"has effect for disposals made on or after 30 October 2024"',
  // Note the "for disposals made" clause sitting between the verb and the date. It is common, and a
  // lazy pattern anchored straight to "effect from" misses the whole measure.
  operativeDate('Operative date This measure has effect for disposals made on or after 30 October 2024.') === '2024-10-30');

ok('"will take effect from 6 April 2026"',
  operativeDate('Operative date These changes will take effect from 6 April 2026.') === '2026-04-06');

ok('"Operative date: 6 April 2027" with no verb at all',
  operativeDate('Detailed proposal Operative date: 6 April 2027. Current law ...') === '2027-04-06');

// 🔴 THE ONE THE LIVE DATA CAUGHT. Verbatim from the Air Passenger Duty TIIN, 13 July 2026.
//
// My first pattern allowed only a "for ..." clause between the verb and the date. Then I ran it
// against the twenty-five measures HMRC actually published that day and FOURTEEN came back with NO
// OPERATIVE DATE. I nearly took that at face value. It was not true.
//
// "in relation to the carriage of passengers" is not a "for" clause, so the regex walked straight
// past a date sitting right there in the sentence and returned null. phase() calls null `unknown`,
// `unknown` goes in the block headed THE LAW AS IT STANDS TODAY, and Rakha answers a man TODAY from
// a measure that does not bite until APRIL 2027.
//
// That is exactly the bug this file exists to prevent, and my own extractor was producing it. And a
// miss does not LOOK like a miss: it looks like a TIIN that did not say, which genuinely happens.
// It would have sat there for months.
ok('🔴 "have effect IN RELATION TO THE CARRIAGE OF PASSENGERS on or after 1 April 2027"',
  operativeDate(
    'Detailed proposal Operative date This measure will have effect in relation to the carriage '
    + 'of passengers on or after 1 April 2027. Current law Section 30 of Finance Act 1994.',
  ) === '2027-04-01');

ok('...and any other clause HMRC feels like writing, because HMRC writes English',
  operativeDate('Operative date The changes will have effect for accounting periods beginning on or after 1 January 2027.') === '2027-01-01'
  && operativeDate('Operative date This measure has effect in respect of gains arising on or after 30 October 2024.') === '2024-10-30');

ok('...but it still does not wander into the NEXT sentence to find a date',
  // The clause may be anything, as long as it does not cross a full stop. "Current law ... Finance
  // Act 1994" is a different sentence and a different date, and grabbing it would be worse than
  // grabbing nothing.
  operativeDate('Operative date This measure will have effect. Current law is in section 30 of the Act of 6 April 1994.') === null);

ok('🔴 A TIIN WITH NO OPERATIVE DATE RETURNS NULL. It does not guess.',
  // And null is the honest answer. brain.ts phase() then calls it `unknown`, which is exactly right:
  // we do not know when it bites, and we say so, and nothing is quietly promoted into the law.
  operativeDate('Who is likely to be affected. Individuals. Background: consultation ran to 22 June 2023.') === null);

ok('...and so does an empty document, rather than throwing at 12:22 on Budget day',
  operativeDate('') === null && operativeDate(null) === null);

ok('a date it cannot parse is null, never a guess',
  operativeDate('Operative date This measure will have effect from the next tax year.') === null);

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE SUMMARY IS HMRC'S OWN SENTENCE. Never one we generated.
// ---------------------------------------------------------------------------------------------

ok('the gist is HMRC\'s own opening line, unrewritten',
  // A paraphrase is one more thing that can be wrong, and it would be wrong in exactly the place a
  // man is most likely to believe us. There is nothing here for a model to have been confident about.
  gist(REAL_TIIN).startsWith('This measure will defer Capital Gains Tax'));

ok('...and it falls back to the description rather than to nothing',
  gist('', 'A measure about vans.') === 'A measure about vans.');

// ---------------------------------------------------------------------------------------------
// 🔴 2b. WHEN HMRC DOES NOT KNOW EITHER. Twelve of the twenty-five, and it is not a bug.
// ---------------------------------------------------------------------------------------------
//
// Verbatim from the deliberate-defaulters TIIN, 13 July 2026. There is no calendar date in it
// ANYWHERE, because HMRC does not have one yet.
const UNDATED = `Detailed proposal Operative date The threshold at which HMRC can publish the details
will increase to £50,000 potential lost revenue from the November 2026 publication. The operative date
for the increase to the threshold is subject to the Statutory Instrument that will make this change.
The changes which enable HMRC to publish more details will apply to deliberate non-compliance which
takes place after the date of Royal Assent to Finance Bill 2026-27. Current law The current law is
contained in Section 94 of the Finance Act 2009.`;

ok('🔴 A MEASURE AWAITING ROYAL ASSENT HAS NO DATE, AND WE DO NOT INVENT ONE',
  // "Subject to the Statutory Instrument." "After the date of Royal Assent." HMRC does not know when
  // this starts, so neither do we, and a parsed date here would be a lie.
  operativeDate(UNDATED) === null);

ok('🔴 ...BUT WE KEEP HMRC\'S WORDS, BECAUSE THAT SENTENCE *IS* THE ANSWER',
  // Throwing it away would be a waste. "It starts when Parliament says so, and nobody knows when"
  // is a complete and useful answer to "when does this start". A man can act on that.
  (() => {
    const c = commencement(UNDATED);
    return c
      && /subject to the Statutory Instrument/i.test(c)
      && /after the date of Royal Assent/i.test(c);
  })());

ok('...and it stops at the next heading rather than swallowing the whole document',
  !/Section 94 of the Finance Act 2009/i.test(commencement(UNDATED) || ''));

ok('a TIIN with a real date keeps its words too, so both halves always agree',
  /6 April 2027/.test(commencement('Operative date This measure will have effect from 6 April 2027. Current law ...') || ''));

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE WINDOW. What counts as "just landed".
// ---------------------------------------------------------------------------------------------

const NOW = new Date('2026-07-14T09:00:00Z');

ok('a measure published yesterday at 12:24 is caught',
  isRecent('2026-07-13T12:24:00Z', 2, NOW) === true);

ok('...and one from last month is not, because it is not news',
  isRecent('2026-06-01T12:00:00Z', 2, NOW) === false);

ok('a rubbish timestamp is not silently treated as fresh',
  isRecent('', 2, NOW) === false && isRecent('not a date', 2, NOW) === false);

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE SEAM WITH THE AMENDMENT WATCHER. This is why task 28 came first.
// ---------------------------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, 'budget.mjs'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok('🔴 EVERY TIIN IS REGISTERED WITH THE AMENDMENT WATCHER ON THE WAY IN',
  // A TIIN is a /government/publications/ document, so it CAN be silently amended, and Budget
  // documents ARE: OOTLAR was edited FIVE TIMES IN NINE DAYS. Reading the Budget fast and then never
  // looking at it again is the fortnight problem with the volume turned up. We would be first, and
  // confidently wrong, in front of more people than usual.
  /insert into public\.khoji_documents/.test(code));

ok('...with a body hash, which is the only detector that works on a document with no amendment log',
  /bodyHash/.test(code) && /createHash\('sha256'\)/.test(code));

ok('the run is labelled kind=budget, so it can never be mistaken for the differ\'s pulse',
  // Third writer into khoji_runs. brain.ts renders the newest DIFFER row as "62 of 62 constants
  // matched". An unlabelled row from a watcher that checked no constants would render as that
  // sentence, and it would be a lie sourced from a true number.
  /values \('budget', null/.test(code));

ok('a run that read NOTHING exits 1. It does not print a tidy summary of nothing.',
  /results\.length === 0[\s\S]{0,300}?process\.exit\(1\)/.test(code));

ok('the full text comes back in the SAME call, which is why this can run every two minutes',
  // indexable_content is on the search endpoint. One request gets the measure, its date and its
  // wording. There is no second fetch. That is the whole reason the fast loop is possible.
  /indexable_content/.test(code) && !/api\/content.*await fetch/.test(code));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
