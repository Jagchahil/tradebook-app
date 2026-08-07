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
// ⚠️ EVERY ROW STILL PASSES THE SHAPE CHECK. The list now arrives through readInvoices in
// lib/supabase.ts (scoped, typed loosely at the wire), but a database column is still only a
// claim until it is checked, so every row passes normaliseInvoiceRow and a row that fails it is
// dropped rather than rendered wrong: a list missing a broken row is a smaller lie than a £NaN
// on a screen about money he is owed.
//
// ⚠️ AND `total` IS THE ONLY MONEY FIGURE THIS MODULE EVER SEES (1 August 2026). That is on
// purpose now that invoices carry VAT. Under the CIS domestic reverse charge an invoice also
// carries the VAT the CUSTOMER must account for, and that figure is NOT part of the total, is NOT
// owed to him, and must never find its way into "£X is owed to you" or into a chaser. A row here
// has no field for it, so it cannot. VATREVCON37100, and lib/vat.ts holds the reasoning.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { gbp0, gbp2 } from '../../../lib/money';

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
//
// ⚠️ THIS STAYS IN WHOLE POUNDS, AND THAT SURVIVED THE VAT REVIEW. It adds several invoices into
// one sentence a man reads on his way past. Nobody pays against it, nothing is reconciled to it,
// and "£12,204.00 is owed to you" is a figure pretending to a precision the sentence does not
// need. The figure a customer is ASKED for is a different job and is written differently: see
// owedFigure below. The totals it adds are what he is owed and nothing else, so an invoice under
// the reverse charge contributes its total and never the VAT its customer accounts for.
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
  // What the invoice says he is owed. Under the reverse charge that is the total BEFORE the VAT
  // his customer accounts for, which is exactly the figure the document asks to be paid.
  total: number;
  daysSinceIssued: number;
  daysLate: number;
  link: string;
}

// ⚠️ THE FIGURE IN A DEMAND FOR PAYMENT, AND WHY IT IS NOT SIMPLY gbp0 (1 August 2026).
//
// Every chaser here names one invoice and asks a named man to pay it. Before VAT the totals were
// whatever the tradesman typed, which is whole pounds nearly every time, so rounding was invisible
// and gbp0 was right. VAT makes pence ordinary: £127 of work at the standard rate is £152.40, and
// a message saying "invoice INV-0004 for £152" against a document that reads £152.40 invites a
// payment 40p short, which leaves the invoice unpaid, the list calling it late, and a man chasing
// his own customer over our rounding.
//
// So: whole pounds when the figure is whole pounds, which is what gbpShort in lib/waintents.ts
// gives and what every chaser this product has ever sent said. Pence only when there are pence.
// The two voices stay identical on every figure the WhatsApp chaser has ever met, which is what
// the parity test in test/invoicesweb.test.mjs pins, and they part company only where the
// alternative is a wrong number on a demand for money.
function owedFigure(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(v * 100) % 100 === 0 ? gbp0(v) : gbp2(v);
}

export function chaserDraft(tone: ChaserTone, c: ChaserContext): string {
  const name = c.customer.trim() || 'there';
  const total = owedFigure(c.total);
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

// ── The three views, and the near horizon ────────────────────────────────────────────────────
//
// ⚠️ FILTERS OVER ONE ORDER, NOT FOUR SEPARATE LISTS, AND THAT IS THE WHOLE DESIGN CHOICE.
//
// The obvious build is four tabs each with their own sort. It is also how the one useful thing
// this screen does gets lost. sortInvoices puts the longest overdue at the top because that is
// the invoice to chase this morning, and a Paid tab sorted by date does not tell him anything he
// needs before nine o'clock. So every view is the SAME order with rows removed, which means a
// man who taps Overdue sees exactly the rows he already saw at the top of All, in the same
// sequence, and learns the screen once rather than four times.
//
// ⚠️ 'unpaid' INCLUDES THE LATE ONES ON PURPOSE. Overdue is a subset of unpaid, not a sibling of
// it. "What am I owed" is one question and "what is late" is a harder question inside it, and a
// man who taps Unpaid expecting his total and gets only the ones that are not yet late has been
// handed a smaller number than the truth, on a screen about money he is owed.
export type InvoiceFilter = 'all' | 'overdue' | 'unpaid' | 'paid';

export function isInvoiceFilter(x: unknown): x is InvoiceFilter {
  return x === 'all' || x === 'overdue' || x === 'unpaid' || x === 'paid';
}

export const INVOICE_FILTERS: ReadonlyArray<{ filter: InvoiceFilter; label: string }> = [
  { filter: 'all', label: 'All' },
  { filter: 'overdue', label: 'Overdue' },
  { filter: 'unpaid', label: 'Unpaid' },
  { filter: 'paid', label: 'Paid' },
];

// Rows for one view, in the one order. Never re-sorted.
export function filterInvoices(
  rows: InvoiceListRow[],
  todayISO: string,
  filter: InvoiceFilter,
): InvoiceListRow[] {
  const ordered = sortInvoices(rows, todayISO);
  if (filter === 'all') return ordered;
  return ordered.filter((r) => {
    const state = invoiceState(r, todayISO);
    if (filter === 'paid') return state === 'paid';
    if (filter === 'overdue') return state === 'late';
    return state !== 'paid'; // unpaid: waiting AND late
  });
}

// What each chip says beside its label. A count is a fact, so an empty one shows a zero rather
// than hiding: "Overdue 0" is the sentence he wants to see and a missing chip is not.
export function filterCounts(rows: InvoiceListRow[], todayISO: string): Record<InvoiceFilter, number> {
  const out: Record<InvoiceFilter, number> = { all: rows.length, overdue: 0, unpaid: 0, paid: 0 };
  for (const r of rows) {
    const state = invoiceState(r, todayISO);
    if (state === 'paid') out.paid += 1;
    else {
      out.unpaid += 1;
      if (state === 'late') out.overdue += 1;
    }
  }
  return out;
}

// ⚠️ THE NEAR HORIZON, AND IT DELIBERATELY EXCLUDES ANYTHING ALREADY LATE.
//
// owedLine answers "what am I owed and how much of it has gone bad". This answers a different
// question: what is about to land. An invoice that is already late is not about to land, it has
// already failed to, and counting it here would inflate a figure a man might plan a week around.
//
// ⚠️ AND IT IS NOT A PROMISE. Money due is not money arriving, and nothing in this sentence
// reaches a tax figure, an income figure or the set aside. An invoice becomes income when it is
// PAID. Whole pounds for the same reason owedLine uses them: nobody pays against this sentence.
export function dueSoonLine(
  rows: InvoiceListRow[],
  todayISO: string,
  withinDays = 7,
): string | null {
  let soon = 0;
  for (const r of rows) {
    if (invoiceState(r, todayISO) !== 'waiting') continue;
    const ref = referenceDate(r);
    if (!ref) continue;
    const days = daysBetween(todayISO, ref);
    if (days >= 0 && days <= withinDays) soon += r.total;
  }
  if (soon <= 0) return null;
  return `${gbp0(soon)} of it falls due in the next seven days.`;
}

// The honest empty state for a view that has rows behind it but none in this one. The list's own
// "You have not made an invoice yet" would be a lie under every filter but All.
export function emptyViewWords(filter: InvoiceFilter): string {
  if (filter === 'overdue') return 'Nothing is overdue. That is the way to keep it.';
  if (filter === 'unpaid') return 'Nothing is waiting to be paid. Everything you have sent is settled.';
  if (filter === 'paid') return 'Nothing is marked paid yet.';
  return 'You have not made an invoice yet.';
}
