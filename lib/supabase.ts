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
import { referralCode, sanitizeRefCode } from './referral';
import { parseLevel, type AutonomyLevel } from './autonomy';
import { quarterForDate, quarterBounds } from './quarterpack';
import type { OptimiserInput } from './taxoptimiser';
import { qaDedupeKey, qaPrunePaths } from './qaretention';

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

// How many users are actually paying us right now (active or in trial). One HEAD
// count, no rows pulled. Used to derive the day's proactive WhatsApp send budget
// from the margin target: revenue scales with this number, so the send ceiling
// must too (see lib/margin.ts). Returns null on any error, and the caller then
// falls back to the safe floor rather than sending without a ceiling.
export async function countActiveSubscribers(): Promise<number | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/subscriptions?select=stripe_subscription_id&status=in.(active,trialing)`,
      { method: 'HEAD', headers: headers({ Prefer: 'count=exact', Range: '0-0' }) },
    );
    if (!res.ok) return null;
    // PostgREST returns the total in Content-Range as "0-0/123".
    const total = (res.headers.get('content-range') ?? '').split('/')[1];
    const n = Number(total);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// Add a whole page of proactive WhatsApp sends to today's global counter in one
// write (scale audit). Returns the new running total for today so the cron can
// stop once the daily budget is hit, or null on any error (the caller treats
// null as "cannot confirm, keep going" so a DB hiccup never mutes reminders; the
// kill switch is the hard stop). Uses the same ai_usage table under scope
// 'wa_send', key 'global'.
export async function addWaSend(n: number): Promise<number | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/add_ai_usage`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_scope: 'wa_send', p_key: 'global', p_n: n }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const c = typeof data === 'number' ? data : Array.isArray(data) ? Number(data[0]) : Number(data);
    return Number.isFinite(c) ? c : null;
  } catch {
    return null;
  }
}

// --- Khoji knowledge retrieval (the growing brain) ------------------------
// Khoji (the Mac mini watcher) distils GOV.UK and HMRC updates into the
// knowledge_items table. This reads back only the rows a human has REVIEWED and
// that carry a primary source link. That gate is the safety boundary: an
// un-reviewed or source-less summary can never reach a user's tax answer. Puchio
// (and later the agent) call this to fold the latest verified changes into their
// reasoning. Returns [] on any error or when nothing relevant is found, so the
// caller simply falls back to its static, exam-verified rules. Never relax the
// status=reviewed and source_url filters.
export interface KnowledgeItem {
  title: string;
  summary: string;
  source_url: string;
  effective_date: string | null;
}

const KNOWLEDGE_STOPWORDS = new Set([
  'what', 'when', 'where', 'which', 'that', 'this', 'with', 'from', 'have', 'about',
  'does', 'will', 'would', 'should', 'could', 'much', 'many', 'need', 'want', 'know',
  'tell', 'your', 'yours', 'them', 'they', 'been', 'into', 'over', 'more', 'most',
  'than', 'then', 'some', 'just', 'like', 'make', 'made', 'also', 'still', 'only',
  'income', 'money',
]);

export async function getRelevantKnowledge(question: string, limit = 6): Promise<KnowledgeItem[]> {
  try {
    const { url } = config();
    // Significant words for a light keyword match. Restricted to plain
    // alphanumerics of 4+ chars, so there is nothing to escape and no injection
    // path. Short and common words are dropped so the filter stays meaningful.
    const words = Array.from(
      new Set(
        (question.toLowerCase().match(/[a-z0-9]{4,}/g) || [])
          .filter((w) => !KNOWLEDGE_STOPWORDS.has(w))
          .slice(0, 8),
      ),
    );
    // The safety gate, never relaxed: reviewed, source-linked, distilled.
    let path =
      'knowledge_items?status=eq.reviewed&source_url=not.is.null&summary=not.is.null' +
      `&select=title,summary,source_url,effective_date&order=effective_date.desc.nullslast&limit=${limit}`;
    // Surface items that relate to the question. With no usable words we fall back
    // to the most recent verified items.
    if (words.length) {
      const ors = words
        .flatMap((w) => [`title.ilike.*${w}*`, `summary.ilike.*${w}*`, `affects.ilike.*${w}*`])
        .join(',');
      path += `&or=(${ors})`;
    }
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers() });
    if (!res.ok) return [];
    const rows = (await res.json()) as KnowledgeItem[];
    return Array.isArray(rows)
      ? rows.filter((r) => r && r.summary && r.source_url).slice(0, limit)
      : [];
  } catch {
    return [];
  }
}

// --- Recognised sources (doc 95 decision 2) --------------------------------
// A distilled or self answered item may auto approve into the brain only when
// EVERY source it leaned on is on this list, and it is not an engine_impact
// change. Tight by default, easy to extend. Suffix match, so subdomains count.
const RECOGNISED_HOSTS = [
  'gov.uk', 'legislation.gov.uk', 'hmrc.gov.uk',
  'icaew.com', 'accaglobal.com', 'tax.org.uk', 'att.org.uk', 'aat.org.uk', 'icas.com',
];

