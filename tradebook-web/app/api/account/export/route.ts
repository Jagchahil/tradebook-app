import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, exportUserData } from '../../../../lib/supabase';

// GDPR data export. The user calls this with their own Supabase token and gets
// back everything held about them, scoped to their account.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const data = await exportUserData(user.id, user.email);
  return NextResponse.json(data);
}
