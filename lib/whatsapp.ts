// Meta WhatsApp Cloud API client. Every WhatsApp send and every media fetch goes
// through here. We talk to the Graph API directly, no third party wrapper.
//
// Env vars used:
//   WHATSAPP_TOKEN            access token from the Meta app
//   WHATSAPP_PHONE_NUMBER_ID  the number that sends replies
//   WHATSAPP_VERIFY_TOKEN     a string you choose, used for the webhook handshake
//   WHATSAPP_APP_SECRET       the Meta app secret, used to verify the signature

import crypto from 'crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

// Per-call timeout for outbound Graph API calls. Sends and media fetches are the
// last thing the webhook does in after(), so a hung Meta call must never pin a
// worker at volume. Each request aborts after this budget. On abort fetch throws
// an AbortError, so every call site here catches it and degrades to a safe result
// (null for a media download, a logged failure for a send).
const GRAPH_TIMEOUT_MS = 10000;

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

export function hasSendConfig(): boolean {
  return Boolean(TOKEN && PHONE_NUMBER_ID);
}

// The webhook handshake. Meta sends a GET with these query params when you set up
// the webhook. We echo the challenge back only if the token matches.
export function verifyWebhook(mode: string | null, token: string | null, challenge: string | null): string | null {
  if (mode === 'subscribe' && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

// Validate the x-hub-signature-256 header. Meta signs the raw request body with
// the app secret. We recompute it and compare in constant time. If this fails the
// request is not from Meta and must be rejected.
export function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!APP_SECRET) {
    // No secret configured. We cannot trust the request, so we treat it as invalid.
    return false;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected = signatureHeader.slice('sha256='.length);
  const computed = crypto.createHmac('sha256', APP_SECRET).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function appSecretConfigured(): boolean {
  return Boolean(APP_SECRET);
}

export interface MediaPayload {
  base64: string;
  mediaType: string;
}

// Two step download. First resolve the media id to a short lived URL, then fetch
// the bytes with the auth header.
export async function downloadMedia(mediaId: string): Promise<MediaPayload | null> {
  if (!TOKEN) return null;

  // A timeout aborts the fetch with an AbortError. Both Graph calls are wrapped so
  // a slow media host degrades to null rather than throwing out of the webhook.
  let metaRes: Response;
  try {
    metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[whatsapp] Media lookup failed or timed out:', message);
    return null;
  }
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  // Only ever follow the media URL if it is a Meta host, and only then send our
  // bearer token. If Graph ever returned an unexpected URL, this stops the token
  // leaking to a third party and stops a server side request forgery.
  let host = '';
  try {
    host = new URL(meta.url).hostname;
  } catch {
    return null;
  }
  const metaHost = /(^|\.)(fbcdn\.net|fbsbx\.com|facebook\.com|cdninstagram\.com)$/i.test(host);
  if (!metaHost) return null;

  let fileRes: Response;
  try {
    fileRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[whatsapp] Media download failed or timed out:', message);
    return null;
  }
  if (!fileRes.ok) return null;

  // Cap the size before pulling the bytes into memory and base64. A receipt
  // photo or a voice note is a few MB at most; anything bigger is a mistake or
  // an attack on the AI spend.
  const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
  const declared = Number(fileRes.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) return null;

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) return null;
  return {
    base64: buffer.toString('base64'),
    mediaType: meta.mime_type || 'image/jpeg',
  };
}

// --- Outbound transport, with retry ------------------------------------------
//
// EVERY send goes through this one function. It used to be five copies of the same fetch, each
// firing once and giving up, and that is the gap this closes.
//
// WHAT WENT WRONG WITHOUT IT. Meta throttles us in two ways: a per second ceiling on the Cloud
// API, and a messaging tier tied to our number's quality rating. Cross either and the Graph API
// answers 429. The old code logged that number and returned, and the message was gone: no retry,
// no queue, no record. One inbound burst, one backlog draining at once, one marketing push, and
// an arbitrary slice of users simply never get the reply they are waiting for, while our logs say
// only "Send failed: 429". Silent, uneven, and invisible, which is the failure mode this whole
// codebase is built to refuse.
//
// WHAT IT DOES NOW. On 429 or any 5xx, or on a network error or timeout, it waits and tries
// again, up to three attempts. The wait honours Meta's own Retry-After header when it sends one,
// otherwise it backs off exponentially with jitter so a whole page of workers cannot resynchronise
// and hammer the same second twice.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not retry a 4xx other than 429. A 400 (bad number,
// malformed template, outside the 24 hour window) is a real answer, not a blip; retrying it just
// spends the budget again to be told the same thing.
//
// This mirrors lib/bankfeed.ts's TrueLayer transport, which the same reasoning already made
// load bearing there.
const SEND_ATTEMPTS = 3;
const SEND_BACKOFF_BASE_MS = 400;
const SEND_BACKOFF_MAX_MS = 4000;

function backoffFor(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, SEND_BACKOFF_MAX_MS);
  }
  const exponential = Math.min(SEND_BACKOFF_BASE_MS * 2 ** attempt, SEND_BACKOFF_MAX_MS);
  return exponential / 2 + Math.random() * (exponential / 2); // full-ish jitter
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Post one message payload to the Graph API. Returns true only if Meta accepted it.
// `label` names the kind of send for the log line; the payload itself is NEVER logged, because
// it contains the recipient's number and the message body (CLAUDE.md: WhatsApp content goes to
// Supabase and nowhere else).
async function graphSend(label: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn(`[whatsapp] ${label} skipped. Token or phone number id missing.`);
    return false;
  }

  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt += 1) {
    const last = attempt === SEND_ATTEMPTS - 1;
    try {
      const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      });

      if (res.ok) return true;

      const transient = res.status === 429 || res.status >= 500;
      if (!transient || last) {
        // STATUS ONLY. Meta's Graph error body reflects the recipient wa_id (a phone number) and
        // can echo the message. Vercel logs are an external service.
        console.error(`[whatsapp] ${label} failed:`, res.status, last && transient ? '(gave up after retries)' : '');
        return false;
      }
      await sleep(backoffFor(attempt, res.headers.get('retry-after')));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      if (last) {
        console.error(`[whatsapp] ${label} failed or timed out:`, message, '(gave up after retries)');
        return false;
      }
      await sleep(backoffFor(attempt, null));
    }
  }
  return false;
}

