import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  readTeamMember,
  readStudioIdeas,
  readStudioAssets,
  readStudioMetrics,
  attributionByTag,
} from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { totalsByAsset, emptyTotals, type ScoreRow } from '../../../../../lib/studio';

export const runtime = 'nodejs';

// Everything the Studio needs in one fetch: the idea backlog, every asset (the board reads state off
// these), and the scoreboard for what is live. Same gate as the rest of the console: a row in
// team_members, read fresh on THIS request. No customer data is returned. The only money number is
// aggregate attribution by a post's own tag.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [ideas, assets, metrics, attr] = await Promise.all([
    readStudioIdeas(),
    readStudioAssets(),
    readStudioMetrics(),
    attributionByTag(),
  ]);

  if (assets === null || ideas === null) {
    // We could not read. We will not draw an empty studio and let someone believe it is empty.
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  const totals = totalsByAsset(metrics || []);
  const attribution = attr || {};

  const scoreboard: ScoreRow[] = assets
    .filter((a) => a.state === 'live' || a.state === 'measured')
    .map((a) => {
      const tag = a.source_tag || '';
      const at = tag ? attribution[tag] : undefined;
      return {
        asset: a,
        totals: totals[a.id] ?? emptyTotals(),
        realTrials: at?.trials ?? 0,
        realPaying: at?.paying ?? 0,
      };
    });

  return NextResponse.json({
    me: { email: member!.email, name: member!.name, role: member!.role },
    ideas,
    assets,
    scoreboard,
    // The scoreboard's money columns are real but will read zero until posts are live and their link
    // carries the tag. That is honest, not broken. The team should see the difference.
    hasMetrics: (metrics || []).length > 0,
  });
}
