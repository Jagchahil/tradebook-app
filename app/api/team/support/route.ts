import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readTickets } from '../../../../lib/support';
import { matchKb } from '../../../../lib/supportkb';

export const runtime = 'nodejs';

// WHATSAPP SUPPORT, read side. The console polls this for the tickets waiting to be answered. Same gate
// as the rest of the console: a team_members row, read fresh on this request. Open tickets are the work;
// a short tail of decided ones gives context. Each open ticket also carries the matching entries from
// Jag's Obsidian common-issues playbook, so the console can offer them as one-click pick-list replies.
// No customer financial data — only the message that asked for help, the drafted reply, and the window.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const tickets = await readTickets();
  if (tickets === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  // Attach playbook suggestions to each open ticket. Best-effort: an empty KB just means no chips.
  const open = await Promise.all(
    tickets.open.map(async (t) => ({ ...t, suggestions: await matchKb(t.customerMessage).catch(() => []) })),
  );
  return NextResponse.json({ open, recent: tickets.recent });
}
