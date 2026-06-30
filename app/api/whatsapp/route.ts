import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhook,
  isValidSignature,
  appSecretConfigured,
  downloadMedia,
  sendText,
} from '../../../lib/whatsapp';
import {
  parseReceipt,
  parseSpokenTransaction,
  draftInvoice,
  answerMoneyQuestion,
  answerExpenseQuestion,
  parseSchedule,
  hasClaudeConfig,
} from '../../../lib/claude';
import { checkExpense, VERDICT_ICON, TAX_TIPS } from '../../../lib/taxrules';
import { transcribeAudio, hasTranscribeConfig } from '../../../lib/transcribe';
import { sendInvoiceEmail, hasEmailConfig, looksLikeEmail } from '../../../lib/email';
import {
  findUserIdByPhone,
  claimMessage,
  insertTransaction,
  transactionSummaryForUser,
  getSession,
  setSession,
  clearSession,
  createInvoice,
  createEvent,
  bumpAiUsage,
} from '../../../lib/supabase';
import { TAXGUIDE_TRIGGER, matchTrade, cardText, totalCards } from '../../../lib/taxguide';
import type { TradeInfo } from '../../../lib/taxguide';
import { rateLimited } from '../../../lib/ratelimit';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';

// We never log message text or media. Only ids and status, per the data rules.

// Hard daily AI budget, durable in the database, so it holds across every
// serverless instance, unlike the in-memory burst limit. The per-phone cap
// protects margin on a single account. The global cap is a kill switch against a
// mass attack. If either is over for today, we refuse to spend on AI.
const PHONE_DAILY_AI = 120;
const GLOBAL_DAILY_AI = 4000;
const AI_BUSY =
  'I am a bit busy right now. Give me a few minutes and try again. Nothing is lost.';

