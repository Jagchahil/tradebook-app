import { NextRequest, NextResponse } from 'next/server';
import { readAssetsPendingGeneration, countStudioAssetsGeneratedSince } from '../../../../lib/supabase';
import {
  STUDIO_GEN_ENABLED,
  genMaxPerBrief,
  genMaxPerDay,
  planRenders,
  buildRenderRequest,
} from '../../../../lib/higgsfield';

export const runtime = 'nodejs';

// THE GENERATION QUEUE, for the Mac mini generation agent.
//
// Secret gated, exactly like studio-run: the AGENT_SECRET in the x-agent-secret header, and if the
// secret is not configured the route refuses everyone. It returns only APPROVED assets that still
// need a video made (state scheduled, no file yet), so the agent can only ever work on what Jag
// already said yes to.
//
// STEP 4 adds three guards, all in lib/higgsfield.ts so they are tested without a provider:
//   - the master switch STUDIO_GEN_ENABLED. Off by default, so the worker is handed nothing and
//     spends nothing until Jag flips one env line. This is the dark default for the whole engine.
//   - the standing spend cap. planRenders fills the smaller of the per brief cap and what is left of
//     the day (counted from assets already generated today), so the worker cannot run away with the
//     Higgsfield credits however often it wakes.
//   - the faceless, animated directive and the aspect, stamped on every item by buildRenderRequest,
//     with every visible string already cleaned of dashes, so a storyboard cannot become a talking
//     head or ship a dash.
export async function GET(req: NextRequest) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return NextResponse.json({ error: 'agent not configured' }, { status: 503 });
  if ((req.headers.get('x-agent-secret') || '') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // The dark default. With the switch off, no work leaves the building.
  if (!STUDIO_GEN_ENABLED()) {
    return NextResponse.json({ pending: 0, assets: [], disabled: true });
  }

  const assets = await readAssetsPendingGeneration();
  if (assets === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  // The day's spend so far. If we cannot read it, treat the day as spent and hand out nothing, so an
  // unreadable count fails safe rather than opening the cap.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const already = await countStudioAssetsGeneratedSince(startOfDay.toISOString());
  const alreadyToday = already === null ? genMaxPerDay() : already;

  const plan = planRenders(
    assets.map((a) => ({ asset_id: a.id, format: a.format })),
    { maxPerBrief: genMaxPerBrief(), maxPerDay: genMaxPerDay(), alreadyToday },
  );
  const acceptedIds = new Set(plan.accepted.map((a) => a.asset_id));

  // Hand the agent only the fields it needs to generate, now carrying the faceless directive, the
  // aspect, and dash cleaned frames from buildRenderRequest.
  const queue = assets
    .filter((a) => acceptedIds.has(a.id))
    .map((a) => {
      const rr = buildRenderRequest({ id: a.id, format: a.format, scene: a.scene, storyboard: a.storyboard });
      return {
        id: a.id,
        title: a.title,
        trade: a.trade,
        format: a.format,
        caption: a.caption,
        scene: rr.scene,
        platforms: a.platforms,
        storyboard: rr.frames,
        aspect: rr.aspect,
        directive: rr.directive,
        weight: rr.weight,
      };
    });

  return NextResponse.json({ pending: queue.length, assets: queue, held_by_cap: plan.skipped.length });
}
