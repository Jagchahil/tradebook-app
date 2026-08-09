// A MAN MESSAGES LEKHIO AND SOMETHING THROWS. WHAT HE GETS BACK.
//
//   node test/whatsappnet.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT: SILENCE, WHICH IS THE WORST ANSWER ON THIS CHANNEL.
//
// processMessage caught every throw, logged one line, and returned. Meta already had its 200 at
// the top of the route, so nothing was retried and nothing was said. The customer got NOTHING.
// Not an error, not an apology. Silence, which he cannot tell from us being slow, so he waits.
//
// Three handlers were hardened against this one at a time (handleReceiptImage, handleVoiceNote,
// handleSchedule each catch and send a sentence) and roughly thirty five were not. Fixing them
// one at a time is how the first three took a fortnight and the rest never happened, so the net
// now goes under all of them at once, in the catch that was already there.
//
// 🔴 THIS RATCHET GUARDS FOUR FAILURES.
//
//   1. THE NET IS REMOVED, or the catch goes back to logging and returning.
//   2. IT STARTS FIRING BEFORE THE DAILY CAP. messageCapExceeded exists so a runaway sender
//      cannot generate a reply storm. A net that answers when the CAP CHECK threw becomes the
//      storm it was built to prevent, so it is gated on pastCap and this proves the gate.
//   3. THE APOLOGY ITSELF THROWS AND TAKES THE PROCESS WITH IT. processMessage runs inside
//      after(); a throw out of it is an unhandled rejection that helps nobody.
//   4. THE LOG STARTS CARRYING THE ERROR MESSAGE. Graph's error bodies reflect the recipient's
//      wa_id and PostgREST's quote the body they choked on. Vercel logs are an external service.
//
// ⚠️ THE SENTENCE IS CHECKED FOR WHAT IT PROMISES, NOT JUST THAT IT EXISTS. "Something went wrong"
// on its own leaves him wondering whether we logged his money or not. It has to say we did NOT,
// or he will not send it again and the entry is lost.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const wa = readFileSync(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    process.stdout.write(`\n  FAIL  ${name}`);
  }
};

// ── The function is where this file thinks it is. ────────────────────────────────────────────
ok('🔴 processMessage EXISTS, without which every assertion below is vacuous',
  /async function processMessage\(message: IncomingMessage\): Promise<void> \{/.test(wa));
const from = wa.indexOf('async function processMessage(');
const body = from > 0 ? wa.slice(from, wa.indexOf('\n}\n', from)) : '';
ok('and its body reads as one block, so the ordering assertions below are real',
  body.length > 500 && body.includes('messageCapExceeded'));

// ── The net. ─────────────────────────────────────────────────────────────────────────────────
ok('🔴 THE CATCH ANSWERS HIM RATHER THAN LOGGING AND RETURNING',
  /await sendText\(from, WENT_WRONG\);/.test(body));
ok('🔴 THE OLD SILENT CATCH IS GONE',
  !/\/\/ Already acknowledged to Meta\. Log and stop; never rethrow\.\n\s+const messageText/.test(wa));

// ── The cap gate, proved by ORDER and not just by presence. ──────────────────────────────────
// ⚠️ EVERY INDEX IS CHECKED FOR -1 FIRST. indexOf returns -1 for a marker that is not there, and
// -1 is less than everything, so an ordering test on a missing marker is a test that cannot fail.
const iDecl = body.indexOf('let pastCap = false;');
const iCap = body.indexOf('if (await messageCapExceeded(from)) return;');
const iSet = body.indexOf('pastCap = true;');
const iGate = body.indexOf('if (pastCap) {');
ok('all four cap markers exist, so the ordering below can actually fail',
  iDecl >= 0 && iCap >= 0 && iSet >= 0 && iGate >= 0);
ok('🔴 THE FLAG IS FALSE UNTIL THE CAP HAS BEEN PASSED, so a throw in the cap check stays silent',
  iDecl >= 0 && iCap >= 0 && iSet >= 0 && iDecl < iCap && iCap < iSet);
ok('🔴 AND THE APOLOGY IS GATED ON IT',
  iGate > iSet && /if \(pastCap\) \{[\s\S]{0,200}?sendText\(from, WENT_WRONG\)/.test(body));

// ── A failing apology may not take the process with it. ──────────────────────────────────────
ok('🔴 THE SEND IS ITSELF WRAPPED, because a throw out of processMessage is an unhandled rejection',
  /try \{\s*\n\s*await sendText\(from, WENT_WRONG\);\s*\n\s*\} catch \{/.test(body));

// ── The log says what it may say and nothing more. ───────────────────────────────────────────
ok('🔴 THE LOG CARRIES THE ERROR NAME, NEVER ITS MESSAGE',
  /console\.error\('\[whatsapp\] Handler error:', err instanceof Error \? err\.name : 'unknown'\);/.test(body)
  && !/Handler error:', messageText/.test(wa));

// ── The sentence itself, which is the only part he reads. ────────────────────────────────────
const m = /const WENT_WRONG = '([^']*)';/.exec(wa);
ok('the sentence is where this file thinks it is',
  m !== null);
if (m) {
  const line = m[1];
  ok('🔴 IT TELLS HIM WE DID NOT LOG IT, or he will not send it again and the entry is lost',
    /not logged/i.test(line));
  ok('🔴 AND IT TELLS HIM TO SEND IT AGAIN, because that is the one thing that recovers it',
    /again/i.test(line));
  ok('it does not promise we will come back to him, which we cannot do for a message we lost',
    !/come back to you|I will look|checking/i.test(line));
  ok('no forbidden dashes in it',
    !/[–—]/.test(line));
}

// ── The three that already answer for themselves still do. ───────────────────────────────────
// ⚠️ THE NET IS NOT A REASON TO REMOVE THEM. Each says something SPECIFIC to what he sent, which
// a general apology cannot: a receipt he can photograph again, a voice note, a reminder.
ok('🔴 handleVoiceNote STILL CATCHES AND ANSWERS IN ITS OWN WORDS',
  /reply = VOICE_NOT_TAKEN;/.test(wa));
ok('🔴 AND handleReceiptImage AND handleSchedule STILL DO TOO',
  (wa.match(/catch \(err\) \{/g) || []).length >= 3
  && /\[whatsapp\] Receipt|\[whatsapp\] Voice note threw|\[whatsapp\] Schedule/.test(wa));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
