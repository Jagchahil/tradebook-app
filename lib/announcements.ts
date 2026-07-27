// THE ANNOUNCEMENTS FEED. Where Khoji finally becomes visible.
//
// Khoji reads the law every night, and a human approves what matters on the Brain desk. Then that
// knowledge disappears into the engine, where no customer ever sees it happen. The best thing this
// company owns has, until today, been completely invisible to the people paying for it.
//
// This file is the fix, and it is deliberately the smallest possible one: a pure function that turns
// rows we already have into a couple of short lines a man will actually read. No new watcher, no new
// approval desk, no second copy of anything.
//
// ⚠️ THREE RULES, AND THEY ARE THE WHOLE FILE.
//
//   1. ONLY AN APPROVED ROW REACHES A CUSTOMER. `reviewed` and nothing else. Not `distilled` (a
//      language model wrote it and nobody read it), not `needs_distillation` (raw scraped text), not
//      `verbatim` (trusted for OUR internal reading, never approved for us to say to anyone), not
//      `actioned`, not `dismissed`. This is the same gate app/api/team/review/route.ts guards, read
//      from the other end, and it is why that click is worth anything at all.
//
//   2. NO CLAIM WITHOUT ITS SOURCE. Every customer facing sentence about tax or law keeps a link to
//      the page it came from. Zero uncited assertions is the bar everywhere else in this codebase
//      and a banner is not an exception to it.
//
//   3. WE NEVER PARTIALLY RENDER A CLAIM. A summary is shown WHOLE or not at all. Truncating "the
//      rate rises to 60p" away from "for the first 10,000 miles only" produces a sentence that is
//      short, readable, and wrong. If it does not fit, the customer gets the headline and the link,
//      which is honest, rather than half a rule, which is not. There is no ellipsis in this file.
//
// It reads NOTHING about the customer. No transaction, no name, no circumstance. An announcement is
// a fact about the law, identical for every reader, so nothing special category can be in it because
// nothing personal can be in it. That is structural, not filtered: no field on the input carries one.

import { houseCopy, hasForbiddenDash } from './housestyle';

// The ONE status that may reach a customer. Exported so a test can pin it, and so nobody ever has to
// guess the spelling at a call site.
export const APPROVED_STATUS = 'reviewed';

// Every other status knowledge_items can hold. Listed by name, on purpose: a future status added to
// the schema is NOT silently customer safe just because nobody remembered to blocklist it. The gate
// is an allowlist of one, and this list exists only so the test can prove each of these is refused.
export const NEVER_CUSTOMER_FACING = [
  'needs_distillation',
  'distilled',
  'verbatim',
  'actioned',
  'dismissed',
] as const;

// How old a change may be and still be news. Sixty days covers a quiet month either side of a Budget
// without turning the banner into an archive. A man who dismissed it has dismissed it; a man who did
// not should not be reading about April in July.
export const MAX_AGE_DAYS = 60;

// The banner holds a few things, not a feed. Doc 103: a row he has to read and reject before he gets
// to what he came for is a cost, and ten helpful additions make an unhelpful product.
export const MAX_ITEMS = 4;

// A summary longer than this is not a banner line. See rule 3: it is dropped whole, never cut.
export const MAX_BODY_CHARS = 220;

export type AnnouncementSource = 'khoji' | 'lekhio';

// A row as knowledge_items holds it. Note what is NOT here: nothing about a user.
export interface KnowledgeRow {
  id: string;
  status: string | null;
  title: string | null;
  summary: string | null;
  source_url: string | null;
  effective_date: string | null;
  created_at: string | null;
  engine_impact: boolean | null;
}

// A row a human wrote on /team. Same shape of promise, different author.
export interface ManualRow {
  id: string;
  title: string | null;
  body: string | null;
  source_url: string | null;
  // When set, this row is a human's own shorter wording of a Khoji finding, and the automatic card
  // for that finding is suppressed so the same change is never announced twice.
  knowledge_item_id: string | null;
  published_at: string | null;
  expires_at: string | null;
}

export interface Announcement {
  // The stable dismissal key. Stable across deploys and across surfaces, so dismissing on the web
  // dismisses on the phone. Never a row index, never a hash of the text: an edited announcement must
  // stay dismissed, not come back as a new one.
  key: string;
  source: AnnouncementSource;
  title: string;
  // The whole summary, or empty. Never a fragment of one.
  body: string;
  sourceUrl: string | null;
  // ISO date the change takes effect, when we know it. Null is not "today", it is "we were not told".
  effectiveDate: string | null;
  // True ONLY when the caller has proved a fact override exists for this item, so we may say the
  // figures already reflect it. Never inferred from engine_impact: that flag means SOMEONE THOUGHT
  // it should change a constant, not that a constant changed.
  applied: boolean;
  at: string;
}

export interface AnnouncementsInput {
  knowledge: KnowledgeRow[];
  manual: ManualRow[];
  // knowledge_items ids for which a fact_overrides row actually exists. Proof, not intent.
  appliedItemIds?: string[];
  // Dismissal keys this customer has already cleared.
  dismissedKeys?: string[];
  now?: Date;
}

export function khojiKey(id: string): string { return `khoji:${id}`; }
export function manualKey(id: string): string { return `lekhio:${id}`; }

