import { NextRequest, NextResponse } from 'next/server';
import { createSignup } from '../../../lib/supabase';
import { sendWelcomeEmail } from '../../../lib/email';
import { rateLimitedShared, clientIp } from '../../../lib/ratelimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  // The form collects a UK number without the country code. Store it E164.
  let d = digits;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('44')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return `+44${d}`;
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

function str(value: unknown, max = 120): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

// Optional Cloudflare Turnstile check. Inert until TURNSTILE_SECRET is set. When
// you enable it, also render the widget on /start so a token is sent here.
async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (await rateLimitedShared(`onboard:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Give it a moment.' }, { status: 429 });
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const b = (body ?? {}) as Record<string, unknown>;

    // Bot traps. A hidden honeypot field humans never see, and a minimum fill
    // time. Either being tripped means an automated submission. We return ok so a
    // bot gets no signal, and we save nothing.
    if (typeof b.website === 'string' && b.website.trim() !== '') {
      return NextResponse.json({ ok: true });
    }
    if (typeof b.ts === 'number' && b.ts < 1500) {
      return NextResponse.json({ ok: true });
    }
    // Optional Turnstile. Only enforced once the secret is configured.
    if (process.env.TURNSTILE_SECRET) {
      const token = typeof b.turnstileToken === 'string' ? b.turnstileToken : '';
      const ok = await verifyTurnstile(process.env.TURNSTILE_SECRET, token, clientIp(req));
      if (!ok) {
        return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 });
      }
    }

    const phone = cleanPhone(b.phone);
    const email = cleanEmail(b.email); // optional now: phone is the account
    if (!phone) {
      return NextResponse.json({ error: 'A valid mobile number is required.' }, { status: 400 });
    }

    try {
      await createSignup({
        phone,
        email: email || null,
        trade_type: str(b.tradeType, 20),
        name: str(b.name),
        trade: str(b.trade),
        postcode: str(b.postcode, 12),
        address: str(b.address, 300),
        vat_registered: typeof b.vat === 'boolean' ? b.vat : null,
        offer: str(b.offer, 40),
        referred_by_code: str(b.ref, 12), // sanitised in createSignup
      });
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : 'unknown';
      console.error('[onboard] Save error:', detail);
      return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
    }

    // Fire a welcome email, best effort, only if they gave one. No-op until Resend is configured.
    if (email) void sendWelcomeEmail(email, str(b.name)).catch(() => {});

    // Never log the personal details. Just confirm one signup saved.
    console.log('[onboard] Saved one signup');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[onboard] Exception:', message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
}
