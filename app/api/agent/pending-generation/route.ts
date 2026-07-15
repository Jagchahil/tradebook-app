import { NextRequest, NextResponse } from 'next/server';
import { readAssetsPendingGeneration } from '../../../../lib/supabase';

export const runtime = 'nodejs';

// THE GENERATION QUEUE, for the Mac mini generation agent.
//
// Secret gated, exactly like studio-run: the AGENT_SECRET in the x-agent-secret header, and if the
// secret is not configured the route refuses everyone. It returns only APPROVED assets that still
// need a video made (state scheduled, no file yet), trimmed to what the agent needs to generate. It
// never returns anything unapproved, so the agent can only ever work on what Jag already said yes to.
export async function GET(req: NextRequest) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return NextResponse.json({ error: 'agent not configured' }, { status: 503 });
  if ((req.headers.get('x-agent-secret') || '') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const assets = await readAssetsPendingGeneration();
  if (assets === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  // Hand the agent only the fields it needs to generate, not the whole row.
  const queue = assets.map((a) => ({
    id: a.id,
    title: a.title,
    trade: a.trade,
    format: a.format,
    caption: a.caption,
    scene: a.scene,
    platforms: a.platforms,
    storyboard: a.storyboard,
  }));

  return NextResponse.json({ pending: queue.length, assets: queue });
}
