// lib/banksync.ts. The bank feed sync, shared by the daily cron and the
// connect callback (which runs a first sync immediately, so a user sees their
// transactions moments after connecting rather than the next day).
//
// Every imported row lands UNCONFIRMED: the approval gate holds, nothing counts
// toward tax until the user confirms it in the app. Idempotent on the bank's
// stable transaction id, and deduped against recent WhatsApp captures so a
// receipt photo and its card payment never double count.

import {
  BankConnection,
  BankEntryInsert,
  updateBankConnection,
  recentUnconfirmedCaptures,
  insertBankTransactions,
  getUserRules,
  getVendorPatterns,
  applyBankTruthToCapture,
} from './supabase';
import { refreshAccess, getBookedTransactions, mapBankTransaction, isSandbox, taxYearStartISO } from './bankfeed';
import { normaliseVendor, recall } from './memory';
import { findDuplicate } from './dedupe';
import { looksPersonal } from './personal';
import { shouldAutoFile } from './digest';
import { decryptSecret } from './crypto';

export interface SyncResult {
  inserted: number;
  ok: boolean;
}

// Safety valve per account per run; the daily sync catches anything beyond it.
const MAX_ROWS_PER_ACCOUNT = 1000;

// Sync one connection using a valid access token the caller already holds
// (fresh from the code exchange, or from a refresh). Rows are collected first
// and written in BULK, so even a large first import is a handful of database
// requests rather than one per transaction.
export async function syncWithAccessToken(
  conn: Pick<BankConnection, 'id' | 'user_id' | 'account_ids' | 'last_synced_date' | 'history_from'>,
  accessToken: string,
): Promise<SyncResult> {
  // Overlap the window by 3 days so late-booked lines are never missed; the
  // external_id conflict rule makes the overlap harmless. A first sync (no
  // last_synced_date) is bounded to recent history in production. The SANDBOX
  // asks from 2015 explicitly, because Mock Bank's static test transactions are
  // dated years back AND TrueLayer applies its own recent default window when
  // `from` is omitted, so omitting the bound is not enough to reach them.
  // First sync is bounded to the range the user chose at connect time (default
  // the current tax year), so we never pull more history than tax needs. Later
  // syncs are incremental from the last synced date, with a 3 day overlap.
  const from = isSandbox()
    ? '2015-01-01'
    : conn.last_synced_date
      ? new Date(new Date(conn.last_synced_date).getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      : conn.history_from ?? taxYearStartISO();
  const captures = await recentUnconfirmedCaptures(
    conn.user_id,
    new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  const toInsert: BankEntryInsert[] = [];
  for (const accountId of conn.account_ids) {
    const booked = await getBookedTransactions(accessToken, accountId, from);
    if (!booked) continue;
    let taken = 0;
    for (const raw of booked) {
      if (taken >= MAX_ROWS_PER_ACCOUNT) break;
      const entry = mapBankTransaction(raw);
      if (!entry) continue;
      // SANDBOX ONLY: Mock Bank dates are years in the past, so the app's
      // current period views would never show them. Respread them across the
      // last four weeks so the sandbox exercises the real user experience.
      // Real banks never enter this branch; real dates are never touched.
      if (isSandbox()) {
        entry.transaction_date = new Date(Date.now() - (taken % 28) * 24 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
      }
      // THE USER ALREADY SENT US THIS RECEIPT.
      //
      // We used to just drop the bank line here. That left the books holding an OCR
      // reading of a photograph, when the bank had just told us the exact amount and
      // the exact day the money left the account. A photo total can be misread, and
      // the date printed on a receipt is not always the date the card was charged.
      //
      // So now the BANK's figures are written onto the capture the user already
      // sent, and their photo, their category and their evidence are all kept. One
      // entry, with the right numbers on it. The user is told nothing, because
      // nothing has gone wrong and there is nothing for them to do.
      const already = findDuplicate(entry, captures, normaliseVendor);
      if (already && already.strength === 'same') {
        await applyBankTruthToCapture(conn.user_id, String(already.match.id), {
          amount: entry.amount,
          transaction_date: entry.transaction_date,
          external_id: entry.external_id,
        });
        continue;
      }
      // A 'maybe' is NOT merged: quietly deleting one of two genuine purchases
      // would raise the user's tax bill without them ever knowing. Let it come in as
      // its own row, and the duplicate rule in Things to check will raise it.

      toInsert.push(entry);
      taken += 1;
    }
  }
  // THE BRAIN. Apply what we already know before anything is written.
  //
  // Without this, a bank line the keyword map does not recognise lands as "other",
  // and it stays "other" no matter how many times the user has already told us what
  // that shop is. With it, everything they have ever corrected is applied for free,
  // and everything the crowd agrees on is applied for free too. NO AI CALL. That is
  // the whole point: the bank feed can be accurate AND cost us nothing, so it stays
  // the channel we want people on (see lib/margin.ts).
  //
  // Never fatal: if the brain is unreachable, the entries land exactly as they did
  // before, and the user simply has to correct them by hand as they always did.
  try {
    const keys = toInsert.map((e) => normaliseVendor(e.vendor));
    const [rules, patterns] = await Promise.all([
      getUserRules(conn.user_id),
      getVendorPatterns(keys.filter(Boolean)),
    ]);

    // THE PERSONAL CHECK RUNS ON EVERY LINE, KNOWN OR NOT.
    //
    // It used to live inside the loop below, AFTER `if (known.source === 'none') continue`.
    // So it only ever ran for a vendor we already knew about. On day one of a bank connect we
    // know NOTHING, and mapBankTransaction categorises every CREDIT as 'income'.
    //
    // Which means a CHILD TAX CREDIT landed in a man's books labelled "income", with no flag
    // on it, on the very day he connected his bank. It survived only because it arrived
    // unconfirmed, and he would probably have spotted it while tapping through them one by one.
    //
    // The moment we build a way to confirm two hundred things quickly, that stops being true.
    // A fast confirm over an unflagged pile is a machine for sweeping benefits into taxable
    // income. So the check runs first, on everything, before anything else looks at the entry.
    //
    // It does NOT mark them personal. Deciding a man's benefit is not business money is his
    // call, not ours, and the false positive direction here is the dangerous one: a supplier
    // refund wrongly excluded means he under-declares income, which is a worse problem to have
    // than paying a little too much tax. So we flag, and we ask, and we never bulk-confirm it.
    for (const entry of toInsert) {
      if (looksPersonal(entry.vendor, entry.description) !== null) {
        entry.looks_personal = true;
      }
    }

    if (rules.length > 0 || patterns.length > 0) {
      for (const entry of toInsert) {
        const known = recall(entry.vendor, rules, patterns);
        if (known.source === 'none') continue;

        // A category we know beats the keyword map's guess, and always beats "other".
        if (known.category) entry.category = known.category;

        // If they have told us this vendor is not business money, we never ask
        // twice. It arrives already out of the tax figures.
        if (known.isPersonal === true) entry.is_personal = true;

        // AUTO FILE. Doc 104 section 3: Lekhio decides everything reversible, the
        // user decides everything that is not.
        //
        // He has already told us what this shop is. Asking him again is asking a
        // question he has answered, and that is not an approval gate, it is an admin
        // task we invented and handed back to him.
        //
        // FOUR LIMITS, AND THEY ARE NOT NEGOTIABLE:
        //
        //   1. Only a rule HE taught us ('user'). The crowd's guess is a guess, not
        //      his answer, so a crowd category still gets asked about.
        //   2. Nothing that looks personal is ever auto filed. A benefit, a refund
        //      or a bet is the one thing that must never slip into the books unseen.
        //   3. The FILING to HMRC still asks. Every time. That is the irreversible
        //      act and it is his alone.
        //   4. He is told exactly what was filed, in the digest, and one word undoes
        //      it.
        // The rule itself lives in lib/digest.ts, in the open and under test, rather
        // than inline here where nobody would ever check it. It fails towards ASKING.
        if (
          shouldAutoFile({
            source: known.source,
            knownPersonal: known.isPersonal,
            looksPersonal: looksPersonal(entry.vendor, entry.description) !== null,
          })
        ) {
          entry.confirmed = true;
        }
      }
    }
  } catch {
    /* the brain is an improvement, never a dependency */
  }

  const inserted = await insertBankTransactions(conn.user_id, toInsert);
  await updateBankConnection(conn.id, { last_synced_date: new Date().toISOString().slice(0, 10) });
  return { inserted, ok: true };
}

// Refresh the stored token then sync. Marks the connection expired when the
// refresh fails, which usually means the 90 day consent has lapsed, so the app
// can prompt a reconnect rather than silently going stale.
export async function refreshAndSync(conn: BankConnection): Promise<SyncResult> {
  if (!conn.refresh_token) return { inserted: 0, ok: false };
  const tokens = await refreshAccess(conn.refresh_token);
  // Transient failure (rate limit, 5xx, network, missing config): leave the
  // connection linked and try again next run. Never nag the user to reconnect a
  // healthy bank over a blip.
  if (tokens === 'retry') return { inserted: 0, ok: false };
  // Genuine auth failure (null): consent has lapsed, so expiring is correct.
  if (!tokens) {
    await updateBankConnection(conn.id, { status: 'expired' });
    return { inserted: 0, ok: false };
  }
  await updateBankConnection(conn.id, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: tokens.expires_at,
  });
  return syncWithAccessToken(conn, tokens.access_token);
}

// --- Resumable scale path (20,000+ connections) ------------------------------
//
// The old syncAllLinked read a single 500 row page and looped serially inside
// one ~25s cron budget, so only a handful of connections ever synced per day.
// The fix is the same keyset + hop pattern the reminder cron uses: read one page
// ordered by id, process it with bounded concurrency inside a budget, and hand a
// cursor (the last id seen) to a continuation invocation. The chain walks every
// connection across successive, independent invocations.
//
// This module reads bank_connections directly rather than through supabase.ts,
// because it needs strict id ordering and a keyset cursor that the shared
// helpers do not expose. It copies supabase.ts's config()/headers() shape so the
// auth and base url stay identical.

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Match supabase.ts headers(): service role key as both apikey and Bearer.
function sbHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SB_KEY ?? '',
    Authorization: `Bearer ${SB_KEY ?? ''}`,
  };
}

