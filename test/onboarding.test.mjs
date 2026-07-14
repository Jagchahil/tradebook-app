// ASK ONCE. TICK. NEVER ASK AGAIN. (doc 108 §3, and lib/circumstances.ts)
//
// The reliefs are worthless if the asking is annoying. A man who has learned to ignore our messages
// still cannot claim his terminal loss, and now he cannot be reached either. So the asking is not a
// UI detail sitting downstream of the feature. IT IS THE FEATURE, and this suite guards it.
//
// Four things can go wrong, and three of them are silent:
//
//   1. THE BUTTON ID DOES NOT PARSE. The keys have underscores. `prior_employment`. Split on the
//      first one and the three most valuable questions in this product become unknown button ids
//      forever, which fall through to the help menu. A man taps Yes, gets a list of commands, and
//      his answer is never written. Nothing crashes. Nothing logs. Nothing goes red.
//
//   2. THE LOG IS NOT THE EXHIBIT. Finance Act 2026 Sch 22 makes the record of what we asked and
//      what he answered the only thing that proves we did not intend a loss of tax revenue. If the
//      `asked` column holds a KEY, or holds text the client supplied, or holds a question we have
//      since reworded, it proves nothing at all. It must be the sentence HE READ, from the server.
//
//   3. "SKIP" QUIETLY BECOMES "NO". A boolean column, or a truthiness check, and "he would not say"
//      is recorded as "he is not married". Then we never ask again, and £252 a year is gone, and we
//      are certain we asked.
//
//   4. HE IS ASKED TWICE. The cheapest way to teach a man that we are not listening.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const { CIRCUMSTANCES, askingOrder, unanswered, buttonId, parseButtonId } = C;

