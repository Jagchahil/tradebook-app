import { NextRequest, NextResponse } from 'next/server';
import {
  readStudioIdeas,
  readStudioAssets,
  insertStudioAsset,
  markIdeaPromoted,
  insertStudioAgentRun,
} from '../../../../lib/supabase';
import { draftStoryboard } from '../../../../lib/claude';
import { pickDraftIdeas } from '../../../../lib/studioagent';
import { defaultPlatforms } from '../../../../lib/studio';
import { sendText, hasSendConfig } from '../../../../lib/whatsapp';

export const runtime = 'nodejs';
// Drafting a few storyboards on the smart model takes real seconds. Give the function room so a
// batch never gets cut off half way. The Mac mini just triggers this and waits.
export const maxDuration = 60;

// THE DAILY AGENT RUN. Triggered by the Mac mini on a schedule (scripts/studio-agent.mjs).
//
// It is NOT behind the team login, because a headless cron cannot hold a Supabase user session. It
// is behind a single shared secret, AGENT_SECRET, sent in the x-agent-secret header. If that env var
// is not set, the route refuses everyone: a secret gate with no secret is an open door, and we fail
// closed. The work it does only ever ADDS drafts to awaiting_approval. It never approves, never
// posts, never spends. Those gates stay with Jag.
//
// EVERY run writes a heartbeat row, success or failure, so a bot that quietly dies is visible in the
// database instead of looking exactly like a quiet day.
export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return NextResponse.json({ error: 'agent not configured' }, { status: 503 });
  const given = req.headers.get('x-agent-secret') || '';
  if (given !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const started = Date.now();

  // How many to draft this run. Default 3, hard capped at 5 so one run can never run away with the
  // AI budget. The Mac mini can ask for fewer, never more.
  let want = 3;
  try {
    const body = (await req.json()) as { count?: number };
    if (typeof body.count === 'number' && Number.isFinite(body.count)) {
      want = Math.max(1, Math.min(5, Math.floor(body.count)));
    }
  } catch {
    // no body is fine, use the default
  }

  try {
    const [ideas, assets] = await Promise.all([readStudioIdeas(), readStudioAssets()]);
    if (ideas === null || assets === null) {
      await insertStudioAgentRun({ drafted: 0, considered: 0, ok: false, note: 'could not read studio', duration_ms: Date.now() - started });
      return NextResponse.json({ error: 'unreadable' }, { status: 503 });
    }

    const picks = pickDraftIdeas(ideas, assets, want);

    // Draft them in parallel so the whole run is about one model call long, not the sum of them.
    const results = await Promise.all(
      picks.map(async (idea) => {
        const input = { title: idea.title, trade: idea.trade, format: idea.format, promise: idea.promise };
        const draft = await draftStoryboard(input);
        if (!draft) return { ok: false as const, title: idea.title };
        const asset = await insertStudioAsset({
          idea_id: idea.id,
          title: input.title,
          trade: input.trade,
          format: input.format,
          promise: input.promise,
          script: draft.script,
          scene: draft.scene || null,
          caption: draft.caption,
          platforms: defaultPlatforms(input.format),
          source_tag: draft.source_tag,
          storyboard: draft.storyboard,
          state: 'awaiting_approval',
          created_by: 'studio-agent',
        });
        if (!asset) return { ok: false as const, title: idea.title };
        await markIdeaPromoted(idea.id);
        return { ok: true as const, title: input.title };
      }),
    );

    const drafted = results.filter((r) => r.ok).length;
    const titles = results.filter((r) => r.ok).map((r) => r.title);

    await insertStudioAgentRun({
      drafted,
      considered: ideas.length,
      ok: true,
      note: drafted === picks.length ? null : `wanted ${picks.length}, drafted ${drafted}`,
      duration_ms: Date.now() - started,
    });

    // Best effort ping. If WhatsApp is not configured or the send fails, the run still succeeded and
    // the drafts are already in the studio. The notification is a convenience, never the point.
    const phone = process.env.STUDIO_ALERT_PHONE;
    if (drafted > 0 && phone && hasSendConfig()) {
      try {
        await sendText(
          phone,
          `Lekhio Studio: ${drafted} new storyboard${drafted === 1 ? '' : 's'} ready to review. Open the console and tap Studio.`,
        );
      } catch {
        // non fatal
      }
    }

    return NextResponse.json({ drafted, considered: ideas.length, titles });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    await insertStudioAgentRun({ drafted: 0, considered: 0, ok: false, note: message.slice(0, 300), duration_ms: Date.now() - started });
    return NextResponse.json({ error: 'run failed' }, { status: 500 });
  }
}
