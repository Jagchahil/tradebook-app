// THE LEAD NURTURE SEQUENCE. Two gentle, value-first emails to people who used a free tool, confirmed
// their email (double opt-in) and have not unsubscribed. No hard sell; every send carries a working
// unsubscribe (added by sendMarketingEmail). The copy lives here so it is easy to read and change.
//
// SHIPS DARK. Nothing sends until NURTURE_ENABLED is 'true' — the same posture as the trial pings and
// the whole email system (dormant until RESEND_API_KEY). So this deploys today and sends to nobody
// until the copy has been read and it is switched on.

const APP = 'https://lekhio.app';
const INK = '#111111';
const RIVER = '#1B59A6';

export interface NurtureEmail {
  stage: number; // 1-based. A lead at nurture_stage N is due to receive stage N+1.
  afterDays: number; // stage 1: days after they CONFIRMED. Later stages: days after the previous send.
  subject: string;
  bodyHtml: string; // inner content only; sendMarketingEmail wraps it and adds the unsubscribe footer.
}

export const NURTURE_SEQUENCE: NurtureEmail[] = [
  {
    stage: 1,
    afterDays: 3,
    subject: 'The tax number most people get wrong',
    bodyHtml: `
      <p style="font-size:20px;font-weight:800;letter-spacing:-0.3px;margin:0 0 14px;color:${INK}">The number most people get wrong.</p>
      <p style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 14px">When you worked out your tax the other day, the figure that moved it most was your expenses. Every pound of genuine business cost comes off your taxable profit — and most sole traders lose hundreds every year simply because a receipt goes missing, or they never knew a cost counted.</p>
      <p style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 14px">Mileage. Use of home. Tools, materials, phone, a share of the van. It adds up faster than people think, and it is all money you keep instead of handing to HMRC.</p>
      <p style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 14px">That is the whole job Lekhio does: snap a receipt or send a quick text, and it captures every cost across the year, so nothing is missed by January.</p>
    `,
  },
  {
    stage: 2,
    afterDays: 4,
    subject: 'Whenever you are ready',
    bodyHtml: `
      <p style="font-size:20px;font-weight:800;letter-spacing:-0.3px;margin:0 0 14px;color:${INK}">Whenever you are ready.</p>
      <p style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 14px">No pressure and no hard sell. But when the shoebox starts to nag, or a deadline creeps up on a Sunday night, Lekhio is here: your books and tax handled from WhatsApp, the reliefs found for you, and you approve everything before anything moves.</p>
      <p style="font-size:15px;line-height:1.65;color:${INK};margin:0 0 14px">Your first 14 days are free, and there is no card to start.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="background:${RIVER};border-radius:10px"><a href="${APP}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">See how it works</a></td></tr></table>
    `,
  },
];

// The number of stages, so callers and queries agree on when the sequence is complete.
export const NURTURE_STAGES = NURTURE_SEQUENCE.length;

// The email a lead at `currentStage` should receive next, or null if the sequence is complete.
export function nextNurture(currentStage: number): NurtureEmail | null {
  return NURTURE_SEQUENCE.find((e) => e.stage === currentStage + 1) ?? null;
}

export const NURTURE_ENABLED = (): boolean => process.env.NURTURE_ENABLED === 'true';

// True if enough time has passed for this lead to receive their next email. `anchorIso` is confirmed_at
// for stage 0, otherwise nurture_last_at.
export function nurtureDue(nextEmail: NurtureEmail, anchorIso: string | null, now: number): boolean {
  if (!anchorIso) return false;
  const t = Date.parse(anchorIso);
  if (!Number.isFinite(t)) return false;
  return now - t >= nextEmail.afterDays * 24 * 60 * 60 * 1000;
}
