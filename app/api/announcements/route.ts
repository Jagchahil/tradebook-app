import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import { readAnnouncementSources, dismissAnnouncement, undismissAnnouncement } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
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
  const user = await sessionUser(req);
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
// ⚠️ IT ANSWERS A FORM AS WELL AS A FETCH, and the web Overview posts a form.
//
// The phone app sends JSON and reads JSON back. The web app ships no client JavaScript at all, so
// its clear button is an ordinary <form method="post"> and it needs a redirect back to the page
// rather than a JSON body the browser would render as a page of text. Same route, same gate, same
// validation, same write: only the reply differs, decided by the content type the caller sent. That
// is the shape /api/billing/checkout already uses.
//
// The redirect is a 303 so the back button cannot re-post the dismissal.
export async function POST(req: NextRequest) {
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const back = (query: string) => NextResponse.redirect(new URL(`/app${query}`, req.url), 303);
  const fail = (error: string, status: number) => (
    isForm ? back('?notice=notcleared') : NextResponse.json({ error }, { status })
  );

  const user = await sessionUser(req);
  // A form caller with no session is a man whose session expired while the page sat open. Send him
  // to the door, not to a JSON error he cannot read.
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (await userBurst('announcements-dismiss', user.id)) return fail('slow down', 429);

  let key = '';
  let action: 'dismiss' | 'undo' = 'dismiss';
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return back('?notice=notcleared');
    key = String(f.get('key') ?? '').trim();
    action = f.get('action') === 'undo' ? 'undo' : 'dismiss';
  } else {
    let body: { key?: unknown; action?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }
    key = typeof body.key === 'string' ? body.key.trim() : '';
    action = body.action === 'undo' ? 'undo' : 'dismiss';
  }

  // The key shape is fixed by khojiKey()/manualKey(). Validating it here keeps arbitrary strings out
  // of a table whose whole value is that one row means one card.
  if (!key || key.length > 200 || !/^(khoji|lekhio):[A-Za-z0-9._-]{1,120}$/.test(key)) {
    return fail('bad_request', 400);
  }

  const done = action === 'undo'
    ? await undismissAnnouncement(user.id, key)
    : await dismissAnnouncement(user.id, key);

  // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. The banner puts the card back on a non-ok
  // rather than leaving him believing he cleared something he did not, and watching it return
  // tomorrow with no explanation. The form caller gets the same honesty: the page reloads with the
  // card still on it, because the write that would have removed it did not happen.
  if (!done) return fail('write_failed', 502);

  if (isForm) return back('');

  return NextResponse.json({ ok: true, key, action });
}
