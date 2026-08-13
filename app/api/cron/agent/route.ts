// The Agentic Accountant's nightly walk (doc 84, Phase C).
//
// A resumable keyset hop chain over all users, cloned from the hardened
// cron/reminders skeleton: CRON_SECRET guard with a constant time compare, a
// 40 second budget per invocation, a strictly increasing cursor, a hop cap so
// a loop is impossible. Per user it fetches aggregates in one RPC, runs the
// pure signal engine, and inserts with structural dedupe (the unique index and
// ignore-duplicates), so re running the walk is always safe.
//
// WhatsApp delivery is gated on AGENT_TEMPLATES_APPROVED=true (the Meta
// utility templates must be approved first), on the user's agent_pings
// preference, and on the noise caps in lib/agent.ts. Until the flag is set the
// walk is insert only: cards land in the app, nothing is sent.
//
// There is deliberately NO new vercel.json cron entry. The Hobby plan's cron
// cap once silently blocked every deploy (doc 81 playbook), so the daily due
// job kicks this chain off with one fire and forget request instead.

import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'node:crypto';
import { sendTemplate, hasSendConfig } from '../../../../lib/whatsapp';
import {
  listAgentUsersPage,
  agentAggregates,
  insertAgentSignals,
  agentPingsLast7Days,
  agentPingPref,
  agentPushPref,
  markAgentSignalDelivered,
  logAgentDelivery,
  getActiveGoals,
  listOverdueInvoices,
  cronStarted,
  cronFinished,
  recordRakhaRun,
  getBusinessProfile,
  getStudentLoanSettings,
  refreshFactsFromDb,
  readCircumstances,
  selfAssessmentBillFor,
} from '../../../../lib/supabase';
import { sendExpoPush, isExpoPushToken } from '../../../../lib/push';
import { T_AGENT_THRESHOLD, T_AGENT_DEADLINE, T_AGENT_OPPORTUNITY } from '../../../../lib/watemplates';
import { templateLegBlock, typeForTemplate } from '../../../../lib/routing';
import { computeSignalsForStructure, applyPingCaps, type AgentInput, type AgentSignal } from '../../../../lib/agent';
import { mtdStatedFrom } from '../../../../lib/circumstances';

