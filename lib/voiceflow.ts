// FINISHING A VOICE NOTE. Once the mini has transcribed the audio locally, the words come back here to be
// turned into a ledger entry — the exact same path a spoken note took before, just moved out of the
// webhook so the /api/voice/complete endpoint and the webhook can share it. Claude reads the amount, we
// write the FIGURES (never the sentence — see the note in insertTransaction below), and we confirm on the
// spot so the customer can correct it while it is fresh.

import { parseSpokenTransaction } from './claude';
import { insertTransaction } from './supabase';
import { entryDate } from './waintents';
import { sendText } from './whatsapp';

// The confirmation we send after logging a note. Lifted verbatim from the webhook so voice and text
// confirmations stay identical. Pure — no IO — so it is trivially testable.
export function confirmationLine(parsed: {
  merchant_name: string;
  amount: number;
  category: string;
  direction: 'income' | 'expense';
}): string {
  const amountText = `£${Math.abs(parsed.amount).toFixed(2)}`;
  if (parsed.direction === 'income') {
    const payer = (parsed.merchant_name ?? '').trim();
    const namedPayer = payer.length > 1 && !/^(a\s+)?(customer|client|someone|cash|payment|them|they)$/i.test(payer);
    const offer = namedPayer ? ` Want it as an invoice for ${payer}? Reply "invoice this".` : '';
    return `Got it. Income of ${amountText} from ${parsed.merchant_name}. Check it in the app and confirm.${offer}`;
  }
  if (parsed.category === 'other') {
    return `Got it. ${parsed.merchant_name} for ${amountText}. Was this a business cost? If so, open the app and set what it was for, materials, fuel and the like. If it was personal, just leave it, nothing counts until you confirm it.`;
  }
  return `Got it. ${parsed.merchant_name} for ${amountText}. Filed under ${parsed.category}. Check it in the app and confirm.`;
}

export type VoiceFinishOutcome = 'logged' | 'no_amount' | 'blank';

// Given a transcript, parse it, log the entry if it holds a real amount, and reply to the customer. The
// transcript itself is NOT stored (description is left empty for a spoken note) — only the parsed vendor,
// amount, category and date, read from his words in memory and then dropped. Returns what happened so the
// caller can log it (no customer data in that log).
export async function finishVoiceEntry(
  userId: string,
  messageId: string,
  fromPhone: string,
  transcript: string,
): Promise<VoiceFinishOutcome> {
  const clean = (transcript ?? '').trim();
  if (!clean) {
    await sendText(fromPhone, 'I could not make out that voice note. Try saying it again, nice and clear.');
    return 'blank';
  }

  const parsed = await parseSpokenTransaction(clean);
  if (!parsed || parsed.amount <= 0) {
    await sendText(
      fromPhone,
      'I heard you, but I could not catch the amount. Try again, for example "forty quid of diesel at the BP".',
    );
    return 'no_amount';
  }

  const magnitude = Math.abs(parsed.amount);
  await insertTransaction({
    user_id: userId,
    vendor: parsed.merchant_name,
    amount: parsed.direction === 'income' ? magnitude : -magnitude,
    category: parsed.category,
    transaction_date: entryDate(clean), // read from his words, then his words go no further
    source_type: 'whatsapp_voice',
    description: '', // a spoken note's sentence is never written to the ledger
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  await sendText(fromPhone, confirmationLine(parsed));
  return 'logged';
}
