// lib/watemplates.ts. EVERY WHATSAPP TEMPLATE NAME THE CODE CAN SEND, IN ONE PLACE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE FAILURE THIS FILE EXISTS TO CATCH, AND IT IS NOT HYPOTHETICAL.
//
// On 27 July 2026 the code was found calling FOUR templates that did not exist in Meta. The
// weekly summary, the nudge and the reminders had been failing silently on every run, for weeks.
//
// Nothing caught it, and nothing could have. A template lives in Meta's console, not in this
// repo, so the name in the code is an unchecked string pointing at a thing no test can see. The
// send fails at 3am on a Sunday, graphSend logs it, and the log is not a thing anyone reads on a
// Sunday. It is the house disease in its purest form: something that does nothing and looks fine.
//
// You cannot test that Meta has a template. You CAN make the code physically unable to reference
// one that this registry has not declared, and you can make the declaration carry the two things
// that actually break a send: the parameter count and the language. That is what this file is.
//
// ⚠️ THE RULE: A TEMPLATE NAME MAY NOT BE WRITTEN AS A STRING LITERAL ANYWHERE ELSE.
//
// Not in a route, not in a helper, not in a map. Every send imports from here.
// test/watemplates.test.mjs walks app/ and lib/ and FAILS THE BUILD if it finds a template
// shaped literal outside this file, so the rule cannot be forgotten. There is nothing to
// remember, because there is nowhere else to put one.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Where a template stands in Meta's review queue. This is the ONE field in this file that a test
// cannot verify, because only Meta knows. Keep it honest by hand, from WhatsApp Manager.
//
//   approved      live in Meta, safe to send
//   in_review     submitted, Meta has not decided. A send WILL FAIL.
//   not_submitted nobody has created it yet. A send WILL FAIL.
export type MetaStatus = 'approved' | 'in_review' | 'not_submitted';

// ✅ RE-OBSERVED IN WHATSAPP MANAGER ON 10 AUGUST 2026, not inferred. Every status below was read
// off Meta's own console. Meta shows an approved template as "Active", sometimes as "Active,
// quality pending", which means approved and sendable with no quality data accumulated yet.
//
// ⚠️ AND THE RE-READ IS THE POINT. THIS FILE WENT STALE AND IT COST A CUSTOMER A REMINDER.
//
// The statuses were last read on 27 July, when lekhio_reminder and lekhio_nudge were genuinely
// in_review. Meta approved them at some point after that, and nothing in this repo could ever have
// noticed: the status is the one field here that no test can verify, because only Meta knows it.
//
// So on 10 August a man asked for a reminder, was told "I will remind you on Mon 10 Aug, 08:00",
// and got nothing, because the gate that existed for a template that WAS unapproved was still shut
// two weeks after the template went live. Nobody was wrong. The file simply stopped being true and
// there was no moment at which anybody had to look.
//
// 🔴 SO RE-READ THIS CONSOLE WHENEVER A GATE IS ABOUT TO BE FLIPPED, and write the date above. A
// status that carries a date somebody has to update is the closest a repo can get to knowing a
// thing it cannot see.
//
// One leftover worth knowing about: a SECOND lekhio_reminder exists in plain "English" as well as
// English (UK), from a mis-set language on a first attempt. It was deliberately NOT deleted, because
// Meta blocks reuse of a deleted template name for up to 30 days and that would have left reminders
// dead until late August. The code sends en_GB and finds the right one. Tidy it up after that.
// Still present on 10 August, both showing Active.

export interface WaTemplate {
  name: string;
  // Meta matches on name AND language. 'en' and 'en_GB' are different templates to Meta, and
  // getting this wrong is a silent failure, not an error you can see. There is a live example: a
  // stray plain English lekhio_reminder exists in Meta from a mis-set language on a first attempt.
  language: string;
  // How many {{n}} body parameters the template declares. A send with the wrong count is rejected
  // by Meta. The test asserts this against the actual argument array at every call site it can
  // read, so the two cannot drift.
  params: number;
  meta: MetaStatus;
  // The env var that must be 'true' before this template can be sent, or null if the path is
  // ungated. See the invariant below: an unapproved template MUST be gated.
  gate: string | null;
  // Plain English, for the person reading the registry rather than the code.
  purpose: string;
}

