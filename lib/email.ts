// Email sending, via Resend. Dormant until RESEND_API_KEY is set, so everything degrades gracefully
// until email is switched on. EVERY customer-facing email flows through one branded shell() so the whole
// system looks like one professional company. 1-to-1 front-desk replies (sendReplyEmail) stay plain on
// purpose — a real person's reply should not look like a marketing blast.
//
// Env vars:
//   RESEND_API_KEY   from resend.com
//   EMAIL_FROM       e.g. "Lekhio <hello@lekhio.app>" (the domain must be verified in Resend). Defaults
//                    to invoices@lekhio.app.

// Both of these are read rather than retyped. TRIAL_DAYS lives in lib/entitlement.ts and HOW_LONG in
// lib/onboarding.ts, and both modules are pure with no imports of their own, so this costs nothing.
import { TRIAL_DAYS } from './entitlement';
import { HOW_LONG } from './onboarding';

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
    ? `<p style="margin:10px 0 0">You're getting this because you asked Lekhio for tax reminders and tips. <a href="${safeUrl(opts.unsubscribeLink)}" style="color:${MUTED};text-decoration:underline">Unsubscribe</a> any time.</p>`
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
        <p style="margin:0">Lekhio — your books and tax, handled in WhatsApp.</p>
        <p style="margin:6px 0 0">Lekhio is an independent UK company. It is not affiliated with HMRC, and nothing is ever filed to HMRC without your approval.</p>
        ${unsub}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
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
async function send(opts: { from?: string; to: string; subject: string; html: string; listUnsub?: string; tag?: string }): Promise<boolean> {
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
        subject: opts.subject,
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

const money = (pence: number) => `£${((Number(pence) || 0) / 100).toFixed(2)}`;
const poundsFromNumber = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;

// --- invoice (to a trader's own customer) ---------------------------------
export interface InvoiceEmail {
  to: string;
  number: string;
  total: number;
  link: string;
  businessName?: string | null;
  customerName?: string | null;
}

export async function sendInvoiceEmail(opts: InvoiceEmail): Promise<boolean> {
  const subject = `Invoice ${opts.number}${opts.businessName ? ` from ${opts.businessName}` : ''}`;
  const total = poundsFromNumber(opts.total);
  const link = safeUrl(opts.link);
  const inner = `
    ${p(`Hi ${esc(opts.customerName) || 'there'},`)}
    ${p(`Here is your invoice <strong>${esc(opts.number)}</strong>${opts.businessName ? ` from <strong>${esc(opts.businessName)}</strong>` : ''}, for <strong>${total}</strong>.`)}
    ${button(link, 'View and pay the invoice')}
    ${pMuted(`Or open this link: <a href="${link}" style="color:${RIVER}">${esc(link)}</a>`)}`;
  // Invoices are branded as the trader "via Lekhio" so the customer recognises who it is from.
  const from = opts.businessName ? `${opts.businessName} via Lekhio <${fromAddr()}>` : `Lekhio <${fromAddr()}>`;
  return send({ from, to: opts.to, subject, html: shell(inner, { preheader: `Invoice ${opts.number} for ${total}` }), tag: 'invoice' });
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
    subject: `${safe} is your Lekhio code`,
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
export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const hi = name ? `You are in, ${esc(name)}.` : 'You are in.';
  const inner = `
    ${h1(hi)}
    ${p(`Your account is open and your ${TRIAL_DAYS} day free trial has started. No card, and nothing to install.`)}
    ${p(`The next bit is where the money is: ${HOW_LONG} of questions about you, not about your paperwork. Most of what you can claim has nothing to do with receipts, and nobody ever asks. Stop whenever you like and pick up where you left off.`)}
    ${button(`${APP}/app/setup`, 'Finish setting up')}
    ${p('Everything lives in your browser, on any phone or laptop. Sign in with this email address whenever you want to see where you stand.')}
    ${pMuted('A real person is on the other end. Just reply if you need anything.')}`;
  return send({ to, subject: 'You are in. Let us finish setting you up.', html: shell(inner, { preheader: `Your ${TRIAL_DAYS} day free trial has started.` }), tag: 'welcome' });
}

// --- waitlist welcome (fires from /api/waitlist) --------------------------
export async function sendWaitlistWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const hi = name ? `You're on the list, ${esc(name)}.` : "You're on the list.";
  const inner = `
    ${h1(hi)}
    ${p('Thanks for putting your name down for Lekhio. You’ll be one of the first we let in.')}
    ${p('Lekhio is your first employee: it connects to your bank, sorts every payment in the background, and finds the tax you never need to pay. The shoebox and the January panic are done — it all happens in WhatsApp, and you approve everything.')}
    ${p('<strong>What happens next:</strong> we’ll message you the moment your spot is ready. Your first 7 days are free, and there’s no card to enter to start.')}
    ${button(APP, 'See how it works')}
    ${pMuted('If you didn’t sign up, just reply and we’ll take you off.')}`;
  return send({ to, subject: 'You are on the Lekhio list.', html: shell(inner, { preheader: "We'll let you in soon — here's what's coming." }), tag: 'waitlist' });
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
    subject: msg.subject,
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
    subject: msg.subject,
    html: shell(inner, { preheader: 'Your books are safe. Here is how to carry on.' }),
    tag: 'trial-ended',
  });
}

