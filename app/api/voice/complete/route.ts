import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getVoiceJob, finishVoiceJob } from '../../../../lib/voicejobs';
import { finishVoiceEntry } from '../../../../lib/voiceflow';

export const runtime = 'nodejs';
export const maxDuration = 60;

// THE MINI POSTS THE TRANSCRIPT BACK HERE. Secret-gated (x-munshi-secret vs MUNSHI_SECRET), same as the
// pending door. We turn the words into a ledger entry and confirm to the customer, then WIPE the audio.
// The transcript is used once, in memory, and never written down. If MUNSHI_SECRET is unset, refused.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const secret = process.env.MUNSHI_SECRET || '';
  const given = req.headers.get('x-munshi-secret') || '';
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const b = (await req.json().catch(() => ({}))) as { id?: string; transcript?: string; error?: boolean };
  const id = String(b.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const job = await getVoiceJob(id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });
  // Already finished (a retry, or the sweep rescued and someone else did it) — accept quietly, no double
  // entry and no second message to the customer.
  if (job.status === 'done' || job.status === 'error') return NextResponse.json({ ok: true, already: true });

  try {
    // The mini flags transcription failure (whisper errored or produced nothing) with error:true; treat
    // that as a blank transcript so the customer gets the honest "could not make it out" reply.
    const transcript = b.error ? '' : String(b.transcript ?? '');
    const outcome = await finishVoiceEntry(job.user_id, job.wa_message_id, job.from_phone, transcript);
    await finishVoiceJob(id, 'done');
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    await finishVoiceJob(id, 'error');
    return NextResponse.json({ error: 'processing failed', detail: String(e).slice(0, 120) }, { status: 500 });
  }
}
