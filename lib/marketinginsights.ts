// THE CEO INSIGHT BOX. A single text field, one tap to save, so a field observation from
// Marketplace, a trade forum, or a chat with a customer gets written down before it is forgotten.
// The machine learns from data it can query. This is for the thing data cannot see: what Jag
// noticed. Every row is tagged 'ceo_led_ideas' so it is easy to find and weigh separately once the
// marketing brain (doc: build board, "The marketing brain") exists to read it.
//
// Deliberately small. This is NOT the marketing brain, which does not exist yet: no Obsidian vault,
// no six note types, no nightly review. It is a safe place to drop a note today, in the shape the
// brain will expect (text, a tag, a source, a timestamp), so nothing said between now and then is
// lost. Server (service role) only, same posture as team_todos: RLS on, no client policies.

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

// The one tag every row carries today. A constant, not a free text field the caller can drift on,
// so a future reader can trust that every row in this table IS a CEO led idea, no filtering needed.
export const CEO_TAG = 'ceo_led_ideas';

const MAX_LEN = 2000;

export interface InsightRow {
  id: string;
  text: string;
  tag: string;
  created_by: string | null;
  created_at: string;
}

// Trim, cap, and reject empty. Pure, so it is tested without a database.
export function cleanInsight(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, MAX_LEN);
}

export async function addInsight(text: string, createdBy: string | null): Promise<InsightRow | null> {
  const clean = cleanInsight(text);
  if (!clean) return null;
  try {
    const res = await fetch(`${base()}/rest/v1/marketing_insights`, {
      method: 'POST',
      headers: h({ Prefer: 'return=representation' }),
      body: JSON.stringify({ text: clean, tag: CEO_TAG, created_by: createdBy }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as InsightRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function readInsights(limit = 20): Promise<InsightRow[] | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/marketing_insights?select=*&order=created_at.desc&limit=${limit}`,
      { headers: h() },
    );
    if (!res.ok) return null;
    return (await res.json()) as InsightRow[];
  } catch {
    return null;
  }
}
