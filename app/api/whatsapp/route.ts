import { NextRequest, NextResponse, after } from 'next/server';
import {
  verifyWebhook,
  isValidSignature,
  appSecretConfigured,
  downloadMedia,
  sendText,
  sendButtons,
  sendImageUrl,
} from '../../../lib/whatsapp';
import {
  parseSpokenTransaction,
  draftInvoice,
  answerMoneyQuestion,
  answerExpenseQuestion,
  parseSchedule,
  hasClaudeConfig,
  draftSupportReply,
} from '../../../lib/claude';
import { checkExpense, VERDICT_ICON, TAX_TIPS } from '../../../lib/taxrules';
import { headline, ledgerFor } from '../../../lib/ledger';
import { createVoiceJob } from '../../../lib/voicejobs';
import { confirmationLine } from '../../../lib/voiceflow';
import { isWorkerLive } from '../../../lib/bridge';
import { sendInvoiceEmail, hasEmailConfig, looksLikeEmail } from '../../../lib/email';
import { hasBankFeedConfig } from '../../../lib/bankfeed';
// The one receipt walk, shared with the web capture route and the chat composer, so the three
// doors cannot drift apart. See the header of lib/receiptingest.ts.
import { ingestReceiptImage, duplicateReceiptLine } from '../../../lib/receiptingest';
import {
  busyMessage,
  receiptMilestoneNudge,
  NUDGE_AFTER_RECEIPTS,
  type AiBlockReason,
} from '../../../lib/banknudge';
import { CIRCUMSTANCES, unanswered, buttonId, parseButtonId, mtdStatedFrom } from '../../../lib/circumstances';
// WHERE HE STANDS ON MAKING TAX DIGITAL, from the ONE definition. Never re-derived in this file:
// see handleDeadlineQuestion below and mtdPosition() in lib/taxengine.ts.
import { mtdPosition, type MtdPosition } from '../../../lib/taxengine';
import {
  findLinkCodeIn, hashLinkCode, verifyStoredLink, bindingVerdict, linkMessage, welcomeAfterBinding,
  waLinksConfigured, isUkMobile, type LinkVerdict,
} from '../../../lib/walink';
// 🔴 THE TABLE'S FIRST REAL CALLER. Until item 4 it described where every message should go and
// governed nothing, which is a document with a type annotation on it. handleConnectCode asks it.
import { channelsFor } from '../../../lib/routing';
import { gateForUser } from '../../../lib/gateserver';
import { READONLY_LINE } from '../../../lib/gate';
import {
  readCircumstances,
  saveCircumstance,
  getBusinessProfile,
  findUserIdByPhone,
  normalizeUkPhone,
  readLiveWaLink,
  consumeWaLink,
  bindProvedPhone,
  readProvedPhone,
  writeAllowanceElection,
  weeklyTotals,
  weeklyUpdateFactsFor,
  listBankConnectionsForUser,
  touchLastInbound,
  confirmDigestEntries,
  lastDigestAt,
  claimMessage,
  insertTransaction,
  listUserProperties,
  propertyYtdTotals,
  listOverdueInvoices,
  transactionSummaryForUser,
  getSession,
  setSession,
  clearSession,
  createInvoice,
  readVatProfile,
  getLastIncomeTransaction,
  createEvent,
  bumpAiUsage,
  countActiveSubscribers,
  totalsForUser,
  pendingSummaryForUser,
  latestUnconfirmed,
  deleteTransactionById,
  updateTransactionAmount,
  setNudgePrefs,
  getStudentLoanSettings,
  setStudentLoanPlan,
  getActiveGoals,
  insertUserGoal,
  completeLatestGoal,
  setEmploymentIncome,
  setBusinessType,
  setPartnershipShare,
  getOrCreateReferralCode,
  getRelevantKnowledge,
  getOptimiserInput,
  refreshFactsFromDb,
  factUpdateNote,
} from '../../../lib/supabase';
import { isReferRequest, referralInvite } from '../../../lib/referral';
import {
  parseMoneyEntryRegex,
  poundAmounts,
  moneyAmounts,
  entryDate,
  isThanks,
  matchAck,
  matchStopStart,
  isDeleteLast,
  matchEditLast,
  isPricing,
  isIdentity,
  matchProductTruth,
  productTruthAnswer,
  isDeadlineQuestion,
  asksAmount,
  deadlineAnswer,
  matchTotalsQuestion,
  oweAnswer,
  isWeeklySummaryRequest,
  matchUseOfHomeElection,
  useOfHomeHoursQuestion,
  isSavingsQuestion,
  formatGbp,
  isNiQuestion,
  isStudentLoanQuestion,
  matchStudentLoanPlanSet,
  niAnswer,
  studentLoanAnswer,
  matchGoalSet,
  buildGoal,
  matchRentIn,
  isPropertyQuestion,
  propertyAnswer,
  matchChaseRequest,
  chaseMessage,
  isSetupRequest,
  matchSalarySet,
  isGoalQuestion,
  isGoalDone,
  goalAnswer,
  isInvoiceThis,
  isSupportRequest,
  supportReason,
} from '../../../lib/waintents';
import { hmrcFilingLive } from '../../../lib/features';
import { weeklySummaryText } from '../../../lib/weeklyupdate';
import {
  bandForHours, bandOptions, electionConfirmation, electionRefusal, type Electing,
} from '../../../lib/elections';
import { quarterForDate } from '../../../lib/quarterpack';
import { openTicket } from '../../../lib/support';
import { matchKb } from '../../../lib/supportkb';
import { soleTraderTax, homeOfficeFlatRateMonthly, FACTS } from '../../../lib/taxengine';
import { taxPosition, setAsideBasisLine, hasTaxPosition } from '../../../lib/taxoptimiser';
import { aprilDelta } from '../../../lib/propertyengine';
import { niPosition, studentLoanRepayment, STUDENT_PLANS, type StudentPlan } from '../../../lib/nistudentloan';
import { TAXGUIDE_TRIGGER, matchTrade, cardText, totalCards } from '../../../lib/taxguide';
import type { TradeInfo } from '../../../lib/taxguide';
import { rateLimitedShared } from '../../../lib/ratelimit';
import { decideSpend } from '../../../lib/aicost';
import { aiCapsFor } from '../../../lib/margin';
import { TRIAL_DAYS } from '../../../lib/entitlement';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lekhio.app';

// Node runtime (we use crypto for signature checks). Allow the function to live
// long enough to finish the after() work (AI/transcription) once it is switched
// on; the HTTP 200 to Meta is still returned immediately, well within its 5s.
export const runtime = 'nodejs';
export const maxDuration = 60;

// We never log message text or media. Only ids and status, per the data rules.

// Durable per-phone daily message cap. Unlike the in-memory burst limit this
// holds across every serverless instance, using the same ai_usage counter table
// as the AI budget. A real user never sends 300 messages in a day; a runaway
// script can, and we silently stop replying rather than fuel a storm.
const PHONE_DAILY_MESSAGES = 300;

// The refusal copy now lives in lib/banknudge.ts, where it can be unit tested and
// where the wording can depend on WHY we refused. A single hardcoded "I am a bit
// busy" string used to be sent for the user's own daily cap too, which told people
// the product was broken when it was working exactly as designed.

// The AI spend gate. Caps are DERIVED from the live paying base and the margin
// floor (lib/margin.ts, lib/aicost.ts), not hardcoded: a flat global cap becomes
// a hard GROWTH CEILING (the old 4,000/day would have starved every user after
// roughly the first 800 users' worth of activity at 100k). Now the ceiling grows
// with the business while margin stays bounded.
//
// Fails CLOSED on the durable counters: if we cannot read the budget we do not
// spend on AI. The deterministic paths (typed money, mileage, CIS, totals) still
// work, so the user is never stuck, just not AI-parsed.
// Returns WHY the budget refused, or null when the spend is allowed.
//
// It used to return a bare boolean, and every caller then sent the same "I am a
// bit busy right now" line. That is honest for OUR caps (global cap, kill switch)
// and a flat lie for the user's own daily cap: nothing is busy and nothing is
// broken, they have simply used their allowance. Telling someone the product is
// having a wobble, at the exact moment it declined to read their receipt, is the
// worst thing we could say. So the reason now travels to the caller and
// sendBudgetRefusal picks the truthful message. See lib/banknudge.ts.
//
// A database failure still fails CLOSED (we do not spend), and we attribute that
// to ourselves, not to the user.
async function aiBudgetBlocked(from: string): Promise<AiBlockReason | null> {
  const subs = await countActiveSubscribers();
  const caps = aiCapsFor(subs ?? 0);
  if (caps.killed) return 'kill_switch';

  const userDay = await bumpAiUsage('phone', from);
  if (userDay === null) return 'global_daily_cap';
  const globalDay = await bumpAiUsage('global', 'all');
  if (globalDay === null) return 'global_daily_cap';
  const globalMonth = await bumpAiUsage('globalmonth', monthKey());
  if (globalMonth === null) return 'global_daily_cap';

  // decideSpend judges the counts BEFORE this call, so subtract our own bump.
  const decision = decideSpend(
    { globalDay: globalDay - 1, globalMonth: globalMonth - 1, userDay: userDay - 1 },
    caps,
  );
  if (!decision.allowed) {
    console.warn(`[wa] AI refused: ${decision.reason} (subs=${subs ?? 'unknown'})`);
    return decision.reason as AiBlockReason;
  }
  return null;
}

// Send the right refusal, and take the one chance we get to offer the bank feed.
//
// A bank transaction costs us NO AI at all (rules based categorisation), while a
// receipt photo costs about 0.5p. So the moment a user feels the daily cap is both
// the most useful and the cheapest moment to suggest connecting a bank. We only
// look the connection up when it can change the message, so the common path (our
// own caps) stays a single send with no extra queries.
//
// The offer is gated on hasBankFeedConfig(), the REAL server capability, not on
// the marketing flag: we must never offer a connection we cannot actually deliver.
async function sendBudgetRefusal(from: string, reason: AiBlockReason): Promise<void> {
  let bank = { available: false, connected: false };

  // Only the user's own cap can change the message, so only that path pays for the
  // lookups. Every other refusal is one send and no extra queries.
  if (reason === 'user_daily_cap' && hasBankFeedConfig()) {
    try {
      const userId = await findUserIdByPhone(from);
      if (userId) {
        const connections = await listBankConnectionsForUser(userId);
        bank = {
          available: true,
          connected: connections.some((c) => c.status === 'linked'),
        };
      }
    } catch {
      // If we cannot tell, say nothing about banks. A wrong offer is worse than
      // no offer, and busyMessage stays honest and useful with available:false.
      bank = { available: false, connected: false };
    }
  }

  await sendText(from, busyMessage(reason, bank));
}

// Calendar month key for the monthly AI counter, e.g. "2026-07".
function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

// True when this phone is over its durable daily message allowance. Fails open:
// a database hiccup must never mute real users, and the AI budget above is the
// wallet protection.
async function messageCapExceeded(from: string): Promise<boolean> {
  const n = await bumpAiUsage('wamsg', from);
  return n !== null && n > PHONE_DAILY_MESSAGES;
}

// --- GET. The webhook verification handshake. -----------------------------
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const challenge = verifyWebhook(
    params.get('hub.mode'),
    params.get('hub.verify_token'),
    params.get('hub.challenge'),
  );

  if (challenge !== null) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// --- POST. Incoming messages. ---------------------------------------------
