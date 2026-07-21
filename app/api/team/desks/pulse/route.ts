import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  readTeamCustomers,
  listCronRuns,
  readKnowledgeState,
} from '../../../../../lib/supabase';
import { overview } from '../../../../../lib/team';
import { funnel } from '../../../../../lib/metrics';
import { cronAlarms } from '../../../../../lib/cronwatch';
import { knowledgeAlarms, knowledgeStatus } from '../../../../../lib/knowledgewatch';
import { upsertHeartbeat, type WorkerStatus } from '../../../../../lib/bridge';

export const runtime = 'nodejs';

// THE DESK PULSE. Three of the workforce — Khazanchi (finance), Saudagar (revenue) and Mistri (system)
// — are not watchers of a live wire like Pehredaar; they are analysts of numbers we already hold. So
// rather than a bot each on the mini, ONE small mini job hits this endpoint on a schedule, and the
// server reads the current picture and beats a heartbeat for all three. That is what makes them "live":
// a fresh, honest one-line read of the business, updated every pass.
//
// Secret-gated (x-munshi-secret vs MUNSHI_SECRET), same as the bridge. It returns ONLY aggregates — a
// total MRR, counts, a health word — never a single customer's figures, exactly like the overview the
// team already sees. If MUNSHI_SECRET is unset, refused.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.MUNSHI_SECRET || '';
  const given = req.headers.get('x-munshi-secret') || '';
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [customers, runs, brain] = await Promise.all([
    readTeamCustomers(),
    listCronRuns(),
    readKnowledgeState(),
  ]);
  if (customers === null) {
    // Could not read the business. Do NOT beat a confident green over nothing — say so and stop.
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  // --- Khazanchi · finance ----------------------------------------------------------------------
  const ov = overview(customers);
  const khazanchi = {
    status: 'ok' as WorkerStatus,
    headline: `MRR ${gbp(ov.mrrPence)} · ${ov.active} paying · ${ov.trialing} on trial.`,
    detail: {
      mrrPence: ov.mrrPence,
      active: ov.active,
      trialing: ov.trialing,
      pastDue: ov.pastDue,
      canceled: ov.canceled,
    },
  };

  // --- Saudagar · revenue / growth --------------------------------------------------------------
  const f = funnel(customers.map((c) => ({ status: c.status, stripeId: null, internal: c.internal })));
  const conv = f.conversion.pct === null ? null : `${f.conversion.pct}%`;
  const atRisk = ov.cancelRequested;
  const saudagar = {
    status: (atRisk > 0 ? 'warn' : 'ok') as WorkerStatus,
    headline:
      `${f.trialsStarted} in the funnel · ${f.converted} paying · ${f.stillTrialing} still deciding` +
      (conv ? ` · ${conv} convert` : '') +
      (atRisk > 0 ? ` · ${atRisk} want to cancel` : '') + '.',
    detail: {
      trialsStarted: f.trialsStarted,
      converted: f.converted,
      stillTrialing: f.stillTrialing,
      lapsed: f.lapsed,
      conversionPct: f.conversion.pct,
      cancelRequested: atRisk,
    },
  };

  // --- Mistri · system / ops --------------------------------------------------------------------
  const cAlarms = runs ? cronAlarms(runs) : [];
  const cronsOk = runs !== null && cAlarms.length === 0;
  const kStatus = brain === null ? 'unknown' : knowledgeStatus(knowledgeAlarms(brain));
  let mistriStatus: WorkerStatus = 'ok';
  let mistriHead = 'All green — site up, scheduled jobs on time, tax engine agrees with GOV.UK.';
  if (kStatus !== 'ok' && kStatus !== 'unknown') {
    mistriStatus = 'alert';
    mistriHead = 'The tax engine disagrees with GOV.UK, or cannot be checked. Look before trusting a figure.';
  } else if (runs !== null && !cronsOk) {
    mistriStatus = 'warn';
    mistriHead = `${cAlarms.length} scheduled job(s) behind — something that should be running is not.`;
  }
  const mistri = {
    status: mistriStatus,
    headline: mistriHead,
    detail: { cronsOk, cronAlarms: cAlarms.length, knowledge: kStatus },
  };

  // Beat all three. Best-effort — a failed beat just means a stale card until the next pass.
  await Promise.all([
    upsertHeartbeat({ worker_key: 'khazanchi', status: khazanchi.status, headline: khazanchi.headline, detail: khazanchi.detail }),
    upsertHeartbeat({ worker_key: 'saudagar', status: saudagar.status, headline: saudagar.headline, detail: saudagar.detail }),
    upsertHeartbeat({ worker_key: 'mistri', status: mistri.status, headline: mistri.headline, detail: mistri.detail }),
  ]);

  return NextResponse.json({ ok: true, khazanchi, saudagar, mistri });
}
