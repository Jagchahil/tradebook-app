// app/app/invoices/words.ts. WHAT AN INVOICE IS, IN WORDS A MAN UP A LADDER CAN TAKE IN.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS IS A SURFACE MODULE, NOT AN ENGINE. Nothing here decides money or tax. It turns rows
// the database already holds into the order they are read in, the plain words that describe
// their age, and the three chaser drafts a man can send HIMSELF. Pure, no I/O, no clock beyond
// a date every caller passes in, so test/invoicesweb.test.mjs attacks every rule directly.
//
// ⚠️ AGES ARE WORDS, NEVER A DATE DUMP. "three weeks late" is read in one glance with one hand
// on a rail. "issued 2026-07-02, due 2026-07-16" is a table cell he has to do arithmetic on,
// and he opened this page precisely so he would not have to.
//
// ⚠️ THE ROWS ARRIVE UNTYPED. The only per-user invoice read lib/supabase.ts offers today is the
// account export, which returns invoices as unknown[]. So every row passes a shape check here
// and a row that fails it is dropped rather than rendered wrong: a list missing a broken row is
// a smaller lie than a £NaN on a screen about money he is owed.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { gbp0 } from '../../../lib/money';

export interface InvoiceListRow {
  id: string;
  number: string;
  customer: string;
  total: number;
  status: string;         // 'draft' | 'sent' | 'paid' as the table writes them
  issued: string | null;  // YYYY-MM-DD
  due: string | null;     // YYYY-MM-DD
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}/;

function dayOrNull(x: unknown): string | null {
  return typeof x === 'string' && DAY.test(x) ? x.slice(0, 10) : null;
}

// One raw row from the export becomes a typed row, or nothing. Never a guess.
export function normaliseInvoiceRow(raw: unknown): InvoiceListRow | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : '';
  if (!UUID.test(id)) return null;
  const total = Number(r.total);
  if (!Number.isFinite(total)) return null;
  return {
    id,
    number: typeof r.number === 'string' ? r.number : '',
    customer: typeof r.customer_name === 'string' ? r.customer_name.trim() : '',
    total,
    status: typeof r.status === 'string' ? r.status : 'draft',
    issued: dayOrNull(r.issued_date),
    due: dayOrNull(r.due_date),
  };
}

// ---- age, judged from one reference date --------------------------------------------------
//
// ⚠️ 'draft' AND 'sent' ARE BOTH SIMPLY UNPAID HERE, AND THAT IS A JUDGEMENT, NOT AN OVERSIGHT.
// The web creation path saves an invoice as 'draft' and HE sends the link himself, so the
// status cannot tell us whether his customer has seen it. A list that said "draft, never sent"
// about an invoice he texted to a customer a fortnight ago would be calling him a liar on his
// own screen. So the words only ever claim what the rows actually know: paid, late, or waiting.

export type InvoiceState = 'late' | 'waiting' | 'paid';