export function isRecognisedSource(url: string): boolean {
  // Extract the host with a regex, not the URL constructor: this module already
  // has a `URL` constant (the Supabase base URL) that shadows the global. Strip
  // any userinfo and port, reject a junk authority, so the allowlist that gates
  // auto approval of tax content cannot be widened by a crafted authority and a
  // legitimate URL carrying a port or stray whitespace still matches.
  const m = /^https?:\/\/([^/?#\s]+)/i.exec((url || '').trim());
  if (!m) return false;
  let host = m[1].toLowerCase();
  host = host.split('@').pop() || '';   // drop any userinfo before the host
  host = host.split(':')[0];            // drop any port
  if (!/^[a-z0-9.-]+$/.test(host)) return false; // reject non hostname junk
  return RECOGNISED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

export function allSourcesRecognised(urls: string[]): boolean {
  return urls.length > 0 && urls.every(isRecognisedSource);
}

// --- General answer cache (doc 95 Phase 1.5 Feature B) ----------------------
// A repeat of a GENERAL question (no personal context) is served from here for
// free, so paid credit is spent once per distinct question, not once per user.
// Safety rests on two gates enforced at WRITE time: the question carried no first
// person context, and every source was recognised. So a served answer can never
// contain another user's figures and is always source backed. Khoji marks the
// whole cache stale when a distilled item changes a tax figure, and a freshness
// window bounds staleness even if that signal is ever missed.

const QA_CACHE_TTL_DAYS = 21;

// Deterministic shape for a question: lowercase, strip punctuation, collapse
// whitespace. Two phrasings differing only in spacing or a final question mark
// map to the same key, which is what lets a repeat hit.
export function normaliseQuestion(q: string): string {
  return (q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

// Is this a GENERAL question, safe to cache and serve to anyone? Conservative by
// design: any first person marker means the answer might lean on the asker's own
// figures, so it is treated as personal and never cached. A cache miss is
// cheap; serving a wrong personalised answer is not.
const PERSONAL_MARKERS = /\b(i|im|ive|id|ill|me|my|mine|myself|we|our|ours|us)\b/;
export function isGeneralQuestion(q: string): boolean {
  const n = normaliseQuestion(q);
  if (n.length < 6) return false;
  return !PERSONAL_MARKERS.test(n);
}

// Serve a cached general answer. Active and within the freshness window only.
// Returns null on any miss, so the caller falls through to the paid path.
export async function lookupQaCache(questionNorm: string): Promise<{ answer: string; sources: string[] } | null> {
  try {
    const { url } = config();
    const cutoff = new Date(Date.now() - QA_CACHE_TTL_DAYS * 86_400_000).toISOString();
    const path =
      `qa_cache?question_norm=eq.${encodeURIComponent(questionNorm)}` +
      `&status=eq.active&updated_at=gte.${encodeURIComponent(cutoff)}` +
      `&select=answer,sources&limit=1`;
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers() });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ answer: string; sources: unknown }>;
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !row.answer) return null;
    const sources = Array.isArray(row.sources) ? (row.sources as string[]) : [];
    return { answer: row.answer, sources };
  } catch {
    return null;
  }
}

// Best effort +1 to the popularity counter, so we can measure credits saved.
export async function bumpQaCacheHit(questionNorm: string): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rpc/bump_qa_cache_hit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_norm: questionNorm }),
    });
  } catch {
    /* best effort */
  }
}

// Store (or refresh) a general answer. Called only after a LIVE answer whose
// sources were ALL recognised, for a question with no personal context. On
// conflict we refresh the answer and reactivate, so a re answered question also
// un-stales itself. The stored sample is PII redacted for good measure.
export async function upsertQaCache(
  questionNorm: string,
  questionSample: string,
  answer: string,
  sources: string[],
): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/qa_cache?on_conflict=question_norm`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        question_norm: questionNorm,
        question_sample: redactPii(questionSample).slice(0, 500),
        answer: answer.slice(0, 8000),
        sources: sources.length ? sources : [],
        status: 'active',
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    /* best effort */
  }
}

// --- Puchio chat memory + the learning loop (doc 95) -----------------------

export interface ConversationRow {
  id: string;
  title: string;
  last_message_at: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  role: 'user' | 'puchio';
  content: string;
  sources: unknown;
  created_at: string;
}

// Small REST helper for the new endpoints. Service role, so RLS is bypassed and
// we scope every read and write by user_id ourselves, matching this file's rule.
async function rest(path: string, init?: RequestInit): Promise<Response> {
  const { url } = config();
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers(), ...(init?.headers || {}) } });
}

// Create a conversation, return its id. Title is a trimmed first question.
export async function createConversation(userId: string, title: string): Promise<string | null> {
  try {
    const res = await rest('conversations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, title: (title || 'New chat').slice(0, 80) }),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.id ? String(rows[0].id) : null;
  } catch {
    return null;
  }
}

// True only if the conversation exists AND belongs to this user. Called before
// writing into a client supplied thread id, so a crafted id can never attach a
// message to someone else's conversation.
export async function conversationOwnedBy(userId: string, conversationId: string): Promise<boolean> {
  try {
    const res = await rest(
      `conversations?id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

// List a user's conversations, newest activity first.
export async function listConversations(userId: string, limit = 50): Promise<ConversationRow[]> {
  try {
    const res = await rest(
      `conversations?user_id=eq.${encodeURIComponent(userId)}&select=id,title,last_message_at,created_at&order=last_message_at.desc&limit=${limit}`,
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// The turns in one conversation, oldest first, scoped to the owner.
export async function getConversationMessages(userId: string, conversationId: string, limit = 200): Promise<MessageRow[]> {
  try {
    const res = await rest(
      `messages?user_id=eq.${encodeURIComponent(userId)}&conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,role,content,sources,created_at&order=created_at.asc&limit=${limit}`,
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

// Store one turn and bump the conversation's last_message_at. Best effort, so a
// storage hiccup never blocks the answer the user is waiting on.
export async function saveMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'puchio',
  content: string,
  sources?: string[],
): Promise<void> {
  try {
    await rest('messages', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        conversation_id: conversationId,
        role,
        content: content.slice(0, 8000),
        sources: sources && sources.length ? sources : null,
      }),
    });
    await rest(`conversations?id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_message_at: new Date().toISOString() }),
    });
  } catch {
    /* best effort */
  }
}

// Store a full turn (the user question and Puchio's answer) in ONE batched
// insert, then bump last_message_at once: two round trips instead of four. Best
// effort, so it never blocks or fails the answer the user is waiting on.
export async function saveConversationTurn(
  userId: string,
  conversationId: string,
  question: string,
  answer: string,
  sources?: string[],
): Promise<void> {
  try {
    await rest('messages', {
      method: 'POST',
      body: JSON.stringify([
        { user_id: userId, conversation_id: conversationId, role: 'user', content: question.slice(0, 8000), sources: null },
        { user_id: userId, conversation_id: conversationId, role: 'puchio', content: answer.slice(0, 8000), sources: sources && sources.length ? sources : null },
      ]),
    });
    await rest(`conversations?id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_message_at: new Date().toISOString() }),
    });
  } catch {
    /* best effort */
  }
}

// Strip the obvious personal bits from a question before it enters the shared
// review pool: emails, UK postcodes, currency amounts, and long digit runs. The
// general tax question survives, the identifying detail does not. This keeps the
// learning corpus from becoming a store of users' personal figures and names.
function redactPii(s: string): string {
  return (s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '[postcode]')
    .replace(/£\s?\d[\d,]*(\.\d+)?/g, '[amount]')
    .replace(/\b\d{7,}\b/g, '[number]');
}

