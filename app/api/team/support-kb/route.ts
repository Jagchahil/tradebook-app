import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readAllKb } from '../../../../lib/supportkb';

export const runtime = 'nodejs';

// THE PLAYBOOK, read side. The console's Playbook node reads this to show every common-issue entry the
// support desk knows — the same rows that ground the drafts and fill the pick-list. Team-gated, same as
// the rest of the console. Read-only here: the entries are authored in Obsidian and synced in, so the
// vault stays the single source of truth. No customer data — only our own playbook.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = await readAllKb();
  return NextResponse.json({
    entries: rows.map((r) => ({ id: r.id, title: r.title, body: r.body, keywords: r.keywords, updatedAt: r.updated_at })),
  });
}
