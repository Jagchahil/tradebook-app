import { NextRequest, NextResponse, after } from 'next/server';
import { verifyAccessToken, readTeamMember, listMarketableLeads } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { hasEmailConfig, sendMarketingEmail } from '../../../../lib/email';
import { unsubscribeUrl } from '../../../../lib/leadtoken';
import { NEWSLETTERS, getNewsletter, renderNewsletterInner } from '../../../../lib/newsletter';

export const runtime = 'nodejs';
export const maxDuration = 60;

// THE NEWSLETTER DESK. Same team gate as the rest of the console. GET lists the issues, the confirmed
// audience size and whether sending is armed; GET with ?id=X also returns the rendered preview HTML.
// POST sends an issue — but ONLY to a signed-in team member, ONLY when NEWSLETTER_SEND_ENABLED is
// 'true', and ONLY with an explicit { confirm: true } in the body. Three locks, so nothing broadcasts by
// accident. Every send carries a one-click unsubscribe (added by sendMarketingEmail). Bounded per run so
// a single serverless invocation stays inside Resend's daily allowance.
const MAX_PER_RUN = 100;

async function gate(req: NextRequest): Promise<NextResponse | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

const sendArmed = (): boolean => process.env.NEWSLETTER_SEND_ENABLED === 'true';

export async function GET(req: NextRequest) {
  const denied = await gate(req);
  if (denied) return denied;

  const audience = (await listMarketableLeads(true)).length;
  const id = req.nextUrl.searchParams.get('id');
  const previewHtml = id ? (() => { const nl = getNewsletter(id); return nl ? renderNewsletterInner(nl) : null; })() : null;

  return NextResponse.json({
    issues: NEWSLETTERS.map((n) => ({ id: n.id, subject: n.subject, preheader: n.preheader ?? '' })),
    audience,
    armed: sendArmed(),
    emailConfigured: hasEmailConfig(),
    previewHtml,
  });
}

export async function POST(req: NextRequest) {
  const denied = await gate(req);
  if (denied) return denied;

  if (!hasEmailConfig()) return NextResponse.json({ error: 'email not configured' }, { status: 503 });
  if (!sendArmed()) return NextResponse.json({ error: 'sending not armed (set NEWSLETTER_SEND_ENABLED=true)' }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; confirm?: boolean };
  if (body.confirm !== true) return NextResponse.json({ error: 'confirm required' }, { status: 400 });

  const nl = body.id ? getNewsletter(body.id) : null;
  if (!nl) return NextResponse.json({ error: 'unknown issue' }, { status: 404 });

  const all = await listMarketableLeads(true);
  const recipients = all.slice(0, MAX_PER_RUN);
  const capped = all.length - recipients.length;
  const inner = renderNewsletterInner(nl);

  // Send after the response so the click is never held waiting. Each send is independent; one failure
  // never stops the rest.
  after(async () => {
    let sent = 0;
    for (const email of recipients) {
      try {
        const ok = await sendMarketingEmail(email, nl.subject, inner, unsubscribeUrl(email));
        if (ok) sent++;
      } catch {
        /* skip this one, keep going */
      }
    }
    console.log(`[newsletter] issue ${nl.id}: sent ${sent}/${recipients.length}${capped > 0 ? `, ${capped} over the per-run cap not sent` : ''}`);
  });

  return NextResponse.json({ ok: true, issue: nl.id, audience: all.length, queued: recipients.length, capped });
}
