// Tests for lib/routing.ts, THE TABLE THAT DECIDES WHICH CHANNEL A MESSAGE GOES DOWN.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS.
//
// From 1 October 2026 Meta bills WhatsApp per MESSAGE rather than per 24 hour conversation, and
// lib/margin.ts puts the 82% floor break at 56 outbound messages a month, which is two a day. So
// every outbound message is now a cost decision, and before this table there were 152 of them
// taken inline across the codebase with nothing recording that a decision had been taken at all.
//
// What it defends:
//   1. THE TABLE IS COMPLETE AND HAS NO DEAD ROWS. One row per message type, no duplicates.
//   2. EVERY ROW CARRIES ITS REASONING. A row with no why is a decision nobody can revisit.
//   3. NO ROW POINTS AT A TEMPLATE THIS REPO CANNOT SEND. The 27 July failure, in a new place.
//   4. 🔴 CAPTURE NEVER ROUTES TO A PAID CHANNEL. The 28 July decision, pinned.
//   5. channelsFor REFUSES RATHER THAN SUBSTITUTES. A channel we cannot reach simply drops out.
//   6. THE BILLABLE LIST IS PINNED. Adding a paid route is a visible line in a diff.
//   7. THE INLINE sendText COUNT MAY FALL BUT NEVER RISE. A ratchet, so the sixty become fifty
//      and never sixty one, without demanding they all move today.
//
// Run: node test/routing.test.mjs   (Node 22.6+, type stripping). Pure, no network, no database.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const lib = path.join(repo, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'routing-'));

