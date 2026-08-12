// FINISHING A VOICE NOTE. Once the mini has transcribed the audio locally, the words come back here to be
// turned into a ledger entry — the exact same path a spoken note took before, just moved out of the
// webhook so the /api/voice/complete endpoint and the webhook can share it. Claude reads the amount, we
// write the FIGURES (never the sentence — see the note in insertTransaction below), and we confirm on the
// spot so the customer can correct it while it is fresh.

import { parseSpokenTransaction } from './claude';
import { insertTransaction } from './supabase';
import { entryDate, matchReservedWord } from './waintents';
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

export type VoiceFinishOutcome = 'logged' | 'no_amount' | 'blank' | 'reserved';

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

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A SPOKEN RESERVED WORD IS STILL A RESERVED WORD. Found 11 August 2026.
  //
  // The typed path reserves SUPPORT, STOP and START above every session flow and above the parser,
  // because a customer replying with a word WE handed him must never be fed to a receipt reader.
  // This path went straight to parseSpokenTransaction, so a man who said "stop" into his phone had
  // it treated as an expense with no amount in it, and was told to try again with something like
  // "forty quid of diesel". Under PECR an opt out has to be honoured, and on WhatsApp it does not
  // even need a regulator: enough people press Block and Meta takes the number off us.
  //
  // ⚠️ IT REFUSES RATHER THAN ACTS. Whisper mishears, and acting on a misheard STOP would silence a
  // man who never asked for it. So the voice path never opts anybody in or out by itself: it says
  // what it heard, asks him to send the word as a text, and lets the typed path (which is exact)
  // do the thing. One sentence, no state changed, and the word stops being eaten.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const reserved = matchReservedWord(clean);
  if (reserved) {
    await sendText(
      fromPhone,
      `It sounded like you said ${reserved}. I did not want to act on that from a voice note in case `
      + `I misheard you, so nothing has changed. Send it to me as a text and I will do it straight away.`,
    );
    return 'reserved';
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
