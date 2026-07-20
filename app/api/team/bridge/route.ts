import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readHeartbeats, readActivity } from '../../../../lib/bridge';

export const runtime = 'nodejs';

// THE BRIDGE, read side. The console polls this to watch the workforce live. Same gate as the rest of
// the console: a team_members row, read fresh on THIS request (not a cached role, not the JWT). Returns
// each worker's heartbeat plus the recent activity feed. No customer data — workers report only their
// own status.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [heartbeats, activity] = await Promise.all([readHeartbeats(), readActivity(40)]);
  if (heartbeats === null) {
    // Could not read. Not "the team is idle" — we will not draw a dead cockpit and let it read as calm.
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }
  return NextResponse.json({ heartbeats, activity: activity ?? [] });
}
