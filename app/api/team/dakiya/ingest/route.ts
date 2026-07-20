import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ingestDrafts, cleanLane, type DraftInput } from '../../../../../lib/dakiya';
import { upsertHeartbeat, appendActivity } from '../../../../../lib/bridge';

export const runtime = 'nodejs';

// THE READER REPORTS HERE. A scheduled Dakiya run (Gmail-reading session or mini bot) scans the Lekhio
// mailboxes, drafts a reply to each real enquiry, and POSTs them here. It carries the shared secret in
// x-munshi-secret (constant-time compared to MUNSHI_SECRET), the same gate every mini worker uses.
// Drafts are deduped by Gmail thread, so re-running the reader is always safe. It also beats a
// heartbeat so Dakiya shows live on the console alongside the other workers.

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

interface InItem {
  thread_id?: string;
  message_id?: string | null;
  lane?: string;
  from_email?: string;
  from_name?: string | null;
  to_alias?: string;
  subject?: string;
  snippet?: string;
  draft_subject?: string;
  draft_body?: string;
}
interface Body {
  drafts?: InItem[];
  swept?: number;
}

export async function POST(req: NextRequest) {
  const secret = process.env.MUNSHI_SECRET || '';
  const given = req.headers.get('x-munshi-secret') || '';
  if (!secret || !safeEqual(given, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const items: DraftInput[] = Array.isArray(body.drafts)
    ? body.drafts
        .filter((d) => d && d.thread_id && d.from_email && d.to_alias)
        .slice(0, 50)
        .map((d) => ({
          thread_id: String(d.thread_id).slice(0, 200),
          message_id: d.message_id ? String(d.message_id).slice(0, 300) : null,
          lane: cleanLane(d.lane),
          from_email: String(d.from_email).slice(0, 254),
          from_name: d.from_name ? String(d.from_name).slice(0, 120) : null,
          to_alias: String(d.to_alias).slice(0, 254),
          subject: String(d.subject ?? '').slice(0, 300),
          snippet: String(d.snippet ?? '').slice(0, 2000),
          draft_subject: String(d.draft_subject ?? '').slice(0, 300),
          draft_body: String(d.draft_body ?? '').slice(0, 20000),
        }))
    : [];

  const stored = await ingestDrafts(items);

  // Beat so Dakiya shows "reporting live" on /team, exactly like Pehredaar and Kanjoos.
  const swept = Number.isFinite(body.swept as number) ? Number(body.swept) : items.length;
  await upsertHeartbeat({
    worker_key: 'dakiya',
    status: 'ok',
    headline: stored > 0
      ? `${stored} repl${stored === 1 ? 'y' : 'ies'} drafted and waiting for you.`
      : 'Inbox swept — nothing new to reply to.',
    detail: { swept, stored, at: new Date().toISOString() },
  });
  await appendActivity([
    {
      worker_key: 'dakiya',
      kind: stored > 0 ? 'found' : 'done',
      message: stored > 0
        ? `Drafted ${stored} repl${stored === 1 ? 'y' : 'ies'} from ${swept} scanned.`
        : `Swept ${swept}, nothing new to answer.`,
    },
  ]);

  return NextResponse.json({ ok: true, stored });
}
