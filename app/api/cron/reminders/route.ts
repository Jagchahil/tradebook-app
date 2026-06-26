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

function gbp(n: number): string {
  return `£${Math.abs(n).toFixed(2)}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  if (!hasSendConfig()) return NextResponse.json({ error: 'WhatsApp is not configured yet.' }, { status: 503 });

  const job = new URL(req.url).searchParams.get('job') ?? 'due';
  let sent = 0;

  try {
    if (job === 'due') {
      const due = await getDueReminders(new Date().toISOString());
      for (const r of due) {
        const phone = await getPhoneForUser(r.user_id);
        if (!phone) {
          await markReminded(r.id);
          continue;
        }
        const emoji = r.kind === 'job' ? '🔧' : r.kind === 'quote' ? '📋' : '⏰';
        await sendText(phone, `${emoji} Reminder: ${r.title}`);
        await markReminded(r.id);
        sent++;
      }
    } else if (job === 'nudge') {
      const targets = await listNudgeTargets();
      for (const t of targets) {
        if (!t.daily_nudges) continue;
        await sendText(t.phone, "Quick one. Don't forget today's expenses. Snap a receipt, leave a voice note, or just tell me what you spent.");
        sent++;
      }
    } else if (job === 'weekly') {
      const targets = await listNudgeTargets();
      for (const t of targets) {
        if (!t.weekly_summary) continue;
        const { income, expenses } = await weeklyTotals(t.user_id);
        const profit = income - expenses;
        await sendText(t.phone, `Your week with Lekhio. In ${gbp(income)}, out ${gbp(expenses)}, kept ${gbp(profit)}. Open the app for the detail.`);
        sent++;
      }
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
