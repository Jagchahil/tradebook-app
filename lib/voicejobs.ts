// THE VOICE-NOTE QUEUE, server side. A WhatsApp voice note cannot be transcribed by Claude, and we will
// not send our customers' audio to a third party. So the webhook parks the audio here; the Mac mini
// (which already runs the workforce) claims it, transcribes it LOCALLY with Whisper, and posts the text
// back. The audio lives only long enough to be transcribed, then it is wiped — a voice note is the most
// sensitive thing a customer sends, so it never rests on our disk longer than the one job needs.
//
// Self-contained REST via the service role, same posture as lib/todos.ts and lib/bridge.ts. RLS is on and
// there are no policies, so the anon/auth keys can never see the audio — only server code with the
// service role can. Kept out of the 200KB supabase.ts on purpose.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function base(): string {
  if (!URL || !SERVICE_KEY) throw new Error('Supabase env vars are missing.');
  return URL;
}
function h(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY as string,
    Authorization: `Bearer ${SERVICE_KEY as string}`,
    ...extra,
  };
}

export type VoiceJobStatus = 'pending' | 'processing' | 'done' | 'error';

export interface VoiceJobRow {
  id: string;
  user_id: string;
  from_phone: string;
  wa_message_id: string;
  audio_base64: string | null;
  mime_type: string;
  status: VoiceJobStatus;
  created_at: string;
}

// The webhook parks a voice note. Returns the new job id, or null on failure (the caller then tells the
// customer plainly that it could not take the note, rather than leaving them waiting on silence).
export interface NewVoiceJob {
  userId: string;
  fromPhone: string;
  messageId: string;
  audioBase64: string;
  mimeType: string;
}
export async function createVoiceJob(j: NewVoiceJob): Promise<string | null> {
  try {
    const res = await fetch(`${base()}/rest/v1/voice_jobs`, {
      method: 'POST',
      headers: h({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        user_id: j.userId,
        from_phone: j.fromPhone,
        wa_message_id: j.messageId,
        audio_base64: j.audioBase64,
        mime_type: j.mimeType,
        status: 'pending',
      }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

// The mini claims the oldest waiting note: flip the single oldest 'pending' row to 'processing' and get
// it back. PostgREST returns the updated rows, so the flip and the read are one request — two minis (or
// an overlapping run) can never grab the same note. Returns the job with its audio, or null if the queue
// is empty.
export async function claimNextVoiceJob(): Promise<VoiceJobRow | null> {
  try {
    // Find the oldest pending id first (PATCH cannot order), then claim it by id AND status so the flip
    // is still conditional — if another run claimed it in between, our PATCH matches nothing.
    const look = await fetch(
      `${base()}/rest/v1/voice_jobs?status=eq.pending&select=id&order=created_at.asc&limit=1`,
      { headers: h() },
    );
    if (!look.ok) return null;
    const ids = (await look.json()) as Array<{ id: string }>;
    const id = ids[0]?.id;
    if (!id) return null;
    const claim = await fetch(
      `${base()}/rest/v1/voice_jobs?id=eq.${encodeURIComponent(id)}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: h({ Prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'processing' }),
      },
    );
    if (!claim.ok) return null;
    const rows = (await claim.json()) as VoiceJobRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// Read one job (the complete endpoint checks it exists and is still ours to finish).
export async function getVoiceJob(id: string): Promise<VoiceJobRow | null> {
  try {
    const res = await fetch(`${base()}/rest/v1/voice_jobs?id=eq.${encodeURIComponent(id)}&select=*`, { headers: h() });
    if (!res.ok) return null;
    const rows = (await res.json()) as VoiceJobRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// Close a job and WIPE the audio the instant it is no longer needed. The transcript is not stored here
// either — it has already done its work (the parsed figures are in the ledger); keeping it would be the
// very "health record in a financial database" we refuse to create.
export async function finishVoiceJob(id: string, status: 'done' | 'error'): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/rest/v1/voice_jobs?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ audio_base64: null, status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Housekeeping: drop finished jobs, and rescue notes stuck 'processing' (a mini that died mid-note) back
// to 'pending' so they are retried. Fire-and-forget from the pending endpoint.
export async function sweepVoiceJobs(): Promise<void> {
  const cutoffDone = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoffStuck = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  try {
    void fetch(`${base()}/rest/v1/voice_jobs?status=in.(done,error)&created_at=lt.${encodeURIComponent(cutoffDone)}`, {
      method: 'DELETE',
      headers: h({ Prefer: 'return=minimal' }),
    }).catch(() => {});
    void fetch(`${base()}/rest/v1/voice_jobs?status=eq.processing&created_at=lt.${encodeURIComponent(cutoffStuck)}`, {
      method: 'PATCH',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status: 'pending' }),
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}
