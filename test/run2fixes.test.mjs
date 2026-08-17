// THE RUN 2 PACKET. Nineteen findings from one florist, one evening, three doors.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Rosa Fernandes runs a high street flower shop and lets the flat above it. She walked lekhio.app
// cold on 12 August 2026 and found, among other things, that:
//
//   the VAT question       was answered three different wrong ways on three doors, and the true
//                          figure was sitting in her confirmed rows the whole time
//   her property costs     could not reach the property stream at all, so her mortgage interest
//                          was deducted in full against her trade, which Section 24 stopped in 2020
//   a missed quarter       was mentioned nowhere, five days after its statutory due date
//   a faded receipt        was read as £110.55 (the paper says £118.55) and then FILED by a press
//                          that was about a different row's category
//   the same photograph    sent twice logged twice, three times out of four
//   a bank import          never looked sideways at receipts already waiting, so a £3,200 chiller
//                          went into the books twice
//   "make that 12.60"      logged a SECOND entry beside the £12.40 it was correcting
//   "half 7"               was confirmed back as 06:30
//   an invoice request     was logged as income received
//   a Punjabi question     was named as Punjabi and refused as off topic, twelve minutes after the
//                          same router answered the same question in English
//   a question about the
//   barber next door       was answered with her own set aside figure
//
// Every assertion below is one of those, held open.
//
//   node test/run2fixes.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  vatStanding, standingSentence, ROLLING_WINDOW_DAYS, NEAR_LINE_DISTANCE,
  CARD_FEE_NOTE, FLOOR_NOTE, BACKWARD_TEST, FORWARD_TEST,
} from '../lib/vatstanding.ts';
import {
  updateSchedule, overdueUpdates, nextUpdate, overdueSentence,
  EASEMENT_WITH_GATE, CANNOT_SEND_YET,
} from '../lib/mtdupdates.ts';
import {
  PROPERTY_CATEGORIES, isPropertyCategory, isPropertyFinanceCategory,
  streamFor, offerPropertyCategories, categoriesFor,
} from '../lib/propertylanes.ts';
import {
  // ⚠️ isVatQuestion and isVatThresholdQuestion were imported here and never called. Removed 16
  // August 2026, Run 7, and it is worth saying why rather than just deleting two names.
  //
  // isVatQuestion IS still asserted by this file, three times, but as SOURCE TEXT: the checks below
  // read app/api/whatsapp/route.ts and hold that the VAT lane exists and sits above the totals and
  // open question lanes. That is a check on the ROUTER'S ORDER, which is what Run 2 found, and it
  // needs the name as a string, not the function.
  //
  // 🟢 isVatThresholdQuestion WAS DELETED ON 17 AUGUST 2026, B16. The note that stood here for a day
  // is kept, struck through, because the reason it was wrong is more useful than the note was.
  //
  // It said: "NOTHING IN EITHER REPO CALLS IT... So the behaviour its comment describes does not
  // exist: a man near the line who asks WhatsApp about the threshold gets the same rules first
  // answer as anybody else... NOT a deletion to make a linter quiet, because the right answer may
  // well be to start calling it."
  //
  // The first half was true and the second half was not, and it was checkable in one file.
  // handleVatQuestion opens with `[standingSentence(standing, formatGbp)]` and pushes the two
  // statutory tests AFTER it, and standingSentence carries his own rolling twelve month figure. THE
  // FIGURE ALREADY LEADS, for every VAT question, unconditionally. There was no rules first answer
  // to rescue anybody from and no second behaviour to select, so there was nothing to start calling
  // it for. lib/waintents.ts carries the full argument where the function used to be.
  //
  // ⚠️ AND THE LESSON IS R5's, WHICH THIS IS THE SECOND PAYMENT ON IN TWO DAYS: a claim written in
  // prose and checked by nothing drifts, and the safe sounding "record it rather than tidy it away"
  // recorded a false premise for the next reader to inherit. The behaviour is now asserted below.
  matchEditLast, isAboutSomeoneElse,
  matchInvoiceDraft, invoiceDraftAnswer, detectScript, languageApology,
  looksLikeMoneyEntry, isGreeting, isNonWords, isVent, normaliseBritishTime,
  greetingReply, SOMEONE_ELSE_ANSWER, VENT_REPLY,
} from '../lib/waintents.ts';
import { CATEGORIES } from '../lib/categories.ts';

// lib/reviewpile.ts imports its siblings without a .ts extension, which node's type stripping
// cannot resolve on its own. The repo's standing answer is to stage the chain in a temp directory
// with the extensions rewritten, exactly as test/agent.test.mjs does, so the REAL file is on the
// bench rather than a copy of its logic.
const libDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'run2-'));
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['money', 'personal', 'capital', 'taxengine', 'receiptconfidence', 'reviewpile']) {
  writeFileSync(path.join(stage, `${f}.ts`), fixImports(readFileSync(path.join(libDir, `${f}.ts`), 'utf8')));
}
const RP = await import(pathToFileURL(path.join(stage, 'reviewpile.ts')).href);
const { isMachineRead, MACHINE_READ_SOURCES, buildPile } = RP;

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf returns -1 for a missing needle, so a bare
// comparison passes when the first thing was deleted.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

