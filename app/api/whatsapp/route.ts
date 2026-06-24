import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhook,
  isValidSignature,
  appSecretConfigured,
  downloadMedia,
  sendText,
} from '../../../lib/whatsapp';
import { parseReceipt, hasClaudeConfig } from '../../../lib/claude';
import {
  findUserIdByPhone,
  transactionExists,
  insertTransaction,
} from '../../../lib/supabase';

// We never log message text or media. Only ids and status, per the data rules.

// --- GET. The webhook verification handshake. -----------------------------
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const challenge = verifyWebhook(
    params.get('hub.mode'),
    params.get('hub.verify_token'),
    params.get('hub.challenge'),
  );

  if (challenge !== null) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// --- POST. Incoming messages. ---------------------------------------------
// Meta needs a 200 within 5 seconds or it retries. We verify the signature,
// then always answer 200 for genuine Meta traffic so we are not retried into
// duplicate work. The message id keeps us idempotent as a second guard.
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // 1. Reject anything not signed by Meta. This is required on every webhook.
  if (!isValidSignature(raw, req.headers.get('x-hub-signature-256'))) {
    if (!appSecretConfigured()) {
      console.error('[whatsapp] WHATSAPP_APP_SECRET is not set. Cannot verify requests.');
    }
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    const message = firstMessage(body);

    // No message in this event. It may be a delivery status. Acknowledge and stop.
    if (!message) {
      return NextResponse.json({ ok: true });
    }

    const from = message.from;
    const messageId = message.id;

    // Idempotency guard. If we already handled this message, do nothing.
    if (messageId && (await transactionExists(messageId))) {
      return NextResponse.json({ ok: true });
    }

    if (message.type === 'image' && message.image?.id) {
      await handleReceiptImage(from, messageId, message.image.id);
    } else {
      await sendText(
        from,
        'Send a photo of a receipt and I will log it for you. Voice notes are coming soon.',
      );
    }
  } catch (err) {
    // Never throw back to Meta. Log and acknowledge so we are not retried.
    const messageText = err instanceof Error ? err.message : 'unknown error';
    console.error('[whatsapp] Handler error:', messageText);
  }

  return NextResponse.json({ ok: true });
}

async function handleReceiptImage(from: string, messageId: string, mediaId: string): Promise<void> {
  // Find the TradeBook account for this number first. No point parsing if there
  // is nobody to attach it to.
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(
      from,
      'We could not find your TradeBook account for this number. Open the app, add your number, then send the receipt again.',
    );
    return;
  }

  if (!hasClaudeConfig()) {
    await sendText(from, 'Receipt reading is not switched on yet. Hang tight, it is coming very soon.');
    return;
  }

  const media = await downloadMedia(mediaId);
  if (!media) {
    await sendText(from, 'I could not open that image. Try sending the photo again.');
    return;
  }

  const parsed = await parseReceipt(media.base64, media.mediaType);
  if (!parsed) {
    await sendText(from, 'I could not read that receipt. Try a clearer photo with the total showing.');
    return;
  }

  await insertTransaction({
    user_id: userId,
    merchant_name: parsed.merchant_name,
    amount: parsed.amount,
    category: parsed.category,
    transaction_type: parsed.transaction_type,
    raw_whatsapp_message_id: messageId,
  });

  const amountText = `£${parsed.amount.toFixed(2)}`;
  await sendText(
    from,
    `Logged. ${parsed.merchant_name} for ${amountText}. Filed under ${parsed.category}. It is in your TradeBook.`,
  );
}

// --- Shapes of the bits of the webhook payload we read. -------------------
interface IncomingMessage {
  from: string;
  id: string;
  type: string;
  image?: { id: string };
}

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: IncomingMessage[];
      };
    }>;
  }>;
}

function firstMessage(body: WebhookBody): IncomingMessage | null {
  return body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? null;
}
