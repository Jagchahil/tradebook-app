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
import {
  decideTrialGrant, normaliseEmail, normalisePhone,
  type MatchKind, type PriorGrant,
} from './trialidentity';
import type { TrialRow } from './trialnudge';
import { CUSTOMER_COLUMNS, normaliseSource } from './team';
import type { TeamCustomer, TeamMember } from './team';
import type { Snapshot } from './metrics';
import { parseLevel, type AutonomyLevel } from './autonomy';
import { quarterForDate, quarterBounds } from './quarterpack';
// The ONE test for a residential finance cost. Both copies of it below used to be written out by
// hand here; see the note on isResidentialFinanceCost for the document that drifted because of it.
import { isResidentialFinanceCost } from './propertyengine';
import { sumCapitalAllowances as sumCapitalAllowancesYtd, aggregateConfirmedRows as aggregateRowsYtd } from './yeartodate';
import type { OptimiserInput } from './taxoptimiser';
import { qaDedupeKey, qaPrunePaths } from './qaretention';
import type { KnowledgeState } from './knowledgewatch';
import type {
  Asset, Approval, Metric, AssetState, Format, Promise3, Platform, Storyboard,
} from './studio';
import { refreshFacts, resolveOverrides, isOverridableKey, isInBounds, type FactOverride } from './facts';
import { advanceStage, normaliseWhatsapp, isContactStage, isCheckoutStage, isEventKind, type ContactStage, type CheckoutStage, type EventKind } from './crm';
import { sicByCode } from './siccodes';
import { useOfHomeToDate } from './elections';
import { isCapitalKind, isWrittenDown } from './capital';
import { fromLegacyKind, toLegacyKind, isGoalKind, type LegacyGoalKind } from './goals';
import { weekTotals, windowStart, type WeekRow } from './weekchart';
import { isMonthKey, monthStart, monthEnd, labelFor } from './moneylog';
import { incomeShapeOfSignup, toIncomeShape, type IncomeShape } from './persona';
import { gbp2 } from './money';

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
    const data = await res.json().catch(() => null);
    if (data === null) return null;
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
    const data = await res.json().catch(() => null);
    if (data === null) return null;
    const c = typeof data === 'number' ? data : Array.isArray(data) ? Number(data[0]) : Number(data);
    return Number.isFinite(c) ? c : null;
  } catch {
    return null;
  }
}

// --- Outbound WhatsApp send counter (wa_out) --------------------------------
// One row per outbound send that Meta ACCEPTED, written from graphSend in
// lib/whatsapp.ts, the one door every send already passes through. The row is
// the customer key, the kind (freeform or template, because templates are the
// paid ones) and a timestamp. NEVER the message content and NEVER a template
// variable: this table is a counter, not a log.
//
// BEST EFFORT, BY DESIGN. The webhook must answer Meta inside 5 seconds, so a
// failed, slow or impossible insert may never fail, block or delay a send.
// Every path in here swallows, the fetch carries its own timeout, and the
// caller does not await. Until the founder pastes
// supabase/APPLY_2026-07-31_wa_out.sql by hand the table does not exist and
// the insert simply fails into the same swallow: recording is skipped and the
// send is untouched. test/waout.test.mjs pins that.
export type WaOutKind = 'freeform' | 'template';

export async function recordWaOut(
  kind: WaOutKind,
  phone: string | null,
  userId: string | null = null,
): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/wa_out`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({ kind, phone, user_id: userId }),
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}

// The month's observed outbound sends, counted per customer. The phone on a
// wa_out row is a JOIN KEY here and never leaves this function: the result is
// keyed by user id, with every phone that matches no user pooled under
// 'unmatched', the same honest bucket lib/messagecost.ts uses for strangers.
// Returns null when the table is missing or unreadable, and the margin view
// then falls back to its model rather than drawing a confident zero.
export interface WaOutMonth {
  total: number;
  byUser: Record<string, { freeform: number; template: number }>;
}

export async function readWaOutMonth(month?: string): Promise<WaOutMonth | null> {
  const m = month ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  const [y, mo] = m.split('-').map(Number);
  const first = `${m}-01`;
  const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10);
  try {
    const { url } = config();
    const [outRes, usersRes] = await Promise.all([
      fetch(
        `${url}/rest/v1/wa_out?select=user_id,phone,kind` +
          `&created_at=gte.${first}&created_at=lt.${next}&limit=10000`,
        { headers: headers() },
      ),
      fetch(`${url}/rest/v1/users?select=id,phone_number&limit=2000`, { headers: headers() }),
    ]);
    if (!outRes.ok || !usersRes.ok) return null;
    const sends = (await outRes.json()) as Array<{ user_id: string | null; phone: string | null; kind: string }>;
    const users = (await usersRes.json()) as Array<{ id: string; phone_number: string | null }>;

    const idByPhone = new Map<string, string>();
    for (const u of users) {
      if (u.phone_number) idByPhone.set(u.phone_number, u.id);
    }

    const byUser: WaOutMonth['byUser'] = {};
    let total = 0;
    for (const s of sends) {
      const id = s.user_id ?? (s.phone ? idByPhone.get(s.phone) : undefined) ?? 'unmatched';
      const agg = byUser[id] ?? { freeform: 0, template: 0 };
      if (s.kind === 'template') agg.template += 1;
      else agg.freeform += 1;
      byUser[id] = agg;
      total += 1;
    }
    return { total, byUser };
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
    const rows = await res.json().catch(() => null);
    if (rows === null) return null;
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
    const rows = await res.json().catch(() => null);
    if (rows === null) return false;
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
    const rows = await res.json().catch(() => null);
    if (rows === null) return [];
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
    const rows = await res.json().catch(() => null);
    if (rows === null) return [];
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

// Strip the obvious personal bits from a piece of text before it enters a
// shared pool: emails, national insurance numbers, UK IBANs, postcodes, payment
// cards, phone numbers, sort codes, account numbers, currency amounts, and long
// digit runs. The general tax content survives, the identifying detail does not.
// Applied to the question AND the answer on their way into qa_candidates, and to
// the question sample on its way into qa_cache, so no shared store becomes a
// record of users' personal figures and names.
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 WIDENED 9 AUGUST 2026, AND THE CORPUS IS THE REASON, NOT THE REGEXES.
//
// It was four rules: email, postcode, pound amount, and any run of seven or
// more digits. Against 43 synthetic leak strings written to look like real Ask
// screen traffic, THIRTY ONE WALKED STRAIGHT THROUGH. Every national insurance
// number in every legal format. Every sort code. Both IBANs. Every phone number
// that had a space or a hyphen in it, because the seven digit rule only ever
// caught the run together forms. Every card number printed in its normal four
// four four four grouping.
//
// The corpus is test/fixtures/redactcorpus.mjs and it has two halves, because
// the second one is the one that bites. MUST_REDACT is the leak list.
// MUST_KEEP is forty ordinary numbers a tradesman actually texts: dates in
// every British style, mileage, invoice numbers, job references, van
// registrations, times, percentages, VAT numbers, a company number. A regex
// that eats a date or a price corrupts the learning pool silently, and a pool
// that has been quietly corrupted teaches the product nonsense. Every pattern
// below is justified by a leak row AND checked against the keep rows.
// test/redactcorpus.test.mjs runs both halves against THIS function, through
// its real call path, and holds both lists by equality.
//
// WHAT WAS DELIBERATELY LEFT OUT, because a named gap beats a silent corruption:
//
//   . AN UNCUED SORT CODE. 12-34-56 and 12/34/56 with no "sort" in front of
//     them are 31-07-26 and 31/07/26, which are dates. The cued form below
//     catches how people actually write it. The account number beside it is
//     still taken by the seven digit rule, and a sort code alone names a bank
//     branch, not a man.
//   . A PHONE NUMBER WITH THE LEADING ZERO DROPPED AND NO +44. Bare
//     "7700 900159" is two ordinary numbers.
//   . A NON GB IBAN. The generic two letter form eats long mixed references.
//   . A NATIONAL INSURANCE NUMBER WITH NO SUFFIX LETTER. Requiring the trailing
//     A to D is the only thing standing between this pattern and SC123456, a
//     Scottish company number, which is also two letters and six digits.
//   . A BARE COMMA GROUPED AMOUNT WITH NO DECIMALS AND NO CURRENCY WORD.
//     "paid 2,450 in" leaks and survives. So do "12,000 miles" and "2,400
//     bricks", which are not money. One pattern cannot tell them apart, and
//     eating a mileage figure costs a real tax input for nothing.
//   . A BARE NINE DIGIT VAT NUMBER. The seven digit rule already ate it before
//     this change and still does. Narrowing that rule to spare nine digit runs
//     would reopen the account number and phone number holes it exists to
//     close, so it stays, measured and named rather than quietly tolerated.
//
// THE FOUR ORIGINAL RULES ARE UNTOUCHED, in their original order relative to
// each other, so nothing that was redacted yesterday stops being redacted
// today. test/qacandidates.test.mjs and test/qa-retention.test.mjs pin the
// [email], [amount] and [number] tokens and both still pass.
//
// ORDER IS SPECIFIC BEFORE GENERAL, and the seven digit rule stays LAST. That
// is what gets "account number [account]" instead of "account number [number]",
// so a human reading the pool can tell what was taken out. It is not a
// correctness requirement: every pattern is anchored tightly enough that
// reordering changes the token, not the outcome. I did check the one ordering I
// assumed was load bearing and I was wrong about it: the postcode pattern does
// NOT eat GB33BU off the front of a UK IBAN, because it ends in \b and the next
// character is K. IBAN goes first for specificity, not repair.
// ═══════════════════════════════════════════════════════════════════════════
function redactPii(s: string): string {
  return (s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\bGB\d{2}\s?[A-Z]{4}(?:\s?\d{4}){3}\s?\d{2}\b/gi, '[iban]')
    .replace(/\b[A-Z]{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?[A-D]\b/gi, '[nino]')
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, '[postcode]')
    .replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[card]')
    .replace(/\b\d{4}[\s-]\d{6}[\s-]\d{5}\b/g, '[card]')
    .replace(/(?:\+44\s?\(?0?\)?\s?|\(?\b0)\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g, '[phone]')
    .replace(/\b(sort\s*(?:code)?)((?:\s+(?:is|no\.?|number))?[:\s]*)\d{2}[\s.\-/]?\d{2}[\s.\-/]?\d{2}\b/gi, '$1$2[sortcode]')
    .replace(/\b(a\/c|acc(?:ount)?)((?:\s+(?:no\.?|number|is))?[:\s]*)\d{4}[\s.-]?\d{4}\b/gi, '$1$2[account]')
    .replace(/£\s?\d[\d,]*(\.\d+)?/g, '[amount]')
    .replace(/\b\d{1,3}(?:,\d{3})+\.\d{2}\b/g, '[amount]')
    .replace(/\b\d[\d,]*(?:\.\d{1,2})?\s?(?:quid|gbp|pounds?)\b/gi, '[amount]')
    .replace(/\bGBP\s?\d[\d,]*(?:\.\d{1,2})?\b/gi, '[amount]')
    .replace(/\b\d{7,}\b/g, '[number]');
}

// Log a Puchio answer as a learning candidate for the brain. The question AND
// the answer are PII redacted first. Records whether the sources are all
// recognised so a later governed step can auto approve the clean ones. Never
// auto approves here.
//
// WHY THE ANSWER IS REDACTED TOO. Until 6 August 2026 only the question was,
// which was a door locked next to an open window: a personal answer is composed
// FROM the man's own books, so the figure he asked about, his email and his
// address echo straight back in the answer text, and the pool stored them raw.
// Redacting the answer costs this table nothing it actually uses. A statutory
// figure in a clean general answer does come out as [amount], but the raw text
// of exactly those answers is already kept, safely, in qa_cache: /api/ask
// writes it there for the same turns (general, all sources recognised) the
// governed step would want raw. Every other answer was composed with personal
// input and has no business in a shared pool unredacted.
//
// WHY THE ROW CARRIES user_id. A row that cannot be found for a man cannot be
// exported for him or erased for him, and UK GDPR Articles 15 and 17 do not
// stop applying because the store is an internal review queue. qa_candidates is
// in USER_DATA_TABLES, so both doors walk it. The pool dedupes across users, so
// the id kept is THE ASKER WHOSE ANSWER TEXT IS STORED: the insert takes the
// first asker, and the RPC refreshes user_id in step with the answer while the
// row is still unreviewed, never after a human has acted on it. Erasing that
// man deletes the whole row even if others asked the same question, which is
// the right direction to fail in: the corpus can relearn a question, he cannot
// unshare his figures.
//
// ⚠️ DEPLOY ORDER. The user_id column and the eight parameter log_qa_candidate
// RPC must exist in the database BEFORE this code ships (see supabase/schema.sql
// and supabase/APPLY_2026-08-07_qa_candidates.sql). Until they do, both writes here fail and are
// swallowed as best effort, which loses learning rows, never answers.
//
// Deduped: the same question asked again bumps a seen_count on the one row
// instead of adding a new one, so the pool stays bounded at scale (doc 96). The
// log_qa_candidate RPC upserts on the normalised question and NEVER overwrites a
// human's review or dismissal. If the question has no usable dedupe key (too
// short to normalise) we fall back to a plain insert so nothing is dropped.
// Best effort throughout.
export async function logQaCandidate(
  userId: string,
  question: string,
  answer: string,
  sources: string[],
  usedKnowledge: boolean,
  engineImpact = false,
): Promise<void> {
  try {
    const redacted = redactPii(question).slice(0, 1000);
    // Redact before the cap, so a figure straddling the cut cannot slip through
    // as a recognisable fragment.
    const redactedAnswer = redactPii(answer).slice(0, 8000);
    // An empty user id must become null, not an empty string: uuid columns
    // reject '' and the whole best effort write would be lost with it.
    const owner = userId || null;
    const norm = qaDedupeKey(redacted);
    if (!norm) {
      await rest('qa_candidates', {
        method: 'POST',
        body: JSON.stringify({
          user_id: owner,
          question: redacted,
          answer: redactedAnswer,
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
        p_answer: redactedAnswer,
        p_sources: sources.length ? sources : null,
        p_used_knowledge: usedKnowledge,
        p_all_recognised: allSourcesRecognised(sources),
        p_engine_impact: engineImpact,
        p_user_id: owner,
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
  const rows = (await res.json().catch(() => null)) as (WaSession[]) | null;
  if (rows === null) return null;
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

// ── VAT ────────────────────────────────────────────────────────────────────────────────────────
// The working record of a customer's VAT position. The vat_registered CIRCUMSTANCE stays where it
// is and keeps doing its job, which is being the logged question and answer, an exhibit under
// Finance Act 2026 Sch 22. This is the operational fact the engine reads.
//
// ⚠️ A FAILED READ RETURNS NULL, NOT AN EMPTY PROFILE. "Could not read" and "he is not registered"
// are different answers and only one of them is safe to act on. Callers that need a value fall back
// to the circumstance, which is the older and less detailed truth but is at least true.

export interface VatProfileRow {
  registered: boolean;
  vrn: string | null;
  registeredOn: string | null;
  deregisteredOn: string | null;
  scheme: 'standard' | 'flat_rate' | 'cash' | 'annual';
  flatRatePercent: number | null;
  flatRateFirstYear: boolean;
  cisSubcontractor: boolean;
}

export async function readVatProfile(userId: string): Promise<VatProfileRow | null> {
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/vat_profiles?user_id=eq.${encodeURIComponent(userId)}` +
      '&select=registered,vrn,registered_on,deregistered_on,scheme,flat_rate_percent,flat_rate_first_year,cis_subcontractor&limit=1',
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) {
      // No row is a real answer: we have never been told anything, which is not the same as a
      // failed read. An empty profile is the honest starting point.
      return {
        registered: false,
        vrn: null,
        registeredOn: null,
        deregisteredOn: null,
        scheme: 'standard',
        flatRatePercent: null,
        flatRateFirstYear: false,
        cisSubcontractor: false,
      };
    }
    const scheme = String(r.scheme ?? 'standard');
    return {
      registered: Boolean(r.registered),
      vrn: r.vrn ? String(r.vrn) : null,
      registeredOn: r.registered_on ? String(r.registered_on).slice(0, 10) : null,
      deregisteredOn: r.deregistered_on ? String(r.deregistered_on).slice(0, 10) : null,
      scheme: (scheme === 'flat_rate' || scheme === 'cash' || scheme === 'annual') ? scheme : 'standard',
      flatRatePercent: r.flat_rate_percent == null ? null : Number(r.flat_rate_percent),
      flatRateFirstYear: Boolean(r.flat_rate_first_year),
      cisSubcontractor: Boolean(r.cis_subcontractor),
    };
  } catch {
    return null;
  }
}

// Save what he told us. Partial by design: the VAT screen asks one thing at a time, so a man who
// gives us his number today and his scheme next week does not have his number wiped in between.
export async function saveVatProfile(
  userId: string,
  patch: Partial<{
    registered: boolean;
    vrn: string | null;
    registeredOn: string | null;
    deregisteredOn: string | null;
    scheme: string;
    flatRatePercent: number | null;
    flatRateFirstYear: boolean;
    cisSubcontractor: boolean;
  }>,
): Promise<boolean> {
  const { url } = config();
  const body: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.registered !== undefined) body.registered = patch.registered;
  if (patch.vrn !== undefined) body.vrn = patch.vrn;
  if (patch.registeredOn !== undefined) body.registered_on = patch.registeredOn;
  if (patch.deregisteredOn !== undefined) body.deregistered_on = patch.deregisteredOn;
  if (patch.scheme !== undefined) body.scheme = patch.scheme;
  if (patch.flatRatePercent !== undefined) body.flat_rate_percent = patch.flatRatePercent;
  if (patch.flatRateFirstYear !== undefined) body.flat_rate_first_year = patch.flatRateFirstYear;
  if (patch.cisSubcontractor !== undefined) body.cis_subcontractor = patch.cisSubcontractor;

  try {
    const res = await fetch(`${url}/rest/v1/vat_profiles?on_conflict=user_id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The VAT he has CONFIRMED on what he bought, for a date range, split by whether the row carries a
// receipt. The split is the control doctrine in arithmetic: nothing is refused for want of a
// receipt, but every figure knows whether it has one.
export async function getConfirmedInputVat(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<{ total: number; withProof: number } | null> {
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      '&vat_confirmed=eq.true&confirmed=eq.true' +
      `&transaction_date=gte.${fromISO}&transaction_date=lte.${toISO}` +
      '&select=vat_amount,raw_input_url&limit=5000',
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ vat_amount?: unknown; raw_input_url?: unknown }>;
    let total = 0;
    let withProof = 0;
    for (const r of Array.isArray(rows) ? rows : []) {
      const v = Number(r.vat_amount) || 0;
      if (v <= 0) continue;
      total += v;
      if (r.raw_input_url) withProof += v;
    }
    return { total: Math.round(total * 100) / 100, withProof: Math.round(withProof * 100) / 100 };
  } catch {
    return null;
  }
}

// The VAT he has CHARGED, from his own invoices, for a date range. Reverse charge invoices carry no
// output tax by construction: he charged nothing, so there is nothing here to declare.
export async function getOutputVat(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<{ outputVat: number; grossTurnover: number; reverseChargeVat: number } | null> {
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}` +
      `&issued_date=gte.${fromISO}&issued_date=lte.${toISO}` +
      '&select=tax,total,reverse_charge_vat,status&limit=5000',
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    let outputVat = 0;
    let grossTurnover = 0;
    let reverseChargeVat = 0;
    for (const r of Array.isArray(rows) ? rows : []) {
      if (String(r.status ?? '') === 'draft') continue; // a draft is not a supply
      outputVat += Number(r.tax) || 0;
      grossTurnover += Number(r.total) || 0;
      reverseChargeVat += Number(r.reverse_charge_vat) || 0;
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return { outputVat: r2(outputVat), grossTurnover: r2(grossTurnover), reverseChargeVat: r2(reverseChargeVat) };
  } catch {
    return null;
  }
}

// Record the VAT on one cost, and mark it confirmed. Never called by a parser: a vision read is a
// guess, and a VAT figure that is wrong one time in seven is worse than no figure because he will
// trust it. His own rows only.
export async function confirmTransactionVat(
  userId: string,
  transactionId: string,
  vatAmount: number,
): Promise<boolean> {
  const { url } = config();
  const v = Math.round((Number(vatAmount) || 0) * 100) / 100;
  if (v < 0) return false;
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(transactionId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ vat_amount: v, vat_confirmed: true }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// Create an invoice from the server (the WhatsApp flow). Returns the new id,
// human number, and total, or null on failure.
//
// ⚠️ VAT IS PASSED IN, NEVER WORKED OUT HERE. lib/vat.ts priceInvoice does the arithmetic and the
// caller does the deciding, because whether an invoice carries VAT at all is a question about the
// job and the customer that this function cannot see. Omitting the VAT fields gives exactly the old
// behaviour, which is what the WhatsApp "invoice this" path still wants until it can ask.
export interface ServerInvoiceInput {
  customer_name: string;
  customer_contact?: string | null;
  line_items: Array<{ description: string; amount: number; rate?: string }>;
  vat?: {
    treatment: 'none' | 'charged' | 'reverse_charge';
    tax: number;
    total: number;
    reverseChargeVat: number;
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE INSERT SUCCEEDED AND WE COULD NOT READ OUR OWN ANSWER. THE ROW IS THERE.
//
// Found 9 August 2026, sweeping this file for the shape lib/claude.ts and lib/stripe.ts were fixed
// for the same day. Everywhere else in this file a body we cannot parse is answered with the same
// fallback the !res.ok branch gives, because a failed read and a failed status mean the same thing:
// we do not know. THESE TWO ARE DIFFERENT, AND RETURNING null WOULD BE A LIE.
//
// PostgREST answered 2xx. The write HAPPENED. Returning null tells the route nothing was saved, the
// route says so to the customer in good faith, and he does the only sensible thing: he presses the
// button again. Now there are two rows.
//
//   createInvoice    a SECOND invoice, with a DIFFERENT NUMBER, for the same job. Invoice numbers
//                    must run in an unbroken sequence (VAT Regulations 1995 reg 14), and there is
//                    now a number in his sequence for an invoice nobody ever sent.
//   createBookShare  a SECOND LIVE GRANT to his entire books. The link is returned once at
//                    creation and never listed back, so he cannot see the first one and cannot
//                    revoke what he was never shown.
//
// So instead of guessing, ASK. Both rows are identifiable from what we already hold, and one extra
// read on a path that would otherwise duplicate is cheap. Only if the recovery read ALSO fails do
// we return null, and by then null is honest: we genuinely do not know.
// ═════════════════════════════════════════════════════════════════════════════════════════════
async function recoverInsertedId(query: string, where: string): Promise<string | null> {
  try {
    const res = await fetch(query, { headers: headers() });
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ id?: string }> | null;
    const id = rows?.[0]?.id;
    if (id) console.error(`[${where}] the reply was unreadable; recovered the row that was written.`);
    return id ?? null;
  } catch {
    return null;
  }
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
      // 🔴 THIS USED TO BE A HARDCODED tax: 0 AND total: subtotal, WHICH WAS ACCIDENTALLY RIGHT.
      // A VAT registered subcontractor billing a main contractor charges no VAT at all, and that
      // is the commonest invoice this audience sends. So zero was correct for him and wrong for
      // everyone else, for the wrong reason. Now the caller decides, using lib/vat.ts, and passes
      // the answer down. No caller means no VAT, which is the old behaviour exactly.
      tax: input.vat ? input.vat.tax : 0,
      total: input.vat ? input.vat.total : subtotal,
      vat_treatment: input.vat ? input.vat.treatment : null,
      reverse_charge_vat: input.vat ? input.vat.reverseChargeVat : 0,
      tax_point: today.toISOString().slice(0, 10),
      status: 'draft',
      issued_date: today.toISOString().slice(0, 10),
      due_date: due.toISOString().slice(0, 10),
    }),
  });
  if (!res.ok) {
    console.error('[createInvoice] failed:', res.status);
    return null;
  }
  const created = (await res.json().catch(() => null)) as Array<{ id: string }> | null;
  const row = created === null ? null : (Array.isArray(created) ? created[0] : (created as { id: string }));
  if (row?.id) return { id: row.id, number, total: input.vat ? input.vat.total : subtotal };

  // See the block above recoverInsertedId. The invoice EXISTS, and the number we just minted
  // identifies it. Only a failed recovery read is honestly null.
  const recovered = await recoverInsertedId(
    `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}`
      + `&number=eq.${encodeURIComponent(number)}&select=id&order=created_at.desc&limit=1`,
    'createInvoice',
  );
  if (!recovered) return null;
  return { id: recovered, number, total: input.vat ? input.vat.total : subtotal };
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
  const rows = (await res.json().catch(() => null)) as (Array<{ vendor: string | null; amount: number; category: string | null }>) | null;
  if (rows === null) return null;
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
  const rows = (await res.json().catch(() => null)) as (Array<{ id: string }>) | null;
  if (rows === null) return null;
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
  const rows = (await res.json().catch(() => null)) as (Array<{ id: string }>) | null;
  if (rows === null) return false;
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

// What the insert actually did, because the two outcomes are different sentences to the man and
// different decisions for the caller. 'inserted' is a new row. 'already_listed' is the unique index
// on waitlist.email refusing a second row for an address that is already down, which from where he
// is standing is not a failure at all: he is on the list, which is the only thing he asked for.
export type WaitlistOutcome = 'inserted' | 'already_listed';

export async function insertWaitlistSignup(signup: WaitlistSignup): Promise<WaitlistOutcome> {
  const { url } = config();
  const record: Record<string, string> = { phone: normalizeUkPhone(signup.phone) };
  if (signup.email) record.email = signup.email;

  const res = await fetch(`${url}/rest/v1/waitlist`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(record),
  });
  if (res.ok) return 'inserted';
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A DOUBLE SUBMIT IS NOT A FAILURE, AND IT MUST NOT BE ON_CONFLICT EITHER.
  //
  // Since APPLY_2026-08-08_waitlist_unique.sql there is a unique index on waitlist.email, so the
  // second tap on the join button gets 409 from PostgREST. Before this, the throw here became a
  // 500 and the front door told a man who WAS on the list that he was not, so he tapped again, and
  // again, and every one of them said the same thing.
  //
  // ⚠️ THE OBVIOUS FIX DOES NOT WORK ON THIS INDEX, AND WOULD LOOK LIKE IT DID IN REVIEW. Adding
  // `?on_conflict=email` with `resolution=merge-duplicates` makes PostgREST emit ON CONFLICT
  // (email), and Postgres infers a conflict target by matching the index's OWN expression. The
  // index is on `lower(trim(email))`, which (email) does not match, so it raises 42P10, "no unique
  // or exclusion constraint matching the ON CONFLICT specification". The `on_conflict` parameter
  // takes bare column names and cannot spell `lower(trim(email))`, so there is no version of that
  // fix that works here: it would only swap a 500 for a 400 and read as fixed.
  //
  // So the 409 is READ instead, and only the 409. Nothing else is forgiven: a 500, a refusal, a
  // dropped connection are all still a real failure and the caller must still tell him so. On this
  // table the only unique things are the primary key (a gen_random_uuid default, which does not
  // collide) and that email index, so a 409 here means the address is already down.
  //
  // The row that stays is the OLDEST one, which is the same rule the migration used when it
  // deduped, and it is the right one: joining order is the only thing a waitlist is for. His phone
  // number is not carried onto it here. The migration does that for the rows it collapsed, and
  // doing it on every repeat submit would let anybody who knows an address overwrite the number we
  // reach that man on.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (res.status === 409) return 'already_listed';
  // No response body in the error: it can contain the submitted phone/email.
  throw new Error(`Waitlist insert failed: ${res.status}`);
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
//
// BOUNDED, because an unbounded read of a growing table is a silent truncation waiting to happen.
// PostgREST will cap a large response itself, and when it does it does not tell you it has: you
// get a short array that looks exactly like "that is everyone", and a send goes out to a slice of
// the list while the rest are quietly never contacted. So the ceiling is ours, explicit, and the
// caller is told when it was hit rather than left to assume completeness.
const MARKETABLE_LEADS_CAP = 5000;

export async function listMarketableLeads(
  confirmedOnly = false,
  limit = MARKETABLE_LEADS_CAP,
): Promise<string[]> {
  const { url } = config();
  const n = Math.max(1, Math.min(limit, MARKETABLE_LEADS_CAP));
  let q = `${url}/rest/v1/marketing_leads?select=email&consent=is.true&unsubscribed_at=is.null`;
  if (confirmedOnly) q += '&confirmed_at=not.is.null';
  q += `&order=email.asc&limit=${n}`;
  const res = await fetch(q, { headers: headers() });
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => null)) as (Array<{ email: string }>) | null;
  if (rows === null) return [];
  const emails = rows.map((r) => r.email).filter(Boolean);
  if (emails.length === n) {
    // Say it out loud. A capped list that nobody knows is capped is how a mailing quietly reaches
    // the first five thousand people alphabetically and nobody else, for months.
    console.warn(
      `[leads] listMarketableLeads hit the ${n} cap. The list is TRUNCATED; page this query before sending to everyone.`,
    );
  }
  return emails;
}

// --- CRM contacts (marketing_leads, extended) -------------------------------------------------
// The contact model layered on marketing_leads: a lead captured from a free tool or an ad, with
// consent, an attribution trail, a lifecycle stage, and a timeline (contact_events). captureContact
// upserts on email and never nulls a field it was not given, so a later touch enriches, not wipes.
// All server side, service role only.

export interface CaptureContactInput {
  email: string;
  name?: string | null;
  source?: string | null;         // acquisition source (marketing_leads.source): in_person | meta | organic | ...
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
  if (input.source != null) record.source = input.source;
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

// Count contacts by lifecycle stage, for the CRM pipeline board. A row with no stage set yet is a
// lead (that is where captureContact leaves them). Returns null on a read failure so the desk can say
// "could not read" rather than draw a confident, wrong zero. Bounded read: fine at today's volume, and
// the place to add a server-side aggregate the day the leads table is large.
// COUNTED IN POSTGRES, NOT IN JAVASCRIPT.
//
// This used to pull up to ten thousand rows back just to tally them here, and its own comment
// admitted the plan: "fine at today's volume, and the place to add a server-side aggregate the
// day the leads table is large". That day is the one we are preparing for, and the failure it
// causes is the nasty kind: past ten thousand leads the board does not error, it just shows
// numbers that are quietly too low, forever, and a wrong number on a dashboard is worse than no
// number because somebody makes a decision on it.
//
// So each stage is now a HEAD count with the total read off the Content-Range header. No rows
// cross the wire at all, the count is exact at any size, and a failure on any one stage returns
// null for the whole thing rather than a partial tally that reads like a real one.
export async function countContactsByStage(): Promise<Record<string, number> | null> {
  const { url } = config();
  const stages = ['lead', 'warming', 'checkout', 'trial', 'paid', 'dormant'] as const;
  try {
    const counts = await Promise.all(
      stages.map(async (stage) => {
        // A row with no stage set yet is a lead: that is where captureContact leaves them, so the
        // lead bucket has to count nulls as well as the explicit value.
        const filter =
          stage === 'lead'
            ? `or=(stage.eq.lead,stage.is.null)`
            : `stage=eq.${encodeURIComponent(stage)}`;
        const res = await fetch(`${url}/rest/v1/marketing_leads?select=email&${filter}`, {
          method: 'HEAD',
          headers: headers({ Prefer: 'count=exact', Range: '0-0' }),
        });
        if (!res.ok) return null;
        const total = (res.headers.get('content-range') ?? '').split('/')[1];
        const n = Number(total);
        return Number.isFinite(n) ? n : null;
      }),
    );
    if (counts.some((c) => c === null)) return null;
    const out: Record<string, number> = {};
    stages.forEach((stage, i) => {
      out[stage] = counts[i] as number;
    });
    return out;
  } catch { return null; }
}

// The most recent in-person (door to door) leads, for the field-capture panel. CRM contact fields
// ONLY (who they are, when, how far). Never a customer's receipts, income, tax or phone. These are
// marketing contacts who gave consent to be contacted, which is a different thing from a customer's
// private books; the financial allowlist in lib/team.ts still governs anything about a paying user.
export interface RecentLead {
  email: string; name: string | null; business: string | null; stage: string; created_at: string | null;
}
export async function listRecentInPersonLeads(limit = 12): Promise<RecentLead[] | null> {
  const { url } = config();
  const n = Math.min(50, Math.max(1, limit));
  try {
    const res = await fetch(`${url}/rest/v1/marketing_leads?source=eq.in_person&select=email,name,stage,created_at,meta&order=created_at.desc&limit=${n}`, { headers: headers() });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ email: string; name: string | null; stage: string | null; created_at: string | null; meta: Record<string, unknown> | null }>;
    return rows.map((r) => ({
      email: r.email,
      name: r.name,
      business: (r.meta && typeof r.meta.business_name === 'string') ? (r.meta.business_name as string) : null,
      stage: r.stage && isContactStage(r.stage) ? r.stage : 'lead',
      created_at: r.created_at,
    }));
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
  // The BUSINESS name, or the person's name for a sole trader. Kept as `name` because that is what
  // the column has always been and renaming it would be a migration for no gain.
  name?: string | null;
  // ⚠️ THE HUMAN BEING, captured separately since 27 July 2026. Before this, a limited company
  // signup stored only the company, so the success screen greeted a man called Dave who runs Smith
  // Electrical Ltd as "Hi Smith". For a sole trader this is the same as `name`.
  person_name?: string | null;
  // What the server side Companies House lookup found, and how it went. See
  // supabase/APPLY_2026-07-27_signup_person_and_company.sql for why the OUTCOME is stored and not
  // just the result: found, found nothing, nothing to find, and could not look are four different
  // facts that would otherwise all be three nulls.
  company_number?: string | null;
  company_name?: string | null;
  registered_office?: string | null;
  company_lookup?: 'matched' | 'no_match' | 'not_ltd' | 'unavailable' | null;
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
  // The Companies House SIC code lib/siccodes matched from what a limited-company signup typed
  // about their trade, and its label. Informational only: nobody files this anywhere, the person
  // confirms it themselves at Companies House. sic_label is set by createSignup itself from the
  // code, via lib/siccodes.sicByCode, never trusted verbatim from the caller.
  sic_code?: string | null;
  /** Partnerships only, 1 to 100. Null for everybody else: see the note in app/api/onboard. */
  partnership_share?: number | null;
}

// Save a completed web onboarding. Written with the service role key, server side only.
export async function createSignup(signup: OnboardSignup): Promise<void> {
  const { url } = config();
  const record: Record<string, unknown> = { phone: normalizeUkPhone(signup.phone) };
  if (signup.email) record.email = signup.email;
  if (signup.trade_type) record.trade_type = signup.trade_type;
  if (signup.name) record.name = signup.name;
  if (signup.person_name) record.person_name = signup.person_name;
  // 🔴 CLAMPED HERE TOO, not only at the route. This is the last thing between a number and the
  // column that decides what slice of his firm's money the product calls his, and setPartnershipShare
  // clamps on the other write for the same reason. Two doors, one rule, neither trusting the other.
  if (typeof signup.partnership_share === 'number' && Number.isFinite(signup.partnership_share)) {
    const pct = Math.round(signup.partnership_share);
    if (pct >= 1 && pct <= 100) record.partnership_share = pct;
  }
  if (signup.company_number) record.company_number = signup.company_number;
  if (signup.company_name) record.company_name = signup.company_name;
  if (signup.registered_office) record.registered_office = signup.registered_office;
  if (signup.company_lookup) record.company_lookup = signup.company_lookup;
  if (signup.trade) record.trade = signup.trade;
  if (signup.postcode) record.postcode = signup.postcode;
  // The label is ALWAYS re-derived here from our own canonical list, never taken as free text from
  // the caller, so a stored label can never disagree with the code sitting next to it.
  if (signup.sic_code) {
    const sic = sicByCode(signup.sic_code);
    if (sic) { record.sic_code = sic.code; record.sic_label = sic.label; }
  }
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
// 🔴 'partnership' USED TO FALL THROUGH TO sole_trader, BECAUSE THE WEB NEVER SENT IT.
// The header above this function said so: "Partnership is not offered on the web, so it never
// arrives here." It is offered now, at /start step 2, so it arrives, and folding it to sole trader
// would tax a man on his partners' profit as well as his own. 'business' still folds, correctly: a
// trading name is a sole trader with a sign on the van.
function tradeTypeToBusinessType(t: string | null | undefined): BusinessType {
  if (t === 'ltd') return 'limited_company';
  if (t === 'partnership') return 'partnership';
  return 'sole_trader';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE SIGNUP LOOKUP ACTUALLY FOUND ABOUT HIS COMPANY, so /app/you can say only what we know.
//
// The Companies House lookup runs once, server side, inside /api/onboard, and writes its OUTCOME to
// the signups row (matched, no_match, not_ltd, unavailable) beside whatever it found. Nothing copies
// those columns onto public.users, deliberately: the signup row IS the record of what the lookup
// found at signup, and a copy is a second truth that drifts. So the page that wants to describe the
// company reads the same row, joined by the same keys reconcileSignupToUser joins by: the phone when
// one is proved, else the verified email off the auth identity, never anything the browser asserts.
//
// ⚠️ null MEANS "WE COULD NOT SAY", never "no company". A failed read here must make the page
// LESS assertive (it falls back to "as you told us"), not more, which is the safe direction for a
// sentence about a register we did not manage to check.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export interface SignupCompany {
  companyNumber: string | null;
  companyName: string | null;
  lookup: 'matched' | 'no_match' | 'not_ltd' | 'unavailable' | null;
}

export async function readSignupCompany(userId: string): Promise<SignupCompany | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const ures = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=phone_number&limit=1`,
      { headers: headers() },
    );
    if (!ures.ok) return null;
    const urows = (await ures.json().catch(() => null)) as Array<{ phone_number: string | null }> | null;
    const e164 = normalizeUkPhone(Array.isArray(urows) && urows[0]?.phone_number ? urows[0].phone_number : '');

    // A web account is minted by proving an EMAIL and its phone column is deliberately empty, the
    // same fork reconcileSignupToUser documents. The email comes from the auth identity, which
    // GoTrue verified, so a man cannot point this read at another man's signup.
    let match = e164 ? `phone=eq.${encodeURIComponent(e164)}` : '';
    if (!match) {
      const identity = await readAuthUserIdentity(userId);
      const email = (identity.email ?? '').trim().toLowerCase();
      if (!email) return null;
      match = `email=eq.${encodeURIComponent(email)}`;
    }

    // The most recent signup, reconciled or not: reconciliation stamps the row, it does not move it.
    const res = await fetch(
      `${url}/rest/v1/signups?${match}` +
        `&select=company_number,company_name,company_lookup&order=created_at.desc&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{
      company_number: string | null; company_name: string | null; company_lookup: string | null;
    }> | null;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const r = rows[0];
    const lookup = r.company_lookup === 'matched' || r.company_lookup === 'no_match'
      || r.company_lookup === 'not_ltd' || r.company_lookup === 'unavailable'
      ? r.company_lookup
      : null;
    return {
      companyNumber: r.company_number ?? null,
      companyName: r.company_name ?? null,
      lookup,
    };
  } catch {
    return null;
  }
}

