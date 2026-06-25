import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhook,
  isValidSignature,
  appSecretConfigured,
  downloadMedia,
  sendText,
} from '../../../lib/whatsapp';
import { parseReceipt, parseSpokenTransaction, draftInvoice, hasClaudeConfig } from '../../../lib/claude';
import { transcribeAudio, hasTranscribeConfig } from '../../../lib/transcribe';
import {
  findUserIdByPhone,
  transactionExists,
  insertTransaction,
  getSession,
  setSession,
  clearSession,
  createInvoice,
} from '../../../lib/supabase';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';

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
    } else if (message.type === 'audio' && message.audio?.id) {
      await handleVoiceNote(from, messageId, message.audio.id);
    } else if (message.type === 'text' && message.text?.body) {
      // Invoice flow takes priority. If it consumes the message, do not also log it.
      const handled = await handleInvoiceFlow(from, message.text.body);
      if (!handled) {
        await handleTextEntry(from, messageId, message.text.body);
      }
    } else {
      await sendText(
        from,
        'Send a photo of a receipt, a voice note, or just type what you spent or got paid, and I will log it.',
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
  // Find the Lekhio account for this number first. No point parsing if there
  // is nobody to attach it to.
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(
      from,
      'We could not find your Lekhio account for this number. Open the app, add your number, then send the receipt again.',
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
    vendor: parsed.merchant_name,
    // Receipts are an expense, so we store the amount as a negative number.
    // The app reads income vs expense from this sign.
    amount: -Math.abs(parsed.amount),
    category: parsed.category,
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: 'whatsapp_image',
    // Captured but not yet confirmed by the user. They approve before it counts
    // toward anything sent to HMRC.
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });

  const amountText = `£${parsed.amount.toFixed(2)}`;
  await sendText(
    from,
    `Logged. ${parsed.merchant_name} for ${amountText}. Filed under ${parsed.category}. It is in your Lekhio.`,
  );
}

async function handleVoiceNote(from: string, messageId: string, mediaId: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(
      from,
      'We could not find your Lekhio account for this number. Open the app, add your number, then send the voice note again.',
    );
    return;
  }

  if (!hasTranscribeConfig() || !hasClaudeConfig()) {
    await sendText(from, 'Voice notes are not switched on yet. Send a photo of the receipt for now.');
    return;
  }

  const media = await downloadMedia(mediaId);
  if (!media) {
    await sendText(from, 'I could not open that voice note. Try sending it again.');
    return;
  }

  const transcript = await transcribeAudio(media.base64, media.mediaType);
  if (!transcript) {
    await sendText(from, 'I could not make out that voice note. Try saying it again, nice and clear.');
    return;
  }

  const parsed = await parseSpokenTransaction(transcript);
  if (!parsed || parsed.amount <= 0) {
    await sendText(
      from,
      'I heard you, but I could not catch the amount. Try again, for example "forty quid of diesel at the BP".',
    );
    return;
  }

  await saveEntry(userId, messageId, parsed, 'whatsapp_voice', transcript);
  await sendText(from, confirmationLine(parsed));
}

async function handleTextEntry(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(
      from,
      'We could not find your Lekhio account for this number. Open the app, add your number, then send it again.',
    );
    return;
  }

  if (!hasClaudeConfig()) {
    await sendText(from, 'I am not switched on yet. Hang tight, it is coming very soon.');
    return;
  }

  const parsed = await parseSpokenTransaction(body);
  if (!parsed || parsed.amount <= 0) {
    await sendText(
      from,
      'Tell me what you spent or got paid and how much, for example "spent £40 on diesel" or "got paid £500 by Dave".',
    );
    return;
  }

  await saveEntry(userId, messageId, parsed, 'whatsapp_text', body);
  await sendText(from, confirmationLine(parsed));
}

