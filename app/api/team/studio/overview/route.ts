import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  readTeamMember,
  readStudioAssets,
  readStudioMetrics,
  attributionByTag,
} from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { totalsByAsset, emptyTotals, type ScoreRow } from '../../../../../lib/studio';
import { platformCaptions } from '../../../../../lib/calendar';

export const runtime = 'nodejs';

// Everything Hoka's desk needs in one fetch: every asset (the board reads state off these), the go
// live calendar, and the scoreboard for what is live. The idea backlog was removed on 31 Jul 2026
// along with the AI drafting, so there is nothing to read but work a person actually wrote. Same gate as the rest of the console: a row in
// team_members, read fresh on THIS request. No customer data is returned. The only money number is
// aggregate attribution by a post's own tag.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [assets, metrics, attr] = await Promise.all([
    readStudioAssets(),
    readStudioMetrics(),
    attributionByTag(),
  ]);

  if (assets === null) {
    // We could not read. We will not draw an empty desk and let someone believe it is empty.
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

  // The go live calendar: every approved, scheduled post in date order, each with the caption tuned
  // for every platform it runs on. The board reads state off `assets`; this is the ready made agenda.
  const calendar = assets
    .filter((a) => a.state === 'scheduled')
    .sort((a, b) => (a.scheduled_for || '').localeCompare(b.scheduled_for || ''))
    .map((a) => ({
      asset_id: a.id,
      title: a.title,
      format: a.format,
      scheduled_for: a.scheduled_for,
      platforms: a.platforms,
      captions: platformCaptions(a),
    }));

  return NextResponse.json({
    me: { email: member!.email, name: member!.name, role: member!.role },
    assets,
    scoreboard,
    calendar,
    // The scoreboard's money columns are real but will read zero until posts are live and their link
    // carries the tag. That is honest, not broken. The team should see the difference.
    hasMetrics: (metrics || []).length > 0,
  });
}