// ── The nightly reminder engine (app/api/cron/reminders) ────────────────────────────────────
export const T_NUDGE = 'lekhio_nudge';
export const T_REMINDER = 'lekhio_reminder';

// ── The trial ladder (app/api/cron/trial) ───────────────────────────────────────────────────
export const T_TRIAL_ENDING = 'lekhio_trial_ending';
export const T_TRIAL_ENDED = 'lekhio_trial_ended';

// ── Rakha's proactive signals (app/api/cron/agent) ──────────────────────────────────────────
export const T_AGENT_THRESHOLD = 'agent_threshold_alert';
export const T_AGENT_DEADLINE = 'agent_deadline_alert';
export const T_AGENT_OPPORTUNITY = 'agent_opportunity';

// The gates. Named here so the registry and the routes cannot disagree about the spelling of an
// env var, which is its own species of silent failure.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE REMINDER AND THE NUDGE HAVE SEPARATE GATES, AND THEY MUST STAY SEPARATE.
//
// Until 10 August 2026 one switch, REMINDER_TEMPLATES_APPROVED, controlled both. They are not the
// same kind of message and they do not deserve the same decision:
//
//   lekhio_reminder  ONE message, to ONE man, at a time HE chose, because he ASKED us to remember
//                    something. He is expecting it. Two to six a month. Not sending it is a broken
//                    promise, and on 10 August that is exactly what happened.
//   lekhio_nudge     A daily "do not forget your expenses" to EVERY customer with a number, that
//                    nobody asked for, on a metered channel. lib/routing.ts already records this
//                    row as a candidate to move off WhatsApp entirely: it is the weekly summary
//                    problem thirty times over.
//
// One switch meant the only way to keep a promise to one man was to start a daily paid broadcast
// to everybody. Nobody would ever choose that trade, so the switch stayed off and the promise
// stayed broken. Splitting them is what makes the safe move actually available.
//
// ⚠️ THE EXISTING VAR NARROWS TO THE REMINDER RATHER THAN THE NUDGE, ON PURPOSE. Anyone acting on
// old notes and setting REMINDER_TEMPLATES_APPROVED=true now switches on strictly less than it
// used to: the message a customer asked for, and not the broadcast. A rename that made a familiar
// switch do MORE than it did is how you get an accident on a Friday.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const GATE_REMINDERS = 'REMINDER_TEMPLATES_APPROVED';
export const GATE_NUDGE = 'NUDGE_TEMPLATES_APPROVED';
export const GATE_TRIAL = 'TRIAL_TEMPLATES_APPROVED';
export const GATE_AGENT = 'AGENT_TEMPLATES_APPROVED';

