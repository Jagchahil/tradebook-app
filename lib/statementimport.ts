// lib/statementimport.ts. A bank statement CSV, read deterministically into the books.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS: THE BANK FEED HAS LOST ITS PROVIDER TWICE.
//
// The first build of lib/bankfeed.ts targeted GoCardless Bank Account Data, and GoCardless
// closed that product to new signups (verified 2 July 2026, doc 77). The rebuild targeted
// TrueLayer, and TrueLayer declined our application. So today the feed has NO provider at all:
// every function in lib/bankfeed.ts is dormant, and every promise in the product that begins
// "connect your bank" rests on a vendor approving us before launch.
//
// A launch cannot depend on any vendor. This file is the channel that needs nobody's
// permission: every UK bank already lets a customer download his own statement as a CSV, no
// API, no application form, no ninety day consent, no one who can say no. He downloads the
// file, gives it to us, and every line lands in the same shape a bank feed line would, waiting
// for his yes. If a feed provider ever says yes, the feed simply becomes the easier of two
// doors to the same room, and this one stays open for the banks a provider does not cover.
//
// THREE RULES, AND THEY ARE THE WHOLE DESIGN:
//
//   1. NO AI ANYWHERE IN IT. A statement is structured data a bank produced. Reading it with a
//      model would spend money to introduce mistakes into figures we were handed exactly.
//      Categorisation is the same keyword map every bank feed line gets (lib/categories.ts,
//      injected by the caller), which costs nothing, which is why this channel can be free.
//
//   2. DIRECTION IS NEVER GUESSED. Whether money went in or out is the single fact a wrong
//      reading of which understates a man's income or invents a cost he never had. Where the
//      bank writes an explicit money in and money out column pair, that pair is the answer.
//      Only where the format offers nothing but a signed amount is the sign used, and each
//      bank's entry below says in a comment which of the two it is and why.
//
//   3. ONE ENGINE. This file does not normalise a transaction; it turns a CSV line into the
//      exact input shape lib/bankfeed.ts's mapBankTransaction already takes, and the caller
//      injects that real mapper. Rounding, GBP only, the date check, the vendor fallback and
//      the category rule for money in all happen in the one place they already happen for the
//      feed, so the two channels cannot drift.
//
// AND NO SIBLING IMPORTS. test/statementimport.test.mjs loads this file directly through
// Node's type stripping, and Node's ESM resolver will not resolve an extensionless relative
// import, so there are none here. The mapper and the categoriser are injected by the caller,
// exactly the lib/bankfeed.ts and lib/reviewpile.ts pattern, which means the REAL engine is
// what the tests exercise. 'node:crypto' is the only import and Node resolves it everywhere.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';

// The line shape handed to the injected mapper. Structurally identical to the fields
// mapBankTransaction in lib/bankfeed.ts reads off a TrueLayer transaction, so the route can
// pass that function straight in. Declared here rather than imported because of the sibling
// import rule above; a structural type cannot drift into a second behaviour, only a second name.
export interface StatementLine {
  provider_transaction_id?: string;
  timestamp?: string;
  description?: string;
  amount?: number;
  currency?: string;
  transaction_type?: string; // DEBIT or CREDIT, decided from the bank's own columns, never guessed
  merchant_name?: string;
}

// What the mapper gives back. The exact row shape lib/banksync.ts collects for the bulk
// insert, minus the flags the caller's own enrichment adds afterwards.
export interface StatementEntry {
  external_id: string;
  vendor: string;
  amount: number; // negative = money out, positive = money in. The engine convention.
  category: string;
  transaction_date: string;
  description: string;
}

export type LineMapper = (line: StatementLine) => StatementEntry | null;