// Log a Puchio answer as a learning candidate for the brain. The question is PII
// redacted first. Records whether the sources are all recognised so a later
// governed step can auto approve the clean ones. Never auto approves here.
//
// Deduped: the same question asked again bumps a seen_count on the one row
// instead of adding a new one, so the pool stays bounded at scale (doc 96). The
// log_qa_candidate RPC upserts on the normalised question and NEVER overwrites a
// human's review or dismissal. If the question has no usable dedupe key (too
// short to normalise) we fall back to a plain insert so nothing is dropped.
// Best effort throughout.
export async function logQaCandidate(
  question: string,
  answer: string,
  sources: string[],
  usedKnowledge: boolean,
  engineImpact = false,
): Promise<void> {
  try {
    const redacted = redactPii(question).slice(0, 1000);
    const norm = qaDedupeKey(redacted);
    if (!norm) {
      await rest('qa_candidates', {
        method: 'POST',
        body: JSON.stringify({
          question: redacted,
          answer: answer.slice(0, 8000),
          sources: sources.length ? sources : null,
          used_knowledge: usedKnowledge,
          all_sources_recognised: allSourcesRecognised(sources),
          engine_impact: engineImpact,
        }),
      });
      return;
    }
    await rest('rpc/log_qa_candidate', {
      method: 'POST',
      body: JSON.stringify({
        p_question_norm: norm,
        p_question: redacted,
        p_answer: answer.slice(0, 8000),
        p_sources: sources.length ? sources : null,
        p_used_knowledge: usedKnowledge,
        p_all_recognised: allSourcesRecognised(sources),
        p_engine_impact: engineImpact,
      }),
    });
  } catch {
    /* best effort */
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

// The most recent income entry (positive amount), for turning a just logged sale
// into an invoice, the Tyms style "invoice this". Trade income only, so a rent
// receipt never becomes an invoice.
export async function getLastIncomeTransaction(
  userId: string,
): Promise<{ vendor: string | null; amount: number; category: string | null } | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&amount=gt.0&income_type=neq.property` +
      `&select=vendor,amount,category,created_at&order=created_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ vendor: string | null; amount: number; category: string | null }>;
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return null;
  return { vendor: r.vendor ?? null, amount: Number(r.amount) || 0, category: r.category ?? null };
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
  // The stream (doc 82 s4): trade by default, property for rental money.
  income_type?: 'trade' | 'property';
  property_id?: string | null;
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
  referred_by_code?: string | null;
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
  // Attribution only. Store the sanitised referral code they arrived through, if
  // it is a valid code. Reward is a separate gated decision (doc 82).
  const ref = sanitizeRefCode(signup.referred_by_code ?? null);
  if (ref) record.referred_by_code = ref;

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
  // The user's signed-off HMRC figures (their approval records). Keyed by user_id
  // with no FK, so this does NOT cascade from users: erase it explicitly or the
  // numbers a user approved would survive an account deletion (UK GDPR erasure).
  await del(`hmrc_approvals?user_id=eq.${encodeURIComponent(userId)}`);
  // Bank tokens + connection rows. These cascade when the users row goes, but
  // delete first and explicitly so erasure never leaves a live banking token
  // behind if the users delete were to fail.
  await del(`bank_connections?user_id=eq.${encodeURIComponent(userId)}`);
  // Audit trail holds user_id + ip_address (personal data under UK GDPR).
  await del(`audit_log?user_id=eq.${encodeURIComponent(userId)}`);
  // Puchio chat threads and their messages (chat content is personal data).
  // These cascade from auth.users on the final delete, but remove explicitly so
  // erasure never leaves chat history behind if that last delete were to fail.
  await del(`messages?user_id=eq.${encodeURIComponent(userId)}`);
  await del(`conversations?user_id=eq.${encodeURIComponent(userId)}`);
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

// The nudge/weekly preferences for just one page of users, so the fan out never
// loads the whole prefs table on every hop. Only opted out users have a row, so
// this is a small, bounded read even at 100k users. Missing = the default (on).
export async function getNudgePrefsForUsers(
  userIds: string[],
): Promise<Map<string, { daily_nudges: boolean; weekly_summary: boolean }>> {
  if (userIds.length === 0) return new Map();
  const { url } = config();
  const inList = userIds.join(',');
  const res = await fetch(
    `${url}/rest/v1/reminder_prefs?user_id=in.(${inList})&select=user_id,daily_nudges,weekly_summary`,
    { headers: headers() },
  );
  if (!res.ok) return new Map();
  const prefs = (await res.json()) as Array<{ user_id: string; daily_nudges: boolean; weekly_summary: boolean }>;
  return new Map(prefs.map((p) => [p.user_id, { daily_nudges: p.daily_nudges, weekly_summary: p.weekly_summary }]));
}

// Housekeeping so the always-growing tables never become a scale problem.
// Batched deletes (PostgREST order+limit) so no single call locks a huge range:
//   processed_messages  idempotency horizon, 7 days is far beyond Meta retries
//   wa_sessions         abandoned flows, the code already treats >1h as expired
//   ai_usage            per day counters, 60 days of history is plenty
//   qa_candidates       learning pool, terminal rows >90d and stale rows >365d
//   qa_cache            general answer cache, entries past the read TTL (see qaPrunePaths)
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
  // The learning pool and general answer cache (doc 96). Write time dedupe
  // bounds qa_candidates; this trims terminal and long stale rows, and drops
  // qa_cache entries that are past the read TTL so can never be served again.
  for (const p of qaPrunePaths()) {
    await batchDelete(p.path, p.maxBatches);
  }
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
  const res = await fetch(`${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.true&is_personal=eq.false&created_at=gte.${encodeURIComponent(since)}&select=amount`, { headers: headers() });
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
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&is_personal=eq.false&select=amount,category,vendor,transaction_date,confirmed&order=transaction_date.desc&limit=${limit}`,
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

// The quarter end pack (lib/quarterpack.ts) needs the user's CONFIRMED entries
// for a date range, in the engine sign convention, plus the property stream and
// any CIS suffered. Only confirmed rows count, exactly like every total in the
// product, so nothing unapproved reaches the accountant's summary.
export interface PackRow {
  amount: number;
  category: string | null;
  vendor: string | null;
  transaction_date: string;
  cis_deduction: number | null;
  income_type: string | null;
}

export async function getConfirmedTransactionsForRange(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<PackRow[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.true&is_personal=eq.false` +
      `&transaction_date=gte.${encodeURIComponent(startISO)}` +
      `&transaction_date=lte.${encodeURIComponent(endISO)}` +
      `&select=amount,category,vendor,transaction_date,cis_deduction,income_type` +
      `&order=transaction_date.asc&limit=20000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows
    .filter((r) => typeof r.transaction_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.transaction_date as string))
    .map((r) => ({
      amount: Number(r.amount) || 0,
      category: (r.category as string | null) ?? null,
      vendor: (r.vendor as string | null) ?? null,
      transaction_date: (r.transaction_date as string).slice(0, 10),
      cis_deduction: r.cis_deduction == null ? null : Number(r.cis_deduction),
      income_type: (r.income_type as string | null) ?? null,
    }));
}

// The trader's own business name for the pack header, business_name preferred
// then their name, else null (the pack falls back to a neutral label).
export async function getBusinessName(userId: string): Promise<string | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=name,business_name&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ name?: string | null; business_name?: string | null }>;
  return rows[0]?.business_name || rows[0]?.name || null;
}

// Assemble the tax optimiser's input from the user's confirmed data and profile
// for the current tax year. Trade stream only (the optimiser's levers are trade
// side); home-office and mileage are inferred from the categories they have used.
export async function getOptimiserInput(userId: string): Promise<OptimiserInput> {
  const now = new Date();
  const { startYear } = quarterForDate(now);
  const taxYearStart = quarterBounds(startYear, 1).start;
  const todayISO = now.toISOString().slice(0, 10);

  const [rows, sl, goals] = await Promise.all([
    getConfirmedTransactionsForRange(userId, taxYearStart, todayISO),
    getStudentLoanSettings(userId),
    getActiveGoals(userId),
  ]);

  let ytdTradeIncome = 0;
  let ytdTradeExpenses = 0;
  let ytdCisSuffered = 0;
  let ytdPropertyIncome = 0;
  let ytdPropertyExpenses = 0;
  const cats = new Set<string>();
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    if ((r.income_type ?? '').toLowerCase() === 'property') {
      if (amt > 0) ytdPropertyIncome += amt;
      else if (amt < 0) ytdPropertyExpenses += -amt;
      continue;
    }
    if (amt > 0) ytdTradeIncome += amt;
    else if (amt < 0) {
      ytdTradeExpenses += -amt;
      if (r.category) cats.add(String(r.category).toLowerCase());
    }
    const c = Number(r.cis_deduction);
    if (Number.isFinite(c) && c > 0) ytdCisSuffered += c;
  }
  const categoriesLogged = [...cats];
  const start = new Date(`${taxYearStart}T00:00:00Z`);
  const monthsElapsed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (30.44 * 86400000)));
  const purchase = goals.find((g) => g.kind === 'purchase');

  return {
    startYear,
    monthsElapsed,
    ytdTradeIncome: Math.round(ytdTradeIncome * 100) / 100,
    ytdTradeExpenses: Math.round(ytdTradeExpenses * 100) / 100,
    ytdCisSuffered: Math.round(ytdCisSuffered * 100) / 100,
    employmentIncome: sl?.employmentIncome ?? 0,
    categoriesLogged,
    homeOfficeClaimed: categoriesLogged.some((c) => c.includes('home')),
    mileageClaimed: categoriesLogged.some((c) => c.includes('mile')),
    purchaseGoal: purchase ? { title: purchase.title, amount: purchase.amount } : null,
    ytdPropertyIncome: Math.round(ytdPropertyIncome * 100) / 100,
    ytdPropertyExpenses: Math.round(ytdPropertyExpenses * 100) / 100,
  };
}

// The autonomy dial (lib/autonomy.ts). Read the user's level, defaulting to the
// most cautious 'suggest' when unset or unknown.
export async function getAutonomyLevel(userId: string): Promise<AutonomyLevel> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=autonomy_level&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return 'suggest';
  const rows = (await res.json()) as Array<{ autonomy_level?: string | null }>;
  return parseLevel(rows[0]?.autonomy_level);
}

// Set the dial. The value is validated through parseLevel, so only a real level
// is ever written. This governs reversible admin only; money and filing always
// require explicit approval regardless (enforced in lib/autonomy.ts).
export async function setAutonomyLevel(userId: string, level: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ autonomy_level: parseLevel(level) }),
  });
  return res.ok;
}

// The user's stable referral code (doc 82 referral loop). Read it if stored,
// otherwise derive it deterministically, persist it, and return it. Deriving is
// stable per account, so a race that writes twice writes the same value.
export async function getOrCreateReferralCode(userId: string): Promise<string | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=referral_code&limit=1`,
    { headers: headers() },
  );
  if (res.ok) {
    const rows = (await res.json()) as Array<{ referral_code?: string | null }>;
    const existing = rows[0]?.referral_code;
    if (existing) return existing;
  }
  const code = referralCode(userId);
  // Persist it. The unique index means a collision would 409, harmless: the
  // reader above already returns any stored value, so we just try once.
  await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ referral_code: code }),
  }).catch(() => {});
  return code;
}

