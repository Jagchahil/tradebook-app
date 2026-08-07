// lib/routing.ts. THE ONE PLACE THAT DECIDES WHICH CHANNEL A MESSAGE GOES DOWN.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS, AND IT IS THE SAME DISEASE AS lib/watemplates.ts.
//
// app/api/whatsapp/route.ts is 2,740 lines and calls sendText in more than sixty places. Every
// one of those is a decision to spend money on a channel, taken inline, recorded nowhere, and
// invisible to anybody reading the file for any other reason. Nobody ever chose to send sixty
// kinds of message on WhatsApp. It happened one helpful line at a time, which is doc 103's
// warning about screens applied to cost instead of clutter.
//
// From 1 October 2026 Meta bills per MESSAGE rather than per 24 hour CONVERSATION, so each of
// those sixty lines becomes a recurring charge. lib/margin.ts models it: the 82% floor breaks at
// 56 outbound messages a month, which is two a day, which is an ORDINARY customer. So the cost
// lands on the customers who like us most, and a metered channel is the only reason Lekhio would
// ever cap anybody, which is the exact frustration we refuse to repeat.
//
// You cannot fix that by budgeting harder. You fix it by having one table that says where each
// kind of message goes, so the answer is a row somebody chose rather than a line somebody wrote.
//
// ⚠️ THE RULE: A CALL SITE MAY NOT PICK A CHANNEL. IT NAMES A MESSAGE TYPE AND ASKS HERE.
//
// test/routing.test.mjs asserts the shape of every row and fails the build on a row that names a
// WhatsApp template this codebase cannot send. The point is not that the table is clever. The
// point is that changing where a message goes is a one line diff in one file that a person can
// read in a minute, instead of a search across sixty call sites.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// PURE. No I/O, no database, no network, no clock. It decides, it never sends. The sending stays
// where it already lives: lib/whatsapp.ts, lib/email.ts, lib/push.ts, per CLAUDE.md rules 3 and 4.

import { findTemplate, templateSendable, T_NUDGE, T_REMINDER, T_TRIAL_ENDING, T_TRIAL_ENDED, T_AGENT_THRESHOLD, T_AGENT_DEADLINE, T_AGENT_OPPORTUNITY } from './watemplates';

// ── The channels ─────────────────────────────────────────────────────────────────────────
//
// thread            The Lekhio thread, on the web and in the app. Free, ours, and unmetered for
//                   ever. Everything conversational belongs here.
// push              An app notification. Free, instant, and only reaches a man who installed the
//                   app AND left notifications on. Never assume it landed.
// email             Resend, already live on a verified lekhio.app domain because it sends
//                   invoices. Free at our volumes, reaches everybody, and he may not read it today.
// whatsapp_reply    A free form reply inside his own 24 hour window. Costs nothing until
//                   1 October 2026 and about 2.2p a message after it. Needs no template.
// whatsapp_template A message WE start. Always costs money, always needs a template Meta approved,
//                   always behind its gate in lib/watemplates.ts.
export type Channel = 'thread' | 'push' | 'email' | 'whatsapp_reply' | 'whatsapp_template';

// Every kind of message the product sends a customer. Adding one here without a row below fails
// the test, which is the whole reason the type and the table are separate.
export type MessageType =
  | 'capture_ack'
  | 'capture_unreadable'
  | 'conversation_answer'
  | 'weekly_ready'
  | 'nudge'
  | 'reminder_due'
  | 'trial_ending'
  | 'trial_ended'
  // ⚠️ NAMED alert_ AND NOT agent_, ON PURPOSE. 'agent_opportunity' would be byte identical to
  // the TEMPLATE name in lib/watemplates.ts, and test/watemplates.test.mjs greps shipping code for
  // a quoted template name to prove none escaped the registry. A message type that happens to spell
  // a template name makes that guard cry wolf, and a guard that cries wolf is a guard somebody
  // deletes. It reads better too: these are the alerts, and alerts are what WhatsApp is still for.
  | 'alert_threshold'
  | 'alert_deadline'
  | 'alert_opportunity'
  | 'connect_result'
  | 'work_paused';

export interface Route {
  type: MessageType;
  // In the order they should be attempted. Every channel in the list is tried: these are not
  // fallbacks. A man with the app gets the push AND the email, because Jag's decision on
  // 28 July was that everybody gets the email whether or not they have the app.
  channels: Channel[];
  // The template, for a whatsapp_template row. Null for every other row. The test checks that a
  // row with that channel names a template lib/watemplates.ts actually declares, so a message
  // cannot be routed at a name Meta has never heard of.
  template: string | null;
  // Why this message goes where it goes, in plain English. Not decoration: the next person to
  // move a row needs to know what the last person was weighing, or they will move it back.
  why: string;
}

