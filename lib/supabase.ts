// Supabase access for the server side only.
//
// Per the build rules we never use supabase-js in API routes. The client caches
// the schema and goes stale after migrations. We hit the REST API with raw fetch
// using the service role key. The service role bypasses row level security, which
// is exactly what the webhook needs to write a transaction on the user's behalf.
//
// Never import this from client code. The service role key must never reach the
// browser.

import { encryptSecret, decryptSecret } from './crypto';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function config(): { url: string; key: string } {
  if (!URL || !SERVICE_KEY) {
    throw new Error('Supabase env vars are missing.');
  }
  return { url: URL, key: SERVICE_KEY };
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const { key } = config();
  return {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

// --- AI usage budget (hard cost cap) --------------------------------------
// Atomically increments today's counter for a scope and key and returns the new
// count, so the webhook can refuse to spend on AI once a daily cap is hit. On
// any error we return null. For AI SPEND the callers treat null as blocked
// (fail closed); for plain message counting they treat null as allowed (fail
// open), so a database hiccup can never mute real users but can never leak AI
// spend either.
export async function bumpAiUsage(scope: string, key: string): Promise<number | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/increment_ai_usage`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_scope: scope, p_key: key }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const n = typeof data === 'number' ? data : Array.isArray(data) ? Number(data[0]) : Number(data);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// --- WhatsApp conversation state ------------------------------------------

export interface WaSession {
  phone: string;
  flow: string;
  step: string;
  data: Record<string, unknown>;
  updated_at: string;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // an abandoned flow expires after an hour

export async function getSession(phone: string): Promise<WaSession | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/wa_sessions?phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as WaSession[];
  if (rows.length === 0) return null;
  const s = rows[0];
  if (Date.now() - new Date(s.updated_at).getTime() > SESSION_TTL_MS) {
    await clearSession(phone);
    return null;
  }
  return s;
}

export async function setSession(
  phone: string,
  flow: string,
  step: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { url } = config();
  await fetch(`${url}/rest/v1/wa_sessions`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ phone, flow, step, data, updated_at: new Date().toISOString() }),
  });
}

export async function clearSession(phone: string): Promise<void> {
  const { url } = config();
  await fetch(`${url}/rest/v1/wa_sessions?phone=eq.${encodeURIComponent(phone)}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
}

// Create an invoice from the server (the WhatsApp flow). Returns the new id,
// human number, and total, or null on failure.
export interface ServerInvoiceInput {
  customer_name: string;
  customer_contact?: string | null;
  line_items: Array<{ description: string; amount: number }>;
}

export async function createInvoice(
  userId: string,
  input: ServerInvoiceInput,
): Promise<{ id: string; number: string; total: number } | null> {
  const { url } = config();
  const subtotal = input.line_items.reduce((s, li) => s + (Number(li.amount) || 0), 0);

  // Number it from how many the user already has. A HEAD count means we never
  // pull every invoice row just to count them.
  const countRes = await fetch(
    `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { method: 'HEAD', headers: headers({ Prefer: 'count=exact' }) },
  );
  const range = countRes.headers.get('content-range') || '';
  const count = Number(range.split('/')[1]) || 0;
  const number = `INV-${String(count + 1).padStart(4, '0')}`;

  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 14);

  const res = await fetch(`${url}/rest/v1/invoices`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      user_id: userId,
      number,
      customer_name: input.customer_name,
      customer_contact: input.customer_contact ?? null,
      line_items: input.line_items,
      subtotal,
      tax: 0,
      total: subtotal,
      status: 'draft',
      issued_date: today.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
    }),
  });
  if (!res.ok) {
    console.error('[createInvoice] failed:', res.status);
    return null;
  }
  const created = (await res.json()) as Array<{ id: string }>;
  const row = Array.isArray(created) ? created[0] : (created as { id: string });
  if (!row?.id) return null;
  return { id: row.id, number, total: subtotal };
}

export interface NewTransaction {
  user_id: string;
  vendor: string;
  amount: number; // negative for an expense, positive for income
  category: string;
  transaction_date: string; // YYYY-MM-DD
  source_type: string; // for example whatsapp_image
  description?: string | null;
  raw_input_url?: string | null;
  confidence_score?: number | null;
  confirmed?: boolean;
  raw_whatsapp_message_id?: string | null;
  cis_deduction?: number | null;
}

// Find the Lekhio user whose stored phone matches this WhatsApp sender.
// WhatsApp sends the number without a plus, for example 447700900000. The app
// stores it as +447700900000. We check a few shapes to be safe.
export async function findUserIdByPhone(senderDigits: string): Promise<string | null> {
  const { url } = config();
  // Exact canonical match only. Storage is +44 E.164 everywhere (app OTP + normalised
  // signup), so this hits the unique index and can never match the wrong account.
  // We deliberately do NOT do a leading-wildcard suffix fallback: that cannot use an
  // index and would full-scan the users table on every unmatched message, which is
  // both a scale hotspot and a filter-injection surface.
  const e164 = normalizeUkPhone(senderDigits);
  if (!e164) return null;
  const query = `${url}/rest/v1/users?phone_number=eq.${encodeURIComponent(e164)}&select=id&limit=2`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length === 1 ? rows[0].id : null;
}

// True if we have already saved a transaction for this WhatsApp message id.
// This keeps us idempotent. Meta retries a webhook if we are slow, and we do not
// want a duplicate receipt each time.
export async function transactionExists(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const { url } = config();
  const query = `${url}/rest/v1/transactions?raw_whatsapp_message_id=eq.${encodeURIComponent(
    messageId,
  )}&select=id&limit=1`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return false;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length > 0;
}

// Atomically claim an inbound message id so it is handled once. Returns true if
// we just claimed it (process it), false if it was already claimed (a Meta retry,
// skip it). On any unexpected error we fail open and process, so a real message
// is never silently dropped.
export async function claimMessage(id: string): Promise<boolean> {
  if (!id) return true;
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/processed_messages`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ id }),
  });
  if (res.status === 201) return true; // newly inserted, we own it
  if (res.status === 409) return false; // duplicate, already handled
  return true;
}

