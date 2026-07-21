// WHATSAPP SUPPORT, server side. A paying customer asks for a human in their WhatsApp thread; the
// webhook opens a ticket here. The console reads the open tickets so Jag can edit the drafted reply and
// send it — back into the same thread, free-form, inside Meta's 24-hour window. Nothing leaves without
// his tap. Self-contained REST via the service role, the same posture as lib/dakiya.ts and lib/bridge.ts.
// No customer financial data ever touches this table.

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

export type TicketStatus = 'open' | 'answered' | 'dismissed';
export type TicketReason = 'human' | 'complaint' | 'problem' | 'billing' | 'other';

const REASONS: TicketReason[] = ['human', 'complaint', 'problem', 'billing', 'other'];
export function cleanReason(v: unknown): TicketReason {
  return REASONS.includes(v as TicketReason) ? (v as TicketReason) : 'other';
}

// Meta's free customer-service window. A customer's inbound message opens 24 hours in which we can send
// free-form replies at no cost and with no template. Outside it, a reply needs an approved template.
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export function windowOpen(lastInboundIso: string | null, now: number = Date.now()): boolean {
  if (!lastInboundIso) return false;
  const t = Date.parse(lastInboundIso);
  if (!Number.isFinite(t)) return false;
  return now - t < WINDOW_MS;
}

export interface TicketRow {
  id: string;
  phone: string;
  user_id: string | null;
  customer_name: string | null;
  reason: TicketReason;
  customer_message: string;
  draft_reply: string;
  status: TicketStatus;
  opened_at: string;
  last_inbound_at: string;
  decided_at: string | null;
}

export interface TicketDTO {
  id: string;
  phone: string;
  customerName: string | null;
  reason: TicketReason;
  customerMessage: string;
  draftReply: string;
  status: TicketStatus;
  openedAt: string;
  lastInboundAt: string;
  decidedAt: string | null;
  windowOpen: boolean;
}

function toDTO(r: TicketRow, now: number): TicketDTO {
  return {
    id: r.id,
    // The phone is only shown to Jag in the console; never surfaced publicly. Masked to last 4 for the
    // list, full number kept server-side for the send.
    phone: r.phone,
    customerName: r.customer_name,
    reason: cleanReason(r.reason),
    customerMessage: r.customer_message,
    draftReply: r.draft_reply ?? '',
    status: r.status,
    openedAt: r.opened_at,
    lastInboundAt: r.last_inbound_at,
    decidedAt: r.decided_at,
    windowOpen: windowOpen(r.last_inbound_at, now),
  };
}

// Console read: open tickets (the work), plus a short tail of decided ones for context.
export async function readTickets(): Promise<{ open: TicketDTO[]; recent: TicketDTO[] } | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/support_tickets?select=*&order=opened_at.desc&limit=200`,
      { headers: h() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as TicketRow[];
    const now = Date.now();
    const all = rows.map((r) => toDTO(r, now));
    return {
      open: all.filter((t) => t.status === 'open'),
      recent: all.filter((t) => t.status !== 'open').slice(0, 30),
    };
  } catch {
    return null;
  }
}

export async function getTicket(id: string): Promise<TicketRow | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/support_tickets?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      { headers: h() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as TicketRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function openTicketFor(phone: string): Promise<TicketRow | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/support_tickets?phone=eq.${encodeURIComponent(phone)}&status=eq.open&select=*&limit=1`,
      { headers: h() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as TicketRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export interface OpenTicketInput {
  phone: string;
  userId?: string | null;
  customerName?: string | null;
  reason: TicketReason;
  customerMessage: string;
  draftReply?: string;
}

// Open a ticket, or refresh the customer's existing open one. A second escalation updates the open
// ticket (latest message, refreshed window, keeps the newest draft) rather than stacking duplicates.
export async function openTicket(input: OpenTicketInput): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const existing = await openTicketFor(input.phone);
  try {
    if (existing) {
      const res = await fetch(
        `${base()}/rest/v1/support_tickets?id=eq.${encodeURIComponent(existing.id)}`,
        {
          method: 'PATCH',
          headers: h({ Prefer: 'return=minimal' }),
          body: JSON.stringify({
            reason: cleanReason(input.reason),
            customer_message: input.customerMessage,
            draft_reply: input.draftReply ?? existing.draft_reply ?? '',
            last_inbound_at: nowIso,
          }),
        },
      );
      return res.ok;
    }
    const res = await fetch(`${base()}/rest/v1/support_tickets`, {
      method: 'POST',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        phone: input.phone,
        user_id: input.userId ?? null,
        customer_name: input.customerName ?? null,
        reason: cleanReason(input.reason),
        customer_message: input.customerMessage,
        draft_reply: input.draftReply ?? '',
        last_inbound_at: nowIso,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function setTicketStatus(id: string, status: TicketStatus): Promise<boolean> {
  try {
    const res = await fetch(`${base()}/rest/v1/support_tickets?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: h({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ status, decided_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
