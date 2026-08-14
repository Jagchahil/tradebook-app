import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../../lib/webauth';
import { readJobPhotoBytes } from '../../../../../lib/supabase';

export const runtime = 'nodejs';

// ONE OF HIS JOB PHOTOGRAPHS, AS PIXELS, FROM OUR OWN ORIGIN.
//
//   GET /api/diary/photo/view?id=<photo uuid>  ->  the image bytes, or 404
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS ROUTE EXISTS BECAUSE THE FEATURE SHIPPED BLIND ON 14 AUGUST 2026.
//
// The job screen first drew each photograph from a ten minute signed URL on the storage host.
// Storage served it perfectly: 200, image/png, the right bytes. Nothing rendered, on any
// account, ever, because next.config.mjs sends `img-src 'self' data: blob:` and the storage
// origin is not in that list. A whole feature that stored, signed and served correctly and could
// not put one picture on one screen.
//
// The obvious repair was to add the storage host to img-src. That is one line and it is the
// wrong line. It would put a URL in the HTML of every job page that is a bearer token for ten
// minutes to anybody who reads the source, and it would let a third party origin draw pixels
// into our pages for ever afterwards. So the bytes come through here instead: `img-src 'self'`
// is untouched, no signed URL is ever written into a document, and the tenancy check happens on
// our own server where the session already is.
//
// ⚠️ THE ID IS IN THE QUERY STRING AND THAT IS SAFE HERE, for the reason it is safe everywhere
// else in this codebase: the read filters on the SESSION'S user id AND the row. A stranger's
// photo uuid matches nothing and comes back as an honest 404. readJobPhotoBytes additionally
// refuses any storage path that is not inside his own folder, whatever the row claims.
//
// ⚠️ private, no-store, AND nosniff. A photograph of a customer's house is not a thing to leave
// in a shared cache, and a bucket object must never be sniffed into something executable.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  // 🔴 NOT GATED ON THE PAYWALL, and that is the same argument the diary's own read makes:
  // looking at his own record is never the work. A lapsed card must not hide his evidence from
  // him. Keeping a NEW photograph is gated, on /api/diary/photo.
  const user = await sessionUser(req);
  if (!user) return new NextResponse(null, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!UUID.test(id)) return new NextResponse(null, { status: 404 });

  const photo = await readJobPhotoBytes(user.id, id);
  // Missing, not his, unreadable, or not an image: all one answer. A route that distinguished
  // them would tell a stranger which uuids exist.
  if (!photo) return new NextResponse(null, { status: 404 });

  return new NextResponse(photo.bytes, {
    status: 200,
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
