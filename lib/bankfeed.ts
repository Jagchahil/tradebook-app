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

// The OAuth redirect_uri. It must EXACTLY match a redirect URI registered in the
// TrueLayer console, and it points at the API host that serves /api/bank/callback,
// which is NOT necessarily the public marketing site (NEXT_PUBLIC_APP_URL is now
// lekhio.app, but the callback lives on the app deployment). Defined ONCE so the
// authorize link and the token exchange can never drift out of step, and set
// explicitly by BANK_REDIRECT_URI so a change to the public site URL can never
// silently break the bank connect flow with an "Invalid redirect_uri".
const REDIRECT_URI =
  process.env.BANK_REDIRECT_URI ??
  `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tradebook-app-five.vercel.app'}/api/bank/callback`;

export function hasBankFeedConfig(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

// --- TrueLayer transport resilience ------------------------------------------
//
// Every call to TrueLayer goes through this helper so a rate limit (429), a
// server blip (5xx), a slow socket, or a dropped connection never surfaces as a
// permanent failure to the sync. At 20,000 connections a day the odds of hitting
// at least one transient TrueLayer error per run are effectively 100%, so retry
// with backoff is not optional, it is load bearing.
//
// Behaviour:
//   . Each attempt is bounded by AbortSignal.timeout(timeoutMs), so a hung
//     socket can never stall a whole sync run past its budget.
//   . On HTTP 429 or any 5xx, or on a thrown network/timeout error, we back off
//     and retry, up to `retries` attempts total. Backoff is exponential with
//     jitter, and honours a numeric Retry-After header when TrueLayer sends one.
//   . 4xx other than 429 (e.g. 400, 401) is returned to the caller as is, since
//     those are real, non transient answers that retrying would not fix.
//   . After the final attempt we return the last Response (so the caller can
//     read its status) or, if every attempt threw, we return null.
//
// The caller decides what a null or an error status means for connection state;
// this helper only owns the transport.
interface TrueLayerFetchOptions {
  retries?: number;
  timeoutMs?: number;
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
  // Honour a server supplied Retry-After (seconds) when present and sane.
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0 && secs <= 60) return secs * 1000;
  }
  // Otherwise exponential backoff (base 500ms) with full jitter, capped at 8s.
  const base = Math.min(500 * 2 ** attempt, 8000);
  return Math.floor(Math.random() * base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function truelayerFetch(
  url: string,
  init: RequestInit = {},
  { retries = 3, timeoutMs = 10_000 }: TrueLayerFetchOptions = {},
): Promise<Response | null> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      // Retry only on 429 and 5xx. Everything else (2xx success, or a real 4xx
      // like 400/401) is a final answer we hand straight back to the caller.
      if (res.status !== 429 && res.status < 500) return res;
      lastResponse = res;
      // No point sleeping after the final attempt; fall out and return it.
      if (attempt < retries - 1) {
        await sleep(backoffDelayMs(attempt, res.headers.get('retry-after')));
      }
    } catch {
      // Network error, DNS failure, or AbortSignal.timeout firing. All transient.
      lastResponse = null;
      if (attempt < retries - 1) {
        await sleep(backoffDelayMs(attempt, null));
      }
    }
  }
  // Exhausted all attempts. Return the last transient Response (429/5xx) so the
  // caller can distinguish it, or null when every attempt threw.
  return lastResponse;
}

// The sandbox Mock Bank ships STATIC transactions dated years in the past, so
// date-bounded syncs there return nothing. The sync uses this to drop the date
// bound in sandbox while keeping it for real banks.
export function isSandbox(): boolean {
  return SANDBOX;
}

// --- How much history to import (data minimisation) ---------------------------
// We only ever pull what tax needs. The user chooses at connect time, and the
// default is the current tax year only, never a person's whole banking history.
export type BankHistory = 'this_year' | 'two_years' | 'all';

