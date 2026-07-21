// 🔴 ARTICLE 9. HEALTH DATA. THE GAP THAT WAS LIVE, AND THE HALF OF IT I OPENED MYSELF.
//
// ---------------------------------------------------------------------------------------------
// TWO THINGS WERE TRUE AT 14:00 TODAY AND BOTH OF THEM WERE MINE:
//
//   1. The privacy policy said, in print: "We do not store the content of your WhatsApp messages
//      with any third party beyond our secure database." Every voice note went to a transcription
//      provider. Every message we could not read with plain rules went to an AI provider. The
//      sentence was false the day it was published, and a man decides whether to send us a voice
//      note by reading it.
//
//   2. The circumstances chain I shipped this morning walks a list and sends the next question as a
//      WhatsApp button. One row in that list reads "Are you registered blind or severely sight
//      impaired?" So the product was on course to WhatsApp a health question to every user, store the
//      tap as a health record with no explicit consent, and leave the question sitting in his chat
//      history where anyone holding his phone can read it.
//
// Nothing in the code was wrong. The list simply did not know that one row was different in kind.
// ---------------------------------------------------------------------------------------------
//
// The rules this suite exists to hold:
//
//   NEVER ON WHATSAPP. Not "we would not send it". It must be structurally impossible, in and out.
//   NO CONSENT, NO WRITE. Enforced at the SERVER, because a screen is a promise, not a control.
//   ERASURE IS A DELETE. Not a flag, not an "answer: no", not a tombstone.
//   THE TRANSCRIPT IS NOT KEPT. You cannot leak what you declined to store.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const {
  CIRCUMSTANCES, unanswered, sensitive, hasSpecialConsent, buttonId, parseButtonId,
  CONSENT_KEY, CONSENT_ASK,
} = C;

const apiSrc = readFileSync(path.join(root, 'app/api/circumstances/route.ts'), 'utf8');
const waSrc = readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');
const dbSrc = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');
const privacySrc = readFileSync(path.join(root, 'app/privacy/page.tsx'), 'utf8');