// Meta needs a 200 within 5 seconds or it retries. We verify the signature,
// then always answer 200 for genuine Meta traffic so we are not retried into
// duplicate work. The message id keeps us idempotent as a second guard.
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // 1. Reject anything not signed by Meta. This is required on every webhook.
  if (!isValidSignature(raw, req.headers.get('x-hub-signature-256'))) {
    if (!appSecretConfigured()) {
      console.error('[whatsapp] WHATSAPP_APP_SECRET is not set. Cannot verify requests.');
    }
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Every calculation and answer below runs on the latest approved facts: Khoji learns, you approve
  // in the console, and the new figure is live here. Cheap (cached) and safe (a failed read keeps the
  // current facts).
  await refreshFactsFromDb();

  const message = firstMessage(body);

  // No message in this event. It may be a delivery status. Acknowledge and stop.
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const from = message.from;
  const messageId = message.id;

  // Idempotency. Claim the message id atomically BEFORE we acknowledge, so a Meta
  // retry of something we already handled is deduped at the source. This covers
  // every flow, not just receipts: reminders, questions, invoices.
  if (messageId && !(await claimMessage(messageId))) {
    return NextResponse.json({ ok: true });
  }

  // THE FREE WINDOW. Every message a user sends us reopens Meta's 24 hour customer
  // service window, inside which our sends cost NOTHING. Recording when it happened
  // is the difference between a daily digest that is free and one that eats the
  // entire WhatsApp budget (57.8p per user per month, nineteen paid sends, see
  // lib/margin.ts). Fire and forget: a timestamp is never worth delaying a reply.
  void (async () => {
    try {
      const uid = await findUserIdByPhone(from);
      if (uid) await touchLastInbound(uid);
    } catch {
      /* never break an inbound message over a timestamp */
    }
  })();

  // Per sender burst limit. Protects the AI and transcription spend from a
  // runaway or malicious sender. A genuine user never sends this many in a
  // short window. We silently drop over the limit: no AI, no reply, so we
  // never trigger a reply storm or rack up cost. (In-memory, per instance.
  // Move to a shared store for hard guarantees at scale, see docs/19.)
  if (await rateLimitedShared(`wa:${from}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: true });
  }

  // Acknowledge Meta immediately, then do the heavy work (media download, AI,
  // transcription, DB writes, the reply) AFTER the response is sent. A slow AI
  // call can therefore never breach Meta's ~5s window and trigger a retry storm.
  // The signature check, idempotency claim and burst limit above already ran, so
  // the deferred work is safe and deduped.
  after(() => processMessage(message));
  return NextResponse.json({ ok: true });
}

// The full message dispatch, run after the 200 is sent. Any error is caught and
// logged so it can never surface to Meta (we have already acknowledged).
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SAFETY NET UNDER EVERY HANDLER, BECAUSE A THROW USED TO MEAN SILENCE. 9 August 2026.
//
// The catch at the bottom of this function logged a line and returned. Meta already had its 200,
// so nothing was retried and nothing was said, and the customer who had just sent us a message got
// NOTHING BACK. Not an error, not an apology. Silence, which he cannot tell from us being slow.
//
// Three handlers were hardened against this one at a time (handleReceiptImage, handleVoiceNote and
// handleSchedule each catch and send a sentence), and roughly thirty five were not: handleTotals,
// handleMoneyQuestion, handleButtonReply, handleStopStart, handleDeleteLast, handleWelcome,
// handleSetupStart and the rest. Fixing them one at a time is how the first three took a fortnight
// and the other thirty five never happened. THE NET GOES UNDER ALL OF THEM AT ONCE.
//
// ⚠️ IT SENDS WITHOUT ASKING WHETHER ANYTHING WAS SENT ALREADY, and that is a decision rather than
// an oversight. Counting sends would need state shared across concurrent invocations of one
// instance, and under load that count would sometimes say "already answered" when THIS message was
// not, which puts the silence straight back. The cost the other way is a man who got a correct
// answer also getting "something went wrong at my end" when a line after the send threw. Something
// DID go wrong, he is not being misled, and the handlers that reply do it last, so it is rare.
// Silence is the failure this codebase already documents as the worst one on this channel: he
// spoke into his phone because his hands were full, so he is the least able of anyone to notice
// nothing came back.
//
// ⚠️ AND NEVER BEFORE THE CAP. messageCapExceeded exists so a runaway sender cannot generate a
// reply storm. If the cap check itself throws we must not answer either, or the net becomes the
// storm it was built to prevent, so the apology is gated on having got past it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const WENT_WRONG = 'Something went wrong at my end just then, and I have not logged that. Send it again in a minute and I will get it.';

async function processMessage(message: IncomingMessage): Promise<void> {
  const from = message.from;
  const messageId = message.id;
  // Gates the safety net below. See the block above: a throw in the cap check must never reply.
  let pastCap = false;
  try {
    // Durable daily cap first. Over the cap we stop replying entirely, so a
    // runaway sender cannot generate a reply storm across instances.
    if (await messageCapExceeded(from)) return;
    pastCap = true;

    if (message.type === 'image' && message.image?.id) {
      // Capture is the work. Nothing is stored and no AI is spent, and he is told why in one line.
      if (await workIsPaused(from)) { await sayWorkPaused(from); return; }
      await handleReceiptImage(from, messageId, message.image.id);
    } else if (message.type === 'audio' && message.audio?.id) {
      if (await workIsPaused(from)) { await sayWorkPaused(from); return; }
      await handleVoiceNote(from, messageId, message.audio.id);
    } else if (message.type === 'interactive' && message.interactive?.button_reply?.id) {
      await handleButtonReply(from, message.interactive.button_reply.id);
    } else if (message.type === 'text' && message.text?.body) {
      const text = message.text.body;
      // 🔴 CONNECTING A PHONE IS CHECKED BEFORE EVERY OTHER READING OF THE TEXT, AND IT HAS TO BE.
      //
      // Everything below this line assumes we already know whose message this is, because it
      // resolves the sender by number. A man connecting for the first time is by definition a
      // number we do not know, so his message would fall all the way through to replyNotLinked and
      // be told to go and sign up, which he has already done. Worse, a bound customer reconnecting
      // a new handset would have his code read by the transaction parser.
      //
      // It consumes the message when it finds a code, so nothing after it ever sees one.
      if (await handleConnectCode(from, text)) {
        // handled
      } else if (!alwaysAnswered(text) && (await workIsPaused(from))) {
        // 🔴 EVERYTHING ELSE IS WORK. Logging a spend, answering a question, totting up his week:
        // all of it is us doing something for him, and all of it stops together rather than in a
        // pattern he has to learn by trial and error.
        await sayWorkPaused(from);
      } else if (isInvoiceThis(text)) {
        await handleInvoiceThis(from, text);
      } else {
      // Invoice flow takes priority. If it consumes the message, do not also log it.
      const handled = await handleInvoiceFlow(from, text);
      if (!handled) {
        const taxHandled = await handleTaxGuideFlow(from, text);
        // 🔴 THE SETUP GOAL. If we are holding a session open because setup just asked for a goal,
        // this message IS the goal. It must be caught HERE, before the transaction parser, or a goal
        // like "make a million pounds" gets logged as income (it did, in a live test). Catching it
        // here is also what lets setup FINISH: saving the goal continues to sendSetupDone, which
        // starts the reliefs questions. On the old path a man who set a goal was never asked whether
        // he was married, because only "Maybe later" reached sendSetupDone.
        const goalHandled = taxHandled ? false : await handleSetupGoalFlow(from, text);
        // The partnership share, same session discipline as the goal: caught before the transaction
        // parser so "50" is a share, not a £50 payment.
        const shareHandled = (taxHandled || goalHandled) ? false : await handleSetupPartnerShareFlow(from, text);
        if (!taxHandled && !goalHandled && !shareHandled) {
          if (isGetStarted(text)) {
            await handleWelcome(from);
          } else if (isThanks(text)) {
            await handleThanks(from);
          } else if (matchStopStart(text)) {
            await handleStopStart(from, matchStopStart(text) as 'stop' | 'start');
          } else if (matchAck(text)) {
            await handleAck(from, matchAck(text) as 'yes' | 'no' | 'ack');
          } else if (isDeleteLast(text)) {
            await handleDeleteLast(from);
          } else if (matchEditLast(text)) {
            await handleEditLast(from, matchEditLast(text)!.amount);
          } else if (isCIS(text)) {
            await handleCIS(from, messageId, text);
          } else if (isMileage(text)) {
            await handleMileage(from, messageId, text);
          } else if (matchUseOfHomeElection(text)) {
            // 🔴 THIS MOVED ON 1 AUGUST 2026, AND IT CHANGES WHICH MECHANISM HIS WORDS CREATE.
            //
            // isHomeOffice used to be tested here and matchUseOfHomeElection eighteen lines and
            // nine branches further down. HOMEOFFICE_RE carries every phrase in HOME_WORDS except
            // "home as office", so the election door was reachable in production by that one
            // phrasing and by nothing else. "claim use of home, 30 hours a month" hit the
            // TRANSACTION door, which writes a row into expenses, which is the door that double
            // counts against the election. Every phrase test/waintents.test.mjs asserts as an
            // election was being eaten before matchUseOfHomeElection was ever called.
            //
            // The election is the durable, correct mechanism: it belongs to one tax year, it
            // stores the HMRC hours band rather than the money, and lib/elections.ts refuses it to
            // a company and to a property only customer at the door. So it goes first, and
            // isHomeOffice keeps everything the election matcher deliberately refuses: a question
            // ("can i claim use of home"), a message with a pound sign, or a bare mention.
            await handleUseOfHomeElection(from, text);
          } else if (isHomeOffice(text)) {
            await handleHomeOffice(from, messageId, text);
          } else if (isPhoneShare(text)) {
            await handlePhoneShare(from, messageId, text);
          } else if (isSchedule(text)) {
            await handleSchedule(from, text);
          } else if (isSupportRequest(text)) {
            await handleSupportRequest(from, text);
          } else if (isHelp(text)) {
            await handleHelp(from);
          } else if (isTaxTips(text)) {
            await handleTaxTips(from);
          } else if (isIdentity(text)) {
            await handleIdentity(from);
          } else if (matchProductTruth(text) !== null) {
            await handleProductTruth(from, text);
          } else if (isPricing(text)) {
            await handlePricing(from);
          // 🔴 asksAmount IS THE TIE BREAK WITH THE TOTALS LANE THIRTY LINES DOWN, ADDED 9 AUGUST
          // 2026 WITH THE CHAT'S ORDER FIX. This gate has always run before matchTotalsQuestion,
          // which is the right way round for "when is my tax due" and the wrong way round for
          // "how much tax is due on 31 January": both are deadline questions by
          // isDeadlineQuestion(), and the second is a man asking for a figure who was handed a
          // date. Naming a quantity now keeps the message going down to handleTotals. The chat
          // route gates on the SAME call in the same place, so one phrase gets one lane on both
          // channels; test/laneparity.test.mjs walks both routers and holds it.
          } else if (isDeadlineQuestion(text) && !asksAmount(text)) {
            await handleDeadlineQuestion(from);
          } else if (isExpenseCheck(text)) {
            await handleExpenseCheck(from, text);
          } else if (isSetupRequest(text)) {
            await handleSetupStart(from);
          } else if (matchSalarySet(text) !== null) {
            await handleSalarySet(from, text);
          } else if (matchChaseRequest(text)) {
            await handleChaseRequest(from, text);
          } else if (matchRentIn(text)) {
            await handleRentIn(from, text);
          } else if (isPropertyQuestion(text)) {
            await handlePropertyQuestion(from);
          } else if (matchGoalSet(text)) {
            await handleGoalSet(from, text);
          } else if (isGoalDone(text)) {
            await handleGoalDone(from);
          } else if (isGoalQuestion(text)) {
            await handleGoalQuestion(from);
          } else if (matchStudentLoanPlanSet(text)) {
            await handleStudentLoanPlanSet(from, text);
          } else if (isStudentLoanQuestion(text)) {
            await handleStudentLoanQuestion(from);
          } else if (isNiQuestion(text)) {
            await handleNiQuestion(from);
          } else if (isReferRequest(text)) {
            await handleReferRequest(from);
          } else if (isSavingsQuestion(text)) {
            await handleSavingsQuestion(from);
          } else if (isWeeklySummaryRequest(text)) {
            await handleWeeklySummary(from);
          } else if (matchTotalsQuestion(text)) {
            await handleTotals(from, text);
          } else if (isQuestion(text)) {
            await handleMoneyQuestion(from, text);
          } else {
            await handleTextEntry(from, messageId, text);
          }
        }
      }
      }
    } else {
      await sendText(
        from,
        'Send a photo of a receipt, a voice note, or just type what you spent or got paid, and I will log it.',
      );
    }
  } catch (err) {
    // Already acknowledged to Meta, so nothing is retried. Log and answer him; never rethrow.
    //
    // ⚠️ THE NAME ONLY, NEVER THE MESSAGE. A JSON parse failure quotes the body it choked on, and
    // these bodies are PostgREST's and Graph's. Graph's reflects the recipient's wa_id. Vercel
    // logs are an external service.
    console.error('[whatsapp] Handler error:', err instanceof Error ? err.name : 'unknown');
    // 🔴 AND HE IS TOLD. See the block above processMessage for why this is unconditional, and why
    // it may not fire when the cap check is what threw.
    if (pastCap) {
      try {
        await sendText(from, WENT_WRONG);
      } catch {
        // The apology itself failing is the one case with nothing left to try. Do not rethrow: a
        // throw out of processMessage is an unhandled rejection inside after(), which helps nobody.
      }
    }
  }
}

// The first time an unknown number messages us is the make-or-break moment.
// Warm, and point them to sign up on the web, where onboarding and payment live.
// We never say "open the app" for signup, because signup happens on the site.
// "Get started" or a bare greeting. The first contact after they download the
// app and tap "Message Lekhio on WhatsApp". A linked user gets a warm welcome;
// an unknown number gets pointed to sign up. No AI, so this works before keys.
function isGetStarted(body: string): boolean {
  const t = body.trim().toLowerCase().replace(/[!.\s]+$/, '');
  return /^(get started|getstarted|start|hi|hiya|hello|hey|hey there|hello there|begin)$/.test(t);
}

// The first hello sets the tone for everything. A brand card, a short warm
// message with real examples, then three tappable buttons so the very first
// action is one thumb press, not a decision. All in-session, no templates.
async function handleWelcome(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  // 1. The brand card, so the name has a face.
  await sendImageUrl(
    from,
    `${APP_URL}/opengraph-image.png`,
    'Welcome to Lekhio 👋 Your whole back office, right here in this chat.',
  );
  // 2. The warm, quirky hello. The one job of this message is to make you feel
  //    that this is going to be easy.
  await sendText(
    from,
    [
      'Here is the good part: there is nothing to set up before you start. No forms, no spreadsheet, no shoebox of curled up receipts.',
      '',
      'You just tell me things as they happen, by photo, voice note or a quick text, and I turn them into tidy books that are ready for tax. You approve everything, and I never go near HMRC without your yes.',
    ].join('\n'),
  );
  // 3. The feature menu, in the language you already use, plus three tappable
  //    first actions so the very next move is one thumb press.
  await sendButtons(
    from,
    [
      'Everything works the way you already talk:',
      '',
      '📸 Snap any receipt and it files itself',
      '🎙️ "spent 40 on diesel", by text or voice note',
      '🚐 "drove 24 miles" claims your mileage',
      '🏗️ "Dave paid 500, 100 CIS held" tracks your refund',
      '💷 "create invoice" builds and sends one',
      '🎯 "my goal is a van for 24k" and I plan around it',
      '❓ Or ask me anything, like "can I claim my boots?"',
      '',
      'It all lands in your Lekhio app, ready for tax, and anything worth setting up (your bank, the bits about you) is waiting in there too. Pick one to start right now:',
    ].join('\n'),
    [
      { id: 'wk_receipt', title: '📸 Log a receipt' },
      { id: 'wk_goal', title: '🎯 Set a goal' },
      { id: 'wk_help', title: '❓ Everything I do' },
    ],
    'Lekhio · text it, sorted',
  );
}

// A tapped welcome button. Each reply teaches by inviting a real first action.
async function handleButtonReply(from: string, buttonId: string): Promise<void> {
  if (buttonId === 'wk_receipt') {
    await sendText(
      from,
      // 🔴 31 JULY 2026: THIS PROMISED THAT WE READ THE VAT OFF THE RECEIPT. WE DO NOT.
      // lib/claude.ts's vision prompt does not contain the word, ParsedReceipt has no VAT field, and
      // the transactions table has no column to put one in. The in app capture screen was already
      // honest and says "the shop, the total and the date", so this now matches it. When receipt VAT
      // is genuinely extracted, this sentence and the three on /product change together.
      'Easy one. Snap a photo of any receipt, crumpled is fine, and send it right here. I read the shop, the total and the date, and it lands in your app to approve. Go on, try one now.',
    );
    return;
  }
  if (buttonId === 'wk_expense') {
    await sendText(
      from,
      [
        'Type it like you would say it out loud:',
        '',
        '"spent 40 on diesel"',
        '"log 24 miles"',
        '"Dave paid 500 for the rewire"',
        '"paid 80 for screws at Screwfix"',
        '',
        'Send one now and watch it come back logged.',
      ].join('\n'),
    );
    return;
  }
  if (buttonId === 'wk_help') {
    await handleHelp(from);
    return;
  }
  // GET STARTED WITH A GOAL. The structured setup (business type, the bits about
  // you) now lives in the app's first-run wizard, so WhatsApp does not interrogate
  // any more. It welcomes, and the first action it invites is a real one: a goal.
  // This reuses the existing "my goal is..." intent, so nothing needs a session.
  if (buttonId === 'wk_goal') {
    await sendText(
      from,
      [
        'Love it. Tell me what you are working towards and I will keep it in view and shape your tax around it. Say it however feels natural:',
        '',
        '"my goal is a van for 24k"',
        '"I want to save 10k this year"',
        '"goal: take home 3k a month"',
        '',
        'Send yours now and I will set it.',
      ].join('\n'),
    );
    return;
  }
  // 🔴 STEP 1: THE BUSINESS STRUCTURE. It decides which tax engine applies, so it is stored, and each
  // path is acknowledged truthfully rather than pretending one size fits all.
  if (buttonId === 'su_biz_sole') {
    const uid = await findUserIdByPhone(from);
    if (uid) await setBusinessType(uid, 'sole_trader');
    await sendText(
      from,
      'Sole trader, the simplest to run. Everything you log builds one picture: income tax plus Class 4 National Insurance on your profit, and one honest figure for what to set aside.',
    );
    await askSetupCis(from);
    return;
  }
  if (buttonId === 'su_biz_ltd') {
    const uid = await findUserIdByPhone(from);
    if (uid) await setBusinessType(uid, 'limited_company');
    await sendText(
      from,
      'Limited company. Different rules, and I know them: the company pays corporation tax on its profit, then YOU are taxed on how you take money out, salary and dividends. There is a split that keeps the most, and I work it out for you. Reply "pay yourself" any time and I will show you the numbers.',
    );
    await askSetupCis(from);
    return;
  }
  if (buttonId === 'su_biz_partner') {
    const uid = await findUserIdByPhone(from);
    if (uid) await setBusinessType(uid, 'partnership');
    // The share is the one fact that changes a partner's tax, so we ask for it, holding a session so
    // the number cannot be mistaken for a transaction.
    await setSession(from, 'setup', 'partner_share', {});
    await sendText(
      from,
      'Partnership. You are taxed on YOUR share of the profit, not the whole thing, so I need one number: what percentage of the profit is yours? Just the number, like 50. If you split it evenly two ways, that is 50.',
    );
    return;
  }
  if (buttonId === 'su_cis_yes') {
    await sendText(
      from,
      'Then one habit pays for itself: log income with the deduction in the message, like "Dave paid 500, they held 100 CIS". Lekhio tracks every pound held at source, counts it as tax you have already paid, and watches your likely refund. Most subcontractors are owed money back and never claim it.',
    );
    await askSetupLoan(from);
    return;
  }
  if (buttonId === 'su_cis_no') {
    await askSetupLoan(from);
    return;
  }
  if (buttonId === 'su_sl_yes') {
    await sendButtons(
      from,
      'Which plan? Started university between 2012 and 2023 in England or Wales is usually Plan 2. Started from autumn 2023 is Plan 5. Scotland is Plan 4, pre 2012 is Plan 1.',
      [
        { id: 'su_plan_2', title: 'Plan 2' },
        { id: 'su_plan_5', title: 'Plan 5' },
        { id: 'su_plan_other', title: 'Another plan' },
      ],
      'Lekhio setup · 3 of 6',
    );
    return;
  }
  if (buttonId === 'su_plan_other') {
    await sendText(from, 'Easy: text it whenever, like "plan 1", "plan 4" or "postgrad", and it saves itself. On to the next one.');
    await askSetupJob(from);
    return;
  }
  if (buttonId === 'su_plan_2' || buttonId === 'su_plan_5') {
    const userId = await findUserIdByPhone(from);
    const plan = buttonId === 'su_plan_2' ? 'plan2' : 'plan5';
    if (userId) await setStudentLoanPlan(userId, plan);
    await sendText(
      from,
      `${plan === 'plan2' ? 'Plan 2' : 'Plan 5'} saved ✓ Here is why it matters: self employed loan repayments are not taken as you go, they land in one lump with the January bill. From now on your set aside figure includes it, worked out the way HMRC will.`,
    );
    await askSetupJob(from);
    return;
  }
  if (buttonId === 'su_sl_no') {
    await askSetupJob(from);
    return;
  }
  if (buttonId === 'su_job_yes') {
    await sendText(
      from,
      'Text it with the word salary, like "salary 32000", before tax. Why I ask: your salary uses up your tax free allowance and your bands first, so it sets the rate every pound of profit is taxed at, and it changes what payroll already collects on any student loan.',
    );
    return;
  }
  if (buttonId === 'su_job_no') {
    await askSetupProperty(from);
    return;
  }
  if (buttonId === 'su_prop_yes') {
    await sendText(
      from,
      'Rental money gets its own stream, kept apart from your work money because HMRC taxes it differently: no National Insurance, mortgage interest as a credit under Section 24, and new property rates from April 2027 that Lekhio prices on your numbers a year early. Two habits cover you: text rent as it lands, like "rent 950 in from flat 2", and add each property once in the app under Money, Your properties, so everything tags itself.',
    );
    await askSetupGoal(from);
    return;
  }
  if (buttonId === 'su_prop_no') {
    await askSetupGoal(from);
    return;
  }
  if (buttonId === 'su_goal_text') {
    // 🔴 HOLD A SESSION OPEN. Without this, the next message he sends is left to a matcher to
    // recognise, and a live test proved that fails: "make a million pounds" was read as £1,000,000 of
    // INCOME because the goal fell through to the transaction parser. With the session set, his next
    // message IS the goal, whatever words he uses, and it cannot be mistaken for a payment.
    await setSession(from, 'setup', 'goal', {});
    await sendText(from, 'Go on then, in your own words: the thing and the number. "My goal is a van for 24k", "my goal is to earn 60k this year", whatever it really is.');
    return;
  }
  if (buttonId === 'su_goal_skip') {
    await sendSetupDone(from);
    return;
  }
  // The circumstance chain. Checked LAST of the known ids and BEFORE the fallthrough, because a
  // circumstance id that fell through to the help list would hand a man a menu instead of recording
  // the answer he just gave, and he would never know it had not landed.
  if (await handleCircumstanceButton(from, buttonId)) return;
  // An unknown button id (future flows): fall back to the help list.
  await handleHelp(from);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 CONNECTING A PHONE. THE ONE HANDLER IN THIS FILE THAT RUNS FOR A NUMBER WE DO NOT KNOW.
//
// Everything else here resolves the sender to an account by number first. This is the handler that
// creates that relationship, so it is the only one that starts from nothing, and it is checked
// before every other reading of the message text for that reason. A first time connector would
// otherwise fall all the way through to replyNotLinked and be told to go and sign up, which he has
// already done, and a customer reconnecting a new handset would have his code read by the
// transaction parser.
//
// The proof travels HIS way. Meta has already authenticated the account this message came from, so
// receiving the code and the number in one payload proves he controls the WhatsApp account the
// receipts will arrive from. That is a better fact than an SMS gives us, and it needs no Twilio.
// lib/walink.ts holds the rules and the full argument.
//
// ⚠️ ONE SEND, AT THE BOTTOM, AND IT ASKS lib/routing.ts WHETHER TO SEND AT ALL.
//
// The first draft answered from six places. That is six inline sendText call sites, which is the
// thing test/routing.test.mjs ratchets DOWN, and it is also six places that would each have to be
// found on the day this message moves channel. From 1 October every outbound WhatsApp message is
// billed individually, so where this goes is a cost decision, and a cost decision belongs in the
// table with its reasoning beside it rather than scattered through a handler.
//
// This is the table's FIRST real caller. Until now it described the product without governing it.
//
// Returns true when it has answered the message, so the dispatcher stops. A message with no code in
// it is not ours and returns false untouched.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function handleConnectCode(from: string, body: string): Promise<boolean> {
  // No secret, no binding, and no reply either: without WEB_SESSION_SECRET no code was ever issued,
  // so anything code shaped arriving here is not one of ours and the ordinary handlers should have
  // it. Fail closed and silent.
  if (!waLinksConfigured()) return false;

  const code = findLinkCodeIn(body);
  if (!code) return false;
  const hash = hashLinkCode(code);
  if (!hash) return false;

  const { verdict, name } = await connectOutcome(from, hash);

  // 🔴 THE CHANNEL IS THE TABLE'S DECISION, NOT THIS HANDLER'S. connect_result routes to
  // whatsapp_reply and nothing else, because at this instant nothing else can reach him: there is
  // no bound number to push to and no thread until this message succeeds. hasWhatsApp is true by
  // construction here, since he is the one who messaged us.
  //
  // An empty list is SAID rather than assumed. A message nobody received that looks like a message
  // that was sent is the house disease, and this is a handler whose whole job is a handshake.
  const channels = channelsFor('connect_result', { hasPush: false, hasEmail: false, hasWhatsApp: true });
  if (!channels.includes('whatsapp_reply')) {
    console.warn('[whatsapp] connect_result has no channel, so nothing was answered');
    return true;
  }

  await sendText(from, verdict === 'ok' ? welcomeAfterBinding(name) : linkMessage(verdict));
  return true;
}

// Everything that has to touch the database to decide what happened. Split out so the handler above
// is a decision and a single send, and so this can be read on its own: every branch of it is a
// refusal except the last one.
async function connectOutcome(
  from: string, hash: string,
): Promise<{ verdict: LinkVerdict; name: string | null }> {
  const no = (verdict: LinkVerdict) => ({ verdict, name: null });

  const phone = normalizeUkPhone(from);
  if (!isUkMobile(phone)) return no('notuk');

  // Who this number belongs to TODAY, read before anything is written. This is what turns a second
  // scan of the same square into "you are already connected" rather than "we cannot find that
  // code", and it is what refuses a number that belongs to somebody else.
  const [owner, row] = await Promise.all([findUserIdByPhone(from), readLiveWaLink(hash)]);

  const codeVerdict = verifyStoredLink(row);
  if (codeVerdict !== 'ok' || !row) {
    // ⚠️ A MAN WHO IS ALREADY CONNECTED IS TOLD SO, whatever was wrong with the code he sent. He
    // scanned twice, or the reply did not arrive, and telling him we cannot find his code would
    // send him back to the website to fix something that is not broken.
    return no(owner ? 'already' : codeVerdict);
  }

  const verdict = bindingVerdict('ok', owner, row.user_id);
  if (verdict !== 'ok') return no(verdict);

  // 🔴 SPEND THE CODE FIRST, THEN BIND. The database decides the winner.
  //
  // Two messages carrying one code can arrive together from two different phones. Both reads saw an
  // unconsumed row and both got this far. consumeWaLink filters on consumed_at being null and asks
  // for the row back, so exactly one of them proceeds and the other is told the code is spent.
  //
  // Binding first and consuming second would let the second write move the account onto the second
  // number, silently, while the man who actually scanned was looking at a screen that said it had
  // worked.
  if (!(await consumeWaLink(row.id, phone))) return no('spent');

  if (!(await bindProvedPhone(row.user_id, phone))) {
    // The code is gone and he is not connected, which is the one outcome here that is entirely our
    // fault. Say so plainly and send him for a fresh one rather than leaving him waiting.
    return no('failed');
  }

  // His name for the greeting, read AFTER the bind rather than before, so a slow or failed read
  // costs him a first name and never the connection itself.
  const proved = await readProvedPhone(row.user_id).catch(() => null);
  return { verdict: 'ok', name: proved?.name ?? null };
}

// The one place this is said, and it asks the table rather than deciding for itself. Three copies of
// `sendText(from, READONLY_LINE)` is three places to find on the day this moves channel, and it is
// the thing test/routing.test.mjs ratchets down.
async function sayWorkPaused(from: string): Promise<void> {
  const channels = channelsFor('work_paused', { hasPush: false, hasEmail: false, hasWhatsApp: true });
  if (!channels.includes('whatsapp_reply')) {
    console.warn('[whatsapp] work_paused has no channel, so nothing was said');
    return;
  }
  await sendText(from, READONLY_LINE);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE WORK STOPS ON WHATSAPP TOO, OR THE PAYWALL IS A WEB PAYWALL AND NOTHING MORE.
//
// Every gate in this product is on a web route, and WhatsApp is where the work actually arrives: a
// photograph of a receipt is the single most valuable thing we do and it never touches a browser.
// A man whose trial ended could have carried on photographing receipts for ever, and the web lock
// would have looked like it was working the whole time.
//
// ⚠️ IT IS TWO READS, SO IT ONLY RUNS WHEN THE MESSAGE IS ABOUT TO COST US SOMETHING. The always
// allowed list below is checked first, and an unknown number never reaches here at all: it falls
// through to the handlers that tell him to sign up.
//
// Fails OPEN, like everything else that touches this decision. lib/entitlement.ts: locking a man
// out of his own records is worse than letting him have another fortnight free.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function workIsPaused(from: string): Promise<boolean> {
  try {
    const userId = await findUserIdByPhone(from);
    // Not one of ours. The ordinary handlers will tell him where to sign up, which is the right
    // answer and a better one than a message about a subscription he has never had.
    if (!userId) return false;
    return (await gateForUser(userId)) === 'readonly';
  } catch {
    return false;
  }
}

// ⚠️ WHAT STILL WORKS WHEN THE WORK HAS STOPPED, AND EVERY ONE OF THESE IS DELIBERATE.
//
// Stopping messages, asking a human for help, and finding out what we are and what we cost. A
// product that answers "STOP" with "add a card first" is not running a paywall, it is refusing to
// let go of somebody, and for STOP specifically that is unlawful rather than merely grubby.
function alwaysAnswered(text: string): boolean {
  return Boolean(
    matchStopStart(text)
    || isSupportRequest(text)
    || isHelp(text)
    || isIdentity(text)
    || matchProductTruth(text) !== null
    || isPricing(text)
    || isThanks(text),
  );
}

async function replyNotLinked(from: string): Promise<void> {
  await sendText(
    from,
    [
      'Hi, I am Lekhio. I do your books and tax, right here on WhatsApp. Snap a receipt, log your mileage, ask about your money, all by text.',
      '',
      // 🔴 THIS SAID "first month free", AND THE TRIAL HAS BEEN SEVEN DAYS SINCE 29 JULY.
      //
      // Not a rounding error, a different offer: a man told he has a month and cut off on day eight
      // has been misled about money by the product that exists to be straight with him about money.
      // It also said "two minutes", which was the signup promise corrected on 30 July. Both figures
      // now come from the modules that own them, so neither can drift on its own again.
      `I do not have an account for this number yet. Get set up at ${APP_URL.replace('https://', '')}, `
      + `${TRIAL_DAYS} days free and no card needed, then text me again.`,
    ].join('\n'),
  );
}

// The write did not happen, said the same way wherever it did not happen. One string because a
// throw and a refused insert leave a man in exactly the same place: nothing saved, nothing changed,
// send it again. Two spellings of that would drift, and the one he read would be the one that did.
const RECEIPT_NOT_SAVED = 'That did not save. Nothing has changed, so send it again in a minute.';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A THROW BETWEEN HIM AND THE SEND USED TO LEAVE HIM WITH NOTHING AT ALL. FOUND 7 AUGUST 2026.
//
// Photographing a receipt is the ONE thing this product asks a man to do, so it is the one message
// that must never go unanswered. Every branch of the reading already decided a sentence and this
// function sent it: five outcomes and four refusals, nine paths, nine replies. That part was right
// and it stays exactly as it was.
//
// What was NOT right is the tenth path. If any call BETWEEN the photograph and the send threw,
// processMessage's catch logged one line and stopped, and the man heard nothing whatsoever. Three
// real surfaces can throw and not one of them is this file's to fix:
//
//   findUserIdByPhone   posts to PostgREST with no try and no timeout, and reads res.json().
//   downloadMedia       guards both fetches and then reads metaRes.json() and arrayBuffer() outside
//                       the guards.
//   parseReceipt        guards its fetch and then reads res.json() outside it.
//
// One 200 carrying a gateway's HTML instead of JSON is enough for any of the three, and a receipt
// he believes we have is worse than a receipt he knows we refused: he will not send it again.
//
// So the reading now RETURNS its sentence and the throw is caught HERE, which is where a sentence
// is still owed. Nothing was written on any of those paths, so he gets the line the failed write
// already uses, which is true of all of them.
//
// ⚠️ NO NEW SEND. There is still exactly one sendText in this walk, which is what
// test/routing.test.mjs counts and what lib/margin.ts prices. The fix is where the send is reached
// from, never how often it happens.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function handleReceiptImage(from: string, messageId: string, mediaId: string): Promise<void> {
  let reply: string | null;
  try {
    reply = await receiptSentence(from, messageId, mediaId);
  } catch (err) {
    // THE NAME ONLY, NEVER THE MESSAGE. A JSON parse failure quotes the body it choked on, and
    // these bodies are Graph's and Anthropic's: Meta's reflects the recipient's wa_id and can echo
    // what he sent. lib/whatsapp.ts refuses those bodies for the same reason. The name alone still
    // separates a timeout from a bad payload from a dead socket, which is all this line is for.
    console.error('[whatsapp] Receipt read threw:', err instanceof Error ? err.name : 'unknown');
    reply = RECEIPT_NOT_SAVED;
  }
  // null means this walk has already answered him by another route, so nothing is owed.
  if (reply !== null) await sendText(from, reply);
}

// The whole reading of one photograph, as the sentence he should get back. null ONLY when he has
// already been answered, which is the two paths that hand off to a shared reply.
async function receiptSentence(from: string, messageId: string, mediaId: string): Promise<string | null> {
  // Find the Lekhio account for this number first. No point parsing if there
  // is nobody to attach it to.
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return null;
  }

  if (!hasClaudeConfig()) {
    return 'Receipt reading is not switched on yet. Hang tight, it is coming very soon.';
  }

  const media = await downloadMedia(mediaId);
  if (!media) {
    return 'I could not open that image. Try sending the photo again.';
  }

  const refused = await aiBudgetBlocked(from);
  if (refused) {
    await sendBudgetRefusal(from, refused);
    return null;
  }

  // THE ONE RECEIPT WALK, in lib/receiptingest.ts, shared word for word with the web capture
  // route and the chat composer: store the image, parse it with the one parser, fold it into
  // the bank line it duplicates (one purchase, one row, the bank's figures win), REFUSE the
  // same receipt sent twice (no second row, no silent merge), and otherwise insert as
  // waiting, confirmed false, for his yes. The webhook keeps what is the webhook's: who this
  // number belongs to, the budget rings above, and the sentence sent back. One send at the
  // end rather than one per verdict, because a send is real money (see lib/margin.ts).
  const result = await ingestReceiptImage({
    userId,
    bytes: new Uint8Array(Buffer.from(media.base64, 'base64')),
    mediaType: media.mediaType,
    sourceType: 'whatsapp_image',
    whatsappMessageId: messageId,
  });

  switch (result.outcome) {
    case 'unread':
      return 'I could not read that receipt. Try a clearer photo with the total showing.';
    case 'failed':
      // The write itself failed. Said plainly rather than swallowed: a receipt he believes is
      // logged and is not would surface months later, in his figures, as our fault.
      return RECEIPT_NOT_SAVED;
    case 'merged':
      return `Got it. That is the same £${result.amount.toFixed(2)} ${result.merchant} payment your bank already sent me, so I have put the receipt with it rather than counting it twice. Filed under ${result.category}.`;
    case 'duplicate':
      // 🔴 The same receipt, twice. The refusal is the shared sentence, so this channel and
      // the chat cannot drift into two versions of it.
      return duplicateReceiptLine(result.merchant, result.amount, result.date);
    case 'logged': {
      const confirmation = `Logged. ${result.merchant} for £${result.amount.toFixed(2)}. Filed under ${result.category}. It is in your Lekhio.`;
      // Once a day, and only for someone clearly doing this the hard way, offer the
      // easy way. receiptMilestoneNudge fires on exactly the nth receipt, so it cannot
      // become nagging however many they send. Appended to the confirmation rather
      // than sent separately: an extra WhatsApp message would cost us real money (see
      // lib/margin.ts) to say something we can say for free right here.
      const nudge = await bankNudgeAfterReceipt(from, userId);
      return nudge ? `${confirmation}\n\n${nudge}` : confirmation;
    }
  }
}

// Counts today's receipts for this phone and returns the milestone nudge, or null.
//
// The counter reuses the existing ai_usage table (one upsert, resets daily) rather
// than a new query against transactions. A receipt already cost us an AI call, so
// one more row upsert is noise. The bank lookup only happens on the milestone
// itself, so 99% of receipts add a single write and nothing else.
//
// Never throws: a nudge is the least important thing in this handler and must
// never cost someone their logged receipt.
async function bankNudgeAfterReceipt(from: string, userId: string): Promise<string | null> {
  try {
    if (!hasBankFeedConfig()) return null;

    const receiptsToday = await bumpAiUsage('receipt', from);
    if (receiptsToday === null || receiptsToday !== NUDGE_AFTER_RECEIPTS) return null;

    const connections = await listBankConnectionsForUser(userId);
    return receiptMilestoneNudge(receiptsToday, {
      available: true,
      connected: connections.some((c) => c.status === 'linked'),
    });
  } catch {
    return null;
  }
}

// A voice note cannot be transcribed by Claude, and we will not ship a customer's audio to a third party.
// So we PARK it: download the audio, drop it in the voice_jobs queue, and tell the customer we are on it.
// The Mac mini claims the note, transcribes it LOCALLY with Whisper, and posts the words back to
// /api/voice/complete, which logs the entry and confirms. The audio never leaves our own hardware, and is
// wiped the instant it is transcribed.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SAME HOLE AS THE RECEIPT WALK, ONE ORDERING WORSE. FOUND AND CLOSED 7 AUGUST 2026.
//
// The acknowledgement used to be the LAST statement in this function and nothing above it was
// caught, so a throw anywhere in the walk left a man who had just spoken into his phone with
// nothing at all: processMessage logged one line and stopped. He cannot tell a crash from being
// ignored, and voice is the input he chose BECAUSE his hands were full, so he is the customer least
// able to check, retype it, or open the app and look.
//
// TWO SURFACES THROW, and both were proven by running the shipping functions against a real 200
// carrying a gateway's HTML page rather than assumed from the receipt finding. Neither is this
// file's to fix:
//
//   findUserIdByPhone   lib/supabase.ts, posts to PostgREST with no try and no timeout, then reads
//                       res.json() with nothing around it.
//   downloadMedia       lib/whatsapp.ts, guards both fetches and then reads metaRes.json() and
//                       arrayBuffer() outside the guards.
//
// isWorkerLive (lib/bridge.ts) and createVoiceJob (lib/voicejobs.ts) are the two calls the receipt
// walk has not got, so both were read rather than waved through: each wraps its whole body, its own
// body read included, and reports failure by returning false or null. Neither can reach the catch.
//
// 🔴 AND HERE IS WHY THE RECEIPT FIX DOES NOT SIMPLY TRANSPLANT.
//
// handleReceiptImage can say ONE thing on every throw, because on every path that throws nothing
// had been written. That is not true here. The instant createVoiceJob returns an id the audio IS in
// the queue, the mini WILL claim it, and /api/voice/complete WILL write the entry and confirm it.
// Telling him at that moment that we could not take it is not merely wrong, it is the sentence that
// makes him record it again: two jobs, two transcriptions, two rows in his books for one spend.
//
// So the fix is not the catch. THE FIX IS THE ORDER, and the catch is only safe because of it:
//
//   1. THE QUEUE WRITE IS THE LAST THING IN voiceSentence THAT CAN FAIL. Nothing can throw between
//      createVoiceJob returning an id and the promise being returned, so the apology below can
//      never contradict a row that exists. test/routing.test.mjs section 9d pins BOTH halves: every
//      throwing path is executed and asserted to have parked nothing, and no await may be added
//      between the write and the return.
//   2. THE WRITE STAYS BEFORE THE ACKNOWLEDGEMENT, never the other way round. Parked but not
//      promised is a puzzled man whose books are right and whose confirmation is already on its
//      way. Promised but not parked is a man who believes it is in hand, will not send it again,
//      and has nobody coming: reapStaleVoiceJobs only knows about ROWS, so a promise with no row
//      has nobody to keep it, and the spend is simply gone out of his year.
//   3. isWorkerLive STAYS ABOVE downloadMedia, and that is data minimisation, not tidiness. With no
//      fresh heartbeat we never fetch the audio at all, so a customer's recording cannot come to
//      rest in our queue at the one moment there is nobody to transcribe it and wipe it.
//
// ⚠️ NO NEW SEND. Five inline sends became one. See test/routing.test.mjs section 7.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The promise and the apology, one string each. Said two ways they would drift, and the one he read
// would be the one that did.
const VOICE_ON_IT = 'Got your voice note. Writing it up now, one sec.';
const VOICE_NOT_TAKEN = 'I could not take that voice note just now. Try again, or send a photo of the receipt.';
// 🔴 AND THE THIRD SENTENCE, FOR THE CASE WE CANNOT HONESTLY SAY EITHER. 9 August 2026.
//
// createVoiceJob used to return null both when the insert was REFUSED and when it SUCCEEDED and
// reading the answer threw. In the second case the row exists and the audio is parked, and we sent
// VOICE_NOT_TAKEN anyway: "Try again". He records it a second time, the mini transcribes both, and
// the same expense lands in his books twice. A duplicate in a man's tax records is worse than a
// wait, so the ambiguous case gets its own sentence and it does NOT invite a resend.
//
// He is never left on it: if the note really was lost, reapStaleVoiceJobs apologises, from the mini's
// poll or from /api/cron/voicereap, whichever comes first.
const VOICE_MAYBE = 'Got your voice note, but something went slow at my end. Give me a minute rather than sending it again, and I will come back to you either way.';

async function handleVoiceNote(from: string, messageId: string, mediaId: string): Promise<void> {
  let reply: string | null;
  try {
    reply = await voiceSentence(from, messageId, mediaId);
  } catch (err) {
    // THE NAME ONLY, NEVER THE MESSAGE, for the reason handleReceiptImage gives: a JSON parse
    // failure quotes the body it choked on, and these bodies are PostgREST's and Graph's. Graph's
    // reflects the recipient's wa_id. Vercel logs are an external service.
    console.error('[whatsapp] Voice note threw:', err instanceof Error ? err.name : 'unknown');
    // HONEST ONLY BECAUSE OF RULE 1 ABOVE: a throw can only ever happen before the queue write, so
    // nothing is parked, and telling him to send it again cannot double count him.
    //
    // \u26a0\ufe0f AND THAT WAS NOT TRUE UNTIL 9 AUGUST 2026, because createVoiceJob caught its own
    // post-write throw and returned the same null as a refusal, so a note that WAS parked reached
    // this same apology. It returns a three way result now and never throws, which is what makes
    // the sentence above true of every line rather than of all but one.
    reply = VOICE_NOT_TAKEN;
  }
  // null means this walk has already answered him by another route, so nothing is owed.
  if (reply !== null) await sendText(from, reply);
}

// The whole parking of one voice note, as the sentence he should get back. null ONLY when he has
// already been answered, which is the two paths that hand off to a shared reply.
async function voiceSentence(from: string, messageId: string, mediaId: string): Promise<string | null> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return null;
  }

  // Parsing the spoken amount still needs Claude; if that is off, voice cannot work, so say so plainly.
  if (!hasClaudeConfig()) {
    return 'Voice notes are not switched on yet. Send a photo of the receipt for now.';
  }

  // The transcriber runs on the mini. If it is not beating right now (mini down, or restarting), do NOT
  // promise "writing it up now" for a note nobody will pick up, and do not pull his audio down either.
  // Tell the customer plainly and let them send a photo or type it instead. Fails closed: no fresh
  // heartbeat, no download and no promise.
  if (!(await isWorkerLive('voice'))) {
    return 'Voice notes are briefly unavailable. Send a photo of the receipt or just type it, and I will log it now.';
  }

  const media = await downloadMedia(mediaId);
  if (!media) {
    return 'I could not open that voice note. Try sending it again.';
  }

  const refused = await aiBudgetBlocked(from);
  if (refused) {
    await sendBudgetRefusal(from, refused);
    return null;
  }

  // 🔴 THE QUEUE WRITE IS LAST, AND NOTHING AWAITED MAY BE ADDED AFTER IT. See rule 1 above.
  const parked = await createVoiceJob({
    userId,
    fromPhone: from,
    messageId,
    audioBase64: media.base64,
    mimeType: media.mediaType,
  });
  // 🔴 THREE ANSWERS, NOT TWO. 'refused' is the only one that may ask him to send it again, because
  // it is the only one where we know nothing was written. See VOICE_MAYBE and lib/voicejobs.ts.
  if (parked.kind === 'created') return VOICE_ON_IT;
  if (parked.kind === 'refused') return VOICE_NOT_TAKEN;
  return VOICE_MAYBE;
}

// The deterministic money-entry parser now lives in lib/waintents.ts with unit
// tests. It catches the common phrasings with no AI at all, so "spent £40 on
// diesel" and "got paid £500 by Dave" log instantly even before the AI keys have
// credit, exactly like mileage and CIS already do.

async function handleTextEntry(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }

  // Deterministic first. This needs no AI, so the core "spent / got paid" loop
  // works the moment a number is linked, with or without AI credit.
  const quick = parseMoneyEntryRegex(body);
  if (quick) {
    await saveEntry(userId, messageId, quick, 'whatsapp_text', body);
    await sendText(from, confirmationLine(quick));
    return;
  }

  // Anything we could not parse deterministically falls to AI, if it is on.
  if (!hasClaudeConfig() || (await aiBudgetBlocked(from))) {
    await sendText(
      from,
      'Tell me what you spent or got paid and how much, for example "spent £40 on diesel" or "got paid £500 by Dave". You can also send a photo of a receipt.',
    );
    return;
  }
  const parsed = await parseSpokenTransaction(body);
  if (!parsed || parsed.amount <= 0) {
    await sendText(
      from,
      'Tell me what you spent or got paid and how much, for example "spent £40 on diesel" or "got paid £500 by Dave".',
    );
    return;
  }

  await saveEntry(userId, messageId, parsed, 'whatsapp_text', body);
  await sendText(from, confirmationLine(parsed));
}

// Shared insert for voice and text entries. Income is stored positive, an
// expense is stored negative, so the app reads the direction from the sign.
// "yesterday" in the message dates the entry to yesterday; everything else is
// today. Tax periods key off transaction_date, so this matters at quarter edges.
async function saveEntry(
  userId: string,
  messageId: string,
  parsed: { merchant_name: string; amount: number; category: string; direction: 'income' | 'expense' },
  sourceType: string,
  rawText: string,
): Promise<void> {
  const magnitude = Math.abs(parsed.amount);

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A VOICE NOTE'S TRANSCRIPT IS NOT STORED. THE PARSED FIGURES ARE.
  //
  // The date is still read off his words, in memory, a line below this. Then the words are dropped.
  //
  // WHY, when we happily keep what he TYPES: because typing is deliberate and speech is not. A man
  // types "40 diesel". The same man, thumb on the mic, walking to the van, says "forty quid parking
  // at the hospital, I was in for my scan, absolute joke what they charge". We would transcribe that
  // through a third party in another country and write the whole sentence into a financial database,
  // for ever, where it is displayed back to him in quotation marks on the home screen.
  //
  // That is a health record. Nobody decided to collect it. It arrived because `description` was set
  // to whatever came out of the transcriber, and nothing ever said no.
  //
  // Article 5(1)(c), minimisation: we may hold what we need for the purpose. The purpose is his
  // books, and his books need a vendor, an amount, a category and a date. Not the sentence. He
  // verifies what we heard from the confirmation we send him on the spot, which is the moment it can
  // actually be corrected, rather than from a quote in a list he never re-reads.
  //
  // ⚠️ AND I DID NOT REACH FOR A REDACTOR, WHICH WAS MY FIRST INSTINCT AND WAS WRONG. A regex that
  // strips "hospital" and "scan" catches most of it, and the belief that we are covered is worth
  // less than nothing, because the cases it misses are the ones that land in the database wearing a
  // clean bill of health. Do not filter what you can simply decline to keep.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const spoken = sourceType === 'whatsapp_voice';

  await insertTransaction({
    user_id: userId,
    vendor: parsed.merchant_name,
    amount: parsed.direction === 'income' ? magnitude : -magnitude,
    category: parsed.category,
    transaction_date: entryDate(rawText),   // read from his words, then his words go no further
    source_type: sourceType,
    description: spoken ? '' : rawText.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
}

// --- Support escalation. The customer asked for a human, complained, or reported a problem. Lift them
// out of the automated flow: acknowledge in-thread, and open a ticket for Jag to answer from the console
// with a Claude-drafted reply. The reply goes back into THIS thread, free-form, inside Meta's 24-hour
// window. Nothing is ever sent on its own, because Jag approves every reply. Only linked customers open a
// ticket; an unknown number is pointed to the team instead, so the desk never fills with strangers.
async function handleSupportRequest(from: string, text: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(
      from,
      // ⚠️ info@, NOT support@. There is no support@ mailbox: test/llmstxt.test.mjs already asserts
      // "the support@ mailbox we do not have", and every other route to a human in the product,
      // /in, privacy, terms, security, the trade pages and llms.txt, offers info@. This line sent
      // the one population that CANNOT use the web door to the one address nobody reads.
      'For a hand from the team, email info@lekhio.app and a person will help. If you are not set up yet, you can start at lekhio.app.',
    );
    return;
  }

  const reason = supportReason(text);

  // Pre-draft a warm reply for Jag to edit, grounded in his own playbook (the common-issue notes he
  // keeps in Obsidian) when a known issue matches. Best effort: if AI is off or the call fails, the
  // draft is empty and Jag writes from scratch, and the customer's own message is right there in the console.
  let draft = '';
  try {
    if (hasClaudeConfig()) {
      const kb = await matchKb(text).catch(() => []);
      draft = (await draftSupportReply(text, kb)) || '';
    }
  } catch {
    draft = '';
  }

  await openTicket({
    phone: from,
    userId,
    reason,
    customerMessage: text.slice(0, 2000),
    draftReply: draft,
  });

  await sendText(
    from,
    "Thanks, I've passed this straight to a real person on the Lekhio team, and they'll reply right here shortly. Feel free to add anything else in the meantime and I'll pass it on.",
  );
}

// --- Small talk, acks, and fixing the last entry (all deterministic) ---------

async function handleThanks(from: string): Promise<void> {
  await sendText(from, 'Any time. Send the next one whenever it happens. 👍');
}

// "YES."
//
// This used to answer "entries are confirmed in your Lekhio app, under Activity",
// which is precisely the thing we promise a man he will never have to do. He is
// standing in a loft with one hand on a ladder. He is not opening an app.
//
// So yes means YES: everything waiting gets filed, right there in the text.
//
// This does NOT weaken the approval gate, it IS the approval gate. Confirming an
// entry says "that is really mine". It sends nothing to HMRC and it moves no money.
// Those two still ask, every single time, and always will.
async function handleAck(from: string, kind: 'yes' | 'no' | 'ack'): Promise<void> {
  // A friendly noise, not a decision. "ok", "cheers", a thumbs up.
  //
  // This used to be treated as YES, and YES used to confirm every unconfirmed entry
  // in the account. So a man who sent a thumbs up after "Logged. Screwfix, £84.30"
  // was silently approving months of bank lines he had never seen. Approving things
  // you were never shown is not an approval gate. Now it changes nothing.
  if (kind === 'ack') {
    await sendText(from, 'No bother. Send me the next one whenever you like.');
    return;
  }

  if (kind === 'no') {
    await sendText(
      from,
      'No bother, I will leave them as they are. Nothing counts until you say so. If one is wrong, text "delete that" or "change it to 40" and I will sort the last one.',
    );
    return;
  }

  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }

  // YES files what the DIGEST ACTUALLY SHOWED HIM, and nothing else.
  //
  // Bounded to the digest window. Anything older, and anything he captured himself
  // and has not reviewed, still waits for him. He can only approve what he was shown.
  const since = await lastDigestAt(userId);
  if (!since) {
    await sendText(from, 'Nothing waiting on me. Send me the next receipt whenever you like.');
    return;
  }

  // A day either side of the digest, so a late reply still lands on the right batch.
  const from24h = new Date(new Date(since).getTime() - 24 * 3600_000).toISOString();
  const filed = await confirmDigestEntries(userId, from24h);

  if (filed === 0) {
    await sendText(from, 'Nothing waiting on me. Send me the next receipt whenever you like.');
    return;
  }

  await sendText(
    from,
    filed === 1
      ? 'Done. That one is filed and counted. Nothing else is waiting.'
      : `Done. All ${filed} filed and counted. Nothing else is waiting.`,
  );
}

async function handleStopStart(from: string, kind: 'stop' | 'start'): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const on = kind === 'start';
  const ok = await setNudgePrefs(userId, { daily_nudges: on, weekly_summary: on });
  if (!ok) {
    await sendText(from, 'I could not update that just now. Try again in a minute, or change it in the app under Settings.');
    return;
  }
  await sendText(
    from,
    on
      ? 'Reminders are back on. I will keep them useful and rare.'
      : 'Done. No more reminder texts from me. I will still reply whenever you message me, and you can text START any time to switch them back on.',
  );
}

async function handleDeleteLast(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const last = await latestUnconfirmed(userId);
  if (!last) {
    await sendText(from, 'There is nothing waiting to be confirmed. Confirmed entries are edited in the app, under Activity, so you can see exactly what changes.');
    return;
  }
  const ok = await deleteTransactionById(last.id, userId);
  if (!ok) {
    await sendText(from, 'I could not delete that just now. You can remove it in the app, under Activity.');
    return;
  }
  await sendText(from, `Deleted. ${last.vendor ?? 'That entry'} for ${formatGbp(Number(last.amount) || 0)} is gone.`);
}

async function handleEditLast(from: string, amount: number): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const last = await latestUnconfirmed(userId);
  if (!last) {
    await sendText(from, 'There is nothing waiting to be confirmed. Confirmed entries are edited in the app, under Activity.');
    return;
  }
  const direction = Number(last.amount) >= 0 ? 'income' : 'expense';
  const ok = await updateTransactionAmount(last.id, userId, amount, direction);
  if (!ok) {
    await sendText(from, 'I could not change that just now. You can edit it in the app, under Activity.');
    return;
  }
  await sendText(from, `Changed. ${last.vendor ?? 'The last entry'} is now ${formatGbp(amount)}. Check it in the app and confirm.`);
}

// Questions about Lekhio itself: filing, approval, promised savings. Deterministic and early,
// so the claim rulebook and the totals lane can never answer them again (found live, 6 August
// 2026: "Are you HMRC approved software or not?" was answered by the accountant fees claim rule).
async function handleProductTruth(from: string, text: string): Promise<void> {
  const kind = matchProductTruth(text);
  if (!kind) return;
  await sendText(from, productTruthAnswer(kind, { filingLive: hmrcFilingLive() }));
}

async function handleIdentity(from: string): Promise<void> {
  await sendText(
    from,
    [
      'I am Lekhio, a bookkeeping assistant for the UK self employed, right here in WhatsApp. Yes, I am software, with real people behind me.',
      '',
      'Snap a receipt, say what you spent or got paid, and I log it for tax. You approve everything before anything goes near HMRC. Text "help" to see the lot.',
    ].join('\n'),
  );
}

async function handlePricing(from: string): Promise<void> {
  await sendText(
    from,
    [
      'Lekhio is £12.99 a month or £129 a year, everything in, and your first 7 days are free.',
      '',
      `That covers receipt capture, bookkeeping, invoicing, CIS, mileage, and your quarterly tax prep. Get started at ${APP_URL.replace('https://', '')}.`,
    ].join('\n'),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 "WHEN IS MY TAX DUE", ANSWERED FOR THE MAN WHO ASKED IT RATHER THAN FOR EVERYBODY.
//
// This branch used to be one line: `await sendText(from, deadlineAnswer())`. It passed nothing, so
// every asker got "Your next quarterly update is due by 7 November 2026", including a limited
// company director whose company files its own return and a sole trader HMRC has never written to.
//
// ⚠️ THE POSITION IS RESOLVED HERE AND THE WORDS STAY IN lib/waintents.ts, so this channel and the
// chat cannot drift apart in wording, and the mandation rule stays in mtdPosition() where it is
// tested. Read the header on deadlineAnswer() before touching either.
//
// ⚠️ STILL EXACTLY ONE sendText. The verdict is worked out first and sent once, which is the shape
// test/routing.test.mjs's ratchet asks for. A man we cannot identify reaches the same one send with
// nothing known about him, and gets the honest conditional answer rather than silence: he asked a
// question that has a true answer for everybody, and "you are not linked" is not it.
//
// ⚠️ A FAILED READ IS UNKNOWN, NEVER A NO. Every catch below lands on null, which mtdPosition()
// turns into an unstated position, which asks him. Reading a timeout as "he is not mandated" would
// be an all clear nobody gave.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function handleDeadlineQuestion(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  let structure: 'sole_trader' | 'partnership' | 'limited_company' | null = null;
  let position: MtdPosition | null = null;

  if (userId) {
    const [optimiser, circ] = await Promise.all([
      getOptimiserInput(userId).catch(() => null),
      readCircumstances(userId).catch(() => null),
    ]);
    structure = optimiser?.businessType ?? null;
    if (optimiser) {
      // The Making Tax Digital test is on GROSS qualifying income, trade plus rent, before a
      // single expense comes off. mtdPosition() decides what that figure is worth, which for an
      // unstated man is "not much": see lib/taxengine.ts.
      const gross = Math.max(0, optimiser.ytdTradeIncome) + Math.max(0, optimiser.ytdPropertyIncome ?? 0);
      position = mtdPosition({
        excluded: structure === 'limited_company' || structure === 'partnership',
        // mtdStatedFrom() maps a skip, a missing key and a failed read all to null, which means
        // "we have not been told" and never "no".
        stated: mtdStatedFrom(Object.fromEntries((circ ?? []).map((a) => [a.key, a.answer]))),
        grossQualifyingIncome: gross,
        startYear: optimiser.startYear,
      });
    }
  }

  await sendText(from, deadlineAnswer(new Date(), { structure, mtdPosition: position }));
}

// WHO IS ELECTING, read once, in one place, for lib/elections.ts to answer about. The same helper
// app/api/elections/route.ts has, in the same shape, because the two doors lead to the same table.
//
// 🔴 THE .catch(() => null) IS THE SAFETY RULE, NOT LAZINESS. A read that throws must never become
// "he is a company". That would refuse a sole trader the flat rate because a database was slow, and
// he would lose the deduction every month with nothing on any screen to tell him why. A failure is
// UNKNOWN, and lib/elections.ts only ever refuses a KNOWN limited company or a KNOWN landlord.
async function electingAs(userId: string): Promise<Electing> {
  const biz = await getBusinessProfile(userId).catch(() => null);
  return { structure: biz?.businessType ?? null, income: biz?.incomeShape ?? null };
}

// THE DOOR ITSELF, ASKED AND ANSWERED ONCE FOR BOTH ROUTES ONTO THIS RELIEF. True means he has been
// refused and told why, so the caller stops.
//
// ⚠️ ONE SEND FOR TWO HANDLERS, AND THAT IS THE POINT RATHER THAN A TIDY UP. The ratchet in
// test/routing.test.mjs counts inline sendText call sites and may only rise for a genuinely new
// message type that asks lib/routing.ts. This is one sentence with two doors in front of it, so it
// gets one send, the same shape sayWorkPaused() took for the same reason.
//
// The sentence is lib/elections.ts's own, so a man reads the same words here as on the web, and it
// names no alternative because we have built none for a company or a property business.
async function refusedUseOfHome(from: string, userId: string): Promise<boolean> {
  const refusal = electionRefusal('use_of_home', await electingAs(userId));
  if (!refusal) return false;
  await sendText(from, refusal.message);
  return true;
}

// CLAIMING USE OF HOME, BY TEXT. The money nobody was getting.
//
// lib/taxoptimiser.ts rule 4 has been telling every customer to claim this since it was written, and
// emitting the action 'apply_allowance_election'. Nothing implemented it, so the suggestion fired
// forever and not one man ever took the money. Between £120 and £312 a year for a tradesman who does
// his quotes at the kitchen table, which is all of them.
//
// ⚠️ WE CANNOT DO THIS ONE FOR HIM, AND THAT IS NOT A COP OUT.
//
// Doc 103 says the best button is no button: do the thing and tell him plainly what you did. But the
// amount depends on a fact only he knows, how many hours a month he actually works from home, and
// HMRC bands it. So we ask, once, and everything after the answer is automatic. That is a question
// with three real answers, which is the kind doc 103 permits.
//
// The confirmation text comes from lib/elections.ts, the SAME function /api/elections returns, so he
// reads the same words whether he elects here or on a screen.
async function handleUseOfHomeElection(from: string, body: string): Promise<void> {
  const asked = matchUseOfHomeElection(body);
  if (!asked) return;
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE SECOND DOOR ONTO THE SAME ELECTION, AND UNTIL NOW IT HAD NO LOCK ON IT.
  //
  // /api/elections got this check on 31 July 2026. This handler did not, and it writes the same row
  // to the same table, so a limited company director or a landlord with no trade could text three
  // words and take a relief that does not exist for him. The flat rate is a SIMPLIFIED EXPENSE
  // under ITTOIA 2005 s94H, and HMRC BIM75010 says "Only partnerships comprising solely individual
  // partners can claim this simplified expenses", so a company is outside the regime entirely. And
  // s94H is a deduction in computing the profits of a TRADE, so a property business works out its
  // own proportion of its actual costs instead (HMRC PIM2220).
  //
  // The rule is ASKED of lib/elections.ts rather than answered here, and the sentence he reads is
  // the module's own, so this channel and the web say the same thing in the same words. A second
  // copy of the rule at a call site is a copy that stops matching, and the one that stops is the
  // one nobody is looking at.
  //
  // It is checked BEFORE we ask him for his hours, because the answer is a fact about the man and
  // not about his message. Asking a director how many hours he works at home and refusing him
  // afterwards would waste his time twice over.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (await refusedUseOfHome(from, userId)) return;

  // He said he wants it but not how much. Ask, with the three real options and what each is worth.
  if (asked.hoursPerMonth === null) {
    await sendText(from, useOfHomeHoursQuestion(bandOptions()));
    return;
  }

  const band = bandForHours(asked.hoursPerMonth);
  if (band === null) {
    // UNDER THE THRESHOLD IS NOT AN ERROR. He has done nothing wrong, HMRC's flat rate simply starts
    // at 25 hours a month. Saying so beats a silence he would read as us ignoring him.
    await sendText(
      from,
      "HMRC's flat rate starts at 25 hours a month, so there is nothing to claim that way at those hours. If it goes up, just tell me and I will put it on.",
    );
    return;
  }

  const startYear = quarterForDate(new Date()).startYear;
  const months = Math.max(0, Math.min(12, Math.floor((Date.now() - Date.UTC(startYear, 3, 6)) / (30.44 * 86_400_000))));
  const done = await writeAllowanceElection(userId, 'use_of_home', startYear, band);
  if (!done) {
    // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. Telling him it is claimed when the row
    // never landed is how a man finds a hole in his return months later.
    await sendText(from, 'I could not save that just now. Try me again in a minute and it will go on.');
    return;
  }
  await sendText(from, electionConfirmation(band, months));
}

// THE WEEKLY SUMMARY, ASKED FOR RATHER THAN PUSHED.
//
// Until 27 July 2026 this went out every Sunday as a paid business-initiated template, to everybody,
// whether they read it or not. Two things were wrong with that. The template did not exist in Meta,
// so it had been failing silently for weeks. And more expensively: every proactive WhatsApp message
// is paid for, and at an 85% target margin a weekly send to every customer forever is a permanent
// cost for something most of them could simply look at.
//
// So it became a pull. The figures live in the product, free. WhatsApp carries them when he ASKS,
// and this reply lands inside the 24 hour inbound window, which needs no template and costs nothing.
// The man who wants it on WhatsApp still gets it. The eight who never read it stop being billed for.
//
// ⚠️ DETERMINISTIC, OFF HIS OWN ROWS, NEVER A MODEL. Same rule as handleTotals below. A language
// model paraphrasing a money figure is a language model getting a money figure wrong in front of a
// man who is legally responsible for it. The wording comes from lib/weeklyupdate.ts, which is the
// SAME function the app and the web app render, so the three surfaces cannot drift.
async function handleWeeklySummary(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const totals = await weeklyTotals(userId);
  // The personal line facts are best effort. Null means the RPC could not answer, and the branches
  // that need them simply stay shut: he gets his figures and an honest quiet line, never a guess.
  const factsMap = await weeklyUpdateFactsFor([userId]).catch(() => null);
  const facts = factsMap?.get(userId);
  await sendText(
    from,
    weeklySummaryText({
      now: new Date(),
      income: totals.income,
      expenses: totals.expenses,
      rolling12mTaxableTurnover: facts?.rolling12mTaxableTurnover ?? null,
      vatRegistered: facts?.vatRegistered ?? false,
      ytdGrossQualifyingIncome: facts?.ytdGrossQualifyingIncome ?? null,
    }),
  );
}

// "How much have I spent this month" and friends, answered from the user's own
// rows with no AI at all. The tax estimate uses the same engine as the app.
async function handleTotals(from: string, body: string): Promise<void> {
  const q = matchTotalsQuestion(body);
  if (!q) return;
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const totals = await totalsForUser(userId, q.sinceISO, q.category);
  if (!totals) {
    await sendText(from, 'I could not fetch your figures just now. Try again in a minute.');
    return;
  }
  if (totals.count === 0) {
    // Nothing CONFIRMED yet. But a man who just texted a handful of things and then asks "what do I
    // owe" should hear that they are waiting for his tick, not a flat "nothing". Acknowledge the
    // pending captures with their figures, and be plain that nothing counts until he approves it.
    const pending = await pendingSummaryForUser(userId, q.sinceISO).catch(() => null);
    if (pending && pending.count > 0) {
      const bits: string[] = [];
      if (pending.income > 0) bits.push(`${formatGbp(pending.income)} coming in`);
      if (pending.expenses > 0) bits.push(`${formatGbp(pending.expenses)} of costs`);
      const detail = bits.length ? ` (${bits.join(' and ')})` : '';
      const n = pending.count;
      await sendText(
        from,
        `You have ${n} thing${n === 1 ? '' : 's'} waiting for your approval in the app${detail}. Nothing counts towards your tax until you confirm it, so the tally is £0 for now. Approve them and ask me again.`,
      );
      return;
    }
    await sendText(from, `Nothing logged ${q.periodLabel === 'all time' ? 'yet' : q.periodLabel}. Send me a receipt or what you spent and I will start the tally.`);
    return;
  }
  const profit = totals.income - totals.expenses;
  if (q.kind === 'spent') {
    const what = q.category ? `on ${q.category} ` : '';
    await sendText(from, `You have spent ${formatGbp(totals.expenses)} ${what}${q.periodLabel}. It is all in your Lekhio, ready for tax.`);
    return;
  }
  if (q.kind === 'made') {
    await sendText(from, `You have brought in ${formatGbp(totals.income)} ${q.periodLabel}. Nice going. Profit after expenses is ${formatGbp(profit)}.`);
    return;
  }
  if (q.kind === 'profit') {
    await sendText(from, `${q.periodLabel === 'all time' ? 'All time' : `For ${q.periodLabel}`}: ${formatGbp(totals.income)} in, ${formatGbp(totals.expenses)} out, so ${formatGbp(profit)} profit.`);
    return;
  }
  // 🔴 WHAT HE OWES IS THE TAX HUB'S OWN NUMBER, FETCHED BY NAME, NEVER RE-DERIVED.
  //
  // This branch used to run a little January of its own: soleTraderTax on the asked about rows,
  // the student loan added, CIS taken off, with company and partnership variants. Every figure in
  // it was real, and the total still disagreed with /app/tax and the web chats at /app/thread,
  // which both lead with taxPosition() on getOptimiserInput(): the whole person figure across
  // trade, salary, property, savings and dividends, projected to the year, partnership share
  // already applied. A man who asks two of our surfaces what he owes and hears two numbers stops
  // believing both. So this is the same call the Tax hub, the Overview and the thread make, and
  // the sentence around the figure is lib/waintents' oweAnswer, deterministic and pinned by test.
  // A figure off his own rows is exactly what WhatsApp is for, so it is answered here in full.
  const optimiser = await getOptimiserInput(userId);
  const tax = taxPosition(optimiser);
  // 🔴 A DIRECTOR MUST NOT GET THE SMALLER NUMBER WITHOUT THE SENTENCE THAT EXPLAINS IT.
  //
  // taxPosition() stopped charging a company's trading profit to income tax and Class 4 on the
  // director's personal return on 1 August 2026, which is right and which makes his figure a lot
  // smaller. The web screens render setAsideBasisLine beside it so he reads "your company's own
  // Corporation Tax is not in this". WhatsApp rendered the figure alone, so the one channel he uses
  // from a van would have handed him a smaller number and no reason for it, which is the single way
  // that fix could do harm. Same function, same sentence, both channels, so they cannot drift.
  const basis = setAsideBasisLine(optimiser, tax);
  // 🔴 AND WHETHER THERE IS A FIGURE AT ALL, from the one function the Tax hub's own test is
  // written as. A man with costs logged and no income confirmed was told "Put by £0.00 for tax",
  // and the basis line went underneath it explaining the make up of nothing. See oweAnswer.
  const hasPosition = hasTaxPosition(optimiser, tax.setAside);
  const owed = oweAnswer(tax.setAside, tax.projected, hasPosition);
  await sendText(from, hasPosition && basis ? `${owed} ${basis}` : owed);
}

// The UK tax year starts 6 April. Same rule as matchTotalsQuestion.
function taxYearSinceISO(now: Date = new Date()): string {
  const d = new Date(now);
  const y = d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${y}-04-06`;
}

// "How much national insurance do I pay": Class 4 on the year to date profit,
// Class 1 if they have saved a salary, and the pension year status. No AI.
async function handleNiQuestion(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const totals = await totalsForUser(userId, taxYearSinceISO(), null);
  if (!totals) {
    await sendText(from, 'I could not fetch your figures just now. Try again in a minute.');
    return;
  }
  // 🔴 THE PROFILE READ IS WHAT MAKES THE LANDLORD GATE IN niAnswer() RUN AT ALL.
  //
  // The gate went into lib/waintents.ts on 31 July and this call site passed nothing, so it was
  // inert on the only channel that reaches it: a man whose whole business is letting was still
  // being told a lean year could be protected with voluntary Class 2. HMRC NIM74250: "A person
  // whose activities in managing the property are those generally associated with being a landlord
  // would not meet the definition of gainful employment for self-employed NICs purposes." There are
  // no relevant profits, no small profits threshold to fall under, and no Class 2 to buy the year
  // with. His route is Class 3, at several times the price.
  //
  // Fetched alongside the settings rather than after them, so the answer is no slower than it was.
  // A failed read is null, which is unknown, and niAnswer answers exactly as it always has: NIM74250
  // itself says a guest house is a trade, so only a KNOWN landlord is ever told something different.
  const [settings, biz] = await Promise.all([
    getStudentLoanSettings(userId),
    getBusinessProfile(userId).catch(() => null),
  ]);
  const salary = settings?.employmentIncome ?? 0;
  const profit = Math.max(0, totals.income - totals.expenses);
  const pos = niPosition(salary, profit);
  await sendText(
    from,
    niAnswer({
      profit,
      salary,
      class1: pos.class1,
      class4: pos.class4,
      class2Annual: pos.class2Voluntary.annual,
      qualifies: pos.qualifiesViaEmployment || pos.qualifiesViaProfits,
      voluntarySuggested: pos.voluntaryClass2Suggested,
      incomeShape: biz?.incomeShape ?? null,
    }),
  );
}

// "How much student loan will I owe": the stored plan against year to date
// income (profit plus any saved salary). No AI.
async function handleStudentLoanQuestion(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const settings = await getStudentLoanSettings(userId);
  const plans: StudentPlan[] = [];
  if (settings?.plan) plans.push(settings.plan);
  if (settings?.postgrad) plans.push('postgrad');
  if (plans.length === 0) {
    await sendText(from, studentLoanAnswer({ hasPlan: false, planLabel: null, annual: 0, threshold: 0, income: 0 }));
    return;
  }
  const totals = await totalsForUser(userId, taxYearSinceISO(), null);
  if (!totals) {
    await sendText(from, 'I could not fetch your figures just now. Try again in a minute.');
    return;
  }
  const profit = Math.max(0, totals.income - totals.expenses);
  const income = profit + (settings?.employmentIncome ?? 0);
  const r = studentLoanRepayment(income, plans);
  await sendText(
    from,
    studentLoanAnswer({
      hasPlan: true,
      planLabel: plans.map((p) => STUDENT_PLANS[p].label).join(' plus '),
      annual: r.annualTotal,
      threshold: Math.min(...plans.map((p) => STUDENT_PLANS[p].threshold)),
      income,
    }),
  );
}

// "My goal is a van for 24k": create the goal in the user's own words.
// "Rent 950 in from flat 2": rent is income in the property stream, tagged to
// the property whose nickname appears in the message. Unmatched rent lands
// untagged (the app shows it as General property) and still counts.
// The deep setup (doc 82, rebuilt 6 July after Jag's onboarding review).
// Stateless button chain, six steps, every question explains why it makes the
// numbers sharper. Entry: the "setup" text intent or the welcome button.
async function handleSetupStart(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  await sendButtons(
    from,
    [
      'Right, let us set your numbers up properly. Six short questions, most are one tap, and each one makes your tax figures sharper: the bands, the set aside, the January bill.',
      '',
      'First, and it is the big one: how is your business set up? This decides which tax rules I use for you.',
    ].join('\n'),
    [
      { id: 'su_biz_sole', title: '🔧 Sole trader' },
      { id: 'su_biz_ltd', title: '🏢 Limited company' },
      { id: 'su_biz_partner', title: '🤝 Partnership' },
    ],
    'Lekhio setup · 1 of 6',
  );
}

async function askSetupCis(from: string): Promise<void> {
  await sendButtons(from, 'Do you work in construction with tax taken off before you are paid? That is CIS, the Construction Industry Scheme.', [
    { id: 'su_cis_yes', title: 'Yes, CIS' },
    { id: 'su_cis_no', title: 'No' },
  ], 'Lekhio setup · 2 of 6');
}

async function askSetupLoan(from: string): Promise<void> {
  await sendButtons(
    from,
    'Do you have a student loan? People forget this one and it bites: on self employed income the repayment is not taken as you go, it arrives in one lump with the January tax bill.',
    [
      { id: 'su_sl_yes', title: 'Yes' },
      { id: 'su_sl_no', title: 'No' },
    ],
    'Lekhio setup · 3 of 6',
  );
}

async function askSetupJob(from: string): Promise<void> {
  await sendButtons(
    from,
    'Do you earn a PAYE salary as well, with tax taken through payroll? It changes which rate your business profit is taxed at, so it is worth me knowing.',
    [
      { id: 'su_job_yes', title: 'Yes' },
      { id: 'su_job_no', title: 'No' },
    ],
    'Lekhio setup · 4 of 6',
  );
}

async function askSetupProperty(from: string): Promise<void> {
  await sendButtons(
    from,
    'Do you rent out any property? Even one flat changes the picture: rental income has its own rules and its own new tax rates arriving in April 2027.',
    [
      { id: 'su_prop_yes', title: 'Yes' },
      { id: 'su_prop_no', title: 'No' },
    ],
    'Lekhio setup · 5 of 6',
  );
}

async function askSetupGoal(from: string): Promise<void> {
  await sendButtons(
    from,
    'Last one, and it is the good one. Are you working towards something? A van, a turnover number, a safety buffer. Tell Rakha, the agent that watches your numbers, and it plans your tax around the goal: progress, timing, and the moments a purchase saves you real money.',
    [
      { id: 'su_goal_text', title: '🎯 Set a goal now' },
      { id: 'su_goal_skip', title: 'Maybe later' },
    ],
    'Lekhio setup · 6 of 6',
  );
}

async function sendSetupDone(from: string): Promise<void> {
  await sendText(
    from,
    [
      'Setup done ✓ Day to day, Lekhio is now this simple:',
      '',
      '📸 Photo any receipt and it reads and files itself',
      '🎙️ Voice notes work too, say it like you would to a mate',
      '💷 "Dave paid 500" logs income, "spent 40 on diesel" logs a cost',
      '❓ Ask anything: "how much should I set aside", "can I claim my van"',
      '',
      'Everything lands in your app for your yes. Nothing counts until you approve it, and nothing ever goes to HMRC without you. That is the deal, always.',
    ].join('\n'),
  );

  // The setup he asked for is finished. Now the questions he did not ask for, and they are the ones
  // worth the money. One at a time, biggest first, and it stops the second he stops.
  const uid = await findUserIdByPhone(from);
  if (uid) await startCircumstances(from, uid);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CIRCUMSTANCES: the facts no receipt will ever tell us.
//
// A bank feed can see he bought diesel. It cannot see that he was a PAYE electrician until eighteen
// months ago, and that a loss this year therefore carries back three years against those wages and
// HMRC post him a cheque. There is no OCR for that. The only way to know is to ASK HIM.
//
// ⚠️ AND THE ASKING IS THE WHOLE RISK. Ask him eleven questions in a row and he stops reading, and
// then we have a man who has learned to ignore us and STILL cannot claim the relief. Doc 103: every
// question is a decision handed to a man up a ladder with one hand on the rail.
//
// So: ONE question. He answers, he gets the next one. HE STOPS, WE STOP. There is no timer, no nag,
// no "you have 8 questions remaining". The chain is driven entirely by him, which means it can never
// become a thing that pesters him, which means it is still there, unpoisoned, when he comes back.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// The framing, sent ONCE, before the first question. Not on every question: a man who has already
// agreed to answer does not need to be re-sold on answering.
async function startCircumstances(from: string, userId: string): Promise<void> {
  const rows = await readCircumstances(userId);

  // ⚠️ NULL IS "COULD NOT READ", NOT "HE HAS ANSWERED NOTHING". If the read fails and we treat it as
  // an empty slate, we ask a man a question he answered last month. He notices. And a man who notices
  // that we do not listen stops telling us things, which costs him the reliefs and costs us him.
  if (rows === null) return;
  if (rows.length > 0) return; // he is already in the chain. Do not restart it at him.

  await sendText(
    from,
    [
      'One more thing, and it is the part that actually saves you money.',
      '',
      'Most of what you can claim has nothing to do with your receipts. It depends on things only you know. What you did before this, when you really started, whether you are married. Nobody ever asks, so nobody ever claims it.',
      '',
      'I will ask one at a time. Answer when you fancy, ignore me when you do not, and I will stop.',
    ].join('\n'),
  );

  await askNextCircumstance(from, userId);
}

// Ask the single highest-value thing we do not know. Returns false when there is nothing left.
async function askNextCircumstance(from: string, userId: string): Promise<boolean> {
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE PROFILE READ IS NEW, AND ITS ABSENCE WAS A REAL BUG THAT PREDATES WAVE NINE.
  //
  // This line used to be `unanswered(rows)`, with no second argument, on the one channel where the
  // question arrives as a green button on a man's phone. So the structure filter that came out of
  // the director walk on 30 July (b1742cbc) HAS NEVER RUN HERE: every limited company director in
  // the chain has still been offered "what were you doing before you went self employed" and the
  // voluntary Class 2 tick box, both of which assert he is self employed, which he is not. His
  // company trades and he does not.
  //
  // Wave nine adds the second axis and it lands here too: a landlord in this chain would be sent
  // the s72 early trade losses question, whose promise of a cheque against his old wages cannot
  // reach a property business, whose losses only carry forward against the same letting business.
  //
  // A failed profile read passes null on both axes, which lib/circumstances.ts treats as unknown
  // and asks everything, which is precisely today's behaviour. So the worst this read can do when
  // it fails is leave the chain exactly as it has always been, and never take a question away from
  // a sole trader because a query timed out.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const [rows, biz] = await Promise.all([
    readCircumstances(userId),
    getBusinessProfile(userId).catch(() => null),
  ]);
  if (rows === null) return false;

  // The ANSWERS, not the keys. A follow-up is held back until its premise holds: we do not ask a
  // single man what his wife earns. And WHO HE IS, so the chain asks him what applies to him.
  const next = unanswered(rows, {
    structure: biz?.businessType ?? null,
    income: biz?.incomeShape ?? null,
  })[0];
  if (!next) return false;

  // ⚠️ THE BODY IS EXACTLY `next.ask` AND NOTHING ELSE.
  //
  // Because `next.ask` is the string we write into the `asked` column, and that column is the
  // exhibit. Finance Act 2026 Sch 22 made the record of what we asked and what he answered our only
  // proof that we did not intend a loss of tax revenue. If we dress the question up here with a
  // footer or a "this could be worth £252" line, the log no longer holds what he actually read, and
  // the one thing it exists to do is the one thing it cannot do.
  //
  // The reason WHY it matters goes in the reply, AFTER he answers. Which is better product anyway:
  // you do not sell a man on a question, you reward him for answering it.
  await sendButtons(from, next.ask, [
    { id: buttonId(next.key, 'yes'), title: 'Yes' },
    { id: buttonId(next.key, 'no'), title: 'No' },
    { id: buttonId(next.key, 'skip'), title: 'Not now' },
  ]);
  return true;
}

// A circumstance button came back. Returns true if we handled it.
//
// The id is written by buttonId() and read by parseButtonId(), both in lib/circumstances.ts, and
// deliberately NOT reimplemented here. Two parsers over the same string will drift, and the one that
// drifts is always the one that is not under test. This codebase has done that with money three
// times in a single day.
async function handleCircumstanceButton(from: string, id: string): Promise<boolean> {
  const parsed = parseButtonId(id);
  if (!parsed) return false;

  const { key, answer } = parsed;
  const c = CIRCUMSTANCES.find((x) => x.key === key);
  if (!c) return false;

  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return true;
  }

  // `c.ask` comes from the SERVER, not from the button. What we log is what this codebase put in
  // front of him, not what a client claims it showed him.
  const ok = await saveCircumstance(userId, key, answer, c.ask, 'whatsapp');
  if (!ok) {
    // A FAILED WRITE MUST NOT LOOK LIKE A SAVED ONE. Say "no" to us, have it not save, and he
    // believes we know. We do not. He loses the money while thanking us for asking.
    await sendText(from, 'That did not save just then. Nothing is lost, I will ask you again.');
    return true;
  }

  if (answer === 'skip') {
    // "Not now" means not now. The chain ends here, and it is HIS to restart.
    await sendText(from, 'No bother. It is in your app under Settings whenever you fancy it.');
    return true;
  }

  if (answer === 'no') {
    // Nothing to chase. Straight on, no ceremony. A "no" is a real answer and it saves him from
    // ever being asked again, which is worth something on its own.
    const more = await askNextCircumstance(from, userId);
    if (!more) await sendCircumstancesDone(from);
    return true;
  }

  // A YES. Tell him what he has just unlocked, in his words, and be straight about who claims it.
  const lines: string[] = [`Good. ${c.why}`];

  if (c.claimant !== 'him') {
    // ⚠️ WE DO NOT CLAIM WHAT IS NOT OURS TO CLAIM.
    //
    // Marriage Allowance is claimed by the TRANSFEROR, the lower earner, and she is not our customer.
    // Small Business Rate Relief is granted by his COUNCIL, and that is why almost nobody has it: no
    // annual form reminds anyone, and it is not on the accountant's list either. The honest, and the
    // only lawful, move is: find it, tell him, hand it over. Pretending we can file it for him wastes
    // his evening and he would be right to blame us.
    lines.push('', `⚠️ This one is not mine to claim. ${c.claimant === 'his partner' ? 'Your partner' : c.claimant === 'his council' ? 'Your council' : 'Someone other than me'} has to do it. I will walk you through exactly how in the app.`);
  }

  lines.push('', `What I need next: ${c.evidence}`);
  await sendText(from, lines.join('\n'));

  const more = await askNextCircumstance(from, userId);
  if (!more) await sendCircumstancesDone(from);
  return true;
}

