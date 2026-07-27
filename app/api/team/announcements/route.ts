import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken, readTeamMember,
  readAnnouncementsForTeam, writeAnnouncement, retireAnnouncement, readAnnouncementSources,
} from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { sanitiseDashes, hasForbiddenDash } from '../../../../lib/housestyle';
import { isCitable, MAX_BODY_CHARS, selectAnnouncements, appliedLineFor } from '../../../../lib/announcements';

export const runtime = 'nodejs';

// A user id belonging to nobody, so the preview's dismissals read comes back empty and the desk sees
// what a BRAND NEW customer sees. Not the team member's own id: what he has personally cleared off
// his own screen is not what he is trying to check.
const NOBODY = '00000000-0000-0000-0000-000000000000';

// PUBLISHING IN OUR OWN VOICE. The other half of the announcements banner.
//
// Khoji's approved findings reach the banner on their own, read live from knowledge_items. This is
// for the sentences a machine cannot write: "you can now upload receipts from the web", or a plainer
// wording of a finding whose distilled summary reads like a statutory instrument.
//
// ⚠️ WHAT THIS ROUTE IS NOT. It is not a second approval gate and it cannot be used as one. Setting
// knowledge_item_id does NOT publish an unapproved finding: it only replaces the wording of a card
// that lib/announcements.ts would already have shown on its own, and if that finding is not
// approved, nothing appears at all. There is no path through this endpoint that puts an unreviewed
// row in front of a customer, and there must never be one.
//
// Every customer reads what this writes, so it carries a name and a date, exactly like the approve
// button on the Brain desk. Membership is re-checked on this request, not once at sign in.
export async function GET(req: NextRequest) {
  const gate = await team(req);
  if ('res' in gate) return gate.res;

  const rows = await readAnnouncementsForTeam();
  if (rows === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  // 🔴 THE CUSTOMER'S EYE VIEW, computed by the SAME function the customer route calls.
  //
  // Not a mock up of the banner, not a second renderer, not "roughly what he will see". The desk
  // shows selectAnnouncements' actual output, through the actual banner component, so approving a
  // card on the Brain desk and watching it appear here is real proof the pipe is connected end to
  // end. If this ever disagrees with what a customer sees, one of them is a second implementation
  // and it has to go.
  //
  // dismissedKeys is forced empty: this is what a NEW customer sees, not what this team member has
  // personally cleared off his own screen.
  const sources = await readAnnouncementSources(NOBODY);
  const preview = sources
    ? selectAnnouncements({
        knowledge: sources.knowledge,
        manual: sources.manual,
        appliedItemIds: sources.appliedItemIds,
        dismissedKeys: [],
      }).map((a) => ({
        key: a.key, source: a.source, title: a.title, body: a.body, sourceUrl: a.sourceUrl,
        effectiveDate: a.effectiveDate, appliedLine: appliedLineFor(a), at: a.at,
      }))
    : null;

  const now = Date.now();
  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      // Live or retired, said plainly, so the desk never has to work it out from two timestamps.
      live: !r.expires_at || Date.parse(r.expires_at) > now,
    })),
    // null means we could not read the sources. Not the same as "a customer sees nothing", and the
    // desk says which, because a banner that is empty because the database timed out must not read
    // as a quiet week.
    preview,
  });
}

export async function POST(req: NextRequest) {
  const gate = await team(req);
  if ('res' in gate) return gate.res;
  const { email } = gate;

  let body: { action?: unknown; id?: unknown; title?: unknown; body?: unknown; sourceUrl?: unknown; knowledgeItemId?: unknown; expiresAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  // TAKING ONE DOWN. It expires, it is never deleted: a thing we said to six thousand people is a
  // thing we said, and the record of having said it does not vanish because we changed our minds.
  if (body.action === 'retire') {
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const done = await retireAnnouncement(id);
    if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });
    return NextResponse.json({ ok: true, id, action: 'retire' });
  }

  const title = typeof body.title === 'string' ? sanitiseDashes(body.title.trim()) : '';
  const text = typeof body.body === 'string' ? sanitiseDashes(body.body.trim()) : '';
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : '';
  const knowledgeItemId = typeof body.knowledgeItemId === 'string' ? body.knowledgeItemId.trim() : '';
  const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt.trim() : '';

  if (!title) return NextResponse.json({ error: 'no_title' }, { status: 400 });
  if (title.length > 120) return NextResponse.json({ error: 'title_too_long' }, { status: 400 });

  // ⚠️ REFUSED AT WRITE TIME, NOT SILENTLY DROPPED AT READ TIME.
  //
  // lib/announcements.ts already declines to render a body over the cap, whole rather than cut, so a
  // long note would have been safe. It would also have been INVISIBLE: published, sitting in the
  // table, shown to nobody, and the man who wrote it would never know. That is the house disease
  // wearing a new coat. So the desk is told now, while he can still shorten it.
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: 'body_too_long', max: MAX_BODY_CHARS, was: text.length }, { status: 400 });
  }
  if (sourceUrl && !isCitable(sourceUrl)) {
    return NextResponse.json({ error: 'bad_source_link' }, { status: 400 });
  }
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    return NextResponse.json({ error: 'bad_expiry' }, { status: 400 });
  }

  // The house style lock, applied before the write and asserted after the sanitiser has run. If a
  // dash survives sanitiseDashes we do not want to know about it on a customer's screen.
  if (hasForbiddenDash(title) || hasForbiddenDash(text)) {
    return NextResponse.json({ error: 'house_style' }, { status: 400 });
  }

  const done = await writeAnnouncement({
    title,
    body: text || null,
    sourceUrl: sourceUrl || null,
    knowledgeItemId: knowledgeItemId || null,
    expiresAt: expiresAt || null,
    byEmail: email,
  });
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });

  return NextResponse.json({ ok: true, title });
}

// The gate, once, for both verbs. Returns the publisher's email on success, because an announcement
// we cannot attribute is "the system decided", which is the thing we are here to prevent.
async function team(req: NextRequest): Promise<{ email: string } | { res: NextResponse }> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return { res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return { res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };

  // ⚠️ NO EMAIL, NO PUBLISHING. Same rule as the approve button, and for the same reason: the whole
  // value of the record is that it says WHO. `user.email ?? ''` would write an announcement we
  // cannot attribute, dressed as a passing build.
  if (!user.email) return { res: NextResponse.json({ error: 'no_identity' }, { status: 403 }) };

  return { email: user.email };
}
