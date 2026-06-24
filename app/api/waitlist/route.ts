import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[waitlist] Missing env vars', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { phone, email } = body;

    if (!phone || typeof phone !== 'string' || phone.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 });
    }

    const { data, error } = await supabase.from('waitlist').insert({
      phone: phone.trim(),
      email: email?.trim() || null,
    });

    if (error) {
      console.error('[waitlist] Supabase error:', error.message, error.code, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[waitlist] Saved:', phone);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[waitlist] Caught exception:', message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
}