async function sendCircumstancesDone(from: string): Promise<void> {
  await sendText(
    from,
    'That is the lot. I will not ask again. Anything that changes, a marriage, a van, VAT, just tell me and I will pick it up.',
  );
}

// "salary 32000": saves the PAYE salary and continues the setup chain.
async function handleSalarySet(from: string, text: string): Promise<void> {
  const amount = matchSalarySet(text);
  if (amount === null) return;
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const ok = await setEmploymentIncome(userId, amount);
  if (!ok) {
    await sendText(from, 'I could not save that just now. Try again in a minute.');
    return;
  }
  await sendText(from, `Salary saved: ${formatGbp(amount)} ✓ Your bands, your loan and your set aside figure all start from the right place now.`);
  await askSetupProperty(from);
}

// "Chase invoice 12" or "who owes me": Rakha drafts the message in the user's
// voice, the user forwards it. Never sent by us, ever.
async function handleChaseRequest(from: string, text: string): Promise<void> {
  const req = matchChaseRequest(text);
  if (!req) return;
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const overdue = await listOverdueInvoices(userId);
  if (overdue.length === 0) {
    await sendText(from, 'Nothing unpaid past its date. Tidy books, happy January.');
    return;
  }
  const wanted = req.number
    ? overdue.find((i) => i.number.toLowerCase().replace(/^0+(?=\d)/, '').includes(req.number as string))
    : null;
  const target = wanted ?? overdue[0];
  const draft = chaseMessage(target.customer, target.number, target.total, target.daysOver, `${APP_URL}/invoice/${target.id}`);
  const others = overdue.length - 1;
  await sendText(
    from,
    `Invoice ${target.number} (${formatGbp(target.total)}, ${target.customer || 'customer'}) is ${target.daysOver} days over. Here is a chase in your voice, forward it as it is or tweak it first:`,
  );
  await sendText(from, draft);
  if (others > 0 && !req.number) {
    await sendText(from, `${others} more unpaid. Say "chase invoice" with the number for each.`);
  }
}

