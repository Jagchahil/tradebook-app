import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { reapStaleVoiceJobs, VOICE_REAPED_APOLOGY } from '../../../../lib/voicejobs';
import { sendText } from '../../../../lib/whatsapp';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE VOICE NOTE REAPER, ON A CLOCK, BECAUSE IT USED TO SIT BEHIND A DOOR ONLY THE MINI OPENS.
//
// reapStaleVoiceJobs was called from exactly one place: /api/voice/pending, the endpoint the Mac
// mini polls to claim work. That is a perfectly good place for it WHEN THE MINI IS UP, and the
// webhook's liveness check means it usually is.
//
// ⚠️ IT IS THE WRONG PLACE FOR THE VERY CASE THE REAPER EXISTS FOR. The reaper's whole job is to
// apologise for notes the mini did not get to, and the commonest reason it did not get to them is
// that THE MINI WAS DOWN. A mini that is down is not polling, so nothing reaped, and:
//
//   1. A man who was told "Got your voice note. Writing it up now, one sec." was never told
//      anything else. He is still waiting.
//   2. HIS AUDIO STAYED ON OUR DISK. lib/voicejobs.ts opens by promising the opposite: "a voice
//      note is the most sensitive thing a customer sends, so it never rests on our disk longer
//      than the one job needs." A pending row nobody reaps keeps its audio_base64 for ever.
//
// So the same function is now also reached by a clock that does not care whether the mini is
// plugged in. Twice a day is a long way from the three minute staleness window, and it is the
// whole difference between a bounded wait and never.
//
// ⚠️ THE SENTENCE IS NOT WRITTEN HERE. VOICE_REAPED_APOLOGY lives with the queue, so this door and
// /api/voice/pending cannot come to say different things about the same lost note.
//
// ⚠️ AND REAPING IS IDEMPOTENT BY CONSTRUCTION. reapStaleVoiceJobs flips the rows it returns, so
// two doors racing cannot apologise twice for one note: whichever gets there first is the one that
// gets the row back.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Header only and timing safe, identical to every other cron route on purpose: one way in, one
// thing to rotate. Not configured means CLOSED.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const stale = await reapStaleVoiceJobs();

  // Acknowledged first, apologies sent after, so a slow WhatsApp send never holds the scheduler and
  // never turns one failed message into a failed run.
  after(async () => {
    for (const s of stale) {
      try {
        await sendText(s.fromPhone, VOICE_REAPED_APOLOGY);
      } catch (err) {
        // The name only, never the message: Graph's error bodies reflect the recipient's wa_id and
        // Vercel logs are an external service.
        console.error('[cron/voicereap] apology failed:', err instanceof Error ? err.name : 'unknown');
      }
    }
  });

  return NextResponse.json({ ok: true, reaped: stale.length });
}
