// Email sending, via Resend. Dormant until RESEND_API_KEY is set, so everything degrades gracefully
// until email is switched on. EVERY customer-facing email flows through one branded shell() so the whole
// system looks like one professional company. 1-to-1 front-desk replies (sendReplyEmail) stay plain on
// purpose — a real person's reply should not look like a marketing blast.
//
// Env vars:
//   RESEND_API_KEY   from resend.com
//   EMAIL_FROM       e.g. "Lekhio <hello@lekhio.app>" (the domain must be verified in Resend). Defaults
//                    to invoices@lekhio.app.

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'Lekhio <invoices@lekhio.app>';
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';

// --- brand palette --------------------------------------------------------
const INK = '#111111';
const RIVER = '#1B59A6';
const GOLD = '#C6871A';
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

// --- app welcome (fires from /api/onboard) --------------------------------
export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const hi = name ? `Welcome to Lekhio, ${esc(name)}.` : 'Welcome to Lekhio.';
  const inner = `
    ${h1(hi)}
    ${p('Your books and tax now live in WhatsApp. Here is how to start — it takes about a minute.')}
    <ol style="font-size:15px;line-height:1.9;color:${INK};padding-left:20px;margin:0 0 14px">
      <li>We'll text you to confirm your number. Save it as Lekhio.</li>
      <li>Snap a photo of any receipt and send it. Logged in seconds.</li>
      <li>Try a few: "drove 24 miles", "worked 90 hours from home", or "got paid £400 by Dave".</li>
    </ol>
    ${p('Your first 14 days are free. Open the app any time to watch it all add up, ready for tax.')}
    ${button(APP, 'Open Lekhio')}
    ${pMuted('A real person is on the other end — just reply if you need anything.')}`;
  return send({ to, subject: 'Welcome to Lekhio. Here is how to start.', html: shell(inner, { preheader: 'Your books and tax, now in WhatsApp.' }), tag: 'welcome' });
}

// --- waitlist welcome (fires from /api/waitlist) --------------------------
export async function sendWaitlistWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  const hi = name ? `You're on the list, ${esc(name)}.` : "You're on the list.";
  const inner = `
    ${h1(hi)}
    ${p('Thanks for putting your name down for Lekhio. You’ll be one of the first we let in.')}
    ${p('Lekhio is your first employee: it connects to your bank, sorts every payment in the background, and finds the tax you never need to pay. The shoebox and the January panic are done — it all happens in WhatsApp, and you approve everything.')}
    ${p('<strong>What happens next:</strong> we’ll message you the moment your spot is ready. Your first 14 days are free, and there’s no card to enter to start.')}
    ${button(APP, 'See how it works')}
    ${pMuted('If you didn’t sign up, just reply and we’ll take you off.')}`;
  return send({ to, subject: 'You are on the Lekhio list.', html: shell(inner, { preheader: "We'll let you in soon — here's what's coming." }), tag: 'waitlist' });
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
