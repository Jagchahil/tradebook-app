import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import {
  getBusinessProfile,
  setBusinessType,
  setPartnershipShare,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { isStep, type Step } from '../../../lib/onboarding';

// The business structure: sole trader, limited company, or partnership.
//
// This used to be captured ONLY on WhatsApp, in the setup chain we are retiring.
// The app first-run wizard and Settings both need to read and set it directly,
// so the fact has one home the app can reach with the user's own token. The tax
// engine branches on this (a director gets corporation tax and pay-yourself, a
// partner is taxed on his share), so getting it wrong walks a wrong number into
// his return. That is why it is a deliberate choice, never a guess.
//
//   GET  -> { business_type, partnership_share }
//   POST { business_type: 'sole_trader' | 'limited_company' | 'partnership',
//          partnership_share?: number }  -> { business_type, partnership_share }

type BizType = 'sole_trader' | 'limited_company' | 'partnership';
const VALID: BizType[] = ['sole_trader', 'limited_company', 'partnership'];

async function userFrom(req: NextRequest) {
  return sessionUser(req);
}

export async function GET(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('business', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }
  const profile = await getBusinessProfile(user.id);
  // A missing profile is a real answer: he has not told us yet. getBusinessProfile
  // defaults to sole trader when a row exists (the safe read for the tax engine),
  // and returns null only when the read itself failed.
  return NextResponse.json({
    business_type: profile?.businessType ?? null,
    partnership_share: profile?.partnershipShare ?? null,
  });
}

export async function POST(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('business', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  // TWO ENCODINGS, ONE WRITE. /app/setup ships no client script, so its business step is a plain
  // form post. The phone wizard posts JSON. Both land on setBusinessType below, because the tax
  // engine branches on this answer and two paths into it is two chances to get a man's structure
  // wrong.
  //
  // 🔴 THE REDIRECT CARRIES A STEP NAME AND NEVER A URL, so an authenticated POST cannot be turned
  // into an open redirect. lib/onboarding decides what is a step; this file builds the path.
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  let body: { business_type?: unknown; partnership_share?: unknown } = {};
  let back: Step | null = null;
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const share = Number(String(f.get('partnership_share') ?? '').trim());
    body = {
      business_type: String(f.get('business_type') ?? ''),
      // An empty or unreadable share is ABSENT, not zero. A zero share would tax a partner on
      // nothing at all, and setPartnershipShare's own guard would reject it anyway; sending
      // undefined keeps whatever he told us before rather than quietly replacing it.
      partnership_share: Number.isFinite(share) && share > 0 ? share : undefined,
    };
    const step = String(f.get('step') ?? '');
    back = isStep(step) ? step : null;
  } else {
    try {
      body = await req.json();
    } catch {
      // fall through to validation, which rejects an empty body
    }
  }

  const requested = typeof body.business_type === 'string' ? (body.business_type as BizType) : null;
  if (!requested || !VALID.includes(requested)) {
    return NextResponse.json({ error: 'invalid_business_type' }, { status: 400 });
  }

  const ok = await setBusinessType(user.id, requested);
  if (!ok) return NextResponse.json({ error: 'save_failed' }, { status: 502 });

  // A partnership share is only meaningful for a partnership, and only when a
  // sensible number is sent. We never invent a share; an absent one stays absent.
  if (requested === 'partnership' && typeof body.partnership_share === 'number') {
    const share = body.partnership_share;
    if (share > 0 && share <= 100) {
      await setPartnershipShare(user.id, share);
    }
  }

  // Only once the structure is actually stored. A redirect sent before the write would put him on
  // the next screen believing we had him down as a partner while the engine still had him as a sole
  // trader, and that disagreement ends up in his return rather than on his screen.
  if (back) {
    return NextResponse.redirect(new URL(`/app/setup?step=${back}`, req.url), 303);
  }

  const profile = await getBusinessProfile(user.id);
  return NextResponse.json({
    business_type: profile?.businessType ?? requested,
    partnership_share: profile?.partnershipShare ?? null,
  });
}
