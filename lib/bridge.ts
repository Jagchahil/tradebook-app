// THE BRIDGE, server side. The mini's workers POST their status to /api/team/bridge/sync; the console
// reads it so the CEO can watch the team work. Self-contained REST via the service role, same posture
// as lib/todos.ts. No customer data — workers report only their OWN status. Kept out of the 200KB
// supabase.ts on purpose.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function base(): string {
  if (!URL || !SERVICE_KEY) throw new Error('Supabase env vars are missing.');
  return URL;
}
function h(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY as string,
    Authorization: `Bearer ${SERVICE_KEY as string}`,
    ...extra,
  };
}

export type WorkerStatus = 'ok' | 'warn' | 'alert' | 'offline';
export type ActivityKind = 'start' | 'done' | 'found' | 'info' | 'warn' | 'error';

// A heartbeat older than this reads as "resting" (offline), not an alarm — the mini sleeps when Jag
// travels, and a calm "last seen 2h ago" is the truth, not a red light.
const STALE_MS = 3 * 60 * 60 * 1000; // 3 hours

// --- DB rows -------------------------------------------------------------------------------------
export interface HeartbeatRow {
  worker_key: string;
  status: WorkerStatus;
  headline: string;
  detail: Record<string, unknown>;
  last_run_at: string | null;
  updated_at: string;
}
export interface ActivityRow {
  id: string;
  worker_key: string;
  kind: ActivityKind;
  message: string;
  at: string;
}

// --- what the console wants (camelCase, with the derived staleness) ------------------------------
export interface HeartbeatDTO {
  workerKey: string;
  status: WorkerStatus;   // forced to 'offline' when stale, whatever the row said
  headline: string;
  detail: Record<string, unknown>;
  lastRunAt: string | null;
  updatedAt: string;
  stale: boolean;
}
export interface ActivityDTO {
  id: string;
  workerKey: string;
  kind: ActivityKind;
  message: string;
  at: string;
}

export function heartbeatToDTO(r: HeartbeatRow, now: number): HeartbeatDTO {
  const updatedMs = Date.parse(r.updated_at);
  const stale = Number.isFinite(updatedMs) ? now - updatedMs > STALE_MS : true;
  return {
    workerKey: r.worker_key,
    status: stale ? 'offline' : r.status,
    headline: r.headline,
    detail: r.detail ?? {},
    lastRunAt: r.last_run_at,
    updatedAt: r.updated_at,
    stale,
  };
}

export async function readHeartbeats(now = Date.now()): Promise<HeartbeatDTO[] | null> {
  try {
    const res = await fetch(`${base()}/rest/v1/worker_heartbeats?select=*&order=worker_key.asc`, { headers: h() });
    if (!res.ok) return null;
    const rows = (await res.json()) as HeartbeatRow[];
    return rows.map((r) => heartbeatToDTO(r, now));
  } catch { return null; }
}

// Is a given worker alive right now? Reads its heartbeat and checks it beat within maxAgeMs. Used by the
// webhook to decide whether to promise a customer "writing it up now" — if the voice transcriber on the
// mini is not beating, we must not make a promise we cannot keep. Fails CLOSED: any doubt reads as "not
// live", so we tell the customer plainly rather than park a note nobody will pick up.
export async function isWorkerLive(workerKey: string, maxAgeMs = 180000, now = Date.now()): Promise<boolean> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/worker_heartbeats?worker_key=eq.${encodeURIComponent(workerKey)}&select=updated_at`,
      { headers: h() },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as Array<{ updated_at: string }>;
    const updated = rows[0]?.updated_at ? Date.parse(rows[0].updated_at) : NaN;
    return Number.isFinite(updated) && now - updated <= maxAgeMs;
  } catch {
    return false;
  }
}

export async function readActivity(limit = 40): Promise<ActivityDTO[] | null> {
  try {
    const n = Math.min(200, Math.max(1, limit));
    const res = await fetch(`${base()}/rest/v1/worker_activity?select=*&order=at.desc&limit=${n}`, { headers: h() });
    if (!res.ok) return null;
    const rows = (await res.json()) as ActivityRow[];
    return rows.map((r) => ({ id: r.id, workerKey: r.worker_key, kind: r.kind, message: r.message, at: r.at }));
  } catch { return null; }
}

// --- the write path, used only by the secret-gated sync route ------------------------------------
export interface HeartbeatInput {
  worker_key: string;
  status: WorkerStatus;
  headline: string;
  detail?: Record<string, unknown>;
  last_run_at?: string; // ISO; defaults to now
}

export async function upsertHeartbeat(input: HeartbeatInput): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const row = {
      worker_key: input.worker_key,
      status: input.status,
      headline: input.headline,
      detail: input.detail ?? {},
      last_run_at: input.last_run_at ?? nowIso,
      updated_at: nowIso,
    };
    // PostgREST upsert on the primary key (worker_key): merge-duplicates.
    const res = await fetch(`${base()}/rest/v1/worker_heartbeats`, {
      method: 'POST',
      headers: h({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row),
    });
    return res.ok;
  } catch { return false; }
}

export interface ActivityInput { worker_key: string; kind: ActivityKind; message: string; }

export async function appendActivity(items: ActivityInput[]): Promise<boolean> {
  if (items.length === 0) return true;
  try {
    const res = await fetch(`${base()}/rest/v1/worker_activity`, {
      method: 'POST',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify(items),
    });
    if (!res.ok) return false;
    // Keep the table bounded on the Free plan: drop activity older than 7 days. Fire-and-forget.
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    void fetch(`${base()}/rest/v1/worker_activity?at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE',
      headers: h({ Prefer: 'return=minimal' }),
    }).catch(() => {});
    return true;
  } catch { return false; }
}

// --- RE-RUN REQUESTS -----------------------------------------------------------------------------
// The reusable half of the "warning -> prompt + retry" pattern. When Jag hits Retry under a bot's
// warning, we record ONE pending request per worker (upsert on worker_key). The worker claims it at the
// top of its next run and clears it, so a fix can be re-checked off-schedule without waiting for the
// bot's normal working hours. No customer data — just "please look again", plus who asked.
export interface RerunRow { worker_key: string; requested_at: string; requested_by: string | null }

export async function requestRerun(workerKey: string, requestedBy: string | null): Promise<boolean> {
  try {
    const row = { worker_key: workerKey, requested_at: new Date().toISOString(), requested_by: requestedBy ?? null };
    const res = await fetch(`${base()}/rest/v1/worker_reruns`, {
      method: 'POST',
      headers: h({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row),
    });
    return res.ok;
  } catch { return false; }
}

// Read + clear the pending request for one worker (the mini bot calls this at the top of a run).
// Delete-then-report so the same request is never claimed twice. Returns true when one was pending.
export async function claimRerun(workerKey: string): Promise<boolean> {
  try {
    const key = encodeURIComponent(workerKey);
    const res = await fetch(`${base()}/rest/v1/worker_reruns?worker_key=eq.${key}`, {
      method: 'DELETE',
      headers: h({ Prefer: 'return=representation' }),
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as RerunRow[];
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

// Which workers currently have a rerun pending — so the console can show "re-check queued".
export async function readPendingReruns(): Promise<string[]> {
  try {
    const res = await fetch(`${base()}/rest/v1/worker_reruns?select=worker_key`, { headers: h() });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ worker_key: string }>;
    return rows.map((r) => r.worker_key);
  } catch { return []; }
}