async function handleRentIn(from: string, text: string): Promise<void> {
  const rent = matchRentIn(text);
  if (!rent) return;
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const properties = await listUserProperties(userId);
  const needle = (rent.property ?? '').toLowerCase();
  const match = properties.find((p) => {
    const nick = p.nickname.toLowerCase();
    return needle.length > 0 && (nick.includes(needle) || needle.includes(nick));
  });
  await insertTransaction({
    user_id: userId,
    vendor: match?.nickname ?? (rent.property ? rent.property : 'Rent'),
    amount: Math.abs(rent.amount),
    category: 'rent',
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: 'whatsapp_text',
    confirmed: false,
    income_type: 'property',
    property_id: match?.id ?? null,
  });
  const whereLine = match
    ? ` from ${match.nickname}`
    : rent.property
      ? ` from ${rent.property} (add it as a property in the app and future rent tags itself)`
      : '';
  await sendText(
    from,
    `Rent in: ${formatGbp(rent.amount)}${whereLine} 🏠 Logged to your property stream, its own tax rules, ready for your yes in the app.`,
  );
}

// "How are my properties doing": this year's stream plus the April 2027 line,
// the same engine as the app and the website calculator.
async function handlePropertyQuestion(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const [totals, tradeTotals, properties, profile] = await Promise.all([
    propertyYtdTotals(userId, taxYearSinceISO()),
    totalsForUser(userId, taxYearSinceISO(), null),
    listUserProperties(userId),
    getStudentLoanSettings(userId),
  ]);
  const tradeProfit = Math.max(0, (tradeTotals?.income ?? 0) - (tradeTotals?.expenses ?? 0) - totals.rents + totals.expenses + totals.finance);
  const d = aprilDelta({
    employmentIncome: profile?.employmentIncome ?? 0,
    tradeProfit,
    rents: totals.rents,
    propertyExpenses: totals.expenses,
    financeCosts: totals.finance,
    jointShare: 1,
  });
  await sendText(from, propertyAnswer(totals.rents, d.now.taxCausedByProperty, d.extraPerYear, properties.length));
}

