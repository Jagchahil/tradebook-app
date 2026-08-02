import { NextRequest, NextResponse } from 'next/server';
import { setCapitalKind } from '../../../../lib/supabase';
import { sessionUser } from '../../../../lib/webauth';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';
import { isCapitalKind, isUseBand } from '../../../../lib/capital';
import { verifyEntryRef, refBelongsTo } from '../../../app/entryref';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT A PAYMENT ALREADY IN HIS BOOKS ACTUALLY WAS.
//
// 🔴 WHY THIS ROUTE EXISTS AT ALL, AND IT IS THE HALF OF THE CAR FIX THE PILE CANNOT DO.
//
// The pile asks before a row is confirmed, so it protects payments that have not been filed yet
// and nothing else. Walking the live site on 2 August 2026, an hour after the pile learned to
// ask: AUDI LEEDS, £60,000, filed under 'van', confirmed, capital_kind null, and no route in the
// product that could change it. Everything typed into /app/money/add lands confirmed. So does
// everything that arrives through WhatsApp. None of them are ever asked.
//
// ⚠️ IT ONLY EVER SETS THE TWO COLUMNS. It does not move money, does not change the category,
// does not unconfirm anything and cannot delete a row. The cost he paid is a fact; what changes
// is how much of it comes off his profit THIS year, which is CAA 2001 s38B and s205 and was
// never his choice in the first place.
//
// ⚠️ THE URL CARRIES A SEALED REFERENCE, NEVER AN ID. app/app/entryref.ts: the web app's tenancy
// design is that there is nowhere in a URL to put a row id. The reference is encrypted, expiring
// and grants nothing on its own: the session is resolved first, refBelongsTo checks the reference
// was minted for THIS man, and setCapitalKind scopes its write by user_id on top of both. A
// stolen reference in someone else's hands meets the sign in page.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const runtime = 'nodejs';

function back(req: NextRequest, ref: string, params: Record<string, string>) {
  const url = new URL('/app/entry', req.url);
  url.searchParams.set('ref', ref);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (await rateLimitedShared(`capital:${user.id}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  // Changing what a purchase was is work we do for him, so it is entitled work. His records stay
  // readable either way; what a lapsed subscription buys is that we do nothing new.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/money');

  const form = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  const f = form ? await req.formData().catch(() => null) : null;
  const body = f
    ? {
      ref: String(f.get('ref') ?? ''),
      kind: String(f.get('capital_kind') ?? ''),
      pct: String(f.get('business_use_pct') ?? ''),
    }
    : ((await req.json().catch(() => ({}))) as { ref?: string; kind?: string; pct?: string | number });

  const ref = String(body.ref ?? '');
  const claim = verifyEntryRef(ref);
  // A missing, stale, tampered or borrowed reference all land in the same place: his own month
  // log. Same rule as the page this posts back to.
  if (!claim || !refBelongsTo(claim, user.id)) {
    return form
      ? NextResponse.redirect(new URL('/app/money', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const kind = isCapitalKind(body.kind) ? body.kind : null;
  if (!kind) {
    return form
      ? back(req, ref, { problem: 'capital' })
      : NextResponse.json({ error: 'Not one of the four answers.' }, { status: 400 });
  }

  // 🔴 A CAR WITHOUT A BUSINESS USE SHARE IS NOT AN ANSWER. CAA 2001 s205 restricts the allowance
  // to the business proportion, and taking 100% because the field was empty is the same over
  // claim this whole feature exists to stop, in a quieter voice. The page asks in two steps and
  // always sends one; anything else is a hand rolled post and gets sent back to be asked properly.
  const bandRaw = Number(body.pct);
  const band = isUseBand(bandRaw) ? bandRaw : null;
  if (kind !== 'not_a_car' && band === null) {
    return form
      ? back(req, ref, { kind })
      : NextResponse.json({ error: 'A vehicle needs a business use share.' }, { status: 400 });
  }

  const done = await setCapitalKind(user.id, [claim.row], kind, band);
  // A failed write leaves his figures exactly as they were, which is the safe direction here:
  // the row keeps whatever it had, and he is told rather than shown a success he did not get.
  if (form) return back(req, ref, done ? { saved: '1' } : { problem: 'capital' });
  return done
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Could not save it.' }, { status: 500 });
}