// Normalise any UK number to E.164 (+44...) so everything we store matches the
// same shape: the app, the web signup, and the WhatsApp lookup. This MUST stay
// byte-identical to `toUkE164` in tradebook-app/app/(auth)/phone.tsx. The app
// stores with that function and the webhook matches with this one, so if the two
// ever diverge a user's WhatsApp messages land on a different account. The steps
// are: drop a 00 international prefix, drop a 44 country code, drop any leading
// zeros, then prefix +44. Order matters; it collapses every UK variant, incl. the
// common "+44 07375..." double-prefix typo, to one canonical string.
// "07375 694427" -> "+447375694427", "7375694427" -> "+447375694427",
// "447375694427" -> "+447375694427", "+44 07375 694427" -> "+447375694427".
export function normalizeUkPhone(input: string): string {
  let d = (input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2); // 0044... international prefix
  if (d.startsWith('44')) d = d.slice(2); // 44... country code
  d = d.replace(/^0+/, ''); // 07... national, or a stray leading zero
  if (!d) return '';
  return '+44' + d;
}

export interface WaitlistSignup {
  phone: string;
  email?: string | null;
}

export async function insertWaitlistSignup(signup: WaitlistSignup): Promise<void> {
  const { url } = config();
  const record: Record<string, string> = { phone: normalizeUkPhone(signup.phone) };
  if (signup.email) record.email = signup.email;

  const res = await fetch(`${url}/rest/v1/waitlist`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    // No response body in the error: it can contain the submitted phone/email.
    throw new Error(`Waitlist insert failed: ${res.status}`);
  }
}

// --- Marketing leads (the consent engine) ---------------------------------
// A lead captured from a free tool, WITH proof of consent. Stored server side
// only. Re submitting the same email merges (updates consent), it does not error.
export interface MarketingLead {
  email: string;
  source?: string | null;
  result_note?: string | null;
  consent: boolean;
  consent_text?: string | null;
  ip?: string | null;
  user_agent?: string | null;
}

export async function insertMarketingLead(lead: MarketingLead): Promise<void> {
  const { url } = config();
  const record: Record<string, unknown> = {
    email: lead.email,
    source: lead.source ?? null,
    result_note: lead.result_note ?? null,
    consent: lead.consent,
    consent_text: lead.consent_text ?? null,
    consent_at: lead.consent ? new Date().toISOString() : null,
    ip: lead.ip ?? null,
    user_agent: lead.user_agent ?? null,
  };
  const res = await fetch(`${url}/rest/v1/marketing_leads?on_conflict=email`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    // No response body in the error: it can contain the submitted email.
    throw new Error(`Marketing lead insert failed: ${res.status}`);
  }
}

// Mark a lead as double opt in confirmed (they clicked the confirm link).
export async function setLeadConfirmed(email: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
  });
  return res.ok;
}

// Mark a lead as unsubscribed. From this point they are excluded from all sends.
export async function setLeadUnsubscribed(email: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ unsubscribed_at: new Date().toISOString() }),
  });
  return res.ok;
}

// The list we may lawfully email: consented and not unsubscribed. Confirmed only
// is stricter and better for deliverability; pass confirmedOnly true once double
// opt in is live.
export async function listMarketableLeads(confirmedOnly = false): Promise<string[]> {
  const { url } = config();
  let q = `${url}/rest/v1/marketing_leads?select=email&consent=is.true&unsubscribed_at=is.null`;
  if (confirmedOnly) q += '&confirmed_at=not.is.null';
  const res = await fetch(q, { headers: headers() });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ email: string }>;
  return rows.map((r) => r.email).filter(Boolean);
}

export interface OnboardSignup {
  phone: string;
  email?: string | null;
  trade_type?: string | null;
  name?: string | null;
  trade?: string | null;
  postcode?: string | null;
  address?: string | null;
  vat_registered?: boolean | null;
  offer?: string | null;
}

// Save a completed web onboarding. Written with the service role key, server side only.
export async function createSignup(signup: OnboardSignup): Promise<void> {
  const { url } = config();
  const record: Record<string, unknown> = { phone: normalizeUkPhone(signup.phone) };
  if (signup.email) record.email = signup.email;
  if (signup.trade_type) record.trade_type = signup.trade_type;
  if (signup.name) record.name = signup.name;
  if (signup.trade) record.trade = signup.trade;
  if (signup.postcode) record.postcode = signup.postcode;
  if (signup.address) record.address = signup.address;
  if (signup.vat_registered !== undefined && signup.vat_registered !== null) record.vat_registered = signup.vat_registered;
  if (signup.offer) record.offer = signup.offer;

  const res = await fetch(`${url}/rest/v1/signups`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    // Do not include the response body: a PostgREST error can echo the submitted
    // phone/email back, and that personal data must never reach the logs.
    throw new Error(`Signup insert failed: ${res.status}`);
  }
}

// Verify a Supabase access token and return the verified user (id and email), or
// null. The values come from Supabase validating the JWT, never from anything the
// client asserts, so a user cannot claim another user's identity. Used by the
// authenticated endpoints (the accountant, the billing portal) to meter usage and
// resolve the right account.
export interface VerifiedUser {
  id: string;
  email: string | null;
}

