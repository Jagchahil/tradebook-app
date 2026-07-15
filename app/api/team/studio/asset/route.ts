import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  readTeamMember,
  readStudioAsset,
  readStudioApprovals,
  readStudioMetrics,
} from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';

export const runtime = 'nodejs';

// One asset in full: its storyboard (the thing Jag reviews), its whole approval history (the audit
// trail, nothing deleted), and its metrics. Query param, not a dynamic segment, on purpose: it keeps
// the route simple and typed and avoids the async params dance.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const asset = await readStudioAsset(id);
  if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [approvals, allMetrics] = await Promise.all([
    readStudioApprovals(id),
    readStudioMetrics(),
  ]);

  const metrics = (allMetrics || []).filter((m) => m.asset_id === id);

  return NextResponse.json({ asset, approvals: approvals || [], metrics });
}
