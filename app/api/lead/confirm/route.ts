import { NextRequest, NextResponse } from 'next/server';
import { verifyLeadToken } from '../../../../lib/leadtoken';
import { setLeadConfirmed } from '../../../../lib/supabase';
import { rateLimited, clientIp } from '../../../../lib/ratelimit';

// The double opt in confirmation link. The signed token proves the request is
// genuine for this exact email, so a link cannot be forged or reused for another
// address. On success we mark the lead confirmed and show a friendly page.
export async function GET(req: NextRequest) {
  if (rateLimited(`confirm:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return new NextResponse('Too many requests.', { status: 429 });
  }
  const e = req.nextUrl.searchParams.get('e') || '';
  const t = req.nextUrl.searchParams.get('t') || '';
  const email = e.trim().toLowerCase();

  const ok = email && verifyLeadToken('confirm', email, t) ? await setLeadConfirmed(email) : false;

  const body = ok
    ? { title: 'You are confirmed', msg: 'All set. We will send your result and keep you right on the deadlines that matter.' }
    : { title: 'Link expired or invalid', msg: 'That confirmation link did not work. Try the tool again, or just get in touch and we will sort it.' };

  return new NextResponse(page(body.title, body.msg, ok), {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
  });
}

function page(title: string, msg: string, ok: boolean): string {
  const accent = ok ? '#15803D' : '#B42318';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Lekhio</title></head>
  <body style="margin:0;background:#FBFAF7;font-family:Inter,-apple-system,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="max-width:440px;text-align:center;background:#fff;border:1px solid #ECECEC;border-radius:16px;padding:40px 28px">
      <div style="font-size:48px;margin-bottom:12px">${ok ? '✅' : '⚠️'}</div>
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">${title}</h1>
      <p style="color:#5B6470;font-size:16px;line-height:1.5;margin:0 0 20px">${msg}</p>
      <p style="color:${accent};font-size:14px;font-weight:600;margin:0">Lekhio</p>
    </div>
  </body></html>`;
}
