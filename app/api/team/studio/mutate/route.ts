import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  readTeamMember,
  insertStudioAsset,
  readStudioAsset,
  setStudioAssetState,
  readStudioAssets,
  setStudioAssetScheduled,
  setStudioAssetMedia,
  insertStudioApproval,
  insertStudioMetric,
} from '../../../../../lib/supabase';
import { isTeam } from '../../../../../lib/team';
import {
  defaultPlatforms, isLegalAdvance, isPublishGate,
  type Format, type Promise3, type AssetState, type Platform, type Storyboard,
} from '../../../../../lib/studio';
import { nextFreeSlot } from '../../../../../lib/calendar';

export const runtime = 'nodejs';

// EVERY WRITE HOKA'S DESK MAKES GOES THROUGH HERE, and every one is gated. One route, one switch, so
// there is one place that answers "who is allowed to do this". Reading is open to any team member.
// The thing that matters, approving, is OWNER only, checked against the team_members row on this
// request. The client cannot vote itself into the owner chair.
//
// 🔴 31 JUL 2026: THE IDEAS BANK AND THE AI DRAFTING ARE GONE. Marketing is made by hand.
// The actions that used to live here and no longer do:
//   add_idea, vote_idea  the founder led ideas bank, now nothing
//   draft                Claude turning an idea into a storyboard (lib/studioagent.ts, deleted)
//   seed                 the bible storyboards planted into an empty room (SEED_ASSETS, deleted)
// Nothing in this file writes a word of copy. A piece exists because a person wrote it, and the only
// machine left is the one that moves it forward and books it a slot.
interface Body {
  action?: string;
  id?: string;
  title?: string;
  trade?: string | null;
  format?: string;
  promise?: string;
  note?: string | null;
  script?: string | null;
  scene?: string | null;
  caption?: string | null;
  source_tag?: string | null;
  file_url?: string | null;
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

  // --- write a piece down. Any team member. Starts in scripting, which is a person, writing. -----
  if (action === 'create_asset') {
    const title = (body.title || '').trim();
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    const format = asFormat(body.format);
    const asset = await insertStudioAsset({
      idea_id: null,
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

  // --- paste in the finished file. Any team member. Something he made, by hand. ----------------
  //
  // This replaced the render queue on 31 Jul. It refuses anything that is not real https, and the
  // `file_url=is.null` guard in setStudioAssetMedia means a second paste cannot overwrite the first
  // by accident. Having the file is not posting it: the state does not move here.
  if (action === 'set_media') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const raw = (body.file_url || '').trim();
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return NextResponse.json({ error: 'that is not a link' }, { status: 400 });
    }
    if (url.protocol !== 'https:') return NextResponse.json({ error: 'the link has to be https' }, { status: 400 });
    const asset = await setStudioAssetMedia(body.id, url.toString());
    if (!asset) return NextResponse.json({ error: 'nothing changed. It may already have a file.' }, { status: 409 });
    return NextResponse.json({ asset });
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
    // request for changes records the decision and leaves the card where it is, for a rewrite.
    let updated = asset;
    if (kind === 'publish' && decision === 'approve' && asset.state === 'awaiting_approval') {
      // Book it onto the go live calendar as we approve it. Read what is already scheduled so the new
      // post lands on the next free slot, not on top of one already there.
      const all = await readStudioAssets();
      const taken = (all || [])
        .filter((x) => x.state === 'scheduled' && x.scheduled_for)
        .map((x) => x.scheduled_for as string);
      const when = nextFreeSlot(taken, new Date().toISOString());
      const moved = await setStudioAssetScheduled(body.id, when);
      if (moved) updated = moved;
    }
    return NextResponse.json({ approval, asset: updated });
  }

  // --- type in the numbers a live post did. Any team member. Manual, and staying manual. -------
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

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
