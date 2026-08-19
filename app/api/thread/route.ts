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
  matchProductTruth, productTruthAnswer, isDataRightsRequest, DATA_RIGHTS_ANSWER,
  isAboutSomeoneElse, SOMEONE_ELSE_ANSWER,
  isVehicleQuestion, vehicleAnswer, compoundAsk, compoundAskNote,
  isScottishRatesQuestion, isVatQuestion,
  isNiQuestion, isStudentLoanQuestion, isPropertyQuestion, isSavingsQuestion,
  isIdentity, identityAnswer,
} from '../../../lib/waintents';
import { hmrcFilingLive } from '../../../lib/features';
import { checkExpense, isClaimQuestion, VERDICT_ICON } from '../../../lib/taxrules';
import { taxPosition, setAsideBasisLine, hasTaxPosition, billFromPosition } from '../../../lib/taxoptimiser';
import { SCOTLAND_LINE, SCOTTISH_RATES_ANSWER } from '../../../lib/scotland';
import { vatAnswerForUser } from '../../../lib/vatanswer';
import { savingsAnswerForUser } from '../../../lib/savingsanswer';
import { niAnswerForUser, studentLoanAnswerForUser, propertyAnswerForUser } from '../../../lib/laneanswers';
import { paymentsOnAccount, FACTS } from '../../../lib/taxengine';
import { quarterForDate } from '../../../lib/quarterpack';
import { gbp0, gbp2 } from '../../../lib/money';
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
  ingestReceiptImage, duplicateReceiptLine, MAX_RECEIPT_BYTES, RECEIPT_IMAGE_TYPES, NOT_AN_IMAGE_REPLY,
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 F7, RUN 6. THE HALF OF THE MESSAGE A FIRST MATCH ROUTER THROWS AWAY WITHOUT SAYING SO.
//
// composeOneLane below is a chain of first matches, exactly like the webhook's. Whichever lane
// takes the message answers ITS reading, and the rest of the sentence is gone. Maureen asked
// about a carpet cleaning machine AND a mileage rate in one line, got a very good answer about
// the van, and nothing at all about the machine, with no sign that half of it had gone.
//
// ⚠️ THE NOTE GOES ON THE OUTSIDE AND KNOWS NOTHING ABOUT WHICH LANE WON. Working that out means
// a second copy of the router's order living somewhere that is not the router, and that copy is
// the defect this file keeps deleting. The note lists her own words back and asks for the other
// one on its own, which is true whichever lane the chain took, today and after the next reorder.
// See lib/waintents.ts, compoundAsk, for why the detection is as narrow as it is.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function composeReply(userId: string, q: string): Promise<string> {
  const body = await composeOneLane(userId, q);
  const alsoAsked = compoundAsk(q);
  return alsoAsked ? `${compoundAskNote(alsoAsked)}\n\n${body}` : body;
}

