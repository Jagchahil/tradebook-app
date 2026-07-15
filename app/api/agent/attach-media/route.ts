import { NextRequest, NextResponse } from 'next/server';
import { setStudioAssetMedia } from '../../../../lib/supabase';

export const runtime = 'nodejs';

// ATTACH A GENERATED VIDEO to an approved asset. The generation agent calls this once Higgsfield has
// produced the file, with the hosted URL.
//
// Secret gated. It only ever sets a file on an already approved asset, and only if that asset does
// not already have one (the guard is in setStudioAssetMedia). It does NOT post, does NOT advance to
// live, and does NOT spend. Generating the video and putting it in front of a customer are two
// different acts, and the second one still needs a human.
export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return NextResponse.json({ error: 'agent not configured' }, { status: 503 });
  if ((req.headers.get('x-agent-secret') || '') !== secret) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: { asset_id?: string; file_url?: string };
  try {
    body = (await req.json()) as { asset_id?: string; file_url?: string };
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const assetId = (body.asset_id || '').trim();
  const fileUrl = (body.file_url || '').trim();
  if (!assetId || !fileUrl) return NextResponse.json({ error: 'asset_id and file_url required' }, { status: 400 });
  // Only accept a real hosted URL. We store a reference, never a blob, and never a local path.
  if (!/^https:\/\//i.test(fileUrl)) return NextResponse.json({ error: 'file_url must be https' }, { status: 400 });

  const asset = await setStudioAssetMedia(assetId, fileUrl);
  if (!asset) {
    // Either the asset does not exist, or it already had a file (the guard held). Both are safe: we
    // tell the agent nothing changed so it moves on rather than retrying forever.
    return NextResponse.json({ updated: false });
  }
  return NextResponse.json({ updated: true, asset_id: asset.id });
}
