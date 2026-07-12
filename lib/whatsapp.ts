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

// Send a plain text WhatsApp message back to the sender.
export async function sendText(toPhone: string, body: string): Promise<void> {
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[whatsapp] Send skipped. Token or phone number id missing.');
    return;
  }

  // A timeout aborts the fetch with an AbortError. The send is wrapped so a hung
  // Graph call is logged and swallowed rather than rejecting out of the webhook.
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[whatsapp] Send failed or timed out:', message);
    return;
  }

  if (!res.ok) {
    // STATUS ONLY. Meta's Graph error body reflects the recipient wa_id (a phone number) and can
    // echo the message. Vercel logs are an external service, and CLAUDE.md forbids sending
    // WhatsApp content anywhere but Supabase.
    console.error('[whatsapp] Send failed:', res.status);
  }
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
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[whatsapp] Template send skipped. Token or phone number id missing.');
    return;
  }

  const components = bodyParams.length
    ? [{ type: 'body', parameters: bodyParams.map((t) => ({ type: 'text', text: t })) }]
    : [];

  // A timeout aborts the fetch with an AbortError. The send is wrapped so a hung
  // Graph call is logged and swallowed rather than rejecting out of the caller.
  let res: Response;
  try {
    res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: { name: templateName, language: { code: languageCode }, components },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[whatsapp] Template send failed or timed out:', message);
    return;
  }

  if (!res.ok) {
    console.error('[whatsapp] Template send failed:', res.status); // status only, see above
  }
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
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[whatsapp] Send skipped. Token or phone number id missing.');
    return;
  }
  try {
    const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
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
      }),
    });
    // STATUS ONLY. The Graph error body reflects the recipient wa_id, which is a phone number,
    // and Vercel logs are an external service.
    if (!res.ok) console.error('[whatsapp] Buttons send failed:', res.status);
  } catch (err) {
    console.error('[whatsapp] Buttons send failed or timed out:', err instanceof Error ? err.message : err);
  }
}

// Send an image by public URL with an optional caption. Used for the welcome
// brand card; in-session media needs no template.
export async function sendImageUrl(toPhone: string, link: string, caption?: string): Promise<void> {
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn('[whatsapp] Send skipped. Token or phone number id missing.');
    return;
  }
  try {
    const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'image',
        image: { link, ...(caption ? { caption } : {}) },
      }),
    });
    if (!res.ok) console.error('[whatsapp] Image send failed:', res.status); // status only, see above
  } catch (err) {
    console.error('[whatsapp] Image send failed or timed out:', err instanceof Error ? err.message : err);
  }
}
