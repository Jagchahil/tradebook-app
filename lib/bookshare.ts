// Share my books.
//
// A tradesperson sends someone a link. They open it in a browser, see the books,
// and can change nothing. No account, no install, no app.
//
// WHO THIS IS ACTUALLY FOR, AND WHY IT IS NOT CALLED "ACCOUNTANT ACCESS".
//
// It was, for about an hour. That was wrong. Lekhio's whole pitch is that you do
// not need to pay an accountant, so naming a feature after the accountant concedes
// he exists and quietly demotes us to the thing that feeds him.
//
// The people who actually need to see a self employed person's books are usually a
// MORTGAGE BROKER, a lender financing a van, a landlord, or a grant application.
// Those people cannot get this from an accountant at all, at least not without a
// fee and a fortnight. An accountant is one possible recipient, not the headline.
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
//   2. the row in book_shares, so revoked_at and expires_at are live facts.
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
  process.env.SHARE_TOKEN_SECRET ||
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

function sign(shareId: string): string {
  // The prefix is part of the signed message, so a token minted for one purpose
  // can never be replayed against another.
  return b64url(crypto.createHmac('sha256', SECRET).update(`accountant:${shareId}`).digest());
}

// token = <grantId>.<signature>
//
// No expiry is baked in, ON PURPOSE. Baking it in would let a token outlive a
// revocation. Expiry and revocation both live in the row, which is the only place
// they can be changed after the fact.
export function shareToken(grantId: string): string {
  return `${grantId}.${sign(grantId)}`;
}

// Returns the grant id if the signature is good, else null.
//
// This proves only that WE issued this id. The caller MUST still load the row and
// check revoked_at and expires_at. A valid signature on a revoked grant is exactly
// the case this system exists to defeat.
export function verifyShareToken(token: string | null | undefined): string | null {
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

export interface SharedTransaction {
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
export function redactTransaction(t: FullTransaction): SharedTransaction {
  return {
    date: (t.transaction_date ?? null) as string | null,
    vendor: (t.vendor ?? null) as string | null,
    category: (t.category ?? null) as string | null,
    description: (t.description ?? null) as string | null,
    amount: Number(t.amount ?? 0),
    confirmed: t.confirmed === true,
  };
}

// What the recipient is allowed to see, and nothing beyond it.
//
// fromDate            entries before this are not shared at all.
// excludeCategories   categories the recipient must never see.
export interface ShareScope {
  fromDate: string | null;
  excludeCategories: string[];
}

// Normalise whatever came out of the database or the request body. Defensive on
// purpose: if we cannot understand the scope we must NOT fall back to "share
// everything", so an unreadable scope shares nothing.
export function normaliseScope(input: {
  from_date?: unknown;
  exclude_categories?: unknown;
}): ShareScope {
  const fromDate =
    typeof input.from_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input.from_date)
      ? input.from_date.slice(0, 10)
      : null;

  const excludeCategories = Array.isArray(input.exclude_categories)
    ? input.exclude_categories.filter((c): c is string => typeof c === 'string').map((c) => c.toLowerCase())
    : [];

  return { fromDate, excludeCategories };
}

// SHARING YOUR BOOKS MUST NOT MEAN SHARING YOUR LIFE.
//
// The first version of this shared every confirmed entry, ever, with no date range
// and no exclusions. The very first real test link contained CHILD TAX CREDIT,
// BET365 and personal transfers. Whoever that link went to would have learned
// things about the user that have nothing to do with their books, and the user
// would have had no idea it was happening. That is the failure this filter exists
// to prevent, and it is why the scope is applied HERE, in one tested place, rather
// than in the page template where a redesign could quietly drop it.
//
// Three gates, in order:
//   1. CONFIRMED ONLY. An unconfirmed entry is a guess we made from a photo that
//      the user has not agreed with yet. Handing our guess to someone's mortgage
//      broker as if it were fact would be a betrayal of the approval gate.
//   2. THE DATE RANGE. No date range means nothing is shared, not everything.
//   3. THE EXCLUDED CATEGORIES.
export function shareTransactions(rows: FullTransaction[], scope: ShareScope): SharedTransaction[] {
  // Fail CLOSED. A share with no date range is a bug or an old link, and the safe
  // answer to both is an empty page, never the user's whole financial history.
  if (!scope.fromDate) return [];

  const excluded = new Set(scope.excludeCategories.map((c) => c.toLowerCase()));

  return rows
    .filter((t) => t.confirmed === true)
    .filter((t) => String(t.transaction_date ?? '') >= scope.fromDate!)
    .filter((t) => !excluded.has(String(t.category ?? '').toLowerCase()))
    .map(redactTransaction)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

// The distinct categories in someone's books, so the app can show them their own
// real categories to untick rather than a guessed list.
export function categoriesIn(rows: FullTransaction[]): string[] {
  const seen = new Set<string>();
  for (const t of rows) {
    if (t.confirmed !== true) continue;
    const c = String(t.category ?? '').trim();
    if (c) seen.add(c);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export interface ShareTotals {
  income: number;
  expenses: number;
  profit: number;
  count: number;
}

export function shareTotals(rows: SharedTransaction[]): ShareTotals {
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
export function byCategory(rows: SharedTransaction[]): { category: string; total: number }[] {
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
