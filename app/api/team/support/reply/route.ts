import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { getTicket, setTicketStatus, windowOpen } from '../../../../../lib/support';
import { sendTextResult } from '../../../../../lib/whatsapp';

export const runtime = 'nodejs';

// WHATSAPP SUPPORT, decide side. Jag approves a reply (send) or clears the ticket (dismiss). On send we
// re-check the 24-hour window from the ticket's own last_inbound_at at the moment of sending — if it has
// closed since the console loaded, we refuse rather than silently failing at Meta, and tell Jag it now
// needs a template. Nothing leaves without his tap. Team-gated, same as the rest of the console.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const bodyJson = (await req.json().catch(() => ({}))) as { id?: string; action?: 'send' | 'dismiss'; body?: string };
  const id = bodyJson.id;
  const action = bodyJson.action;
  if (!id || (action !== 'send' && action !== 'dismiss')) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const ticket = await getTicket(id);
  if (!ticket) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (action === 'dismiss') {
    const ok = await setTicketStatus(id, 'dismissed');
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'failed' }, { status: 500 });
  }

  // action === 'send'
  const text = (bodyJson.body || '').trim();
  if (!text) return NextResponse.json({ error: 'empty reply' }, { status: 400 });

  if (!windowOpen(ticket.last_inbound_at)) {
    // The free window closed since the console loaded. A free-form send would be rejected by Meta, so
    // refuse cleanly and let Jag know it now needs an approved template (or a fresh message from the
    // customer to reopen the window).
    return NextResponse.json({ error: 'window_closed', needsTemplate: true }, { status: 409 });
  }

  const sent = await sendTextResult(ticket.phone, text);
  if (!sent) return NextResponse.json({ error: 'send_failed' }, { status: 502 });

  await setTicketStatus(id, 'answered');
  return NextResponse.json({ ok: true });
}
