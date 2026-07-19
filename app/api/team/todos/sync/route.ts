import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { replaceTodos, type TodoSyncInput, type TodoKind, type TodoPrio } from '../../../../../lib/todos';

export const runtime = 'nodejs';

// MUNSHI WRITES THE DAY'S LIST HERE. Not the team login: this is the bot on the mini, so it carries a
// shared secret in the x-munshi-secret header (constant-time compared to MUNSHI_SECRET). It REPLACES
// the whole list once, at 8am. No customer data crosses this wire; Munshi only ever sends our own
// status items. If MUNSHI_SECRET is unset, every call is refused.

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface InItem {
  kind?: string;
  buddy_key?: string; buddyKey?: string;
  text?: string;
  from_label?: string; from?: string;
  where_hint?: string | null; where?: string | null;
  prio?: string;
  done_label?: string | null; doneLabel?: string | null;
  sort?: number;
}

function clean(it: InItem, idx: number): TodoSyncInput {
  const kind: TodoKind = it.kind === 'approve' ? 'approve' : 'needs';
  const prio: TodoPrio = it.prio === 'hi' || it.prio === 'lo' ? it.prio : 'md';
  const where = it.where_hint ?? it.where ?? null;
  const doneLabel = it.done_label ?? it.doneLabel ?? null;
  return {
    kind,
    buddy_key: String(it.buddy_key ?? it.buddyKey ?? 'munshi').slice(0, 40),
    text: String(it.text ?? '').slice(0, 500),
    from_label: String(it.from_label ?? it.from ?? '').slice(0, 200),
    where_hint: where ? String(where).slice(0, 120) : null,
    prio,
    done_label: doneLabel ? String(doneLabel).slice(0, 120) : null,
    sort: Number.isFinite(it.sort as number) ? (it.sort as number) : (idx + 1) * 10,
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.MUNSHI_SECRET || '';
  const given = req.headers.get('x-munshi-secret') || '';
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { items?: InItem[] };
  try {
    body = (await req.json()) as { items?: InItem[] };
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 });
  }

  const items = body.items.slice(0, 50).map(clean).filter((i) => i.text);
  const ok = await replaceTodos(items);
  if (!ok) return NextResponse.json({ error: 'write failed' }, { status: 503 });
  return NextResponse.json({ ok: true, count: items.length });
}
