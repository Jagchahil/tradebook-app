import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { parseReceipt, hasClaudeConfig } from '../../../../lib/claude';
import { clampReceiptDate } from '../../../../lib/waintents';
import {
  insertTransaction, recentUnconfirmedForMatch, mergeIntoTransaction, bumpAiUsage,
  countActiveSubscribers,
} from '../../../../lib/supabase';
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
// ⚠️ THE IMAGE ITSELF IS READ AND DISCARDED, exactly as the WhatsApp path reads and discards
// its download. Keeping it would need a storage write that lib/supabase.ts does not offer, and
// inventing one inline is forbidden by CLAUDE.md rule 2. When receipt evidence storage lands in
// lib/, both capture routes should gain it together or they will drift.
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

  const base64 = Buffer.from(await part.arrayBuffer()).toString('base64');
  const parsed = await parseReceipt(base64, mediaType);
  // parseReceipt answers amount 0 when it could not read the total. moneylog's own header says a
  // £0 beside a real merchant is not a gap, it is a wrong figure a man acts on, so an unreadable
  // total is treated as an unreadable receipt and he is asked for a clearer photograph.
  if (!parsed || parsed.amount <= 0) {
    return isForm ? back('problem=unread') : NextResponse.json({ error: 'unread' }, { status: 422 });
  }

  const receiptDate = clampReceiptDate(parsed.transaction_date);

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
      await mergeIntoTransaction(user.id, String(hit.match.id), {
        vendor: parsed.merchant_name,
        category: parsed.category,
      });
      return isForm ? back('done=merged') : NextResponse.json({ ok: true, merged: true });
    }
  } catch {
    /* the merge is a kindness, never a dependency */
  }

  try {
    await insertTransaction({
      user_id: user.id,
      vendor: parsed.merchant_name,
      // Receipts are an expense, stored negative, exactly as the webhook stores them.
      amount: -Math.abs(parsed.amount),
      category: parsed.category,
      transaction_date: receiptDate,
      source_type: 'web_image',
      // Captured, read, and WAITING. Never confirmed here: see the header.
      confirmed: false,
    });
  } catch {
    return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  return isForm ? back('done=logged') : NextResponse.json({ ok: true, toReview: true });
}
