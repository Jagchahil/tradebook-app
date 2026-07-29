// THE SIX DIGITS THAT MAKE AN ACCOUNT. Pure, so the rules can be attacked directly.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS FILE IS THE WHOLE OF SIGNUP SECURITY, SO EVERY DECISION IN IT IS WRITTEN DOWN.
//
// A man's tax figures sit behind this code. He is right to be careful about where his finances
// live, and the only honest answer to "is it safe" is a surface small enough to read in one go.
// That is what this file is: no I/O, no database, no clock beyond a default a caller can override.
// The reads and writes are in lib/supabase.ts per CLAUDE.md rule 2, and the guessing, expiry and
// single use rules are all here where test/signupcode.test.mjs can attack them.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

// NO FALLBACK. The same rule as lib/websession.ts: a secret that guards one thing guards one thing,
// and there is no quiet degradation to some other key lying around. No secret, no signup, and the
// route says so rather than issuing codes nobody can trust.
const SECRET = process.env.WEB_SESSION_SECRET || '';

export function signupCodesConfigured(): boolean {
  return SECRET.length >= 32;
}

// Ten minutes. Longer than it takes to switch to an inbox and back, shorter than a tea break, and
// short enough that a code sitting in a shared or forgotten inbox stops being a key very quickly.
export const CODE_TTL_SECONDS = 10 * 60;

// 🔴 FIVE GUESSES AND THE CODE IS DEAD, NOT MERELY WRONG.
//
// Six digits is a million values. Unlimited guesses makes that a formality; five makes it five in
// a million, ONCE, because the sixth attempt does not fail, it burns the code. He asks for another
// one, which costs him nothing and costs an attacker the whole million again.
export const MAX_ATTEMPTS = 5;

// Six digits, from the CSPRNG, never Math.random. Leading zeros are kept on purpose: dropping them
// would quietly shrink the space and make low codes more likely, which is the sort of bug that is
// invisible until somebody counts.
export function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// 🔴 AN HMAC OF THE ADDRESS AND THE CODE TOGETHER, NOT A HASH OF THE CODE.
//
// A bare SHA of a six digit code is not a secret. There are only a million of them, so the whole
// table can be reversed on a laptop in under a second, and a database read would become a list of
// live login codes. Keying it on WEB_SESSION_SECRET means a row is worthless without the key.
//
// The ADDRESS goes into the same digest so a hash lifted from one row cannot be replayed against
// another: a code issued to one man is only ever valid for the address it was sent to.
export function hashCode(emailNorm: string, code: string): string {
  if (!signupCodesConfigured()) return '';
  return crypto.createHmac('sha256', SECRET).update(`${emailNorm}:${code}`).digest('hex');
}

// Constant time, so the comparison cannot be turned into an oracle that leaks the code a character
// at a time. Never throws: a malformed stored hash is simply not a match.
export function codeMatches(storedHash: string, emailNorm: string, code: string): boolean {
  if (!signupCodesConfigured() || !storedHash) return false;
  const expected = hashCode(emailNorm, code);
  if (!expected || expected.length !== storedHash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(expected));
  } catch {
    return false;
  }
}

// What a code looks like before it ever reaches a comparison. Fixed length, digits only, so nothing
// that is not one of ours gets as far as the HMAC.
export function isCodeShape(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

export interface StoredCode {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
}

export type CodeVerdict = 'ok' | 'expired' | 'spent' | 'burnt' | 'wrong' | 'none';

// ⚠️ THE ORDER OF THESE CHECKS IS THE POINT, AND IT IS NOT ARBITRARY.
//
// Spent, expired and burnt are all decided BEFORE the code is compared, so a dead row can never be
// brought back to life by a lucky guess, and so the expensive comparison never runs on a row that
// could not be accepted anyway. Only a live, unspent, unburnt row is ever compared.
//
// FAILS CLOSED at every step. A missing row, an unreadable date, a malformed hash: all refusals.
export function verifyStoredCode(
  row: StoredCode | null | undefined,
  emailNorm: string,
  code: string,
  now: Date = new Date(),
): CodeVerdict {
  if (!row) return 'none';
  if (row.consumed_at) return 'spent';
  if (row.attempts >= MAX_ATTEMPTS) return 'burnt';
  const exp = Date.parse(row.expires_at);
  // An unreadable expiry is OUR data being wrong, and the safe reading of a date we cannot parse is
  // that it has passed. He asks for another code, which costs nothing.
  if (!Number.isFinite(exp) || exp <= now.getTime()) return 'expired';
  if (!isCodeShape(code)) return 'wrong';
  return codeMatches(row.code_hash, emailNorm, code) ? 'ok' : 'wrong';
}

export function expiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + CODE_TTL_SECONDS * 1000).toISOString();
}

// What he is told. A wrong code and a burnt one are DIFFERENT sentences, because "try again" is
// useless advice for a code that can no longer work however carefully he types it.
export function codeMessage(verdict: CodeVerdict): string {
  switch (verdict) {
    case 'expired': return 'That code has expired. Ask for a new one and we will send it straight away.';
    case 'spent': return 'That code has been used already. Ask for a new one if you need to sign in again.';
    case 'burnt': return 'Too many tries on that code, so we have retired it. Ask for a new one.';
    case 'none': return 'We could not find that code. Ask for a new one and try again.';
    case 'wrong': return 'That code did not work. Check the email and try again.';
    default: return '';
  }
}
