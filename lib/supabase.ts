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
import { trialEndsAt } from './entitlement';
import type { TrialRow } from './trialnudge';
import { CUSTOMER_COLUMNS, normaliseSource } from './team';
import type { TeamCustomer, TeamMember } from './team';
import type { Snapshot } from './metrics';
import { parseLevel, type AutonomyLevel } from './autonomy';
import { quarterForDate, quarterBounds } from './quarterpack';
import type { OptimiserInput } from './taxoptimiser';
import { qaDedupeKey, qaPrunePaths } from './qaretention';
import type { KnowledgeState } from './knowledgewatch';
import type {
  Idea, Asset, Approval, Metric, AssetState, Format, Promise3, Platform, Storyboard,
} from './studio';
import { refreshFacts, resolveOverrides, isOverridableKey, isInBounds, type FactOverride } from './facts';
import { advanceStage, normaliseWhatsapp, isContactStage, isCheckoutStage, isEventKind, type ContactStage, type CheckoutStage, type EventKind } from './crm';

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
    // THE SAFETY GATE. Read this before you touch the status list.
    //
    // It was `status=eq.reviewed` and nothing else, and the reason was right: nothing we ASSERT
    // reaches a man's tax return until a human has approved it. That has not changed.
    //
    // 'verbatim' is admitted alongside it, and it is not a relaxation. It is the same principle
    // arriving at a different answer, because a verbatim quotation of HMRC IS NOT OUR CLAIM.
    //
    // What the gate protects against is a SUMMARISER BEING WRONG. That is a real danger and we have
    // the scars: the distiller read the mileage page, scored it 0.15, called it "not relevant", and
    // was confidently wrong about the one number in our engine that was actually broken. A model's
    // opinion must never reach a user unapproved.
    //
    // A 'verbatim' row contains no opinion. It is HMRC's own words, copied exactly, with the URL,
    // written by khoji/corpus.mjs, which verifies the sentence is on the page before it stores it
    // and raises an incident when it is not. There is nothing for a human to approve, because we
    // have not said anything: we have POINTED. Approving it would be theatre, and a review step
    // that exists to look diligent rather than to catch anything is how a gate becomes a habit and
    // then a rubber stamp.
    //
    // Every page is Crown copyright under the Open Government Licence v3.0, so quoting it with
    // attribution is licensed, not merely tolerated.
    //
    // THE RAIL: corpus.mjs will only ever write status='verbatim' for a gov.uk URL. If that rail
    // ever breaks, we would be publishing a stranger's words under HMRC's authority, and no test in
    // this repo would be more important than the one that catches it (test/rulesources.test.mjs).
    let path =
      'knowledge_items?status=in.(reviewed,verbatim)&source_url=not.is.null&summary=not.is.null' +
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
    // is_personal=false, because "invoice this" should never pre-fill from a child tax credit
    // or a refund the user has already told us is not business money.
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&amount=gt.0&income_type=neq.property&is_personal=eq.false` +
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

// --- CRM contacts (marketing_leads, extended) -------------------------------------------------
// The contact model layered on marketing_leads: a lead captured from a free tool or an ad, with
// consent, an attribution trail, a lifecycle stage, and a timeline (contact_events). captureContact
// upserts on email and never nulls a field it was not given, so a later touch enriches, not wipes.
// All server side, service role only.

export interface CaptureContactInput {
  email: string;
  name?: string | null;
  whatsapp?: string | null;
  consent: boolean;               // email marketing consent (the existing column)
  consentText?: string | null;
  resultNote?: string | null;
  waConsent?: boolean;            // separate WhatsApp consent, captured on the same form
  stream?: string | null;        // attribution: ad-barbers | organic | free-tool | ...
  entryPoint?: string | null;    // which tool / form / landing captured them
  sourceTag?: string | null;     // campaign / utm, mirrors Hoka's source_tag
  meta?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

// Upsert a contact and log the capture on its timeline. Merges on email: only provided fields are
// written, so re-capturing the same person enriches the record instead of clearing it. Returns false
// on a bad email or a failed write.
export async function captureContact(input: CaptureContactInput): Promise<boolean> {
  const { url } = config();
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) return false;
  const wa = normaliseWhatsapp(input.whatsapp);
  const record: Record<string, unknown> = { email, consent: input.consent };
  if (input.name != null) record.name = input.name;
  if (wa) { record.whatsapp = wa; if (input.waConsent) { record.wa_consent = true; record.wa_consent_at = new Date().toISOString(); } }
  if (input.consent) record.consent_at = new Date().toISOString();
  if (input.consentText != null) record.consent_text = input.consentText;
  if (input.resultNote != null) record.result_note = input.resultNote;
  if (input.stream != null) record.stream = input.stream;
  if (input.entryPoint != null) record.entry_point = input.entryPoint;
  if (input.sourceTag != null) record.source_tag = input.sourceTag;
  if (input.meta != null) record.meta = input.meta;
  if (input.ip != null) record.ip = input.ip;
  if (input.userAgent != null) record.user_agent = input.userAgent;
  const res = await fetch(`${url}/rest/v1/marketing_leads?on_conflict=email`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(record),
  });
  if (!res.ok) return false;
  await logContactEvent(email, 'form_submitted', { channel: 'web', detail: input.entryPoint ?? null, payload: { stream: input.stream ?? null } });
  return true;
}

// Append one event to a contact's timeline. Best effort, never throws, silently ignores an unknown kind.
export async function logContactEvent(email: string, kind: EventKind | string, opts?: { channel?: string | null; detail?: string | null; payload?: Record<string, unknown> | null }): Promise<void> {
  if (!isEventKind(String(kind))) return;
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/contact_events`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ email: email.trim().toLowerCase(), kind, channel: opts?.channel ?? null, detail: opts?.detail ?? null, payload: opts?.payload ?? {} }),
    });
  } catch { /* best effort */ }
}

