// Email sending, via Resend. Dormant until RESEND_API_KEY is set, so everything degrades gracefully
// until email is switched on. EVERY customer-facing email flows through one branded shell() so the whole
// system looks like one professional company. 1-to-1 front-desk replies (sendReplyEmail) stay plain on
// purpose, because a real person's reply should not look like a marketing blast.
//
// Env vars:
//   RESEND_API_KEY   from resend.com
//   EMAIL_FROM       e.g. "Lekhio <hello@lekhio.app>" (the domain must be verified in Resend). Defaults
//                    to invoices@lekhio.app.

// Both of these are read rather than retyped. TRIAL_DAYS lives in lib/entitlement.ts and HOW_LONG in
// lib/onboarding.ts, and both modules are pure with no imports of their own, so this costs nothing.
import { TRIAL_DAYS } from './entitlement';
import { HOW_LONG } from './onboarding';
// The reverse charge wording, read rather than retyped. It exists to satisfy somebody else's
// rulebook (VATREVCON37100) and a second copy of it here would be a second thing to get wrong.
// lib/vat.ts has no imports of its own, so this costs nothing.
import { REVERSE_CHARGE_WORDING } from './vat';
import { gbp2 } from './money';
import type { LeadPromise } from './features';

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'Lekhio <invoices@lekhio.app>';
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';

// --- brand palette --------------------------------------------------------
const INK = '#111111';
const RIVER = '#1B59A6';
const GOLD = '#C9842A';  // SAFFRON_DEEP. This was two ticks off it.
const MUTED = '#5B6470';
const CREAM = '#FBFAF7';
const LINE = '#ECE9E2';
const CARD = '#FFFFFF';

export function hasEmailConfig(): boolean {
  return Boolean(KEY);
}

function looksLikeEmail(value: string | null | undefined): boolean {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}
export { looksLikeEmail };

// Escape any user-supplied text before it goes into email HTML, so a customer or business name
// containing markup cannot inject into the recipient's inbox.
function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fromAddr(): string {
  return FROM.replace(/.*</, '').replace(/>.*/, '');
}

// A safe https(s) link, or the app URL as a fallback, so a bad link can never break out of an href.
function safeUrl(href: string | null | undefined): string {
  return href && /^https?:\/\/[^\s"'<>]+$/i.test(href) ? href : APP;
}

// --- the branded shell every marketing/transactional email flows through --
// `inner` is the message content (headings, paragraphs, buttons). opts.preheader is the hidden inbox
// preview line; opts.unsubscribeLink adds the unsubscribe footer line (marketing only).
function shell(inner: string, opts: { preheader?: string; unsubscribeLink?: string } = {}): string {
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CREAM}">${esc(opts.preheader)}</div>`
    : '';
  const unsub = opts.unsubscribeLink
    ? `<p style="margin:10px 0 0">You're getting this because you gave Lekhio your email address. <a href="${safeUrl(opts.unsubscribeLink)}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a> any time.</p>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  ${pre}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%">
      <tr><td style="padding:4px 6px 18px">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${INK}">Lekhio</span><span style="color:${GOLD};font-weight:800;font-size:22px">.</span>
      </td></tr>
      <tr><td style="background:${CARD};border:1px solid ${LINE};border-radius:16px;padding:34px 34px 30px;box-shadow:0 1px 2px rgba(17,17,17,.03)">
        ${inner}
      </td></tr>
      <tr><td style="padding:20px 6px 8px;font-size:12px;line-height:1.6;color:${MUTED}">
        <!-- 🔴 THE FOOTER OF EVERY EMAIL WE SEND, AND IT SOLD THE CHANNEL AS THE PRODUCT.
             It read "Your books and tax, handled in WhatsApp". Doc 104: "Lekhio is not software you
             buy. It is the first employee a business ever hires", and section 3, sell the outcome
             and never the technology. WhatsApp is one of three ways in, alongside a photo and a
             statement import, and naming it here made the narrowest door the whole house. This is
             the sentence that goes to a customer more often than any other in the product, on every
             receipt, every invoice notice and every trial email, and until 3 August 2026 nothing in
             the test suite so much as looked at it. -->
        <p style="margin:0">Lekhio. The first employee your business hires.</p>
        <p style="margin:6px 0 0">Lekhio is an independent UK company. It is not affiliated with HMRC, and nothing is ever filed to HMRC without your approval.</p>
        ${unsub}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SUBJECT RULE. AN EMAIL A PERSON CAN RECEIVE MORE THAN ONCE MUST VARY ITS SUBJECT.
//
// 7 August 2026, and it cost us a week. Every sign in code WAS delivered and the customer still
// could not find one. The Supabase magic link subject was the fixed string "Your Lekhio Code", and
// GMAIL THREADS BY SENDER PLUS SUBJECT, so every code a man had ever been sent collapsed into ONE
// conversation headed by its OLDEST message. Nothing new ever appeared at the top of his inbox.
// Eight codes in one thread and two of them dragged to Trash, because tidying away a spent code
// bins the new one that arrived under the same heading. It was fixed by putting the token IN the
// subject, and then seven of our own emails turned out to have the same shape.
//
// So this is a RULE, not seven edits. Every email in this file declares itself as one of three
// things and there is no fourth, because send() takes this union and nothing else. A bare string
// does not compile.
//
//   repeats   He can get another one. The subject carries a MARK that changes every time: the
//             moment it was sent, an invoice number, the code itself. Two of them can never land in
//             one thread. SUBJECT_MARKS says which mark each key uses and argues for it, because a
//             mark that only changes once a day is a fixed subject for the next twenty four hours.
//   once      One per customer for life, so there is never a second one to collapse it with. The
//             reason lives in ONCE_PER_CUSTOMER and it IS the exemption. When the reason stops
//             being true the email moves to `repeats`.
//   caller    The subject belongs to the caller. A campaign writes its own. A front desk reply MUST
//             keep the subject it came in on or it stops threading, and that is the one place in
//             the product where collapsing into one conversation is the point.
//
// ⚠️ test/subjectrule.test.mjs calls every repeating subject twice with two different marks and
// goes RED when the two come back the same, so an email added in six months cannot get this wrong
// by default. It either carries a mark or the build stops. It then does it AGAIN with two marks
// that differ only by the time of day inside ONE calendar day, which is the 9 August defect, and
// the only way past that assertion is a written exemption in SAME_DAY_EXEMPT.
//
// ⚠️ AND THE MARK IS NEVER MONEY HE EARNED. A subject line is readable on a locked phone lying face
// up on a dashboard, with a customer or a mate in the passenger seat. "£4,120 in this week" is his
// turnover announced to whoever is sitting next to him. The day tells one week from the next, which
// is all a thread needs, and it costs him nothing to have on show.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The day a repeating email is about, in the form a man in Britain reads it. Never an ISO string.
// Same rule and same timezone as humanDate() in lib/trialnudge.ts.
//
// ⚠️ THIS IS A DAY AND NOTHING SMALLER, so it is CONSTANT FOR TWENTY FOUR HOURS. Two emails sent on
// one day carry the same mark and therefore the same subject. That is fine for an email a man can
// only get once a day and it is a bug for every other one, so a key using this must argue for it in
// SAME_DAY_EXEMPT below. Everything else takes subjectMoment().
export function subjectDay(when: Date = new Date()): string {
  const d = when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 9 AUGUST 2026. THE SAME DAY COLLISION, SEEN IN A REAL GMAIL INBOX.
//
// Two lead confirm emails went to ONE address FIFTY THREE SECONDS apart, because a man ran two of
// the free calculators one after the other. Both subjects were the byte identical string
// "Confirm your email to get your result, 9 August", and Gmail put them in ONE conversation, id
// 19fe3c19bd3f15ce, headed by the OLDER of the two. The Gmail search returned them as a single
// result, not two.
//
// 8f0e640 killed the FIXED subject. It did not kill this. Day and month, with no year and no clock,
// is the same string for twenty four hours, and FIVE of the eight repeating subjects were using it.
//
// It has not cost anybody anything YET, and only by luck: each confirm carries its own signed token
// and every one lasts seven days (LEAD_CONFIRM_TTL_SECONDS in lib/leadtoken.ts), so the older link
// he taps still works. The day a link becomes single use, or expires in an hour, the message on top
// of that thread is a dead link and it is the only one he can see.
//
// So the mark for an email he can get twice in a day is the day AND the time of day.
//
// ⚠️ WHY A CLOCK AND NOT A RANDOM STRING. The rule this file already keeps is that the DATE goes in
// the subject and MONEY never does, because a subject line is read on a locked phone by a man on a
// ladder with a customer beside him. A random tag on the end would thread correctly and tell him
// nothing. The time he was sent it is honest, it is readable, it is naturally different on every
// send, and it answers the only question two near identical emails raise: which one is the new one.
//
// ⚠️ AND IT IS SECONDS, NOT MINUTES, ON PURPOSE. Fifty three seconds apart falls inside ONE minute
// roughly one time in nine, and a double tap on a submit button falls inside one minute every time.
// A mark that is nearly always unique is the same class of defect as a mark that is never unique.
// It only waits longer to be seen, and this one has now been shipped twice.
//
// ⚠️ IT IS STILL NOT MONEY, AND IT NEVER BECOMES MONEY. See the subject rule above.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function subjectMoment(when: Date = new Date()): string {
  const d = when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
  // hourCycle h23 rather than hour12, so midnight is 00 on every ICU build and never 24, and the
  // am/pm a person reads is composed here rather than left to a locale that may write "pm", "p.m."
  // or a narrow no break space depending on which ICU the runtime was built with.
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Europe/London',
  }).formatToParts(d);
  const part = (type: string) => parts.find((x) => x.type === type)?.value ?? '00';
  const h24 = Number(part('hour'));
  const clock = h24 < 12 ? 'am' : 'pm';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${subjectDay(d)} at ${h12}:${part('minute')}:${part('second')}${clock}`;
}