// `prompts` are the streams we could NOT fully apply because the web only captured a flag, not the
// detail: 'property' needs rent figures, 'loan' needs the plan. The app nudges the user to add those
// in their own screens, so even these do not feel like starting from scratch. Since 31 July 2026
// the 'property' FLAG itself is applied (the rental circumstance, step 5 below); the figures are
// still the app's to ask for, so 'property' stays in prompts as well.
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
// 🔴 THE JOIN KEY IS THE THING HE PROVED, AND SINCE 29 JULY 2026 THAT IS NOT ALWAYS THE PHONE.
//
// This used to read users.phone_number and look the signup up by it, full stop. That was right
// while every account was minted by proving a number. A web account is now minted by proving an
// EMAIL and its phone_number column is deliberately empty, so the old lookup would find nothing
// and every answer he gave at /start would be dropped on the floor without a word.
//
// So: join by the phone when there is one, which is every mobile account and leaves that path
// byte for byte as it was, and by the email when there is not.
//
// ⚠️ THE EMAIL MUST COME FROM THE CALLER, AND IT MUST BE ONE GoTrue VERIFIED. public.users has no
// email column, so there is nothing here to read. /api/signup/verify passes the address off the
// verified identity, never off the form, because an email that could be asserted would let a man
// claim somebody else's signup answers, and those answers include his address.
export async function reconcileSignupToUser(
  userId: string,
  verifiedEmail?: string | null,
): Promise<ReconcileResult> {
  const { url } = config();

  const ures = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=phone_number&limit=1`,
    { headers: headers() },
  );
  if (!ures.ok) return { reconciled: false, applied: [] };
  const urows = (await ures.json().catch(() => null)) as Array<{ phone_number: string | null }> | null;
  const phone = Array.isArray(urows) && urows[0]?.phone_number ? urows[0].phone_number : '';
  const e164 = normalizeUkPhone(phone);

  const email = (verifiedEmail ?? '').trim().toLowerCase();
  // createSignup stores the address already lowercased, so an exact match is right here. Nothing
  // clever: a normalised match would reconcile a DIFFERENT man's signup onto this account whenever
  // two addresses collapse to the same mailbox, which is precisely what normalisation is for.
  const match = e164
    ? `phone=eq.${encodeURIComponent(e164)}`
    : email
      ? `email=eq.${encodeURIComponent(email)}`
      : '';
  if (!match) return { reconciled: false, applied: [] };

  // The most recent signup for this man that has not been reconciled yet.
  const res = await fetch(
    `${url}/rest/v1/signups?${match}&reconciled_at=is.null` +
      `&select=trade_type,trade,name,address,postcode,vat_registered,streams,partnership_share&order=created_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return { reconciled: false, applied: [] };
  const rows = (await res.json().catch(() => null)) as Array<{
    trade_type: string | null; trade: string | null; name: string | null; address: string | null;
    postcode: string | null; vat_registered: boolean | null; streams: string[] | null;
    partnership_share?: number | string | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return { reconciled: false, applied: [] };
  const s = rows[0];
  const applied: string[] = [];

  // 1. Business structure -> the tax engine branch. The biggest question, and now never asked twice.
  if (s.trade_type) {
    if (await setBusinessType(userId, tradeTypeToBusinessType(s.trade_type))) applied.push('business_type');
  }

  // 🔴 1b. AND HIS SLICE OF IT, WHICH IS AS BIG A FACT AS THE STRUCTURE ITSELF.
  //
  // getBusinessProfile reads a missing share as 100%, which is correct for everybody except the one
  // person the column exists for: a partner with nothing here is shown the WHOLE firm's income,
  // set aside and tax bill as his own. That is the same defect commit 0e9175e2 fixed on the income
  // summary a mortgage lender reads, arriving by a different door.
  //
  // ⚠️ ONLY FOR A PARTNERSHIP, AND ONLY FOR A NUMBER WE BELIEVE. setPartnershipShare clamps as
  // well, so a share that survived a hand edited row still cannot leave 1 to 100. A signup from
  // before the column existed reads null and nothing is written, which leaves him exactly where he
  // was and lets /app/setup ask him.
  if (tradeTypeToBusinessType(s.trade_type) === 'partnership') {
    const pct = Number(s.partnership_share);
    if (Number.isFinite(pct) && pct >= 1 && pct <= 100) {
      if (await setPartnershipShare(userId, pct)) applied.push('partnership_share');
    }
  }

  // 2. Name and address onto the profile, for invoices and the quarter pack header.
  const patch: Record<string, unknown> = {};
  if (s.name) {
    // A partnership's name belongs beside a company's and a trading name, not in the person field.
    // /start asks a partner for his own full name separately, exactly as it does for the other two.
    if (s.trade_type === 'ltd' || s.trade_type === 'business' || s.trade_type === 'partnership') patch.business_name = s.name;
    else patch.name = s.name;
  }
  const addr = [s.address, s.postcode].filter(Boolean).join(', ');
  if (addr) patch.address = addr;

  // 🔴 2b. WHAT HIS BUSINESS INCOME ACTUALLY IS, WHICH trade_type CANNOT SAY.
  //
  // trade_type is sole, business or ltd: HOW he trades. The trade WORD is the only thing on this
  // row that says WHETHER he trades, because picking Landlord means the letting IS the work while
  // ticking 'property' at step 4 only means there is rent alongside it, and app/start/page.tsx
  // adds 'property' to the streams in both cases. lib/persona.ts holds that rule and its sources.
  //
  // Written into the same patch as the name and address, so it costs no extra request, and only
  // when there is something to say: a null leaves him unknown, and unknown is asked everything.
  const shape = incomeShapeOfSignup({ trade: s.trade, streams: s.streams });
  if (shape) patch.income_shape = shape;
  if (Object.keys(patch).length > 0) {
    const writeProfile = (body: Record<string, unknown>) => fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      },
    );
    let pr = await writeProfile(patch);
    // ⚠️ UNTIL supabase/APPLY_2026-07-31_income_shape.sql IS RUN, income_shape is not a column and
    // PostgREST rejects the WHOLE patch. His name and his address are the reason this function
    // exists, and losing them because a new column is not there yet would be a far worse bug than
    // the one wave nine set out to fix. So the column is dropped and the rest is written.
    if (!pr.ok && patch.income_shape !== undefined) {
      const withoutShape = { ...patch }; delete withoutShape.income_shape;
      if (Object.keys(withoutShape).length > 0) pr = await writeProfile(withoutShape);
    }
    if (pr.ok) applied.push('profile');
  }

  // 3. VAT status -> the circumstance AND the vat profile. They answer the same question to
  // different halves of the product, and for two and a half weeks this door wrote only one.
  //
  // 🔴 FOUND BY WALKING THE LIVE SITE ON 1 AUGUST, on an account that answered yes at signup.
  // /app/you read the circumstance and said "VAT registered, as you told us." One click away,
  // /app/tax/vat read the profile and said "You are not VAT registered, so there is nothing to
  // work out here." /app/tax drew no VAT door at all, and /app/invoices/new drew no rate boxes
  // and none of the three reverse charge questions, so a registered subcontractor sent an invoice
  // with no VAT and no VAT number on the paper.
  //
  // The mechanism: readVatProfile treats a MISSING ROW as a real answer of "not registered"
  // rather than as silence. That is right for a man who has never been asked and wrong for a man
  // who was asked on the front door and answered. app/api/vat/route.ts already writes both, and
  // its own comment gives the reason: a customer whose two records disagree gets told to go and
  // register by a paid WhatsApp template. Signup is the same fault with the halves swapped.
  //
  // ⚠️ THE PATCH IS DELIBERATELY ONLY `registered`. saveVatProfile is partial by design, so this
  // can never reach a VRN, a scheme or a registration date already given. And it runs only when
  // signup actually carried an answer, so a customer who never saw the question keeps no row at
  // all, which is the honest starting point readVatProfile was built to return.
  if (s.vat_registered !== null && s.vat_registered !== undefined) {
    const vatRegistered = Boolean(s.vat_registered);
    if (await saveCircumstance(
      userId, 'vat_registered', vatRegistered ? 'yes' : 'no',
      'Are you VAT registered? (you answered this when you signed up on the Lekhio website)', 'web',
    )) applied.push('vat_registered');
    // The circumstance goes first and this is best effort, on purpose. The circumstance is the
    // LOG, the exhibit of what we asked and what he answered, and it must not be lost because a
    // second write failed. A failure here costs him the VAT screens until he sets it himself, and
    // it says so out loud rather than looking like a clean sheet.
    if (!(await saveVatProfile(userId, { registered: vatRegistered }))) {
      console.error('[signup-reconcile] vat profile write failed, so the app will read him as not registered until he answers again on /app/you/vat');
    }
  }

  // 4. A PAYE job alongside the trade -> the other_job circumstance. The salary itself is asked later.
  const streams = Array.isArray(s.streams) ? s.streams : [];
  if (streams.includes('job')) {
    if (await saveCircumstance(
      userId, 'other_job', 'yes',
      // ⚠️ NOT "alongside your self-employed work". This sentence is the EXHIBIT: it is stored as
      // the question he was asked, and a landlord has no self employed work, so the log would have
      // recorded us asking him something that was false about him on its face.
      'You told us at signup that you also have a job on the payroll.', 'web',
    )) applied.push('other_job');
  }

  // 5. Rental property -> the rental circumstance. The FLAG is his own tick on the web form, so it
  // travels, exactly as the job tick does: dropping it was how a landlady who told us about her
  // rent at signup arrived in an app that had never heard of it. The FIGURES (rents, costs, the
  // mortgage interest) were never captured on the web, so 'property' also stays in `prompts` below
  // and the app still asks for the numbers rather than guessing them.
  if (streams.includes('property')) {
    if (await saveCircumstance(
      userId, 'rental', 'yes',
      'You told us at signup that you have rental property.', 'web',
    )) applied.push('rental');
  }

  // 🔴 6. A STUDENT LOAN, WHICH WAS THE ONE TICK OF THE THREE THAT LANDED NOWHERE AT ALL.
  //
  // Found by walking a real signup on 6 August 2026. He ticks "A student loan" at /start step 4,
  // where the form promises, in those words, that the repayment "lands in one lump with the January
  // bill" and that "Lekhio includes it in your set aside figure". The tick reached the signups row
  // and stopped there: the job tick wrote a circumstance, the property tick wrote a circumstance,
  // and the loan tick was read into `prompts` and returned to a caller that discards the result.
  //
  // So /app/tax/student-loan told him "You have not told us about a student loan", which is a
  // sentence about a thing he had told us, and his set aside quietly missed 9% of everything above
  // his threshold until he found a page under Tools and set the plan himself. That is money he does
  // not put by, and he finds out in January.
  //
  // ⚠️ THE PLAN IS NOT GUESSED HERE, AND THAT IS THE WHOLE CARE OF IT. The thresholds differ by
  // thousands between plans, so a wrong plan is a wrong figure with our name on it, and /start never
  // asks which one he is on. This writes the FACT and nothing else. The plan is his to give on
  // /app/tax/student-loan, and the page now says so instead of telling him we never heard.
  if (streams.includes('loan')) {
    if (await saveCircumstance(
      userId, 'student_loan', 'yes',
      'You told us at signup that you have a student loan.', 'web',
    )) applied.push('student_loan');
  }

  // Mark reconciled, so a second sign in never re-applies any of the above. Same key we read on,
  // or we would mark a row we did not use and leave the one we did unmarked for ever.
  await fetch(
    `${url}/rest/v1/signups?${match}&reconciled_at=is.null`,
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

// THE IDENTITY, FOR THE COOKIE DOOR. Deliberately its own function and NOT part of the session read.
//
// verifyAccessToken gets the email for free, because GoTrue returns it with the identity. A session
// cookie does not: it resolves to a row in public.web_sessions holding a user id, and public.users
// has no email column, because the email lives on auth.users where the identity is.
//
// ⚠️ SO WHY NOT JUST ADD IT TO readWebSession AND HAVE DONE.
//
// Because readWebSession runs on EVERY authenticated request from the web, and the budget for a man
// on a bad signal is one second for the whole page. Three routes in this codebase need his email:
// exporting his data, deleting his account, and finding his Stripe customer. Everything else needs
// only the user id. Paying for a second round trip on every ledger read to serve three routes is the
// wrong trade, so the lookup is lazy and the caller asks for it.
//
// Service role, admin API. Returns null rather than throwing: a route that cannot get the email must
// decide for itself whether that is fatal, and for a GDPR delete it is.
export interface AuthIdentity {
  email: string | null;
  phone: string | null;
}

// Both fields in ONE call, because the admin response carries both and the billing portal needs
// both: it resolves a Stripe customer by email, and falls back to the phone for a phone-only
// account. Two functions would have meant two round trips to answer one question.
export async function readAuthUserIdentity(userId: string): Promise<AuthIdentity> {
  const none: AuthIdentity = { email: null, phone: null };
  if (!userId) return none;
  try {
    const { url, key } = config();
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return none;
    const u = (await res.json().catch(() => null)) as { email?: string | null; phone?: string | null } | null;
    if (!u) return none;
    return { email: u.email ?? null, phone: u.phone ? String(u.phone) : null };
  } catch {
    return none;
  }
}

// WHAT HE SAID HIS CONNECTED ACCOUNTS ARE FOR, as one answer for the whole pile.
//
// ⚠️ THE STRICTEST ANSWER WINS, AND THAT IS THE ONLY SAFE WAY TO COMBINE THEM.
//
// A man can connect more than one account, and the pile mixes them. If he has a business account and
// a personal one, presuming business across the lot would file his personal life the moment a
// merchant looked familiar. So: any account marked personal makes the whole pile personal, and only
// when every account is marked business is the fast path allowed to presume anything.
//
// No connections, or none answered, reads as 'mixed', which is the behaviour every existing
// connection already has.
export async function readAccountUse(userId: string): Promise<'business' | 'personal' | 'mixed'> {
  if (!userId) return 'mixed';
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/bank_connections?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=account_use`,
      { headers: headers() },
    );
    if (!res.ok) return 'mixed';
    const rows = (await res.json().catch(() => null)) as Array<{ account_use?: string | null }> | null;
    if (!Array.isArray(rows) || rows.length === 0) return 'mixed';
    const uses = rows.map((r) => r.account_use ?? 'mixed');
    if (uses.some((u) => u === 'personal')) return 'personal';
    if (uses.every((u) => u === 'business')) return 'business';
    return 'mixed';
  } catch {
    return 'mixed';
  }
}

// EVERY NAME THAT MEANS HIM. Used to spot money moving between his own accounts.
//
// Three sources, because a bank line can carry any of them: the name he gave us, the name he trades
// under, and the person name captured at web signup before an account existed. All three are him, so
// a payment to any of them is drawings rather than a cost. See matchesOwnName in lib/personal.ts,
// which compares whole words so a short name can never match a longer supplier.
//
// Returns an empty list on any failure. A missing name means the check simply does not fire, which
// leaves behaviour exactly as it was rather than guessing.
export async function readOwnNames(userId: string): Promise<string[]> {
  if (!userId) return [];
  const { url } = config();
  const out = new Set<string>();
  try {
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=name,business_name&limit=1`,
      { headers: headers() },
    );
    if (res.ok) {
      const rows = (await res.json().catch(() => null)) as Array<{ name?: string | null; business_name?: string | null }> | null;
      const r = Array.isArray(rows) ? rows[0] : null;
      if (r?.name) out.add(r.name);
      if (r?.business_name) out.add(r.business_name);
    }
  } catch {
    /* a missing name only means the check does not fire */
  }
  try {
    const ures = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=phone_number&limit=1`,
      { headers: headers() },
    );
    if (ures.ok) {
      const urows = (await ures.json().catch(() => null)) as Array<{ phone_number?: string | null }> | null;
      const phone = Array.isArray(urows) ? urows[0]?.phone_number : null;
      if (phone) {
        const sres = await fetch(
          `${url}/rest/v1/signups?phone=eq.${encodeURIComponent(phone)}&select=person_name,name&limit=1`,
          { headers: headers() },
        );
        if (sres.ok) {
          const srows = (await sres.json().catch(() => null)) as Array<{ person_name?: string | null; name?: string | null }> | null;
          const sr = Array.isArray(srows) ? srows[0] : null;
          if (sr?.person_name) out.add(sr.person_name);
          if (sr?.name) out.add(sr.name);
        }
      }
    }
  } catch {
    /* same */
  }
  return [...out].filter((n) => n.trim().length > 0);
}

// --- The web session (the customer web app) --------------------------------
//
// The phone app carries a Supabase session in the device keystore. A browser cannot safely do
// that, so lekhio.app holds an HttpOnly cookie carrying a session id, and these four functions are
// the only things that read or write what that id means. The cookie signing itself is pure and
// lives in lib/websession.ts; per CLAUDE.md rule 2, the database never leaves this file.
//
// ⚠️ SERVICE ROLE ONLY, BY DESIGN. public.web_sessions has RLS on and NO policy, so the anon and
// authenticated roles can touch nothing in it. A credential store its own holder can query is one
// injection away from being every credential store.

export interface WebSessionRow {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  // Whether he ticked "Remember my browser" when this session was opened. False means the cookie
  // was issued to die with the browser and the row expires within hours; lib/webauth.ts refuses
  // to slide it. Recorded on the row, not inferred from the cookie, because the row is the truth
  // a cookie cannot argue with.
  remembered: boolean;
}

// Open a session for a user whose phone we have just proved with a one time code. Returns the
// session id to put in the cookie, or null if the write failed, so the caller can say "could not
// sign you in" rather than handing out a cookie that means nothing. The caller says whether he
// asked to be remembered; there is no default, so every door that mints a session has to answer.
export async function createWebSession(
  userId: string,
  sessionId: string,
  expiresAt: Date,
  remembered: boolean,
): Promise<boolean> {
  const { url } = config();
  if (!userId || !sessionId) return false;
  const res = await fetch(`${url}/rest/v1/web_sessions`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ id: sessionId, user_id: userId, expires_at: expiresAt.toISOString(), remembered }),
  });
  if (!res.ok) {
    // Never log the id. It is a live credential.
    console.error('[createWebSession] failed:', res.status);
    return false;
  }
  return true;
}

// ⚠️ THE TENANCY BOUNDARY FOR THE WHOLE WEB APP IS THIS ONE QUERY.
//
// The cookie says which session. This says whose. Every page and every route gets its user id from
// here and never from a query parameter, a path segment or anything else the client can type. That
// is the same discipline /api/ledger already follows with verifyAccessToken, and it is why
// changing an id in a URL cannot reach another customer's figures: there is no id in the URL.
//
// A revoked or expired row reads as signed out. Returns null on a failed read too, which is the
// safe direction: worst case a man signs in again, rather than a database wobble handing a session
// to the wrong person.
export async function readWebSession(sessionId: string): Promise<WebSessionRow | null> {
  const { url } = config();
  if (!sessionId) return null;
  const res = await fetch(
    `${url}/rest/v1/web_sessions?id=eq.${encodeURIComponent(sessionId)}` +
      `&revoked_at=is.null&select=id,user_id,created_at,last_seen_at,expires_at,remembered&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Array<{
    id: string; user_id: string; created_at: string; last_seen_at: string; expires_at: string;
    remembered: boolean | null;
  }> | null;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const exp = Date.parse(row.expires_at);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    // Only an explicit false is an unremembered session. Rows from before the column existed read
    // as remembered, which is the promise they were opened under.
    remembered: row.remembered !== false,
  };
}

// Slide the session forward. Called at most once a day per session, never on every page view, so
// a man reading his ledger three times in an afternoon costs one write and not three.
export async function touchWebSession(sessionId: string, expiresAt: Date): Promise<void> {
  const { url } = config();
  if (!sessionId) return;
  await fetch(`${url}/rest/v1/web_sessions?id=eq.${encodeURIComponent(sessionId)}&revoked_at=is.null`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ last_seen_at: new Date().toISOString(), expires_at: expiresAt.toISOString() }),
  }).catch(() => {
    // A failed slide is not worth an error on his screen. The session still works until it expires,
    // and the next page view tries again.
  });
}

// Sign out. The row is marked, never deleted, so "this session ended and when" stays answerable.
export async function revokeWebSession(sessionId: string): Promise<boolean> {
  const { url } = config();
  if (!sessionId) return false;
  const res = await fetch(`${url}/rest/v1/web_sessions?id=eq.${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  return res.ok;
}

// ⚠️ THE USERS ROW, CREATED SERVER SIDE, AND WHY THIS FUNCTION HAD TO EXIST.
//
// Until the web app, public.users was only ever created by the PHONE APP, client side, in
// saveUserPhone(). A man who finished the web signup at /start had a signups row, an unverified
// number, and no account at all: nothing to sign in to and nothing for reconcileSignupToUser to
// reconcile onto. That is the real gap behind "the web app is the product", and this closes it.
//
// The phone comes from the verified GoTrue user, never from the form, so a man cannot claim a
// number he has not proved. Upsert, because he may already have an account from the app and this
// must not disturb it: nothing here overwrites a name, a business or a figure.
export async function ensureUserRow(userId: string, phoneE164: string): Promise<boolean> {
  const { url } = config();
  if (!userId) return false;
  const body: Record<string, unknown> = { id: userId };
  const e164 = normalizeUkPhone(phoneE164);
  // 🔴 THE NUMBER AND THE PROOF GO IN TOGETHER OR NOT AT ALL.
  //
  // The only caller that passes a number here is the phone OTP door, and the number it passes has
  // just been proved by Twilio. That was the whole rule while phone_number was the only evidence
  // there was. From the 29 July migration the evidence is a column of its own, and its header says
  // that anything finding a phone_number with no phone_verified_at beside it is looking at a bug.
  //
  // It read as harmless because nothing consulted the new column yet. lib/walink.ts is what starts
  // consulting it, and a proved number carrying no proof would have read as unproved.
  if (e164) {
    body.phone_number = e164;
    body.phone_verified_at = new Date().toISOString();
  }
  const res = await fetch(`${url}/rest/v1/users?on_conflict=id`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[ensureUserRow] failed:', res.status);
    return false;
  }
  return true;
}

// --- Subscriptions (Stripe billing) ---------------------------------------

export interface SubscriptionRecord {
  // 🔴 THE ACCOUNT, AND WITHOUT IT A PAYING WEB CUSTOMER IS NEVER FOUND.
  //
  // upsertSubscription keys on stripe_subscription_id. A web customer's no card trial row was
  // written by grantTrialWithIdentity with a user_id and NO stripe id, so when he adds a card Stripe
  // mints a brand new subscription and this inserts a SECOND row. If that row carries no user_id,
  // getSubscriptionByUser keeps returning the old trial for ever: he pays, and is still cut off on
  // day eight, and every screen agrees he was not entitled. Carried from the session metadata.
  user_id?: string | null;
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
  if (rec.user_id != null) body.user_id = rec.user_id;
  // 🔴 email_norm TRAVELS WITH email, ALWAYS, AND UNTIL 1 AUGUST 2026 IT DID NOT.
  //
  // SubscriptionRecord has no email_norm field, so this function has never been able to write one.
  // That is not cosmetic: email_norm is the ONLY key priorLocalGrants can match a web customer on,
  // because a web account has no phone. So any row this function touches ends up with an address
  // in `email` and nothing in `email_norm`, which makes that trial INVISIBLE to the one trial per
  // person rule for ever. The next plus alias of the same person sails through, and it did.
  //
  // Found on 1 August by reading the three real production rows. The 30 July row carries the exact
  // fingerprint of this function and of nothing else: a plan set, amount_pence NULL (both grant
  // functions write 0 explicitly), and an email with no email_norm beside it.
  //
  // ⚠️ NORMALISED THE SAME WAY OR IT IS WORSE THAN USELESS. normaliseEmail strips plus aliases, so
  // it must be the same function decideTrialGrant compares with. Two normalisers is how you get a
  // key that looks populated and matches nothing.
  if (rec.email != null) {
    body.email = rec.email;
    body.email_norm = normaliseEmail(rec.email);
  }
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
  const rows = (await res.json().catch(() => null)) as (Array<{ stripe_customer_id?: string | null }>) | null;
  if (rows === null) return null;
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
  const rows = (await res.json().catch(() => null)) as (Array<{ stripe_customer_id?: string | null }>) | null;
  if (rows === null) return null;
  return rows[0]?.stripe_customer_id ?? null;
}

// The ACCOUNT key. A web era subscription row is bound to a user id by the checkout metadata
// (see SubscriptionRecord.user_id), so this is the first place to look for a web customer.
//
// ⚠️ FILTERED TO ROWS THAT ACTUALLY CARRY A CUSTOMER ID. The no card trial row written by
// grantTrialWithIdentity has a user_id and no Stripe ids at all, and it can be the most recently
// updated row on the account. Without the filter this would find that row, read null off it, and
// tell a paying customer he has no billing to manage while his real row sits one below.
export async function getStripeCustomerByUser(userId: string): Promise<string | null> {
  const { url } = config();
  if (!userId) return null;
  const res = await fetch(
    `${url}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`
    + '&stripe_customer_id=not.is.null&select=stripe_customer_id&order=updated_at.desc&limit=1',
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as (Array<{ stripe_customer_id?: string | null }>) | null;
  if (rows === null) return null;
  return rows[0]?.stripe_customer_id ?? null;
}

// THE ONE RESOLUTION ORDER: account first, then email, then phone. The same order every other
// subscription read uses (see /api/billing/status), written once so the billing page and the
// portal route cannot disagree about whether a man has a Stripe customer to manage.
//
// ⚠️ THE KEYS COME FROM THE SESSION AND identityForUser, NEVER FROM A REQUEST BODY. A caller that
// let a request name any of these three would let anyone open another man's billing portal.
export async function getStripeCustomerForAccount(
  userId: string,
  email: string | null,
  phone: string | null,
): Promise<string | null> {
  const byUser = await getStripeCustomerByUser(userId);
  if (byUser) return byUser;
  if (email) {
    const byEmail = await getStripeCustomerByEmail(email);
    if (byEmail) return byEmail;
  }
  if (phone) return getStripeCustomerByPhone(phone);
  return null;
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
//
// PAGED, WITH A KEYSET CURSOR. This used to take no arguments and no limit: one query, the whole
// trialing population, in one array. At a few dozen trials that is fine and it is how it shipped.
// At ten thousand it is a single unbounded read feeding a serial loop that cannot finish inside a
// function timeout, so the run gets killed part way and the men it never reached are simply never
// told their trial is ending. They find out by being locked out. Same shape as the digest bug.
//
// So it hands over one ordered page at a time, and the caller hops with the cursor. Ordering by
// id is what makes the walk finite: every page asks for id greater than the last one seen, so no
// row is ever visited twice and the id space runs out.
export interface TrialPage {
  // ⚠️ CARRYING THE ROW ID IS LOAD BEARING, not incidental. markTrialNudged claims by it, because
  // claiming by phone cannot work for a web customer who has not got one.
  rows: Array<TrialRow & { id: string }>;
  lastId: string | null;
  more: boolean;
}

export async function trialsNeedingNudgePage(
  afterId: string | null,
  limit = 200,
): Promise<TrialPage | null> {
  try {
    const { url } = config();
    const cursor = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
    const res = await fetch(
      `${url}/rest/v1/subscriptions` +
        `?status=eq.trialing&stripe_subscription_id=is.null` +
        `&or=(trial_warn_sent_at.is.null,trial_end_sent_at.is.null)` +
        // 🔴 user_id JOINED THE SELECT ON 30 JULY. Without it this page carries a phone and nothing
        // else, so a trialing web customer, who has no phone until he binds one, could not be
        // reached by any route at all. It is what emailForUser resolves an address from.
        `&select=id,user_id,phone,status,current_period_end,stripe_subscription_id,trial_warn_sent_at,trial_end_sent_at` +
        `&order=id.asc&limit=${limit}${cursor}`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<TrialRow & { id: string }>;
    if (!Array.isArray(rows)) return null;
    return {
      rows,
      lastId: rows.length ? rows[rows.length - 1].id : afterId,
      // A short page means the cursor has reached the end of the set. Driven by page size, never
      // by a time budget, so a run that stops early can never be mistaken for a run that finished.
      more: rows.length === limit,
    };
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
// 🔴 CLAIMED BY THE SUBSCRIPTION ROW ID, NOT BY THE PHONE NUMBER. Changed 30 July, and it is a
// correctness fix in three separate ways rather than a tidy up.
//
//   . A WEB CUSTOMER HAS NO PHONE. Keying the claim on one meant that the moment the trial cron
//     learned to email him, it still could not mark him as told, so he would have been emailed
//     again every morning until his trial ended. The message that exists to be sent once becomes
//     the thing he blocks us for.
//   . A PHONE CAN MATCH MORE THAN ONE ROW. `phone=eq.` is not a unique filter, so a number that
//     appears on two subscription rows had both stamped by one claim, and the second trial silently
//     lost its warning.
//   . THE PAGE ALREADY CARRIES THE ID. trialsNeedingNudgePage selects it and hands it straight to
//     the caller, so keying on the primary key costs nothing and could have been done all along.
//
// Still a claim rather than an update: the `is.null` guard means two crons racing produce exactly
// one winner, and the loser gets an empty array back and sends nothing.
export async function markTrialNudged(subscriptionId: string, which: 'warn' | 'ended'): Promise<boolean> {
  if (!subscriptionId) return false;
  try {
    const { url } = config();
    const col = which === 'warn' ? 'trial_warn_sent_at' : 'trial_end_sent_at';
    const res = await fetch(
      `${url}/rest/v1/subscriptions?id=eq.${encodeURIComponent(subscriptionId)}&${col}=is.null`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ [col]: new Date().toISOString() }),
      },
    );
    if (!res.ok) return false;
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

// ── Signup codes: the six digits we send ourselves ──────────────────────────────────────────────
//
// The rules live in lib/signupcode.ts, which is pure. This is only the reading and writing.
// See supabase/APPLY_2026-07-29_signup_codes.sql for why we send the code rather than GoTrue.

export interface SignupCodeRow {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
}

export async function createSignupCode(
  email: string, emailNorm: string, codeHash: string, expiresAtIso: string,
): Promise<boolean> {
  if (!email || !emailNorm || !codeHash) return false;
  const { url } = config();
  try {
    const res = await fetch(`${url}/rest/v1/signup_codes`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ email, email_norm: emailNorm, code_hash: codeHash, expires_at: expiresAtIso }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The most recent code for this address. Only ever one is live: asking for a new one does not
// delete the old, it simply stops being the newest, and verifyStoredCode reads THIS one. So a man
// who asks twice and types the first code is told it did not work, which is true.
export async function readLatestSignupCode(emailNorm: string): Promise<SignupCodeRow | null> {
  if (!emailNorm) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/signup_codes?email_norm=eq.${encodeURIComponent(emailNorm)}` +
        `&select=id,code_hash,attempts,expires_at,consumed_at&order=created_at.desc&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as SignupCodeRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ⚠️ COUNT THE ATTEMPT BEFORE COMPARING, NOT AFTER.
//
// The other order looks tidier and is the bug: a request that is abandoned, times out, or crashes
// between the comparison and the write is a free guess, and free guesses are the entire attack.
// Counting first means the worst case is that an honest man burns one attempt on a dropped
// connection, which costs him a tap on "Send it again".
export async function bumpSignupCodeAttempt(id: string): Promise<void> {
  if (!id) return;
  const { url } = config();
  try {
    await fetch(`${url}/rest/v1/rpc/increment_signup_attempt`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ p_id: id }),
    });
  } catch {
    // Best effort. The cap is a guard, not the only one: the per address and per source rate limits
    // in the route stand whatever happens here.
  }
}

// 🔴 SPENDING A CODE IS CONDITIONAL ON IT BEING UNSPENT, AND THE DATABASE DECIDES.
//
// The PATCH filters on consumed_at being null and asks for the row back. Two requests racing with
// the same valid code both pass verifyStoredCode, because both read the row before either wrote to
// it; only one of them gets a row back from this. The loser is refused. Checking in TypeScript and
// then writing would let both through.
export async function consumeSignupCode(id: string): Promise<boolean> {
  if (!id) return false;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/signup_codes?id=eq.${encodeURIComponent(id)}&consumed_at=is.null`,
      {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => null)) as unknown[] | null;
    return Array.isArray(rows) && rows.length === 1;
  } catch {
    return false;
  }
}

