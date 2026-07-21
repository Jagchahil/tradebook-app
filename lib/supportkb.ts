// SUPPORT KNOWLEDGE BASE, server side. Jag's common-issue notes live in Obsidian; a mini sync POSTs them
// to the ingest route, which REPLACES this table (the vault is the source of truth). The Support desk
// reads it two ways: it grounds the Claude draft in the issues that match a customer's message, and it
// offers those same issues as one-click pick-list replies. Self-contained REST via the service role,
// same posture as lib/support.ts and lib/dakiya.ts. No customer data here — only our own playbook.

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

export interface KbRow {
  id: string;
  slug: string;
  title: string;
  keywords: string[];
  body: string;
  updated_at: string;
}

export interface KbDTO {
  id: string;
  slug: string;
  title: string;
  body: string;
}

function toDTO(r: KbRow): KbDTO {
  return { id: r.id, slug: r.slug, title: r.title, body: r.body };
}

export async function readAllKb(): Promise<KbRow[]> {
  try {
    const res = await fetch(`${base()}/rest/v1/support_kb?select=*&order=title.asc&limit=500`, { headers: h() });
    if (!res.ok) return [];
    return (await res.json()) as KbRow[];
  } catch {
    return [];
  }
}

// Score each entry against a customer's message: a point per keyword that appears, plus a point per
// meaningful title word that appears. Return the best few (score > 0). Deliberately simple substring
// matching — the volume is tiny and a wrong-but-relevant suggestion is harmless (Jag edits before send).
const STOP = new Set(['the', 'and', 'for', 'with', 'not', 'your', 'you', 'are', 'was', 'has', 'have', 'this', 'that', 'from', 'lekhio']);
export function scoreKb(entry: { title: string; keywords: string[] }, text: string): number {
  const t = ` ${text.toLowerCase()} `;
  let score = 0;
  for (const k of entry.keywords) {
    const kk = k.trim().toLowerCase();
    if (kk && t.includes(kk)) score += 2;
  }
  for (const w of entry.title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length >= 4 && !STOP.has(w) && t.includes(w)) score += 1;
  }
  return score;
}

export async function matchKb(text: string, limit = 3): Promise<KbDTO[]> {
  if (!text || !text.trim()) return [];
  const all = await readAllKb();
  return all
    .map((r) => ({ r, s: scoreKb(r, text) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => toDTO(x.r));
}

export interface KbInput {
  slug: string;
  title: string;
  keywords: string[];
  body: string;
}

// Replace the whole table from the vault. Delete-all then insert, like the CEO to-do sync: the Obsidian
// folder is the single source of truth, so a note removed there is removed here on the next run.
export async function replaceKb(items: KbInput[]): Promise<boolean> {
  try {
    const del = await fetch(`${base()}/rest/v1/support_kb?id=not.is.null`, {
      method: 'DELETE',
      headers: h({ Prefer: 'return=minimal' }),
    });
    if (!del.ok) return false;
    if (items.length === 0) return true;
    const rows = items
      .filter((i) => i.slug && i.title && i.body)
      .map((i) => ({
        slug: i.slug,
        title: i.title,
        keywords: (i.keywords || []).map((k) => String(k).trim().toLowerCase()).filter(Boolean),
        body: i.body,
      }));
    const res = await fetch(`${base()}/rest/v1/support_kb`, {
      method: 'POST',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify(rows),
    });
    return res.ok;
  } catch {
    return false;
  }
}
