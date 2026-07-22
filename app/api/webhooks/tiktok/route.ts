import { NextRequest, NextResponse } from 'next/server';
import { verifyTikTokWebhook } from '../../../../lib/connectors';

export const runtime = 'nodejs';

// THE TIKTOK WEBHOOK. TikTok does not sign the body the way Meta does, so the scaffold gate is a
// shared secret we set on both sides, sent in x-lekhio-webhook-secret. GET may carry a challenge on
// setup, which we echo. POST is acknowledged after the secret checks out. Event handling is a later
// increment. We never log the body.
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('challenge');
  return challenge ? new NextResponse(challenge, { status: 200 }) : NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (!verifyTikTokWebhook(req.headers.get('x-lekhio-webhook-secret'))) {
    return new NextResponse('Invalid', { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