// THE SUNDAY NOTIFICATION, for a man who is not mid trial.
//
// ⚠️ IT CARRIES NO FIGURES, ON PURPOSE, and that is the 27 July decision holding. The summary is a
// PULL: computed when he opens it, for the few who do, rather than for everybody every week whether
// they look or not. This says the numbers are in and gets out of the way.
export async function sendWeeklyReadyEmail(to: string): Promise<boolean> {
  const inner = `
    ${h1('Your week is ready')}
    ${p('Your figures for the week are in. What you made, what you spent, and what Lekhio has found you.')}
    ${button(`${APP}/app`, 'See your week')}
    ${pMuted('You can turn these off in Settings whenever you like.')}`;
  return send({
    to,
    subject: 'Your week is ready',
    html: shell(inner, { preheader: 'What you made, what you spent, and what we found you.' }),
    tag: 'weekly-ready',
  });
}

// --- consent engine: double opt-in confirm --------------------------------
export async function sendLeadConfirmEmail(to: string, confirmLink: string, unsubscribeLink: string): Promise<boolean> {
  const inner = `
    ${h1('One quick tap to confirm.')}
    ${p('You asked us to send your result and keep you right on your tax deadlines. Tap below to confirm and you’re all set.')}
    ${button(confirmLink, 'Confirm my email')}
    ${pMuted('If you didn’t request this, ignore this email and nothing will happen.')}`;
  return send({
    to, subject: 'Confirm your email to get your result and reminders',
    html: shell(inner, { preheader: 'One tap and your result is on its way.', unsubscribeLink }),
    listUnsub: unsubscribeLink, tag: 'lead-confirm',
  });
}

// --- consent engine: the result we promised (fires on confirm) ------------
export async function sendLeadResultEmail(to: string, resultNote: string, unsubscribeLink: string): Promise<boolean> {
  const note = esc(resultNote).replace(/\r?\n/g, '<br>');
  const inner = `
    ${h1('Here is your result.')}
    ${p('You asked us to send this over, so here it is — saved for whenever you need it.')}
    <div style="background:#F4F7FB;border:1px solid #E3EAF3;border-radius:12px;padding:18px 20px;margin:4px 0 16px;font-size:16px;line-height:1.7;color:${INK}">${note}</div>
    ${p('These are estimates to give you the shape of it. The number that really moves is your expenses: every business cost you claim comes off your tax, and most people lose hundreds because a receipt goes missing. That is the whole job Lekhio does, from a text, all year.')}
    ${button(APP, 'Start free, no card')}`;
  return send({
    to, subject: 'Your result from Lekhio',
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
}

export async function sendPaymentConfirmedEmail(opts: PaymentEmail): Promise<boolean> {
  const amt = money(opts.amountPence);
  const planLine = opts.plan ? ` for your ${esc(opts.plan)} plan` : '';
  const next = opts.nextDate ? p(`Your next payment is due <strong>${esc(opts.nextDate)}</strong>.`) : '';
  const inner = `
    ${h1("You're all set — payment received.")}
    ${p(`Thanks — we've received your payment of <strong>${amt}</strong>${planLine}.`)}
    ${p('Nothing changes on your side: Lekhio keeps sorting your books and finding your tax reliefs in the background, all year.')}
    ${next}
    ${button(APP, 'Open Lekhio')}
    ${pMuted('Any questions about your billing, just reply to this email.')}`;
  return send({ to: opts.to, subject: 'Payment received — thanks from Lekhio', html: shell(inner, { preheader: `We've received your ${amt} payment.` }), tag: 'payment-ok' });
}

// --- payment failed (Stripe invoice.payment_failed) -----------------------
export interface PaymentFailedEmail {
  to: string;
  amountPence: number;
  updateUrl: string;
}

export async function sendPaymentFailedEmail(opts: PaymentFailedEmail): Promise<boolean> {
  const amt = money(opts.amountPence);
  const inner = `
    ${h1('A quick heads-up on your payment.')}
    ${p(`We tried to take your Lekhio payment of <strong>${amt}</strong> and it didn’t go through — usually an expired card or a bank block, nothing to worry about.`)}
    ${p('Update your card and we’ll sort it automatically. Your account stays active in the meantime.')}
    ${button(opts.updateUrl, 'Update payment')}
    ${pMuted('If you think this is a mistake, or need a hand, just reply and we’ll help.')}`;
  return send({ to: opts.to, subject: "Your Lekhio payment didn’t go through", html: shell(inner, { preheader: 'A quick fix and you’re sorted.' }), tag: 'payment-fail' });
}

// --- marketing / newsletter to a consented contact ------------------------
// bodyHtml is the inner content; the shell adds the header, footer and unsubscribe. Always carries the
// List-Unsubscribe headers inboxes expect.
export async function sendMarketingEmail(to: string, subject: string, bodyHtml: string, unsubscribeLink: string): Promise<boolean> {
  return send({
    to, subject,
    html: shell(bodyHtml, { preheader: subject, unsubscribeLink }),
    listUnsub: unsubscribeLink, tag: 'marketing',
  });
}

// --- front-desk reply (Dakiya) --------------------------------------------
// A one-to-one reply from the lane address the enquiry came in on. This is correspondence, not
// marketing: kept plain and personal (no big branded shell), with threading headers so it stays in the
// same conversation. Only ever sends from an @lekhio.app address.
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
