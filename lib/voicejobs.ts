// THE VOICE-NOTE QUEUE, server side. A WhatsApp voice note cannot be transcribed by Claude, and we will
// not send our customers' audio to a third party. So the webhook parks the audio here; the Mac mini
// (which already runs the workforce) claims it, transcribes it LOCALLY with Whisper, and posts the text
// back. The audio lives only long enough to be transcribed, then it is wiped. A voice note is the most
// sensitive thing a customer sends, so it never rests on our disk longer than the one job needs.
//
// Self-contained REST via the service role, same posture as lib/todos.ts and lib/bridge.ts. RLS is on and
// there are no policies, so the anon/auth keys can never see the audio: only server code with the
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

// 🔴 THE APOLOGY, IN ONE PLACE. It was written out in app/api/voice/pending/route.ts and nowhere
// else, so the day a second door started reaping (the cron, 9 August 2026) there would have been two
// copies of the one sentence a customer reads when we have lost his voice note. Two copies is how
// two surfaces come to say different things about the same failure.
export const VOICE_REAPED_APOLOGY =
  'Sorry, I could not write up that voice note in time. Send it again, or a photo of the receipt, and I will get it.';

// A note not turned into an entry within this window is "stale": either the mini was down when it landed,
// or it died mid-transcription. Past this line the customer has waited too long, so we stop trying and
// apologise. Set beyond the worker's own 120s Whisper timeout so a legitimately long note is never reaped.
const STALE_MS = 3 * 60 * 1000;

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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 NULL MEANT TWO OPPOSITE THINGS AND THE CALLER COULD NOT TELL THEM APART. Fixed 9 Aug 2026.
//
// This returned `string | null`, and null was reached two ways:
//
//   1. THE INSERT WAS REFUSED (!res.ok). No row exists. Telling him to send it again is right.
//   2. THE INSERT SUCCEEDED AND READING THE ANSWER THREW. PostgREST answered 201, THE ROW IS THERE
//      AND THE AUDIO IS PARKED, and we apologised anyway. He records the note a second time, the
//      mini transcribes both, and he gets the same expense in his books twice.
//
// A duplicate entry in a man's tax records is a worse outcome than a wait, so the two are told
// apart and the ambiguous case is told the truth: it is in hand, do not send it again.
//
// ⚠️ AND IT BROKE A GUARANTEE ANOTHER FILE RELIES ON IN WRITING. handleVoiceNote in the
// WhatsApp route says "a throw can only ever happen before the queue write, so nothing is parked,
// and telling him to send it again cannot double count him". That was true of every line except
// this one, which caught its own post-write throw and returned the same null as a refusal.
//
// ⚠️ A FETCH THAT REJECTS IS 'unsure', NOT 'refused'. A connection that dies mid flight may
// have been delivered. The reaper apologises for a note that really was lost, so the cost of
// 'unsure' is a wait he is told about; the cost of guessing 'refused' is a duplicate in his books.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export type VoiceJobResult =
  | { kind: 'created'; id: string }
  | { kind: 'refused' }
  | { kind: 'unsure' };

export async function createVoiceJob(j: NewVoiceJob): Promise<VoiceJobResult> {
  let res: Response;
  try {
    res = await fetch(`${base()}/rest/v1/voice_jobs`, {
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
  } catch {
    // The request may or may not have landed. Never invite a resend on a maybe.
    return { kind: 'unsure' };
  }

  // The server answered and said no. Nothing was written, and this is the only branch that can
  // honestly ask him to send it again.
  if (!res.ok) return { kind: 'refused' };

  // Past here the row EXISTS. Everything that can still go wrong is our failure to read our own
  // answer, and none of it un-writes the audio.
  //
  // ⚠️ READ AS TEXT AND PARSE, never res.json(). Same reason lib/claude.ts stopped: a 2xx whose
  // body is not JSON makes res.json() throw, and a throw here used to become a refusal.
  try {
    const raw = await res.text();
    const rows = JSON.parse(raw) as Array<{ id?: string }>;
    const id = Array.isArray(rows) ? rows[0]?.id : undefined;
    return id ? { kind: 'created', id } : { kind: 'unsure' };
  } catch {
    return { kind: 'unsure' };
  }
}

// The mini claims the oldest waiting note: flip the single oldest 'pending' row to 'processing' and get
// it back. PostgREST returns the updated rows, so the flip and the read are one request, so two minis (or
// an overlapping run) can never grab the same note. Returns the job with its audio, or null if the queue
// is empty.
export async function claimNextVoiceJob(): Promise<VoiceJobRow | null> {
  try {
    // Find the oldest pending id first (PATCH cannot order), then claim it by id AND status so the flip
    // is still conditional: if another run claimed it in between, our PATCH matches nothing. Only claim
    // notes younger than the stale window: an older pending note means the mini was down when it arrived,
    // and a late confirmation is worse than an honest apology, so the reaper handles those instead.
    const freshCutoff = new Date(Date.now() - STALE_MS).toISOString();
    const look = await fetch(
      `${base()}/rest/v1/voice_jobs?status=eq.pending&created_at=gt.${encodeURIComponent(freshCutoff)}&select=id&order=created_at.asc&limit=1`,
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
// either, because it has already done its work (the parsed figures are in the ledger); keeping it would be the
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

// Reap notes that have gone stale (mini was down when they landed, or it died mid-transcription): flip
// them to 'error' and WIPE the audio in one atomic PATCH, and return who was waiting so the caller can
// send an honest apology. return=representation means we only ever get, and so only ever apologise for,
// the rows THIS call actually flipped, so two overlapping polls can never double-message a customer.
export async function reapStaleVoiceJobs(): Promise<Array<{ id: string; fromPhone: string }>> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  try {
    const res = await fetch(
      `${base()}/rest/v1/voice_jobs?status=in.(pending,processing)&created_at=lt.${encodeURIComponent(cutoff)}`,
      {
        method: 'PATCH',
        headers: h({ Prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'error', audio_base64: null }),
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as VoiceJobRow[];
    // Drop long-finished rows so the table stays small. Fire-and-forget.
    const cutoffDone = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    void fetch(`${base()}/rest/v1/voice_jobs?status=in.(done,error)&created_at=lt.${encodeURIComponent(cutoffDone)}`, {
      method: 'DELETE',
      headers: h({ Prefer: 'return=minimal' }),
    }).catch(() => {});
    return rows.map((r) => ({ id: r.id, fromPhone: r.from_phone }));
  } catch {
    return [];
  }
}