// Move a contact's lifecycle stage, FORWARD ONLY (advanceStage guards regressions). Reads the current
// stage, computes the new one, writes only on a change. Returns the resulting stage, or null on error.
export async function setContactStage(email: string, next: ContactStage): Promise<ContactStage | null> {
  if (!isContactStage(next)) return null;
  const { url } = config();
  const key = email.trim().toLowerCase();
  try {
    const res = await fetch(`${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(key)}&select=stage`, { headers: headers() });
    const rows = res.ok ? ((await res.json()) as Array<{ stage: string }>) : [];
    const current: ContactStage = rows[0]?.stage && isContactStage(rows[0].stage) ? (rows[0].stage as ContactStage) : 'lead';
    const resolved = advanceStage(current, next);
    if (resolved !== current) {
      await fetch(`${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ stage: resolved }),
      });
    }
    return resolved;
  } catch { return null; }
}

// Record how far a contact got in checkout, and flip them to the paid lifecycle stage when they pay.
export async function setContactCheckout(email: string, checkout: CheckoutStage): Promise<void> {
  if (!isCheckoutStage(checkout)) return;
  const { url } = config();
  const key = email.trim().toLowerCase();
  try {
    await fetch(`${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(key)}`, {
      method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ checkout_stage: checkout }),
    });
    await logContactEvent(key, checkout === 'abandoned' ? 'checkout_abandoned' : checkout === 'paid' ? 'paid' : 'checkout_opened', { channel: 'web', detail: checkout });
    if (checkout === 'paid') await setContactStage(key, 'paid');
  } catch { /* best effort */ }
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
  // The income streams the user ticked on /start (job, property, loan). These used
  // to be dropped on the floor; they are the reliefs we carry into the app so nothing
  // is asked twice. See reconcileSignupToUser.
  streams?: string[] | null;
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
  if (Array.isArray(signup.streams) && signup.streams.length) record.streams = signup.streams;
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

// The web /start structure choice, mapped to the tax engine's business type. "A business name"
// is still a sole trader for tax; only a registered company is a limited company. Partnership is
// not offered on the web, so it never arrives here.
function tradeTypeToBusinessType(t: string | null | undefined): BusinessType {
  return t === 'ltd' ? 'limited_company' : 'sole_trader';
}

// `prompts` are the streams we could NOT fully apply because the web only captured a flag, not the
// detail: 'property' needs rent figures, 'loan' needs the plan. The app nudges the user to add those
// in their own screens, so even these do not feel like starting from scratch.
export interface ReconcileResult { reconciled: boolean; applied: string[]; prompts?: string[] }

// 🔴 SEAMLESS ONBOARDING. Pull what the user already told us on the web /start signup into their
// account, so the app never asks it a second time.
//
// Keyed by phone, the account key. IDEMPOTENT: it runs once, is marked with reconciled_at, and can
// never double-apply. It runs BEFORE the app first-run wizard, so it never overwrites a later
// in-app answer. Everything it writes is logged honestly: circumstances are stored with the wording
// the user actually saw on the web and channel 'web', because the log is the defence (Finance Act
// 2026 Sch 22), and a record must say what he really answered, on the surface he really answered it.
//
// It carries the facts that map cleanly: the business structure, the name/address, VAT status, and a
// PAYE job alongside the trade. The 'property' and 'loan' streams need details the web did not
// collect (rent figures, the student loan plan), so those stay as in-app prompts rather than guesses.
export async function reconcileSignupToUser(userId: string): Promise<ReconcileResult> {
  const { url } = config();

  // The phone is the join key, and it lives on the user, not in the request.
  const ures = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=phone_number&limit=1`,
    { headers: headers() },
  );
  if (!ures.ok) return { reconciled: false, applied: [] };
  const urows = (await ures.json().catch(() => null)) as Array<{ phone_number: string | null }> | null;
  const phone = Array.isArray(urows) && urows[0]?.phone_number ? urows[0].phone_number : '';
  const e164 = normalizeUkPhone(phone);
  if (!e164) return { reconciled: false, applied: [] };

  // The most recent signup for this phone that has not been reconciled yet.
  const res = await fetch(
    `${url}/rest/v1/signups?phone=eq.${encodeURIComponent(e164)}&reconciled_at=is.null` +
      `&select=trade_type,name,address,postcode,vat_registered,streams&order=created_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return { reconciled: false, applied: [] };
  const rows = (await res.json().catch(() => null)) as Array<{
    trade_type: string | null; name: string | null; address: string | null; postcode: string | null;
    vat_registered: boolean | null; streams: string[] | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return { reconciled: false, applied: [] };
  const s = rows[0];
  const applied: string[] = [];

  // 1. Business structure -> the tax engine branch. The biggest question, and now never asked twice.
  if (s.trade_type) {
    if (await setBusinessType(userId, tradeTypeToBusinessType(s.trade_type))) applied.push('business_type');
  }

  // 2. Name and address onto the profile, for invoices and the quarter pack header.
  const patch: Record<string, unknown> = {};
  if (s.name) {
    if (s.trade_type === 'ltd' || s.trade_type === 'business') patch.business_name = s.name;
    else patch.name = s.name;
  }
  const addr = [s.address, s.postcode].filter(Boolean).join(', ');
  if (addr) patch.address = addr;
  if (Object.keys(patch).length > 0) {
    const pr = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (pr.ok) applied.push('profile');
  }

  // 3. VAT status -> a circumstance, logged with the wording he saw on the web.
  if (s.vat_registered !== null && s.vat_registered !== undefined) {
    if (await saveCircumstance(
      userId, 'vat_registered', s.vat_registered ? 'yes' : 'no',
      'Are you VAT registered? (you answered this when you signed up on the Lekhio website)', 'web',
    )) applied.push('vat_registered');
  }

  // 4. A PAYE job alongside the trade -> the other_job circumstance. The salary itself is asked later.
  const streams = Array.isArray(s.streams) ? s.streams : [];
  if (streams.includes('job')) {
    if (await saveCircumstance(
      userId, 'other_job', 'yes',
      'You told us at signup that you also have a job on the payroll alongside your self-employed work.', 'web',
    )) applied.push('other_job');
  }

  // Mark reconciled, so a second app launch never re-applies any of the above.
  await fetch(
    `${url}/rest/v1/signups?phone=eq.${encodeURIComponent(e164)}&reconciled_at=is.null`,
    {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ reconciled_at: new Date().toISOString() }),
    },
  );

  return {
    reconciled: applied.length > 0,
    applied,
    prompts: streams.filter((x) => x === 'property' || x === 'loan'),
  };
}

// Verify a Supabase access token and return the verified user (id and email), or
// null. The values come from Supabase validating the JWT, never from anything the
// client asserts, so a user cannot claim another user's identity. Used by the
// authenticated endpoints (the accountant, the billing portal) to meter usage and
// resolve the right account.
export interface VerifiedUser {
  id: string;
  email: string | null;
  phone: string | null;
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
      phone?: string | null;
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
    // THIS NOW FAILS CLOSED. It used to fail OPEN.
    //
    // The old gate was `REJECT_ANON_USERS === 'true'`, so an anonymous JWT was accepted as a
    // full user unless one env var said otherwise. A security control whose DEFAULT is "allow",
    // and whose only enforcement is a single unasserted string, is one config drift away from
    // being off. Phone OTP is live and anonymous sign in is disabled at the Supabase project, so
    // there is no longer any reason for the permissive default to exist.
    //
    // The attack it closes: if anonymous sign in were ever re-enabled at the project (a
    // dashboard toggle, not a deploy) an attacker could mint unlimited throwaway JWTs from
    // /auth/v1/signup with no phone and no OTP, and hit every authenticated route. Not a
    // cross-tenant read, but free AI, free WhatsApp, and an identity model that no longer means
    // anything.
    //
    // Two locks now, not one: the project setting AND this. Set ALLOW_ANON_USERS=true only if
    // you deliberately want anonymous accounts back.
    const allowAnon = process.env.ALLOW_ANON_USERS === 'true';
    const isAnon = u.is_anonymous === true || u.app_metadata?.is_anonymous === true;
    if (isAnon && !allowAnon) return null;
    // Return the phone too. GoTrue puts it on the /auth/v1/user response, and the billing portal
    // resolves a phone-only Stripe customer from it. Without this the phone fallback could never fire,
    // so an account with no email got 400 no_identifier_on_account and could never reach its billing.
    return { id: u.id, email: u.email ?? null, phone: (u.phone ? String(u.phone) : null) };
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

// The account key is the phone (E.164 +44), so this is the reliable way to open
// the billing portal for a user who signed in by phone and has no email on their
// Supabase account. Checkout stored the phone on the subscription alongside the
// customer id, so this finds the same customer getStripeCustomerByEmail would.
export async function getStripeCustomerByPhone(phone: string): Promise<string | null> {
  const { url } = config();
  const e164 = normalizeUkPhone(phone);
  if (!e164) return null;
  const res = await fetch(
    `${url}/rest/v1/subscriptions?phone=eq.${encodeURIComponent(e164)}&select=stripe_customer_id&order=updated_at.desc&limit=1`,
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
// --- The team dashboard (lib/team.ts) ---------------------------------------------
//
// ⚠️ THE SELECT BELOW IS BUILT FROM CUSTOMER_COLUMNS. Do not hand-write a column list here.
//
// The team may see who a customer is and what he pays US. It may never see what he earns, what he
// spends, or a single one of his transactions, because the app tells him "only you can see them"
// and that has to stay true. lib/team.ts holds the allowlist and test/team.test.mjs fails the build
// if a financial column is ever added to it.

// Is this person on the team? Answered from the database on every request, so removing someone is
// a DELETE and takes effect immediately. No cached roles, no JWT claims to go stale.
export async function readTeamMember(email: string | null | undefined): Promise<TeamMember | null> {
  if (!email) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/team_members?email=eq.${encodeURIComponent(email.toLowerCase())}&select=email,name,role,is_active`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as TeamMember[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// The customer list. Names, trades, where they came from, and what they pay us. Nothing else.
export async function readTeamCustomers(): Promise<TeamCustomer[] | null> {
  try {
    const { url } = config();

    // Built from the allowlist, so it CANNOT name a column the allowlist does not contain.
    const cols = CUSTOMER_COLUMNS.join(',');
    const [uRes, sRes] = await Promise.all([
      fetch(`${url}/rest/v1/users?select=${cols}&order=created_at.desc&limit=2000`, { headers: headers() }),
      fetch(
        `${url}/rest/v1/subscriptions?select=phone,status,plan,amount_pence,current_period_end,cancel_at_period_end,stripe_subscription_id,updated_at&order=updated_at.desc&limit=5000`,
        { headers: headers() },
      ),
    ]);
    if (!uRes.ok || !sRes.ok) return null;

    const users = (await uRes.json()) as Array<Record<string, string | null>>;
    const subs = (await sRes.json()) as Array<{
      phone: string | null; status: string | null; plan: string | null;
      amount_pence: number | null;
      current_period_end: string | null; cancel_at_period_end: boolean | null;
      stripe_subscription_id: string | null;
    }>;

    // ⚠️ The subscription is keyed by PHONE, and the team is never shown a phone number. So we join
    // here, on the server, and the phone never leaves this function. It is used as a key and then
    // dropped on the floor.
    //
    // To do that we need each user's phone, which is NOT in CUSTOMER_COLUMNS, and must not be. So we
    // fetch it separately, use it, and never put it in a TeamCustomer. The allowlist governs what
    // LEAVES here, not what we may touch inside.
    const pRes = await fetch(`${url}/rest/v1/users?select=id,phone_number&limit=2000`, { headers: headers() });
    if (!pRes.ok) return null;
    const phones = new Map(
      ((await pRes.json()) as Array<{ id: string; phone_number: string | null }>).map((r) => [r.id, r.phone_number]),
    );

    // Latest subscription per phone. The list came back newest first, so the first one wins.
    const byPhone = new Map<string, (typeof subs)[number]>();
    for (const s of subs) {
      if (s.phone && !byPhone.has(s.phone)) byPhone.set(s.phone, s);
    }

    return users.map((u): TeamCustomer => {
      const phone = phones.get(String(u.id)) ?? '';
      const sub = phone ? byPhone.get(phone) : undefined;
      return {
        id: String(u.id),
        name: u.name ?? null,
        trade: u.trade_type ?? null,
        joined: u.created_at ?? null,
        source: normaliseSource(u.acquisition_source),
        sourceDetail: u.acquisition_detail ?? null,
        status: sub?.status ?? 'none',
        plan: sub?.plan ?? null,
        renews: sub?.current_period_end ?? null,
        cancelRequested: Boolean(sub?.cancel_at_period_end),
        // WHAT STRIPE IS ACTUALLY CHARGING HIM. Not what his plan is called.
        amountPence: sub?.amount_pence ?? 0,
        // NO STRIPE ID = NOT A CUSTOMER. It is the demo account we built for Apple, or a comp we
        // granted. It is a real row and it is not revenue, and the difference is the whole point:
        // on its first day this dashboard showed "2 customers, MRR £13" on a morning when nobody
        // had ever paid us a penny.
        internal: Boolean(sub) && !sub!.stripe_subscription_id,
      };
    });
  } catch {
    return null;
  }
}

// Record where a customer came from.
//
// Meta and organic can in principle be inferred one day from a landing page click. A BILLBOARD
// CANNOT. Neither can a man Jag sold to in a merchant's yard. Those facts only exist in a human's
// head, and if there is nowhere to put them they stay there, and then the advertising budget gets
// decided by whoever remembers hardest.
//
// So the team can set it. It is the only write this dashboard has, and it touches two columns that
// are about OUR marketing, never about his money.
export async function setCustomerSource(
  userId: string,
  source: string,
  detail: string | null,
): Promise<boolean> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        acquisition_source: normaliseSource(source),
        acquisition_detail: detail && detail.trim() ? detail.trim().slice(0, 120) : null,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- The numbers (lib/metrics.ts) -------------------------------------------------

// ⚠️ THERE IS NO readSignupDates(), AND THERE MUST NOT BE ONE. HERE IS WHY, WRITTEN DOWN SO NOBODY
// PUTS IT BACK.
//
// There used to be. It read `select=created_at from users`, which is every row in the table, and it
// fed the growth chart: the first thing anybody looks at, and the one number that tells you whether
// there is a business here at all.
//
// Every OTHER figure on the console excludes internal accounts, because the App Review demo account
// is not a customer and a comp is not revenue. The growth chart did not, because it came from a
// SECOND query that had never heard of the word "internal".
//
// So on the day we looked at it, the page said CUSTOMERS 1 in a box, and two inches below said
// "2 people have signed up". The difference was our own demo account. A hundred per cent inflation
// of the only number that matters early, on the screen we would use to decide whether to keep going.
//
// The lesson is not "remember to filter". It is that TWO QUERIES OVER THE SAME PEOPLE WILL DRIFT,
// and one of them will be the one you believe. Signups now come from the SAME list of customers as
// every other figure on the page, in app/api/team/metrics/route.ts. One read, one truth, and the
// internal flag is applied once. See test/metrics.test.mjs, which fails if a comp is ever counted.

// The recorded history. Empty until the cron has run at least once, and the page says so rather
// than drawing a shape it invented. See supabase/APPLY_2026-07-14_metrics_daily.sql.
export async function readSnapshots(days = 90): Promise<Snapshot[] | null> {
  try {
    const { url } = config();
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch(
      `${url}/rest/v1/metrics_daily?day=gte.${from}&select=day,customers,paying,trialing,mrr_pence&order=day.asc`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Snapshot[];
  } catch {
    return null;
  }
}

// Write today down. Upsert on the day, so running twice corrects rather than duplicates.
export async function writeSnapshot(s: Snapshot): Promise<boolean> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/metrics_daily`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({ ...s, recorded_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- The trial ending (docs/39, lib/trialnudge.ts) --------------------------------

// Every LOCAL trial that is close to ending or has ended, and has not already been told about it.
//
// Deliberately NOT filtered on the dates in SQL. The decision of what counts as "ending" is policy,
// it lives in lib/trialnudge.ts where it is pinned by tests, and it is not going to be quietly
// reimplemented as a `where` clause that nobody can test. This just hands over the candidates.
//
// stripe_subscription_id is null: only our own no-card grants. A man with a card on file is
// Stripe's conversation, not ours.
export async function trialsNeedingNudge(): Promise<TrialRow[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/subscriptions` +
        `?status=eq.trialing&stripe_subscription_id=is.null` +
        `&or=(trial_warn_sent_at.is.null,trial_end_sent_at.is.null)` +
        `&select=phone,status,current_period_end,stripe_subscription_id,trial_warn_sent_at,trial_end_sent_at`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as TrialRow[];
  } catch {
    return null;
  }
}

// Record that we have told him, BEFORE we tell him.
//
// The order matters and it is not paranoia. If we sent first and marked second, then a crash, a
// timeout, or a Vercel function hitting its wall between the two would leave the row unmarked, and
// tomorrow's cron would message him again. And again. A man being told three times that his trial
// is ending is a man who blocks the number.
//
// So we mark first. The cost of the opposite failure, marking and then failing to send, is that he
// misses one message. That is the cheaper mistake, and it is the one we choose.
export async function markTrialNudged(phone: string, which: 'warn' | 'ended'): Promise<boolean> {
  try {
    const { url } = config();
    const col = which === 'warn' ? 'trial_warn_sent_at' : 'trial_end_sent_at';
    const res = await fetch(
      `${url}/rest/v1/subscriptions?phone=eq.${encodeURIComponent(phone)}&${col}=is.null`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ [col]: new Date().toISOString() }),
      },
    );
    if (!res.ok) return false;
    // The `is.null` guard makes this a claim, not just an update: if two crons somehow ran at once,
    // exactly one of them changes a row and gets it back. The other gets an empty array and sends
    // nothing.
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

// GRANT THE FREE TRIAL. Once per phone number, for the whole life of that number.
//
// WHY THIS FUNCTION HAD TO BE WRITTEN, AND WHAT WAS HAPPENING WITHOUT IT
//
// The app showed a button that said "Start free trial". It called router.replace('/(tabs)') and
// NOTHING ELSE. No row was created, anywhere, ever. So /api/billing/status answered {status:'none'}
// and the paywall gate read that, correctly, as "not entitled". The moment paywall enforcement was
// switched on, every single new user would have tapped "Start free trial" and been shown, on the
// very next screen, "This account is not active".
//
// We were advertising fourteen days free, no card needed, and the fourteen days did not exist.
//
// ONCE PER PHONE, FOREVER. The grant happens only when the phone has NO subscription row at all.
// A man whose trial ended, or who cancelled, has a row: he gets nothing new. So this cannot be
// farmed by deleting the app, and a lapsed customer can never be handed a second free fortnight.
//
// THE RACE, AND WHY THE DATABASE SETTLES IT AND NOT THIS CODE. Two app launches a moment apart
// would both read "no row" and both insert. So there is a UNIQUE INDEX on phone for rows with no
// stripe_subscription_id (see supabase/APPLY_2026-07-13_trial_grant.sql), which makes a second
// local grant physically impossible. The loser of the race gets a 409, which we swallow and then
// re-read the row the winner wrote. The rule is enforced by the database, not by our good manners.
//
// No Stripe ids. This is a local grant, not a customer. It can never be billed, and it will never
// appear in Stripe or in the revenue count in countPayingUsers.
export async function grantTrialIfNone(phone: string): Promise<SubscriptionStatus | null> {
  if (!phone) return null;
  try {
    const existing = await getSubscriptionByPhone(phone);
    if (existing) return existing; // he has a history. Nothing is owed to him for free.

    const { url } = config();
    const res = await fetch(`${url}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        phone,
        plan: null, // he has not chosen one. Pretending otherwise would put a lie in the database.
        status: 'trialing',
        amount_pence: 0, // nothing is being charged. Not 1299. Nothing.
        current_period_end: trialEndsAt(),
        cancel_at_period_end: false,
      }),
    });

    // 409: the unique index refused a second grant, which means another request won the race a
    // millisecond ago. That is the system working. Read what he wrote and hand it back.
    if (res.status === 409) return await getSubscriptionByPhone(phone);
    if (!res.ok) return null;

    const rows = (await res.json()) as SubscriptionStatus[];
    return rows[0] ?? (await getSubscriptionByPhone(phone));
  } catch {
    return null;
  }
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

// listNudgeTargets was DELETED. It loaded the ENTIRE users table (200 x 1000) and the ENTIRE
// reminder_prefs table with no filter, and nothing called it: the crons use listNudgeTargetsPage
// and getNudgePrefsForUsers, which page properly. A function that would fall over at 100k users,
// sitting unused in the hottest file in the codebase, is a loaded gun waiting for someone to pick
// it up because the name reads well.

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

// The weekly totals for THE PAGE WE ARE ABOUT TO SEND TO. Not for everybody.
//
// weeklyTotalsAll() (below, now unused by the cron) asked for every user in one payload and
// held the lot in a Map before the paging loop had even started. The careful pagination
// underneath it was decorative: at a hundred thousand users the function dies on that one
// query, and nobody gets a Monday brief at all.
//
// Same shape as getNudgePrefsForUsers, which already got this right.
export async function weeklyTotalsFor(userIds: string[]): Promise<Map<string, WeeklyTotalsRow> | null> {
  if (userIds.length === 0) return new Map();
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/weekly_totals_for`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_user_ids: userIds.filter((i) => UUID.test(i)) }),
    });
    // null, not an empty map. An empty map means "nobody earned anything", and we would
    // cheerfully text a man that he made zero this week. Null means "we do not know", and
    // the caller falls back to asking per user.
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ user_id: string; income: number | string; expenses: number | string }>;
    if (!Array.isArray(rows)) return null;
    const out = new Map<string, WeeklyTotalsRow>();
    for (const r of rows) {
      out.set(r.user_id, { user_id: r.user_id, income: Number(r.income) || 0, expenses: Number(r.expenses) || 0 });
    }
    return out;
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

  const [rows, sl, goals, biz] = await Promise.all([
    getConfirmedTransactionsForRange(userId, taxYearStart, todayISO),
    getStudentLoanSettings(userId),
    getActiveGoals(userId),
    getBusinessProfile(userId),
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

  // 🔴 A PARTNERSHIP SHARES ONE SET OF BOOKS. The app sees the WHOLE partnership's income and expenses
  // (the shared account), but this man is taxed only on HIS SLICE of the profit. GOV.UK,
  // /set-up-business-partnership: "each partner pays tax on their share." So we scale his trade figures
  // by his share BEFORE any tax is worked out. It is 100% for a sole trader and a director, so nothing
  // moves for them. Without this a partner is set-aside for tax on his partners' profit too, which ties
  // up money he does not owe. His share was captured at setup and has been sitting unused until now.
  const partnerFactor = biz && biz.businessType === 'partnership' ? biz.partnershipShare / 100 : 1;
  ytdTradeIncome *= partnerFactor;
  ytdTradeExpenses *= partnerFactor;
  ytdCisSuffered *= partnerFactor;

  const start = new Date(`${taxYearStart}T00:00:00Z`);
  const monthsElapsed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (30.44 * 86400000)));
  const purchase = goals.find((g) => g.kind === 'purchase');

  // WHAT HE HAS TOLD US ABOUT HIMSELF, read ONCE (see the note on the return): the answers as a map.
  // The two income amounts (savings interest, dividends) are NOT here. They live on his profile next
  // to the salary, entered on the NI hub, read off `sl` below, because they are amounts he types and
  // edits, not a yes/no answer to a question we asked. A circumstance is the wording we showed him
  // and his answer to it; a running total of bank interest is neither.
  const circList = (await readCircumstances(userId)) ?? [];
  const circMap = Object.fromEntries(circList.map((c) => [c.key, c.answer]));

  return {
    startYear,
    monthsElapsed,
    ytdTradeIncome: Math.round(ytdTradeIncome * 100) / 100,
    ytdTradeExpenses: Math.round(ytdTradeExpenses * 100) / 100,
    ytdCisSuffered: Math.round(ytdCisSuffered * 100) / 100,
    employmentIncome: sl?.employmentIncome ?? 0,
    // THE PLANS WERE ALREADY FETCHED AND THEN THROWN AWAY.
    //
    // `sl` has held the student loan settings all along; only `employmentIncome` was ever taken
    // off it. So the optimiser could not net the loan off the CIS refund, and told a subbie with
    // a student loan that a bigger refund was coming than he would actually get. Promising a man
    // money he will not receive is the cruel way to be wrong: he may well have spent it.
    studentPlans: [
      ...(sl?.plan ? [sl.plan] : []),
      ...(sl?.postgrad ? ['postgrad' as const] : []),
    ],
    categoriesLogged,
    homeOfficeClaimed: categoriesLogged.some((c) => c.includes('home')),
    mileageClaimed: categoriesLogged.some((c) => c.includes('mile')),
    purchaseGoal: purchase ? { title: purchase.title, amount: purchase.amount } : null,
    ytdPropertyIncome: Math.round(ytdPropertyIncome * 100) / 100,
    ytdPropertyExpenses: Math.round(ytdPropertyExpenses * 100) / 100,

    // The rest of his income, so taxPosition() shows his WHOLE tax. Entered on the NI hub next to the
    // salary, 0 until he does, which is the sole-trader case.
    savingsIncome: sl?.savingsIncome ?? 0,
    dividendIncome: sl?.dividendIncome ?? 0,

    // WHAT HE HAS TOLD US ABOUT HIMSELF. Read HERE, once, so that every caller of the optimiser gets
    // it without knowing it exists: the app, the WhatsApp reply, the ledger.
    //
    // ⚠️ IT IS READ IN THIS FUNCTION AND NOT IN THE THREE ROUTES, AND THAT IS THE WHOLE POINT.
    //
    // Two readers over the same money WILL drift, and the one that drifts is always the one he
    // happens to be looking at. This codebase produced that bug three times in a single day: the
    // signups count, the knowledge count, the review queue. Marriage is money. It gets one reader.
    //
    // A failed read yields {} which means UNKNOWN everywhere downstream, never "no". A man does not
    // become single because Postgres timed out.
    circumstances: circMap,
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

// What is CAPTURED but not yet approved. The confirmed-only totals above are the settled figure, but a
// man who has just texted five things and then asks "what do I owe" should not be told "nothing", he
// should be told his entries are waiting for his tick. This sums the unconfirmed, non-personal rows so
// the WhatsApp reply can acknowledge them without ever counting them as settled.
export async function pendingSummaryForUser(
  userId: string,
  sinceISO: string | null,
): Promise<{ count: number; income: number; expenses: number } | null> {
  const { url } = config();
  const since = sinceISO ? `&transaction_date=gte.${encodeURIComponent(sinceISO)}` : '';
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&confirmed=eq.false&is_personal=eq.false${since}&select=amount&limit=1000`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Array<{ amount: number | string | null }> | null;
  if (!Array.isArray(rows)) return null;
  let income = 0;
  let expenses = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    if (a >= 0) income += a;
    else expenses += Math.abs(a);
  }
  return { count: rows.length, income, expenses };
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
  // UNSWEEPABLE. This line smells like a benefit, a refund, a bet or a transfer. It is NOT
  // excluded from the books (that is his call), but no bulk confirm may ever touch it. See
  // lib/personal.ts and lib/banksync.ts.
  looks_personal?: boolean;
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
      // And the "this smells like a benefit" flag. Same trap: this builder constructs rows
      // field by field, so a field you forget is a field that is silently thrown away, and the
      // code still compiles and the tests still pass. That is exactly how is_personal was lost
      // once already.
      looks_personal: entry.looks_personal === true,
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
  // The rest of his income, entered on the NI hub alongside the salary, read here so the whole-person
  // tax (taxPosition) can add it. Zero until he tells us, which is the sole-trader case.
  savingsIncome: number;
  dividendIncome: number;
}

export async function getStudentLoanSettings(userId: string): Promise<StudentLoanSettings | null> {
  const { url } = config();
  const query = `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=student_loan_plan,student_loan_postgrad,employment_income,savings_income,dividend_income&limit=1`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Array<{
    student_loan_plan: string | null;
    student_loan_postgrad: boolean | null;
    employment_income: number | string | null;
    savings_income: number | string | null;
    dividend_income: number | string | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  const plan =
    r.student_loan_plan === 'plan1' || r.student_loan_plan === 'plan2' || r.student_loan_plan === 'plan4' || r.student_loan_plan === 'plan5'
      ? r.student_loan_plan
      : null;
  const amount = (v: number | string | null): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    plan,
    postgrad: Boolean(r.student_loan_postgrad),
    employmentIncome: amount(r.employment_income),
    savingsIncome: amount(r.savings_income),
    dividendIncome: amount(r.dividend_income),
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

// 🔴 THE BUSINESS STRUCTURE. It changes which tax engine applies, so it is stored, not guessed.
//
// sole_trader     -> soleTraderTax on the whole profit (the default the engine always assumed).
// partnership     -> soleTraderTax on the PARTNER'S SHARE of profit. The partnership itself files
//                    separately; the individual is taxed on their slice.
// limited_company -> a different animal entirely: corporation tax on company profit, then the
//                    director's personal tax on however they extract it (salary + dividends). That is
//                    the Pay Yourself engine (lib/payyourself.ts, lib/ltdengine.ts).
export type BusinessType = 'sole_trader' | 'limited_company' | 'partnership';

export interface BusinessProfile {
  businessType: BusinessType;
  /** For a partnership only: the individual's percentage share of profit. 100 for everyone else. */
  partnershipShare: number;
}

export async function getBusinessProfile(userId: string): Promise<BusinessProfile | null> {
  const { url } = config();
  const query = `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=business_type,partnership_share&limit=1`;
  const res = await fetch(query, { headers: headers() });
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Array<{
    business_type: string | null;
    partnership_share: number | string | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  const bt: BusinessType =
    r.business_type === 'limited_company' || r.business_type === 'partnership' ? r.business_type : 'sole_trader';
  // A share is only meaningful for a partnership, and defaults to the whole thing until told
  // otherwise, so a half-answered setup never quietly halves a sole trader's tax.
  const share = Number(r.partnership_share);
  return {
    businessType: bt,
    partnershipShare: bt === 'partnership' && Number.isFinite(share) && share > 0 && share <= 100 ? share : 100,
  };
}

export async function setBusinessType(userId: string, businessType: BusinessType): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ business_type: businessType }),
  });
  return res.ok;
}

export async function setPartnershipShare(userId: string, share: number): Promise<boolean> {
  const { url } = config();
  const clamped = Math.max(1, Math.min(100, Math.round(share)));
  const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ partnership_share: clamped }),
  });
  return res.ok;
}

// 🔴 THE LAW FRESHNESS FOR THE CONSTELLATION. Reads khoji_law (written nightly by khoji/lawwatch.mjs)
// and turns it into a per-field pulse the brain map can colour with. A field with NO row here is left
// out of the map, so the console draws it DIM (unmeasured), which is the honest state until lawwatch
// has actually reported on it. null means "we could not read it", which the console also draws dark.
export interface LawFieldFreshness { pulse: 'fresh' | 'attention' | 'stale'; says: string }

export async function readLawFreshness(): Promise<Record<string, LawFieldFreshness> | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/khoji_law?select=field,verdict,ok,checked_at`,
      { headers: headers(), signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{
      field: string; verdict: string | null; ok: boolean | null; checked_at: string | null;
    }> | null;
    if (!Array.isArray(rows)) return null;

    const rank: Record<LawFieldFreshness['pulse'], number> = { fresh: 0, attention: 1, stale: 2 };
    const byField: Record<string, LawFieldFreshness> = {};

    for (const r of rows) {
      const hrs = r.checked_at ? (Date.now() - new Date(r.checked_at).getTime()) / 3_600_000 : Infinity;
      let f: LawFieldFreshness;
      if (r.ok === false) f = { pulse: 'stale', says: 'A source could not be read last night. Not knowing is not the same as being fine.' };
      else if (hrs > 40) f = { pulse: 'stale', says: `Not checked for ${Math.round(hrs)} hours.` };
      else if (r.verdict === 'silent') f = { pulse: 'attention', says: 'The law text changed and nothing announced it. A human should read it.' };
      else if (r.verdict === 'revised') f = { pulse: 'attention', says: 'A new revised version was published. The provision may have moved.' };
      else f = { pulse: 'fresh', says: 'Checked against legislation.gov.uk last night, unchanged.' };

      // Keep the WORST state per field: a field is only as fresh as its least-fresh source.
      if (!byField[r.field] || rank[f.pulse] > rank[byField[r.field].pulse]) byField[r.field] = f;
    }
    return byField;
  } catch {
    return null;
  }
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setManyPersonal(userId: string, ids: string[]): Promise<number> {
  // These ids arrive from a request body and get built into a PostgREST filter by hand.
  // encodeURIComponent is not a validator: PostgREST decodes the string straight back,
  // so an id containing a quote and a comma reopens the list and appends rows of the
  // attacker's choosing. user_id=eq. means he could only ever reach his own books, so
  // this is a bug rather than a breach, but "the blast radius happens to be small" is
  // not a design. An id is a uuid or it is not an id.
  const clean = ids.filter((i) => UUID.test(i));
  if (clean.length === 0) return 0;

  const { url } = config();
  const list = clean.map((i) => `"${i}"`).join(',');
  const res = await fetch(
    `${url}/rest/v1/transactions?id=in.(${encodeURIComponent(list)})` +
      `&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ is_personal: true }),
    },
  );
  return res.ok ? clean.length : 0;
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
// A page of the digest walk.
//
// `users` is who to TEXT. `lastId` and `more` describe the RAW SCAN, and they have to,
// because the two are no longer the same thing once opt outs are removed.
//
// The cron used to infer "more users to walk" from `users.length === PAGE`. The moment
// this function started dropping opted out people, that inference became a bug with a
// nasty shape: a page of 200 where 150 have opted out returns 50, the cron reads 50 as
// "the list is finished", stops, and every user after that point silently never gets a
// digest again. It would have looked like nothing at all was wrong.
export type DigestPage = { users: DigestCandidate[]; lastId: string | null; more: boolean };

export async function usersDueDigest(afterId: string | null, limit: number): Promise<DigestPage> {
  const { url } = config();
  const after = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  const res = await fetch(
    `${url}/rest/v1/users?select=id,phone_number,last_inbound_at,last_digest_at${after}` +
      `&phone_number=not.is.null&order=id.asc&limit=${limit}`,
    { headers: headers() },
  );
  if (!res.ok) return { users: [], lastId: afterId, more: false };

  const page = (await res.json()) as DigestCandidate[];
  // The cursor and the "keep going" flag come from the RAW page, before any filtering.
  const lastId = page.length > 0 ? page[page.length - 1].id : afterId;
  const more = page.length === limit;
  if (page.length === 0) return { users: [], lastId, more: false };

  // STOP HAS TO ACTUALLY STOP.
  //
  // This page came straight out of `users` and went straight to WhatsApp. It never
  // looked at reminder_prefs. So a man who texted STOP, and got told "no more
  // reminders", carried on getting a message from us every single day.
  //
  // That is not a bug you get to fix later. Under PECR an opt out has to be honoured,
  // and on WhatsApp it does not need a regulator: enough people press Block and Meta
  // takes the number off us, and the whole product goes with it.
  //
  // We ask for the prefs of THIS PAGE only, and drop the opt outs. A missing row means
  // he never touched it, which means yes, so we only remove people who explicitly said no.
  const prefsRes = await fetch(
    `${url}/rest/v1/reminder_prefs?select=user_id,daily_nudges&user_id=in.(${page.map((u) => u.id).join(',')})`,
    { headers: headers() },
  );

  // FAIL CLOSED, but KEEP WALKING. If we cannot read the prefs we text nobody on this
  // page, because texting a man who asked us twice to leave him alone costs us the
  // number. But `more` still stands, so one bad lookup does not end the whole run.
  if (!prefsRes.ok) return { users: [], lastId, more };

  const optedOut = new Set(
    ((await prefsRes.json()) as Array<{ user_id: string; daily_nudges: boolean }>)
      .filter((p) => p.daily_nudges === false)
      .map((p) => p.user_id),
  );

  return { users: page.filter((u) => !optedOut.has(u.id)), lastId, more };
}

// What landed from the bank and is still waiting for a yes.
// What the bank sent, split the way the digest needs it.
//
//   filed   we auto filed these, because he had already taught us the vendor
//   asking  we do not know these, so they are the only thing he is asked about
//
// See doc 104 section 3 and lib/banksync.ts for why that split exists.
export type DigestEntry = { id: string; vendor: string | null; amount: number; category: string | null };
export type DigestSplitRow = { filed: DigestEntry[]; asking: DigestEntry[] };

// ONE QUERY FOR THE WHOLE PAGE, NOT TWO PER PERSON.
//
// The digest cron called bankEntriesForDigest(u.id) inside its loop. Two REST queries
// per user, then a send, then a write: roughly three round trips each, in a row, for
// two hundred users. At a realistic 150ms that is ninety seconds of work inside a sixty
// second function.
//
// And the way it failed was the nasty part. The page times out half way through, and
// the continuation hop is registered in after(), which never runs if the invocation is
// killed. So the walk does not slow down, it STOPS, silently, at whatever user id it
// happened to reach, and every user after that gets nothing until someone notices.
//
// So we ask once for the whole page and group in memory. Two queries for two hundred
// people instead of four hundred.
export async function bankEntriesForDigestMany(userIds: string[]): Promise<Map<string, DigestSplitRow>> {
  const out = new Map<string, DigestSplitRow>();
  if (userIds.length === 0) return out;
  for (const id of userIds) out.set(id, { filed: [], asking: [] });

  const { url } = config();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const ids = userIds.filter((i) => UUID.test(i));
  if (ids.length === 0) return out;
  const inList = ids.map((i) => `"${i}"`).join(',');

  async function q(confirmed: boolean): Promise<Array<DigestEntry & { user_id: string }>> {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=in.(${encodeURIComponent(inList)})` +
        `&confirmed=eq.${confirmed}&source_type=eq.bank_feed&is_personal=eq.false` +
        `&created_at=gte.${encodeURIComponent(since)}` +
        `&select=id,user_id,vendor,amount,category&order=created_at.desc`,
      { headers: headers() },
    );
    if (!res.ok) return [];
    return await res.json();
  }

  const [filed, asking] = await Promise.all([q(true), q(false)]);

  // The old per-user query had `limit=20`. That limit has to survive the batching, or a
  // man with a busy day gets a digest the length of a bank statement. It is applied per
  // person here, not across the page.
  for (const r of filed) {
    const slot = out.get(r.user_id);
    if (slot && slot.filed.length < 20) slot.filed.push({ id: r.id, vendor: r.vendor, amount: r.amount, category: r.category });
  }
  for (const r of asking) {
    const slot = out.get(r.user_id);
    if (slot && slot.asking.length < 20) slot.asking.push({ id: r.id, vendor: r.vendor, amount: r.amount, category: r.category });
  }
  return out;
}

// Same idea: one write for everyone we texted, not one per person.
export async function markDigestSentMany(userIds: string[]): Promise<void> {
  const ids = userIds.filter((i) => UUID.test(i));
  if (ids.length === 0) return;
  const { url } = config();
  const inList = ids.map((i) => `"${i}"`).join(',');
  await fetch(`${url}/rest/v1/users?id=in.(${encodeURIComponent(inList)})`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ last_digest_at: new Date().toISOString() }),
  });
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
// BOUNDED, AND THE BOUND IS THE WHOLE POINT.
//
// This used to confirm EVERY unconfirmed row in the account, with no date limit. The
// digest shows him at most eight lines. So "yes" was approving things he had never
// been shown, which is not an approval gate, it is a rubber stamp with his name on
// it.
//
// Now it confirms only what the digest actually put in front of him: bank entries,
// unconfirmed, from the window the digest covered. Anything older, and anything he
// captured himself and has not reviewed, still waits for him.
//
// Confirming is not irreversible: it says "that is really mine". It sends nothing to
// HMRC and it moves no money. Those still ask, every single time.
export async function confirmDigestEntries(userId: string, sinceISO: string): Promise<number> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.false&is_personal=eq.false` +
      `&source_type=eq.bank_feed` +
      `&created_at=gte.${encodeURIComponent(sinceISO)}` +
      `&select=id`,
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

// When we last sent this user a digest, so "yes" can be scoped to it.
export async function lastDigestAt(userId: string): Promise<string | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=last_digest_at&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ last_digest_at: string | null }>;
  return rows[0]?.last_digest_at ?? null;
}



// ---------------------------------------------------------------------------
// The cron watchdog. See supabase/scale_hardening.sql.
//
// A cron that stops does not fail. It simply never happens again, and the endpoint keeps
// answering 200 while it does not happen. That is how the digest reached the first two
// hundred users and reported success every day. These three write down enough for
// /api/health to notice the silence.
// ---------------------------------------------------------------------------

export async function cronStarted(job: string): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rpc/cron_started`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ p_job: job }),
    });
  } catch {
    // The watchdog must never be the thing that breaks the job it is watching.
  }
}