// ---------------------------------------------------------------------------------------------
// The banks. Detection is by header shape: a format claims a file only when every one of its
// named columns is present in the header row. The list is ordered most specific first, because
// a generic three column shape would otherwise claim a richer export that happens to contain
// the same three names. An export that matches nobody is refused out loud, never guessed at.
//
// Direction per bank, the honest record:
//
//   Monzo        Money Out and Money In columns. Explicit.
//   Revolut      Signed Amount only. The Type column names the product (CARD_PAYMENT, TOPUP),
//                not the direction, so the sign is all the format offers.
//   Tide         Paid In and Paid Out columns. Explicit.
//   Nationwide   Paid Out and Paid In columns. Explicit.
//   Lloyds       Debit Amount and Credit Amount columns. Explicit. Halifax and Bank of
//                Scotland, the same group, ship this same shape and are read by this entry.
//   Starling     Signed Amount (GBP) only. The format offers nothing else.
//   Barclays     Signed Amount only. The format offers nothing else.
//   Mettle       Signed Amount only. The format offers nothing else.
//   NatWest      Signed Value only. The format offers nothing else.
//   Santander    Signed Amount only. The format offers nothing else.
//   HSBC         Signed Amount only, three bare columns. The format offers nothing else, and
//                because the shape is so generic it is checked last.
// ---------------------------------------------------------------------------------------------

interface BankFormat {
  code: string; // short id, safe to put in a query string
  name: string; // what a person is told
  header: string[]; // lowercased column names that identify this export
  date: string;
  dateStyle: 'dmy' | 'dayMonthYear' | 'iso';
  vendor?: string; // the column that names who was paid, where the bank has one
  description: string[]; // joined, first non empty first
  direction:
    | { kind: 'columns'; moneyOut: string; moneyIn: string }
    | { kind: 'sign'; amount: string };
  id?: string; // the bank's own transaction id column, where the export carries one
  currency?: string; // a currency column to hold to GBP, where the export mixes currencies
  state?: { column: string; must: string }; // rows to keep, e.g. Revolut's COMPLETED
}

export const BANKS: readonly BankFormat[] = [
  {
    code: 'monzo',
    name: 'Monzo',
    header: ['transaction id', 'date', 'name', 'amount', 'money out', 'money in'],
    date: 'date',
    dateStyle: 'dmy',
    vendor: 'name',
    description: ['description'],
    // Explicit Money Out and Money In columns, so the sign of Amount is never consulted.
    direction: { kind: 'columns', moneyOut: 'money out', moneyIn: 'money in' },
    // Monzo is the one export that carries the bank's own stable transaction id, which is the
    // same idempotency fact the feed gets from a provider, so it is used rather than a hash.
    id: 'transaction id',
    currency: 'currency',
  },
  {
    code: 'revolut',
    name: 'Revolut',
    header: ['type', 'product', 'started date', 'completed date', 'description', 'amount', 'currency', 'state'],
    date: 'completed date',
    dateStyle: 'iso',
    description: ['description'],
    // Sign of Amount. Revolut's Type column names the product, not the direction, so the
    // signed amount is genuinely all the format offers.
    direction: { kind: 'sign', amount: 'amount' },
    currency: 'currency',
    // Pending rows have no settled figures yet and would double with the completed row later.
    state: { column: 'state', must: 'COMPLETED' },
  },
  {
    code: 'tide',
    name: 'Tide',
    header: ['date', 'transaction id', 'paid in', 'paid out'],
    date: 'date',
    dateStyle: 'dmy',
    description: ['description', 'reference'],
    // Explicit Paid In and Paid Out columns.
    direction: { kind: 'columns', moneyOut: 'paid out', moneyIn: 'paid in' },
    id: 'transaction id',
  },
  {
    code: 'nationwide',
    name: 'Nationwide',
    header: ['date', 'transaction type', 'description', 'paid out', 'paid in'],
    date: 'date',
    // Nationwide writes dates as words, for example 05 Apr 2026.
    dateStyle: 'dayMonthYear',
    description: ['description', 'transaction type'],
    // Explicit Paid Out and Paid In columns.
    direction: { kind: 'columns', moneyOut: 'paid out', moneyIn: 'paid in' },
  },
  {
    code: 'lloyds',
    name: 'Lloyds',
    header: ['transaction date', 'transaction description', 'debit amount', 'credit amount'],
    date: 'transaction date',
    dateStyle: 'dmy',
    description: ['transaction description'],
    // Explicit Debit Amount and Credit Amount columns.
    direction: { kind: 'columns', moneyOut: 'debit amount', moneyIn: 'credit amount' },
  },
  {
    code: 'starling',
    name: 'Starling',
    header: ['date', 'counter party', 'reference', 'amount (gbp)'],
    date: 'date',
    dateStyle: 'dmy',
    vendor: 'counter party',
    description: ['reference'],
    // Signed Amount (GBP). The format has no direction column, documented above.
    direction: { kind: 'sign', amount: 'amount (gbp)' },
  },
  {
    code: 'barclays',
    name: 'Barclays',
    header: ['number', 'date', 'account', 'amount', 'subcategory', 'memo'],
    date: 'date',
    dateStyle: 'dmy',
    description: ['memo', 'subcategory'],
    // Signed Amount. The format has no direction column, documented above.
    direction: { kind: 'sign', amount: 'amount' },
  },
  {
    code: 'mettle',
    name: 'Mettle',
    header: ['date', 'time', 'type', 'description', 'amount', 'balance'],
    date: 'date',
    dateStyle: 'dmy',
    description: ['description', 'type'],
    // Signed Amount. The format has no direction column, documented above.
    direction: { kind: 'sign', amount: 'amount' },
  },
  {
    code: 'natwest',
    name: 'NatWest',
    header: ['date', 'type', 'description', 'value', 'balance'],
    date: 'date',
    dateStyle: 'dmy',
    description: ['description', 'type'],
    // Signed Value. The format has no direction column, documented above.
    direction: { kind: 'sign', amount: 'value' },
  },
  {
    code: 'santander',
    name: 'Santander',
    header: ['date', 'description', 'amount', 'balance'],
    date: 'date',
    dateStyle: 'dmy',
    description: ['description'],
    // Signed Amount. The format has no direction column, documented above.
    direction: { kind: 'sign', amount: 'amount' },
  },
  {
    // Last on purpose: three bare columns would claim half the richer exports above if it
    // were checked any earlier.
    code: 'hsbc',
    name: 'HSBC',
    header: ['date', 'description', 'amount'],
    date: 'date',
    dateStyle: 'dmy',
    description: ['description'],
    // Signed Amount. The format has no direction column, documented above.
    direction: { kind: 'sign', amount: 'amount' },
  },
];

