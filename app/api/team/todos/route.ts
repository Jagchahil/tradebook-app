import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readTeamTodos, setTodoDone } from '../../../../lib/todos';

export const runtime = 'nodejs';

// THE CEO TO-DO LIST the console reads. Same gate as the rest of the console: a row in team_members,
// read fresh on THIS request. GET returns the list; POST marks one done or reopens it (any team
// member). Munshi WRITES the list through the separate secret-gated /sync route, not here.

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const todos = await readTeamTodos();
  if (todos === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json({ todos });
}

interface Body { id?: string; done?: boolean; }

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const ok = await setTodoDone(body.id, body.done === true);
  return NextResponse.json({ ok });
}
