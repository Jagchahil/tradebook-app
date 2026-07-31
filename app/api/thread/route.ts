import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import { userBurst } from '../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import { answerMoneyQuestion, hasClaudeConfig } from '../../../lib/claude';
import { busyMessage, type AiBlockReason } from '../../../lib/banknudge';
import { decideSpend } from '../../../lib/aicost';
import { aiCapsFor } from '../../../lib/margin';
import {
  matchTotalsQuestion, formatGbp, isDeadlineQuestion, deadlineAnswer, type TotalsQuestion,
} from '../../../lib/waintents';
import { checkExpense, VERDICT_ICON } from '../../../lib/taxrules';
import { taxPosition, setAsideBasisLine } from '../../../lib/taxoptimiser';
import {
  bumpAiUsage,
  countActiveSubscribers,
  refreshFactsFromDb,
  totalsForUser,
  pendingSummaryForUser,
  getOptimiserInput,
  transactionSummaryForUser,
  getRelevantKnowledge,
  saveLekhioThreadMessage,
} from '../../../lib/supabase';
import { verifyChatRef, chatRefBelongsTo } from '../../app/chatref';

export const runtime = 'nodejs';
// The AI path can take a few seconds; give the answer time to land before the 303.
export const maxDuration = 60;

// THE CHAT'S POST. One question from a chat view, one stored question, one stored answer, and
// a 303 back into the same chat.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS ROUTE ANSWERS THE WAY WHATSAPP ANSWERS, WITH THE SAME MACHINERY, OR NOT AT ALL.
//
// The order is app/api/whatsapp/route.ts's order, and every function is the same function by
// name: deterministic intents first (totals via matchTotalsQuestion and totalsForUser; what he
// owes via taxPosition on getOptimiserInput, the tax hub's own figure; claims via checkExpense;
// deadlines via deadlineAnswer), then the guarded AI path (answerMoneyQuestion on
// transactionSummaryForUser plus the approved knowledge), behind the SAME derived caps and the
// SAME durable spend rings (aiCapsFor on the live paying base, decideSpend, bumpAiUsage on the
// shared 'global' and 'globalmonth' counters). Nothing here computes a money figure of its own:
// a second brain is a second engine, and this codebase has been caught by two readers over one
// number too many times to grow one on purpose.
//
// ⚠️ WHICH CHAT is named by the SEALED REFERENCE the composer posts back (app/app/chatref.ts),
// never by a raw id: the claim is verified, checked against the session with chatRefBelongsTo,
// and must be the 'chat' kind, so a read only Rakha reference can never become a place to
// write. saveLekhioThreadMessage then proves ownership and kind against the database again
// before one row is written. A stale or borrowed reference lands on the chat list, the same
// answer the chat view gives it.
//
// ⚠️ AN ANSWER IS ALWAYS STORED. If the caps are exhausted, the kill switch is on, or the AI
// is not configured, the stored reply is the plain honest line (busyMessage, the same words
// WhatsApp sends), never silence and never a fake. A question sitting in a chat with no
// answer under it reads as the product being broken, and a made up answer would be worse.
//
// ⚠️ NEVER LOG MESSAGE CONTENT. Same rule as the webhook: his words go to Supabase and to the
// model, and nowhere else. There is deliberately no console call in this file.
//
// ⚠️ ARTICLE 9 HOLDS HERE EXACTLY AS ON WHATSAPP. The chat never asks a circumstances
// question (the chain lives elsewhere and unanswered() refuses special category on every
// channel), and what reaches the model is the same context WhatsApp sends: his transaction
// summary and the approved GOV.UK knowledge. Nothing from lib/circumstances.ts is imported
// here, and test/thread.test.mjs pins that.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const list = (q: string) => NextResponse.redirect(new URL(`/app/thread${q}`, req.url), 303);

  // Session first, always. The account is the cookie's, never the form's.
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/thread', req.url), 303);

  const f = await req.formData().catch(() => null);
  if (!f) return list('?problem=bad');

  // The chat this question belongs in, out of the sealed reference and nowhere else. Anything
  // missing, stale, tampered, borrowed or of the wrong kind lands on the list, where his real
  // chats are.
  const ref = String(f.get('c') ?? '');
  const claim = verifyChatRef(ref);
  if (!claim || claim.kind !== 'chat' || !chatRefBelongsTo(claim, user.id)) return list('');

  const back = (q: string) =>
    NextResponse.redirect(new URL(`/app/thread/chat?c=${encodeURIComponent(ref)}${q}`, req.url), 303);

  const q = String(f.get('q') ?? '').trim().slice(0, 1000);
  if (!q) return back('&problem=empty');

  // The durable shared burst limit, keyed on the user, the same atomic counter discipline as
  // /api/goals and /api/ask. Six posts a minute is chatty; more is a script, and a script must
  // not be able to drain the AI budget one question at a time. After the reference check, so
  // the refusal can land back in the chat he was in rather than dumping him on the list.
  if (await userBurst('thread', user.id, 6)) return back('&problem=slow');

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. Reading every chat is free on the pages; posting
  // new work is 'entitled' (lib/gate.ts row for this route). The form caller lands back on the
  // list, which draws the read only banner, and the chat view hides its composer the same way.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/thread');

  // Answer on the latest approved facts, exactly as the webhook does before it answers.
  await refreshFactsFromDb();

  // The claim's id was minted for this session and shape checked twice; the save below still
  // proves against the database that the chat is HIS and is a Lekhio chat before any write.
  const threadId = claim.id;

  const stored = await saveLekhioThreadMessage(user.id, threadId, 'user', q);
  if (!stored) return back('&problem=unavailable');

  const reply = await composeReply(user.id, q);
  await saveLekhioThreadMessage(user.id, threadId, 'lekhio', reply);

  return back('#end');
}

