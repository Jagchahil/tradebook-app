import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember, readConnectorStatus } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { CONNECTORS, CONNECTORS_ENABLED, connectorConfigured } from '../../../../lib/connectors';

export const runtime = 'nodejs';

// The connector board for Mistri's desk. Team gated read: for each platform, is it configured (keys
// present), is it connected (a token stored), and is the whole layer switched on. It never returns a
// token, only the fact of a connection. The Connect button on the page uses this to know what to show.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const platforms = await Promise.all(
    CONNECTORS.map(async (p) => {
      const status = await readConnectorStatus(p);
      return {
        platform: p,
        configured: connectorConfigured(p),
        connected: status?.connected ?? false,
        expires_at: status?.expires_at ?? null,
        connected_by: status?.connected_by ?? null,
      };
    }),
  );

  return NextResponse.json({
    enabled: CONNECTORS_ENABLED(),
    isOwner: member!.role === 'owner',
    platforms,
  });
}
