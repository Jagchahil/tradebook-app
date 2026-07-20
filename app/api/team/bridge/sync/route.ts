import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import {
  upsertHeartbeat,
  appendActivity,
  type WorkerStatus,
  type ActivityKind,
  type ActivityInput,
} from '../../../../../lib/bridge';

export const runtime = 'nodejs';

// A MINI WORKER REPORTS HERE. Not the team login: this is a bot on the mini, so it carries the shared
// secret in the x-munshi-secret header (constant-time compared to MUNSHI_SECRET, the same secret Munshi
// already uses). It upserts the worker's heartbeat and appends any activity. No customer data crosses
// this wire — a worker sends only its OWN status. If MUNSHI_SECRET is unset, every call is refused.

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const STATUSES: WorkerStatus[] = ['ok', 'warn', 'alert', 'offline'];
const KINDS: ActivityKind[] = ['start', 'done', 'found', 'info', 'warn', 'error'];

interface Body {
  worker_key?: string;
  workerKey?: string;
  status?: string;
  headline?: string;
  detail?: Record<string, unknown>;
  activity?: Array<{ kind?: string; message?: string }>;
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

  const workerKey = String(body.worker_key ?? body.workerKey ?? '').slice(0, 40);
  if (!workerKey) return NextResponse.json({ error: 'worker_key required' }, { status: 400 });

  const status: WorkerStatus = STATUSES.includes(body.status as WorkerStatus) ? (body.status as WorkerStatus) : 'ok';
  const headline = String(body.headline ?? '').slice(0, 200);
  const detail = body.detail && typeof body.detail === 'object' ? body.detail : {};

  const okHb = await upsertHeartbeat({ worker_key: workerKey, status, headline, detail });

  let acts: ActivityInput[] = [];
  if (Array.isArray(body.activity)) {
    acts = body.activity
      .slice(0, 20)
      .map((a) => ({
        worker_key: workerKey,
        kind: (KINDS.includes(a?.kind as ActivityKind) ? a?.kind : 'info') as ActivityKind,
        message: String(a?.message ?? '').slice(0, 300),
      }))
      .filter((a) => a.message);
    if (acts.length) await appendActivity(acts);
  }

  if (!okHb) return NextResponse.json({ error: 'write failed' }, { status: 503 });
  return NextResponse.json({ ok: true, activity: acts.length });
}
