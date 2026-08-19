import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { userBurst } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';
import { MAX_RECEIPT_BYTES, RECEIPT_IMAGE_TYPES, bytesConfirmType } from '../../../../lib/receiptingest';
import { addJobPhoto, readDiaryJob, storeJobPhotoImage } from '../../../../lib/supabase';
import { captionOrNull } from '../../../../lib/jobphotos';

export const runtime = 'nodejs';

// A PHOTOGRAPH OF HIS OWN JOB, UPLOADED BY HIM.
//
//   POST multipart { job: <uuid>, photo: <image>, caption?: <his words> }
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 OWNER UPLOAD ONLY, AND THERE IS NOTHING ELSE TO DESIGN HERE. No team accounts, no shared
// write access, no invitations, no links anybody else can post to. A colleague sends him a
// photograph however he likes and HE uploads it. That deletes the data protection problem rather
// than solving it: every row this route writes carries the user_id of the session that posted it,
// and no code anywhere has to reason about a second person's permission to touch his book.
//
// ⚠️ A PHOTOGRAPH IS NOT MONEY, so there is no approval gate on it. It touches no tax figure,
// changes no total and reaches no return. Everything on this product that MOVES A NUMBER still
// asks him first, and that line has not moved: this route writes a picture and a caption and
// nothing else. It cannot create a transaction, it cannot set a category and it cannot mark
// anything confirmed.
//
// ⚠️ THE JOB IS PROVED HIS BEFORE THE BYTES ARE STORED. readDiaryJob filters on user AND row, so
// a stranger's job uuid pasted into the form comes back null and this route stops before it has
// spent a single byte of storage on it. Checking after the upload would leave an orphaned object
// in the bucket for every hostile post.
//
// ⚠️ THE LIMITS ARE THE RECEIPT PATH'S, IMPORTED RATHER THAN COPIED. MAX_RECEIPT_BYTES and
// RECEIPT_IMAGE_TYPES are the same ceiling and the same allowlist the receipt upload enforces,
// because both doors put bytes in the SAME private bucket. Two copies of a size limit is one
// limit somebody raises and one nobody remembers.
//
// ⚠️ AND STORAGE IS EVIDENCE, NEVER A DEPENDENCY. A failed upload comes back as a plain sentence
// on the job screen. It never throws, and it never leaves a row pointing at bytes that are not
// there: the row is written only after the object is stored.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const job = (id: string, q: string) =>
    NextResponse.redirect(new URL(`/app/diary?job=${encodeURIComponent(id)}&${q}`, req.url), 303);
  const diary = (q: string) => NextResponse.redirect(new URL(`/app/diary?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/diary', req.url), 303);

  if (await userBurst('diaryphoto', user.id)) return diary('problem=slow');

  const f = await req.formData().catch(() => null);
  if (!f) return diary('problem=bad');

  const jobId = String(f.get('job') ?? '');
  if (!UUID.test(jobId)) return diary('problem=bad');

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'. Keeping a
  // photograph is new work and it costs storage, so it sits with adding a job rather than with
  // marking one done. Taking a picture back down is NOT gated, for the same reason removing a
  // diary row is not: undoing his own thing must never cost £12.99. That action is on /api/diary.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/diary');

  // His job, or nothing. Read before a byte is stored.
  const row = await readDiaryJob(user.id, jobId);
  if (!row) return diary('problem=missing');

  const part = f.get('photo');
  if (!part || typeof part === 'string' || part.size === 0) return job(jobId, 'problem=nophoto');
  if (part.size > MAX_RECEIPT_BYTES) return job(jobId, 'problem=big');
  const mediaType = (part.type || '').toLowerCase().split(';')[0].trim();
  if (!RECEIPT_IMAGE_TYPES.includes(mediaType)) return job(jobId, 'problem=type');

  const bytes = new Uint8Array(await part.arrayBuffer());
  // 🔴 S1. THE FIFTH DOOR, AND THE ONLY ONE THAT DOES NOT GO THROUGH ingestReceiptImage. It shares
  // this path's size and type lists with the receipt walk rather than copying them, and from today
  // it shares the byte check too. Same answer as a declared type we do not take, three lines up:
  // the file is not a picture, and how it came to be wrong is not his problem to distinguish.
  if (!bytesConfirmType(bytes, mediaType)) return job(jobId, 'problem=type');
  const storagePath = await storeJobPhotoImage(user.id, bytes, mediaType);
  if (!storagePath) return job(jobId, 'problem=unavailable');

  // His words about the picture, or nothing at all. Never generated and never required.
  const caption = captionOrNull(f.get('caption'));

  const wrote = await addJobPhoto(user.id, jobId, storagePath, caption);
  if (!wrote) return job(jobId, 'problem=unavailable');

  return job(jobId, 'done=photo');
}