// 🔴 THE SETUP GOAL FLOW. Returns true if it consumed the message.
//
// Reached only while a 'setup'/'goal' session is open (set when he taps "Set a goal now"). It does
// the two things the old code got wrong:
//   1. It treats the message as a GOAL, with no trigger phrase required, so it can never be logged as
//      a transaction. buildGoal understands "1 million", "a million", "24k".
//   2. On success it CONTINUES to sendSetupDone, which starts the reliefs questions (married and the
//      rest). The old path saved the goal and stopped, so a man who set a goal was never asked.
// 🔴 THE PARTNERSHIP SHARE. Returns true if it consumed the message. Reached only while a
// 'setup'/'partner_share' session is open. Like the goal flow, it holds a session so the percentage
// can never be logged as a transaction, and it continues setup once captured.
async function handleSetupPartnerShareFlow(from: string, text: string): Promise<boolean> {
  const session = await getSession(from);
  if (!session || session.flow !== 'setup' || session.step !== 'partner_share') return false;

  // A percentage, plain: "50", "50%", "a third" is too vague so we ask for a number.
  const m = text.match(/(\d{1,3}(?:\.\d+)?)\s*%?/);
  const pct = m ? parseFloat(m[1]) : NaN;
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
    await sendText(from, 'Just the number for now, like 50 for an even two-way split, or 33 for three ways. You can fine-tune it in the app later.');
    return true;
  }

  const userId = await findUserIdByPhone(from);
  if (!userId) { await replyNotLinked(from); return true; }
  await setPartnershipShare(userId, pct);
  await clearSession(from);
  await sendText(from, `Got it, ${Math.round(pct)}% is yours. From now on I tax your share, not the whole partnership. You can change it in the app under your profile.`);
  // Continue setup where the other structures do: the CIS question.
  await askSetupCis(from);
  return true;
}