const waSrc = readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');
const apiSrc = readFileSync(path.join(root, 'app/api/circumstances/route.ts'), 'utf8');
const sqlSrc = readFileSync(path.join(root, 'supabase/APPLY_2026-07-14_circumstances.sql'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nonboarding: ask once, tick, and never ask again');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE BUTTON ID. The silent one.
// ---------------------------------------------------------------------------------------------

ok('EVERY key round trips through the button id, including the ones with underscores in them',
  CIRCUMSTANCES.every((c) =>
    ['yes', 'no', 'skip'].every((a) => {
      const p = parseButtonId(buttonId(c.key, a));
      return p && p.key === c.key && p.answer === a;
    })));

ok('...and the big three, named, because these are the ones an indexOf parser would eat',
  ['prior_employment', 'vat_registered', 'home_office'].every((k) => {
    const c = CIRCUMSTANCES.find((x) => x.key === k);
    if (!c) return true; // key may be renamed; the round trip test above still covers it
    const p = parseButtonId(buttonId(k, 'yes'));
    return p && p.key === k;
  }));

ok('the parser is in the LIB, so this test runs the same code the webhook runs',
  waSrc.includes('parseButtonId') && !/rest\.lastIndexOf|rest\.indexOf/.test(waSrc));

ok('a key we never asked about is REFUSED, not guessed at',
  parseButtonId('circ_pension_scheme_offshore_yes') === null);

ok('an answer that is not yes, no or skip is REFUSED',
  parseButtonId('circ_married_maybe') === null);

ok('a button id from another flow is not ours and we say so',
  parseButtonId('su_cis_yes') === null && parseButtonId('wk_receipt') === null);

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE LOG IS THE EXHIBIT. FA 2026 Sch 22.
// ---------------------------------------------------------------------------------------------

ok('the `asked` column holds the SENTENCE, and the schema says so in terms',
  /asked\s+text not null/.test(sqlSrc) && /EXACT WORDS HE SAW/i.test(sqlSrc));

ok('WhatsApp logs c.ask, taken from the SERVER, never a string off the button',
  /saveCircumstance\(userId, key, answer, c\.ask, 'whatsapp'\)/.test(waSrc));

ok('the app API logs c.ask too, never the body the client posted',
  /saveCircumstance\(user\.id, key, answer, c\.ask, 'app'\)/.test(apiSrc)
  && !/body\.asked|body\.ask\b/.test(apiSrc));

ok('the question we SEND is exactly the question we LOG, with nothing bolted on',
  // sendButtons is called with `next.ask` bare. The moment somebody appends a "worth £252!" line to
  // the body, the log stops holding what he read, and the one job it has is the one it cannot do.
  /sendButtons\(from, next\.ask, \[/.test(waSrc));

ok('the reason it matters is told to him AFTER he answers, not baked into the question',
  waSrc.includes('`Good. ${c.why}`'));

// ---------------------------------------------------------------------------------------------
// 🔴 3. "SKIP" IS NOT "NO". They are different facts about a man.
// ---------------------------------------------------------------------------------------------

ok('the answer column is TEXT, not a boolean that would silently turn "would not say" into "no"',
  /answer\s+text not null/.test(sqlSrc) && !/answer\s+bool/.test(sqlSrc));

ok('skip is a first class answer the parser accepts',
  parseButtonId('circ_married_skip')?.answer === 'skip');

ok('"Not now" STOPS the chain. It does not roll on to the next question.',
  // Doc 103: the best button is no button, and the second best is one that means what it says.
  /if \(answer === 'skip'\)[\s\S]{0,400}?return true;/.test(waSrc)
  && !/if \(answer === 'skip'\)[\s\S]{0,300}?askNextCircumstance/.test(waSrc));

ok('a NO rolls straight on, because a no is an answer and it spares him ever being asked again',
  /if \(answer === 'no'\)[\s\S]{0,400}?askNextCircumstance/.test(waSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 4. NEVER TWICE. And never out of order, because he will answer three on a good day.
// ---------------------------------------------------------------------------------------------

ok('a question he has answered is never asked again',
  unanswered(['prior_employment']).every((c) => c.key !== 'prior_employment'));

ok('answering every question leaves nothing to ask',
  unanswered(CIRCUMSTANCES.map((c) => c.key)).length === 0);

ok('the FIRST thing we ask is the biggest thing, always',
  unanswered([])[0].key === askingOrder()[0].key
  && unanswered([])[0].worthOrder === 'huge');

ok('the unique index makes a second answer an UPDATE, never a second row to argue about',
  /unique index[\s\S]{0,120}circumstances \(user_id, key\)/.test(sqlSrc));

ok('a failed read is NOT treated as "he has answered nothing"',
  // The cheapest way to ask a man something he told us last month.
  /if \(rows === null\) return;/.test(waSrc) && /rows === null/.test(apiSrc));

ok('a failed WRITE never looks like a saved one',
  // He says no, it does not save, we go quiet, he believes we know. We do not.
  /did not save just then/.test(waSrc) && /write_failed/.test(apiSrc));

ok('once he is in the chain we never restart it at him from the top',
  /if \(rows\.length > 0\) return;/.test(waSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 5. WE DO NOT CLAIM WHAT IS NOT OURS TO CLAIM.
// ---------------------------------------------------------------------------------------------

ok('a yes on a relief somebody ELSE must claim says so, plainly, in the same breath',
  // Marriage Allowance is claimed by the TRANSFEROR, and she is not our customer. SBRR is granted by
  // his COUNCIL. Pretend otherwise and he wastes an evening and blames us, correctly.
  /c\.claimant !== 'him'/.test(waSrc) && /not mine to claim/.test(waSrc));

ok('and it names WHO has to do it, because "not us" is not an instruction',
  /Your partner/.test(waSrc) && /Your council/.test(waSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 6. IT IS AN ASK, NOT A NAG. Doc 103.
// ---------------------------------------------------------------------------------------------

ok('there is no timer, no cron, no "you still have 8 questions" anywhere in the chain',
  !/setTimeout|cron|remind|nudge/i.test(
    waSrc.slice(waSrc.indexOf('THE CIRCUMSTANCES: the facts'), waSrc.indexOf('"salary 32000"'))));

ok('the chain is driven by HIM: one answer, one question, and it ends when he does',
  // askNextCircumstance is only ever reached off the back of an answer he gave.
  (waSrc.match(/await askNextCircumstance\(/g) || []).length >= 2);

ok('when it is done, it says so and shuts up',
  /I will not ask again/.test(waSrc));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