// The WhatsApp answering order, without the WhatsApp only lanes (capture, sessions, buttons).
// Always returns a sentence: honesty when it cannot answer is part of the contract.
async function composeReply(userId: string, q: string): Promise<string> {
  // 1. Totals and what he owes: computed from his own confirmed rows, no AI, instant.
  const totals = matchTotalsQuestion(q);
  if (totals) return totalsAnswer(userId, totals);

  // 2. Tax deadline questions: computed, no AI.
  if (isDeadlineQuestion(q)) return deadlineAnswer();

  // 3. "Can I claim it" questions: the deterministic claim rules, no AI. Guarded the same way
  // the WhatsApp checker guards itself: a message carrying a money amount is probably telling
  // us about a purchase, not asking about the rules, and the thread does not log entries.
  if (!/£\s*\d/.test(q)) {
    const hit = checkExpense(q);
    if (hit) {
      return [
        `${VERDICT_ICON[hit.verdict]} ${hit.title}. ${hit.rule}`,
        '',
        'General info, not advice for your exact situation.',
      ].join('\n');
    }
  }

  // 4. Everything else: the guarded AI path, the same one WhatsApp falls through to.
  if (!hasClaudeConfig()) {
    return 'I cannot answer questions just yet. Hang tight, it is coming very soon.';
  }
  const refused = await threadAiBlocked(userId);
  if (refused) {
    // The truthful refusal, the same words lib/banknudge.ts sends on WhatsApp. No bank offer
    // here: this page cannot verify the feed the way the webhook does, and a wrong offer is
    // worse than no offer.
    return busyMessage(refused, { available: false, connected: false });
  }

  const summary = await transactionSummaryForUser(userId).catch(() => '');

  // The approved knowledge, formatted exactly as handleMoneyQuestion formats it for WhatsApp.
  // Reviewed and source linked rows only; on any failure the model answers from its static,
  // exam verified rules exactly as before. The brain can only ever add.
  let knowledge = '';
  try {
    const items = await getRelevantKnowledge(q, 4);
    if (items.length) {
      knowledge = items
        .map((k) => `- ${k.title}${k.effective_date ? ` (effective ${k.effective_date})` : ''}: ${k.summary} [source: ${k.source_url}]`)
        .join('\n');
    }
  } catch {
    knowledge = '';
  }

  const answer = await answerMoneyQuestion(q, summary, knowledge);
  return answer ?? 'I could not work that out. Try asking another way.';
}

