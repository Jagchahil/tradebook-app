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

import crypto from 'crypto';

const SANDBOX = 'https://test-api.service.hmrc.gov.uk';
const BASE = process.env.HMRC_BASE_URL || SANDBOX;
const CLIENT_ID = process.env.HMRC_CLIENT_ID;
const CLIENT_SECRET = process.env.HMRC_CLIENT_SECRET;
const REDIRECT_URI = process.env.HMRC_REDIRECT_URI;

// --- OAuth state (CSRF + carries which user is connecting) ------------------
// The connect flow happens in a browser, away from the app's auth session, so
// the `state` parameter has to round-trip the user id back to the callback. We
// sign it (HMAC) with a server-only secret and expire it, so it cannot be forged
// or replayed. Never put the raw user id on the wire without the signature.
// No hardcoded fallback. The signing secret must come from the environment, or
// the flow fails closed (cannot sign or verify). A literal default would be in
// the public repo and let anyone forge a state for any user. Prefer a dedicated
// HMRC_STATE_SECRET; fall back only to the server-only service-role key.
const STATE_SECRET = process.env.HMRC_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const STATE_TTL_MS = 15 * 60 * 1000;

export function signState(userId: string): string {
  if (!STATE_SECRET) return '';
  const ts = Date.now().toString(36);
  const payload = `${userId}.${ts}`;
  const sig = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex').slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyState(state: string): string | null {
  if (!STATE_SECRET) return null;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 3) return null;
    const [userId, ts, sig] = parts;
    const expected = crypto.createHmac('sha256', STATE_SECRET).update(`${userId}.${ts}`).digest('hex').slice(0, 32);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Date.now() - parseInt(ts, 36) > STATE_TTL_MS) return null;
    return userId;
  } catch {
    return null;
  }
}

export function isHmrcConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

