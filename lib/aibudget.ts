// THE WEB RECEIPT WALLET WALK, IN ONE PLACE, BECAUSE A SECOND DOOR NOW SPENDS FROM IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Until 12 August 2026 this walk lived inline in app/api/money/receipt/route.ts, and that was
// fine while it had one caller. The one door for uploads (/api/money/upload) reads photographs
// too, and a copy of a budget walk is how two doors drift into two budgets. So the walk lives
// HERE, once, and both routes are callers. A route file cannot export it itself: Next.js route
// modules may only export handlers and route config.
//
// WHAT IT IS: the same three rings the WhatsApp webhook's aiBudgetBlocked walks, with the same
// judge. decideSpend reads the counts BEFORE this call, so our own bump is subtracted. The
// rings are GLOBAL on purpose: web reads and WhatsApp reads spend from one wallet, so neither
// surface can quietly drain the other's day.
//
// 🔴 EVERY PHOTOGRAPH COSTS ONE CALL AND EVERY CALL IS COUNTED. A batch of twenty receipts
// walks this twenty times, once per image, because each image is one model call. Counting a
// batch as one read would let a single press spend twenty times what the rings think it spent.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { bumpAiUsage, countActiveSubscribers } from './supabase';
import { aiCapsFor } from './margin';
import { decideSpend } from './aicost';

// True when this user may NOT spend a receipt read right now. The name says blocked rather
// than allowed so a forgotten negation reads wrong at the call site.
export async function receiptSpendBlocked(userId: string): Promise<boolean> {
  const subs = await countActiveSubscribers();
  const caps = aiCapsFor(subs ?? 0);
  const userDay = caps.killed ? null : await bumpAiUsage('receiptweb', userId);
  const globalDay = caps.killed ? null : await bumpAiUsage('global', 'all');
  const globalMonth = caps.killed ? null : await bumpAiUsage('globalmonth', new Date().toISOString().slice(0, 7));
  return caps.killed
    || userDay === null || globalDay === null || globalMonth === null
    || !decideSpend({ globalDay: globalDay - 1, globalMonth: globalMonth - 1, userDay: userDay - 1 }, caps).allowed;
}