// The Sunday the weekly summary is ABOUT, which is not the day it is sent.
//
// ⚠️ THE JOB FIRES AT 23:00 UTC ON SUNDAY (vercel.json, then jobsFor() in /api/cron/daily). In
// British Summer Time that instant is already MONDAY in London, so formatting "now" would date his
// week to the day after it ended. This lands on noon UTC, where every timezone agrees which
// calendar day it is, then rolls back to Sunday, so it stays right if the job ever moves.
export function weekEndingDay(now: Date = new Date()): string {
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay: 0 is Sunday
  return subjectDay(d);
}

export type RepeatKey =
  | 'invoice'
  | 'signup-code'
  | 'weekly-ready'
  | 'payment-ok'
  | 'payment-fail'
  | 'lead-confirm'
  | 'lead-confirm-list'
  | 'lead-result'
  | 'waitlist';

// THE ONE PLACE A REPEATABLE SUBJECT IS COMPOSED. Each takes the mark and puts it where a man
// reading his inbox will actually use it.
export const REPEATING_SUBJECTS: Record<RepeatKey, (mark: string) => string> = {
  // The invoice number, and the trader's name when there is one. This was already right. It is
  // registered so it stays right: drop the number and every invoice a tradesman ever sends one
  // customer lands in a single thread headed by the first one.
  invoice: (mark) => `Invoice ${mark}`,

  // The code itself. The fix that taught us all of this.
  'signup-code': (mark) => `${mark} is your Lekhio code`,

  // 🔴 THE WORST ONE. Every Sunday for the life of the customer, so by week three his whole
  // relationship with Lekhio was one collapsed conversation with an old date at the top of it.
  'weekly-ready': (mark) => `Your week to ${mark} is ready`,

  // Every renewal, for as long as he pays us.
  'payment-ok': (mark) => `Payment received on ${mark}, thanks from Lekhio`,

  // Every dunning retry. Stripe tries again on a different day, so the day is also the thing that
  // tells him this is a NEW attempt and not the email he read on Tuesday.
  'payment-fail': (mark) => `We could not take your Lekhio payment on ${mark}`,

  // Every use of a free tool. Two uses a month apart used to collapse, and he would tap the older
  // link, which is now the expired one. See lib/leadtoken.ts.
  'lead-confirm': (mark) => `Confirm your email to get your result, ${mark}`,

  // 🔴 THE SAME EMAIL, ON A PAGE WHERE THERE IS NO RESULT. /free-mtd-filing is a waitlist: free
  // filing is not built, the page says so plainly, and the confirm that followed it still opened
  // "You asked us to send you your result". A subject of its own, because a man who used a
  // calculator this morning and joined this list this afternoon is confirming two different
  // things and must not have them collapse into one Gmail conversation.
  'lead-confirm-list': (mark) => `Confirm your email to join the free filing list, ${mark}`,

  // Every confirm.
  'lead-result': (mark) => `Your result from Lekhio, ${mark}`,

  // A double submit. supabase/APPLY_2026-08-08_waitlist_unique.sql stops the second row. This stops
  // a second email hiding underneath the first, and a double submit is SECONDS apart, which is why
  // the mark here is a moment and not a day.
  waitlist: (mark) => `You are on the Lekhio list, ${mark}`,
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHERE EACH REPEATING SUBJECT GETS ITS MARK, AND WHY. ONE DECISION PER KEY, NOT ONE RULE.
//
// The eight do not repeat at the same speed. Two sign in codes arrive a minute apart; two renewal
// receipts arrive a month apart. A blanket "put the clock on everything" would put a timestamp on a
// receipt that reads better with a plain date, and a blanket "put the day on everything" is the
// defect of 9 August. So every key declares what its mark is made of and argues for it here.
//
// ⚠️ THE RECORD IS OVER RepeatKey, so tsc refuses a ninth email that does not make this decision,
// and test/subjectrule.test.mjs holds these keys to the SAME SET as REPEATING_SUBJECTS by equality,
// so it cannot be satisfied by adding a key here and forgetting one there.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type MarkSource =
  // subjectMoment(): the day and the time of day. Two sends one second apart are two threads.
  | 'moment'
  // subjectDay(): the calendar day only, so two sends in one day COLLIDE. A key using this MUST
  // appear in SAME_DAY_EXEMPT with the argument for why that is acceptable.
  | 'day'
  // weekEndingDay(): the Sunday the week ended on. Same collision, same requirement.
  | 'week'
  // Something the caller already holds that differs on every send: an invoice number, a sign in
  // code. The uniqueness is real but it is not ours, so it is named rather than assumed.
  | 'caller';

export const SUBJECT_MARKS: Record<RepeatKey, { source: MarkSource; why: string }> = {
  invoice: {
    source: 'caller',
    why: 'The invoice number, plus the trader name when there is one. A tradesman does not send one customer two invoices under one number, and if he does that is a numbering problem in his books long before it is a threading problem in Gmail.',
  },
  'signup-code': {
    source: 'caller',
    why: 'The six digit code itself, minted fresh by /api/signup/code on every request and expiring in ten minutes. It is also the thing he opened the email for, so it belongs at the front of the subject whether it threads or not.',
  },
  'weekly-ready': {
    source: 'week',
    why: 'The Sunday the week ended on. One per week by construction, so see SAME_DAY_EXEMPT for the same day argument.',
  },
  'payment-ok': {
    source: 'day',
    why: 'The day the payment was taken. One per invoice per billing cycle, so see SAME_DAY_EXEMPT for the same day argument.',
  },
  'payment-fail': {
    source: 'moment',
    why: 'A same day repeat is REAL and it is the common one: he reads the first email, taps Update payment, puts in a second card that also fails, and Stripe raises invoice.payment_failed again within the minute. That second email is the one carrying the live call to action, and if it files itself under the first he sees a message he has already dealt with and stops. Stripe smart retries can also land twice inside twenty four hours.',
  },
  'lead-confirm': {
    source: 'moment',
    why: 'THE ONE OBSERVED IN THE INBOX ON 9 AUGUST 2026: two confirms 53 seconds apart, one thread, headed by the older message. Running two calculators back to back is exactly what the free tools are built to invite, each confirm is a separate signed token, and the link he can see is the older one. It works today only because the window is seven days.',
  },
  'lead-confirm-list': {
    source: 'moment',
    why: 'The waitlist twin of lead-confirm, and it repeats for the same reason: he can rejoin, and '
      + 'a confirm he joined in July must not sit underneath one he joined in March. Same mark, same '
      + 'argument, different sentence.',
  },
  'lead-result': {
    source: 'moment',
    why: 'It follows lead-confirm, so it inherits its shape: confirm two tools in one afternoon and two results land the same day. This one is worse than a hidden receipt because the body IS his figures. A man reading the wrong tool answer under the newer heading acts on a number that was never his.',
  },
  waitlist: {
    source: 'moment',
    why: 'The email this key exists to protect is the second half of a DOUBLE SUBMIT, which is a second or two apart and therefore always the same calendar day. A day mark did nothing whatsoever for the case its own comment claimed to cover.',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE KEYS THAT ARE ALLOWED TO COLLIDE WITHIN ONE DAY, AND THE ARGUMENT FOR EACH.
//
// Same shape and same discipline as ONCE_PER_CUSTOMER: the value IS the exemption. A key whose mark
// cannot change inside a day is either on this list with a reason a person can disagree with, or it
// is a bug. test/subjectrule.test.mjs derives this set from SUBJECT_MARKS and holds it to this one
// by equality, so an exemption can never be taken by silently leaving a key out.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type SameDayExemptKey = Extract<RepeatKey, 'payment-ok' | 'weekly-ready'>;

export const SAME_DAY_EXEMPT: Record<SameDayExemptKey, string> = {
  'payment-ok':
    'Stripe raises invoice.payment_succeeded once per invoice, and Lekhio bills one subscription on one cycle, so a second receipt in one calendar day needs a second subscription. And if two ever did land in one thread, nothing is lost: a receipt asks him for nothing, carries no link that expires, and the amount lives in the body because a subject line is not allowed to carry it. A plain date reads better on a locked phone than a date and a clock, and a receipt is the one repeating email whose job is to be unremarkable.',
  'weekly-ready':
    'The mark is the Sunday the week ended on, not the day it was sent, and /api/cron/daily raises it once a week. Two in one calendar day means the cron fired twice, and the fix for that is the cron, not the subject line. The Sunday is also the only part he wants to read: a time of day would tell him when a machine ran, which says nothing about which week he is looking at.',
};

export type OnceKey = 'welcome' | 'trial-week' | 'trial-ended';

// One per customer for life. A constant subject is honest here, because there is never a second one
// to collapse it with. The value is the REASON, and the reason is the whole exemption.
export const ONCE_PER_CUSTOMER: Record<OnceKey, string> = {
  welcome:
    'Fires from /api/signup/verify, on the far side of proving the email address, and an account is verified once. A second one needs a second account.',
  'trial-week':
    'decideTrialNudge() in lib/trialnudge.ts only returns warn while trial_warn_sent_at is null, and an account gets one trial.',
  'trial-ended':
    'The same guard in the same function, on trial_end_sent_at.',
};

export type CallerKey = 'marketing' | 'reply';

// The subject is not ours to compose. Both of these have a reason that is not laziness.
export const CALLER_OWNS_SUBJECT: Record<CallerKey, string> = {
  marketing:
    'A campaign writes its own subject and every issue is a different one. test/subjectrule.test.mjs holds lib/newsletter.ts, lib/nurture.ts and lib/presale.ts to subjects that are unique inside their own registry, which is where a copy and paste would collide.',
  reply:
    'A one to one reply MUST keep the subject it came in on, alongside the In-Reply-To header, or it stops threading. This is the one place in the product where landing in the same conversation is the point.',
};

export type EmailSubject =
  | { repeats: RepeatKey; mark: string }
  | { once: OnceKey; subject: string }
  | { caller: CallerKey; subject: string };

export function resolveSubject(s: EmailSubject): string {
  return 'repeats' in s ? REPEATING_SUBJECTS[s.repeats](s.mark) : s.subject;
}

// A branded primary button.
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px"><tr><td style="background:${RIVER};border-radius:10px">
    <a href="${safeUrl(href)}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${esc(label)}</a>
  </td></tr></table>`;
}

const h1 = (t: string) => `<p style="font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${INK};margin:0 0 14px">${t}</p>`;
const p = (t: string) => `<p style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 14px">${t}</p>`;
const pMuted = (t: string) => `<p style="font-size:14px;line-height:1.6;color:${MUTED};margin:14px 0 0">${t}</p>`;

// --- one place that actually calls Resend ---------------------------------
// ⚠️ `subject` IS THE UNION AND NOT A STRING, ON PURPOSE. It is the whole of the subject rule: an
// email added later cannot reach Resend without saying whether a person can receive it twice.
async function send(opts: { from?: string; to: string; subject: EmailSubject; html: string; listUnsub?: string; tag?: string }): Promise<boolean> {
  if (!KEY) return false;
  if (!looksLikeEmail(opts.to)) return false;
  const headers: Record<string, string> = {};
  if (opts.listUnsub) {
    headers['List-Unsubscribe'] = `<${opts.listUnsub}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: opts.from || `Lekhio <${fromAddr()}>`,
        to: [opts.to],
        subject: resolveSubject(opts.subject),
        html: opts.html,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });
    // STATUS ONLY, NEVER THE BODY. Resend's error body can carry the recipient address (third-party
    // personal data); CLAUDE.md forbids logging message content to external services beyond Supabase.
    if (!res.ok) {
      console.error(`[email] ${opts.tag || 'send'} failed:`, res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[email] ${opts.tag || 'send'} exception:`, e instanceof Error ? e.message : 'unknown');
    return false;
  }
}

// Both delegate to lib/money.ts for the reason written above gbp on app/invoice/[id]/page.tsx:
// these print the subtotal, the VAT, the reverse charge VAT and the total on the invoice EMAIL,
// which is the same document as the invoice PAGE and must not disagree with it about £2,400.00.
const money = (pence: number) => gbp2((Number(pence) || 0) / 100);
const poundsFromNumber = (n: number) => gbp2(Number(n) || 0);

// --- invoice (to a trader's own customer) ---------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS EMAIL MUST NOT STATE A TOTAL THE DOCUMENT DISAGREES WITH (1 August 2026).
//
// It used to say one figure and nothing else, which was true when every invoice was hardcoded to
// no VAT. It is not true now. A covering note saying "for £450" over an invoice that reads £540
// is how a customer pays the wrong amount and a tradesman spends a fortnight chasing 90 quid he
// was never short of. And under the reverse charge the opposite trap is waiting: the document
// shows a VAT figure the customer must account for, and a note that did not explain it reads like
// VAT he forgot to add.
//
// ⚠️ THE VAT FIELDS ARE OPTIONAL, so the WhatsApp caller that has never passed them keeps
// compiling and keeps sending exactly the email it sent yesterday. Absent means "this invoice
// carries no VAT", which is what every invoice this path has ever made.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface InvoiceEmail {
  to: string;
  number: string;
  total: number;
  link: string;
  businessName?: string | null;
  customerName?: string | null;
  // From lib/vat.ts, through the invoice row. Null or absent is an invoice with no VAT on it.
  vatTreatment?: 'none' | 'charged' | 'reverse_charge' | null;
  subtotal?: number | null;
  vat?: number | null;
  // 🔴 The VAT the CUSTOMER accounts for. Never added to the total, on the document or here.
  reverseChargeVat?: number | null;
}

export async function sendInvoiceEmail(opts: InvoiceEmail): Promise<boolean> {
  // The mark is the invoice number, plus the trader's name when there is one, so the customer's
  // inbox holds one thread per invoice and not one thread per tradesman.
  const mark = `${opts.number}${opts.businessName ? ` from ${opts.businessName}` : ''}`;
  const total = poundsFromNumber(opts.total);
  const link = safeUrl(opts.link);
  const senderName = opts.businessName ? esc(opts.businessName) : 'the sender';

  // The one extra sentence, and only where there is something to say. An invoice with no VAT on
  // it reads exactly as it always has.
  let vatLine = '';
  if (opts.vatTreatment === 'charged') {
    vatLine = p(
      `That is <strong>${poundsFromNumber(opts.subtotal ?? 0)}</strong> for the work and `
      + `<strong>${poundsFromNumber(opts.vat ?? 0)}</strong> VAT.`,
    );
  } else if (opts.vatTreatment === 'reverse_charge') {
    vatLine = p(
      `No VAT has been charged on this invoice. The domestic reverse charge applies, so the `
      + `<strong>${poundsFromNumber(opts.reverseChargeVat ?? 0)}</strong> of VAT is yours to account `
      + `for to HMRC. It is not part of the ${total} and it is not payable to ${senderName}. `
      + `${esc(REVERSE_CHARGE_WORDING)}`,
    );
  }

  const inner = `
    ${p(`Hi ${esc(opts.customerName) || 'there'},`)}
    ${p(`Here is your invoice <strong>${esc(opts.number)}</strong>${opts.businessName ? ` from <strong>${esc(opts.businessName)}</strong>` : ''}, for <strong>${total}</strong>.`)}
    ${vatLine}
    ${button(link, 'View and pay the invoice')}
    ${pMuted(`Or open this link: <a href="${link}" style="color:${RIVER}">${esc(link)}</a>`)}`;
  // Invoices are branded as the trader "via Lekhio" so the customer recognises who it is from.
  const from = opts.businessName ? `${opts.businessName} via Lekhio <${fromAddr()}>` : `Lekhio <${fromAddr()}>`;
  return send({ from, to: opts.to, subject: { repeats: 'invoice', mark }, html: shell(inner, { preheader: `Invoice ${opts.number} for ${total}` }), tag: 'invoice' });
}

// --- the signup code (fires from /api/signup/code) -------------------------
//
// 🔴 THE ONE EMAIL A MAN CANNOT DO WITHOUT. Nothing else in the product is blocked on an email
// arriving; this one IS the account. So it says one thing, the code is the biggest thing on the
// screen, and there is nothing to click. A link would be a second way in, and a second way in is a
// second thing to phish.
export async function sendSignupCodeEmail(to: string, code: string): Promise<boolean> {
  const safe = String(code ?? '').replace(/\D/g, '').slice(0, 8);
  if (!safe) return false;
  const inner = `
    ${h1('Your Lekhio code')}
    <div style="font-size:38px;font-weight:800;letter-spacing:10px;color:${INK};background:#F4F7FB;border:1px solid #E3EAF3;border-radius:12px;padding:20px 0;text-align:center;margin:6px 0 18px">${safe}</div>
    ${p('Type this into Lekhio to finish setting up your account. It lasts ten minutes and can only be used once.')}
    ${pMuted('If you did not ask for this, you can ignore this email. Nothing has been created and nothing will happen.')}`;
  return send({
    to,
    subject: { repeats: 'signup-code', mark: safe },
    // The code in the preview line, so he can often read it from the notification without opening
    // anything. He is on a ladder.
    html: shell(inner, { preheader: `${safe} is your code. It lasts ten minutes.` }),
    tag: 'signup-code',
  });
}

// --- welcome (fires from /api/signup/verify, once the account is REAL) -----
//
// ⚠️ THIS USED TO FIRE FROM /api/onboard, which is before he proves his email and therefore before
// the account exists. A man who abandoned at the code screen was welcomed to something he had not
// joined. It now fires once, from the far side of verification.
//
// 🔴 AND IT USED TO DESCRIBE THE OLD JOURNEY. It said his books "now live in WhatsApp" and that we
// would text him to confirm his number. We are not going to text him, and the product is the web
// app. Telling a new customer to wait for a message that is never coming is how the first day
// teaches him we are not quite real.
// ⚠️ AND IT SAID HIS LEKHIO WAS SET UP, WHICH STOPPED BEING TRUE ON 30 JULY.
//
// This fires from /api/signup/verify, and until 30 July verification WAS the last step: he proved
// his email and landed on his dashboard. Now proving the email is the START of setting up, and the
// ten to fifteen minutes that matter come after it. So an email saying it is set up, with a button
// to a dashboard that has nothing on it, congratulated him for something he had not done and pointed
// him at the emptiest screen in the product.
//
// It now says where he actually is and sends him back to finish. If he HAS finished, /app/setup
// redirects to /app, so the button is right either way and needs no branch here.
//
// The trial length and the promise both come from their owners rather than being typed again. This
// file had "7 day" as a literal in two places, which is exactly how the store listings ended up
// still advertising fourteen.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND IT HAS TO BE TOLD WHETHER THE TRIAL ACTUALLY STARTED. Found 9 August 2026.
//
// This email said "your 7 day free trial has started" to everybody, in the body and again in the
// preheader, because its only gate was `if (!existingId)`: a NEW account, never a trial that began.
//
// Three lines above that call, /api/signup/verify already knew better. grantTrialWithIdentity can
// REFUSE, when the same man has had a trial on this email, this number or this account before, and
// when it refuses the route builds an honest refusalNote and puts it on his screen. So a man who
// had already had one read "You have had a free trial on this email already. Sign in and pick up
// where you left off, or add a card to carry on" on the screen, and in the same minute read "your
// 7 day free trial has started" in his inbox. Two surfaces, one fact, opposite answers, which is
// the failure this codebase keeps ending.
//
// ⚠️ THE PARAMETER IS REQUIRED, NOT OPTIONAL WITH A CHEERFUL DEFAULT. A caller who does not know
// has to say so out loud. An optional flag defaulting to 'started' would put the lie straight back
// the first time somebody adds a second door, and tsc would not say a word.
//
// ⚠️ AND 'not started' COVERS "WE COULD NOT TELL", deliberately. If grantTrialWithIdentity throws,
// the route knows nothing, and an email that claims nothing is the only thing that cannot be wrong.
// Under-promising a man whose trial did start costs him one surprise in his favour, and his billing
// page corrects it within the hour. Over-promising costs him the card he was told he would not
// need. So the second arm asserts NO trial state at all and sends him to the one screen that always
// knows, rather than guessing at a reason we may not have.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function sendWelcomeEmail(
  to: string,
  name: string | null,
  trial: 'started' | 'not started',
): Promise<boolean> {
  const hi = name ? `You are in, ${esc(name)}.` : 'You are in.';
  const started = trial === 'started';
  const opening = started
    ? `Your account is open and your ${TRIAL_DAYS} day free trial has started. No card, and nothing to install.`
    : 'Your account is open, and there is nothing to install. Whether you have a free trial running, and what happens next, is always on your billing page under You.';
  const inner = `
    ${h1(hi)}
    ${p(opening)}
    ${p(`The next bit is where the money is: ${HOW_LONG} of questions about you, not about your paperwork. Most of what you can claim has nothing to do with receipts, and nobody ever asks. Stop whenever you like and pick up where you left off.`)}
    ${button(`${APP}/app/setup`, 'Finish setting up')}
    ${p('Everything lives in your browser, on any phone or laptop. Sign in with this email address whenever you want to see where you stand.')}
    ${pMuted('A real person is on the other end. Just reply if you need anything.')}`;
  return send({
    to,
    subject: { once: 'welcome', subject: 'You are in. Let us finish setting you up.' },
    html: shell(inner, {
      preheader: started
        ? `Your ${TRIAL_DAYS} day free trial has started.`
        : 'Your account is open. Here is how to finish setting up.',
    }),
    tag: 'welcome',
  });
}