export async function cronFinished(job: string, ok: boolean, pages: number, error?: string): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rpc/cron_finished`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ p_job: job, p_ok: ok, p_pages: pages, p_error: error ?? null }),
    });
  } catch {
    // As above.
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 RAKHA'S HEARTBEAT. The organ that acts for the user, and until now it left no trace.
//
// Khoji has one. The amendment watcher has one. The Budget loop has one. All three got them because
// this brain once sat DEAD FOR FIVE DAYS while launchd reported success every morning.
//
// Rakha had the TRANSPORT half (cronStarted/cronFinished, so a stopped walk turns /api/health red)
// and not the COGNITIVE half. processUser() returns early and writes NOTHING when it finds no
// signals, so a Rakha that walks every user and thinks about NOBODY is identical, in the database,
// to a genuinely quiet week. Both are zero rows in agent_signals.
//
// ⚠️ `considered` IS THE LOAD-BEARING FIELD, exactly as `checked` is for the differ.
// A RUN THAT LOOKED AT NOBODY IS NOT A RUN.
//
// NO financial data. It ran, when, how many it looked at, how many it told. Nothing about the man.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface RakhaRun {
  ran_at: string;
  considered: number;
  signalled: number;
  sent: number;
  ok: boolean;
}

export async function recordRakhaRun(r: {
  considered: number; signalled: number; sent: number; ok: boolean; durationMs: number;
}): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rakha_runs`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        considered: r.considered,
        signalled: r.signalled,
        sent: r.sent,
        ok: r.ok,
        duration_ms: r.durationMs,
      }),
    });
  } catch {
    // A heartbeat must NEVER be the thing that kills the organ it is listening to. Same rule as the
    // cron watchdog above.
  }
}

