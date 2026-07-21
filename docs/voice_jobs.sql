-- voice_jobs — the WhatsApp voice-note transcription queue.
-- The webhook parks a note here (audio + who it's from). The Mac mini claims it, transcribes locally with
-- Whisper, posts the text back to /api/voice/complete, and the audio is wiped. Service-role ONLY: RLS on,
-- no policies, so the anon/auth keys can never read a customer's audio. Same posture as worker_heartbeats.

create table if not exists public.voice_jobs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  from_phone    text not null,
  wa_message_id text not null,
  audio_base64  text,                 -- wiped (set null) the moment the note is transcribed
  mime_type     text not null default 'audio/ogg',
  status        text not null default 'pending',   -- pending | processing | done | error
  created_at    timestamptz not null default now()
);

-- The mini asks for the oldest pending note constantly; keep that lookup cheap.
create index if not exists voice_jobs_pending_idx on public.voice_jobs (status, created_at);

alter table public.voice_jobs enable row level security;
-- No policies on purpose: only the service role (server-side) may read or write the audio.

comment on table public.voice_jobs is
  'WhatsApp voice-note queue. Audio parked by the webhook, transcribed locally on the mini, then wiped. Service-role only.';
