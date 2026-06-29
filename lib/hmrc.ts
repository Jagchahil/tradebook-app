// lib/hmrc.ts — Making Tax Digital for Income Tax (MTD ITSA) integration.
//
// SANDBOX-FIRST AND DORMANT. This is the path that turns "we prepared your
// quarter" into "it is filed". It is built to HMRC's documented shape and points
// at HMRC's SANDBOX by default. It will not, and must not, submit to the live
// service until two things are true:
//   1. Lekhio is recognised by HMRC as MTD-compatible software (see doc 48/55).
//   2. Live production credentials are set in the environment.
// Until then every call is either dormant (no credentials) or hits the sandbox.
//
// Non-negotiables, enforced in code below:
//   - We PREPARE, the user APPROVES. No submission happens without an explicit
//     approved === true from the user. The gate is built before the automation.
//   - Submission goes via the MTD-recognised path only.
//   - We never imply HMRC endorsement.
//
// Env vars (all optional; absent = dormant):
//   HMRC_BASE_URL        defaults to the sandbox, https://test-api.service.hmrc.gov.uk
//   HMRC_CLIENT_ID       OAuth client id from the HMRC Developer Hub
//   HMRC_CLIENT_SECRET   OAuth client secret
//   HMRC_REDIRECT_URI    the OAuth redirect back into Lekhio
//
// No SDK. Raw fetch, same as the rest of the codebase.

const SANDBOX = 'https://test-api.service.hmrc.gov.uk';
const BASE = process.env.HMRC_BASE_URL || SANDBOX;
const CLIENT_ID = process.env.HMRC_CLIENT_ID;
const CLIENT_SECRET = process.env.HMRC_CLIENT_SECRET;
const REDIRECT_URI = process.env.HMRC_REDIRECT_URI;

export function isHmrcConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

export function isLiveHmrc(): boolean {
  return BASE.includes('://api.service.hmrc.gov.uk');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- OAuth 2.0 (user-restricted endpoints) ---------------------------------

// The URL we send the user to so they can grant Lekhio permission to file for
// them. Scope covers reading and writing their Self Assessment data.
export function authorizeUrl(state: string): string | null {
  if (!CLIENT_ID || !REDIRECT_URI) return null;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: 'read:self-assessment write:self-assessment',
    state,
    redirect_uri: REDIRECT_URI,
  });
  return `${BASE.replace('test-api', 'test-www').replace('//api.', '//www.')}/oauth/authorize?${params.toString()}`;
}

interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCodeForToken(code: string): Promise<TokenSet | null> {
  if (!isHmrcConfigured()) return null;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID as string,
    client_secret: CLIENT_SECRET as string,
    redirect_uri: REDIRECT_URI as string,
    code,
  });
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    console.error('[hmrc] token exchange failed:', res.status);
    return null;
  }
  return (await res.json()) as TokenSet;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet | null> {
  if (!isHmrcConfigured()) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID as string,
    client_secret: CLIENT_SECRET as string,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  return (await res.json()) as TokenSet;
}

// --- Fraud prevention headers (mandatory on every MTD call) -----------------
// HMRC require Gov-Client-* and Gov-Vendor-* headers so they can see the origin
// of a submission. This is the documented minimum for a server-hosted vendor.
// The values come from the request context, never invented. Missing context is
// sent as the literal HMRC expects rather than a guess.

export interface FraudContext {
  deviceId?: string; // a stable per-user id we generate, not personal data
  userIpAddress?: string; // the end user's public IP, from the request
  userAgent?: string;
  vendorVersion?: string;
}

export function fraudPreventionHeaders(ctx: FraudContext): Record<string, string> {
  const h: Record<string, string> = {
    'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
    'Gov-Vendor-Product-Name': 'Lekhio',
    'Gov-Vendor-Version': `lekhio=${ctx.vendorVersion || '1.0.0'}`,
  };
  if (ctx.deviceId) h['Gov-Client-Device-ID'] = ctx.deviceId;
  if (ctx.userIpAddress) h['Gov-Client-Public-IP'] = ctx.userIpAddress;
  if (ctx.userAgent) h['Gov-Client-User-Agent'] = ctx.userAgent;
  return h;
}

// --- Quarterly periodic update: build the payload from our transactions -----
// Software's job (per HMRC) is to turn transactions into summary totals. We map
// each Lekhio category to the MTD self-employment field, then emit the documented
// shape. Traders under the £90,000 turnover line may send a single consolidated
// expenses figure; everyone else sends the category breakdown.

export interface SimpleTxn {
  amount: number; // positive income, negative expense
  category?: string | null;
}

