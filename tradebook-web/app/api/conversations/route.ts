import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, listConversations } from '../../../lib/supabase';

// The Messages tab (doc 95, Phase 1). Returns the signed-in user's Puchio chat
// threads, newest activity first. Verifies the Supabase bearer and scopes to the
// caller, so a user only ever sees their own conversations.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const conversations = await listConversations(verified.id, 50);
  return NextResponse.json({ conversations });
}
