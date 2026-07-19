// THE CEO TO-DO LIST, server side. Munshi (on the mini) REPLACES the day's list via the sync route;
// the console reads it and Jag ticks or approves. Self-contained REST, service role, same posture as
// the studio tables. No customer data. Kept out of the 200KB supabase.ts on purpose.

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

export type TodoKind = 'approve' | 'needs';
export type TodoPrio = 'hi' | 'md' | 'lo';

// The DB row.
export interface TeamTodoRow {
  id: string;
  kind: TodoKind;
  buddy_key: string;
  text: string;
  from_label: string;
  where_hint: string | null;
  prio: TodoPrio;
  done_label: string | null;
  done: boolean;
  sort: number;
  created_at: string;
}

// The shape the console's WorkforceTodo wants (camelCase). Mapped from the row.
export interface TodoItemDTO {
  id: string;
  kind: TodoKind;
  buddyKey: string;
  text: string;
  from: string;
  where?: string;
  prio: TodoPrio;
  doneLabel?: string;
  done: boolean;
}

export function toDTO(r: TeamTodoRow): TodoItemDTO {
  return {
    id: r.id,
    kind: r.kind,
    buddyKey: r.buddy_key,
    text: r.text,
    from: r.from_label,
    where: r.where_hint ?? undefined,
    prio: r.prio,
    doneLabel: r.done_label ?? undefined,
    done: r.done,
  };
}

export async function readTeamTodos(): Promise<TodoItemDTO[] | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/team_todos?select=*&order=sort.asc,created_at.desc&limit=200`,
      { headers: h() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as TeamTodoRow[];
    return rows.map(toDTO);
  } catch { return null; }
}

export async function setTodoDone(id: string, done: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/rest/v1/team_todos?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ done }),
    });
    return res.ok;
  } catch { return false; }
}

// Munshi's daily sync: replace the whole list. Delete-all then insert, so the console always shows the
// current day's items. Runs once at 8am, so Jag's mid-day ticks are never clobbered.
export interface TodoSyncInput {
  kind: TodoKind;
  buddy_key: string;
  text: string;
  from_label: string;
  where_hint: string | null;
  prio: TodoPrio;
  done_label: string | null;
  sort: number;
}

export async function replaceTodos(items: TodoSyncInput[]): Promise<boolean> {
  try {
    // delete everything (a bare filter PostgREST accepts: id not null)
    const del = await fetch(`${base()}/rest/v1/team_todos?id=not.is.null`, {
      method: 'DELETE',
      headers: h({ Prefer: 'return=minimal' }),
    });
    if (!del.ok) return false;
    if (items.length === 0) return true;
    const res = await fetch(`${base()}/rest/v1/team_todos`, {
      method: 'POST',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify(items.map((i) => ({ ...i, done: false }))),
    });
    return res.ok;
  } catch { return false; }
}