// Lekhio category -> MTD self-employment expense field.
const EXPENSE_MAP: Record<string, string> = {
  materials: 'costOfGoods',
  tools: 'costOfGoods',
  stock: 'costOfGoods',
  subcontractor: 'paymentsToSubcontractors',
  cis: 'paymentsToSubcontractors',
  wages: 'wagesAndStaffCosts',
  staff: 'wagesAndStaffCosts',
  fuel: 'carVanTravelExpenses',
  mileage: 'carVanTravelExpenses',
  van: 'carVanTravelExpenses',
  travel: 'carVanTravelExpenses',
  home: 'premisesRunningCosts',
  home_office: 'premisesRunningCosts',
  premises: 'premisesRunningCosts',
  rent: 'premisesRunningCosts',
  insurance: 'premisesRunningCosts',
  phone: 'adminCosts',
  admin: 'adminCosts',
  stationery: 'adminCosts',
  software: 'adminCosts',
  advertising: 'advertisingCosts',
  marketing: 'advertisingCosts',
  accountancy: 'professionalFees',
  professional: 'professionalFees',
  legal: 'professionalFees',
  interest: 'interestOnBankOtherLoans',
  bank: 'financeCharges',
  other: 'otherExpenses',
  meals: 'otherExpenses',
};

export interface PeriodicUpdate {
  periodDates: { periodStartDate: string; periodEndDate: string };
  periodIncome: { turnover: number; other: number };
  periodExpenses: Record<string, number>;
}

export function buildPeriodicUpdate(
  txns: SimpleTxn[],
  periodStartDate: string,
  periodEndDate: string,
  opts: { consolidated?: boolean } = {},
): PeriodicUpdate {
  let turnover = 0;
  const expenseTotals: Record<string, number> = {};
  let consolidatedTotal = 0;

  for (const t of txns) {
    const amt = Number(t.amount) || 0;
    if (amt >= 0) {
      turnover += amt;
      continue;
    }
    const expense = Math.abs(amt);
    consolidatedTotal += expense;
    const field = EXPENSE_MAP[(t.category || 'other').toLowerCase()] || 'otherExpenses';
    expenseTotals[field] = round2((expenseTotals[field] || 0) + expense);
  }

  const periodExpenses = opts.consolidated
    ? { consolidatedExpenses: round2(consolidatedTotal) }
    : expenseTotals;

  return {
    periodDates: { periodStartDate, periodEndDate },
    periodIncome: { turnover: round2(turnover), other: 0 },
    periodExpenses,
  };
}

// --- Submission (guarded) ---------------------------------------------------
// THE GATE. Nothing reaches HMRC unless the user has explicitly approved this
// exact submission. The flag is not a default and not derivable from anything
// the system decides on its own.

export interface SubmitArgs {
  nino: string; // the taxpayer's National Insurance number
  businessId: string;
  taxYear: string; // e.g. '2026-27'
  accessToken: string;
  payload: PeriodicUpdate;
  approved: boolean; // must be explicitly true
  fraud: FraudContext;
}

export class ApprovalRequiredError extends Error {
  constructor() {
    super('HMRC submission requires explicit user approval. Nothing was sent.');
    this.name = 'ApprovalRequiredError';
  }
}

export async function submitQuarterlyUpdate(args: SubmitArgs): Promise<{ ok: boolean; status: number; body?: unknown }> {
  if (args.approved !== true) throw new ApprovalRequiredError();
  if (!isHmrcConfigured()) return { ok: false, status: 0, body: 'hmrc_not_configured' };

  // Self Employment Business (MTD) API, create/amend the period summary.
  const url = `${BASE}/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/period/${encodeURIComponent(args.taxYear)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: 'application/vnd.hmrc.3.0+json',
      'Content-Type': 'application/json',
      ...fraudPreventionHeaders(args.fraud),
    },
    body: JSON.stringify(args.payload),
  });
  const body = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, body };
}

// Retrieve the user's quarterly and final obligations (what is due, and when).
export async function retrieveObligations(nino: string, accessToken: string, fraud: FraudContext): Promise<unknown | null> {
  if (!isHmrcConfigured()) return null;
  const url = `${BASE}/obligations/details/${encodeURIComponent(nino)}/income-and-expenditure`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.hmrc.2.0+json',
      ...fraudPreventionHeaders(fraud),
    },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// Final declaration (crystallisation) also runs behind the approval gate. Built
// here as the explicit guarded entry point; the calculation id comes from the
// Individual Calculations API once that step is wired for live use.
export async function submitFinalDeclaration(args: {
  nino: string;
  taxYear: string;
  calculationId: string;
  accessToken: string;
  approved: boolean;
  fraud: FraudContext;
}): Promise<{ ok: boolean; status: number }> {
  if (args.approved !== true) throw new ApprovalRequiredError();
  if (!isHmrcConfigured()) return { ok: false, status: 0 };
  const url = `${BASE}/individuals/calculations/${encodeURIComponent(args.nino)}/self-assessment/${encodeURIComponent(args.taxYear)}/${encodeURIComponent(args.calculationId)}/final-declaration`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: 'application/vnd.hmrc.5.0+json',
      ...fraudPreventionHeaders(args.fraud),
    },
  });
  return { ok: res.ok, status: res.status };
}
