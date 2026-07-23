import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { addInsight, readInsights } from '../../../../../lib/marketinginsights';

export const runtime = 'nodejs';

// THE CEO INSIGHT BOX. Same gate as the rest of the console: a row in team_members, re-checked on
// THIS request. GET the most recent notes so the Growth desk can show they saved; POST a new one.
// No customer data ever passes through here, only the free text Jag types.

async function gate(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { member: member! };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;
  const insights = await readInsights(20);
  if (insights === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json({ insights });
}

interface Body { text?: unknown }

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.error) return g.error;

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { /* empty */ }

  const saved = await addInsight(typeof body.text === 'string' ? body.text : '', g.member.email);
  if (!saved) return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 400 });
  return NextResponse.json({ insight: saved });
}
