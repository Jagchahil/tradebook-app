import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { hasClaudeConfig, improveSupportAnswer } from '../../../../../lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 30;

// "Run it through" — sharpen a playbook answer with Claude. Team-gated. Takes the question and the
// founder's rough answer, returns a customer-ready version he can accept or keep editing. It never saves
// anything itself; the console decides whether to keep the result.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!hasClaudeConfig()) return NextResponse.json({ error: 'AI is off right now' }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { question?: string; draft?: string };
  const draft = (b.draft || '').trim();
  if (!draft) return NextResponse.json({ error: 'nothing to improve' }, { status: 400 });

  const improved = await improveSupportAnswer(b.question || '', draft);
  if (!improved) return NextResponse.json({ error: 'could not improve that — try again' }, { status: 502 });
  return NextResponse.json({ improved });
}