// ⚠️ null means WE COULD NOT READ THE HEARTBEAT. It does not mean there isn't one, and the console
// must not draw those two the same. That distinction is the whole reason this console exists.
export async function readRakhaRuns(limit = 30): Promise<RakhaRun[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/rakha_runs?select=ran_at,considered,signalled,sent,ok&order=ran_at.desc&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export interface OverdueCron {
  job: string;
  last_finished: string | null;
  hours_ago: number;
}

import type { CronRun } from './cronwatch';

// Every job's last known state. Small table, one row per job, so no paging needed.
export async function listCronRuns(): Promise<CronRun[] | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/cron_runs?select=job,last_started,last_finished,last_ok,last_error`, {
      headers: headers(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export async function cronOverdue(maxAgeHours: number): Promise<OverdueCron[] | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/cron_overdue`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_max_age_hours: maxAgeHours }),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

// One shared counter, in the same database as the spend caps. See lib/ratelimit.ts.
export async function rateHit(key: string, limit: number, windowSeconds: number): Promise<boolean | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/rate_hit`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
    });
    if (!res.ok) return null;
    return (await res.json()) === true;
  } catch {
    return null;
  }
}

export async function sweepRateHits(): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rpc/rate_hits_sweep`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({}),
    });
  } catch {
    // Housekeeping. Never worth failing a cron over.
  }
}