// One keyset page of linked connections, strictly ordered by id ascending. When
// `afterId` is given we ask for id greater than it, so successive pages never
// overlap and never repeat, which is what makes the hop chain finite: each page
// advances the cursor to a strictly larger id, and the id space is finite.
//
// Tokens are decrypted here on read. Another agent is adding decryption inside
// supabase.ts's own read helpers; since this reader bypasses supabase.ts it must
// decrypt itself. decryptSecret is a safe no-op when BANK_TOKEN_KEY is unset and
// passes through legacy plaintext, so calling it is always correct whether or
// not encryption is switched on.
export async function listLinkedConnectionsPage(
  afterId: string | null,
  limit: number,
): Promise<BankConnection[]> {
  if (!SB_URL || !SB_KEY) return [];
  const cursor = afterId ? `&id=gt.${encodeURIComponent(afterId)}` : '';
  const res = await fetch(
    `${SB_URL}/rest/v1/bank_connections?status=eq.linked&select=*&order=id.asc&limit=${limit}${cursor}`,
    { headers: sbHeaders() },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as BankConnection[];
  return rows.map((row) => ({
    ...row,
    access_token: decryptSecret(row.access_token),
    refresh_token: decryptSecret(row.refresh_token),
  }));
}

// Bounded concurrency runner, local to this module (mirrors the cron's mapLimit
// so a page of connections is processed by a fixed pool of workers rather than
// one long chain of sequential awaits). One failing connection never stops the
// rest. Concurrency is kept modest because each connection can make several
// TrueLayer calls; the token refresh path is the real rate limit pressure.
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      try {
        await fn(item);
      } catch {
        // Swallow: a single connection's failure must not abort the whole page.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

export interface PageResult {
  processed: number; // connections whose sync returned ok
  inserted: number; // new transaction rows written
  lastId: string | null; // cursor for the next hop (last id seen this page)
  done: boolean; // true when this was the final page (no more rows)
}

// Read and process one page of linked connections, respecting a soft time
// budget. Returns the cursor and whether the walk is complete.
//
// `done` is true precisely when the page came back smaller than `limit`, which
// (given the strictly increasing id order) means there are no rows with a larger
// id, i.e. this was the last page. That is the flag the cron uses to stop
// hopping. `lastId` is the largest id seen, so the next hop asks for id greater
// than it and cannot revisit a connection already handled.
const PAGE_LIMIT = 200;

export async function syncPageResumable(
  afterId: string | null,
  budgetMs: number,
  concurrency: number,
): Promise<PageResult> {
  const started = Date.now();
  const page = await listLinkedConnectionsPage(afterId, PAGE_LIMIT);
  if (page.length === 0) {
    // Empty page: nothing left, the walk is complete.
    return { processed: 0, inserted: 0, lastId: afterId, done: true };
  }

  let processed = 0;
  let inserted = 0;
  // The page is ordered by id ascending, so the last row carries the max id and
  // is always the correct next cursor even if the budget cuts processing short.
  const lastId = page[page.length - 1].id;

  await mapLimit(page, concurrency, async (conn) => {
    // Respect the budget: stop starting new syncs once it is spent. Rows not
    // reached this run are simply picked up on the next daily run (or, within
    // this run, by the continuation hop which resumes from lastId). Idempotency
    // on external_id makes any re-read of the same window harmless.
    if (Date.now() - started > budgetMs) return;
    const r = await refreshAndSync(conn);
    if (r.ok) {
      processed += 1;
      inserted += r.inserted;
    }
  });

  // done is driven purely by page size, not by the budget, so a budget cut never
  // falsely signals completion. A short page means the id cursor has reached the
  // end of the linked set.
  return { processed, inserted, lastId, done: page.length < PAGE_LIMIT };
}

// Backward compatible single window sync. Kept so existing callers (and the
// manual bankfeed trigger) keep working. It now delegates to the resumable path
// for one budget window: it walks pages in-process until the budget is spent or
// the set is exhausted, without spawning continuation invocations. The daily
// cron uses the hop chain instead, which is what actually reaches all 20k.
export async function syncAllLinked(budgetMs: number): Promise<{ connections: number; inserted: number }> {
  const started = Date.now();
  let connections = 0;
  let inserted = 0;
  let cursor: string | null = null;
  for (;;) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining <= 0) break;
    const page = await syncPageResumable(cursor, remaining, 5);
    connections += page.processed;
    inserted += page.inserted;
    if (page.done || !page.lastId || page.lastId === cursor) break;
    cursor = page.lastId;
  }
  return { connections, inserted };
}
