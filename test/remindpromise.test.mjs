// A PROMISE MAY NOT OUTRUN A SEND.
//
//   node test/remindpromise.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE FAULT THIS SUITE EXISTS FOR. 10 AUGUST 2026, LAUNCH DAY, ON A REAL CUSTOMER.
//
// 13:23 on 9 August, on WhatsApp:
//
//     him   "remind me to price up Dave's job tomorrow at 8am"
//     us    "Got it. 'Price up Dave's job'. I will remind you on Mon 10 Aug, 08:00. 👍"
//
// 08:00:35 the next morning, in the Vercel log:
//
//     [cron] job=due hop=1 sent=0 complete
//
// Nothing errored. Nothing was down. /api/health was green all night and the cron fired within
// thirty five seconds of its slot. THE MESSAGE JUST NEVER WENT, because the sender's line read
//
//     const dueSendsOn = waSendsEnabled() && templateSendable(T_REMINDER);
//
// and the gate was shut, and the half of the feature that had made the promise had never once
// asked that question. Two places decided the same thing and only one of them knew it.
//
// ⚠️ AND THE GATE WAS SHUT FOR A REASON THAT HAD STOPPED BEING TRUE. Meta approved lekhio_reminder
// after the registry was last read on 27 July. So the switch guarding an unapproved template was
// still guarding an approved one two weeks later, and there was no moment at which anybody had to
// look. Nobody was wrong. The file simply went stale.
//
// ⚠️ AND THE SWITCH COULD NOT SAFELY BE FLIPPED ANYWAY, which is the part that made it stick. ONE
// var, REMINDER_TEMPLATES_APPROVED, gated BOTH lekhio_reminder (one man, one message, he asked for
// it) AND lekhio_nudge (everybody, daily, paid, nobody asked). Keeping a promise to one man meant
// starting a broadcast at all of them. Nobody would make that trade, so nobody made it.
//
// So this suite pins four things, and the last one is the one that matters:
//
//   1. templateLegBlock answers with a REASON, never a bare boolean.
//   2. The reminder and the nudge are on separate switches.
//   3. Every place that decides whether a paid message can go asks THAT function.
//   4. 🔴 NOBODY READS A *_TEMPLATES_APPROVED ENV VAR BY HAND. That is the drift mechanism itself,
//      and it is now a build failure rather than a habit.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The whole of lib/ is staged, same reasoning as test/routing.test.mjs: a hand kept list of
// transitive imports is a thing that goes stale silently, which is a small cousin of the fault
// above. Only what routing actually imports is ever executed.
const stage = mkdtempSync(path.join(tmpdir(), 'remindpromise-'));
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

