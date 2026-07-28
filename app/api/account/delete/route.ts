import { NextRequest, NextResponse } from 'next/server';
import { deleteUserData } from '../../../../lib/supabase';
import { sessionUser, identityForUser } from '../../../../lib/webauth';

// GDPR right to erasure. The user calls this with their own Supabase token to
// permanently delete their account and all of their data. Irreversible; the app
// confirms with the user before calling.
export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // ⚠️ NOT user.email. The cookie door does not carry it, and a null here would silently skip
  // every row keyed by his address. identityForUser resolves it properly, and a null AFTER that
  // lookup honestly means he has no email on file rather than that we did not ask.
  const { email } = await identityForUser(user);
  const ok = await deleteUserData(user.id, email);
  return NextResponse.json({ ok });
}
