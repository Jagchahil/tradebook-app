import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../lib/webauth';
import { userBurst } from '../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import { answerMoneyQuestion, hasClaudeConfig } from '../../../lib/claude';
import { busyMessage, type AiBlockReason } from '../../../lib/banknudge';
import { decideSpend } from '../../../lib/aicost';
import { aiCapsFor } from '../../../lib/margin';
import {
  matchTotalsQuestion, formatGbp, isDeadlineQuestion, asksAmount, deadlineAnswer, type TotalsQuestion,
  matchProductTruth, productTruthAnswer,
} from '../../../lib/waintents';
import { hmrcFilingLive } from '../../../lib/features';
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
import {
  ingestReceiptImage, duplicateReceiptLine, MAX_RECEIPT_BYTES, RECEIPT_IMAGE_TYPES,
} from '../../../lib/receiptingest';
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
// name: deterministic intents first (deadlines via isDeadlineQuestion and deadlineAnswer, ahead of
// the totals lane exactly as the webhook runs them; totals via matchTotalsQuestion and
// totalsForUser; what he owes via taxPosition on getOptimiserInput, the tax hub's own figure;
// claims via checkExpense), then the guarded AI path (answerMoneyQuestion on
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

  // A message can be a RECEIPT PHOTOGRAPH as well as a question (5 August 2026), exactly as it
  // can on WhatsApp. The composer offers the photograph two ways under two names, the camera
  // input (receipt) and the plain picker (receipt_library), because capture="environment"
  // suppresses the photo library and the files chooser on an iPhone, and because FormData.get
  // returns the FIRST field with a name even when it is empty. The camera field wins when both
  // carry a file. The photograph goes through the SAME ingest walk as the capture route and
  // the webhook (lib/receiptingest.ts), never a copy of it, and the reply written into the chat
  // is what actually happened to it: read and waiting, folded into the bank line, refused as
  // the same receipt twice, or the honest refusal when it could not be read at all.
  const asFile = (v: FormDataEntryValue | null): File | null =>
    v && typeof v !== 'string' && v.size > 0 ? v : null;
  const receipt = asFile(f.get('receipt')) ?? asFile(f.get('receipt_library'));

  if (!q && !receipt) return back('&problem=empty');

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

  // The receipt turn. His words (or a plain line naming what he sent) go in as his turn, the
  // ingest walk runs, and what happened to the photograph is written back as Lekhio's turn.
  // When a photograph is attached it IS the message: any words ride along as his turn, and the
  // reply is about the receipt, because that is the thing he handed over.
  if (receipt) {
    const stored = await saveLekhioThreadMessage(user.id, threadId, 'user', q || 'A receipt photograph.');
    if (!stored) return back('&problem=unavailable');
    const reply = await receiptReply(user.id, receipt);
    await saveLekhioThreadMessage(user.id, threadId, 'lekhio', reply);
    return back('#end');
  }

  const stored = await saveLekhioThreadMessage(user.id, threadId, 'user', q);
  if (!stored) return back('&problem=unavailable');

  const reply = await composeReply(user.id, q);
  await saveLekhioThreadMessage(user.id, threadId, 'lekhio', reply);

  return back('#end');
}