// ⚠️ CAPTURE IS THE ONE THAT CHANGED, AND IT IS THE WHOLE POINT OF THE RETHINK.
//
// He photographs a receipt into WhatsApp. Inbound is free for ever, so the capture costs nothing.
// Answering him on WhatsApp is what costs, and capture is by far the highest volume thing we do,
// so it is the single largest line of the 1 October bill.
//
// Decided by Jag on 28 July 2026: he gets an app notification if he has the app, and he gets an
// email either way. No WhatsApp reply at all. So the receipt loop would cost nothing in either
// direction, and the acknowledgement would still reach a man with no app.
//
// 🔴 AND THAT DECISION IS NOT LIVE. THIS ROW RECORDS IT, IT DOES NOT DESCRIBE THE PRODUCT.
// CORRECTED 7 AUGUST 2026, BECAUSE THE PARAGRAPH THAT SAT HERE WAS SIMPLY UNTRUE.
//
// It promised that an email went out on every capture, so there was always something. No email
// went out. lib/email.ts has no capture sender and never has had one, and lib/push.ts is only ever
// called by the weekly cron and the agent cron, so neither channel on this row has anything behind
// it for a receipt. Nothing in app/ or lib/ asks routeFor('capture_ack') or channelsFor
// ('capture_ack') either. This row governs nothing today, and a sentence in a comment is how the
// next person inherits that mistake. test/routing.test.mjs section 9b now holds the retired wording
// and fails the build if any version of that promise comes back without a sender behind it.
//
// WHAT ACTUALLY HAPPENS, and it is the opposite of what the row says: the WhatsApp webhook answers
// every receipt inline, on WhatsApp, inside his own free window. Nine paths and nine replies, and
// since 7 August a throw between the photograph and the send cannot swallow the sentence either.
// See handleReceiptImage in app/api/whatsapp/route.ts. So a man who photographs a receipt IS
// answered, in the channel he used. He is simply not answered by this table.
//
// WHY THE ROW STAYS. It is Jag's decision of record, and captureRoutesToWhatsApp() at the foot of
// this file is what stops anybody routing capture at a paid channel on the day it does go live.
// Deleting the row deletes that guard.
//
// 🔴 WHAT HAS TO HAPPEN BEFORE THE INLINE REPLY IS TOUCHED. The email has to exist first. Taking
// the WhatsApp reply out on the strength of this row as it was written would have removed the only
// acknowledgement a man gets and put nothing in its place, which is exactly the failure the risk
// paragraph below was worried about. Whether we build that email at all is Jag's call and not a
// tidy up: doc 103 says the best button is no button, and an email he did not ask for is a message
// in his inbox for something he already watched happen on his phone.
//
// The risk was named at the time and is not pretended away: silence in the channel he just used
// reads as failure. The bank connection is the real answer to volume: a connected account captures
// spending with no message at all, which makes every receipt photo only what the feed could not see.
export const ROUTES: Route[] = [
  {
    type: 'capture_ack',
    channels: ['push', 'email'],
    template: null,
    why: 'A receipt or voice note landed and needs confirming. Jag, 28 July 2026: notification if he has the app, email for everybody. Never a WhatsApp reply, because this is the highest volume message in the product and 1 October makes every one of them billable. NOT LIVE: nothing reads this row and no capture email exists, so the webhook still answers inline on WhatsApp. See the block above.',
  },
  {
    // ⚠️ THE ONE ROW THAT KEEPS ITS WHATSAPP REPLY, AND IT IS DELIBERATE.
    //
    // An unreadable photo leaves NO transaction behind. A man who hears nothing assumes it worked,
    // and the expense is simply lost: he finds out at the quarter, if ever. That is different in
    // kind from a successful capture, where the money is safely in his books and the message is
    // only telling him so. So this one answers in the channel he used, and it is rare by nature.
    //
    // Flagged for Jag rather than decided quietly: this row was NOT part of the 28 July decision,
    // and moving it is a one line change here.
    type: 'capture_unreadable',
    channels: ['whatsapp_reply', 'push', 'email'],
    template: null,
    why: 'We could not read the photo, so nothing was saved and he must send it again. Silence here loses him money rather than merely worrying him, so it answers in the channel he used. Rare by nature.',
  },
  {
    // ⚠️ THE ONE ROW IN THIS TABLE WITH NOWHERE ELSE TO GO, AND IT IS WORTH SAYING WHY, BECAUSE
    // EVERY OTHER ROW HERE EXISTS TO MOVE A MESSAGE OFF THE METERED CHANNEL.
    //
    // This is the answer to a code he sent us from his own WhatsApp to prove the phone is his. It
    // happens BEFORE anything is bound, which is the whole point of it, so at the moment it sends:
    // there is no bound number to push to, there is no thread because the thread belongs to an
    // account this message is what attaches him to, and an email would answer a man on the wrong
    // device entirely. He is standing there holding the phone, watching the chat he just sent from.
    //
    // The cost is real and it is small. Once per customer for ever, not once per receipt, which is
    // the opposite end of the scale from capture_ack. If it ever starts firing more than about once
    // per customer, something is wrong with binding rather than with this row.
    type: 'connect_result',
    channels: ['whatsapp_reply'],
    template: null,
    why: 'The reply to a WhatsApp binding code. It is sent before he has a bound number, a thread or an app, so WhatsApp is not the cheapest channel here, it is the only one that exists yet. Once per customer, and it is a reply inside his own window so it needs no template.',
  },
  {
    // ⚠️ TELLING HIM THE WORK HAS STOPPED IS ITSELF A PAID MESSAGE, WHICH IS WORTH SAYING OUT LOUD.
    //
    // From 1 October every outbound WhatsApp message is billed, so we pay about 2.2p to tell a man
    // who is no longer paying us that we are no longer working for him. That is still right:
    // silence in the channel he just used reads as broken, and a customer who thinks we are broken
    // does not come back to pay.
    //
    // It is bounded rather than open ended: processMessage's durable daily cap per phone stops a
    // man who keeps texting from costing us a message every time, and the always answered list means
    // he can still reach a human without spending anything extra.
    type: 'work_paused',
    channels: ['whatsapp_reply'],
    template: null,
    why: 'His trial has ended and he has just sent us work. He messaged us, so the window is open and this is a free form reply. Silence would read as the product being broken rather than as him not paying.',
  },
  {
    type: 'conversation_answer',
    channels: ['thread'],
    template: null,
    why: 'Every answer to a question he asked. This is where the volume and therefore the cost is, so it moves off the metered channel entirely. Free, ours, and he can scroll back through it.',
  },
  {
    type: 'weekly_ready',
    channels: ['push', 'email'],
    template: null,
    why: 'His weekly summary is ready to look at. A weekly paid send to every customer for ever is exactly what item 2 removed on 27 July. The summary itself is a pull, in the thread and on the web.',
  },
  {
    // ⚠️ WORTH REVISITING, AND RECORDED HERE RATHER THAN LEFT AS A FEELING.
    //
    // A daily nudge to every customer on a metered channel is the weekly summary problem with
    // thirty times the frequency. It is gated off today (REMINDER_TEMPLATES_APPROVED is not set),
    // so nothing is being sent and nothing is being spent. Left as it is declared rather than
    // quietly re-routed, because flipping it is Jag's call and the gate is what makes it safe to
    // leave alone.
    type: 'nudge',
    channels: ['whatsapp_template'],
    template: T_NUDGE,
    why: 'The daily do not forget your expenses nudge. Declared as it stands today and currently gated off. A daily paid send to everybody is the weekly problem thirty times over, so this row is a candidate to move to push and email.',
  },
  {
    type: 'reminder_due',
    channels: ['whatsapp_template', 'push'],
    template: T_REMINDER,
    why: 'A reminder he asked us to set, for a date he chose. He wants this one read on the day, which is what a paid alert buys. Two to six a month, well under 1% of revenue.',
  },
  {
    type: 'trial_ending',
    channels: ['whatsapp_template', 'email'],
    template: T_TRIAL_ENDING,
    why: 'His trial is about to end and he is about to be charged. Money he is about to spend must be read, not discovered.',
  },
  {
    type: 'trial_ended',
    channels: ['whatsapp_template', 'email'],
    template: T_TRIAL_ENDED,
    why: 'His trial has ended. Same reason as trial_ending: it changes what he pays.',
  },
  {
    type: 'alert_threshold',
    channels: ['whatsapp_template', 'push'],
    template: T_AGENT_THRESHOLD,
    why: 'A threshold he is approaching or has crossed, VAT registration above all. Missing one costs him real money and there is a date on it.',
  },
  {
    type: 'alert_deadline',
    channels: ['whatsapp_template', 'push'],
    template: T_AGENT_DEADLINE,
    why: 'A filing or payment deadline. HMRC penalties are automatic, so this is the clearest case there is for a message that must be read.',
  },
  {
    type: 'alert_opportunity',
    channels: ['whatsapp_template', 'push'],
    template: T_AGENT_OPPORTUNITY,
    why: 'Something he could claim and has not. It is money he is giving away, and doc 108 is the whole reason we chase it rather than wait to be asked.',
  },
];

