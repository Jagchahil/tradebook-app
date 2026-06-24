import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { phone, email } = await req.json();

    if (!phone || typeof phone !== 'string' || phone.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 });
    }

    const { error } = await supabase.from('waitlist').insert({
      phone: phone.trim(),
      email: email?.trim() || null,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[waitlist]', message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
}