export const runtime = 'nodejs';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lekhio.app';
const BUDGET_MS = 40_000;
const PAGE_SIZE = 200; // one RPC per user, so smaller pages than the send jobs
const MAX_HOPS = 100;
const CONCURRENCY = 10;

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Which approved Meta template carries each ping. One variable ({{1}}), the
// signal's waText. Doc 84 section 6.
const TEMPLATE_FOR: Record<string, string> = {
  vat_approach: T_AGENT_THRESHOLD,
  mtd_mandation: T_AGENT_THRESHOLD,
  mtd_combined_trap: T_AGENT_THRESHOLD,
  pa_taper: T_AGENT_THRESHOLD,
  class2_pension_year: T_AGENT_DEADLINE,
  poa_cliff: T_AGENT_DEADLINE,
  quarter_unconfirmed: T_AGENT_DEADLINE,
  invoice_chase: T_AGENT_DEADLINE,
  aia_timing: T_AGENT_OPPORTUNITY,
};

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch (err) {
        // One user erroring must never stop the walk.
        console.error('[cron] agent user error:', err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function triggerContinuation(afterId: string, hop: number): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  try {
    await fetch(`${APP_URL}/api/cron/agent?after=${encodeURIComponent(afterId)}&hop=${hop}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch (err) {
    console.error('[cron] agent continuation trigger failed:', err instanceof Error ? err.message : err);
  }
}

async function processUser(user: {
  id: string;
  phone_number: string | null;
  student_loan_plan: 'plan1' | 'plan2' | 'plan4' | 'plan5' | null;
  student_loan_postgrad: boolean;
  employment_income: number;
  expo_push_token: string | null;
}): Promise<{ inserted: number; pinged: number }> {
  const agg = await agentAggregates(user.id);
  if (!agg) return { inserted: 0, pinged: 0 };
  // A user with no data produces no signals; skip the engine's edge cases early.
  if (agg.months.length === 0 && agg.unconfirmed === 0) return { inserted: 0, pinged: 0 };

  const [goals, overdue, profile, income, circs, bill] = await Promise.all([
    getActiveGoals(user.id),
    listOverdueInvoices(user.id),
    getBusinessProfile(user.id),
    getStudentLoanSettings(user.id),
    readCircumstances(user.id),
    // 🔴 R2-F23. THE BILL, FROM THE ENGINE THE TAX PAGE USES, NOT FROM THE AGENT'S OWN ARITHMETIC.
    // getOptimiserInput + selfAssessmentBill is the same pair /app/tax calls to draw its headline,
    // so the phone and the page cannot say different numbers. A failure here is null, and null
    // withholds the signal from anyone with rent rather than guessing. See AgentInput.
    selfAssessmentBillFor(user.id),
  ]);
  const input: AgentInput = {
    today: new Date(),
    months: agg.months,
    week: agg.week,
    property: agg.property,
    invoices: overdue.map((i) => ({ ...i, link: `${APP_URL}/invoice/${i.id}` })),
    categories: agg.categories,
    unconfirmedCount: agg.unconfirmed,
    equipmentSpendYtd: agg.equipment,
    studentLoanPlan: user.student_loan_plan,
    studentLoanPostgrad: user.student_loan_postgrad,
    employmentIncome: user.employment_income,
    goals: goals.map((g) => ({ id: g.id, kind: g.kind, title: g.title, amount: g.amount, targetDate: g.target_date })),
    // Structure-aware Rakha (19 Jul, partner share routed 30 Jul): a limited company owner gets the
    // money-moves brain, not the sole-trader signals that would read its profit as personal income;
    // a partner gets the engine on their share of the shared books (users.partnership_share, the
    // same field the optimiser scales by). Sole traders are unaffected (computeSignalsForStructure
    // returns the existing engine for them, byte for byte).
    businessType: profile?.businessType ?? 'sole_trader',
    dividendIncome: income?.dividendIncome ?? 0,
    savingsIncome: income?.savingsIncome ?? 0,
    partnershipShare: profile?.partnershipShare ?? 100,
    // 🔴 AND WHETHER HE TRADES AT ALL, which businessType cannot say. Wave nine, 31 July 2026.
    //
    // A landlord signing up through the Landlord chip is mapped to 'sole_trader', so he passed the
    // structure branch above and was being pushed voluntary Class 2 at a few pounds a week. HMRC's
    // NIM74250: a person whose activities in managing property are those generally associated with
    // being a landlord does not meet the definition of gainful employment for self employed NICs,
    // so there are no relevant profits and no Class 2 to buy the year with. His route is Class 3,
    // at several times the cost. Null is unknown, and unknown is sent everything, as before.
    incomeShape: profile?.incomeShape ?? null,
    // 🔴 AND WHETHER HE IS ALREADY VAT REGISTERED, read from the circumstances log, which is the
    // one place that fact lives. Without it the VAT threshold signal fired on turnover alone and
    // pushed a paid WhatsApp message telling a man who registered years ago that he has 30 days to
    // register. An unreadable answer is FALSE, not true: silencing the warning for a man heading
    // past the threshold is the expensive direction, and it has a date on it.
    vatRegistered: (circs ?? []).some((c) => c.key === 'vat_registered' && c.answer === 'yes'),
    // 🔴 AND WHETHER HMRC HAS WRITTEN TO HIM ABOUT MAKING TAX DIGITAL, from the same log, because
    // the agent cannot work this one out. HMRC decides mandation from a return already filed
    // (2024/25 for April 2026) and writes to the people it has assessed, while this engine sees
    // only this year's money. mtdStatedFrom() maps a skip, a missing key and a failed read all to
    // null, which means "not asked yet" and never "no". See mtdPosition() in lib/taxengine.ts.
    mtdStated: mtdStatedFrom(Object.fromEntries((circs ?? []).map((c) => [c.key, c.answer]))),
    // 🔴 R2-F23. One engine, one bill. See AgentInput.selfAssessmentBill.
    selfAssessmentBill: bill,
  };
  let signals = computeSignalsForStructure(input);
  if (signals.length === 0) return { inserted: 0, pinged: 0 };

  // The noise caps demote surplus pings to cards BEFORE insert, so the stored
  // priority reflects what actually happened.
  const recentPings = signals.some((s) => s.priority === 'ping') ? await agentPingsLast7Days(user.id) : 0;
  signals = applyPingCaps(signals, recentPings);

  const bySignal = new Map<string, AgentSignal>(signals.map((s) => [s.signalKey, s]));
  const inserted = await insertAgentSignals(
    signals.map((s) => ({
      user_id: user.id,
      signal_key: s.signalKey,
      period_key: s.periodKey,
      // Rendered copy travels in the payload: one renderer, nothing to drift.
      payload: { title: s.title, body: s.body, waText: s.waText, numbers: s.numbers, action: s.action ?? null },
      priority: s.priority,
    })),
  );

  let pinged = 0;
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 TWO FAULTS FIXED HERE ON 10 AUGUST 2026, AND THE SECOND ONE IS A COST HOLE.
  //
  // This line read `process.env.AGENT_TEMPLATES_APPROVED === 'true' && hasSendConfig()`.
  //
  //   1. IT READ THE ENV VAR DIRECTLY, going round lib/watemplates.ts, which is the one place that
  //      knows which switch belongs to which template. The reminder engine did the same thing and
  //      it is what let a gate go stale for two weeks while a customer waited for a text. A hand
  //      copied gate is a gate that stops being true the day a template moves.
  //
  //   2. 🔴 IT DID NOT RESPECT WHATSAPP_SENDS_ENABLED. Every other proactive sender in this
  //      codebase checks the cost kill switch. This one never did, so pulling the emergency brake
  //      stopped the reminders and the digest and left Rakha's paid pings going out. A brake that
  //      stops most of the wheels is not a brake, and nobody would have found that out until the
  //      day it was pulled in anger.
  //
  // templateLegBlock asks both questions, per template, off the routing table.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const newPings = inserted.filter((r) => r.priority === 'ping');
  if (hasSendConfig() && newPings.length > 0 && user.phone_number) {
    if (await agentPingPref(user.id)) {
      for (const row of newPings) {
        const s = bySignal.get(row.signal_key);
        const template = TEMPLATE_FOR[row.signal_key];
        if (!s || !template) continue;
        // Asked per row rather than once, because the three agent templates are three separate
        // routing rows and nothing guarantees for ever that they share one switch.
        const type = typeForTemplate(template);
        const block = type ? templateLegBlock(type) : `${template} is not in the routing table`;
        if (block) {
          // ⚠️ NOT MARKED DELIVERED. A ping we did not send is still owed, exactly like a due
          // reminder that could not go out, and it goes on the first run after the gate opens.
          console.log(`[cron] agent ping held: ${block}`);
          continue;
        }
        await sendTemplate(user.phone_number, template, 'en_GB', [s.waText]);
        await markAgentSignalDelivered(row.id);
        await logAgentDelivery(user.id, row.signal_key);
        pinged++;
      }
    }
  }

  // Lock screen delivery (doc 82 s5c): ping priority only, the same caps
  // already applied above, no template gate (push has no Meta approval step).
  // Dormant until the EAS rebuild registers tokens: no token, no send.
  if (newPings.length > 0 && isExpoPushToken(user.expo_push_token)) {
    if (await agentPushPref(user.id)) {
      for (const row of newPings) {
        const s = bySignal.get(row.signal_key);
        if (!s) continue;
        await sendExpoPush(user.expo_push_token, s.title, s.waText);
      }
    }
  }
  return { inserted: inserted.length, pinged };
}

// The resumable walk. Terminates on the final short page or the hop cap,
// whichever comes first, exactly like the bank feed chain.
async function agentFanOut(startAfter: string | null, hop: number): Promise<void> {
  // THE WATCHDOG. This was the ONE walk nobody was watching.
  //
  // digest and reminders both record when they start and finish, so /api/health goes red if
  // either goes quiet. The agent did not, which meant it could die mid-walk and every user past
  // the cursor would silently stop getting signals, while the dashboard stayed green and the
  // endpoint kept answering 200. That is the exact failure the watchdog exists to catch, and it
  // was uncovered on the only cron that had no cover.
  if (startAfter === null) await cronStarted('agent');
  const started = Date.now();
  let cursor = startAfter;
  let users = 0;
  let inserted = 0;
  let pinged = 0;

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 RAKHA'S HEARTBEAT. THE COGNITIVE HALF, WHICH THE CRON WATCHDOG ABOVE CANNOT GIVE US.
  //
  // cronFinished('agent') proves the WALK ran. It does not prove Rakha THOUGHT. processUser()
  // returns early and writes NOTHING when it finds no signals, and agent_signals is the only table
  // Rakha touches, so:
  //
  //     a quiet week            -> zero rows
  //     a Rakha thinking about nobody -> zero rows
  //
  // Identical. If agentAggregates() silently began returning null for everyone (a renamed column, a
  // changed RLS policy), this walk would visit every user, find nothing, report cronFinished(ok),
  // and the health check would STAY GREEN. The job finished. Successfully. Having considered nobody.
  //
  // `considered` is the field that tells those two apart, exactly as khoji_runs.checked does.
  //
  // ⚠️ AND THE ROW IS WRITTEN IN A `finally`, ON PURPOSE.
  //
  // A heartbeat that is only written on the happy path is not a heartbeat, it is a congratulation.
  // A run that THREW must leave a loud row saying so, because a silent absence and a loud failure
  // look identical from the database if only success ever writes. That is the disease that killed
  // this brain for five days in July, and it is not being rebuilt here.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  let ok = true;

  try {
    for (;;) {
      const page = await listAgentUsersPage(cursor, PAGE_SIZE);
      if (page.users.length === 0) break;
      await mapLimit(page.users, CONCURRENCY, async (u) => {
        const r = await processUser(u);
        inserted += r.inserted;
        pinged += r.pinged;
      });
      users += page.users.length;
      if (!page.last) break; // short page: the walk is complete
      cursor = page.last;
      if (Date.now() - started > BUDGET_MS) {
        if (hop + 1 > MAX_HOPS) {
          console.error(`[cron] agent hop cap reached at hop=${hop}, stopping with cursor set`);
          // NOT ok. Everyone past the cursor got nothing, and somebody should hear about it.
          ok = false;
          await cronFinished('agent', false, hop, `hop cap reached at hop ${hop}, users after the cursor were not reached`);
          return;
        }
        console.log(`[cron] agent hop=${hop} users=${users} inserted=${inserted} pinged=${pinged} continuing after=${cursor}`);
        await triggerContinuation(cursor, hop + 1);
        return;
      }
    }
    console.log(`[cron] agent hop=${hop} users=${users} inserted=${inserted} pinged=${pinged} complete`);
    await cronFinished('agent', true, hop);
  } catch (err) {
    // A THROWN RUN IS NOT AN ABSENT RUN. Record it, loudly, then let it propagate exactly as before.
    ok = false;
    throw err;
  } finally {
    await recordRakhaRun({
      considered: users,
      signalled: inserted,
      sent: pinged,
      ok,
      durationMs: Date.now() - started,
    });
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const afterId = params.get('after');
  const hop = Math.max(1, parseInt(params.get('hop') ?? '1', 10) || 1);
  if (hop > MAX_HOPS) {
    return NextResponse.json({ error: 'Hop cap reached.' }, { status: 400 });
  }

  // Every user's signals below are computed on the latest approved facts.
  await refreshFactsFromDb();

  // Acknowledge immediately, work in after(), exactly like cron/reminders: no
  // invocation ever waits for another, so durations never chain across hops.
  after(() => agentFanOut(afterId, hop).catch((err) => console.error('[cron] agent error', err instanceof Error ? err.message : err)));
  return NextResponse.json({ ok: true, hop, scheduled: true });
}
