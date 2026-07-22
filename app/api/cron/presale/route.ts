import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'crypto';
import { listPresaleCandidates, markPresaleSent, logContactEvent } from '../../../../lib/supabase';
import { hasEmailConfig, sendMarketingEmail } from '../../../../lib/email';
import { hasSendConfig, sendTemplate } from '../../../../lib/whatsapp';
import { PRESALE_ENABLED, nextPresaleStep, presaleDue, stepSendable, presaleMessage, firstName, PRESALE_WA_LANG } from '../../../../lib/presale';
import { unsubscribeUrl } from '../../../../lib/leadtoken';

export const runtime = 'nodejs';
export const maxDuration = 60;

// THE PRE-SALE FOLLOW-UP SENDER. Sends the next due step of the presale ladder to freshly captured
// leads: WhatsApp first via an approved template, email alongside. SHIPS DARK behind PRESALE_ENABLED;
// the WhatsApp arm also needs the presale_welcome template approved in Meta. Same Bearer CRON_SECRET
// gate as every other cron. Every email carries a working unsubscribe. Not configured means CLOSED.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected)); } catch { return false; }
}

const MAX_PER_RUN = 100;
const emailHtml = (text: string) =>
  `<p style="margin:0 0 14px">${text}</p><p style="margin:0;color:#5B6470;font-size:13px">Lekhio, your tax and bookkeeping, on WhatsApp.</p>`;

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!PRESALE_ENABLED()) return NextResponse.json({ ok: true, skipped: 'disabled' });

  after(async () => {
    let sent = 0;
    try {
      const cands = await listPresaleCandidates(300);
      const now = Date.now();
      for (const c of cands.slice(0, MAX_PER_RUN)) {
        const step = nextPresaleStep(c.presale_stage);
        if (!step) continue;
        const anchor = c.presale_last_at ?? c.consent_at;
        if (!presaleDue(step, anchor, now)) continue;
        const sendable = stepSendable(step, { hasWhatsapp: !!c.whatsapp, waConsent: c.wa_consent, hasEmail: !!c.email, emailOk: c.consent });
        if (!sendable) { await markPresaleSent(c.email, c.presale_stage + 1); continue; } // skip a channel they cannot receive, never get stuck
        const text = presaleMessage(step, c.name);
        let delivered = false;
        if (step.channel === 'email' && hasEmailConfig()) {
          delivered = await sendMarketingEmail(c.email, step.subject || 'Getting started with Lekhio', emailHtml(text), unsubscribeUrl(c.email));
        } else if (step.channel === 'whatsapp' && hasSendConfig() && c.whatsapp && step.waTemplate) {
          await sendTemplate(c.whatsapp, step.waTemplate, PRESALE_WA_LANG, [firstName(c.name)]);
          delivered = true;
        }
        if (delivered) {
          await markPresaleSent(c.email, c.presale_stage + 1);
          await logContactEvent(c.email, step.channel === 'whatsapp' ? 'wa_sent' : 'email_sent', { channel: step.channel, detail: `presale step ${step.step}` });
          sent++;
        }
      }
    } catch (e) { console.error('[cron/presale]', e instanceof Error ? e.message : 'err'); }
    console.log(`[cron/presale] sent ${sent}`);
  });
  return NextResponse.json({ ok: true });
}