// The auth user id behind an address, from OUR OWN tables. No GoTrue lookup, because the admin API
// has no reliable filter by email and paging every user to find one is a landmine at any real size.
//
// 🔴 ONE ROUTE ONLY, AND THE SECOND ONE WAS DELETED RATHER THAN KEPT FOR COMPATIBILITY.
//
// This used to fall back to findContactAccount, which resolved an address through the PHONE TYPED
// ON THE SIGNUP ROW. Nobody proves that number, so the fallback handed back whichever account owned
// a number an attacker had typed. See the note in findContactAccount: it was demonstrated end to
// end on 29 July 2026.
//
// signups.user_id is the only acceptable link, because it is written in exactly one place, on the
// far side of a code we emailed and he typed back.
export async function findAuthUserIdForEmail(email: string): Promise<string | null> {
  const key = (email ?? '').trim().toLowerCase();
  if (!key) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/signups?email=eq.${encodeURIComponent(key)}&user_id=not.is.null` +
        `&select=user_id&order=created_at.desc&limit=1`,
      { headers: headers() },
    );
    if (res.ok) {
      const rows = (await res.json()) as Array<{ user_id: string | null }>;
      if (rows[0]?.user_id) return rows[0].user_id;
    }
  } catch {
    // A read that failed is not "no account". Returning null here means the signup route creates a
    // fresh auth user, which GoTrue refuses if the address already has one, and he is told to try
    // again. Annoying, and safe.
    return null;
  }
  return null;
}

// 🔴 THE AUTH USER IS CREATED HERE AND ONLY HERE, AND ONLY AFTER THE CODE WAS PROVED.
//
// email_confirm: true is a TRUE STATEMENT by the time this runs, which is the whole reason we did
// not take the shortcut of turning Confirm email off at the project. That switch would have set the
// same flag on every user whether or not a human ever opened the inbox, which is a lie planted in
// the auth store for anything downstream to trust.
export async function createConfirmedAuthUser(email: string): Promise<string | null> {
  const key = (email ?? '').trim().toLowerCase();
  if (!key) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !service) return null;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: service, Authorization: `Bearer ${service}` },
      body: JSON.stringify({ email: key, email_confirm: true }),
    });
    if (res.ok) {
      const u = (await res.json()) as { id?: string };
      return u?.id ?? null;
    }
    // Already registered. Never log the body: it echoes the address back.
    console.error('[createConfirmedAuthUser] refused:', res.status);
    return null;
  } catch {
    return null;
  }
}

// The bridge from an address to an account, written once the address is proved. See the migration.
export async function setSignupUserId(email: string, userId: string): Promise<void> {
  const key = (email ?? '').trim().toLowerCase();
  if (!key || !userId) return;
  const { url } = config();
  try {
    await fetch(`${url}/rest/v1/signups?email=eq.${encodeURIComponent(key)}&user_id=is.null`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId }),
    });
  } catch {
    // Best effort: he is already signed in by the time this runs, and the legacy lookup still works.
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE ROW HAS TO EXIST FOR THAT PATCH TO LAND ON. FOUND 6 AUGUST 2026, BY WALKING IT.
//
// setSignupUserId above patches `signups where email = his and user_id is null`. If there is no
// row for the address, it matches nothing, succeeds, and says nothing, because a PATCH that
// updates zero rows is not an error.
//
// THAT IS A LOCKED DOOR, NOT A NUISANCE, AND IT ONLY BECAME ONE IN JULY.
//
// findContactAccount's email branch resolves an address ONLY through a signups row carrying a
// user_id (`user_id=not.is.null`), and it is right to: that link is the sole proof the address was
// ever proved into the account, and the 29 July takeover happened because the old code resolved
// through the typed phone instead. So no row means no link, no link means the sign in door never
// sends him a code, and the screen tells him the same neutral sentence it tells a stranger. He
// concludes he mistyped his own address. Every retry does exactly the same thing.
//
// He is not locked out today: he is holding a live session from the signup he just finished. He is
// locked out the moment it ends, which for most people is the next morning, and no amount of
// trying gets him back in without a human touching the database.
//
// WHEN THERE IS NO ROW. /start posts his answers to /api/onboard and then asks for the code
// WITHOUT WAITING TO SEE WHETHER THE ANSWERS SAVED, on the reasoning, written in that file, that a
// failed save costs him nothing worse than being asked a few questions twice. That reasoning was
// true when it was written and the July hardening quietly made it false. Any 500 from a database
// wobble, and the bot trap in /api/onboard (which returns ok and deliberately saves nothing, so an
// automated submission gets no signal), both land here.
//
// So the account minting path lays the bridge down itself rather than trusting that one is there.
// It is the same three steps bindProvedEmailToUser already uses at the /app/you email door, for
// the same reason, and it grants nothing that has not just been proved: the caller is on the far
// side of a code we emailed to this address and he typed back minutes ago.
//
// ⚠️ AND IT REFUSES TO MOVE A LINK THAT ALREADY EXISTS. provedEmailOwner answers 'another' when
// somebody else's account already holds this address, and an unreadable answer is NOT 'nobody'.
// Both refuse, silently, leaving what is there alone. Writing a second row on a guess is how the
// takeover this rule exists to stop would come back.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export async function ensureSignupBridge(userId: string, email: string): Promise<boolean> {
  const addr = (email ?? '').trim().toLowerCase();
  if (!userId || !addr) return false;

  const owner = await provedEmailOwner(userId, addr);
  // Already linked to this account, by the patch above or by a row that was always his.
  if (owner === 'his') return true;
  // 'another' is somebody else's proved address, and null is a read we could not trust. Neither is
  // an invitation to write. He keeps the session he just proved, and nothing is moved.
  if (owner !== 'nobody') return false;

  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/signups`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      // reconciled_at is stamped because this row carries no answers to carry over. An empty row
      // left unreconciled would be picked up by reconcileSignupToUser and mark itself done against
      // a real signup he makes later. Same reason bindProvedEmailToUser stamps it.
      body: JSON.stringify({
        phone: '', email: addr, user_id: userId, reconciled_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── The web trial: granted against an ACCOUNT, not a phone ───────────────────────────────────────
//
// 🔴 WHY THERE IS A SECOND GRANT FUNCTION AND grantTrialIfNone WAS NOT SIMPLY CHANGED.
//
// grantTrialIfNone(phone) is the MOBILE path, and on mobile the phone has been proved by an SMS
// before the app ever calls it. It is correct there and it is left exactly as it was.
//
// The web mints an account on a proved EMAIL, and the number is typed. Handing that number to
// grantTrialIfNone would key a man's billing to a string he could change by typing, and worse,
// would write it into subscriptions.phone, which /api/cron/trial reads and SENDS A WHATSAPP TO.
// One mistyped digit and a stranger is told somebody else's trial is ending.
//
// So the web grants against the account id, records every identifier we hold for the duplicate
// check, and puts the typed number in signup_phone, which nothing sends to.

export interface TrialGrantInput {
  userId: string;
  email: string;
  // Typed at signup, proved by nobody. Evidence only. Never a send target.
  signupPhone?: string | null;
  personName?: string | null;
  businessName?: string | null;
}

export interface TrialGrantResult {
  sub: SubscriptionStatus | null;
  granted: boolean;
  refusedOn: MatchKind | null;
  // Soft collisions for a human to look at. Never a reason to refuse. See lib/trialidentity.ts.
  flags: MatchKind[];
  // 🔴 HOW MANY OF THE PRIOR GRANT CHECKS COULD NOT BE ANSWERED. Zero on a healthy system.
  //
  // Deliberately NOT a MatchKind: that union says what MATCHED, and a check that never ran is the
  // opposite of a match. Keeping it separate is what stops "we looked and found nothing" and "we
  // could not look" ending up in the same array, which is the exact confusion that let a fourth
  // plus alias signup through on 31 July. Above zero means the one trial per person rule is not
  // running, however clean the grant looks.
  checkDegraded: number;
}

// Every local grant that shares an identifier with this man. Five small indexed reads rather than
// one clever `or=()`: a normalised email and a business name both contain characters PostgREST
// treats as syntax inside or(), and a filter that silently fails to parse is a duplicate check
// that quietly returns nothing and grants everybody a second trial.
async function priorLocalGrants(
  input: TrialGrantInput,
): Promise<{ grants: PriorGrant[]; unreadable: number; attempted: number }> {
  const { url } = config();
  const cols = 'user_id,email_norm,signup_phone,person_name,business_name';
  const base = `${url}/rest/v1/subscriptions?stripe_subscription_id=is.null&select=${cols}&limit=20`;

  const emailNorm = normaliseEmail(input.email);
  const phone = normalisePhone(input.signupPhone);
  const person = (input.personName ?? '').trim();
  const business = (input.businessName ?? '').trim();

  const wanted: string[] = [];
  if (input.userId) wanted.push(`&user_id=eq.${encodeURIComponent(input.userId)}`);
  if (emailNorm) wanted.push(`&email_norm=eq.${encodeURIComponent(emailNorm)}`);
  if (phone) wanted.push(`&signup_phone=eq.${encodeURIComponent(phone)}`);
  if (person) wanted.push(`&person_name=eq.${encodeURIComponent(person)}`);
  if (business) wanted.push(`&business_name=eq.${encodeURIComponent(business)}`);

  const pages = await Promise.all(
    wanted.map(async (q) => {
      try {
        const res = await fetch(base + q, { headers: headers() });
        if (!res.ok) return null;
        return (await res.json()) as PriorGrant[];
      } catch {
        return null;
      }
    }),
  );

  // ⚠️ A READ THAT FAILED IS NOT A CLEAN SHEET. If any of these could not be answered we do not
  // know whether he has had a trial, and refusing a man on our own database wobble is the mistake
  // lib/entitlement.ts spends forty lines telling us not to make. So an unreadable check is
  // treated as "no prior found", he gets his week, and the unique indexes in the database are what
  // stop an actual double grant.
  //
  // 🔴 AND THAT IS WHERE THIS WENT WRONG, SO READ THE NEXT PARAGRAPH BEFORE SIMPLIFYING IT BACK.
  //
  // Failing open is right. Failing open SILENTLY is not, and on 31 July 2026 a fourth plus alias
  // signup was granted a trial while decideTrialGrant was provably correct, because the fault was
  // here: these five reads name columns (email_norm, signup_phone, person_name, business_name) that
  // only exist if APPLY_2026-07-29_web_account_and_trial_identity.sql was applied. PostgREST answers
  // a select naming a column that does not exist with a 400. So `if (!res.ok) return null` turned
  // EVERY check into "no prior found", for ever, for everybody, with nothing logged and nothing to
  // see. A permanently broken rule looked exactly like a clean sheet, and the sentence above
  // ("the unique indexes in the database are what stop an actual double grant") was the cover
  // story: those indexes come from the SAME migration, so if the columns are missing the indexes
  // are missing too and NOTHING is stopping it.
  //
  // The fix is not to fail closed. It is to make the two states distinguishable. `unreadable`
  // counts the checks that could not be answered, the caller carries it into the flags, and the
  // one line below is the only alarm this needs: a grep for it says instantly whether the rule is
  // running or has been quietly off since July. Run supabase/CHECK_trial_rule.sql to see why.
  const ok = pages.filter((p): p is PriorGrant[] => Array.isArray(p));
  const unreadable = pages.length - ok.length;
  if (unreadable > 0) {
    // No customer data in this line, by design: it is a health signal, not a record.
    console.warn(
      `[trial-identity] DEGRADED: ${unreadable} of ${pages.length} prior grant checks could not be read. ` +
      'The one trial per person rule is NOT running. Check that ' +
      'supabase/APPLY_2026-07-29_web_account_and_trial_identity.sql has been applied, ' +
      'then run supabase/CHECK_trial_rule.sql.',
    );
  }
  return { grants: ok.flat(), unreadable, attempted: pages.length };
}

// What he told us at /start, read back off his own signup row so the trial identity is never
// taken from the browser. The form that posts a code could post any name and any number beside it;
// the signup row is what he actually filled in, minutes earlier, before he had an account.
//
// Deliberately NOT filtered on reconciled_at: this is read alongside reconcileSignupToUser, which
// marks rows as it goes, and a filter here would make the answer depend on which ran first.
export interface SignupIdentity {
  phone: string | null;
  personName: string | null;
  businessName: string | null;
}

export async function latestSignupIdentity(email: string): Promise<SignupIdentity | null> {
  const key = (email ?? '').trim().toLowerCase();
  if (!key) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/signups?email=eq.${encodeURIComponent(key)}` +
        `&select=phone,person_name,name,trade_type&order=created_at.desc&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      phone: string | null; person_name: string | null; name: string | null; trade_type: string | null;
    }>;
    const r = rows[0];
    if (!r) return null;
    // A sole trader's `name` IS his own name, not a business, so it must not be filed as one: two
    // different sole traders called Dave Smith would otherwise collide on "business" as well as
    // "name" and look far more like the same man than they are.
    // ⚠️ A PARTNERSHIP JOINED THIS LIST ON 4 AUGUST, when /start started offering one. The firm's
    // name is not his name, exactly as with a company and a trading name, and /start asks him for
    // his own separately. Left out, a partner's business would have been filed as a person.
    const isBusiness = r.trade_type === 'ltd' || r.trade_type === 'business' || r.trade_type === 'partnership';
    return {
      phone: r.phone ?? null,
      personName: r.person_name ?? r.name ?? null,
      businessName: isBusiness ? r.name ?? null : null,
    };
  } catch {
    return null;
  }
}

export async function grantTrialWithIdentity(input: TrialGrantInput): Promise<TrialGrantResult> {
  const none: TrialGrantResult = { sub: null, granted: false, refusedOn: null, flags: [], checkDegraded: 0 };
  if (!input.userId) return none;

  // Already has one on this account? Hand it back rather than deciding anything.
  const existing = await getSubscriptionByUser(input.userId);
  if (existing) return { sub: existing, granted: false, refusedOn: 'account', flags: [], checkDegraded: 0 };

  const prior = await priorLocalGrants(input);
  const decision = decideTrialGrant(
    {
      userId: input.userId,
      email: input.email,
      signupPhone: input.signupPhone ?? null,
      personName: input.personName ?? null,
      businessName: input.businessName ?? null,
    },
    prior.grants,
  );
  // 🔴 A DEGRADED CHECK TRAVELS WITH THE DECISION RATHER THAN VANISHING INTO IT. He still gets his
  // week, which is right, but the flag says the rule did not actually run, so /team can see the
  // difference between "nobody has tried it twice" and "we stopped looking in July".
  const flags = decision.flags;
  const checkDegraded = prior.unreadable;
  if (!decision.grant) {
    return { sub: null, granted: false, refusedOn: decision.refusedOn, flags, checkDegraded };
  }

  const { url } = config();
  try {
    const res = await fetch(`${url}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        user_id: input.userId,
        email: input.email,
        email_norm: normaliseEmail(input.email),
        // 🔴 signup_phone, NOT phone. phone is a send target: /api/cron/trial texts it.
        signup_phone: normalisePhone(input.signupPhone),
        person_name: (input.personName ?? '').trim() || null,
        business_name: (input.businessName ?? '').trim() || null,
        plan: null,
        status: 'trialing',
        amount_pence: 0,
        current_period_end: trialEndsAt(),
        cancel_at_period_end: false,
      }),
    });
    // 409: a unique index refused a second grant, so another request won the race, or he really
    // has had one. Either way read back what is there. The database is the rule, this is the hope.
    if (res.status === 409) {
      const back = await getSubscriptionByUser(input.userId);
      return { sub: back, granted: false, refusedOn: 'account', flags, checkDegraded };
    }
    if (!res.ok) return { ...none, flags, checkDegraded };
    const rows = (await res.json()) as SubscriptionStatus[];
    return { sub: rows[0] ?? null, granted: true, refusedOn: null, flags, checkDegraded };
  } catch {
    return { ...none, flags, checkDegraded };
  }
}

// ── What the gate needs to know, in one read ────────────────────────────────────────────────────
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 getSubscriptionByUser RETURNS null FOR TWO COMPLETELY DIFFERENT THINGS, and the paywall is the
// first caller for which that matters enough to break something.
//
// It returns null when the query FAILED and null when the man simply HAS NO ROW. As a status
// reporter that was harmless. As the input to a lock it is not: treating a failed read as "not
// entitled" would put every customer we have into read only during one bad minute at Supabase, at
// exactly the moment we are least able to notice it happening.
//
// So this reader answers with a KIND, and lib/gate.ts opens the door on 'unreadable' while judging
// only 'none'. The old function is untouched, because its callers want what it already does.
//
// The account age comes back in the same call because gate.ts needs it for the no row case: a man
// in his first week with no subscription row is far more likely to be our failed write than a
// repeat identity, and nobody is in his first week twice.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface GateInputs {
  read: import('./gate').SubscriptionRead;
  accountAgeDays: number | null;
}

export async function readGateInputs(userId: string): Promise<GateInputs> {
  if (!userId) return { read: { kind: 'unreadable' }, accountAgeDays: null };
  const { url } = config();

  // Two round trips in parallel rather than two in a row. This runs on every gated action, so it is
  // on the hot path for a man pressing Confirm on a bad signal.
  const [subRes, userRes] = await Promise.all([
    fetch(
      `${url}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=status,current_period_end&order=updated_at.desc&limit=1`,
      { headers: headers() },
    ).catch(() => null),
    fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=created_at&limit=1`,
      { headers: headers() },
    ).catch(() => null),
  ]);

  let read: import('./gate').SubscriptionRead = { kind: 'unreadable' };
  if (subRes && subRes.ok) {
    const rows = (await subRes.json().catch(() => null)) as Array<{
      status: string | null; current_period_end: string | null;
    }> | null;
    // ⚠️ AN UNPARSEABLE BODY IS UNREADABLE, NOT EMPTY. A 200 carrying rubbish is still us failing to
    // see, and the whole point of this type is that we never guess in that direction.
    if (Array.isArray(rows)) {
      read = rows.length === 0
        ? { kind: 'none' }
        : { kind: 'read', status: rows[0].status, current_period_end: rows[0].current_period_end };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND THEN BY PHONE, BECAUSE MOST SUBSCRIPTION ROWS DO NOT CARRY A user_id.
  //
  // This is the bug that nearly shipped. subscriptions.user_id only arrived on 29 July, so every
  // row created before it is keyed to a PHONE. On 30 July three of the four rows in production had
  // no user_id at all, including a paying, active one.
  //
  // Reading by account alone therefore answered 'none' for a legacy customer, and 'none' on an
  // account older than the trial means READ ONLY. The paywall would have locked out a man who was
  // paying us, on his first visit to the web app, and the only signal would have been him leaving.
  //
  // /api/billing/status has carried this same two key read since the web accounts landed, and its
  // header explains the same thing. This is that reasoning applied where it decides a lock rather
  // than a label.
  //
  // ⚠️ ONLY ON 'none'. A failed read must never be retried into a different answer: if the first
  // query could not see, we say so and lib/gate.ts opens the door.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (read.kind === 'none') {
    const phone = await getPhoneForUser(userId).catch(() => null);
    if (phone) {
      const byPhone = await fetch(
        `${url}/rest/v1/subscriptions?phone=eq.${encodeURIComponent(phone)}` +
          `&select=status,current_period_end&order=updated_at.desc&limit=1`,
        { headers: headers() },
      ).catch(() => null);
      if (!byPhone || !byPhone.ok) {
        read = { kind: 'unreadable' };
      } else {
        const prows = (await byPhone.json().catch(() => null)) as Array<{
          status: string | null; current_period_end: string | null;
        }> | null;
        if (!Array.isArray(prows)) read = { kind: 'unreadable' };
        else if (prows.length > 0) {
          read = { kind: 'read', status: prows[0].status, current_period_end: prows[0].current_period_end };
        }
      }
    }
  }

  let accountAgeDays: number | null = null;
  if (userRes && userRes.ok) {
    const urows = (await userRes.json().catch(() => null)) as Array<{ created_at: string | null }> | null;
    const created = Array.isArray(urows) && urows[0]?.created_at ? Date.parse(urows[0].created_at) : NaN;
    if (Number.isFinite(created)) accountAgeDays = (Date.now() - created) / 86_400_000;
  }

  return { read, accountAgeDays };
}

export async function getSubscriptionByUser(userId: string): Promise<SubscriptionStatus | null> {
  if (!userId) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=status,plan,current_period_end,cancel_at_period_end&order=updated_at.desc&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as SubscriptionStatus[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// IS THERE A CARD ON FILE FOR THIS ACCOUNT?
//
// ⚠️ NOT THE SAME QUESTION AS "is he entitled", AND THE DIFFERENCE IS THE WHOLE POINT OF ASKING.
//
// Every new customer is `trialing` whether or not he ever saw a payment page: grantTrialWithIdentity
// writes that row for the no card trial we promise him. So status cannot tell the two apart. The
// only honest signal is a Stripe subscription id, which exists only if he actually went through
// checkout. Used to decide whether the end of setting up asks him for a card or thanks him for it.
//
// Returns false when we cannot read, which asks a man who already paid for a card he has given. That
// is the mistake worth making: the other way round silently drops the ask for everybody the day the
// read breaks, and nobody would notice until the revenue did not arrive.
export async function hasCardOnFile(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`
      + '&stripe_subscription_id=not.is.null&select=stripe_subscription_id&limit=1',
      { headers: headers() },
    );
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => null)) as unknown[] | null;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
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
  const rows = (await res.json().catch(() => null)) as (SubscriptionStatus[]) | null;
  if (rows === null) return null;
  return rows[0] ?? null;
}

// --- GDPR: data export and erasure (the user acting on their own account) ----
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE LIST OF WHAT WE HOLD, READ BY BOTH DOORS, BECAUSE TWO LISTS IS THE FAULT ITSELF.
//
// The export and the erasure each carried their own hand written list of tables, and the two
// drifted the moment anybody shipped a table. On 6 August 2026 the count was this: the export
// returned SEVEN tables out of the twenty eight we hold, so a man who asked for his data got his
// receipts and his invoices and NOT ONE LINE OF HIS CHAT HISTORY. The erasure walked past
// allowance_elections, announcement_dismissals, signup_codes (which holds his address), wa_out
// (which holds his number) and every receipt photograph in the storage bucket, while its own
// comment above it promised it deleted "every row for this user across all tables".
//
// Neither of those was written on purpose. They are what a second list does over time: a table is
// added to whichever list the author happened to be looking at, and the other one quietly becomes
// a false statement. UK GDPR Article 15 and Article 17 are the SAME question asked twice, what do
// you hold about me, so there is ONE CONSTANT here and both functions walk it. Adding a table to
// USER_DATA_TABLES adds it to the export and to the erasure in the same edit, and there is no
// edit that can add it to only one of them. test/datarights.test.mjs pins that.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Which of his identities fills the key column. Most tables carry his user id and cascade from
// public.users; the ones written before he had an account, or written by a channel that only
// knows how to reach him, carry his address or his number instead and cascade from nothing.
export type UserDataKeyKind = 'user_id' | 'email' | 'email_norm' | 'phone';

export interface UserDataTable {
  table: string;
  // The column that holds the identity.
  userKey: string;
  keyKind: UserDataKeyKind;
  // The columns the EXPORT may hand back. '*' everywhere except the few rows that hold something
  // which is not his to have: a bank or HMRC token is not data about him, it is a key to somebody
  // else's building, and an export file ends up in a downloads folder, an email, a WhatsApp. The
  // HMAC of a login code is the same class of thing. He gets everything that is about him, and
  // nothing that anyone could replay. The ERASURE ignores this field: it takes the whole row.
  select: string;
}

// Every table keyed to one man, in the order the erasure walks them: children before parents, so
// no delete is refused by a foreign key that is still pointing at the row.
export const USER_DATA_TABLES: readonly UserDataTable[] = [
  // ⚠️ HIS CHAT HISTORY, AND IT WAS THE WHOLE OF WHAT THE EXPORT USED TO MISS. Everything he ever
  // typed to Puchio about his money is in here. Messages first: they hang off conversations.
  { table: 'messages', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'conversations', userKey: 'user_id', keyKind: 'user_id', select: '*' },

  // The books and the paperwork.
  { table: 'transactions', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'invoices', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'events', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'reminder_prefs', userKey: 'user_id', keyKind: 'user_id', select: '*' },

  // What he told us about his circumstances, in his own words in the case of circumstances.asked,
  // and the tax facts derived from them. All of it is a statement he made about his own life.
  { table: 'properties', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'circumstances', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'vat_profiles', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // No foreign key at all (user_id is a bare uuid column), so nothing cascades here and the
  // erasure used to leave his election standing after the account was gone.
  { table: 'allowance_elections', userKey: 'user_id', keyKind: 'user_id', select: '*' },

  // What he is saving for and what he does for a living.
  { table: 'goals', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'diary_jobs', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // ⚠️ THE OLD GOALS TABLE IS DELIBERATELY NOT LISTED HERE, AND THAT IS NOT AN OVERSIGHT.
  // The founder consolidated it into public.goals on 31 July 2026: the rows were migrated, it
  // is read only legacy until launch two, and test/goalstore.test.mjs walks the whole server
  // codebase asserting that name appears in NO code, so that no writer can quietly come back
  // and fork the two stores. Naming it in this manifest would be exactly that offence. His
  // goals are exported above, out of the table they now live in, and on the erasure side the
  // legacy rows carry a user_id foreign key that cascades, so they go with the delete of
  // `users` at the end of deleteUserData rather than surviving it.
  { table: 'user_rules', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'onboarding_progress', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  { table: 'agent_signals', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // Same shape as allowance_elections: user_id with no foreign key, so it never cascaded either.
  // Which notices he has dismissed is a record of what he has been shown and when.
  { table: 'announcement_dismissals', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // Who he showed his books to, and their name and address.
  { table: 'book_shares', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // The figures he signed off to HMRC. Keyed by user_id with no foreign key.
  { table: 'hmrc_approvals', userKey: 'user_id', keyKind: 'user_id', select: '*' },

  // 🔴 TOKEN TABLES. The row is deleted whole; the export gets the shape of the connection and
  // never the credential. access_token, refresh_token and the _enc columns are absent from these
  // selects on purpose, and the shape of the columns is deliberately the narrow set that exists
  // in every environment (this table has been reshaped twice, see supabase/schema.sql).
  { table: 'hmrc_connections', userKey: 'user_id', keyKind: 'user_id', select: 'user_id,nino,business_id,expires_at,created_at,updated_at' },
  { table: 'bank_connections', userKey: 'user_id', keyKind: 'user_id', select: 'id,user_id,provider,status,created_at' },

  // His own actions, with the ip address they came from. His to see, and his to have erased.
  { table: 'audit_log', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 HIS TESTIMONIAL, WHICH UNTIL 9 AUGUST 2026 COULD NOT BE ERASED AT ALL.
  //
  // The table had no identity column: only created_by, which is the TEAM MEMBER who typed it in.
  // So a customer's name and his words sat on the PUBLIC HOMEPAGE and this walk went straight past
  // them. There was no request he could make that would take them down, because nothing left in
  // the database remembered they were his.
  //
  // The fix was Jag's and it is better than the one that was proposed to him: the customer writes
  // it HIMSELF, from inside his own account, so the user id is on the row BY CONSTRUCTION rather
  // than because somebody remembered to paste an address. Consent is given by the person, in his
  // words, at a moment he chose, and withdrawal is a button on the same screen.
  //
  // ⚠️ A NULL user_id IS A REAL ANSWER, not a gap. It is a quote from somebody with no Lekhio
  // account, and no account means no erasure request to serve. The rows that predate this column
  // are also null and are swept by hand once.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  { table: 'testimonials', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // The learning pool. Question and answer are both PII redacted on the way in
  // (see logQaCandidate), but redaction is a filter, not a guarantee, and the
  // row is keyed to the asker whose answer text is stored. Same shape as
  // allowance_elections: a bare user_id with no foreign key, so nothing
  // cascades and this walk is the only door. Legacy rows written before the
  // column existed carry null and age out via lib/qaretention.ts.
  { table: 'qa_candidates', userKey: 'user_id', keyKind: 'user_id', select: '*' },
  // The WhatsApp linking codes. code_hash is an HMAC, so it is withheld the same way a token is.
  { table: 'wa_links', userKey: 'user_id', keyKind: 'user_id', select: 'id,user_id,expires_at,consumed_at,bound_phone,created_at' },

  // 🔴 HIS VOICE. The sharpest row in this file and it had no door at all until 8 August 2026.
  //
  // docs/voice_jobs.sql declares `user_id uuid not null` with NO foreign key, so nothing cascades
  // here, exactly like allowance_elections. A note that was never transcribed still holds
  // audio_base64: the customer's own recorded voice, sitting next to from_phone, HIS NUMBER, which
  // is personal data on its own. lib/voicejobs.ts wipes the audio when the mini finishes and reaps
  // stale rows, but a reap is a retention policy, not an answer to an erasure request, and it only
  // runs when something polls. An account deleted while a note is in flight kept the recording.
  //
  // ⚠️ audio_base64 IS NOT IN THE EXPORT SELECT, AND THAT IS NOT A WITHHOLDING. The erasure ignores
  // this field and takes the whole row, audio included. The export leaves it out because Meta
  // allows a voice note up to 16MB, whose base64 is about 21MB, and one in flight note would push
  // the export response past the serverless body limit and fail the whole download. A subject
  // access request that 500s hands him nothing at all. He already holds the note itself, in his own
  // WhatsApp thread, which is where he sent it from.
  { table: 'voice_jobs', userKey: 'user_id', keyKind: 'user_id', select: 'id,user_id,from_phone,wa_message_id,mime_type,status,created_at' },

  // The owners of his limited company, seeded from the Companies House register against the paying
  // account. owner_user_id carries no foreign key (see APPLY_2026-07-19_company_members.sql), so
  // nothing cascades, and the row holds a named director and the address an invite was sent to.
  //
  // ⚠️ KEYED ON owner_user_id ONLY. member_user_id is a SECOND person's own login, linked once they
  // accept, and a manifest entry is one table and one key. Erasing an invited co owner therefore
  // leaves the owner's row standing with member_user_id still pointing at a user id that no longer
  // resolves to anybody. That is the right shape for the OWNER's record of his own register, but it
  // wants an `on delete set null` on that column rather than being left to a comment. Named in the
  // packet as a live check, not silently skipped.
  { table: 'company_members', userKey: 'owner_user_id', keyKind: 'user_id', select: '*' },

  // Keyed by the address he typed, not by an account he may not have finished making.
  { table: 'signups', userKey: 'email', keyKind: 'email', select: '*' },
  // Marketing capture: email, ip and user agent, plus the consent wording UK PECR makes us keep.
  { table: 'marketing_leads', userKey: 'email', keyKind: 'email', select: '*' },
  // The timeline that hangs off marketing_leads: every touch on the contact, keyed on the same
  // lowercased address (see logContactEvent and docs/crm_contacts.sql). There is no foreign key
  // between them, so erasing the lead and leaving its history behind is exactly the drift this
  // manifest exists to stop: the record of what he did and when, under the address he asked us to
  // forget.
  { table: 'contact_events', userKey: 'email', keyKind: 'email', select: '*' },
  // Email he sent to a Lekhio mailbox, with his address, his name, his subject and a two thousand
  // character extract of what he wrote, plus the reply we drafted (docs/dakiya_drafts.sql). No
  // cascade and NO RETENTION SWEEP AT ALL, so a support email from a man who later asked to be
  // erased sits there for ever. Keyed on the address he sent it from, which is the only key the
  // table has; a message sent from some other address of his is out of reach here, the same
  // limitation marketing_leads already carries.
  { table: 'dakiya_drafts', userKey: 'from_email', keyKind: 'email', select: '*' },
  // ⚠️ NORMALISED ADDRESS, because that is the key this table is written and read on: a plus tag
  // or a gmail dot must not leave a live row behind holding the address he asked us to forget.
  // See normaliseEmail in lib/trialidentity.ts.
  { table: 'signup_codes', userKey: 'email_norm', keyKind: 'email_norm', select: 'id,email,email_norm,attempts,expires_at,consumed_at,created_at' },

  // Keyed by his phone number, and none of these cascades from users.
  // In flight WhatsApp state, which may hold a draft invoice and a customer's details.
  { table: 'wa_sessions', userKey: 'phone', keyKind: 'phone', select: '*' },
  // When he asked for a human. phone is the thread key and is NOT NULL; user_id is nullable,
  // because a ticket can be opened before we resolve one, so the number is the only key that
  // reaches every row of his (docs/support_tickets.sql). The row holds his name and the message he
  // wrote asking for help, and there is no sweep on this table either.
  { table: 'support_tickets', userKey: 'phone', keyKind: 'phone', select: '*' },
  // ⚠️ THE PER DAY AI COUNTERS, AND THE KEY COLUMN IS THE POINT. ai_usage is (day, scope, key,
  // count), and for scope 'phone' and 'wamsg' that key IS his WhatsApp number in plain text, which
  // is personal data on its own, the same argument as wa_out. pruneOldRows drops rows past sixty
  // days, but sixty days is a retention ceiling, not "without undue delay".
  //
  // Keyed on phone and NOT on user_id, deliberately. The user_id scoped rows ('ask', 'thread',
  // 'receiptweb') hold a bare uuid, and once the users row and the auth identity are gone at the
  // end of this erasure there is nothing left anywhere that resolves it to a person, so they age
  // out anonymous. The number does not. A phone number will never collide with the other keys this
  // column holds ('all', a year and month, an ip from the anonymous draft tool), so an exact match
  // on it takes his rows and nobody else's.
  { table: 'ai_usage', userKey: 'key', keyKind: 'phone', select: '*' },
  // ⚠️ wa_out.user_id is `on delete set null`, so deleting the users row does NOT delete these
  // rows, it merely forgets whose they are and leaves HIS NUMBER sitting in the column next to
  // it. Erasing by phone is the only key that still reaches them. See APPLY_2026-07-31_wa_out.sql.
  { table: 'wa_out', userKey: 'phone', keyKind: 'phone', select: '*' },
];

// The four identities, resolved once, so both doors filter on exactly the same values. An empty
// string is normalised to null: an unfiltered delete would be an unbounded delete, and a PostgREST
// filter of `eq.` with nothing after it is not a query anybody should be writing by accident.
function userDataIdentities(
  userId: string,
  email: string | null,
  phone: string | null,
): Record<UserDataKeyKind, string | null> {
  return {
    user_id: userId || null,
    email: email || null,
    email_norm: (email ? normaliseEmail(email) : '') || null,
    phone: phone || null,
  };
}

export interface AccountExport {
  exported_at: string;
  // The profile row itself, singular, because there is only ever one of him.
  user: unknown;
  // These two are kept by hand rather than in the manifest because each is keyed by BOTH his
  // number and his address, so one row can answer to either and the two reads have to be merged.
  // A manifest entry is one table and one key; forcing these into it would mean listing each
  // table twice and exporting the same rows twice under two names.
  subscriptions: unknown[];
  waitlist: unknown[];
  // Article 15(3) wants a COPY. These are links, not bytes, and the note says how long they live.
  receipt_images: ExportedReceipt[];
  receipt_images_note: string;
  // Then one key per USER_DATA_TABLES entry, named for the table it came from. Declared as an
  // index signature rather than thirty named fields for the reason this whole section exists: a
  // named field is a second list, and a second list goes stale.
  [table: string]: unknown;
}

// Gather everything held about one user, scoped to them. Service role only.
export async function exportUserData(userId: string, email: string | null): Promise<AccountExport> {
  const { url } = config();
  const get = async (path: string): Promise<unknown[]> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers() });
    return res.ok ? (((await res.json().catch(() => null)) as unknown[] | null) ?? []) : [];
  };
  const phone = await getPhoneForUser(userId);
  const identities = userDataIdentities(userId, email, phone);

  // One read per manifest table, all at once. A table whose identity we do not have (no address
  // on file, no number on file) contributes an empty array rather than being left out, so the
  // file he downloads always has the same shape and "nothing here" is stated rather than implied.
  const rows = await Promise.all(
    USER_DATA_TABLES.map((t) => {
      const value = identities[t.keyKind];
      if (!value) return Promise.resolve([] as unknown[]);
      return get(`${t.table}?${t.userKey}=eq.${encodeURIComponent(value)}&select=${t.select}`);
    }),
  );

  const user = await get(`users?id=eq.${encodeURIComponent(userId)}&select=*`);
  const subsByPhone = phone ? await get(`subscriptions?phone=eq.${encodeURIComponent(phone)}&select=*`) : [];
  const subsByEmail = email ? await get(`subscriptions?email=eq.${encodeURIComponent(email)}&select=*`) : [];
  const seen = new Set<string>();
  const subscriptions = [...subsByPhone, ...subsByEmail].filter((s) => {
    const id = (s as { stripe_subscription_id?: string }).stripe_subscription_id || JSON.stringify(s);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  // Same two key merge as subscriptions, and it is exported for the same reason it is deleted: a
  // waitlist row is his number and his address sitting in a table he never signed into.
  const waitByPhone = phone ? await get(`waitlist?phone=eq.${encodeURIComponent(phone)}&select=*`) : [];
  const waitByEmail = email ? await get(`waitlist?email=eq.${encodeURIComponent(email)}&select=*`) : [];
  const seenWait = new Set<string>();
  const waitlist = [...waitByPhone, ...waitByEmail].filter((w) => {
    const id = (w as { id?: string }).id || JSON.stringify(w);
    if (seenWait.has(id)) return false;
    seenWait.add(id);
    return true;
  });

  // His photographs, as links rather than bytes. See the block above signedReceiptLinks.
  const receipts = await signedReceiptLinks(userId);

  const out: AccountExport = {
    exported_at: new Date().toISOString(),
    user: user[0] ?? null,
    subscriptions,
    waitlist,
    receipt_images: receipts.items,
    // 🔴 SAID IN HIS OWN FILE, not left for him to discover. A link that has quietly expired reads
    // like a product that lost his receipts, and an empty list he cannot tell from a failed read is
    // the same lie in the other direction.
    receipt_images_note: receipts.readable
      ? `Each link above works for ${EXPORT_LINK_DAYS} days from the date at the top of this file. Save the pictures somewhere of your own before then. Ask for another export whenever you like and you will get fresh links.`
      : 'We could not read your receipt pictures just now, so this list is empty because the read failed and not because you have none. Ask for the export again in a few minutes.',
  };
  USER_DATA_TABLES.forEach((t, i) => {
    out[t.table] = rows[i];
  });
  return out;
}

// Every receipt photograph he ever sent us, out of the storage bucket.
//
// ⚠️ THESE ARE NOT ROWS AND NOTHING CASCADES TO THEM. storeReceiptImage puts the bytes at
// `receipts/<user id>/<day>-<nonce>.<ext>` (see receiptStoragePath) and writes only that path onto
// the transaction. So deleting his transactions deletes the ONLY POINTER TO THE IMAGE and leaves
// the image itself in the bucket forever: unreferenced, unfindable, and impossible to erase on any
// later request because nothing left in the database remembers it was his. Until 6 August 2026
// that is exactly what an erasure did. It kept his pictures. Photographs of receipts carry his
// name, his card digits, the shops he uses and the days he was there.
//
// The user id folder is the tenancy, so the wipe is one prefix. Storage has no "delete a prefix"
// call, so it is list then delete, a page at a time, until the folder answers empty. A missing
// bucket answers 404 and that is NOT a failure: a bucket that does not exist is holding nothing
// of his. Anything else that goes wrong is a failure and the caller must not claim success.
async function deleteReceiptImages(userId: string): Promise<boolean> {
  const { url } = config();
  const prefix = `${userId}/`;
  try {
    // A counted loop rather than a while, because deletes are being made underneath the listing:
    // if a delete keeps answering ok while the objects stay put, we stop and report failure rather
    // than spinning inside a web request. 100 pages of 100 is far more than any one man's shoebox.
    for (let page = 0; page < 100; page++) {
      const listRes = await fetch(`${url}/storage/v1/object/list/${RECEIPTS_BUCKET}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
      });
      if (listRes.status === 404) return true;
      if (!listRes.ok) return false;
      const objects = (await listRes.json().catch(() => null)) as Array<{ name?: string }> | null;
      if (!Array.isArray(objects)) return false;
      // Empty folder. Either he never sent one or the previous page took the last of them.
      if (objects.length === 0) return true;
      // The listing names objects relative to the prefix, so the folder goes back on the front.
      const paths = objects
        .map((o) => `${prefix}${o?.name ?? ''}`)
        .filter((p) => p !== prefix);
      if (paths.length === 0) return false;
      const delRes = await fetch(`${url}/storage/v1/object/${RECEIPTS_BUCKET}`, {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!delRes.ok) return false;
    }
    return false;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HIS RECEIPT PHOTOGRAPHS, IN THE EXPORT. Article 15(3), 9 August 2026.
//
// The erasure has taken his pictures out of the bucket since 6 August. The EXPORT never gave him a
// copy of them, and Article 15(3) is explicit: the controller shall provide A COPY of the personal
// data undergoing processing. A photograph he took of his own receipt is his personal data, and it
// is the only thing we hold that he cannot reconstruct from his own records: the shop, the day, the
// card digits, his handwriting on the back of it.
//
// ⚠️ THE BYTES DO NOT GO IN THE FILE. An export is JSON that lands in a downloads folder, an email,
// a WhatsApp to his accountant. Base64 of a year of receipts would make it enormous and would put
// the images themselves into every copy of it forever. Signed links are the mechanism, and the
// mechanism has a decision in it: how long they live.
//
// ⚠️ SEVEN DAYS, DECIDED BY JAG ON 9 AUGUST 2026. Long enough that he can ask on a Friday and open
// it at the weekend. Short enough that an export file leaked out of a downloads folder or a
// forwarded email is stale before it is much use to anyone. The number is stated IN THE FILE, next
// to the links, because a link that has quietly expired reads to him like a product that lost his
// receipts.
//
// ⚠️ AND A FAILED LISTING IS SAID, NOT DRAWN AS "he has none". An empty array where the truth is
// "we could not look" is the oldest bug in this codebase wearing a storage bucket.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const EXPORT_LINK_DAYS = 7;

export interface ExportedReceipt {
  path: string;
  url: string | null;
  expires_at: string;
}

async function signedReceiptLinks(userId: string): Promise<{ items: ExportedReceipt[]; readable: boolean }> {
  const { url } = config();
  const prefix = `${userId}/`;
  const expiresIn = EXPORT_LINK_DAYS * 24 * 60 * 60;
  try {
    const listRes = await fetch(`${url}/storage/v1/object/list/${RECEIPTS_BUCKET}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    // A bucket that does not exist is holding nothing of his, which is a real answer and not a
    // failure. Same reading as deleteReceiptImages.
    if (listRes.status === 404) return { items: [], readable: true };
    if (!listRes.ok) return { items: [], readable: false };
    const objects = (await listRes.json().catch(() => null)) as Array<{ name?: string }> | null;
    if (!Array.isArray(objects)) return { items: [], readable: false };
    const paths = objects.map((o) => `${prefix}${o?.name ?? ''}`).filter((x) => x !== prefix);
    if (paths.length === 0) return { items: [], readable: true };

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const signRes = await fetch(`${url}/storage/v1/object/sign/${RECEIPTS_BUCKET}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ expiresIn, paths }),
    });
    if (!signRes.ok) return { items: [], readable: false };
    const signed = (await signRes.json().catch(() => null)) as Array<{ path?: string; signedURL?: string }> | null;
    if (!Array.isArray(signed)) return { items: [], readable: false };
    return {
      items: signed.map((r) => ({
        path: String(r?.path ?? ''),
        // The API returns a path relative to /storage/v1. Absolute, so the link in his file works
        // when he opens it, rather than only from inside our own origin.
        url: r?.signedURL ? `${url}/storage/v1${r.signedURL}` : null,
        expires_at: expiresAt,
      })),
      readable: true,
    };
  } catch {
    return { items: [], readable: false };
  }
}