export async function verifyAccessToken(token: string): Promise<VerifiedUser | null> {
  if (!token) return null;
  const { url } = config();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as {
      id?: string;
      email?: string | null;
      is_anonymous?: boolean;
      app_metadata?: { is_anonymous?: boolean } | null;
    };
    if (!u?.id) return null;
    // Defense in depth: reject anonymous sessions server side. The Supabase
    // project may still allow anonymous sign in, and an anonymous JWT is a valid,
    // Supabase-signed token, so token validation alone would let one through.
    // GoTrue marks these with is_anonymous: true (top level on the /auth/v1/user
    // response, and sometimes mirrored in app_metadata).
    //
    // This is GATED so it can ship now without breaking the current app, which
    // still logs in anonymously until phone OTP is switched on. Flip it on at
    // launch, together with turning OFF anonymous sign in at the Supabase
    // project and enforcing OTP, by setting REJECT_ANON_USERS=true. Until then
    // the behaviour is unchanged.
    const rejectAnon = process.env.REJECT_ANON_USERS === 'true';
    const isAnon = u.is_anonymous === true || u.app_metadata?.is_anonymous === true;
    if (rejectAnon && isAnon) return null;
    return { id: u.id, email: u.email ?? null };
  } catch {
    return null;
  }
}

// --- Subscriptions (Stripe billing) ---------------------------------------

export interface SubscriptionRecord {
  email?: string | null;
  phone?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id: string;
  plan?: string | null;
  offer?: string | null;
  status?: string | null;
  amount_pence?: number | null;
  current_period_end?: string | null; // ISO timestamp
  cancel_at_period_end?: boolean | null;
}

// Insert or update a subscription, keyed on the Stripe subscription id, so the
// webhook can be delivered any number of times in any order and the row always
// reflects the latest state. Service role only.
export async function upsertSubscription(rec: SubscriptionRecord): Promise<void> {
  const { url } = config();
  if (!rec.stripe_subscription_id) return;

  const body: Record<string, unknown> = {
    stripe_subscription_id: rec.stripe_subscription_id,
    updated_at: new Date().toISOString(),
  };
  if (rec.email != null) body.email = rec.email;
  if (rec.phone != null) body.phone = rec.phone;
  if (rec.stripe_customer_id != null) body.stripe_customer_id = rec.stripe_customer_id;
  if (rec.plan != null) body.plan = rec.plan;
  if (rec.offer != null) body.offer = rec.offer;
  if (rec.status != null) body.status = rec.status;
  if (rec.amount_pence != null) body.amount_pence = rec.amount_pence;
  if (rec.current_period_end != null) body.current_period_end = rec.current_period_end;
  if (rec.cancel_at_period_end != null) body.cancel_at_period_end = rec.cancel_at_period_end;

  const res = await fetch(`${url}/rest/v1/subscriptions?on_conflict=stripe_subscription_id`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[upsertSubscription] failed:', res.status, text);
  }
}