// routing.ts imports watemplates.ts, and since 10 August margin.ts as well, which in turn imports
// aicost.ts. The extensionless import has to gain a .ts on the way in: Next resolves it, bare Node
// under type stripping does not. Same fix as test/announcements.test.mjs, which stages
// lib/housestyle.ts the same way.
//
// ⚠️ THE WHOLE OF lib/ IS STAGED RATHER THAN A NAMED LIST, AND THAT IS THE 10 AUGUST LESSON IN
// MINIATURE. The list used to be two files. templateLegBlock started asking waSendsEnabled(), so it
// became three, and margin.ts's own import made it four. A hand maintained list of transitive
// dependencies is a thing that goes stale silently and fails as a module resolution error nobody
// expected, which is a small cousin of the fault this whole push is about. Staging every lib file
// costs milliseconds and cannot go out of date. Only what routing actually imports gets executed.
//
// ⚠️ AND margin.ts IS STAGED RATHER THAN STUBBED, ON PURPOSE. The entire point of templateLegBlock
// is that the kill switch has ONE implementation. A test that stubbed it would be exercising a
// second copy of the rule while claiming to test the first.
const fix = (s) => s.replace(/from '\.\/([A-Za-z0-9_-]+)'/g, "from './$1.ts'");
for (const f of readdirSync(lib)) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), fix(readFileSync(path.join(lib, f), 'utf8')));
}
const R = await import(pathToFileURL(path.join(stage, 'routing.ts')).href);
const W = await import(pathToFileURL(path.join(stage, 'watemplates.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// Every message type the union declares, read out of the source rather than duplicated here. A
// list typed twice is a list that drifts, which is the failure this whole file is about.
// Comments are stripped first. The union carries a comment explaining why three of the types are
// named alert_ rather than agent_, and that comment quotes a type name: without the strip, the
// explanation of the rule would be read as a declaration and the test would demand a row for it.
// stripComments is a hoisted function declaration, defined in section 7 below.
const SRC = stripComments(readFileSync(path.join(lib, 'routing.ts'), 'utf8'));
const unionBlock = SRC.match(/export type MessageType =([\s\S]*?);/);
const DECLARED_TYPES = unionBlock
  ? [...unionBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  : [];

const CHANNELS = new Set(['thread', 'push', 'email', 'whatsapp_reply', 'whatsapp_template']);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE TABLE IS COMPLETE AND HAS NO DEAD ROWS');

const ROUTES = R.ROUTES;
ok('the table is a non empty array', Array.isArray(ROUTES) && ROUTES.length > 0);
ok('the MessageType union was read from the source', DECLARED_TYPES.length > 0);

const rowTypes = ROUTES.map((r) => r.type);
ok('no duplicate rows', new Set(rowTypes).size === rowTypes.length);

const missing = DECLARED_TYPES.filter((t) => !rowTypes.includes(t));
ok(`every declared message type has a row${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`, missing.length === 0);

const orphans = rowTypes.filter((t) => !DECLARED_TYPES.includes(t));
ok(`no row for a type that does not exist${orphans.length ? ` (orphans: ${orphans.join(', ')})` : ''}`, orphans.length === 0);

for (const r of ROUTES) {
  ok(`${r.type}: has at least one channel`, Array.isArray(r.channels) && r.channels.length > 0);
  ok(`${r.type}: every channel is a real channel`, r.channels.every((c) => CHANNELS.has(c)));
  ok(`${r.type}: no channel listed twice`, new Set(r.channels).size === r.channels.length);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. EVERY ROW CARRIES ITS REASONING');
//
// Not a style rule. The next person to move a row needs to know what the last person was
// weighing, or they move it back and the reasoning is lost for good. A sentence is cheap and a
// rediscovered decision is not.

for (const r of ROUTES) {
  ok(`${r.type}: why is a real sentence, not a label`, typeof r.why === 'string' && r.why.trim().length >= 40);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. NO ROW POINTS AT A TEMPLATE THIS REPO CANNOT SEND');
//
// The 27 July failure was four templates that did not exist in Meta, failing silently every night
// for weeks. A routing table is a brand new place to write that same bug, so it is checked here
// too rather than trusted.

ok('no row names an undeclared template', R.routesWithUnknownTemplate().length === 0);
ok('template channel and template name always agree', R.routesWithBrokenTemplateWiring().length === 0);

for (const r of ROUTES) {
  if (!r.template) continue;
  const t = W.findTemplate(r.template);
  ok(`${r.type}: ${r.template} is in the registry`, !!t);
  // An unapproved template must be gated. watemplates.ts already asserts this over the registry;
  // asserted again from the routing side, because a route is the thing that would actually fire it.
  if (t) ok(`${r.type}: ${r.template} is approved or gated`, t.meta === 'approved' || !!t.gate);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. 🔴 CAPTURE NEVER ROUTES TO A PAID CHANNEL');
//
// The single most important assertion in this file. capture_ack is the highest volume message in
// the product: every receipt, every voice note, every day. Jag decided on 28 July 2026 that it
// goes push and email and never WhatsApp, and one line in one file could undo that with nothing
// else in the codebase noticing until a statement arrived in November.

ok('capture_ack does not reach a billable channel', R.captureRoutesToWhatsApp() === false);

const ack = R.routeFor('capture_ack');
ok('capture_ack exists', !!ack);
ok('capture_ack sends a push', !!ack && ack.channels.includes('push'));
ok('capture_ack always sends an email', !!ack && ack.channels.includes('email'));
ok('capture_ack sends no whatsapp reply', !!ack && !ack.channels.includes('whatsapp_reply'));
ok('capture_ack sends no whatsapp template', !!ack && !ack.channels.includes('whatsapp_template'));

// The conversation is the other half of the same decision: it must never be routed at WhatsApp,
// because conversation volume is exactly what the 1 October change prices.
const answer = R.routeFor('conversation_answer');
ok('conversation_answer goes to the thread', !!answer && answer.channels.includes('thread'));
ok('conversation_answer reaches no billable channel', !!answer && !answer.channels.some(R.isBillable));

// And the weekly summary, which item 2 already moved to a pull on 27 July. Asserted here so the
// routing table cannot quietly put it back on a paid channel.
const weekly = R.routeFor('weekly_ready');
ok('weekly_ready reaches no billable channel', !!weekly && !weekly.channels.some(R.isBillable));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. channelsFor REFUSES RATHER THAN SUBSTITUTES');
//
// A channel we cannot reach him on drops out. It is never swapped for another one, because a
// message that quietly went somewhere else is indistinguishable from a message that arrived.

const everything = { hasPush: true, hasEmail: true, hasWhatsApp: true };
const noApp = { hasPush: false, hasEmail: true, hasWhatsApp: true };
const nothing = { hasPush: false, hasEmail: false, hasWhatsApp: false };

const ackAll = R.channelsFor('capture_ack', everything);
ok('capture_ack with the app: push and email, both', ackAll.includes('push') && ackAll.includes('email') && ackAll.length === 2);

const ackNoApp = R.channelsFor('capture_ack', noApp);
ok('capture_ack with no app: email only', ackNoApp.length === 1 && ackNoApp[0] === 'email');
ok('capture_ack with no app never falls back to whatsapp', !ackNoApp.some(R.isBillable));

ok('a man we cannot reach at all gets an empty list, not a guess', R.channelsFor('capture_ack', nothing).length === 0);
ok('an unknown message type routes nowhere', R.channelsFor('not_a_real_type', everything).length === 0);

// The thread needs no address of any kind: it is a page he signs in to, so it is always available.
ok('the thread is available even to a man with no push and no email', R.channelsFor('conversation_answer', nothing).includes('thread'));

// A gated template is not a channel. reminder_due carries lekhio_reminder behind
// REMINDER_TEMPLATES_APPROVED, which is NOT set in production today, so it must drop out.
const gateOff = R.channelsFor('reminder_due', everything, {});
ok('a gated off template drops out of the channel list', !gateOff.includes('whatsapp_template'));
ok('the rest of the row still stands when a template drops', gateOff.includes('push'));

const gateOn = R.channelsFor('reminder_due', everything, { REMINDER_TEMPLATES_APPROVED: 'true' });
ok('flipping the gate puts the template back', gateOn.includes('whatsapp_template'));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. THE BILLABLE LIST IS PINNED');
//
// Written out by hand on purpose. Adding a message type that can put a paid message on the wire
// should be a line somebody had to change in a test, not a quiet consequence of a helpful edit.

const EXPECTED_BILLABLE = [
  'capture_unreadable',
  // 🔴 ADDED 30 JULY WITH ITEM 4, AND IT IS THE ONE PAID ROUTE THAT WAS NOT A CHOICE.
  //
  // Every other line here is a message we decided was worth paying for. This one is the reply to a
  // WhatsApp binding code, sent at the single moment in a customer's life when WhatsApp is the only
  // channel that exists for him: nothing is bound yet, so there is no push target and no thread.
  // Once per customer for ever, which is the opposite end of the volume scale from capture_ack.
  'connect_result',
  // ⚠️ ADDED 30 JULY WITH THE PAYWALL, and it is the odd one: we pay to tell a man who has stopped
  // paying us that we have stopped working. Silence in the channel he just used reads as the product
  // being broken, and a customer who thinks we are broken does not come back to pay. Bounded by the
  // durable per phone daily cap in processMessage.
  'work_paused',
  'nudge',
  'reminder_due',
  'trial_ending',
  'trial_ended',
  'alert_threshold',
  'alert_deadline',
  'alert_opportunity',
];
const actualBillable = R.billableTypes();
ok(
  `exactly ${EXPECTED_BILLABLE.length} message types can cost money (got ${actualBillable.length}: ${actualBillable.join(', ')})`,
  actualBillable.length === EXPECTED_BILLABLE.length && EXPECTED_BILLABLE.every((t) => actualBillable.includes(t)),
);

ok('a service reply is priced as a service reply', R.costKind('whatsapp_reply') === 'service');
ok('a template is priced as a proactive send', R.costKind('whatsapp_template') === 'proactive');
ok('the thread is never priced', R.costKind('thread') === null);
ok('email is never priced', R.costKind('email') === null);
ok('push is never priced', R.costKind('push') === null);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n8. THE TABLE HAS CALLERS, AND THE REACH IT DESCRIBES IS REAL');
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS SECTION EXISTS BECAUSE THE TABLE WAS DECORATIVE FOR TWO DAYS AND NOBODY COULD TELL.
//
// From 28 July it said `weekly_ready` goes to ['push','email'] and both trial rows go to
// ['whatsapp_template','email']. Not one line of code asked it anything, and the email half of all
// three did not exist. So the table described a product we did not have, and every one of those
// messages went to a phone or an app that a web customer has not got. Launch one is the web, so on
// 10 August the Sunday notification and the entire trial ladder would have reached ZERO people
// while logging clean runs every time.
//
// Sections 1 to 6 all passed throughout. They check that the table is well formed, which it was.
// Nothing checked that anything READ it. That is the gap this closes.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const src = (rel) => readFileSync(path.join(repo, rel), 'utf8');
const TRIAL_ROUTE = 'app/api/cron/trial/route.ts';
const WEEKLY_ROUTE = 'app/api/cron/reminders/route.ts';
const WA_ROUTE = 'app/api/whatsapp/route.ts';

ok('🔴 the trial cron asks the table which channels to use',
  /channelsFor\(/.test(src(TRIAL_ROUTE)) && /'trial_ending'/.test(src(TRIAL_ROUTE)) && /'trial_ended'/.test(src(TRIAL_ROUTE)));
ok('🔴 the weekly job asks the table which channels to use',
  /channelsFor\('weekly_ready'/.test(src(WEEKLY_ROUTE)));
ok('🔴 the WhatsApp binding reply asks the table too',
  /channelsFor\('connect_result'/.test(src(WA_ROUTE)));

// 🔴 THE EMAIL HALF IS REAL. A row saying 'email' with no sender behind it is the exact thing this
// section was written about, so every route whose row names email must actually call an email sender.
ok('🔴 the trial cron really sends email', /sendTrialWeekEmail|sendTrialEndedEmail/.test(src(TRIAL_ROUTE)));
ok('🔴 the weekly job really sends email', /sendWeeklyReadyEmail/.test(src(WEEKLY_ROUTE)));

// 🔴 AND THE WEEKLY WALK IS NOT PHONE GATED ANY MORE.
//
// listNudgeTargetsPage filters `phone_number=not.is.null`, correctly, because it feeds the WhatsApp
// nudge. The weekly notification shared it, so a web customer was not even a candidate. The two
// jobs now have their own pagers and this asserts they stay that way.
const supabaseSrc = src('lib/supabase.ts');
const weeklyPager = supabaseSrc.slice(
  supabaseSrc.indexOf('export async function listWeeklyTargetsPage'),
  supabaseSrc.indexOf('export async function emailsForUsers'),
);
ok('the weekly pager was actually found, so the check below is not vacuous', weeklyPager.length > 200);
ok('🔴 the weekly pager does not filter on a phone number', !/phone_number=not\.is\.null/.test(weeklyPager));
ok('the nudge pager still does, because a nudge with no number to send to is not a nudge',
  /phone_number=not\.is\.null/.test(supabaseSrc.slice(
    supabaseSrc.indexOf('export async function listNudgeTargetsPage'),
    supabaseSrc.indexOf('export async function listNudgeTargetsPage') + 1500,
  )));
ok('the weekly job uses the unfiltered pager', /listWeeklyTargetsPage/.test(src(WEEKLY_ROUTE)));

// 🔴 A MAN MID TRIAL HEARS FROM US ONCE. Jag, 30 July: he gets nothing until the day before it
// ends, and that one message carries his week. A Sunday notification beside it is the second
// message he was promised he would not get.
ok('🔴 the Sunday walk leaves a man mid trial alone', /trialingUserIds/.test(src(WEEKLY_ROUTE)));

// 🔴 THE TRIAL GATE STOPS THE TEMPLATE, NOT THE MESSAGE. TRIAL_TEMPLATES_APPROVED used to wrap the
// whole cron, so an unset flag (it is unset today) meant silence by every route including email.
const trialSrc = src(TRIAL_ROUTE);
// ⚠️ REWRITTEN 10 AUGUST 2026, AND THE INTENT IS UNCHANGED. This used to pin the literal
// `hasWhatsApp: Boolean(job.row.phone) && TEMPLATES_ON()`, which folded the gate into the
// REACHABILITY question and, worse, used trial_ending's gate for both nudges. Harmless only while
// the two templates happen to share a switch. hasWhatsApp now means what its name says, and the
// gate lives where the comment above always claimed it did: inside channelsFor, per type, touching
// the template leg and nothing else.
ok('🔴 hasWhatsApp IS REACHABILITY ONLY: no gate folded into "can we reach him"',
  /hasWhatsApp: Boolean\(job\.row\.phone\),/.test(trialSrc));
ok('🔴 AND THE GATE IS ASKED PER TYPE, by the table, at the moment of sending',
  /channelsFor\(\s*\n?\s*job\.nudge === 'warn' \? 'trial_ending' : 'trial_ended'/.test(trialSrc));
ok('🔴 the template gate no longer decides whether he hears anything at all',
  /channels\.includes\('email'\)/.test(trialSrc));
ok('and the email send is not behind that gate',
  !/TEMPLATES_ON\(\)[\s\S]{0,200}sendTrialWeekEmail/.test(trialSrc));
// The WhatsApp leg is still gated, and still asks the registry rather than an env var of its own.
ok('the WhatsApp leg is still refused when the template cannot be sent',
  /templateSendable\(templateFor\(job\.nudge\)\)/.test(trialSrc));

// Reaching nobody is COUNTED. The difference between a quiet week and a broken channel is whether
// that number is on the page.
ok('the trial cron reports who it could not reach', /unreachable/.test(trialSrc));
ok('the weekly job reports who it could not reach', /no_channel|noChannel/.test(src(WEEKLY_ROUTE)));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n7. THE INLINE sendText COUNT MAY FALL BUT NEVER RISE');
//
// A ratchet, and deliberately not a ban. There were 152 inline sendText call sites when this was
// written, across app/ and lib/, most of them in the WhatsApp webhook, and moving all of them at
// once would be a change too large to verify honestly in one go. So the count is recorded here: it
// may go down as call sites move onto the table, and a new one fails the build.
//
// When you move a batch, lower this number in the same commit. That edit is the point: it makes
// the direction of travel a thing somebody has to type.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ 152 BECAME 153 ON 30 JULY, WHICH IS THE DIRECTION THIS TEST EXISTS TO REFUSE, SO HERE IS THE
// WHOLE ARGUMENT RATHER THAN A SHRUG.
//
// Item 4 added handleConnectCode, the reply to a WhatsApp binding code. It caught the ratchet
// immediately, at 158, because the first draft answered from six places.
//
// Five of those six were removed by making the handler decide a verdict and send once. The sixth
// cannot be removed by any amount of tidying: it is a genuinely new outbound message, and there is
// no send in this codebase that does not eventually call sendText.
//
// What makes raising it the right answer rather than the easy one is what came with it. This send
// is the FIRST caller channelsFor has ever had. Before item 4 the table described where every
// message in the product should go and governed nothing at all, which is a document with a type
// annotation on it. handleConnectCode asks the table and refuses to send when the answer is empty.
//
// So the rule this number now encodes, and the bar for touching it again:
//
//   IT MAY FALL FREELY. It may rise ONLY for a new message type that has a row in ROUTES, whose
//   send ASKS channelsFor rather than deciding for itself, and by no more than one call site per
//   message type. Anything else is the old habit wearing a justification.
//
// ⚠️ 153 BECAME 154 ON 30 JULY, and the rule above is exactly what forced the shape of it. The
// paywall's WhatsApp side was written with three sends, one each for a photo, a voice note and a
// text. The ratchet refused it at 156. Collapsing them into sayWorkPaused(), which asks the table,
// left one. The rule worked as intended: it did not stop the feature, it stopped the sprawl.
//
// 🔴 AND 154 WENT BACK TO 153 ON 31 JULY, BECAUSE THE CEILING HAD DRIFTED ABOVE THE CODE IT GUARDS.
//
// The rise above was argued for honestly. What it left behind was a ceiling one higher than the
// count: measured with this test's own algorithm on 31 July the repo held 153 call sites while this
// number said 154. A ratchet with a spare slot in it is not a ratchet, it is a countdown, and it
// spends itself on whichever send happens to be written next rather than on one anybody weighed.
//
// So the ceiling now sits ON the count, which is the only value at which a new send is a
// conversation. If a legitimate one lands, raise this to the new count and write the argument here,
// the way every rise above did.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ 153 BECAME 154 ON 17 AUGUST 2026, FOR THE SCOTTISH RATES LANE. B16. HERE IS THE ARGUMENT, AND
// PART OF IT IS THAT THE RULE ABOVE DOES NOT QUITE FIT, WHICH IS WORTH SAYING OUT LOUD RATHER THAN
// QUIETLY SATISFYING ON PAPER.
//
// What landed: app/api/whatsapp/route.ts answers a Scottish rates question from lib/scotland.ts and
// never asks the model. B2 walked a Glasgow sole trader and caught the conversational lanes stating
// Scottish tax law of their own, wrongly, twice in one account: "your tax rates are the same as the
// rest of the UK", then a band table with a 41% higher rate and no advanced rate. The prompt rule
// that should have governed both was fixed the same day and is mitigation, not a gate. This send is
// the gate.
//
// ⚠️ WHY IT DOES NOT ASK channelsFor, AND WHY THAT IS NOT THE OLD HABIT WEARING A JUSTIFICATION.
// The rule above was written for a MESSAGE TYPE: a thing this product decides to say to a customer,
// which therefore has a channel question to answer, which is what ROUTES exists to answer. This is
// a REPLY. He wrote to us on WhatsApp and the reply goes back down the socket he wrote in on; there
// is no channel to choose and channelsFor has no opinion to give. Every deterministic reply lane on
// this router is shaped this way already: the data rights answer, somebody else's money, the vent
// reply. None asks the table, and a row in ROUTES for "the answer to the question he just asked"
// would be a document with a type annotation on it, which is the exact thing the 30 July note
// complained about.
//
// ⚠️ SO THE TEST THIS ONE HAD TO PASS INSTEAD WAS THE COLLAPSE TEST, AND IT WAS ACTUALLY APPLIED.
// The obvious cheaper move is to fold the fixed sentence lanes into one table of predicate and
// constant, which would have LOWERED this number rather than raised it. It was rejected on the
// merits and not on effort: those lanes sit at three deliberately different HEIGHTS in a first match
// chain. The data rights gate sits above the claim corpus because "delete all my data" was answered
// with a verdict on phone and broadband. Somebody else's money sits above every lane that reads his
// rows. This one sits BELOW the totals lane, because since J8 a man asking how much to put by gets
// his figure with the sentence on it, and hoisting it would hand him a rule instead of a number.
// test/laneparity.test.mjs holds all three of those orders. One table entry cannot hold three
// heights, so collapsing them would trade a real ordering guarantee for a count.
//
// It is one call site, for one new reply, in the lane that stops a model inventing a man's tax
// bands. The rule's spirit holds: it did not stop the feature, and it made the sprawl a decision.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '_to_delete']);
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = path.join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

// Comments are stripped first, so a comment explaining why a sendText was removed does not itself
// count as a sendText. test/watemplates.test.mjs learned that trap the same way.
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🟢 AND 154 WENT BACK TO 153 ON 17 AUGUST 2026, A FEW HOURS LATER, BY THE SAME 31 JULY RULE.
//
// B18 collapsed handleVatQuestion in app/api/whatsapp/route.ts. It held two sends, the answer and
// an honest refusal on a failed read, plus forty lines of window arithmetic and sentence assembly
// that the web chat and the in app accountant did not have and therefore could not give a customer.
// The read moved to lib/vatanswer.ts, the words to lib/vatstanding.ts, and all three routers now
// call one function. The handler that is left has ONE send in it.
//
// So the count fell to 153 and this number follows it down, unasked, because the alternative is the
// spare slot the paragraph above spends a whole page refusing: a ratchet sitting one above the code
// is a countdown that gets spent on whichever send is written next rather than on one anybody
// weighed. A ceiling that only ever ratchets DOWN when work is shared out is the ratchet doing the
// job it was built for.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const CALL_SITE_CEILING = 153;
let callSites = 0;
const perFile = [];
for (const f of [...walk(path.join(repo, 'app')), ...walk(lib)]) {
  if (f === path.join(lib, 'whatsapp.ts')) continue; // where sendText is defined, not called
  const body = stripComments(readFileSync(f, 'utf8'));
  const n = (body.match(/\bsendText\s*\(/g) || []).length;
  if (n > 0) perFile.push([path.relative(repo, f), n]);
  callSites += n;
}
perFile.sort((a, b) => b[1] - a[1]);

// ⚠️ THE FAILURE HAS TO ARGUE, OR IT ONLY TEACHES PEOPLE TO EDIT THE NUMBER.
//
// This used to fail as a bare boolean with a count in brackets. The only move such a failure
// suggests is raising the ceiling, so that is the move it gets, and the ratchet quietly becomes a
// record of how many sends we have rather than a limit on them. So the failure says the count, the
// ceiling, where the sends actually are, and both of the two answers that are allowed.
const ratchetFailure = [
  `🔴 inline sendText call sites ROSE to ${callSites}. The ceiling is ${CALL_SITE_CEILING}, so this is ${callSites - CALL_SITE_CEILING} over.`,
  '',
  '     WHY THIS IS A FAILURE AND NOT A NUISANCE. Outbound WhatsApp was deliberately concentrated',
  '     into a small number of sends, and from 1 October Meta bills per message rather than per',
  '     conversation. A send that spreads back out is a cost decision nobody recorded taking.',
  '',
  '     TWO WAYS OUT. RAISING THE NUMBER ON ITS OWN IS NEITHER OF THEM.',
  '       1. CONCENTRATE THE SEND. Work out the verdict in one place and send once, or hand the',
  '          words to a send that already exists. handleConnectCode went from six sends to one that',
  '          way, and the paywall went from three to sayWorkPaused().',
  '       2. ARGUE FOR THE RATCHET OUT LOUD. It may rise ONLY for a new message type that has a row',
  '          in ROUTES, whose send asks channelsFor rather than deciding for itself, and by at most',
  '          one call site per message type. Then raise CALL_SITE_CEILING in the same commit and',
  '          write the reason in the block above it, the way every rise so far has.',
  '',
  '     Where the sends are today:',
  ...perFile.map(([f, n]) => `       ${String(n).padStart(4)}  ${f}`),
].join('\n');

ok(
  callSites <= CALL_SITE_CEILING
    ? `inline sendText call sites are at or below the ceiling (${callSites} of ${CALL_SITE_CEILING})`
    : ratchetFailure,
  callSites <= CALL_SITE_CEILING,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n9. 🔴 NO ROW GOES DECORATIVE UNNOTICED, AND THE CAPTURE WALK ANSWERS ON EVERY PATH');
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS: SECTION 8 CLOSED THE HOLE FOR FIVE ROWS AND LEFT IT OPEN FOR THE OTHER EIGHT.
//
// Section 8 was written because the table had been decorative for two days and nobody could tell.
// It closed that by NAMING the routes that read it. Naming is not a rule. The rows it did not name
// went on governing nothing, and nothing failed, which is the same gap in a smaller font.
//
// capture_ack is the row that cost us a launch week. On 7 August 2026 it was raised as a Tier One
// defect, "a WhatsApp receipt capture is acknowledged NOWHERE", on two true facts and one false
// sentence:
//
//   TRUE   nothing in app/ or lib/ reads this row. It governs nothing.
//   TRUE   lib/email.ts has no capture sender, so the email half of the row does not exist.
//   FALSE  the comment above the row said "the email always goes, so there is always something".
//
// The conclusion was wrong. app/api/whatsapp/route.ts answers every receipt inline on WhatsApp, in
// his own free window, so no customer was ever left silent. But the reading was a fair one, because
// the source said something untrue and no test in this repo could tell. THAT is the defect, and the
// next person to reach it might reach it by DELETING the inline reply on the strength of a row that
// promises an email nobody wrote. Then the Tier One item becomes true.
//
// So three rules, all computed rather than believed:
//
//   9a. Every row is either READ by shipping code or listed below as not wired. Moving a row
//       between those two lists is a line somebody has to type.
//   9b. The claim that a capture email always goes may only appear in lib/routing.ts on a day when
//       lib/email.ts really has a capture sender.
//   9c. The receipt walk in the webhook answers on EVERY path, including the ones where something
//       throws. It is executed here, not read.
//   9d. The VOICE walk does the same, and additionally never apologises for a note it has already
//       parked. Executed, not read.
//   9e. The REMINDER walk does the same. It is the third walk with this shape and the second that
//       makes a promise.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The arguments of a named call, with the brackets WALKED rather than matched by a regex. The
// trial cron passes a ternary over two message types across four lines, so anything that stops at
// the first quote or the first newline reads it as unwired. Same reasoning as
// test/wave9_asking.test.mjs, which walks brackets for the same class of argument.
function callArgs(body, fn) {
  const out = [];
  const needle = `${fn}(`;
  let i = 0;
  while ((i = body.indexOf(needle, i)) !== -1) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < body.length; j += 1) {
      const c = body[j];
      if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c)) { depth -= 1; if (depth === 0) break; }
    }
    out.push(body.slice(i + needle.length, j));
    i = j + 1;
  }
  return out;
}

// Who actually asks the table, computed from the shipping tree. A file counts as a reader only if
// it imports this module AND names the type inside a channelsFor or routeFor call, so a row is
// never credited to a file that merely happens to contain the same word.
const readers = new Map();
for (const f of [...walk(path.join(repo, 'app')), ...walk(lib)]) {
  if (f === path.join(lib, 'routing.ts')) continue; // the table is not a reader of itself
  const body = stripComments(readFileSync(f, 'utf8'));
  if (!/from '[^']*\/routing'/.test(body)) continue;
  const args = [...callArgs(body, 'channelsFor'), ...callArgs(body, 'routeFor')];
  for (const t of DECLARED_TYPES) {
    if (args.some((a) => a.includes(`'${t}'`))) {
      readers.set(t, [...(readers.get(t) ?? []), path.relative(repo, f)]);
    }
  }
}

// ⚠️ WRITTEN OUT BY HAND, LIKE EXPECTED_BILLABLE, AND FOR THE SAME REASON. A row that starts or
// stops governing the product is a decision, and a decision should cost somebody a line in a test
// rather than happen quietly inside a helpful edit.
const WIRED = ['connect_result', 'trial_ended', 'trial_ending', 'weekly_ready', 'work_paused'];

// 🔴 EVERY ROW HERE GOVERNS NOTHING TODAY. The table still describes where these messages SHOULD
// go, and the code still decides for itself where they DO go. That gap is the point of this list:
// it is not a bug list and it is not a to do list, it is the honest reach of the table, and it is
// the thing anybody reading a row needs to know before they act on it.
const NOT_WIRED = [
  'alert_deadline', 'alert_opportunity', 'alert_threshold',
  // 🔴 The one that was raised as Tier One. Jag's 28 July decision, recorded and not built: no
  // capture email exists, no push is sent for a receipt, and the webhook still answers on WhatsApp.
  'capture_ack',
  'capture_unreadable', 'conversation_answer', 'nudge', 'reminder_due',
];

const wiredNow = DECLARED_TYPES.filter((t) => readers.has(t)).sort();
const unwiredNow = DECLARED_TYPES.filter((t) => !readers.has(t)).sort();
const sameList = (a, b) => a.length === b.length && a.every((x, n) => x === b[n]);

ok(
  sameList(wiredNow, [...WIRED].sort())
    ? `the rows that govern the product are the five pinned here (${wiredNow.join(', ')})`
    : `🔴 which rows the product READS has changed. Pinned: ${[...WIRED].sort().join(', ')}. Found: ${wiredNow.join(', ')}.\n`
      + '     A row that has gained a reader is a row that now governs something: move it from\n'
      + '     NOT_WIRED to WIRED here, and check every sender its channels name actually exists.\n'
      + '     A row that has LOST its reader has gone decorative, which is what section 8 is about.',
  sameList(wiredNow, [...WIRED].sort()),
);
ok(
  sameList(unwiredNow, [...NOT_WIRED].sort())
    ? `the rows that govern nothing yet are the eight pinned here (${unwiredNow.length})`
    : `🔴 the not wired list is out of date. Pinned: ${[...NOT_WIRED].sort().join(', ')}. Found: ${unwiredNow.join(', ')}.`,
  sameList(unwiredNow, [...NOT_WIRED].sort()),
);
ok('every declared type is in exactly one of the two lists',
  WIRED.length + NOT_WIRED.length === DECLARED_TYPES.length
  && WIRED.every((t) => !NOT_WIRED.includes(t)));

// 🔴 9b. A LIE IN A COMMENT IS A DEFECT, EVEN WHEN NO CUSTOMER IS HARMED BY IT TODAY.
//
// The sentence "the email always goes, so there is always something" was the entire basis of the
// Tier One reading, and it was false the day it was written. This is the smallest rule that stops
// it or anything like it coming back: routing.ts may promise a capture email only when a sender
// for one exists. Not a style rule. It is section 3's "no row points at a template this repo
// cannot send", applied to the prose, because the prose is what people act on.
const routingSrc = src('lib/routing.ts');
const emailSrc = src('lib/email.ts');
const hasCaptureEmailSender = /export async function send\w*(Capture|Receipt)\w*Email/.test(emailSrc);
const promisesTheEmail = /the email always goes/i.test(routingSrc);
ok(
  !promisesTheEmail || hasCaptureEmailSender
    ? 'routing.ts promises no capture email that lib/email.ts cannot send'
    : '🔴 lib/routing.ts says the capture email "always goes" and lib/email.ts has no sender for it.\n'
      + '     Either build the sender, or delete the promise. A comment that describes a product we\n'
      + '     do not have is how 7 August happened: it reads as a defect to whoever finds it next,\n'
      + '     and as permission to delete the WhatsApp reply to whoever finds it after that.',
  !promisesTheEmail || hasCaptureEmailSender,
);

// 🔴 9c. THE RECEIPT WALK IS EXECUTED, NOT READ.
//
// Photographing a receipt is the ONE thing this product asks a man to do, so it is the one message
// that may never go unanswered. handleReceiptImage and replyNotLinked are sliced VERBATIM out of
// the shipping webhook into a staged module whose dependencies are stubs, then driven down every
// path the walk has: the four refusals before the reading, the five outcomes of it, and the three
// places a throw can escape (findUserIdByPhone, downloadMedia and parseReceipt all read a response
// body outside their own guards, and none of the three is this repo's webhook to fix).
//
// Until 7 August 2026 the throws produced NOTHING: processMessage caught them, logged a line, and
// the man who photographed a receipt heard nothing whatsoever.
//
// EXACTLY ONE send per path is asserted in both directions. Zero is the silence this is about. Two
// would be a second billable message on the highest volume walk in the product, which is section 7.
const waSrc = readFileSync(path.join(repo, WA_ROUTE), 'utf8');
const sliceFrom = waSrc.indexOf('async function replyNotLinked');
const sliceTo = waSrc.indexOf("// Counts today's receipts for this phone");
ok('the receipt walk was found in the webhook, so the checks below are not vacuous',
  sliceFrom > 0 && sliceTo > sliceFrom
  && waSrc.slice(sliceFrom, sliceTo).includes('async function handleReceiptImage'));

if (sliceFrom > 0 && sliceTo > sliceFrom) {
  const STUBS = `
export const sent: string[] = [];
export const ctl: Record<string, unknown> = {};
const APP_URL = 'https://lekhio.app';
const TRIAL_DAYS = 7;
async function sendText(_to: string, body: string): Promise<void> { sent.push(body); }
async function findUserIdByPhone(_p: string): Promise<string | null> {
  if (ctl.userIdThrows) throw new Error('x');
  return (ctl.userId ?? null) as string | null;
}
function hasClaudeConfig(): boolean { return ctl.claude !== false; }
async function downloadMedia(_id: string): Promise<{ base64: string; mediaType: string } | null> {
  if (ctl.mediaThrows) throw new Error('x');
  return ctl.media === null ? null : { base64: 'AAAA', mediaType: 'image/jpeg' };
}
async function aiBudgetBlocked(_f: string): Promise<string | null> { return (ctl.refused ?? null) as string | null; }
async function sendBudgetRefusal(_f: string, reason: string): Promise<void> { sent.push('refusal:' + reason); }
async function ingestReceiptImage(_a: unknown): Promise<Record<string, unknown>> {
  if (ctl.ingestThrows) throw new Error('x');
  return ctl.result as Record<string, unknown>;
}
function duplicateReceiptLine(m: string, a: number, d: string): string { return \`dup \${m} \${a} \${d}\`; }
async function bankNudgeAfterReceipt(_f: string, _u: string): Promise<string | null> { return null; }
export { handleReceiptImage };
`;
  const walkStage = mkdtempSync(path.join(tmpdir(), 'wareceipt-'));
  const walkFile = path.join(walkStage, 'receiptwalk.ts');
  writeFileSync(walkFile, STUBS + waSrc.slice(sliceFrom, sliceTo));
  const H = await import(pathToFileURL(walkFile).href);

  const PATHS = [
    ['not linked to an account', { userId: null }],
    ['receipt reading not configured', { claude: false }],
    ['the media would not download', { media: null }],
    ['the AI budget refused him', { refused: 'user_daily_cap' }],
    ['unreadable photograph', { result: { outcome: 'unread' } }],
    ['the write failed', { result: { outcome: 'failed' } }],
    ['merged into the bank line', { result: { outcome: 'merged', merchant: 'Screwfix', amount: 12.4, category: 'materials' } }],
    ['the same receipt twice', { result: { outcome: 'duplicate', merchant: 'Screwfix', amount: 12.4, date: '2026-08-05' } }],
    ['logged and waiting for his yes', { result: { outcome: 'logged', merchant: 'Screwfix', amount: 12.4, category: 'materials', date: '2026-08-05' } }],
    ['🔴 the account lookup THREW', { userIdThrows: true }],
    ['🔴 the media download THREW', { mediaThrows: true }],
    ['🔴 the reading THREW', { ingestThrows: true }],
  ];

  // The handler logs the error NAME on a throw, which is deliberate and is not this suite's output.
  const realError = console.error;
  console.error = () => {};
  for (const [label, setup] of PATHS) {
    H.sent.length = 0;
    for (const k of Object.keys(H.ctl)) delete H.ctl[k];
    H.ctl.userId = 'u1';
    Object.assign(H.ctl, setup);
    let threw = null;
    try {
      await H.handleReceiptImage('447700900000', 'wamid.TEST', 'media1');
    } catch (e) {
      threw = e instanceof Error ? e.name : 'unknown';
    }
    const n = H.sent.length;
    ok(
      n === 1 && !threw
        ? `he is answered, exactly once: ${label}`
        : `🔴 a receipt photograph went unanswered: ${label}. Sends: ${n}${threw ? `, and the walk threw ${threw}` : ''}.\n`
          + '     Photographing a receipt is the one thing this product asks him to do. Every path\n'
          + '     through handleReceiptImage must end in one sentence, including the ones where a\n'
          + '     dependency throws: he cannot tell a crash from being ignored, and a man who thinks\n'
          + '     we have his receipt does not send it again.',
      n === 1 && !threw,
    );
    ok(`and the sentence is a real one: ${label}`, typeof H.sent[0] === 'string' && H.sent[0].trim().length > 10);
  }
  console.error = realError;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n9d. 🔴 THE VOICE WALK IS EXECUTED, AND IT NEVER APOLOGISES FOR A NOTE IT HAS PARKED');
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 9c CLOSED THE PHOTOGRAPH AND LEFT THE VOICE NOTE OPEN, AND THE VOICE NOTE IS THE WORSE ONE.
//
// It was flagged in the same pass and not fixed. Its acknowledgement was the LAST statement in the
// function, so a throw in findUserIdByPhone or downloadMedia left a man who had just SPOKEN into
// his phone with nothing at all. He chose voice because his hands were full, which makes him the
// customer least able to check, retype it, or open the app and look.
//
// 🔴 AND THE ORDERING IS DIFFERENT FROM THE RECEIPT'S, WHICH IS WHY THE FIX IS NOT THE SAME FIX.
//
// A voice note is PARKED, not answered: it goes into voice_jobs, the mini claims it, transcribes it
// locally and posts back to /api/voice/complete, which writes the entry and confirms. So there are
// two promises, "I am on it" and the later confirmation, and the walk has a point in the middle
// after which SOMETHING HAS BEEN WRITTEN. handleReceiptImage can say one thing on every throw
// because nothing was ever written on a throwing path. Say the same thing here after the queue
// write and you have told a man to record it again for a note the mini is already transcribing:
// two jobs, two entries, one spend counted twice.
//
// So this section asserts THREE things, not one:
//
//   1. Exactly one send on every path, including the two that throw. Zero is the silence. Two is a
//      second billable message on a capture walk, which is section 7.
//   2. 🔴 NO PATH THAT THROWS HAS PARKED ANYTHING. The apology is only honest while that holds.
//   3. 🔴 NOTHING AWAITED SITS BETWEEN THE QUEUE WRITE AND THE PROMISE. That is what keeps (2)
//      true tomorrow, and it is a single line somebody could undo without noticing.
//
// And one more, which is about the audio rather than the sentence: with no fresh heartbeat from the
// mini the walk must not DOWNLOAD the note at all, because a recording parked when there is nobody
// to transcribe it is a customer's voice resting on our disk for no purpose.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const vFrom = waSrc.indexOf('async function replyNotLinked');
const vTo = waSrc.indexOf('// The write did not happen, said the same way');
const vjFrom = waSrc.indexOf('// A voice note cannot be transcribed by Claude');
const vjTo = waSrc.indexOf('// The deterministic money-entry parser now lives');
const voiceBody = vjFrom > 0 && vjTo > vjFrom ? waSrc.slice(vjFrom, vjTo) : '';
ok('the voice walk was found in the webhook, so the checks below are not vacuous',
  vFrom > 0 && vTo > vFrom && vjFrom > 0 && vjTo > vjFrom
  && voiceBody.includes('async function handleVoiceNote')
  && voiceBody.includes('async function voiceSentence'));

if (voiceBody) {
  // 🔴 RULE 3, READ OFF THE SOURCE. Between createVoiceJob( and the sentence it returns there may be
  // no await, because an await there is a place a throw can land AFTER the audio is in the queue,
  // and the catch would then apologise for a note that is already being transcribed.
  const writeAt = voiceBody.indexOf('await createVoiceJob(');
  const promiseAt = voiceBody.indexOf('return VOICE_ON_IT');
  // Both landmarks have to exist, or the count below is measured over the wrong text. A walk that
  // no longer parks and then RETURNS its promise is not a walk this rule can reason about, so it
  // fails here rather than quietly reporting zero.
  const landmarks = writeAt > 0 && promiseAt > writeAt;
  const untilPromise = landmarks ? voiceBody.slice(writeAt, promiseAt) : '';
  const extraAwaits = landmarks
    ? (stripComments(untilPromise).match(/\bawait\b/g) || []).length - 1 // the write itself
    : -1;
  ok(
    extraAwaits === 0
      ? 'nothing awaited sits between parking the audio and promising to write it up'
      : !landmarks
        ? '🔴 the queue write and the promise are no longer a write followed by a return.\n'
          + '     This rule reads the text between "await createVoiceJob(" and "return VOICE_ON_IT",\n'
          + '     and one of them is gone. If the walk now sends from inside itself, the throw it was\n'
          + '     given a catch for has somewhere to hide again: see the block above handleVoiceNote.'
        : `🔴 ${extraAwaits} awaited call(s) now sit between createVoiceJob and the promise.\n`
        + '     That is a place a throw can land AFTER the audio is in voice_jobs. handleVoiceNote\n'
        + '     would then tell him we could not take it, he would record it again, and the mini\n'
        + '     would transcribe both: one spend, two rows in his books. Either move the call above\n'
        + '     the queue write, or make the catch choose its sentence on whether a row exists.',
    extraAwaits === 0,
  );

  const VSTUBS = `
export const sent: string[] = [];
export const jobs: string[] = [];
export const downloads: string[] = [];
export const ctl: Record<string, unknown> = {};
const APP_URL = 'https://lekhio.app';
const TRIAL_DAYS = 7;
async function sendText(_to: string, body: string): Promise<void> { sent.push(body); }
async function findUserIdByPhone(_p: string): Promise<string | null> {
  if (ctl.userIdThrows) throw new SyntaxError('Unexpected token < in JSON at position 0');
  return (ctl.userId ?? null) as string | null;
}
function hasClaudeConfig(): boolean { return ctl.claude !== false; }
async function isWorkerLive(_k: string): Promise<boolean> { return ctl.live !== false; }
async function downloadMedia(_id: string): Promise<{ base64: string; mediaType: string } | null> {
  downloads.push('hit');
  if (ctl.mediaThrows) throw new SyntaxError('Unexpected token < in JSON at position 0');
  return ctl.media === null ? null : { base64: 'AAAA', mediaType: 'audio/ogg' };
}
async function aiBudgetBlocked(_f: string): Promise<string | null> { return (ctl.refused ?? null) as string | null; }
async function sendBudgetRefusal(_f: string, reason: string): Promise<void> { sent.push('refusal:' + reason); }
async function createVoiceJob(_j: unknown): Promise<{ kind: string; id?: string }> {
  // Three answers since 9 August 2026, because null used to mean both "refused" and "the row is
  // there and we could not read our own answer". See lib/voicejobs.ts and test/voicejob.test.mjs.
  if (ctl.job === null) return { kind: 'refused' };
  // 'unsure' PARKS THE ROW. That is the entire point of it: the audio is in voice_jobs and the
  // customer must not be told to send it again.
  jobs.push('job1');
  if (ctl.job === 'unsure') return { kind: 'unsure' };
  return { kind: 'created', id: 'job1' };
}
export { handleVoiceNote };
`;
  const vStage = mkdtempSync(path.join(tmpdir(), 'wavoice-'));
  const vFile = path.join(vStage, 'voicewalk.ts');
  writeFileSync(vFile, VSTUBS + waSrc.slice(vFrom, vTo) + '\n' + voiceBody);
  const V = await import(pathToFileURL(vFile).href);

  // [label, setup, parks a job]
  const VPATHS = [
    ['not linked to an account', { userId: null }, false],
    ['voice reading not configured', { claude: false }, false],
    ['the mini is not beating', { live: false }, false],
    ['the audio would not download', { media: null }, false],
    ['the AI budget refused him', { refused: 'user_daily_cap' }, false],
    ['the queue refused the note', { job: null }, false],
    ['parked, and promised', {}, true, 'on it'],
    // 🔴 THE ROW EXISTS AND WE COULD NOT READ OUR OWN ANSWER. He must be told to WAIT, never to
    // send it again: the mini has his audio, and a resend puts one spend in his books twice.
    ['🔴 parked, but the answer could not be read', { job: 'unsure' }, true, 'maybe'],
    ['🔴 the account lookup THREW', { userIdThrows: true }, false],
    ['🔴 the audio download THREW', { mediaThrows: true }, false],
  ];

  const realVError = console.error;
  console.error = () => {};
  for (const [label, setup, parks, promise] of VPATHS) {
    V.sent.length = 0;
    V.jobs.length = 0;
    V.downloads.length = 0;
    for (const k of Object.keys(V.ctl)) delete V.ctl[k];
    V.ctl.userId = 'u1';
    Object.assign(V.ctl, setup);
    let threw = null;
    try {
      await V.handleVoiceNote('447700900000', 'wamid.TEST', 'media1');
    } catch (e) {
      threw = e instanceof Error ? e.name : 'unknown';
    }
    const n = V.sent.length;
    ok(
      n === 1 && !threw
        ? `he is answered, exactly once: ${label}`
        : `🔴 a voice note went unanswered: ${label}. Sends: ${n}${threw ? `, and the walk threw ${threw}` : ''}.\n`
          + '     He spoke into his phone because his hands were full, so he is the least able of\n'
          + '     anyone to notice nothing came back. Every path through handleVoiceNote must end in\n'
          + '     one sentence, including the ones where a dependency throws.',
      n === 1 && !threw,
    );
    ok(`and the sentence is a real one: ${label}`, typeof V.sent[0] === 'string' && V.sent[0].trim().length > 10);
    ok(`the queue row and the sentence agree: ${label}`, V.jobs.length === (parks ? 1 : 0));
    if (parks) {
      if (promise === 'maybe') {
        // 🔴 THE SENTENCE THAT COST A MAN A DUPLICATE ENTRY. Never "try again" on a note we parked.
        ok(`a parked note we could not confirm is NOT asked for twice: ${label}`,
          !/Try again|send it again|Writing it up now/i.test(V.sent[0] ?? '')
          && /rather than sending it again/i.test(V.sent[0] ?? ''));
      } else {
        ok(`a parked note is promised, and promised only once: ${label}`,
          V.sent[0] === 'Got your voice note. Writing it up now, one sec.');
      }
    } else {
      ok(
        !/Writing it up now/.test(V.sent[0] ?? '')
          ? `nothing was parked, so nothing was promised: ${label}`
          : `🔴 "writing it up now" was said for a note that never reached the queue: ${label}.\n`
            + '     Nobody is coming. reapStaleVoiceJobs only knows about ROWS, so a promise with no\n'
            + '     row has nobody to keep it and no apology will ever follow it.',
        !/Writing it up now/.test(V.sent[0] ?? ''),
      );
    }
  }

  // 🔴 THE AUDIO, NOT THE SENTENCE. No fresh heartbeat means the recording is never even fetched.
  V.sent.length = 0; V.jobs.length = 0; V.downloads.length = 0;
  for (const k of Object.keys(V.ctl)) delete V.ctl[k];
  V.ctl.userId = 'u1';
  V.ctl.live = false;
  await V.handleVoiceNote('447700900000', 'wamid.TEST', 'media1');
  ok(
    V.downloads.length === 0
      ? '🔴 with the mini not beating, his audio is never downloaded at all'
      : '🔴 the walk pulled a customer\'s recording down with no transcriber running.\n'
        + '     isWorkerLive must stay ABOVE downloadMedia. Audio fetched when there is nobody to\n'
        + '     transcribe it is a voice recording resting in our hands for no purpose, and the only\n'
        + '     thing that wipes a parked note is the mini polling, which by definition it is not.',
    V.downloads.length === 0,
  );
  console.error = realVError;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n9e. 🔴 THE REMINDER WALK, WHICH IS THE THIRD ONE WITH THIS SHAPE');
//
// Found while checking whether the voice fix transplanted. handleSchedule has both ingredients:
// findUserIdByPhone, and parseSchedule (lib/claude.ts), which guards its fetch and then reads
// res.json() outside the guard exactly as parseReceipt does. Every entry point in that module does.
//
// A reminder is the one thing he will never chase, because he asked us to remember it so that he
// could stop. Silence here is discovered on the morning it mattered, which is the day it has
// stopped being worth setting. And createEvent writes a row that texts him LATER, so this is the
// voice ordering again and the write stays before the acknowledgement.
// Anchored on formatWhen rather than on the comment above the handler, so this slice survives the
// handler being rewritten. formatWhen is real here, not stubbed: the "I will remind you ..." line
// is the promise, and a promise with the wrong time in it is not a promise kept.
const sFrom = waSrc.indexOf('function formatWhen(iso: string)');
const sTo = waSrc.indexOf('// A money question, but only if it actually reads');
const schedBody = sFrom > 0 && sTo > sFrom ? waSrc.slice(sFrom, sTo) : '';
ok('the reminder walk was found in the webhook, so the checks below are not vacuous',
  schedBody.includes('async function handleSchedule') && schedBody.includes('async function scheduleSentence'));

if (schedBody.includes('async function handleSchedule')) {
  const SSTUBS = `
export const sent: string[] = [];
export const events: string[] = [];
export const ctl: Record<string, unknown> = {};
async function sendText(_to: string, body: string): Promise<void> { sent.push(body); }
async function findUserIdByPhone(_p: string): Promise<string | null> {
  if (ctl.userIdThrows) throw new SyntaxError('Unexpected token < in JSON at position 0');
  return (ctl.userId ?? null) as string | null;
}
function hasClaudeConfig(): boolean { return ctl.claude !== false; }
async function aiBudgetBlocked(_f: string): Promise<string | null> { return (ctl.refused ?? null) as string | null; }
async function sendBudgetRefusal(_f: string, reason: string): Promise<void> { sent.push('refusal:' + reason); }
async function parseSchedule(_b: string, _n: string): Promise<Record<string, unknown> | null> {
  if (ctl.parseThrows) throw new SyntaxError('Unexpected token < in JSON at position 0');
  return (ctl.parsed ?? null) as Record<string, unknown> | null;
}
async function createEvent(_u: string, _e: unknown): Promise<void> {
  if (ctl.eventThrows) throw new Error('Event insert failed: 500');
  events.push('e1');
}
export { handleSchedule };
`;
  const sStage = mkdtempSync(path.join(tmpdir(), 'waschedule-'));
  const sFile = path.join(sStage, 'schedulewalk.ts');
  // 🔴 RUN 2: handleSchedule now rewrites British clock time before the model sees it, because
  // "half 7 in the morning" was confirmed back as 06:30. The REAL normaliseBritishTime is staged
  // beside the walk rather than stubbed: a pass-through stub would keep this suite green on the
  // day the rewrite breaks, which is the one thing it should not do. lib/waintents.ts imports only
  // a type, so it stages on its own.
  writeFileSync(
    path.join(sStage, 'waintents.ts'),
    readFileSync(path.join(repo, 'lib/waintents.ts'), 'utf8'),
  );
  writeFileSync(sFile, "import { normaliseBritishTime } from './waintents.ts';\n" + SSTUBS + schedBody);
  const S = await import(pathToFileURL(sFile).href);

  const GOOD = { title: 'Price up Dave\'s job', kind: 'reminder', starts_at: null, remind_at: '2026-08-08T07:00:00.000Z' };
  const SPATHS = [
    ['not linked to an account', { userId: null }, false],
    ['reminders not configured', { claude: false }, false],
    ['the AI budget refused him', { refused: 'user_daily_cap' }, false],
    ['no time could be read out of it', { parsed: null }, false],
    ['set, and he is told when', { parsed: GOOD }, true],
    ['🔴 the account lookup THREW', { userIdThrows: true }, false],
    ['🔴 the schedule read THREW', { parseThrows: true }, false],
    ['🔴 the diary write THREW', { parsed: GOOD, eventThrows: true }, false],
  ];

  const realSError = console.error;
  console.error = () => {};
  for (const [label, setup, booked] of SPATHS) {
    S.sent.length = 0;
    S.events.length = 0;
    for (const k of Object.keys(S.ctl)) delete S.ctl[k];
    S.ctl.userId = 'u1';
    Object.assign(S.ctl, setup);
    let threw = null;
    try {
      await S.handleSchedule('447700900000', 'remind me to price up Dave\'s job tomorrow at 8am');
    } catch (e) {
      threw = e instanceof Error ? e.name : 'unknown';
    }
    const n = S.sent.length;
    ok(
      n === 1 && !threw
        ? `he is answered, exactly once: ${label}`
        : `🔴 a reminder request went unanswered: ${label}. Sends: ${n}${threw ? `, and the walk threw ${threw}` : ''}.\n`
          + '     He asked us to remember something so that he could stop carrying it. Silence means\n'
          + '     he finds out on the morning it mattered, which is the day it stopped being worth\n'
          + '     setting. Every path through handleSchedule must end in one sentence.',
      n === 1 && !threw,
    );
    ok(`and the sentence is a real one: ${label}`, typeof S.sent[0] === 'string' && S.sent[0].trim().length > 10);
    ok(`the diary row and the sentence agree: ${label}`, S.events.length === (booked ? 1 : 0));
    if (!booked) {
      ok(
        !/I will remind you/.test(S.sent[0] ?? '')
          ? `nothing was written, so nothing was promised: ${label}`
          : `🔴 "I will remind you" was said with no diary row behind it: ${label}.`,
        !/I will remind you/.test(S.sent[0] ?? ''),
      );
    }
  }
  console.error = realSError;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