// Attribution only: record the code a new user arrived through, if valid and not
// their own. Never moves money; reward is a separate gated decision (doc 82).
export async function setReferredByCode(userId: string, rawCode: string): Promise<void> {
  const code = sanitizeRefCode(rawCode);
  if (!code) return;
  const own = referralCode(userId);
  if (code === own) return; // cannot refer yourself
  const { url } = config();
  await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&referred_by_code=is.null`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ referred_by_code: code }),
  }).catch(() => {});
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
  history_from: string | null; // the earliest date the first sync may pull, chosen at connect
}

export async function createBankConnection(
  userId: string,
  reference: string,
  historyFrom?: string | null,
): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/bank_connections`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ user_id: userId, reference, status: 'created', history_from: historyFrom ?? null }),
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
): Promise<Array<{ id: string; vendor: string | null; amount: number; transaction_date: string | null }>> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.false&source_type=like.whatsapp*&transaction_date=gte.${encodeURIComponent(sinceISO)}&select=id,vendor,amount,transaction_date&limit=500`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return await res.json();
}

// The receipt came first, and now the bank has sent us the card payment for it.
//
// The OLD behaviour was to silently drop the bank line. That left the books holding
// an OCR reading of a photograph when the bank had just told us the exact figure and
// the exact date the money left the account. The photo's total can be misread, and
// the date printed on a receipt is not always the day the card was charged.
//
// So instead we write the BANK's truth onto the capture the user already sent, and
// keep their photo, their category and their evidence. One entry. Right figures.
//
// Setting external_id also makes the merge idempotent: the next sync sees that id
// already in the table and never re-imports the line.
export async function applyBankTruthToCapture(
  userId: string,
  captureId: string,
  bank: { amount: number; transaction_date: string; external_id: string },
): Promise<boolean> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(captureId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        amount: bank.amount,
        transaction_date: bank.transaction_date,
        external_id: bank.external_id,
      }),
    },
  );
  return res.ok;
}

export interface BankEntryInsert {
  external_id: string;
  vendor: string;
  amount: number;
  category: string;
  transaction_date: string;
  description: string;
  // Set during sync when the brain (lib/memory.ts) already knows this vendor is not
  // business money, so a benefit or a personal transfer arrives out of the tax
  // figures instead of having to be corrected all over again.
  is_personal?: boolean;
  // AUTO FILED. True when the USER has already told us what this vendor is, so
  // asking him again would be asking a question he has answered. See doc 104
  // section 3 and lib/digest.ts. He is told in the digest, and one word undoes it.
  confirmed?: boolean;
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
      // Auto filed ONLY when he has already taught us this vendor. Everything else
      // still waits for him. See banksync.
      confirmed: entry.confirmed === true,
      external_id: entry.external_id,
      // Carry the brain's answer through to the row. Leaving this out would compile
      // fine and silently drop every lesson: the sync would decide a benefit was
      // not business money, and then write it to the books as income anyway.
      is_personal: entry.is_personal === true,
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

// --- Student loan and mixed income settings ----------------------------------
// The plan is asked once (app hub, or "plan 2" on WhatsApp) and stored on the
// users row, so the app, the WhatsApp answers and later the agent read one
// source. employment_income is the optional PAYE salary from the NI hub.
export interface StudentLoanSettings {
  plan: 'plan1' | 'plan2' | 'plan4' | 'plan5' | null;
  postgrad: boolean;
  employmentIncome: number;
}

export async function getStudentLoanSettings(userId: string): Promise<StudentLoanSettings | null> {
  const { url } = config();
  const query = `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=student_loan_plan,student_loan_postgrad,employment_income&limit=1`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Array<{
    student_loan_plan: string | null;
    student_loan_postgrad: boolean | null;
    employment_income: number | string | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  const plan =
    r.student_loan_plan === 'plan1' || r.student_loan_plan === 'plan2' || r.student_loan_plan === 'plan4' || r.student_loan_plan === 'plan5'
      ? r.student_loan_plan
      : null;
  return {
    plan,
    postgrad: Boolean(r.student_loan_postgrad),
    employmentIncome: Number(r.employment_income) || 0,
  };
}

export async function setStudentLoanPlan(
  userId: string,
  plan: 'plan1' | 'plan2' | 'plan4' | 'plan5',
): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ student_loan_plan: plan }),
  });
  return res.ok;
}

// The PAYE salary from the WhatsApp setup flow ("salary 32000").
export async function setEmploymentIncome(userId: string, amount: number): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ employment_income: Math.max(0, Math.round(amount)) }),
  });
  return res.ok;
}

// --- The Agentic Accountant v1 (doc 84) --------------------------------------

export interface AgentUserRow {
  id: string;
  phone_number: string | null;
  student_loan_plan: 'plan1' | 'plan2' | 'plan4' | 'plan5' | null;
  student_loan_postgrad: boolean;
  employment_income: number;
  // Set by the app after the EAS rebuild that carries expo-notifications.
  // Null means no lock screen delivery for this user yet.
  expo_push_token: string | null;
}

// One keyset page of users for the nightly agent walk, ordered by id ascending.
export async function listAgentUsersPage(
  afterId: string | null,
  limit: number,
): Promise<{ users: AgentUserRow[]; last: string | null }> {
  const { url } = config();
  const after = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  const query = `${url}/rest/v1/users?select=id,phone_number,student_loan_plan,student_loan_postgrad,employment_income,expo_push_token&order=id.asc&limit=${limit}${after}`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return { users: [], last: null };
  const rows = (await res.json().catch(() => [])) as Array<{
    id: string;
    phone_number: string | null;
    student_loan_plan: string | null;
    student_loan_postgrad: boolean | null;
    employment_income: number | string | null;
    expo_push_token: string | null;
  }>;
  const users: AgentUserRow[] = rows.map((r) => ({
    id: r.id,
    phone_number: r.phone_number,
    student_loan_plan:
      r.student_loan_plan === 'plan1' || r.student_loan_plan === 'plan2' || r.student_loan_plan === 'plan4' || r.student_loan_plan === 'plan5'
        ? r.student_loan_plan
        : null,
    student_loan_postgrad: Boolean(r.student_loan_postgrad),
    employment_income: Number(r.employment_income) || 0,
    expo_push_token: r.expo_push_token ?? null,
  }));
  // A full page means there may be more; a short page is the end of the walk.
  return { users, last: users.length === limit ? users[users.length - 1].id : null };
}

export interface AgentAggregates {
  months: { month: string; income: number; expenses: number; cis: number }[];
  // Trailing 7 day totals for the Monday brief. Null until the RPC extension
  // is applied on prod; the engine skips week based signals when null.
  week: { income: number; expenses: number; activeDays: number } | null;
  // The property stream split (doc 82 s5d). Null until the RPC v3 runs on prod.
  property: { rents: number; expenses: number; finance: number; rents12: number } | null;
  // Distinct trade expense categories this tax year. Null until RPC v5.
  categories: string[] | null;
  unconfirmed: number;
  equipment: number;
}

// The one round trip aggregate for the signal engine (agent_user_aggregates RPC).
export async function agentAggregates(userId: string): Promise<AgentAggregates | null> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/rpc/agent_user_aggregates`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId }),
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as {
    months?: Array<{ month: string; income: number | string; expenses: number | string; cis: number | string }>;
    week?: { income?: number | string; expenses?: number | string; activeDays?: number | string } | null;
    property?: { rents?: number | string; expenses?: number | string; finance?: number | string; rents12?: number | string } | null;
    categories?: string[] | null;
    unconfirmed?: number | string;
    equipment?: number | string;
  } | null;
  if (!j) return null;
  return {
    months: (j.months ?? []).map((m) => ({
      month: m.month,
      income: Number(m.income) || 0,
      expenses: Number(m.expenses) || 0,
      cis: Number(m.cis) || 0,
    })),
    week: j.week
      ? {
          income: Number(j.week.income) || 0,
          expenses: Number(j.week.expenses) || 0,
          activeDays: Number(j.week.activeDays) || 0,
        }
      : null,
    property: j.property
      ? {
          rents: Number(j.property.rents) || 0,
          expenses: Number(j.property.expenses) || 0,
          finance: Number(j.property.finance) || 0,
          rents12: Number(j.property.rents12) || 0,
        }
      : null,
    categories: Array.isArray(j.categories) ? j.categories.map((c) => String(c)) : null,
    unconfirmed: Number(j.unconfirmed) || 0,
    equipment: Number(j.equipment) || 0,
  };
}