// Send a plain text WhatsApp message back to the sender.
export async function sendText(toPhone: string, body: string): Promise<void> {
  await graphSend('Send', { to: toPhone, type: 'text', text: { body } });
}

// The same free-form in-window send, but it reports whether the message actually left. The support
// console needs an honest yes/no so it never marks a ticket answered when the send was rejected.
export async function sendTextResult(toPhone: string, body: string): Promise<boolean> {
  return graphSend('Send', { to: toPhone, type: 'text', text: { body } });
}

// Send an approved WhatsApp message template. Required for any proactive message
// sent outside the 24 hour customer service window, such as reminders. The
// template must be registered and approved in the Meta dashboard first. See
// docs/39 for the exact template definitions and variable order.
export async function sendTemplate(
  toPhone: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[] = [],
): Promise<void> {
  const components = bodyParams.length
    ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
    : [];

  await graphSend('Template send', {
    to: toPhone,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  });
}

// Send an interactive message with up to three quick reply buttons. Only valid
// inside the 24 hour customer service window (the user messaged first), which
// is exactly when the welcome flow runs. Button titles max 20 characters.
export async function sendButtons(
  toPhone: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  footer?: string,
): Promise<void> {
  await graphSend('Buttons send', {
    to: toPhone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  });
}

// Send an image by public URL with an optional caption. Used for the welcome
// brand card; in-session media needs no template.
export async function sendImageUrl(toPhone: string, link: string, caption?: string): Promise<void> {
  await graphSend('Image send', {
    to: toPhone,
    type: 'image',
    image: { link, ...(caption ? { caption } : {}) },
  });
}
