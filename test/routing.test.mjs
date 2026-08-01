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

// routing.ts imports watemplates.ts, so both are staged together. The extensionless import has to
// gain a .ts on the way in: Next resolves it, bare Node under type stripping does not. Same fix as
// test/announcements.test.mjs, which stages lib/housestyle.ts the same way.
const fix = (s) => s.replace("from './watemplates'", "from './watemplates.ts'");
writeFileSync(path.join(stage, 'watemplates.ts'), readFileSync(path.join(lib, 'watemplates.ts'), 'utf8'));
writeFileSync(path.join(stage, 'routing.ts'), fix(readFileSync(path.join(lib, 'routing.ts'), 'utf8')));
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
ok('🔴 the template gate no longer decides whether he hears anything at all',
  /hasWhatsApp: Boolean\(job\.row\.phone\) && TEMPLATES_ON\(\)/.test(trialSrc));
ok('and the email send is not behind that gate',
  !/TEMPLATES_ON\(\)[\s\S]{0,200}sendTrialWeekEmail/.test(trialSrc));

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
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
