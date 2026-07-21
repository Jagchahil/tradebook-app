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
  parseReceipt,
  parseSpokenTransaction,
  draftInvoice,
  answerMoneyQuestion,
  answerExpenseQuestion,
  parseSchedule,
  hasClaudeConfig,
  draftSupportReply,
} from '../../../lib/claude';
import { checkExpense, VERDICT_ICON, TAX_TIPS } from '../../../lib/taxrules';
import { ledger, headline } from '../../../lib/ledger';
import { createVoiceJob } from '../../../lib/voicejobs';
import { confirmationLine } from '../../../lib/voiceflow';
import { sendInvoiceEmail, hasEmailConfig, looksLikeEmail } from '../../../lib/email';
import { hasBankFeedConfig } from '../../../lib/bankfeed';
import { findDuplicate } from '../../../lib/dedupe';
import { normaliseVendor } from '../../../lib/memory';
import {
  busyMessage,
  receiptMilestoneNudge,
  NUDGE_AFTER_RECEIPTS,
  type AiBlockReason,
} from '../../../lib/banknudge';
import { CIRCUMSTANCES, unanswered, buttonId, parseButtonId } from '../../../lib/circumstances';
import {
  readCircumstances,
  saveCircumstance,
  findUserIdByPhone,
  listBankConnectionsForUser,
  recentUnconfirmedForMatch,
  mergeIntoTransaction,
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
  getBusinessProfile,
  getOrCreateReferralCode,
  getRelevantKnowledge,
  getOptimiserInput,
} from '../../../lib/supabase';
import { isReferRequest, referralInvite } from '../../../lib/referral';
import {
  parseMoneyEntryRegex,
  poundAmounts,
  moneyAmounts,
  entryDate,
  clampReceiptDate,
  isThanks,
  matchAck,
  matchStopStart,
  isDeleteLast,
  matchEditLast,
  isPricing,
  isIdentity,
  isDeadlineQuestion,
  deadlineAnswer,
  matchTotalsQuestion,
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
import { openTicket } from '../../../lib/support';
import { matchKb } from '../../../lib/supportkb';
import { soleTraderTax } from '../../../lib/taxengine';
import { corporationTax } from '../../../lib/ltdengine';
import { aprilDelta } from '../../../lib/propertyengine';
import { niPosition, studentLoanRepayment, studentLoanForSA, STUDENT_PLANS, type StudentPlan } from '../../../lib/nistudentloan';
import { TAXGUIDE_TRIGGER, matchTrade, cardText, totalCards } from '../../../lib/taxguide';
import type { TradeInfo } from '../../../lib/taxguide';
import { rateLimitedShared } from '../../../lib/ratelimit';
import { decideSpend } from '../../../lib/aicost';
import { aiCapsFor } from '../../../lib/margin';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';

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
async function processMessage(message: IncomingMessage): Promise<void> {
  const from = message.from;
  const messageId = message.id;
  try {
    // Durable daily cap first. Over the cap we stop replying entirely, so a
    // runaway sender cannot generate a reply storm across instances.
    if (await messageCapExceeded(from)) return;

    if (message.type === 'image' && message.image?.id) {
      await handleReceiptImage(from, messageId, message.image.id);
    } else if (message.type === 'audio' && message.audio?.id) {
      await handleVoiceNote(from, messageId, message.audio.id);
    } else if (message.type === 'interactive' && message.interactive?.button_reply?.id) {
      await handleButtonReply(from, message.interactive.button_reply.id);
    } else if (message.type === 'text' && message.text?.body) {
      const text = message.text.body;
      // "invoice this" turns the last logged sale into a draft invoice. Checked
      // before the multi step invoice flow, which also begins with the word invoice.
      if (isInvoiceThis(text)) {
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
          } else if (isPricing(text)) {
            await handlePricing(from);
          } else if (isDeadlineQuestion(text)) {
            await sendText(from, deadlineAnswer());
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
    // Already acknowledged to Meta. Log and stop; never rethrow.
    const messageText = err instanceof Error ? err.message : 'unknown error';
    console.error('[whatsapp] Handler error:', messageText);
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
      'Easy one. Snap a photo of any receipt, crumpled is fine, and send it right here. I read the shop, the total and the VAT, and it lands in your app to approve. Go on, try one now.',
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

async function replyNotLinked(from: string): Promise<void> {
  await sendText(
    from,
    [
      'Hi, I am Lekhio. I do your books and tax, right here on WhatsApp. Snap a receipt, log your mileage, ask about your money, all by text.',
      '',
      `I do not have an account for this number yet. Get set up in two minutes at ${APP_URL.replace('https://', '')}, first month free, then text me again.`,
    ].join('\n'),
  );
}

async function handleReceiptImage(from: string, messageId: string, mediaId: string): Promise<void> {
  // Find the Lekhio account for this number first. No point parsing if there
  // is nobody to attach it to.
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }

  if (!hasClaudeConfig()) {
    await sendText(from, 'Receipt reading is not switched on yet. Hang tight, it is coming very soon.');
    return;
  }

  const media = await downloadMedia(mediaId);
  if (!media) {
    await sendText(from, 'I could not open that image. Try sending the photo again.');
    return;
  }

  const refused = await aiBudgetBlocked(from);
  if (refused) {
    await sendBudgetRefusal(from, refused);
    return;
  }
  const parsed = await parseReceipt(media.base64, media.mediaType);
  if (!parsed) {
    await sendText(from, 'I could not read that receipt. Try a clearer photo with the total showing.');
    return;
  }

  const receiptDate = clampReceiptDate(parsed.transaction_date);

  // IS THIS THE CARD PAYMENT WE ALREADY HAVE?
  //
  // The bank feed usually lands a purchase the SAME DAY. The photo of the receipt
  // turns up that evening. That is one purchase, and before this it became two
  // entries: costs inflated, profit understated, tax wrong.
  //
  // So before writing anything, look for the bank line this receipt belongs to. If
  // we find it, fold the receipt INTO it rather than adding a second row. The bank
  // keeps the amount and the date, because those are facts rather than a reading of
  // a photograph. The receipt gives the shop name, the category and the image.
  //
  // Never fatal: if the lookup fails we simply insert as before, and the duplicate
  // rule in Things to check remains as the safety net.
  const dup = await findReceiptDuplicate(userId, {
    vendor: parsed.merchant_name,
    amount: -Math.abs(parsed.amount),
    transaction_date: receiptDate,
  });

  if (dup) {
    await mergeIntoTransaction(userId, dup.id, {
      vendor: parsed.merchant_name,
      category: parsed.category,
      raw_whatsapp_message_id: messageId,
    });
    await sendText(
      from,
      `Got it. That is the same £${parsed.amount.toFixed(2)} ${parsed.merchant_name} payment your bank already sent me, so I have put the receipt with it rather than counting it twice. Filed under ${parsed.category}.`,
    );
    return;
  }

  await insertTransaction({
    user_id: userId,
    vendor: parsed.merchant_name,
    // Receipts are an expense, so we store the amount as a negative number.
    // The app reads income vs expense from this sign.
    amount: -Math.abs(parsed.amount),
    category: parsed.category,
    // The date printed on the receipt, clamped to a sane range, so a back-dated
    // receipt lands in the right tax quarter. Falls back to today.
    transaction_date: receiptDate,
    source_type: 'whatsapp_image',
    // Captured but not yet confirmed by the user. They approve before it counts
    // toward anything sent to HMRC.
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });

  const amountText = `£${parsed.amount.toFixed(2)}`;
  const confirmation = `Logged. ${parsed.merchant_name} for ${amountText}. Filed under ${parsed.category}. It is in your Lekhio.`;

  // Once a day, and only for someone clearly doing this the hard way, offer the
  // easy way. receiptMilestoneNudge fires on exactly the nth receipt, so it cannot
  // become nagging however many they send. Appended to the confirmation rather
  // than sent separately: an extra WhatsApp message would cost us real money (see
  // lib/margin.ts) to say something we can say for free right here.
  const nudge = await bankNudgeAfterReceipt(from, userId);
  await sendText(from, nudge ? `${confirmation}\n\n${nudge}` : confirmation);
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
async function handleVoiceNote(from: string, messageId: string, mediaId: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await replyNotLinked(from);
    return;
  }

  // Parsing the spoken amount still needs Claude; if that is off, voice cannot work, so say so plainly.
  if (!hasClaudeConfig()) {
    await sendText(from, 'Voice notes are not switched on yet. Send a photo of the receipt for now.');
    return;
  }

  const media = await downloadMedia(mediaId);
  if (!media) {
    await sendText(from, 'I could not open that voice note. Try sending it again.');
    return;
  }

  const refused = await aiBudgetBlocked(from);
  if (refused) {
    await sendBudgetRefusal(from, refused);
    return;
  }

  const jobId = await createVoiceJob({
    userId,
    fromPhone: from,
    messageId,
    audioBase64: media.base64,
    mimeType: media.mediaType,
  });
  if (!jobId) {
    await sendText(from, 'I could not take that voice note just now. Try again, or send a photo of the receipt.');
    return;
  }

  await sendText(from, 'Got your voice note — writing it up now, one sec.');
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
// window. Nothing is ever sent on its own — Jag approves every reply. Only linked customers open a
// ticket; an unknown number is pointed to the team instead, so the desk never fills with strangers.
async function handleSupportRequest(from: string, text: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(
      from,
      'For a hand from the team, email support@lekhio.app and a person will help. If you are not set up yet, you can start at lekhio.app.',
    );
    return;
  }

  const reason = supportReason(text);

  // Pre-draft a warm reply for Jag to edit, grounded in his own playbook (the common-issue notes he
  // keeps in Obsidian) when a known issue matches. Best effort: if AI is off or the call fails, the
  // draft is empty and Jag writes from scratch — the customer's own message is right there in the console.
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
    "Thanks — I've passed this straight to a real person on the Lekhio team, and they'll reply right here shortly. Feel free to add anything else in the meantime and I'll pass it on.",
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
      'Lekhio is £12.99 a month or £129 a year, everything in, and your first 14 days are free.',
      '',
      `That covers receipt capture, bookkeeping, invoicing, CIS, mileage, and your quarterly tax prep. Get started at ${APP_URL.replace('https://', '')}.`,
    ].join('\n'),
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
  // 🔴 THE ANSWER BRANCHES ON BUSINESS STRUCTURE. A sole trader, a partner and a company director on
  // the same profit owe three different amounts, and giving all three the sole-trader number was the
  // gap Jag caught. getBusinessProfile defaults to sole_trader, so an account that never set a
  // structure is unchanged.
  const profile = await getBusinessProfile(userId).catch(() => null);

  // A LIMITED COMPANY is a different calculation entirely: the COMPANY pays corporation tax on its
  // profit, and the director's personal tax depends on how they extract it. We give the company's
  // liability plainly and point to the Pay Yourself engine for the extraction, rather than pretending
  // it is a sole trader and quoting a wrong number.
  if (profile?.businessType === 'limited_company') {
    const ct = corporationTax(Math.max(0, profit));
    await sendText(
      from,
      `As a limited company, on ${formatGbp(profit)} profit so far this tax year the corporation tax is about ${formatGbp(ct)}. That is the company's bill. What YOU pay depends on how you take the money out, salary and dividends, and there is a split that keeps the most. Reply "pay yourself" and I will show you the numbers. A rough guide from your logged entries, not a final figure.`,
    );
    return;
  }

  // A PARTNER is taxed on their SHARE of the profit, not the whole thing.
  const share = profile?.businessType === 'partnership' ? profile.partnershipShare / 100 : 1;
  const taxableProfit = Math.max(0, profit * share);
  const shareNote = share < 1 ? ` (your ${Math.round(share * 100)}% share of the ${formatGbp(profit)} partnership profit)` : '';

  // Tax estimate for the year to date. Includes to-review entries, says so, and
  // credits CIS already deducted. A guide, not a bill. Once a student loan plan
  // is stored, the loan folds in automatically so the number is the whole
  // January picture, not a surprise minus one line.
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
  await sendText(
    from,
    `On ${formatGbp(taxableProfit)} profit so far this tax year${shareNote}, the rough bill is ${formatGbp(totalDue)} (income tax plus National Insurance${slLine}).${cisLine} A rough guide from your logged entries, including ones you have not confirmed yet, not a final figure.`,
  );
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
  const settings = await getStudentLoanSettings(userId);
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
  const rows = await readCircumstances(userId);
  if (rows === null) return false;

  // The ANSWERS, not the keys. A follow-up is held back until its premise holds: we do not ask a
  // single man what his wife earns.
  const next = unanswered(rows)[0];
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
  if (/\b(motorbike|motorcycle|moped|scooter)\b/i.test(body)) return { pence: 24, vehicle: 'motorcycle' };
  if (/\b(bicycle|pushbike|push bike|cycling|on (?:the|my) bike|by bike|on (?:the|my) cycle)\b/i.test(body)) return { pence: 20, vehicle: 'bicycle' };
  return { pence: 55, vehicle: 'car or van' };
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
  else { deduction = Math.round(gross * 0.2 * 100) / 100; assumed = true; }
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
// "worked 90 hours from home" logs the HMRC flat rate for the month.
// 25 to 50 hours = £10, 51 to 100 = £18, 101+ = £26.
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
  const hm = body.match(/(\d{1,4})\s*(?:hours?|hrs?)\b/i);
  const hours = hm ? parseInt(hm[1], 10) : null;
  if (hours === null) {
    await sendText(from, 'How many hours did you work from home this month? For example "worked 90 hours from home".');
    return;
  }
  let rate = 0;
  if (hours >= 101) rate = 26;
  else if (hours >= 51) rate = 18;
  else if (hours >= 25) rate = 10;
  else {
    await sendText(from, 'The flat rate starts at 25 hours a month. Below that, claim a fair share of your actual home costs instead.');
    return;
  }
  await insertTransaction({
    user_id: userId,
    vendor: 'Use of home',
    amount: -rate,
    category: 'use of home',
    transaction_date: entryDate(body),
    source_type: 'whatsapp_homeoffice',
    description: body.slice(0, 280),
    confirmed: false,
    raw_whatsapp_message_id: messageId,
  });
  await sendText(from, `Logged. ${hours} hours from home, that is the £${rate} HMRC flat rate for the month. One claim a month. Check it in the app and confirm.`);
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

async function handleSchedule(from: string, body: string): Promise<void> {
  const userId = await findUserIdByPhone(from);
  if (!userId) {
    await sendText(from, 'Open the app and add your number first, then I can keep your diary.');
    return;
  }
  if (!hasClaudeConfig()) {
    await sendText(from, 'Reminders are not switched on yet. Hang tight, they are coming very soon.');
    return;
  }
  const refused = await aiBudgetBlocked(from);
  if (refused) {
    await sendBudgetRefusal(from, refused);
    return;
  }
  const parsed = await parseSchedule(body, new Date().toISOString());
  if (!parsed) {
    await sendText(from, 'I could not work out a time for that. Try, for example, "remind me to price up Dave\'s job tomorrow at 8am".');
    return;
  }
  await createEvent(userId, { title: parsed.title, kind: parsed.kind, starts_at: parsed.starts_at, remind_at: parsed.remind_at });
  const when = parsed.remind_at ? formatWhen(parsed.remind_at) : 'when it is due';
  await sendText(from, `Got it. "${parsed.title}". I will remind you ${when}. 👍`);
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
  const l = ledger({
    monthsElapsed: input.monthsElapsed,
    grossIncome: input.ytdTradeIncome,
    expenses: input.ytdTradeExpenses,
    // Honest zeros. They UNDERSTATE what we saved him. They never overstate it. See app/api/ledger.
    mileage: 0, homeOffice: 0, capitalAllowances: 0, pension: 0,
    cisSuffered: input.ytdCisSuffered,
  });

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
  return `\n\nWant me to track all this for you? Get set up in two minutes at ${APP_URL.replace('https://', '')}, first month free.`;
}

async function handleExpenseCheck(from: string, body: string): Promise<void> {
  // One lookup, reused below. Whether we have an account for this number decides
  // both the signup nudge and whether the paid AI fallback is allowed.
  const linked = await findUserIdByPhone(from);
  const tail = linked
    ? ''
    : `\n\nWant me to track all this for you? Get set up in two minutes at ${APP_URL.replace('https://', '')}, first month free.`;

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

  const data = (session.data ?? {}) as { customer_name?: string; customer_contact?: string | null };

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
    if (!hasClaudeConfig()) {
      await clearSession(from);
      await sendText(from, 'Invoice building is not switched on yet. Hang tight.');
      return true;
    }
    const refused = await aiBudgetBlocked(from);
    if (refused) {
      await sendBudgetRefusal(from, refused);
      return true;
    }
    const drafted = await draftInvoice(body);
    if (!drafted || drafted.line_items.length === 0) {
      await sendText(from, "I could not pick out the amounts. Try like: 'bathroom rewire 450, materials 80'.");
      return true; // stay on this step
    }
    const inv = await createInvoice(userId, {
      customer_name: data.customer_name || 'Customer',
      customer_contact: data.customer_contact ?? null,
      line_items: drafted.line_items,
    });
    await clearSession(from);
    if (!inv) {
      await sendText(from, 'Something went wrong saving that. Please try again.');
      return true;
    }
    const link = `${APP_URL}/invoice/${inv.id}`;
    let emailedTo: string | null = null;
    if (looksLikeEmail(data.customer_contact) && hasEmailConfig()) {
      const sent = await sendInvoiceEmail({
        to: data.customer_contact as string,
        number: inv.number,
        total: inv.total,
        link,
        customerName: data.customer_name,
      });
      if (sent) emailedTo = data.customer_contact as string;
    }
    const head = `Done. Invoice ${inv.number} for ${data.customer_name || 'your customer'}, total £${inv.total.toFixed(2)}.`;
    const deliver = emailedTo
      ? `I have emailed it straight to ${emailedTo}. Track it here: ${link}`
      : `Send it to them: ${link}`;
    await sendText(
      from,
      `${head}\n\n${deliver}\n\nIt is saved in your app as a draft. Mark it paid when the money lands and it goes into your income.`,
    );
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
    const trade = TAXGUIDE_SKIP.test(body) ? null : matchTrade(body);
    await setSession(from, 'taxguide', 'walk', { idx: 0, trade });
    await sendText(from, trade ? `Great, ${trade.name}. Here we go.` : 'No problem, here we go.');
    await sendText(from, cardText(0, trade));
    return true;
  }

  // Walking through the cards.
  if (session?.step === 'walk') {
    if (!TAXGUIDE_NEXT.test(body)) {
      await sendText(from, 'Reply NEXT for the next step, or STOP to finish.');
      return true;
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

// The bank line this receipt is a duplicate of, if there is one.
//
// Only a CONFIDENT match merges automatically: same shop, same money, within a few
// days. A 'maybe' (same money and time but an unreadable shop) is deliberately NOT
// merged here, because merging two genuinely different purchases would quietly
// delete one of the user's costs and RAISE his tax bill, and he would never know we
// had done it. Those surface in Things to check instead, for him to judge.
//
// Never throws: a failed lookup must not cost someone their receipt.
async function findReceiptDuplicate(
  userId: string,
  receipt: { vendor: string; amount: number; transaction_date: string },
): Promise<{ id: string } | null> {
  try {
    const since = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
    const recent = await recentUnconfirmedForMatch(userId, since);
    // Only ever fold a receipt into a BANK line. Two photographs of the same receipt
    // are a different problem, and the duplicate rule already catches those.
    const bankRows = recent.filter((r) => r.source_type === 'bank_feed');
    const hit = findDuplicate(receipt, bankRows, normaliseVendor);
    return hit && hit.strength === 'same' ? { id: String(hit.match.id) } : null;
  } catch {
    return null;
  }
}
