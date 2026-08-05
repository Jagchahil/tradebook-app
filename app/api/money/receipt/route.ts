import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { hasClaudeConfig } from '../../../../lib/claude';
import { bumpAiUsage, countActiveSubscribers } from '../../../../lib/supabase';
import {
  ingestReceiptImage, MAX_RECEIPT_BYTES, RECEIPT_IMAGE_TYPES,
} from '../../../../lib/receiptingest';
import { aiCapsFor } from '../../../../lib/margin';
import { decideSpend } from '../../../../lib/aicost';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

// A RECEIPT PHOTOGRAPH, UPLOADED FROM THE WEB. The WhatsApp reading, without the phone.
//
//   POST multipart { receipt: <image> }  ->  one UNCONFIRMED row, a merge into a bank line,
//                                            or a refusal to add the same receipt twice
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE INGEST PATH, AND THIS ROUTE IS A CALLER OF IT, NOT A COPY.
//
// ingestReceiptImage in lib/receiptingest.ts is the one walk that turns a photograph into a
// waiting row: store the image, parse it with the one parser, fold it into the bank line it
// duplicates, refuse the same receipt sent twice, insert as waiting. The WhatsApp webhook and
// the chat composer call the SAME function, so the three doors cannot drift apart. This file
// owns only what a door owns: the session, the gate, the burst limit, the upload's validity,
// the budget rings, and the sentence said back.
//
// 🔴 confirmed: false, ALWAYS. The one insert lives in lib/receiptingest.ts, says false, and
// there is no path there that writes true. A parse is a machine's reading of a man's money.
// However good the model, a reading waits for his yes, because the approval gate is the
// product and not a chore.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

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
  // would be charging him for our refusal. The ceiling and the allowlist are the ingest
  // module's own, so no door can quietly accept what the reader cannot take.
  const form = await req.formData().catch(() => null);
  if (!form) return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const part = form.get('receipt');
  if (!part || typeof part === 'string' || part.size === 0) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (part.size > MAX_RECEIPT_BYTES) {
    return isForm ? back('problem=big') : NextResponse.json({ error: 'too_big' }, { status: 413 });
  }
  const mediaType = (part.type || '').toLowerCase();
  if (!RECEIPT_IMAGE_TYPES.includes(mediaType)) {
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

  // The one walk, for the session's user and nobody the request named. Everything that happens
  // to the photograph from here, and the reasoning for it, lives in lib/receiptingest.ts.
  const result = await ingestReceiptImage({
    userId: user.id,
    bytes,
    mediaType,
    sourceType: 'web_image',
  });

  switch (result.outcome) {
    case 'unread':
      // parseReceipt answers amount 0 when it could not read the total. An unreadable total is
      // an unreadable receipt, and he is asked for a clearer photograph.
      return isForm ? back('problem=unread') : NextResponse.json({ error: 'unread' }, { status: 422 });
    case 'merged':
      return isForm ? back('done=merged') : NextResponse.json({ ok: true, merged: true });
    case 'duplicate':
      // 🔴 THE SAME RECEIPT, TWICE. Nothing was written, and that is said plainly rather than
      // reported as a fresh capture. The page's sentence is static: a redirect cannot carry
      // the figures without letting the URL speak for us.
      return isForm ? back('done=already') : NextResponse.json({ ok: true, duplicate: true });
    case 'failed':
      return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
    case 'logged':
      return isForm ? back('done=logged') : NextResponse.json({ ok: true, toReview: true });
  }
}