// --- waitlist welcome (fires from /api/waitlist) --------------------------
//
// ⚠️ HE CAN GET TWO. A double tap on the join button used to make two rows and two of these, and
// the second one landed underneath the first with the first one's date on it, so the only signal
// that his second attempt worked was invisible. supabase/APPLY_2026-08-08_waitlist_unique.sql stops
// the second row; the moment in the subject stops the second email hiding.
//
// 🔴 AND IT USED TO BE subjectDay(), WHICH DID NOT COVER THIS AT ALL. A double tap is a second or
// two apart, so both emails carried the identical day and collapsed into one thread anyway. The
// comment claimed a fix the mark could not deliver. It is subjectMoment() now, and it is the case
// this email exists for.
export async function sendWaitlistWelcomeEmail(to: string, name?: string | null, when: Date = new Date()): Promise<boolean> {
  const hi = name ? `You're on the list, ${esc(name)}.` : "You're on the list.";
  const inner = `
    ${h1(hi)}
    ${p('Thanks for putting your name down for Lekhio. You’ll be one of the first we let in.')}
    ${p('Lekhio is your first employee: photograph a receipt, import a bank statement or just say what you spent, and it sorts every payment in the background and finds the tax you never need to pay. The shoebox and the January panic are done, and you approve everything.')}
    ${p('<strong>What happens next:</strong> we’ll message you the moment your spot is ready. Your first 7 days are free, and there’s no card to enter to start.')}
    ${button(APP, 'See how it works')}
    ${pMuted('If you didn’t sign up, just reply and we’ll take you off.')}`;
  return send({
    to,
    subject: { repeats: 'waitlist', mark: subjectMoment(when) },
    html: shell(inner, { preheader: "We'll let you in soon, here's what's coming." }),
    tag: 'waitlist',
  });
}

