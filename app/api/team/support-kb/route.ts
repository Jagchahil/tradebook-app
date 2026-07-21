import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readAllKb, upsertEntry, deleteEntry } from '../../../../lib/supportkb';
import { faqs } from '../../../_shared/site';

export const runtime = 'nodejs';

// THE WEBSITE SWEEP, run live. Every load compares the public site FAQ (the single source of the
// marketing answers) against the playbook, and flags any FAQ topic the website covers that the desk does
// not yet answer — so your answers never fall behind the site. Deliberately forgiving: a topic counts as
// covered if any playbook entry shares a real word with the question (so "tradesperson" is covered by an
// entry about "trade"). Only genuinely uncovered topics show.
const STOP = new Set(['does', 'this', 'that', 'have', 'what', 'your', 'mean', 'with', 'from', 'four', 'lekhio', 'financial', 'they']);
function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
}
function coveredByPlaybook(question: string, entryBlobs: string[]): boolean {
  const q = ` ${question.toLowerCase()} `;
  const qTokens = tokens(question);
  return entryBlobs.some((blob) => {
    // an entry word appears inside the question (covers "trade" -> "tradesperson")...
    if (tokens(blob).some((w) => w.length >= 4 && q.includes(w))) return true;
    // ...or a question word appears inside the entry.
    return qTokens.some((w) => blob.includes(w));
  });
}

// THE PLAYBOOK. The console's Playbook node reads and edits every common-issue entry — the same rows that
// ground the drafts and fill the pick-list. Team-gated, same as the rest of the console. support_kb is
// the source of truth (a mini job mirrors it back into the Obsidian vault). GET lists; POST saves one
// (edit with id, add without); DELETE removes one. No customer data — only our own playbook.
async function gate(req: NextRequest): Promise<NextResponse | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await gate(req);
  if (denied) return denied;
  const rows = await readAllKb();
  // The live website sweep: which site FAQ topics the playbook does not yet cover.
  const entryBlobs = rows.map((r) => `${r.title} ${r.keywords.join(' ')} ${r.body}`.toLowerCase());
  const missingFaqs = faqs.filter((f) => !coveredByPlaybook(f.q, entryBlobs)).map((f) => f.q);
  return NextResponse.json({
    entries: rows.map((r) => ({ id: r.id, title: r.title, body: r.body, keywords: r.keywords, updatedAt: r.updated_at })),
    health: { missingFaqs },
  });
}

export async function POST(req: NextRequest) {
  const denied = await gate(req);
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as { id?: string; title?: string; keywords?: unknown; body?: string };
  const keywords = Array.isArray(b.keywords)
    ? b.keywords.map((k) => String(k))
    : typeof b.keywords === 'string'
    ? b.keywords.split(',')
    : [];
  const row = await upsertEntry({ id: b.id, title: b.title || '', keywords, body: b.body || '' });
  if (!row) return NextResponse.json({ error: 'save failed (title and answer are required)' }, { status: 400 });
  return NextResponse.json({ entry: { id: row.id, title: row.title, body: row.body, keywords: row.keywords, updatedAt: row.updated_at } });
}

export async function DELETE(req: NextRequest) {
  const denied = await gate(req);
  if (denied) return denied;
  const id = req.nextUrl.searchParams.get('id') || ((await req.json().catch(() => ({}))) as { id?: string }).id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const ok = await deleteEntry(id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'delete failed' }, { status: 500 });
}
