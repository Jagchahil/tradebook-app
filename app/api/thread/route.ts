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
import { soleTraderTax } from '../../../lib/taxengine';
import { corporationTax } from '../../../lib/ltdengine';
import { studentLoanForSA, type StudentPlan } from '../../../lib/nistudentloan';
import {
  bumpAiUsage,
  countActiveSubscribers,
  refreshFactsFromDb,
  totalsForUser,
  pendingSummaryForUser,
  getBusinessProfile,
  getStudentLoanSettings,
  transactionSummaryForUser,
  getRelevantKnowledge,
  getOrCreateLekhioThread,
  saveLekhioThreadMessage,
} from '../../../lib/supabase';

export const runtime = 'nodejs';
// The AI path can take a few seconds; give the answer time to land before the 303.
export const maxDuration = 60;

// THE THREAD'S POST. One plain form field from /app/thread, one stored question, one stored
// answer, and a 303 back to the page.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS ROUTE ANSWERS THE WAY WHATSAPP ANSWERS, WITH THE SAME MACHINERY, OR NOT AT ALL.
//
// The order is app/api/whatsapp/route.ts's order, and every function is the same function by
// name: deterministic intents first (totals and what he owes via matchTotalsQuestion,
// totalsForUser, soleTraderTax, corporationTax and studentLoanForSA; claims via checkExpense;
// deadlines via deadlineAnswer), then the guarded AI path (answerMoneyQuestion on
// transactionSummaryForUser plus the approved knowledge), behind the SAME derived caps and the
// SAME durable spend rings (aiCapsFor on the live paying base, decideSpend, bumpAiUsage on the
// shared 'global' and 'globalmonth' counters). Nothing here computes a money figure of its own:
// a second brain is a second engine, and this codebase has been caught by two readers over one
// number too many times to grow one on purpose.
//
// ⚠️ AN ANSWER IS ALWAYS STORED. If the caps are exhausted, the kill switch is on, or the AI
// is not configured, the stored reply is the plain honest line (busyMessage, the same words
// WhatsApp sends), never silence and never a fake. A question sitting in a thread with no
// answer under it reads as the product being broken, and a made up answer would be worse.
//
// ⚠️ NEVER LOG MESSAGE CONTENT. Same rule as the webhook: his words go to Supabase and to the
// model, and nowhere else. There is deliberately no console call in this file.
//
// ⚠️ ARTICLE 9 HOLDS HERE EXACTLY AS ON WHATSAPP. The thread never asks a circumstances
// question (the chain lives elsewhere and unanswered() refuses special category on every
// channel), and what reaches the model is the same context WhatsApp sends: his transaction
// summary and the approved GOV.UK knowledge. Nothing from lib/circumstances.ts is imported
// here, and test/thread.test.mjs pins that.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/app/thread${q}`, req.url), 303);

  // Session first, always. The account is the cookie's, never the form's.
  const user = await sessionUser(req);
  if (!user) return NextResponse.redirect(new URL('/in?next=/app/thread', req.url), 303);

  // The durable shared burst limit, keyed on the user, the same atomic counter discipline as
  // /api/goals and /api/ask. Six posts a minute is chatty; more is a script, and a script must
  // not be able to drain the AI budget one question at a time.
  if (await userBurst('thread', user.id, 6)) return back('?problem=slow');

  const f = await req.formData().catch(() => null);
  if (!f) return back('?problem=bad');
  const q = String(f.get('q') ?? '').trim().slice(0, 1000);
  if (!q) return back('?problem=empty');

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. Reading the thread is free on the page; posting new
  // work is 'entitled' (lib/gate.ts row for this route). The form caller lands back on the page,
  // which draws the read only banner and hides the composer.
  if ((await gateForUser(user.id)) === 'readonly') return refuseUnentitled(req, '/app/thread');

  // Answer on the latest approved facts, exactly as the webhook does before it answers.
  await refreshFactsFromDb();

  // His one thread. The id comes from the session scoped lookup and NEVER from the form: there
  // is no conversation id in any URL or any field, so there is nothing to tamper with.
  const threadId = await getOrCreateLekhioThread(user.id);
  if (!threadId) return back('?problem=unavailable');

  const stored = await saveLekhioThreadMessage(user.id, threadId, 'user', q);
  if (!stored) return back('?problem=unavailable');

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

  // The answer branches on business structure, exactly as WhatsApp's does: a sole trader, a
  // partner and a company director on the same profit owe three different amounts.
  const profile = await getBusinessProfile(userId).catch(() => null);

  if (profile?.businessType === 'limited_company') {
    const ct = corporationTax(Math.max(0, profit));
    return `As a limited company, on ${formatGbp(profit)} profit so far this tax year the corporation tax is about ${formatGbp(ct)}. That is the company's bill. What YOU pay depends on how you take the money out, salary and dividends. A rough guide from your confirmed entries, not a final figure.`;
  }

  const share = profile?.businessType === 'partnership' ? profile.partnershipShare / 100 : 1;
  const taxableProfit = Math.max(0, profit * share);
  const shareNote = share < 1 ? ` (your ${Math.round(share * 100)}% share of the ${formatGbp(profit)} partnership profit)` : '';

  const est = soleTraderTax(taxableProfit);
  const slSettings = await getStudentLoanSettings(userId).catch(() => null);
  const slPlans: StudentPlan[] = [];
  if (slSettings?.plan) slPlans.push(slSettings.plan);
  if (slSettings?.postgrad) slPlans.push('postgrad');
  const slDue = slPlans.length > 0 ? studentLoanForSA(taxableProfit, slSettings?.employmentIncome ?? 0, slPlans) : 0;
  const totalDue = est.total + slDue;
  const afterCis = Math.max(0, totalDue - totals.cis);
  const slLine = slDue > 0 ? ` including ${formatGbp(slDue)} of student loan` : '';
  const cisLine = totals.cis > 0 ? ` You have already had ${formatGbp(totals.cis)} taken in CIS, so the bill after that is about ${formatGbp(afterCis)}.` : '';
  return `On ${formatGbp(taxableProfit)} profit so far this tax year${shareNote}, the rough bill is ${formatGbp(totalDue)} (income tax plus National Insurance${slLine}).${cisLine} A rough guide from your confirmed entries, not a final figure.`;
}