// --- the trial, and the week (fires from /api/cron/trial and /api/cron/reminders) ---------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THESE ARE WHAT MAKE lib/routing.ts TRUE.
//
// That table has said since 28 July that `weekly_ready` goes to ['push','email'] and that both
// trial rows go to ['whatsapp_template','email']. The email half did not exist. So the table
// described a product we did not have, and every one of those messages was reaching a phone or an
// app that a web customer does not have. Launch one is the web.
//
// ⚠️ THE WORDS ARE NOT WRITTEN HERE. They come from lib/trialnudge.ts, which is pure and tested,
// so the email, the WhatsApp reply and anything added later cannot say three different things.
// This file is a renderer: it turns a subject and a body into the branded shell.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// A plain message in the house shell. Blank lines in `body` are paragraph breaks and single
// newlines are line breaks, which is exactly how the modules that compose these bodies write them.
//
// Everything is escaped. None of today's callers pass anything a customer typed, but a figure that
// starts arriving from his own vendor names one day must not be the moment somebody remembers.
function messageEmail(body: string): string {
  return body
    .split('\n\n')
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => p(para.split('\n').map(esc).join('<br>')))
    .join('\n');
}

// DAY SIX OF SEVEN. His week, and one sentence about ours. lib/trialnudge.ts holds the reasoning
// for why this is ONE message rather than two, and why the trial line is last.
export async function sendTrialWeekEmail(
  to: string,
  msg: { subject: string; body: string },
): Promise<boolean> {
  const inner = `
    ${h1(esc(msg.subject))}
    ${messageEmail(msg.body)}
    ${button(`${APP}/app`, 'See your week')}
    ${pMuted('A real person is on the other end. Just reply if you need anything.')}`;
  return send({
    to,
    // Once per customer. The guard is trial_warn_sent_at, and the words are lib/trialnudge.ts's.
    subject: { once: 'trial-week', subject: msg.subject },
    html: shell(inner, { preheader: 'Your first week, and what happens tomorrow.' }),
    tag: 'trial-week',
  });
}

