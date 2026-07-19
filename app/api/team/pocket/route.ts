import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readPocket } from '../../../../lib/pocket';

export const runtime = 'nodejs';

// KHOJI'S POCKET, read by the console. Same gate as the rest of /team: a row in team_members, checked
// fresh on THIS request. Read-only — the pocket is written only by the mini, one way. No customer data.

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const pocket = await readPocket();
  if (pocket === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json(pocket);
}
