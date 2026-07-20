// Email sending, for delivering an invoice straight to a customer's inbox.
// Uses Resend. Dormant until RESEND_API_KEY is set, so everything degrades to
// "here is a link to forward" until email is switched on.
//
// Env vars:
//   RESEND_API_KEY   from resend.com
//   EMAIL_FROM       e.g. "Lekhio <invoices@lekhio.app>" (the domain must be
//                    verified in Resend before sending)

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'Lekhio <invoices@lekhio.app>';

const INK = '#111111';
const RIVER = '#1B59A6';
const MUTED = '#5B6470';

export function hasEmailConfig(): boolean {
  return Boolean(KEY);
}

function looksLikeEmail(value: string | null | undefined): boolean {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export { looksLikeEmail };

// Escape any user supplied text before it goes into email HTML, so a customer or
// business name containing markup cannot inject into the recipient's inbox.
function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface InvoiceEmail {
  to: string;
  number: string;
  total: number;
  link: string;
  businessName?: string | null;
  customerName?: string | null;
}

export async function sendInvoiceEmail(opts: InvoiceEmail): Promise<boolean> {
  if (!KEY) return false;
  if (!looksLikeEmail(opts.to)) return false;

  const from = opts.businessName ? `${opts.businessName} via Lekhio` : 'Lekhio';
  const subject = `Invoice ${opts.number}${opts.businessName ? ` from ${opts.businessName}` : ''}`;
  const total = `£${(Number(opts.total) || 0).toFixed(2)}`;
  // Only ever emit an https link with no characters that could break out of the
  // href attribute. The link is server built today, but this keeps the email
  // safe if the source ever changes to include user input.
  const safeLink = /^https:\/\/[^\s"'<>]+$/i.test(opts.link) ? opts.link : '';

  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:15px;color:${MUTED}">Hi ${esc(opts.customerName) || 'there'},</p>
    <p style="font-size:15px;line-height:1.6">Here is your invoice <strong>${esc(opts.number)}</strong>${opts.businessName ? ` from <strong>${esc(opts.businessName)}</strong>` : ''}, for <strong>${total}</strong>.</p>
    <p style="margin:28px 0">
      <a href="${safeLink}" style="background:${RIVER};color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:10px;display:inline-block">View and pay the invoice</a>
    </p>
    <p style="font-size:13px;color:${MUTED}">Or open this link: <a href="${safeLink}" style="color:${RIVER}">${esc(safeLink)}</a></p>
    <p style="font-size:12px;color:${MUTED};margin-top:32px">Sent with Lekhio.</p>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${from} <${FROM.replace(/.*</, '').replace(/>.*/, '')}>`, to: [opts.to], subject, html }),
    });
    if (!res.ok) {
// STATUS ONLY, NEVER THE BODY.
      //
      // Resend's error body can contain the DESTINATION ADDRESS, which on an invoice send is the
      // trader's CUSTOMER's email. That is a third party's personal data, and Vercel logs are an
      // external service. CLAUDE.md's rule ("never log message content to external services
      // beyond Supabase") plainly covers the recipient too.
      console.error('[email] send failed:', res.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] exception:', e instanceof Error ? e.message : 'unknown');
    return false;
  }
}

// Sent once when someone signs up on the web. Best effort, dormant until Resend
// is configured. Warm, gets them to the first WhatsApp action fast.
export async function sendWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  if (!KEY) return false;
  if (!looksLikeEmail(to)) return false;

  const fromAddr = FROM.replace(/.*</, '').replace(/>.*/, '');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
  const hi = name ? `Welcome to Lekhio, ${esc(name)}.` : 'Welcome to Lekhio.';

  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:18px;font-weight:700;margin:0 0 12px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;color:${MUTED}">Your books and tax now live in WhatsApp. Here is how to start, it takes about a minute.</p>
    <ol style="font-size:15px;line-height:1.8;color:${INK};padding-left:18px">
      <li>We will text you to confirm your number. Save it as Lekhio.</li>
      <li>Snap a photo of any receipt and send it. Logged in seconds.</li>
      <li>Try a few: "drove 24 miles", "worked 90 hours from home", or "got paid £400 by Dave".</li>
    </ol>
    <p style="font-size:15px;line-height:1.6">Your first month is free. Open the app any time to watch it all add up, ready for tax.</p>
    <p style="margin:24px 0"><a href="${appUrl}" style="background:${RIVER};color:#fff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:10px;display:inline-block">Open Lekhio</a></p>
    <p style="font-size:12px;color:${MUTED};margin-top:28px">A real person is on the other end. Just reply if you need anything. Lekhio is not HMRC, and nothing is ever sent to HMRC without your approval.</p>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Lekhio <${fromAddr}>`, to: [to], subject: 'Welcome to Lekhio. Here is how to start.', html }),
    });
    if (!res.ok) {
      console.error('[email] welcome failed:', res.status); // status only: the body carries the address
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] welcome exception:', e instanceof Error ? e.message : 'unknown');
    return false;
  }
}