// The date an unpaid invoice is judged against: the due date when one was set, otherwise
// fourteen days from issue, the same judgement lib/supabase.ts's listOverdueInvoices makes for
// the WhatsApp chaser, so the two surfaces cannot disagree about whether a man is owed money.
export function referenceDate(row: Pick<InvoiceListRow, 'issued' | 'due'>): string | null {
  if (row.due) return row.due;
  if (!row.issued) return null;
  const d = new Date(`${row.issued}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86400000);
}

// Whole days past the reference date. Zero for anything not yet late or not judgeable.
export function daysLate(row: Pick<InvoiceListRow, 'issued' | 'due'>, todayISO: string): number {
  const ref = referenceDate(row);
  if (!ref) return 0;
  return Math.max(0, daysBetween(ref, todayISO));
}

export function daysSinceIssued(row: Pick<InvoiceListRow, 'issued'>, todayISO: string): number {
  if (!row.issued) return 0;
  return Math.max(0, daysBetween(row.issued, todayISO));
}

export function invoiceState(row: InvoiceListRow, todayISO: string): InvoiceState {
  if (row.status === 'paid') return 'paid';
  return daysLate(row, todayISO) > 0 ? 'late' : 'waiting';
}

// ---- the words ----------------------------------------------------------------------------

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function count(n: number): string {
  return n >= 0 && n < SMALL.length ? SMALL[n] : String(n);
}

// "a day late", "five days late", "three weeks late", "two months late", "over a year late".
// Weeks and months are rounded because "23 days late" is precision nobody asked for and
// "three weeks late" is the sentence he would say down the phone.
export function lateWords(days: number): string {
  if (days <= 0) return 'not late';
  if (days === 1) return 'a day late';
  if (days < 7) return `${count(days)} days late`;
  const weeks = Math.round(days / 7);
  if (days < 31) return weeks === 1 ? 'a week late' : `${count(weeks)} weeks late`;
  const months = Math.round(days / 30.44);
  if (months < 12) return months <= 1 ? 'a month late' : `${count(months)} months late`;
  return 'over a year late';
}

// "due today", "due tomorrow", "due in five days", "due in two weeks".
export function dueWords(daysUntilDue: number): string {
  if (daysUntilDue <= 0) return 'due today';
  if (daysUntilDue === 1) return 'due tomorrow';
  if (daysUntilDue < 7) return `due in ${count(daysUntilDue)} days`;
  const weeks = Math.round(daysUntilDue / 7);
  return weeks === 1 ? 'due in a week' : `due in ${count(weeks)} weeks`;
}

// The one line a list row carries about where an invoice stands.
export function statusWords(row: InvoiceListRow, todayISO: string): string {
  const state = invoiceState(row, todayISO);
  if (state === 'paid') return 'Paid';
  if (state === 'late') return lateWords(daysLate(row, todayISO));
  const ref = referenceDate(row);
  return ref ? dueWords(daysBetween(todayISO, ref)) : 'waiting';
}

// ---- the order ----------------------------------------------------------------------------
//
// Status first: money he is owed and late comes before money he is owed on time, and paid comes
// last because paid is history. Within late, the longest overdue first, because that is the one
// to chase. Within waiting, the soonest due first. Within paid, the most recent first.
export function sortInvoices(rows: InvoiceListRow[], todayISO: string): InvoiceListRow[] {
  const rank: Record<InvoiceState, number> = { late: 0, waiting: 1, paid: 2 };
  return [...rows].sort((a, b) => {
    const sa = invoiceState(a, todayISO);
    const sb = invoiceState(b, todayISO);
    if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
    if (sa === 'late') return daysLate(b, todayISO) - daysLate(a, todayISO);
    if (sa === 'waiting') {
      return (referenceDate(a) ?? '9999-12-31').localeCompare(referenceDate(b) ?? '9999-12-31');
    }
    return (b.issued ?? '').localeCompare(a.issued ?? '');
  });
}

// The one sentence above the list, and doc 103's empty test decides when it exists: nothing is
// owed, nothing is said. When something is owed it is THE answer he opened the page for.
export function owedLine(rows: InvoiceListRow[], todayISO: string): string | null {
  let owed = 0;
  let late = 0;
  for (const r of rows) {
    const state = invoiceState(r, todayISO);
    if (state === 'paid') continue;
    owed += r.total;
    if (state === 'late') late += r.total;
  }
  if (owed <= 0) return null;
  if (late <= 0) return `${gbp0(owed)} is owed to you, and none of it is late.`;
  if (late >= owed) return `${gbp0(owed)} is owed to you, and all of it is late.`;
  return `${gbp0(owed)} is owed to you, and ${gbp0(late)} of it is late.`;
}

// ---- the chaser drafts --------------------------------------------------------------------
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ LEKHIO SENDS NONE OF THESE. A message to another human being always asks, and here asking
// IS the whole feature: the draft is rendered for HIM to copy or share himself, exactly as the
// WhatsApp chaser in lib/waintents.ts drafts and never sends.
//
// ⚠️ THE POLITE AND FIRM WORDING IS lib/waintents.ts chaseMessage's OWN, kept to the character,
// so the man sounds like one person whether he chases from WhatsApp or from here.
// test/invoicesweb.test.mjs runs both and fails if the voices drift. chaseMessage is not called
// directly because it chooses the firmness FROM THE AGE, and on this page the firmness is HIS
// choice: that is the feature, not a fork of it. The final notice is this module's own, because
// the WhatsApp chaser deliberately stops at firm.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export type ChaserTone = 'polite' | 'firm' | 'final';

export function isChaserTone(x: unknown): x is ChaserTone {
  return x === 'polite' || x === 'firm' || x === 'final';
}

export const CHASER_TONES: ReadonlyArray<{ tone: ChaserTone; label: string }> = [
  { tone: 'polite', label: 'Polite' },
  { tone: 'firm', label: 'Firm' },
  { tone: 'final', label: 'Final notice' },
];

export interface ChaserContext {
  customer: string;
  number: string;
  total: number;
  daysSinceIssued: number;
  daysLate: number;
  link: string;
}

export function chaserDraft(tone: ChaserTone, c: ChaserContext): string {
  const name = c.customer.trim() || 'there';
  const total = gbp0(c.total);
  // "a day" rather than "1 days". chaseMessage never meets a singular on its own inputs, so this
  // costs the parity test nothing and reads properly when his choice does meet one.
  const sentAgo = c.daysSinceIssued === 1 ? 'a day' : `${c.daysSinceIssued} days`;
  const outFor = c.daysLate === 1 ? 'a day' : `${c.daysLate} days`;
  if (tone === 'polite') {
    return `Hi ${name}, hope all is well. Just a friendly nudge on invoice ${c.number} for ${total}, sent ${sentAgo} ago. Here it is again in case it is handy: ${c.link}. Cheers.`;
  }
  if (tone === 'firm') {
    return `Hi ${name}, invoice ${c.number} for ${total} is now ${outFor} outstanding. I would appreciate payment this week so I can keep things straight on my side. Here it is again: ${c.link}. Thanks for sorting it.`;
  }
  return `Hi ${name}, this is a final reminder for invoice ${c.number} for ${total}, now ${lateWords(c.daysLate)}. I need it settled within seven days. The invoice is here: ${c.link}. If there is a problem with it, call me today and we will sort it out.`;
}
