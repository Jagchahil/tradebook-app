import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { claimNextVoiceJob, reapStaleVoiceJobs, VOICE_REAPED_APOLOGY } from '../../../../lib/voicejobs';
import { sendText } from '../../../../lib/whatsapp';

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

  // First, reap any note that has gone stale (mini was down when it arrived, or died mid-transcription):
  // apologise to the customer so they are never left on a silent "writing it up now". This runs whenever
  // the mini is polling, which, thanks to the webhook's liveness check, is exactly when there is anyone
  // to say sorry to. Kept off the response path: the mini gets its job without waiting on the apologies.
  //
  // \u26a0\ufe0f THIS IS NO LONGER THE ONLY DOOR THAT REAPS. /api/cron/voicereap runs on a clock,
  // because the commonest reason a note goes stale is that the mini was down, and a mini that is
  // down is not polling this. The sentence lives with the queue so the two doors cannot drift.
  const stale = await reapStaleVoiceJobs();
  for (const s of stale) {
    void sendText(s.fromPhone, VOICE_REAPED_APOLOGY);
  }

  const job = await claimNextVoiceJob();
  if (!job) return NextResponse.json({ job: null });
  return NextResponse.json({
    job: { id: job.id, audioBase64: job.audio_base64, mimeType: job.mime_type },
  });
}
