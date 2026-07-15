import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  readTeamMember,
  insertStudioIdea,
  voteStudioIdea,
  insertStudioAsset,
  readStudioAsset,
  readStudioIdea,
  markIdeaPromoted,
  setStudioAssetState,
  insertStudioApproval,
  insertStudioMetric,
  countStudioAssets,
} from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import { draftStoryboard } from '../../../../../lib/claude';
import type { DraftInput } from '../../../../../lib/studioagent';
import {
  SEED_ASSETS, defaultPlatforms, isLegalAdvance, isPublishGate,
  type Format, type Promise3, type AssetState, type Platform, type Storyboard,
} from '../../../../../lib/studio';

export const runtime = 'nodejs';

// EVERY WRITE THE STUDIO MAKES GOES THROUGH HERE, and every one is gated. One route, one switch, so
// there is one place that answers "who is allowed to do this". Reading is open to any team member.
// The two things that matter, approving and seeding, are OWNER only, checked against the team_members
// row on this request. The client cannot vote itself into the owner chair.
interface Body {
  action?: string;
  id?: string;
  idea_id?: string | null;
  title?: string;
  trade?: string | null;
  format?: string;
  promise?: string;
  note?: string | null;
  script?: string | null;
  scene?: string | null;
  caption?: string | null;
  source_tag?: string | null;
  storyboard?: Storyboard;
  to?: string;
  kind?: string;
  decision?: string;
  spend_cap_pence?: number | null;
  platform?: string;
  as_of?: string;
  reach?: number;
  saves?: number;
  shares?: number;
  clicks?: number;
  trials?: number;
}

const FORMATS = new Set<Format>(['video', 'carousel', 'tip']);
const PROMISES = new Set<Promise3>(['money', 'zero_habit', 'honesty']);

