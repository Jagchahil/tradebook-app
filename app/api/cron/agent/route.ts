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
} from '../../../../lib/supabase';
import { sendExpoPush, isExpoPushToken } from '../../../../lib/push';
import { computeSignals, applyPingCaps, type AgentInput, type AgentSignal } from '../../../../lib/agent';

export const runtime = 'nodejs';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';
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
  vat_approach: 'agent_threshold_alert',
  mtd_mandation: 'agent_threshold_alert',
  mtd_combined_trap: 'agent_threshold_alert',
  pa_taper: 'agent_threshold_alert',
  class2_pension_year: 'agent_deadline_alert',
  poa_cliff: 'agent_deadline_alert',
  quarter_unconfirmed: 'agent_deadline_alert',
  aia_timing: 'agent_opportunity',
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

  const goals = await getActiveGoals(user.id);
  const input: AgentInput = {
    today: new Date(),
    months: agg.months,
    week: agg.week,
    property: agg.property,
    unconfirmedCount: agg.unconfirmed,
    equipmentSpendYtd: agg.equipment,
    studentLoanPlan: user.student_loan_plan,
    studentLoanPostgrad: user.student_loan_postgrad,
    employmentIncome: user.employment_income,
    goals: goals.map((g) => ({ id: g.id, kind: g.kind, title: g.title, amount: g.amount, targetDate: g.target_date })),
  };
  let signals = computeSignals(input);
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
      payload: { title: s.title, body: s.body, waText: s.waText, numbers: s.numbers },
      priority: s.priority,
    })),
  );

  let pinged = 0;
  const sendEnabled = process.env.AGENT_TEMPLATES_APPROVED === 'true' && hasSendConfig();
  const newPings = inserted.filter((r) => r.priority === 'ping');
  if (sendEnabled && newPings.length > 0 && user.phone_number) {
    if (await agentPingPref(user.id)) {
      for (const row of newPings) {
        const s = bySignal.get(row.signal_key);
        const template = TEMPLATE_FOR[row.signal_key];
        if (!s || !template) continue;
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
  const started = Date.now();
  let cursor = startAfter;
  let users = 0;
  let inserted = 0;
  let pinged = 0;

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
        break;
      }
      console.log(`[cron] agent hop=${hop} users=${users} inserted=${inserted} pinged=${pinged} continuing after=${cursor}`);
      await triggerContinuation(cursor, hop + 1);
      return;
    }
  }
  console.log(`[cron] agent hop=${hop} users=${users} inserted=${inserted} pinged=${pinged} complete`);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const afterId = params.get('after');
  const hop = Math.max(1, parseInt(params.get('hop') ?? '1', 10) || 1);
  if (hop > MAX_HOPS) {
    return NextResponse.json({ error: 'Hop cap reached.' }, { status: 400 });
  }

  // Acknowledge immediately, work in after(), exactly like cron/reminders: no
  // invocation ever waits for another, so durations never chain across hops.
  after(() => agentFanOut(afterId, hop).catch((err) => console.error('[cron] agent error', err instanceof Error ? err.message : err)));
  return NextResponse.json({ ok: true, hop, scheduled: true });
}
