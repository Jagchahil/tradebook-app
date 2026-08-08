import { NextRequest, NextResponse, after } from 'next/server';
import { insertWaitlistSignup } from '../../../lib/supabase';
import { rateLimitedShared, clientIp } from '../../../lib/ratelimit';
import { sendWaitlistWelcomeEmail } from '../../../lib/email';

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
    if (await rateLimitedShared(`waitlist:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
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

    // 🔴 'already_listed' IS A SUCCESS. He tapped join twice, or came back a week later, and the
    // unique index on waitlist.email refused the second row. He is on the list. Telling him "could
    // not save" made him tap again, and the tap after that, and every one of them said the same
    // thing while nothing at all was wrong. Only a genuine failure is still a failure.
    let outcome;
    try {
      outcome = await insertWaitlistSignup({ phone, email });
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : 'unknown';
      console.error('[waitlist] Save error:', detail);
      return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
    }

    // A warm "you are on the list" email, sent after the response so it never slows the signup or
    // fails it. Only if they gave an email. Dormant until Resend is configured.
    //
    // ⚠️ ONLY ON A NEW ROW, AND THAT CONDITION IS DOING REAL WORK. Until now the second submit
    // threw above and never reached this line, so the duplicate welcome email was prevented by the
    // failure, not on purpose. Take the failure away without this and the man who tapped twice gets
    // a second copy of the same email, which is half of the fault the unique index was added to
    // stop, back again through the front door.
    if (email && outcome === 'inserted') {
      after(async () => {
        try {
          await sendWaitlistWelcomeEmail(email);
        } catch {
          /* best effort */
        }
      });
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