// Find the most recent subscription for an email, so the billing portal can be
// opened for the right Stripe customer. Returns the customer id or null.
export async function getStripeCustomerByEmail(email: string): Promise<string | null> {
  const { url } = config();
  if (!email) return null;
  const res = await fetch(
    `${url}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email)}&select=stripe_customer_id&order=updated_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ stripe_customer_id?: string | null }>;
  return rows[0]?.stripe_customer_id ?? null;
}

// Resolve a phone (E.164 +44) to its latest subscription state, so entitlement can
// be checked for a phone-only account that has no email. Service role only.
export interface SubscriptionStatus {
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}
export async function getSubscriptionByPhone(phone: string): Promise<SubscriptionStatus | null> {
  const { url } = config();
  if (!phone) return null;
  const res = await fetch(
    `${url}/rest/v1/subscriptions?phone=eq.${encodeURIComponent(phone)}&select=status,plan,current_period_end,cancel_at_period_end&order=updated_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as SubscriptionStatus[];
  return rows[0] ?? null;
}

// --- GDPR: data export and erasure (the user acting on their own account) ----

export interface AccountExport {
  exported_at: string;
  user: unknown;
  transactions: unknown[];
  invoices: unknown[];
  events: unknown[];
  reminder_prefs: unknown[];
  subscriptions: unknown[];
  signups: unknown[];
}

// Gather everything held about one user, scoped to them. Service role only.
export async function exportUserData(userId: string, email: string | null): Promise<AccountExport> {
  const { url } = config();
  const get = async (path: string): Promise<unknown[]> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers() });
    return res.ok ? ((await res.json()) as unknown[]) : [];
  };
  const phone = await getPhoneForUser(userId);
  const [user, transactions, invoices, events, reminder_prefs] = await Promise.all([
    get(`users?id=eq.${encodeURIComponent(userId)}&select=*`),
    get(`transactions?user_id=eq.${encodeURIComponent(userId)}&select=*`),
    get(`invoices?user_id=eq.${encodeURIComponent(userId)}&select=*`),
    get(`events?user_id=eq.${encodeURIComponent(userId)}&select=*`),
    get(`reminder_prefs?user_id=eq.${encodeURIComponent(userId)}&select=*`),
  ]);
  const subsByPhone = phone ? await get(`subscriptions?phone=eq.${encodeURIComponent(phone)}&select=*`) : [];
  const subsByEmail = email ? await get(`subscriptions?email=eq.${encodeURIComponent(email)}&select=*`) : [];
  const seen = new Set<string>();
  const subscriptions = [...subsByPhone, ...subsByEmail].filter((s) => {
    const id = (s as { stripe_subscription_id?: string }).stripe_subscription_id || JSON.stringify(s);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const signups = email ? await get(`signups?email=eq.${encodeURIComponent(email)}&select=*`) : [];
  return {
    exported_at: new Date().toISOString(),
    user: user[0] ?? null,
    transactions,
    invoices,
    events,
    reminder_prefs,
    subscriptions,
    signups,
  };
}

// Right to erasure: delete every row for this user across all tables, including
// the server-only ones that do not cascade from `users`, then the auth user.
export async function deleteUserData(userId: string, email: string | null): Promise<boolean> {
  const { url, key } = config();
  const phone = await getPhoneForUser(userId);
  // Track whether every delete actually succeeded, so a GDPR erasure never
  // reports success while leaving financial data behind on a failed sub-delete.
  let allOk = true;
  const del = async (path: string): Promise<void> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
    // PostgREST returns 200/204 on a successful delete (even if 0 rows matched).
    if (!res.ok) allOk = false;
  };
  // User-owned rows (FKs cascade from users, but delete explicitly to be sure).
  await del(`transactions?user_id=eq.${encodeURIComponent(userId)}`);
  await del(`invoices?user_id=eq.${encodeURIComponent(userId)}`);
  await del(`events?user_id=eq.${encodeURIComponent(userId)}`);
  await del(`reminder_prefs?user_id=eq.${encodeURIComponent(userId)}`);
  await del(`hmrc_connections?user_id=eq.${encodeURIComponent(userId)}`);
  // Bank tokens + connection rows. These cascade when the users row goes, but
  // delete first and explicitly so erasure never leaves a live banking token
  // behind if the users delete were to fail.
  await del(`bank_connections?user_id=eq.${encodeURIComponent(userId)}`);
  // Audit trail holds user_id + ip_address (personal data under UK GDPR).
  await del(`audit_log?user_id=eq.${encodeURIComponent(userId)}`);
  await del(`users?id=eq.${encodeURIComponent(userId)}`);
  // Server-only rows keyed by phone/email (these do NOT cascade from users).
  if (phone) {
    await del(`subscriptions?phone=eq.${encodeURIComponent(phone)}`);
    await del(`waitlist?phone=eq.${encodeURIComponent(phone)}`);
    // In-flight WhatsApp session state (may hold draft invoice/customer data).
    await del(`wa_sessions?phone=eq.${encodeURIComponent(phone)}`);
  }
  if (email) {
    await del(`subscriptions?email=eq.${encodeURIComponent(email)}`);
    await del(`signups?email=eq.${encodeURIComponent(email)}`);
    await del(`waitlist?email=eq.${encodeURIComponent(email)}`);
    // Marketing capture holds email + ip + user agent (personal data).
    await del(`marketing_leads?email=eq.${encodeURIComponent(email)}`);
  }
  // Finally remove the auth identity itself (admin API, service role).
  const authRes = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return allOk && authRes.ok;
}

// --- HMRC MTD connection (OAuth tokens) -----------------------------------
// Service role only. The app never reads these; it only ever asks the server to
// start the connect flow or to act. Tokens are written by the OAuth callback.

export interface HmrcConnection {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  nino: string | null;
  business_id: string | null;
}

// Store (or refresh) the tokens for a user after a successful OAuth exchange.
export async function saveHmrcConnection(
  userId: string,
  tokens: { access_token: string; refresh_token: string; expires_at: string },
): Promise<boolean> {
  const { url } = config();
  // Encrypt the OAuth tokens at rest. No-op until BANK_TOKEN_KEY is set.
  const row = {
    user_id: userId,
    access_token: encryptSecret(tokens.access_token),
    refresh_token: encryptSecret(tokens.refresh_token),
    expires_at: tokens.expires_at,
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(`${url}/rest/v1/hmrc_connections?on_conflict=user_id`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  return res.ok;
}

// Read a user's stored connection (server-side only).
export async function getHmrcConnection(userId: string): Promise<HmrcConnection | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as HmrcConnection[];
  const row = rows[0] ?? null;
  if (!row) return null;
  // Decrypt the OAuth tokens so callers see plaintext. Legacy plaintext rows
  // (written before encryption was enabled) pass through unchanged.
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecret(row.refresh_token);
  return row;
}

// Whether a user has linked their HMRC account (no tokens are returned).
export async function hasHmrcConnection(userId: string): Promise<boolean> {
  const c = await getHmrcConnection(userId);
  return Boolean(c && c.access_token);
}

// Store the latest device collected fraud prevention values for a user. These
// are device characteristics (already sanitized upstream), not secrets, so they
// are stored as plain jsonb on the connection row. Upserts so it works whether
// or not the user has linked HMRC yet. Service role only, like the rest of this
// table.
export async function saveHmrcFraud(userId: string, client: Record<string, unknown>): Promise<boolean> {
  const { url } = config();
  const row = {
    user_id: userId,
    fraud_client: client,
    fraud_collected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const res = await fetch(`${url}/rest/v1/hmrc_connections?on_conflict=user_id`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  return res.ok;
}

// Read a user's stored fraud snapshot (server side only). Used at submit time to
// build the fraud prevention headers alongside the request derived values.
export async function getHmrcFraud(userId: string): Promise<Record<string, unknown> | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/hmrc_connections?user_id=eq.${encodeURIComponent(userId)}&select=fraud_client&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as { fraud_client?: Record<string, unknown> | null }[];
  return rows[0]?.fraud_client ?? null;
}

// --- Events / diary / reminders -------------------------------------------

export interface NewEvent {
  title: string;
  kind?: string;
  starts_at?: string | null;
  remind_at?: string | null;
  notes?: string | null;
}

export async function createEvent(userId: string, e: NewEvent): Promise<void> {
  const { url } = config();
  const rec: Record<string, unknown> = { user_id: userId, title: e.title, kind: e.kind ?? 'reminder' };
  if (e.starts_at) rec.starts_at = e.starts_at;
  if (e.remind_at) rec.remind_at = e.remind_at;
  if (e.notes) rec.notes = e.notes;
  const res = await fetch(`${url}/rest/v1/events`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rec),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Event insert failed: ${res.status} ${text}`);
  }
}

export interface DueReminder {
  id: string;
  user_id: string;
  title: string;
  kind: string;
  remind_at: string;
}

export async function getDueReminders(nowIso: string, limit = 100): Promise<DueReminder[]> {
  const { url } = config();
  const q = `${url}/rest/v1/events?select=id,user_id,title,kind,remind_at&reminded=eq.false&remind_at=not.is.null&remind_at=lte.${encodeURIComponent(nowIso)}&order=remind_at.asc&limit=${limit}`;
  const res = await fetch(q, { headers: headers() });
  if (!res.ok) return [];
  return (await res.json()) as DueReminder[];
}

export async function markReminded(id: string): Promise<void> {
  const { url } = config();
  await fetch(`${url}/rest/v1/events?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ reminded: true }),
  });
}