export interface NewAgentSignal {
  user_id: string;
  signal_key: string;
  period_key: string;
  payload: Record<string, unknown>;
  priority: 'ping' | 'card';
}

// Insert signals, structurally deduped: on_conflict on the unique index with
// ignore-duplicates, returning ONLY the rows that actually inserted, so the
// caller knows which are genuinely new and eligible for a WhatsApp ping.
export async function insertAgentSignals(
  rows: NewAgentSignal[],
): Promise<Array<{ id: string; signal_key: string; priority: string }>> {
  if (rows.length === 0) return [];
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/agent_signals?on_conflict=user_id,signal_key,period_key&select=id,signal_key,priority`,
    {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify(rows),
    },
  );
  if (!res.ok) return [];
  return ((await res.json().catch(() => [])) as Array<{ id: string; signal_key: string; priority: string }>) ?? [];
}

// How many WhatsApp pings this user received in the trailing 7 days, for the
// noise caps.
export async function agentPingsLast7Days(userId: string): Promise<number> {
  const { url } = config();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const query = `${url}/rest/v1/agent_signals?user_id=eq.${encodeURIComponent(userId)}&delivered_wa_at=gte.${encodeURIComponent(since)}&select=id`;
  const res = await fetch(query, { headers: { ...headers(), Prefer: 'count=exact', Range: '0-0' } });
  if (!res.ok) return 0;
  const range = res.headers.get('content-range');
  const total = range?.split('/')[1];
  return total && total !== '*' ? parseInt(total, 10) || 0 : 0;
}

// The user's agent ping preference; defaults on when no prefs row exists.
export async function agentPingPref(userId: string): Promise<boolean> {
  const { url } = config();
  const query = `${url}/rest/v1/reminder_prefs?user_id=eq.${encodeURIComponent(userId)}&select=agent_pings&limit=1`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return true;
  const rows = (await res.json().catch(() => [])) as Array<{ agent_pings: boolean | null }>;
  if (rows.length === 0) return true;
  return rows[0].agent_pings !== false;
}

// "Rakha on your lock screen" (doc 82 s5c). Defaults on, like the WhatsApp
// pings; a user with no prefs row has not opted out of anything.
export async function agentPushPref(userId: string): Promise<boolean> {
  const { url } = config();
  const query = `${url}/rest/v1/reminder_prefs?user_id=eq.${encodeURIComponent(userId)}&select=agent_push&limit=1`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return true;
  const rows = (await res.json().catch(() => [])) as Array<{ agent_push: boolean | null }>;
  if (rows.length === 0) return true;
  return rows[0].agent_push !== false;
}

export async function markAgentSignalDelivered(id: string): Promise<void> {
  const { url } = config();
  await fetch(`${url}/rest/v1/agent_signals?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ delivered_wa_at: new Date().toISOString() }),
  }).catch(() => undefined);
}

