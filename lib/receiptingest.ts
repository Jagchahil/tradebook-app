// ONE RECEIPT PIPELINE, THREE DOORS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A receipt photograph reaches Lekhio three ways: the WhatsApp webhook, the web capture page,
// and the chat composer. Until 5 August 2026 the first two each carried their own copy of the
// same walk (store, parse, look for the bank line, insert as waiting), and the third was about
// to become copy number three. Two readers over one photograph is the two-formatters bug with a
// camera; three is the same bug with a witness. So the walk lives HERE, once, and every route
// is a caller. Each route keeps its own auth, its own rate limits and its own budget rings,
// because who may ask is the door's business; what happens to the photograph is this file's.
//
// THE WALK, IN ORDER, AND WHY THE ORDER:
//
//   1. STORE FIRST, PARSE SECOND. The image goes to the private receipts bucket before the
//      model ever sees it, so a parse crash cannot cost him the evidence too. Storage is
//      evidence, NEVER a dependency: a null from the upload is carried on past, because
//      a lost image must never lose the figures.
//
//   2. PARSE. parseReceipt in lib/claude.ts is the one function that turns a photograph into
//      figures. An unreadable total is an unreadable receipt: a £0 beside a real merchant is
//      not a gap, it is a wrong figure a man acts on, so amount <= 0 answers 'unread'.
//
//   3. THE BANK LINE. The bank usually lands a card payment the same day and the photograph
//      arrives that evening. A CONFIDENT match folds the receipt INTO the bank line, keeps the
//      bank's figures (facts, not readings), and hands the line the shop name, the category
//      and the image. See lib/dedupe.ts for the whole argument.
//
//   4. 🔴 THE SAME RECEIPT, TWICE (new, 5 August 2026). The bank pass only ever compared the
//      photograph against bank_feed rows, so the SAME PAPER sent twice sailed past it and both
//      copies could be approved, double counting the cost. So after the bank pass, a second
//      findDuplicate runs against his recent UNCONFIRMED captured receipts (web_image and
//      whatsapp_image). A confident match REFUSES to insert: no second row, no silent merge,
//      and the caller is handed the figures to say so out loud. Only 'same' refuses (same
//      normalised shop, same money to a penny, within a few days). A 'maybe' still inserts,
//      because refusing a row we cannot vouch for would quietly delete a real cost, and the
//      duplicate rule in Things to check remains the net for those.
//
//   5. INSERT AS WAITING. confirmed: false, ALWAYS, and there is no path in this file that
//      writes true. A parse is a machine's reading of a man's money and a reading waits for
//      his yes, because the approval gate is the product and not a chore.
//
// THE VAT RIDES ALONG UNDER THE SAME RULES AS EVER: only when the paper printed a figure, only
// for a man who is VAT registered (a failed profile read is not an answer and stores nothing),
// always vat_confirmed false, and a database without the columns costs him the reading and
// never the row.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { parseReceipt, type ReceiptLine } from './claude';
import { scoreFor } from './receiptconfidence';
import { clampReceiptDate } from './waintents';
import {
  insertTransaction, recentUnconfirmedForMatch, recentlyCapturedForMatch, mergeIntoTransaction,
  storeReceiptImage, readVatProfile,
} from './supabase';
import type { NewTransaction } from './supabase';
import { findDuplicate } from './dedupe';
import { normaliseVendor } from './memory';

// Vercel refuses request bodies a little above this anyway, so the honest ceiling is ours and
// the message is ours, rather than a platform error page about a limit we never mentioned.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

// What Claude vision actually accepts. A page's accept attribute is a courtesy to the phone's
// camera picker; this list is the rule. An iPhone HEIC lands here and gets a plain answer
// instead of a failed parse it would have paid an AI call for. (The wildcard form of that
// attribute is deliberately not written in this comment: it contains the two characters that
// open a block comment, and every comment stripping guard in test/ would swallow half this file.)
export const RECEIPT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S1. WHAT THE BYTES SAY, WHICH IS THE ONLY THING THAT KNOWS (19 August 2026).
//
// Until today every door decided what a file WAS from what the sender CALLED it: File.type on the
// four web doors, Meta's metadata on WhatsApp. storeReceiptImage then wrote that string as the
// stored object's Content-Type, so a sender chose a header we later served back.
//
// 🔴 IT WAS NOT EXPLOITABLE END TO END AND THAT IS NOT THE POINT. The bucket is private, the read
// back route re checks the image wildcard and sets nosniff, and CSP carries object-src none.
// (The wildcard is spelled out in words here for the reason this file already gives above: written
// literally it is the two characters that OPEN a block comment, and every comment stripping guard
// in test/ would swallow half this file. It caught me within the hour of my writing it.) Every one of
// those defences is DOWNSTREAM OF THE WRITE, so all three have to keep holding for ever for the
// write to stay harmless. This checks it at the write instead, once, where the bytes are.
//
// The first twelve bytes are enough for all four types we accept, and WEBP is why it is twelve
// rather than eight: RIFF at 0 and WEBP at 8.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function imageTypeFromBytes(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38
    && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

