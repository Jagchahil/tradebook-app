import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { parseReceipt, hasClaudeConfig } from '../../../../lib/claude';
import { clampReceiptDate } from '../../../../lib/waintents';
import {
  insertTransaction, recentUnconfirmedForMatch, mergeIntoTransaction, bumpAiUsage,
  countActiveSubscribers, storeReceiptImage, readVatProfile,
} from '../../../../lib/supabase';
import type { NewTransaction } from '../../../../lib/supabase';
import { findDuplicate } from '../../../../lib/dedupe';
import { normaliseVendor } from '../../../../lib/memory';
import { aiCapsFor } from '../../../../lib/margin';
import { decideSpend } from '../../../../lib/aicost';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

// A RECEIPT PHOTOGRAPH, UPLOADED FROM THE WEB. The WhatsApp reading, without the phone.
//
//   POST multipart { receipt: <image> }  ->  one UNCONFIRMED row, or a merge into a bank line
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE PARSE PATH, AND THIS ROUTE IS ANOTHER CALLER OF IT, NOT ANOTHER COPY.
//
// parseReceipt in lib/claude.ts is the one function that turns a photograph into figures, and
// the WhatsApp webhook already calls it. So does this. The date is clamped by the same
// clampReceiptDate, the duplicate check is the same recentUnconfirmedForMatch plus findDuplicate
// composition handleReceiptImage runs, and the row lands through the same insertTransaction in
// the same shape: amount negative, confirmed false. Two readers over one photograph is the
// two-formatters bug with a camera, and this route refuses to be the second reader.
//
// 🔴 confirmed: false, ALWAYS, AND THERE IS NO PATH IN THIS FILE THAT WRITES TRUE. A parse is a
// machine's reading of a man's money. However good the model, a reading waits for his yes,
// because the approval gate is the product and not a chore. The one insert below says false and
// test/moneyweb.test.mjs fails the build if this file ever says otherwise.
//
// ⚠️ THE MERGE PATH EXISTS FOR THE SAME REASON IT EXISTS ON WHATSAPP. The bank usually lands a
// card payment the same day; the photograph arrives that evening. One purchase must not become
// two rows, so a CONFIDENT match folds the receipt into the bank line, keeps the bank's figures
// (facts, not readings), and says so. A maybe is left alone: merging two genuinely different
// purchases would quietly delete one of his costs and raise his tax bill.
//
// ⚠️ THE IMAGE IS KEPT, STORED FIRST AND PARSED SECOND (31 July 2026). storeReceiptImage in
// lib/supabase.ts puts the photograph in the private receipts bucket under the user's own id
// and the path lands in the row's raw_input_url, so the evidence HMRC would actually ask to
// see survives alongside our reading of it. Storage is evidence, NEVER a dependency: a null
// from the upload is carried on past, the parse still runs and the row still lands, because a
// lost image must never lose the figures. The WhatsApp capture still reads and discards its
// download; it is the remaining caller the helper was shaped for, and wiring it means
// respecting the webhook's five second budget, a decision that path's owner makes.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE VAT IS WRITTEN DOWN AND IT IS NOT CLAIMED. vat_confirmed STAYS FALSE HERE, FOR EVER.
//
// parseReceipt now reads the VAT off the paper. That is a READING, and a reading of a VAT figure
// is not the same class of thing as a reading of a total: getting the total wrong shows up the
// moment he looks at his own money, while a VAT figure wrong one time in seven goes quietly into
// a reclaim he will be asked to stand behind. So it lands as vat_amount with vat_confirmed left
// at its default of false, and the only thing in the product that flips that flag is
// confirmTransactionVat, called from a form he filled in on /app/pile.
//
// 🔴 AND ONLY FOR A MAN WHO IS VAT REGISTERED. Most of this audience is not and never will be.
// He has no input tax to reclaim, so a VAT figure against his rows is a number he can never use
// and a question he would have to dismiss. readVatProfile returning null means the READ FAILED,
// which is not the same answer as "not registered", so that stores nothing either: guessing in
// either direction is worse than carrying on without it, and the figures do not depend on it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

// Vercel refuses request bodies a little above this anyway, so the honest ceiling is ours and
// the message is ours, rather than a platform error page about a limit we never mentioned.
const MAX_BYTES = 4 * 1024 * 1024;