// Right to erasure: delete every row for this user across all tables, including
// the server-only ones that do not cascade from `users`, then his receipt images
// out of the storage bucket, then the auth user.
// lib/stripe.ts has no imports of its own beyond node crypto, so this cannot be circular.
import { cancelSubscriptionNow } from './stripe';

// The live subscription id for a user, or null. Read by deleteUserData before it walks the tables,
// because the id lives in the row that walk deletes.
async function getLiveSubscriptionId(userId: string): Promise<string | null> {
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`
        + '&select=stripe_subscription_id&limit=1',
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ stripe_subscription_id?: string | null }> | null;
    const id = Array.isArray(rows) ? rows[0]?.stripe_subscription_id : null;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

export async function deleteUserData(userId: string, email: string | null): Promise<boolean> {
  const { url, key } = config();
  const phone = await getPhoneForUser(userId);
  const identities = userDataIdentities(userId, email, phone);
  // 🔴 READ BEFORE THE WALK DELETES THE ROW THAT HOLDS IT. Reading it afterwards finds nothing and
  // cancels nothing, silently, which is the same defect wearing a different coat. See the cancel
  // block further down for why an uncancelled mandate is worse than the missing erasure door was.
  const subToCancel = await getLiveSubscriptionId(userId);
  // Track whether every delete actually succeeded, so a GDPR erasure never
  // reports success while leaving financial data behind on a failed sub-delete.
  let allOk = true;
  const del = async (path: string): Promise<void> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
    // PostgREST returns 200/204 on a successful delete (even if 0 rows matched).
    if (res.ok) return;
    // ⚠️ A TABLE POSTGREST CANNOT FIND IS NOT A FAILED ERASURE. Several of these tables arrive by
    // an APPLY_*.sql the founder pastes in by hand, and wa_out is documented as not existing in
    // production until he does. A table that is not there holds no rows for anybody, so his data
    // is gone either way, and failing on it would make every single erasure report failure the
    // day the manifest gets ahead of the database. Only that one answer is forgiven; anything
    // else, including a permission refusal, is a real failure and the caller is told so.
    if (res.status === 404) {
      const body = await res.text().catch(() => '');
      if (body.includes('PGRST205') || /could not find the table/i.test(body)) return;
    }
    allOk = false;
  };
  // The manifest, in its own order: children before parents, so nothing is refused by a foreign
  // key, and everything keyed by phone or address goes before the users row that holds them.
  for (const t of USER_DATA_TABLES) {
    const value = identities[t.keyKind];
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THIS `continue` IS SAFE ONLY BECAUSE OF AN INVARIANT HELD SOMEWHERE ELSE. READ THIS
    // BEFORE YOU ADD A WAY FOR A CUSTOMER TO UNLINK HIS PHONE.
    //
    // No address on file means no address rows to delete, which is not a failure. The same is true
    // of the number, TODAY, and only today. Two tables in the manifest are keyed by phone rather
    // than by user id: support_tickets.phone, and ai_usage.key, WHICH HOLDS HIS NUMBER IN PLAIN
    // TEXT. If we reach here with no phone, both are skipped in silence and the erasure still
    // answers ok.
    //
    // That is correct right now because a phone number, once set on users, is never unset: the
    // bank has /api/bank/disconnect, the phone has no equivalent anywhere in the tree. So an
    // account with no number never had one, and there is nothing to skip.
    //
    // ⚠️ THE DAY SOMEBODY ADDS A PHONE DISCONNECT, THIS BECOMES A LIVE GDPR HOLE. His number would
    // sit in ai_usage.key through an erasure that reported success, and nothing would say so.
    // test/datarights.test.mjs walks the server tree and goes RED if any code writes a null
    // phone_number onto users, so this note cannot rot quietly: the guard fires on the commit that
    // breaks the invariant, not on the support ticket six months later.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    if (!value) continue;
    await del(`${t.table}?${t.userKey}=eq.${encodeURIComponent(value)}`);
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND THE CARD MANDATE, WHICH LIVES AT STRIPE AND NOT IN ANY OF THESE TABLES. 12 August 2026.
  //
  // The `subscriptions` row above is deleted like everything else, and until today Stripe never
  // heard about it. So a man who erased himself kept a LIVE MONTHLY CHARGE, against an account
  // that no longer existed, with no row left for the billing webhook to match it to. He asked us
  // to forget him and we went on taking his money, for ever, unexplainably.
  //
  // ⚠️ IT IS READ BEFORE THE TABLES ARE WALKED, because the id lives in the row the walk deletes.
  // Reading it afterwards finds nothing and cancels nothing, silently, which is the same bug in a
  // different coat.
  //
  // ⚠️ AND A FAILED CANCEL DOES NOT FAIL THE ERASURE. His right to be forgotten does not wait on
  // our payment provider being reachable: the data goes either way, and an uncancelled
  // subscription is visible in the Stripe dashboard where a person can finish it. Letting a
  // provider outage veto a legal right would be the worse direction by far.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  if (subToCancel) await cancelSubscriptionNow(subToCancel);

  // His photographs. Folded into allOk exactly like a table: an erasure that could not empty the
  // bucket has not erased him, and must not answer ok.
  if (!(await deleteReceiptImages(userId))) allOk = false;
  // The profile row last of the user_id keyed rows, since the others cascade from it.
  await del(`users?id=eq.${encodeURIComponent(userId)}`);
  // The two tables that answer to either identity (see AccountExport for why they are by hand).
  if (phone) {
    await del(`subscriptions?phone=eq.${encodeURIComponent(phone)}`);
    await del(`waitlist?phone=eq.${encodeURIComponent(phone)}`);
  }
  if (email) {
    await del(`subscriptions?email=eq.${encodeURIComponent(email)}`);
    await del(`waitlist?email=eq.${encodeURIComponent(email)}`);
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
  const rows = (await res.json().catch(() => null)) as (HmrcConnection[]) | null;
  if (rows === null) return null;
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
  const rows = (await res.json().catch(() => null)) as ({ fraud_client?: Record<string, unknown> | null }[]) | null;
  if (rows === null) return null;
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
  const parsed = (await res.json().catch(() => null)) as (DueReminder[]) | null;
  if (parsed === null) return [];
  return parsed;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 IS THE PROMISE BEING KEPT? Added 11 August 2026, after RUN 0 of the customer week.
//
// getDueReminders answers "what should go out now". Nothing answered "what should have gone out
// and did not", so on 10 August a man's 08:00 reminder sat unsent until 12:43 while the job that
// was supposed to send it reported perfect health every hour. See lib/cronwatch.ts, reminderAlarm.
//
// Same filter as getDueReminders on purpose. If the two ever disagree about what "due" means, this
// stops being a check on that query and becomes a second opinion nobody asked for.
//
// ⚠️ null ON ANY FAILED READ, AND NEVER AN EMPTY BACKLOG. A read that did not happen must not
// arrive at the watchdog dressed as good news.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function getReminderBacklog(nowIso: string = new Date().toISOString()): Promise<ReminderBacklog | null> {
  try {
    const { url } = config();
    const q = `${url}/rest/v1/events?select=remind_at&reminded=eq.false&remind_at=not.is.null&remind_at=lte.${encodeURIComponent(nowIso)}&order=remind_at.asc&limit=1`;
    const res = await fetch(q, {
      headers: headers({ Prefer: 'count=exact' }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as unknown;
    if (rows === null || !Array.isArray(rows)) return null;
    // PostgREST puts the exact count after the slash of content-range, e.g. "0-0/7". A row we can
    // see but a count we cannot parse falls back to what we can actually see rather than to zero.
    const total = Number((res.headers.get('content-range') || '').split('/')[1]);
    const oldest = (rows[0] as { remind_at?: string | null } | undefined)?.remind_at ?? null;
    return {
      overdue: Number.isFinite(total) ? total : rows.length,
      oldestDue: oldest,
    };
  } catch {
    return null;
  }
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
  const rows = (await res.json().catch(() => null)) as (Array<{ phone_number?: string | null }>) | null;
  if (rows === null) return null;
  return rows[0]?.phone_number ?? null;
}

export interface NudgeTarget {
  user_id: string;
  phone: string;
  daily_nudges: boolean;
  weekly_summary: boolean;
}

// ── Reaching a customer who has no phone ────────────────────────────────────────────────────────
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THESE EXIST, AND IT IS THE SAME BUG IN THREE PLACES.
//
// Every proactive path in this product was built when a customer arrived on WhatsApp, so every one
// of them starts from a phone number. listNudgeTargetsPage filters `phone_number=not.is.null`, the
// trial cron sends a template to `row.phone`, and the Sunday job sends an Expo push.
//
// Launch one is the WEB. A web customer has no proved number until he binds one, and no app, so on
// 10 August all three of those reach nobody. The Sunday job would have run every week, logged a
// cheerful finish, and delivered zero messages.
//
// lib/routing.ts has said `weekly_ready` goes to ['push','email'] and both trial rows go to
// ['whatsapp_template','email'] since 28 July. The email half was never built, so the table has
// been describing a product we do not have. These readers are what make it true.
//
// ⚠️ THE ADDRESS COMES FROM signups.user_id AND NOWHERE ELSE. That link is written only after the
// address has been proved (the 29 July takeover fix), so an email reached this way is one we know
// belongs to him. Reading signups.email by phone, which is what the old sign in door did, is the
// exact hole that was closed.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// One page of EVERY user, for the weekly notification. Deliberately NOT listNudgeTargetsPage.
//
// That function keeps its `phone_number=not.is.null` filter, because it feeds the WhatsApp nudge
// and a nudge with no number to send to is not a nudge. Reusing it here is what made the weekly
// notification phone gated in the first place: one query serving two jobs with different reach.
export async function listWeeklyTargetsPage(
  afterId: string | null,
  limit = 500,
): Promise<{ targets: Array<{ user_id: string; expo_push_token: string | null }>; last: string | null }> {
  const { url } = config();
  const cursor = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  const res = await fetch(
    `${url}/rest/v1/users?select=id,expo_push_token&order=id.asc&limit=${limit}${cursor}`,
    { headers: headers() },
  );
  if (!res.ok) return { targets: [], last: null };
  const batch = (await res.json().catch(() => null)) as (Array<{ id: string; expo_push_token: string | null }>) | null;
  if (batch === null) return { targets: [], last: null };
  if (!Array.isArray(batch)) return { targets: [], last: null };
  return {
    targets: batch.map((u) => ({ user_id: u.id, expo_push_token: u.expo_push_token ?? null })),
    last: batch.length ? batch[batch.length - 1].id : null,
  };
}

// The proved address for each of these accounts, in one round trip rather than one per man. Same
// shape as getNudgePrefsForUsers, for the same reason: a per user query inside a page loop is a
// page of round trips per page of customers.
//
// Newest signup wins where a man has more than one row, because that is the address he most
// recently proved.
export async function emailsForUsers(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  const { url } = config();
  const list = userIds.map((id) => `"${id}"`).join(',');
  const res = await fetch(
    `${url}/rest/v1/signups?user_id=in.(${encodeURIComponent(list)})` +
      `&email=not.is.null&select=user_id,email,created_at&order=created_at.asc`,
    { headers: headers() },
  );
  if (!res.ok) return out;
  const rows = (await res.json().catch(() => null)) as Array<{ user_id: string; email: string }> | null;
  if (!Array.isArray(rows)) return out;
  // Ascending, so a later row overwrites an earlier one and the newest address is what remains.
  for (const r of rows) if (r.user_id && r.email) out.set(r.user_id, r.email);
  return out;
}

// One address for one account. The trial cron works a handful of rows a day, so the batch version
// above would be ceremony.
export async function emailForUser(userId: string): Promise<string | null> {
  if (!userId) return null;
  const map = await emailsForUsers([userId]);
  return map.get(userId) ?? null;
}

// 🔴 WHO IS MID TRIAL, so the Sunday walk can leave them alone.
//
// Jag's call, 30 July: during a trial he hears from us exactly once, on day six, and that one
// message carries his week. A Sunday notification landing in the middle of that is the second
// message he was promised he would not get, and on a seven day trial it can easily be the one that
// arrives on day one with nothing in it.
//
// Only OUR trials, never a Stripe one, which is the same line decideTrialNudge draws: a man with a
// card on file is on a path Stripe is telling him about.
export async function trialingUserIds(userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (userIds.length === 0) return out;
  const { url } = config();
  const list = userIds.map((id) => `"${id}"`).join(',');
  const res = await fetch(
    `${url}/rest/v1/subscriptions?user_id=in.(${encodeURIComponent(list)})` +
      `&status=eq.trialing&select=user_id`,
    { headers: headers() },
  );
  // ⚠️ FAILS TOWARDS SILENCE. If we cannot tell who is mid trial we return an empty set, which
  // means nobody is excluded and a man in a trial might get one extra notification. The other
  // direction would be excluding everybody and sending nothing at all, and a job that goes quiet
  // because a query failed is this codebase's whole disease.
  if (!res.ok) return out;
  const rows = (await res.json().catch(() => null)) as Array<{ user_id: string | null }> | null;
  if (!Array.isArray(rows)) return out;
  for (const r of rows) if (r.user_id) out.add(r.user_id);
  return out;
}

// One page of nudge targets, keyset ordered by user id, for the resumable cron
// fan out. At 20,000 users one function invocation cannot send everything inside
// its duration limit, so the cron processes pages and hands the cursor to a
// continuation invocation. Prefs are fetched once per invocation by the caller.
export async function listNudgeTargetsPage(
  afterId: string | null,
  limit = 500,
): Promise<{ targets: Array<{ user_id: string; phone: string; expo_push_token: string | null }>; last: string | null }> {
  const { url } = config();
  const cursor = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  // expo_push_token joined the select on 27 July 2026, when the weekly summary stopped being a paid
  // WhatsApp template and became a free push saying the numbers are ready. Same read, one more
  // column, no extra round trip.
  const res = await fetch(
    `${url}/rest/v1/users?select=id,phone_number,expo_push_token&phone_number=not.is.null&order=id.asc&limit=${limit}${cursor}`,
    { headers: headers() },
  );
  if (!res.ok) return { targets: [], last: null };
  const batch = (await res.json().catch(() => null)) as (Array<{ id: string; phone_number: string; expo_push_token: string | null }>) | null;
  if (batch === null) return { targets: [], last: null };
  return {
    targets: batch.map((u) => ({ user_id: u.id, phone: u.phone_number, expo_push_token: u.expo_push_token ?? null })),
    last: batch.length === limit ? batch[batch.length - 1].id : null,
  };
}

// Everyone's reminder preferences in one read. One row exists only for users who
// changed the defaults, so this stays small even at 20,000 users.
export async function listAllNudgePrefs(): Promise<Map<string, { daily_nudges: boolean; weekly_summary: boolean }>> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/reminder_prefs?select=user_id,daily_nudges,weekly_summary&limit=100000`, { headers: headers() });
  if (!res.ok) return new Map();
  const prefs = (await res.json().catch(() => null)) as (Array<{ user_id: string; daily_nudges: boolean; weekly_summary: boolean }>) | null;
  if (prefs === null) return new Map();
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
  const prefs = (await res.json().catch(() => null)) as (Array<{ user_id: string; daily_nudges: boolean; weekly_summary: boolean }>) | null;
  if (prefs === null) return new Map();
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

// The facts lib/weeklyupdate.ts's personalLine() needs, for THE PAGE WE ARE ABOUT TO SEND TO.
// Same shape and the same reason as weeklyTotalsFor just above: one round trip for the whole
// page via the weekly_update_facts_for RPC (supabase/APPLY_2026-07-27_weekly_update_facts.sql),
// never one query per user.
//
// null means the RPC is not applied yet (or the call failed), and the caller must fall back to
// sending the plain totals only, exactly as it did before this card existed. An empty map would
// wrongly read as "these users have no facts", which is not the same thing as "we don't know".
export interface WeeklyUpdateFactsRow {
  user_id: string;
  rolling12mTaxableTurnover: number | null; // null: RPC says not enough account history yet
  vatRegistered: boolean;
  ytdGrossQualifyingIncome: number | null;
}
export async function weeklyUpdateFactsFor(userIds: string[]): Promise<Map<string, WeeklyUpdateFactsRow> | null> {
  if (userIds.length === 0) return new Map();
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/weekly_update_facts_for`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_user_ids: userIds.filter((i) => UUID.test(i)) }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{
      user_id: string;
      rolling12m_taxable_turnover: number | string | null;
      vat_registered: boolean | null;
      ytd_gross_qualifying_income: number | string | null;
    }>;
    if (!Array.isArray(rows)) return null;
    const out = new Map<string, WeeklyUpdateFactsRow>();
    for (const r of rows) {
      const turnover = r.rolling12m_taxable_turnover;
      const gross = r.ytd_gross_qualifying_income;
      out.set(r.user_id, {
        user_id: r.user_id,
        rolling12mTaxableTurnover: turnover === null || turnover === undefined ? null : Number(turnover) || 0,
        vatRegistered: Boolean(r.vat_registered),
        ytdGrossQualifyingIncome: gross === null || gross === undefined ? null : Number(gross) || 0,
      });
    }
    return out;
  } catch {
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE MAN'S ROLLING TWELVE MONTH TAXABLE TURNOVER, FROM THE SAME PLACE THE WEEKLY GETS IT.
//
// /app/tax/vat used to answer the threshold question from getOutputVat, which sums his INVOICES.
// lib/weeklyupdate.ts and lib/agent.ts answer it from his CONFIRMED TRADE INCOME. Those are
// different numbers for anyone who takes money without invoicing it here, and the invoice one is
// the smaller, which is the direction that tells a man he is under a line he has crossed.
//
// So the screen now asks the RPC the weekly asks, with one user id instead of a page of them, and
// the two agree to the penny by construction rather than by intention.
//
// ⚠️ THREE ANSWERS, NOT A NUMBER AND A NULL. The RPC itself returns null for an account younger
// than three months, which means "we do not have twelve months of you yet" and is a completely
// different thing from "we could not read it". Collapsing them would put one of this codebase's
// oldest bugs back: a failed read drawn as a fact.
// ═════════════════════════════════════════════════════════════════════════════════════════
export type TaxableTurnover =
  | { kind: 'known'; rolling12m: number }
  | { kind: 'tooNew' }
  | { kind: 'unreadable' };

export async function taxableTurnoverFor(userId: string): Promise<TaxableTurnover> {
  const facts = await weeklyUpdateFactsFor([userId]).catch(() => null);
  if (facts === null) return { kind: 'unreadable' };
  const row = facts.get(userId);
  // No row at all is not "he has none": the RPC returns one row per id it was given, so a missing
  // row means it did not answer for him, which we do not know how to interpret.
  if (!row) return { kind: 'unreadable' };
  if (row.rolling12mTaxableTurnover === null) return { kind: 'tooNew' };
  return { kind: 'known', rolling12m: row.rolling12mTaxableTurnover };
}

// HIS WEEK, AS ROWS. One query, read two ways.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE SENTENCE AND THE CHART COME FROM HERE, TOGETHER, AND THAT IS THE WHOLE REASON THIS
// FUNCTION EXISTS.
//
// The Overview says "£1,200 in, £400 out" in words and draws the same seven days as bars beside it.
// Fetching those separately would be two readers over one number, which this file has already been
// caught doing three times in a single day (the signups count, the knowledge count, the review
// queue). So there is one query, and lib/weekchart.ts buckets it. The totals are summed from the
// same buckets the bars are drawn from.
//
// ⚠️ NULL MEANS WE COULD NOT READ IT, AND IT IS NOT THE SAME AS A QUIET WEEK.
//
// weeklyTotals below still answers zero on a failed read, because the Sunday job and the WhatsApp
// reply have always behaved that way and this is not the change that should move them. A screen can
// do better: the Overview tells him plainly that we could not read his week rather than printing
// "£0 in, £0 out" over a database timeout, which is a lie with his own money in it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 IT ASKS ON transaction_date, THE DAY THE MONEY MOVED, NOT created_at, THE DAY WE HEARD ABOUT IT.
//
// Found on the deployed site by correcting one row and watching the wrong number move: marking a
// payment dated 11 MAY as not business took "your week" down by the same amount. As a sentence that
// was ambiguous; as a bar chart it means a bank feed backfilling ninety days draws three months of
// spending as one enormous bar on the afternoon he connected it.
//
// It is also simpler: transaction_date is a plain calendar date, so the window is a plain date
// comparison with no daylight saving arithmetic anywhere near a query.
export async function weekRows(userId: string): Promise<WeekRow[] | null> {
  const { url } = config();
  const from = windowStart(new Date());
  if (!from) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}`
        + '&confirmed=eq.true&is_personal=eq.false'
        + `&transaction_date=gte.${from}`
        + '&select=amount,transaction_date&order=transaction_date.asc&limit=5000',
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ amount: number; transaction_date: string }>;
    return rows.map((r) => ({ amount: Number(r.amount) || 0, date: r.transaction_date }));
  } catch {
    return null;
  }
}

// ⚠️ THIS NOW MEANS TODAY AND THE SIX DAYS BEFORE IT, WHERE IT USED TO MEAN THE LAST 168 HOURS.
//
// The old window started at whatever time of day the question happened to be asked, so the oldest
// day in it was always a part day. That was invisible while the answer was one sentence and becomes
// visible the moment it is drawn as bars: a Thursday holding Thursday evening only, the same width
// as a whole day beside it. Seven whole days is what a person means by the word, and it is the only
// window the chart can draw honestly.
//
// The figure it returns moves slightly as a result, on the weekly summary and on the WhatsApp reply.
// It moves in the direction of being a week.
export async function weeklyTotals(userId: string): Promise<{ income: number; expenses: number }> {
  const rows = await weekRows(userId);
  // A failed read stays a quiet zero here, exactly as it always has. Changing that would change
  // what the Sunday job does on a bad night, which is a decision of its own and not this one.
  return weekTotals(rows ?? [], new Date());
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
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE WINDOW THAT WAS HANDED OVER AS THE WHOLE BOOK. Found 11 August 2026, RUN 1.
//
// This reads the newest 60 rows, and until today it handed them to the model under the heading
// "Their own figures" with nothing to say that 60 was a limit. So a customer with 401 confirmed
// rows going back to August 2025 asked a question and was told, in the product's own words:
//
//     "I can see your books from July and August 2026."
//
// The model was not lying and it was not hallucinating. It was accurately describing the only
// thing it had been given: sixty rows, newest first, which on a working account is about six
// weeks. Three hundred and forty one rows were amputated silently and the stump was labelled as
// the whole. A man who is told his own product cannot see the year he has just spent logging
// stops believing every other number on the screen, and he is right to.
//
// ⚠️ THE FIX IS NOT A BIGGER LIMIT. There is always an account one row past whatever the limit
// becomes, and the failure at 600 would be identical and harder to spot. The fix is that the
// window DECLARES ITSELF: how many rows exist, what range they cover, and how many of them are in
// front of the model. The prompt then tells it to answer about the window and to say plainly that
// a total is not something it can add up from a sample.
//
// A count costs nothing: PostgREST returns it in the Content-Range header for the price of one
// extra header on a request we were making anyway.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function transactionSummaryForUser(userId: string, limit = 60): Promise<string> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&is_personal=eq.false&select=amount,category,vendor,transaction_date,confirmed&order=transaction_date.desc&limit=${limit}`,
    // count=exact makes PostgREST report the TOTAL matching rows in Content-Range, not just the
    // page. Prefer is additive, so nothing about the body changes.
    { headers: headers({ Prefer: 'count=exact' }) },
  );
  if (!res.ok) return '';
  const rows = (await res.json().catch(() => null)) as Array<{
    amount: number;
    category: string | null;
    vendor: string | null;
    transaction_date: string | null;
    confirmed: boolean | null;
  }> | null;
  if (rows === null) return '';
  if (rows.length === 0) return '';

  // "0-59/401". A server that does not send it, or sends a * for the total, leaves this null and
  // the sentence below simply says less. An unreadable count is never invented.
  const range = res.headers.get('content-range') ?? '';
  const totalRaw = range.includes('/') ? range.split('/')[1] : '';
  const total = /^\d+$/.test(totalRaw) ? Number(totalRaw) : null;

  const lines = rows.map((r) => {
    const amt = Number(r.amount) || 0;
    const dir = amt >= 0 ? 'income' : 'expense';
    const date = (r.transaction_date ?? '').slice(0, 10);
    const tag = r.confirmed ? '' : ' (to review)';
    return `${date} ${dir} £${Math.abs(amt).toFixed(2)} ${r.category ?? ''} ${r.vendor ?? ''}${tag}`.trim();
  });

  // Rows come back newest first, so the oldest in the window is the last one.
  const newest = (rows[0]?.transaction_date ?? '').slice(0, 10);
  const oldest = (rows[rows.length - 1]?.transaction_date ?? '').slice(0, 10);

  // ⚠️ THE HEADING IS PART OF THE DATA. It goes in the same string rather than in the prompt,
  // because there are three callers on two channels and a sentence that lives in one of them is a
  // sentence the other two are missing.
  const truncated = total !== null && total > rows.length;
  const header = truncated
    ? `THIS IS A WINDOW, NOT HIS WHOLE BOOK. He has ${total} entries in total. The ${rows.length} newest are below, covering ${oldest} to ${newest}. The other ${total - rows.length} are older and you CANNOT see them. Never tell him this is everything you have, never describe the range below as the range of his books, and never add these up into a total for a period: the totals are computed elsewhere and given to you separately when they are needed.`
    : `His entries, ${rows.length} of them, covering ${oldest} to ${newest}. This is all of them.`;

  return `${header}\n${lines.join('\n')}`;
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
  // 🔴 WHAT HE SAID THIS PURCHASE WAS, IF HE WAS EVER ASKED. Null means nobody asked, which is
  // every row written before 2 August 2026 and every payment under lib/capital.ts
  // CAPITAL_QUESTION_FROM. A null row is an ordinary cost and behaves exactly as it always has;
  // nothing is reinterpreted retrospectively. See supabase/APPLY_2026-08-02_capital_kind.sql.
  capital_kind: string | null;
  business_use_pct: number | null;
  // 🔴 THE ANSWER, NOT THE QUESTION. capital_kind above is what he SAID; this is what it MEANS for
  // his costs, decided once by isWrittenDown() in lib/capital.ts. It is required rather than
  // optional so tsc names the mapper below if anyone ever adds a second reader: a row that reaches
  // lib/quarterpack.ts without it is a £60,000 car counted as a running cost, which is the exact
  // defect this field exists to close.
  writtenDown: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// EVERY VEHICLE HE HAS EVER TOLD US ABOUT, WHATEVER YEAR HE BOUGHT IT IN.
//
// 🔴 WHY THIS IS NOT PART OF getConfirmedTransactionsForRange. That reader is scoped to the
// CURRENT tax year, which is right for income and costs and wrong for exactly one thing: a car
// bought in April 2026 still earns a writing down allowance in 2027, 2028 and every year after
// until he sells it. lib/capital.ts printed "The rest is not lost. It keeps coming, a bit smaller
// each year" and the product then produced nothing at all from year two, because the purchase row
// had fallen out of range.
//
// ⚠️ NO POOLS TABLE, AND THAT IS DELIBERATE. A single asset pool holds one thing and its balance
// is a pure function of the price and the number of years gone by, so the purchase row IS the
// asset. A pools table would be a second copy of a number this row already carries, and the two
// would disagree the first time somebody edited one.
//
// Confirmed, not personal, money out, and only rows he has actually answered the question on.
// A null capital_kind means nobody asked him, and an unanswered row is an ordinary cost.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface CapitalAsset {
  amount: number;            // as stored, negative for money out
  transaction_date: string;  // YYYY-MM-DD
  capital_kind: string;
  business_use_pct: number | null;
}