// 🔴 THE DECLARED TYPE MUST MATCH THE BYTES, not merely be on the allowed list. A JPEG declared as
// image/png is refused too: it is not an attack, but it is a file we would store under a
// Content-Type its bytes contradict, and "close enough" is how the next hole gets argued in.
export function bytesConfirmType(bytes: Uint8Array, declared: string): boolean {
  const actual = imageTypeFromBytes(bytes);
  return actual !== null && actual === (declared || '').toLowerCase().split(';')[0].trim();
}

// ⚠️ ONE SENTENCE, TWO CHAT CHANNELS. It lived as a literal in app/api/thread/route.ts and WhatsApp
// had no wrong type answer at all. Both say this now, from here, for the same reason the Scotland
// caveat lives in one file: two channels that word the same refusal separately drift apart.
export const NOT_AN_IMAGE_REPLY = 'I cannot read that kind of file. A JPEG or PNG photograph works.';

// Every answer carries what the caller needs to say the honest sentence for its own surface,
// and nothing else. The routes own their words; this file owns what happened.
export type ReceiptIngestResult =
  // The model could not read a usable total. Nothing was written.
  | { outcome: 'unread' }
  // The receipt folded into the bank line that already carried this payment. One row remains.
  | { outcome: 'merged'; merchant: string; amount: number; category: string }
  // 🔴 The same receipt is already in, waiting. NOTHING was written, on purpose.
  | { outcome: 'duplicate'; merchant: string; amount: number; date: string }
  // One new row, waiting for his yes.
  | { outcome: 'logged'; merchant: string; amount: number; category: string; date: string }
  // The write itself failed. Nothing landed, and the caller must say so, never shrug.
  | { outcome: 'failed' }
  // 🔴 S1. The bytes are not the picture the sender said they were. NOTHING was stored and no AI
  // call was paid for. Deliberately NOT 'unread': every caller answers that one with "try a
  // clearer photograph", which would be a lie here and would send him round in circles taking
  // better photographs of a file that is not a photograph.
  | { outcome: 'nottype' };