// What Claude vision actually accepts. The page's accept attribute is a courtesy to the phone's
// camera picker; this list is the rule. An iPhone HEIC lands here and gets a plain answer
// instead of a failed parse it would have paid an AI call for. (The wildcard form of that
// attribute is deliberately not written in this comment: it contains the two characters that
// open a block comment, and every comment stripping guard in test/ would swallow half this file.)
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  // The upload is multipart, which refuseUnentitled and the other form-posting routes do not
  // recognise as a form. It is one, and a man mid-upload must never be shown a JSON object.
  const isForm = contentType.includes('multipart/form-data');
  const back = (q: string) => NextResponse.redirect(new URL(`/app/money/capture?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app/money/capture', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled', and
  // reading a photograph with a paid model is the clearest work in the product.
  const gate = await gateForUser(user.id);
  if (gate === 'readonly') {
    if (isForm) return back('locked=1');
    return refuseUnentitled(req, '/app/money/capture');
  }

  if (!hasClaudeConfig()) {
    return isForm ? back('problem=off') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  // Burst guard first, because it is free. The budget rings below each cost a database write.
  if (await rateLimitedShared(`receiptweb:${user.id}`, 10, 10 * 60 * 1000)) {
    return isForm ? back('problem=slow') : NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  // ⚠️ THE UPLOAD IS VALIDATED BEFORE THE BUDGET IS SPENT. The counters below are the shared AI
  // rings, and burning one of a man's daily reads on a file that was never going to be readable
  // would be charging him for our refusal.
  const form = await req.formData().catch(() => null);
  if (!form) return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const part = form.get('receipt');
  if (!part || typeof part === 'string' || part.size === 0) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (part.size > MAX_BYTES) {
    return isForm ? back('problem=big') : NextResponse.json({ error: 'too_big' }, { status: 413 });
  }
  const mediaType = (part.type || '').toLowerCase();
  if (!IMAGE_TYPES.includes(mediaType)) {
    return isForm ? back('problem=type') : NextResponse.json({ error: 'bad_type' }, { status: 415 });
  }

  // The same three rings the WhatsApp webhook's aiBudgetBlocked walks, with the same judge.
  // decideSpend reads the counts BEFORE this call, so our own bump is subtracted. The rings are
  // GLOBAL on purpose: web reads and WhatsApp reads spend from one wallet, so neither surface
  // can quietly drain the other's day.
  const subs = await countActiveSubscribers();
  const caps = aiCapsFor(subs ?? 0);
  const userDay = caps.killed ? null : await bumpAiUsage('receiptweb', user.id);
  const globalDay = caps.killed ? null : await bumpAiUsage('global', 'all');
  const globalMonth = caps.killed ? null : await bumpAiUsage('globalmonth', new Date().toISOString().slice(0, 7));
  const blocked = caps.killed
    || userDay === null || globalDay === null || globalMonth === null
    || !decideSpend({ globalDay: globalDay - 1, globalMonth: globalMonth - 1, userDay: userDay - 1 }, caps).allowed;
  if (blocked) {
    return isForm ? back('problem=budget') : NextResponse.json({ error: 'budget' }, { status: 429 });
  }

  const bytes = new Uint8Array(await part.arrayBuffer());

  // STORE FIRST, PARSE SECOND. The image goes to the private receipts bucket before the model
  // ever sees it, so a parse crash cannot cost him the evidence too. A null here means storage
  // had a bad minute: the figures continue regardless, because a lost image must never lose the
  // figures. The one cost of this order is an unread photograph leaving an unreferenced object
  // behind, which is pennies of storage against a man's proof of spend.
  const storedPath = await storeReceiptImage(user.id, bytes, mediaType);

  const base64 = Buffer.from(bytes).toString('base64');
  const parsed = await parseReceipt(base64, mediaType);
  // parseReceipt answers amount 0 when it could not read the total. moneylog's own header says a
  // £0 beside a real merchant is not a gap, it is a wrong figure a man acts on, so an unreadable
  // total is treated as an unreadable receipt and he is asked for a clearer photograph.
  if (!parsed || parsed.amount <= 0) {
    return isForm ? back('problem=unread') : NextResponse.json({ error: 'unread' }, { status: 422 });
  }

  const receiptDate = clampReceiptDate(parsed.transaction_date);

  // WHOSE VAT IS THIS, AND IS IT ANY USE TO HIM? See the header. The profile is only read when
  // the paper actually printed a figure, so the man who is not registered, and the receipt that
  // never showed the VAT, both cost nothing at all.
  //
  // ⚠️ null FROM readVatProfile IS A FAILED READ AND NOT AN ANSWER. Both it and a plain "no"
  // land in the same place here, which is storing no VAT, because that is the state the row
  // would have been in anyway and nothing about his figures depends on it.
  const vatProfile = parsed.vat === null ? null : await readVatProfile(user.id);
  const receiptVat = vatProfile !== null && vatProfile.registered ? parsed.vat : null;

  // IS THIS THE CARD PAYMENT WE ALREADY HAVE? Same window, same filter, same matcher, same
  // merge as handleReceiptImage. Never fatal: a failed lookup falls through to a plain insert
  // and the duplicate rule in Things to check remains the safety net.
  try {
    const since = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
    const recent = await recentUnconfirmedForMatch(user.id, since);
    const bankRows = recent.filter((r) => r.source_type === 'bank_feed');
    const hit = findDuplicate(
      { vendor: parsed.merchant_name, amount: -Math.abs(parsed.amount), transaction_date: receiptDate },
      bankRows,
      normaliseVendor,
    );
    if (hit && hit.strength === 'same') {
      // ⚠️ THE MERGE CARRIES NO VAT, AND THAT IS A GAP RATHER THAN A DECISION.
      // mergeIntoTransaction copies a fixed list of fields and vat_amount is not on it, so a
      // registered man whose receipt folds into a bank line loses the reading. He is no worse
      // off than he was yesterday, when there was no reading at all, and the row is still his
      // to answer on /app/pile. Closing it means adding vat_amount to that patch in
      // lib/supabase.ts, which is not this file's to change.
      await mergeIntoTransaction(user.id, String(hit.match.id), {
        vendor: parsed.merchant_name,
        category: parsed.category,
        // The bank line keeps the figures; the receipt gives it the shop name, the category,
        // and now the photograph. Only passed when storage actually kept one.
        ...(storedPath ? { raw_input_url: storedPath } : {}),
      });
      return isForm ? back('done=merged') : NextResponse.json({ ok: true, merged: true });
    }
  } catch {
    /* the merge is a kindness, never a dependency */
  }

  // ⚠️ THE TWO VAT COLUMNS RIDE ON THE RECORD RATHER THAN BEING NAMED BY NewTransaction, which
  // does not carry them yet. insertTransaction posts the record whole, so the columns land, and
  // widening the shared type is a change to lib/supabase.ts that this file does not own.
  const row: NewTransaction & { vat_amount?: number; vat_confirmed?: boolean } = {
    user_id: user.id,
    vendor: parsed.merchant_name,
    // Receipts are an expense, stored negative, exactly as the webhook stores them.
    amount: -Math.abs(parsed.amount),
    category: parsed.category,
    transaction_date: receiptDate,
    source_type: 'web_image',
    // Captured, read, and WAITING. Never confirmed here: see the header.
    confirmed: false,
    // The photograph's path in the private bucket, or null when storage failed. The figures
    // above are already in hand either way: see the header, a lost image never loses them.
    raw_input_url: storedPath,
  };
  if (receiptVat !== null) {
    row.vat_amount = receiptVat;
    // Said out loud rather than left to the column default, because this is the whole argument.
    // What we have is what the paper said. It becomes a reclaim when HE says so, on /app/pile,
    // and confirmTransactionVat is the only thing anywhere that flips it.
    row.vat_confirmed = false;
  }

  const write = async (): Promise<boolean> => {
    try {
      await insertTransaction(row);
      return true;
    } catch {
      return false;
    }
  };

  let landed = await write();
  // 🔴 A VAT READING MUST NEVER COST HIM THE ROW. supabase/APPLY_2026-08-01_vat.sql is what adds
  // these two columns, and on a database where it has not been run yet, naming them is enough for
  // the whole write to be refused. His receipt is the thing that matters, so the second attempt
  // drops the reading and keeps the money. The same rule as the stored image above: evidence is
  // never a dependency.
  if (!landed && receiptVat !== null) {
    delete row.vat_amount;
    delete row.vat_confirmed;
    landed = await write();
  }
  if (!landed) {
    return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  return isForm ? back('done=logged') : NextResponse.json({ ok: true, toReview: true });
}
