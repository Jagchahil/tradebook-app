// DOES THE BRAIN REACH THE MAN WHO TEXTS US?
//
// ⚠️ THE GAP THIS TEST EXISTS TO CLOSE, AND IT WAS INVISIBLE FOR A MONTH.
//
// Khoji reads GOV.UK every night. A human approves what it finds, one card at a time, in the
// console. `getRelevantKnowledge` reads back ONLY those approved, source-linked rows.
//
// And it was wired into exactly ONE surface: /api/ask, the Ask screen in the app.
//
// WHATSAPP IS THE PRODUCT. "Text it. It's in your Lekhio." So a man who TEXTED "has the mileage rate
// changed?" got an answer built from static rules, while the same man opening the app got the answer
// with the GOV.UK link attached. Every approval we made was invisible on the channel the entire
// company is named after. The brain was growing into a room almost nobody was in.
//
// Nothing failed. Nothing errored. It simply was not connected, which is this codebase's actual
// disease: silent success.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const wa = readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');
const ask = readFileSync(path.join(root, 'app/api/ask/route.ts'), 'utf8');
const claude = readFileSync(path.join(root, 'lib/claude.ts'), 'utf8');
const db = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nthe brain reaches WhatsApp, which is the whole product');

// --- THE GAP -----------------------------------------------------------------------------------

ok('THE BUG: WhatsApp now reads the approved knowledge, and it did not before',
  wa.includes('getRelevantKnowledge'));

ok('...and it passes it to the answer, rather than fetching it and dropping it on the floor',
  wa.includes('answerMoneyQuestion(body, summary, knowledge)'));

ok('the app Ask screen still does too. Both surfaces, one brain',
  ask.includes('getRelevantKnowledge'));

// --- THE GATE HOLDS ON THE NEW SURFACE ----------------------------------------------------------
//
// A new channel is a new way to leak. The filter is in the READ, not in the caller, so it cannot be
// forgotten by whoever wires up the next surface.

ok('THE GATE: only REVIEWED and VERBATIM rows can ever be read. The filter lives in the query',
  db.includes('knowledge_items?status=in.(reviewed,verbatim)'));

ok('...and a row with no source link can never be read either',
  db.includes('source_url=not.is.null'));

// --- IT MUST CITE ------------------------------------------------------------------------------
//
// We are not HMRC and we never imply we are. If we tell a man something about the return he is
// legally responsible for, he gets the link to the page it came from and can read it himself.
// That is the difference between an answer and an assertion.

ok('the WhatsApp answer is told to CITE the source when it uses the brain',
  claude.includes('END your reply with the source link on its own line'));

ok('...and to ignore the knowledge completely when it is not relevant, rather than padding',
  claude.includes('If none of them are relevant, ignore them completely'));

// --- IT DEGRADES SAFELY -------------------------------------------------------------------------
//
// An empty knowledge base, or a database that will not answer, must leave the reply exactly as it
// was. The brain can only ever ADD. This is the direction of failure we choose.

ok('knowledge is OPTIONAL, so a caller that does not pass it behaves exactly as before',
  claude.includes('knowledge = \'\',\n): Promise<string | null> {'));

ok('a failed knowledge read falls back to an empty string, never to an error the user sees',
  /catch \{\s*knowledge = '';\s*\}/.test(wa));


// --- THE ACCOUNTANT KNOWS THE FIGURES, ON EVERY CHANNEL ----------------------------------------
//
// 21 Jul, a live round-trip caught Rakha telling a WhatsApp customer to "send me a recent GOV.UK
// link" about the VAT registration threshold: a figure Khoji watches every night and the engine
// already holds. The WhatsApp answer had the customer's own figures and the approved updates, but NOT
// the built-in tax constants, so it punted. An accountant that asks the client to go fetch a link is
// backwards. Both channels now share ONE figures block, and the money answer is told never to send a
// customer off to look up a standard figure it already holds.
ok('the 2026/27 figures live in ONE shared block, so the two channels cannot drift',
  claude.includes('const TAX_FACTS_2627'));
ok('the shared figures block is spread into BOTH brains (app accountant and WhatsApp money answer)',
  claude.split('...TAX_FACTS_2627').length - 1 >= 2);
ok('the VAT registration threshold is one of those built-in figures',
  claude.includes('- VAT registration at £'));
ok('the WhatsApp accountant is told never to send a customer off to look up a figure it already holds',
  claude.toLowerCase().includes('you never tell them to look it up'));


// --- THE WALKTHROUGH MUST NOT TRAP, NOR HIJACK A QUESTION ---------------------------------------
// 21 Jul flood: "when is my tax return due?" started a 7-step guide instead of answering, and once
// inside, every following question was swallowed with "Reply NEXT or STOP" until the user found STOP.
ok('a deadline question never starts the tax-return walkthrough',
  wa.includes('if (!inFlow && isDeadlineQuestion(body)) return false;'));
ok('the old "Reply NEXT ... or STOP" trap message is gone from the walk step',
  !wa.includes('Reply NEXT for the next step, or STOP to finish.'));
ok('at the trade prompt, a question steps out rather than being filed as the trade',
  wa.includes('if (!TAXGUIDE_SKIP.test(body) && (isDeadlineQuestion(body) || isQuestion(body))) {'));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