// Atomically claim a due reminder: flip reminded false->true and only return true
// if THIS call did the flip. The cron claims before sending, so two overlapping or
// retried runs can never send the same reminder twice.
export async function claimDueReminder(id: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/events?id=eq.${encodeURIComponent(id)}&reminded=eq.false`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ reminded: true }),
  });
  if (!res.ok) return false;
  const rows = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

export async function getPhoneForUser(userId: string): Promise<string | null> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=phone_number&limit=1`, { headers: headers() });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ phone_number?: string | null }>;
  return rows[0]?.phone_number ?? null;
}

export interface NudgeTarget {
  user_id: string;
  phone: string;
  daily_nudges: boolean;
  weekly_summary: boolean;
}

// One page of nudge targets, keyset ordered by user id, for the resumable cron
// fan out. At 20,000 users one function invocation cannot send everything inside
// its duration limit, so the cron processes pages and hands the cursor to a
// continuation invocation. Prefs are fetched once per invocation by the caller.
export async function listNudgeTargetsPage(
  afterId: string | null,
  limit = 500,
): Promise<{ targets: Array<{ user_id: string; phone: string }>; last: string | null }> {
  const { url } = config();
  const cursor = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  const res = await fetch(
    `${url}/rest/v1/users?select=id,phone_number&phone_number=not.is.null&order=id.asc&limit=${limit}${cursor}`,
    { headers: headers() },
  );
  if (!res.ok) return { targets: [], last: null };
  const batch = (await res.json()) as Array<{ id: string; phone_number: string }>;
  return {
    targets: batch.map((u) => ({ user_id: u.id, phone: u.phone_number })),
    last: batch.length === limit ? batch[batch.length - 1].id : null,
  };
}

// Everyone's reminder preferences in one read. One row exists only for users who
// changed the defaults, so this stays small even at 20,000 users.
export async function listAllNudgePrefs(): Promise<Map<string, { daily_nudges: boolean; weekly_summary: boolean }>> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/reminder_prefs?select=user_id,daily_nudges,weekly_summary&limit=100000`, { headers: headers() });
  if (!res.ok) return new Map();
  const prefs = (await res.json()) as Array<{ user_id: string; daily_nudges: boolean; weekly_summary: boolean }>;
  return new Map(prefs.map((p) => [p.user_id, { daily_nudges: p.daily_nudges, weekly_summary: p.weekly_summary }]));
}

// Housekeeping so the always-growing tables never become a scale problem.
// Batched deletes (PostgREST order+limit) so no single call locks a huge range:
//   processed_messages  idempotency horizon, 7 days is far beyond Meta retries
//   wa_sessions         abandoned flows, the code already treats >1h as expired
//   ai_usage            per day counters, 60 days of history is plenty
export async function pruneOldRows(): Promise<{ pruned: number }> {
  const { url } = config();
  let pruned = 0;
  const batchDelete = async (path: string, maxBatches: number): Promise<void> => {
    for (let i = 0; i < maxBatches; i++) {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        method: 'DELETE',
        headers: headers({ Prefer: 'return=representation', 'Range-Unit': 'items' }),
      });
      if (!res.ok) return;
      const rows = (await res.json().catch(() => [])) as unknown[];
      pruned += Array.isArray(rows) ? rows.length : 0;
      if (!Array.isArray(rows) || rows.length === 0) return;
    }
  };
  const week = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const sixtyDays = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await batchDelete(`processed_messages?created_at=lt.${encodeURIComponent(week)}&order=created_at.asc&limit=10000`, 30);
  await batchDelete(`wa_sessions?updated_at=lt.${encodeURIComponent(day)}&order=updated_at.asc&limit=1000`, 5);
  await batchDelete(`ai_usage?day=lt.${encodeURIComponent(sixtyDays)}&order=day.asc&limit=10000`, 10);
  return { pruned };
}

export async function listNudgeTargets(): Promise<NudgeTarget[]> {
  const { url } = config();
  const users: Array<{ id: string; phone_number: string }> = [];
  let after = '';
  // Keyset pagination so we never pull the whole users table in one giant response.
  for (let page = 0; page < 200; page++) {
    const cursor = after ? `&id=gt.${encodeURIComponent(after)}` : '';
    const ures = await fetch(
      `${url}/rest/v1/users?select=id,phone_number&phone_number=not.is.null&order=id.asc&limit=1000${cursor}`,
      { headers: headers() },
    );
    if (!ures.ok) break;
    const batch = (await ures.json()) as Array<{ id: string; phone_number: string }>;
    if (batch.length === 0) break;
    users.push(...batch);
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].id;
  }
  const pres = await fetch(`${url}/rest/v1/reminder_prefs?select=user_id,daily_nudges,weekly_summary`, { headers: headers() });
  const prefs = pres.ok ? ((await pres.json()) as Array<{ user_id: string; daily_nudges: boolean; weekly_summary: boolean }>) : [];
  const pmap = new Map(prefs.map((p) => [p.user_id, p]));
  return users.map((u) => {
    const p = pmap.get(u.id);
    return { user_id: u.id, phone: u.phone_number, daily_nudges: p ? p.daily_nudges : true, weekly_summary: p ? p.weekly_summary : true };
  });
}

// One grouped aggregate for every user's last-seven-day totals, replacing the
// old one-query-per-user fan out in the weekly cron. Uses the weekly_totals_all
// RPC (see supabase/schema.sql). Returns null when the RPC is not yet applied,
// so the cron can fall back to the per-user path until the SQL is run.
export interface WeeklyTotalsRow {
  user_id: string;
  income: number;
  expenses: number;
}
export async function weeklyTotalsAll(): Promise<WeeklyTotalsRow[] | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/weekly_totals_all`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ user_id: string; income: number | string; expenses: number | string }>;
    if (!Array.isArray(rows)) return null;
    return rows.map((r) => ({ user_id: r.user_id, income: Number(r.income) || 0, expenses: Number(r.expenses) || 0 }));
  } catch {
    return null;
  }
}

