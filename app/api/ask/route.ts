import { NextRequest, NextResponse } from 'next/server';
import { answerAccountantQuestion, hasClaudeConfig } from '../../../lib/claude';
import { verifyAccessToken, bumpAiUsage, transactionSummaryForUser, getRelevantKnowledge, createConversation, saveMessage, logQaCandidate } from '../../../lib/supabase';
import { rateLimited } from '../../../lib/ratelimit';

// The in-app accountant endpoint. The app posts a question with the user's
// Supabase access token. We verify the user, meter usage so costs stay bounded
// (protecting margin), optionally load their figures for a real numeric answer,
// then return the expert reply.
//
// Cost control, three layers:
//   1. Per-user daily cap (ASK_DAILY_LIMIT, default 6). Keeps any one user's spend
//      tiny and predictable, which is what holds the 85% margin.
//   2. Global daily cap (ASK_GLOBAL_DAILY, default 3000). A hard ceiling on total
//      spend across everyone, so a surge can never blow the budget.
//   3. In-memory burst limit, so rapid-fire taps do not stack up calls.

const DAILY_LIMIT = Number(process.env.ASK_DAILY_LIMIT || 6);
const GLOBAL_DAILY = Number(process.env.ASK_GLOBAL_DAILY || 3000);

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
  if (rateLimited(`ask:${userId}`, 4, 60 * 1000)) {
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

  // Global daily ceiling.
  const globalCount = await bumpAiUsage('ask:global', 'all');
  if (globalCount !== null && globalCount > GLOBAL_DAILY) {
    return NextResponse.json({ error: 'busy', answer: 'The accountant is very busy right now. Please try again shortly.' }, { status: 503 });
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
  let knowledge = '';
  let sourceUrls: string[] = [];
  try {
    const items = await getRelevantKnowledge(question, 6);
    if (items.length) {
      sourceUrls = items.map((k) => k.source_url).filter(Boolean);
      knowledge = items
        .map((k) => `- ${k.title}${k.effective_date ? ` (effective ${k.effective_date})` : ''}: ${k.summary} [source: ${k.source_url}]`)
        .join('\n');
    }
  } catch {
    knowledge = '';
    sourceUrls = [];
  }

  const answer = await answerAccountantQuestion(question, context, knowledge);
  if (!answer) {
    return NextResponse.json({ error: 'failed', answer: 'I could not work that out just now. Try rewording it, or ask me something else.' }, { status: 502 });
  }

  // Persist the turn so the chat appears in the Messages tab and can be reused.
  // All best effort: storage must never block or fail the answer the user waits on.
  let conversationId = conversationIdIn;
  if (!conversationId) {
    conversationId = (await createConversation(userId, question)) || '';
  }
  if (conversationId) {
    await saveMessage(userId, conversationId, 'user', question);
    await saveMessage(userId, conversationId, 'puchio', answer, sourceUrls);
  }
  // Log for the learning loop: the general question and answer, no personal figures.
  await logQaCandidate(question, answer, sourceUrls, sourceUrls.length > 0);

  return NextResponse.json({ answer, remaining, limit: DAILY_LIMIT, conversationId, sources: sourceUrls });
}