// The WhatsApp answering order, without the WhatsApp only lanes (capture, sessions, buttons).
// Always returns a sentence: honesty when it cannot answer is part of the contract.
async function composeOneLane(userId: string, q: string): Promise<string> {
  // 0. Questions about Lekhio itself: filing, approval, promised savings. First, because the
  // totals lane and the claim rulebook both answered these with the right answer to the wrong
  // question (found live, 6 August 2026), and a screenshot of a green tick under "are you HMRC
  // approved" is a claim nobody here ever made on purpose.
  const truth = matchProductTruth(q);
  if (truth) return productTruthAnswer(truth, { filingLive: hmrcFilingLive() });

  // 0a. 🔴 HIS DATA RIGHTS, ABOVE EVERY LANE THAT READS HIS BOOKS AND ABOVE THE MODEL. See
  // lib/waintents.ts, isDataRightsRequest, for the two findings that put it here. Deterministic on
  // purpose: the answer to "delete everything you hold on me" does not get to be probabilistic, and
  // it must not cost an AI call either, because a man at his spend cap still has the right to leave.
  //
  // 🔴 IT MOVED UP HERE ON 17 AUGUST 2026, B22, AND THE MOVE IS ONE RULE ON THREE ROUTERS. It used
  // to sit BELOW the third party gate on this router, which is the wrong way round: an erasure that
  // happened to name somebody would have been refused rather than answered, and the day either
  // matcher is widened that stops being hypothetical. Erasure, then the gate, then the deadline
  // lane, on all three, and test/laneparity.test.mjs section 9c holds it by index AND by a derived
  // walk of every gate above this one.
  if (isDataRightsRequest(q)) return DATA_RIGHTS_ANSWER;

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 0b. 🔴 SOMEBODY ELSE'S MONEY, AND THIS ROUTER HAD NO GATE AT ALL. Run 3, 13 August 2026.
  //
  // Run 1 found this shape ON THE CHAT ROUTER: "what does the barber next door owe you lot then",
  // answered with HER OWN set aside figure. Run 2 built isAboutSomeoneElse and wired it into the
  // WhatsApp webhook. Nothing ever wired it here, so the router the finding came from was the one
  // channel with no gate. Marcus Whitfield asked this chat "how much has jerome made this year"
  // about his business partner and was handed the whole firm's turnover under Jerome's name with an
  // invented expenses figure attached.
  //
  // 🔴 AND IT MOVED ABOVE THE DEADLINE LANE ON 17 AUGUST 2026. B22. "when is jerome's tax due" is
  // isDeadlineQuestion TRUE and isAboutSomeoneElse TRUE, and the deadline lane ran first, so the
  // asker was answered about somebody else out of HIS OWN profile. The payload is DATES rather than
  // pounds, so this is a non sequitur with a name on it and not a breach, and it is fixed because
  // the order is wrong. It does NOT close the shape: the gate hears one of four third party
  // deadline phrasings and section 9c asserts the one of four so nobody can read it as more.
  //
  // ⚠️ ABOVE EVERY LANE THAT READS HIS BOOKS, for the reason the webhook gives: the failure IS a
  // lane that reads his books answering a question that was not about them. And BELOW the erasure
  // lane above, because a man asking to leave must never be refused.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // ⚠️ NO SELF NAMES PASSED, AND THAT IS THE CHEAP SAFE CHOICE. Reading users.person_name here
  // would add a database round trip to every chat message to remove a false positive that costs
  // one re-ask ("how much has marcus made", asked by Marcus). selfNameTokens() is exported and
  // ready for a caller that already holds the name; nothing should fetch it just for this.
  if (isAboutSomeoneElse(q)) return SOMEONE_ELSE_ANSWER;

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

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHO LEKHIO IS, AND THIS ROUTER ANSWERED IT OUT OF THE MODEL. B19, 18 August 2026, and it
  // is the LAST of B19's answer lanes.
  //
  // isIdentity has existed since Run 2 and app/api/whatsapp/route.ts was its only caller, because
  // its two sentences were assembled inline in that file's handleIdentity. So a man signed in here
  // who typed "who are you" was handed to a paid model call to paraphrase two fixed sentences, and
  // the model chose the words. lib/waintents.ts, identityAnswer, is the ONE builder now, and this
  // router assembles nothing.
  //
  // ⚠️ THE CHANNEL IS 'web' AND IT IS PASSED, NOT DEFAULTED. The WhatsApp wording points at
  // WhatsApp affordances ("right here in WhatsApp", "say what you spent", 'text "help"') and two of
  // those three are things this surface CANNOT do: looksLikeMoneyEntry is WhatsApp only by the
  // written decision in test/laneparity.test.mjs section 9b, and isHelp is private to the webhook.
  // A promise the channel cannot keep is worse than no offer at all.
  //
  // ⚠️ BELOW THE THIRD PARTY GATE AND BELOW THE DEADLINE LANE, which is B22's one rule on three
  // routers, untouched: his data rights, then the gate, then the deadline lane. This lane is added
  // UNDER all three rather than among them, so nothing about that order moves.
  //
  // ⚠️ AND IT LEADS THE ANSWER LANES BECAUSE IT READS NOTHING. No user lookup, no rows, no database
  // call, no money. A lane that costs nothing has no business queuing behind lanes that do, and
  // section 13 holds it above every lane that reads his books, on all three.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (isIdentity(q)) return identityAnswer('web');

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 SOMEBODY ELSE'S MONEY, AND THIS ROUTER HAD NO GATE AT ALL. Run 3, 13 August 2026.
  //
  // Run 1 found this shape ON THE CHAT ROUTER. Run 2 built isAboutSomeoneElse and wired it into
  // the WhatsApp webhook, with a comment noting it was still live there. Nothing ever wired it
  // here, so the router the finding came from was the one channel with no gate.
  //
  // Marcus Whitfield asked this chat "how much has jerome made this year" about his business
  // partner and was handed the whole firm's turnover under Jerome's name with an invented
  // expenses figure attached. Same question, same evening, same answer shape on WhatsApp.
  //
  // ⚠️ ABOVE EVERY LANE THAT READS HIS BOOKS, for the reason the webhook gives: the failure IS a
  // lane that reads his books answering a question that was not about them.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 VAT, WHICH THIS ROUTER ANSWERED OUT OF THE MODEL. B18, 17 August 2026.
  //
  // FOUND ON THIS SURFACE, SIGNED IN, WITH A REAL ACCOUNT UNDER IT. "am in glasgow, is vat
  // different up here", asked of this chat as Callum Strachan, 77 confirmed entries, came back:
  // "No, VAT is the same across the UK, including Scotland. The threshold is £90,000 rolling
  // 12-month turnover to register, and deregistration at £88,000."
  //
  // Every figure in that is right. What is missing is him. The webhook has read his own rolling
  // twelve months and opened with his figure and his headroom since Run 2, and isVatQuestion was
  // dispatched there and by nothing else, so the man who asked the most consequential threshold
  // question of his trading life on the web got the statute and the man who asked it on WhatsApp
  // got his position. One phrase, three channels, two different answers, which is the defect
  // test/laneparity.test.mjs exists for and the one B16 wrote the rule about six commits ago.
  //
  // ⚠️ ABOVE THE TOTALS LANE, which is the order app/api/whatsapp/route.ts runs and the reason is
  // written out there: "should i register for vat" carries a quantity word and would otherwise be
  // eaten by matchTotalsQuestion and answered with a set aside figure.
  //
  // ⚠️ AND THE ANSWER IS THE SAME FUNCTION, NOT THE SAME SHAPE. lib/vatanswer.ts does the reading
  // and lib/vatstanding.ts does the words, so this router computes nothing and can say nothing the
  // other two do not say. A lookalike here is the fault the banner at the top of this file exists
  // to avoid, and VAT is the question this product has already answered three different wrong ways
  // on one evening.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (isVatQuestion(q)) return vatAnswerForUser(userId, q);

  // ═════════════════════════════════════════════════════════════════════════════════
  // 🔴 HIS PROPERTY STREAM, HIS STUDENT LOAN AND HIS NATIONAL INSURANCE. B19, 17 August 2026.
  //
  // All three predicates have existed since Run 2, all three have a pure builder in
  // lib/waintents.ts, all three read his own rows, and all three were dispatched by
  // app/api/whatsapp/route.ts and by nothing else. So this chat, signed in, with his whole ledger
  // one query away, answered "how much national insurance do i pay" out of the MODEL, which holds
  // none of his rows, none of his plan and none of his income shape.
  //
  // That is the fifth time this file has been given the same finding, and the header at the top of
  // it is the standing complaint: one phrase, three channels, and the answer depends on which box
  // he typed it in. Whenever you wire a lane, wire three.
  //
  // ⚠️ ABOVE THE TOTALS LANE, which is the order app/api/whatsapp/route.ts runs and the reason is
  // the same one the VAT lane gives above: "what tax do i owe on my rental" and "how much student
  // loan will i owe" both carry a quantity word AND a money word, so matchTotalsQuestion claims
  // them and answers a rental question with a whole business set aside figure.
  //
  // ⚠️ AND THE READ IS THE SAME FUNCTION, NOT THE SAME SHAPE. lib/laneanswers.ts does the reading
  // and lib/waintents.ts does the words, so this router computes nothing, reads nothing and can say
  // nothing the other two do not say. Its header argues why the three share ONE reader rather than
  // three files shaped like lib/vatanswer.ts, and what a failed read says to the customer.
  // ═════════════════════════════════════════════════════════════════════════════════
  if (isPropertyQuestion(q)) return propertyAnswerForUser(userId, 'web');
  if (isStudentLoanQuestion(q)) return studentLoanAnswerForUser(userId, 'web');
  if (isNiQuestion(q)) return niAnswerForUser(userId);


  // 2. Totals and what he owes: computed from his own confirmed rows, no AI, instant.
  const totals = matchTotalsQuestion(q);
  if (totals) return totalsAnswer(userId, totals);


  // 🔴 THE VAN QUESTION, ABOVE THE CLAIM CORPUS, BECAUSE THE CORPUS ANSWERED IT WITH A CARD.
  // RUN 1 finding F7: a man typed the price, the month and his weekly miles, and got a generic
  // "yes, a van is allowable" that knew none of it and never mentioned the lock in. This reads his
  // own books for the vehicle and names the irreversible part, and it deliberately does NOT say
  // which route wins: that turns on annual business miles, which no row in his books holds. See
  // lib/waintents.ts, vehicleAnswer.
  if (isVehicleQuestion(q)) {
    const o = await getOptimiserInput(userId).catch(() => null);
    return vehicleAnswer({
      boughtThroughBooks: o?.vehicleBoughtThroughBooks === true,
      allowanceThisYear: Math.max(0, o?.ytdCapitalAllowances ?? 0),
    });
  }

  // 🔴 BELOW THE VEHICLE LANE, AND IT WAS ABOVE IT FOR ONE COMMIT. FOUND BY TYPING THE ADJACENT
  // QUESTIONS INTO THIS SURFACE RATHER THAN BY READING THE CHAIN.
  //
  // isSavingsQuestion's second arm is `worth it`, which is broad on purpose: "was it worth it" is a
  // man deciding whether to keep paying us and it is the whole reason the lane exists. But "is a van
  // worth it" is that phrase inside somebody else's question. BOTH other routers already order these
  // correctly and nobody had written down that they did: app/api/whatsapp/route.ts has the vehicle
  // lane at 657 against savings at 685, and app/api/ask/route.ts has 217 against 293. This surface
  // was the only one with them the other way round, so a man asking whether to buy a van was handed
  // the ledger of what Lekhio had saved him.
  //
  // MEASURED BEFORE THE MOVE AND AFTER: two phrasings diverged from WhatsApp, now one, and every one
  // of the five savings phrasings still reaches this lane. The one left is "am i saving enough for
  // my tax bill", which lands on the set aside here and on the savings ledger on WhatsApp. That is
  // this surface being MORE right, and it is recorded rather than smoothed over: the WhatsApp ear is
  // the thing that is wrong there, and widening or narrowing it needs the self corpus re run.
  //
  // test/laneparity.test.mjs section 12 now holds this relationship by INDEX on all three routers.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT LEKHIO HAS SAVED HIM. B19, 18 August 2026, and it is the last money lane with one door.
  //
  // isSavingsQuestion has been dispatched by app/api/whatsapp/route.ts and by nothing else since
  // Run 2, because it was the only lane with no pure builder to move: the sentences were assembled
  // inline in the route. So a man signed in HERE, with his whole ledger one query away, asked "what
  // have you saved me" or "was it worth it" and was answered by the MODEL, which cannot run the
  // engine twice and would paraphrase the figure. "was it worth it" is a man deciding whether to
  // keep paying, and it is the worst question in the product to hand to a guess.
  //
  // ⚠️ NO CHANNEL PARAMETER, UNLIKE THE PROPERTY AND STUDENT LOAN LANES ABOVE. Measured, not
  // assumed: the one sentence in this lane with a channel in it belongs to a state only WhatsApp
  // has (a phone number with no account). See savingsAnswer in lib/waintents.ts.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  if (isSavingsQuestion(q)) return savingsAnswerForUser(userId);

  // 3. "Can I claim it" questions: the deterministic claim rules, no AI.
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THIS GUARD USED TO BE ONE THIRD OF A GUARD, UNDER A COMMENT SAYING IT WAS ALL OF IT.
  //
  // The line here read `if (!/£\s*\d/.test(q))`, and the comment above it claimed the lane was
  // "guarded the same way the WhatsApp checker guards itself". It was not. isExpenseCheck() in
  // app/api/whatsapp/route.ts asks three things and only the money one had been copied over, so
  // on this surface every sentence without a pound sign in it reached a corpus that answers any
  // string carrying an alias. Proved live on 11 August 2026, on two things a customer typed:
  //
  //   "delete all my data"  ->  🟡 Phone and broadband, because the phone rule carried the alias
  //                             'data' for mobile data allowances. He was asking to be erased.
  //   "free subscription"   ->  ✅ Trade body and subscriptions. He was asking about our price.
  //
  // ⚠️ THE FIX IS NOT THE MISSING REGEX TYPED IN HERE. That would have been a third hand copy of
  // a rule that had already drifted once, and the copy IS the defect. lib/claimrules.data.ts owns
  // the corpus, so it owns the decision about what may reach the corpus: isClaimQuestion() is the
  // one door, this route asks it, and its header records what each condition is for and where the
  // remaining WhatsApp copy still lives. checkExpense stays the call by name, the same function
  // the webhook runs, because a lookalike here is the fault this whole file exists to avoid.
  //
  // ⚠️ AND THE ALIAS WENT TOO. A guard narrows the door; it does not fix a rule that claims a word
  // from our own privacy vocabulary. See the phone rule's own note in lib/claimrules.data.ts.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (isClaimQuestion(q)) {
    const hit = checkExpense(q);
    if (hit) {
      return [
        `${VERDICT_ICON[hit.verdict]} ${hit.title}. ${hit.rule}`,
        '',
        'General info, not advice for your exact situation.',
      ].join('\n');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 SCOTTISH RATES, THE LAST GATE BEFORE THE MODEL. B16, 17 August 2026.
  //
  // THIS SURFACE IS WHERE B2 CAUGHT IT. Signed in as a Glasgow sole trader with money in the
  // account, this chat replied "you're in Scotland so your tax rates are the same as the rest of
  // the UK", which is false, and minutes later quoted a band table with a 41% higher rate, a 46%
  // top rate and no advanced rate, which matches no tax year in force. The rule forbidding both
  // was in accountantSystem() at the time. It was ignored.
  //
  // So the rule is no longer the only thing standing there. A question whose only correct answer
  // is one fixed sentence is answered from lib/scotland.ts and the model is never asked, exactly
  // as the deadline, the totals, somebody else's money, his data rights and the van already are.
  //
  // ⚠️ BELOW THE TOTALS LANE, which is the order app/api/whatsapp/route.ts runs and the reason is
  // written out there: since J8 the totals lane answers "how much should i put by" with the figure
  // AND the sentence, and hoisting this above it would hand a man asking for a number a rule
  // instead. Everything reaching here asked about the RATES.
  //
  // ⚠️ AND THE REFUSAL OF THE THREE RESERVED TAXES IS IN THE PREDICATE, NOT IN THIS ORDER, because
  // this router has no VAT lane, no National Insurance lane and no student loan lane to catch them.
  // The webhook has all three above this gate. One phrase, one lane, on both channels, or
  // test/laneparity.test.mjs is red.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (isScottishRatesQuestion(q)) return SCOTTISH_RATES_ANSWER;

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
    return NOT_AN_IMAGE_REPLY;
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
    case 'nottype':
      // 🔴 S1. The declared type passed and the bytes did not, which is the same thing to him.
      return NOT_AN_IMAGE_REPLY;
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
    return `Nothing logged ${q.allTime ? 'yet' : q.periodLabel}. Add what you earn and spend from the Money pages and the tally starts itself.`;
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
    return `${q.allTime ? 'All time' : `For ${q.periodLabel}`}: ${formatGbp(totals.income)} in, ${formatGbp(totals.expenses)} out, so ${formatGbp(profit)} profit.`;
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

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE EMPTY TEST, WHICH THIS BRANCH DID NOT HAVE, AND WHICH THE COLLECTION SENTENCE MADE
  // WORSE.
  //
  // The check above catches a man with NOTHING confirmed. It does not catch the man this misses:
  // costs confirmed and no income. His `totals.count` is not zero, so he falls straight through to
  // here, where taxPosition() correctly returns nothing owed on nothing earned, and the sentence
  // announced "Put by £0.00 for tax." A proud zero teaches him this product says nothing.
  //
  // ⚠️ AND SINCE THE COLLECTION SENTENCE LANDED IT ALSO GAVE HIM A DATE. "Self Assessment collects
  // it in one bill, due by 31 January 2028", for a bill of nothing. A deadline on an empty figure
  // is worse than the empty figure: it is a thing in his calendar that does not exist.
  //
  // app/app/tax/page.tsx has had this test since doc 103 and hides its whole position block on it.
  // 🔴 IT IS COMPUTED HERE THE WAY THE HUB COMPUTES IT, FIELD FOR FIELD, because the claim two
  // paragraphs down is "It is the same figure your Tax screen leads with", and a screen that leads
  // with nothing is not led with by a chat that leads with £0.00.
  //
  // ⚠️ THE RULE IS NOT WRITTEN HERE. hasTaxPosition() lives in lib/taxoptimiser.ts beside
  // setAsideBasisLine, and WhatsApp asks the same function, because the claim two paragraphs down
  // is "It is the same figure your Tax screen leads with", and a screen that leads with nothing is
  // not led with by a chat that leads with £0.00.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (!hasTaxPosition(optimiser, tax.setAside)) {
    return 'Nothing to work out yet. Tax is worked out on what you bring in, and this tax year has no confirmed income on it. Add what you have earned from the Money pages and your position builds itself, from the same figures every screen under Tax uses.';
  }

  const basis = setAsideBasisLine(optimiser, tax);
  const note = tax.projected
    ? 'That is what the year is heading for, on everything you have confirmed so far.'
    : 'That is what the year so far has built up, too early to call the whole year yet.';

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE COLLECTION SENTENCE IS A SELF ASSESSMENT SENTENCE, SO IT IS NOT SAID TO A DIRECTOR.
  //
  // This line used to end, for every reader without exception:
  //
  //   "It is the same figure your Tax screen leads with, and Self Assessment collects it in one
  //    bill."
  //
  // Two things were wrong with that, and the same file already knew both of them.
  //
  //   1. A DIRECTOR IS NOT IN SELF ASSESSMENT FOR HIS COMPANY'S PROFIT. app/app/tax/page.tsx has
  //      gated this exact sentence on isCompany since wave 9, and test/wave9_mtdstructure.test.mjs
  //      pins it there with `{isCompany ? null : <>{' '}Self Assessment collects it`. THIS surface
  //      was missed. It is the same defect deadlineAnswer() had, in the money answer instead of
  //      the deadline answer: a Self Assessment mechanism asserted at a man whose company files
  //      its own return.
  //
  //   2. IT CLAIMED TO MIRROR A SCREEN IT DID NOT MIRROR. The sentence promises "the same figure
  //      your Tax screen leads with" and then says something the Tax screen does not say. The hub
  //      prints the January date, and over the threshold it prints the two payments on account as
  //      well. Here there was no date at all, so a man who asked WHEN his tax was due got a figure
  //      and no day, and a man over the threshold was told "one bill" for a year that asks him for
  //      three payments.
  //
  // Payments on account are TMA 1970 s59A, a Self Assessment mechanism with no counterpart in
  // Corporation Tax, so there is nothing true to put in their place for a director and nothing is
  // put. The year is derived exactly as the hub derives it, through quarterForDate, so the two
  // surfaces cannot drift to different Januaries.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const sameFigure = 'It is the same figure your Tax screen leads with';
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND IT MOVES, WHICH THIS SENTENCE NEVER SAID. B30, 18 August 2026, signed off by Jag.
  //
  // The promise above is true at the moment it is made and false by the next morning, because
  // projectionFactor() divides the year by daysElapsed from 6 April. A man who logs nothing
  // overnight is on a slightly lower run rate, so his projected year falls, and that is correct
  // and is the safe direction.
  //
  // The B30 item recorded it as two engines disagreeing by £126.00: the chat £10,618.00 one
  // evening, the Tax page and the 08:00 alert £10,492 the next morning. RECONCILED ON A FROZEN
  // INPUT: one taxPosition on one set of books gives £10,618 at 133 days elapsed and £10,492 at
  // 134. Both reported figures, exactly. There is no second engine. There is a sentence promising
  // sameness beside a number that moves daily, and a man who checks is owed the reason.
  //
  // test/f23bill.test.mjs section E holds the reconciliation so nobody reopens it as arithmetic.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const itMoves = ' It moves as your year does.';
  let collection: string;
  if (optimiser.businessType === 'limited_company') {
    collection = `${sameFigure}.${itMoves}`;
  } else {
    const { startYear } = quarterForDate(new Date());
    // 🔴 THE CIS CREDIT GOES IN HERE TOO, AND THAT IS NOT OPTIONAL. paymentsOnAccount gained its
    // second test on 11 August 2026: payments are dropped when more than 80 percent of the tax was
    // already taken at source. The hub passes tax.cisSuffered, so if this line did not, the chat
    // would keep offering two payments to a subcontractor the Tax screen had already excused. The
    // sentence below promises this is the same figure that screen leads with.
    const poa = paymentsOnAccount(tax.selfAssessmentTax, startYear + 1, tax.cisSuffered);
    collection = `${sameFigure}, and Self Assessment collects it in one bill, due by ${poa.firstDue}.`;
    if (poa.required) {
      collection += ` Because the bill is over ${gbp0(FACTS.poaThreshold)}, HMRC also asks for two payments on account towards the following year, about ${gbp2(poa.eachPayment)} each, due ${poa.firstDue} and ${poa.secondDue}.`;
    }
    // ⚠️ LAST, NOT SPLICED INTO THE SAMENESS CLAUSE. Appending it to sameFigure would give a
    // sentence with three "and"s in it once the January date and the instalments arrive.
    collection += itMoves;
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SAME FIGURE MEANS THE SAME FIGURE. Since 11 August 2026 the Overview and the Tax screen
  // lead with what he still has to FIND, which for a subcontractor is the bill less the tax his
  // contractors already handed HMRC. A chat that quoted the bill instead would be off by thousands
  // while the sentence beside it claimed the two agreed, and a man who catches our surfaces
  // disagreeing about his tax stops believing any of them. lib/taxoptimiser.ts carries both.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const leadFigure = billFromPosition(tax);
  const cisLine = tax.cisSuffered > 0
    ? ` ${formatGbp(tax.cisSuffered)} of the bill has already gone to HMRC through CIS, so that part is paid and this is what is left.${
      tax.refundLikely > 0
        ? ` On these figures January looks like a repayment of about ${formatGbp(tax.refundLikely)} rather than a bill, though only your filed return settles that.`
        : ''}`
    : '';
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SAME FIGURE CARRIES THE SAME CAVEAT ON EVERY CHANNEL. J8, decided 17 August 2026.
  //
  // This number is taxPosition() on getOptimiserInput(), the identical call /app/tax leads with,
  // and the comment above says so as a promise. /app/tax prints SCOTLAND_LINE under it every time
  // he opens the page. This channel printed the same number and said nothing, so a Scottish
  // customer got a caveated figure on the web and an uncaveated one in the chat, which is the
  // shape this corpus keeps finding: one figure, two surfaces, two different truths.
  //
  // ⚠️ THE ALTERNATIVE WAS A STORED FLAG, SAID ONCE PER CUSTOMER, and it was rejected. A caveat he
  // read once in March and cannot recall in January is the APPEARANCE of disclosure without the
  // function, which is worse than either honest answer. It also wanted a column, and the reason it
  // was deferred ("lib/supabase.ts is reserved to another lane") had already gone stale.
  //
  // ⚠️ AND IT IS ON THE SET ASIDE ANSWER ONLY. "You have brought in £22,910" and "you have spent
  // £5,286" are not band derived and must stay clean. The bar is lib/scotland.ts's own: would a
  // Scot be misled by THIS number if the line were absent. Only this one.
  //
  // ⚠️ IT SITS AFTER THE EARLY RETURN ABOVE, so a man with no position gets no caveat about a
  // figure he has not been given. Same guard lib/incomeproof.ts applies with personalTaxShown.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  return `Put by ${formatGbp(leadFigure)} for tax. ${note}${basis ? ` ${basis}` : ''}${cisLine} ${collection} ${SCOTLAND_LINE}`;
}
