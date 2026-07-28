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
console.log('\n7. THE INLINE sendText COUNT MAY FALL BUT NEVER RISE');
//
// A ratchet, and deliberately not a ban. There are 152 inline sendText call sites today across
// app/ and lib/, most of them in the WhatsApp webhook, and moving all of them at once would be a
// change too large to verify honestly in one go. So the count is recorded here: it may go down
// as call sites move onto the table, and a new one fails the build.
//
// When you move a batch, lower this number in the same commit. That edit is the point: it makes
// the direction of travel a thing somebody has to type.

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

const CALL_SITE_CEILING = 152;
let callSites = 0;
for (const f of [...walk(path.join(repo, 'app')), ...walk(lib)]) {
  if (f === path.join(lib, 'whatsapp.ts')) continue; // where sendText is defined, not called
  const body = stripComments(readFileSync(f, 'utf8'));
  callSites += (body.match(/\bsendText\s*\(/g) || []).length;
}
ok(
  `inline sendText call sites are at or below the ceiling (${callSites} of ${CALL_SITE_CEILING})`,
  callSites <= CALL_SITE_CEILING,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