// The UK tax year containing `now` starts on 6 April.
export function taxYearStartISO(now: Date = new Date()): string {
  const y = now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 6) ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${y}-04-06`;
}

// The from-date for a chosen depth. Always a concrete date, so a stored value is
// never ambiguous: 'this_year' is the current tax year (the default and the
// minimum), 'two_years' reaches back to the start of the previous tax year, and
// 'all' uses a far past date to mean everything the bank will give.
export function historyFromISO(choice: BankHistory, now: Date = new Date()): string {
  if (choice === 'all') return '2015-01-01';
  const start = taxYearStartISO(now);
  if (choice === 'two_years') return `${Number(start.slice(0, 4)) - 1}-04-06`;
  return start;
}

// The hosted auth dialog link. TrueLayer runs the bank picker itself, so the
// app never needs an institutions list. `state` is our HMAC signed user state,
// which the callback verifies; scope includes offline_access so we receive a
// refresh token and the daily sync can run without the user present. In the
// sandbox the Mock Bank is included so the whole loop can be walked without a
// real bank account.
export function buildAuthLink(state: string): string | null {
  if (!CLIENT_ID) return null;
  const redirect = REDIRECT_URI;
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
  const redirect = REDIRECT_URI;
  try {
    const res = await truelayerFetch(`${AUTH_BASE}/connect/token`, {
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
    // truelayerFetch returns null when every attempt threw (transient network),
    // or a Response we still check for a non ok status (a genuine bad code).
    if (!res || !res.ok) {
      if (res) console.error('[bankfeed] code exchange failed:', res.status);
      return null;
    }
    return toTokenSet((await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number });
  } catch {
    return null;
  }
}

// Refresh an expired access token ahead of a sync run.
//
// Return contract matters for how the caller treats the connection:
//   TokenSet  -> success
//   null      -> GENUINE auth failure (consent lapsed / invalid_grant): safe to
//                mark the connection expired and prompt a reconnect.
//   'retry'   -> TRANSIENT failure (429 rate limit, 5xx, network, or a missing
//                client config): the consent is probably fine, so the caller
//                must NOT expire the connection -- just try again next run.
// Conflating the two is what would wrongly nag a user to reconnect a healthy
// bank the moment TrueLayer rate-limits or blips.
export type RefreshOutcome = TokenSet | 'retry' | null;

export async function refreshAccess(refreshToken: string): Promise<RefreshOutcome> {
  // Missing client credentials is an ops problem, not the user's lapsed consent.
  // Treat as transient so a misconfig never mass-expires every connection.
  if (!CLIENT_ID || !CLIENT_SECRET) return 'retry';
  try {
    const res = await truelayerFetch(`${AUTH_BASE}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
      }).toString(),
    });
    // Every attempt threw (network/DNS/timeout, or 429/5xx that never recovered
    // within the retry budget). Transient by definition, so never expire.
    if (!res) return 'retry';
    if (!res.ok) {
      console.error('[bankfeed] token refresh failed:', res.status);
      // Only 400/401 (invalid_grant, revoked/expired consent) is a real auth
      // failure. Everything else that survived the retries (a 429/5xx that was
      // still failing on the final attempt) is transient -> retry.
      return res.status === 400 || res.status === 401 ? null : 'retry';
    }
    return toTokenSet((await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number }, refreshToken);
  } catch {
    // Reading the body threw. Treat as transient, never expire on this.
    return 'retry';
  }
}

// The user's connected accounts, plus the bank's display name so the app can
// show which bank is connected on the settings card.
export interface BankAccounts {
  ids: string[];
  bankName: string | null;
}

