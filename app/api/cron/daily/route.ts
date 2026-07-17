import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';

// THE HOBBY-PLAN CRON DISPATCHER.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Vercel's Hobby plan permits exactly TWO cron entries. We have six jobs to run. On 16 July the six
// crons in vercel.json quietly stopped completing, /api/health went red, and two days of the
// (unbackfillable) revenue snapshot were lost, because Vercel simply was not running six crons on a
// plan that allows two.
//
// So the two crons Vercel IS allowed to run are these two dispatchers, and each one KICKS the real
// jobs by calling their existing endpoints with the cron bearer. This is not a new trick: the `due`
// job already kicks `agent` and `bankfeed` exactly this way, and its own comment says the housekeeping
// "rides along with the daily run so no extra cron entry is needed (the Hobby plan caps cron jobs)".
// This file just makes that the whole arrangement.
//
//   ?slot=am   0 7  * * *   due, trial, and (Mon/Wed/Fri) nudge     , the morning messages
//   ?slot=pm   0 23 * * *   metrics, digest, and (Sunday) weekly    , the end-of-day work
//
// 🔴 EACH KICK IS INDEPENDENT, AND THE DISPATCHER GATES ON NOTHING. metrics is the reason: the daily
// revenue snapshot cannot be backfilled and must run even on a day WhatsApp is down, so it is never
// placed behind a messaging config or another job's health. Every kicked endpoint still writes its
// own cronStarted/cronFinished, so the watchdog (lib/cronwatch.ts) and /api/health keep watching all
// six jobs BY NAME, exactly as before. Nothing about the alarm changed; only what pulls the trigger.
//
// WHY THIS AND NOT PRO. Pro ($20/mo, 40 crons at the exact minute) is the clean answer and we may
// still take it. This keeps us free today, at the cost of the six jobs sharing two run times instead
// of six. The ceilings in cronwatch.ts still hold: every job runs at least as often as its window.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// Header-only and timing-safe. Vercel injects `Authorization: Bearer <CRON_SECRET>` on cron
// invocations when CRON_SECRET is set. Identical to every other cron route on purpose: one way in,
// one thing to rotate. Not configured means CLOSED.
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

export const runtime = 'nodejs';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app';

// Which endpoints a slot fans out to. Weekday-gated jobs are decided at call time in UTC, because
// UTC is the clock Vercel's scheduler runs on. getUTCDay: 0 = Sunday ... 5 = Friday.
function jobsFor(slot: string, day: number): string[] {
  if (slot === 'am') {
    // The morning messages. `due` also kicks agent + bankfeed on its own first hop, unchanged.
    const jobs = ['/api/cron/reminders?job=due', '/api/cron/trial'];
    if (day === 1 || day === 3 || day === 5) jobs.push('/api/cron/reminders?job=nudge'); // Mon/Wed/Fri
    return jobs;
  }
  if (slot === 'pm') {
    // The end-of-day work. metrics first: it is the one that must never be skipped.
    const jobs = ['/api/cron/metrics', '/api/cron/digest'];
    if (day === 0) jobs.push('/api/cron/reminders?job=weekly'); // Sunday
    return jobs;
  }
  return [];
}

async function kick(path: string, secret: string): Promise<{ path: string; ok: boolean }> {
  try {
    const r = await fetch(`${APP_URL}${path}`, { headers: { Authorization: `Bearer ${secret}` } });
    return { path, ok: r.ok };
  } catch (err) {
    console.error(`[cron/daily] kick failed for ${path}:`, err instanceof Error ? err.message : err);
    return { path, ok: false };
  }
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const slot = new URL(req.url).searchParams.get('slot') ?? '';
  const secret = process.env.CRON_SECRET;
  // Cannot happen past authorised() (which needs the secret), but the type says string | undefined
  // and a cron that continues without the bearer would silently 401 every kick. Say so loudly.
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET missing' }, { status: 503 });

  const jobs = jobsFor(slot, new Date().getUTCDay());
  if (jobs.length === 0) return NextResponse.json({ error: 'unknown slot' }, { status: 400 });

  // Acknowledge immediately; kick each job independently AFTER the response, so one slow or failing
  // job never blocks another and Vercel is not held waiting. Each target acks immediately too (the
  // reminders and digest jobs work in after(); trial and metrics are quick), so the kicks resolve in
  // milliseconds. A kick that fails is logged; the job's own watchdog row is what turns the light
  // red, not this dispatcher.
  after(async () => { await Promise.all(jobs.map((p) => kick(p, secret))); });

  return NextResponse.json({ ok: true, slot, kicked: jobs });
}