export function isLiveHmrc(): boolean {
  return BASE.includes('://api.service.hmrc.gov.uk');
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- OAuth 2.0 (user-restricted endpoints) ---------------------------------

// HMRC's OAuth authorize endpoint lives on a DIFFERENT host from the API/token
// endpoint: the token host is (test-api|api).service.hmrc.gov.uk, but the user
// is sent to the GOV.UK tax service to sign in and grant access. Note the sign-in
// host is (test-www|www).tax.service.gov.uk, with NO "hmrc" in it, unlike the API
// host. Getting this wrong makes the connect link fail to resolve (NXDOMAIN), so
// derive it explicitly. Verified against HMRC's user-restricted-endpoints docs.
function authorizeBase(): string {
  return isLiveHmrc()
    ? 'https://www.tax.service.gov.uk'
    : 'https://test-www.tax.service.gov.uk';
}

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
  return `${authorizeBase()}/oauth/authorize?${params.toString()}`;
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
// HMRC require a full set of Gov-Client-* and Gov-Vendor-* headers on the
// WEB_APP_VIA_SERVER connection method so they can see the origin of a
// submission. This is NOT a "minimum" of three; HMRC's "Test Fraud Prevention
// Headers" validator (and recognition) expects the complete set below. Some
// values can only be collected in the user's browser (JS user agent, screen and
// window geometry, timezone, public TCP port, MFA state) and must be captured
// client-side and passed through to the server. The rest the server derives from
// the request (public IPs, timestamp, forwarded chain) or from config (device id,
// product name, version, user id). We SEND what we have and never invent a value;
// where the browser could not supply one, omitting it is HMRC's documented
// "unable to collect" behaviour, better than a fabricated value.
//
// Reference: developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/web-app-via-server
//
// Formats that matter (enforced below):
//   - percent-encode keys and values, but NOT the separators (= & , )
//   - Gov-Vendor-Version and Gov-Vendor-License-IDs use software=value pairs
//   - Gov-Client-Public-IP-Timestamp is yyyy-MM-ddThh:mm:ss.sssZ (UTC)
//   - Gov-Vendor-Forwarded lists by=<vendorIP>&for=<clientIP> per internet hop

const pe = (s: string) => encodeURIComponent(s);

export interface FraudContext {
  // Server-derivable (from the incoming request / config):
  deviceId?: string; // stable per-device UUID we generate and persist, not PII
  userId?: string; // our internal user id, for Gov-Client-User-IDs (lekhio=<id>)
  clientPublicIp?: string; // the end user's public IP, from the request
  clientPublicIpTimestamp?: string; // ISO ms UTC; defaults to now if IP present
  vendorPublicIp?: string; // the public IP HMRC received our request on
  vendorVersion?: string; // our software version, e.g. '1.0.0'
  vendorProductName?: string; // defaults to 'Lekhio'
  // Client-collected (must be gathered in the browser and forwarded):
  clientPublicPort?: string; // the client's public TCP source port
  browserJsUserAgent?: string; // navigator.userAgent from the browser
  screens?: string; // pre-formatted, e.g. 'width=1920&height=1080&scaling-factor=1&colour-depth=24'
  windowSize?: string; // pre-formatted, e.g. 'width=1256&height=803'
  timezone?: string; // e.g. 'UTC+00:00'
  multiFactor?: string; // pre-formatted MFA list, omit if none
  licenseIds?: string; // pre-formatted vendor license pairs, omit if none
}

export function fraudPreventionHeaders(ctx: FraudContext): Record<string, string> {
  const h: Record<string, string> = {
    'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
    'Gov-Vendor-Product-Name': pe(ctx.vendorProductName || 'Lekhio'),
    'Gov-Vendor-Version': `lekhio-web=${pe(ctx.vendorVersion || '1.0.0')}`,
  };

  if (ctx.deviceId) h['Gov-Client-Device-ID'] = ctx.deviceId;
  if (ctx.userId) h['Gov-Client-User-IDs'] = `lekhio=${pe(ctx.userId)}`;

  if (ctx.clientPublicIp) {
    h['Gov-Client-Public-IP'] = ctx.clientPublicIp;
    h['Gov-Client-Public-IP-Timestamp'] = ctx.clientPublicIpTimestamp || new Date().toISOString();
    // First internet hop: our server (by) received the client's request (for).
    if (ctx.vendorPublicIp) {
      h['Gov-Vendor-Forwarded'] = `by=${pe(ctx.vendorPublicIp)}&for=${pe(ctx.clientPublicIp)}`;
    }
  }
  if (ctx.vendorPublicIp) h['Gov-Vendor-Public-IP'] = ctx.vendorPublicIp;

  if (ctx.clientPublicPort) h['Gov-Client-Public-Port'] = ctx.clientPublicPort;
  if (ctx.browserJsUserAgent) h['Gov-Client-Browser-JS-User-Agent'] = ctx.browserJsUserAgent;
  if (ctx.screens) h['Gov-Client-Screens'] = ctx.screens;
  if (ctx.windowSize) h['Gov-Client-Window-Size'] = ctx.windowSize;
  if (ctx.timezone) h['Gov-Client-Timezone'] = ctx.timezone;
  if (ctx.multiFactor) h['Gov-Client-Multi-Factor'] = ctx.multiFactor;
  if (ctx.licenseIds) h['Gov-Vendor-License-IDs'] = ctx.licenseIds;

  return h;
}

// Which required WEB_APP_VIA_SERVER headers are still missing from a context.
// Use this in the sandbox against the Test Fraud Prevention Headers API to see
// exactly what the client still needs to collect before recognition.
export function missingFraudHeaders(ctx: FraudContext): string[] {
  const have = fraudPreventionHeaders(ctx);
  const required = [
    'Gov-Client-Connection-Method',
    'Gov-Client-Browser-JS-User-Agent',
    'Gov-Client-Device-ID',
    'Gov-Client-Public-IP',
    'Gov-Client-Public-IP-Timestamp',
    'Gov-Client-Public-Port',
    'Gov-Client-Screens',
    'Gov-Client-Timezone',
    'Gov-Client-User-IDs',
    'Gov-Client-Window-Size',
    'Gov-Vendor-Forwarded',
    'Gov-Vendor-Product-Name',
    'Gov-Vendor-Public-IP',
    'Gov-Vendor-Version',
  ];
  return required.filter((k) => !(k in have));
}

// --- Cumulative period update: build the payload from our transactions ------
// Software's job (per HMRC) is to turn transactions into summary totals. We map
// each Lekhio category to the MTD self-employment field, then emit the documented
// shape. Traders under the £90,000 turnover line may send a single consolidated
// expenses figure; everyone else sends the category breakdown.
//
// CUMULATIVE model (2025-26 onward): feed this the transactions for the WHOLE
// year to date (accounting-period start up to the end of the latest quarter),
// not just the current quarter, and set periodEndDate to the latest quarter end.
// The output is the running year-to-date summary the cumulative endpoint expects.

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
  'use of home': 'premisesRunningCosts',
  use_of_home: 'premisesRunningCosts',
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

  // Self Employment Business (MTD) API v5.0, "Create and Amend a Self-Employment
  // Cumulative Period Summary". From tax year 2025-26 HMRC replaced the old
  // discrete quarterly "period" endpoint with a single CUMULATIVE summary per
  // year: each update carries the running year-to-date totals from the start of
  // the accounting period to the end of the latest quarter, and HMRC recalculates
  // from the most recent submission. So `args.payload` must hold year-to-date
  // figures, not just this quarter. The path and version below are the current
  // ones (verified against the live OAS); the old /period/ + vnd.hmrc.3.0 path is
  // retired for 2025-26 onward.
  const url = `${BASE}/individuals/business/self-employment/${encodeURIComponent(args.nino)}/${encodeURIComponent(args.businessId)}/cumulative/${encodeURIComponent(args.taxYear)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      Accept: 'application/vnd.hmrc.5.0+json',
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
      Accept: 'application/vnd.hmrc.3.0+json',
      ...fraudPreventionHeaders(fraud),
    },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// --- Individual Calculations (MTD) v8.0, year-end estimate and finalisation --
// The year-end journey HMRC's minimum functionality standard requires: trigger a
// calculation, retrieve it to show the user their income tax estimate, then, only
// on explicit approval, crystallise with a final declaration. For tax year
// 2025-26 onward the calculationType values are: in-year, intent-to-finalise,
// intent-to-amend, final-declaration (verified against the live v8.0 OAS). The
// exact success shapes are to be confirmed in sandbox testing.

const CALC_VERSION = 'application/vnd.hmrc.8.0+json';

export type CalculationType = 'in-year' | 'intent-to-finalise' | 'intent-to-amend' | 'final-declaration';

// Trigger a calculation and return the calculationId HMRC assigns. Use this with
// an estimate type (in-year or intent-to-finalise). Final declaration is guarded
// separately below because it is the irreversible crystallisation step.
export async function triggerCalculation(
  nino: string,
  taxYear: string,
  calculationType: Exclude<CalculationType, 'final-declaration'>,
  accessToken: string,
  fraud: FraudContext,
): Promise<{ ok: boolean; status: number; calculationId?: string }> {
  if (!isHmrcConfigured()) return { ok: false, status: 0 };
  const url = `${BASE}/individuals/calculations/${encodeURIComponent(nino)}/self-assessment/${encodeURIComponent(taxYear)}/trigger/${encodeURIComponent(calculationType)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: CALC_VERSION, ...fraudPreventionHeaders(fraud) },
  });
  const body = (await res.json().catch(() => undefined)) as { calculationId?: string } | undefined;
  return { ok: res.ok, status: res.status, calculationId: body?.calculationId };
}