export async function getCapitalAssets(userId: string): Promise<CapitalAsset[]> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
        `&confirmed=eq.true&is_personal=eq.false&amount=lt.0&capital_kind=not.is.null` +
        `&select=amount,transaction_date,capital_kind,business_use_pct` +
        `&order=transaction_date.asc&limit=500`,
      { headers: headers() },
    );
    // ⚠️ AN EMPTY LIST ON FAILURE, WHICH UNDERSTATES HIM. That is the safe direction here and the
    // only one available: a missing column (the migration not run) and a genuine outage look the
    // same from here, and inventing an allowance for a car we cannot see would be worse than
    // losing one he can ask about.
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    return rows
      .filter((r) => typeof r.transaction_date === 'string' && typeof r.capital_kind === 'string')
      .map((r) => ({
        amount: Number(r.amount) || 0,
        transaction_date: (r.transaction_date as string).slice(0, 10),
        capital_kind: r.capital_kind as string,
        business_use_pct: r.business_use_pct == null ? null : Number(r.business_use_pct),
      }));
  } catch {
    return [];
  }
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
      `&select=amount,category,vendor,transaction_date,cis_deduction,income_type,capital_kind,business_use_pct` +
      `&order=transaction_date.asc&limit=20000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => null)) as (Array<Record<string, unknown>>) | null;
  if (rows === null) return [];
  return rows
    .filter((r) => typeof r.transaction_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.transaction_date as string))
    .map((r) => ({
      amount: Number(r.amount) || 0,
      category: (r.category as string | null) ?? null,
      vendor: (r.vendor as string | null) ?? null,
      transaction_date: (r.transaction_date as string).slice(0, 10),
      cis_deduction: r.cis_deduction == null ? null : Number(r.cis_deduction),
      income_type: (r.income_type as string | null) ?? null,
      capital_kind: (r.capital_kind as string | null) ?? null,
      business_use_pct: r.business_use_pct == null ? null : Number(r.business_use_pct),
      writtenDown: isWrittenDown(r.capital_kind),
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
  const rows = (await res.json().catch(() => null)) as (Array<{ name?: string | null; business_name?: string | null }>) | null;
  if (rows === null) return null;
  return rows[0]?.business_name || rows[0]?.name || null;
}

// Assemble the tax optimiser's input from the user's confirmed data and profile
// for the current tax year. Trade stream only (the optimiser's levers are trade
// side); home-office and mileage are inferred from the categories they have used.
// 🔴 THE ROW PREDICATES AND THE ROW LOOP LIVE IN lib/yeartodate.ts NOW. Pure, so the guard
// suite (test/moneyspine.test.mjs) can drive the exact function production runs. Re-exported here
// so every existing caller keeps its import.
export { isMileageRow, isHomeOfficeRow, sumCapitalAllowances, aggregateConfirmedRows } from './yeartodate';

// The same figure getOptimiserInput uses, for the surfaces built from raw transactions (the tax
// summary and the lender documents) that hold rows but never ran the optimiser.
export async function capitalAllowanceForYear(userId: string, startYear: number): Promise<number> {
  const assets = await getCapitalAssets(userId);
  return sumCapitalAllowancesYtd(assets, startYear);
}

export async function getOptimiserInput(userId: string): Promise<OptimiserInput> {
  const now = new Date();
  const { startYear } = quarterForDate(now);
  const taxYearStart = quarterBounds(startYear, 1).start;
  const todayISO = now.toISOString().slice(0, 10);

  const [rows, sl, goals, biz, assets] = await Promise.all([
    getConfirmedTransactionsForRange(userId, taxYearStart, todayISO),
    getStudentLoanSettings(userId),
    getActiveGoals(userId),
    getBusinessProfile(userId),
    // Every year, not just this one. See getCapitalAssets: a car bought two Aprils ago is still
    // earning an allowance and its purchase row is nowhere near the current year's range.
    getCapitalAssets(userId),
  ]);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE ROW SUM IS lib/yeartodate.ts NOW, AND THE GUARD SUITE DRIVES THE SAME CODE.
  //
  // Three times in five days a tax rule reached taxPosition and missed a document (the £60,000
  // car, the Section 24 interest, the car's allowance). Each time the drift began here, in a row
  // loop only this function could see. The loop is now the exported, pure aggregateConfirmedRows,
  // and test/moneyspine.test.mjs feeds that same function seeded random accounts and requires
  // taxPosition, the quarter pack and both lender documents to agree to the penny, so a rule
  // added to the aggregation is seen by the guard the moment it changes one figure, with no
  // fixture for anybody to remember to update.
  //
  // 🔴 A PARTNERSHIP SHARES ONE SET OF BOOKS. The app sees the WHOLE partnership's income and
  // expenses (the shared account), but this man is taxed only on HIS SLICE of the profit. GOV.UK,
  // /set-up-business-partnership: "each partner pays tax on their share." So his trade figures are
  // scaled by his share BEFORE any tax is worked out, inside the aggregation. It is 100% for a
  // sole trader and a director, so nothing moves for them.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const partnerFactor = biz && biz.businessType === 'partnership' ? biz.partnershipShare / 100 : 1;
  const {
    ytdTradeIncome, ytdTradeExpenses, ytdCisSuffered, ytdPropertyIncome, ytdPropertyExpenses,
    ytdPropertyFinance, ytdMileage, ytdHomeOfficeLogged, ytdCapitalAllowances,
    categoriesLogged, vehicleBoughtThroughBooks,
  } = aggregateRowsYtd(rows, assets, startYear, partnerFactor);

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE WINDOW IS HOW LONG WE HAVE BEEN WATCHING, NOT HOW LONG THE TAX YEAR HAS BEEN RUNNING.
  // 9 August 2026, found by an empty state audit on the eve of launch.
  //
  // Both of these were measured from 6 April. On a product launching in August that means every
  // brand new account arrives already reading "125 days elapsed, 4 months in", so EVERY GUARD BUILT
  // TO STOP A CONFIDENT NUMBER COMING OUT OF THIN DATA WAS ALREADY OPEN BEFORE HIS FIRST ENTRY.
  //
  // What that did, concretely. A man signs up today, logs one £300 job, and:
  //
  //   his real rate      £300 over 1 day
  //   what we printed    £300 x (365 / 125) = £876 for the year
  //
  // Not a small error and not in the safe direction either way. The FIGURE is 15x under his actual
  // run rate, and the ADVICE built on it is worse than the figure: at £876 projected,
  // marriageAllowance() decides he is on course to earn under the personal allowance and
  // /app/tax/ways-to-save invites him to give away part of it. lib/ledger.ts's ENOUGH_MONTHS gate
  // reads the same field, so "Lekhio has kept £X out of the taxman's hands" also unlocked on day
  // one, which its own comment exists to prevent: "two weeks in, a man has logged one receipt and
  // the ledger would proudly report that Lekhio has saved him £14. He would laugh at us."
  //
  // And the product argued with itself about it. /app/tax/vat told the same man, on the same
  // evening, that his account was under three months old and "a rolling twelve month figure built
  // out of a few weeks would be a number you could act on and should not", because THAT gate is on
  // users.created_at (APPLY_2026-07-27_weekly_update_facts.sql). Two definitions of enough history,
  // one screen apart.
  //
  // 🔴 THE FIX IS THE EARLIEST ROW HE HAS GIVEN US, NOT users.created_at, and that is deliberate.
  //
  // The account date is the obvious answer and it is wrong for the man who joins in August and
  // imports his statements back to April. His figures DO cover the year, so dividing them by a
  // fortnight would over project him just as badly in the other direction. What we can honestly
  // annualise is the span our evidence actually covers, and the rows in hand say what that is.
  // Nothing extra is read, so this adds no failure mode of its own.
  //
  //   established account, rows from April  -> observedFrom = 6 April.  Nothing changes.
  //   joined in August, imported to April   -> observedFrom = 6 April.  Nothing changes, correctly.
  //   joined in August, one job this week   -> observedFrom = that day. Projection WITHHELD.
  //
  // ⚠️ THE EARLIEST ROW OF ANY KIND, income or cost. A man whose only April row is an expense and
  // whose income starts in August still gets the wide window, and his income is under projected for
  // as long as that stays true. That is the safe direction (it never invents money he has not
  // earned) and splitting the window per stream would give the two halves of one document two
  // different years, which is worse than a conservative number.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const yearStart = new Date(`${taxYearStart}T00:00:00Z`);
  const earliestRow = rows.reduce<string | null>(
    (min, r) => (r.transaction_date && (min === null || r.transaction_date < min) ? r.transaction_date : min),
    null,
  );
  const earliestSeen = earliestRow ? new Date(`${earliestRow}T00:00:00Z`) : null;
  // Never earlier than the tax year start: a row dated before 6 April is out of this year's window
  // and must not widen it. Never later than today either, so a mistyped future date cannot shrink
  // the window to nothing and silently switch a real customer's projection off.
  const start = earliestSeen && earliestSeen.getTime() > yearStart.getTime() && earliestSeen.getTime() <= now.getTime()
    ? earliestSeen
    : yearStart;

  const monthsElapsed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (30.44 * 86400000)));

  // 🔴 DAYS, AND IT IS THE DIVISOR. monthsElapsed above is floor(days / 30.44) and is now ONLY the
  // confidence gate. Dividing real days of money by whole months over-stated the set aside by 51%
  // on 2 August 2026 and made it fall by a third overnight at each month tick. See
  // projectionFactor() in lib/taxoptimiser.ts, which is the one place that turns this into a rate.
  const daysElapsed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));

  // The use of home election for THIS tax year. Best effort: a read that fails is logged and treated
  // as no election, so the optimiser keeps reminding him rather than silently dropping a claim.
  const election = await readAllowanceElection(userId, 'use_of_home', startYear).catch((e) => {
    console.error('[optimiser] could not read the use of home election:', e instanceof Error ? e.message : 'unknown');
    return null;
  });

  // 🔴 THE TRADING ALLOWANCE ELECTION, READ THE SAME WAY AND FAILING THE SAME DIRECTION.
  //
  // A failed read is treated as NOT ELECTED, and that is the safe direction here even though it is
  // the opposite of the safe direction for use of home. Use of home only ever ADDS a deduction, so
  // losing it costs him money. The trading allowance REPLACES his real costs, so wrongly believing
  // he elected it would throw away every expense he logged and hand him a £1,000 flat figure he
  // never asked for. Failing to "not elected" leaves his own numbers exactly as he entered them,
  // which is the state he can see and check.
  const tradingElection = await readAllowanceElection(userId, 'trading_allowance', startYear).catch((e) => {
    console.error('[optimiser] could not read the trading allowance election:', e instanceof Error ? e.message : 'unknown');
    return null;
  });
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
    daysElapsed,
    ytdTradeIncome: Math.round(ytdTradeIncome * 100) / 100,
    ytdTradeExpenses: Math.round(ytdTradeExpenses * 100) / 100,
    ytdCapitalAllowances: Math.round(ytdCapitalAllowances * 100) / 100,
    vehicleBoughtThroughBooks,
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
    // ✅ THE GAP IS CLOSED (27 July 2026). This used to read: homeOfficeClaimed is STILL ALWAYS
    // FALSE, a known gap, because taxoptimiser rule 4 emitted 'apply_allowance_election' and nothing
    // implemented it. There is now an election (lib/elections.ts, public.allowance_elections), so a
    // man can say yes and this reflects whether he has.
    //
    // ⚠️ IT IS THE ELECTION, NOT A CATEGORY, and the old fallback is deliberately gone. It read
    // `categoriesLogged.some((c) => c.includes('home'))`, which could only ever be true if somebody
    // created a 'home' expense category, and lib/categories.ts refuses to create one ON PURPOSE: a
    // rule on rent or a household energy bill would sweep up a man's OWN HOUSE and claim tax relief
    // on it. So the old test could never fire, and if it ever had, it would have fired on the one
    // thing we must never claim.
    //
    // A FAILED READ IS NOT "HE DID NOT ELECT". readAllowanceElection throws rather than returning
    // null on a bad read, and this catch turns it into a logged null. That is the safe direction:
    // he keeps being reminded about a deduction he has already taken, which is a nuisance, rather
    // than silently losing a deduction he elected, which is money.
    homeOfficeClaimed: !!election,
    tradingAllowanceElected: !!tradingElection,
    ytdHomeOffice: election ? useOfHomeToDate(election.hoursBand as 25 | 51 | 101, monthsElapsed) : 0,
    mileageClaimed: ytdMileage > 0,
    ytdMileage: Math.round(ytdMileage * 100) / 100,
    // 🔴 THE OTHER HALF OF THE HOME WORKING FIX. ytdHomeOffice above is what he ELECTED. This is
    // what he TEXTED, and it is already inside ytdTradeExpenses. lib/ledger.ts and
    // lib/taxoptimiser.ts both slice it out before applying the election, so the deduction lands
    // once whichever door he came through, and never twice if he came through both.
    ytdHomeOfficeLogged: Math.round(ytdHomeOfficeLogged * 100) / 100,
    purchaseGoal: purchase ? { title: purchase.title, amount: purchase.amount } : null,
    ytdPropertyIncome: Math.round(ytdPropertyIncome * 100) / 100,
    ytdPropertyExpenses: Math.round(ytdPropertyExpenses * 100) / 100,
    ytdPropertyFinance: Math.round(ytdPropertyFinance * 100) / 100,

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

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // 🔴 WHO HE IS, SO THE OPTIMISER STOPS OFFERING RELIEFS HE CANNOT TAKE. Wave nine, 31 July.
    //
    // lib/taxoptimiser.ts had NO structure awareness at all: grep it for businessType and you got
    // nothing. So it offered "Claim use of home" with a pounds figure to a limited company
    // director, and the flat rate is a SIMPLIFIED EXPENSE under ITTOIA 2005 s94H, which BIM75010
    // limits to individuals and to partnerships of individuals. A company cannot have it at any
    // number of hours, and a property business claims a proportion of its actual costs instead
    // (PIM2220).
    //
    // Both are read from the profile this function ALREADY fetched, so it costs no extra request,
    // and both fall back to null, which every gate downstream treats as unknown, which behaves
    // exactly as it did before. `biz` is the single reader, for the same reason the marriage note
    // above gives: two readers over the same fact drift, and the one that drifts is the one he is
    // looking at.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    businessType: biz?.businessType ?? null,
    incomeShape: biz?.incomeShape ?? null,
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
  const rows = (await res.json().catch(() => null)) as (Array<{ autonomy_level?: string | null }>) | null;
  if (rows === null) return 'suggest';
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
    const rows = (await res.json().catch(() => null)) as Array<{ referral_code?: string | null }> | null;
    const existing = rows?.[0]?.referral_code;
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
  const rows = (await invRes.json().catch(() => null)) as Array<{
    user_id: string;
    number: string;
    customer_name: string;
    total: number;
    status: string;
  }> | null;
  if (rows === null || rows.length === 0) return;
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
  const rows = (await res.json().catch(() => null)) as (LastEntry[]) | null;
  if (rows === null) return null;
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
  // What he told us the account is FOR, chosen at connect. Null means we never asked, which is
  // every connection made before 28 July 2026. readAccountUse() in lib/reviewpile.ts reads null
  // as 'mixed', so those keep behaving exactly as they did.
  account_use: string | null;
}

export async function createBankConnection(
  userId: string,
  reference: string,
  historyFrom?: string | null,
  // What he said the account is for. Null is allowed and means nobody asked, which is every
  // connection made before 28 July 2026. See supabase/APPLY_2026-07-28_account_use.sql.
  accountUse?: 'business' | 'personal' | 'mixed' | null,
): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/bank_connections`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      user_id: userId, reference, status: 'created',
      history_from: historyFrom ?? null,
      account_use: accountUse ?? null,
    }),
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
  const rows = (await res.json().catch(() => null)) as (BankConnection[]) | null;
  if (rows === null) return null;
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
  const parsed = (await res.json().catch(() => null)) as (Array<{ id: string; status: string; created_at?: string; bank_name?: string | null; last_synced_date: string | null }>) | null;
  if (parsed === null) return [];
  return parsed;
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
  const rows = (await res.json().catch(() => null)) as (BankConnection[]) | null;
  if (rows === null) return [];
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
  const parsed = await res.json().catch(() => null);
  if (parsed === null) return [];
  return parsed;
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

// Which of these external ids does this account already hold? The statement import asks before
// it writes, so the result screen can say "22 were already in your books" as a counted fact
// rather than an inference, and a re uploaded statement writes nothing at all instead of
// posting three hundred rows for the database to shrug at.
//
// Null on any failure, never an empty set: an empty set means "none of these exist", which
// would make the caller re insert everything. That is safe (the on_conflict rule absorbs it)
// but the caller deserves to know its counts are now derived rather than observed.
export async function knownExternalIds(userId: string, ids: string[]): Promise<Set<string> | null> {
  const clean = ids.filter(Boolean);
  if (clean.length === 0) return new Set();
  try {
    const { url } = config();
    const found = new Set<string>();
    // Chunked: a year of statement lines in one in.() list would be a URL nobody should send.
    const CHUNK = 100;
    for (let i = 0; i < clean.length; i += CHUNK) {
      const inList = clean.slice(i, i + CHUNK).map((v) => `"${v.replace(/"/g, '')}"`).join(',');
      const res = await fetch(
        `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
          `&external_id=in.(${encodeURIComponent(inList)})&select=external_id`,
        { headers: headers() },
      );
      if (!res.ok) return null;
      const rows = (await res.json().catch(() => null)) as Array<{ external_id: string }> | null;
      if (!Array.isArray(rows)) return null;
      for (const r of rows) if (r.external_id) found.add(r.external_id);
    }
    return found;
  } catch {
    return null;
  }
}

// --- Invoices (read for the public invoice page, server side only) ---------

export interface InvoiceLine {
  description: string;
  amount: number;
  // The VAT rate key for this line, from lib/vat.ts. Absent on every invoice raised before
  // 1 August 2026, and absent is not 'standard': it means the invoice was written when the product
  // had no VAT at all, and it has to keep printing exactly as it printed on the day he sent it.
  rate?: string;
}

export interface PublicInvoice {
  number: string;
  customer_name: string;
  customer_contact: string | null;
  line_items: InvoiceLine[];
  // Before VAT. Written since the table was created and, until now, selected by nothing.
  subtotal: number;
  // VAT actually charged. Zero under the reverse charge, and that is the point of it.
  tax: number;
  total: number;
  // 🔴 The VAT the CUSTOMER must account for. It goes on the document and is deliberately NOT in
  // total. VATREVCON37100: it "should not be included in the amount shown as total VAT charged".
  reverse_charge_vat: number;
  // null on every invoice that predates VAT support. Render those exactly as they were sent.
  vat_treatment: 'none' | 'charged' | 'reverse_charge' | null;
  tax_point: string | null;
  status: string;
  notes: string | null;
  issued_date: string | null;
  due_date: string | null;
  business_name: string | null;
  business_contact: string | null;
  // A VAT invoice must carry the supplier's address and VAT number. users.address has existed all
  // along and no invoice surface has ever selected it, so every invoice we have ever produced was
  // short of a field the law asks for. VAT Regulations 1995 reg 14.
  business_address: string | null;
  business_vrn: string | null;
}

// Fetch one invoice plus the trader's business details. Uses the service role,
// so the page renders for anyone with the link without exposing the whole table.
export async function getPublicInvoice(id: string): Promise<PublicInvoice | null> {
  const { url } = config();

  const invRes = await fetch(
    `${url}/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&select=number,customer_name,customer_contact,line_items,subtotal,tax,total,reverse_charge_vat,vat_treatment,tax_point,status,notes,issued_date,due_date,user_id&limit=1`,
    { headers: headers() },
  );
  if (!invRes.ok) return null;
  const rows = (await invRes.json().catch(() => null)) as Array<Record<string, unknown>> | null;
  if (rows === null || rows.length === 0) return null;
  const inv = rows[0];

  let businessName: string | null = null;
  let businessContact: string | null = null;
  let businessAddress: string | null = null;
  let businessVrn: string | null = null;
  const userId = inv.user_id as string | undefined;
  if (userId) {
    const userRes = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=name,business_name,phone_number,address&limit=1`,
      { headers: headers() },
    );
    if (userRes.ok) {
      const urows = (await userRes.json().catch(() => null)) as Array<{ name?: string; business_name?: string; phone_number?: string; address?: string }> | null;
      if (urows !== null && urows.length > 0) {
        businessName = urows[0].business_name || urows[0].name || null;
        // Do not expose the trader's personal mobile on a shareable public link. His ADDRESS is a
        // different matter: a VAT invoice must carry it, and it is his business address, printed on
        // every invoice a supplier in this country has ever sent.
        businessContact = null;
        businessAddress = urows[0].address || null;
      }
    }
    // The number only, and only when he has one. A failed read leaves it null, so the invoice
    // prints without it rather than printing a stale one.
    const vatRes = await fetch(
      `${url}/rest/v1/vat_profiles?user_id=eq.${encodeURIComponent(userId)}&select=vrn,registered&limit=1`,
      { headers: headers() },
    ).catch(() => null);
    if (vatRes && vatRes.ok) {
      const vrows = (await vatRes.json().catch(() => null)) as Array<{ vrn?: string; registered?: boolean }> | null;
      const v = Array.isArray(vrows) ? vrows[0] : null;
      if (v && v.registered && v.vrn) businessVrn = String(v.vrn);
    }
  }

  const lineItems = Array.isArray(inv.line_items) ? (inv.line_items as InvoiceLine[]) : [];

  return {
    number: (inv.number as string) ?? '',
    customer_name: (inv.customer_name as string) ?? '',
    // Keep the customer's own contact details off the public, shareable link.
    customer_contact: null,
    line_items: lineItems,
    subtotal: Number(inv.subtotal) || 0,
    tax: Number(inv.tax) || 0,
    total: Number(inv.total) || 0,
    reverse_charge_vat: Number(inv.reverse_charge_vat) || 0,
    vat_treatment: (inv.vat_treatment as PublicInvoice['vat_treatment']) ?? null,
    tax_point: (inv.tax_point as string) ?? null,
    status: (inv.status as string) ?? 'draft',
    notes: (inv.notes as string) ?? null,
    issued_date: (inv.issued_date as string) ?? null,
    due_date: (inv.due_date as string) ?? null,
    business_name: businessName,
    business_contact: businessContact,
    business_address: businessAddress,
    business_vrn: businessVrn,
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

// 🔴 THE WHOLE-PERSON INCOME PICTURE, SETTABLE FROM THE WEB AT LAST. The student loan plan, the PAYE
// salary, savings interest and dividends all feed the set aside, and until this only the WhatsApp
// flow could write them, so a web only customer had every one of them stuck at zero and his set
// aside understated. This writes all five in one PATCH; the route reads the current values and
// overlays whichever section the man just edited, so one form can never wipe another's field.
export async function setUserFinancials(
  userId: string,
  f: {
    plan: 'plan1' | 'plan2' | 'plan4' | 'plan5' | null;
    postgrad: boolean;
    employmentIncome: number;
    savingsIncome: number;
    dividendIncome: number;
  },
): Promise<boolean> {
  const { url } = config();
  const clamp = (n: number): number => Math.min(100_000_000, Math.max(0, Math.round(Number(n) || 0)));
  const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      student_loan_plan: f.plan,
      student_loan_postgrad: Boolean(f.postgrad),
      employment_income: clamp(f.employmentIncome),
      savings_income: clamp(f.savingsIncome),
      dividend_income: clamp(f.dividendIncome),
    }),
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
  /**
   * 🔴 WHETHER businessType ABOVE IS A FACT OR A FALLBACK. False means users.business_type was
   * null, blank or a value we do not recognise, and the sole_trader above is this file's default
   * rather than anything the man ever said.
   *
   * WHY IT IS A SEPARATE FLAG AND NOT A FOURTH businessType. Every engine and every screen reads
   * businessType as one of three known values; widening that union would make twenty five call
   * sites in files this lane does not own take a branch nobody has written yet, and a screen that
   * refuses to render is worse for a real sole trader than a default that has always been right
   * for him. So the default STAYS, byte for byte, and the fact that it is a default stops being
   * thrown away. Nothing changes behaviour today. What changes is that it CAN be read.
   *
   * WHO SHOULD READ IT, AND WHAT THEY SHOULD DO. Not the screens that already degrade safely: a
   * sole trader page shown to an unrecorded man is a nuisance, and /app/tax/ni says so in its own
   * header (refusing a real sole trader his Class 2 sentence would cost him a year of State
   * Pension). It is for the three places where the wrong arm costs him money or credibility:
   *   . the lender document and the tax summary, where isCompany is the FIRST condition and a
   *     director defaulted to sole trader is charged income tax and Class 4 National Insurance
   *     personally on profit that belongs to his company,
   *   . the MTD mandation arithmetic, which should not run at all for a company,
   *   . and anything that ASKS him, which is the only real repair: a false here is precisely the
   *     signal that the question was never answered.
   */
  structureRecorded: boolean;
  /** For a partnership only: the individual's percentage share of profit. 100 for everyone else. */
  partnershipShare: number;
  /**
   * 🔴 THE SECOND AXIS: what his business income actually IS, which businessType cannot answer.
   *
   * 'trade' means he carries on a trade, with or without rent alongside. 'property_only' means his
   * business is letting and there is no trade at all. null means we do not know, and every gate
   * that reads it asks him everything, which is the safe direction: asking a landlord a trade
   * question is a nuisance he can say no to, while never asking a sparky about his old employed
   * job because a read came back empty is four figures gone without a trace.
   *
   * See lib/persona.ts for the four trade provisions this exists to withhold and their sources,
   * and supabase/APPLY_2026-07-31_income_shape.sql for the column.
   */
  incomeShape: IncomeShape | null;
}

// Did the man ever actually tell us his structure? ONE function, called by both reads, because the
// whole defect this answers is two copies of a judgement drifting apart. A value we do not
// recognise counts as not recorded: a column holding 'ltd' or 'Sole Trader' is a write nobody
// validated, and treating it as an answer would be the same silent assumption in a new coat.
export function isRecordedBusinessType(value: unknown): boolean {
  return value === 'sole_trader' || value === 'limited_company' || value === 'partnership';
}

export async function getBusinessProfile(userId: string): Promise<BusinessProfile | null> {
  const { url } = config();
  const query = `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=business_type,partnership_share,income_shape&limit=1`;
  const res = await fetch(query, { headers: headers() });
  // ⚠️ UNTIL THE MIGRATION IS RUN, SELECTING income_shape IS A 400 AND THE WHOLE PROFILE IS NULL,
  // which would read as an unknown STRUCTURE too and quietly hand a director sole trader questions
  // again. So a failed read retries without the new column: the product degrades to exactly its
  // pre wave nine behaviour rather than to something worse than either.
  if (!res.ok) return getBusinessProfileLegacy(userId);
  const rows = (await res.json().catch(() => null)) as Array<{
    business_type: string | null;
    partnership_share: number | string | null;
    income_shape?: string | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  // ⚠️ AN UNANSWERED STRUCTURE READS AS SOLE TRADER, AND THAT IS A REAL COST TO ONE MAN.
  //
  // Null here means nobody ever told us, not "he is a sole trader". /app/start always asks, so on
  // the web path this is always set; the gap is a legacy row, a WhatsApp-only signup, or a write
  // that failed. For a genuine sole trader the coercion is free. For an unanswered LIMITED COMPANY
  // DIRECTOR it is not: taxPosition then charges him income tax and Class 4 National Insurance
  // personally on profit that belongs to his company, which is the largest overstatement in the
  // product and the one that is hardest for him to spot, because it looks like a big tax bill
  // rather than like a bug.
  //
  // 🔴 THE COERCION STAYS. WHAT STOPS IS THROWING THE FACT OF IT AWAY.
  //
  // incomeShape below models the honest shape (null means we do not know, and every gate that
  // reads it asks him everything). businessType cannot follow it without changing the union every
  // engine reads, and a half migrated nullable would be worse than a documented default. The right
  // fix is still to ASK him, which is what the business understanding work is for. Until then the
  // value is unchanged, byte for byte, and structureRecorded carries the truth alongside it, so
  // the branches where the wrong arm costs him money can tell a fact from a fallback. See the
  // field's own documentation on BusinessProfile.
  const bt: BusinessType =
    r.business_type === 'limited_company' || r.business_type === 'partnership' ? r.business_type : 'sole_trader';
  // A share is only meaningful for a partnership, and defaults to the whole thing until told
  // otherwise, so a half-answered setup never quietly halves a sole trader's tax.
  const share = Number(r.partnership_share);
  return {
    businessType: bt,
    structureRecorded: isRecordedBusinessType(r.business_type),
    partnershipShare: bt === 'partnership' && Number.isFinite(share) && share > 0 && share <= 100 ? share : 100,
    incomeShape: toIncomeShape(r.income_shape),
  };
}

// The pre wave nine read, kept only as the fallback above. It returns a null incomeShape, which is
// "unknown", which asks everything.
async function getBusinessProfileLegacy(userId: string): Promise<BusinessProfile | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=business_type,partnership_share&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Array<{
    business_type: string | null;
    partnership_share: number | string | null;
  }> | null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const r = rows[0];
  // ⚠️ AN UNANSWERED STRUCTURE READS AS SOLE TRADER, AND THAT IS A REAL COST TO ONE MAN.
  //
  // Null here means nobody ever told us, not "he is a sole trader". /app/start always asks, so on
  // the web path this is always set; the gap is a legacy row, a WhatsApp-only signup, or a write
  // that failed. For a genuine sole trader the coercion is free. For an unanswered LIMITED COMPANY
  // DIRECTOR it is not: taxPosition then charges him income tax and Class 4 National Insurance
  // personally on profit that belongs to his company, which is the largest overstatement in the
  // product and the one that is hardest for him to spot, because it looks like a big tax bill
  // rather than like a bug.
  //
  // 🔴 THE SECOND COERCION SITE, AND IT MUST ANSWER THE SAME WAY AS THE FIRST. A profile that
  // arrived through the fallback is not a different kind of profile, so structureRecorded is
  // computed by the SAME function here rather than restated, because two copies of this judgement
  // is how the two doors in this file drifted apart in the first place.
  const bt: BusinessType =
    r.business_type === 'limited_company' || r.business_type === 'partnership' ? r.business_type : 'sole_trader';
  const share = Number(r.partnership_share);
  return {
    businessType: bt,
    structureRecorded: isRecordedBusinessType(r.business_type),
    partnershipShare: bt === 'partnership' && Number.isFinite(share) && share > 0 && share <= 100 ? share : 100,
    incomeShape: null,
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

// --- where he got to setting up ------------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THREE FUNCTIONS, AND BETWEEN THEM THEY CAN WRITE EXACTLY ONE COLUMN OF HIS ANSWERS: NONE.
//
// public.onboarding_progress records WHICH STEP HE IS ON and nothing else. Every answer he gives
// during setup is written to its real home as he gives it, by the route that owns that fact, so
// there is nothing here to hold. The migration header
// (supabase/APPLY_2026-07-29_onboarding_and_walink.sql) is the full argument, and the short version
// is that a jsonb blob of his answers would be a second copy of the truth, and the copy that drifts
// is the one he believes.
//
// ⚠️ IF A FUTURE STEP HAS NO REAL HOME TO WRITE TO, THAT STEP NEEDS ONE. It is not a reason to add
// a column here. test/onboardingweb.test.mjs fails the build if these functions ever learn to write
// anything but the step.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface OnboardingProgress {
  step: string;
  completedAt: string | null;
}

// ⚠️ NULL MEANS WE COULD NOT READ, NOT "HE HAS NOT STARTED", and the two must never be confused.
// A read failure treated as a fresh start walks a man who is eleven questions in back to the welcome
// screen, which is the single most expensive thing this feature could do to him. Callers show him a
// resumable screen and no false progress; they do not reset him.
//
// A MISSING ROW, though, genuinely is "he has not started", and is reported as such: the default
// step with no completion.
export async function readOnboardingProgress(userId: string): Promise<OnboardingProgress | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/onboarding_progress?user_id=eq.${encodeURIComponent(userId)}&select=step,completed_at&limit=1`,
    { headers: headers() },
  );
  if (!res.ok) return null;
  const rows = (await res.json().catch(() => null)) as Array<{
    step: string | null; completed_at: string | null;
  }> | null;
  if (!Array.isArray(rows)) return null;
  if (rows.length === 0) return { step: 'welcome', completedAt: null };
  return { step: rows[0].step || 'welcome', completedAt: rows[0].completed_at ?? null };
}

// Move his recorded position. Upsert on the primary key, because the first Continue he presses is
// also the first time the row exists, and two of those arriving together must not become an error he
// sees instead of the next question.
//
// The step string is validated by lib/onboarding.ts BEFORE it reaches here. This function does not
// second guess it: a second validator is a second list of steps, and the two would drift.
export async function setOnboardingStep(userId: string, step: string): Promise<boolean> {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/onboarding_progress?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ user_id: userId, step, updated_at: new Date().toISOString() }),
  });
  return res.ok;
}

// He finished. Stamped once and never cleared: completed_at is the fact that he has been through
// this, and reopening setup from Settings later must not un-happen it.
export async function completeOnboarding(userId: string): Promise<boolean> {
  const { url } = config();
  const now = new Date().toISOString();
  const res = await fetch(`${url}/rest/v1/onboarding_progress?on_conflict=user_id`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ user_id: userId, step: 'done', completed_at: now, updated_at: now }),
  });
  return res.ok;
}

// ── Binding a WhatsApp number: the other half of the 29 July migration ──────────────────────────
//
// The rules live in lib/walink.ts, which is pure. This is only the reading and writing.
// supabase/APPLY_2026-07-29_onboarding_and_walink.sql section 2 is the argument for the shape.

export interface WaLinkRow {
  id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
}

// One row per real attempt. The CODE IS NEVER STORED, only its keyed digest, so nothing here can be
// read back into a working credential even by us. That is also why the code has to ride to the
// browser in a signed cookie rather than being re-read on the next page load: there is nothing to
// re-read, by design.
export async function createWaLink(
  userId: string, codeHash: string, expiresAtIso: string,
): Promise<boolean> {
  if (!userId || !codeHash) return false;
  const { url } = config();
  try {
    const res = await fetch(`${url}/rest/v1/wa_links`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ user_id: userId, code_hash: codeHash, expires_at: expiresAtIso }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ⚠️ UNCONSUMED ONLY, AND THAT IS THE INDEX RATHER THAN A PREFERENCE.
//
// wa_links_hash_idx is a PARTIAL index, `where consumed_at is null`. A lookup by hash alone cannot
// use it and would sequentially scan the table on every inbound WhatsApp message carrying anything
// code shaped, which is a hot path an attacker chooses the volume of.
//
// So a spent code simply does not match, and the webhook reports it the same way it reports a code
// that never existed. That costs one shade of accuracy in a sentence and buys an indexed read on
// the one query a stranger can make us run at will. The genuinely useful case, a man who sends his
// code twice, is answered properly anyway: the second message comes from a number we have by then
// bound, so he is told he is already connected rather than told nothing was found.
export async function readLiveWaLink(codeHash: string): Promise<WaLinkRow | null> {
  if (!codeHash) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/wa_links?code_hash=eq.${encodeURIComponent(codeHash)}&consumed_at=is.null` +
        `&select=id,user_id,expires_at,consumed_at&order=created_at.desc&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as WaLinkRow[] | null;
    return Array.isArray(rows) ? rows[0] ?? null : null;
  } catch {
    return null;
  }
}

// 🔴 SPENDING A CODE IS CONDITIONAL ON IT BEING UNSPENT, AND THE DATABASE DECIDES. Same shape as
// consumeSignupCode, and here it is doing more work than it is there.
//
// Two messages carrying one code can arrive together, from two different phones. Both reads see an
// unconsumed row, both pass verifyStoredLink, and if the check were made in TypeScript both would
// bind: the second write would silently move the account to the second number. The PATCH filters on
// consumed_at being null and asks for the row back, so exactly one of them gets it.
//
// The number that won is written here too, because a support question about which phone got bound
// deserves an answer that is not an inference.
export async function consumeWaLink(id: string, boundPhone: string): Promise<boolean> {
  if (!id) return false;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/wa_links?id=eq.${encodeURIComponent(id)}&consumed_at=is.null`,
      {
        method: 'PATCH',
        headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ consumed_at: new Date().toISOString(), bound_phone: boundPhone }),
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => null)) as unknown[] | null;
    return Array.isArray(rows) && rows.length === 1;
  } catch {
    return false;
  }
}

// 🔴 THE NUMBER AND THE PROOF ARE WRITTEN IN ONE STATEMENT, AND THE MIGRATION SAYS WHY.
//
// "users.phone_number MAY ONLY EVER BE WRITTEN BY A PATH THAT HAS JUST PROVED THAT NUMBER, and that
// path sets phone_verified_at in the same write. Anything that finds a phone_number with no
// phone_verified_at beside it is looking at a bug."
//
// Two writes would leave a window where the column that three crons SEND to is populated and the
// fact that anybody proved it is not yet recorded. One statement, or neither.
//
// A refusal here is usually the unique index doing its job: the number belongs to another account.
// The caller treats that as a refusal to bind, never as something to retry.
export async function bindProvedPhone(userId: string, e164: string): Promise<boolean> {
  if (!userId) return false;
  const phone = normalizeUkPhone(e164);
  if (!phone) return false;
  const { url } = config();
  try {
    const res = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ phone_number: phone, phone_verified_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// What the connect page needs to know about him, in one round trip: whether a number is bound, and
// what to call him in the WhatsApp welcome.
//
// ⚠️ THE WHOLE NUMBER COMES BACK AND THE PAGE PRINTS ONLY THE LAST FOUR. Trimming it here would put
// the formatting rule in the data layer, where the next caller would have to invent its own.
export interface ProvedPhone {
  phone: string | null;
  verifiedAt: string | null;
  name: string | null;
}

export async function readProvedPhone(userId: string): Promise<ProvedPhone | null> {
  if (!userId) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=phone_number,phone_verified_at,name&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{
      phone_number: string | null; phone_verified_at: string | null; name: string | null;
    }> | null;
    if (!Array.isArray(rows) || !rows[0]) return { phone: null, verifiedAt: null, name: null };
    return {
      phone: rows[0].phone_number ?? null,
      verifiedAt: rows[0].phone_verified_at ?? null,
      name: rows[0].name ?? null,
    };
  } catch {
    return null;
  }
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
//
// ⚠️ MOVED, NOT GONE. getActiveGoals, insertUserGoal and completeLatestGoal used to live here and
// used to speak to public.user_goals. The founder decided on 31 July 2026 that there is ONE goals
// store, public.goals, so the three now live beside the wave three goals accessors at the bottom
// of this file and are thin translations over them. user_goals is read only legacy until launch
// two; nothing in this file writes it any more. See the section THE JOBS DIARY AND GOALS below,
// and supabase/APPLY_2026-07-31_goals_consolidation.sql for the row migration.

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
      if (isResidentialFinanceCost(r.category, r.vendor)) finance += Math.abs(a);
      else expenses += Math.abs(a);
    }
  }
  return { rents, expenses, finance };
}

// Does this account have a rental stream at all? The question the money-in form asks before it
// offers "rent from a property" as a choice: doc 103's empty test says an option that applies to
// nobody teaches everybody to stop reading, so the choice is drawn only for a man who has told us
// about rental property, on any surface, or has already logged rent.
//
// ⚠️ TWO SOURCES, IN THIS ORDER, AND BOTH ARE HIS OWN STATEMENTS. The rental circumstance is his
// tick at signup (reconciled above) or his yes to the setup question, stored with the wording he
// saw. A confirmed property transaction is rent he logged himself. A failed read answers false,
// which only hides an offer; it can never file anything, so the safe direction is the quiet one.
export async function accountHasRental(userId: string): Promise<boolean> {
  const answers = await readCircumstances(userId);
  if ((answers ?? []).some((a) => a.key === 'rental' && a.answer === 'yes')) return true;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}&income_type=eq.property&confirmed=eq.true&select=id&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => [])) as Array<{ id: string }>;
    return rows.length > 0;
  } catch {
    return false;
  }
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
  const rows = (await res.json().catch(() => null)) as (BookShare[]) | null;
  if (rows !== null && rows[0]) return rows[0];

  // See the block above recoverInsertedId. The grant EXISTS and it is live. Reading it back beats
  // handing him a failure that makes him mint a second one he can never see and never revoke.
  const back = await fetch(
    `${url}/rest/v1/book_shares?user_id=eq.${encodeURIComponent(userId)}`
      + `&expires_at=eq.${encodeURIComponent(expiresAtISO)}&revoked_at=is.null`
      + `&select=${SHARE_COLS}&order=created_at.desc&limit=1`,
    { headers: headers() },
  ).catch(() => null);
  if (!back || !back.ok) return null;
  const found = (await back.json().catch(() => null)) as (BookShare[]) | null;
  if (found?.[0]) console.error('[createBookShare] the reply was unreadable; recovered the grant that was written.');
  return found?.[0] ?? null;
}

