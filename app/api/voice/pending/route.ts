import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { claimNextVoiceJob, sweepVoiceJobs } from '../../../../lib/voicejobs';

export const runtime = 'nodejs';

// THE MINI CLAIMS THE NEXT VOICE NOTE HERE. The voice worker on the mini polls this, carrying the shared
// secret (x-munshi-secret, constant-time compared to MUNSHI_SECRET). It returns ONE waiting note with its
// audio, already flipped to 'processing' so no other run can grab it, or { job: null } when the queue is
// empty. This is the only door the raw audio ever comes out of, and only the secret-holding mini can open
// it. If MUNSHI_SECRET is unset, every call is refused.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const secret = process.env.MUNSHI_SECRET || '';
  const given = req.headers.get('x-munshi-secret') || '';
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Housekeeping: rescue notes stuck on a mini that died, and drop old finished rows. Fire-and-forget.
  void sweepVoiceJobs();

  const job = await claimNextVoiceJob();
  if (!job) return NextResponse.json({ job: null });
  return NextResponse.json({
    job: { id: job.id, audioBase64: job.audio_base64, mimeType: job.mime_type },
  });
}
