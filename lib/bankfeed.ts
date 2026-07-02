// lib/bankfeed.ts. Open Banking bank feeds via TrueLayer's Data API.
// Read only account information: the user connects their bank through
// TrueLayer's hosted auth dialog (which includes the bank picker), and a daily
// sync pulls new transactions into the normal `transactions` table as
// UNCONFIRMED entries. The approval gate is untouched: nothing counts toward
// tax until the user confirms it in the app, exactly like a WhatsApp capture.
//
// PROVIDER HISTORY (doc 77): the first build targeted GoCardless Bank Account
// Data, but GoCardless closed that product to new signups (verified 2 July
// 2026), so this is the planned TrueLayer fallback. TrueLayer is FCA regulated
// for account information services; Lekhio integrates as its client.
// Verified against the live TrueLayer docs on 2 July 2026: auth link
// parameters, code exchange, and the Data API v1 transactions shape.
//
// DORMANT BY DEFAULT. Without BANK_CLIENT_ID and BANK_CLIENT_SECRET every
// entry point returns null or false and no user visible surface changes.
// BANK_SANDBOX=true points everything at the TrueLayer sandbox and enables
// their Mock Bank in the dialog.
//
// Tokens: unlike the GoCardless design, TrueLayer issues per connection OAuth
// tokens (1 hour access, long lived refresh with the offline_access scope).
// They are stored in bank_connections, a service role only table with RLS and
// no policies, the same posture as hmrc_connections. Never logged.
//
// No SDK. Raw fetch, same as the rest of the codebase.

const SANDBOX = process.env.BANK_SANDBOX === 'true';
const AUTH_BASE = SANDBOX ? 'https://auth.truelayer-sandbox.com' : 'https://auth.truelayer.com';
const API_BASE = SANDBOX ? 'https://api.truelayer-sandbox.com' : 'https://api.truelayer.com';
const CLIENT_ID = process.env.BANK_CLIENT_ID;
const CLIENT_SECRET = process.env.BANK_CLIENT_SECRET;

export function hasBankFeedConfig(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

// The hosted auth dialog link. TrueLayer runs the bank picker itself, so the
// app never needs an institutions list. `state` is our HMAC signed user state,
// which the callback verifies; scope includes offline_access so we receive a
// refresh token and the daily sync can run without the user present. In the
// sandbox the Mock Bank is included so the whole loop can be walked without a
// real bank account.
export function buildAuthLink(state: string): string | null {
  if (!CLIENT_ID) return null;
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app'}/api/bank/callback`;
  const providers = SANDBOX ? 'uk-cs-mock uk-ob-all uk-oauth-all' : 'uk-ob-all uk-oauth-all';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirect,
    scope: 'info accounts balance transactions offline_access',
    providers,
    state,
  });
  return `${AUTH_BASE}/?${params.toString()}`;
}

export interface TokenSet {
  access_token: string;
  refresh_token: string | null;
  expires_at: string; // ISO
}

function toTokenSet(data: { access_token?: string; refresh_token?: string; expires_in?: number }, previousRefresh?: string | null): TokenSet | null {
  if (!data.access_token) return null;
  const expiresIn = Number(data.expires_in) || 3600;
  return {
    access_token: data.access_token,
    // TrueLayer may rotate the refresh token; keep the old one if none returned.
    refresh_token: data.refresh_token ?? previousRefresh ?? null,
    expires_at: new Date(Date.now() + (expiresIn - 60) * 1000).toISOString(),
  };
}

// Exchange the one-time code from the callback for tokens.
export async function exchangeCode(code: string): Promise<TokenSet | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app'}/api/bank/callback`;
  try {
    const res = await fetch(`${AUTH_BASE}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirect,
        code,
      }).toString(),
    });
    if (!res.ok) {
      console.error('[bankfeed] code exchange failed:', res.status);
      return null;
    }
    return toTokenSet((await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number });
  } catch {
    return null;
  }
}

// Refresh an expired access token ahead of a sync run.
export async function refreshAccess(refreshToken: string): Promise<TokenSet | null> {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  try {
    const res = await fetch(`${AUTH_BASE}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) {
      console.error('[bankfeed] token refresh failed:', res.status);
      return null;
    }
    return toTokenSet((await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }, refreshToken);
  } catch {
    return null;
  }
}

