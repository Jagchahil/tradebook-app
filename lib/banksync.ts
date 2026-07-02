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
  listLinkedBankConnections,
  updateBankConnection,
  recentUnconfirmedCaptures,
  insertBankTransaction,
} from './supabase';
import { refreshAccess, getBookedTransactions, mapBankTransaction, matchesCapture } from './bankfeed';

export interface SyncResult {
  inserted: number;
  ok: boolean;
}

// Sync one connection using a valid access token the caller already holds
// (fresh from the code exchange, or from a refresh).
export async function syncWithAccessToken(
  conn: Pick<BankConnection, 'id' | 'user_id' | 'account_ids' | 'last_synced_date'>,
  accessToken: string,
): Promise<SyncResult> {
  let inserted = 0;
  // Overlap the window by 3 days so late-booked lines are never missed; the
  // external_id conflict rule makes the overlap harmless.
  const from = conn.last_synced_date
    ? new Date(new Date(conn.last_synced_date).getTime() - 3 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : undefined;
  const captures = await recentUnconfirmedCaptures(
    conn.user_id,
    new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  );
  for (const accountId of conn.account_ids) {
    const booked = await getBookedTransactions(accessToken, accountId, from);
    if (!booked) continue;
    for (const raw of booked) {
      const entry = mapBankTransaction(raw);
      if (!entry) continue;
      // Skip anything the user already captured on WhatsApp themselves.
      if (captures.some((c) => matchesCapture(entry, c))) continue;
      if (await insertBankTransaction(conn.user_id, entry)) inserted += 1;
    }
  }
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