// Outbound agent sends are audited like every other side effect. No message
// content beyond the signal key, keeping PII out of the log.
export async function logAgentDelivery(userId: string, signalKey: string): Promise<void> {
  const { url } = config();
  await fetch(`${url}/rest/v1/audit_log`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, event_type: 'agent_ping_sent', event_data: { signal_key: signalKey } }),
  }).catch(() => undefined);
}

// --- Goals (doc 82 section 5b) ------------------------------------------------

export interface ActiveGoal {
  id: string;
  kind: 'purchase' | 'income' | 'savings';
  title: string;
  amount: number;
  target_date: string | null;
}

export async function getActiveGoals(userId: string): Promise<ActiveGoal[]> {
  const { url } = config();
  const query = `${url}/rest/v1/user_goals?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=id,kind,title,amount,target_date&order=created_at.desc&limit=10`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => [])) as Array<{
    id: string;
    kind: string;
    title: string;
    amount: number | string;
    target_date: string | null;
  }>;
  return rows
    .filter((r) => r.kind === 'purchase' || r.kind === 'income' || r.kind === 'savings')
    .map((r) => ({
      id: r.id,
      kind: r.kind as ActiveGoal['kind'],
      title: r.title,
      amount: Number(r.amount) || 0,
      target_date: r.target_date,
    }));
}

// Create a goal from WhatsApp ("my goal is a van for 24k"). The title is the
// user's own words.
export async function insertUserGoal(
  userId: string,
  goal: { kind: 'purchase' | 'income' | 'savings'; title: string; amount: number },
): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/user_goals`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, ...goal }),
  });
  return res.ok;
}

// "goal done": marks the newest active goal done. From WhatsApp there is no
// picker, so newest-first is the least surprising rule; the app can manage
// individual goals precisely.
export async function completeLatestGoal(userId: string): Promise<string | null> {
  const goals = await getActiveGoals(userId);
  if (goals.length === 0) return null;
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/user_goals?id=eq.${encodeURIComponent(goals[0].id)}`, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'done', updated_at: new Date().toISOString() }),
  });
  return res.ok ? goals[0].title : null;
}

// --- Properties, service role side (doc 82 s4) --------------------------------
export interface UserProperty {
  id: string;
  nickname: string;
  joint_share: number;
}

export async function listUserProperties(userId: string): Promise<UserProperty[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/properties?user_id=eq.${encodeURIComponent(userId)}&select=id,nickname,joint_share&order=created_at.asc`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => [])) as Array<{ id: string; nickname: string; joint_share: number | string }>;
  return rows.map((r) => ({ id: r.id, nickname: r.nickname, joint_share: Number(r.joint_share) || 1 }));
}

// Confirmed property stream totals for the tax year, split so the engine can
// treat mortgage interest as the Section 24 credit rather than an expense.
export async function propertyYtdTotals(
  userId: string,
  sinceISO: string,
): Promise<{ rents: number; expenses: number; finance: number }> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&income_type=eq.property&confirmed=eq.true&is_personal=eq.false&transaction_date=gte.${sinceISO}&select=amount,category,vendor`,
    { headers: headers() },
  );
  if (!res.ok) return { rents: 0, expenses: 0, finance: 0 };
  const rows = (await res.json().catch(() => [])) as Array<{ amount: number | string; category: string | null; vendor: string | null }>;
  let rents = 0;
  let expenses = 0;
  let finance = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    if (a > 0) rents += a;
    else {
      const hay = `${r.category ?? ''} ${r.vendor ?? ''}`.toLowerCase();
      if (hay.includes('mortgage') || hay.includes('interest')) finance += Math.abs(a);
      else expenses += Math.abs(a);
    }
  }
  return { rents, expenses, finance };
}

