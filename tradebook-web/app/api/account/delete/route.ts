import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, deleteUserData } from '../../../../lib/supabase';

// GDPR right to erasure. The user calls this with their own Supabase token to
// permanently delete their account and all of their data. Irreversible; the app
// confirms with the user before calling.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await deleteUserData(user.id, user.email);
  return NextResponse.json({ ok });
}