// ---------------------------------------------------------------------------
// The pile. See lib/reviewpile.ts and app/api/pile/route.ts.
// ---------------------------------------------------------------------------

// Everything still waiting on him. Bank rows, unconfirmed, not already excluded.
//
// Capped at 1000. Ninety days of a busy tradesman is two to three hundred; a thousand is a
// year of heavy use and well past the point where a review deck is the right tool anyway.
export async function pileEntries(userId: string): Promise<Array<{
  id: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  category: string | null;
  looks_personal: boolean | null;
}>> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.false&is_personal=eq.false&source_type=eq.bank_feed` +
      `&select=id,vendor,description,amount,category,looks_personal` +
      `&order=transaction_date.desc&limit=1000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  return await res.json();
}

// One decision, many rows, one statement.
//
// The GUARD IS IN THE SQL, not here. confirm_pile refuses income, refuses anything flagged
// looks_personal, and refuses rows that are not his, whatever this function passes it. A guard
// that lives only in the client is a suggestion, and this endpoint takes a list of ids from a
// request body.
export async function confirmPile(userId: string, ids: string[], category: string): Promise<number> {
  const clean = ids.filter((i) => UUID.test(i));
  if (clean.length === 0) return 0;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/confirm_pile`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_user: userId, p_ids: clean, p_category: category }),
    });
    if (!res.ok) return 0;
    const n = await res.json();
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0;
  }
}

// --- Khoji, the knowledge brain (docs/105) -----------------------------------
//
// Read the state of the brain for /api/health. Three questions, and the third is the one that
// did not exist until 12 July 2026 and is the reason Khoji was built:
//
//   1. Is it still learning?          (has any row arrived recently)
//   2. Is anyone approving?           (only `reviewed` rows ever reach a user's tax answer)
//   3. IS OUR TAX ENGINE WRONG?       (has the differ found a constant that disagrees with GOV.UK)
//
// Failure returns null, and the caller treats null as "unknown", never as "fine". A health check
// that cannot read the brain has not confirmed the brain is healthy.
export async function readKnowledgeState(): Promise<KnowledgeState | null> {
  try {
    const { url } = config();
    const q = async (path: string) => {
      const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers(), signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    const [newest, reviewed, incidents, lastRun] = await Promise.all([
      q('knowledge_items?select=created_at&order=created_at.desc&limit=1'),
      // created_at, not a reviewed_at, because there is no such column. It is a proxy: it answers
      // "has anything approved arrived lately", not "did somebody click approve lately". Good
      // enough to catch a stalled queue, and honest about which question it is answering.
      q('knowledge_items?status=eq.reviewed&select=created_at&order=created_at.desc&limit=1'),
      q('knowledge_items?status=in.(drift,extractor_broken)&select=status,raw'),
      // ⚠️ THE ONLY POSITIVE EVIDENCE ON THIS PAGE, AND NOTE `checked=gt.0`. IT IS THE WHOLE THING.
      //
      // Every other query above finds PROBLEMS, and a differ that has died finds no problems at all.
      // This is the one row that can tell "we checked and we are right" apart from "nothing has
      // looked since Monday".
      //
      // But the differ records a row when it CRASHES too, which is right: a failure that leaves no
      // trace is how this system died the first time. Which means "the newest row in khoji_runs" is
      // NOT evidence that anything was checked. A differ crash-looping at 3am every morning would
      // write a fresh row every night, hold this timestamp permanently green, and never once compare
      // a constant to GOV.UK. That is a heartbeat monitor wired to the fact that the patient is
      // still in the bed.
      //
      // So we ask for the newest run THAT ACTUALLY CHECKED SOMETHING. A run that compared nothing to
      // anything is not a heartbeat.
      //
      // ⚠️ AND IT MUST BE THE DIFFER'S OWN RUN. kind=eq.differ, not just any row in the table.
      //
      // khoji_runs now carries the amendment watcher's runs as well (khoji/amend.mjs). Both are
      // Khoji, both write here, and both write a row every night. Drop the kind filter and a healthy
      // amendment watcher would hold this timestamp green while the constant differ lay dead: the
      // page-change watcher would be saying "I am alive" and the reader would hear "your tax numbers
      // have been checked against GOV.UK". Two writers, one signal, and the reader believing
      // whichever spoke last. That is the house disease, and it is the third time in two days.
      q('khoji_runs?kind=eq.differ&checked=gt.0&select=ran_at&order=ran_at.desc&limit=1'),
    ]);

    const rows: { status: string; raw: { fact?: string; ours?: string | number; theirs?: string | number } | null }[] =
      Array.isArray(incidents) ? incidents : [];

    return {
      newestItemAt: Array.isArray(newest) && newest[0] ? newest[0].created_at : null,
      newestReviewedAt: Array.isArray(reviewed) && reviewed[0] ? reviewed[0].created_at : null,
      openDrift: rows
        .filter((r) => r.status === 'drift')
        .map((r) => ({ fact: r.raw?.fact ?? 'unknown', ours: r.raw?.ours ?? null, theirs: r.raw?.theirs ?? null })),
      openBlind: rows
        .filter((r) => r.status === 'extractor_broken')
        .map((r) => ({ fact: r.raw?.fact ?? 'unknown' })),
      lastDifferRunAt: Array.isArray(lastRun) && lastRun[0] ? lastRun[0].ran_at : null,
    };
  } catch {
    return null;
  }
}

// THE BRAIN, FOR THE CONSOLE. What Khoji knows, what it checked, and what it has never looked at.
//
// This is the one thing in the product that nobody else in the category has, and the temptation is
// therefore to make it look impressive. It shows three things and they are all uncomfortable:
//
//   what it checked last night, and whether that was recent enough to mean anything
//   what it has NEVER checked, by name, because "0 drift" means the ones we look at are right
//   what it has learned, and how much of that is sitting unreviewed
//
// A dashboard that only shows what is going well is a screensaver.
export interface BrainState {
  runs: Array<{
    ran_at: string; tax_year: string | null;
    published: number; checked: number; agreed: number; drifted: number; blind: number;
    unwatched: string[]; ok: boolean;
  }>;
  items: Array<{ status: string; created_at: string; title: string | null; source_url: string | null }>;
  /** Puchio's pulse. A COUNT and a TIMESTAMP. No question text, no answer text: a heartbeat, not a transcript. */
  answered: number;
  lastAnswerAt: string | null;
  /** Lekhio, in the middle. The only number on the console that is a PERSON and not a process. */
  subscribers: number;
  // THE QUEUE. Distilled, and waiting for a human to say yes.
  pending: PendingItem[];

  /**
   * 🔴 RAKHA'S HEARTBEAT. null is "WE COULD NOT READ IT", NOT "there isn't one".
   * Those are different facts and the console draws them differently. See organs.ts.
   */
  rakha: RakhaRun[] | null;

  // ⚠️ WHICH OF THE SIDE READS FAILED. Empty is the happy case.
  //
  // NOT a boolean, and NOT swallowed. If we could not count the subscribers, the console must say
  // "we could not count the subscribers", by name, and NOT go dark over the tax engine. The old code
  // reported a failed headcount as "we could not reach the database, and we do not know what Khoji
  // found", which was false twice over: the database was plainly up, and Khoji was fine.
  degraded: string[];
}

// ⚠️ THIS IS THE APPROVAL GATE, AND UNTIL TODAY IT WAS A NUMBER WITH NO BUTTON NEXT TO IT.
//
// The console said "39 waiting for a human" and there was no way for a human to do anything about
// it. The gate existed in the schema (`status`), the rule was enforced (nothing but a `reviewed` row
// ever reaches a user's tax answer), and the door had no handle.
//
// A queue nobody can approve is a brain that has stopped growing while looking busy. And an approval
// gate with no approve button is not a safeguard, it is a bottleneck we built and then forgot to
// open. Doc 104: one less button at a time, until only one is left. THIS is that one.
export interface PendingItem {
  id: string;
  title: string | null;
  summary: string | null;
  source_url: string | null;
  affects: string | null;
  effective_date: string | null;
  confidence: number | null;
  engine_impact: boolean;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 14 JULY. THIS FUNCTION BLACKED OUT THE TAX ENGINE PANEL BECAUSE IT COULD NOT COUNT SUBSCRIBERS.
//
// The console showed "Tax knowledge: ok" in green and, six inches below it, "Could not read the
// brain. We could not reach the database." Both on screen at once. Both wrong in different ways.
//
// THE CAUSE. This function asked for `users?select=id&subscription_status=in.(active,trialing)`.
// THERE IS NO subscription_status COLUMN ON users. It lives on `subscriptions.status`, which is
// where every other count in this file reads it from (see line ~77). I invented the column when I
// built the console, and never opened the page.
//
// PostgREST 400s. The 400 threw. The throw was caught by a bare `catch { return null }`. Five
// queries in a Promise.all, and ONE rejection took all five down.
//
// So the least important query on the screen, a HEADCOUNT, silenced the most important answer in
// the company: whether our tax numbers still match GOV.UK. And then the copy invented a reason
// ("could not reach the database") that it never established, while the database was plainly up and
// rendering the rest of the page around it.
//
// TWO RULES COME OUT OF IT, AND THEY ARE THE SAME RULE TWICE:
//
//   1. A LOAD-BEARING READ MAY BLACK OUT THE BRAIN. A NICE-TO-HAVE MAY NOT.
//      khoji_runs and knowledge_items are the brain. qa_cache and the subscriber count are garnish.
//      Garnish that fails is a missing number, not a blind console.
//
//   2. "I COULD NOT READ THIS" IS NOT "THE DATABASE IS DOWN". Say which read failed. Never guess at
//      the cause and print the guess as a fact. That is the sin of the whole week, in one catch.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export async function readBrain(days = 30): Promise<BrainState | null> {
  try {
    const { url } = config();
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const q = async (path: string) => {
      const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers(), signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    // ⚠️ AND PUCHIO'S NUMBER IS READ, NOT DEFAULTED TO ZERO.
    //
    // The route very nearly passed `brain.answered ?? 0`, which would have made the console say
    // "Nobody has asked anything yet" for ever, in a confident sentence, next to a real number of
    // real questions. A console that lies with a true-looking figure is worse than one that says
    // nothing, and it is the exact species of bug this whole screen exists to prevent.
    // 🔴 THE BRAIN. THESE THREE ARE LOAD-BEARING AND THEY STAY IN A Promise.all.
    //
    // If we cannot read khoji_runs or knowledge_items we genuinely do not know whether our tax
    // engine agrees with GOV.UK, and the ONLY honest thing is to go dark and say so. That is the
    // one case where the 503 was always right. NOT KNOWING IS NOT THE SAME AS BEING FINE.
    const [runs, items, pending] = await Promise.all([
      // ⚠️ kind=eq.differ. THE CONSOLE RENDERS THIS ROW AS A SENTENCE ABOUT TAX CONSTANTS.
      //
      // vitals() takes the newest run here and tells a human "62 of 62 constants matched". The
      // amendment watcher (khoji/amend.mjs) also writes to khoji_runs, every night, and its `checked`
      // is a count of PAGES, not constants. Without this filter the console would one day say
      // "23 of 23 constants matched" on a night when the differ was dead and nothing had gone
      // anywhere near a tax constant. The number would be real. The sentence would be a lie.
      q(`khoji_runs?kind=eq.differ&ran_at=gte.${since}&select=ran_at,tax_year,published,checked,agreed,drifted,blind,unwatched,ok&order=ran_at.desc&limit=200`),
      q('knowledge_items?select=status,created_at,title,source_url&order=created_at.desc&limit=1000'),
      // Engine-impacting items FIRST. A rate change we must reflect in the tax engine is not one of
      // forty things to get to eventually, it is the reason the queue exists.
      q('knowledge_items?status=eq.distilled&select=id,title,summary,source_url,affects,effective_date,confidence,engine_impact,created_at'
        + '&order=engine_impact.desc,created_at.desc&limit=60'),
    ]);

    // ⚠️ AND THESE TWO ARE GARNISH. allSettled, NOT all.
    //
    // Puchio's question count and the subscriber headcount are worth having, and worth NOTHING next
    // to the tax engine. A console that goes blind about GOV.UK because it could not count its own
    // customers has its priorities exactly inverted, and that is what shipped last night.
    const [qa, subs, rakha] = await Promise.allSettled([
      // PUCHIO'S PULSE. How many questions have been answered, and when the last one was.
      // NO question text and NO answer text: a heartbeat, not a transcript. The team console is
      // forbidden anything that belongs to a user (task 13).
      q('qa_cache?select=updated_at&order=updated_at.desc&limit=500'),

      // LEKHIO, IN THE MIDDLE. The only number on this screen that is a PERSON, not a process.
      //
      // 🔴 THIS IS THE LINE THAT TOOK THE WHOLE CONSOLE DOWN. It read:
      //        users?select=id&subscription_status=in.(active,trialing)
      // and THERE IS NO subscription_status COLUMN ON users. It is `subscriptions.status`, which is
      // what every other count in this file has always used. A column I invented, in the one query
      // nobody ever ran, blacking out the one panel that actually matters.
      //
      // ═══════════════════════════════════════════════════════════════════════════════════════════
      // ⚠️ AND THEN, FIXING IT, I WROTE THE OTHER BUG. THE ONE DESCRIBED AT LINE ~1143 OF THIS FILE.
      //
      // stripe_subscription_id=not.is.null IS THE WHOLE OF IT.
      //
      // An INTERNAL account is a subscription row with no Stripe id: the App Review demo, and any
      // comp (see line ~1096). It is `active`, so without this filter it is counted as a person.
      //
      // The console went live saying "2 PEOPLE ARE TRUSTING THIS WITH THEIR TAX" while the CUSTOMERS
      // box on the same screen said 1, and the difference was OUR OWN DEMO ACCOUNT. A hundred per
      // cent inflation of the only number that means anything this early.
      //
      // It has now happened THREE TIMES, and the comment at line ~1143 is the warning about the
      // second, sitting in this same file, which I read past on my way to writing the third.
      //
      // TWO QUERIES OVER THE SAME PEOPLE WILL DRIFT, AND THE ONE THAT DRIFTS IS THE ONE THAT
      // FLATTERS YOU. That is not a coincidence: a number that is too low gets investigated.
      // ═══════════════════════════════════════════════════════════════════════════════════════════
      q('subscriptions?select=stripe_subscription_id&status=in.(active,trialing)'
        + '&stripe_subscription_id=not.is.null&limit=5000'),

      // 🔴 RAKHA'S HEARTBEAT. Garnish for the TAX ENGINE (a failure here must never black out
      // GOV.UK drift), and load-bearing for RAKHA'S OWN RING, which is the point.
      q('rakha_runs?select=ran_at,considered,signalled,sent,ok&order=ran_at.desc&limit=30'),
    ]);

    // WHAT WE COULD NOT READ, BY NAME. Never a guess at the cause, and never a blank console.
    const degraded: string[] = [];
    if (qa.status !== 'fulfilled' || !Array.isArray(qa.value)) degraded.push('qa_cache');
    if (subs.status !== 'fulfilled' || !Array.isArray(subs.value)) degraded.push('subscriptions');
    if (rakha.status !== 'fulfilled' || !Array.isArray(rakha.value)) degraded.push('rakha_runs');

    const qaRows: Array<{ updated_at: string }> =
      qa.status === 'fulfilled' && Array.isArray(qa.value) ? qa.value : [];
    const subRows: unknown[] =
      subs.status === 'fulfilled' && Array.isArray(subs.value) ? subs.value : [];

    return {
      runs: Array.isArray(runs) ? runs : [],
      items: Array.isArray(items) ? items : [],
      pending: Array.isArray(pending) ? pending : [],
      answered: qaRows.length,
      lastAnswerAt: qaRows[0]?.updated_at ?? null,
      subscribers: subRows.length,

      // ⚠️ null, NOT []. An empty array says "Rakha has never run". null says "we could not ask".
      // Collapsing those two is precisely how a console lies, and it is the bug this whole screen
      // was built to make impossible.
      rakha: rakha.status === 'fulfilled' && Array.isArray(rakha.value)
        ? (rakha.value as RakhaRun[])
        : null,

      degraded,
    };
  } catch {
    // null now means ONLY ONE THING: we could not read the brain ITSELF, khoji_runs or
    // knowledge_items. It is not "the brain is empty", and it can no longer be reached by a failed
    // headcount. THAT distinction is the whole point of this screen.
    return null;
  }
}

// APPROVE, or DISMISS. The only two things a human can do to a row in the queue, and both are
// reversible: they set a status, and a status can be set again.
//
// ⚠️ WHAT APPROVING ACTUALLY DOES, WRITTEN DOWN SO NOBODY CLICKS IT CASUALLY.
//
// A `reviewed` row is the ONLY kind that reaches a user's tax answer. Approving is therefore the
// moment a sentence about tax law becomes something we will say to a man who is about to sign his
// return. It is not an inbox chore. It is the gate.
//
// So: the server re-checks team membership on every call (a session is not a permission), it accepts
// exactly two decisions and nothing else, and it records WHO. There is no bulk approve, on purpose.
// UNDO IS A DECISION, and it belongs on the allowlist with the other two.
//
// The queue is a deck now: one card, two buttons, and the next card. That is fast, and fast is how
// you approve something you did not mean to. So the last decision is always reversible with one
// click, and 'undo' puts the row straight back in the queue where it was.
//
// This is the ONLY reason a single click is acceptable on the most consequential button in the
// company. Speed without a way back is not seamless, it is dangerous.
export type ReviewDecision = 'approve' | 'dismiss' | 'undo';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE LIVE FACTS LOOP. Khoji learns, a human approves here, and the number is live everywhere.
// The pure merge + guardrails live in lib/facts.ts; this is the database side of it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// Read the approved, not-superseded overrides. lib/facts filters these to the in-force ones.
export async function loadFactOverrides(): Promise<FactOverride[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/fact_overrides?superseded=eq.false&select=fact_key,value,effective_from,effective_to,source_url&order=effective_from.desc`,
    { headers: headers(), signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) throw new Error(`fact_overrides HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ fact_key: string; value: number; effective_from: string | null; effective_to: string | null; source_url: string | null }>;
  return rows.map((r) => ({ key: r.fact_key, value: r.value, effective_from: r.effective_from, effective_to: r.effective_to, source_url: r.source_url }));
}

// Wired refresh: apply the latest approved, in-force overrides onto FACTS. Call at the top of any
// handler that computes tax or answers a question. Cheap (cached, short TTL); a failed read keeps the
// current FACTS. With no rows it is a no-op and FACTS is exactly the hardcoded defaults.
export async function refreshFactsFromDb(): Promise<string[]> {
  return refreshFacts(loadFactOverrides);
}

// A short, human line naming the figures that are LIVE OVERRIDES right now: what Khoji found and a
// human approved since the hardcoded baseline. Empty when nothing has been changed (so a normal
// answer is unchanged). Used to tell a customer, when they check before filing, that their numbers
// were run on the very latest law. Never throws.
const FACT_LABELS: Record<string, string> = {
  vatRegistrationThreshold: 'VAT registration threshold', vatDeregistrationThreshold: 'VAT deregistration threshold',
  personalAllowance: 'personal allowance', tradingAllowance: 'trading allowance',
  mileageCarFirst10k: 'mileage rate', class4MainRate: 'Class 4 National Insurance rate', class4UpperRate: 'Class 4 upper rate',
  annualInvestmentAllowance: 'Annual Investment Allowance', cgtAnnualExempt: 'Capital Gains tax-free amount',
  marriageAllowanceTransfer: 'Marriage Allowance', poaThreshold: 'payments on account threshold',
};
export async function factUpdateNote(): Promise<string> {
  try {
    const live = resolveOverrides(await loadFactOverrides(), new Date());
    const keys = Object.keys(live);
    if (!keys.length) return '';
    const labels = keys.slice(0, 3).map((k) => FACT_LABELS[k] ?? k);
    return `including the latest ${labels.join(', ')}`;
  } catch {
    return '';
  }
}

// The pre-filing sweep, in one line. When a customer builds their year-end pack (or otherwise reaches
// the "before you file" moment) we have just re-run every number on the latest figures we hold; this
// says so, and NAMES any live overrides so they see exactly what has moved since the baseline. Always
// present: the point is that the sweep happened, override or not. Date-stamped (UTC). Never throws.
export async function preFilingAssurance(now: Date = new Date()): Promise<string> {
  const M = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const stamp = `${now.getUTCDate()} ${M[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  let extra = '';
  try {
    const live = resolveOverrides(await loadFactOverrides(), now);
    const keys = Object.keys(live);
    if (keys.length) {
      const labels = keys.slice(0, 4).map((k) => FACT_LABELS[k] ?? k);
      extra = ` This includes the latest ${labels.join(', ')}.`;
    }
  } catch { extra = ''; }
  return `We went over all of your numbers once more against the HMRC figures we hold as of ${stamp}, so this reflects the most up-to-date rules and thresholds.${extra}`;
}

// Write ONE approved change to an engine constant. Refuses a key the engine does not hold, a value out
// of bounds, or a missing date: the human gate is the primary defence, this is the second. Returns
// false on any refusal so the caller never believes an override landed when it did not.
export async function writeFactOverride(o: {
  key: string; value: number; effectiveFrom: string; sourceUrl?: string | null; note?: string | null; knowledgeItemId?: string | null; approvedBy: string;
}): Promise<boolean> {
  if (!isOverridableKey(o.key) || !isInBounds(o.key, o.value)) return false;
  if (!o.effectiveFrom || !Number.isFinite(Date.parse(o.effectiveFrom))) return false;
  if (!o.approvedBy) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/fact_overrides`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        fact_key: o.key,
        value: o.value,
        effective_from: o.effectiveFrom,
        source_url: o.sourceUrl ?? null,
        note: o.note ?? null,
        knowledge_item_id: o.knowledgeItemId ?? null,
        approved_by: o.approvedBy,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// On approval, if the card carried a structured change to a known constant (the differ/budget watcher
// puts { key, value, effective_from } in raw.proposed_fact), write the override so the new figure is
// live everywhere the moment it is approved. A card with no proposal is an ordinary knowledge item and
// does nothing here. Best effort and never throws: the approval is the record of record.
async function maybeWriteOverrideFromApprovedItem(id: string, byEmail: string): Promise<void> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/knowledge_items?id=eq.${encodeURIComponent(id)}&select=raw,source_url,effective_date&limit=1`, { headers: headers(), signal: AbortSignal.timeout(6000) });
    if (!res.ok) return;
    const rows = (await res.json()) as Array<{ raw: unknown; source_url: string | null; effective_date: string | null }>;
    const row = rows[0];
    if (!row) return;
    let raw: Record<string, unknown> | null = null;
    if (typeof row.raw === 'string') { try { raw = JSON.parse(row.raw) as Record<string, unknown>; } catch { raw = null; } }
    else if (row.raw && typeof row.raw === 'object') raw = row.raw as Record<string, unknown>;
    const pf = raw?.proposed_fact as { key?: unknown; value?: unknown; effective_from?: unknown } | undefined;
    if (!pf || typeof pf.key !== 'string' || typeof pf.value !== 'number') return;
    // Effective date: the proposal's own, else the item's effective_date, else today (a drift against
    // the current GOV.UK page is the law as it stands today).
    const eff = (typeof pf.effective_from === 'string' && pf.effective_from ? pf.effective_from : null)
      || row.effective_date
      || new Date().toISOString().slice(0, 10);
    const wrote = await writeFactOverride({ key: pf.key, value: pf.value, effectiveFrom: eff, sourceUrl: row.source_url, knowledgeItemId: id, approvedBy: byEmail, note: 'auto from approved Khoji card' });
    if (!wrote) console.error('[facts] approved a fact change but the override write was refused:', pf.key, String(pf.value));
  } catch (e) {
    console.error('[facts] maybeWriteOverrideFromApprovedItem error:', e instanceof Error ? e.message : 'unknown');
  }
}

export async function reviewKnowledgeItem(
  id: string,
  decision: ReviewDecision,
  byEmail: string,
): Promise<boolean> {
  try {
    const { url } = config();
    // The status is derived from an allowlisted decision, never taken from the request body. A
    // client that posts status=whatever must not be able to invent a state the system has never
    // heard of.
    const status =
      decision === 'approve' ? 'reviewed'
      : decision === 'dismiss' ? 'dismissed'
      : 'distilled';   // undo: back into the queue, exactly where it came from

    const res = await fetch(`${url}/rest/v1/knowledge_items?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        status,
        // WHO said yes, and WHEN. Not for blame. For the day somebody asks why we told six thousand
        // men something about their tax, and the only acceptable answer is a name and a date, not
        // "the system decided". See supabase/APPLY_2026-07-14_knowledge_review.sql.
        reviewed_by: byEmail,
        reviewed_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) return false;
    // 🔴 THE FACT MOVES. On approval, if this card carried a structured change to a known engine
    // constant, write the override so the new figure is live everywhere the moment it is approved.
    if (decision === 'approve') {
      await maybeWriteOverrideFromApprovedItem(id, byEmail);
    }
    return true;
  } catch {
    return false;
  }
}

// --- THE CIRCUMSTANCES. What a man has told us about himself. ------------------------------------
//
// ⚠️ WRITING ONE OF THESE IS WRITING AN EXHIBIT, NOT SAVING A PREFERENCE.
//
// Finance Act 2026 Sch 22 (live since 1 April) makes it sanctionable conduct to act with intent to
// bring about a loss of tax revenue, expressly including a client "obtaining more tax relief than
// they are entitled to obtain by law". The only thing that proves we did not intend that is the log:
// what we ASKED, in the words he SAW, what he ANSWERED, and WHEN.
//
// So `asked` is passed in by the caller and stored verbatim. It is NOT looked up from
// lib/circumstances.ts at write time and it is NEVER re-derived at read time. If we reword a question
// next year, every existing row still carries the sentence THAT MAN actually read. A log that stores
// a key and resolves the current text later proves nothing at all.

export interface Answered {
  key: string;
  answer: string;
  asked: string;
  answered_at: string;
}

export async function readCircumstances(userId: string): Promise<Answered[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/circumstances?user_id=eq.${encodeURIComponent(userId)}&select=key,answer,asked,answered_at`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Answered[];
  } catch {
    // null is "we could not read", NEVER "he has answered nothing". The difference decides whether we
    // ask him a question he has already answered, which is how a man learns we are not listening.
    return null;
  }
}

export async function saveCircumstance(
  userId: string,
  key: string,
  answer: string,
  asked: string,
  channel: string,
): Promise<boolean> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/circumstances?on_conflict=user_id,key`, {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
        // He can change his mind: a divorce, a new van, VAT registration. The row is UPDATED, so
        // there is never more than one live answer to argue about.
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        key,
        answer,
        asked,                      // VERBATIM. The exhibit.
        channel,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ERASURE. Article 17, and Article 7(3): withdrawing consent must be as easy as giving it.
//
// ⚠️ A REAL DELETE. The row goes. Not `answer = 'no'`, not a `deleted_at`, not an archive table.
//
// A tombstone would leave the fact that we once asked a man whether he was registered blind, and the
// answer he gave, sitting in a database he has explicitly told us to forget. That is not erasure. It
// is a filing cabinet with a note on the front saying we have stopped looking in it.
export async function forgetCircumstance(userId: string, key: string): Promise<boolean> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/circumstances?user_id=eq.${encodeURIComponent(userId)}&key=eq.${encodeURIComponent(key)}`,
      { method: 'DELETE', headers: { ...headers(), Prefer: 'return=minimal' } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ================================================================================================
// THE CONTENT STUDIO (docs 110, 111, 112). Server only, service role, exactly like the rest of this
// file. Every function here reaches tables that carry NO customer data. The single bridge to the
// customer world is read only and aggregate: attributionByTag counts how many people arrived under a
// post's own tag, never who they are and never a figure about their money.
// ================================================================================================

export async function readStudioIdeas(): Promise<Idea[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_ideas?select=*&order=votes.desc,created_at.desc&limit=500`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Idea[];
  } catch { return null; }
}

export async function insertStudioIdea(input: {
  title: string; trade: string | null; format: Format; promise: Promise3; note: string | null; author: string | null;
}): Promise<Idea | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/content_ideas`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        title: input.title, trade: input.trade, format: input.format,
        promise: input.promise, note: input.note, author: input.author,
      }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Idea[];
    return rows[0] ?? null;
  } catch { return null; }
}

// A vote is read then write. If two votes race, one increment can be lost, and that is completely
// fine: a backlog vote is a nudge, not an accounting entry. We do not add a database function and a
// migration to make a popularity counter perfect.
export async function voteStudioIdea(id: string): Promise<boolean> {
  try {
    const { url } = config();
    const cur = await fetch(
      `${url}/rest/v1/content_ideas?id=eq.${encodeURIComponent(id)}&select=votes`,
      { headers: headers() },
    );
    if (!cur.ok) return false;
    const rows = (await cur.json()) as Array<{ votes: number }>;
    if (!rows[0]) return false;
    const res = await fetch(
      `${url}/rest/v1/content_ideas?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ votes: rows[0].votes + 1 }),
      },
    );
    return res.ok;
  } catch { return false; }
}

export async function countStudioAssets(): Promise<number | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?select=id`,
      { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) },
    );
    if (!res.ok) return null;
    const range = res.headers.get('content-range') || '';
    const total = range.split('/')[1];
    return total ? parseInt(total, 10) : 0;
  } catch { return null; }
}