async function handleSetupGoalFlow(from: string, text: string): Promise<boolean> {
  const session = await getSession(from);
  if (!session || session.flow !== 'setup' || session.step !== 'goal') return false;

  const goal = buildGoal(text);
  if (!goal) {
    // We know he is answering the goal question; we just could not find a number. Ask for the number
    // rather than dropping him into the transaction parser. The session stays open.
    await sendText(from, 'Almost. Give me a number with it, like "a van for 24k", "earn 60k this year", or "a million". Or tap nothing and just say "skip" to move on.');
    if (/\b(skip|later|no|nope|not now)\b/i.test(text)) {
      await clearSession(from);
      await sendSetupDone(from);
    }
    return true;
  }

  const userId = await findUserIdByPhone(from);
  if (!userId) { await replyNotLinked(from); return true; }

  const ok = await insertUserGoal(userId, goal);
  await clearSession(from);
  if (!ok) {
    await sendText(from, 'I could not save that just now, but let us keep going. You can add the goal in the app under Money, Goals.');
  } else {
    await sendText(from, `Goal saved: "${goal.title}", ${formatGbp(goal.amount)}. Rakha keeps it in mind from tonight: progress, tax timing, the lot.`);
  }
  // 🔴 AND THIS IS THE LINE THAT WAS MISSING. Setup is now done, so ask the questions worth the money.
  await sendSetupDone(from);
  return true;
}

async function handleGoalSet(from: string, text: string): Promise<void> {
  const goal = matchGoalSet(text);
  if (!goal) return;
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const ok = await insertUserGoal(userId, goal);
  if (!ok) {
    await sendText(from, 'I could not save that just now. Try again in a minute, or add it in the app under Money, Goals.');
    return;
  }
  await sendText(
    from,
    `Goal saved: "${goal.title}", ${formatGbp(goal.amount)}. Rakha keeps it in mind from tonight: progress, tax timing, the lot. Ask "how are my goals" any time.`,
  );
}

// "How are my goals looking": progress from the after tax pot, same figure as
// the app.
async function handleGoalQuestion(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const [goals, totals] = await Promise.all([getActiveGoals(userId), totalsForUser(userId, taxYearSinceISO(), null)]);
  const profit = totals ? Math.max(0, totals.income - totals.expenses) : 0;
  const pot = Math.max(0, profit - soleTraderTax(profit).total);
  await sendText(from, goalAnswer(goals, pot));
}

// Referral invite (doc 82). We hand back the user's own link and a ready to
// forward message. The user forwards it: we never message a mate for them.
async function handleReferRequest(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const code = await getOrCreateReferralCode(userId);
  if (!code) {
    await sendText(from, 'I could not fetch your invite link just now. Try again in a minute.');
    return;
  }
  await sendText(from, referralInvite(code).reply);
}

// "Goal done": close the newest goal and celebrate properly.
async function handleGoalDone(from: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const title = await completeLatestGoal(userId);
  if (!title) {
    await sendText(from, 'No open goals to close. Set one any time, like "my goal is a van for 24k".');
    return;
  }
  await sendText(from, `"${title}" marked done. Get in. 🎉 Set the next one whenever you are ready.`);
}

// "Plan 2" or "my student loan is plan 2": store it, no form needed.
async function handleStudentLoanPlanSet(from: string, text: string): Promise<void> {
  const plan = matchStudentLoanPlanSet(text);
  if (!plan) return;
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }
  const ok = await setStudentLoanPlan(userId, plan);
  if (!ok) {
    await sendText(from, 'I could not save that just now. Try again in a minute, or set it in the app under Money, Student loan.');
    return;
  }
  await sendText(
    from,
    `Got it, ${STUDENT_PLANS[plan].label} saved. Ask me "how much student loan will I owe" any time and I will answer from your real numbers. You can also see it building in the app under Money, Student loan.`,
  );
}

// confirmationLine now lives in lib/voiceflow.ts (shared with the voice-complete endpoint) and is imported
// at the top of this file, so a spoken note and a typed note confirm in exactly the same words.

// --- Mileage ---------------------------------------------------------------
// Text "log 24 miles" or "drove 24 miles to the job" and we log the claim at
// the current HMRC rate. Closes the one feature gap against the competition.
// Simplified expenses mileage rates, 2026/27. Car or van 55p (first 10,000),
// motorcycle 24p, bicycle 20p. We read the vehicle from the message.
function mileageRate(body: string): { pence: number; vehicle: string } {
  // Read the rate from FACTS, so an approved change to the mileage rate is live here too, not stuck at
  // a hardcoded 55p. (The live round-trip on 22 Jul logged 100 miles at 55p while an approved override
  // said 60p; this closes that.)
  if (/\b(motorbike|motorcycle|moped|scooter)\b/i.test(body)) return { pence: Math.round(FACTS.mileageMotorcycle * 100), vehicle: 'motorcycle' };
  if (/\b(bicycle|pushbike|push bike|cycling|on (?:the|my) bike|by bike|on (?:the|my) cycle)\b/i.test(body)) return { pence: Math.round(FACTS.mileageBicycle * 100), vehicle: 'bicycle' };
  return { pence: Math.round(FACTS.mileageCarFirst10k * 100), vehicle: 'car or van' };
}
const MILEAGE_RE = /\b(\d{1,4})\s*miles?\b/i;

function isMileage(body: string): boolean {
  if (/£|\bspent\b|\bgot paid\b|\bpaid me\b/i.test(body)) return false;
  // Do not hijack a reminder ("remind me ... 24 miles ...") or a question.
  if (/\bremind\b|\breminder\b/i.test(body) || body.trim().endsWith('?')) return false;
  return MILEAGE_RE.test(body);
}

