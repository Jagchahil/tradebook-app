import { NextResponse } from 'next/server';

// A tiny health check for uptime monitoring. Reports whether the app is up and
// whether the database answers, and nothing else: no counts, no data, no
// configuration details, so it is safe to expose publicly and poll often.
export const runtime = 'nodejs';

export async function GET() {
  let db = false;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const res = await fetch(`${url}/rest/v1/users?select=id&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4000),
      });
      db = res.ok;
    }
  } catch {
    db = false;
  }
  return NextResponse.json({ ok: true, db }, { status: db ? 200 : 503 });
}
