import { NextRequest, NextResponse } from 'next/server';

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[waitlist] Missing env vars');
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
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

    const record: Record<string, string> = { phone };
    if (email) record.email = email;

    const response = await fetch(`${supabaseUrl}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[waitlist] REST error:', response.status, text);
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
