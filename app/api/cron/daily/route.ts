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
// ⚠️ THE WEEKLY JOB IS SUNDAY ONLY AND THAT IS STILL RIGHT, but it is no longer the only way a man
// gets his week. From 30 July a customer MID TRIAL is excluded from the Sunday walk entirely and
// gets his week inside the day six trial message instead, sent by the `trial` job above, relative
// to when HE signed up rather than to a calendar Sunday.
//
// The reason is the seven day trial: a Saturday signup used to see the Sunday notification on day
// one with nothing in it, and the next Sunday fell on day eight, after he had gone. So he got one
// empty message and then nothing at all, which is the worst of both.
//
// 🔴 EACH KICK IS INDEPENDENT, AND THE DISPATCHER GATES ON NOTHING. metrics is the reason: the daily
// revenue snapshot cannot be backfilled and must run even on a day WhatsApp is down, so it is never
// placed behind a messaging config or another job's health. Every kicked endpoint writes its own
// cronStarted/cronFinished, so the watchdog (lib/cronwatch.ts) and /api/health keep watching the
// jobs BY NAME. Nothing about the alarm changed; only what pulls the trigger.
//
// ⚠️ THIS SAID "ALL SIX JOBS" AND THE LIST HAS GROWN SINCE. voicereap was added to both slots on
// 9 August writing neither call, and appearing in neither cronwatch's map nor the runs table, so
// the sentence above was quietly false about the newest job in the list, which is the one nobody
// has ever watched run. A count written into a comment goes stale the first time somebody adds a
// line below it, so there is no count in it now. lib/cronwatch.ts is the register, and its foot
// records what is deliberately NOT watched, so an absence there reads as a decision, not a hole.
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://lekhio.app';

// Which endpoints a slot fans out to. Weekday-gated jobs are decided at call time in UTC, because
// UTC is the clock Vercel's scheduler runs on. getUTCDay: 0 = Sunday ... 5 = Friday.
function jobsFor(slot: string, day: number): string[] {
  if (slot === 'am') {
    // The morning messages. `due` also kicks agent + bankfeed on its own first hop, unchanged.
    // voicereap on BOTH slots: it is the only thing that apologises for a voice note the Mac mini
    // never got to, and it used to live behind a door only the mini opens. See that route's header.
    const jobs = ['/api/cron/reminders?job=due', '/api/cron/trial', '/api/cron/voicereap'];
    if (day === 1 || day === 3 || day === 5) jobs.push('/api/cron/reminders?job=nudge'); // Mon/Wed/Fri
    return jobs;
  }
  if (slot === 'pm') {
    // The end-of-day work. metrics first: it is the one that must never be skipped.
    const jobs = ['/api/cron/metrics', '/api/cron/digest', '/api/cron/nurture', '/api/cron/voicereap'];
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
