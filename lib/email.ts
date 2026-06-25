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