export async function ingestReceiptImage(args: {
  userId: string;
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: string;
  // Which door the photograph came through. It is the row's source_type, and it is also what
  // the duplicate pass below matches against, so a new door must pick one of these two rather
  // than minting a third: every downstream filter (proof of income, the MTD pack) names them.
  sourceType: 'web_image' | 'whatsapp_image';
  // The WhatsApp message id, when that is the door. It rides on the row (and on a merge) for
  // the same idempotency the webhook has always kept.
  whatsappMessageId?: string;
}): Promise<ReceiptIngestResult> {
  const { userId, bytes, mediaType, sourceType, whatsappMessageId } = args;

  // 🔴 S1, AND IT IS BEFORE THE STORE ON PURPOSE. storeReceiptImage writes mediaType as the
  // object's Content-Type, so checking after the write would be checking after the thing the
  // check exists to prevent. Every door reaches this walk, which is why the guard is here and not
  // repeated four times: a fifth door gets it by arriving.
  if (!bytesConfirmType(bytes, mediaType)) return { outcome: 'nottype' };

  // STORE FIRST, PARSE SECOND. See the header. The one cost of this order is an unread
  // photograph leaving an unreferenced object behind, which is pennies of storage against a
  // man's proof of spend.
  const storedPath = await storeReceiptImage(userId, bytes, mediaType);

  const base64 = Buffer.from(bytes).toString('base64');
  const parsed = await parseReceipt(base64, mediaType);
  if (!parsed || parsed.amount <= 0) return { outcome: 'unread' };

  const receiptDate = clampReceiptDate(parsed.transaction_date);

  // WHOSE VAT IS THIS, AND IS IT ANY USE TO HIM? The profile is only read when the paper
  // actually printed a figure, so the man who is not registered, and the receipt that never
  // showed the VAT, both cost nothing at all. null from readVatProfile is a FAILED READ and
  // not an answer: it lands in the same place as a plain no, which is storing no VAT.
  const vatProfile = parsed.vat === null ? null : await readVatProfile(userId);
  const receiptVat = vatProfile !== null && vatProfile.registered ? parsed.vat : null;

  // The two duplicate passes. Never fatal: a failed lookup falls through to a plain insert and
  // the duplicate rule in Things to check remains the safety net.
  try {
    const since = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
    const recent = await recentUnconfirmedForMatch(userId, since);
    const incoming = {
      vendor: parsed.merchant_name,
      amount: -Math.abs(parsed.amount),
      transaction_date: receiptDate,
    };

    // PASS ONE: is this the card payment the bank already sent? A confident match merges,
    // because bank line plus receipt is ONE purchase and the bank's figures are the facts.
    const bankRows = recent.filter((r) => r.source_type === 'bank_feed');
    const bankHit = findDuplicate(incoming, bankRows, normaliseVendor);
    if (bankHit && bankHit.strength === 'same') {
      await mergeIntoTransaction(userId, String(bankHit.match.id), {
        vendor: parsed.merchant_name,
        category: parsed.category,
        // receiptVat and not parsed.vat: the gating above already asked whether this man is
        // VAT registered at all. It arrives unconfirmed; vat_confirmed is not on the patch.
        ...(receiptVat !== null ? { vat_amount: receiptVat } : {}),
        // The bank line keeps the figures; the receipt gives it the shop name, the category,
        // and the photograph. Only passed when storage actually kept one.
        ...(storedPath ? { raw_input_url: storedPath } : {}),
        ...(whatsappMessageId ? { raw_whatsapp_message_id: whatsappMessageId } : {}),
      });
      return {
        outcome: 'merged',
        merchant: parsed.merchant_name,
        amount: Math.abs(parsed.amount),
        category: parsed.category,
      };
    }

    // 🔴 PASS TWO: is this a receipt he already sent? Same matcher, different pool: his own
    // recent UNCONFIRMED captures. A confident match is a REFUSAL to write, not a merge: there
    // is nothing to fold together, because the row that exists already says everything this
    // photograph says. Confirmed rows are deliberately not in the pool: once he has approved
    // something we do not go rearranging it behind him, and the anomaly rule still watches.
    // 🔴 A DIFFERENT POOL, ASKED A DIFFERENT WAY. RUN 2, 12 August 2026.
    //
    // `recent` above is filtered by the receipt's PRINTED date, which is right for pass one (a card
    // payment settles a day or two after the paper is printed) and wrong for this pass. Sending the
    // same photograph twice is about when it ARRIVED, and the shoebox this product was built to
    // empty is full of paper printed weeks ago. Three of four duplicate sends walked straight
    // through this line because their printed dates were 30 July, 29 July and 27 June.
    //
    // recentlyCapturedForMatch filters on created_at instead. Two days covers a customer who
    // photographs a pile, gets interrupted, and starts again the next morning.
    const capturedSince = new Date(Date.now() - 2 * 86400_000).toISOString();
    const capturedRows = (await recentlyCapturedForMatch(userId, capturedSince)).filter(
      (r) => r.source_type === 'web_image' || r.source_type === 'whatsapp_image',
    );
    const dupHit = findDuplicate(incoming, capturedRows, normaliseVendor);
    if (dupHit && dupHit.strength === 'same') {
      return {
        outcome: 'duplicate',
        merchant: parsed.merchant_name,
        amount: Math.abs(parsed.amount),
        // The date of the row he already has, so the sentence names the receipt he will
        // recognise. Falls back to this reading's date when the row's is missing.
        date: String(dupHit.match.transaction_date ?? receiptDate).slice(0, 10),
      };
    }
  } catch {
    /* the duplicate passes are a kindness, never a dependency */
  }

  // ⚠️ THE TWO VAT COLUMNS RIDE ON THE RECORD RATHER THAN BEING NAMED BY NewTransaction, which
  // does not carry them yet. insertTransaction posts the record whole, so the columns land, and
  // widening the shared type is a change to lib/supabase.ts that this file does not own.
  const row: NewTransaction & {
    vat_amount?: number;
    vat_confirmed?: boolean;
    line_items?: ReceiptLine[];
  } = {
    user_id: userId,
    vendor: parsed.merchant_name,
    // Receipts are an expense, stored negative. The app reads income vs expense from this sign.
    amount: -Math.abs(parsed.amount),
    category: parsed.category,
    // The date printed on the receipt, clamped to a sane range, so a back-dated receipt lands
    // in the right tax quarter. Falls back to today.
    transaction_date: receiptDate,
    source_type: sourceType,
    // Captured, read, and WAITING. Never confirmed here: see the header.
    confirmed: false,
    // The photograph's path in the private bucket, or null when storage failed. The figures
    // are already in hand either way: a lost image never loses them.
    raw_input_url: storedPath,
    // 🔴 HOW WELL THE MACHINE COULD SEE THE TOTAL, STORED. R2, 13 August 2026.
    //
    // The column has existed on public.transactions since the schema was written and NOTHING had
    // ever written to it: `confidence_score numeric` was declared here and in NewTransaction and
    // read in exactly no places. So this needs no migration. The shelf was built and left empty,
    // which is why the faded £110.55 could walk into the pile looking like every other row.
    //
    // null when the model was not asked, and null is not "clear": see lib/receiptconfidence.ts.
    confidence_score: scoreFor(parsed.amount_confidence),
    ...(whatsappMessageId ? { raw_whatsapp_message_id: whatsappMessageId } : {}),
  };
  if (receiptVat !== null) {
    row.vat_amount = receiptVat;
    // Said out loud rather than left to the column default, because this is the whole argument.
    // What we have is what the paper said. It becomes a reclaim when HE says so, on /app/pile,
    // and confirmTransactionVat is the only thing anywhere that flips it.
    row.vat_confirmed = false;
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT WAS IN THE BASKET, KEPT BECAUSE THE PHOTOGRAPH IS NOT. See the block in lib/claude.ts.
  //
  // Only written when there is something to write: an un-itemised receipt stores no column at all
  // rather than an empty array, so "the paper was not itemised" and "we have not looked" stay
  // distinguishable in the data, which is the same rule the VAT column above follows.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // ⚠️ OPTIONAL CHAINING ON A FIELD THE TYPE SAYS IS REQUIRED, deliberately. ParsedReceipt
  // guarantees it for every real caller, and three test suites stub parseReceipt and returned an
  // object without it, which threw INSIDE the receipt walk and lost the row. A type is a promise
  // between this file and lib/claude.ts; it is not a promise about every object that ever reaches
  // here. On the one path where a throw costs a man his evidence, defend the boundary.
  if (parsed.line_items?.length) {
    row.line_items = parsed.line_items;
  }

  const write = async (): Promise<boolean> => {
    try {
      await insertTransaction(row);
      return true;
    } catch {
      return false;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 NEITHER OPTIONAL COLUMN MAY EVER COST HIM THE ROW.
  //
  // Both vat_amount/vat_confirmed and line_items arrive by an APPLY_*.sql the founder pastes in by
  // hand. On a database where one has not been run, NAMING the column is enough for PostgREST to
  // refuse the entire insert, and the man loses his receipt over a field he never asked for.
  //
  // ⚠️ THE ORDER IS THE PRIORITY ORDER OF THE EVIDENCE, AND IT IS DELIBERATE. The basket is given
  // up FIRST: nothing reads it today and it is for a product that does not exist yet. VAT is given
  // up SECOND: it is money he can actually reclaim. The receipt itself is never given up at all.
  //
  // Written as a loop over the droppable fields so a third optional column cannot be added later
  // by somebody who forgets to widen the retry, which is exactly how the VAT retry came to be the
  // only one when this file already had two optional fields on it.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  let landed = await write();
  const giveUpInOrder: Array<() => boolean> = [
    () => {
      if (!row.line_items) return false;
      delete row.line_items;
      return true;
    },
    () => {
      if (row.vat_amount === undefined) return false;
      delete row.vat_amount;
      delete row.vat_confirmed;
      return true;
    },
  ];
  for (const giveUp of giveUpInOrder) {
    if (landed) break;
    if (!giveUp()) continue;
    landed = await write();
  }
  if (!landed) return { outcome: 'failed' };

  return {
    outcome: 'logged',
    merchant: parsed.merchant_name,
    amount: Math.abs(parsed.amount),
    category: parsed.category,
    date: receiptDate,
  };
}

// The refusal, said the same way on every surface that can carry the figures, so WhatsApp and
// the chat cannot drift into two versions of one sentence. The web capture page keeps a static
// line instead, because a redirect cannot carry these figures without trusting the URL to
// speak for us.
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// '2026-08-05' spoken as '5 August'. Anything unreadable falls back to the string itself,
// because a wrong-shaped date must never cost the sentence.
export function speakDay(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateISO));
  if (!m) return String(dateISO);
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return String(dateISO);
  return `${Number(m[3])} ${month}`;
}

export function duplicateReceiptLine(merchant: string, amount: number, dateISO: string): string {
  return `Looks like the ${merchant} receipt for £${amount.toFixed(2)} on ${speakDay(dateISO)}, which you already added. I have not added it again.`;
}