// A source link must be a real https page. An http link, a relative path or a mailto is not a
// citation a customer can check, and an uncheckable citation is worse than none because it looks
// like one.
export function isCitable(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  if (!u.startsWith('https://')) return false;
  return u.length > 'https://'.length + 3 && !/\s/.test(u);
}

function clean(text: string | null | undefined): string {
  const c = houseCopy(text);
  return c ? c.replace(/\s+/g, ' ').trim() : '';
}

function ageDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 86_400_000;
}

// THE GATE, ON ITS OWN, so it can be tested on its own and so no call site can inline a looser
// version of it. Returns the reason it was refused, or null when the row may be shown.
export function refuseKnowledge(row: KnowledgeRow, now: Date = new Date()): string | null {
  const status = (row.status || '').trim().toLowerCase();
  // Rule 1. An allowlist of exactly one word.
  if (status !== APPROVED_STATUS) return `status_not_approved:${status || 'empty'}`;
  // Rule 2. No claim without its source.
  if (!isCitable(row.source_url)) return 'no_source_link';
  if (!clean(row.title)) return 'no_title';
  const age = ageDays(row.created_at, now);
  // An undated row is not assumed fresh. We do not know when we learned it, so we do not say it.
  if (age === null) return 'undated';
  if (age > MAX_AGE_DAYS) return 'too_old';
  // A row dated in the future is a clock problem or a bad write, and either way not something to
  // put in front of a customer.
  if (age < -1) return 'dated_in_future';
  return null;
}

export function refuseManual(row: ManualRow, now: Date = new Date()): string | null {
  if (!clean(row.title)) return 'no_title';
  const age = ageDays(row.published_at, now);
  if (age === null) return 'undated';
  if (age < -1) return 'dated_in_future';
  if (age > MAX_AGE_DAYS) return 'too_old';
  if (row.expires_at) {
    const e = Date.parse(row.expires_at);
    if (Number.isFinite(e) && e <= now.getTime()) return 'expired';
  }
  // A human writing his own words about the law still cites the law. If he links nothing, he is
  // making a product announcement ("receipts now upload from the web"), which needs no citation and
  // is fine. If he links something, it must be checkable.
  if (row.source_url && !isCitable(row.source_url)) return 'bad_source_link';
  return null;
}

// Rule 3, in one function. Whole, or nothing.
export function bodyOrNothing(summary: string | null | undefined): string {
  const s = clean(summary);
  if (!s) return '';
  if (s.length > MAX_BODY_CHARS) return '';
  return s;
}

// THE SELECTION. Pure. Give it rows, get back what a customer may see, in the order he should see it.
export function selectAnnouncements(input: AnnouncementsInput): Announcement[] {
  const now = input.now ?? new Date();
  const applied = new Set(input.appliedItemIds ?? []);
  const dismissed = new Set(input.dismissedKeys ?? []);
  const out: Announcement[] = [];

  // A human's own wording of a finding replaces the automatic card for it, so the same change is
  // never announced twice in two voices.
  const supersededItems = new Set<string>();
  for (const m of input.manual) {
    if (m.knowledge_item_id && !refuseManual(m, now)) supersededItems.add(m.knowledge_item_id);
  }

  for (const m of input.manual) {
    if (refuseManual(m, now)) continue;
    const key = manualKey(m.id);
    if (dismissed.has(key)) continue;
    out.push({
      key,
      source: 'lekhio',
      title: clean(m.title),
      body: bodyOrNothing(m.body),
      sourceUrl: isCitable(m.source_url) ? (m.source_url as string).trim() : null,
      effectiveDate: null,
      // A human writing a sentence is not proof a constant moved. Only the override table is.
      applied: !!(m.knowledge_item_id && applied.has(m.knowledge_item_id)),
      at: m.published_at as string,
    });
  }

  for (const k of input.knowledge) {
    if (refuseKnowledge(k, now)) continue;
    if (supersededItems.has(k.id)) continue;
    const key = khojiKey(k.id);
    if (dismissed.has(key)) continue;
    out.push({
      key,
      source: 'khoji',
      title: clean(k.title),
      body: bodyOrNothing(k.summary),
      sourceUrl: (k.source_url as string).trim(),
      effectiveDate: k.effective_date || null,
      applied: applied.has(k.id),
      at: k.created_at as string,
    });
  }

  // ORDER. What actually moved his figures first, because that is the sentence that proves we were
  // watching his money while he slept. Then a human's deliberate note. Then everything else, newest
  // first. A stable comparator, so the same rows always produce the same banner.
  const rank = (a: Announcement) => (a.applied ? 0 : a.source === 'lekhio' ? 1 : 2);
  out.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const t = Date.parse(b.at) - Date.parse(a.at);
    if (t !== 0) return t;
    return a.key.localeCompare(b.key);
  });

  // Last line of defence, and it should never fire. If any of the above ever produced a dash, drop
  // the item rather than ship it: lib/housestyle.ts is the business wide lock and a banner is the
  // most read copy we have.
  return out.filter((a) => !hasForbiddenDash(a.title) && !hasForbiddenDash(a.body)).slice(0, MAX_ITEMS);
}

// The one reassurance sentence, and the only place it is allowed to be written. It is separate from
// the announcement text so that it can never be produced for an item where `applied` is false: a
// caller cannot forget the check, because there is nothing to forget, the function refuses.
export const APPLIED_LINE = 'Your figures already reflect this. You do not need to do anything.';

export function appliedLineFor(a: Announcement): string | null {
  return a.applied ? APPLIED_LINE : null;
}