// The WhatsApp answering order, without the WhatsApp only lanes (capture, sessions, buttons).
// Always returns a sentence: honesty when it cannot answer is part of the contract.
async function composeReply(userId: string, q: string): Promise<string> {
  // 0. Questions about Lekhio itself: filing, approval, promised savings. First, because the
  // totals lane and the claim rulebook both answered these with the right answer to the wrong
  // question (found live, 6 August 2026), and a screenshot of a green tick under "are you HMRC
  // approved" is a claim nobody here ever made on purpose.
  const truth = matchProductTruth(q);
  if (truth) return productTruthAnswer(truth, { filingLive: hmrcFilingLive() });

  // 1. Tax deadline questions: computed, no AI.
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THIS LANE MOVED ABOVE THE TOTALS LANE ON 9 AUGUST 2026, AND THE MOVE IS THE WHOLE FIX.
  //
  // Found live on this route: signed in as a sole trader, typed "when is my tax due", and got
  // "Put by £0.00 for tax. That is what the year is heading for..." with no date anywhere in it.
  // He asked WHEN and was told HOW MUCH. One minute later in the same chat, "when is the self
  // assessment deadline" returned the full answer with 31 January 2027 and 7 November 2026, so the
  // deadline lane was wired in and working the entire time. Only the ORDER was wrong.
  //
  // matchTotalsQuestion() wants a money word plus one of "how much", "what" or "my", and "my tax"
  // hands it both, so running it first ate the sentence before isDeadlineQuestion() was ever
  // called. app/api/whatsapp/route.ts had these two the other way round all along. Same words, two
  // channels, two different answers, which is exactly what the banner at the top of this file
  // says must never happen.
  //
  // ⚠️ AND IT IS NOT A SWAP OF TWO LINES, BECAUSE THE OVERLAP RUNS BOTH WAYS. "how much tax is
  // due", "how much tax is due on 31 January", "how much did I make before the tax return
  // deadline" and "how much profit before the tax deadline" all satisfy isDeadlineQuestion(), and
  // all four are a man asking for a NUMBER. A blind swap answers them with a date, which is the
  // same defect with the hands changed over. So the gate is `isDeadlineQuestion(q) && !asksAmount(q)`:
  // a named quantity ("how much", "how many", most "what" shapes) keeps the message in the totals
  // lane below, and everything that is only asking a time word comes here. asksAmount() is the ONE
  // definition, in lib/waintents.ts, and app/api/whatsapp/route.ts gates on the same call, so the
  // two channels route a phrase the same way or the ratchet in test/laneparity.test.mjs is red.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 IT USED TO BE `return deadlineAnswer()`, WITH HIS ID IN SCOPE ON THE LINE ABOVE.
  //
  // Nothing was passed, so a limited company director asking "when is my tax due" was handed a
  // quarterly update deadline for a return his company does not file. Who he is now goes in.
  //
  // ⚠️ AND THE POSITION IS null HERE ON PURPOSE, WHICH IS NOT A SHORTCUT. Making Tax Digital
  // mandation is a fact only HE holds (HMRC decides it from a return already filed and writes to
  // him), and the only place we keep his answer is the circumstances chain, which article 9 keeps
  // off this surface entirely: nothing from that chain may reach the chat, and test/thread.test.mjs
  // pins it in both files. So this route says plainly what it cannot know, and deadlineAnswer()
  // words it conditionally and asks him. The WhatsApp channel, which runs that chain, answers the
  // sharper way. Weaker, never contradictory, and the difference is article 9 doing its job.
  //
  // ⚠️ A FAILED READ IS UNKNOWN, NEVER A NO. Both facts fall back to null, which asks him.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (isDeadlineQuestion(q) && !asksAmount(q)) {
    const optimiser = await getOptimiserInput(userId).catch(() => null);
    return deadlineAnswer(new Date(), {
      structure: optimiser?.businessType ?? null,
      mtdPosition: null,
    });
  }

  // 2. Totals and what he owes: computed from his own confirmed rows, no AI, instant.
  const totals = matchTotalsQuestion(q);
  if (totals) return totalsAnswer(userId, totals);

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

// A receipt photograph, answered the way the capture page answers, in the chat's own voice.
// Always returns a sentence, and the sentence is what actually happened: this surface stores
// its reply in the chat, so silence or a fake would sit there for ever.
//
// The checks run in the capture route's order, translated from redirects into words: the size
// ceiling and the allowlist first (both the ingest module's own, so no door can accept what the
// reader cannot take), then the AI switch, then the SAME budget rings every thread question
// walks, then the one shared walk in lib/receiptingest.ts. Nothing here parses, writes or
// confirms anything itself: a reading always lands as waiting, and his yes lives on /app/pile.
async function receiptReply(userId: string, part: File): Promise<string> {
  if (part.size > MAX_RECEIPT_BYTES) {
    return 'That file is too big for me. Anything under four megabytes is fine.';
  }
  const mediaType = (part.type || '').toLowerCase();
  if (!RECEIPT_IMAGE_TYPES.includes(mediaType)) {
    return 'I cannot read that kind of file. A JPEG or PNG photograph works.';
  }
  if (!hasClaudeConfig()) {
    return 'Receipt reading is not switched on yet. Hang tight, it is coming very soon.';
  }
  const refused = await threadAiBlocked(userId);
  if (refused) {
    return busyMessage(refused, { available: false, connected: false });
  }

  const bytes = new Uint8Array(await part.arrayBuffer());
  const result = await ingestReceiptImage({ userId, bytes, mediaType, sourceType: 'web_image' });

  switch (result.outcome) {
    case 'unread':
      return 'I could not read that one. A clearer photograph with the total showing usually does it.';
    case 'failed':
      return 'That did not save. Nothing has changed, so try it again in a minute.';
    case 'merged':
      return `Your bank already sent me that £${result.amount.toFixed(2)} ${result.merchant} payment, so I have put the receipt with it rather than counting it twice. Filed under ${result.category}.`;
    case 'duplicate':
      // 🔴 The same receipt, twice: the shared refusal, word for word what WhatsApp says.
      return duplicateReceiptLine(result.merchant, result.amount, result.date);
    case 'logged':
      return `Read your ${result.merchant} receipt. £${result.amount.toFixed(2)}, filed as ${result.category}, and it is waiting for your yes under Waiting on you.`;
  }
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
    // ⚠️ CHANNEL AWARE, AND THE DIFFERENCE IS WHAT HE CAN ACTUALLY DO. The WhatsApp handler keeps
    // its own wording ("Send me a receipt") because on that channel a receipt is the very thing he
    // is holding. Here he is on the web, where the chat takes no receipts and his number may not
    // be bound, so the sentence names the door that always works: the Money pages.
    return `Nothing logged ${q.periodLabel === 'all time' ? 'yet' : q.periodLabel}. Add what you earn and spend from the Money pages and the tally starts itself.`;
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
