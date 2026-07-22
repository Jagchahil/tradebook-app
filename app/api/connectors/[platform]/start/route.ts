import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifyAccessToken, readTeamMember } from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import {
  CONNECTORS_ENABLED, connectorConfigured, isConnector, authorizeUrl, signState,
} from '../../../../../lib/connectors';

export const runtime = 'nodejs';

// START an OAuth connect. OWNER only, and dark by default. The console fetches this with the owner's
// bearer token, gets back the authorize URL, and sends the browser there. Connecting a company ad or
// posting account is the owner's act, so the gate is the owner chair, not just any team member.
//
// The state we sign carries the platform and the owner's email, so the callback can bind the tokens
// to who connected them without needing a session on the redirect back from the platform.
export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isConnector(platform)) return NextResponse.json({ error: 'unknown platform' }, { status: 404 });

  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const member = await readTeamMember(user.email);
  if (!isTeam(member) || member!.role !== 'owner') {
    return NextResponse.json({ error: 'owner only' }, { status: 403 });
  }

  if (!CONNECTORS_ENABLED()) return NextResponse.json({ error: 'connectors disabled' }, { status: 503 });
  if (!connectorConfigured(platform)) return NextResponse.json({ error: 'not configured', platform }, { status: 503 });

  const nonce = crypto.randomBytes(12).toString('hex');
  const state = signState(`${platform}:${member!.email}:${nonce}`);
  return NextResponse.json({ url: authorizeUrl(platform, state) });
}