export async function weeklyTotals(userId: string): Promise<{ income: number; expenses: number }> {
  const { url } = config();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const res = await fetch(`${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.true&created_at=gte.${encodeURIComponent(since)}&select=amount`, { headers: headers() });
  if (!res.ok) return { income: 0, expenses: 0 };
  const rows = (await res.json()) as Array<{ amount: number }>;
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    if (a >= 0) income += a;
    else expenses += Math.abs(a);
  }
  return { income, expenses };
}

export async function insertTransaction(record: NewTransaction): Promise<void> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/transactions`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert failed: ${res.status} ${text}`);
  }
}

// A compact, plain-text summary of a user's recent entries, for the open ended
// accountant questions only. Simple totals questions are answered without AI by
// totalsForUser below, so 60 recent rows is plenty of context and keeps the
// prompt small and cheap.
export async function transactionSummaryForUser(userId: string, limit = 60): Promise<string> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&select=amount,category,vendor,transaction_date,confirmed&order=transaction_date.desc&limit=${limit}`,
    { headers: headers() },
  );
  if (!res.ok) return '';
  const rows = (await res.json()) as Array<{
    amount: number;
    category: string | null;
    vendor: string | null;
    transaction_date: string | null;
    confirmed: boolean | null;
  }>;
  return rows
    .map((r) => {
      const amt = Number(r.amount) || 0;
      const dir = amt >= 0 ? 'income' : 'expense';
      const date = (r.transaction_date ?? '').slice(0, 10);
      const tag = r.confirmed ? '' : ' (to review)';
      return `${date} ${dir} £${Math.abs(amt).toFixed(2)} ${r.category ?? ''} ${r.vendor ?? ''}${tag}`.trim();
    })
    .join('\n');
}

// Mark an invoice paid from the server (Stripe webhook) and book the income,
// once only. Safe to call more than once for the same invoice.
export async function markInvoicePaidServer(
  invoiceId: string,
  opts?: { paidPence?: number; currency?: string },
): Promise<void> {
  const { url } = config();

  const invRes = await fetch(
    `${url}/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&select=user_id,number,customer_name,total,status&limit=1`,
    { headers: headers() },
  );
  if (!invRes.ok) return;
  const rows = (await invRes.json()) as Array<{
    user_id: string;
    number: string;
    customer_name: string;
    total: number;
    status: string;
  }>;
  if (rows.length === 0) return;
  const inv = rows[0];
  if (inv.status === 'paid') return; // already done, fast path

  // Verify the amount actually collected matches this invoice before booking it.
  // Stops income being mis-booked if a checkout ever collects a different amount.
  if (opts?.paidPence != null) {
    const expected = Math.round((Number(inv.total) || 0) * 100);
    const currencyOk = !opts.currency || opts.currency.toLowerCase() === 'gbp';
    if (!currencyOk || Math.abs(opts.paidPence - expected) > 1) {
      console.error('[markInvoicePaidServer] amount or currency mismatch, not booking income for', invoiceId);
      return;
    }
  }

  // Atomic gate against duplicate or concurrent Stripe deliveries: only flip rows
  // that are not already paid, and ask for the result back. If no row comes back,
  // another delivery already paid it, so we must not book the income twice.
  const upRes = await fetch(`${url}/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&status=neq.paid`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() }),
  });
  if (!upRes.ok) {
    console.error('[markInvoicePaidServer] Update failed:', upRes.status);
    return;
  }
  const updated = (await upRes.json().catch(() => [])) as unknown[];
  if (!Array.isArray(updated) || updated.length === 0) return; // already paid by another delivery

  await insertTransaction({
    user_id: inv.user_id,
    vendor: inv.customer_name,
    amount: Math.abs(Number(inv.total) || 0),
    category: 'income',
    transaction_date: new Date().toISOString().slice(0, 10),
    source_type: 'invoice',
    description: `Invoice ${inv.number}`,
    confirmed: true,
  }).catch((e) => console.error('[markInvoicePaidServer] Income insert failed:', e));
}

// --- Deterministic totals for WhatsApp money questions ----------------------
// Aggregates a user's entries server side in Postgres (the user_totals RPC), so
// "how much have I spent this month" never needs AI and never depends on the
// caller paging rows. This replaced fetching up to 5000 rows over PostgREST and
// summing them in code, which was slow and silently truncated the heaviest users
// at 5000 rows. The exported signature and shape are unchanged, so callers are
// unaffected.
export interface UserTotals {
  income: number;
  expenses: number;
  cis: number;
  count: number;
}
export async function totalsForUser(
  userId: string,
  sinceISO: string | null,
  category: string | null,
): Promise<UserTotals | null> {
  const { url } = config();
  // The function does the confirmed-only filter, the period cut off transaction_date
  // (falling back to created_at), and the optional category filter, all in the
  // database. Confirmed-only matters: a "how much have I made / spent / owe" answer
  // must never present un-reviewed data (e.g. freshly imported bank lines still
  // "to review") as a settled figure. p_since / p_category are null when not given.
  const res = await fetch(`${url}/rest/v1/rpc/user_totals`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      p_user_id: userId,
      p_since: sinceISO,
      p_category: category,
    }),
  });
  if (!res.ok) return null;
  // The function returns one row; PostgREST delivers it as a single element array.
  const rows = (await res.json().catch(() => null)) as Array<{
    income: number | string | null;
    expenses: number | string | null;
    cis: number | string | null;
    count: number | string | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  return {
    income: Number(r.income) || 0,
    expenses: Number(r.expenses) || 0,
    cis: Number(r.cis) || 0,
    count: Number(r.count) || 0,
  };
}

// The user's most recent unconfirmed entry, so "delete that" and "change it to
// 40" can act on the thing they just logged. Confirmed entries are never touched
// from WhatsApp; those are edited in the app where the user can see them.
export interface LastEntry {
  id: string;
  vendor: string | null;
  amount: number;
  category: string | null;
}
export async function latestUnconfirmed(userId: string): Promise<LastEntry | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.false&select=id,vendor,amount,category&order=created_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as LastEntry[];
  return rows[0] ?? null;
}

export async function deleteTransactionById(id: string, userId: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.false`,
    { method: 'DELETE', headers: headers({ Prefer: 'return=representation' }) },
  );
  if (!res.ok) return false;
  const rows = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