// The two envs this suite reasons about. `ON` is the world after Jag flips the reminder switch.
const OFF = {};
const ON = { REMINDER_TEMPLATES_APPROVED: 'true' };

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n1. The refusal carries a reason, because a bare false is what let this happen.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const blocked = R.templateLegBlock('reminder_due', OFF);
  ok('🔴 A GATED REMINDER IS BLOCKED', blocked !== null);
  ok('🔴 AND THE BLOCK IS A SENTENCE, NOT A BOOLEAN: a caller cannot invent its own explanation',
    typeof blocked === 'string' && blocked.length > 20);
  ok('🔴 THE REASON NAMES THE TEMPLATE, so a log line identifies which message did not go',
    blocked.includes(W.T_REMINDER));
  // The nudge's skip message used to hardcode "set REMINDER_TEMPLATES_APPROVED=true" and would have
  // carried on saying exactly that after the nudge moved gates, pointing whoever was debugging at
  // the wrong lever with total confidence.
  ok('🔴 AND IT NAMES THE ACTUAL SWITCH, derived from the registry rather than typed into a string',
    blocked.includes(W.GATE_REMINDERS));
  ok('and the nudge names ITS switch, which is a different one',
    (R.templateLegBlock('nudge', OFF) ?? '').includes(W.GATE_NUDGE));

  ok('🔴 AND null ONCE THE SWITCH IS ON, so this is not a guard that refuses everything',
    R.templateLegBlock('reminder_due', ON) === null);

  // 🔴 THE COST KILL SWITCH OUTRANKS THE GATE AND SAYS SOMETHING DIFFERENT. An approved template we
  // have chosen to stop paying for is not a broken template, and a reason that conflated the two
  // would send somebody hunting Meta for a problem that is ours.
  const killed = R.templateLegBlock('reminder_due', { ...ON, WHATSAPP_SENDS_ENABLED: 'false' });
  ok('🔴 THE KILL SWITCH BLOCKS EVEN AN APPROVED, GATED-ON TEMPLATE', killed !== null);
  ok('and it says so in its own words rather than blaming the template',
    /WHATSAPP_SENDS_ENABLED/.test(killed) && !killed.includes(W.GATE_REMINDERS));

  ok('a type with no paid leg is never blocked, because free channels are not gated',
    R.templateLegBlock('weekly_ready', OFF) === null
    && R.templateLegBlock('conversation_answer', OFF) === null);
  ok('typeForTemplate is the reverse of the table, so a caller holding a name can ask',
    R.typeForTemplate(W.T_REMINDER) === 'reminder_due'
    && R.typeForTemplate(W.T_NUDGE) === 'nudge'
    && R.typeForTemplate('lekhio_nope') === null);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n2. One switch cannot start a broadcast nobody asked for.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // This is the whole reason the promise stayed broken for two weeks rather than being fixed in a
  // minute. Asserted through templateLegBlock rather than the registry, because what has to be
  // true is that the SENDER treats them separately.
  ok('🔴 SWITCHING REMINDERS ON LEAVES THE DAILY BROADCAST OFF',
    R.templateLegBlock('reminder_due', ON) === null
    && R.templateLegBlock('nudge', ON) !== null);
  ok('and the broadcast switch does not silently enable reminders either',
    R.templateLegBlock('nudge', { NUDGE_TEMPLATES_APPROVED: 'true' }) === null
    && R.templateLegBlock('reminder_due', { NUDGE_TEMPLATES_APPROVED: 'true' }) !== null);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n3. The promise and the send read the same answer.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const wa = read('app/api/whatsapp/route.ts');
  const waCode = codeOnly(wa);

  // Scoped to scheduleSentence's own body. An assertion about a function has to be scoped to the
  // function: this file is nearly three thousand lines and a match anywhere in it proves nothing,
  // which is the vacuous guard that cost a whole round of pushes to learn.
  const iFn = waCode.indexOf('async function scheduleSentence');
  const iNext = waCode.indexOf('function isQuestion');
  const scheduleBody = iFn >= 0 && iNext > iFn ? waCode.slice(iFn, iNext) : '';
  ok('scheduleSentence is where this file thinks it is, so the assertions below are real',
    scheduleBody.length > 400);

  ok('🔴 THE PROMISE ASKS templateLegBlock BEFORE IT PROMISES',
    /templateLegBlock\('reminder_due'\)/.test(scheduleBody));
  ok('🔴 AND IT HAS AN HONEST BRANCH: it can no longer only say "I will remind you"',
    /I will remind you/.test(scheduleBody) && /cannot text you reminders yet/.test(scheduleBody));
  // 🔴 THE ROW IS STILL WRITTEN WHEN THE TEXT CANNOT GO. The diary is the product and the message
  // is the delivery; dropping his entry because we cannot text him about it is the wrong half to
  // lose, and it is also what makes 10 August recoverable rather than lost.
  ok('🔴 AND THE ROW IS STILL WRITTEN: createEvent comes before either sentence',
    scheduleBody.indexOf('await createEvent') >= 0
    && scheduleBody.indexOf('await createEvent') < scheduleBody.indexOf('templateLegBlock'));

  const cron = codeOnly(read('app/api/cron/reminders/route.ts'));
  ok('🔴 AND THE SENDER ASKS THE SAME FUNCTION FOR THE SAME TYPE',
    /templateLegBlock\('reminder_due'\)/.test(cron));
  // The exact line that caused this. It must not come back.
  ok('🔴 THE OLD TWO-PART BOOLEAN IS GONE FROM THE SENDER',
    !/waSendsEnabled\(\)\s*&&\s*templateSendable/.test(cron));

  // ⚠️ THE LOG LINE IS THE OTHER HALF OF THE FAULT. `sent=0 complete` read identically whether the
  // job was switched off or nothing happened to be due, so the morning it mattered looked exactly
  // like a quiet Tuesday. Sixth instance of a signal that cannot tell "no" from "nothing".
  ok('🔴 THE DUE JOB CANNOT LOG A BARE sent=0 complete WHEN IT IS BLOCKED',
    /dueBlock \? `blocked: \$\{dueBlock\}` : 'complete'/.test(cron));
  ok('🔴 AND THE REASON REACHES THE WATCHDOG ROW, not just the console',
    /cronFinished\('due', true, hop, dueBlock \?/.test(cron));

  // The settings page offers a switch for the nudge. A switch is a promise that a message exists
  // behind it, so it has to ask the same question the sender does.
  ok('🔴 THE SETTINGS SWITCH ASKS IT TOO, so a row cannot advertise a message that cannot leave',
    /templateLegBlock\('nudge'\) === null/.test(codeOnly(read('app/app/you/settings/page.tsx'))));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n4. Nobody reads a template gate by hand. This is the drift mechanism itself.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // 🔴 THE ONE THAT MAKES THIS CLASS UNREPEATABLE.
  //
  // Four places read one of these env vars directly: the reminder cron, the agent cron, the trial
  // cron and the settings page. Each was correct the day it was written. Each one is a copy of a
  // rule lib/watemplates.ts owns, and a copy is a thing that stops being true silently, on a day
  // nobody is looking, which is exactly what happened.
  //
  // lib/watemplates.ts is the ONLY file allowed to name these strings, because it is the file whose
  // entire job is knowing which switch belongs to which template.
  const allowed = new Set([path.join('lib', 'watemplates.ts')]);
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e.startsWith('.') || e === 'node_modules') continue;
      const full = path.join(dir, e);
      if (lstatSync(full).isSymbolicLink()) continue;
      if (lstatSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(e)) continue;
      const rel = path.relative(root, full);
      if (allowed.has(rel)) continue;
      // The env READ is the offence, not the mention. A comment explaining the history is fine and
      // several of them are load bearing; `process.env.X_TEMPLATES_APPROVED` is not.
      if (/process\.env\.[A-Z_]*TEMPLATES_APPROVED/.test(codeOnly(readFileSync(full, 'utf8')))) {
        offenders.push(rel);
      }
    }
  };
  ['app', 'lib', 'components', 'khoji'].forEach((d) => {
    try { walk(path.join(root, d)); } catch { /* directory may not exist */ }
  });
  ok(`🔴 NOTHING OUTSIDE lib/watemplates.ts READS A TEMPLATE GATE DIRECTLY${offenders.length ? ` (${offenders.join(', ')})` : ''}`,
    offenders.length === 0);

  // And the senders that used to hold a hand copy now go through the table.
  ok('the agent cron asks the table per template rather than reading its gate',
    /templateLegBlock\(type\)/.test(codeOnly(read('app/api/cron/agent/route.ts'))));
  // 🔴 THE COST BRAKE NOW REACHES THE AGENT PINGS. It never did: every other proactive sender
  // checked WHATSAPP_SENDS_ENABLED and this one did not, so pulling the brake in anger would have
  // stopped the reminders and the digest and left Rakha's paid pings going out.
  ok('🔴 AND THE KILL SWITCH NOW REACHES AGENT PINGS, which it never did before',
    R.templateLegBlock('alert_threshold', { AGENT_TEMPLATES_APPROVED: 'true' }) === null
    && R.templateLegBlock('alert_threshold', { AGENT_TEMPLATES_APPROVED: 'true', WHATSAPP_SENDS_ENABLED: 'false' }) !== null);
  ok('the trial cron does the same',
    /templateLegBlock\('trial_ending'\)/.test(codeOnly(read('app/api/cron/trial/route.ts'))));

  // ⚠️ THE REGISTRY CARRIES THE DATE IT WAS LAST CHECKED AGAINST META, because the status is the
  // one field here no test can verify: only Meta knows it. A date is the closest a repo gets to
  // knowing a thing it cannot see, and the stale date is what this whole push is about.
  ok('🔴 THE REGISTRY RECORDS WHEN IT WAS LAST READ OFF META',
    /RE-OBSERVED IN WHATSAPP MANAGER ON 10 AUGUST 2026/.test(read('lib/watemplates.ts')));
  ok('and both reminder templates are recorded as approved, which is what Meta shows',
    W.findTemplate(W.T_REMINDER).meta === 'approved' && W.findTemplate(W.T_NUDGE).meta === 'approved');
  // Approved is not the same as wanted. The nudge stays gated because a daily paid broadcast is a
  // business decision, and the invariant only ever required that an UNAPPROVED template be gated.
  ok('🔴 AND THE NUDGE IS STILL GATED DESPITE BEING APPROVED: approved is not the same as wanted',
    W.findTemplate(W.T_NUDGE).gate === W.GATE_NUDGE);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