// Retrieve a calculation by id, which carries the income tax estimate we show the
// user (with an accuracy disclaimer) before they decide to finalise.
export async function retrieveCalculation(
  nino: string,
  taxYear: string,
  calculationId: string,
  accessToken: string,
  fraud: FraudContext,
): Promise<unknown | null> {
  if (!isHmrcConfigured()) return null;
  const url = `${BASE}/individuals/calculations/${encodeURIComponent(nino)}/self-assessment/${encodeURIComponent(taxYear)}/${encodeURIComponent(calculationId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: CALC_VERSION, ...fraudPreventionHeaders(fraud) },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// Final declaration (crystallisation), behind the approval gate. The user first
// triggers an intent-to-finalise calculation (triggerCalculation) to get a
// calculationId, reviews the figures, and only then agrees. This POSTs the final
// declaration for that calculation on the Individual Calculations v8.0 API,
// endpoint /{calculationId}/final-declaration. THE GATE: nothing is sent unless
// the user has explicitly approved. govTestScenario is sandbox only (for example
// FINAL_DECLARATION_RECEIVED to simulate a successful submission); it is never set
// in production.
export async function submitFinalDeclaration(args: {
  nino: string;
  taxYear: string;
  calculationId: string;
  accessToken: string;
  approved: boolean;
  fraud: FraudContext;
  govTestScenario?: string;
}): Promise<{ ok: boolean; status: number; body?: unknown }> {
  if (args.approved !== true) throw new ApprovalRequiredError();
  if (!isHmrcConfigured()) return { ok: false, status: 0, body: 'hmrc_not_configured' };
  const url = `${BASE}/individuals/calculations/${encodeURIComponent(args.nino)}/self-assessment/${encodeURIComponent(args.taxYear)}/${encodeURIComponent(args.calculationId)}/final-declaration`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.accessToken}`,
    Accept: CALC_VERSION,
    ...fraudPreventionHeaders(args.fraud),
  };
  if (args.govTestScenario) headers['Gov-Test-Scenario'] = args.govTestScenario;
  const res = await fetch(url, { method: 'POST', headers });
  const body = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, body };
}

