import { NextRequest, NextResponse, after } from 'next/server';
import { answerAccountantQuestion, hasClaudeConfig } from '../../../lib/claude';
import { verifyAccessToken, bumpAiUsage, countActiveSubscribers, transactionSummaryForUser, getRelevantKnowledge, createConversation, conversationOwnedBy, saveConversationTurn, logQaCandidate, normaliseQuestion, isGeneralQuestion, lookupQaCache, bumpQaCacheHit, upsertQaCache, allSourcesRecognised, getBusinessProfile, getStudentLoanSettings } from '../../../lib/supabase';
import { pocketHistoryBrief } from '../../../lib/pocket';
import { byPhase, daysUntil } from '../../../lib/brain';
import { rateLimitedShared } from '../../../lib/ratelimit';
import { decideSpend } from '../../../lib/aicost';
import { aiCapsFor } from '../../../lib/margin';

// The in-app accountant endpoint. The app posts a question with the user's
// Supabase access token. We verify the user, meter usage so costs stay bounded
// (protecting margin), optionally load their figures for a real numeric answer,
// then return the expert reply.
//
// Cost control, three layers:
//   1. Per-user daily quota (ASK_DAILY_LIMIT, default 6). This is a PRODUCT
//      promise shown to the user ("your 6 questions today"), not the wallet guard.
//   2. Global daily and monthly AI ceilings, DERIVED from the live paying base and
//      the margin floor (lib/margin.ts, lib/aicost.ts) and shared with the
//      WhatsApp AI path, so total AI spend is bounded once and the ceiling grows
//      with the business instead of throttling it.
//   3. In-memory burst limit, so rapid-fire taps do not stack up calls.

const DAILY_LIMIT = Number(process.env.ASK_DAILY_LIMIT || 6);

