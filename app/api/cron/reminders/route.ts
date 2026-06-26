import { NextRequest, NextResponse } from 'next/server';
import {
  getDueReminders,
  markReminded,
  getPhoneForUser,
  listNudgeTargets,
  weeklyTotals,
} from '../../../../lib/supabase';
import { sendText, hasSendConfig } from '../../../../lib/whatsapp';

// The reminder engine. Hit on a schedule (Vercel Cron, Supabase pg_cron, or any
// external cron such as cron-job.org). Guarded by CRON_SECRET.
//   ?job=due     send any reminders whose time has come (run often, e.g. every 15 min)
//   ?job=nudge   the twice a day "don't forget your expenses" text (run at 8am and 6pm)
//   ?job=weekly  a short weekly money summary (run weekly)

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured means closed
  const q = new URL(req.url).searchParams.get('secret');
  const header = req.headers.get('authorization');
  return q === secret || header === `Bearer ${secret}`;
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
        const phone = await getPhoneForUser(r.user_id);
        if (!phone) {
          await markReminded(r.id);
          return;
        }
        const emoji = r.kind === 'job' ? '🔧' : r.kind === 'quote' ? '📋' : '⏰';
        await sendText(phone, `${emoji} Reminder: ${r.title}`);
        await markReminded(r.id);
        sent++;
      });
    } else if (job === 'nudge') {
      const targets = (await listNudgeTargets()).filter((t) => t.daily_nudges);
      await mapLimit(targets, 20, async (t) => {
        await sendText(t.phone, "Quick one. Don't forget today's expenses. Snap a receipt, leave a voice note, or just tell me what you spent.");
        sent++;
      });
    } else if (job === 'weekly') {
      const targets = (await listNudgeTargets()).filter((t) => t.weekly_summary);
      await mapLimit(targets, 20, async (t) => {
        const { income, expenses } = await weeklyTotals(t.user_id);
        const profit = income - expenses;
        await sendText(t.phone, `Your week with Lekhio. In ${gbp(income)}, out ${gbp(expenses)}, kept ${gbp(profit)}. Open the app for the detail.`);
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
