// Keeping the qa_candidates learning pool bounded (doc 96 scale item). Pure: no
// imports, no network, so it is unit testable on its own. Two mechanisms work
// together.
//
//   1. Write time dedupe. Every candidate carries a normalised question key
//      (qaDedupeKey). The log_qa_candidate RPC upserts on that key, so a
//      question asked a thousand times is one row with a seen_count, not a
//      thousand rows. This is the primary bound: the table can never grow
//      faster than the number of DISTINCT questions, which is naturally finite.
//
//   2. Retention. A periodic cleanup (pruneOldRows) deletes rows that no longer
//      earn their keep: terminal state rows, which a human or the governed step
//      already actioned, after 90 days, and unreviewed rows after a full year
//      as a hard backstop in case dedupe ever missed one.

// Deterministic dedupe key for a question: lowercase, drop punctuation, collapse
// whitespace, cap length. Two phrasings that differ only in spacing, casing, or
// a trailing question mark collapse to the same key, which is what lets the
// upsert dedupe. Kept self contained (no shared import) so this module stays
// unit testable. It mirrors the cache's normaliseQuestion in spirit; the two
// tables are independent, so exact parity is not required.
export function qaDedupeKey(q: string): string {
  return (q || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

// Days after which a qa_candidates row is pruned, by state.
export const QA_RETENTION = {
  terminalDays: 90, // dismissed / auto_approved / reviewed: already actioned
  unreviewedDays: 365, // hard backstop; write time dedupe bounds the common case
};

// qa_cache: an entry not refreshed within this window can never be served
// (lookupQaCache requires updated_at within the 21 day read TTL), so it is dead
// weight after that TTL plus a margin. Pruning it only forces a re answer once
// on the rare popular question that went a month without a refresh.
export const QA_CACHE_PRUNE_DAYS = 28;

export interface PrunePath {
  table: string;
  path: string;
  maxBatches: number;
}

// Build the exact PostgREST DELETE paths for the qa_* housekeeping, given now.
// Pure: returns strings and performs no IO, so a test can assert the cutoffs and
// filters without a database. pruneOldRows feeds each through its batched delete.
export function qaPrunePaths(now: Date = new Date()): PrunePath[] {
  const cutoff = (days: number) =>
    encodeURIComponent(new Date(now.getTime() - days * 86_400_000).toISOString());
  return [
    // Terminal states: a human reviewed or dismissed the row, or the governed
    // step auto approved it into knowledge, so the candidate record is spent.
    {
      table: 'qa_candidates',
      path:
        `qa_candidates?status=in.(dismissed,auto_approved,reviewed)` +
        `&created_at=lt.${cutoff(QA_RETENTION.terminalDays)}&order=created_at.asc&limit=10000`,
      maxBatches: 10,
    },
    // Unreviewed rows older than a year: the hard backstop. Dedupe keeps the
    // common case tiny; this stops a truly stale long tail growing forever.
    {
      table: 'qa_candidates',
      path:
        `qa_candidates?status=eq.unreviewed` +
        `&created_at=lt.${cutoff(QA_RETENTION.unreviewedDays)}&order=created_at.asc&limit=10000`,
      maxBatches: 10,
    },
    // qa_cache entries past the read TTL plus a margin: unservable dead weight.
    {
      table: 'qa_cache',
      path:
        `qa_cache?updated_at=lt.${cutoff(QA_CACHE_PRUNE_DAYS)}` +
        `&order=updated_at.asc&limit=10000`,
      maxBatches: 10,
    },
  ];
}
