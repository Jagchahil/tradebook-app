import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { hasClaudeConfig } from '../../../../lib/claude';
import {
  ingestReceiptImage, MAX_RECEIPT_BYTES, RECEIPT_IMAGE_TYPES,
} from '../../../../lib/receiptingest';
import { ingestStatementCsv } from '../../../../lib/statementingest';
import { receiptSpendBlocked } from '../../../../lib/aibudget';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

// THE ONE DOOR FOR UPLOADS. Receipts and bank statements together, sorted by what they are.
//
//   POST multipart { files: <images and CSVs>, mass?: '1' }
//     mass absent  ->  the no-script form: every file walked here, one redirect with counts
//     mass = '1'   ->  the enhanced page: ONE file per request, a JSON verdict per file
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, 12 AUGUST 2026. The founder fed a customer's receipts through the capture
// page one file at a time, stopped half way, and said the true thing out loud: nobody with a
// week of paperwork will do this. The product had two upload doors, each taking one file, each
// making him choose what the file was before it would look at it. Choosing is our job. So: one
// door, many files, and the sorting is done by the door.
//
// ⚠️ THE SORTING IS DETERMINISTIC, NOT A MODEL CALL. A CSV is a statement; an image is a
// receipt. The file says which it is by type and name, the same two allowlists the old doors
// enforce, and nothing is spent deciding. The AI reads receipts, as it always has, one call
// per photograph, behind the same wallet (lib/aibudget.ts) and the same burst guard as the
// capture page, because this door and that one are the same spend.
//
// ⚠️ ONE WALK PER KIND, AND THIS ROUTE IS A CALLER OF BOTH. ingestReceiptImage is the receipt
// walk all three existing doors share; ingestStatementCsv is the statement walk the import
// route shares. This file owns what a door owns: session, gate, limits, validity, and the
// sentence said back. Nothing lands confirmed. Nothing ever has.
//
// 🔴 THE TWO MODES EXIST BECAUSE OF THE PLATFORM'S BODY CAP. Real photographs run two to four
// megabytes and Vercel refuses request bodies past about four and a half, so "everything in
// one request" breaks on exactly the shoebox this door is for. With script, the page streams
// one file per request and there is no ceiling that matters. Without script, the plain form
// still works for what fits in one body, capped at a count a single invocation can walk
// honestly, and the redirect says when files were left unwalked rather than pretending.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';
// A no-script batch walks several vision reads in one invocation; sixty seconds is the same
// room the WhatsApp webhook gets for the same work.
export const maxDuration = 60;

// The most files one NO-SCRIPT submission will walk. Six vision reads fit a single invocation
// with room to spare; more than that only arrives from the enhanced page, which streams. The
// redirect carries left=N when a bigger set was posted, so nothing is dropped silently.
const NOJS_MAX_FILES = 6;

// Same tiebreak the import route keeps: browsers disagree about what a CSV is called, so the
// extension answers when the type is missing or generic.
const CSV_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream', ''];

type Kind = 'receipt' | 'statement' | 'neither';

function kindOf(file: File): Kind {
  const mediaType = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (RECEIPT_IMAGE_TYPES.includes(mediaType)) return 'receipt';
  if (name.endsWith('.csv') && (CSV_TYPES.includes(mediaType) || mediaType === '')) return 'statement';
  if (CSV_TYPES.includes(mediaType) && mediaType !== '' && mediaType !== 'application/octet-stream' && mediaType !== 'text/plain') {
    // text/csv and friends without the extension still read as a statement; the two generic
    // types only count with the .csv name, because every unnamed blob arrives as one of them.
    return 'statement';
  }
  return 'neither';
}

// One file, walked. The verdicts a caller can say a sentence about, whichever mode asked.
type FileVerdict =
  | { kind: 'receipt'; outcome: 'logged' | 'merged' | 'already' | 'unread' | 'failed' | 'big' | 'budget' | 'slow' }
  | { kind: 'statement'; outcome: 'done'; read: number; known: number; fresh: number; review: number; skipped: number }
  | { kind: 'statement'; outcome: 'rejected' | 'failed' | 'big' | 'slow' }
  | { kind: 'neither'; outcome: 'type' };