// THE DAY AFTER. His books are safe, and the card is the way back.
export async function sendTrialEndedEmail(
  to: string,
  msg: { subject: string; body: string },
): Promise<boolean> {
  const inner = `
    ${h1(esc(msg.subject))}
    ${messageEmail(msg.body)}
    ${button(`${APP}/app`, 'Carry on with Lekhio')}
    ${pMuted('Nothing has been deleted, and it will not be. Reply here any time.')}`;
  return send({
    to,
    // Once per customer. The guard is trial_end_sent_at.
    subject: { once: 'trial-ended', subject: msg.subject },
    html: shell(inner, { preheader: 'Your books are safe. Here is how to carry on.' }),
    tag: 'trial-ended',
  });
}

// THE SUNDAY NOTIFICATION, for a man who is not mid trial.
//
// ⚠️ IT CARRIES NO FIGURES, ON PURPOSE, and that is the 27 July decision holding. The summary is a
// PULL: computed when he opens it, for the few who do, rather than for everybody every week whether
// they look or not. This says the numbers are in and gets out of the way.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE WORST CONSTANT SUBJECT WE HAD, AND IT WAS THE ONE THAT ARRIVED MOST OFTEN.
//
// "Your week is ready", every Sunday, for the life of the customer. Gmail threads by sender plus
// subject and heads a thread with its OLDEST message, so by week three his entire relationship with
// Lekhio was ONE conversation, dated three weeks ago, sitting wherever three weeks ago sits. Fifty
// two of these a year, and not one of them ever appeared at the top of his inbox as a new thing.
//
// The mark is the SUNDAY the week ended on, not the day we sent it and not the figures. See the
// subject rule above for why money never goes in a subject line, and weekEndingDay() for why the
// date is computed rather than read off the clock.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function sendWeeklyReadyEmail(to: string, now: Date = new Date()): Promise<boolean> {
  const mark = weekEndingDay(now);
  const inner = `
    ${h1(esc(`Your week to ${mark} is ready`))}
    ${p('Your figures for the week are in. What you made, what you spent, and what Lekhio has found you.')}
    ${button(`${APP}/app`, 'See your week')}
    ${pMuted('You can turn these off in Settings whenever you like.')}`;
  return send({
    to,
    subject: { repeats: 'weekly-ready', mark },
    html: shell(inner, { preheader: 'What you made, what you spent, and what we found you.' }),
    tag: 'weekly-ready',
  });
}

