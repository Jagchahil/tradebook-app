import { NextRequest, NextResponse } from 'next/server';
import { draftInvoice, hasClaudeConfig } from '../../../lib/claude';
import { rateLimited, clientIp } from '../../../lib/ratelimit';
import { bumpAiUsage } from '../../../lib/supabase';

// A durable daily ceiling on total drafting spend, so even if the per-IP limit is
// dodged with spoofed X-Forwarded-For, the wallet is still safe.
const DRAFT_GLOBAL_DAILY = Number(process.env.DRAFT_GLOBAL_DAILY || 500);
// A durable per-IP daily cap, the real backstop the in-memory burst limit cannot
// give across serverless instances. Keyed in the same ai_usage table.
const DRAFT_IP_DAILY = Number(process.env.DRAFT_IP_DAILY || 40);

// Native apps ignore CORS, so we only need to allow our own web origin (the
// invoice-generator page), not the whole internet. Lock it down accordingly.
const ALLOW_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://tradebook-app-five.vercel.app';
const CORS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    // Protect the AI spend from a flood from one source.
    if (rateLimited(`draft:${clientIp(req)}`, 20, 5 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Give it a moment.' }, { status: 429, headers: CORS });
    }
    if (!hasClaudeConfig()) {
      return NextResponse.json({ error: 'Drafting is not switched on yet.' }, { status: 503, headers: CORS });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: CORS });
    }

    const description = (body as { description?: unknown }).description;
    if (typeof description !== 'string' || description.trim().length < 3 || description.length > 2000) {
      return NextResponse.json({ error: 'Tell me a bit about the job.' }, { status: 400, headers: CORS });
    }

    // Durable per-IP daily cap (holds across serverless instances, unlike the
    // in-memory burst limit). Fail closed if the counter is unavailable.
    const ipCount = await bumpAiUsage('draft:ip', clientIp(req));
    if (ipCount === null || ipCount > DRAFT_IP_DAILY) {
      return NextResponse.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429, headers: CORS });
    }

    // Durable global ceiling. Fail closed if the counter is unavailable.
    const globalCount = await bumpAiUsage('draft:global', 'all');
    if (globalCount === null || globalCount > DRAFT_GLOBAL_DAILY) {
      return NextResponse.json({ error: 'Drafting is busy right now. Try again shortly.' }, { status: 503, headers: CORS });
    }

    const drafted = await draftInvoice(description.trim());
    if (!drafted) {
      return NextResponse.json({ error: 'Could not draft that.' }, { status: 502, headers: CORS });
    }

    return NextResponse.json(drafted, { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[draft-invoice] Exception:', message);
    return NextResponse.json({ error: 'Failed to draft.' }, { status: 500, headers: CORS });
  }
}
