// Speech to text for WhatsApp voice notes.
//
// Claude does not transcribe audio, so this is the one place Lekhio uses a
// non Anthropic service. It is isolated here on purpose. To swap providers,
// change only this file. Everything else calls transcribeAudio and does not care
// who does the work.
//
// Default provider: OpenAI Whisper. Env var: OPENAI_API_KEY.
// It returns null when no key is set, so the webhook degrades gracefully and the
// user gets a friendly "voice coming soon" reply instead of an error.

const OPENAI_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'whisper-1';

const KEY = process.env.OPENAI_API_KEY;

export function hasTranscribeConfig(): boolean {
  return Boolean(KEY);
}

function filenameFor(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'voice.ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'voice.m4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'voice.mp3';
  if (mimeType.includes('wav')) return 'voice.wav';
  if (mimeType.includes('webm')) return 'voice.webm';
  return 'voice.ogg';
}

export async function transcribeAudio(base64: string, mimeType: string): Promise<string | null> {
  if (!KEY) return null;

  try {
    const bytes = Buffer.from(base64, 'base64');
    const blob = new Blob([bytes], { type: mimeType || 'audio/ogg' });

    const form = new FormData();
    form.append('file', blob, filenameFor(mimeType));
    form.append('model', MODEL);
    form.append('language', 'en');

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[transcribe] Failed:', res.status, text);
      return null;
    }

    const data = (await res.json()) as { text?: string };
    const text = (data.text ?? '').trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[transcribe] Exception:', message);
    return null;
  }
}
