import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { reapStaleVoiceJobs, VOICE_REAPED_APOLOGY } from '../../../../lib/voicejobs';
import { cronStarted, cronFinished } from '../../../../lib/supabase';
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
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IT REPORTS TO THE WATCHDOG, AND FOR THE FIRST DAY OF ITS LIFE IT DID NOT. Fixed 9 Aug 2026,
// found in a walkthrough audit the same evening it shipped.
//
// lib/cronwatch.ts states the rule in capitals: A CRON THAT IS NOT IN THIS MAP IS A CRON NOBODY IS
// WATCHING. This route was written, wired into both daily slots, and registered nowhere, so it
// wrote no cronStarted, no cronFinished, and had no entry in MAX_QUIET_HOURS.
//
// ⚠️ AND THE THING IT GUARDS IS THE THING THAT GOES QUIET. Read the block above: if this stops, a
// man who was told "writing it up now" is never told anything else, AND HIS AUDIO STAYS ON OUR
// DISK. The privacy policy promises "the audio is deleted the moment it has been read" and the data
// inventory promises it is "wiped as soon as it is transcribed". A reaper nobody watches is those
// two sentences quietly becoming untrue, with /api/health green the whole time.
//
// A job whose failure mode is an unkept privacy promise is the last job that should be unwatched.
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

  await cronStarted('voicereap');

  let stale: Awaited<ReturnType<typeof reapStaleVoiceJobs>>;
  try {
    stale = await reapStaleVoiceJobs();
  } catch (err) {
    // ⚠️ A THROW HAS TO REACH THE WATCHDOG BEFORE IT REACHES THE SCHEDULER. Without this the run
    // shows as started and never finished, which cronwatch reads as never_finished, but only after
    // the quiet window has elapsed. Saying so now is the difference between an alarm tonight and an
    // alarm the day after tomorrow.
    await cronFinished('voicereap', false, 0, err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'reap failed' }, { status: 500 });
  }

  // 🔴 FINISHED IS WRITTEN BEFORE THE APOLOGIES, NOT AFTER. The reap itself is the job: the rows are
  // already flipped and the audio is already wiped by the time this line runs. The sends happen in
  // after(), outside the response, and a WhatsApp outage must not mark a run that did its actual
  // work as failed, because a false alarm every time Meta wobbles is an alarm nobody reads.
  await cronFinished('voicereap', true, stale.length);

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
