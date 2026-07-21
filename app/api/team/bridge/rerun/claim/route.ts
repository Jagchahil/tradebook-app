import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { claimRerun } from '../../../../../../lib/bridge';

export const runtime = 'nodejs';

// THE MINI CLAIMS A PENDING RE-RUN HERE. A bot on the mini calls this at the top of each run, carrying
// the shared secret (x-munshi-secret, constant-time compared to MUNSHI_SECRET). It returns { pending:
// true } exactly once per queued request and clears it, so the bot knows to sweep off-schedule. No
// customer data — only "was a re-check asked for". If MUNSHI_SECRET is unset, every call is refused.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function handle(req: NextRequest, worker: string): Promise<NextResponse> {
  const secret = process.env.MUNSHI_SECRET || '';
  const given = req.headers.get('x-munshi-secret') || '';
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const key = String(worker ?? '').slice(0, 40).trim();
  if (!key) return NextResponse.json({ error: 'worker required' }, { status: 400 });
  const pending = await claimRerun(key);
  return NextResponse.json({ pending });
}

export async function GET(req: NextRequest) {
  return handle(req, req.nextUrl.searchParams.get('worker') || '');
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { worker?: string };
  return handle(req, b.worker || req.nextUrl.searchParams.get('worker') || '');
}