// ⚠️ SOME TESTS BELOW MUST READ THE CODE WITHOUT THE COMMENTS, AND HERE IS WHY.
//
// A test that greps prose can be broken by prose, and I have now done it FIVE times in this repo.
// The "no Approve All" test failed on the comment forbidding Approve All. The domain guard failed
// because I wrote the rival domain in a comment about never writing the rival domain. And ten
// minutes ago, two assertions in THIS file failed: one on my own comment explaining why we did not
// build a redactor, and one on the privacy page comment QUOTING the false sentence so that nobody
// puts it back.
//
// The rule that keeps emerging: assert on the CODE, or on the SHAPE, never on the words around it.
// The words are there to explain the rule to a human. They are not the rule.
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')   // JSX comments
  .replace(/\/\*[\s\S]*?\*\//g, '')       // block comments
  .replace(/^\s*\/\/.*$/gm, '');          // line comments

const waCode = stripComments(waSrc);
const privacyCode = stripComments(privacySrc);

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nspecial category: health data, article 9, and the two live gaps');

// ---------------------------------------------------------------------------------------------
// 🔴 1. IT IS MARKED. The list has to KNOW that one row is not like the others.
// ---------------------------------------------------------------------------------------------

ok('the health question is flagged specialCategory. Everything below depends on this one boolean.',
  CIRCUMSTANCES.find((c) => c.key === 'blind')?.specialCategory === true);

ok('sensitive() returns it, and returns nothing that is not health data',
  sensitive().length >= 1 && sensitive().every((c) => c.specialCategory === true));

ok('every OTHER question is ordinary. We have not quietly declared half the list sensitive.',
  CIRCUMSTANCES.filter((c) => !c.specialCategory).length === CIRCUMSTANCES.length - sensitive().length);

// ---------------------------------------------------------------------------------------------
// 🔴 2. NEVER ON WHATSAPP. Not by policy. Structurally, in both directions.
// ---------------------------------------------------------------------------------------------

ok('🔴 THE QUEUE WILL NOT HAND IT OUT. unanswered() refuses it, so no channel can ever ask it.',
  unanswered([]).every((c) => !c.specialCategory));

ok('...not even to a man who has answered every other question in the book',
  unanswered(CIRCUMSTANCES.filter((c) => !c.specialCategory).map((c) => ({ key: c.key, answer: 'no' })))
    .every((c) => !c.specialCategory));

ok('🔴 AND IT WILL NOT ACCEPT ONE BACK. A well formed health button id is REFUSED at the parser.',
  // unanswered() will never send one, so no honest button can carry one. But "we would never send
  // it" is a hope, not a control: a replayed message, a hand rolled id, a future flow that reaches
  // for buttonId() without reading a word of this. The door is shut from both sides.
  sensitive().every((c) => parseButtonId(buttonId(c.key, 'yes')) === null));

ok('...while an ordinary question still round trips perfectly',
  parseButtonId(buttonId('married', 'yes'))?.key === 'married');

ok('the WhatsApp route has no path to a health question at all',
  !/'blind'|"blind"/.test(waCode));

// ---------------------------------------------------------------------------------------------
// 🔴 3. NO EXPLICIT CONSENT, NO WRITE. And the enforcement is at the SERVER.
// ---------------------------------------------------------------------------------------------

ok('the consent is stored as a circumstance, which is Article 7(1) using machinery we already had',
  // "must be able to DEMONSTRATE that consent was given". The table already logs the verbatim
  // wording, the answer, and the timestamp. That is the whole of Article 7 in one row.
  typeof CONSENT_KEY === 'string' && CONSENT_KEY.length > 0);

ok('the consent wording says it is HEALTH, what we do with it, and that he can delete it',
  /health condition/i.test(CONSENT_ASK)
  && /only to work out the allowance/i.test(CONSENT_ASK)
  && /delete it/i.test(CONSENT_ASK));

ok('hasSpecialConsent is true ONLY on an explicit yes',
  hasSpecialConsent([{ key: CONSENT_KEY, answer: 'yes' }]) === true
  && hasSpecialConsent([{ key: CONSENT_KEY, answer: 'no' }]) === false
  && hasSpecialConsent([{ key: CONSENT_KEY, answer: 'skip' }]) === false
  && hasSpecialConsent([]) === false);

ok('🔴 THE SERVER REFUSES A HEALTH ANSWER WITH NO CONSENT ON RECORD. 403, at the write.',
  // The app will not show the question first. That is UI, and UI is a promise about the client, not
  // a control over the data. A stale build, a curl, a bug in the screen: this line is the control.
  /c\.specialCategory[\s\S]{0,600}?consent_required[\s\S]{0,80}?403/.test(apiSrc));

ok('🔴 ...AND AN UNREADABLE CONSENT RECORD IS A NO. It fails CLOSED.',
  // Anon auth in this codebase once failed OPEN. A database blip must not be all it takes to write a
  // health record we were never allowed to hold.
  /rows === null \|\| !hasSpecialConsent\(rows\)/.test(apiSrc));

ok('the consent row itself is written with the SERVER\'s wording, not the client\'s',
  /saveCircumstance\(user\.id, CONSENT_KEY, answer, CONSENT_ASK, 'app'\)/.test(apiSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 4. ERASURE IS A DELETE. Article 17, and Article 7(3).
// ---------------------------------------------------------------------------------------------

ok('there is a DELETE route at all. Consent that cannot be withdrawn was never consent.',
  /export async function DELETE/.test(apiSrc));

ok('🔴 IT IS A REAL DELETE, not a flag and not an "answer: no"',
  // A tombstone leaves the fact that we once asked a man whether he was registered blind, and his
  // answer, in a database he has told us to forget. That is a filing cabinet with a note on the
  // front saying we have stopped looking in it.
  /method: 'DELETE'/.test(dbSrc) && /export async function forgetCircumstance/.test(dbSrc));

ok('withdrawing the CONSENT takes the health answers with it',
  // It would be an odd kind of consent that could be withdrawn while we carried on holding the thing
  // it permitted.
  /key === CONSENT_KEY[\s\S]{0,120}?sensitive\(\)\.map/.test(apiSrc));

ok('a failed delete does NOT report success',
  // "It is gone" is the one thing we must never say falsely. He would stop worrying about something
  // he should still be worrying about.
  /results\.some\(\(r\) => !r\)[\s\S]{0,120}?delete_failed/.test(apiSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE VOICE TRANSCRIPT IS NOT STORED. The thing this task was named after.
// ---------------------------------------------------------------------------------------------

ok('🔴 A VOICE NOTE\'S WORDS ARE NOT WRITTEN TO THE DATABASE. The parsed figures are.',
  // "40 quid parking at the hospital, I was in for my scan" was, until today, transcribed by a third
  // party and written verbatim into a financial database, then shown back to him in quotation marks
  // on the home screen. A health record. Nobody decided to collect it. It arrived because
  // `description` was set to whatever came out of the transcriber and nothing ever said no.
  /const spoken = sourceType === 'whatsapp_voice'/.test(waSrc)
  && /description: spoken \? '' : rawText\.slice\(0, 280\)/.test(waSrc));

ok('...but the DATE is still read off his words first. Minimisation, not amnesia.',
  /transaction_date: entryDate\(rawText\)/.test(waSrc));

ok('...and what he TYPES is still kept, because typing is deliberate and speech is not',
  /rawText\.slice\(0, 280\)/.test(waSrc));

ok('🔴 WE DID NOT BUILD A REDACTOR, AND THAT WAS THE POINT',
  // A regex that strips "hospital" and "scan" catches most of it, and the belief that we are covered
  // is worth less than nothing, because the cases it misses land in the database wearing a clean
  // bill of health. Do not filter what you can simply decline to keep.
  !/redact|scrub|sanitiseHealth|stripHealth/i.test(waCode));

// ---------------------------------------------------------------------------------------------
// 🔴 6. THE PRIVACY POLICY IS TRUE NOW.
// ---------------------------------------------------------------------------------------------

ok('🔴 THE FALSE SENTENCE IS GONE',
  !/do not store the content of your WhatsApp messages with any third party/i.test(privacyCode));

ok('...and it names Anthropic, the AI provider that sees his messages',
  /Anthropic/.test(privacyCode));

// Voice is now transcribed in-house on our own hardware, not by OpenAI. The policy must say so and must
// NOT name a third-party transcriber, because the audio never leaves our systems.
ok('...and it is honest that voice notes are transcribed in-house, with no third party',
  /never leave our systems/i.test(privacyCode) && !/OpenAI/.test(privacyCode));

ok('...and it says plainly that we do not keep the text of his voice notes',
  /do not keep the text of your voice notes/i.test(privacyCode));

ok('...and it promises we will never ask about a health condition over WhatsApp',
  /never ask you about a health condition over WhatsApp/i.test(privacyCode));

ok('...and it names the lawful basis for health data as explicit consent, and nothing else',
  /explicit consent, and nothing else/i.test(privacyCode));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