// --- Business Source Adjustable Summary (BSAS) v7.0 --------------------------
// The year-end accounting adjustments HMRC's minimum standard requires: trigger a
// summary of the business's figures, retrieve it, then submit any adjustments
// (disallowables, additions) that bring the accounting profit to the taxable one.
// Adjustments change the tax position, so the submit is behind the approval gate.
// Verified against the live BSAS v7.0 OAS. Exact body shapes confirmed in sandbox.

const BSAS_VERSION = 'application/vnd.hmrc.7.0+json';

export async function triggerBsas(args: {
  nino: string;
  taxYear: string;
  businessId: string;
  accountingPeriod: { startDate: string; endDate: string };
  accessToken: string;
  fraud: FraudContext;
}): Promise<{ ok: boolean; status: number; calculationId?: string }> {
  if (!isHmrcConfigured()) return { ok: false, status: 0 };
  const url = `${BASE}/individuals/self-assessment/adjustable-summary/${encodeURIComponent(args.nino)}/trigger`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.accessToken}`, Accept: BSAS_VERSION, 'Content-Type': 'application/json', ...fraudPreventionHeaders(args.fraud) },
    body: JSON.stringify({ accountingPeriod: args.accountingPeriod, typeOfBusiness: 'self-employment', businessId: args.businessId, taxYear: args.taxYear }),
  });
  const body = (await res.json().catch(() => undefined)) as { calculationId?: string } | undefined;
  return { ok: res.ok, status: res.status, calculationId: body?.calculationId };
}

export async function retrieveSelfEmploymentBsas(nino: string, calculationId: string, taxYear: string, accessToken: string, fraud: FraudContext): Promise<unknown | null> {
  if (!isHmrcConfigured()) return null;
  const url = `${BASE}/individuals/self-assessment/adjustable-summary/${encodeURIComponent(nino)}/self-employment/${encodeURIComponent(calculationId)}/${encodeURIComponent(taxYear)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: BSAS_VERSION, ...fraudPreventionHeaders(fraud) } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function submitBsasAdjustments(args: {
  nino: string;
  calculationId: string;
  taxYear: string;
  adjustments: Record<string, unknown>;
  approved: boolean;
  accessToken: string;
  fraud: FraudContext;
}): Promise<{ ok: boolean; status: number; body?: unknown }> {
  if (args.approved !== true) throw new ApprovalRequiredError();
  if (!isHmrcConfigured()) return { ok: false, status: 0, body: 'hmrc_not_configured' };
  const url = `${BASE}/individuals/self-assessment/adjustable-summary/${encodeURIComponent(args.nino)}/self-employment/${encodeURIComponent(args.calculationId)}/adjust/${encodeURIComponent(args.taxYear)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${args.accessToken}`, Accept: BSAS_VERSION, 'Content-Type': 'application/json', ...fraudPreventionHeaders(args.fraud) },
    body: JSON.stringify(args.adjustments),
  });
  const body = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, body };
}