// --- consent engine: double opt-in confirm --------------------------------
//
// ⚠️ HE CAN USE A FREE TOOL AGAIN. Two of these a month apart used to collapse into one thread, and
// the one he could see was the OLDER one, whose link is the one that has now expired. See
// LEAD_CONFIRM_TTL_SECONDS in lib/leadtoken.ts.
//
// 🔴 AND ON 9 AUGUST 2026 IT TURNED OUT NOT TO BE A MONTH APART. Two of these went to one address
// 53 SECONDS apart, both reading "Confirm your email to get your result, 9 August", and Gmail put
// them in one conversation, id 19fe3c19bd3f15ce, headed by the older one. Two calculators back to
// back is a normal afternoon, not an edge case. The mark is subjectMoment() now.
export async function sendLeadConfirmEmail(
  to: string,
  confirmLink: string,
  unsubscribeLink: string,
  when: Date = new Date(),
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHICH PROMISE THIS CONFIRM IS CONFIRMING. Added 11 August 2026, RUN 0 of the customer week.
  //
  // Eleven of the twelve capture points are tools that have already worked something out, so "your
  // result" is true. /free-mtd-filing is a waitlist for a thing that is not built, and this email
  // was telling those people they had asked for a result. See leadPromise in lib/features.ts.
  //
  // ⚠️ IT DEFAULTS TO 'result', WHICH IS THE ELEVEN. A caller that forgets to say gets the wording
  // that is true almost everywhere, and test/leadpromise.test.mjs holds the one caller to passing
  // it through rather than trusting the default.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  promise: LeadPromise = 'result',
): Promise<boolean> {
  // 🔴 TWO SENDERS, NOT A TERNARY, AND test/subjectrule.test.mjs IS WHY. That suite requires each
  // repeating subject key to have exactly ONE send site it can find by searching for the key. A
  // ternary inside one send means neither key appears in this file as a searchable literal, and the
  // property it protects, that any subject a customer received leads back to one place, is gone.
  //
  // ⚠️ AND THE FIRST DRAFT OF THIS COMMENT SPELLED THE KEY OUT TO EXPLAIN IT, which the guard
  // counted as a second send site and failed on. It counts raw source, comments included, and it
  // should: it cannot tell prose from code and it must not have to. Same trap test/run-all.mjs
  // records against the domain guard. Do not relax it. Fix the comment.
  if (promise === 'waitlist') return sendLeadListConfirmEmail(to, confirmLink, unsubscribeLink, when);

  const inner = `
    ${h1('One quick tap to confirm.')}
    ${p('You asked us to send you your result. Tap below to confirm and you’re all set.')}
    ${button(confirmLink, 'Confirm my email')}
    ${pMuted('This link works for a week. After that, run the tool again and we will send you a fresh one.')}
    ${pMuted('If you didn’t request this, ignore this email and nothing will happen.')}`;
  return send({
    to, subject: { repeats: 'lead-confirm', mark: subjectMoment(when) },
    html: shell(inner, { preheader: 'One tap and your result is on its way.', unsubscribeLink }),
    listUnsub: unsubscribeLink, tag: 'lead-confirm',
  });
}

