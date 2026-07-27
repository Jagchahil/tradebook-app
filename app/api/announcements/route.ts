import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import { verifyAccessToken, readAnnouncementSources, dismissAnnouncement, undismissAnnouncement } from '../../../lib/supabase';
import { selectAnnouncements, appliedLineFor } from '../../../lib/announcements';

export const runtime = 'nodejs';

// WHAT CHANGED, AND WHAT IT MEANS FOR HIM. The banner across the top of the product.
//
// This is the first route in the codebase that takes something Khoji learned off GOV.UK and puts it
// in front of a paying customer. Everything Khoji does already works: it reads the law nightly, a
// human approves what matters on the Brain desk, and the approved figure moves the tax engine. What
// has never existed is the sentence that tells the man it happened. He has been paying for a
// watchman he cannot see.
//
// ⚠️ THE GATE LIVES IN lib/announcements.ts, NOT HERE, AND THAT IS THE POINT.
//
// This route reads rows and renders what the pure module hands back. It does not decide what is
// customer safe, it does not have its own idea of which status counts, and it must never grow one.
// The moment a second place in this codebase decides what a customer may be told about tax law,
// the approve button on the Brain desk stops meaning anything, because there is a way round it.
// test/announcements.test.mjs proves the module refuses 720 shapes of unapproved row. It can only
// keep proving that while this file has no opinion of its own.
//
// NOTHING PERSONAL GOES OUT OF HERE. An announcement is a fact about the law, identical for every
// reader. The only per-user thing in the whole request is which cards he has already cleared.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('announcements', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  const sources = await readAnnouncementSources(user.id);

  // WE COULD NOT READ IT. Not the same as "there is nothing to say", and the banner renders the same
  // either way, so the difference has to survive somewhere. It survives here, as a status code the
  // caller can log, rather than as a 200 with an empty list that quietly means a database timeout.
  // This codebase's disease is silent success: a job that does nothing and returns 200.
  if (!sources) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  const items = selectAnnouncements({
    knowledge: sources.knowledge,
    manual: sources.manual,
    appliedItemIds: sources.appliedItemIds,
    dismissedKeys: sources.dismissedKeys,
  });

  return NextResponse.json({
    items: items.map((a) => ({
      key: a.key,
      source: a.source,
      title: a.title,
      body: a.body,
      sourceUrl: a.sourceUrl,
      effectiveDate: a.effectiveDate,
      // The reassurance sentence comes from the module, which refuses to produce it for an item it
      // cannot prove. A caller cannot forget the check, because there is nothing here to forget.
      appliedLine: appliedLineFor(a),
      at: a.at,
    })),
  });
}

// DISMISS, AND UNDO. His screen, his decision, and reversible.
//
// Doc 103: acting for a man is only kindness when it is reversible and it is his. Clearing a card is
// as small and as personal as a decision gets, so it takes one tap and no confirmation, and it can
// be taken straight back. Compare the rules in CLAUDE.md: money, tax filing and anything sent to
// another human being always ask. This is none of those.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('announcements-dismiss', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  let body: { key?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const action = body.action === 'undo' ? 'undo' : 'dismiss';

  // The key shape is fixed by khojiKey()/manualKey(). Validating it here keeps arbitrary strings out
  // of a table whose whole value is that one row means one card.
  if (!key || key.length > 200 || !/^(khoji|lekhio):[A-Za-z0-9._-]{1,120}$/.test(key)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const done = action === 'undo'
    ? await undismissAnnouncement(user.id, key)
    : await dismissAnnouncement(user.id, key);

  // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. The banner puts the card back on a non-ok
  // rather than leaving him believing he cleared something he did not, and watching it return
  // tomorrow with no explanation.
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });

  return NextResponse.json({ ok: true, key, action });
}
