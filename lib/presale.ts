// Pre-sale follow-up. The bot flow that fires the moment a lead is captured, before the nurture
// sequence: WhatsApp first (near-universal open rate) via an approved template, email alongside,
// spaced and capped, opt-out on every touch. PURE planner and copy here; a cron drives it. SHIPS DARK
// behind PRESALE_ENABLED, and the WhatsApp arm additionally waits on an approved Meta template.
import { houseCopy } from './housestyle';

export function PRESALE_ENABLED(): boolean {
  return (process.env.PRESALE_ENABLED || '').trim().toLowerCase() === 'true';
}

// The WhatsApp template name that must be approved in Meta before business-initiated sends work. Until
// it is approved AND the flag is on, the WhatsApp arm stays dark; the email arm still flows.
export const PRESALE_WA_TEMPLATE = 'presale_welcome';
export const PRESALE_WA_LANG = 'en';

export type PresaleChannel = 'whatsapp' | 'email';

export interface PresaleStep {
  step: number;               // 1-based position in the ladder
  channel: PresaleChannel;
  afterHours: number;         // hours after capture (step 1) or the previous send
  waTemplate: string | null;  // template name for a WhatsApp step, else null
  subject: string | null;     // subject for an email step, else null
}

// The ladder: WhatsApp now, email at +20h, a final WhatsApp nudge at +3 days, then it rests. Short on
// purpose. A lead who has not bitten after three touches is left alone, never hounded.
export const PRESALE_LADDER: PresaleStep[] = [
  { step: 1, channel: 'whatsapp', afterHours: 0,  waTemplate: PRESALE_WA_TEMPLATE, subject: null },
  { step: 2, channel: 'email',    afterHours: 20, waTemplate: null,                subject: 'Any questions on getting started?' },
  { step: 3, channel: 'whatsapp', afterHours: 72, waTemplate: PRESALE_WA_TEMPLATE, subject: null },
];

export function firstName(name: string | null | undefined): string {
  const n = (name || '').trim().split(/\s+/)[0];
  return n && /^[A-Za-z][A-Za-z'-]*$/.test(n) ? n : 'there';
}

// The human text for a step, in a plain, warm voice. Used as the WhatsApp template body (the version
// that must be approved in Meta) and the email body. Dash-safe via houseCopy, so it obeys the house
// style even here.
export function presaleMessage(step: PresaleStep, name: string | null): string {
  const who = firstName(name);
  if (step.channel === 'whatsapp' && step.step === 1) {
    return houseCopy(`Hi ${who}, it's Lekhio. We just got your details, thanks for trying our free tool. Reaching out to see how you are getting on and whether you have any questions about getting started. What is on your mind?`) || '';
  }
  if (step.channel === 'email') {
    return houseCopy(`Hi ${who}, thanks for trying our free tool. We wanted to check whether you have any questions about getting started with Lekhio, or anything we can help you work out. Just reply and a real answer comes back.`) || '';
  }
  return houseCopy(`Hi ${who}, quick one from Lekhio. Still happy to answer anything about your tax or getting set up, no pressure at all. Reply here whenever suits.`) || '';
}

// Given how many presale steps have already been sent, the next step, or null when the ladder is
// exhausted (the lead is then left alone).
export function nextPresaleStep(sentCount: number): PresaleStep | null {
  return sentCount >= 0 && sentCount < PRESALE_LADDER.length ? PRESALE_LADDER[sentCount] : null;
}

// Is the next step due yet? Anchored to the last touch, or capture time for step 1. now is ms.
export function presaleDue(step: PresaleStep, lastTouchIso: string | null, now: number): boolean {
  const anchor = lastTouchIso ? Date.parse(lastTouchIso) : now;
  if (!Number.isFinite(anchor)) return true;
  return now - anchor >= step.afterHours * 3600_000;
}

// A step can only send on a channel the contact consented to: WhatsApp needs a number and wa_consent,
// email needs consent and no unsubscribe. A missing channel is skipped, not blocked.
export function stepSendable(step: PresaleStep, opts: { hasWhatsapp: boolean; waConsent: boolean; hasEmail: boolean; emailOk: boolean }): boolean {
  if (step.channel === 'whatsapp') return opts.hasWhatsapp && opts.waConsent;
  return opts.hasEmail && opts.emailOk;
}
