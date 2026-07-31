import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { userBurst } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';
import { createLekhioChat } from '../../../../lib/supabase';
import { chatRef } from '../../../app/chatref';

export const runtime = 'nodejs';

// START A NEW CHAT. The one button at the top of /app/thread: one insert, one sealed
// reference, and a 303 into the fresh chat.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE CHAT IS MINTED FOR THE SESSION'S ACCOUNT AND NOTHING IS READ FROM THE BODY. There is
// no form field at all: who the chat belongs to is the cookie's answer, so there is nothing to
// tamper with and nothing to forget to validate.
//
// 🔴 HONEST WHEN THE MIGRATION HAS NOT RUN. Until APPLY_2026-07-31_chats.sql drops the v1
// one-thread-per-user index, the database refuses a second Lekhio chat. createLekhioChat
// reports that refusal as blocked, and this route sends the man back to the list with the
// plain sentence (problem=onechat) rather than quietly handing him a chat he did not choose.
//
// ⚠️ GATED 'entitled' (lib/gate.ts): starting a chat exists only to post into it, and posting
// is the work. His old chats stay readable on the pages whatever he pays.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/app/thread${q}`, req.url), 303);

  // Session first, always.
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/thread', req.url), 303);

  // Six new chats a minute is a thumb slip; more is a script filling the table with rows.
  if (await userBurst('threadnew', user.id, 6)) return back('?problem=slow');

  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/thread');

  const made = await createLekhioChat(user.id);
  if (!made.ok) return back(made.blocked ? '?problem=onechat' : '?problem=newchat');

  const ref = chatRef(user.id, 'chat', made.id);
  // No sealed references (unconfigured secret) means no chat links anywhere on the surface;
  // the list is the only honest landing, and the new chat is on it, unlinked like every row.
  if (!ref) return back('');
  return NextResponse.redirect(new URL(`/app/thread/chat?c=${encodeURIComponent(ref)}`, req.url), 303);
}