// The same email on a page where there is no result. /free-mtd-filing is a waitlist for something
// that is not built, and the page is honest about that; this is the confirm catching up with it.
//
// ⚠️ REACHED THROUGH sendLeadConfirmEmail, NEVER CALLED DIRECTLY BY A ROUTE. One door, one decision,
// taken from the source. A second caller here is a second place to get the promise wrong.
export async function sendLeadListConfirmEmail(
  to: string,
  confirmLink: string,
  unsubscribeLink: string,
  when: Date = new Date(),
): Promise<boolean> {
  const inner = `
    ${h1('One quick tap to confirm.')}
    ${p('You asked to be told when free filing opens. Tap below to confirm your address and you are on the list.')}
    ${button(confirmLink, 'Confirm my email')}
    ${pMuted('This link works for a week. After that, join again from the page and we will send you a fresh one.')}
    ${pMuted('If you didn’t request this, ignore this email and nothing will happen.')}`;
  return send({
    to, subject: { repeats: 'lead-confirm-list', mark: subjectMoment(when) },
    html: shell(inner, { preheader: 'One tap and you are on the list.', unsubscribeLink }),
    listUnsub: unsubscribeLink, tag: 'lead-confirm-list',
  });
}

// --- consent engine: the result we promised (fires on confirm) ------------
//
// ⚠️ IT INHERITS lead-confirm's SHAPE. Confirm two tools in one afternoon and two of these land the
// same day. This one is worse than a duplicate receipt, because the body IS his figures: reading
// the wrong tool's answer under a heading that looks like the new one is acting on a number that
// was never his. subjectMoment(), for the same reason and by the same argument.
export async function sendLeadResultEmail(
  to: string,
  resultNote: string,
  unsubscribeLink: string,
  when: Date = new Date(),
): Promise<boolean> {
  const note = esc(resultNote).replace(/\r?\n/g, '<br>');
  const inner = `
    ${h1('Here is your result.')}
    ${p('You asked us to send this over, so here it is, saved for whenever you need it.')}
    <div style="background:#F4F7FB;border:1px solid #E3EAF3;border-radius:12px;padding:18px 20px;margin:4px 0 16px;font-size:16px;line-height:1.7;color:${INK}">${note}</div>
    ${p('These are estimates to give you the shape of it. The number that really moves is your expenses: every business cost you claim comes off your tax, and most people lose hundreds because a receipt goes missing. That is the whole job Lekhio does, from a text, all year.')}
    ${button(APP, 'Start free, no card')}`;
  return send({
    to, subject: { repeats: 'lead-result', mark: subjectMoment(when) },
    html: shell(inner, { preheader: 'The figures you worked out, saved for you.', unsubscribeLink }),
    listUnsub: unsubscribeLink, tag: 'result',
  });
}

