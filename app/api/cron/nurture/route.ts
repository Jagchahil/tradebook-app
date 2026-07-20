import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { listNurtureCandidates, markNurtureSent } from '../../../../lib/supabase';
import { hasEmailConfig, sendMarketingEmail } from '../../../../lib/email';
import { NURTURE_ENABLED, nextNurture, nurtureDue } from '../../../../lib/nurture';
import { unsubscribeUrl } from '../../../../lib/leadtoken';

export const runtime = 'nodejs';
export const maxDuration = 60;

// THE LEAD NURTURE SENDER. Kicked by the daily pm dispatcher. Sends the next value email to confirmed,
// consented, non-unsubscribed leads who are due. SHIPS DARK: does nothing until NURTURE_ENABLED is
// 'true'. Same header-only, timing-safe CRON_SECRET gate as every other cron. Every send carries a
// working unsubscribe (added by sendMarketingEmail). Not configured means CLOSED.
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

const MAX_PER_RUN = 100; // keep a single serverless run bounded

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!NURTURE_ENABLED()) return NextResponse.json({ ok: true, skipped: 'disabled' });
  if (!hasEmailConfig()) return NextResponse.json({ ok: true, skipped: 'no email config' });

  // Ack immediately; do the sending after the response so the dispatcher is never held waiting.
  after(async () => {
    const now = Date.now();
    const candidates = await listNurtureCandidates(500);
    let sent = 0;
    for (const c of candidates) {
      if (sent >= MAX_PER_RUN) break;
      const next = nextNurture(c.stage);
      if (!next) continue;
      const anchor = c.stage === 0 ? c.confirmedAt : c.lastAt;
      if (!nurtureDue(next, anchor, now)) continue;
      try {
        const ok = await sendMarketingEmail(c.email, next.subject, next.bodyHtml, unsubscribeUrl(c.email));
        if (ok) {
          await markNurtureSent(c.email, next.stage);
          sent++;
        }
      } catch {
        /* skip this one, keep going */
      }
    }
    console.log(`[cron/nurture] sent ${sent}`);
  });

  return NextResponse.json({ ok: true });
}