export async function listAccounts(accessToken: string): Promise<BankAccounts | null> {
  try {
    const res = await truelayerFetch(`${API_BASE}/data/v1/accounts`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    // null (all attempts threw) or a non ok status both mean skip cleanly; the
    // caller treats a null account list as "nothing to sync", never corrupting
    // stored state on a transient blip.
    if (!res || !res.ok) {
      if (res) console.error('[bankfeed] accounts fetch failed:', res.status);
      return null;
    }
    const data = (await res.json()) as {
      results?: Array<{ account_id?: string; provider?: { display_name?: string } }>;
    };
    if (!Array.isArray(data.results)) return null;
    return {
      ids: data.results.map((a) => a.account_id).filter((id): id is string => Boolean(id)),
      bankName: data.results[0]?.provider?.display_name?.trim() || null,
    };
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
    const res = await truelayerFetch(`${API_BASE}/data/v1/accounts/${encodeURIComponent(accountId)}/transactions${qs}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    // null (all attempts threw) or a non ok status: return null so the caller
    // skips this account for the run without marking the connection unhealthy.
    if (!res || !res.ok) {
      if (res) console.error('[bankfeed] transactions fetch failed:', res.status);
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
  // Set by the brain (lib/memory.ts) during sync, when the user has already told us
  // this vendor is not business money. It arrives out of the tax figures rather
  // than having to be corrected all over again. Still unconfirmed either way: the
  // approval gate is untouched.
  is_personal?: boolean;
  // Set at import by the rules-based detector (lib/personal.ts) on EVERY line, known vendor or
  // not. This does NOT take the money out of the books: that is his call, and getting it wrong
  // in this direction (excluding a real supplier refund) makes him under-declare income, which
  // is a worse thing to be wrong about than paying a bit too much tax.
  //
  // What it does is make the line UNSWEEPABLE. Nothing flagged here can ever be swept up by a
  // bulk confirm, however fast he is going. He gets asked, once, plainly.
  looks_personal?: boolean;
}

// Merchant keyword map, mirroring the WhatsApp categoriser so a Screwfix card
// payment and a Screwfix receipt land in the same category. Kept local (rather
// than importing lib/waintents) so this module stays framework free too, and
// covered by tests that assert the two stay aligned.
// THE VENDOR RULES LIVE IN lib/categories.ts. There is not a second copy here.
//
// There used to be an eight regex CATEGORY_MAP in this file. It knew the fuel majors and the big
// merchants and almost nothing else, so a real statement (Amazon, eBay, the local merchant, the
// skip, the accountant, the tool hire) landed almost entirely as "other". "Other" means no
// suggestion, and no suggestion means he picks the category by hand. The review deck we built to
// save him two hundred taps would have handed most of them straight back.
//
// It is re-exported so nothing that imported it from here has to change.
// THE VENDOR RULES ARE INJECTED, NOT IMPORTED.
//
// The node test runner loads these lib files directly, and Node's ESM cannot resolve an
// extensionless sibling import, so `import from './categories'` breaks this file's own test
// suite. And I am NOT keeping a second copy of the rules here: two definitions of the same fact
// always drift, and one of them (TX_COLS vs TX_SELECT) drifted far enough tonight to break the
// undo completely.
//
// So the caller supplies the categoriser. banksync passes the real one; the test passes the real
// one too, which means the REAL rules are what gets tested. Same pattern as lib/reviewpile.ts.
export type Categoriser = (text: string) => string;

// A mapper with no categoriser does not GUESS. It says it does not know, which is the truthful
// answer and leaves the user to be asked.
const UNKNOWN: Categoriser = () => 'other';

// Map one settled TrueLayer transaction to our transactions row. Direction
// comes from transaction_type (DEBIT is money out), never from the sign of
// amount, because providers differ on signing. The stable
// normalised_provider_transaction_id is preferred for idempotency; TrueLayer
// documents that transaction_id itself may change between requests.
// Returns null when the line is unusable.
export function mapBankTransaction(t: BankTransaction, categorise: Categoriser = UNKNOWN): MappedBankEntry | null {
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
  const category = type === 'CREDIT' ? 'income' : categorise(`${vendor} ${description}`);

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
// SUPERSEDED. DO NOT WIRE THIS BACK IN. Use findDuplicate in lib/dedupe.ts.
//
// This matched on the AMOUNT and the DATE and nothing else. It never looked at the
// vendor. So a £42.60 card payment at Screwfix and a £42.60 receipt from Shell,
// three days apart, were treated as the same purchase, and one of them was silently
// dropped. That is a real cost deleted from a man's books, and a tax bill raised,
// with no message and no way for him to notice.
//
// It also only ever ran in one direction (a bank line arriving after a receipt), so
// the common case, where the bank feed lands first and the photo comes that evening,
// was never checked at all and simply double counted.
//
// lib/dedupe.ts requires the SAME SHOP, using the same vendor normalisation the
// brain learns with, and refuses to merge anything it cannot vouch for. Kept here
// only because its tests document the old tolerances.
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
