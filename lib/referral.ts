// lib/referral.ts. The referral invite loop, deterministic and framework free.
//
// The doctrine line, held from doc 82 section 5 and doc 77: Lekhio drafts, the
// user sends. On WhatsApp the user asks for their link, we hand back a ready to
// forward invite in a mate to mate voice, and THEY forward it. We never message
// a third party. Attribution (who joined from whose code) is recorded, but any
// reward is tracked only here, never an automatic movement of money. Turning a
// tracked referral into a free month is a separate, gated step (it touches
// billing and the approval doctrine) and is Jag's call, see doc 82.
//
// Codes are deterministic from a per user seed, so the same account always has
// the same code, using an unambiguous alphabet (no 0/O/1/I) so a code read off a
// phone screen is not mistyped. The code is also stored on the user row so an
// inbound ?ref= can be resolved back to the referrer.

import crypto from 'crypto';

// Unambiguous uppercase alphabet: no O/0, no I/1, to survive being read aloud or
// typed from a screen. 32 symbols.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

// A stable 6 character code for a user, derived from a seed (their id). Same seed
// in, same code out, so it can be regenerated without storage if ever needed.
export function referralCode(seed: string): string {
  const hash = crypto.createHash('sha256').update(`lekhio:referral:${seed}`).digest();
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[hash[i] % ALPHABET.length];
  }
  return out;
}

// Clean an inbound ?ref= value into a valid code, or null. Uppercases, keeps only
// alphabet characters, and requires the exact code length so junk never resolves.
export function sanitizeRefCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toUpperCase()
    .split('')
    .filter((c) => ALPHABET.includes(c))
    .join('');
  return cleaned.length === CODE_LEN ? cleaned : null;
}

// Does this WhatsApp message ask for the user's referral link? Deterministic, the
// same discipline as the other waintents matchers.
export function isReferRequest(body: string): boolean {
  const b = ` ${body.toLowerCase().trim()} `;
  return (
    /\b(refer|referral|invite|inviting)\b/.test(b) ||
    /\bmy (invite|referral) link\b/.test(b) ||
    /\b(share|recommend|tell) (lekhio|a mate|my mate|a friend)\b/.test(b) ||
    /\bspread the word\b/.test(b)
  );
}

export function siteBase(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://tradebook-app-five.vercel.app';
}

export interface ReferralInvite {
  code: string;
  link: string;
  // The forwardable, mate facing message the user sends on.
  forward: string;
  // Lekhio's full WhatsApp reply to the user, with the approval line.
  reply: string;
}

// Build the invite for a code. `forward` is what the tradesperson forwards to a
// mate; `reply` is what Lekhio says back, making clear the user is the one who
// sends it.
export function referralInvite(code: string): ReferralInvite {
  const link = `${siteBase()}/start?ref=${encodeURIComponent(code)}`;
  const forward =
    `Mate, I run my books and tax through Lekhio, it is all on WhatsApp. ` +
    `Snap a receipt or text your miles and it is logged, ready for tax. ` +
    `Worth a look: ${link}`;
  const reply =
    `Here is your invite. Forward this to a mate and you are both sorted for tax:\n\n` +
    `${forward}\n\n` +
    `You send it, we never message anyone for you. Your code is ${code}.`;
  return { code, link, forward, reply };
}