function str(v: unknown, max = 1000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

export async function POST(req: NextRequest) {
  if (!hasClaudeConfig()) {
    return NextResponse.json({ error: 'unavailable', answer: 'The accountant is not switched on yet. Please try again later.' }, { status: 503 });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const userId = verified.id;

  // Burst guard: at most a handful of questions in a short window.
  if (await rateLimitedShared(`ask:${userId}`, 4, 60 * 1000)) {
    return NextResponse.json({ error: 'slow_down', answer: 'One sec, give me a moment to catch up and ask again.' }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // ignore
  }
  const question = str(body.question, 1000).trim();
  if (question.length < 2) {
    return NextResponse.json({ error: 'empty' }, { status: 400 });
  }
  // Optional: continue an existing thread. Absent means start a new one.
  const conversationIdIn = str(body.conversationId, 100).trim();

  // Cache first (doc 95 Feature B). A GENERAL question that was answered before
  // from recognised sources is served for FREE: it does not call the paid model
  // and does not touch the daily cap, so it works even when a user has used up
  // their paid questions. This is the credit saver, one paid answer per distinct
  // question serves everyone who ever asks it.
  const questionNorm = normaliseQuestion(question);
  const general = isGeneralQuestion(question);
  if (general) {
    const cached = await lookupQaCache(questionNorm);
    if (cached) {
      let conversationId = '';
      if (conversationIdIn && (await conversationOwnedBy(userId, conversationIdIn))) {
        conversationId = conversationIdIn;
      } else {
        conversationId = (await createConversation(userId, question)) || '';
      }
      after(async () => {
        if (conversationId) await saveConversationTurn(userId, conversationId, question, cached.answer, cached.sources);
        await bumpQaCacheHit(questionNorm);
      });
      // remaining is null so the app keeps its last pill: a free answer never
      // decrements the visible counter.
      return NextResponse.json({ answer: cached.answer, remaining: null, limit: DAILY_LIMIT, conversationId, sources: cached.sources, cached: true });
    }
  }

  // Per-user daily cap. Fail CLOSED: if the durable counter is unavailable we do
  // not spend on the paid AI, so a database hiccup can never become a cost blowup.
  const userCount = await bumpAiUsage('ask', userId);
  if (userCount === null) {
    return NextResponse.json({ error: 'busy', answer: 'The accountant is briefly unavailable. Please try again in a moment.' }, { status: 503 });
  }
  if (userCount > DAILY_LIMIT) {
    return NextResponse.json(
      { error: 'daily_limit', limit: DAILY_LIMIT, remaining: 0, answer: `That is your ${DAILY_LIMIT} accountant questions for today. They reset tomorrow. For anything urgent, your figures are always in the app.` },
      { status: 429 },
    );
  }
  const remaining = Math.max(0, DAILY_LIMIT - userCount);

  // The global AI ceiling, DERIVED from the live paying base and the margin floor
  // (lib/margin.ts). Two things were wrong before: the ceiling was a flat 3,000 a
  // day, which becomes a hard GROWTH CEILING once there are real users, and it sat
  // in its own counter separate from the WhatsApp AI path, so total AI spend was
  // bounded twice over rather than once. Both paths now share one global counter,
  // so the budget means what it says. Fails CLOSED on an unreadable counter.
  const subs = await countActiveSubscribers();
  const caps = aiCapsFor(subs ?? 0);
  const busy = NextResponse.json(
    { error: 'busy', answer: 'The accountant is very busy right now. Please try again shortly.' },
    { status: 503 },
  );
  if (caps.killed) return busy;
  const globalDay = await bumpAiUsage('global', 'all');
  const globalMonth = await bumpAiUsage('globalmonth', new Date().toISOString().slice(0, 7));
  if (globalDay === null || globalMonth === null) return busy;
  // userDay is 0 here: the per-user quota is the DAILY_LIMIT check above, which is
  // a product promise ("your 6 questions"), not the wallet guard.
  const decision = decideSpend({ globalDay: globalDay - 1, globalMonth: globalMonth - 1, userDay: 0 }, caps);
  if (!decision.allowed) {
    console.warn(`[ask] AI refused: ${decision.reason} (subs=${subs ?? 'unknown'})`);
    return busy;
  }

  // Pull a compact summary of their figures so money questions get real numbers.
  let context = '';
  try {
    context = await transactionSummaryForUser(userId, 120);
  } catch {
    context = '';
  }

  // Fold in any verified GOV.UK / HMRC updates Khoji has distilled and a human
  // has reviewed. Reviewed and source-linked only, so an empty or un-reviewed
  // knowledge base simply yields nothing and Puchio answers from its static,
  // exam-verified rules exactly as before. This is how the brain grows into the
  // answers without ever letting an unchecked summary become advice.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT IS THE LAW TODAY, AND WHAT IS MERELY COMING. TWO LISTS. NEVER ONE.
  //
  // This block used to hand the model a single list, every item written as
  //
  //     "- Mileage rate change (effective 2027-04-06): ... [source: ...]"
  //
  // under a prompt that says "treat these as the latest confirmed position, PREFER them where they
  // are relevant". So a Budget change announced in November and biting the following April went in
  // as a preferred fact, with the date sitting there as decoration, and the model was left to work
  // out on its own that it had not happened yet.
  //
  // A man asks in January what he can claim per mile. The model does as it is told, prefers the
  // "latest confirmed position", and gives him next year's rate. He logs three months of mileage at
  // a number that is not the law, and he signs the return himself.
  //
  // ⚠️ A MODEL MUST NEVER BE ASKED TO DO THE DATE ARITHMETIC THAT DECIDES WHICH LAW APPLIES.
  //
  // The comparison happens HERE, in TypeScript, against a real clock (lib/brain.ts phase()). The
  // model receives the conclusion, already reasoned, in two blocks it cannot confuse.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  let knowledge = '';
  let sourceUrls: string[] = [];
  try {
    const items = await getRelevantKnowledge(question, 6);
    if (items.length) {
      sourceUrls = items.map((k) => k.source_url).filter(Boolean);

      const { inForce, announced, unknown } = byPhase(items);
      const line = (k: typeof items[number]) => `- ${k.title}: ${k.summary} [source: ${k.source_url}]`;

      const blocks: string[] = [];

      // What actually governs his answer.
      //
      // ⚠️ AND `unknown` IS NOT IN HERE. THE LIVE DATA TAUGHT ME THIS AN HOUR AFTER I WROTE IT.
      //
      // My first version folded the undated items in with the in-force ones, on the reasoning that
      // "not knowing when it bites is not a reason to hide it". That is true, and it is not a reason
      // to call it the law either, which is what the heading on this block does.
      //
      // Here is HMRC's own Operative date section from a measure published on 13 July 2026:
      //
      //     "The operative date for the increase to the threshold is SUBJECT TO THE STATUTORY
      //      INSTRUMENT that will make this change. The changes ... will apply to deliberate
      //      non-compliance which takes place AFTER THE DATE OF ROYAL ASSENT to Finance Bill 2026-27."
      //
      // There is no calendar date because HMRC does not have one yet. So our extractor honestly
      // returns null, and phase() honestly says `unknown`, and then I handed it to a language model
      // under a heading reading THE LAW AS IT STANDS TODAY. A measure awaiting Royal Assent is not
      // the law today. It is a draft.
      //
      // UNKNOWN IS NOT TODAY. It is its own answer and it gets its own block.
      if (inForce.length) {
        blocks.push(`THE LAW AS IT STANDS TODAY. Use these to answer.\n${inForce.map(line).join('\n')}`);
      }

      // We know it matters. We do not know when it starts. Both halves of that are worth saying, and
      // neither of them is "this is the law".
      if (unknown.length) {
        blocks.push(
          'WE DO NOT KNOW WHEN THESE START. The source does not give a date: usually it is waiting on '
          + 'Royal Assent or a Statutory Instrument. Do NOT state any figure from this block as the '
          + 'current rule, and do NOT tell him it is coming on a particular date. If one of them bears '
          + 'on his question, say that a change is proposed, that the start date is not yet set, and '
          + 'point him at the source.\n'
          + unknown.map(line).join('\n'),
        );
      }

      // Coming, but NOT YET LAW. He must not be given these as the answer.
      if (announced.length) {
        blocks.push(
          'ANNOUNCED BUT NOT YET IN FORCE. These are NOT the law today and MUST NOT be used to answer '
          + 'his question. Do not quote these figures as current. If one of them is about to change the '
          + 'answer you have just given him, add ONE short line at the end telling him what changes and '
          + 'from when, so he can plan. Otherwise say nothing about them.\n'
          + announced.map((k) => {
            const days = daysUntil(k.effective_date);
            const when = `from ${k.effective_date}${days !== null ? `, which is ${days} days away` : ''}`;
            return `- ${k.title} (${when}): ${k.summary} [source: ${k.source_url}]`;
          }).join('\n'),
        );
      }

      knowledge = blocks.join('\n\n');
    }
  } catch {
    knowledge = '';
    sourceUrls = [];
  }

  // The user's structure and income mix, so a company director gets company answers, not sole-trader
  // ones by default. A cheap read; on any failure Puchio answers structure-agnostic exactly as before.
  let profile = '';
  try {
    const [bp, inc] = await Promise.all([getBusinessProfile(userId), getStudentLoanSettings(userId)]);
    if (bp) {
      const parts = [`Business structure: ${bp.businessType.replace('_', ' ')}`];
      if (bp.businessType === 'partnership' && bp.partnershipShare < 100) {
        parts.push(`their share of the partnership profit is about ${bp.partnershipShare}%`);
      }
      if (inc) {
        if (inc.employmentIncome > 0) parts.push(`salary or PAYE income about £${inc.employmentIncome.toLocaleString('en-GB')}`);
        if (inc.dividendIncome > 0) parts.push(`dividends about £${inc.dividendIncome.toLocaleString('en-GB')}`);
        if (inc.savingsIncome > 0) parts.push(`savings interest about £${inc.savingsIncome.toLocaleString('en-GB')}`);
      }
      profile = parts.join('; ') + '.';
    }
  } catch {
    profile = '';
  }

  // Khoji's memory (the pocket), but ONLY when the question is about a past or changed figure, so an
  // ordinary question never pays for the lookup.
  let history = '';
  if (/\b(was|before|used to|last year|previous|previously|changed|back then|history|prior|old rate)\b/i.test(question)) {
    try {
      history = await pocketHistoryBrief();
    } catch {
      history = '';
    }
  }

  const answer = await answerAccountantQuestion(question, context, knowledge, profile, history);
  if (!answer) {
    return NextResponse.json({ error: 'failed', answer: 'I could not work that out just now. Try rewording it, or ask me something else.' }, { status: 502 });
  }

  // Resolve the thread. A client supplied conversation id is trusted ONLY if it
  // belongs to this user, otherwise we start a fresh one. This stops a crafted id
  // from attaching a message to someone else's thread. The new thread is created
  // inline because the client needs its id back to continue the chat.
  let conversationId = '';
  if (conversationIdIn && (await conversationOwnedBy(userId, conversationIdIn))) {
    conversationId = conversationIdIn;
  } else {
    conversationId = (await createConversation(userId, question)) || '';
  }

  // Store the turn and log the learning candidate AFTER the response is sent, so
  // the user never waits on this best effort persistence.
  after(async () => {
    if (conversationId) {
      await saveConversationTurn(userId, conversationId, question, answer, sourceUrls);
    }
    await logQaCandidate(question, answer, sourceUrls, sourceUrls.length > 0);
    // Populate the free cache only when BOTH gates pass: the question carried no
    // personal context, and every source was recognised. So a served answer can
    // never contain another user's figures and is always source backed.
    if (general && allSourcesRecognised(sourceUrls)) {
      await upsertQaCache(questionNorm, question, answer, sourceUrls);
    }
  });

  return NextResponse.json({ answer, remaining, limit: DAILY_LIMIT, conversationId, sources: sourceUrls });
}