// --- Consent engine emails ------------------------------------------------

// Double opt in confirmation. We only start sending marketing to someone once
// they click this, which protects deliverability and gives a second proof of
// consent. Dormant until Resend is configured.
export async function sendLeadConfirmEmail(to: string, confirmLink: string, unsubscribeLink: string): Promise<boolean> {
  if (!KEY || !looksLikeEmail(to)) return false;
  const fromAddr = FROM.replace(/.*</, '').replace(/>.*/, '');
  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:18px;font-weight:700;margin:0 0 12px">One quick tap to confirm.</p>
    <p style="font-size:15px;line-height:1.6;color:${MUTED}">You asked us to send your result and keep you right on your tax deadlines. Tap below to confirm and you are all set.</p>
    <p style="margin:24px 0"><a href="${confirmLink}" style="background:${RIVER};color:#fff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:10px;display:inline-block">Confirm my email</a></p>
    <p style="font-size:13px;color:${MUTED}">If you did not request this, ignore this email and nothing will happen. You can <a href="${unsubscribeLink}" style="color:${MUTED}">unsubscribe</a> any time. Lekhio is not HMRC.</p>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Lekhio <${fromAddr}>`,
        to: [to],
        subject: 'Confirm your email to get your result and reminders',
        html,
        headers: { 'List-Unsubscribe': `<${unsubscribeLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// A marketing email to a consented contact. Always carries a working unsubscribe
// link and the List-Unsubscribe headers that inboxes expect. Dormant until Resend
// is configured.
export async function sendMarketingEmail(to: string, subject: string, bodyHtml: string, unsubscribeLink: string): Promise<boolean> {
  if (!KEY || !looksLikeEmail(to)) return false;
  const fromAddr = FROM.replace(/.*</, '').replace(/>.*/, '');
  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:560px;margin:0 auto;padding:24px">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #ECECEC;margin:28px 0 14px" />
    <p style="font-size:12px;color:${MUTED};line-height:1.6">You are getting this because you asked Lekhio for tax reminders and tips. <a href="${unsubscribeLink}" style="color:${MUTED}">Unsubscribe</a> any time. Lekhio is an independent UK company, not HMRC.</p>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Lekhio <${fromAddr}>`,
        to: [to],
        subject,
        html,
        headers: { 'List-Unsubscribe': `<${unsubscribeLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Front desk replies (Dakiya) -----------------------------------------
// A one-to-one reply from the front desk, sent BRANDED from the lane address the enquiry came in on
// (e.g. sales@lekhio.app). This is correspondence, not marketing: no unsubscribe footer, and it is not
// gated on the marketing consent list — someone who emails us gets an answer. Threading headers keep it
// in the same conversation in the recipient's inbox. Dormant until RESEND_API_KEY is set.
export interface ReplyEmail {
  fromAddress: string;        // must be an @lekhio.app address
  fromName?: string;
  to: string;
  subject: string;
  bodyText: string;           // plain text; newlines become <br>
  inReplyTo?: string | null;  // Message-ID of the email we are answering
}

export async function sendReplyEmail(opts: ReplyEmail): Promise<{ ok: boolean; id?: string }> {
  if (!KEY) return { ok: false };
  if (!looksLikeEmail(opts.to)) return { ok: false };
  // Only ever send FROM our own verified domain. Never let a caller send as an arbitrary address.
  const fromAddr = String(opts.fromAddress || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]+@lekhio\.app$/.test(fromAddr)) return { ok: false };

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
        from: `${name} <${fromAddr}>`,
        to: [opts.to],
        subject: opts.subject.slice(0, 300),
        html,
        ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
      }),
    });
    if (!res.ok) {
      console.error('[email] reply failed:', res.status); // status only: the body can carry the recipient
      return { ok: false };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    console.error('[email] reply exception:', e instanceof Error ? e.message : 'unknown');
    return { ok: false };
  }
}

