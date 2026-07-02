import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getDueReminders,
  claimDueReminder,
  getPhoneForUser,
  listNudgeTargets,
  weeklyTotals,
  weeklyTotalsAll,
} from '../../../../lib/supabase';
import { sendTemplate, hasSendConfig } from '../../../../lib/whatsapp';

// The reminder engine. Hit on a schedule (Vercel Cron, Supabase pg_cron, or any
// external cron such as cron-job.org). Guarded by CRON_SECRET.
//   ?job=due     send any reminders whose time has come (run often, e.g. every 15 min)
//   ?job=nudge   the twice a day "don't forget your expenses" text (run at 8am and 6pm)
//   ?job=weekly  a short weekly money summary (run weekly)

// Header-only and timing-safe. We do not accept the secret in the query string,
// because URLs end up in proxy and access logs and Referer headers. Send it as
// `Authorization: Bearer <CRON_SECRET>` from the scheduler.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured means closed
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Let the function run long enough to fan out at scale. Pro allows up to 300s.
export const maxDuration = 60;

function gbp(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`;
}

// Run an async task over a list with a fixed number of workers, so we never
// loop thousands of sequential awaits (which would time the function out).
// Concurrency 20 keeps us under Meta's default ~80 messages a second too.
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch {
        // One failed send must not stop the rest.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  if (!hasSendConfig()) return NextResponse.json({ error: 'WhatsApp is not configured yet.' }, { status: 503 });

  const job = new URL(req.url).searchParams.get('job') ?? 'due';
  let sent = 0;

  try {
    if (job === 'due') {
      const due = await getDueReminders(new Date().toISOString());
      await mapLimit(due, 20, async (r) => {
        // Claim atomically before sending; if another run already took it, skip.
        if (!(await claimDueReminder(r.id))) return;
        const phone = await getPhoneForUser(r.user_id);
        if (!phone) return;
        await sendTemplate(phone, 'lekhio_reminder', 'en_GB', [r.title]);
        sent++;
      });
    } else if (job === 'nudge') {
      const targets = (await listNudgeTargets()).filter((t) => t.daily_nudges);
      await mapLimit(targets, 20, async (t) => {
        await sendTemplate(t.phone, 'lekhio_nudge', 'en_GB', []);
        sent++;
      });
    } else if (job === 'weekly') {
      const targets = (await listNudgeTargets()).filter((t) => t.weekly_summary);
      // One grouped aggregate for every user's totals, instead of one query per
      // user. Falls back to the old per-user query until the weekly_totals_all
      // RPC (supabase/schema.sql) has been applied.
      const all = await weeklyTotalsAll();
      const totalsMap = all ? new Map(all.map((r) => [r.user_id, r])) : null;
      await mapLimit(targets, 20, async (t) => {
        const row = totalsMap ? totalsMap.get(t.user_id) ?? { income: 0, expenses: 0 } : await weeklyTotals(t.user_id);
        const profit = row.income - row.expenses;
        await sendTemplate(t.phone, 'lekhio_weekly', 'en_GB', [gbp(row.income), gbp(row.expenses), gbp(profit)]);
        sent++;
      });
    } else {
      return NextResponse.json({ error: 'Unknown job.' }, { status: 400 });
    }

    console.log(`[cron] job=${job} sent=${sent}`);
    return NextResponse.json({ ok: true, job, sent });
  } catch (err) {
    console.error('[cron] error', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Cron failed.' }, { status: 500 });
  }
}