// The AI spend gate, mirroring aiBudgetBlocked in the webhook ring for ring: the kill switch,
// the per user daily ring (scope 'thread', keyed on the account rather than the phone), and the
// SHARED global daily and monthly rings, so total AI spend across WhatsApp, the ask endpoint
// and the thread is bounded ONCE. Fails CLOSED on every durable counter: if we cannot read the
// budget we do not spend, and the deterministic answers above still work.
async function threadAiBlocked(userId: string): Promise<AiBlockReason | null> {
  const subs = await countActiveSubscribers();
  const caps = aiCapsFor(subs ?? 0);
  if (caps.killed) return 'kill_switch';

  const userDay = await bumpAiUsage('thread', userId);
  if (userDay === null) return 'global_daily_cap';
  const globalDay = await bumpAiUsage('global', 'all');
  if (globalDay === null) return 'global_daily_cap';
  const globalMonth = await bumpAiUsage('globalmonth', new Date().toISOString().slice(0, 7));
  if (globalMonth === null) return 'global_daily_cap';

  // decideSpend judges the counts BEFORE this call, so subtract our own bump, exactly as the
  // webhook does.
  const decision = decideSpend(
    { globalDay: globalDay - 1, globalMonth: globalMonth - 1, userDay: userDay - 1 },
    caps,
  );
  if (!decision.allowed) return decision.reason as AiBlockReason;
  return null;
}

// The totals and owed answers, WhatsApp's handleTotals wearing a return statement. Every figure
// comes from the same engines by name; only the sentence around the figure lives here, and the
// two sentences say the same thing because the numbers cannot differ.
async function totalsAnswer(userId: string, q: TotalsQuestion): Promise<string> {
  const totals = await totalsForUser(userId, q.sinceISO, q.category);
  if (!totals) return 'I could not fetch your figures just now. Try again in a minute.';

  if (totals.count === 0) {
    // Nothing CONFIRMED yet. A man with captures waiting for his tick should hear that they are
    // waiting, not a flat "nothing". Same shape as the WhatsApp reply, pointing at the pile.
    const pending = await pendingSummaryForUser(userId, q.sinceISO).catch(() => null);
    if (pending && pending.count > 0) {
      const bits: string[] = [];
      if (pending.income > 0) bits.push(`${formatGbp(pending.income)} coming in`);
      if (pending.expenses > 0) bits.push(`${formatGbp(pending.expenses)} of costs`);
      const detail = bits.length ? ` (${bits.join(' and ')})` : '';
      const n = pending.count;
      return `You have ${n} thing${n === 1 ? '' : 's'} waiting for your approval under Money, Waiting on you${detail}. Nothing counts towards your tax until you confirm it, so the tally is £0 for now. Approve them and ask me again.`;
    }
    return `Nothing logged ${q.periodLabel === 'all time' ? 'yet' : q.periodLabel}. Send Lekhio a receipt or what you spent and the tally starts itself.`;
  }

  const profit = totals.income - totals.expenses;
  if (q.kind === 'spent') {
    const what = q.category ? `on ${q.category} ` : '';
    return `You have spent ${formatGbp(totals.expenses)} ${what}${q.periodLabel}. It is all in your Lekhio, ready for tax.`;
  }
  if (q.kind === 'made') {
    return `You have brought in ${formatGbp(totals.income)} ${q.periodLabel}. Nice going. Profit after expenses is ${formatGbp(profit)}.`;
  }
  if (q.kind === 'profit') {
    return `${q.periodLabel === 'all time' ? 'All time' : `For ${q.periodLabel}`}: ${formatGbp(totals.income)} in, ${formatGbp(totals.expenses)} out, so ${formatGbp(profit)} profit.`;
  }

  // 🔴 WHAT HE OWES IS THE TAX HUB'S OWN NUMBER, FETCHED BY NAME, NEVER RE-DERIVED.
  //
  // This branch used to run a little January of its own: soleTraderTax on the asked-about
  // period's rows, the student loan added, CIS taken off, with company and partnership
  // variants. Every figure was real, and the total still disagreed with /app/tax, which leads
  // with taxPosition() on getOptimiserInput(): the whole person figure across trade, salary,
  // property, savings and dividends, projected to the year, partnership share already applied.
  // A man who asked the thread what he owes and then opened Tax got two answers to one
  // question, and a product that disagrees with itself about his tax loses both answers. So
  // this is now the same call the Tax hub and the Overview make, and only the sentence around
  // the figure lives here.
  const optimiser = await getOptimiserInput(userId);
  const tax = taxPosition(optimiser);
  const basis = setAsideBasisLine(optimiser, tax);
  const note = tax.projected
    ? 'That is what the year is heading for, on everything you have confirmed so far.'
    : 'That is what the year so far has built up, too early to call the whole year yet.';
  return `Put by ${formatGbp(tax.setAside)} for tax. ${note}${basis ? ` ${basis}` : ''} It is the same figure your Tax screen leads with, and Self Assessment collects it in one bill.`;
}
