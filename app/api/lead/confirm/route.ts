import { NextRequest, NextResponse, after } from 'next/server';
import { verifyLeadToken, unsubscribeUrl } from '../../../../lib/leadtoken';
import { confirmLeadAndGetResult } from '../../../../lib/supabase';
import { sendLeadResultEmail } from '../../../../lib/email';
import { rateLimitedShared, clientIp } from '../../../../lib/ratelimit';

// The double opt in confirmation link. The signed token proves the request is
// genuine for this exact email, so a link cannot be forged or reused for another
// address, and since 8 August 2026 it also expires (lib/leadtoken.ts).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A GET CONFIRMS NOTHING. THE CONFIRM IS A POST, AND A ROBOT DOES NOT PRESS BUTTONS.
//
// This used to confirm the lead and fire the result email straight off the GET. Corporate mail
// gateways, Outlook Safe Links, antivirus and half the link checkers in the world FETCH EVERY LINK
// IN A MESSAGE the moment it is delivered, before a human has seen it. So the machine confirmed his
// consent for him, the result email went out to a man who had not asked for it yet, and because
// confirmLeadAndGetResult() re-reads and re-returns the note on every call, a gateway that fetches
// twice sent it twice. A double opt in that a robot can complete is not a double opt in. It is a
// single opt in with an extra email.
//
// An expiry does not touch that: the prefetch happens within seconds of delivery, well inside any
// window worth having. A single use marker would need storage, a table and a migration, and it
// would still record the ROBOT as the one use.
//
// So the door moved instead. The GET renders a page and writes nothing. The POST is the confirm.
// Nothing is stored, nothing is migrated, and it costs the customer one tap on a page that is one
// button. That is the cheapest honest version of "he confirmed it, not his mail server".
// ═══════════════════════════════════════════════════════════════════════════════════════════

const HTML = { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' } as const;

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DEAD_LINK = {
  title: 'Link expired or invalid',
  msg: 'That confirmation link did not work, and a link only lasts a week. Run the tool again and we will send you a fresh one, or just get in touch and we will sort it.',
};

// GET: SHOW THE BUTTON. No database write, no email, no side effect of any kind, so a mail scanner
// that follows this link achieves precisely nothing.
export async function GET(req: NextRequest) {
  if (await rateLimitedShared(`confirm:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return new NextResponse('Too many requests.', { status: 429 });
  }
  const e = req.nextUrl.searchParams.get('e') || '';
  const t = req.nextUrl.searchParams.get('t') || '';
  const email = e.trim().toLowerCase();

  // Checked here as well as on the POST, so a man with a dead link is told now rather than after
  // pressing a button that was never going to work.
  if (!email || !verifyLeadToken('confirm', email, t)) {
    return new NextResponse(page(DEAD_LINK.title, DEAD_LINK.msg, false), { status: 400, headers: HTML });
  }

  return new NextResponse(confirmPage(email, t), { status: 200, headers: HTML });
}

// POST: THE ACTUAL CONFIRM. Only ever reached by a person pressing the button.
export async function POST(req: NextRequest) {
  if (await rateLimitedShared(`confirm:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return new NextResponse('Too many requests.', { status: 429 });
  }

  let e = '';
  let t = '';
  try {
    const form = await req.formData();
    e = String(form.get('e') ?? '');
    t = String(form.get('t') ?? '');
  } catch {
    /* not a form post: fall through to the query string */
  }
  if (!e) e = req.nextUrl.searchParams.get('e') || '';
  if (!t) t = req.nextUrl.searchParams.get('t') || '';
  const email = e.trim().toLowerCase();

  let ok = false;
  if (email && verifyLeadToken('confirm', email, t)) {
    const r = await confirmLeadAndGetResult(email);
    ok = r.ok;
    // Now actually send the result we promised them, after the response so this page never waits on it.
    if (r.ok && r.resultNote) {
      const note = r.resultNote;
      after(async () => {
        try {
          await sendLeadResultEmail(email, note, unsubscribeUrl(email));
        } catch {
          /* best effort */
        }
      });
    }
  }

  const body = ok
    ? { title: 'You are confirmed', msg: 'All set. We will send your result and keep you right on the deadlines that matter.' }
    : DEAD_LINK;

  return new NextResponse(page(body.title, body.msg, ok), { status: ok ? 200 : 400, headers: HTML });
}

// One button, and nothing else on the page. He has already decided; this is only here so that the
// thing which decides is a thumb and not a mail server.
function confirmPage(email: string, token: string): string {
  return card(`
      <div style="font-size:48px;margin-bottom:12px">📩</div>
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">One tap and your result is on its way</h1>
      <p style="color:#5B6470;font-size:16px;line-height:1.5;margin:0 0 20px">Confirm your email address and we will send it over.</p>
      <form method="post" action="/api/lead/confirm">
        <input type="hidden" name="e" value="${esc(email)}">
        <input type="hidden" name="t" value="${esc(token)}">
        <button type="submit" style="display:inline-block;border:0;cursor:pointer;background:#1B59A6;border-radius:10px;padding:14px 32px;font-size:16px;font-weight:700;color:#ffffff;font-family:inherit">Confirm my email</button>
      </form>
      <p style="color:#1B59A6;font-size:14px;font-weight:600;margin:22px 0 0">Lekhio</p>`, 'One tap to confirm');
}

function page(title: string, msg: string, ok: boolean): string {
  const accent = ok ? '#15803D' : '#C0392B';
  return card(`
      <div style="font-size:48px;margin-bottom:12px">${ok ? '✅' : '⚠️'}</div>
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">${esc(title)}</h1>
      <p style="color:#5B6470;font-size:16px;line-height:1.5;margin:0 0 20px">${esc(msg)}</p>
      <p style="color:${accent};font-size:14px;font-weight:600;margin:0">Lekhio</p>`, title);
}

function card(inner: string, title: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Lekhio</title></head>
  <body style="margin:0;background:#FBFAF7;font-family:Inter,-apple-system,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
    <div style="max-width:440px;text-align:center;background:#fff;border:1px solid #ECECEC;border-radius:16px;padding:40px 28px">${inner}
    </div>
  </body></html>`;
}
