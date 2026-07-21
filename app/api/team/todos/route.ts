import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readTeamTodos, setTodoDone, type TodoItemDTO } from '../../../../lib/todos';
import { readTickets } from '../../../../lib/support';
import { readHeartbeats } from '../../../../lib/bridge';

export const runtime = 'nodejs';

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

interface SurfaceRow { key?: string; label?: string; status?: string; note?: string }

// SECURITY GOES TO THE TOP, STRAIGHT AWAY. Any live worker reporting a warning — either a whole-worker
// warn/alert, or (for Pehredaar) a single watched surface in warn/alert — becomes a hi-priority item at
// the very top of the CEO list, above everything else. These rows are SYNTHETIC (id prefixed
// "security:"), never team_todos: they appear the instant a bot flags something and clear themselves the
// moment the next sweep reads clean. A stale (resting) worker is not an alarm, so it is skipped.
async function openSecurityTodos(): Promise<TodoItemDTO[]> {
  try {
    const beats = await readHeartbeats();
    if (!beats) return [];
    const out: TodoItemDTO[] = [];
    for (const b of beats) {
      if (b.stale) continue;
      const surfaces = Array.isArray((b.detail as { surfaces?: SurfaceRow[] })?.surfaces)
        ? ((b.detail as { surfaces?: SurfaceRow[] }).surfaces as SurfaceRow[])
        : [];
      const flagged = surfaces.filter((s) => s?.status === 'warn' || s?.status === 'alert');
      if (flagged.length) {
        for (const s of flagged) {
          const label = String(s.label ?? s.key ?? 'A surface');
          const note = String(s.note ?? '').slice(0, 220);
          out.push({
            id: `security:${b.workerKey}:${s.key ?? label}`,
            kind: 'needs',
            buddyKey: b.workerKey,
            text: note ? `${label} needs a look — ${note}` : `${label} needs a look.`,
            from: `${cap(b.workerKey)} · security watch`,
            where: cap(b.workerKey),
            prio: 'hi',
            done: false,
          });
        }
      } else if (b.status === 'warn' || b.status === 'alert') {
        out.push({
          id: `security:${b.workerKey}`,
          kind: 'needs',
          buddyKey: b.workerKey,
          text: b.headline || `${cap(b.workerKey)} flagged something — open the desk.`,
          from: `${cap(b.workerKey)} · security watch`,
          where: cap(b.workerKey),
          prio: 'hi',
          done: false,
        });
      }
    }
    return out;
  } catch {
    return []; // best-effort; a bridge hiccup must never break the CEO list
  }
}

// THE CEO TO-DO LIST the console reads. Same gate as the rest of the console: a row in team_members,
// read fresh on THIS request. GET returns the list; POST marks one done or reopens it (any team
// member). Munshi WRITES the list through the separate secret-gated /sync route, not here.

// A waiting WhatsApp support ticket is a "needs you" item: only a human can reply. We surface open
// tickets live, right beside Munshi's prepared list, so a customer asking for a person never sits unseen
// on a separate page. These rows are SYNTHETIC (id prefixed "support:"), not team_todos: Munshi's daily
// replace never touches them, and they vanish the instant the ticket is answered or dismissed in the
// Support desk. Ticking one here is a deliberate no-op — it is resolved by actually replying.
const SUPPORT_TEXT: Record<string, string> = {
  human: 'A customer asked to speak to a human — reply in the Support desk.',
  complaint: 'A customer raised a complaint — reply in the Support desk.',
  billing: 'A customer has a billing question — reply in the Support desk.',
  problem: 'A customer reported a problem — reply in the Support desk.',
  other: 'A customer needs a hand on WhatsApp — reply in the Support desk.',
};

async function openSupportTodos(): Promise<TodoItemDTO[]> {
  try {
    const t = await readTickets();
    if (!t?.open?.length) return [];
    return t.open.map((k) => ({
      id: `support:${k.id}`,
      kind: 'needs' as const,
      buddyKey: 'dakiya',
      text: SUPPORT_TEXT[k.reason] ?? SUPPORT_TEXT.other,
      from: 'Support · WhatsApp',
      where: 'Support desk',
      prio: (k.reason === 'human' || k.reason === 'complaint' || k.reason === 'billing' ? 'hi' : 'md') as 'hi' | 'md',
      done: false,
    }));
  } catch {
    return []; // best-effort; a support hiccup must never break the CEO list
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [todos, support, security] = await Promise.all([
    readTeamTodos(),
    openSupportTodos(),
    openSecurityTodos(),
  ]);
  if (todos === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  // Done team_todos drop off the list entirely (the row stays in the DB, so it is reversible — reopen by
  // ticking again). A completed task is not clutter Jag should keep scanning past.
  const open = todos.filter((t) => !t.done);
  // Order of urgency: a security warning first (straight to the top), then a customer waiting on a human,
  // then the prepared day's list.
  return NextResponse.json({ todos: [...security, ...support, ...open] });
}

interface Body { id?: string; done?: boolean; }

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Support and security items are live pointers, not team_todos — a support item is resolved by
  // answering in the Support desk, a security item by fixing the cause and re-running the sweep. Accept
  // the tap so the UI stays smooth, but change nothing; each clears itself on the next poll once handled.
  if (body.id.startsWith('support:') || body.id.startsWith('security:')) {
    return NextResponse.json({ ok: true });
  }

  const ok = await setTodoDone(body.id, body.done === true);
  return NextResponse.json({ ok });
}
