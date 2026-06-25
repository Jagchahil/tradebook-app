import { NextRequest, NextResponse } from 'next/server';
import { createSignup } from '../../../lib/supabase';

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

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const b = (body ?? {}) as Record<string, unknown>;

    const phone = cleanPhone(b.phone);
    const email = cleanEmail(b.email);
    if (!phone || !email) {
      return NextResponse.json({ error: 'A valid mobile number and email are required.' }, { status: 400 });
    }

    try {
      await createSignup({
        phone,
        email,
        trade_type: str(b.tradeType, 20),
        name: str(b.name),
        trade: str(b.trade),
        postcode: str(b.postcode, 12),
        address: str(b.address, 300),
        vat_registered: typeof b.vat === 'boolean' ? b.vat : null,
      });
    } catch (dbErr) {
      const detail = dbErr instanceof Error ? dbErr.message : 'unknown';
      console.error('[onboard] Save error:', detail);
      return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
    }

    // Never log the personal details. Just confirm one signup saved.
    console.log('[onboard] Saved one signup');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[onboard] Exception:', message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
}
