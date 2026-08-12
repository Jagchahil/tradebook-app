import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { ingestStatementCsv } from '../../../../lib/statementingest';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

// A BANK STATEMENT, UPLOADED AS A CSV. The bank feed's fallback channel, and the one that
// needs nobody's permission: the feed has no provider today (GoCardless closed, TrueLayer
// declined us; the history is in lib/statementimport.ts's header), and this route is why the
// launch does not care.
//
//   POST multipart { statement: <csv> }  ->  rows in his books, every one UNCONFIRMED
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE WALK, AND THIS ROUTE IS A CALLER OF IT, NOT A COPY. The whole statement walk (parse,
// enrich, split known from fresh, insert, count) lived inline here until 12 August 2026, when
// the one door for uploads (/api/money/upload) became its second caller. It moved whole to
// lib/statementingest.ts, reasoning and all, exactly as the receipt walk lives in
// lib/receiptingest.ts. This file owns what a door owns: the session, the gate, the burst
// limit, the upload's validity, and the sentence said back.
//
// 🔴 NOTHING ON THIS PATH EVER CONFIRMS A ROW. The argument, at length, is in the walk's own
// header. Everything lands waiting for his yes.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

// Same ceiling as the receipt route, and for the same reason: Vercel refuses bodies a little
// above this anyway, so the honest limit is ours and the message is ours. Four megabytes of
// CSV is tens of thousands of rows, far past the line cap the parser itself enforces.
const MAX_BYTES = 4 * 1024 * 1024;

// What a bank's CSV arrives labelled as. Browsers disagree: text/csv from most, Excel's mime
// from Windows machines that associate .csv with it, text/plain from the rest, and sometimes
// nothing at all. So the filename's own extension is accepted as the tiebreak when the type
// is missing or generic, and the parser's header detection is the real gate behind both.
const CSV_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream', ''];

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  const isForm = contentType.includes('multipart/form-data');
  const back = (q: string) => NextResponse.redirect(new URL(`/app/money/import?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app/money/import', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  // Reading a statement into his books is bookkeeping, which is the work itself.
  const gate = await gateForUser(user.id);
  if (gate === 'readonly') {
    if (isForm) return back('locked=1');
    return refuseUnentitled(req, '/app/money/import');
  }

  // A man uploads a statement a few times a year. Twelve an hour is generous to somebody
  // feeding in a shoebox of monthly exports and lethal to a loop.
  if (await rateLimitedShared(`stmtimport:${user.id}`, 12, 60 * 60 * 1000)) {
    return isForm ? back('problem=slow') : NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const part = form.get('statement');
  if (!part || typeof part === 'string' || part.size === 0) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (part.size > MAX_BYTES) {
    return isForm ? back('problem=big') : NextResponse.json({ error: 'too_big' }, { status: 413 });
  }
  const mediaType = (part.type || '').toLowerCase();
  const name = (part.name || '').toLowerCase();
  if (!CSV_TYPES.includes(mediaType) && !name.endsWith('.csv')) {
    return isForm ? back('problem=type') : NextResponse.json({ error: 'bad_type' }, { status: 415 });
  }

  const text = Buffer.from(await part.arrayBuffer()).toString('utf8');

  // The one walk, for the session's user and nobody the request named.
  const result = await ingestStatementCsv({ userId: user.id, text });

  if (result.outcome === 'rejected') {
    if (isForm) return back(`problem=${result.reason}`);
    return NextResponse.json({ error: result.reason, message: result.message }, { status: 422 });
  }
  if (result.outcome === 'failed') {
    return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  const counts =
    `bank=${result.bankCode}&read=${result.read}&known=${result.already}&fresh=${result.inserted}` +
    `&review=${result.toReview}&skipped=${result.skipped}`;
  return isForm
    ? back(`done=1&${counts}`)
    : NextResponse.json({
        ok: true,
        bank: result.bank,
        read: result.read,
        alreadyKnown: result.already,
        inserted: result.inserted,
        toReview: result.toReview,
        skipped: result.skipped,
      });
}
