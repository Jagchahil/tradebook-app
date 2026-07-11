// Accountant read only access.
//
// A tradesperson gives their accountant a link. The accountant opens it in a
// browser, sees the books, and can change nothing. No account, no install, no app.
//
// THE DESIGN DECISION THAT MATTERS: REVOCATION.
//
// We already mint signed capability links (lib/packtoken.ts) as a pure HMAC of the
// claim plus an expiry. That is fine for a twenty minute print link. It is wrong
// here, because a pure HMAC token CANNOT BE REVOKED: once signed it is valid until
// it expires. If someone sacks their accountant, "your books stay open to them for
// another ninety days" is not an acceptable answer.
//
// So the token carries only a GRANT ID, and every request checks two things:
//   1. the signature, so the id cannot be forged or enumerated, and
//   2. the row in accountant_grants, so revoked_at and expires_at are live facts.
//
// Revoking is then a single update, and the link is dead on the next request.
// The signature is what stops someone guessing a uuid; the row is what makes the
// grant real. Neither alone is enough.
//
// This module holds the token maths and the redaction rules. It is import free
// apart from node crypto, so the node test runner can load it directly.

import crypto from 'crypto';

// Reuse the same secret chain as the other capability tokens, so there is one
// thing to rotate. A dedicated ACCOUNTANT_TOKEN_SECRET is preferred in production.
const SECRET =
  process.env.ACCOUNTANT_TOKEN_SECRET ||
  process.env.PACK_TOKEN_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

// A tax year is the natural life of an accountant relationship, so default to a
// year and let the user pick shorter. The row's expires_at is the truth; this is
// just the default we offer.
export const DEFAULT_GRANT_DAYS = 365;
export const MAX_GRANT_DAYS = 400;

export function clampGrantDays(days: unknown): number {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_GRANT_DAYS;
  return Math.min(Math.floor(n), MAX_GRANT_DAYS);
}

export function expiryFor(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + clampGrantDays(days) * 86400_000).toISOString();
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(grantId: string): string {
  return b64url(crypto.createHmac('sha256', SECRET).update(`accountant:${grantId}`).digest());
}

// token = <grantId>.<signature>
//
// No expiry is baked in, ON PURPOSE. Baking it in would let a token outlive a
// revocation. Expiry and revocation both live in the row, which is the only place
// they can be changed after the fact.
export function accountantToken(grantId: string): string {
  return `${grantId}.${sign(grantId)}`;
}

// Returns the grant id if the signature is good, else null.
//
// This proves only that WE issued this id. The caller MUST still load the row and
// check revoked_at and expires_at. A valid signature on a revoked grant is exactly
// the case this system exists to defeat.
export function verifyAccountantToken(token: string | null | undefined): string | null {
  if (!token || !SECRET) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const grantId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(grantId)) return null;

  const expected = sign(grantId);
  // Constant time: a length mismatch would leak through a plain !== comparison.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  return grantId;
}

export interface GrantRow {
  id: string;
  user_id: string;
  revoked_at: string | null;
  expires_at: string;
}

export type GrantState = 'ok' | 'revoked' | 'expired';

// The live check. Signature said the id is ours; this says the grant still stands.
export function grantState(row: GrantRow | null, now: Date = new Date()): GrantState | null {
  if (!row) return null;
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'expired';
  return 'ok';
}

// --- what the accountant is allowed to see -----------------------------------
//
// Least privilege, enforced here rather than in the page, so a future template
// change cannot quietly widen it. The accountant gets the numbers they need to do
// the books and NOTHING about the person: no phone number, no email, no bank
// connection, no HMRC token, no ids they could use anywhere else.

export interface FullTransaction {
  id?: string;
  amount?: number | null;
  vendor?: string | null;
  category?: string | null;
  transaction_date?: string | null;
  description?: string | null;
  source_type?: string | null;
  confirmed?: boolean | null;
  user_id?: string;
  raw_input_url?: string | null;
  raw_whatsapp_message_id?: string | null;
  [k: string]: unknown;
}

export interface AccountantTransaction {
  date: string | null;
  vendor: string | null;
  category: string | null;
  description: string | null;
  amount: number;
  confirmed: boolean;
}

// Strips every field an accountant has no business seeing. Note what is NOT here:
// user_id (identifies the account), raw_input_url (the receipt image in storage),
// raw_whatsapp_message_id (ties a figure back to a private message).
export function redactTransaction(t: FullTransaction): AccountantTransaction {
  return {
    date: (t.transaction_date ?? null) as string | null,
    vendor: (t.vendor ?? null) as string | null,
    category: (t.category ?? null) as string | null,
    description: (t.description ?? null) as string | null,
    amount: Number(t.amount ?? 0),
    confirmed: t.confirmed === true,
  };
}

// The accountant sees CONFIRMED entries only.
//
// This is not a technical detail, it is the whole promise of the product. An
// unconfirmed entry is a guess we made from a photo that the user has not yet
// agreed with. Showing it to their accountant as if it were their books would put
// our guess in someone else's professional hands. The user approves, then it is
// theirs, then it can be shared.
export function accountantTransactions(rows: FullTransaction[]): AccountantTransaction[] {
  return rows
    .filter((t) => t.confirmed === true)
    .map(redactTransaction)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

export interface AccountantTotals {
  income: number;
  expenses: number;
  profit: number;
  count: number;
}

export function accountantTotals(rows: AccountantTransaction[]): AccountantTotals {
  let income = 0;
  let expenses = 0;
  for (const t of rows) {
    if (t.amount > 0) income += t.amount;
    else expenses += Math.abs(t.amount);
  }
  return {
    income: round2(income),
    expenses: round2(expenses),
    profit: round2(income - expenses),
    count: rows.length,
  };
}

// Expenses grouped by category, biggest first. The one view every accountant
// actually wants.
export function byCategory(rows: AccountantTransaction[]): { category: string; total: number }[] {
  const map = new Map<string, number>();
  for (const t of rows) {
    if (t.amount >= 0) continue;
    const key = t.category || 'Uncategorised';
    map.set(key, (map.get(key) ?? 0) + Math.abs(t.amount));
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
