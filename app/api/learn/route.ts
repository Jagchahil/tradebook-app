import { NextRequest, NextResponse } from 'next/server';
import {
  getTransactionForLearning,
  getUserRules,
  learnVendor,
  forgetUserRule,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { learn, normaliseVendor } from '../../../lib/memory';
import { rateLimitedShared } from '../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';

// What Lekhio has learned.
//
//   GET                     -> { rules }   everything it remembers about you
//   POST { id }             -> { ok, learned }  learn from a correction just made
//   POST { forget: <key> }  -> { ok }      take a lesson back
//
// THE POINT: A BLOKE BUYING FROM "BOB'S WINDOWS LTD".
//
// No keyword map will ever know that shop, and no crowd has voted on it. The old
// behaviour was to file it under "other" forever, and to make him re-file it by
// hand every single month.
//
// THE FIX IS NOT ANOTHER BUTTON. Confirming an entry with a category IS the lesson.
// Nobody has ever meant "file this as materials, but forget it immediately", so
// asking "shall we remember this?" would make him do the work twice to answer a
// question with only one sensible answer. So we just learn, tell him plainly that
// we did, and let him take it back whenever he likes.
//
// Everything here is scoped to the caller's own account. A lesson is theirs.

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app');

  const rules = await getUserRules(user.id);
  // Most used first: the ones actually saving them time.
  rules.sort((a, b) => b.hits - a.hits);
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`learn:${user.id}`, 300, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  let body: { id?: string; forget?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Take a lesson back. Always allowed, no questions.
  if (typeof body.forget === 'string') {
    const ok = await forgetUserRule(user.id, normaliseVendor(body.forget) || body.forget);
    return NextResponse.json({ ok });
  }

  if (typeof body.id !== 'string') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // Learn from the correction the user just made to this entry.
  const tx = await getTransactionForLearning(user.id, body.id);
  if (!tx) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const lesson = learn({
    vendor: tx.vendor,
    category: tx.category,
    isPersonal: tx.is_personal,
  });
  if (!lesson) return NextResponse.json({ ok: true, learned: null });

  await learnVendor(user.id, lesson.vendorKey, lesson.category, lesson.isPersonal, lesson.shareable);

  // Returned so the app can say, quietly and honestly, what it just remembered.
  return NextResponse.json({
    ok: true,
    learned: {
      vendor: tx.vendor,
      category: lesson.category,
      // Whether this also went into the anonymous pool. A category is a fact about
      // a MERCHANT and is safe to share. Anything personal never leaves the account.
      shared: lesson.shareable,
    },
  });
}
