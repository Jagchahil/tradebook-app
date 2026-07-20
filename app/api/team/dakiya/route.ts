import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readDrafts } from '../../../../lib/dakiya';

export const runtime = 'nodejs';

// DAKIYA, read side. The console polls this to show the drafts waiting for approval. Same gate as the
// rest of the console: a team_members row, read fresh on THIS request. Returns pending drafts plus a
// short tail of recently decided ones. No customer financial data — only the enquiry text and the
// drafted reply.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const drafts = await readDrafts();
  if (drafts === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json(drafts);
}
