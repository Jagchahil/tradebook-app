import { NextRequest, NextResponse, after } from 'next/server';
import { answerAccountantQuestion, hasClaudeConfig } from '../../../lib/claude';
import { bumpAiUsage, countActiveSubscribers, transactionSummaryForUser, getRelevantKnowledge, createConversation, conversationOwnedBy, saveConversationTurn, logQaCandidate, normaliseQuestion, isGeneralQuestion, lookupQaCache, bumpQaCacheHit, upsertQaCache, allSourcesRecognised, getBusinessProfile, getStudentLoanSettings, refreshFactsFromDb } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { pocketHistoryBrief } from '../../../lib/pocket';
import { byPhase, daysUntil } from '../../../lib/brain';
import { rateLimitedShared } from '../../../lib/ratelimit';
import { decideSpend } from '../../../lib/aicost';
import { aiCapsFor } from '../../../lib/margin';
import { gateForUser, refuseUnentitled } from '../../../lib/gateserver';
import {
  matchProductTruth, productTruthAnswer,
  isDataRightsRequest, DATA_RIGHTS_ANSWER, isVehicleQuestion, vehicleAnswer,
  isScottishRatesQuestion, isVatQuestion,
  isAboutSomeoneElse, SOMEONE_ELSE_ANSWER,
  isDeadlineQuestion, asksAmount, deadlineAnswer,
  isNiQuestion, isStudentLoanQuestion, isPropertyQuestion, isSavingsQuestion,
} from '../../../lib/waintents';
import { SCOTTISH_RATES_ANSWER } from '../../../lib/scotland';
import { vatAnswerForUser } from '../../../lib/vatanswer';
import { savingsAnswerForUser } from '../../../lib/savingsanswer';
import { niAnswerForUser, studentLoanAnswerForUser, propertyAnswerForUser } from '../../../lib/laneanswers';
import { getOptimiserInput } from '../../../lib/supabase';
import { hmrcFilingLive } from '../../../lib/features';

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

  const verified = await sessionUser(req);
  if (!verified) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(verified.id)) === 'readonly') return refuseUnentitled(req, '/app');
  const userId = verified.id;

  // Burst guard: at most a handful of questions in a short window.
  if (await rateLimitedShared(`ask:${userId}`, 4, 60 * 1000)) {
    return NextResponse.json({ error: 'slow_down', answer: 'One sec, give me a moment to catch up and ask again.' }, { status: 429 });
  }

  // Answer on the latest approved facts.
  await refreshFactsFromDb();

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

  // 🔴 PRODUCT TRUTH BEFORE ANYTHING ELSE, ON THIS LANE TOO.
  //
  // "Are you HMRC approved", "do you file my return", "how much will you save me", an ask to hide
  // income, an ask for investment advice. The WhatsApp router has gated these deterministically
  // since 6 August 2026 and answers them with fixed, true words. This route never did, so the same
  // question typed into the app reached the model and was answered in whatever words it chose. A
  // screenshot of Lekhio claiming HMRC approval is the same problem whichever box it was typed in.
  //
  // It runs before the cache, before the daily cap and before the model, because the answer is
  // deterministic and true: it costs nothing, and it must never be served from a shared cache or
  // withheld because a man has used up his paid questions.
  const productKind = matchProductTruth(question);
  let truth = productKind ? productTruthAnswer(productKind, { filingLive: hmrcFilingLive() }) : '';

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 SOMEBODY ELSE'S MONEY, AND THIS IS THE THIRD ROUTER AND THE LAST ONE. B19, 17 August 2026.
  //
  // This is not an answer lane. It is the GATE that stops a lane reading his books to answer a
  // question that was not about them, and it has now been found three times on three surfaces.
  // Run 1 found the shape on the chat router: "what does the barber next door owe you lot then"
  // answered with HER OWN set aside figure. Run 2 built isAboutSomeoneElse and wired it into the
  // WhatsApp webhook. Run 3 found the chat router, the one the finding came from, still had no gate
  // of any kind, and wired it there. NOBODY EVER WIRED THIS ONE, so from Run 2 until today the gate
  // has been on two routers out of three and a man typing "how much has jerome made this year" into
  // the in app accountant reached the model.
  //
  // ⚠️ AND THIS ROUTE FAILS IN TWO DIRECTIONS, NOT ONE, WHICH IS WHY IT HAS TO SIT UP HERE.
  //
  //   1. WITH a first person word ("how much has my mate jerome made this year"), isGeneralQuestion
  //      is false, so transactionSummaryForUser hands the model this customer's entire ledger while
  //      it composes an answer about somebody else. That is Run 1's finding exactly, on the surface
  //      that was never told about it.
  //   2. WITHOUT one, the question is classed GENERAL, the model is handed no books and invents,
  //      and then the invented answer is written to qa_cache under the third party's name and
  //      served for free to every other customer who ever asks it. Run 3 read two channels invent
  //      two different pairs of figures for one man in one evening; this route is the one that can
  //      keep an invention and hand it on.
  //
  // The gate returns above BOTH of those, above the daily cap, and above the model, so neither path
  // exists rather than both being unlikely. It is also free and must be: refusing to discuss a
  // third party is not worth one of his six questions for the day, and a man who is metered for
  // asking is a man who rephrases until something answers.
  //
  // ⚠️ NO SELF NAMES PASSED, AND THAT IS THE SAME ARGUED CHOICE app/api/thread/route.ts MADE.
  // sessionUser returns an id, an email and a phone, and no person name, so passing one would add a
  // database round trip to every question to remove a false positive that costs one re-ask ("how
  // much has marcus made", asked by Marcus). selfNameTokens() is exported and ready for a caller
  // that already holds the name. Nothing should fetch it just for this.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND THE ERASURE LANE RUNS ABOVE IT, WHICH MOVED ON 17 AUGUST 2026. B22. It used to sit
  // below this gate, and that is the wrong way round for the reason test/laneparity.test.mjs
  // section 5 gives: a man asking to be erased must never be refused and never be metered, and an
  // erasure that happens to name somebody would have been refused. One rule on three routers:
  // erasure, then this gate, then the deadline lane. This route was already the right way round on
  // the second half of that and is now the right way round on both.
  if (!truth && isDataRightsRequest(question)) truth = DATA_RIGHTS_ANSWER;

  if (!truth && isAboutSomeoneElse(question)) truth = SOMEONE_ELSE_ANSWER;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND THE OTHER TWO DETERMINISTIC LANES, ON THIS SURFACE TOO. Found 12 August 2026 by asking
  // this route the two questions RUN 1 closed, and watching both fall straight through.
  //
  // The lanes were built and proved, and they landed on app/api/thread only. This product answers
  // questions on THREE surfaces and the fix reached one of them. It is the same miss as the lender
  // document the day before: one renderer fixed, one hand written page left lying.
  //
  // ⚠️ WHAT THIS ROUTE ACTUALLY SAID TO A CUSTOMER, LIVE, ON 12 AUGUST, when asked how to delete
  // his data: "usually under something like Settings, Account, or Privacy" and "contact Lekhio
  // support directly". A guess, hedged, about a door that exists at /app/you/data, plus the exact
  // support queue RUN 1 was spent removing. AND IT COST HIM ONE OF HIS SIX QUESTIONS FOR THE DAY.
  // That is the part that turns a wrong answer into a wrong product: the man being metered for
  // asking how to leave is the man most likely to have decided to.
  //
  // Both sit above the cache and above the cap, exactly like product truth, and for the same
  // reason: the answer is fixed and true, so it costs nothing and is never withheld.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHEN HIS RETURN IS DUE, ON THIS SURFACE TOO. B19, 17 August 2026, and it is the fifth
  // time this exact shape has been written down. The comment two blocks up was written on 12 August
  // about the data rights lane and says the whole of it in advance: "this product answers questions
  // on THREE surfaces and the fix reached one of them."
  //
  // deadlineAnswer() has taken WHO IS ASKING since 7 August, and app/api/whatsapp/route.ts and
  // app/api/thread/route.ts have both dispatched it since. This route never did, so a man who typed
  // "when is my tax due" into the in app accountant was answered by the MODEL, and every reason the
  // header on deadlineAnswer() gives applied to him in full: a limited company director handed a
  // quarterly update for a return his company does not file, a partner handed one for a regime
  // GOV.UK has announced no date for, and a sole trader HMRC has never written to handed one for an
  // update he does not have to make. The model has none of those three facts about him and no way
  // to ask for them.
  //
  // ⚠️ THE TIE BREAK IS NOT OPTIONAL AND IT IS THE SAME ONE THE OTHER TWO CARRY. asksAmount() is the
  // ONE definition, in lib/waintents.ts. "how much tax is due on 31 January" satisfies
  // isDeadlineQuestion() and is a man asking for a NUMBER, so without `&& !asksAmount(question)`
  // this lane answers him with a DATE, which is test/laneparity.test.mjs section 2's own defect with
  // the hands changed over. A copy of the rule typed here would be the second definition this
  // codebase keeps deleting.
  //
  // ⚠️ ABOVE THE SHARED CACHE, AND ON THIS ROUTE THAT IS THE PART THAT IS NOT OPTIONAL. qa_cache is
  // keyed on the QUESTION ALONE with no user id and served to every other customer who asks the
  // same thing. "when is the self assessment deadline" carries no first person word, so it is
  // classed GENERAL and IS cacheable, and the answer below depends on HIS structure: a director's
  // reply would be written to the shared cache and read back to a sole trader as his own. Returning
  // here means it is returned before questionNorm is ever computed, so a structure specific answer
  // cannot enter a shared cache by any path. Structural rather than hopeful, like the VAT lane
  // below, and test/laneparity.test.mjs holds the order.
  //
  // ⚠️ AND ABOVE THE CAP, because a missed deadline is an automatic penalty of HIS money and a man
  // must not be refused the date for having used up his six. It costs one read of his own profile
  // and no model call at all, so there is nothing to meter.
  //
  // ⚠️ THE POSITION IS null HERE ON PURPOSE, WHICH IS NOT A SHORTCUT, AND IT IS THE CHOICE
  // app/api/thread/route.ts ARGUED FIRST. Making Tax Digital mandation is a fact only HE holds: HMRC
  // decides it from a return already filed and writes to him, and the only place we keep his answer
  // is the circumstances chain. This route has never touched that chain and does not start here,
  // for the reason test/thread.test.mjs pins on the other web surface (article 9): the chain carries
  // one special category row and the control is that a surface which has no business reading it
  // cannot reach it at all. So this route says plainly what it cannot know, deadlineAnswer() words
  // it conditionally and asks him, and the WhatsApp channel, which runs that chain, answers the
  // sharper way. Weaker, never contradictory.
  //
  // ⚠️ A FAILED READ IS UNKNOWN, NEVER A NO. The catch lands on null, which asks him.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (!truth && isDeadlineQuestion(question) && !asksAmount(question)) {
    const o = await getOptimiserInput(userId).catch(() => null);
    truth = deadlineAnswer(new Date(), {
      structure: o?.businessType ?? null,
      mtdPosition: null,
    });
  }

  if (!truth && isVehicleQuestion(question)) {
    const o = await getOptimiserInput(userId).catch(() => null);
    truth = vehicleAnswer({
      boughtThroughBooks: o?.vehicleBoughtThroughBooks === true,
      allowanceThisYear: Math.max(0, o?.ytdCapitalAllowances ?? 0),
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 VAT, ON THIS SURFACE TOO, AND HERE IT WAS COSTING HIM A QUESTION AS WELL. B18, 17 August
  // 2026. isVatQuestion was dispatched by app/api/whatsapp/route.ts and by nothing else, so the in
  // app accountant answered the threshold question from the model. The block above this one was
  // written on 12 August about the data rights lane and says the whole of it in advance: "this
  // product answers questions on THREE surfaces and the fix reached one of them."
  //
  // ⚠️ IT SITS WITH THE OTHER DETERMINISTIC LANES, ABOVE THE CACHE AND ABOVE THE CAP, AND THE CACHE
  // IS THE PART THAT IS NOT OPTIONAL. qa_cache is keyed on the QUESTION ALONE with no user id and
  // is served to every other customer who asks the same thing. This answer carries his own rolling
  // twelve month turnover. Returning it here means it is returned before questionNorm is ever
  // computed and long before upsertQaCache is reached, so a personal figure cannot enter a shared
  // cache by any path. That is a structural guarantee rather than a hopeful one, exactly as the
  // comment on the transaction summary below demands, and test/laneparity.test.mjs holds the order.
  //
  // ⚠️ AND ABOVE THE CAP BECAUSE A MAN NEAR THE LINE MUST NOT BE REFUSED THIS ONE FOR HAVING USED
  // UP HIS SIX. Registering late is a penalty. The read is two queries against his own rows and
  // costs no model call at all, so there is nothing to meter.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (!truth && isVatQuestion(question)) truth = await vatAnswerForUser(userId, question);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 HIS PROPERTY STREAM, HIS STUDENT LOAN AND HIS NATIONAL INSURANCE, ON THIS SURFACE TOO.
  // B19, 17 August 2026, and the block written on 12 August about the data rights lane says the
  // whole of it in advance: "this product answers questions on THREE surfaces and the fix reached
  // one of them."
  //
  // Three predicates that have existed since Run 2, three pure builders that read his own rows,
  // and one router dispatching all three. A man who typed "how much national insurance do i pay"
  // into the accountant box was answered by the model, which holds none of his rows, none of his
  // plan and none of his income shape, AND IT COST HIM ONE OF HIS SIX QUESTIONS FOR THE DAY.
  //
  // ⚠️ ABOVE THE SHARED CACHE, AND ON THIS ROUTE THAT IS THE PART THAT IS NOT OPTIONAL. qa_cache is
  // keyed on the QUESTION ALONE with no user id and served to every other customer who asks the
  // same thing. Every one of these three answers is nothing BUT his own figures: his Class 4 on his
  // profit, his student loan building against his own income, his rent and the tax it causes. And
  // every one of them has an ordinary phrasing with no first person word in it. "how much national
  // insurance is due on a profit of this size" and "what tax is owed on rental income" are classed
  // GENERAL, so without this bound the answer composed from HIS books would be written to a shared
  // cache under a question anybody can ask. Returning here means it is returned before questionNorm
  // is ever computed and long before upsertQaCache is reached, so a personal figure cannot enter
  // that cache by any path. Structural rather than hopeful, and test/laneparity.test.mjs holds all
  // three bounds by index rather than by inspection.
  //
  // ⚠️ AND ABOVE THE CAP, because none of the three costs a model call. They are reads of his own
  // rows, and metering a man for asking what National Insurance he owes is metering him for the
  // thing the product exists to do.
  //
  // ⚠️ THE ORDER IS THE OTHER TWO ROUTERS' ORDER: below the VAT lane, above the Scottish rates gate.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (!truth && isPropertyQuestion(question)) truth = await propertyAnswerForUser(userId, 'web');
  if (!truth && isStudentLoanQuestion(question)) truth = await studentLoanAnswerForUser(userId, 'web');
  if (!truth && isNiQuestion(question)) truth = await niAnswerForUser(userId);

  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT LEKHIO HAS SAVED HIM, AND ON THIS ROUTE THE CACHE BOUND IS THE PART THAT IS NOT
  // OPTIONAL. B19, 18 August 2026.
  //
  // qa_cache is keyed on the QUESTION ALONE with no user id, and "was it worth it" carries no first
  // person word at all, so isGeneralQuestion classes it GENERAL and the model's answer is written
  // to the shared cache and read back to the next man who types it. The payload here is the largest
  // personal money figure this product prints: what his own costs took off his own tax bill, plus
  // his CIS refund. One man's saving read back to another as his own is the worst leak on the list.
  //
  // This lane returns ABOVE normaliseQuestion, above lookupQaCache, above the daily cap and above
  // the model, exactly as the deadline, VAT and three lane cells do. test/laneparity.test.mjs
  // section 10 DERIVES all four bounds from this file rather than trusting this comment.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  if (!truth && isSavingsQuestion(question)) truth = await savingsAnswerForUser(userId);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 SCOTTISH RATES, ON THIS SURFACE TOO, AND THE HEADER ABOVE SAYS WHY IN ADVANCE. B16, 17
  // August 2026. "This product answers questions on THREE surfaces and the fix reached one of
  // them." It was written on 12 August about the data rights lane. It was true again five days
  // later: B2 built the Scotland rule for the two prompts and this route answers from a prompt.
  //
  // ⚠️ THIS IS THE ROUTE WHOSE PROMPT ALREADY HAD A SCOTLAND RULE AND IGNORED IT. accountantSystem()
  // carried the instruction as a literal all along. Asked what a Glasgow plumber should put by, the
  // lane replied that his rates are the same as the rest of the UK, which is false, and then quoted
  // a band table with a 41% higher rate and a 46% top rate, which matches no tax year in force. The
  // rule moved into the shared block the same day so the other channel gets it too. This line is
  // the part that does not depend on the model reading it.
  //
  // ⚠️ AND IT REFUSES TO PRICE ANYTHING, which is lib/scotland.ts's fourth rule and the reason the
  // answer is a constant from that file rather than a sentence typed here.
  //
  // Above the cache and above the cap with the other three, for the reason the block above gives:
  // the answer is fixed and true, so it costs nothing and is never withheld.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (!truth && isScottishRatesQuestion(question)) truth = SCOTTISH_RATES_ANSWER;

  if (truth) {
    let conversationId = '';
    if (conversationIdIn && (await conversationOwnedBy(userId, conversationIdIn))) {
      conversationId = conversationIdIn;
    } else {
      conversationId = (await createConversation(userId, question)) || '';
    }
    after(async () => {
      if (conversationId) await saveConversationTurn(userId, conversationId, question, truth, []);
    });
    // remaining is null so a free, deterministic answer never decrements his visible counter.
    return NextResponse.json({ answer: truth, remaining: null, limit: DAILY_LIMIT, conversationId, sources: [] });
  }

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
  //
  // 🔴 BUT NEVER WHEN THE ANSWER IS CACHEABLE, AND THIS IS THE WHOLE REASON.
  // A question carrying no first person word is classed GENERAL, and a general
  // answer is written to qa_cache, which is keyed on the QUESTION ALONE with no
  // user id, then served to every other customer who asks the same thing. If the
  // model is handed this customer's books while composing that answer, it can
  // put his figures into it, and the next man to ask the question reads them.
  // The old gate was a pronoun test on the QUESTION, and a pronoun test cannot
  // know what the model chose to write in the ANSWER.
  //
  // So the guarantee is structural rather than hopeful: an answer that can be
  // cached is composed with NO personal input at all, and then it cannot carry
  // anybody's figures whatever the model writes.
  //
  // The phrasings this closes are the ordinary ones, not exotic attacks: "how
  // close is the business to the vat threshold", "what tax is owed this year",
  // "how much has been spent on fuel this year". Each now gets a general answer
  // until the customer says "my", and that is the honest price of a cache that
  // every customer shares.
  let context = '';
  if (!general) {
    try {
      context = await transactionSummaryForUser(userId, 120);
    } catch {
      context = '';
    }
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
  //
  // 🔴 PERSONAL INPUT, SO IT OBEYS THE SAME CACHE RULE AS THE FIGURES ABOVE.
  // This block is not merely a structure label. It states his partnership share
  // and his actual salary, dividend and savings income in pounds, which is as
  // identifying as the transaction summary and in some ways worse. A cacheable
  // answer is composed with no personal input, so it is skipped for a general
  // question exactly as the books are.
  let profile = '';
  if (!general) {
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
    await logQaCandidate(userId, question, answer, sourceUrls, sourceUrls.length > 0);
    // Populate the free cache only when BOTH gates pass: the question carried no
    // personal context, and every source was recognised. So a served answer can
    // never contain another user's figures and is always source backed.
    if (general && allSourcesRecognised(sourceUrls)) {
      await upsertQaCache(questionNorm, question, answer, sourceUrls);
    }
  });

  return NextResponse.json({ answer, remaining, limit: DAILY_LIMIT, conversationId, sources: sourceUrls });
}
