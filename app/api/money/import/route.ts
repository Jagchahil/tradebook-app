import { NextRequest, NextResponse } from 'next/server';
import { sessionUser } from '../../../../lib/webauth';
import { parseStatement } from '../../../../lib/statementimport';
import { mapBankTransaction } from '../../../../lib/bankfeed';
import { categoriseBankLine } from '../../../../lib/categories';
import {
  BankEntryInsert, insertBankTransactions, knownExternalIds, readOwnNames,
  getUserRules, getVendorPatterns,
} from '../../../../lib/supabase';
import { normaliseVendor, recall } from '../../../../lib/memory';
import { looksPersonal } from '../../../../lib/personal';
import { rateLimitedShared } from '../../../../lib/ratelimit';
import { gateForUser, refuseUnentitled } from '../../../../lib/gateserver';

// A BANK STATEMENT, UPLOADED AS A CSV. The bank feed's fallback channel, and the one that
// needs nobody's permission: the feed has no provider today (GoCardless closed, TrueLayer
// declined us; the history is in lib/statementimport.ts's header), and this route is why the
// launch does not care.
//
//   POST multipart { statement: <csv> }  ->  rows in his books, every one UNCONFIRMED
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ ONE ENGINE, AND THIS ROUTE IS A CALLER OF IT, NOT A SECOND COPY.
//
// lib/statementimport.ts detects the bank and walks the file, but the line normalisation is
// mapBankTransaction from lib/bankfeed.ts with categoriseBankLine injected, the exact call
// lib/banksync.ts makes for a feed line. The enrichment below (his own names, the vendor rules
// he has taught us) is the same functions the sync runs, for the same reasons its comments
// give: the flags must land ON THE ROW, because confirm_pile re applies its guard in SQL
// against those columns, and a guard the database cannot see is a suggestion.
//
// 🔴 NOTHING IN THIS FILE EVER CONFIRMS A ROW. The sync auto files a vendor the user has
// taught us; this route deliberately does not, and the difference is the size of the act. A
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

export const runtime = 'nodejs';

// Same ceiling as the receipt route, and for the same reason: Vercel refuses bodies a little
// above this anyway, so the honest limit is ours and the message is ours. Four megabytes of
// CSV is tens of thousands of rows, far past the line cap the parser itself enforces.
const MAX_BYTES = 4 * 1024 * 1024;

// What a bank's CSV arrives labelled as. Browsers disagree: text/csv from most, Excel's mime
// from Windows machines that associate .csv with it, text/plain from the rest, and sometimes
// nothing at all. So the filename's own extension is accepted as the tiebreak when the type
// is missing or generic, and the parser's header detection is the real gate behind both.
const CSV_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream', ''];

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  const isForm = contentType.includes('multipart/form-data');
  const back = (q: string) => NextResponse.redirect(new URL(`/app/money/import?${q}`, req.url), 303);

  const user = await sessionUser(req);
  if (!user) {
    return isForm
      ? NextResponse.redirect(new URL('/in?next=/app/money/import', req.url), 303)
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 🔴 THE WORK STOPS WHEN HE STOPS PAYING. lib/gate.ts row: this route is 'entitled'.
  // Reading a statement into his books is bookkeeping, which is the work itself.
  const gate = await gateForUser(user.id);
  if (gate === 'readonly') {
    if (isForm) return back('locked=1');
    return refuseUnentitled(req, '/app/money/import');
  }

  // A man uploads a statement a few times a year. Twelve an hour is generous to somebody
  // feeding in a shoebox of monthly exports and lethal to a loop.
  if (await rateLimitedShared(`stmtimport:${user.id}`, 12, 60 * 60 * 1000)) {
    return isForm ? back('problem=slow') : NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return isForm ? back('problem=bad') : NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const part = form.get('statement');
  if (!part || typeof part === 'string' || part.size === 0) {
    return isForm ? back('problem=bad') : NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (part.size > MAX_BYTES) {
    return isForm ? back('problem=big') : NextResponse.json({ error: 'too_big' }, { status: 413 });
  }
  const mediaType = (part.type || '').toLowerCase();
  const name = (part.name || '').toLowerCase();
  if (!CSV_TYPES.includes(mediaType) && !name.endsWith('.csv')) {
    return isForm ? back('problem=type') : NextResponse.json({ error: 'bad_type' }, { status: 415 });
  }

  const text = Buffer.from(await part.arrayBuffer()).toString('utf8');

  // THE ONE ENGINE, INJECTED. The same mapper and the same keyword map every bank feed line
  // goes through, so the two channels cannot disagree about what a line means.
  const outcome = parseStatement(text, user.id, (line) => mapBankTransaction(line, categoriseBankLine));
  if (!outcome.ok) {
    if (isForm) return back(`problem=${outcome.reason}`);
    return NextResponse.json({ error: outcome.reason, message: outcome.message }, { status: 422 });
  }

  const entries: BankEntryInsert[] = outcome.entries.map((e) => ({ ...e }));

  // THE SAME ENRICHMENT THE SYNC RUNS, minus the auto file (see the header). Never fatal: if
  // the brain is unreachable the rows land exactly as mapped and he corrects them by hand,
  // which is what he did before the brain existed.
  try {
    let ownNames: string[] = [];
    try {
      ownNames = await readOwnNames(user.id);
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
      getUserRules(user.id),
      getVendorPatterns(keys.filter(Boolean)),
    ]);
    if (rules.length > 0 || patterns.length > 0) {
      for (const entry of entries) {
        const known = recall(entry.vendor, rules, patterns);
        if (known.source === 'none') continue;
        // A category we know beats the keyword map's guess. It arrives as a SUGGESTION on an
        // unconfirmed row, never as a filed answer: see the header for why this route does
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
  const known = await knownExternalIds(user.id, entries.map((e) => e.external_id));
  const fresh = known === null ? entries : entries.filter((e) => !known.has(e.external_id));

  let inserted = 0;
  if (fresh.length > 0) {
    inserted = await insertBankTransactions(user.id, fresh);
    // insertBankTransactions swallows chunk failures and returns what truly landed. Rows we
    // KNEW were new and that did not land is a failed write, and a failed write must not be
    // reported as "already in your books", which is what a silent zero would read as.
    if (inserted === 0) {
      return isForm ? back('problem=unavailable') : NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
  }

  const read = entries.length;
  // "Already in your books" is the database's own answer where we have one. Deriving it as
  // read minus inserted would, on the rare partial write failure, claim the failed rows were
  // already his, which is the one direction of wrong he would act on. When the pre read failed
  // the derivation is all there is, and the on_conflict rule makes it exact in that case.
  const already = known !== null ? known.size : read - inserted;
  const personalAmongFresh = fresh.filter((e) => e.is_personal === true).length;
  const toReview = Math.max(0, inserted - personalAmongFresh);

  const counts =
    `bank=${outcome.bankCode}&read=${read}&known=${already}&fresh=${inserted}` +
    `&review=${toReview}&skipped=${outcome.skipped}`;
  return isForm
    ? back(`done=1&${counts}`)
    : NextResponse.json({
        ok: true,
        bank: outcome.bank,
        read,
        alreadyKnown: already,
        inserted,
        toReview,
        skipped: outcome.skipped,
      });
}