// Change the amount of an unconfirmed entry, keeping its direction (sign).
export async function updateTransactionAmount(id: string, userId: string, magnitude: number, direction: 'income' | 'expense'): Promise<boolean> {
  const { url } = config();
  const signed = direction === 'income' ? Math.abs(magnitude) : -Math.abs(magnitude);
  const res = await fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.false`,
    { method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify({ amount: signed }) },
  );
  if (!res.ok) return false;
  const rows = (await res.json().catch(() => [])) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

// STOP and START over WhatsApp. Writes the same reminder_prefs the app settings
// screen uses, so opting out by text and by app stay in step.
export async function setNudgePrefs(
  userId: string,
  prefs: { daily_nudges: boolean; weekly_summary: boolean },
): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/reminder_prefs?on_conflict=user_id`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }),
  });
  return res.ok;
}

// --- Bank feed connections (Open Banking via TrueLayer, service role only) --
// One row per consent journey, including the per connection OAuth tokens
// (service role only table, RLS with no policies, never returned to clients).

export interface BankConnection {
  id: string;
  user_id: string;
  reference: string;
  status: string;
  account_ids: string[];
  bank_name?: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  last_synced_date: string | null;
}

export async function createBankConnection(userId: string, reference: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/bank_connections`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ user_id: userId, reference, status: 'created' }),
  });
  if (!res.ok) {
    // The PostgREST error body names the failing constraint or column and holds
    // no personal data for this insert. Vital for diagnosing schema drift.
    const text = await res.text().catch(() => '');
    console.error('[createBankConnection] failed:', res.status, text.slice(0, 300));
  }
  return res.ok;
}

export async function getBankConnectionByReference(reference: string): Promise<BankConnection | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/bank_connections?reference=eq.${encodeURIComponent(reference)}&select=*&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as BankConnection[];
  const row = rows[0] ?? null;
  return row ? decryptBankTokens(row) : null;
}

// Decrypt the token fields on a bank connection row in place, so callers see
// plaintext. Legacy plaintext rows pass through unchanged (see decryptSecret).
function decryptBankTokens(row: BankConnection): BankConnection {
  row.access_token = decryptSecret(row.access_token);
  row.refresh_token = decryptSecret(row.refresh_token);
  return row;
}

export async function updateBankConnection(
  id: string,
  patch: {
    status?: string;
    account_ids?: string[];
    bank_name?: string | null;
    last_synced_date?: string;
    access_token?: string;
    refresh_token?: string | null;
    token_expires_at?: string;
  },
): Promise<boolean> {
  const { url } = config();
  // Encrypt the OAuth tokens at rest before they reach the database. No-op until
  // BANK_TOKEN_KEY is set. Only encrypt fields that are actually present in the
  // patch, so we never turn an absent field into an encrypted empty string.
  const body: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.access_token !== undefined) {
    body.access_token = encryptSecret(patch.access_token);
  }
  if (patch.refresh_token !== undefined && patch.refresh_token !== null) {
    body.refresh_token = encryptSecret(patch.refresh_token);
  }
  const res = await fetch(`${url}/rest/v1/bank_connections?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // A silent failure here is what left every connection stuck at 'created':
    // a missing column (e.g. updated_at) makes PostgREST reject the whole PATCH,
    // so the bank never links. The error body names the failing column and holds
    // no personal data. Never let this fail quietly again.
    const text = await res.text().catch(() => '');
    console.error('[updateBankConnection] failed:', res.status, text.slice(0, 300));
  }
  return res.ok;
}

