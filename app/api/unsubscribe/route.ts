import { NextRequest, NextResponse } from 'next/server';
import { verifyLeadToken } from '../../../lib/leadtoken';
import { setLeadUnsubscribed } from '../../../lib/supabase';
import { rateLimitedShared, clientIp } from '../../../lib/ratelimit';

// One click unsubscribe. Works two ways: a normal GET when the person clicks the
// link in an email, and a POST that inboxes send automatically for their built in
// "unsubscribe" button (the List-Unsubscribe-Post standard). Both honour it
// immediately. The signed token ties the link to that one email address.
async function handle(email: string, token: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (!e || !verifyLeadToken('unsub', e, token)) return false;
  return setLeadUnsubscribed(e);
}

export async function GET(req: NextRequest) {
  if (await rateLimitedShared(`unsub:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return new NextResponse('Too many requests.', { status: 429 });
  }
  const ok = await handle(req.nextUrl.searchParams.get('e') || '', req.nextUrl.searchParams.get('t') || '');
  const msg = ok
    ? { title: 'You are unsubscribed', body: 'Done. You will not get any more marketing emails from us. No hard feelings.' }
    : { title: 'Link invalid', body: 'That unsubscribe link did not work. Get in touch and we will take you off straight away.' };
  return new NextResponse(page(msg.title, msg.body, ok), {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
  });
}

// Inbox initiated one click unsubscribe (RFC 8058). Returns 200 with no body.
export async function POST(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  let email = params.get('e') || '';
  let token = params.get('t') || '';
  if (!email) {
    // Some clients send the query in the body instead.
    try {
      const form = await req.formData();
      email = (form.get('e') as string) || email;
      token = (form.get('t') as string) || token;
    } catch {
      /* ignore */
    }
  }
  await handle(email, token);
  return new NextResponse(null, { status: 200 });
}

function page(title: string, body: string, ok: boolean): string {
  const accent = ok ? '#15803D' : '#B42318';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Lekhio</title></head>
  <body style="margin:0;background:#FBFAF7;font-family:Inter,-apple-system,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="max-width:440px;text-align:center;background:#fff;border:1px solid #ECECEC;border-radius:16px;padding:40px 28px">
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">${title}</h1>
      <p style="color:#5B6470;font-size:16px;line-height:1.5;margin:0 0 20px">${body}</p>
      <p style="color:${accent};font-size:14px;font-weight:600;margin:0">Lekhio</p>
    </div>
  </body></html>`;
}
