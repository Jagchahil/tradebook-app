import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readTickets } from '../../../../lib/support';

export const runtime = 'nodejs';

// WHATSAPP SUPPORT, read side. The console polls this for the tickets waiting to be answered. Same gate
// as the rest of the console: a team_members row, read fresh on this request. Open tickets are the work;
// a short tail of decided ones gives context. No customer financial data — only the message that asked
// for help, the drafted reply, and whether the 24-hour reply window is still open.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const tickets = await readTickets();
  if (tickets === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json(tickets);
}
