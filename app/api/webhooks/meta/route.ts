import { NextRequest, NextResponse } from 'next/server';
import { verifyMetaWebhook, verifyMetaSignature } from '../../../../lib/connectors';

export const runtime = 'nodejs';

// THE META WEBHOOK (Facebook and Instagram for the marketing app). Same shape as the WhatsApp
// webhook. GET is the setup handshake: echo the challenge only on a verify token match. POST must be
// signed by Meta with the app secret, checked in constant time, or it is rejected.
//
// Scaffold: we verify and acknowledge inside Meta's window. Acting on events (ad status changes, IG
// comments) is a later increment. We never log the body, it can carry user content.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const challenge = verifyMetaWebhook(p.get('hub.mode'), p.get('hub.verify_token'), p.get('hub.challenge'));
  if (challenge !== null) return new NextResponse(challenge, { status: 200 });
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Invalid signature', { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