// ── Reading the table ─────────────────────────────────────────────────────────────────────────

export function routeFor(type: MessageType): Route | undefined {
  return ROUTES.find((r) => r.type === type);
}

// What we know about the man on the other end, at the moment of sending. Deliberately tiny: this
// module decides channels, so it is told only what changes a channel decision.
export interface Recipient {
  // He installed the app and left notifications on. A missing token is not a maybe, it is a no.
  hasPush: boolean;
  // We hold an email address for him. Email has been compulsory since 17 July, so this is almost
  // always true, and the almost is why it is a field rather than an assumption.
  hasEmail: boolean;
  // We hold a mobile number matched to his account. It is the account key, so this is effectively
  // always true, and it is checked anyway because a channel we cannot reach is not a channel.
  hasWhatsApp: boolean;
}

// The channels this message should actually go down for this man, right now.
//
// A channel drops out for exactly two reasons: we cannot reach him on it, or the template is not
// sendable yet. Both are refusals, never silent substitutions. If the answer is an empty list the
// caller must say so in its logs rather than assume something went out, because a message nobody
// received looking like a message that was sent is the house disease.
export function channelsFor(
  type: MessageType,
  to: Recipient,
  env: NodeJS.ProcessEnv = process.env,
): Channel[] {
  const route = routeFor(type);
  if (!route) return [];
  return route.channels.filter((c) => {
    if (c === 'thread') return true;
    if (c === 'push') return to.hasPush;
    if (c === 'email') return to.hasEmail;
    if (c === 'whatsapp_reply') return to.hasWhatsApp;
    // A template that Meta has not approved, or whose gate is off, is not a channel. Asking
    // templateSendable rather than reading an env var keeps one answer to "can we send this".
    return to.hasWhatsApp && !!route.template && templateSendable(route.template, env);
  });
}

