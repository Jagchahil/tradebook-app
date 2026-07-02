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
  listLinkedBankConnections,
  updateBankConnection,
  recentUnconfirmedCaptures,
  insertBankTransactions,
} from './supabase';
import { refreshAccess, getBookedTransactions, mapBankTransaction, matchesCapture, isSandbox } from './bankfeed';

export interface SyncResult {
  inserted: number;
  ok: boolean;
}

// A first sync pulls this many days of history. Enough to fill the current tax
// quarter view with something real, without dragging in years of statements.
const FIRST_SYNC_DAYS = 30;
// Safety valve per account per run; the daily sync catches anything beyond it.
const MAX_ROWS_PER_ACCOUNT = 1000;

// Sync one connection using a valid access token the caller already holds
// (fresh from the code exchange, or from a refresh). Rows are collected first
// and written in BULK, so even a large first import is a handful of database
// requests rather than one per transaction.
export async function syncWithAccessToken(
  conn: Pick<BankConnection, 'id' | 'user_id' | 'account_ids' | 'last_synced_date'>,
  accessToken: string,
): Promise<SyncResult> {
  // Overlap the window by 3 days so late-booked lines are never missed; the
  // external_id conflict rule makes the overlap harmless. A first sync (no
  // last_synced_date) is bounded to recent history in production. The SANDBOX
  // asks from 2015 explicitly, because Mock Bank's static test transactions are
  // dated years back AND TrueLayer applies its own recent default window when
  // `from` is omitted, so omitting the bound is not enough to reach them.
  const from = isSandbox()
    ? '2015-01-01'
    : conn.last_synced_date
      ? new Date(new Date(conn.last_synced_date).getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      : new Date(Date.now() - FIRST_SYNC_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
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
      // Skip anything the user already captured on WhatsApp themselves.
      if (captures.some((c) => matchesCapture(entry, c))) continue;
      toInsert.push(entry);
      taken += 1;
    }
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

// Every linked connection, within a time budget. Used by the daily cron.
export async function syncAllLinked(budgetMs: number): Promise<{ connections: number; inserted: number }> {
  const started = Date.now();
  let connections = 0;
  let inserted = 0;
  const linked = await listLinkedBankConnections();
  for (const conn of linked) {
    if (Date.now() - started > budgetMs) break;
    const r = await refreshAndSync(conn);
    if (r.ok) {
      connections += 1;
      inserted += r.inserted;
    }
  }
  return { connections, inserted };
}
