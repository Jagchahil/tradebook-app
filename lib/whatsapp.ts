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

  const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!fileRes.ok) return null;

  const buffer = Buffer.from(await fileRes.arrayBuffer());
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

  const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'text',
      text: { body },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[whatsapp] Send failed:', res.status, text);
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

  const res = await fetch(`${GRAPH}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'template',
      template: { name: templateName, language: { code: languageCode }, components },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[whatsapp] Template send failed:', res.status, text);
  }
}