export function bankNameFor(code: string): string | null {
  return BANKS.find((b) => b.code === code)?.name ?? null;
}

// The one sentence a person is shown when a file matches nobody. It lives here, next to the
// list it describes, so the words and the list cannot drift apart. It names what we expected,
// because "invalid file" teaches a man nothing he can act on.
export const UNRECOGNISED_LINE =
  'That does not look like a bank statement I can read. I understand the CSV a bank lets you ' +
  'download from Monzo, Starling, Barclays, Lloyds, NatWest, HSBC, Santander, Nationwide, ' +
  'Revolut, Tide or Mettle. Download the statement as CSV, not PDF, and try again.';

// ---------------------------------------------------------------------------------------------
// CSV. Hand rolled, no dependency, because the grammar is small and a parsing library is a
// supply chain risk this file exists to avoid depending on anyone for. Quoted fields may hold
// commas, doubled quotes and real newlines; both LF and CRLF line ends are taken; a UTF-8 BOM
// is stripped. Exported so the tests can attack it on its own.
// ---------------------------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // The final line of most exports has no trailing newline. It is still a line.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Pounds as a bank writes them: an optional currency mark, thousands commas, stray spaces,
// and occasionally brackets for a negative. Null when the cell holds no number at all, which
// callers treat as "this column is empty", never as zero.
export function parseMoney(cell: string): number | null {
  let t = (cell ?? '').trim();
  if (!t) return null;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  t = t.replace(/[£\s,]/g, '');
  if (!t || !/^[+-]?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  return negative ? -Math.abs(rounded) : rounded;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// A date as UK banks write them, normalised to YYYY-MM-DD or refused. ISO is accepted for
// every bank, because an export tool that already writes the unambiguous form should never be
// punished for it. 'dmy' is day first, always: these are UK statement exports and every listed
// bank writes the day before the month.
export function readStatementDate(cell: string, style: BankFormat['dateStyle']): string | null {
  const t = (cell ?? '').trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (style === 'iso') return null;
  if (style === 'dayMonthYear') {
    const m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
    if (!m) return null;
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!month) return null;
    return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
  }
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// The stable id. The same external_id discipline lib/banksync.ts lives by: an id that never
// changes for the same real world transaction, so re importing an overlapping window is
// harmless, enforced by the database's unique index rather than by hoping.
//
// A CSV usually carries no provider id, so one is derived, and every part of the recipe is
// there for a reason:
//
//   owner    ⚠️ THE UNIQUE INDEX ON external_id IS GLOBAL, NOT PER USER (schema.sql, the full
//            index PostgREST's on_conflict needs). Two people on a joint account uploading the
//            same statement would otherwise derive the same id, and the second person's rows
//            would be silently swallowed into the first person's books. The owner in the hash
//            makes every id private to its account.
//   bank     the format that read it, so two banks writing the same line never collide.
//   the line date, signed amount and description, which is what makes it stable across
//            re uploads and across overlapping statement ranges.
//   n        the occurrence number of that exact line within the file. Two identical £3.20
//            coffees on the same day are TWO transactions, and collapsing them would delete a
//            real cost from a man's books. The first is n 0, the second n 1, and a re upload
//            walks the file in the same order and derives the same pair.
//
// Where the export carries the bank's own transaction id (Monzo, Tide), that id is hashed with
// the owner instead: it is already stable and unique, which is the whole point of it.
// ---------------------------------------------------------------------------------------------
function stableLineId(
  owner: string,
  bank: string,
  bankOwnId: string | null,
  date: string,
  signedAmount: number,
  description: string,
  occurrence: number,
): string {
  const material = bankOwnId
    ? `v1|${owner}|${bank}|id|${bankOwnId}`
    : `v1|${owner}|${bank}|line|${date}|${signedAmount.toFixed(2)}|${description}|${occurrence}`;
  return `stmt:${createHash('sha256').update(material).digest('hex')}`;
}

// A whole year of a busy account is a few thousand lines. Ten thousand is not a statement, it
// is a mistake or an attack, and either way the honest answer is a refusal he can act on, not
// a request that times out half written.
export const MAX_STATEMENT_LINES = 10_000;

export type ParseOutcome =
  | {
      ok: true;
      bank: string; // the display name
      bankCode: string;
      rows: number; // non empty lines after the header, i.e. what was attempted
      entries: StatementEntry[];
      skipped: number; // lines that were not money: bad date, no amount, foreign currency, pending
      duplicatesInFile: number; // lines dropped because the file repeated its own transaction id
    }
  | {
      ok: false;
      reason: 'empty' | 'unrecognised' | 'no_rows' | 'too_many';
      message: string;
    };

// Read one uploaded statement. Pure: no network, no database, no AI, and the caller injects
// the real mapper (mapBankTransaction with categoriseBankLine curried in), so everything this
// returns has been through the exact normalisation a bank feed line gets.
export function parseStatement(text: string, owner: string, map: LineMapper): ParseOutcome {
  if (!(text ?? '').trim()) {
    return { ok: false, reason: 'empty', message: 'That file was empty, so there was nothing to read.' };
  }
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (all.length === 0) {
    return { ok: false, reason: 'empty', message: 'That file was empty, so there was nothing to read.' };
  }

  // Find the header. Some banks put account details on the first few lines before the real
  // header row, so the first ten rows are each given the chance to be it.
  let format: BankFormat | null = null;
  let headerAt = -1;
  let cols = new Map<string, number>();
  for (let r = 0; r < Math.min(all.length, 10) && !format; r++) {
    const names = all[r].map((c) => c.trim().toLowerCase());
    for (const candidate of BANKS) {
      if (candidate.header.every((h) => names.includes(h))) {
        format = candidate;
        headerAt = r;
        cols = new Map(names.map((n, i) => [n, i] as const));
        break;
      }
    }
  }
  if (!format) {
    return { ok: false, reason: 'unrecognised', message: UNRECOGNISED_LINE };
  }

  const data = all.slice(headerAt + 1);
  if (data.length > MAX_STATEMENT_LINES) {
    return {
      ok: false,
      reason: 'too_many',
      message:
        'That file has more than ten thousand rows. Export a shorter date range and give me each ' +
        'part on its own. Nothing doubles up between uploads, so the order does not matter.',
    };
  }

  const entries: StatementEntry[] = [];
  const seenIds = new Set<string>();
  const occurrences = new Map<string, number>();
  let skipped = 0;
  let duplicatesInFile = 0;

  for (const row of data) {
    const cell = (name: string): string => {
      const i = cols.get(name);
      return i === undefined || i >= row.length ? '' : row[i].trim();
    };

    // Rows the bank itself says are not settled money yet.
    if (format.state && cell(format.state.column).toUpperCase() !== format.state.must) {
      skipped++;
      continue;
    }

    const date = readStatementDate(cell(format.date), format.dateStyle);
    if (!date) {
      skipped++;
      continue;
    }

    // DIRECTION. The explicit column pair where the bank provides one; the sign of the amount
    // only where the format documented above offers nothing else. Never a guess.
    let type: 'DEBIT' | 'CREDIT';
    let magnitude: number;
    if (format.direction.kind === 'columns') {
      const outRaw = parseMoney(cell(format.direction.moneyOut));
      const inRaw = parseMoney(cell(format.direction.moneyIn));
      const out = outRaw !== null && outRaw !== 0 ? Math.abs(outRaw) : null;
      const inn = inRaw !== null && inRaw !== 0 ? Math.abs(inRaw) : null;
      // Exactly one side must hold the money. Both empty is not a transaction; both filled is
      // a line this format has never promised, and guessing which side to believe is the one
      // thing this module refuses to do.
      if (out !== null && inn === null) {
        type = 'DEBIT';
        magnitude = out;
      } else if (inn !== null && out === null) {
        type = 'CREDIT';
        magnitude = inn;
      } else {
        skipped++;
        continue;
      }
    } else {
      const signed = parseMoney(cell(format.direction.amount));
      if (signed === null || signed === 0) {
        skipped++;
        continue;
      }
      type = signed < 0 ? 'DEBIT' : 'CREDIT';
      magnitude = Math.abs(signed);
    }

    const description = format.description.map(cell).filter(Boolean).join(' ').trim();
    const vendor = format.vendor ? cell(format.vendor) : '';
    const signedAmount = type === 'DEBIT' ? -magnitude : magnitude;
    const bankOwnId = format.id ? cell(format.id) || null : null;

    let occurrence = 0;
    if (!bankOwnId) {
      const key = `${date}|${signedAmount.toFixed(2)}|${description}`;
      occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
    }

    const line: StatementLine = {
      provider_transaction_id: stableLineId(owner, format.code, bankOwnId, date, signedAmount, description, occurrence),
      timestamp: date,
      description,
      // The mapper owns the sign convention: it takes a magnitude and the type, exactly as it
      // does for the feed, so the direction decided above is the only direction there is.
      amount: signedAmount,
      currency: format.currency ? cell(format.currency) || 'GBP' : 'GBP',
      transaction_type: type,
      merchant_name: vendor || undefined,
    };

    const entry = map(line);
    if (!entry) {
      // The one engine said no: foreign currency, zero, or a shape it refuses. Its rules are
      // the feed's rules, so its refusals are too.
      skipped++;
      continue;
    }
    // WITHIN FILE DEDUPE. With derived ids the occurrence counter makes a repeat impossible,
    // so this only ever fires when an export repeats the bank's own transaction id, and a
    // repeated id is the bank saying "same transaction". One row per id, ever.
    if (seenIds.has(entry.external_id)) {
      duplicatesInFile++;
      continue;
    }
    seenIds.add(entry.external_id);
    entries.push(entry);
  }

  if (entries.length === 0) {
    return {
      ok: false,
      reason: 'no_rows',
      message:
        `I recognised a ${format.name} export but could not read a single line of it as money. ` +
        'Nothing was saved. Check the file has transaction rows in it and try again.',
    };
  }

  return {
    ok: true,
    bank: format.name,
    bankCode: format.code,
    rows: data.length,
    entries,
    skipped,
    duplicatesInFile,
  };
}