// --- Waitlist welcome -----------------------------------------------------
// Sent when someone joins the waitlist WITH an email. A pure service message (no marketing), so it
// stands on the signup itself: they asked to be told when Lekhio opens, this confirms they will be.
// Best effort, dormant until Resend is configured.
export async function sendWaitlistWelcomeEmail(to: string, name?: string | null): Promise<boolean> {
  if (!KEY || !looksLikeEmail(to)) return false;
  const fromAddr = FROM.replace(/.*</, '').replace(/>.*/, '');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
  const hi = name ? `You are on the list, ${esc(name)}.` : 'You are on the list.';
  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:19px;font-weight:700;margin:0 0 12px">${hi}</p>
    <p style="font-size:15px;line-height:1.6;color:${MUTED}">Thanks for putting your name down for Lekhio. You will be one of the first we let in.</p>
    <p style="font-size:15px;line-height:1.6">Lekhio is your first employee: it connects to your bank, sorts every payment in the background, and finds the tax you never need to pay. The shoebox and the January panic are done. It all happens in WhatsApp, and you approve everything.</p>
    <p style="font-size:15px;line-height:1.6;color:${INK}"><strong>What happens next:</strong> we will message you the moment your spot is ready. Your first 14 days are free, and there is no card to enter to start.</p>
    <p style="margin:24px 0"><a href="${appUrl}" style="background:${RIVER};color:#fff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:10px;display:inline-block">See how it works</a></p>
    <p style="font-size:12px;color:${MUTED};margin-top:28px">Lekhio is a real UK company, not HMRC, and nothing is ever sent to HMRC without your say-so. We look after your details and never sell them. If you did not sign up, just reply and we will take you off.</p>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Lekhio <${fromAddr}>`, to: [to], subject: 'You are on the Lekhio list.', html }),
    });
    if (!res.ok) { console.error('[email] waitlist welcome failed:', res.status); return false; }
    return true;
  } catch (e) {
    console.error('[email] waitlist welcome exception:', e instanceof Error ? e.message : 'unknown');
    return false;
  }
}

// --- The result we promised ----------------------------------------------
// After a free-tool lead confirms, we send the result they actually asked for ("email me my result").
// Carries the exact figures they saw, plus a working unsubscribe and the List-Unsubscribe headers,
// because it doubles as the first message of the consented relationship. Dormant until Resend is set.
export async function sendLeadResultEmail(to: string, resultNote: string, unsubscribeLink: string): Promise<boolean> {
  if (!KEY || !looksLikeEmail(to)) return false;
  const fromAddr = FROM.replace(/.*</, '').replace(/>.*/, '');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.app';
  const note = esc(resultNote).replace(/\r?\n/g, '<br>');
  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:19px;font-weight:700;margin:0 0 12px">Here is your result.</p>
    <p style="font-size:15px;line-height:1.6;color:${MUTED}">You asked us to send this over, so here it is, saved for whenever you need it.</p>
    <div style="background:#F4F7FB;border:1px solid #E3EAF3;border-radius:12px;padding:18px 20px;margin:18px 0;font-size:16px;line-height:1.7;color:${INK}">${note}</div>
    <p style="font-size:15px;line-height:1.6">These are estimates to give you the shape of it. The number that really moves is your expenses: every business cost you claim comes off your tax, and most people lose hundreds because a receipt goes missing. That is the whole job Lekhio does, from a text, all year.</p>
    <p style="margin:24px 0"><a href="${appUrl}" style="background:${RIVER};color:#fff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:10px;display:inline-block">Start free, no card</a></p>
    <hr style="border:none;border-top:1px solid #ECECEC;margin:28px 0 14px" />
    <p style="font-size:12px;color:${MUTED};line-height:1.6">You are getting this because you asked Lekhio for your result and tax reminders. <a href="${unsubscribeLink}" style="color:${MUTED}">Unsubscribe</a> any time. Lekhio is an independent UK company, not HMRC.</p>
  </div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Lekhio <${fromAddr}>`,
        to: [to],
        subject: 'Your result from Lekhio',
        html,
        headers: { 'List-Unsubscribe': `<${unsubscribeLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }),
    });
    if (!res.ok) { console.error('[email] result failed:', res.status); return false; }
    return true;
  } catch (e) {
    console.error('[email] result exception:', e instanceof Error ? e.message : 'unknown');
    return false;
  }
}