function asFormat(v: string | undefined): Format {
  return v && FORMATS.has(v as Format) ? (v as Format) : 'video';
}
function asPromise(v: string | undefined): Promise3 {
  return v && PROMISES.has(v as Promise3) ? (v as Promise3) : 'money';
}
function n(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const me = member!.email;
  const isOwner = member!.role === 'owner';

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  const action = body.action || '';

  // --- add an idea to the backlog. Any team member. -------------------------------------------
  if (action === 'add_idea') {
    const title = (body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const idea = await insertStudioIdea({
      title,
      trade: (body.trade || '').trim() || null,
      format: asFormat(body.format),
      promise: asPromise(body.promise),
      note: (body.note || '').trim() || null,
      author: me,
    });
    if (!idea) return NextResponse.json({ error: 'insert failed' }, { status: 503 });
    return NextResponse.json({ idea });
  }

  // --- vote an idea up. Any team member. ------------------------------------------------------
  if (action === 'vote_idea') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const ok = await voteStudioIdea(body.id);
    return NextResponse.json({ ok });
  }

  // --- create an asset from an idea (or from scratch). Any team member. Starts in scripting. ---
  if (action === 'create_asset') {
    const title = (body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const format = asFormat(body.format);
    const asset = await insertStudioAsset({
      idea_id: body.idea_id || null,
      title,
      trade: (body.trade || '').trim() || null,
      format,
      promise: asPromise(body.promise),
      script: (body.script || '').trim() || null,
      scene: (body.scene || '').trim() || null,
      caption: (body.caption || '').trim() || null,
      platforms: defaultPlatforms(format),
      source_tag: (body.source_tag || '').trim() || null,
      storyboard: Array.isArray(body.storyboard) ? body.storyboard : [],
      state: 'scripting',
      created_by: me,
    });
    if (!asset) return NextResponse.json({ error: 'insert failed' }, { status: 503 });
    return NextResponse.json({ asset });
  }

  // --- draft a storyboard from an idea with Claude. Any team member. Lands in awaiting_approval. -
  if (action === 'draft') {
    let input: DraftInput;
    let ideaId: string | null = null;
    if (body.id) {
      const idea = await readStudioIdea(body.id);
      if (!idea) return NextResponse.json({ error: 'not found' }, { status: 404 });
      ideaId = idea.id;
      input = { title: idea.title, trade: idea.trade, format: idea.format, promise: idea.promise };
    } else {
      const title = (body.title || '').trim();
      if (!title) return NextResponse.json({ error: 'title or id required' }, { status: 400 });
      input = { title, trade: (body.trade || '').trim() || null, format: asFormat(body.format), promise: asPromise(body.promise) };
    }

    const draft = await draftStoryboard(input);
    if (!draft) return NextResponse.json({ error: 'draft failed' }, { status: 503 });

    const asset = await insertStudioAsset({
      idea_id: ideaId,
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
      created_by: me,
    });
    if (!asset) return NextResponse.json({ error: 'insert failed' }, { status: 503 });
    if (ideaId) await markIdeaPromoted(ideaId);
    return NextResponse.json({ asset });
  }

  // --- move a card one step forward. NOT through the publish gate: that needs a decision. ------
  if (action === 'advance') {
    if (!body.id || !body.to) return NextResponse.json({ error: 'id and to required' }, { status: 400 });
    const asset = await readStudioAsset(body.id);
    if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const to = body.to as AssetState;
    if (!isLegalAdvance(asset.state, to)) {
      return NextResponse.json({ error: 'illegal transition' }, { status: 400 });
    }
    if (isPublishGate(asset.state, to)) {
      // The publish gate is a decision, not a drag. Route it to the owner's approval.
      return NextResponse.json({ error: 'use a publish decision for this move' }, { status: 400 });
    }
    const updated = await setStudioAssetState(body.id, asset.state, to);
    if (!updated) return NextResponse.json({ error: 'already moved' }, { status: 409 });
    return NextResponse.json({ asset: updated });
  }

  // --- the gate. Record a decision. OWNER only. A publish approve also advances the card. ------
  if (action === 'decide') {
    if (!isOwner) return NextResponse.json({ error: 'owner only' }, { status: 403 });
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const kind = body.kind === 'promote' ? 'promote' : 'publish';
    const decision =
      body.decision === 'reject' ? 'reject' : body.decision === 'changes' ? 'changes' : 'approve';

    const asset = await readStudioAsset(body.id);
    if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const approval = await insertStudioApproval({
      asset_id: body.id,
      kind,
      decision,
      note: (body.note || '').trim() || null,
      spend_cap_pence: kind === 'promote' ? (body.spend_cap_pence ?? null) : null,
      decided_by: me,
    });
    if (!approval) return NextResponse.json({ error: 'insert failed' }, { status: 503 });

    // A publish approval is also the thing that moves the card out of the gate. A rejection or a
    // request for changes records the decision and leaves the card where it is, for a redraft.
    let updated = asset;
    if (kind === 'publish' && decision === 'approve' && asset.state === 'awaiting_approval') {
      const moved = await setStudioAssetState(body.id, 'awaiting_approval', 'scheduled');
      if (moved) updated = moved;
    }
    return NextResponse.json({ approval, asset: updated });
  }

  // --- type in the numbers a live post did. Any team member. Manual until a connector exists. --
  if (action === 'add_metric') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const platform = (body.platform || '') as Platform;
    if (!platform) return NextResponse.json({ error: 'platform required' }, { status: 400 });
    const metric = await insertStudioMetric({
      asset_id: body.id,
      platform,
      as_of: body.as_of || new Date().toISOString().slice(0, 10),
      reach: n(body.reach),
      saves: n(body.saves),
      shares: n(body.shares),
      clicks: n(body.clicks),
      trials: n(body.trials),
      entered_by: me,
    });
    if (!metric) return NextResponse.json({ error: 'insert failed' }, { status: 503 });
    return NextResponse.json({ metric });
  }

  // --- seed the bible content, once. OWNER only. Refuses if anything already exists. -----------
  if (action === 'seed') {
    if (!isOwner) return NextResponse.json({ error: 'owner only' }, { status: 403 });
    const count = await countStudioAssets();
    if (count === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
    if (count > 0) return NextResponse.json({ seeded: 0, skipped: true });

    let seeded = 0;
    for (const s of SEED_ASSETS) {
      const script = s.storyboard.map((f) => f.vo).filter(Boolean).join('\n') || null;
      const asset = await insertStudioAsset({
        idea_id: null,
        title: s.title,
        trade: s.trade,
        format: s.format,
        promise: s.promise,
        script,
        scene: s.scene,
        caption: s.caption,
        platforms: defaultPlatforms(s.format),
        source_tag: s.source_tag,
        storyboard: s.storyboard,
        state: 'awaiting_approval',
        created_by: me,
      });
      if (asset) seeded++;
    }

    // A small backlog so the Ideas tab shows the swap per trade idea from doc 111.
    const backlog = ['roofer', 'decorator', 'groundworker', 'tiler', 'plasterer'];
    for (const trade of backlog) {
      await insertStudioIdea({
        title: `The ${trade}: filing is the easy bit`,
        trade,
        format: 'video',
        promise: 'money',
        note: 'Swap the bible template onto this trade.',
        author: me,
      });
    }

    return NextResponse.json({ seeded });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
