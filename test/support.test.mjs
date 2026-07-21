// THE WHATSAPP SUPPORT suite. Two things must hold. (1) The escalation detector fires on a real cry for
// help — "let me speak to a human", "this is broken", "I want a refund" — and stays quiet on ordinary
// bookkeeping traffic, because a false positive drags a paying customer out of the automated flow and
// onto Jag's desk for nothing. (2) The reply path stays locked: team-gated, and it re-checks the 24-hour
// window at send time so a free reply is never attempted after the window has closed (Meta would reject
// it). The locks are asserted by reading the route source so a future edit cannot quietly drop one.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isSupportRequest, supportReason } from '../lib/waintents.ts';
import { windowOpen, cleanReason, WINDOW_MS } from '../lib/support.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoWeb = path.resolve(here, '..');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// --- the detector FIRES on real escalations --------------------------------
const shouldEscalate = [
  'can I speak to a human',
  'I want to talk to someone',
  'let me speak to a real person',
  'is there a human I can talk to',
  'put me through to an agent',
  'I want to make a complaint',
  'this is a joke, terrible service',
  'I want a refund',
  'cancel my subscription',
  'you charged me twice',
  'my bank feed is not working',
  "the app isn't working",
  'something is broken',
  "you've made a mistake",
  'this figure is wrong',
  'I have a problem with my account',
];
for (const m of shouldEscalate) ok(`escalates: "${m}"`, isSupportRequest(m) === true);

// --- the detector STAYS QUIET on ordinary traffic --------------------------
const shouldNotEscalate = [
  'spent £40 on diesel',
  'got paid £600 by Dave',
  'drove 24 miles',
  'how much tax do I owe',
  'what is my profit this year',
  'help',                       // the generic help menu, not an escalation
  'thanks',
  'yes',
  'worked 30 hours from home',
  'has the mileage rate changed',
  'what can you do',
];
for (const m of shouldNotEscalate) ok(`stays quiet: "${m}"`, isSupportRequest(m) === false);

// --- reason classification -------------------------------------------------
ok('speak-to-human -> human', supportReason('can I speak to a human') === 'human');
ok('complaint -> complaint', supportReason('I want to make a complaint') === 'complaint');
ok('refund -> billing', supportReason('I want a refund') === 'billing');
ok('charged twice -> billing', supportReason('you charged me twice') === 'billing');
ok('not working -> problem', supportReason('my bank feed is not working') === 'problem');
ok('cleanReason guards junk', cleanReason('nonsense') === 'other');

// --- the 24-hour window ----------------------------------------------------
const nowMs = 1_700_000_000_000;
ok('window open just now', windowOpen(new Date(nowMs).toISOString(), nowMs) === true);
ok('window open at 23h', windowOpen(new Date(nowMs - 23 * 3600_000).toISOString(), nowMs) === true);
ok('window closed at 25h', windowOpen(new Date(nowMs - 25 * 3600_000).toISOString(), nowMs) === false);
ok('window closed on null', windowOpen(null, nowMs) === false);
ok('window closed on garbage', windowOpen('not-a-date', nowMs) === false);
ok('WINDOW_MS is 24h', WINDOW_MS === 24 * 60 * 60 * 1000);

// --- the reply route keeps its locks ---------------------------------------
const reply = readFileSync(path.join(repoWeb, 'app/api/team/support/reply/route.ts'), 'utf8');
ok('reply route is team-gated', /verifyAccessToken/.test(reply) && /isTeam/.test(reply));
ok('reply route re-checks the window at send time', /windowOpen\(ticket\.last_inbound_at\)/.test(reply));
ok('reply route refuses a closed window', /window_closed/.test(reply));
ok('reply route only sends on explicit action', /action === 'send'/.test(reply));

const readRoute = readFileSync(path.join(repoWeb, 'app/api/team/support/route.ts'), 'utf8');
ok('read route is team-gated', /verifyAccessToken/.test(readRoute) && /isTeam/.test(readRoute));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
