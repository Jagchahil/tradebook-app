import { NextRequest, NextResponse } from 'next/server';
import { exportUserData } from '../../../../lib/supabase';
import { sessionUser, identityForUser } from '../../../../lib/webauth';

// GDPR data export. The user calls this with their own Supabase token and gets
// back everything held about them, scoped to their account.
export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // ⚠️ NOT user.email. The cookie door does not carry it, and a null here would silently skip
  // every row keyed by his address. identityForUser resolves it properly, and a null AFTER that
  // lookup honestly means he has no email on file rather than that we did not ask.
  const { email } = await identityForUser(user);
  const data = await exportUserData(user.id, email);
  return NextResponse.json(data);
}