export async function readStudioAssets(): Promise<Asset[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?select=*&order=updated_at.desc&limit=1000`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Asset[];
  } catch { return null; }
}

export async function readStudioAsset(id: string): Promise<Asset | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Asset[];
    return rows[0] ?? null;
  } catch { return null; }
}

export async function insertStudioAsset(input: {
  idea_id: string | null; title: string; trade: string | null; format: Format; promise: Promise3;
  script: string | null; scene: string | null; caption: string | null;
  platforms: Platform[]; source_tag: string | null; storyboard: Storyboard;
  state: AssetState; created_by: string | null;
}): Promise<Asset | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/content_assets`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        idea_id: input.idea_id, title: input.title, trade: input.trade,
        format: input.format, promise: input.promise, script: input.script,
        scene: input.scene, caption: input.caption, platforms: input.platforms,
        source_tag: input.source_tag, storyboard: input.storyboard,
        state: input.state, created_by: input.created_by,
      }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Asset[];
    return rows[0] ?? null;
  } catch { return null; }
}

// Advance an asset ONE step. The `state=eq.from` guard makes this a claim, not a blind write: if the
// card already moved, we change nothing and return null, so two clicks cannot skip a state or move a
// card that someone else already moved. The server, not the client, decides `to` is legal.
export async function setStudioAssetState(id: string, from: AssetState, to: AssetState): Promise<Asset | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?id=eq.${encodeURIComponent(id)}&state=eq.${encodeURIComponent(from)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ state: to, updated_at: new Date().toISOString() }),
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Asset[];
    return rows[0] ?? null;
  } catch { return null; }
}

