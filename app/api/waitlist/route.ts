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

    const { phone: rawPhone, email: rawEmail, region: rawRegion } = (body ?? {}) as {
      phone?: unknown;
      email?: unknown;
      region?: unknown;
    };

    // 🔴 B33. WHICH GATE TURNED HIM AWAY, so the list is segmentable. A slug and nothing else: it
    // is derived from REGION in lib/region.ts and is never anything a customer typed, so anything
    // that is not a plain slug is dropped rather than stored.
    const region = typeof rawRegion === 'string' && /^[a-z0-9-]{1,60}$/.test(rawRegion.trim())
      ? rawRegion.trim()
      : null;

    const phone = cleanPhone(rawPhone);
    const email = cleanEmail(rawEmail);

    // A malformed email is a malformed email whichever form sent it, and saying so beats saving a
    // row we can never reach him on.
    if (rawEmail && typeof rawEmail === 'string' && rawEmail.trim() && !email) {
      return NextResponse.json({ error: 'That email does not look right.' }, { status: 400 });
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 ONE OF THE TWO, NOT THE PHONE. CHANGED BY B33, 18 AUGUST 2026.
    //
    // This route demanded a mobile number because /early-access is a phone first form and was the
    // only thing posting here. The region gate at signup asks a man we have just turned away for
    // ONE thing, his address, because doc 103's bar is that every extra field is a decision handed
    // to somebody who is already being told no.
    //
    // ⚠️ SO THE RULE IS NOW "SOMETHING WE CAN REACH HIM ON", WHICH IS WHAT IT ALWAYS MEANT. Both
    // columns are nullable and always have been. A post with neither is still refused, because a
    // waitlist row nobody can be reached on is not a row.
    //
    // ⚠️ AND /early-access IS UNAFFECTED, DERIVED: it sends `phone` on every submit and its own
    // form will not let him press the button without one, so it can never reach the email branch.
    // The message below still names the mobile when a phone was attempted and nothing else was.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (!phone && !email) {
      return NextResponse.json(
        { error: rawEmail ? 'Enter a valid email address.' : 'Enter a valid UK mobile number.' },
        { status: 400 },
      );
    }

    // 🔴 'already_listed' IS A SUCCESS. He tapped join twice, or came back a week later, and the
    // unique index on waitlist.email refused the second row. He is on the list. Telling him "could
    // not save" made him tap again, and the tap after that, and every one of them said the same
    // thing while nothing at all was wrong. Only a genuine failure is still a failure.
    let outcome;
    try {
      outcome = await insertWaitlistSignup({ phone, email, region });
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
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 AND NOT ON THE REGION PATH, WHICH IS THE POINT OF THE WHOLE GATE. B33, 18 August 2026.
    //
    // sendWaitlistWelcomeEmail tells a man "You'll be one of the first we let in", "we'll message
    // you the moment your spot is ready" and "Your first 7 days are free, and there's no card to
    // enter to start". Every one of those is a promise, and not one of them may be made to
    // somebody we have just told we are not set up for where he lives. There is no date, no spot
    // and no trial waiting for him.
    //
    // ⚠️ THE ALTERNATIVE WAS A SECOND EMAIL SAYING NOTHING, AND IT WAS REJECTED. A confirmation
    // that promises nothing is an email whose only content is that we received an email, and it
    // would need its own repeating subject key and its own row in the subject rule. The screen
    // already tells him, in the words of regionWaitlistDone(): "We have got your address. You will
    // not hear from us unless that changes." That is a promise kept by doing nothing at all, which
    // is the cheapest promise in the world to keep.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (email && !region && outcome === 'inserted') {
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