async function handleMileage(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log your mileage.');
    return;
  }
  const m = body.match(MILEAGE_RE);
  const miles = m ? parseInt(m[1], 10) : 0;
  if (!miles || miles <= 0 || miles > 2000) {
    await sendText(from, 'Tell me the miles, for example "log 24 miles" or "drove 24 miles to the job".');
    return;
  }
  const { pence, vehicle } = mileageRate(body);
  const amount = Math.round(miles * pence) / 100;
  await insertTransaction({
    user_id: userId,
    vendor: 'Mileage',
    amount: -amount,
    category: 'travel',
    transaction_date: entryDate(body),
    source_type: 'whatsapp_mileage',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  const onVehicle = vehicle === 'car or van' ? '' : `on the ${vehicle} `;
  await sendText(
    from,
    `Logged. ${miles} miles ${onVehicle}at ${pence}p, that is £${amount.toFixed(2)} of travel. Check it in the app and confirm.`,
  );
}

// --- CIS, construction subcontractor deductions ---------------------------
// "Dave paid me £400, £80 CIS deducted" records the GROSS income and the tax
// already deducted. The deduction offsets your bill at tax time, often a refund.
// It is stored separately so it never reduces your profit.
function isCIS(body: string): boolean {
  if (body.trim().endsWith('?')) return false;
  if (/\bspent\b|\bbought\b/i.test(body)) return false;
  if (!/\bcis\b/i.test(body)) return false;
  // A CIS income log has an amount, with or without a pound sign, because our
  // own onboarding examples omit it ("Dave paid 500, 100 CIS held"). We require
  // a payment context word so a plain question about CIS never books anything.
  return /\d/.test(body) && /\bpaid\b|\bheld\b|\bdeduct|\btook\b|\bkept\b|\bstopped\b|%/i.test(body);
}
async function handleCIS(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log your CIS.');
    return;
  }
  // moneyAmounts reads amounts with or without a pound sign and skips the "20"
  // in "20%", so "Dave paid 500, 100 CIS held" gives [500, 100].
  const amounts = moneyAmounts(body);
  if (amounts.length === 0) {
    await sendText(from, 'Tell me the amounts, for example "Dave paid 500, 100 CIS held".');
    return;
  }
  const gross = amounts[0];
  if (gross > 1000000) {
    await sendText(from, 'That amount looks too big to be right. Send it again, for example "Dave paid £400, £80 CIS deducted".');
    return;
  }
  const pctM = body.match(/(\d{1,3})\s*%/);
  let deduction: number;
  let assumed = false;
  if (amounts.length >= 2) deduction = amounts[1];
  else if (pctM) deduction = Math.round(gross * Math.min(parseInt(pctM[1], 10), 100)) / 100;
  else { deduction = Math.round(gross * FACTS.cisRegisteredRate * 100) / 100; assumed = true; }
  if (deduction >= gross) {
    await sendText(from, 'That CIS deduction looks bigger than the payment. Try "£400 paid, £80 CIS".');
    return;
  }
  const net = Math.round((gross - deduction) * 100) / 100;
  const nameM = body.match(/from\s+([A-Za-z][A-Za-z' ]{1,30})/i);
  const vendor = nameM ? nameM[1].trim() : 'CIS payment';
  await insertTransaction({
    user_id: userId,
    vendor,
    amount: gross,
    category: 'cis income',
    transaction_date: entryDate(body),
    source_type: 'whatsapp_cis',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
    cis_deduction: deduction,
  });
  const tail = assumed ? ' I assumed 20% on the full amount. If materials were included, edit it in the app.' : '';
  await sendText(
    from,
    `Logged. £${gross.toFixed(2)} gross, £${deduction.toFixed(2)} CIS taken, £${net.toFixed(2)} in your pocket. The £${deduction.toFixed(2)} is tax already paid that comes off your bill.${tail} Check it in the app and confirm.`,
  );
}

// --- Working from home, simplified flat rate ------------------------------
// "worked 90 hours from home" logs the HMRC flat rate for that month.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE THIRD DOOR ONTO THE SAME RELIEF, AND IT IS THE OLDEST ONE.
//
// The bands and the money used to be written into this file: 25, 51 and 101 hours, at £10, £18 and
// £26. Four copies of a number is how this codebase keeps producing the same bug, and it is exactly
// what lib/elections.ts and the Khoji nightly diff against GOV.UK exist to prevent: if HMRC moves
// the rate, the watch approves it into FACTS and every reader picks it up without a deploy, EXCEPT
// a reader with the old number typed into it. So the boundaries now come from bandForHours() in
// lib/elections.ts and the money from homeOfficeFlatRateMonthly() in lib/taxengine.ts, which is
// where the election itself reads them.
//
// ⚠️ AND IT HAD NO IDEA WHO IT WAS TALKING TO. A director could text his hours and have a relief he
// cannot have written straight into his books. Same rule as the election, asked of the same module.
//
// ⚠️ THIS HANDLER WRITES A TRANSACTION, NOT AN ELECTION, AND THAT IS A KNOWN DEFECT LEFT STANDING.
// A man who elects AND texts his hours is deducted twice in lib/ledger.ts, which adds the elected
// flat rate on top of the expenses that already contain these rows. Reported rather than redesigned
// on 31 July 2026: the fix belongs in lib/supabase.ts and lib/ledger.ts, beside the mileage slice
// that solves the identical problem (isMileageRow, getOptimiserInput).
// ═══════════════════════════════════════════════════════════════════════════════════════════
const HOMEOFFICE_RE = /\b(home office|worked from home|working from home|work from home|use of home|wfh)\b/i;
function isHomeOffice(body: string): boolean {
  if (/£/.test(body) || body.trim().endsWith('?')) return false;
  return HOMEOFFICE_RE.test(body);
}
async function handleHomeOffice(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log your home working.');
    return;
  }
  // Refused before he is asked for anything, exactly as the election is: whether the flat rate is
  // his at all is a fact about the man, not about his message. Same door, same sentence.
  if (await refusedUseOfHome(from, userId)) return;

  const hm = body.match(/(\d{1,4})\s*(?:hours?|hrs?)\b/i);
  const hours = hm ? parseInt(hm[1], 10) : null;
  if (hours === null) {
    await sendText(from, 'How many hours did you work from home this month? For example "worked 90 hours from home".');
    return;
  }
  const band = bandForHours(hours);
  if (band === null) {
    // UNDER THE THRESHOLD IS NOT AN ERROR, and this used to end "claim a fair share of your actual
    // home costs instead". That is a door we have not built: lib/categories.ts refuses to create a
    // home category ON PURPOSE, because a rule on rent or a household energy bill would sweep up a
    // man's own house, so there is nowhere in this product for him to put such a claim. It also sat
    // oddly beside the election's own "this replaces claiming a share of your actual home bills,
    // you cannot have both". So it now says what the election says, which is true and complete.
    await sendText(
      from,
      "HMRC's flat rate starts at 25 hours a month, so there is nothing to claim that way at those hours. If it goes up, just tell me and I will put it on.",
    );
    return;
  }
  // Read at call time, never captured, so a Khoji approved rate change or a live override is picked
  // up without a deploy. No zero guard, deliberately: electionConfirmation() in lib/elections.ts
  // prints this same rate unguarded, and a second reader being more suspicious than the module that
  // owns the number is how two doors start disagreeing about what a man is owed.
  const monthly = homeOfficeFlatRateMonthly(band);
  await insertTransaction({
    user_id: userId,
    vendor: 'Use of home',
    amount: -monthly,
    category: 'use of home',
    transaction_date: entryDate(body),
    source_type: 'whatsapp_homeoffice',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  await sendText(from, `Logged. ${hours} hours from home, that is the £${monthly} HMRC flat rate for the month. One claim a month. Check it in the app and confirm.`);
}

// --- Phone and broadband, business share ----------------------------------
// "phone bill £45, 80% business" logs only the business proportion.
function isPhoneShare(body: string): boolean {
  if (body.trim().endsWith('?')) return false;
  return /£/.test(body) && /\b(phone|mobile|broadband|internet)\b/i.test(body) && /\d{1,3}\s*%/.test(body);
}
async function handlePhoneShare(from: string, messageId: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can log this.');
    return;
  }
  const amounts = poundAmounts(body);
  const pm = body.match(/(\d{1,3})\s*%/);
  if (amounts.length === 0 || !pm) {
    await sendText(from, 'Tell me the bill and your business share, for example "phone bill £45, 80% business".');
    return;
  }
  const total = amounts[0];
  const pct = Math.min(parseInt(pm[1], 10), 100);
  const amount = Math.round(total * pct) / 100;
  await insertTransaction({
    user_id: userId,
    vendor: 'Phone and broadband',
    amount: -amount,
    category: 'phone',
    transaction_date: entryDate(body),
    source_type: 'whatsapp_phoneshare',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  await sendText(from, `Logged. ${pct}% of £${total.toFixed(2)} is £${amount.toFixed(2)} of phone and broadband. Check it in the app and confirm.`);
}

// --- Help and money questions ---------------------------------------------
const HELP_RE = /^(help|menu|commands|options|what can you do|what can u do)$/i;
const QUESTION_RE = /(^|\s)(how much|how many|what(?:'s| is| are)?|whats|when|show|list|total|do i|did i|am i|have i|spent|owe|owed|made|earn)\b/i;

function isHelp(body: string): boolean {
  // Whole-message only, so a greeting in front of a real action ("hello, spent 40")
  // is not swallowed by the help menu.
  return HELP_RE.test(body.trim().replace(/[!.?\s]+$/, ''));
}

const SCHEDULE_RE = /\b(remind me|reminder|price up|quote|book(?:ing)?|appointment|diary|schedule|pencil in|tomorrow|next (?:mon|tue|wed|thu|fri|sat|sun)|at \d{1,2}(?::\d{2})?\s?(?:am|pm)|o'?clock)\b/i;

function isSchedule(body: string): boolean {
  // Do not hijack a money entry. If it clearly mentions a spend or a payment, let the entry handler take it.
  if (/£|\bspent\b|\bbought\b|\bgot paid\b|\bpaid me\b/i.test(body)) return false;
  return SCHEDULE_RE.test(body);
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'when it is due';
  return `on ${d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE THIRD WALK WITH THE SAME HOLE, AND THE ONLY OTHER ONE THAT MAKES A PROMISE. 7 AUGUST 2026.
//
// Neither the receipt pass nor the voice pass looked at this one. It has the same two ingredients:
//
//   findUserIdByPhone   lib/supabase.ts, res.json() with nothing around it.
//   parseSchedule       lib/claude.ts, guards its fetch and then reads res.json() outside the
//                       guard, exactly like parseReceipt. Every entry point in that module does.
//
// Either one throwing left him with silence, and a reminder is the ONE thing he will never chase:
// he asked us to remember it so that he could stop. He finds out it was never set on the morning it
// mattered, which is the day it is no longer worth setting.
//
// And it is the voice ordering again, so the same rule applies: createEvent writes a row that texts
// him LATER, so the write stays before the acknowledgement and the acknowledgement is the only
// send. Unlike the voice queue, createEvent throws only when the row was NOT created (a non ok
// status), so the apology below can never contradict a diary entry that exists.
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function handleSchedule(from: string, body: string): Promise<void> {
  let reply: string | null;
  try {
    reply = await scheduleSentence(from, body);
  } catch (err) {
    // The name only, never the message. Same reasoning as handleReceiptImage and handleVoiceNote.
    console.error('[whatsapp] Schedule read threw:', err instanceof Error ? err.name : 'unknown');
    reply = 'I could not set that reminder just now. Nothing is in your diary, so send it again in a minute.';
  }
  if (reply !== null) await sendText(from, reply);
}

// One reminder, read and written, as the sentence he should get back. null ONLY when he has already
// been answered by a shared reply.
async function scheduleSentence(from: string, body: string): Promise<string | null> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    return 'Open the app and add your number first, then I can keep your diary.';
  }
  if (!hasClaudeConfig()) {
    return 'Reminders are not switched on yet. Hang tight, they are coming very soon.';
  }
  const refused = await aiBudgetBlocked(from);
  if (refused) {
    await sendBudgetRefusal(from, refused);
    return null;
  }
  const parsed = await parseSchedule(body, new Date().toISOString());
  if (!parsed) {
    return 'I could not work out a time for that. Try, for example, "remind me to price up Dave\'s job tomorrow at 8am".';
  }
  // 🔴 THE DIARY WRITE IS LAST, AND NOTHING AWAITED MAY BE ADDED AFTER IT.
  await createEvent(userId, { title: parsed.title, kind: parsed.kind, starts_at: parsed.starts_at, remind_at: parsed.remind_at });
  const when = parsed.remind_at ? formatWhen(parsed.remind_at) : 'when it is due';
  return `Got it. "${parsed.title}". I will remind you ${when}. 👍`;
}

// A money question, but only if it actually reads like a question, not a log
// entry. We treat a trailing question mark or a money question phrase as the cue.
function isQuestion(body: string): boolean {
  const b = body.trim();
  if (b.endsWith('?')) return true;
  // An entry, not a question: a spend/earn verb sitting with an amount. Never
  // hijack a money entry into the Q&A path, or the expense is silently lost.
  if (/\b(spent|spend|paid|bought|made|earnt|earned|got|took|takings?|invoiced?|charged?)\b[^?]*\d/i.test(b)) return false;
  return QUESTION_RE.test(b) && !/£|\bpaid\b|\bbought\b|\bspent £|\bgot paid\b/i.test(b);
}

async function handleHelp(from: string): Promise<void> {
  await sendText(
    from,
    [
      "Hi, I'm Lekhio. Your books, handled. Here is what I can do:",
      '',
      '📸 Send a photo of a receipt and I log it.',
      '🎙️ Or leave a voice note, like "forty quid diesel at the BP".',
      '✍️ Or just type it, like "spent £30 on screws" or "got paid £400 by Dave".',
      '🚗 Log mileage, like "drove 24 miles to the job".',
      '🏠 Log home working, like "worked 90 hours from home".',
      '🏗️ Log CIS, like "Dave paid £400, £80 CIS deducted".',
      '🧾 Type "create invoice" and I will build and send one with you.',
      '💬 Ask me anything, like "how much did I spend on fuel this month?".',
      '💡 Ask "can I claim my work boots?" and I will tell you straight.',
      '📈 Text "pay less tax" for the legal ways to keep more of what you earn.',
      '',
      'Everything shows in your app to review and approve. Nothing goes to HMRC without you.',
    ].join('\n'),
  );
}

async function handleMoneyQuestion(from: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then ask me anything about your money.');
    return;
  }
  if (!hasClaudeConfig()) {
    await sendText(from, 'I cannot answer questions just yet. Hang tight, it is coming very soon.');
    return;
  }
  const refused = await aiBudgetBlocked(from);
  if (refused) {
    await sendBudgetRefusal(from, refused);
    return;
  }
  const summary = await transactionSummaryForUser(userId);

  // ⚠️ THE BRAIN, ON WHATSAPP. It was not here, and WhatsApp is the product.
  //
  // Khoji reads GOV.UK every night. A human approves what it finds, one card at a time, in the
  // console. And until today all of that reached exactly ONE surface: the Ask screen in the app.
  //
  // So a man who TEXTED "has the mileage rate changed?" got an answer from static rules, while the
  // same man opening the app got the answer with the GOV.UK link attached. Every approval we made
  // was invisible on the channel the entire product is named after.
  //
  // Reviewed and source-linked rows only, and it degrades to nothing on any failure: an empty
  // knowledge base answers exactly as it did before. The brain can only ever ADD.
  let knowledge = '';
  try {
    const items = await getRelevantKnowledge(body, 4);
    if (items.length) {
      knowledge = items
        .map((k) => `- ${k.title}${k.effective_date ? ` (effective ${k.effective_date})` : ''}: ${k.summary} [source: ${k.source_url}]`)
        .join('\n');
    }
  } catch {
    knowledge = '';
  }

  const answer = await answerMoneyQuestion(body, summary, knowledge);
  await sendText(from, answer ?? 'I could not work that out. Try asking another way.');
}

// --- "What have you actually saved me?" ---------------------------------------------------------
//
// ⚠️ THE QUESTION THAT DECIDES WHETHER HE KEEPS PAYING, and the one we could not answer until today.
//
// "£12.99 saves you £2,000" is a SPECIFICATION, not a slogan (doc 108). A man texts this the month
// his card is due, and if the answer is a shrug, he cancels. He is right to.
//
// NO AI. It is arithmetic on his own confirmed figures, so a model has nothing to add and everything
// to get wrong, and the number MUST be the same one he sees in the app. A model would paraphrase it,
// and a paraphrased money figure is a different money figure.
async function handleSavingsQuestion(from: string) {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Send me a receipt or two first and I will show you exactly what I have saved you.');
    return;
  }

  const input = await getOptimiserInput(userId);

  // 🔴 THIS USED TO BE A HAND WRITTEN COPY OF THE LEDGER ASSEMBLY, AND IT HAD ALREADY DRIFTED.
  //
  // The old comment here said "THIS MUST MATCH app/api/ledger/route.ts EXACTLY", which is the sort
  // of instruction that is true right up until it is not. It passed a hardcoded zero for use of home,
  // alongside a comment saying it was "never captured at all". That stopped being true on 27 July 2026,
  // when lib/elections.ts shipped and the API route started passing the real figure. From that moment a
  // man who had elected use of home saw one total on his ledger and a SMALLER one in the WhatsApp
  // reply, which are the two places he would actually compare.
  //
  // Nobody wrote a bug. Two readers over one number drifted, exactly as the header on
  // app/api/ledger/route.ts says they always do. So there is now one assembler, ledgerFor(), and
  // this call site cannot fall behind again because it no longer knows how the sum is made.
  const l = ledgerFor(input);

  // NOT ENOUGH IS NOT ZERO. Two weeks in we do not proudly announce that we saved him £14.
  if (!l.enough) {
    await sendText(from, l.note ?? 'Too early to say yet.');
    return;
  }

  const lines: string[] = [];
  lines.push(headline(l));
  lines.push('');
  // THE TESLA SCREEN. Two numbers, side by side. The gap is the product.
  lines.push(`Claiming nothing: £${l.withoutLekhio.toLocaleString('en-GB')} of tax`);
  lines.push(`With Lekhio: £${l.withLekhio.toLocaleString('en-GB')}`);

  if (l.lines.length) {
    lines.push('');
    lines.push('Where it came from:');
    for (const x of l.lines.slice(0, 4)) {
      lines.push(`  ${x.label}: £${x.saved.toLocaleString('en-GB')}`);
    }
  }

  // HIS OWN MONEY. Separate, always, and never added to the saving. This product has already once
  // quoted a man a CIS refund that did not exist.
  if (l.refundDue > 0) {
    lines.push('');
    lines.push(`And £${l.refundDue.toLocaleString('en-GB')} of CIS is sitting with HMRC. That is your money, not a saving. You get it back when you file.`);
  }

  // THE FINAL-CHECK LINE. When Khoji has learned of a change and you have approved it, the figures
  // above were worked on that latest law, and we say so, so the number a man files is provably the
  // current one. Silent when nothing has changed, so an ordinary answer is unchanged.
  const factNote = await factUpdateNote();
  if (factNote) {
    lines.push('');
    lines.push(`These are worked on the current tax rules, ${factNote}. Nothing goes to HMRC without you.`);
  }

  await sendText(from, lines.join('\n'));
}

// --- "Can I claim this?" expense checker ----------------------------------
// "can I expense my work boots?", "is a van tax deductible?", "can I claim fuel".
// Answered from the deterministic knowledge base first, so it works even before
// the AI is switched on, with Claude as a fallback for anything unusual.
// General information only, never a filing or an action.
const CLAIM_WORDS = /\b(claim|expense|deduct|deductible|allowable|write[- ]?off|writeoff|tax[- ]?deductible)\b/i;
function isExpenseCheck(body: string): boolean {
  if (!CLAIM_WORDS.test(body)) return false;
  // It must read like a query, not a logged entry. No money amount being booked.
  if (/£\s*\d/.test(body)) return false;
  return /\bcan i\b|\bcould i\b|\bable to\b|\bdo i\b|\bis (?:it|this|that|a|an|my|the)\b|\bare (?:my|these|those)\b|\bwhat about\b|\?/i.test(body);
}

function isTaxTips(body: string): boolean {
  if (/£\s*\d/.test(body)) return false;
  return /\b(pay less tax|pay no tax|save (?:on )?tax|reduce my tax|lower my tax|less tax|tax efficient|tax efficiency|keep more|how (?:do|can) i pay)\b/i.test(body);
}

// A soft signup line, only for numbers we do not have an account for. The
// expense checker and tax tips give value to anyone, then point them to sign up.
async function signupTail(from: string): Promise<string> {
  const linked = await findUserIdByPhone(from);
  if (linked) return '';
  return `\n\nWant me to track all this for you? Get set up at ${APP_URL.replace('https://', '')}, ${TRIAL_DAYS} days free.`;
}

async function handleExpenseCheck(from: string, body: string): Promise<void> {
  // One lookup, reused below. Whether we have an account for this number decides
  // both the signup nudge and whether the paid AI fallback is allowed.
  const linked = await findUserIdByPhone(from);
  const tail = linked
    ? ''
    : `\n\nWant me to track all this for you? Get set up at ${APP_URL.replace('https://', '')}, ${TRIAL_DAYS} days free.`;

  const hit = checkExpense(body);
  if (!hit) {
    if (/\bwhat\b/i.test(body) && /\bclaim\b/i.test(body)) {
      await handleTaxTips(from);
      return;
    }
    // The Claude fallback runs ONLY for linked accounts, so an unknown number
    // cannot spend our AI budget by spamming questions. Unlinked callers still
    // get the safe general answer and a nudge to sign up.
    if (hasClaudeConfig() && linked) {
      const refused = await aiBudgetBlocked(from);
      if (refused) {
        await sendBudgetRefusal(from, refused);
        return;
      }
      const ai = await answerExpenseQuestion(body);
      if (ai) {
        await sendText(from, ai + tail);
        return;
      }
    }
    await sendText(
      from,
      [
        'The test HMRC uses is simple: was it spent wholly and only for the business? If yes, it is very likely claimable. If it is part personal, you claim the business share.',
        '',
        'Ask me about a specific thing, like "can I claim my work boots?" or "is a van deductible?". Or text "pay less tax" for the legal ways to keep more.',
        '',
        'General info, not advice for your exact situation.',
      ].join('\n') + tail,
    );
    return;
  }
  const icon = VERDICT_ICON[hit.verdict];
  await sendText(
    from,
    [
      `${icon} ${hit.title}. ${hit.rule}`,
      '',
      'Want it logged? Send the receipt or the amount and I will file it.',
      '',
      'General info, not advice for your exact situation.',
    ].join('\n') + tail,
  );
}

async function handleTaxTips(from: string): Promise<void> {
  const lines = TAX_TIPS.slice(0, 8).map((t) => `• ${t.title}. ${t.body}`);
  await sendText(
    from,
    [
      'Here are the legal ways to keep more of what you earn. All within the rules, nothing dodgy.',
      '',
      ...lines,
      '',
      'I track most of these for you as you go, so you do not leave money on the table. General info, not advice for your exact situation.',
    ].join('\n') + (await signupTail(from)),
  );
}

// --- Instant invoice from a logged sale (the Tyms mechanic) --------------------
// After logging income like "Dave paid 500 for a rewire", the user can reply
// "invoice this" and Lekhio turns that payment into a DRAFT invoice with a
// shareable link. The user sends it, never us: drafting is fine, sending to a
// third party is the user's to do. No new session, it reads the last income row.
async function handleInvoiceThis(from: string, text: string): Promise<void> {
  // If the user is midway through the guided "create invoice" flow, this is part
  // of that conversation, not the shortcut. Hand it back to the flow so the
  // session is never orphaned.
  const session = await getSession(from);
  if (session && session.flow === 'invoice') {
    await handleInvoiceFlow(from, text);
    return;
  }
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can turn a payment into an invoice.');
    return;
  }
  const last = await getLastIncomeTransaction(userId);
  if (!last || last.amount <= 0) {
    await sendText(from, 'I could not find a recent payment to invoice. Log it first, like "Dave paid 500 for a rewire", then say "invoice this".');
    return;
  }
  const customer = (last.vendor ?? '').trim();
  if (!customer) {
    await sendText(from, 'I have the amount but not who it was for. Say "create invoice" and I will take you through it.');
    return;
  }
  const cat = (last.category ?? '').trim();
  const description = cat && cat.toLowerCase() !== 'income' ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'Work completed';
  const inv = await createInvoice(userId, {
    customer_name: customer,
    line_items: [{ description, amount: Math.abs(last.amount) }],
  });
  if (!inv) {
    await sendText(from, 'Something went wrong making that invoice. Try "create invoice" instead.');
    return;
  }
  await sendText(
    from,
    `Done. Invoice ${inv.number} for ${formatGbp(inv.total)} to ${customer} is ready as a draft.\n\nSend it to them here:\n${APP_URL}/invoice/${inv.id}\n\nYou send it, never me. Tweak anything first in the app.`,
  );
}

// --- Guided invoice flow over WhatsApp ------------------------------------
// "create invoice" starts it. Then we ask for the customer, their contact, and
// the work, and build a real invoice with a shareable link. Returns true if the
// message was part of an invoice conversation (so it is not also logged as an
// expense), false otherwise.
const INVOICE_TRIGGER = /^\s*(create|new|make|raise|start)?\s*invoice\b/i;
const CANCEL = /^\s*(cancel|stop|quit|nevermind|never mind)\s*$/i;

async function handleInvoiceFlow(from: string, body: string): Promise<boolean> {
  const session = await getSession(from);
  const isTrigger = INVOICE_TRIGGER.test(body);

  // Only act on our own flow. If there is no session, or the session belongs to
  // another flow (the tax walkthrough), and this is not an invoice trigger, let
  // the other handlers take it. This stops us clearing another flow's session.
  if ((!session || session.flow !== 'invoice') && !isTrigger) return false;

  if (CANCEL.test(body)) {
    await clearSession(from);
    await sendText(from, 'No problem, I have cancelled that invoice.');
    return true;
  }

  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await clearSession(from);
    await sendText(
      from,
      'We could not find your Lekhio account for this number. Open the app, add your number, then try again.',
    );
    return true;
  }

  // Start (or restart) the flow.
  if (!session || (isTrigger && session.flow !== 'invoice')) {
    await setSession(from, 'invoice', 'customer', {});
    await sendText(from, "Let's make an invoice. Who is it for? Just their name.");
    return true;
  }

  // The last four are carried only between the items step and the confirm step, so the invoice he
  // approves is the one that gets sent, and the send needs no second parse of his words.
  const data = (session.data ?? {}) as {
    customer_name?: string;
    customer_contact?: string | null;
    invoice_id?: string;
    invoice_number?: string;
    invoice_total?: number;
    invoice_link?: string;
  };

  if (session.step === 'customer') {
    data.customer_name = body.trim().slice(0, 120);
    await setSession(from, 'invoice', 'contact', data);
    await sendText(from, "Their email or mobile to send it to? Type skip if you will send it yourself.");
    return true;
  }

  if (session.step === 'contact') {
    const c = body.trim();
    data.customer_contact = /^skip$/i.test(c) ? null : c.slice(0, 160);
    await setSession(from, 'invoice', 'items', data);
    await sendText(from, "What is the work and the amount? For example: bathroom rewire 450, materials 80.");
    return true;
  }

  if (session.step === 'items') {
    // ONE VERDICT, ONE SEND. Every branch below works out what to say, and the single sendText at
    // the bottom says it. This step used to hold four separate sends; concentrating them is the
    // house rule for outbound WhatsApp, and it is what made room for the approval step below
    // without spreading the send back out.
    let reply = '';
    let stay = false; // his words were unreadable, so keep him on this step
    let keep = false; // we have moved him on ourselves, so do not clear

    if (!hasClaudeConfig()) {
      reply = 'Invoice building is not switched on yet. Hang tight.';
    } else {
      const refused = await aiBudgetBlocked(from);
      if (refused) {
        await sendBudgetRefusal(from, refused);
        return true;
      }
      const drafted = await draftInvoice(body);
      if (!drafted || drafted.line_items.length === 0) {
        reply = "I could not pick out the amounts. Try like: 'bathroom rewire 450, materials 80'.";
        stay = true;
      } else {
        // 🔴 A VAT REGISTERED TRADER IS NOT INVOICED FOR ON THIS SURFACE, AND IS NEVER GUESSED AT.
        //
        // createInvoice with no vat object produces tax 0, total = subtotal, treatment null. For
        // the commonest customer here, a CIS subcontractor billing a main contractor, that is
        // accidentally right, because the reverse charge means he charges none. For a VAT
        // registered trader doing standard rated work for an end user it understates the VAT he
        // must account for, on a document his customer receives and books.
        //
        // The web form does not guess. It reads his VAT profile and asks four questions: is the
        // job within CIS, is the customer VAT registered, are they CIS registered, are they the
        // end user. Those four decide whether the reverse charge applies, and they cannot be
        // invented from one line of WhatsApp text. So we say so, and hand him the form that asks.
        const vatProfile = await readVatProfile(userId);
        if (!vatProfile) {
          reply = `I could not check your VAT position just now, and I will not guess it on an invoice. Please make this one in the app: ${APP_URL}/app/invoices/new`;
        } else if (vatProfile.registered) {
          reply =
            'Because you are VAT registered I need a few answers before this invoice is right, including whether the job falls under CIS and whether your customer is the end user. Those decide whether you charge VAT or the reverse charge applies, and I am not going to guess them on a document your customer keeps.\n\n' +
            `Make this one here and it takes a minute: ${APP_URL}/app/invoices/new`;
        } else {
          const inv = await createInvoice(userId, {
            customer_name: data.customer_name || 'Customer',
            customer_contact: data.customer_contact ?? null,
            line_items: drafted.line_items,
          });
          if (!inv) {
            reply = 'Something went wrong saving that. Please try again.';
          } else {
            const link = `${APP_URL}/invoice/${inv.id}`;
            const lines = drafted.line_items
              .map((li) => `- ${li.description}: £${Number(li.amount ?? 0).toFixed(2)}`)
              .join('\n');
            const head = `Invoice ${inv.number} for ${data.customer_name || 'your customer'}, total £${inv.total.toFixed(2)}.`;

            // 🔴 NOTHING GOES TO HIS CUSTOMER UNTIL HE HAS SEEN THE FIGURES AND SAID SO.
            //
            // This used to email the customer in the same turn it parsed his text, so the first
            // time the man saw what the AI had read was AFTER his customer already had it. Giving
            // an address is consent to a send; it is not approval of THESE figures. A misread
            // amount reached a third party with no chance to catch it, and an invoice cannot be
            // unsent. The web surface has always refused to send for him and says why: a message
            // to another human being always asks. This is the same rule on the surface people
            // actually use. The gate comes before the automation it guards.
            if (looksLikeEmail(data.customer_contact) && hasEmailConfig()) {
              await setSession(from, 'invoice', 'confirm', {
                ...data,
                invoice_id: inv.id,
                invoice_number: inv.number,
                invoice_total: inv.total,
                invoice_link: link,
              });
              keep = true;
              reply = `${head}\n\n${lines}\n\nCheck those figures. Reply SEND and I will email it to ${data.customer_contact}, or reply CHANGE to write the work out again.\n\nEither way it is saved in your app as a draft: ${link}`;
            } else {
              reply = `${head}\n\n${lines}\n\nSend it to them: ${link}\n\nIt is saved in your app as a draft. Mark it paid when the money lands and it goes into your income.`;
            }
          }
        }
      }
    }

    if (!stay && !keep) await clearSession(from);
    await sendText(from, reply);
    return true;
  }

  // His approval, or his correction. Nothing reached his customer before this step, and one send
  // carries whichever answer he earned.
  if (session.step === 'confirm') {
    const said = body.trim().toLowerCase();
    const link = (data.invoice_link as string) || `${APP_URL}/app/invoices`;
    let reply = '';

    if (/^(change|redo|again|no|edit|wrong)\b/.test(said)) {
      await setSession(from, 'invoice', 'items', {
        customer_name: data.customer_name ?? null,
        customer_contact: data.customer_contact ?? null,
      });
      reply = 'No problem, nothing has been sent. Write the work and the amounts again, for example: bathroom rewire 450, materials 80.';
    } else if (!/^(send|yes|yep|yeah|ok|okay|go|do it|confirm|approve|approved)\b/.test(said)) {
      // Silence, a shrug or a thumbs up is not approval to write to another human being.
      reply = `Reply SEND to email it to ${data.customer_contact}, or CHANGE to write the work out again. Nothing has gone to them yet.`;
    } else {
      await clearSession(from);
      const sent = await sendInvoiceEmail({
        to: data.customer_contact as string,
        number: (data.invoice_number as string) || '',
        total: Number(data.invoice_total ?? 0),
        link,
        customerName: (data.customer_name as string) || undefined,
      });
      reply = sent
        ? `Sent to ${data.customer_contact}. Track it here: ${link}\n\nMark it paid when the money lands and it goes into your income.`
        : `I could not email that just now, and it has NOT gone to them. Send it yourself with this link: ${link}`;
    }

    await sendText(from, reply);
    return true;
  }

  // Unknown state, reset cleanly.
  await clearSession(from);
  return false;
}

// --- Guided "file your own tax return" walkthrough ------------------------
// Triggered by "tax return", "self assessment", and similar. We send the steps
// one message at a time, waiting for NEXT, personalised by the user's trade.
// Static content only, so it works even before the AI is switched on. It never
// submits anything, it points the user to the official HMRC service.
const TAXGUIDE_NEXT = /^\s*(next|continue|go|carry on|yes|yep|ok(?:ay)?|y)\s*$/i;
const TAXGUIDE_STOP = /^\s*(stop|quit|done|exit|cancel|end|finish)\s*$/i;
const TAXGUIDE_SKIP = /^\s*skip\s*$/i;

async function handleTaxGuideFlow(from: string, body: string): Promise<boolean> {
  const session = await getSession(from);
  const inFlow = session?.flow === 'taxguide';
  // Do not fire on a money entry that happens to mention tax.
  const isTrigger = TAXGUIDE_TRIGGER.test(body) && !/£/.test(body);

  if (!inFlow && !isTrigger) return false;

  // 🔴 A QUESTION IS NOT A REQUEST TO BE WALKED THROUGH. "When is my tax return due?" mentions
  // "tax return", so the trigger fires, but the person wants an ANSWER, not a seven step guide. If
  // we are not already in the flow and this is a deadline question, do not start the walkthrough:
  // return false so the deadline handler downstream answers it. (Live on 21 Jul a deadline question
  // started the guide, whose state then swallowed every following question until the user found STOP.)
  if (!inFlow && isDeadlineQuestion(body)) return false;

  // Finish on request.
  if (inFlow && TAXGUIDE_STOP.test(body)) {
    await clearSession(from);
    await sendText(from, 'No problem. Text "tax return" whenever you want to run through it again. 👍');
    return true;
  }

  // Start or restart.
  if (!inFlow) {
    await setSession(from, 'taxguide', 'await_trade', {});
    await sendText(
      from,
      [
        'Happy to walk you through your tax return, one step at a time. It is more straightforward than it looks.',
        '',
        'First, what is your trade? Reply with it, for example "electrician" or "plumber", and I will show what you can claim. Or reply SKIP.',
      ].join('\n'),
    );
    return true;
  }

  const data = (session?.data ?? {}) as { idx?: number; trade?: TradeInfo | null };

  // Waiting for their trade.
  if (session?.step === 'await_trade') {
    // If they asked a question instead of naming a trade, they have changed their mind. Step out and
    // let it be answered, rather than filing "when is my return due?" as their trade.
    if (!TAXGUIDE_SKIP.test(body) && (isDeadlineQuestion(body) || isQuestion(body))) {
      await clearSession(from);
      return false;
    }
    const trade = TAXGUIDE_SKIP.test(body) ? null : matchTrade(body);
    await setSession(from, 'taxguide', 'walk', { idx: 0, trade });
    await sendText(from, trade ? `Great, ${trade.name}. Here we go.` : 'No problem, here we go.');
    await sendText(from, cardText(0, trade));
    return true;
  }

  // Walking through the cards.
  if (session?.step === 'walk') {
    if (!TAXGUIDE_NEXT.test(body)) {
      // 🔴 NEVER TRAP THEM. If they did not say NEXT, they have moved on to a real question. Step out
      // of the walkthrough and let the message route normally, instead of swallowing every question
      // with "Reply NEXT or STOP" until they stumble on the word STOP. (STOP is handled above.)
      await clearSession(from);
      return false;
    }
    const nextIdx = (data.idx ?? 0) + 1;
    const last = totalCards() - 1;
    if (nextIdx >= totalCards()) {
      await clearSession(from);
      await sendText(from, 'That is the lot. Text "tax return" any time to run through it again. 👍');
      return true;
    }
    // The closing card ends the flow.
    if (nextIdx === last) {
      await clearSession(from);
      await sendText(from, cardText(nextIdx, data.trade ?? null));
      return true;
    }
    await setSession(from, 'taxguide', 'walk', { idx: nextIdx, trade: data.trade ?? null });
    await sendText(from, cardText(nextIdx, data.trade ?? null));
    return true;
  }

  // Unknown state, reset cleanly.
  await clearSession(from);
  return false;
}

// --- Shapes of the bits of the webhook payload we read. -------------------
interface IncomingMessage {
  from: string;
  id: string;
  type: string;
  image?: { id: string };
  audio?: { id: string };
  text?: { body: string };
  interactive?: { type?: string; button_reply?: { id: string; title: string } };
}

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: IncomingMessage[];
      };
    }>;
  }>;
}

function firstMessage(body: WebhookBody): IncomingMessage | null {
  return body.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? null;
}

// The duplicate hunting that stood here (findReceiptDuplicate, the bank-line pass) moved into
// lib/receiptingest.ts on 5 August 2026, where the web capture route and the chat composer run
// the SAME two passes: fold into the bank line, refuse the same receipt twice. One walk, three
// doors, and none of them can drift on its own.