// Shared insert for voice and text entries. Income is stored positive, an
// expense is stored negative, so the app reads the direction from the sign.
async function saveEntry(
  userId: string,
  messageId: string,
  parsed: { merchant_name: string; amount: number; category: string; direction: 'income' | 'expense' },
  sourceType: string,
  rawText: string,
): Promise<void> {
  const magnitude = Math.abs(parsed.amount);
  await insertTransaction({
    user_id: userId,
    vendor: parsed.merchant_name,
    amount: parsed.direction === 'income' ? magnitude : -magnitude,
    category: parsed.category,
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: sourceType,
    description: rawText.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
}

function confirmationLine(parsed: {
  merchant_name: string;
  amount: number;
  category: string;
  direction: 'income' | 'expense';
}): string {
  const amountText = `£${Math.abs(parsed.amount).toFixed(2)}`;
  if (parsed.direction === 'income') {
    return `Got it. Income of ${amountText} from ${parsed.merchant_name}. Check it in the app and confirm.`;
  }
  return `Got it. ${parsed.merchant_name} for ${amountText}. Filed under ${parsed.category}. Check it in the app and confirm.`;
}

// --- Guided invoice flow over WhatsApp ------------------------------------
// "create invoice" starts it. Then we ask for the customer, their contact, and
// the work, and build a real invoice with a shareable link. Returns true if the
// message was part of an invoice conversation (so it is not also logged as an
// expense), false otherwise.
const INVOICE_TRIGGER = /^\s*(create|new|make|raise|start)?\s*invoice\b/i;
const CANCEL = /^\s*(cancel|stop|quit|nevermind|never mind)\s*$/i;

async function handleInvoiceFlow(from: string, body: string): Promise<boolean> {
  const session = await getSession(from);
  const isTrigger = INVOICE_TRIGGER.test(body);

  // Not in a flow and not starting one. Let normal handling take it.
  if (!session && !isTrigger) return false;

  if (CANCEL.test(body)) {
    await clearSession(from);
    await sendText(from, 'No problem, I have cancelled that invoice.');
    return true;
  }

  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await clearSession(from);
    await sendText(
      from,
      'We could not find your Lekhio account for this number. Open the app, add your number, then try again.',
    );
    return true;
  }

  // Start (or restart) the flow.
  if (!session || (isTrigger && session.flow !== 'invoice')) {
    await setSession(from, 'invoice', 'customer', {});
    await sendText(from, "Let's make an invoice. Who is it for? Just their name.");
    return true;
  }

  const data = (session.data ?? {}) as { customer_name?: string; customer_contact?: string | null };

  if (session.step === 'customer') {
    data.customer_name = body.trim().slice(0, 120);
    await setSession(from, 'invoice', 'contact', data);
    await sendText(from, "Their email or mobile to send it to? Type skip if you will send it yourself.");
    return true;
  }

  if (session.step === 'contact') {
    const c = body.trim();
    data.customer_contact = /^skip$/i.test(c) ? null : c.slice(0, 160);
    await setSession(from, 'invoice', 'items', data);
    await sendText(from, "What is the work and the amount? For example: bathroom rewire 450, materials 80.");
    return true;
  }

  if (session.step === 'items') {
    if (!hasClaudeConfig()) {
      await clearSession(from);
      await sendText(from, 'Invoice building is not switched on yet. Hang tight.');
      return true;
    }
    const drafted = await draftInvoice(body);
    if (!drafted || drafted.line_items.length === 0) {
      await sendText(from, "I could not pick out the amounts. Try like: 'bathroom rewire 450, materials 80'.");
      return true; // stay on this step
    }
    const inv = await createInvoice(userId, {
      customer_name: data.customer_name || 'Customer',
      customer_contact: data.customer_contact ?? null,
      line_items: drafted.line_items,
    });
    await clearSession(from);
    if (!inv) {
      await sendText(from, 'Something went wrong saving that. Please try again.');
      return true;
    }
    const link = `${APP_URL}/invoice/${inv.id}`;
    await sendText(
      from,
      `Done. Invoice ${inv.number} for ${data.customer_name || 'your customer'}, total £${inv.total.toFixed(2)}.\n\nSend it to them: ${link}\n\nIt is saved in your app as a draft. Mark it paid there when the money lands and it goes straight into your income.`,
    );
    return true;
  }

  // Unknown state, reset cleanly.
  await clearSession(from);
  return false;
}

// --- Shapes of the bits of the webhook payload we read. -------------------
interface IncomingMessage {
  from: string;
  id: string;
  type: string;
  image?: { id: string };
  audio?: { id: string };
  text?: { body: string };
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
