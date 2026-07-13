import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember, setCustomerSource } from '../../../../lib/supabase';
import { isTeam, SOURCES } from '../../../../lib/team';

export const runtime = 'nodejs';

// Record where a customer came from. The ONLY write the team dashboard has.
//
// It touches two columns, acquisition_source and acquisition_detail, and both are facts about OUR
// marketing rather than about his money. This route cannot change a transaction, a category, a
// figure, or a subscription, and it never will: if the dashboard ever needs to edit a customer's
// books, that is a different product with a different promise, and it starts with rewriting what we
// tell him on the settings screen.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Checked against the database, on this request. Not from a claim in the token.
  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { userId?: string; source?: string; detail?: string };
  const userId = String(body.userId || '');
  const source = String(body.source || '');

  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'bad user id' }, { status: 400 });
  if (!SOURCES.includes(source as never)) return NextResponse.json({ error: 'bad source' }, { status: 400 });

  const ok = await setCustomerSource(userId, source, body.detail ?? null);
  if (!ok) return NextResponse.json({ error: 'could not save' }, { status: 503 });
  return NextResponse.json({ ok: true });
}