// A user's own connections, for the status endpoint. Never returns tokens.
// Falls back to a select without bank_name if that column is missing or the
// PostgREST schema cache is stale, so the status probe can never report a
// connected bank as disconnected over a cosmetic column.
export async function listBankConnectionsForUser(
  userId: string,
): Promise<Array<{ id: string; status: string; created_at?: string; bank_name?: string | null; last_synced_date: string | null }>> {
  const { url } = config();
  const base = `${url}/rest/v1/bank_connections?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20`;
  let res = await fetch(`${base}&select=id,status,created_at,bank_name,last_synced_date`, { headers: headers() });
  if (!res.ok) {
    res = await fetch(`${base}&select=id,status,created_at,last_synced_date`, { headers: headers() });
  }
  if (!res.ok) return [];
  return (await res.json()) as Array<{ id: string; status: string; created_at?: string; bank_name?: string | null; last_synced_date: string | null }>;
}

// Disconnect: revoke every linked connection for the user and destroy our copy
// of the tokens, so no further reads are possible from our side. The consent
// record at the bank expires on its own 90 day clock and can also be revoked by
// the user at their bank.
export async function revokeBankConnections(userId: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/bank_connections?user_id=eq.${encodeURIComponent(userId)}&status=in.(linked,expired,created,failed)`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        status: 'revoked',
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return res.ok;
}

export async function listLinkedBankConnections(limit = 500): Promise<BankConnection[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/bank_connections?status=eq.linked&select=*&order=last_synced_date.asc.nullsfirst&limit=${limit}`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as BankConnection[];
  // Decrypt each row's tokens so the sync path sees plaintext.
  return rows.map(decryptBankTokens);
}

// A user's recent unconfirmed WhatsApp captures, for deduping a bank line
// against a receipt or typed entry covering the same purchase.
export async function recentUnconfirmedCaptures(
  userId: string,
  sinceISO: string,
): Promise<Array<{ amount: number; transaction_date: string | null }>> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.false&source_type=like.whatsapp*&transaction_date=gte.${encodeURIComponent(sinceISO)}&select=amount,transaction_date&limit=500`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return (await res.json()) as Array<{ amount: number; transaction_date: string | null }>;
}

export interface BankEntryInsert {
  external_id: string;
  vendor: string;
  amount: number;
  category: string;
  transaction_date: string;
  description: string;
}

// Insert bank transactions idempotently and in BULK: one PostgREST request per
// chunk instead of one per row, which is what keeps a first sync of hundreds
// of lines fast. external_id carries the bank's own transaction id, and the
// partial unique index on it makes re-syncing the same window safe; duplicates
// are silently ignored, and the response counts only the genuinely new rows.
export async function insertBankTransactions(userId: string, entries: BankEntryInsert[]): Promise<number> {
  if (entries.length === 0) return 0;
  const { url } = config();
  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const rows = entries.slice(i, i + CHUNK).map((entry) => ({
      user_id: userId,
      vendor: entry.vendor,
      amount: entry.amount,
      category: entry.category,
      transaction_date: entry.transaction_date,
      source_type: 'bank_feed',
      description: entry.description,
      confirmed: false,
      external_id: entry.external_id,
    }));
    const res = await fetch(`${url}/rest/v1/transactions?on_conflict=external_id&select=id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[insertBankTransactions] failed:', res.status, text.slice(0, 300));
      continue;
    }
    const created = (await res.json().catch(() => [])) as unknown[];
    inserted += Array.isArray(created) ? created.length : 0;
  }
  return inserted;
}

// --- Invoices (read for the public invoice page, server side only) ---------

export interface InvoiceLine {
  description: string;
  amount: number;
}

export interface PublicInvoice {
  number: string;
  customer_name: string;
  customer_contact: string | null;
  line_items: InvoiceLine[];
  total: number;
  status: string;
  notes: string | null;
  issued_date: string | null;
  due_date: string | null;
  business_name: string | null;
  business_contact: string | null;
}

// Fetch one invoice plus the trader's business details. Uses the service role,
// so the page renders for anyone with the link without exposing the whole table.
export async function getPublicInvoice(id: string): Promise<PublicInvoice | null> {
  const { url } = config();

  const invRes = await fetch(
    `${url}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&select=number,customer_name,customer_contact,line_items,total,status,notes,issued_date,due_date,user_id&limit=1`,
    { headers: headers() },
  );
  if (!invRes.ok) return null;
  const rows = (await invRes.json()) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const inv = rows[0];

  let businessName: string | null = null;
  let businessContact: string | null = null;
  const userId = inv.user_id as string | undefined;
  if (userId) {
    const userRes = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=name,business_name,phone_number&limit=1`,
      { headers: headers() },
    );
    if (userRes.ok) {
      const urows = (await userRes.json()) as Array<{ name?: string; business_name?: string; phone_number?: string }>;
      if (urows.length > 0) {
        businessName = urows[0].business_name || urows[0].name || null;
        // Do not expose the trader's personal mobile on a shareable public link.
        businessContact = null;
      }
    }
  }

  const lineItems = Array.isArray(inv.line_items) ? (inv.line_items as InvoiceLine[]) : [];

  return {
    number: (inv.number as string) ?? '',
    customer_name: (inv.customer_name as string) ?? '',
    // Keep the customer's own contact details off the public, shareable link.
    customer_contact: null,
    line_items: lineItems,
    total: Number(inv.total) || 0,
    status: (inv.status as string) ?? 'draft',
    notes: (inv.notes as string) ?? null,
    issued_date: (inv.issued_date as string) ?? null,
    due_date: (inv.due_date as string) ?? null,
    business_name: businessName,
    business_contact: businessContact,
  };
}