export async function insertStudioApproval(input: {
  asset_id: string; kind: 'publish' | 'promote'; decision: 'approve' | 'reject' | 'changes';
  note: string | null; spend_cap_pence: number | null; decided_by: string;
}): Promise<Approval | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/content_approvals`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Approval[];
    return rows[0] ?? null;
  } catch { return null; }
}

export async function readStudioApprovals(assetId: string): Promise<Approval[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_approvals?asset_id=eq.${encodeURIComponent(assetId)}&select=*&order=created_at.desc`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Approval[];
  } catch { return null; }
}

export async function insertStudioMetric(input: {
  asset_id: string; platform: Platform; as_of: string;
  reach: number; saves: number; shares: number; clicks: number; trials: number; entered_by: string | null;
}): Promise<Metric | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/content_metrics`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Metric[];
    return rows[0] ?? null;
  } catch { return null; }
}

export async function readStudioMetrics(): Promise<Metric[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_metrics?select=*&order=as_of.desc&limit=5000`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Metric[];
  } catch { return null; }
}

// THE REAL MONEY NUMBER, and the only place the studio touches the customer world.
//
// It counts, per attribution tag, how many people arrived under it and how many of those pay us now.
// It reads acquisition_detail (the granular tag a post carries) and joins subscriptions by phone on
// the server, the same join readTeamCustomers does, so the phone never leaves this function. The
// output is two counts per tag. Never a name, never a figure about any individual. Until real posts
// are live carrying real tags, every count is honestly zero.
export async function attributionByTag(): Promise<Record<string, { trials: number; paying: number }> | null> {
  try {
    const { url } = config();
    const [uRes, sRes] = await Promise.all([
      fetch(`${url}/rest/v1/users?select=phone,acquisition_detail&acquisition_detail=not.is.null&limit=20000`, { headers: headers() }),
      fetch(`${url}/rest/v1/subscriptions?select=phone,status&limit=20000`, { headers: headers() }),
    ]);
    if (!uRes.ok || !sRes.ok) return null;
    const users = (await uRes.json()) as Array<{ phone: string | null; acquisition_detail: string | null }>;
    const subs = (await sRes.json()) as Array<{ phone: string | null; status: string | null }>;

    const paying = new Set(['active', 'past_due']);
    const statusByPhone = new Map<string, string>();
    for (const s of subs) if (s.phone) statusByPhone.set(s.phone, s.status || 'none');

    const out: Record<string, { trials: number; paying: number }> = {};
    for (const u of users) {
      const tag = (u.acquisition_detail || '').trim();
      if (!tag) continue;
      const row = (out[tag] ??= { trials: 0, paying: 0 });
      row.trials += 1;
      const st = u.phone ? statusByPhone.get(u.phone) : undefined;
      if (st && paying.has(st)) row.paying += 1;
    }
    return out;
  } catch { return null; }
}