// ⚠️ NEGATIVE ASSERTIONS RUN ON THE CODE, NEVER ON THE PROSE AROUND IT. These files carry the
// story of what was removed, so a grep for the removed thing finds the story.
const codeOnly = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const gbp = (n) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('F14/F9: where he stands against the VAT line');
{
  const THRESHOLD = 90000;
  // Rosa's year, in the shape the money log holds it: a full twelve months of trade income plus
  // rent that must never be counted (VATA 1994 Sch 9 Group 1).
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    const month = String(((7 + i) % 12) + 1).padStart(2, '0');
    const year = 7 + i > 11 ? 2026 : 2025;
    rows.push({ amount: 6800, transaction_date: `${year}-${month}-15`, income_type: null });
    rows.push({ amount: 950, transaction_date: `${year}-${month}-01`, income_type: 'property' });
    rows.push({ amount: -400, transaction_date: `${year}-${month}-10`, income_type: null });
  }
  const s = vatStanding(rows, '2026-08-12', THRESHOLD);

  ok('a full year of rows is a KNOWN figure, not a shrug', s.kind === 'known');
  ok('rent is excluded from taxable turnover', s.rolling12m === 6800 * 12);
  ok('costs are ignored: the test is on turnover, not profit', s.rolling12m > 0 && s.rolling12m === 81600);
  ok('the distance to the line is stated', s.distance === THRESHOLD - 81600);
  ok('under the line is not over it', s.over === false);
  ok('near the line is flagged so the caveats can be drawn', s.nearLine === true);

  // 🔴 THE ACCOUNT AGE GATE, WHICH IS THE FINDING. Four months of rows is not silence.
  const young = rows.filter((r) => r.transaction_date >= '2026-05-01');
  const f = vatStanding(young, '2026-08-12', THRESHOLD);
  ok('a short history gives a FLOOR, never nothing', f.kind === 'floor');
  ok('the floor can only ever under-state', f.rolling12m <= s.rolling12m);
  ok('the floor says so in words', FLOOR_NOTE.includes('least'));
  ok('the floor sentence says "at least"', standingSentence(f, gbp).includes('at least'));

  ok('no rows at all is its own answer, not a zero', vatStanding([], '2026-08-12', THRESHOLD).kind === 'nothing');
  ok('a registered customer is told the question is behind him', vatStanding(rows, '2026-08-12', THRESHOLD, true).kind === 'registered');

  // Over the line has to be unmistakable: registering late is a penalty.
  const big = rows.map((r) => (r.income_type === 'property' ? r : { ...r, amount: r.amount * 2 }));
  const over = vatStanding(big, '2026-08-12', THRESHOLD);
  ok('over the line is called over the line', over.over === true);
  ok('the over sentence says registration is not optional', /not optional/.test(standingSentence(over, gbp)));
  ok('the over sentence names the penalty for registering late', /penalty/.test(standingSentence(over, gbp)));

  // A row dated in the future is a typo and must not open the window early.
  const future = [{ amount: 500000, transaction_date: '2027-01-01', income_type: null }, ...rows];
  ok('a future dated row is not turnover', vatStanding(future, '2026-08-12', THRESHOLD).rolling12m === 81600);

  // The window is twelve months, not the tax year: this is the exact confusion the WhatsApp
  // router shipped, answering a rolling question with a tax year figure.
  const old = [{ amount: 50000, transaction_date: '2025-01-01', income_type: null }, ...rows];
  ok('money older than the window is out of the rolling figure', vatStanding(old, '2026-08-12', THRESHOLD).rolling12m === 81600);
  ok('the window is 365 days and says so', ROLLING_WINDOW_DAYS === 365);
  ok('near the line has a stated distance', NEAR_LINE_DISTANCE > 0);

  ok('both statutory tests exist as owned strings', /rolling twelve months/.test(BACKWARD_TEST) && /30 days/.test(FORWARD_TEST));
  ok('the forward test registers you immediately, not after', /immediately/.test(FORWARD_TEST));
  ok('the card fee gap is named, because payouts arrive net', /fee/.test(CARD_FEE_NOTE) && /gross|what the customer paid/.test(CARD_FEE_NOTE));
}

