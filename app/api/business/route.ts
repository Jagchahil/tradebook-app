import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  getBusinessProfile,
  setBusinessType,
  setPartnershipShare,
} from '../../../lib/supabase';

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
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token ? verifyAccessToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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

  let body: { business_type?: unknown; partnership_share?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to validation, which rejects an empty body
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

  const profile = await getBusinessProfile(user.id);
  return NextResponse.json({
    business_type: profile?.businessType ?? requested,
    partnership_share: profile?.partnershipShare ?? null,
  });
}
