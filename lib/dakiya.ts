// DAKIYA, server side. The front desk. A scheduled reader (three times a day) scans the Lekhio
// mailboxes, drafts a reply to each real enquiry, and POSTs the drafts here through the secret gate.
// The console reads the pending drafts so Jag can edit and approve; on approve, the reply is SENT,
// branded, from the lane address it arrived on. Nothing ever leaves without his tap. Self-contained
// REST via the service role, exactly the posture of lib/bridge.ts and lib/todos.ts. Kept out of the
// 200KB supabase.ts on purpose. No customer financial data ever touches this table.

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

// Two customer-facing lanes plus a triaged general bucket. Sales = new enquiries; Support = existing
// customers; General = anything the reader could not confidently place (info@ / hello@).
export type Lane = 'sales' | 'support' | 'general';
export type DraftStatus = 'pending' | 'sent' | 'dismissed';

const LANES: Lane[] = ['sales', 'support', 'general'];
export function cleanLane(v: unknown): Lane {
  return LANES.includes(v as Lane) ? (v as Lane) : 'general';
}

// --- DB row ---------------------------------------------------------------------------------------
export interface DakiyaDraftRow {
  id: string;
  thread_id: string;
  message_id: string | null;
  lane: Lane;
  from_email: string;
  from_name: string | null;
  to_alias: string;
  subject: string;
  snippet: string;
  draft_subject: string;
  draft_body: string;
  status: DraftStatus;
  created_at: string;
  decided_at: string | null;
}

// --- what the console wants (camelCase) -----------------------------------------------------------
export interface DakiyaDraftDTO {
  id: string;
  threadId: string;
  lane: Lane;
  fromEmail: string;
  fromName: string | null;
  toAlias: string;
  subject: string;
  snippet: string;
  draftSubject: string;
  draftBody: string;
  status: DraftStatus;
  createdAt: string;
  decidedAt: string | null;
}

function toDTO(r: DakiyaDraftRow): DakiyaDraftDTO {
  return {
    id: r.id,
    threadId: r.thread_id,
    lane: r.lane,
    fromEmail: r.from_email,
    fromName: r.from_name,
    toAlias: r.to_alias,
    subject: r.subject,
    snippet: r.snippet,
    draftSubject: r.draft_subject,
    draftBody: r.draft_body,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

// Console read: pending drafts (the work), plus a short tail of already-decided ones for context.
export async function readDrafts(): Promise<{ pending: DakiyaDraftDTO[]; recent: DakiyaDraftDTO[] } | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/dakiya_drafts?select=*&order=created_at.desc&limit=200`,
      { headers: h() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as DakiyaDraftRow[];
    const all = rows.map(toDTO);
    return {
      pending: all.filter((d) => d.status === 'pending'),
      recent: all.filter((d) => d.status !== 'pending').slice(0, 30),
    };
  } catch { return null; }
}

export async function getDraft(id: string): Promise<DakiyaDraftRow | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/dakiya_drafts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      { headers: h() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as DakiyaDraftRow[];
    return rows[0] ?? null;
  } catch { return null; }
}

// True if we already hold any draft for this Gmail thread. Keeps the reader from drafting the same
// conversation twice, so re-running it three times a day is safe.
async function threadSeen(threadId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/dakiya_drafts?thread_id=eq.${encodeURIComponent(threadId)}&select=id&limit=1`,
      { headers: h() },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as { id: string }[];
    return rows.length > 0;
  } catch { return false; }
}

export interface DraftInput {
  thread_id: string;
  message_id?: string | null;
  lane: Lane;
  from_email: string;
  from_name?: string | null;
  to_alias: string;
  subject: string;
  snippet: string;
  draft_subject: string;
  draft_body: string;
}

// Secret-gated ingest. Insert only threads we have not seen, so re-running the reader never duplicates.
// Returns how many were newly stored.
export async function ingestDrafts(items: DraftInput[]): Promise<number> {
  let stored = 0;
  for (const it of items) {
    if (!it.thread_id || !it.from_email) continue;
    if (await threadSeen(it.thread_id)) continue;
    const row = {
      thread_id: it.thread_id,
      message_id: it.message_id ?? null,
      lane: cleanLane(it.lane),
      from_email: it.from_email,
      from_name: it.from_name ?? null,
      to_alias: it.to_alias,
      subject: it.subject.slice(0, 300),
      snippet: it.snippet.slice(0, 2000),
      draft_subject: it.draft_subject.slice(0, 300),
      draft_body: it.draft_body.slice(0, 20000),
      status: 'pending',
    };
    try {
      const res = await fetch(`${base()}/rest/v1/dakiya_drafts`, {
        method: 'POST',
        headers: h({ Prefer: 'return=minimal' }),
        body: JSON.stringify(row),
      });
      if (res.ok) stored++;
    } catch { /* skip this one, keep going */ }
  }
  return stored;
}

export async function updateDraftBody(id: string, subject: string, body: string): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/rest/v1/dakiya_drafts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ draft_subject: subject.slice(0, 300), draft_body: body.slice(0, 20000) }),
    });
    return res.ok;
  } catch { return false; }
}

export async function setDraftStatus(id: string, status: DraftStatus): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/rest/v1/dakiya_drafts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status, decided_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}
