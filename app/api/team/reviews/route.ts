import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken, readTeamMember,
  listTestimonialsForTeam, writeTestimonial, setTestimonialPublished, deleteTestimonial,
} from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { sanitiseDashes, hasForbiddenDash } from '../../../../lib/housestyle';

export const runtime = 'nodejs';

// PUBLISHING A REAL CUSTOMER QUOTE, FROM /team. The other half of the testimonials feature.
//
// ⚠️ WHAT THIS ROUTE IS AND IS NOT. It is the ONLY way a review reaches the public homepage, and it
// is gated on team membership re-checked on this request, not once at sign in. No review text lives
// in the code any more, so there is no copy and paste path a rogue quote can take: it exists in the
// database because a named team member typed it here, or it does not exist. That is what makes the
// anti invention rule (CAP 3.47 and 3.50, DMCC Act 2024 Schedule 20 para 13) stronger than an empty
// array with a comment on it. The founder holds the evidence and the permission off system; this
// endpoint holds who published it and when.
//
// The house style lock and the length caps are the same shape as the announcements route, for the
// same reason: a dash or an overlong field must be refused while the writer can still fix it, not
// dropped in silence at read time.
const MAX_QUOTE_CHARS = 280;
const MAX_NAME_CHARS = 80;
const MAX_TRADE_CHARS = 80;
const MAX_SOURCE_CHARS = 60;

export async function GET(req: NextRequest) {
  const gate = await team(req);
  if ('res' in gate) return gate.res;

  const items = await listTestimonialsForTeam();
  if (items === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const gate = await team(req);
  if ('res' in gate) return gate.res;
  const { email } = gate;

  let body: { quote?: unknown; name?: unknown; trade?: unknown; rating?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const quote = typeof body.quote === 'string' ? sanitiseDashes(body.quote.trim()) : '';
  const name = typeof body.name === 'string' ? sanitiseDashes(body.name.trim()) : '';
  const trade = typeof body.trade === 'string' ? sanitiseDashes(body.trade.trim()) : '';
  const source = typeof body.source === 'string' ? sanitiseDashes(body.source.trim()) : '';
  const rating = typeof body.rating === 'number' ? body.rating : Number(body.rating);

  if (!quote) return NextResponse.json({ error: 'no_quote' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'no_name' }, { status: 400 });
  if (!trade) return NextResponse.json({ error: 'no_trade' }, { status: 400 });
  if (quote.length > MAX_QUOTE_CHARS) return NextResponse.json({ error: 'quote_too_long', max: MAX_QUOTE_CHARS }, { status: 400 });
  if (name.length > MAX_NAME_CHARS) return NextResponse.json({ error: 'name_too_long', max: MAX_NAME_CHARS }, { status: 400 });
  if (trade.length > MAX_TRADE_CHARS) return NextResponse.json({ error: 'trade_too_long', max: MAX_TRADE_CHARS }, { status: 400 });
  if (source.length > MAX_SOURCE_CHARS) return NextResponse.json({ error: 'source_too_long', max: MAX_SOURCE_CHARS }, { status: 400 });

  // The rating is a claim of its own and it must be a whole 1 to 5. A star count nobody gave is the
  // same kind of invention as a quote nobody said.
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'bad_rating' }, { status: 400 });
  }

  // The house style lock, applied before the write and asserted after the sanitiser has run. If a
  // dash survives sanitiseDashes we do not want to know about it on the front door.
  if (hasForbiddenDash(quote) || hasForbiddenDash(name) || hasForbiddenDash(trade) || hasForbiddenDash(source)) {
    return NextResponse.json({ error: 'house_style' }, { status: 400 });
  }

  const done = await writeTestimonial({ quote, name, trade, rating, source: source || null }, email);
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });

  return NextResponse.json({ ok: true, name });
}

// Hiding or showing one, without destroying the record that it was said.
export async function PATCH(req: NextRequest) {
  const gate = await team(req);
  if ('res' in gate) return gate.res;

  let body: { id?: unknown; published?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  if (typeof body.published !== 'boolean') return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const done = await setTestimonialPublished(id, body.published);
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  return NextResponse.json({ ok: true, id, published: body.published });
}

// Removing one for good, e.g. when permission is withdrawn.
export async function DELETE(req: NextRequest) {
  const gate = await team(req);
  if ('res' in gate) return gate.res;

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

  const done = await deleteTestimonial(id);
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });
  return NextResponse.json({ ok: true, id, action: 'delete' });
}

// The gate, once, for every verb. Returns the publisher's email on success, because a testimonial we
// cannot attribute is "the system decided", which is the thing we are here to prevent.
async function team(req: NextRequest): Promise<{ email: string } | { res: NextResponse }> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return { res: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return { res: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };

  // ⚠️ NO EMAIL, NO PUBLISHING. Same rule as the approve button: the whole value of the record is
  // that it says WHO, and `user.email ?? ''` would write a testimonial we cannot attribute.
  if (!user.email) return { res: NextResponse.json({ error: 'no_identity' }, { status: 403 }) };

  return { email: user.email };
}