// --- Overdue invoices for the chaser (doc 82 s5e item 3) ----------------------
// Sent, unpaid, and past the reference date: the due date when one was set,
// otherwise 14 days from issue. Capped at five, oldest first, so the agent
// never floods anyone.

export interface OverdueInvoice {
  id: string;
  number: string;
  customer: string;
  total: number;
  daysOver: number;
}

export async function listOverdueInvoices(userId: string): Promise<OverdueInvoice[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}&status=eq.sent&select=id,number,customer_name,total,issued_date,due_date&order=issued_date.asc&limit=25`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => [])) as Array<{
    id: string;
    number: string | null;
    customer_name: string | null;
    total: number | string;
    issued_date: string | null;
    due_date: string | null;
  }>;
  const now = Date.now();
  const out: OverdueInvoice[] = [];
  for (const r of rows) {
    const ref = r.due_date ?? r.issued_date;
    if (!ref) continue;
    const days = Math.floor((now - new Date(`${ref}T00:00:00Z`).getTime()) / 86400000);
    // With a due date, overdue starts the day after it. Without one, 14 days
    // from issue is the polite nudge point.
    const daysOver = r.due_date ? days : days - 14 >= 0 ? days : -1;
    if (daysOver < 0 || (r.due_date && days <= 0)) continue;
    out.push({
      id: r.id,
      number: r.number ?? '',
      customer: r.customer_name ?? '',
      total: Number(r.total) || 0,
      daysOver: r.due_date ? days : days,
    });
    if (out.length >= 5) break;
  }
  return out;
}

// --- share my books -----------------------------------------------------------
//
// The share lives in a row so it can be REVOKED, and so its SCOPE (date range and
// excluded categories) is a server side fact rather than something the page is
// trusted to remember. See lib/bookshare.ts.

export interface BookShare {
  id: string;
  user_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  revoked_at: string | null;
  expires_at: string;
  last_viewed_at: string | null;
  view_count: number;
  created_at: string;
  from_date: string | null;
  exclude_categories: string[] | null;
}

const SHARE_COLS =
  'id,user_id,recipient_name,recipient_email,revoked_at,expires_at,last_viewed_at,view_count,created_at,from_date,exclude_categories';

export async function createBookShare(
  userId: string,
  name: string | null,
  email: string | null,
  expiresAtISO: string,
  fromDate: string,
  excludeCategories: string[],
): Promise<BookShare | null> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/book_shares`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      user_id: userId,
      recipient_name: name,
      recipient_email: email,
      expires_at: expiresAtISO,
      from_date: fromDate,
      exclude_categories: excludeCategories,
    }),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as BookShare[];
  return rows[0] ?? null;
}

export async function listBookShares(userId: string): Promise<BookShare[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/book_shares?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=${SHARE_COLS}&order=created_at.desc&limit=50`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return (await res.json()) as BookShare[];
}

// Scoped by user_id as well as id, so a caller can only ever revoke their OWN
// share even if they somehow learned another id.
export async function revokeBookShare(userId: string, shareId: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/book_shares?id=eq.${encodeURIComponent(shareId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    },
  );
  return res.ok;
}

// Used by the PUBLIC share view, after the signature has already checked out.
// Returns the row so the caller can judge revoked_at, expires_at and the scope.
export async function getBookShare(shareId: string): Promise<BookShare | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/book_shares?id=eq.${encodeURIComponent(shareId)}&select=${SHARE_COLS}&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as BookShare[];
  return rows[0] ?? null;
}

// Record that the link was opened, so the owner can see it being used, and see it
// being used when they did not expect it. Never throws.
export async function touchBookShare(shareId: string): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rpc/touch_book_share`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_share: shareId }),
    });
  } catch {
    /* never block the view on the counter */
  }
}

// Every confirmed entry for a user. The SCOPE (date range, excluded categories) is
// applied afterwards by lib/bookshare.ts, in one tested place.
export async function getConfirmedTransactionsForUser(userId: string): Promise<Record<string, unknown>[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.true&is_personal=eq.false` +
      `&select=amount,vendor,category,transaction_date,description,confirmed` +
      `&order=transaction_date.desc&limit=5000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return (await res.json()) as Record<string, unknown>[];
}

// --- "not business" -----------------------------------------------------------
//
// Personal money kept out of the books. See lib/personal.ts for why this matters:
// a child tax credit counted as trading income means a tax bill on a benefit.
//
// The row is never deleted. It stays visible to the user, it just stops counting.

export async function setTransactionPersonal(
  userId: string,
  transactionId: string,
  isPersonal: boolean,
): Promise<boolean> {
  const { url } = config();
  // Scoped by user_id as well as id, so a caller can never touch anyone else's row.
  const res = await fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(transactionId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ is_personal: isPersonal }),
    },
  );
  return res.ok;
}