async function walkOne(userId: string, file: File): Promise<FileVerdict> {
  const kind = kindOf(file);
  if (kind === 'neither') return { kind: 'neither', outcome: 'type' };

  if (kind === 'statement') {
    if (file.size > MAX_RECEIPT_BYTES) return { kind: 'statement', outcome: 'big' };
    // The same key and ceiling as the statement page, so the two doors are one allowance.
    if (await rateLimitedShared(`stmtimport:${userId}`, 12, 60 * 60 * 1000)) {
      return { kind: 'statement', outcome: 'slow' };
    }
    const text = Buffer.from(await file.arrayBuffer()).toString('utf8');
    const result = await ingestStatementCsv({ userId, text });
    if (result.outcome === 'rejected') return { kind: 'statement', outcome: 'rejected' };
    if (result.outcome === 'failed') return { kind: 'statement', outcome: 'failed' };
    return {
      kind: 'statement',
      outcome: 'done',
      read: result.read,
      known: result.already,
      fresh: result.inserted,
      review: result.toReview,
      skipped: result.skipped,
    };
  }

  if (file.size > MAX_RECEIPT_BYTES) return { kind: 'receipt', outcome: 'big' };
  // The same key and ceiling as the capture page, so the two doors are one allowance.
  if (await rateLimitedShared(`receiptweb:${userId}`, 40, 10 * 60 * 1000)) {
    return { kind: 'receipt', outcome: 'slow' };
  }
  // One wallet check per photograph, because each photograph is one model call.
  if (await receiptSpendBlocked(userId)) return { kind: 'receipt', outcome: 'budget' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await ingestReceiptImage({
    userId,
    bytes,
    mediaType: (file.type || '').toLowerCase(),
    sourceType: 'web_image',
  });
  switch (result.outcome) {
    case 'logged': return { kind: 'receipt', outcome: 'logged' };
    case 'merged': return { kind: 'receipt', outcome: 'merged' };
    case 'duplicate': return { kind: 'receipt', outcome: 'already' };
    // 🔴 S1. Its bytes are not the picture it claimed to be, so it lands in the same bucket as a
    // file that was never a receipt or a statement. That bucket is counted as typebad and already
    // has its sentence: nothing new to say and nothing new to sign.
    case 'nottype': return { kind: 'neither', outcome: 'type' };
    case 'unread': return { kind: 'receipt', outcome: 'unread' };
    case 'failed': return { kind: 'receipt', outcome: 'failed' };
  }
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  const isForm = contentType.includes('multipart/form-data');
  const back = (q: string) => NextResponse.redirect(new URL(`/app/money/upload?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app/money/upload', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. Reading his paperwork is the work itself.
  const gate = await gateForUser(user.id);
  if (gate === 'readonly') {
    if (isForm) return back('locked=1');
    return refuseUnentitled(req, '/app/money/upload');
  }

  const form = await req.formData().catch(() => null);
  if (!form) return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const files = form.getAll('files').filter(
    (f): f is File => typeof f !== 'string' && f.size > 0,
  );
  if (files.length === 0) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'no_file' }, { status: 400 });
  }

  // Receipt reading needs the model; statements never do. A build without the key still reads
  // every CSV and says plainly why the photographs waited.
  const configured = hasClaudeConfig();

  // ── THE ENHANCED PAGE'S MODE: one file per request, one JSON verdict back. ────────────────
  if (form.get('mass') === '1') {
    const file = files[0];
    if (kindOf(file) === 'receipt' && !configured) {
      return NextResponse.json({ kind: 'receipt', outcome: 'off' });
    }
    const verdict = await walkOne(user.id, file);
    return NextResponse.json(verdict);
  }

  // ── THE PLAIN FORM'S MODE: walk what one invocation honestly can, count the rest. ─────────
  const batch = files.slice(0, NOJS_MAX_FILES);
  const left = files.length - batch.length;

  let logged = 0; let merged = 0; let already = 0; let unread = 0; let failed = 0;
  let stmts = 0; let read = 0; let known = 0; let fresh = 0; let review = 0; let skipped = 0;
  let typebad = 0; let toobig = 0; let budget = 0; let slow = 0; let off = 0;

  for (const file of batch) {
    if (kindOf(file) === 'receipt' && !configured) { off++; continue; }
    const v = await walkOne(user.id, file);
    if (v.kind === 'neither') { typebad++; continue; }
    if (v.kind === 'statement') {
      if (v.outcome === 'done') { stmts++; read += v.read; known += v.known; fresh += v.fresh; review += v.review; skipped += v.skipped; }
      else if (v.outcome === 'big') toobig++;
      else if (v.outcome === 'slow') slow++;
      else failed++;
      continue;
    }
    switch (v.outcome) {
      case 'logged': logged++; break;
      case 'merged': merged++; break;
      case 'already': already++; break;
      case 'unread': unread++; break;
      case 'big': toobig++; break;
      case 'budget': budget++; break;
      case 'slow': slow++; break;
      case 'failed': failed++; break;
    }
  }

  const counts =
    `done=1&logged=${logged}&merged=${merged}&already=${already}&unread=${unread}` +
    `&stmts=${stmts}&read=${read}&known=${known}&fresh=${fresh}&review=${review}&skipped=${skipped}` +
    `&typebad=${typebad}&toobig=${toobig}&budget=${budget}&slow=${slow}&failed=${failed}&off=${off}&left=${left}`;
  return isForm ? back(counts) : NextResponse.json({
    ok: true, logged, merged, already, unread, stmts, read, known, fresh, review, skipped, typebad, toobig, budget, slow, failed, off, left,
  });
}