// ── The cost side ────────────────────────────────────────────────────────────────────────────
//
// Kept here rather than in lib/margin.ts because margin.ts is deliberately import free and must
// stay that way. This is the translation between a routing decision and the two kinds of cost
// margin.ts already prices: a service reply and a proactive send.

export function isBillable(channel: Channel): boolean {
  return channel === 'whatsapp_reply' || channel === 'whatsapp_template';
}

// How a channel is priced by lib/margin.ts. Null for the free ones, so a caller counting spend
// cannot accidentally price an email.
export function costKind(channel: Channel): 'service' | 'proactive' | null {
  if (channel === 'whatsapp_reply') return 'service';
  if (channel === 'whatsapp_template') return 'proactive';
  return null;
}

// Every message type that can put a paid message on the wire. The test pins this list, so adding
// a billable route is a visible change in a diff rather than a quiet one.
export function billableTypes(): MessageType[] {
  return ROUTES.filter((r) => r.channels.some(isBillable)).map((r) => r.type);
}

// ── The invariants the test enforces ─────────────────────────────────────────────────────────

// A row that names a template the registry does not declare. Must always be empty: routing a
// message at a name Meta has never heard of is the four broken templates of 27 July all over again.
export function routesWithUnknownTemplate(): Route[] {
  return ROUTES.filter((r) => r.template !== null && !findTemplate(r.template));
}

// A row that says whatsapp_template but names no template, or names one without saying it. Either
// way the row cannot do what it claims.
export function routesWithBrokenTemplateWiring(): Route[] {
  return ROUTES.filter((r) => {
    const declares = r.channels.includes('whatsapp_template');
    return declares !== (r.template !== null);
  });
}

// 🔴 THE ONE THAT MATTERS MOST. Capture must never reach a paid outbound channel.
//
// capture_ack is the highest volume message in the product. If it ever routes to WhatsApp again,
// the whole 28 July decision is undone by one line, and nothing else in the codebase would notice.
export function captureRoutesToWhatsApp(): boolean {
  const ack = routeFor('capture_ack');
  return !!ack && ack.channels.some(isBillable);
}