// Mark several at once, for the "yes, all of those are personal" tap.
export async function setManyPersonal(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { url } = config();
  const list = ids.map((i) => `"${i}"`).join(',');
  const res = await fetch(
    `${url}/rest/v1/transactions?id=in.(${encodeURIComponent(list)})` +
      `&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ is_personal: true }),
    },
  );
  return res.ok ? ids.length : 0;
}

// Everything confirmed, INCLUDING personal, so the detector can look at the whole
// picture and the app can show a personal entry greyed out rather than hiding it.
export async function getAllConfirmedForReview(userId: string): Promise<Record<string, unknown>[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.true` +
      `&select=id,amount,vendor,category,transaction_date,description,confirmed,is_personal` +
      `&order=transaction_date.desc&limit=2000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return (await res.json()) as Record<string, unknown>[];
}

// --- the brain ---------------------------------------------------------------
//
// What this person taught us, and what everyone taught us. See lib/memory.ts.

export async function getUserRules(userId: string): Promise<Array<{ vendor_key: string; category: string | null; is_personal: boolean | null; hits: number }>> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/user_rules?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=vendor_key,category,is_personal,hits&limit=2000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return await res.json();
}

// The crowd's answers for a specific set of vendors. Scoped to the keys we are
// actually about to categorise, so we never pull the whole table.
export async function getVendorPatterns(keys: string[]): Promise<Array<{ vendor_key: string; category: string; votes: number }>> {
  if (keys.length === 0) return [];
  const { url } = config();
  const list = [...new Set(keys)].slice(0, 200).map((k) => `"${k}"`).join(',');
  const res = await fetch(
    `${url}/rest/v1/vendor_patterns?vendor_key=in.(${encodeURIComponent(list)})` +
      `&select=vendor_key,category,votes&limit=1000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return await res.json();
}

// Write a lesson. Never throws: failing to learn must never break the thing the
// user was actually doing.
export async function learnVendor(
  userId: string,
  vendorKey: string,
  category: string | null,
  isPersonal: boolean | null,
  share: boolean,
): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rpc/learn_vendor`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        p_user: userId,
        p_key: vendorKey,
        p_category: category,
        p_personal: isPersonal,
        p_share: share,
      }),
    });
  } catch {
    /* a lesson is never worth an error in the user's face */
  }
}

// The vendor of a transaction, so a correction knows what it is teaching us about.
export async function getTransactionVendor(userId: string, id: string): Promise<string | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=vendor&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ vendor: string | null }>;
  return rows[0]?.vendor ?? null;
}

// One transaction, for the purpose of learning from a correction to it.
export async function getTransactionForLearning(
  userId: string,
  id: string,
): Promise<{ vendor: string | null; category: string | null; is_personal: boolean | null } | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}` +
      `&select=vendor,category,is_personal&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

// Forget a vendor. The user is always allowed to take a lesson back.
export async function forgetUserRule(userId: string, vendorKey: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/user_rules?user_id=eq.${encodeURIComponent(userId)}` +
      `&vendor_key=eq.${encodeURIComponent(vendorKey)}`,
    { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) },
  );
  return res.ok;
}

// --- the same purchase, twice -------------------------------------------------
//
// A card payment from the bank and the photo of its receipt are ONE purchase. See
// lib/dedupe.ts for why this was broken in both directions.

// Recent UNCONFIRMED entries that a new capture might duplicate. Unconfirmed only:
// once the user has approved something we do not go rearranging it behind them.
export async function recentUnconfirmedForMatch(
  userId: string,
  sinceISO: string,
): Promise<Array<{ id: string; vendor: string | null; amount: number; transaction_date: string | null; category: string | null; source_type: string | null }>> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.false` +
      `&transaction_date=gte.${encodeURIComponent(sinceISO)}` +
      `&select=id,vendor,amount,transaction_date,category,source_type&limit=300`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return await res.json();
}

// Fold a receipt into the bank line it duplicates, so ONE entry is left holding the
// bank's figures and the receipt's evidence.
export async function mergeIntoTransaction(
  userId: string,
  id: string,
  patch: {
    vendor?: string;
    category?: string | null;
    raw_input_url?: string | null;
    raw_whatsapp_message_id?: string | null;
  },
): Promise<boolean> {
  const { url } = config();
  const row: Record<string, unknown> = {};
  if (patch.vendor !== undefined) row.vendor = patch.vendor;
  if (patch.category !== undefined && patch.category !== null) row.category = patch.category;
  if (patch.raw_input_url !== undefined) row.raw_input_url = patch.raw_input_url;
  if (patch.raw_whatsapp_message_id !== undefined) row.raw_whatsapp_message_id = patch.raw_whatsapp_message_id;
  // Deliberately NOT touching amount or transaction_date: the bank's figures are
  // facts and must survive the merge. See lib/dedupe.ts.

  const res = await fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
    },
  );
  return res.ok;
}

// --- the daily digest ---------------------------------------------------------

// Every inbound message reopens Meta's free 24 hour window. Recording when it
// happened is what lets us know a send is free. Never throws.
export async function touchLastInbound(userId: string): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ last_inbound_at: new Date().toISOString() }),
    });
  } catch {
    /* never break an inbound message over a timestamp */
  }
}

export interface DigestCandidate {
  id: string;
  phone_number: string | null;
  last_inbound_at: string | null;
  last_digest_at: string | null;
}

// Users who have unconfirmed BANK entries we have not told them about yet.
// Paged, so the cron can walk 100k users a chunk at a time.
export async function usersDueDigest(afterId: string | null, limit: number): Promise<DigestCandidate[]> {
  const { url } = config();
  const after = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  const res = await fetch(
    `${url}/rest/v1/users?select=id,phone_number,last_inbound_at,last_digest_at${after}` +
      `&phone_number=not.is.null&order=id.asc&limit=${limit}`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return await res.json();
}

// What landed from the bank and is still waiting for a yes.
// What the bank sent, split the way the digest needs it.
//
//   filed   we auto filed these, because he had already taught us the vendor
//   asking  we do not know these, so they are the only thing he is asked about
//
// See doc 104 section 3 and lib/banksync.ts for why that split exists.
export async function bankEntriesForDigest(
  userId: string,
): Promise<{ filed: Array<{ id: string; vendor: string | null; amount: number; category: string | null }>; asking: Array<{ id: string; vendor: string | null; amount: number; category: string | null }> }> {
  const { url } = config();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  async function q(confirmed: boolean) {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
        `&confirmed=eq.${confirmed}&source_type=eq.bank_feed&is_personal=eq.false` +
        `&created_at=gte.${encodeURIComponent(since)}` +
        `&select=id,vendor,amount,category&order=created_at.desc&limit=20`,
      { headers: headers() },
    );
    if (!res.ok) return [];
    return await res.json();
  }

  const [filed, asking] = await Promise.all([q(true), q(false)]);
  return { filed, asking };
}

export async function markDigestSent(userId: string): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ last_digest_at: new Date().toISOString() }),
    });
  } catch {
    /* nothing */
  }
}

// "YES." His approval, given in the only place he actually is.
//
// This confirms UNCONFIRMED entries only, and confirming is not an irreversible act:
// it says "this is really mine". It sends nothing to HMRC and it moves no money.
// Those still ask, every single time, and always will.
export async function confirmAllPending(userId: string): Promise<number> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.false&is_personal=eq.false&select=id`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ confirmed: true }),
    },
  );
  if (!res.ok) return 0;
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) ? rows.length : 0;
}
