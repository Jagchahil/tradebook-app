import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[waitlist] Missing env vars');
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { phone } = body;

    if (!phone || typeof phone !== 'string' || phone.length < 10) {
      return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 });
    }

    const { error } = await supabase.from('waitlist').insert({ phone: phone.trim() });

    if (error) {
      console.error('[waitlist] Supabase error:', error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[waitlist] Saved:', phone);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : JSON.stringify(err);
    console.error('[waitlist] Exception:', message);
    return NextResponse.json({ error: 'Failed to save.' }, { status: 500 });
  }
}