export async function listBookShares(userId: string): Promise<BookShare[]> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/book_shares?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=${SHARE_COLS}&order=created_at.desc&limit=50`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const parsed = (await res.json().catch(() => null)) as (BookShare[]) | null;
  if (parsed === null) return [];
  return parsed;
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
  const rows = (await res.json().catch(() => null)) as (BookShare[]) | null;
  if (rows === null) return null;
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
      // 🔴 capital_kind RIDES ALONG SO A SHARED BOOK CAN KEEP A CAR OUT OF PROFIT. Without it,
      // lib/bookshare.ts's shareTotals summed a £60,000 car into expenses and printed a loss on a
      // page a mortgage broker reads, the same defect the proof of income carried. The rule that
      // turns a car into a boolean stays in lib/capital.ts: we decide it here with isWrittenDown()
      // and hand bookshare the answer, exactly as getConfirmedTransactionsForRange does for the pack.
      // income_type RIDES ALONG FOR THE SAME REASON capital_kind DOES. A residential landlord's
      // mortgage interest is not an allowable expense: Section 24 relieves it as a basic rate
      // credit. Without the stream this file cannot tell it apart from a trade's loan interest,
      // which IS deductible, so shareTotals counted it as a running cost and the shared book
      // printed a profit £15,000 lower than the proof of income document for the same account.
      // Found live 6 August 2026. lib/bookshare.ts stays import free, so the answer is decided
      // here and handed over as a boolean, exactly as writtenDown is.
      `&select=amount,vendor,category,transaction_date,description,confirmed,capital_kind,income_type` +
      `&order=transaction_date.desc&limit=5000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => null)) as (Record<string, unknown>[]) | null;
  if (rows === null) return [];
  return rows.map((r) => ({
    ...r,
    writtenDown: isWrittenDown(r.capital_kind),
    financeCost:
      String(r.income_type ?? '').toLowerCase() === 'property' &&
      isResidentialFinanceCost(r.category as string | null, r.vendor as string | null),
  }));
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT HE SAID A LARGE PURCHASE WAS. Written BEFORE the row is confirmed, never after.
//
// 🔴 THE ORDER IS THE SAFETY. confirm_pile flips confirmed=true, and the moment it does the row is
// inside every total in the product. If the row were confirmed first and this write then failed, a
// £60,000 car would sit in his books as a £60,000 deduction with his answer lost, which is the
// exact defect this exists to fix. So app/api/pile/route.ts writes this first and REFUSES TO FILE
// a car at all if it comes back false. A row that stays in the pile is a nuisance; a row that is
// filed wrongly is a letter from HMRC.
//
// Returns false on any failure INCLUDING the migration not having been run, because a missing
// column is exactly the case where filing anyway would be silently wrong.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function setCapitalKind(
  userId: string,
  ids: string[],
  kind: string,
  businessUsePct: number | null,
): Promise<boolean> {
  if (!isCapitalKind(kind)) return false;
  // An id is a uuid or it is not an id. See setManyPersonal for why this is not encodeURIComponent's
  // job: PostgREST decodes the string straight back and a quote reopens the list.
  const clean = ids.filter((i) => UUID.test(i));
  if (clean.length === 0) return false;

  // The share is only meaningful on a vehicle, and the database says so too. Sending one on a van
  // would leave the two columns disagreeing, which PART 3 of the migration checks for. The test is
  // isWrittenDown() and it used to be written out here as well: same rule, third copy.
  const pct =
    isWrittenDown(kind) && typeof businessUsePct === 'number' && Number.isFinite(businessUsePct)
      ? Math.max(1, Math.min(100, Math.round(businessUsePct)))
      : null;

  try {
    const { url } = config();
    const list = clean.map((i) => `"${i}"`).join(',');
    const res = await fetch(
      `${url}/rest/v1/transactions?id=in.(${encodeURIComponent(list)})` +
        `&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ capital_kind: kind, business_use_pct: pct }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// Everything confirmed, INCLUDING personal, so the detector can look at the whole
// picture and the app can show a personal entry greyed out rather than hiding it.
// ONE MONTH OF HIS BOOK, AND THE DATE HE STARTED.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THESE EXIST WHEN getAllConfirmedForReview IS RIGHT THERE.
//
// That function has no date filter and a limit of two thousand rows. /app/money's first draft used
// it and filtered a month out in memory, and on a busy account that is a SILENT TRUNCATION: the
// oldest rows fall off the end of the limit, and a man stepping back to April is shown an empty
// month with nothing at all to tell him why. "You did no work in April" is a worse answer than a
// slow page, and it was also the slow page, two thousand rows over a bad signal to draw thirty.
//
// So the month is asked for by date, and the earliest date is asked for on its own so the back
// arrow knows where his books actually start. Doc 103's third test: an arrow into a month before he
// ever traded is a button whose only function is to show him nothing.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ NULL MEANS WE COULD NOT READ IT, not that the month was quiet. A page that prints an empty
// month over a database timeout is telling him something false about his own money.
export async function transactionsInMonth(
  userId: string,
  month: string,
): Promise<Record<string, unknown>[] | null> {
  if (!isMonthKey(month)) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}`
        + '&confirmed=eq.true'
        + `&transaction_date=gte.${monthStart(month)}`
        + `&transaction_date=lt.${monthEnd(month)}`
        // capital_kind and business_use_pct so app/app/entry can ask, and show, what a large
        // purchase was. See supabase/APPLY_2026-08-02_capital_kind.sql: null means nobody asked.
        + '&select=id,amount,vendor,category,transaction_date,description,is_personal,capital_kind,business_use_pct'
        + '&order=transaction_date.desc&limit=2000',
      { headers: headers() },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>[];
  } catch {
    return null;
  }
}

// The first day his books have anything on. Used only to decide whether the back arrow leads
// anywhere, so a failed read returns null and the arrow simply stays available: letting him step
// into an empty month is a far smaller fault than refusing to let him reach a real one.
export async function earliestTransactionDate(userId: string): Promise<string | null> {
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}`
        + '&confirmed=eq.true&transaction_date=not.is.null'
        + '&select=transaction_date&order=transaction_date.asc&limit=1',
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ transaction_date?: string | null }>;
    const first = rows[0]?.transaction_date;
    return typeof first === 'string' ? first.slice(0, 10) : null;
  } catch {
    return null;
  }
}

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
  const parsed = (await res.json().catch(() => null)) as (Record<string, unknown>[]) | null;
  if (parsed === null) return [];
  return parsed;
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
  const parsed = await res.json().catch(() => null);
  if (parsed === null) return [];
  return parsed;
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
  const parsed = await res.json().catch(() => null);
  if (parsed === null) return [];
  return parsed;
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
  const rows = (await res.json().catch(() => null)) as (Array<{ vendor: string | null }>) | null;
  if (rows === null) return null;
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
  const rows = await res.json().catch(() => null);
  if (rows === null) return null;
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
  const parsed = await res.json().catch(() => null);
  if (parsed === null) return [];
  return parsed;
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
    // 🔴 THE VAT THE RECEIPT SAW. app/api/money/receipt/route.ts carried a note from the day it
    // was written saying its absence here was a gap rather than a decision: a registered man
    // whose receipt folded into a bank line lost the reading, and a bank line has no VAT of its
    // own to lose. Closed 2 August 2026.
    //
    // ⚠️ THE FIGURE ONLY. vat_confirmed is NOT on this list and must never be. This is a model's
    // reading of a crumpled bit of paper: it arrives unconfirmed exactly as it does on a fresh
    // row, /app/pile prints it and asks him to agree it, and confirmTransactionVat is the only
    // thing anywhere that flips it. Leaving the column alone leaves it false, which is right.
    vat_amount?: number | null;
  },
): Promise<boolean> {
  const { url } = config();
  const row: Record<string, unknown> = {};
  if (patch.vendor !== undefined) row.vendor = patch.vendor;
  if (patch.category !== undefined && patch.category !== null) row.category = patch.category;
  if (patch.raw_input_url !== undefined) row.raw_input_url = patch.raw_input_url;
  if (patch.raw_whatsapp_message_id !== undefined) row.raw_whatsapp_message_id = patch.raw_whatsapp_message_id;
  // A null or a zero writes nothing rather than clearing what is there. A receipt that showed no
  // VAT is not an instruction to erase a figure the row already had.
  const withVat = typeof patch.vat_amount === 'number' && Number.isFinite(patch.vat_amount) && patch.vat_amount > 0;
  if (withVat) row.vat_amount = patch.vat_amount;
  // Deliberately NOT touching amount or transaction_date: the bank's figures are
  // facts and must survive the merge. See lib/dedupe.ts.

  const send = (body: Record<string, unknown>) => fetch(
    `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    },
  );

  const res = await send(row);
  if (res.ok) return true;

  // 🔴 A VAT READING MUST NEVER COST HIM THE MERGE, AND THE MERGE IS WORTH MORE THAN THE READING.
  //
  // The same rule app/api/money/receipt/route.ts applies to its insert, and the reason is the
  // same: on a database where supabase/APPLY_2026-08-01_vat.sql has not been run, naming the
  // column is enough for PostgREST to refuse the whole statement. On an insert that costs him the
  // receipt. Here it would cost him the shop name, the category and the photograph as well, and
  // the caller does not check what comes back. So the second attempt drops the reading and keeps
  // everything that matters more.
  if (!withVat) return false;
  const { vat_amount: _dropped, ...rest } = row;
  void _dropped;
  const retry = await send(rest);
  return retry.ok;
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

  const page = (await res.json().catch(() => null)) as DigestCandidate[] | null;
  if (page === null) return { users: [], lastId: afterId, more: false };
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

  // A body we cannot read is not "nobody opted out". Treating it as an empty set would send the
  // digest to every person who has switched it off, so an unreadable preferences page stops the
  // page instead: the cron's own resumable walk brings them back on the next kick.
  const prefs = (await prefsRes.json().catch(() => null)) as Array<{ user_id: string; daily_nudges: boolean }> | null;
  if (prefs === null) return { users: [], lastId: afterId, more: false };
  const optedOut = new Set(
    prefs
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
    const parsed = await res.json().catch(() => null);
    if (parsed === null) return [];
    return parsed;
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
  const rows = (await res.json().catch(() => null)) as (unknown[]) | null;
  if (rows === null) return 0;
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
  const rows = (await res.json().catch(() => null)) as (Array<{ last_digest_at: string | null }>) | null;
  if (rows === null) return null;
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
    const rows = await res.json().catch(() => null);
    if (rows === null) return null;
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

import type { CronRun, ReminderBacklog } from './cronwatch';

// Every job's last known state. Small table, one row per job, so no paging needed.
export async function listCronRuns(): Promise<CronRun[] | null> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/cron_runs?select=job,last_started,last_finished,last_ok,last_error`, {
      headers: headers(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = await res.json().catch(() => null);
    if (rows === null) return null;
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
    const rows = await res.json().catch(() => null);
    if (rows === null) return null;
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

// Everything still waiting on him. Unconfirmed, not already excluded, from every capture
// channel that leaves a row waiting: the bank feed, a receipt photographed on the web, and the
// three WhatsApp captures (a photo, a voice note, a typed line).
//
// ⚠️ THIS USED TO BE source_type=eq.bank_feed, AND THAT ONE FILTER MADE THE PRODUCT LIE TWICE.
// Setup promises "anything you leave is waiting for you inside", and this page's own header
// says a receipt landing on WhatsApp is answered by an email telling him to come here and
// confirm it. Then the query showed him bank rows only, so the receipt he was emailed about
// was invisible on the very screen the email sent him to, and the money page's "none of it is
// counted below until you answer it" count was silently short of every capture he had made.
//
// EVERY CALLER WAS READ BEFORE WIDENING THIS, AND THE WIDENING IS DELIBERATE FOR ALL OF THEM:
// /app/pile draws the deck, /api/pile serves the same deck to the phone app and takes the
// decisions, and the Overview and money pages only COUNT what is waiting. All four are the one
// review surface, and a review surface that cannot see a waiting receipt is wrong, not safe.
// The decision path holds unchanged: confirm_pile re applies its guard in SQL with no source
// filter at all (money out only, nothing flagged, his rows only), so a receipt row obeys
// exactly the rules a bank row obeys.
//
// ⚠️ THE FOUR STRUCTURED WHATSAPP CLAIMS ARE DELIBERATELY NOT HERE. whatsapp_mileage,
// whatsapp_cis, whatsapp_homeoffice and whatsapp_phoneshare land with engine owned categories
// ('use of home', 'cis income') that the pile's picker does not offer, so the select on
// /app/pile would silently default one of them to its first option and a man's flat rate
// claim would be filed as materials with his own consent. They keep their own confirm flow.
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
  // ⚠️ NAMED HERE OR THE VAT CONFIRM STEP NEVER DRAWS. This select lists its columns one by one, so
  // a column nobody names arrives undefined however well the screen is written. And the order
  // matters: PostgREST REFUSES a select naming a column that does not exist, and this function
  // answers a failed read with [], which would empty the pile for every customer. So
  // supabase/APPLY_2026-08-01_vat.sql has to be run BEFORE this line ships.
  vat_amount: number | null;
  vat_confirmed: boolean | null;
  // 🔴 THE LINE THAT TURNS THE CIS QUESTION ON. Same rule as the VAT pair above, and the same
  // ordering hazard, EXCEPT that this one carries no hazard at all: cis_deduction has existed in
  // supabase/schema.sql since the beginning and app/api/whatsapp/route.ts has been writing it
  // since handleCIS was built. There is no migration standing behind this select, which is why
  // the capture needed none. See recordCisOnIncome().
  cis_deduction: number | null;
}>> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}` +
      `&confirmed=eq.false&is_personal=eq.false` +
      `&source_type=in.(bank_feed,web_image,whatsapp_image,whatsapp_voice,whatsapp_text)` +
      `&select=id,vendor,description,amount,category,looks_personal,vat_amount,vat_confirmed,cis_deduction` +
      `&order=transaction_date.desc&limit=1000`,
    { headers: headers() },
  );
  if (!res.ok) return [];
  const parsed = await res.json().catch(() => null);
  if (parsed === null) return [];
  return parsed;
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
    const n = await res.json().catch(() => null);
    if (n === null) return 0;
    return typeof n === 'number' ? n : 0;
  } catch {
    return 0;
  }
}

// 🔴 THE OTHER HALF OF confirmPile: FILING MONEY IN. See supabase/APPLY_2026-07-31_confirm_income.sql
// for why this did not exist until 31 July 2026 and what it cost.
//
// confirm_pile refuses a credit outright and always will: money in is what HMRC cares about and it
// is never swept up in a one tap confirm across the whole pile. This is the deliberate, one payer
// at a time door instead, and the database re-applies its own guards on top (money in only, never a
// flagged row, and the category may only be 'income' or 'rent').
//
// `kind` is the two words the RPC accepts and nothing else can be passed: 'rent' also sets the
// property stream, because HMRC taxes rent and trade differently and a rent payment filed as trade
// income overstates his Class 4 bill.
//
// Returns how many rows actually landed, so the caller can say something honest rather than
// reporting success for rows the guard refused. A missing function (the migration not yet run)
// returns 0, and the screen says it could not file it rather than pretending it did.
export async function confirmIncome(
  userId: string,
  ids: string[],
  kind: 'income' | 'rent',
): Promise<number> {
  const clean = ids.filter((i) => UUID.test(i));
  if (clean.length === 0) return 0;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/rpc/confirm_income`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_user: userId, p_ids: clean, p_category: kind }),
    });
    if (!res.ok) return 0;
    const n = await res.json().catch(() => null);
    if (n === null) return 0;
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

// 🔴 THE IDEAS BANK IS GONE. Removed 31 July 2026 with the Hoka cleanup, whose migration is
// supabase/APPLY_2026-07-31_hoka_cleanup.sql. readStudioIdeas, insertStudioIdea and voteStudioIdea
// lived here and reached public.content_ideas, which that migration wipes. The Idea type went with
// them out of lib/studio.ts, so nothing here may name it. The founder LEADS the ideas and the bot
// draws from them: a table of AI invented ideas was the thing being torn out.

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

// Approve and book in one write. Moves an asset from awaiting_approval to scheduled AND stamps its
// go live time. Guarded on the from state so a double click cannot book it twice or move a card
// someone else already moved. This is the publish gate's write.
export async function setStudioAssetScheduled(id: string, whenISO: string): Promise<Asset | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/content_assets?id=eq.${encodeURIComponent(id)}&state=eq.awaiting_approval`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ state: 'scheduled', scheduled_for: whenISO, updated_at: new Date().toISOString() }),
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

// --- The studio, after the Hoka cleanup of 31 July 2026 ----------------------------------------
//
// 🔴 NINE FUNCTIONS STOOD HERE AND ARE GONE, WITH THE PRODUCT CODE THAT CALLED THEM (b7dac7ef).
//
//   readStudioIdeas, insertStudioIdea, voteStudioIdea, readStudioIdea, markIdeaPromoted
//     the ideas bank. public.content_ideas is wiped by supabase/APPLY_2026-07-31_hoka_cleanup.sql,
//     and the Idea type went out of lib/studio.ts with it. The founder LEADS the ideas and the bot
//     draws from them: a table of AI invented ideas was the thing being torn out.
//
//   insertStudioAgentRun, readLatestStudioAgentRun, readAssetsPendingGeneration,
//   countStudioAssetsGeneratedSince
//     the AI drafting path and its heartbeat. There is no drafting agent to have a heartbeat.
//
// ⚠️ setStudioAssetMedia below STAYS. It has a live caller in app/api/team/studio/mutate/route.ts.
// Do not tidy it away with the rest, and do not re-add Idea to lib/studio.ts to make anything here
// compile again: that resurrects deleted product code.

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
  const rows = (await res.json().catch(() => null)) as (Array<{ email: string; nurture_stage: number | null; confirmed_at: string | null; nurture_last_at: string | null }>) | null;
  if (rows === null) return [];
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
  const rows = (await res.json().catch(() => null)) as (Array<Record<string, unknown>>) | null;
  if (rows === null) return [];
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

// --- Marketing connectors (Meta, TikTok, Google) ------------------------------------------------

// Store or refresh a platform's OAuth tokens, one row per platform. Tokens are encrypted at rest
// (encryptSecret is a no op without a key, so this is safe either way). Upsert on the platform key,
// so reconnecting a platform replaces its tokens rather than piling up rows. Never called from the
// browser: this is service role only, like the rest of this file.
export async function upsertConnectorToken(input: {
  platform: string; account_id?: string | null; access_token: string; refresh_token?: string | null;
  expires_at?: string | null; scope?: string | null; connected_by?: string | null;
}): Promise<boolean> {
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/marketing_connectors?on_conflict=platform`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        platform: input.platform,
        account_id: input.account_id ?? null,
        access_token: encryptSecret(input.access_token),
        refresh_token: input.refresh_token ? encryptSecret(input.refresh_token) : null,
        expires_at: input.expires_at ?? null,
        scope: input.scope ?? null,
        connected_by: input.connected_by ?? null,
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch { return false; }
}

// A platform's connection STATUS, safe to show a console: whether it is connected, when it expires,
// the scope, who connected it. It never returns the token itself. Null means the row could not be read.
export async function readConnectorStatus(platform: string): Promise<
  { platform: string; connected: boolean; expires_at: string | null; scope: string | null; connected_by: string | null; updated_at: string | null } | null
> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/marketing_connectors?platform=eq.${encodeURIComponent(platform)}&select=platform,access_token,expires_at,scope,connected_by,updated_at`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ platform: string; access_token: string | null; expires_at: string | null; scope: string | null; connected_by: string | null; updated_at: string | null }>;
    const row = rows[0];
    if (!row) return { platform, connected: false, expires_at: null, scope: null, connected_by: null, updated_at: null };
    return {
      platform: row.platform,
      connected: Boolean(row.access_token),
      expires_at: row.expires_at,
      scope: row.scope,
      connected_by: row.connected_by,
      updated_at: row.updated_at,
    };
  } catch { return null; }
}

// --- THE ANNOUNCEMENTS FEED ----------------------------------------------------------------------
//
// The reads behind the banner that finally makes Khoji visible. Four of them, and only one is
// load-bearing enough to fail the request.
//
// ⚠️ THE APPROVED KNOWLEDGE IS READ LIVE, NEVER COPIED. There is no announcements table holding a
// tax fact. A second copy of a figure is a second copy that can drift, and this codebase has been
// caught with two readers over the same number three separate times (see readBrain's header). The
// gate is applied in ONE place, lib/announcements.ts, over rows read straight from knowledge_items.
//
// ⚠️ AND NOTHING HERE JOINS ANYTHING ABOUT THE CUSTOMER except his own dismissals. An announcement
// is a fact about the law, identical for every reader. The only per-user query in this function is
// "which of these has he already cleared".

export interface AnnouncementSources {
  knowledge: AnnouncementKnowledgeRow[];
  manual: AnnouncementManualRow[];
  appliedItemIds: string[];
  dismissedKeys: string[];
}

// Structurally identical to KnowledgeRow / ManualRow in lib/announcements.ts. Declared here rather
// than imported so this file keeps its existing import list and the two stay checked against each
// other by tsc at the one call site that passes one to the other.
export interface AnnouncementKnowledgeRow {
  id: string;
  status: string | null;
  title: string | null;
  summary: string | null;
  source_url: string | null;
  effective_date: string | null;
  created_at: string | null;
  engine_impact: boolean | null;
}

export interface AnnouncementManualRow {
  id: string;
  title: string | null;
  body: string | null;
  source_url: string | null;
  knowledge_item_id: string | null;
  published_at: string | null;
  expires_at: string | null;
}

// How far back the queries reach. Wider than lib/announcements.ts's MAX_AGE_DAYS on purpose: the
// window that decides what a customer SEES belongs in the pure module where it is tested, not in a
// query string. This is only here to keep the row count sane.
const ANNOUNCEMENT_QUERY_DAYS = 120;