// --- Individual Losses (MTD) v6.0 -------------------------------------------
// Brought forward losses and loss claims (carry forward, or set sideways against
// other income when permitted). These let a trader apply a bad year against a good
// one. Body shapes are passed through so the caller supplies the exact documented
// fields (typeOfLoss, businessId, lossAmount, typeOfClaim, taxYearClaimedFor).
// Verified against the live Individual Losses v6.0 OAS.

const LOSS_VERSION = 'application/vnd.hmrc.6.0+json';

export async function createBroughtForwardLoss(nino: string, taxYearBroughtForwardFrom: string, lossBody: Record<string, unknown>, accessToken: string, fraud: FraudContext): Promise<{ ok: boolean; status: number; lossId?: string }> {
  if (!isHmrcConfigured()) return { ok: false, status: 0 };
  const url = `${BASE}/individuals/losses/${encodeURIComponent(nino)}/brought-forward-losses/tax-year/brought-forward-from/${encodeURIComponent(taxYearBroughtForwardFrom)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: LOSS_VERSION, 'Content-Type': 'application/json', ...fraudPreventionHeaders(fraud) },
    body: JSON.stringify(lossBody),
  });
  const body = (await res.json().catch(() => undefined)) as { lossId?: string } | undefined;
  return { ok: res.ok, status: res.status, lossId: body?.lossId };
}

export async function listBroughtForwardLosses(nino: string, taxYear: string, accessToken: string, fraud: FraudContext): Promise<unknown | null> {
  if (!isHmrcConfigured()) return null;
  const url = `${BASE}/individuals/losses/${encodeURIComponent(nino)}/brought-forward-losses/tax-year/${encodeURIComponent(taxYear)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: LOSS_VERSION, ...fraudPreventionHeaders(fraud) } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

export async function createLossClaim(nino: string, claimBody: Record<string, unknown>, accessToken: string, fraud: FraudContext): Promise<{ ok: boolean; status: number; claimId?: string }> {
  if (!isHmrcConfigured()) return { ok: false, status: 0 };
  const url = `${BASE}/individuals/losses/${encodeURIComponent(nino)}/loss-claims`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: LOSS_VERSION, 'Content-Type': 'application/json', ...fraudPreventionHeaders(fraud) },
    body: JSON.stringify(claimBody),
  });
  const body = (await res.json().catch(() => undefined)) as { claimId?: string } | undefined;
  return { ok: res.ok, status: res.status, claimId: body?.claimId };
}

export async function listLossClaims(nino: string, taxYearClaimedFor: string, accessToken: string, fraud: FraudContext): Promise<unknown | null> {
  if (!isHmrcConfigured()) return null;
  const url = `${BASE}/individuals/losses/${encodeURIComponent(nino)}/loss-claims/tax-year/${encodeURIComponent(taxYearClaimedFor)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: LOSS_VERSION, ...fraudPreventionHeaders(fraud) } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}
