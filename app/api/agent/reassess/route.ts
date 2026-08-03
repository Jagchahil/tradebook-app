import { NextRequest, NextResponse } from 'next/server';
import {
  agentAggregates,
  getActiveGoals,
  listOverdueInvoices,
  getBusinessProfile,
  getStudentLoanSettings,
  insertAgentSignals,
  refreshFactsFromDb,
  readCircumstances,
} from '../../../../lib/supabase';
import { sessionUser } from '../../../../lib/webauth';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { computeSignalsForStructure, type AgentInput } from '../../../../lib/agent';
import { mtdStatedFrom } from '../../../../lib/circumstances';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

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
  const verified = await sessionUser(req);
  if (!verified) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  //
  // His records stay readable everywhere; what a lapsed subscription buys is that we do nothing NEW
  // for him. gateForUser never returns readonly because something broke, so this can only fire on a
  // real answer about a real subscription.
  if ((await gateForUser(verified.id)) === 'readonly') return refuseUnentitled(req, '/app');
  const userId = verified.id;
  await refreshFactsFromDb();

  // A light burst guard: an input storm should not become a compute storm. Reassessing at most a few
  // times a minute is plenty; the nightly walk is the backstop for anything skipped here.
  if (await rateLimitedShared(`reassess:${userId}`, 6, 60 * 1000)) {
    return NextResponse.json({ ok: true, throttled: true, signals: [] });
  }

  const agg = await agentAggregates(userId);
  if (!agg) return NextResponse.json({ ok: true, signals: [] });
  if (agg.months.length === 0 && agg.unconfirmed === 0) return NextResponse.json({ ok: true, signals: [] });

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lekhio.app';
  const [goals, overdue, profile, income, circs] = await Promise.all([
    getActiveGoals(userId),
    listOverdueInvoices(userId),
    getBusinessProfile(userId),
    getStudentLoanSettings(userId),
    readCircumstances(userId),
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
    // A partner is taxed on their share of the shared books, never the whole firm's profit. The
    // share was captured at setup; the walk and this on-demand path must agree on it.
    partnershipShare: profile?.partnershipShare ?? 100,
    // Whether he trades at all, on the on demand path too. The walk and this route must agree on
    // who he is or the same man gets a different set of cards depending on which one ran last.
    // See the note on the same line in app/api/cron/agent/route.ts for the sources.
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
