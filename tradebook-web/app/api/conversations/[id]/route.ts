import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getConversationMessages } from '../../../../lib/supabase';

// One Puchio thread's turns (doc 95, Phase 1), oldest first. Verifies the bearer
// and scopes the read to the caller's own messages, so a conversation id from
// another user returns nothing.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const messages = await getConversationMessages(verified.id, id, 200);
  return NextResponse.json({ messages });
}
