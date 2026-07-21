import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import { readTeamTodos, setTodoDone, type TodoItemDTO } from '../../../../lib/todos';
import { readTickets } from '../../../../lib/support';

export const runtime = 'nodejs';

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

  const [todos, support] = await Promise.all([readTeamTodos(), openSupportTodos()]);
  if (todos === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  // Support items first: a person waiting on a human is the most time-sensitive thing on the list.
  return NextResponse.json({ todos: [...support, ...todos] });
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

  // Support items are live pointers to open tickets — resolved by answering or dismissing in the
  // Support desk, not by ticking here. Accept the tap so the UI stays smooth, but change nothing; the
  // item clears itself on the next poll once the ticket is actually handled.
  if (body.id.startsWith('support:')) return NextResponse.json({ ok: true });

  const ok = await setTodoDone(body.id, body.done === true);
  return NextResponse.json({ ok });
}