// Returns null ONLY when the approved-knowledge read itself failed. A banner that silently shows
// nothing because a query timed out looks exactly like a banner with nothing to say, and this
// codebase's whole disease is silent success. The caller renders nothing either way, but it can
// tell the two apart in a log.
export async function readAnnouncementSources(userId: string): Promise<AnnouncementSources | null> {
  try {
    const { url } = config();
    const since = new Date(Date.now() - ANNOUNCEMENT_QUERY_DAYS * 86_400_000).toISOString();
    const q = async (path: string) => {
      const res = await fetch(`${url}/rest/v1/${path}`, { headers: headers(), signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    // 🔴 LOAD-BEARING. status=eq.reviewed is belt AND braces: lib/announcements.ts refuses anything
    // else regardless, and this narrows the read so an unapproved row never even leaves the
    // database. Two gates, because the cost of the second one is a query string.
    const knowledge = (await q(
      'knowledge_items?status=eq.reviewed'
      + '&select=id,status,title,summary,source_url,effective_date,created_at,engine_impact'
      + `&created_at=gte.${since}&order=created_at.desc&limit=40`,
    )) as AnnouncementKnowledgeRow[];

    // GARNISH. allSettled, not all. A dismissals read that fails must not blank the banner, and a
    // manual note that fails to load must not take the law with it. The worst case of each failing
    // is a card he has already cleared coming back once, which is a nuisance, not a lie.
    const [manualR, appliedR, dismissedR] = await Promise.allSettled([
      q(`announcements?select=id,title,body,source_url,knowledge_item_id,published_at,expires_at&published_at=gte.${since}&order=published_at.desc&limit=20`),
      // PROOF THAT THE FIGURE ACTUALLY MOVED. Only an item with a real fact_overrides row may carry
      // "your figures already reflect this". engine_impact records what somebody INTENDED; this
      // records what happened. Saying the first while meaning the second is the exact species of
      // confident wrongness the whole product is built to avoid.
      q(`fact_overrides?select=knowledge_item_id&knowledge_item_id=not.is.null&created_at=gte.${since}&limit=200`),
      q(`announcement_dismissals?user_id=eq.${encodeURIComponent(userId)}&select=announcement_key&limit=500`),
    ]);

    const manual = (manualR.status === 'fulfilled' ? manualR.value : []) as AnnouncementManualRow[];
    const appliedRows = (appliedR.status === 'fulfilled' ? appliedR.value : []) as Array<{ knowledge_item_id: string | null }>;
    const dismissedRows = (dismissedR.status === 'fulfilled' ? dismissedR.value : []) as Array<{ announcement_key: string }>;

    return {
      knowledge,
      manual,
      appliedItemIds: appliedRows.map((r) => r.knowledge_item_id).filter((v): v is string => !!v),
      dismissedKeys: dismissedRows.map((r) => r.announcement_key),
    };
  } catch {
    return null;
  }
}

// HE CLEARED IT, IT STAYS CLEARED. Idempotent by primary key, so a double tap on a phone with a bad
// signal is not an error. Returns false on a failed write so the surface can leave the card up
// rather than fade it out over a write that never landed.
export async function dismissAnnouncement(userId: string, key: string): Promise<boolean> {
  if (!userId || !key) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/announcement_dismissals`, {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
        // Already dismissed is a success, not a conflict.
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: userId, announcement_key: key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// THE UNDO. Doc 103: acting for him is only kindness when it is reversible. A dismissal is his own
// decision about his own screen, so he may take it back.
export async function undismissAnnouncement(userId: string, key: string): Promise<boolean> {
  if (!userId || !key) return false;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/announcement_dismissals?user_id=eq.${encodeURIComponent(userId)}&announcement_key=eq.${encodeURIComponent(key)}`,
      { method: 'DELETE', headers: { ...headers(), Prefer: 'return=minimal' } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// PUBLISHING, FROM /team. Every customer reads what this writes, so it carries a name and a date for
// the same reason reviewKnowledgeItem does. `byEmail` is required by the signature, not defaulted:
// an announcement we cannot attribute is "the system decided", which is what we are here to prevent.
export async function writeAnnouncement(a: {
  title: string;
  body?: string | null;
  sourceUrl?: string | null;
  knowledgeItemId?: string | null;
  expiresAt?: string | null;
  byEmail: string;
}): Promise<boolean> {
  if (!a.title?.trim() || !a.byEmail) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/announcements`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        title: a.title.trim(),
        body: a.body?.trim() || null,
        source_url: a.sourceUrl?.trim() || null,
        knowledge_item_id: a.knowledgeItemId || null,
        expires_at: a.expiresAt || null,
        created_by: a.byEmail,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// TAKING ONE DOWN. Expiring, never deleting: an announcement that was read by six thousand people is
// a thing we said, and the record of having said it does not get to disappear because we changed our
// minds. It stops showing, and the row stays.
export async function retireAnnouncement(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ expires_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// What /team shows: everything published, live or retired, newest first, with who wrote it. Null
// means the read failed, which is not the same as "nothing published yet".
export async function readAnnouncementsForTeam(limit = 40): Promise<
  Array<AnnouncementManualRow & { created_by: string | null; created_at: string | null }> | null
> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/announcements?select=id,title,body,source_url,knowledge_item_id,published_at,expires_at,created_by,created_at&order=published_at.desc&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as Array<AnnouncementManualRow & { created_by: string | null; created_at: string | null }>;
  } catch {
    return null;
  }
}

// --- TESTIMONIALS --------------------------------------------------------------------------------
//
// Real customer quotes, added by the founder on the /team marketing desk and shown on the public
// homepage. NO review text ever lives in the code: the front door reads them from here at render
// time. That is what makes the anti invention rule STRONGER than an empty array with a comment on
// it. CAP 3.47 and 3.50 and the DMCC Act 2024 ban invented testimonials, so every row carries WHO
// added it, exactly like writeAnnouncement above.

export interface TestimonialRow {
  id: string;
  quote: string;
  name: string;
  trade: string;
  rating: number;
  source: string | null;
  published: boolean;
  created_by: string | null;
  created_at: string | null;
}

// The shape the homepage renders. tint and fg are DERIVED per card from a fixed palette below,
// because the database stores the words a customer said, never a colour of ours.
export interface PublicReview {
  quote: string;
  name: string;
  trade: string;
  rating: number;
  tint: string;
  fg: string;
}

// Theme tokens, cycled per card so a run of quotes does not read as one block. Not stored, because a
// colour is our decoration and has no business sitting in the same row as a customer's words.
const TESTIMONIAL_TINTS: ReadonlyArray<{ tint: string; fg: string }> = [
  { tint: 'var(--river-tint)', fg: 'var(--river-deep)' },
  { tint: 'var(--saffron-tint)', fg: 'var(--on-saffron-tint)' },
  { tint: 'var(--green-tint)', fg: 'var(--on-green-tint)' },
];

// PUBLISHING A TESTIMONIAL, FROM /team. Every visitor reads what this writes, so it carries a name
// and a date for the same reason writeAnnouncement does. `createdBy` is required by the signature,
// not defaulted: a testimonial we cannot attribute is "the system decided", which is the exact thing
// the anti invention rule exists to prevent. The rating is pinned to 1 to 5 here as well as by the
// column CHECK, so a bad value is refused before it reaches the network.
export async function writeTestimonial(fields: {
  quote: string;
  name: string;
  trade: string;
  rating: number;
  source?: string | null;
}, createdBy: string, userId: string | null = null): Promise<boolean> {
  if (!fields.quote?.trim() || !fields.name?.trim() || !fields.trade?.trim() || !createdBy) return false;
  if (!Number.isInteger(fields.rating) || fields.rating < 1 || fields.rating > 5) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/testimonials`, {
      method: 'POST',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        quote: fields.quote.trim(),
        name: fields.name.trim(),
        trade: fields.trade.trim(),
        rating: fields.rating,
        source: fields.source?.trim() || null,
        created_by: createdBy,
        // 🔴 WHOSE IT IS, so an erasure can find it. Null for a quote from somebody who is not a
        // Lekhio customer (a review site, a chat at a merchant's counter), which is honest: there
        // is no account to key it to and the console says so. Every testimonial a CUSTOMER writes
        // comes through /api/testimonial, where the id is the session's and cannot be null.
        user_id: userId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CUSTOMER'S OWN TESTIMONIAL. HIS TO WRITE, HIS TO READ BACK, HIS TO TAKE DOWN.
//
// One per account, replaced rather than accumulated: a wall of quotes from one man is not a
// testimonial, it is a comments section, and it gives an erasure more to miss.
//
// ⚠️ IT IS NEVER PUBLISHED BY THE PERSON WHO WROTE IT. writeOwnTestimonial forces published false,
// so what he types is stored and shown back to him and reaches the public homepage only when
// somebody at Lekhio publishes it from the console. Any other arrangement is a text box on the
// front page of lekhio.app that anyone with an account can type into.
//
// ⚠️ AND EVERY ONE OF THESE IS SCOPED BY user_id IN THE QUERY, not by an id handed in. He can read,
// replace and delete HIS, and there is no id he could learn that would reach anyone else's.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface OwnTestimonial {
  id: string;
  quote: string;
  name: string;
  trade: string;
  rating: number;
  published: boolean;
  created_at: string;
}

export async function readOwnTestimonial(userId: string): Promise<OwnTestimonial | null | 'unreadable'> {
  if (!userId) return null;
  const { url } = config();
  try {
    const res = await fetch(
      `${url}/rest/v1/testimonials?user_id=eq.${encodeURIComponent(userId)}` +
      '&select=id,quote,name,trade,rating,published,created_at&order=created_at.desc&limit=1',
      { headers: headers() },
    );
    if (!res.ok) return 'unreadable';
    const rows = (await res.json().catch(() => null)) as OwnTestimonial[] | null;
    if (rows === null) return 'unreadable';
    return rows[0] ?? null;
  } catch {
    return 'unreadable';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE NAME AND THE TRADE ARE READ FROM HIS ACCOUNT HERE, NEVER TAKEN FROM THE FORM.
//
// Two reasons, and the second one is the one that matters.
//
//   1. We already know both. Making a man retype his own name and his own trade into a box, on a
//      product whose whole promise is that it already holds his details, is the product forgetting
//      what it is for.
//
//   2. 🔴 A NAME THAT ARRIVES IN A REQUEST BODY IS A NAME HE CHOSE, NOT A NAME HE HAS. A form that
//      posts `name` lets anyone with an account publish a quote signed as somebody else, and the
//      whole worth of a testimonial is that a real person actually said it. CAP 3.47 and the DMCC
//      Act 2024 ban invented testimonials, and a field the client controls is an invitation to
//      invent one. So the client sends what he WANTS SHOWN, as two booleans, and the server decides
//      what those booleans mean by reading his own row.
//
// ⚠️ SHOWING THE NAME IS A CHOICE AND HIDING IT IS THE SAFE DEFAULT OF THE TWO. Off gives
// "Lekhio user", which is true of everybody who can reach this function and identifies nobody.
// If he asks for his name and we do not hold one, he gets "Lekhio user" as well: an empty by-line
// or an invented one are both worse than an honest anonymous one.
//
// ⚠️ AN EMPTY TRADE RENDERS AS AN EMPTY <small> ON THE HOMEPAGE, which is why hiding it needs no
// change to the front door and produces no stray comma. See app/page.tsx.
//
// 🔴 AND A FAILED CARD READ REFUSES THE SAVE RATHER THAN QUIETLY ANONYMISING HIM.
//
// readIdentityCard answers null for a read that FAILED and an all null card for a row holding
// nothing, which is the distinction its own header exists to protect. Treating the failed read as
// "we hold no name" would take a man who ticked his name ON, showed him his name in the preview,
// and then file a quote signed "Lekhio user" on our own database wobble. Same discipline as
// readNudgePrefs: an unreadable answer refuses the write rather than guessing. If he asked for
// NEITHER we never needed the card, and that save goes through: nothing about him was being read.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The by-line for a man who would rather not be named. True of everybody who can reach this
// function and identifies nobody. Exported because the page shows him this exact word in the
// preview before he saves, and two spellings of it is the preview lying about the result.
export const TESTIMONIAL_ANON = 'Lekhio user';

// What marks a row as HIS WORDS rather than a quote a team member typed in. Exported for the same
// reason: the console filters on it, and a filter on a literal that has drifted shows nothing
// waiting, which looks exactly like nobody having written one.
export const TESTIMONIAL_FROM_CUSTOMER = 'customer';

// 🔴 THE PREVIEW AND THE ROW ARE THE SAME FUNCTION, WHICH IS THE POINT OF IT BEING A FUNCTION.
//
// The page shows him the by-line his two switches will produce before he presses save. If the page
// worked it out and this file worked it out separately, the two would agree today and drift the
// first time either changed, and the failure has a shape: a preview reading his own name over a
// row filed as "Lekhio user", or worse the other way round. Neither is a thing he can see until
// it is on the homepage. So there is one rule and both callers run it.
export function testimonialByline(
  card: IdentityCard | null,
  showName: boolean,
  showTrade: boolean,
): { name: string; trade: string } {
  return {
    name: showName && card?.name?.trim() ? card.name.trim() : TESTIMONIAL_ANON,
    trade: showTrade ? (card?.trade?.trim() || card?.businessName?.trim() || '') : '',
  };
}

export async function writeOwnTestimonial(userId: string, fields: {
  quote: string; rating: number; showName: boolean; showTrade: boolean;
}): Promise<boolean> {
  if (!userId) return false;
  const { url } = config();
  const needsCard = fields.showName || fields.showTrade;
  const card = needsCard ? await readIdentityCard(userId).catch(() => null) : null;
  if (needsCard && card === null) return false;
  const { name, trade } = testimonialByline(card, fields.showName, fields.showTrade);
  try {
    // Replace, not accumulate. His previous one goes first so there is only ever one of him.
    const cleared = await fetch(`${url}/rest/v1/testimonials?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    });
    if (!cleared.ok) return false;
    const res = await fetch(`${url}/rest/v1/testimonials`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        quote: fields.quote,
        name,
        trade,
        rating: fields.rating,
        // 🔴 HOW THE CONSOLE KNOWS ONE IS WAITING. Everything a team member types carries the
        // source THEY chose or null; only this path writes 'customer', so /team can show the ones
        // a real customer sent and has not been approved yet apart from the ones we typed in.
        source: TESTIMONIAL_FROM_CUSTOMER,
        // Who added it. It is him, and saying so is what makes the row honest under CAP 3.47.
        created_by: userId,
        user_id: userId,
        // See the block above. He cannot put himself on the homepage.
        published: false,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteOwnTestimonial(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { url } = config();
  try {
    const res = await fetch(`${url}/rest/v1/testimonials?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// What the PUBLIC homepage shows: only published rows, newest first, mapped into the render shape
// with a tint derived per card. An empty array covers both "nothing published yet" and "the read
// failed", and for the front door that is the right conflation: the section simply hides, which is
// what it did when the array was empty, and a quiet homepage is never a wrong one.
export async function readPublishedTestimonials(): Promise<PublicReview[]> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/testimonials?published=eq.true&select=quote,name,trade,rating&order=created_at.desc`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ quote: string; name: string; trade: string; rating: number }>;
    return rows.map((r, i) => ({
      quote: r.quote,
      name: r.name,
      trade: r.trade,
      rating: r.rating,
      ...TESTIMONIAL_TINTS[i % TESTIMONIAL_TINTS.length],
    }));
  } catch {
    return [];
  }
}

// What /team shows: EVERYTHING, published or not, newest first, with who added it. Null means the
// read failed, which is not the same as "nothing added yet", so the desk can say which.
export async function listTestimonialsForTeam(limit = 100): Promise<TestimonialRow[] | null> {
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/testimonials?select=id,quote,name,trade,rating,source,published,created_by,created_at&order=created_at.desc&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as TestimonialRow[];
  } catch {
    return null;
  }
}

// Hiding or showing one from the desk. Unpublishing takes it off the front door without destroying
// the record that it was said, the same instinct as retiring an announcement rather than deleting it.
export async function setTestimonialPublished(id: string, published: boolean): Promise<boolean> {
  if (!id) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/testimonials?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ published }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Removing one for good. Unlike an announcement, a testimonial that turns out to be mistaken or whose
// permission is withdrawn should leave no trace, so this genuinely deletes rather than hides.
export async function deleteTestimonial(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/testimonials?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { ...headers(), Prefer: 'return=minimal' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- ALLOWANCE ELECTIONS -------------------------------------------------------------------------
//
// The mechanism lib/taxoptimiser.ts rule 4 has been asking for since it was written. It emitted the
// action 'apply_allowance_election' and nothing implemented it, so homeOfficeClaimed was false
// forever and no customer ever claimed a penny of use of home.
//
// ⚠️ THE BAND IS STORED, NEVER THE MONEY. If HMRC moves the flat rate, nothing here goes stale,
// because the rate is read from lib/taxengine.ts at call time and watched nightly by khoji/diff.mjs.
// A rate copied into a second place is a rate that goes wrong in silence: that is how the live
// mileage page came to say 45p while the engine said 55p.

export interface AllowanceElection {
  key: AllowanceElectionKey;
  startYear: number;
  // ⚠️ NULL FOR AN ELECTION THAT HAS NO BAND, AND THE TRADING ALLOWANCE IS ONE.
  //
  // use_of_home stores WHICH BAND he is in, because the claim is a rate per month. The trading
  // allowance stores nothing at all: the row existing IS the election, and the amount comes from
  // FACTS. A nullable column rather than a second table, because the two are the same kind of
  // thing (a choice about one tax year, reversible, his) and the CHECK constraint in the migration
  // ties the shape of the row to its key so a bandless use of home row cannot exist either.
  hoursBand: number | null;
  electedAt: string;
}

// Re-declared rather than imported from lib/elections.ts: this module is the database layer and it
// must not depend on the tax module to know a string. test/tradingallowance.test.mjs pins the two
// unions against each other so they cannot drift apart in silence, the same way persona and
// circumstances are pinned.
export type AllowanceElectionKey = 'use_of_home' | 'trading_allowance';

// Null means NO ELECTION. It does not mean the read failed, and the difference matters: a failed
// read that returned null would silently stop claiming a deduction he elected, and he would never
// know. So a failure throws to the caller's catch rather than being flattened into "he did not
// elect". Callers that cannot tolerate a throw wrap it, and getOptimiserInput does.
export async function readAllowanceElection(
  userId: string,
  key: AllowanceElectionKey,
  startYear: number,
): Promise<AllowanceElection | null> {
  const { url } = config();
  const res = await fetch(
    `${url}/rest/v1/allowance_elections?user_id=eq.${encodeURIComponent(userId)}`
    + `&key=eq.${encodeURIComponent(key)}&start_year=eq.${startYear}`
    + '&select=key,start_year,hours_band,elected_at&limit=1',
    { headers: headers(), signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) throw new Error(`allowance_elections read failed: HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ key: string; start_year: number; hours_band: number | null; elected_at: string }>;
  const r = rows[0];
  if (!r) return null;
  // The key echoed back is the one that was ASKED FOR, never the one the row happens to carry: the
  // query filters on it, so they cannot differ, and trusting the caller's own constant keeps the
  // return type honest without a second validation nobody would read.
  return {
    key,
    startYear: r.start_year,
    hoursBand: r.hours_band === null || r.hours_band === undefined ? null : Number(r.hours_band),
    electedAt: r.elected_at,
  };
}

// Elect, or change the band. Idempotent on (user, key, year), so saying it twice is not an error and
// changing his mind is the same call. The band is validated by the CHECK constraint in the table as
// well as by the caller: two gates, because a bad band would be a wrong figure on a tax return.
export async function writeAllowanceElection(
  userId: string,
  key: AllowanceElectionKey,
  startYear: number,
  hoursBand: number | null,
): Promise<boolean> {
  if (!userId) return false;
  // 🔴 THE SHAPE OF THE ROW HAS TO MATCH ITS KEY, AND IT IS CHECKED HERE AND IN THE DATABASE.
  //
  // Two gates for the same reason the band always had two: a wrong row here is a wrong figure on a
  // tax return. A use_of_home election with no band would claim nothing while looking like a claim,
  // and a trading_allowance row carrying a band would look like it had one rate among several when
  // it has none at all. Both are refused before the request is made and again by the CHECK in
  // supabase/APPLY_2026-08-01_trading_allowance_election.sql.
  if (key === 'use_of_home' && !(hoursBand !== null && [25, 51, 101].includes(hoursBand))) return false;
  if (key === 'trading_allowance' && hoursBand !== null) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/allowance_elections`, {
      method: 'POST',
      headers: {
        ...headers(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId, key, start_year: startYear,
        hours_band: hoursBand, updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// HE CAN TAKE IT BACK. Doc 103: acting for a man is only kindness when it is reversible and it is
// his. An election made in error comes off in one step, and his figures move back the same day.
export async function clearAllowanceElection(
  userId: string,
  key: AllowanceElectionKey,
  startYear: number,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/allowance_elections?user_id=eq.${encodeURIComponent(userId)}`
      + `&key=eq.${encodeURIComponent(key)}&start_year=eq.${startYear}`,
      { method: 'DELETE', headers: { ...headers(), Prefer: 'return=minimal' } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

// --- The login door (web and app) ------------------------------------------
//
// ⚠️ THE MOST VALUABLE ABUSE CONTROL IN THE PRODUCT IS THE NEXT FUNCTION, AND IT IS A LOOKUP.
//
// Every rate limit in the codebase answers "how often", which caps the damage. This one answers
// "is this contact even ours", which changes the shape of the problem: it collapses the attack
// surface from every phone number and address on earth to the small finite list of people who
// already have a Lekhio account. A fraudster cannot pump a number we will not text.
//
// Nothing about the answer is ever shown to the caller. An unknown contact and a known one produce
// the identical screen, because a login page that tells a stranger which numbers are customers is
// a customer list with a search box on it.
export interface KnownContact {
  // The account this contact belongs to, when there is one. Null means we know the contact (a web
  // signup that has not become an account yet) but there is no auth user for it yet.
  userId: string | null;
  // The phone on file, which stays the account key throughout. See attachEmailToAuthUser.
  phone: string | null;
}

// Returns the account, or null when we do not know this contact, or THROWS when we could not read.
//
// 🔴 THE THROW IS DELIBERATE AND THE CALLER MUST NOT SWALLOW IT. "We could not check" is not "he is
// a stranger" and it is not "he is a customer". A read failure that quietly returned null would
// refuse every real customer during a database wobble; one that quietly returned a match would
// hand an attacker the send. The route turns this into "try again in a minute".
export async function findContactAccount(channel: 'sms' | 'email', value: string): Promise<KnownContact | null> {
  const { url } = config();

  if (channel === 'sms') {
    const e164 = normalizeUkPhone(value);
    if (!e164) return null;

    const ures = await fetch(
      `${url}/rest/v1/users?phone_number=eq.${encodeURIComponent(e164)}&select=id,phone_number&limit=1`,
      { headers: headers() },
    );
    if (!ures.ok) throw new Error('contact_lookup_failed');
    const urows = (await ures.json().catch(() => null)) as Array<{ id: string; phone_number: string }> | null;
    if (Array.isArray(urows) && urows[0]) return { userId: urows[0].id, phone: urows[0].phone_number };

    // No account yet, but he may have finished the web signup, which writes a signups row and no
    // auth user. Those people are exactly who the web app exists for, so they must be able to get
    // in. The account is created on a proved code, in /api/auth/verify, never here.
    const sres = await fetch(
      `${url}/rest/v1/signups?phone=eq.${encodeURIComponent(e164)}&select=phone&limit=1`,
      { headers: headers() },
    );
    if (!sres.ok) throw new Error('contact_lookup_failed');
    const srows = (await sres.json().catch(() => null)) as Array<{ phone: string }> | null;
    if (Array.isArray(srows) && srows[0]) return { userId: null, phone: e164 };

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 EMAIL. THIS RESOLVED THROUGH THE PHONE ON THE SIGNUP ROW AND THAT WAS AN ACCOUNT TAKEOVER.
  //
  // It used to read: find the signups row for this address, take the PHONE typed on it, and return
  // whichever account owns that number. The comment above it argued that the phone is the account
  // key so an email must resolve to the same account rather than beside it. The reasoning is right
  // and the implementation was a door.
  //
  // NOBODY PROVES THE PHONE ON A SIGNUPS ROW. It is a number somebody typed into a public form.
  //
  // So: type a stranger's mobile and your own email at /start, prove your own address, and this
  // hands back the stranger's user id. The sign in door then binds your address to his auth user
  // and opens a session on his books. Demonstrated end to end on 29 July 2026 against a test
  // account: the signup did not merely open it, reconcileSignupToUser then wrote the attacker's
  // name over the owner's.
  //
  // ⚠️ THE RULE THAT REPLACES IT: AN EMAIL MAY ONLY RESOLVE TO AN ACCOUNT THROUGH A LINK MADE
  // AFTER THAT EMAIL WAS PROVED.
  //
  // signups.user_id is that link, and it is written in exactly one place: /api/signup/verify, on
  // the far side of a code we emailed and he typed back. Nothing a stranger can type creates it.
  //
  // ⚠️ AND THE COST, WRITTEN DOWN RATHER THAN DISCOVERED. A customer who joined on the phone app
  // has never proved an address to us, so his email will not open this door until he binds one. He
  // signs in with his number, which is the door he has always used. That is a real inconvenience
  // for some people and it is the correct trade: the alternative is a door that a typed digit
  // walks through.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const email = value.trim().toLowerCase();
  if (!email) return null;

  const sres = await fetch(
    `${url}/rest/v1/signups?email=eq.${encodeURIComponent(email)}&user_id=not.is.null` +
      `&select=user_id,phone&order=created_at.desc&limit=1`,
    { headers: headers() },
  );
  if (!sres.ok) throw new Error('contact_lookup_failed');
  const srows = (await sres.json().catch(() => null)) as Array<{ user_id: string | null; phone: string | null }> | null;
  const row = Array.isArray(srows) ? srows[0] : null;
  if (!row?.user_id) return null;

  // ⚠️ THE PHONE COMES BACK FROM THE ACCOUNT, NEVER FROM THE SIGNUP ROW. The caller uses it for
  // nothing but logging today, and the day it is used for anything else it must be a proved number
  // rather than the typed one sitting next to it.
  const ures = await fetch(
    `${url}/rest/v1/users?id=eq.${encodeURIComponent(row.user_id)}&select=id,phone_number&limit=1`,
    { headers: headers() },
  );
  if (!ures.ok) throw new Error('contact_lookup_failed');
  const urows = (await ures.json().catch(() => null)) as Array<{ id: string; phone_number: string | null }> | null;
  const u = Array.isArray(urows) ? urows[0] : null;
  if (!u) return null;
  return { userId: u.id, phone: u.phone_number ?? '' };
}

// 🔴 THE ONE THAT COULD ACTUALLY SPLIT A MAN'S BOOKS IN TWO.
//
// Supabase treats a phone identity and an email identity as separate things. Sign a man up by phone
// in the app, then let him sign in by email on the web, and the naive implementation gives him TWO
// auth users and therefore TWO accounts. His WhatsApp receipts land on one and his web session
// shows the other. Both look like they are working. He would find out at his tax return.
//
// So the email door never creates anything. It finds the EXISTING account by phone and attaches the
// address to that auth user, which makes GoTrue resolve the email OTP to the same person. Called
// only after the address has been matched to an account we already hold.
export async function attachEmailToAuthUser(userId: string, email: string): Promise<boolean> {
  const { url, key } = config();
  if (!userId || !email) return false;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      // email_confirm, because the address is not being asserted by a stranger: it was already on
      // his own signup record, and he is about to prove he can read it by returning the code.
      body: JSON.stringify({ email, email_confirm: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// One row per code we were asked to send, so the login door has a cost we can see and an attack has
// evidence. NEVER the number or the address: lib/logindoor.ts hashes it first.
export async function logAuthSend(
  channel: 'sms' | 'email',
  targetHash: string,
  outcome: 'sent' | 'refused_unknown' | 'refused_capped' | 'refused_rate' | 'failed',
): Promise<void> {
  if (!targetHash) return;
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/auth_sends`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ channel, target_hash: targetHash, outcome }),
    });
  } catch {
    // Evidence, not a gate. A man must never fail to sign in because the audit write did.
  }
}

// Ninety days of hashed login attempts is enough to investigate an incident and short enough that
// we are not keeping a record of every sign in for ever. Called from the daily cron beside
// sweepRateHits, so it is wired rather than sitting here waiting for someone to remember it.
export async function sweepAuthSends(): Promise<void> {
  try {
    const { url } = config();
    await fetch(`${url}/rest/v1/rpc/auth_sends_sweep`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({}),
    });
  } catch {
    // Housekeeping. Never worth failing a cron over.
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE YOU SURFACE, 31 July 2026. Who we think he is, and the email bind. APPENDED, per the
// append only rule: nothing above this line was touched.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// What the You page prints about him, in one round trip. name, the trade, the business name and
// the WhatsApp binding all live on his users row, and four separate readers would be four round
// trips to draw one card. Null means WE COULD NOT READ, which the page must tell apart from a row
// with empty fields: "we hold nothing about you" and "we could not check" are different sentences.
export interface IdentityCard {
  name: string | null;
  businessName: string | null;
  // users.trade_type holds the TRADE ('electrician', 'plumber'), despite the name. The signups
  // table has a column of the same name holding the STRUCTURE, which is a trap this comment exists
  // to mark. The structure lives in users.business_type and is read by getBusinessProfile.
  trade: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
}

export async function readIdentityCard(userId: string): Promise<IdentityCard | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}` +
        `&select=name,business_name,trade_type,phone_number,phone_verified_at&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{
      name: string | null; business_name: string | null; trade_type: string | null;
      phone_number: string | null; phone_verified_at: string | null;
    }> | null;
    if (!Array.isArray(rows)) return null;
    const r = rows[0];
    if (!r) return { name: null, businessName: null, trade: null, phone: null, phoneVerifiedAt: null };
    return {
      name: r.name ?? null,
      businessName: r.business_name ?? null,
      trade: r.trade_type ?? null,
      phone: r.phone_number ?? null,
      phoneVerifiedAt: r.phone_verified_at ?? null,
    };
  } catch {
    return null;
  }
}

// One user's reminder preferences, with the three states kept apart.
//
// ⚠️ 'none' AND null ARE DIFFERENT, AND THE SETTINGS ROUTE DEPENDS ON THE DIFFERENCE.
//
// getNudgePrefsForUsers answers with an empty map both when the row does not exist and when the
// read failed, which is fine for a cron deciding who to text and WRONG for a settings write. The
// write merges the field he changed over the fields he did not, so it has to read first, and a
// failed read treated as "the defaults" would quietly turn a man's old opt out back ON, on our own
// database wobble. Under PECR an opt out has to be honoured, so an unreadable answer here refuses
// the save rather than guessing. 'none' means he has never touched the switches, which really does
// mean the defaults.
export async function readNudgePrefs(
  userId: string,
): Promise<{ daily_nudges: boolean; weekly_summary: boolean } | 'none' | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/reminder_prefs?user_id=eq.${encodeURIComponent(userId)}` +
        `&select=daily_nudges,weekly_summary&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{
      daily_nudges: boolean | null; weekly_summary: boolean | null;
    }> | null;
    if (!Array.isArray(rows)) return null;
    if (rows.length === 0) return 'none';
    return {
      daily_nudges: rows[0].daily_nudges !== false,
      weekly_summary: rows[0].weekly_summary !== false,
    };
  } catch {
    return null;
  }
}

// ── The email bind. The delicate one. Read the whole header before touching anything. ────────
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE 29 JULY TAKEOVER FIX IS THE LAW OF THIS SECTION.
//
// An email may only resolve to an account through a link made AFTER the address was proved, and
// signups.user_id is that link. findContactAccount's own header tells the story of the door this
// replaced: resolve an address through the PHONE TYPED ON A SIGNUP ROW and a stranger's typed
// digit hands his books over. Demonstrated end to end on 29 July 2026.
//
// These two functions serve /api/you/email, where a SIGNED IN man with no proved address adds
// one. The proof is a code we emailed and he typed back, so by the time bindProvedEmailToUser
// runs, the address is proved and the session says whose account it joins. The rules:
//
//   . A CONTACT THAT IS ANOTHER ACCOUNT'S IS REFUSED, NEVER MOVED. provedEmailOwner answers who
//     holds the proved link today, and 'another' is a refusal at every step. The link write below
//     only ever touches rows whose user_id is NULL, so even a bug in the caller could not re-point
//     a link that already exists.
//   . BINDING NEVER CREATES AN ACCOUNT. No auth user is minted here and no users row is written.
//     The GoTrue write is a PUT on the auth user the session already proved.
//   . AN UNREADABLE ANSWER IS A REFUSAL. Fail closed, unlike the abuse limiters: guessing about
//     ownership is how a takeover happens politely.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type EmailOwner = 'another' | 'his' | 'nobody';

// Who holds the proved link for this address today. 'another' refuses the bind, 'his' means the
// link exists already and pointing GoTrue at it is all that is left, 'nobody' means the address
// has never been proved into an account. Null means we could not read, WHICH IS NOT 'nobody': the
// caller refuses and says try again, because a database wobble must never look like a clean sheet
// on the one check that keeps another man's address out of this account.
export async function provedEmailOwner(userId: string, email: string): Promise<EmailOwner | null> {
  const addr = (email ?? '').trim().toLowerCase();
  if (!userId || !addr) return null;
  try {
    const { url } = config();
    // Only rows carrying a proved link. An unlinked signups row is a form somebody filled in, and
    // it has no owner to defend or to leak.
    const res = await fetch(
      `${url}/rest/v1/signups?email=eq.${encodeURIComponent(addr)}&user_id=not.is.null` +
        `&select=user_id&limit=10`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ user_id: string | null }> | null;
    if (!Array.isArray(rows)) return null;
    if (rows.some((r) => r.user_id && r.user_id !== userId)) return 'another';
    return rows.length > 0 ? 'his' : 'nobody';
  } catch {
    return null;
  }
}

export type EmailBindOutcome = 'bound' | 'taken' | 'failed';

// Attach a PROVED address to the session's own auth user and signups row. Called only by
// /api/you/email/verify, on the far side of the code.
//
// ⚠️ NOT attachEmailToAuthUser, AND THE DIFFERENCE IS THE HONEST SENTENCE. That function folds
// every failure into false, which is right for its caller: the sign in door treats any failure
// identically. Here 'taken' and 'failed' are different sentences to a man's face. GoTrue refuses
// an address another auth user holds with a conflict status, and that refusal IS the second half
// of the never moved rule: even if the signups read above missed something, the auth store will
// not hold one address on two accounts.
//
// ⚠️ 'bound' IS ONLY SAID WHEN THE SIGNUPS LINK IS CONFIRMED. The email sign in door resolves an
// address through signups.user_id (findContactAccount), so GoTrue holding the address without the
// link would be a bind that looks done and a door that stays shut. A 'failed' here after the
// GoTrue write is safe to retry: the PUT is idempotent for the same address on the same user.
export async function bindProvedEmailToUser(userId: string, email: string): Promise<EmailBindOutcome> {
  const addr = (email ?? '').trim().toLowerCase();
  if (!userId || !addr) return 'failed';
  let url = '';
  let key = '';
  try {
    ({ url, key } = config());
  } catch {
    return 'failed';
  }

  // 1. The auth user the session proved, and no other. email_confirm is a true statement: the
  //    code was typed back from this inbox minutes ago.
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ email: addr, email_confirm: true }),
    });
  } catch {
    return 'failed';
  }
  if (!res.ok) {
    // GoTrue answers a duplicate address with a conflict. 409 and 422 are both seen in the wild,
    // so both read as taken. Anything else is our infrastructure, and he is told to try again.
    return res.status === 409 || res.status === 422 ? 'taken' : 'failed';
  }

  // 2. The proved link, through the ONE function that already writes it. setSignupUserId patches
  //    only rows whose user_id is null, which is the never moved rule enforced in the query
  //    itself: a link that exists is a link this write cannot touch.
  await setSignupUserId(addr, userId);

  // 3. Confirm the link is really there, and lay one down if the address never had a signups row
  //    at all, which is every phone app customer who signed up before the web form existed.
  //    reconciled_at is set on the fresh row because it carries no answers to reconcile, and an
  //    empty row left unreconciled would be picked up by reconcileSignupToUser and mark itself
  //    against a future real signup.
  try {
    const check = await fetch(
      `${url}/rest/v1/signups?email=eq.${encodeURIComponent(addr)}` +
        `&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
      { headers: headers() },
    );
    if (check.ok) {
      const rows = (await check.json().catch(() => null)) as unknown[] | null;
      if (Array.isArray(rows) && rows.length > 0) return 'bound';
    }
    const ins = await fetch(`${url}/rest/v1/signups`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        phone: '', email: addr, user_id: userId, reconciled_at: new Date().toISOString(),
      }),
    });
    return ins.ok ? 'bound' : 'failed';
  } catch {
    return 'failed';
  }
}

// --- THE JOBS DIARY AND GOALS ---------------------------------------------------------------
//
// The tables behind /app/diary and /app/goals, per supabase/APPLY_2026-07-31_diary_goals.sql.
// Both are service role only (RLS enabled, no policies), so tenancy is enforced the way every
// read in this file enforces it: the user_id filter is in the query, and the id of a row action
// never arrives from anywhere but a session scoped call site. Every mutating accessor here
// carries BOTH filters, user and row, so another man's uuid pasted into a form body matches
// nothing and changes nothing. test/diarygoals.test.mjs pins that shape.
//
// ⚠️ LIST READS RETURN null ON FAILURE AND [] ON EMPTY, and the difference is the page's whole
// honesty. With the migration not yet run, the read fails, and the page must say "we could not
// read your diary just now" rather than showing a man an empty diary he did not empty. The same
// rule readAllowanceElection states at length: a failed read is never a fact about him.

export interface DiaryJobDbRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  customer_name: string | null;
  status: string;
  created_at: string;
}

const DIARY_COLS = 'id,title,starts_at,ends_at,customer_name,status,created_at';

export async function listDiaryJobs(userId: string): Promise<DiaryJobDbRow[] | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/diary_jobs?user_id=eq.${encodeURIComponent(userId)}`
      + `&select=${DIARY_COLS}&order=starts_at.asc&limit=500`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as DiaryJobDbRow[];
  } catch {
    return null;
  }
}

// One of HIS rows, or null, whether missing or unreadable. Used by the draft action, where the
// customer name for the invoice prefill must come from the row we hold, never from a form field
// that could carry anything.
export async function readDiaryJob(userId: string, jobId: string): Promise<DiaryJobDbRow | null> {
  if (!userId || !UUID.test(jobId)) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/diary_jobs?user_id=eq.${encodeURIComponent(userId)}`
      + `&id=eq.${encodeURIComponent(jobId)}&select=${DIARY_COLS}&limit=1`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as DiaryJobDbRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function addDiaryJob(
  userId: string,
  job: { title: string; startsAt: string; endsAt: string; customerName: string | null },
): Promise<boolean> {
  if (!userId || !job.title) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/diary_jobs`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: userId,
        title: job.title,
        starts_at: job.startsAt,
        ends_at: job.endsAt,
        customer_name: job.customerName,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ⚠️ return=representation, NOT return=minimal, AND IT IS THE TENANCY ANSWER. A PATCH whose
// filters match nothing still comes back 204 under return=minimal, so a stranger's uuid would
// "succeed" while changing nothing, and the page would say Done over a job that is not his and
// was not touched. Asking for the rows back makes zero matches a false, which the route turns
// into an honest "we could not find that job".
export async function setDiaryJobStatus(
  userId: string,
  jobId: string,
  status: 'planned' | 'done' | 'invoiced',
): Promise<boolean> {
  if (!userId || !UUID.test(jobId)) return false;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/diary_jobs?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(jobId)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

// A real delete of his own row, both filters in the URL, and representation asked for so
// deleting nothing reads as the false it is.
export async function deleteDiaryJob(userId: string, jobId: string): Promise<boolean> {
  if (!userId || !UUID.test(jobId)) return false;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/diary_jobs?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(jobId)}`,
      { method: 'DELETE', headers: headers({ Prefer: 'return=representation' }), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export interface GoalDbRow {
  id: string;
  kind: string;
  label: string;
  amount_pence: number | null;
  target_date: string | null;
  status: string;
  created_at: string;
}

const GOAL_COLS = 'id,kind,label,amount_pence,target_date,status,created_at';

export async function listGoals(userId: string): Promise<GoalDbRow[] | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/goals?user_id=eq.${encodeURIComponent(userId)}`
      + `&select=${GOAL_COLS}&order=created_at.asc&limit=200`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as GoalDbRow[];
  } catch {
    return null;
  }
}

export async function addGoal(
  userId: string,
  goal: { kind: string; label: string; amountPence: number | null; targetDate: string | null },
): Promise<boolean> {
  if (!userId || !goal.kind || !goal.label) return false;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/goals`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: userId,
        kind: goal.kind,
        label: goal.label,
        amount_pence: goal.amountPence,
        target_date: goal.targetDate,
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Same two filter, representation asked for shape as setDiaryJobStatus, for the same tenancy
// reason.
export async function setGoalStatus(userId: string, goalId: string, status: 'open' | 'done'): Promise<boolean> {
  if (!userId || !UUID.test(goalId)) return false;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/goals?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(goalId)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ status }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function deleteGoal(userId: string, goalId: string): Promise<boolean> {
  if (!userId || !UUID.test(goalId)) return false;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/goals?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(goalId)}`,
      { method: 'DELETE', headers: headers({ Prefer: 'return=representation' }), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

// --- THE LEGACY GOAL DOORS, REPOINTED AT THE ONE STORE -----------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE GOALS STORE, DECIDED BY THE FOUNDER, 31 JULY 2026. These three functions are the doors
// doc 82 built for WhatsApp and Rakha (set a goal in chat, list them, "goal done") and for two
// weeks they wrote public.user_goals while the web wrote public.goals: two tables that both meant
// "what he is saving for", which is the house disease with a savings account. The diary_goals
// migration file said out loud that the founder would decide the reconciliation, and he has:
// public.goals wins, so every door here now walks through the wave three accessors above
// (listGoals, addGoal, setGoalStatus) and user_goals is read only legacy until launch two. The
// unreleased phone app may keep reading it; nothing on the server writes it any more, and
// test/goalstore.test.mjs fails the build if a writer ever comes back.
//
// ⚠️ THE CALLERS DID NOT MOVE. The WhatsApp webhook, the optimiser, Rakha's walk and the on
// demand reassess all still speak doc 82's tongue (kinds purchase, income, savings; pounds), so
// each door translates at the threshold with the two honest mappings in lib/goals.ts, written
// once and pinned there. Pounds become pence on the way in and pence become pounds on the way
// out, always by one hundred, never rounded twice.
//
// ⚠️ A GOAL WITHOUT A FIGURE IS NOT RETURNED HERE. Every doc 82 reader divides by the amount or
// compares against it, because the legacy table required one. The goals table honestly allows a
// goal with no figure, and handing such a row to goalAnswer would print a progress bar against
// £NaN. So the web page shows every goal, and these doors show the ones their readers can do
// arithmetic on.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface ActiveGoal {
  id: string;
  kind: LegacyGoalKind;
  title: string;
  amount: number;
  target_date: string | null;
}

// Open goals in doc 82's shape: newest first, capped at ten, exactly the order and cap the
// user_goals read always had, so no caller's behaviour moves. A failed read stays [] here, the
// old contract: every consumer treats "no goals" as a quiet day, never as a fact to announce.
export async function getActiveGoals(userId: string): Promise<ActiveGoal[]> {
  const rows = await listGoals(userId);
  if (rows === null) return [];
  return rows
    .filter((r) => r.status === 'open' && isGoalKind(r.kind) && Number.isFinite(Number(r.amount_pence)) && Number(r.amount_pence) > 0)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      kind: toLegacyKind(r.kind as Parameters<typeof toLegacyKind>[0]),
      title: r.label,
      amount: Number(r.amount_pence) / 100,
      target_date: r.target_date,
    }));
}

// Create a goal from WhatsApp ("my goal is a van for 24k"). The title is the user's own words
// and lands in label untouched; the kind crosses fromLegacyKind, so a chat "purchase" is stored
// as the honest 'other', never guessed into 'van'. WhatsApp asks no target date, so none is set.
export async function insertUserGoal(
  userId: string,
  goal: { kind: LegacyGoalKind; title: string; amount: number },
): Promise<boolean> {
  if (!Number.isFinite(goal.amount) || goal.amount <= 0) return false;
  return addGoal(userId, {
    kind: fromLegacyKind(goal.kind),
    label: goal.title,
    amountPence: Math.round(goal.amount * 100),
    targetDate: null,
  });
}

// "goal done": marks the newest open goal done, the least surprising rule when chat has no
// picker. Newest OPEN goal across the one store, so a goal he set on the web closes the same way
// a goal he texted does; the app manages individual goals precisely. Returns the label for the
// celebration line, or null when there is nothing open or the write failed.
export async function completeLatestGoal(userId: string): Promise<string | null> {
  const rows = await listGoals(userId);
  if (rows === null) return null;
  const open = rows
    .filter((r) => r.status === 'open')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (open.length === 0) return null;
  const done = await setGoalStatus(userId, open[0].id, 'done');
  return done ? open[0].label : null;
}

// --- RECEIPT IMAGES, KEPT AS EVIDENCE ----------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The photograph a man sends of a receipt used to be read by the model and thrown away, which
// meant the one piece of evidence HMRC would actually want to see survived only as our reading
// of it. These helpers put the image in the PRIVATE receipts bucket (created in
// supabase/APPLY_2026-07-31_goals_consolidation.sql) and hand back the path that goes into the
// transaction row's raw_input_url, the column docs/03 reserved for exactly this.
//
// 🔴 THE BUCKET IS PRIVATE AND THE PATH IS NOT A LINK. No public URL exists or is ever built
// here: raw_input_url holds `receipts/<user id>/<file>`, which only the service role can turn
// into bytes. A public bucket of receipts would be a directory of every customer's spending,
// which doc 97 forbade in writing.
//
// ⚠️ STORAGE IS EVIDENCE, NEVER A DEPENDENCY. Every caller must treat a null from
// storeReceiptImage as "no image kept" and carry on to the figures: a lost image must never
// lose the numbers, because the numbers are what his tax is prepared from.
//
// ⚠️ PATH BUILDING IS PURE AND SEPARATE so test/receiptstore.test.mjs can attack it without a
// network: the user id is the folder (scoping every object to its owner), the extension comes
// off the allowlisted media type or the upload is refused, and the nonce keeps two receipts
// photographed the same day from colliding.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export const RECEIPTS_BUCKET = 'receipts';

// The extension for an allowlisted image type, or null. Unknown types are refused, never
// guessed: an extension invented from a mystery media type would be a lie in a filename.
export function receiptFileExtension(mediaType: string): string | null {
  const t = (mediaType || '').toLowerCase().split(';')[0].trim();
  if (t === 'image/jpeg' || t === 'image/jpg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  if (t === 'image/gif') return 'gif';
  return null;
}

// `receipts/<user id>/<day>-<nonce>.<ext>`, or null when any piece fails its shape. The user id
// folder is the tenancy: every object names its owner in its path, so a per user wipe or export
// is one prefix. The day is for a human reading the bucket, the nonce is for uniqueness.
export function receiptStoragePath(
  userId: string,
  mediaType: string,
  dayISO: string,
  nonce: string,
): string | null {
  if (!UUID.test(userId)) return null;
  const ext = receiptFileExtension(mediaType);
  if (!ext) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayISO)) return null;
  const clean = (nonce || '').replace(/[^a-z0-9-]/gi, '').slice(0, 36);
  if (!clean) return null;
  return `${RECEIPTS_BUCKET}/${userId}/${dayISO}-${clean}.${ext}`;
}

// Upload the bytes, return the raw_input_url path, or null on ANY failure. Null and never a
// throw, so no capture route can lose a man's figures over our storage having a bad minute.
export async function storeReceiptImage(
  userId: string,
  bytes: Uint8Array<ArrayBuffer>,
  mediaType: string,
): Promise<string | null> {
  const storagePath = receiptStoragePath(
    userId,
    mediaType,
    new Date().toISOString().slice(0, 10),
    globalThis.crypto.randomUUID(),
  );
  if (!storagePath) return null;
  // The same ceiling the web route enforces, repeated here so no future caller can push a video
  // sized blob into the bucket by skipping the route's check.
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024) return null;
  try {
    const { url, key } = config();
    const res = await fetch(`${url}/storage/v1/object/${storagePath}`, {
      method: 'POST',
      // Not headers(): the body is the image, so the content type must be the image's own.
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': mediaType },
      body: bytes,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return storagePath;
  } catch {
    return null;
  }
}

// --- INVOICES, READ AND KEPT STRAIGHT BY THEIR OWNER -------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// /app/invoices used to read through exportUserData, the UK GDPR export, because no scoped list
// existed: it over fetched every table a man has and could not tell a failed invoices query from
// an empty one. readInvoices is the one small function that page header asked for, with the
// diary's honesty contract: null on a failed read, [] only when the table really is empty,
// because "no invoices yet" and "we could not look" are different sentences about a man's money.
//
// The two mark functions record HIS statements about HIS invoice: that he sent it, that it was
// paid. Same tenancy shape as the diary and goals accessors above: user filter AND row filter in
// every query, representation asked for so zero matches reads as the false it is, and the row id
// only ever arrives from a session scoped call site with the id in the form body.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface InvoiceListDbRow {
  id: string;
  number: string;
  customer_name: string | null;
  total: number | string;
  status: string;
  issued_date: string | null;
  due_date: string | null;
  created_at: string;
}

const INVOICE_LIST_COLS = 'id,number,customer_name,total,status,issued_date,due_date,created_at';

// Every invoice this user has, newest first (the index invoices_user_created_idx carries it).
// Null on failure, never [], the whole reason this function exists.
export async function readInvoices(userId: string): Promise<InvoiceListDbRow[] | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}`
      + `&select=${INVOICE_LIST_COLS}&order=created_at.desc&limit=500`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as InvoiceListDbRow[];
  } catch {
    return null;
  }
}

// He sent the invoice himself, from his own phone, and is telling us so. A statement of fact
// about his own business: no message leaves here and nothing reaches his customer. Idempotent in
// the direction of truth: saying "sent" about an invoice already sent, or already paid, is not
// false and returns true without touching anything, because paid outranks sent and must never be
// walked back by a stale form.
export async function markInvoiceSentByOwner(userId: string, invoiceId: string): Promise<boolean> {
  if (!userId || !UUID.test(invoiceId)) return false;
  try {
    const { url } = config();
    // HIS row or nothing: both filters, so a stranger's uuid reads as absent, not as forbidden.
    const read = await fetch(
      `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}`
      + `&id=eq.${encodeURIComponent(invoiceId)}&select=status&limit=1`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!read.ok) return false;
    const rows = (await read.json()) as Array<{ status: string }>;
    if (rows.length === 0) return false;
    if (rows[0].status !== 'draft') return true; // already sent, or paid, which outranks sent
    const res = await fetch(
      `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}`
      + `&id=eq.${encodeURIComponent(invoiceId)}&status=eq.draft`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'sent' }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return false;
    const updated = (await res.json()) as unknown[];
    return updated.length > 0;
  } catch {
    return false;
  }
}

// The customer paid him, he is telling us so, and the books must agree: the same flip and the
// same one time income booking the Stripe webhook path (markInvoicePaidServer) performs, so a
// bank transfer and a card payment leave identical records. His press IS the approval: asking
// him to confirm his own statement in Things to check would be making him say one fact twice.
//
// 🔴 THE INCOME IS BOOKED AT MOST ONCE. The flip filters on status=neq.paid and asks for the
// rows back, exactly the atomic gate the Stripe path uses, so this racing a webhook (or a double
// press) can only book the income on whichever write actually flipped the row.
export async function markInvoicePaidByOwner(userId: string, invoiceId: string): Promise<boolean> {
  if (!userId || !UUID.test(invoiceId)) return false;
  try {
    const { url } = config();
    const read = await fetch(
      `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}`
      + `&id=eq.${encodeURIComponent(invoiceId)}&select=number,customer_name,total,status&limit=1`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!read.ok) return false;
    const rows = (await read.json()) as Array<{
      number: string;
      customer_name: string;
      total: number | string;
      status: string;
    }>;
    if (rows.length === 0) return false;
    const inv = rows[0];
    if (inv.status === 'paid') return true; // his statement is already the record

    const up = await fetch(
      `${url}/rest/v1/invoices?user_id=eq.${encodeURIComponent(userId)}`
      + `&id=eq.${encodeURIComponent(invoiceId)}&status=neq.paid`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!up.ok) return false;
    const updated = (await up.json()) as unknown[];
    if (updated.length === 0) return true; // another delivery flipped it and booked the income

    await insertTransaction({
      user_id: userId,
      vendor: inv.customer_name,
      amount: Math.abs(Number(inv.total) || 0),
      category: 'income',
      transaction_date: new Date().toISOString().slice(0, 10),
      source_type: 'invoice',
      description: `Invoice ${inv.number}`,
      // Confirmed because HE said it, in one press, about his own money. The gate exists for
      // machine readings; a man's own statement is the approval itself.
      confirmed: true,
    }).catch((e) => console.error('[markInvoicePaidByOwner] income insert failed:', e instanceof Error ? e.message : e));
    return true;
  } catch {
    return false;
  }
}

// --- The Lekhio thread (31 July 2026, APPLY_2026-07-31_thread.sql; widened to the chat list
// the same day, APPLY_2026-07-31_chats.sql) ---------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The storage for /app/thread and /api/thread. The surface grew from one standing thread into
// a DM style chat list the same day it shipped: every conversation a row, a button that starts
// a fresh Lekhio chat, and Rakha's flags read alongside. The ANSWERING machinery is not here
// and must never be: the thread answers with the same intents and the same guarded AI path as
// WhatsApp, and this block only stores and fetches the words.
//
// ⚠️ TENANCY IS ENFORCED IN EVERY QUERY, TWICE OVER. The service role bypasses RLS, so every
// read and write here filters on user_id from the session, per this file's rule. And a write
// into a conversation id verifies the conversation is THIS user's Lekhio chat before a row
// is inserted, the conversationOwnedBy shape, so a crafted or borrowed id can never attach a
// message to another man's chat. The chat view's ids arrive inside a sealed reference
// (app/app/chatref.ts) already checked against the session; this is the belt under that brace.
//
// ⚠️ THE RAKHA READS ARE READ ONLY BY CONSTRUCTION. rakhaFlagsForUser and rakhaFlagForUser
// fetch and never write: no PATCH, no POST, no dismiss. The rows are the nightly walk's own
// agent_signals, whose payload carries Rakha's rendered words (title and body, the why), so
// what a man reads on the chat surface is what Rakha computed, never a re-derivation.
//
// ⚠️ THE BLOCK IS SELF CONTAINED ON PURPOSE: config(), headers() and fetch, nothing else, so
// test/thread.test.mjs can stage it with a recording fetch and ATTACK the tenancy scoping at
// runtime. Keep it that way, and keep the end marker below it.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The uuid shape gate this block applies before any id is spliced into a query path. The chat
// list's one in-URL id (inside chatref's sealed claim) is checked at mint AND verify, so this
// is the third fence, and it exists because a query built by splicing must never trust a string.
const CHAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatListRow {
  id: string;
  kind: string; // 'lekhio' | 'puchio' as stored; a string so an unknown future kind still lists
  title: string;
  last_message_at: string;
  created_at: string;
  // The newest turn, for the DM row's one line preview. Null when the chat is empty.
  last: { role: string; content: string } | null;
}

// Every conversation this user can go back and look at, newest activity first, each with its
// latest line. ONE round trip: the last line rides along as an embedded, ordered, limited read
// rather than a query per row. Null means the read failed and the page must say so; [] means
// he genuinely has no chats yet.
export async function listChatsForUser(userId: string, limit = 40): Promise<ChatListRow[] | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const uid = encodeURIComponent(userId);
    // messages.user_id is filtered as well as conversations.user_id: the join already scopes
    // the embed to his conversations, and the second filter makes that true twice.
    const res = await fetch(
      `${url}/rest/v1/conversations?user_id=eq.${uid}&select=id,kind,title,last_message_at,created_at,messages(role,content)` +
        `&messages.user_id=eq.${uid}&messages.order=created_at.desc&messages.limit=1` +
        `&order=last_message_at.desc&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{
      id?: string; kind?: string; title?: string; last_message_at?: string; created_at?: string;
      messages?: Array<{ role?: string; content?: string }>;
    }> | null;
    if (!Array.isArray(rows)) return null;
    return rows
      .filter((r) => typeof r.id === 'string')
      .map((r) => ({
        id: String(r.id),
        kind: String(r.kind ?? ''),
        title: String(r.title ?? ''),
        last_message_at: String(r.last_message_at ?? ''),
        created_at: String(r.created_at ?? ''),
        last:
          Array.isArray(r.messages) && r.messages[0]
            ? { role: String(r.messages[0].role ?? ''), content: String(r.messages[0].content ?? '') }
            : null,
      }));
  } catch {
    return null;
  }
}

// One chat's own row, so the view knows its kind and title before drawing anything. Scoped by
// user_id as well as id. Null means the read failed; [] means no such chat is his, and the
// view sends him back to the list exactly as it would for a stale reference.
export async function chatForUser(
  userId: string,
  conversationId: string,
): Promise<Array<{ id: string; kind: string; title: string }> | null> {
  if (!userId || !CHAT_UUID.test(conversationId)) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,kind,title&limit=1`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ id?: string; kind?: string; title?: string }> | null;
    if (!Array.isArray(rows)) return null;
    return rows.map((r) => ({ id: String(r.id ?? ''), kind: String(r.kind ?? ''), title: String(r.title ?? '') }));
  } catch {
    return null;
  }
}

export interface ChatMessageRow {
  id: string;
  role: string; // 'user' | 'puchio' | 'lekhio' as stored
  content: string;
  created_at: string;
}

// The turns of ONE chat, any kind, oldest first so the newest sits at the bottom of the page.
// Newest first with the limit, then reversed, so a long chat keeps its most recent turns
// rather than its oldest. Filtered by user_id AS WELL AS conversation_id: the id came out of a
// sealed reference already checked against the session, and the second filter makes a poisoned
// id harmless anyway. Null means the read failed and the page must say so.
export async function chatMessagesForUser(
  userId: string,
  conversationId: string,
  limit = 200,
): Promise<ChatMessageRow[] | null> {
  if (!userId || !CHAT_UUID.test(conversationId)) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/messages?user_id=eq.${encodeURIComponent(userId)}&conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,role,content,created_at&order=created_at.desc&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as ChatMessageRow[] | null;
    if (!Array.isArray(rows)) return null;
    return rows.reverse();
  } catch {
    return null;
  }
}

// What starting a new chat came back with. 'blocked' is its own answer because it is its own
// truth: the database still enforces one Lekhio thread per user (the v1 partial unique index,
// dropped by APPLY_2026-07-31_chats.sql), and the page owes the man that sentence rather than
// a generic try-again.
export type NewChatResult = { ok: true; id: string } | { ok: false; blocked: boolean };

// Start a NEW Lekhio chat for this user.
//
// 🔴 HONEST WHEN THE MIGRATION HAS NOT RUN. Until APPLY_2026-07-31_chats.sql drops the
// one-thread index, this insert is refused (409) for any account that already has its standing
// thread. The refusal comes back as blocked and the page says so plainly. It NEVER quietly
// reuses an existing chat: a man who pressed "Start a new chat" and was handed his old one
// would be talking into a chat he did not choose.
export async function createLekhioChat(userId: string): Promise<NewChatResult> {
  if (!userId) return { ok: false, blocked: false };
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/conversations`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=representation' }),
      body: JSON.stringify({ user_id: userId, kind: 'lekhio', title: 'New chat' }),
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 409) return { ok: false, blocked: true };
    if (!res.ok) return { ok: false, blocked: false };
    const rows = (await res.json().catch(() => null)) as Array<{ id?: string }> | null;
    return Array.isArray(rows) && rows[0]?.id
      ? { ok: true, id: String(rows[0].id) }
      : { ok: false, blocked: false };
  } catch {
    return { ok: false, blocked: false };
  }
}

export interface RakhaFlagRow {
  id: string;
  signal_key: string;
  title: string;
  body: string; // Rakha's stored why, the payload the nightly walk rendered
  created_at: string;
}

function rakhaRow(r: { id?: string; signal_key?: string; payload?: unknown; created_at?: string }): RakhaFlagRow | null {
  if (!r || typeof r.id !== 'string') return null;
  const p = (r.payload ?? {}) as { title?: unknown; body?: unknown };
  const title = typeof p.title === 'string' ? p.title : '';
  if (!title) return null; // a row without its rendered words has nothing honest to show
  return {
    id: r.id,
    signal_key: String(r.signal_key ?? ''),
    title,
    body: typeof p.body === 'string' ? p.body : '',
    created_at: String(r.created_at ?? ''),
  };
}

// What Rakha has flagged for this account, newest first, not dismissed. READ ONLY: this
// surface shows the suggestion and its stored why and changes nothing. Null means the read
// failed and the list says so quietly; [] means Rakha has nothing flagged.
export async function rakhaFlagsForUser(userId: string, limit = 20): Promise<RakhaFlagRow[] | null> {
  if (!userId) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/agent_signals?user_id=eq.${encodeURIComponent(userId)}&dismissed_at=is.null&select=id,signal_key,payload,created_at&order=created_at.desc&limit=${limit}`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ id?: string; signal_key?: string; payload?: unknown; created_at?: string }> | null;
    if (!Array.isArray(rows)) return null;
    return rows.map(rakhaRow).filter((r): r is RakhaFlagRow => r !== null);
  } catch {
    return null;
  }
}

// One flagged row, scoped by user_id as well as id, for the read only Rakha view. Null means
// the read failed; [] means nothing of his answers to that id, and the view goes back to the
// list the same way a stale reference does.
export async function rakhaFlagForUser(userId: string, signalId: string): Promise<RakhaFlagRow[] | null> {
  if (!userId || !CHAT_UUID.test(signalId)) return null;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/agent_signals?id=eq.${encodeURIComponent(signalId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,signal_key,payload,created_at&limit=1`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ id?: string; signal_key?: string; payload?: unknown; created_at?: string }> | null;
    if (!Array.isArray(rows)) return null;
    return rows.map(rakhaRow).filter((r): r is RakhaFlagRow => r !== null);
  } catch {
    return null;
  }
}

// Store one turn. Returns false rather than throwing, so the route can tell the user plainly
// that nothing was saved instead of pretending.
export async function saveLekhioThreadMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'lekhio',
  content: string,
): Promise<boolean> {
  const text = (content || '').trim();
  if (!userId || !conversationId || !text) return false;
  try {
    const { url } = config();

    // 🔴 OWNERSHIP FIRST. The insert below carries a conversation id, and an id is a claim, not
    // a fact. This read asks the database whether the claim is true FOR THIS USER, and nothing
    // is written when it is not. A crafted id, a replayed id, another man's id: all of them die
    // here with zero rows touched.
    const own = await fetch(
      `${url}/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}&kind=eq.lekhio&select=id&limit=1`,
      { headers: headers(), signal: AbortSignal.timeout(6000) },
    );
    if (!own.ok) return false;
    const owned = (await own.json().catch(() => null)) as unknown[] | null;
    if (!Array.isArray(owned) || owned.length === 0) return false;

    const res = await fetch(`${url}/rest/v1/messages`, {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        user_id: userId,
        conversation_id: conversationId,
        role,
        content: text.slice(0, 8000),
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return false;

    // Bump the thread's own clock, best effort and still scoped by user_id.
    await fetch(
      `${url}/rest/v1/conversations?id=eq.${encodeURIComponent(conversationId)}&user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ last_message_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(6000),
      },
    ).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
// --- end of the Lekhio thread block -----------------------------------------------------------

// --- The activity feed (5 August 2026) --------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE FEED. One list of everything that has happened to this man's money, newest first, so a
// glance tells him what his employee has been doing: receipts read, entries filed or waiting
// for his yes, questions asked and answered, Rakha's nudges. A record, not an entertainment
// scroll, and the sentences are worded HERE so the page draws them and adds nothing.
//
// ⚠️ THREE READS, MERGED IN JS. Transactions, messages and agent_signals share no join worth
// forcing on PostgREST, so each table is read on its own, every query scoped by user_id from
// the session exactly as the rest of this file does, and the merge is a sort on the clock.
// The Rakha rows come through rakhaFlagsForUser above rather than a fourth query shape.
//
// 🔴 NO RAW ID EVER LEAVES THIS FUNCTION. A chat or nudge row's ref is a link carrying a
// SEALED reference from app/app/chatref.ts, and a transaction row's ref is the /app/entry link
// on app/app/entryref.ts, both minted for the session's own user. A reference that cannot be
// minted comes back as ref '' and the row renders as plain text, the thread list's fail closed
// rule. The references grant nothing: the pages they open resolve the session first and read
// through user_id scoped queries.
//
// ⚠️ THE MINTERS ARE HANDED IN, NOT IMPORTED, AND THAT IS THE moneylog LESSON. The reference
// modules live under app/app because they are shapes of the web surface, and test/waout.test.mjs
// and test/frontdoor.test.mjs stage the whole of lib/ flat into a temp directory, so an import
// from app/app here breaks two suites and the layering at once. lib/moneylog.ts already solves
// this exact problem for isWrittenDown: the caller hands the function in, and it is a REQUIRED
// parameter so tsc names any call site that forgot, rather than a default quietly minting no
// links for them.
//
// ⚠️ ANY FAILED READ IS NULL, NEVER A QUIETLY SHORTER LIST. A feed missing one source without
// saying so teaches a man the record forgets things, and a record he cannot trust is worse
// than none. So null means the page says so plainly and asks him to load it again; [] means
// nothing has genuinely happened yet.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type FeedKind = 'receipt' | 'filed' | 'waiting' | 'chat' | 'nudge';

export interface FeedItem {
  kind: FeedKind;
  when: string;   // the ISO timestamp of the moment it happened, for ordering and day headings
  title: string;  // one plain sentence, already worded
  detail: string; // the quieter second line. '' when the sentence already says it all
  ref: string;    // a safe href with a sealed reference inside, never a raw id. '' is unlinked
}

// The two sealed reference minters, handed in by the page (see the header above). Each returns
// the sealed string or '', and '' means the row draws unlinked: fail closed, never a raw id.
export interface FeedSeal {
  chat(kind: 'chat' | 'rakha', id: string): string;
  entry(id: string, month: string): string;
}

// One line for a snippet: whitespace collapsed, bounded, never a wall of words in a row.
function feedSnippet(text: unknown, max = 140): string {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

interface FeedTxRow {
  id?: string;
  vendor?: string | null;
  amount?: number | string | null;
  category?: string | null;
  confirmed?: boolean | null;
  is_personal?: boolean | null;
  source_type?: string | null;
  created_at?: string | null;
  transaction_date?: string | null;
}

// One transaction as a feed sentence. Wording rules:
//   . unconfirmed from a WhatsApp photo: a receipt was read, and it waits for his yes
//   . unconfirmed from anywhere else: it was logged, and it waits for his yes
//   . confirmed and personal: set aside, outside the business books
//   . confirmed money out: filed as its category
//   . confirmed money in: filed as money in
// Money is always lib/money.ts to the penny, never a hand built pound.
function feedTxItem(seal: FeedSeal, r: FeedTxRow): FeedItem | null {
  const when = typeof r.created_at === 'string' ? r.created_at : '';
  const amount = typeof r.amount === 'number'
    ? r.amount
    : (typeof r.amount === 'string' && r.amount.trim() !== '' ? Number(r.amount) : Number.NaN);
  if (!when || !Number.isFinite(amount)) return null;
  const name = labelFor(r as Record<string, unknown>);
  const money = gbp2(Math.abs(amount));
  const month = typeof r.transaction_date === 'string' ? r.transaction_date.slice(0, 7) : '';
  // The minter fails closed to '' on any bad shape, and '' means the row draws unlinked.
  const sealed = typeof r.id === 'string' && month ? seal.entry(r.id, month) : '';
  const ref = sealed ? `/app/entry?e=${encodeURIComponent(sealed)}` : '';
  if (r.confirmed !== true) {
    const fromPhoto = typeof r.source_type === 'string' && r.source_type.startsWith('whatsapp');
    return fromPhoto
      ? { kind: 'receipt', when, title: `Read your ${name} receipt.`, detail: `${money}, waiting for your yes.`, ref }
      : { kind: 'waiting', when, title: `Logged ${name}.`, detail: `${money}, waiting for your yes.`, ref };
  }
  if (r.is_personal === true) {
    return { kind: 'filed', when, title: `Set aside ${name} as personal.`, detail: `${money}, outside your business books.`, ref };
  }
  if (amount >= 0) {
    return { kind: 'filed', when, title: `Filed ${money} in from ${name}.`, detail: '', ref };
  }
  const cat = typeof r.category === 'string' && r.category ? r.category : '';
  return {
    kind: 'filed',
    when,
    title: cat ? `Filed ${name} as ${cat}.` : `Filed ${name}.`,
    detail: `${money} out.`,
    ref,
  };
}

// Everything that has happened to this man's money, newest first. Each source is read scoped
// to the user and bounded by the same limit, merged and cut to the limit again, so the page
// never pays for more rows than it can show. Null means a read failed and the page says so.
export async function readActivityFeed(userId: string, limit: number, seal: FeedSeal): Promise<FeedItem[] | null> {
  if (!userId || !Number.isFinite(limit) || limit < 1) return null;
  const uid = encodeURIComponent(userId);
  const cap = Math.min(Math.floor(limit), 200);

  const readTx = async (): Promise<FeedTxRow[] | null> => {
    try {
      const { url } = config();
      const res = await fetch(
        `${url}/rest/v1/transactions?user_id=eq.${uid}` +
          `&select=id,vendor,amount,category,confirmed,is_personal,source_type,created_at,transaction_date` +
          `&order=created_at.desc&limit=${cap}`,
        { headers: headers(), signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return null;
      const rows = (await res.json().catch(() => null)) as FeedTxRow[] | null;
      return Array.isArray(rows) ? rows : null;
    } catch {
      return null;
    }
  };

  // The DM turns across every conversation in one read, filtered by user_id exactly as
  // chatMessagesForUser is. The conversation id stays inside this module: it leaves only
  // sealed inside the reference.
  const readTurns = async (): Promise<Array<{ conversation_id?: string; role?: string; content?: string; created_at?: string }> | null> => {
    try {
      const { url } = config();
      const res = await fetch(
        `${url}/rest/v1/messages?user_id=eq.${uid}&select=conversation_id,role,content,created_at&order=created_at.desc&limit=${cap}`,
        { headers: headers(), signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return null;
      const rows = (await res.json().catch(() => null)) as Array<{
        conversation_id?: string; role?: string; content?: string; created_at?: string;
      }> | null;
      return Array.isArray(rows) ? rows : null;
    } catch {
      return null;
    }
  };

  const [tx, turns, flags] = await Promise.all([readTx(), readTurns(), rakhaFlagsForUser(userId, cap)]);
  if (tx === null || turns === null || flags === null) return null;

  const items: FeedItem[] = [];

  for (const r of tx) {
    const item = feedTxItem(seal, r);
    if (item) items.push(item);
  }

  for (const m of turns) {
    const when = typeof m.created_at === 'string' ? m.created_at : '';
    const line = feedSnippet(m.content);
    if (!when || !line) continue;
    // The minter fails closed to '' when unconfigured or when the id fails its shape check.
    const sealed = typeof m.conversation_id === 'string' ? seal.chat('chat', m.conversation_id) : '';
    items.push({
      kind: 'chat',
      when,
      title: m.role === 'user' ? 'You asked.' : m.role === 'puchio' ? 'Puchio answered.' : 'Lekhio answered.',
      detail: line,
      ref: sealed ? `/app/thread/chat?c=${encodeURIComponent(sealed)}` : '',
    });
  }

  for (const f of flags) {
    if (!f.created_at || !f.title) continue;
    const sealed = seal.chat('rakha', f.id);
    items.push({
      kind: 'nudge',
      when: f.created_at,
      title: f.title,
      detail: feedSnippet(f.body),
      ref: sealed ? `/app/thread/chat?c=${encodeURIComponent(sealed)}` : '',
    });
  }

  items.sort((a, b) => (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0));
  return items.slice(0, cap);
}
// --- end of the activity feed block -----------------------------------------------------------

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE SIGN IN DOOR, 11 August 2026. Minting the code without asking GoTrue to post it, and
// watching whether the codes we do send are actually leaving. APPENDED, per the append only rule:
// nothing above this line was touched.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// 🔴 MINT, DO NOT SEND. The admin generate_link endpoint hands back the one time code for an
// EXISTING auth user without posting anything itself, which is the whole point: GoTrue keeps
// ownership of minting and verification, and delivery moves to Resend beside every other email we
// send. See the header on sendSignInCodeEmail in lib/email.ts for why that matters.
//
// ⚠️ 'magiclink' NEVER CREATES A USER. That is deliberate and it is load bearing. 'signup' would
// mint an account for any address posted at the door, which is the exact leak the neutrality rule
// in app/api/auth/start/route.ts exists to prevent. An address GoTrue has never seen returns null
// here and the caller falls back, rather than quietly bringing an account into being.
//
// Returns null on ANY failure: not configured, non-2xx, unparseable, or a body with no code in it.
// A null is never an error the customer sees, it is the caller's signal to use the old road.
export async function mintSignInCode(email: string): Promise<string | null> {
  const { url, key } = config();
  if (!url || !key || !email) return null;
  try {
    const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { email_otp?: unknown; properties?: { email_otp?: unknown } }
      | null;
    // GoTrue has returned this at the top level and nested under properties across versions. Read
    // both rather than pinning one and finding out in production which one this project speaks.
    const raw = body?.email_otp ?? body?.properties?.email_otp;
    const code = String(raw ?? '').replace(/\D/g, '');
    return code.length >= 6 ? code : null;
  } catch {
    return null;
  }
}

import type { AuthSendHealth } from './cronwatch';

// 🔴 THE PROBE THE P0 DID NOT HAVE. Four codes were asked for and none arrived, and /api/health
// said 200 the whole time, because nothing in the product was watching the one email a locked out
// customer cannot do without.
//
// Only 'sent' and 'failed' are counted. The three refusal outcomes are the door working correctly
// (a stranger's address, a cap, a rate limit) and folding them in would make a quiet night of
// refusals read as a broken mailer.
//
// Returns null on any failed read, and the alarm treats null as a fault. "I could not look" is not
// "everything is fine", which is the rule cronsServing and reminderAlarm already set.
export async function getAuthSendHealth(windowMinutes = 60): Promise<AuthSendHealth | null> {
  const { url } = config();
  if (!url) return null;
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  try {
    const res = await fetch(
      `${url}/rest/v1/auth_sends?select=outcome&created_at=gte.${encodeURIComponent(since)}`
        + `&outcome=in.(sent,failed)&limit=1000`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ outcome?: string }> | null;
    if (!Array.isArray(rows)) return null;
    let sent = 0;
    let failed = 0;
    for (const r of rows) {
      if (r?.outcome === 'sent') sent += 1;
      else if (r?.outcome === 'failed') failed += 1;
    }
    return { attempted: sent + failed, sent, failed, windowMinutes };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// IS THERE A PREVIOUS TAX YEAR TO LOOK AT. 11 August 2026, RUN 1 of the customer week.
//
// The Tax screen shows the year that started on 6 April. The return due this coming January is the
// year BEFORE it, and until today the only door to that year in the whole product was a chip
// inside Proof of income. For a CIS subcontractor that is usually where his refund is.
//
// Doc 103's empty test says a row that says "nothing here" most of the time teaches him to stop
// looking, so the door is drawn only when there is genuinely a year behind it. One HEAD request,
// no rows returned, no body parsed: this asks a yes or no question and gets one back.
//
// ⚠️ FALSE ON A FAILED READ, WHICH IS THE SAFE DIRECTION HERE AND ONLY HERE. Withholding a door is
// a smaller harm than drawing one onto an empty page and teaching him the product is padded. He
// reaches the same year from Proof of income either way, exactly as he did yesterday.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function hasConfirmedRowsInTaxYear(userId: string, startYear: number): Promise<boolean> {
  const { url } = config();
  if (!userId || !Number.isFinite(startYear)) return false;
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}`
        + `&confirmed=eq.true&is_personal=eq.false`
        + `&transaction_date=gte.${startYear}-04-06&transaction_date=lte.${startYear + 1}-04-05`
        + '&select=id&limit=1',
      { method: 'HEAD', headers: headers({ Prefer: 'count=exact' }) },
    );
    if (!res.ok) return false;
    const range = res.headers.get('content-range') ?? '';
    const total = range.includes('/') ? range.split('/')[1] : '';
    return /^\d+$/.test(total) && Number(total) > 0;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CIS CAPTURE. 11 August 2026, RUN 1 of the customer week, and the write half of finding F4.
//
// 🔴 NO MIGRATION, AND THAT IS A DECISION RATHER THAN A SHORTCUT.
//
// The first design for this was an rpc, confirm_income_cis, mirroring confirm_income so the gross
// could be computed in the database as amount = amount + p_cis. That is a fine shape and it needed
// a DDL apply against production before a single customer could answer the question.
//
// It is not necessary. transactions.cis_deduction ALREADY EXISTS: it is in supabase/schema.sql and
// app/api/whatsapp/route.ts has been writing it since handleCIS was built. What the rpc really
// bought was ATOMICITY, and PostgREST gives that for nothing: every filter on a PATCH becomes part
// of one UPDATE ... WHERE, so the guards below are checked by Postgres in the same statement that
// does the write. There is no read-then-write window to lose a race in.
//
// THE FOUR GUARDS, AND WHAT EACH ONE STOPS:
//
//   user_id       tenancy. Without it an id from another man's books is enough. Non negotiable.
//   amount        OPTIMISTIC CONCURRENCY. expectedNet is the figure the page showed him and the
//                 figure cisCapture() did its arithmetic on. If the row has moved since, this
//                 matches nothing and we refuse, rather than grossing up a number he never saw.
//   cis_deduction is.null. THE IDEMPOTENCY GUARD, and the one that matters most. A double submit,
//                 a back button, a retried request: the second one matches no rows, so a deduction
//                 can never be applied twice and his turnover can never be inflated by a press.
//   is_personal   a row he has already put outside the business is not income to gross up.
//
// ⚠️ THE CATEGORY IS NOT TOUCHED. confirm_income owns that, and a write that quietly recategorised
// a row while answering a question about tax would be doing two things behind one press.
//
// Returns the number of rows actually changed, which is 1 or 0 and never a guess: PostgREST is
// asked for the representation so this counts what Postgres did, not what we hoped it would do.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function recordCisOnIncome(
  userId: string,
  id: string,
  expectedNet: number,
  patch: { amount: number; cis_deduction: number },
): Promise<number> {
  if (!UUID.test(id) || !userId) return 0;
  if (!Number.isFinite(expectedNet) || expectedNet <= 0) return 0;
  if (!Number.isFinite(patch.amount) || !Number.isFinite(patch.cis_deduction)) return 0;
  // Belt and braces on the invariant the whole spine now rests on. The caller is lib/reviewpile.ts
  // cisCapture(), which cannot produce anything else, and this refuses to be the place that lets a
  // net figure through if a second caller ever appears.
  if (Math.abs((patch.amount - patch.cis_deduction) - expectedNet) > 0.005) return 0;
  try {
    const { url } = config();
    const res = await fetch(
      `${url}/rest/v1/transactions?id=eq.${encodeURIComponent(id)}`
        + `&user_id=eq.${encodeURIComponent(userId)}`
        // Two decimals, to match the column rather than whatever JS prints. An optimistic guard
        // that silently never matches is a feature that silently never works.
        + `&amount=eq.${expectedNet.toFixed(2)}`
        // 🔴 NULL OR ZERO, AND THE ZERO HALF WAS FOUND BY WALKING PRODUCTION, NOT BY A TEST.
        // The column defaults to 0 rather than NULL, so every one of Danny's 402 rows carries a
        // real 0 and an is.null guard matched precisely nothing: the reader returned an empty list
        // and the section never drew. The suite could not have caught it, because a stub decides
        // its own column defaults. Only the live account knew.
        //
        // ⚠️ IT IS STILL IDEMPOTENT, which is the property this guard exists for. Once a real
        // deduction is written the column holds it, so it is neither null nor zero, and a second
        // press matches no rows. A double submit still cannot inflate his turnover.
        + '&or=(cis_deduction.is.null,cis_deduction.eq.0)'
        + '&is_personal=eq.false',
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          amount: patch.amount,
          cis_deduction: patch.cis_deduction,
          // A row he has just told us about is a row he has confirmed. Already true for anything
          // reached from the CIS screen, which only ever lists money he confirmed weeks ago.
          confirmed: true,
        }),
      },
    );
    if (!res.ok) return 0;
    const rows = (await res.json().catch(() => null)) as unknown[] | null;
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/** One payment in that carries no CIS deduction yet. */
export interface CisMissingRow {
  id: string;
  amount: number;
  transaction_date: string;
  vendor: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE ROWS THE PILE WILL NEVER ASK ABOUT AGAIN, AND WHY THEY ARE THE WHOLE PROBLEM.
//
// The review pile asks about money that is waiting for a yes. Danny's 62 contractor deposits were
// confirmed weeks ago, in one bulk import, before anything in this product knew what CIS was. The
// pile is done with them for ever, so a capture question that lives only there fixes the NEXT
// subcontractor and leaves this one with a wrong number on his Overview until he files.
//
// ⚠️ AND IT IS NOT AN EDGE CASE, IT IS THE ORDINARY SHAPE OF THE SCHEME. A contractor has until 14
// days after the end of the tax month to hand over a payment and deduction statement. The money
// lands first and the paperwork follows. So the day a man can answer "what was taken off that
// one" is routinely WEEKS after the day he confirmed the payment. A product that can only ask at
// the moment money arrives is asking on the one day he cannot possibly know.
//
// So this reads back over confirmed income that has no deduction recorded, and /app/tax/cis lists
// it. Newest first, because the statement in his hand this morning is for last month.
//
// ⚠️ PROPERTY INCOME IS EXCLUDED. Rent is never inside the scheme, and offering to record a CIS
// deduction against a tenant's payment would be nonsense on the screen and wrong in the books.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function incomeRowsWithoutCis(
  userId: string,
  startISO: string,
  endISO: string,
  limit = 60,
): Promise<CisMissingRow[]> {
  const { url } = config();
  if (!userId) return [];
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}`
        + '&confirmed=eq.true&is_personal=eq.false&amount=gt.0'
        // 🔴 TWO CONDITIONS, NESTED, BECAUSE ONE or= PARAMETER CANNOT CARRY BOTH.
        //
        // NOTHING RECORDED YET is null OR zero: the column defaults to 0, so an is.null test on its
        // own matches no row that came in off a bank import. Found live on 11 August, after the
        // screen shipped and drew nothing at all.
        //
        // NOT RENT has to name the null case too. In SQL, NULL = 'property' is UNKNOWN and
        // NOT(UNKNOWN) is UNKNOWN, so a plain not.eq would filter out every row whose income_type
        // is null. The filter meant to exclude rent would have excluded the entire trade.
        + '&and=(or(cis_deduction.is.null,cis_deduction.eq.0),or(income_type.is.null,income_type.neq.property))'
        + `&transaction_date=gte.${encodeURIComponent(startISO)}`
        + `&transaction_date=lte.${encodeURIComponent(endISO)}`
        + `&select=id,amount,transaction_date,vendor&order=transaction_date.desc&limit=${limit}`,
      { headers: headers() },
    );
    if (!res.ok) return [];
    const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => typeof r.id === 'string' && typeof r.transaction_date === 'string')
      .map((r) => ({
        id: r.id as string,
        amount: Number(r.amount) || 0,
        transaction_date: (r.transaction_date as string).slice(0, 10),
        vendor: (r.vendor as string | null) ?? null,
      }));
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS ACTUALLY RECORDED IN A YEAR THE LEDGER DOES NOT MODEL.
//
// 🔴 FOUND 12 AUGUST 2026 BY PRESSING THE YEAR CHOOSER THE DAY AFTER IT SHIPPED. The CIS screen's
// hero is ledgerFor().refundDue, which is the LIVE year and only ever the live year, under a
// heading that says "this year". The list beneath it obeys the chooser. So on 2025/26 the screen
// showed a 2026/27 figure, labelled this year, over thirty six unanswered 2025/26 payments: he
// answers one, comes back on the year he was on, and the big number does not move, because it
// never could. That reads exactly like the write failing, which is the one thing the year round
// trip in app/api/cis/route.ts was built to prevent.
//
// ⚠️ IT IS NOT A SECOND READER OVER THE LIVE YEAR AND MUST NEVER BECOME ONE. app/app/tax/cis
// calls this ONLY when the year on screen is not the live one: a year the ledger has no opinion
// about, so there is no first reader to disagree with. The comment at the top of that page has
// stood since the day this product quoted a man a refund that did not exist. It still stands.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function cisRecordedForYear(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<number> {
  const { url } = config();
  if (!userId) return 0;
  try {
    const res = await fetch(
      `${url}/rest/v1/transactions?user_id=eq.${encodeURIComponent(userId)}`
        + '&confirmed=eq.true&is_personal=eq.false&amount=gt.0'
        + '&cis_deduction=gt.0'
        + `&transaction_date=gte.${encodeURIComponent(startISO)}`
        + `&transaction_date=lte.${encodeURIComponent(endISO)}`
        + '&select=cis_deduction&limit=20000',
      { headers: headers() },
    );
    if (!res.ok) return 0;
    const rows = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
    if (!Array.isArray(rows)) return 0;
    // A failed read and an empty year both return 0, and the page says the same true thing about
    // both: nothing recorded. It never turns a failure into a refund.
    return Math.round(rows.reduce((t, r) => t + (Number(r.cis_deduction) || 0), 0) * 100) / 100;
  } catch {
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE LAST FOUR OF THE NUMBER ON THIS ACCOUNT, OR NULL BECAUSE THERE IS NOT ONE.
//
// 🔴 THE UNPLUG DOOR SHIPPED WITHOUT THIS AND IT WAS WRONG TWICE OVER. Found 12 August by looking
// at it on an account with no phone on it at all.
//
//   It was drawn for everybody. Doc 103's empty test: a control that has nothing to do most of
//   the time is a control he learns to scroll past, and then he cannot find it the week he needs
//   it. He is on this page to export or to erase; the phone section is noise unless there is a
//   phone.
//
//   And it never said WHICH number. The whole reason a man opens this door is that a number is on
//   an account it should not be on, usually one he cannot see from the handset side, and the copy
//   asked him to decide "if the number on here is not yours any more" without showing him what it
//   was. A confirmation button over an unnamed thing is a guess with a full stop after it.
//
// ⚠️ FOUR DIGITS, NOT THE NUMBER. Enough for him to recognise his own handset, and the common case
// for this door is a number that belongs to somebody else, a man who has left, whose full number is
// not the account holder's to be handed on a plate. Four digits identifies without publishing.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function phoneTailForUser(userId: string): Promise<string | null> {
  const { url } = config();
  if (!userId) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}&select=phone_number&limit=1`,
      { headers: headers() },
    );
    if (!res.ok) return null;
    const rows = (await res.json().catch(() => null)) as Array<{ phone_number: string | null }> | null;
    const raw = Array.isArray(rows) && rows[0]?.phone_number ? String(rows[0].phone_number) : '';
    const digits = raw.replace(/\D/g, '');
    // ⚠️ A FAILED READ IS NULL AND NULL HIDES THE DOOR. That is the safe way round: a man whose
    // number we could not read is shown nothing rather than an unplug button over a blank, and the
    // page has never been the only road, the mailbox at the bottom of it still works.
    return digits.length >= 4 ? digits.slice(-4) : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// UNPLUG THE PHONE. 12 August 2026, and it is the answer to a question this file asked itself.
//
// 🔴 THE COMMENT INSIDE deleteUserData PREDICTED THIS EXACT FUNCTION AND TOLD IT WHAT TO DO:
//
//     "a phone number, once set on users, is never unset: the bank has /api/bank/disconnect, the
//      phone has no equivalent anywhere in the tree."
//     "⚠️ THE DAY SOMEBODY ADDS A PHONE DISCONNECT, THIS BECOMES A LIVE GDPR HOLE. His number
//      would sit in ai_usage.key through an erasure that reported success."
//
// That gap is what RUN 1 walked into. A number bound to an account could not be moved by anybody:
// the customer had no door, the WhatsApp refusal's only road was a support queue, and there was no
// unbind anywhere in the tree. lib/walink.ts bindingVerdict returns 'taken' the moment
// findUserIdByPhone finds ANY users row holding the number, so one stale binding locks a real
// handset out of the product for ever.
//
// ⚠️ SO THE ORDER OF THE TWO STEPS IS THE WHOLE SAFETY OF THIS FUNCTION, AND IT IS THE OPPOSITE OF
// THE OBVIOUS ONE. The phone keyed tables are cleared FIRST, while users.phone_number still holds
// the number that keys them. Unset it first and those rows become unreachable by any future
// erasure, exactly as the warning above says, and his number sits in ai_usage.key for ever with
// nothing to point at it.
//
// The four tables are not listed by hand here. They are read out of USER_DATA_TABLES, so a fifth
// phone keyed table added to the manifest is cleared by this door on the same commit, with no
// second list to forget.
//
// ⚠️ AND IT FAILS CLOSED. If any phone keyed delete fails, the number is NOT unset and the caller
// is told. A half done disconnect that frees the number while leaving rows keyed by it is the
// precise hole the warning describes, so it is the one outcome this refuses to produce.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export async function disconnectPhone(userId: string): Promise<boolean> {
  const { url } = config();
  if (!userId) return false;
  const phone = await getPhoneForUser(userId);
  // No number on the account is not a failure. Nothing to unbind, nothing keyed by it.
  if (!phone) return true;

  let allOk = true;
  const del = async (path: string): Promise<void> => {
    try {
      const res = await fetch(`${url}/rest/v1/${path}`, {
        method: 'DELETE',
        headers: headers({ Prefer: 'return=minimal' }),
      });
      if (res.ok) return;
      // Same forgiveness deleteUserData grants, for the same reason: a table that is not in the
      // database yet holds no rows for anybody, and wa_out is documented as one of those.
      if (res.status === 404) {
        const body = await res.text().catch(() => '');
        if (body.includes('PGRST205') || /could not find the table/i.test(body)) return;
      }
      allOk = false;
    } catch {
      allOk = false;
    }
  };

  // STEP ONE. Everything keyed by the number, while the number is still on the row.
  for (const t of USER_DATA_TABLES) {
    if (t.keyKind !== 'phone') continue;
    await del(`${t.table}?${t.userKey}=eq.${encodeURIComponent(phone)}`);
  }
  if (!allOk) return false;

  // STEP TWO, and only now. The binding itself.
  //
  // ⚠️ THIS IS THE ONE WRITE IN THE TREE THAT SETS phone_number TO NULL, and
  // test/datarights.test.mjs has a guard whose entire job is to go red when that appears. That
  // guard was written to fire on this commit. It has been narrowed to allow exactly this function,
  // by name, and nothing else, so the invariant it protects is now "no OTHER code unsets a number",
  // which is still worth holding and is the thing that was actually meant.
  try {
    const res = await fetch(
      `${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: headers({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ phone_number: null }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
