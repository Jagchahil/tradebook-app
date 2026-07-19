import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  agentAggregates,
  getActiveGoals,
  listOverdueInvoices,
  getBusinessProfile,
  getStudentLoanSettings,
  insertAgentSignals,
} from '../../../../lib/supabase';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { computeSignalsForStructure, type AgentInput } from '../../../../lib/agent';

export const runtime = 'nodejs';

// RAKHA, ON DEMAND. The nightly walk keeps everyone covered, but a proactive accountant does not wait
// until tomorrow morning to notice what changed today. This endpoint recomputes ONE user's
// structure-aware signals the instant something lands: a confirmed receipt, a new goal, a profile
// change. The app (or any input path) calls it, gets the fresh moves back, and shows them straight away.
//
// It is INSERT ONLY, exactly like the walk's app-card path: it never sends a WhatsApp or a push, so the
// notification noise caps (which live in the nightly job) are never bypassed by a burst of inputs. The
// same structural dedupe on agent_signals means calling it repeatedly is always safe.
//
// One way, one gate: the user's own access token. It only ever reads and writes that user's own data.

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const verified = await verifyAccessToken(token);
  if (!verified) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = verified.id;

  // A light burst guard: an input storm should not become a compute storm. Reassessing at most a few
  // times a minute is plenty; the nightly walk is the backstop for anything skipped here.
  if (await rateLimitedShared(`reassess:${userId}`, 6, 60 * 1000)) {
    return NextResponse.json({ ok: true, throttled: true, signals: [] });
  }

  const agg = await agentAggregates(userId);
  if (!agg) return NextResponse.json({ ok: true, signals: [] });
  if (agg.months.length === 0 && agg.unconfirmed === 0) return NextResponse.json({ ok: true, signals: [] });

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';
  const [goals, overdue, profile, income] = await Promise.all([
    getActiveGoals(userId),
    listOverdueInvoices(userId),
    getBusinessProfile(userId),
    getStudentLoanSettings(userId),
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
    studentLoanPlan: income?.plan ?? null,
    studentLoanPostgrad: income?.postgrad ?? false,
    employmentIncome: income?.employmentIncome ?? 0,
    goals: goals.map((g) => ({ id: g.id, kind: g.kind, title: g.title, amount: g.amount, targetDate: g.target_date })),
    businessType: profile?.businessType ?? 'sole_trader',
    dividendIncome: income?.dividendIncome ?? 0,
    savingsIncome: income?.savingsIncome ?? 0,
  };

  const signals = computeSignalsForStructure(input);
  if (signals.length === 0) return NextResponse.json({ ok: true, signals: [] });

  // Insert-only (no send). Structural dedupe on agent_signals makes repeat calls a no-op.
  await insertAgentSignals(
    signals.map((s) => ({
      user_id: userId,
      signal_key: s.signalKey,
      period_key: s.periodKey,
      payload: { title: s.title, body: s.body, waText: s.waText, numbers: s.numbers, action: s.action ?? null },
      priority: s.priority,
    })),
  );

  // Hand the fresh signals back so the caller can show them the moment the input lands.
  return NextResponse.json({
    ok: true,
    signals: signals.map((s) => ({ key: s.signalKey, title: s.title, body: s.body, priority: s.priority, numbers: s.numbers })),
  });
}