console.log('F14: every door calls the one function');
{
  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  ok('WhatsApp has a VAT lane at all', /isVatQuestion\(text\)/.test(wa));
  // ⚠️ THE ORDER IS THE GUARD, so it is asserted on the DISPATCH CHAIN rather than on the file:
  // both needles appear in the imports too, and an import order proves nothing about a lane order.
  // The chain is the text between the first `else if` and the closing of the block.
  const chain = wa.slice(wa.indexOf('} else if (isPhoneShare(text))'), wa.indexOf('await handleTextEntry(from, messageId, text)'));
  ok('the VAT lane sits ABOVE the totals lane', before(chain, 'isVatQuestion(text)', 'matchTotalsQuestion(text)'));
  ok('the VAT lane sits ABOVE the open question lane', before(chain, 'isVatQuestion(text)', 'isQuestion(text)'));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 "EVERY DOOR CALLS THE ONE FUNCTION" WAS THIS BLOCK'S TITLE ON 12 AUGUST AND IT ONLY BECAME
  // TRUE ON 17 AUGUST. B18.
  //
  // Every assertion in here used to read app/api/whatsapp/route.ts, because that is where the
  // answer was assembled, and it was the only channel with a VAT lane at all. So the block held
  // the promise on the one door that had it and said nothing about the two that did not. The web
  // chat, asked "am in glasgow, is vat different up here" by a signed in sole trader with 77
  // confirmed entries, returned the statute out of the model and never mentioned his turnover.
  //
  // THE ASSERTIONS NOW FOLLOW THE WORK. lib/vatstanding.ts assembles the answer, lib/vatanswer.ts
  // reads his rows, and all three routers call it. Anchored on the files that do the thing, so a
  // future move turns this red rather than leaving it quietly true about a file that stopped
  // mattering, which is the R5 fault this corpus has now paid for four times.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const answerSrc = codeOnly(read('lib/vatstanding.ts'));
  const readerSrc = codeOnly(read('lib/vatanswer.ts'));

  ok('🔴 the answer is built from vatStanding, not from a template', /vatStanding\(/.test(readerSrc));
  ok('...and the reader is the ONE reader: lib/vatanswer.ts holds the only vatAnswerForUser',
    (read('lib/vatanswer.ts').match(/export async function vatAnswerForUser/g) || []).length === 1);

  // 🔴 ALL THREE DOORS, DERIVED, AND NONE OF THEM ASSEMBLING ANYTHING OF ITS OWN. The second half
  // is the one that matters: a router that calls the shared reader AND keeps a copy of the
  // sentences is two owners again with a shared function standing next to it looking like one.
  for (const rel of ['app/api/whatsapp/route.ts', 'app/api/thread/route.ts', 'app/api/ask/route.ts']) {
    const src = codeOnly(read(rel));
    ok(`  ${rel}: calls vatAnswerForUser`, /vatAnswerForUser\(/.test(src));
    ok(`  ${rel}: and assembles NONE of the answer itself`,
      !/BACKWARD_TEST/.test(src) && !/FORWARD_TEST/.test(src) && !/CARD_FEE_NOTE/.test(src)
      && !/standingSentence\(/.test(src) && !/vatStanding\(/.test(src));
  }

  ok('a failed read refuses to guess, in one sentence every channel shares',
    /not going to answer a VAT question with a/.test(read('lib/vatstanding.ts'))
    && /return VAT_UNREADABLE;/.test(readerSrc));
  // 🔴 AND THE REFUSAL IS ON THE ROWS, NOT ON THE PROFILE. A missing VAT profile only costs the
  // "already registered" short cut; the threshold answer under it is still his and still true.
  // Refusing a man an actionable answer because a second read failed is the opposite defect.
  ok('🔴 ...and it is the ROWS failing that refuses, never the profile',
    /if \(rows === null\) return VAT_UNREADABLE;/.test(readerSrc));

  // 🔴 THE FIGURE LEADS, AND THE STATUTORY TESTS FOLLOW IT. B16, 17 August 2026.
  //
  // This is the promise a deleted predicate used to stand next to without holding: a man near the
  // line gets WHERE HE STANDS first and the rules after, never the other way round. Derived from
  // the builder rather than typed: the standing sentence must be the FIRST element of the parts
  // array, and both statutory tests must be pushed after it. Held by index, so reversing them
  // turns this red.
  {
    const leadAt = answerSrc.indexOf('const parts: string[] = [standingSentence(');
    const backAt = answerSrc.indexOf('parts.push(BACKWARD_TEST)');
    const fwdAt = answerSrc.indexOf('parts.push(FORWARD_TEST)');
    ok('🔴 the VAT answer OPENS with his standing figure, not with the rules',
      leadAt !== -1);
    ok('🔴 ...and both statutory tests come AFTER it, so he is never handed rules first',
      leadAt !== -1 && backAt > leadAt && fwdAt > leadAt);
    ok('⚠️ and the standing sentence carries his own twelve month figure',
      /export function standingSentence/.test(read('lib/vatstanding.ts'))
      && /rolling12m/.test(read('lib/vatstanding.ts')));
  }
  // 🔴 THE CARD FEE NOTE IS THE ONE PART THAT IS CONDITIONAL, AND IT IS CONDITIONAL ON nearLine
  // AND NOTHING ELSE. Flattened to always it is noise far from the line; dropped on the web it
  // warns a near line customer on WhatsApp and not in the chat about the same understatement in
  // the same rows. Both are real, so the condition is asserted rather than assumed.
  ok('🔴 the card fee note travels on every channel, and only when he is near the line',
    /if \('nearLine' in s && s\.nearLine\) parts\.push\(CARD_FEE_NOTE\);/.test(answerSrc));

  ok('the gov.uk source travels with the answer', /gov\.uk\/vat-registration\/when-to-register/.test(read('lib/vatstanding.ts')));
  ok('...and it is pushed into the answer, not merely defined in the file',
    /parts\.push\(VAT_SOURCE\)/.test(answerSrc));
}
{
  const page = codeOnly(read('app/app/tax/vat/page.tsx'));
  ok('the VAT page builds the figure from his rows', /vatStanding\(rows,/.test(page));
  ok('the page prefers the rows over the account age RPC', before(page, 'const standing =', 'const turnover ='));
  ok('the rows answer is drawn before the tooNew arm', before(page, 'haveStanding ?', "turnover?.kind === 'tooNew'"));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('F8: the quarterly update that had already gone');
{
  // Rosa's day. Q1 covered 6 Apr to 5 Jul 2026 and was due 7 August. This is 12 August.
  const sched = updateSchedule(2026, '2026-08-12');
  ok('four updates in the year', sched.length === 4);
  ok('the first period is 6 April to 5 July', sched[0].periodStart === '2026-04-06' && sched[0].periodEnd === '2026-07-05');
  ok('the first update was due 7 August', sched[0].dueBy === '2026-08-07');
  ok('the second is due 7 November', sched[1].dueBy === '2026-11-07');
  ok('the third is due 7 February, in the next calendar year', sched[2].dueBy === '2027-02-07');
  ok('the fourth is due 7 May', sched[3].dueBy === '2027-05-07');

  // 🔴 THE FINDING. On 12 August the first update is OVERDUE and every surface said nothing.
  ok('the first update reads as overdue on 12 August', sched[0].state === 'overdue');
  ok('the second is not yet due, because its period is still open', sched[1].state === 'not_yet');
  ok('overdueUpdates finds exactly the one', overdueUpdates(2026, '2026-08-12').length === 1);
  ok('nobody is nagged before the due date', overdueUpdates(2026, '2026-08-06').length === 0);
  ok('the day itself is not late', overdueUpdates(2026, '2026-08-07').length === 0);
  ok('the day after is', overdueUpdates(2026, '2026-08-08').length === 1);

  // 🔴 THE QUARTER BOUNDARIES THE WEB THREAD INVENTED. It answered "1 May to 7 August, 8 August
  // to 7 November", which are the DUE dates walked backwards, not the periods.
  ok('no period ever starts on the 1st of a month', sched.every((u) => !u.periodStart.endsWith('-01')));
  ok('no period ever ends on a 7th', sched.every((u) => !u.periodEnd.endsWith('-07')));
  ok('every period ends on the 5th', sched.every((u) => u.periodEnd.endsWith('-05')));
  ok('every period starts on the 6th', sched.every((u) => u.periodStart.endsWith('-06')));

  // The easement and the return gate ship together, always.
  ok('the easement names 2026/27', /2026\/27/.test(EASEMENT_WITH_GATE));
  ok('the easement never travels without the return gate', /before the return/.test(EASEMENT_WITH_GATE));
  ok('and it says plainly that late is deferred, not free', /put off rather than written off/.test(EASEMENT_WITH_GATE));
  ok('we say we cannot file it ourselves yet', /cannot send an update to HMRC yet/.test(CANNOT_SEND_YET));

  const sentence = overdueSentence(overdueUpdates(2026, '2026-08-12'));
  ok('the overdue sentence names the period', /6 April 2026 to 5 July 2026/.test(sentence));
  ok('the overdue sentence names the due date', /7 August 2026/.test(sentence));
  // ⚠️ IT MUST NOT SAY "YOU HAVE NOT SENT IT". Lekhio cannot file, so we have no record either
  // way and she may have sent it through other software or an agent.
  ok('it says we have no record, never that she failed to send', /no record of it going/.test(sentence) && !/you have not sent/i.test(sentence));
  ok('an account in good standing gets no sentence at all', overdueSentence([]) === '');

  ok('nextUpdate points at the one still to come', nextUpdate(2026, '2026-08-12')?.index === 2);

  // The page has its own single-quarter version. The two must never name different quarters.
  const due = read('app/app/tax/due.ts');
  ok('the page side has an overdue function', /export function overdueUpdate\(/.test(due));
  // ⚠️ THE COMPARISON IS THE WHOLE FUNCTION. outstandingUpdate returns null PAST the due date;
  // this one must return null UP TO it, and a guard rewritten to `if (true) return null` would
  // leave the export in place and the box empty for ever.
  ok('the overdue function returns null only up to the due date', /if \(todayIso <= dueISO\) return null;/.test(due));
  ok('and it is not short circuited', !/overdueUpdate\([\s\S]{0,600}?if \(true\) return null;/.test(due));
  ok('it floors on the same graded concept as the open one', (due.match(/mtd_first_quarter_deadline/g) ?? []).length >= 2);
  const summary = codeOnly(read('app/app/tax/summary/page.tsx'));
  ok('the quarterly page draws the overdue box', /overdueUpdate\(/.test(summary));
  ok('the missed one is drawn ABOVE the calendar card', before(summary, 'overdue ? (', 'mandated ? ('));
  ok('the box carries the return gate, not just the easement', /before the return for that/.test(read('app/app/tax/summary/page.tsx')));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('F5/F7: a cost can reach the property stream');
{
  ok('mortgage interest is a property category', isPropertyCategory('mortgage interest'));
  ok('the letting agent is a property category', isPropertyCategory('letting agent'));
  ok('property repairs are a property category', isPropertyCategory('property repairs'));
  ok('ground rent is a property category', isPropertyCategory('ground rent'));
  ok('materials are not', isPropertyCategory('materials') === false);
  // 🔴 'insurance' STAYS TRADE. A florist has public liability AND landlord cover and the word
  // alone cannot tell them apart, so sorting it by guess would move real money between two
  // streams taxed differently.
  ok('insurance is deliberately NOT sorted by guess', isPropertyCategory('insurance') === false);

  ok('mortgage interest is the finance cost', isPropertyFinanceCategory('mortgage interest'));
  ok('the agent fee is an ordinary property cost, not a finance one', isPropertyFinanceCategory('letting agent') === false);

  ok('a property category routes to the property stream', streamFor('ground rent') === 'property');
  ok('everything else routes to trade, unchanged', streamFor('materials') === 'trade');
  ok('an unknown category defaults to trade, so nothing already filed moves', streamFor('nonsense') === 'trade');
  ok('a null category defaults to trade', streamFor(null) === 'trade');

  // Doc 103: never ask a question with one sensible answer.
  ok('a customer with no rental is not offered property categories', offerPropertyCategories(false) === false);
  ok('a landlord is', offerPropertyCategories(true) === true);
  const trade = categoriesFor(CATEGORIES, false);
  const withProp = categoriesFor(CATEGORIES, true);
  ok('the plumber\'s list has no property rows in it', trade.every((c) => !isPropertyCategory(c)));
  ok('the landlord\'s list has all four', PROPERTY_CATEGORIES.every((c) => withProp.includes(c)));
  ok('the landlord\'s list is exactly four longer', withProp.length === trade.length + PROPERTY_CATEGORIES.length);
  ok('the trade order is untouched', trade.join(',') === CATEGORIES.filter((c) => !isPropertyCategory(c)).join(','));

  // Every property category has to actually exist in the one category list, or the select can
  // never offer it and the whole lane is dead on arrival.
  ok('every property category is in CATEGORIES', PROPERTY_CATEGORIES.every((c) => CATEGORIES.includes(c)));

  // 🔴 THE SQL ALLOWLIST AND THE TS LIST ARE ONE FACT IN TWO PLACES, so they are pinned together.
  const sql = read('supabase/APPLY_2026-08-13_property_expense_stream.sql');
  ok('the migration exists', sql.length > 0);
  // ⚠️ INSIDE THE FUNCTION BODY, NOT ANYWHERE IN THE FILE. The header prose and the repair block
  // both mention income_type = 'property', so a file-wide grep passes with the UPDATE gutted.
  const body = sql.slice(sql.indexOf('update public.transactions t'), sql.indexOf('get diagnostics'));
  ok('the migration sets the property stream in the UPDATE itself', /income_type\s*=\s*'property'/.test(body));
  ok('and it sets the category and confirms in the same statement', /set category\s*=\s*v_cat/.test(body) && /confirmed\s*=\s*true/.test(body));
  ok('every TS property category is in the SQL allowlist', PROPERTY_CATEGORIES.every((c) => sql.includes(`'${c}'`)));
  ok('the SQL keeps the money guards: money out only', /and t\.amount < 0\b/.test(body));
  ok('the SQL keeps the money guards: never a flagged row', /and t\.looks_personal = false/.test(body));
  ok('the SQL never touches a confirmed row', /and t\.confirmed = false/.test(body));
  ok('the SQL never touches anyone else\'s rows', /and t\.user_id = p_user/.test(body));
  // ⚠️ ANCHORED ON THE COMMENTED FORMS. A bare search for "update public.transactions" finds the
  // function body forty lines above the repair section and passes for the wrong reason: the exact
  // shape of assertion this repo keeps relearning.
  ok('the repair for existing rows is a SELECT first, never an automatic UPDATE', before(sql, '--   select id, transaction_date', '--   update public.transactions'));
  ok('the repair is documented but never executed by the migration', !/^\s*update public\.transactions\s*$/m.test(sql.split('AFTER APPLYING')[1] ?? ''));

  const route = codeOnly(read('app/api/pile/route.ts'));
  ok('the pile routes a property category through the other door', /isPropertyCategory\(category\)/.test(route));
  ok('and calls the property confirm', /confirmPileProperty\(user\.id, ids, category\)/.test(route));
  ok('trade costs still go through confirmPile, unchanged', /confirmPile\(user\.id, ids, category\)/.test(route));

  const pile = codeOnly(read('app/app/pile/page.tsx'));
  ok('the pile select is gated on the rental flag', /categoriesFor\(CATEGORIES, rental\)/.test(pile));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('F3: a machine read amount never rides a press about something else');
{
  ok('a WhatsApp photograph is machine read', isMachineRead('whatsapp_image'));
  ok('a web photograph is machine read', isMachineRead('web_image'));
  ok('a bank line is NOT', isMachineRead('bank_feed') === false);
  ok('a typed entry is NOT', isMachineRead('whatsapp_text') === false);
  ok('an unknown source is not assumed to be read', isMachineRead(null) === false);
  ok('the source list is named once', MACHINE_READ_SOURCES.length === 2);

  // 🔴 THE EXACT SHAPE OF THE FINDING: a PORTERS bank line and a PORTERS receipt.
  const groups = buildPile(
    [
      { id: 'a', vendor: 'PORTERS WHOLESALE FLOWERS', amount: -81.43, category: null, source_type: 'bank_feed' },
      { id: 'b', vendor: 'PORTERS WHOLESALE FLOWERS', amount: -324.69, category: null, source_type: 'bank_feed' },
      { id: 'c', vendor: 'Porters', amount: -110.55, category: null, source_type: 'web_image' },
    ],
    (v) => v.toLowerCase().replace(/[^a-z]/g, '').slice(0, 7),
  );
  ok('the photograph does not join the bank rows', groups.length === 2);
  const readGroup = groups.find((g) => g.readFromPhoto);
  const bankGroup = groups.find((g) => !g.readFromPhoto);
  ok('one group is flagged as read off paper', readGroup !== undefined);
  ok('the other is not', bankGroup !== undefined);
  ok('the photograph group holds only the photograph', readGroup.ids.length === 1 && readGroup.ids[0] === 'c');
  ok('the bank group holds only the bank rows', bankGroup.ids.length === 2 && !bankGroup.ids.includes('c'));

  // Two photographs of the same shop still group together: the split is by SOURCE, not per row,
  // so a screenful of receipts is still one press.
  const two = buildPile(
    [
      { id: 'x', vendor: 'NCGM FLOWERS', amount: -312.75, category: null, source_type: 'whatsapp_image' },
      { id: 'y', vendor: 'NCGM FLOWERS', amount: -104.00, category: null, source_type: 'whatsapp_image' },
    ],
    (v) => v.toLowerCase(),
  );
  ok('two photographs of one shop are still one group', two.length === 1 && two[0].count === 2);
  ok('and they are still marked as read off paper', two[0].readFromPhoto === true);

  const pile = codeOnly(read('app/app/pile/page.tsx'));
  // ⚠️ THE ASSIGNMENT, NOT THE IDENTIFIER. `const knownRead = []` keeps every mention of the name
  // in the file and draws nothing at all, which is the finding coming straight back.
  // ⚠️ THE ASSIGNMENT AND THE FLAG, NOT THE EXACT CONDITION. On 13 August the list gained a second
  // clause (`&& !g.uncertainAmount`) so a reading the model struggled with gets its own press. The
  // guard's job is that the list is DERIVED FROM readFromPhoto rather than hardcoded, which is what
  // `const knownRead = []` would defeat, and that is still exactly what it checks.
  ok('the photograph list is DERIVED from the flag', /const knownRead = known\.filter\(\(g\) => g\.readFromPhoto\b/.test(pile));
  ok('the bank list is derived from its negation', /const knownGiven = known\.filter\(\(g\) => !g\.readFromPhoto\)/.test(pile));
  ok('the photograph list has its own press', /value="confirm_read"/.test(pile));
  ok('the bank list keeps its own', /value="confirm_known"/.test(pile));
  ok('the photograph list says what it is', /read off (a photograph|your photographs)/.test(read('app/app/pile/page.tsx')));

  const route = codeOnly(read('app/api/pile/route.ts'));
  ok('the server splits the two lists itself', /g\.readFromPhoto === wantRead/.test(route));
  ok('the browser still sends no ids for either press', /confirm_read/.test(route) && !/body\.ids.*confirm_read/.test(route));

  // The pile can only know the source if the reader selects it.
  ok('source_type is SELECTED, not only filtered on', /select=id,vendor,description,amount,category,looks_personal,vat_amount,vat_confirmed,cis_deduction,source_type/.test(read('lib/supabase.ts')));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('F4/F13: the same purchase, twice, in both directions');
{
  const ingest = codeOnly(read('lib/statementingest.ts'));
  ok('the statement walk calls the deduper at all', /findDuplicate\(/.test(ingest));
  ok('it looks at receipts already waiting', /recentlyCapturedForMatch\(/.test(ingest));
  // ⚠️ A LOOKBACK OF ZERO IS NOT A LOOKBACK. The shoebox this exists for is full of paper
  // photographed weeks before the statement arrives, so the window has to be measured in months.
  ok('the lookback is a real window, not this instant', /Date\.now\(\) - \d{2,} \* 86400_000/.test(ingest));
  ok('nothing throws the glance away before it runs', !/if \(true\) throw/.test(ingest));
  ok('only a confident match merges', /hit\.strength === 'same'/.test(ingest));
  ok('the receipt category rides across onto the bank row', /e\.category = String\(hit\.match\.category\)/.test(ingest));
  ok('a receipt is never claimed twice in one import', /claimed\.has\(String\(w\.id\)\)/.test(ingest));
  ok('the superseded receipt is dropped, so one entry is left', /dropSupersededReceipts\(/.test(ingest));
  ok('the count is reported rather than assumed', /mergedWithReceipts/.test(ingest));
  ok('a failed lookup never breaks the import', /the sideways glance is a kindness, never a dependency/.test(read('lib/statementingest.ts')));

  const supa = read('lib/supabase.ts');
  ok('the drop refuses to touch a confirmed row', /dropSupersededReceipts[\s\S]{0,900}?confirmed=eq\.false/.test(supa));

  // 🔴 THE WINDOW. recentUnconfirmedForMatch filters on the PRINTED date, which is why three of
  // four duplicate sends walked through: their paper was dated 30 July, 29 July and 27 June.
  // ⚠️ ANCHORED INSIDE recentlyCapturedForMatch, because created_at appears in other readers and a
  // file-wide grep passes while this one is quietly switched back to the printed date.
  const arrival = supa.slice(supa.indexOf('export async function recentlyCapturedForMatch'), supa.indexOf('// Recent UNCONFIRMED entries'));
  ok('the arrival reader filters on when it ARRIVED', /created_at=gte\./.test(arrival));
  ok('and NOT on the printed date, which is the whole finding', !/transaction_date=gte\./.test(arrival));
  const receipt = codeOnly(read('lib/receiptingest.ts'));
  ok('the receipt-versus-receipt pass uses the arrival window', /recentlyCapturedForMatch\(userId, capturedSince\)/.test(receipt));
  ok('the bank merge pass keeps the printed date window', /recentUnconfirmedForMatch\(userId, since\)/.test(receipt));
  ok('the two passes use different pools, in that order', before(receipt, 'recentUnconfirmedForMatch(userId, since)', 'recentlyCapturedForMatch(userId, capturedSince)'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('F15: a correction corrects, it does not add');
{
  // The exact message. Two independent reasons it used to miss: the lead in was "actually" rather
  // than "no", and the amount was not the last thing in the message.
  ok('"actually make that 12.60 i read it wrong" is an edit', matchEditLast('actually make that 12.60 i read it wrong')?.amount === 12.6);
  ok('"sorry i meant 17.50" is an edit', matchEditLast('sorry i meant 17.50')?.amount === 17.5);
  ok('"no, change that to 40 mate" is an edit', matchEditLast('no, change that to 40 mate')?.amount === 40);
  ok('"hang on make it 22.99 not 22.90" is an edit', matchEditLast('hang on make it 22.99 not 22.90')?.amount === 22.99);

  // The old tight forms still work exactly as they did.
  ok('"change to 40" still works', matchEditLast('change to 40')?.amount === 40);
  ok('"it was 12.60" still works', matchEditLast('it was 12.60')?.amount === 12.6);

  // 🔴 AND A NEW ENTRY IS STILL A NEW ENTRY. Widening the tail is only safe because a back
  // reference is required with it.
  ok('"spent 12.60 on flowers" is NOT an edit', matchEditLast('spent 12.60 on flowers') === null);
  ok('"got paid 500 by Dave" is NOT an edit', matchEditLast('got paid 500 by Dave') === null);
  ok('"make 40" with no back reference and a tail is NOT an edit', matchEditLast('make 40 quid on that job') === null);
  ok('a zero is refused', matchEditLast('make that 0') === null);
  ok('an absurd amount is refused', matchEditLast('make that 9999999') === null);
}

console.log('F20: half seven is half PAST seven');
{
  ok('"half 7" becomes 7:30', /7:30/.test(normaliseBritishTime('remind me tomorrow at half 7 in the morning')));
  ok('and never 6:30', !/6:30/.test(normaliseBritishTime('remind me tomorrow at half 7 in the morning')));
  ok('"half seven" in words becomes 7:30', /7:30/.test(normaliseBritishTime('half seven')));
  ok('"half past 7" is rewritten the same way, so both reach the model identically', /7:30/.test(normaliseBritishTime('half past 7')));
  ok('"quarter past 8" becomes 8:15', /8:15/.test(normaliseBritishTime('quarter past 8')));
  ok('"quarter to nine" becomes 8:45', /8:45/.test(normaliseBritishTime('quarter to nine')));
  ok('"quarter to one" wraps to 12:45', /12:45/.test(normaliseBritishTime('quarter to one')));
  ok('an hour over twelve is left alone rather than mangled', normaliseBritishTime('half 19') === 'half 19');
  ok('an ordinary message is untouched', normaliseBritishTime('spent 40 on diesel') === 'spent 40 on diesel');

  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  ok('the rewrite happens BEFORE the model sees it', /parseSchedule\(normaliseBritishTime\(body\)/.test(wa));
  const claude = read('lib/claude.ts');
  ok('the prompt carries the British reading as a second lock', /"half seven" means 07:30, never 06:30/.test(claude));
}

console.log('F19: an invoice is money owed, not money received');
{
  const req = matchInvoiceDraft('draft an invoice for the fennel wedding balance, 380, flowers and setup for the marquee');
  ok('the request is recognised', req !== null);
  ok('the amount is read', req.amount === 380);
  ok('what it is for is read back in her words', /fennel/i.test(req.subject ?? ''));
  ok('"can you invoice for the wedding" is recognised', matchInvoiceDraft('can you invoice for the wedding') !== null);
  ok('"make an invoice" is recognised', matchInvoiceDraft('make an invoice for 200') !== null);
  ok('a plain spend is NOT an invoice request', matchInvoiceDraft('spent 40 on diesel') === null);
  ok('a plain income entry is NOT an invoice request', matchInvoiceDraft('got paid 500 by Dave') === null);

  const answer = invoiceDraftAnswer(req, gbp);
  // 🔴 THE SENTENCE THAT WAS MISSING AND IS THE WHOLE FINDING.
  ok('the answer says it is money owed, not money had', /owed, not money you have/.test(answer));
  ok('the answer says nothing has gone into her figures', /nothing has gone into your figures/.test(answer));
  ok('the answer promises nothing is sent on her behalf', /I do not send anything on your behalf/.test(answer));
  ok('the answer names the amount', /380/.test(answer));

  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  ok('the router has an invoice draft lane', /matchInvoiceDraft\(text\) !== null/.test(wa));
  // It carries an amount on purpose, so it must be caught before anything that reads amounts.
  ok('the invoice lane sits ABOVE the totals lane', before(wa, 'matchInvoiceDraft(text) !== null', 'matchTotalsQuestion(text)'));
  ok('the invoice handler writes no row', /async function handleInvoiceDraft[\s\S]{0,600}?invoiceDraftAnswer/.test(wa) && !/async function handleInvoiceDraft[\s\S]{0,600}?saveEntry/.test(wa));
}

console.log('F21: somebody else\'s money is not hers to be told');
{
  ok('the barber next door is recognised as somebody else', isAboutSomeoneElse('what does the barber next door owe you lot then'));
  ok('"my mate" is too', isAboutSomeoneElse('how much tax does my mate pay'));
  ok('"their turnover" is too', isAboutSomeoneElse('whats their turnover'));
  ok('her own question is NOT', isAboutSomeoneElse('what do i owe so far this year') === false);
  ok('her own takings question is NOT', isAboutSomeoneElse('how much have i made this month') === false);
  ok('the refusal says we can only see her books', /only see your books/.test(SOMEONE_ELSE_ANSWER));
  ok('the refusal offers her own figures instead', /your own figures/.test(SOMEONE_ELSE_ANSWER));

  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  ok('the router refuses before it reads her books', before(wa, 'isAboutSomeoneElse(text)', 'matchTotalsQuestion(text)'));
  ok('it sits above the deadline and savings lanes too', before(wa, 'isAboutSomeoneElse(text)', 'isSavingsQuestion(text)'));
}

console.log('F17: a question in Punjabi is still a question');
{
  ok('Punjabi script is recognised', detectScript('ਮੈਨੂੰ ਦੱਸੋ ਮੈਂ ਇਸ ਮਹੀਨੇ ਟੈਕਸ ਵਾਸਤੇ ਕਿੰਨੇ ਪੈਸੇ ਰੱਖਾਂ?') === 'Punjabi');
  ok('Hindi is recognised', detectScript('मुझे बताओ') === 'Hindi');
  ok('Urdu or Arabic is recognised', detectScript('کتنا ٹیکس') === 'Urdu or Arabic');
  ok('plain English is not flagged at all', detectScript('what do i owe') === null);

  const apology = languageApology('Punjabi');
  // 🔴 IT APOLOGISES FOR THE LANGUAGE AND ANSWERS THE QUESTION. It never refuses the person.
  ok('the apology admits we cannot write it yet', /cannot write you a tax answer in it yet/.test(apology));
  ok('the apology refuses to guess in a language we cannot check', /not going to guess/.test(apology));
  ok('the apology promises the answer follows in English', /Here it is in English/.test(apology));
  ok('the apology never asks her to come back in English', !/ask me (again|something) in English/i.test(apology));
  ok('and never claims the question was off topic', !/not about your (UK )?tax/i.test(apology));
}

console.log('F16: the product can say hello');
{
  ok('a greeting is a greeting', isGreeting('hiya is this the flower shop thing? my mate set me up on it'));
  ok('"hello" is a greeting', isGreeting('hello'));
  ok('"morning" is a greeting', isGreeting('morning'));
  ok('a money entry is not a greeting', isGreeting('spent 40 on diesel') === false);

  ok('five tulips are not words', isNonWords('🌷🌷🌷🌷🌷'));
  ok('gibberish IS words, and is not swallowed as decoration', isNonWords('asdkjhasd kjahsdkja qwpoeiq') === false);

  // 🔴 THE QUESTION NOBODY ASKED. A message with no digit in it was never trying to log money.
  ok('"did my payment go through" is not an attempted entry', looksLikeMoneyEntry('did my payment go through') === false);
  ok('a greeting is not an attempted entry', looksLikeMoneyEntry('hello there') === false);
  ok('"spent 40 on diesel" IS an attempted entry', looksLikeMoneyEntry('spent 40 on diesel'));

  const rant = 'x'.repeat(400);
  ok('a long message with no question is a vent', isVent(rant));
  ok('a short message is not', isVent('the council took my bay') === false);
  ok('a long question is not a vent, it is a question', isVent(`${rant}?`) === false);
  ok('the vent reply is kind and logs nothing', /sorry/i.test(VENT_REPLY) && !/spent £40 on diesel/.test(VENT_REPLY));
  ok('the vent reply offers the one useful thing', /paperwork/.test(VENT_REPLY));

  ok('the greeting reply says what it does', /receipt/.test(greetingReply(null)));
  ok('the greeting reply uses the name when we have one', /Rosa's Stems/.test(greetingReply("Rosa's Stems")));

  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  ok('the floor exists at the end of the chain', /looksLikeMoneyEntry\(text\)/.test(wa));
  ok('a vent is caught before a greeting', before(wa, 'isVent(text)', 'isGreeting(text)'));
  ok('anything that is not an entry goes to the question lane, not the entry parser', before(wa, '!looksLikeMoneyEntry(text)', 'handleTextEntry(from, messageId, text)'));
}

console.log('');
console.log(`${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
