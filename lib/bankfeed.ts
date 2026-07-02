// lib/bankfeed.ts. Open Banking bank feeds via GoCardless Bank Account Data
// (the API formerly Nordigen). Read only account information: the user connects
// their bank through GoCardless's hosted consent journey, and a daily sync pulls
// new transactions into the normal `transactions` table as UNCONFIRMED entries.
// The approval gate is untouched: nothing counts toward tax until the user
// confirms it in the app, exactly like a WhatsApp capture.
//
// DORMANT BY DEFAULT. Without BANK_SECRET_ID and BANK_SECRET_KEY in the
// environment every entry point returns null or false and no user visible
// surface changes. Same pattern as lib/hmrc.ts and Stripe. Verified against the
// GoCardless Bank Account Data quickstart on 2 July 2026 (doc 77).
//
// GDPR gates before this goes live with real users (doc 77): ICO registration
// and a privacy policy update naming GoCardless as the AIS provider. Sandbox
// (institution SANDBOXFINANCE_SFIN0000) is fine before that.
//
// No SDK. Raw fetch, same as the rest of the codebase. Tokens are minted per
// run from the server side secrets and never stored or logged.

const BASE = 'https://bankaccountdata.gocardless.com/api/v2';
const SECRET_ID = process.env.BANK_SECRET_ID;
const SECRET_KEY = process.env.BANK_SECRET_KEY;

export function hasBankFeedConfig(): boolean {
  return Boolean(SECRET_ID && SECRET_KEY);
}

// Mint a fresh access token: secrets -> refresh token -> access token. Two
// calls, stateless, nothing persisted. The sync runs once a day, so the extra
// round trip is irrelevant and we never hold a long lived credential in the DB.
export async function getAccessToken(): Promise<string | null> {
  if (!SECRET_ID || !SECRET_KEY) return null;
  try {
    const newRes = await fetch(`${BASE}/token/new/`, {
      method: 'POST',
      headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_id: SECRET_ID, secret_key: SECRET_KEY }),
    });
    if (!newRes.ok) {
      console.error('[bankfeed] token/new failed:', newRes.status);
      return null;
    }
    const { refresh } = (await newRes.json()) as { refresh?: string };
    if (!refresh) return null;
    const refRes = await fetch(`${BASE}/token/refresh/`, {
      method: 'POST',
      headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!refRes.ok) {
      console.error('[bankfeed] token/refresh failed:', refRes.status);
      return null;
    }
    const { access } = (await refRes.json()) as { access?: string };
    return access ?? null;
  } catch (err) {
    console.error('[bankfeed] token error:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

export interface BankInstitution {
  id: string;
  name: string;
  logo: string | null;
}

// UK institutions for the bank picker. The app renders name and logo only.
export async function listInstitutions(accessToken: string): Promise<BankInstitution[] | null> {
  try {
    const res = await fetch(`${BASE}/institutions/?country=gb`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ id: string; name: string; logo?: string }>;
    if (!Array.isArray(rows)) return null;
    return rows.map((r) => ({ id: r.id, name: r.name, logo: r.logo ?? null }));
  } catch {
    return null;
  }
}

export interface CreatedRequisition {
  id: string;
  link: string;
}

// Create the consent journey. `redirect` is where GoCardless sends the user
// after their bank authentication; we pass our callback with a signed state so
// the callback can bind the requisition to the right user without trusting any
// client supplied id. Default agreement terms apply (90 days history and
// access, full scope), which is exactly what we want.
export async function createRequisition(
  accessToken: string,
  institutionId: string,
  redirect: string,
  reference: string,
): Promise<CreatedRequisition | null> {
  try {
    const res = await fetch(`${BASE}/requisitions/`, {
      method: 'POST',
      headers: { accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ redirect, institution_id: institutionId, reference, user_language: 'EN' }),
    });
    if (!res.ok) {
      console.error('[bankfeed] create requisition failed:', res.status);
      return null;
    }
    const data = (await res.json()) as { id?: string; link?: string };
    if (!data.id || !data.link) return null;
    return { id: data.id, link: data.link };
  } catch {
    return null;
  }
}

export interface RequisitionState {
  status: string; // 'LN' means linked
  accounts: string[];
}

export async function getRequisition(accessToken: string, requisitionId: string): Promise<RequisitionState | null> {
  try {
    const res = await fetch(`${BASE}/requisitions/${encodeURIComponent(requisitionId)}/`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string; accounts?: string[] };
    return { status: data.status ?? '', accounts: Array.isArray(data.accounts) ? data.accounts : [] };
  } catch {
    return null;
  }
}

// The raw booked transaction shape GoCardless returns (bank data is bank data:
// fields vary by institution, so everything is optional and defensively read).
export interface BankTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  transactionAmount?: { amount?: string; currency?: string };
  bookingDate?: string;
  valueDate?: string;
  remittanceInformationUnstructured?: string;
  creditorName?: string;
  debtorName?: string;
}

export async function getBookedTransactions(
  accessToken: string,
  accountId: string,
  dateFrom?: string,
): Promise<BankTransaction[] | null> {
  try {
    const qs = dateFrom ? `?date_from=${encodeURIComponent(dateFrom)}` : '';
    const res = await fetch(`${BASE}/accounts/${encodeURIComponent(accountId)}/transactions/${qs}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('[bankfeed] transactions fetch failed:', res.status);
      return null;
    }
    const data = (await res.json()) as { transactions?: { booked?: BankTransaction[] } };
    return Array.isArray(data.transactions?.booked) ? data.transactions!.booked! : null;
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

// Map one booked bank transaction to our transactions row. Returns null when
// the line is unusable (no id, no amount, not GBP, or an unreadable date).
export function mapBankTransaction(t: BankTransaction): MappedBankEntry | null {
  const id = t.transactionId || t.internalTransactionId;
  if (!id) return null;
  const amt = parseFloat(t.transactionAmount?.amount ?? '');
  if (!Number.isFinite(amt) || amt === 0) return null;
  const currency = (t.transactionAmount?.currency ?? 'GBP').toUpperCase();
  if (currency !== 'GBP') return null;
  const date = t.bookingDate || t.valueDate || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const remittance = (t.remittanceInformationUnstructured ?? '').trim();
  // Money out names the payee (creditor); money in names the payer (debtor).
  const counterparty = (amt < 0 ? t.creditorName : t.debtorName)?.trim() || '';
  const vendor = (counterparty || remittance || 'Bank transaction').slice(0, 120);
  const category = amt >= 0 ? 'income' : categoriseBankLine(`${vendor} ${remittance}`);

  return {
    external_id: `bank:${id}`.slice(0, 180),
    vendor,
    amount: Math.round(amt * 100) / 100,
    category,
    transaction_date: date,
    description: remittance.slice(0, 280),
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
