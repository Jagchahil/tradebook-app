import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getAutonomyLevel, setAutonomyLevel } from '../../../lib/supabase';

// The autonomy dial setting. The app reads and writes the user's level here with
// their own Supabase token. The value only governs reversible admin work; money
// and filing always require explicit approval regardless (lib/autonomy.ts).
//   GET  -> { level }
//   POST { level: 'suggest' | 'draft' | 'auto' } -> { level } (validated server side)

async function userFrom(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token ? verifyAccessToken(token) : null;
}

export async function GET(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const level = await getAutonomyLevel(user.id);
  return NextResponse.json({ level });
}

export async function POST(req: NextRequest) {
  const user = await userFrom(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: { level?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // empty body, fall through to default
  }
  const requested = typeof body.level === 'string' ? body.level : 'suggest';
  const ok = await setAutonomyLevel(user.id, requested);
  if (!ok) return NextResponse.json({ error: 'save_failed' }, { status: 502 });
  const level = await getAutonomyLevel(user.id);
  return NextResponse.json({ level });
}