export const WA_TEMPLATES: WaTemplate[] = [
  {
    name: T_NUDGE,
    language: 'en_GB',
    // Active in WhatsApp Manager, read 10 August 2026. Approved is NOT the same as wanted: the
    // gate below stays off because a daily paid broadcast is a business decision, not a status.
    meta: 'approved',
    params: 0,
    gate: GATE_NUDGE,
    purpose: 'The daily "do not forget your expenses" nudge.',
  },
  {
    name: T_REMINDER,
    language: 'en_GB',
    params: 1,
    // Active in WhatsApp Manager, read 10 August 2026.
    meta: 'approved',
    gate: GATE_REMINDERS,
    purpose: 'A reminder the customer asked us to set, {{1}} is its title.',
  },
  {
    name: T_TRIAL_ENDING,
    language: 'en_GB',
    params: 1,
    meta: 'approved',
    // ⚠️ APPROVED BUT STILL GATED, AND THAT IS DELIBERATE. The invariant only requires that an
    // UNAPPROVED template be gated; a gate on an approved one is just a switch nobody has flipped
    // yet. Dropping GATE_TRIAL and GATE_AGENT starts real paid proactive messages going to real
    // customers, which is Jag's call to make when he is watching, not a tidy-up.
    gate: GATE_TRIAL,
    purpose: 'The trial is about to end, {{1}} is the date.',
  },
  {
    name: T_TRIAL_ENDED,
    language: 'en_GB',
    params: 0,
    meta: 'approved',
    gate: GATE_TRIAL,
    purpose: 'The trial has ended.',
  },
  {
    name: T_AGENT_THRESHOLD,
    language: 'en_GB',
    params: 1,
    meta: 'approved',
    gate: GATE_AGENT,
    purpose: 'A threshold he is approaching or has crossed, {{1}} is the sentence.',
  },
  {
    name: T_AGENT_DEADLINE,
    language: 'en_GB',
    params: 1,
    meta: 'approved',
    gate: GATE_AGENT,
    purpose: 'A deadline coming up, {{1}} is the sentence.',
  },
  {
    name: T_AGENT_OPPORTUNITY,
    language: 'en_GB',
    params: 1,
    meta: 'approved',
    gate: GATE_AGENT,
    purpose: 'Something he could claim, {{1}} is the sentence.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// RETIRED. Names the code used to send and MUST NEVER SEND AGAIN.
//
// This is not documentation, it is an assertion. test/watemplates.test.mjs fails the build if any
// of these reappears anywhere in app/ or lib/, so a revert or a copied line cannot quietly bring
// one back. Each one was removed for a reason worth keeping:
//
//   lekhio_weekly, lekhio_weekly_v2
//     The weekly summary stopped being a business-initiated push on 27 July 2026. Every proactive
//     WhatsApp message is paid for, and at an 85% target margin a weekly send to every customer
//     forever is a real line of cost for something most of them could simply look at. The summary
//     now lives in the product, free, and WhatsApp carries it only when he ASKS, which is a reply
//     inside the free inbound window and needs no template at all. Push is expensive, pull is free.
//
//   presale_welcome
//     The presale ladder went email only on the same reasoning. lib/presale.ts already supported
//     email, and a lead who has not yet paid us anything is the last person to spend a paid
//     template on.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const RETIRED_TEMPLATES = [
  'lekhio_weekly',
  'lekhio_weekly_v2',
  'presale_welcome',
] as const;

// The shape of a template name, used by the test to find literals that escaped this file. Anything
// matching this outside lib/watemplates.ts is a template name somebody hardcoded.
export const TEMPLATE_NAME_SHAPE = /^(lekhio|agent|presale)_[a-z0-9_]+$/;

export function findTemplate(name: string): WaTemplate | undefined {
  return WA_TEMPLATES.find((t) => t.name === name);
}

// ⚠️ THE INVARIANT, AND IT IS THE WHOLE SAFETY PROPERTY OF THIS FILE.
//
// A template Meta has not approved cannot be sent, so any path that can reach one MUST be behind an
// env flag that is off until it is. Everything else in this codebase already worked this way
// (AGENT_TEMPLATES_APPROVED, TRIAL_TEMPLATES_APPROVED, PRESALE_ENABLED). The reminder engine was
// the ONE send path with no gate at all, which is exactly why it was the one quietly failing every
// night for weeks with four bad names in it.
//
// The test asserts this over the whole registry. If you mark something 'approved' you are saying
// you have seen it approved in WhatsApp Manager, and you are allowed to drop its gate.
export function ungatedAndUnapproved(): WaTemplate[] {
  return WA_TEMPLATES.filter((t) => t.meta !== 'approved' && !t.gate);
}

// The env var that would have to be set to 'true' for this template to go out, or null when it is
// ungated. Exists so a log line or an operator message can NAME the switch instead of hardcoding
// it: the nudge's skip message said "set REMINDER_TEMPLATES_APPROVED=true" and stayed saying it
// after the nudge moved to its own gate, which is a wrong instruction printed with total
// confidence. Derive it, never retype it.
export function gateFor(name: string): string | null {
  return findTemplate(name)?.gate ?? null;
}

// True when this template may actually be sent right now: approved in Meta, or its gate is on.
// Routes should ask this rather than reading an env var directly, so "can we send" has one answer.
export function templateSendable(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const t = findTemplate(name);
  if (!t) return false;
  if (!t.gate) return t.meta === 'approved';
  return (env[t.gate] || '').trim().toLowerCase() === 'true';
}
