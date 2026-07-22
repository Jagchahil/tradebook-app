import { NextRequest, NextResponse } from 'next/server';
import { insertStudioAsset, insertStudioAgentRun } from '../../../../lib/supabase';
import { draftStoryboard } from '../../../../lib/claude';
import { buildStrategy, type Brief } from '../../../../lib/brief';
import { defaultPlatforms, type Format, type Promise3 } from '../../../../lib/studio';

export const runtime = 'nodejs';
// Drafting a whole slate on the smart model takes real seconds. Give the function room so a brief
// never gets cut off half way. The Mac mini triggers this and waits.
export const maxDuration = 60;

// THE BRIEF ROUTE. Hoka's front door.
//
// Where studio-run drains a hand fed idea backlog, this takes a marketing brief in the operator's
// words (a goal, the trades to speak to, how many assets) and composes the strategy itself with
// lib/brief.ts, then drafts every slot into a storyboard and parks it in awaiting_approval. Money
// leads, all three promises are spread, and any slate of three or more carries the honesty cut, all
// guaranteed by buildStrategy, not by hoping the operator remembered.
//
// It never approves, never posts, never spends a generation credit. It only ADDS drafts for review,
// exactly like studio-run. Secret gated on AGENT_SECRET, and if that is unset it refuses everyone,
// because a secret gate with no secret is an open door.

const FORMATS: Format[] = ['video', 'carousel', 'tip'];
const PROMISES: Promise3[] = ['money', 'zero_habit', 'honesty'];

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return NextResponse.json({ error: 'agent not configured' }, { status: 503 });
  if ((req.headers.get('x-agent-secret') || '') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    // An empty brief is allowed. The deterministic defaults in buildStrategy apply.
  }

  const trades = Array.isArray(raw.trades)
    ? (raw.trades as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const promisesIn = Array.isArray(raw.promises)
    ? (raw.promises as unknown[]).filter((p): p is Promise3 => (PROMISES as string[]).includes(p as string))
    : [];
  const formatsIn = Array.isArray(raw.formats)
    ? (raw.formats as unknown[]).filter((f): f is Format => (FORMATS as string[]).includes(f as string))
    : [];
  // Clamp the ask to 12 per call so one brief cannot swamp the AI budget or overrun the function. The
  // operator runs the brief again for more. buildStrategy clamps again to its own MAX_SLATE.
  const wantRaw = typeof raw.count === 'number' && Number.isFinite(raw.count) ? Math.floor(raw.count) : 3;
  const count = Math.max(1, Math.min(12, wantRaw));
  const goal = typeof raw.goal === 'string' ? raw.goal.slice(0, 300) : null;

  const brief: Brief = {
    goal,
    trades,
    count,
    promises: promisesIn.length ? promisesIn : undefined,
    formats: formatsIn.length ? formatsIn : undefined,
  };
  const strategy = buildStrategy(brief);

  const started = Date.now();
  try {
    const results = await Promise.all(
      strategy.slate.map(async (slot) => {
        const input = { title: slot.title, trade: slot.trade, format: slot.format, promise: slot.promise };
        const draft = await draftStoryboard(input);
        if (!draft) return { ok: false as const, title: slot.title };
        const asset = await insertStudioAsset({
          idea_id: null,
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
          created_by: 'hoka-brief',
        });
        return asset ? { ok: true as const, title: input.title } : { ok: false as const, title: input.title };
      }),
    );

    const drafted = results.filter((r) => r.ok).length;
    await insertStudioAgentRun({
      drafted,
      considered: strategy.slate.length,
      ok: true,
      note: goal ? `brief: ${goal.slice(0, 120)}` : 'brief',
      duration_ms: Date.now() - started,
    });
    return NextResponse.json({
      drafted,
      planned: strategy.slate.length,
      note: strategy.note,
      titles: results.filter((r) => r.ok).map((r) => r.title),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    await insertStudioAgentRun({
      drafted: 0,
      considered: strategy.slate.length,
      ok: false,
      note: message.slice(0, 300),
      duration_ms: Date.now() - started,
    });
    return NextResponse.json({ error: 'brief failed' }, { status: 500 });
  }
}
