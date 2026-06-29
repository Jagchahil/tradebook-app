// Email sending, for delivering an invoice straight to a customer's inbox.
// Uses Resend. Dormant until RESEND_API_KEY is set, so everything degrades to
// "here is a link to forward" until email is switched on.
//
// Env vars:
//   RESEND_API_KEY   from resend.com
//   EMAIL_FROM       e.g. "Lekhio <invoices@lekhio.com>" (the domain must be
//                    verified in Resend before sending)

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM || 'Lekhio <invoices@lekhio.com>';

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

  const html = `
  <div style="font-family:Inter,-apple-system,'Segoe UI',sans-serif;color:${INK};max-width:520px;margin:0 auto;padding:24px">
    <p style="font-size:15px;color:${MUTED}">Hi ${opts.customerName || 'there'},</p>
    <p style="font-size:15px;line-height:1.6">Here is your invoice <strong>${opts.number}</strong>${opts.businessName ? ` from <strong>${opts.businessName}</strong>` : ''}, for <strong>${total}</strong>.</p>
    <p style="margin:28px 0">
      <a href="${opts.link}" style="background:${RIVER};color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:10px;display:inline-block">View and pay the invoice</a>
    </p>
    <p style="font-size:13px;color:${MUTED}">Or open this link: <a href="${opts.link}" style="color:${RIVER}">${opts.link}</a></p>
    <p style="font-size:12px;color:${MUTED};margin-top:32px">Sent with Lekhio.</p>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${from} <${FROM.replace(/.*</, '').replace(/>.*/, '')}>`, to: [opts.to], subject, html }),
    });
    if (!res.ok) {
      console.error('[email] send failed:', res.status, await res.text());
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lekhio.com';
  const hi = name ? `Welcome to Lekhio, ${name}.` : 'Welcome to Lekhio.';

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
      console.error('[email] welcome failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] welcome exception:', e instanceof Error ? e.message : 'unknown');
    return false;
  }
}
