// ONE STATEMENT PIPELINE, TWO DOORS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A bank CSV reaches Lekhio two ways now: the statement page's own form, and the one door for
// uploads that takes photographs and statements together. Until 12 August 2026 the whole walk
// (parse, enrich, split known from fresh, insert, count) lived inline in
// app/api/money/import/route.ts, and that was fine while it had one caller. The moment a second
// door wanted it, the choice was a copy or a move, and a copy of the statement walk is the
// receipt pipeline's two-formatters story with a bank account. So the walk lives HERE, once,
// exactly as lib/receiptingest.ts holds the receipt walk, and every route is a caller. Each
// route keeps its own auth, gate, rate limits and words; what happens to the CSV is this
// file's business.
//
// Nothing below is new logic. It is the import route's walk, moved whole, with its reasoning
// kept. The comments that argue with history say "this route" where they used to mean the
// import route; they now mean whichever door called us, and the argument is unchanged.
//
// 🔴 NOTHING IN THIS FILE EVER CONFIRMS A ROW. The sync auto files a vendor the user has
// taught us; this walk deliberately does not, and the difference is the size of the act. A
// feed drips in a handful of lines a day. A statement lands months in one press, and "the
// rules you taught me quietly filed ninety days of history while you watched a spinner" is not
// an approval gate, it is a rubber stamp with his name on it. Everything lands waiting. His
// taught categories still arrive as suggestions, so the pile files them in one honest tap.
//
// ⚠️ NO AI, NO BUDGET RINGS, AND THAT IS THE POINT OF THE CHANNEL. A receipt photograph costs
// a model call; a CSV the bank produced is exact figures we were handed for nothing. The
// import is deterministic, so it has no spend to meter and it works when the AI wallet is
// empty. See lib/margin.ts for why the free channels are the ones we want people on.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { parseStatement } from './statementimport';
import { mapBankTransaction } from './bankfeed';
import { categoriseBankLine } from './categories';
import {
  BankEntryInsert, insertBankTransactions, knownExternalIds, readOwnNames,
  getUserRules, getVendorPatterns,
} from './supabase';
import { normaliseVendor, recall } from './memory';
import { looksPersonal } from './personal';

// Every answer carries what the caller needs to say the honest sentence for its own surface,
// and nothing else. The routes own their words; this file owns what happened.
export type StatementIngestResult =
  // The parser refused the file. reason is the parser's own code (unrecognised, empty,
  // no_rows, too_many) and message its own sentence, for the doors that answer JSON.
  | { outcome: 'rejected'; reason: string; message?: string }
  // Rows we knew were new did not land. Nothing to report as done, and the caller must say
  // so, never shrug.
  | { outcome: 'failed' }
  // The walk finished. Counts are facts: read from the file, already in his books, freshly
  // landed, waiting for his yes, and lines that were never money.
  | {
      outcome: 'done';
      bankCode: string;
      bank: string;
      read: number;
      already: number;
      inserted: number;
      toReview: number;
      skipped: number;
    };

export async function ingestStatementCsv(args: {
  userId: string;
  text: string;
}): Promise<StatementIngestResult> {
  const { userId, text } = args;

  // THE ONE ENGINE, INJECTED. The same mapper and the same keyword map every bank feed line
  // goes through, so the two channels cannot disagree about what a line means.
  const outcome = parseStatement(text, userId, (line) => mapBankTransaction(line, categoriseBankLine));
  if (!outcome.ok) {
    return { outcome: 'rejected', reason: outcome.reason, message: outcome.message };
  }

  const entries: BankEntryInsert[] = outcome.entries.map((e) => ({ ...e }));

  // THE SAME ENRICHMENT THE SYNC RUNS, minus the auto file (see the header). Never fatal: if
  // the brain is unreachable the rows land exactly as mapped and he corrects them by hand,
  // which is what he did before the brain existed.
  try {
    let ownNames: string[] = [];
    try {
      ownNames = await readOwnNames(userId);
    } catch {
      ownNames = [];
    }
    // The personal check runs on EVERY line, known vendor or not, for the reason written at
    // length in lib/banksync.ts: the flag must be on the row before anything can bulk confirm
    // it, because confirm_pile enforces it in SQL against that column.
    for (const entry of entries) {
      if (looksPersonal(entry.vendor, entry.description, ownNames, entry.amount) !== null) {
        entry.looks_personal = true;
      }
    }
    const keys = entries.map((e) => normaliseVendor(e.vendor));
    const [rules, patterns] = await Promise.all([
      getUserRules(userId),
      getVendorPatterns(keys.filter(Boolean)),
    ]);
    if (rules.length > 0 || patterns.length > 0) {
      for (const entry of entries) {
        const known = recall(entry.vendor, rules, patterns);
        if (known.source === 'none') continue;
        // A category we know beats the keyword map's guess. It arrives as a SUGGESTION on an
        // unconfirmed row, never as a filed answer: see the header for why this walk does
        // not auto file what the sync would.
        if (known.category) entry.category = known.category;
        // If he has told us a vendor is not business money, we never ask twice. Out of the
        // tax figures on arrival, reversible with one tap, exactly as the sync does it.
        if (known.isPersonal === true) entry.is_personal = true;
      }
    }
  } catch {
    /* the brain is an improvement, never a dependency */
  }

  // What is genuinely new, asked of the database before writing, so the result screen counts
  // facts. A null answer means the read failed; the insert's own on_conflict rule still makes
  // re inserting everything harmless, so the import proceeds and only the split is derived.
  const known = await knownExternalIds(userId, entries.map((e) => e.external_id));
  const fresh = known === null ? entries : entries.filter((e) => !known.has(e.external_id));

  let inserted = 0;
  if (fresh.length > 0) {
    inserted = await insertBankTransactions(userId, fresh);
    // insertBankTransactions swallows chunk failures and returns what truly landed. Rows we
    // KNEW were new and that did not land is a failed write, and a failed write must not be
    // reported as "already in your books", which is what a silent zero would read as.
    if (inserted === 0) return { outcome: 'failed' };
  }

  const read = entries.length;
  // "Already in your books" is the database's own answer where we have one. Deriving it as
  // read minus inserted would, on the rare partial write failure, claim the failed rows were
  // already his, which is the one direction of wrong he would act on. When the pre read failed
  // the derivation is all there is, and the on_conflict rule makes it exact in that case.
  const already = known !== null ? known.size : read - inserted;
  const personalAmongFresh = fresh.filter((e) => e.is_personal === true).length;
  const toReview = Math.max(0, inserted - personalAmongFresh);

  return {
    outcome: 'done',
    bankCode: outcome.bankCode,
    bank: outcome.bank,
    read,
    already,
    inserted,
    toReview,
    skipped: outcome.skipped,
  };
}