async function aiBudgetBlocked(from: string): Promise<boolean> {
  const perPhone = await bumpAiUsage('phone', from);
  if (perPhone !== null && perPhone > PHONE_DAILY_AI) return true;
  const globalCount = await bumpAiUsage('global', 'all');
  if (globalCount === null) return true; // fail closed: never spend on AI if the durable cap cannot be checked
  if (globalCount > GLOBAL_DAILY_AI) return true;
  return false;
}

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

    // Idempotency. Claim the message id atomically. If we cannot claim it, this
    // is a Meta retry of something we already handled, so acknowledge and stop.
    // This covers every flow, not just receipts: reminders, questions, invoices.
    if (messageId && !(await claimMessage(messageId))) {
      return NextResponse.json({ ok: true });
    }

    // Per sender burst limit. Protects the AI and transcription spend from a
    // runaway or malicious sender. A genuine user never sends this many in a
    // short window. We silently drop over the limit: no AI, no reply, so we
    // never trigger a reply storm or rack up cost. (In-memory, per instance.
    // Move to a shared store for hard guarantees at scale, see docs/19.)
    if (rateLimited(`wa:${from}`, 30, 10 * 60 * 1000)) {
      return NextResponse.json({ ok: true });
    }

    if (message.type === 'image' && message.image?.id) {
      await handleReceiptImage(from, messageId, message.image.id);
    } else if (message.type === 'audio' && message.audio?.id) {
      await handleVoiceNote(from, messageId, message.audio.id);
    } else if (message.type === 'text' && message.text?.body) {
      const text = message.text.body;
      // Invoice flow takes priority. If it consumes the message, do not also log it.
      const handled = await handleInvoiceFlow(from, text);
      if (!handled) {
        const taxHandled = await handleTaxGuideFlow(from, text);
        if (!taxHandled) {
          if (isGetStarted(text)) {
            await handleWelcome(from);
          } else if (isCIS(text)) {
            await handleCIS(from, messageId, text);
          } else if (isMileage(text)) {
            await handleMileage(from, messageId, text);
          } else if (isHomeOffice(text)) {
            await handleHomeOffice(from, messageId, text);
          } else if (isPhoneShare(text)) {
            await handlePhoneShare(from, messageId, text);
          } else if (isSchedule(text)) {
            await handleSchedule(from, text);
          } else if (isHelp(text)) {
            await handleHelp(from);
          } else if (isTaxTips(text)) {
            await handleTaxTips(from);
          } else if (isExpenseCheck(text)) {
            await handleExpenseCheck(from, text);
          } else if (isQuestion(text)) {
            await handleMoneyQuestion(from, text);
          } else {
            await handleTextEntry(from, messageId, text);
          }
        }
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

// The first time an unknown number messages us is the make-or-break moment.
// Warm, and point them to sign up on the web, where onboarding and payment live.
// We never say "open the app" for signup, because signup happens on the site.
// "Get started" or a bare greeting. The first contact after they download the
// app and tap "Message Lekhio on WhatsApp". A linked user gets a warm welcome;
// an unknown number gets pointed to sign up. No AI, so this works before keys.
function isGetStarted(body: string): boolean {
  const t = body.trim().toLowerCase().replace(/[!.\s]+$/, '');
  return /^(get started|getstarted|start|hi|hiya|hello|hey|hey there|hello there|begin)$/.test(t);
}

async function handleWelcome(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  await sendText(
    from,
    [
      'Welcome to Lekhio. I am your back office, right here in WhatsApp.',
      '',
      'Here is what I can do for you:',
      'Snap a photo of any receipt and I log it for tax.',
      "Text your miles, like 'drove 24 miles', and I claim them.",
      'Tell me what you got paid and I keep your income tidy.',
      'Ask me anything about your tax or expenses.',
      '',
      'Everything lands in your Lekhio app, ready for tax, and nothing ever goes to HMRC without your say so.',
      '',
      'Go on, send me your first receipt.',
    ].join('\n'),
  );
}

async function replyNotLinked(from: string): Promise<void> {
  await sendText(
    from,
    [
      'Hi, I am Lekhio. I do your books and tax, right here on WhatsApp. Snap a receipt, log your mileage, ask about your money, all by text.',
      '',
      `I do not have an account for this number yet. Get set up in two minutes at ${APP_URL.replace('https://', '')}, first month free, then text me again.`,
    ].join('\n'),
  );
}

async function handleReceiptImage(from: string, messageId: string, mediaId: string): Promise<void> {
  // Find the Lekhio account for this number first. No point parsing if there
  // is nobody to attach it to.
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
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

  if (await aiBudgetBlocked(from)) {
    await sendText(from, AI_BUSY);
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
    await replyNotLinked(from);
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

  if (await aiBudgetBlocked(from)) {
    await sendText(from, AI_BUSY);
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

// Deterministic money-entry parser. Catches the common phrasings with no AI at
// all, so "spent £40 on diesel" and "got paid £500 by Dave" log instantly even
// before the AI keys have credit, exactly like mileage and CIS already do. It
// returns null when the message is not a clear money entry, so the richer AI
// path can still handle the unusual ones once credit is on.
type ParsedEntry = { merchant_name: string; amount: number; category: string; direction: 'income' | 'expense' };

const MONEY_INCOME_RE = /\b(got\s+paid|getting\s+paid|paid\s+me|earned|earnt|invoiced?|takings?|took|made|charged?)\b/i;
const MONEY_EXPENSE_RE = /\b(spent|spend|bought|buy|buying|paid\s+for|paying\s+for)\b/i;

function extractMoneyAmount(b: string): number | null {
  const m = b.match(/£\s*(\d[\d,]*(?:\.\d{1,2})?)/) || b.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\b/);
  if (!m) return null;
  const n = parseFloat((m[1] || '').replace(/,/g, ''));
  if (!isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return n;
}

function tidyName(s: string): string {
  return s
    .replace(/\b(today|yesterday|this morning|this afternoon|just now|earlier|please|thanks|ta|mate)\b.*$/i, '')
    .replace(/[.,!]+$/, '')
    .trim()
    .replace(/\s{2,}/g, ' ')
    .slice(0, 40);
}

const EXPENSE_CATEGORY: Array<[RegExp, string]> = [
  [/\b(diesel|petrol|fuel|unleaded)\b/i, 'fuel'],
  [/\b(screwfix|toolstation|wickes|b ?& ?q|jewson|travis perkins|selco|materials?|cement|timber|cable|paint|tiles?|pipe|fittings|adhesive|plaster|sand|aggregate|screws?)\b/i, 'materials'],
  [/\b(drill|tool|tools|saw|grinder|impact|battery|blade|disc)\b/i, 'tools'],
  [/\b(insurance|liability)\b/i, 'insurance'],
  [/\b(phone|mobile|airtime|sim)\b/i, 'phone'],
  [/\b(parking|congestion|toll|train|bus)\b/i, 'travel'],
  [/\b(van|vehicle|mot|tyres?)\b/i, 'van'],
  [/\b(food|lunch|dinner|meal|coffee)\b/i, 'meals'],
];

function expenseCategory(b: string): string {
  for (const [re, cat] of EXPENSE_CATEGORY) if (re.test(b)) return cat;
  return 'other';
}

function parseMoneyEntryRegex(body: string): ParsedEntry | null {
  const b = body.trim();
  if (!b || b.endsWith('?')) return null;
  // Looks like a question, not an entry.
  if (/^(how|what|whats|when|where|why|who|show|list|total|do i|did i|am i|have i|can i|could i|is it|are )/i.test(b)) return null;

  const incomeVerb = MONEY_INCOME_RE.test(b) || /\bpaid\b[^?]*\b(by|from)\b/i.test(b);
  const expenseVerb = MONEY_EXPENSE_RE.test(b) || (/\bpaid\b/i.test(b) && !incomeVerb);
  if (!incomeVerb && !expenseVerb) return null;

  const amount = extractMoneyAmount(b);
  if (amount == null) return null;

  if (incomeVerb) {
    const m = b.match(/\b(?:by|from)\s+([a-z0-9'&\- ]{2,40})/i);
    const who = (m ? tidyName(m[1]) : '') || 'a customer';
    return { merchant_name: who, amount, category: 'income', direction: 'income' };
  }
  const m = b.match(/\b(?:on|at|in|for|from)\s+([a-z0-9'&\- ]{2,40})/i);
  const what = m ? tidyName(m[1]) : '';
  const category = expenseCategory(b);
  const name = what || (category !== 'other' ? category : 'an expense');
  return { merchant_name: name, amount, category, direction: 'expense' };
}

async function handleTextEntry(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }

  // Deterministic first. This needs no AI, so the core "spent / got paid" loop
  // works the moment a number is linked, with or without AI credit.
  const quick = parseMoneyEntryRegex(body);
  if (quick) {
    await saveEntry(userId, messageId, quick, 'whatsapp_text', body);
    await sendText(from, confirmationLine(quick));
    return;
  }

  // Anything we could not parse deterministically falls to AI, if it is on.
  if (!hasClaudeConfig() || (await aiBudgetBlocked(from))) {
    await sendText(
      from,
      'Tell me what you spent or got paid and how much, for example "spent £40 on diesel" or "got paid £500 by Dave". You can also send a photo of a receipt.',
    );
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

// --- Mileage ---------------------------------------------------------------
// Text "log 24 miles" or "drove 24 miles to the job" and we log the claim at
// the current HMRC rate. Closes the one feature gap against the competition.
// Simplified expenses mileage rates, 2026/27. Car or van 55p (first 10,000),
// motorcycle 24p, bicycle 20p. We read the vehicle from the message.
function mileageRate(body: string): { pence: number; vehicle: string } {
  if (/\b(motorbike|motorcycle|moped|scooter)\b/i.test(body)) return { pence: 24, vehicle: 'motorcycle' };
  if (/\b(bicycle|pushbike|push bike|cycling|on (?:the|my) bike|by bike|on (?:the|my) cycle)\b/i.test(body)) return { pence: 20, vehicle: 'bicycle' };
  return { pence: 55, vehicle: 'car or van' };
}
const MILEAGE_RE = /\b(\d{1,4})\s*miles?\b/i;

function isMileage(body: string): boolean {
  if (/£|\bspent\b|\bgot paid\b|\bpaid me\b/i.test(body)) return false;
  // Do not hijack a reminder ("remind me ... 24 miles ...") or a question.
  if (/\bremind\b|\breminder\b/i.test(body) || body.trim().endsWith('?')) return false;
  return MILEAGE_RE.test(body);
}

async function handleMileage(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log your mileage.');
    return;
  }
  const m = body.match(MILEAGE_RE);
  const miles = m ? parseInt(m[1], 10) : 0;
  if (!miles || miles <= 0 || miles > 2000) {
    await sendText(from, 'Tell me the miles, for example "log 24 miles" or "drove 24 miles to the job".');
    return;
  }
  const { pence, vehicle } = mileageRate(body);
  const amount = Math.round(miles * pence) / 100;
  await insertTransaction({
    user_id: userId,
    vendor: 'Mileage',
    amount: -amount,
    category: 'travel',
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: 'whatsapp_mileage',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  const onVehicle = vehicle === 'car or van' ? '' : `on the ${vehicle} `;
  await sendText(
    from,
    `Logged. ${miles} miles ${onVehicle}at ${pence}p, that is £${amount.toFixed(2)} of travel. Check it in the app and confirm.`,
  );
}

// --- CIS, construction subcontractor deductions ---------------------------
// "Dave paid me £400, £80 CIS deducted" records the GROSS income and the tax
// already deducted. The deduction offsets your bill at tax time, often a refund.
// It is stored separately so it never reduces your profit.
function isCIS(body: string): boolean {
  if (body.trim().endsWith('?')) return false;
  if (/\bspent\b|\bbought\b/i.test(body)) return false;
  return /\bcis\b/i.test(body) && /£\s*\d/.test(body);
}
async function handleCIS(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log your CIS.');
    return;
  }
  const amounts = [...body.matchAll(/£\s*(\d+(?:\.\d{1,2})?)/g)].map((m) => parseFloat(m[1]));
  if (amounts.length === 0) {
    await sendText(from, 'Tell me the amounts, for example "Dave paid £400, £80 CIS deducted".');
    return;
  }
  const gross = amounts[0];
  if (gross > 1000000) {
    await sendText(from, 'That amount looks too big to be right. Send it again, for example "Dave paid £400, £80 CIS deducted".');
    return;
  }
  const pctM = body.match(/(\d{1,3})\s*%/);
  let deduction: number;
  let assumed = false;
  if (amounts.length >= 2) deduction = amounts[1];
  else if (pctM) deduction = Math.round(gross * Math.min(parseInt(pctM[1], 10), 100)) / 100;
  else { deduction = Math.round(gross * 0.2 * 100) / 100; assumed = true; }
  if (deduction >= gross) {
    await sendText(from, 'That CIS deduction looks bigger than the payment. Try "£400 paid, £80 CIS".');
    return;
  }
  const net = Math.round((gross - deduction) * 100) / 100;
  const nameM = body.match(/from\s+([A-Za-z][A-Za-z' ]{1,30})/i);
  const vendor = nameM ? nameM[1].trim() : 'CIS payment';
  await insertTransaction({
    user_id: userId,
    vendor,
    amount: gross,
    category: 'cis income',
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: 'whatsapp_cis',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
    cis_deduction: deduction,
  });
  const tail = assumed ? ' I assumed 20% on the full amount. If materials were included, edit it in the app.' : '';
  await sendText(
    from,
    `Logged. £${gross.toFixed(2)} gross, £${deduction.toFixed(2)} CIS taken, £${net.toFixed(2)} in your pocket. The £${deduction.toFixed(2)} is tax already paid that comes off your bill.${tail} Check it in the app and confirm.`,
  );
}

// --- Working from home, simplified flat rate ------------------------------
// "worked 90 hours from home" logs the HMRC flat rate for the month.
// 25 to 50 hours = £10, 51 to 100 = £18, 101+ = £26.
const HOMEOFFICE_RE = /\b(home office|worked from home|working from home|work from home|use of home|wfh)\b/i;
function isHomeOffice(body: string): boolean {
  if (/£/.test(body) || body.trim().endsWith('?')) return false;
  return HOMEOFFICE_RE.test(body);
}
async function handleHomeOffice(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log your home working.');
    return;
  }
  const hm = body.match(/(\d{1,4})\s*(?:hours?|hrs?)\b/i);
  const hours = hm ? parseInt(hm[1], 10) : null;
  if (hours === null) {
    await sendText(from, 'How many hours did you work from home this month? For example "worked 90 hours from home".');
    return;
  }
  let rate = 0;
  if (hours >= 101) rate = 26;
  else if (hours >= 51) rate = 18;
  else if (hours >= 25) rate = 10;
  else {
    await sendText(from, 'The flat rate starts at 25 hours a month. Below that, claim a fair share of your actual home costs instead.');
    return;
  }
  await insertTransaction({
    user_id: userId,
    vendor: 'Use of home',
    amount: -rate,
    category: 'use of home',
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: 'whatsapp_homeoffice',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  await sendText(from, `Logged. ${hours} hours from home, that is the £${rate} HMRC flat rate for the month. One claim a month. Check it in the app and confirm.`);
}

// --- Phone and broadband, business share ----------------------------------
// "phone bill £45, 80% business" logs only the business proportion.
function isPhoneShare(body: string): boolean {
  if (body.trim().endsWith('?')) return false;
  return /£/.test(body) && /\b(phone|mobile|broadband|internet)\b/i.test(body) && /\d{1,3}\s*%/.test(body);
}
async function handlePhoneShare(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log this.');
    return;
  }
  const am = body.match(/£\s*(\d+(?:\.\d{1,2})?)/);
  const pm = body.match(/(\d{1,3})\s*%/);
  if (!am || !pm) {
    await sendText(from, 'Tell me the bill and your business share, for example "phone bill £45, 80% business".');
    return;
  }
  const total = parseFloat(am[1]);
  const pct = Math.min(parseInt(pm[1], 10), 100);
  const amount = Math.round(total * pct) / 100;
  await insertTransaction({
    user_id: userId,
    vendor: 'Phone and broadband',
    amount: -amount,
    category: 'phone',
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: 'whatsapp_phoneshare',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  await sendText(from, `Logged. ${pct}% of £${total.toFixed(2)} is £${amount.toFixed(2)} of phone and broadband. Check it in the app and confirm.`);
}

// --- Help and money questions ---------------------------------------------
const HELP_RE = /^(help|menu|commands|options|what can you do|what can u do)$/i;
const QUESTION_RE = /(^|\s)(how much|how many|what(?:'s| is| are)?|whats|when|show|list|total|do i|did i|am i|have i|spent|owe|owed|made|earn)\b/i;

function isHelp(body: string): boolean {
  // Whole-message only, so a greeting in front of a real action ("hello, spent 40")
  // is not swallowed by the help menu.
  return HELP_RE.test(body.trim().replace(/[!.?\s]+$/, ''));
}

const SCHEDULE_RE = /\b(remind me|reminder|price up|quote|book(?:ing)?|appointment|diary|schedule|pencil in|tomorrow|next (?:mon|tue|wed|thu|fri|sat|sun)|at \d{1,2}(?::\d{2})?\s?(?:am|pm)|o'?clock)\b/i;

function isSchedule(body: string): boolean {
  // Do not hijack a money entry. If it clearly mentions a spend or a payment, let the entry handler take it.
  if (/£|\bspent\b|\bbought\b|\bgot paid\b|\bpaid me\b/i.test(body)) return false;
  return SCHEDULE_RE.test(body);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'when it is due';
  return `on ${d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`;
}

async function handleSchedule(from: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can keep your diary.');
    return;
  }
  if (!hasClaudeConfig()) {
    await sendText(from, 'Reminders are not switched on yet. Hang tight, they are coming very soon.');
    return;
  }
  if (await aiBudgetBlocked(from)) {
    await sendText(from, AI_BUSY);
    return;
  }
  const parsed = await parseSchedule(body, new Date().toISOString());
  if (!parsed) {
    await sendText(from, 'I could not work out a time for that. Try, for example, "remind me to price up Dave\'s job tomorrow at 8am".');
    return;
  }
  await createEvent(userId, { title: parsed.title, kind: parsed.kind, starts_at: parsed.starts_at, remind_at: parsed.remind_at });
  const when = parsed.remind_at ? formatWhen(parsed.remind_at) : 'when it is due';
  await sendText(from, `Got it. "${parsed.title}". I will remind you ${when}. 👍`);
}

// A money question, but only if it actually reads like a question, not a log
// entry. We treat a trailing question mark or a money question phrase as the cue.
function isQuestion(body: string): boolean {
  const b = body.trim();
  if (b.endsWith('?')) return true;
  // An entry, not a question: a spend/earn verb sitting with an amount. Never
  // hijack a money entry into the Q&A path, or the expense is silently lost.
  if (/\b(spent|spend|paid|bought|made|earnt|earned|got|took|takings?|invoiced?|charged?)\b[^?]*\d/i.test(b)) return false;
  return QUESTION_RE.test(b) && !/£|\bpaid\b|\bbought\b|\bspent £|\bgot paid\b/i.test(b);
}

async function handleHelp(from: string): Promise<void> {
  await sendText(
    from,
    [
      "Hi, I'm Lekhio. Your books, handled. Here is what I can do:",
      '',
      '📸 Send a photo of a receipt and I log it.',
      '🎙️ Or leave a voice note, like "forty quid diesel at the BP".',
      '✍️ Or just type it, like "spent £30 on screws" or "got paid £400 by Dave".',
      '🚗 Log mileage, like "drove 24 miles to the job".',
      '🏠 Log home working, like "worked 90 hours from home".',
      '🏗️ Log CIS, like "Dave paid £400, £80 CIS deducted".',
      '🧾 Type "create invoice" and I will build and send one with you.',
      '💬 Ask me anything, like "how much did I spend on fuel this month?".',
      '💡 Ask "can I claim my work boots?" and I will tell you straight.',
      '📈 Text "pay less tax" for the legal ways to keep more of what you earn.',
      '',
      'Everything shows in your app to review and approve. Nothing goes to HMRC without you.',
    ].join('\n'),
  );
}

async function handleMoneyQuestion(from: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then ask me anything about your money.');
    return;
  }
  if (!hasClaudeConfig()) {
    await sendText(from, 'I cannot answer questions just yet. Hang tight, it is coming very soon.');
    return;
  }
  if (await aiBudgetBlocked(from)) {
    await sendText(from, AI_BUSY);
    return;
  }
  const summary = await transactionSummaryForUser(userId);
  const answer = await answerMoneyQuestion(body, summary);
  await sendText(from, answer ?? 'I could not work that out. Try asking another way.');
}

// --- "Can I claim this?" expense checker ----------------------------------
// "can I expense my work boots?", "is a van tax deductible?", "can I claim fuel".
// Answered from the deterministic knowledge base first, so it works even before
// the AI is switched on, with Claude as a fallback for anything unusual.
// General information only, never a filing or an action.
const CLAIM_WORDS = /\b(claim|expense|deduct|deductible|allowable|write[- ]?off|writeoff|tax[- ]?deductible)\b/i;
function isExpenseCheck(body: string): boolean {
  if (!CLAIM_WORDS.test(body)) return false;
  // It must read like a query, not a logged entry. No money amount being booked.
  if (/£\s*\d/.test(body)) return false;
  return /\bcan i\b|\bcould i\b|\bable to\b|\bdo i\b|\bis (?:it|this|that|a|an|my|the)\b|\bare (?:my|these|those)\b|\bwhat about\b|\?/i.test(body);
}

function isTaxTips(body: string): boolean {
  if (/£\s*\d/.test(body)) return false;
  return /\b(pay less tax|pay no tax|save (?:on )?tax|reduce my tax|lower my tax|less tax|tax efficient|tax efficiency|keep more|how (?:do|can) i pay)\b/i.test(body);
}

// A soft signup line, only for numbers we do not have an account for. The
// expense checker and tax tips give value to anyone, then point them to sign up.
async function signupTail(from: string): Promise<string> {
  const linked = await findUserIdByPhone(from);
  if (linked) return '';
  return `\n\nWant me to track all this for you? Get set up in two minutes at ${APP_URL.replace('https://', '')}, first month free.`;
}

async function handleExpenseCheck(from: string, body: string): Promise<void> {
  // One lookup, reused below. Whether we have an account for this number decides
  // both the signup nudge and whether the paid AI fallback is allowed.
  const linked = await findUserIdByPhone(from);
  const tail = linked
    ? ''
    : `\n\nWant me to track all this for you? Get set up in two minutes at ${APP_URL.replace('https://', '')}, first month free.`;

  const hit = checkExpense(body);
  if (!hit) {
    if (/\bwhat\b/i.test(body) && /\bclaim\b/i.test(body)) {
      await handleTaxTips(from);
      return;
    }
    // The Claude fallback runs ONLY for linked accounts, so an unknown number
    // cannot spend our AI budget by spamming questions. Unlinked callers still
    // get the safe general answer and a nudge to sign up.
    if (hasClaudeConfig() && linked) {
      if (await aiBudgetBlocked(from)) {
        await sendText(from, AI_BUSY);
        return;
      }
      const ai = await answerExpenseQuestion(body);
      if (ai) {
        await sendText(from, ai + tail);
        return;
      }
    }
    await sendText(
      from,
      [
        'The test HMRC uses is simple: was it spent wholly and only for the business? If yes, it is very likely claimable. If it is part personal, you claim the business share.',
        '',
        'Ask me about a specific thing, like "can I claim my work boots?" or "is a van deductible?". Or text "pay less tax" for the legal ways to keep more.',
        '',
        'General info, not advice for your exact situation.',
      ].join('\n') + tail,
    );
    return;
  }
  const icon = VERDICT_ICON[hit.verdict];
  await sendText(
    from,
    [
      `${icon} ${hit.title}. ${hit.rule}`,
      '',
      'Want it logged? Send the receipt or the amount and I will file it.',
      '',
      'General info, not advice for your exact situation.',
    ].join('\n') + tail,
  );
}

async function handleTaxTips(from: string): Promise<void> {
  const lines = TAX_TIPS.slice(0, 8).map((t) => `• ${t.title}. ${t.body}`);
  await sendText(
    from,
    [
      'Here are the legal ways to keep more of what you earn. All within the rules, nothing dodgy.',
      '',
      ...lines,
      '',
      'I track most of these for you as you go, so you do not leave money on the table. General info, not advice for your exact situation.',
    ].join('\n') + (await signupTail(from)),
  );
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

  // Only act on our own flow. If there is no session, or the session belongs to
  // another flow (the tax walkthrough), and this is not an invoice trigger, let
  // the other handlers take it. This stops us clearing another flow's session.
  if ((!session || session.flow !== 'invoice') && !isTrigger) return false;

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
    if (await aiBudgetBlocked(from)) {
      await sendText(from, AI_BUSY);
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
    let emailedTo: string | null = null;
    if (looksLikeEmail(data.customer_contact) && hasEmailConfig()) {
      const sent = await sendInvoiceEmail({
        to: data.customer_contact as string,
        number: inv.number,
        total: inv.total,
        link,
        customerName: data.customer_name,
      });
      if (sent) emailedTo = data.customer_contact as string;
    }
    const head = `Done. Invoice ${inv.number} for ${data.customer_name || 'your customer'}, total £${inv.total.toFixed(2)}.`;
    const deliver = emailedTo
      ? `I have emailed it straight to ${emailedTo}. Track it here: ${link}`
      : `Send it to them: ${link}`;
    await sendText(
      from,
      `${head}\n\n${deliver}\n\nIt is saved in your app as a draft. Mark it paid when the money lands and it goes into your income.`,
    );
    return true;
  }

  // Unknown state, reset cleanly.
  await clearSession(from);
  return false;
}

// --- Guided "file your own tax return" walkthrough ------------------------
// Triggered by "tax return", "self assessment", and similar. We send the steps
// one message at a time, waiting for NEXT, personalised by the user's trade.
// Static content only, so it works even before the AI is switched on. It never
// submits anything, it points the user to the official HMRC service.
const TAXGUIDE_NEXT = /^\s*(next|continue|go|carry on|yes|yep|ok(?:ay)?|y)\s*$/i;
const TAXGUIDE_STOP = /^\s*(stop|quit|done|exit|cancel|end|finish)\s*$/i;
const TAXGUIDE_SKIP = /^\s*skip\s*$/i;

async function handleTaxGuideFlow(from: string, body: string): Promise<boolean> {
  const session = await getSession(from);
  const inFlow = session?.flow === 'taxguide';
  // Do not fire on a money entry that happens to mention tax.
  const isTrigger = TAXGUIDE_TRIGGER.test(body) && !/£/.test(body);

  if (!inFlow && !isTrigger) return false;

  // Finish on request.
  if (inFlow && TAXGUIDE_STOP.test(body)) {
    await clearSession(from);
    await sendText(from, 'No problem. Text "tax return" whenever you want to run through it again. 👍');
    return true;
  }

  // Start or restart.
  if (!inFlow) {
    await setSession(from, 'taxguide', 'await_trade', {});
    await sendText(
      from,
      [
        'Happy to walk you through your tax return, one step at a time. It is more straightforward than it looks.',
        '',
        'First, what is your trade? Reply with it, for example "electrician" or "plumber", and I will show what you can claim. Or reply SKIP.',
      ].join('\n'),
    );
    return true;
  }

  const data = (session?.data ?? {}) as { idx?: number; trade?: TradeInfo | null };

  // Waiting for their trade.
  if (session?.step === 'await_trade') {
    const trade = TAXGUIDE_SKIP.test(body) ? null : matchTrade(body);
    await setSession(from, 'taxguide', 'walk', { idx: 0, trade });
    await sendText(from, trade ? `Great, ${trade.name}. Here we go.` : 'No problem, here we go.');
    await sendText(from, cardText(0, trade));
    return true;
  }

  // Walking through the cards.
  if (session?.step === 'walk') {
    if (!TAXGUIDE_NEXT.test(body)) {
      await sendText(from, 'Reply NEXT for the next step, or STOP to finish.');
      return true;
    }
    const nextIdx = (data.idx ?? 0) + 1;
    const last = totalCards() - 1;
    if (nextIdx >= totalCards()) {
      await clearSession(from);
      await sendText(from, 'That is the lot. Text "tax return" any time to run through it again. 👍');
      return true;
    }
    // The closing card ends the flow.
    if (nextIdx === last) {
      await clearSession(from);
      await sendText(from, cardText(nextIdx, data.trade ?? null));
      return true;
    }
    await setSession(from, 'taxguide', 'walk', { idx: nextIdx, trade: data.trade ?? null });
    await sendText(from, cardText(nextIdx, data.trade ?? null));
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