// --- payment received (Stripe invoice.payment_succeeded) ------------------
export interface PaymentEmail {
  to: string;
  amountPence: number;
  plan?: string | null;
  nextDate?: string | null; // human date, optional
  // The day this payment was taken. Defaults to now, which is when the Stripe webhook fires.
  // ⚠️ IT IS THE MARK THAT KEEPS EVERY RENEWAL OUT OF ONE THREAD. A man who pays us for two years
  // used to get twenty four of these stacked under the first one, dated the day he joined.
  // ⚠️ AND IT IS A DAY, NOT A MOMENT, WHICH IS A DECISION AND NOT AN OVERSIGHT. The argument is
  // written out in SAME_DAY_EXEMPT['payment-ok'] and the ratchet holds it to that list by equality.
  when?: Date;
}

export async function sendPaymentConfirmedEmail(opts: PaymentEmail): Promise<boolean> {
  const amt = money(opts.amountPence);
  const planLine = opts.plan ? ` for your ${esc(opts.plan)} plan` : '';
  const next = opts.nextDate ? p(`Your next payment is due <strong>${esc(opts.nextDate)}</strong>.`) : '';
  const inner = `
    ${h1("You're all set, payment received.")}
    ${p(`Thanks, we've received your payment of <strong>${amt}</strong>${planLine}.`)}
    ${p('Nothing changes on your side: Lekhio keeps sorting your books and finding your tax reliefs in the background, all year.')}
    ${next}
    ${button(APP, 'Open Lekhio')}
    ${pMuted('Any questions about your billing, just reply to this email.')}`;
  return send({
    to: opts.to,
    subject: { repeats: 'payment-ok', mark: subjectDay(opts.when) },
    html: shell(inner, { preheader: `We've received your ${amt} payment.` }),
    tag: 'payment-ok',
  });
}

// --- payment failed (Stripe invoice.payment_failed) -----------------------
export interface PaymentFailedEmail {
  to: string;
  amountPence: number;
  updateUrl: string;
  // The moment the attempt failed. Defaults to now.
  // ⚠️ STRIPE RETRIES THE SAME AMOUNT, so the amount cannot tell one dunning email from the next
  // and the clock is the only honest mark there is. Four retries used to arrive as four copies of
  // one thread, and the one he could see was the first, already dealt with.
  // 🔴 AND THE RETRY IS OFTEN THE SAME DAY, WHICH THE DAY MARK MISSED. He reads the first email,
  // taps Update payment, enters a second card that also fails, and Stripe raises
  // invoice.payment_failed again within the minute. That second email carries the live call to
  // action, so it is the one that must not file itself underneath a message he has already dealt
  // with. subjectMoment(), and SUBJECT_MARKS['payment-fail'] carries the argument.
  when?: Date;
}

export async function sendPaymentFailedEmail(opts: PaymentFailedEmail): Promise<boolean> {
  const amt = money(opts.amountPence);
  const inner = `
    ${h1('A quick heads-up on your payment.')}
    ${p(`We tried to take your Lekhio payment of <strong>${amt}</strong> and it didn’t go through, usually an expired card or a bank block, nothing to worry about.`)}
    ${p('Update your card and we’ll sort it automatically. Your account stays active in the meantime.')}
    ${button(opts.updateUrl, 'Update payment')}
    ${pMuted('If you think this is a mistake, or need a hand, just reply and we’ll help.')}`;
  return send({
    to: opts.to,
    subject: { repeats: 'payment-fail', mark: subjectMoment(opts.when) },
    html: shell(inner, { preheader: 'A quick fix and you’re sorted.' }),
    tag: 'payment-fail',
  });
}

// --- marketing / newsletter to a consented contact ------------------------
// bodyHtml is the inner content; the shell adds the header, footer and unsubscribe. Always carries the
// List-Unsubscribe headers inboxes expect.
// ⚠️ THE SUBJECT IS THE CAMPAIGN'S, and CALLER_OWNS_SUBJECT says why. Every issue, nurture stage and
// presale step has its own, and test/subjectrule.test.mjs holds each registry to subjects that are
// unique inside it, which is where a copied issue would collide.
export async function sendMarketingEmail(to: string, subject: string, bodyHtml: string, unsubscribeLink: string): Promise<boolean> {
  return send({
    to, subject: { caller: 'marketing', subject },
    html: shell(bodyHtml, { preheader: subject, unsubscribeLink }),
    listUnsub: unsubscribeLink, tag: 'marketing',
  });
}

// --- front-desk reply (Dakiya) --------------------------------------------
// A one-to-one reply from the lane address the enquiry came in on. This is correspondence, not
// marketing: kept plain and personal (no big branded shell), with threading headers so it stays in the
// same conversation. Only ever sends from an @lekhio.app address.
//
// ⚠️ THE ONE EMAIL THAT MUST NOT VARY ITS SUBJECT. See CALLER_OWNS_SUBJECT.reply: a reply keeps the
// subject it came in on, beside the In-Reply-To header, or it stops threading. It has its own fetch
// rather than send() because it wears no branded shell, so the subject rule reaches it through that
// entry rather than through the union.
export interface ReplyEmail {
  fromAddress: string;
  fromName?: string;
  to: string;
  subject: string;
  bodyText: string;
  inReplyTo?: string | null;
}

export async function sendReplyEmail(opts: ReplyEmail): Promise<{ ok: boolean; id?: string }> {
  if (!KEY) return { ok: false };
  if (!looksLikeEmail(opts.to)) return { ok: false };
  const fa = String(opts.fromAddress || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]+@lekhio\.app$/.test(fa)) return { ok: false };

  const name = (opts.fromName || 'Lekhio').replace(/[<>\r\n]/g, '').slice(0, 60);
  const bodyHtml = esc(opts.bodyText).replace(/\r?\n/g, '<br>');
  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:560px;margin:0 auto;padding:8px 0;font-size:15px;line-height:1.6">
    ${bodyHtml}
  </div>`;

  const extraHeaders: Record<string, string> = {};
  if (opts.inReplyTo && /^<?[^\s<>]+>?$/.test(opts.inReplyTo)) {
    const mid = opts.inReplyTo.startsWith('<') ? opts.inReplyTo : `<${opts.inReplyTo}>`;
    extraHeaders['In-Reply-To'] = mid;
    extraHeaders['References'] = mid;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${name} <${fa}>`,
        to: [opts.to],
        subject: opts.subject.slice(0, 300),
        html,
        ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
      }),
    });
    if (!res.ok) {
      console.error('[email] reply failed:', res.status);
      return { ok: false };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('[email] reply exception:', e instanceof Error ? e.message : 'unknown');
    return { ok: false };
  }
}