// --- Studio agent: idea lookup, promotion, and the heartbeat -----------------------------------

export async function readStudioIdea(id: string): Promise<Idea | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_ideas?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Idea[];
    return rows[0] ?? null;
  } catch { return null; }
}

// Mark an idea promoted once an asset has been drafted from it, so it is not drafted again. Best
// effort: a failure here does not undo the asset that was already made.
export async function markIdeaPromoted(id: string): Promise<boolean> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_ideas?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ status: 'promoted' }),
      },
    );
    return res.ok;
  } catch { return false; }
}

export interface StudioAgentRun {
  ran_at: string;
  drafted: number;
  considered: number;
  ok: boolean;
}

// THE HEARTBEAT WRITE. Called on EVERY agent run, success or failure. A run that drafted nothing
// still writes a row: the bot looked, and that is the fact the console needs to know it is alive.
export async function insertStudioAgentRun(input: {
  drafted: number; considered: number; ok: boolean; note: string | null; duration_ms: number | null;
}): Promise<boolean> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/studio_agent_runs`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch { return false; }
}

// The newest heartbeat, for a console light later. Null means the table is empty, which for a bot
// that has never run is the honest answer, not a green light.
export async function readLatestStudioAgentRun(): Promise<StudioAgentRun | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/studio_agent_runs?select=ran_at,drafted,considered,ok&order=ran_at.desc&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as StudioAgentRun[];
    return rows[0] ?? null;
  } catch { return null; }
}

// --- Studio generation: approved storyboards that still need a video made -----------------------

// Assets that Jag has APPROVED (state scheduled) but that have no finished file yet. This is the
// generation agent's work queue. It never sees anything unapproved, so it can only ever put effort
// into things Jag already said yes to.
export async function readAssetsPendingGeneration(): Promise<Asset[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?state=eq.scheduled&file_url=is.null&select=*&order=updated_at.asc&limit=50`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Asset[];
  } catch { return null; }
}

// How many videos were generated (a file attached) since the given ISO time. The generation queue
// uses this to hold the day inside the standing spend cap, so total renders in a day cannot exceed
// STUDIO_GEN_MAX_PER_DAY however many times the worker runs. Null means the count could not be read,
// and the caller treats that as "assume the day is spent" and hands out nothing, failing safe.
export async function countStudioAssetsGeneratedSince(iso: string): Promise<number | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?file_url=not.is.null&updated_at=gte.${encodeURIComponent(iso)}&select=id`,
      { method: 'HEAD', headers: headers({ Prefer: 'count=exact', Range: '0-0' }) },
    );
    if (!res.ok) return null;
    const range = res.headers.get('content-range') || '';
    const n = parseInt((range.split('/')[1] || ''), 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

// Attach a generated file to an approved asset. The `file_url=is.null` guard makes this a claim: if
// two agent runs overlap, the first one to write wins and the second changes nothing, so a piece is
// never generated twice or its file overwritten. Approval is NOT touched here: generating a video
// does not post it, and posting still needs a human.
export async function setStudioAssetMedia(id: string, fileUrl: string): Promise<Asset | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?id=eq.${encodeURIComponent(id)}&file_url=is.null`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ file_url: fileUrl, updated_at: new Date().toISOString() }),
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Asset[];
    return rows[0] ?? null;
  } catch { return null; }
}

// Mark a lead double-opt-in confirmed AND return their stored result note in one round trip, so the
// confirm route can finally send the result we promised them ("email me my result"). return=representation
// gives us the patched row back. Additive: setLeadConfirmed above is untouched for existing callers.
export async function confirmLeadAndGetResult(email: string): Promise<{ ok: boolean; resultNote: string | null }> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(email.toLowerCase())}&select=result_note`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ confirmed_at: new Date().toISOString() }),
    },
  );
  if (!res.ok) return { ok: false, resultNote: null };
  try {
    const rows = (await res.json()) as Array<{ result_note: string | null }>;
    return { ok: true, resultNote: rows[0]?.result_note ?? null };
  } catch {
    return { ok: true, resultNote: null };
  }
}

// --- Lead nurture (ships dark; content + timing in lib/nurture.ts) --------
export interface NurtureCandidate { email: string; stage: number; confirmedAt: string | null; lastAt: string | null; }

// Confirmed, consented, non-unsubscribed leads who have not finished the sequence. The route decides
// which are actually DUE using the per-stage delays in lib/nurture.ts. nurture_stage < 2 matches the
// two-email NURTURE_SEQUENCE; widen if the sequence grows.
export async function listNurtureCandidates(limit = 200): Promise<NurtureCandidate[]> {
  const { url } = config();
  const n = Math.min(500, Math.max(1, limit));
  const res = await fetch(
    `${url}/rest/v1/marketing_leads?select=email,nurture_stage,confirmed_at,nurture_last_at&consent=is.true&unsubscribed_at=is.null&confirmed_at=not.is.null&nurture_stage=lt.2&order=confirmed_at.asc&limit=${n}`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ email: string; nurture_stage: number | null; confirmed_at: string | null; nurture_last_at: string | null }>;
  return rows.map((r) => ({ email: r.email, stage: r.nurture_stage ?? 0, confirmedAt: r.confirmed_at, lastAt: r.nurture_last_at }));
}

export async function markNurtureSent(email: string, newStage: number): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ nurture_stage: newStage, nurture_last_at: new Date().toISOString() }),
  });
  return res.ok;
}

// --- Pre-sale follow-up candidates (ships dark; the ladder lives in lib/presale.ts) ----------------
export interface PresaleCandidate {
  email: string; name: string | null; whatsapp: string | null; wa_consent: boolean;
  presale_stage: number; presale_last_at: string | null; consent_at: string | null; consent: boolean;
}

// Leads still in the presale window: consented, not unsubscribed, not yet paid, ladder not exhausted
// (presale_stage < 3 matches PRESALE_LADDER.length). Oldest capture first.
export async function listPresaleCandidates(limit = 300): Promise<PresaleCandidate[]> {
  const { url } = config();
  const n = Math.min(500, Math.max(1, limit));
  const res = await fetch(
    `${url}/rest/v1/marketing_leads?select=email,name,whatsapp,wa_consent,presale_stage,presale_last_at,consent_at,consent&consent=is.true&unsubscribed_at=is.null&stage=neq.paid&presale_stage=lt.3&order=consent_at.asc&limit=${n}`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    email: String(r.email), name: (r.name as string) ?? null, whatsapp: (r.whatsapp as string) ?? null,
    wa_consent: r.wa_consent === true, presale_stage: Number(r.presale_stage ?? 0),
    presale_last_at: (r.presale_last_at as string) ?? null, consent_at: (r.consent_at as string) ?? null, consent: r.consent === true,
  }));
}

// Advance a contact's presale step and stamp the send time. Best effort.
export async function markPresaleSent(email: string, newStage: number): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/marketing_leads?email=eq.${encodeURIComponent(email.toLowerCase())}`, {
    method: 'PATCH', headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ presale_stage: newStage, presale_last_at: new Date().toISOString() }),
  });
  return res.ok;
}