// The user's connected accounts.
export async function listAccounts(accessToken: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${API_BASE}/data/v1/accounts`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('[bankfeed] accounts fetch failed:', res.status);
      return null;
    }
    const data = (await res.json()) as { results?: Array<{ account_id?: string }> };
    if (!Array.isArray(data.results)) return null;
    return data.results.map((a) => a.account_id).filter((id): id is string => Boolean(id));
  } catch {
    return null;
  }
}

// One booked (settled) transaction from Data API v1. Bank data varies by
// institution, so everything is optional and defensively read.
export interface BankTransaction {
  transaction_id?: string;
  normalised_provider_transaction_id?: string;
  provider_transaction_id?: string;
  timestamp?: string;
  description?: string;
  amount?: number;
  currency?: string;
  transaction_type?: string; // DEBIT | CREDIT
  merchant_name?: string;
}

export async function getBookedTransactions(
  accessToken: string,
  accountId: string,
  fromDate?: string,
): Promise<BankTransaction[] | null> {
  try {
    const qs = fromDate ? `?from=${encodeURIComponent(fromDate)}` : '';
    const res = await fetch(`${API_BASE}/data/v1/accounts/${encodeURIComponent(accountId)}/transactions${qs}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('[bankfeed] transactions fetch failed:', res.status);
      return null;
    }
    const data = (await res.json()) as { results?: BankTransaction[] };
    return Array.isArray(data.results) ? data.results : null;
  } catch {
    return null;
  }
}

// --- Pure mapping logic (unit tested in test/bankfeed.test.mjs) --------------

export interface MappedBankEntry {
  external_id: string;
  vendor: string;
  amount: number; // negative = expense, positive = income (engine convention)
  category: string;
  transaction_date: string; // YYYY-MM-DD
  description: string;
}

// Merchant keyword map, mirroring the WhatsApp categoriser so a Screwfix card
// payment and a Screwfix receipt land in the same category. Kept local (rather
// than importing lib/waintents) so this module stays framework free too, and
// covered by tests that assert the two stay aligned.
const CATEGORY_MAP: Array<[RegExp, string]> = [
  [/\b(shell|bp|esso|texaco|gulf|applegreen|fuel|petrol|diesel)\b/i, 'fuel'],
  [/\b(screwfix|toolstation|wickes|b ?& ?q|jewson|travis perkins|selco|buildbase|mkm|howdens|city plumbing|plumb ?center)\b/i, 'materials'],
  [/\b(machine mart|its\b|toolstop|sgs)\b/i, 'tools'],
  [/\b(insurance|axa|aviva|admiral|direct line|simply business)\b/i, 'insurance'],
  [/\b(ee|o2|vodafone|three|giffgaff|bt group|plusnet|sky|virgin media|broadband)\b/i, 'phone'],
  [/\b(ringgo|justpark|ncp|parking|dartford|congestion|tfl|trainline)\b/i, 'travel'],
  [/\b(dvla|mot|kwik ?fit|halfords|ats euromaster|national tyres)\b/i, 'van'],
  [/\b(greggs|mcdonald|costa|starbucks|subway|kfc|cafe|coffee)\b/i, 'meals'],
];

export function categoriseBankLine(text: string): string {
  for (const [re, cat] of CATEGORY_MAP) if (re.test(text)) return cat;
  return 'other';
}

// Map one settled TrueLayer transaction to our transactions row. Direction
// comes from transaction_type (DEBIT is money out), never from the sign of
// amount, because providers differ on signing. The stable
// normalised_provider_transaction_id is preferred for idempotency; TrueLayer
// documents that transaction_id itself may change between requests.
// Returns null when the line is unusable.
export function mapBankTransaction(t: BankTransaction): MappedBankEntry | null {
  const id = t.normalised_provider_transaction_id || t.provider_transaction_id || t.transaction_id;
  if (!id) return null;
  const raw = Number(t.amount);
  if (!Number.isFinite(raw) || raw === 0) return null;
  const currency = (t.currency ?? 'GBP').toUpperCase();
  if (currency !== 'GBP') return null;
  const type = (t.transaction_type ?? '').toUpperCase();
  if (type !== 'DEBIT' && type !== 'CREDIT') return null;
  const date = (t.timestamp ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const description = (t.description ?? '').trim();
  const vendor = (t.merchant_name?.trim() || description || 'Bank transaction').slice(0, 120);
  const magnitude = Math.round(Math.abs(raw) * 100) / 100;
  const amount = type === 'DEBIT' ? -magnitude : magnitude;
  const category = type === 'CREDIT' ? 'income' : categoriseBankLine(`${vendor} ${description}`);

  return {
    external_id: `bank:${id}`.slice(0, 180),
    vendor,
    amount,
    category,
    transaction_date: date,
    description: description.slice(0, 280),
  };
}

// True when a bank line looks like a capture the user already sent on WhatsApp:
// same direction, amount within 5p, date within 3 days. Used to skip the bank
// copy so a receipt photo and its card payment never double count.
export function matchesCapture(
  entry: { amount: number; transaction_date: string },
  capture: { amount: number; transaction_date: string | null },
): boolean {
  const a = Number(entry.amount);
  const b = Number(capture.amount);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (Math.sign(a) !== Math.sign(b)) return false;
  if (Math.abs(Math.abs(a) - Math.abs(b)) > 0.05) return false;
  const d1 = new Date(`${entry.transaction_date}T00:00:00Z`).getTime();
  const d2 = new Date(`${(capture.transaction_date ?? '').slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return false;
  return Math.abs(d1 - d2) <= 3 * 24 * 3600 * 1000;
}
