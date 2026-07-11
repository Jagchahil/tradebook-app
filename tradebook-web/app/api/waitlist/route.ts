import { NextRequest, NextResponse } from 'next/server';
import { insertWaitlistSignup } from '../../../lib/supabase';
import { rateLimited, clientIp } from '../../../lib/ratelimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Keep digits and a single leading plus only.
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export async function POST(req: NextRequest) {
  try {
    if (rateLimited(`waitlist:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Give it a moment.' }, { status: 429 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const { phone: rawPhone, email: rawEmail } = (body ?? {}) as {
      phone?: unknown;
      email?: unknown;
    };

    const phone = cleanPhone(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid UK mobile number.' }, { status: 400 });
    }

    // Email is optional. If they gave one, it must be valid. We never block on a blank email.
    const email = cleanEmail(rawEmail);
    if (rawEmail && typeof rawEmail === 'string' && rawEmail.trim() && !email) {
      return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
    }

    try {
      await insertWaitlistSignup({ phone, email });
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : 'unknown';
      console.error('[waitlist] Save error:', detail);
      return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
    }

    // Do not log the phone or email. It is personal data.
    console.log('[waitlist] Saved one signup');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[waitlist] Exception:', message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
}
