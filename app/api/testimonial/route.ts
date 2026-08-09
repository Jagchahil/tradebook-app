import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import { userBurst } from '../../../lib/ratelimit';
import { sanitiseDashes, hasForbiddenDash } from '../../../lib/housestyle';
import { writeOwnTestimonial, deleteOwnTestimonial } from '../../../lib/supabase';

export const runtime = 'nodejs';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A CUSTOMER'S OWN TESTIMONIAL, WRITTEN AND WITHDRAWN BY HIM.
//
// Until 9 August 2026 a testimonial could only be typed in by somebody at Lekhio, and the row had
// no identity column at all: only created_by, the TEAM MEMBER who entered it. So a customer's name
// and his words sat on the public homepage and NOTHING COULD TAKE THEM DOWN on request, because
// nothing left in the database remembered they were his. An erasure walked straight past them.
//
// The obvious fix was a "customer email" box on the console for a team member to fill in. This is
// better and it was Jag's: he writes it himself, from inside his own account, so the user id is on
// the row BY CONSTRUCTION. Consent is given by the person, in his own words, at a moment he chose,
// which is what CAP 3.47 and the DMCC Act 2024 actually want from a testimonial, and withdrawal is
// as easy as giving it, which is what Article 7(3) wants from consent.
//
// ⚠️ HE CANNOT PUBLISH HIMSELF. writeOwnTestimonial forces published false and this route has no
// way to ask for anything else. Otherwise this is a text box on the front page of lekhio.app that
// anyone who can open an account can type into. Somebody at Lekhio publishes it from the console,
// or it is never seen by anybody but him.
//
// ⚠️ EVERY OPERATION IS SCOPED BY THE SESSION'S user id, never by an id in the body. There is no
// id he could learn, guess or be sent that would let him touch another man's words.
//
// ⚠️ NEITHER DIRECTION IS GATED ON ENTITLEMENT, and lib/gate.ts carries the reasoning. Writing one
// is HIM DOING US A FAVOUR, with no work of ours behind it and no cost to us. Taking it down is
// stronger than that: withdrawal of consent under Article 7(3) has to be as easy as giving it, so a
// lapsed subscription must never be able to hold a man's name on a marketing page.
//
// 🔴 THIS ROUTE READS NO NAME AND NO TRADE OFF THE FORM, AND THAT IS THE SECURITY PROPERTY.
//
// It used to post both as text. A name that arrives in a request body is a name HE CHOSE, not a
// name he HAS, so any account could have published a quote signed as somebody else: a plumber's
// competitor, a made up firm, the founder. The entire worth of a testimonial is that a real named
// person actually said it, and CAP 3.47 and the DMCC Act 2024 ban the invented kind outright.
//
// So the browser sends TWO BOOLEANS saying what he wants shown, and lib/supabase decides what they
// mean by reading his own users row. There is no string on this door that reaches the by-line.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const MAX_QUOTE_CHARS = 280;

// An HTML checkbox sends its value when ticked and sends the field NOT AT ALL when it is not, so
// absence is off and there is no third state to interpret.
const ticked = (v: FormDataEntryValue | null) => v !== null;

const back = (req: NextRequest, q: string) =>
  NextResponse.redirect(new URL(`/app/you/testimonial${q}`, req.url), 303);

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/you/testimonial', req.url), 303);

  // Durable shared burst limit on the account, the same discipline as every other write door.
  if (await userBurst('testimonial', user.id, 6)) return back(req, '?problem=slow');

  const f = await req.formData().catch(() => null);
  if (!f) return back(req, '?problem=bad');

  // ⚠️ THE INTENT IS A FIELD, NOT A METHOD. This page is a plain form with no client JavaScript,
  // like every other write surface in the app, and a form cannot send DELETE.
  if (String(f.get('intent') ?? '') === 'remove') {
    const gone = await deleteOwnTestimonial(user.id);
    return back(req, gone ? '?removed=1' : '?problem=unavailable');
  }

  const quote = sanitiseDashes(String(f.get('quote') ?? '').trim());
  const rating = Number(f.get('rating'));
  const showName = ticked(f.get('showname'));
  const showTrade = ticked(f.get('showtrade'));

  if (!quote) return back(req, '?problem=noquote');
  if (quote.length > MAX_QUOTE_CHARS) return back(req, '?problem=toolong');

  // A star count nobody gave is the same kind of invention as a quote nobody said.
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return back(req, '?problem=rating');

  // The house style lock, asserted AFTER the sanitiser has run. Same order as the team door: if a
  // dash survives sanitiseDashes we do not want to find out about it on the homepage. Only the
  // quote is checked because only the quote came off this form; the name and the trade come off
  // his own row, which /app/you/settings already holds to the same rule.
  if (hasForbiddenDash(quote)) return back(req, '?problem=style');

  const done = await writeOwnTestimonial(user.id, { quote, rating, showName, showTrade });
  // A failed write must not look like a saved one. He is told, and nothing pretends otherwise.
  // ⚠️ AND THIS ARM ALSO CARRIES THE UNREADABLE CARD. writeOwnTestimonial refuses rather than
  // filing him anonymously when it cannot read the row his switches point at, so "we could not
  // save that just now, and nothing has changed" is the true sentence for both.
  return back(req, done ? '?saved=1' : '?problem=unavailable');
}
