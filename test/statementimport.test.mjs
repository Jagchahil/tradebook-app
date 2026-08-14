// THE STATEMENT IMPORT. The bank feed by another door, while the feed has no provider.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE DEFENDS:
//
//   1. 🔴 DIRECTION IS NEVER GUESSED. For every bank with an explicit money in and money out
//      column pair, a figure in the out column must land negative HOWEVER it is signed, and a
//      figure in the in column must land positive. The sign of an amount is only consulted for
//      the banks whose format offers nothing else, and those are named.
//
//   2. 🔴 ONE ENGINE. These tests inject the REAL mapBankTransaction and the REAL
//      categoriseBankLine, the exact composition the route uses, so what is tested is what
//      runs. If the statement path ever grows its own normaliser these tests stop compiling
//      against it, which is the point.
//
//   3. 🔴 THE EXTERNAL ID DISCIPLINE. Stable across re uploads, distinct for identical lines
//      that are genuinely two purchases, unique within a file, and PRIVATE TO THE ACCOUNT,
//      because the database's unique index on external_id is global and a joint account
//      uploaded by both partners must not have the second partner's rows swallowed.
//
//   4. An unreadable file is refused out loud, with the banks we expected named, never
//      guessed at.
//
//   5. The route and the page: session only, gated, one insert path, nothing ever confirmed,
//      and the pile now shows every waiting capture channel, not only the bank.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Run: node test/statementimport.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import {
  parseStatement, parseCsv, parseMoney, readStatementDate, BANKS, UNRECOGNISED_LINE,
  bankNameFor, MAX_STATEMENT_LINES,
} from '../lib/statementimport.ts';
import { mapBankTransaction } from '../lib/bankfeed.ts';
import { categoriseBankLine } from '../lib/categories.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments argue at length about the things the code must not do, so they are stripped before
// any "the file never says X" assertion. Same helper as test/moneyweb.test.mjs.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// THE REAL ENGINE, INJECTED. The same line the route runs.
const OWNER = '9c1b2a3d-0000-4000-8000-00000000aaaa';
const map = (line) => mapBankTransaction(line, categoriseBankLine);
const parse = (text, owner = OWNER) => parseStatement(text, owner, map);

console.log('\nstatement import: eleven banks, one engine, and nobody to ask permission of');

// ---------------------------------------------------------------------------------------------
// 1. THE CSV GRAMMAR, ATTACKED ON ITS OWN.
// ---------------------------------------------------------------------------------------------
{
  ok('plain rows split on commas', JSON.stringify(parseCsv('a,b,c\n1,2,3')) === '[["a","b","c"],["1","2","3"]]');
  ok('a quoted field keeps its comma', parseCsv('a,"b,c",d')[0][1] === 'b,c');
  ok('a doubled quote is one quote', parseCsv('"say ""when""",x')[0][0] === 'say "when"');
  ok('a quoted field keeps a real newline', parseCsv('"line one\nline two",x')[0][0] === 'line one\nline two');
  ok('CRLF line ends are one line end', parseCsv('a,b\r\nc,d').length === 2);
  ok('a UTF-8 BOM is stripped', parseCsv('﻿Date,Amount')[0][0] === 'Date');
  ok('the last line needs no trailing newline', parseCsv('a,b\nc,d')[1][1] === 'd');
}

{
  ok('pounds with commas and a mark read clean', parseMoney('£1,234.56') === 1234.56);
  ok('brackets mean negative', parseMoney('(12.34)') === -12.34);
  ok('an explicit sign survives', parseMoney('-42.60') === -42.6);
  ok('an empty cell is null, never zero', parseMoney('') === null && parseMoney('   ') === null);
  ok('words are not money', parseMoney('abc') === null);

  ok('day first UK dates normalise', readStatementDate('14/07/2026', 'dmy') === '2026-07-14');
  ok('single digit day and month pad', readStatementDate('5/7/2026', 'dmy') === '2026-07-05');
  ok('worded dates normalise', readStatementDate('05 Apr 2026', 'dayMonthYear') === '2026-04-05');
  ok('ISO is accepted under every style', readStatementDate('2026-07-14 09:12:33', 'dmy') === '2026-07-14');
  ok('an impossible day is refused', readStatementDate('32/01/2026', 'dmy') === null);
  ok('garbage is refused', readStatementDate('yesterday', 'dmy') === null);
}

// ---------------------------------------------------------------------------------------------
// 2. 🔴 EVERY BANK: detection by header shape, direction from the documented column, the date
//    normalised, and the category from the REAL keyword map.
// ---------------------------------------------------------------------------------------------

// Monzo. Direction from the Money Out and Money In pair, never the signed Amount column.
const MONZO = [
  'Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In',
  'tx_0000AbCdEf,14/07/2026,09:12:33,Card payment,Screwfix,,Shopping,-42.60,GBP,-42.60,GBP,,High St,,SCREWFIX DIRECT LTD,,42.60,',
  'tx_0000AbCdEg,15/07/2026,17:03:10,Faster payment,Harding Builders,,Income,1450.00,GBP,1450.00,GBP,,,,HARDING BUILDERS LTD,,,1450.00',
  'tx_0000AbCdEh,16/07/2026,08:00:00,Card payment,Shell,,Transport,-13.20,GBP,-13.20,GBP,,,,SHELL FILLING STATION,,-13.20,',
].join('\n');
{
  const r = parse(MONZO);
  ok('Monzo is detected by its header', r.ok && r.bank === 'Monzo');
  ok('Monzo reads all three rows', r.ok && r.entries.length === 3);
  ok('🔴 Monzo: a figure in Money Out lands negative', r.ok && r.entries[0].amount === -42.6);
  ok('🔴 Monzo: a figure in Money In lands positive', r.ok && r.entries[1].amount === 1450);
  ok('🔴 Monzo: Money Out written negative STILL lands negative, abs then the column decides',
    r.ok && r.entries[2].amount === -13.2);
  ok('Monzo dates normalise to ISO', r.ok && r.entries[0].transaction_date === '2026-07-14');
  ok('Monzo: the real keyword map categorises Screwfix as materials', r.ok && r.entries[0].category === 'materials');
  ok('Monzo: money in is income, decided by the one engine', r.ok && r.entries[1].category === 'income');
  ok('Monzo vendor comes from the Name column', r.ok && r.entries[0].vendor === 'Screwfix');
}

// Starling. Signed Amount (GBP): the format has no direction column.
const STARLING = [
  'Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP)',
  '14/07/2026,Screwfix,SCREWFIX 1234 LEEDS,CONTACTLESS,-84.30,1200.50',
  '15/07/2026,M Okafor,REWIRE FIRST FLOOR,FASTER PAYMENT,980.00,2180.50',
].join('\n');
{
  const r = parse(STARLING);
  ok('Starling is detected', r.ok && r.bank === 'Starling');
  ok('Starling: negative amount is money out (sign is all the format offers)', r.ok && r.entries[0].amount === -84.3);
  ok('Starling: positive amount is money in', r.ok && r.entries[1].amount === 980);
  ok('Starling vendor comes from Counter Party', r.ok && r.entries[0].vendor === 'Screwfix');
}

// Barclays. Signed Amount: the format has no direction column.
const BARCLAYS = [
  'Number,Date,Account,Amount,Subcategory,Memo',
  '1,14/07/2026,20-00-00 12345678,-62.15,Payment,SHELL FILLING STATION',
  '2,15/07/2026,20-00-00 12345678,640.00,Deposit,J WHITAKER EV CHARGER',
].join('\n');
{
  const r = parse(BARCLAYS);
  ok('Barclays is detected', r.ok && r.bank === 'Barclays');
  ok('Barclays: sign gives direction, out is negative', r.ok && r.entries[0].amount === -62.15);
  ok('Barclays: Shell lands as fuel through the real map', r.ok && r.entries[0].category === 'fuel');
  ok('Barclays: money in is income', r.ok && r.entries[1].category === 'income');
}

// Lloyds. Direction from the Debit Amount and Credit Amount pair.
const LLOYDS = [
  'Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance',
  '14/07/2026,DEB,30-93-71,12345678,TOOLSTATION LEEDS,74.25,,900.00',
  '15/07/2026,FPI,30-93-71,12345678,RAVENSWORTH LTD,,2100.00,3000.00',
  '16/07/2026,DEB,30-93-71,12345678,BOTH FILLED SOMEHOW,10.00,10.00,3000.00',
  '17/07/2026,DEB,30-93-71,12345678,NEITHER FILLED,,,3000.00',
].join('\n');
{
  const r = parse(LLOYDS);
  ok('Lloyds is detected', r.ok && r.bank === 'Lloyds');
  ok('🔴 Lloyds: a figure in Debit Amount lands negative', r.ok && r.entries[0].amount === -74.25);
  ok('🔴 Lloyds: a figure in Credit Amount lands positive', r.ok && r.entries[1].amount === 2100);
  ok('🔴 Lloyds: both columns filled is refused rather than guessed', r.ok && r.entries.length === 2);
  ok('Lloyds: the two unusable lines are counted as skipped, honestly', r.ok && r.skipped === 2);
}

// NatWest. Signed Value: the format has no direction column. The description is quoted and
// holds a comma, which is exactly what the hand rolled CSV parser exists to survive.
const NATWEST = [
  'Date,Type,Description,Value,Balance,Account Name,Account Number',
  '14/07/2026,POS,"CITY ELECTRICAL FACTORS, LEEDS",-128.90,1000.00,"MR J CHAHIL",12345678',
  '15/07/2026,BAC,OKAFOR M RE REWIRE,640.00,1640.00,"MR J CHAHIL",12345678',
].join('\n');
{
  const r = parse(NATWEST);
  ok('NatWest is detected', r.ok && r.bank === 'NatWest');
  ok('NatWest: the quoted comma survives into the description',
    r.ok && r.entries[0].description === 'CITY ELECTRICAL FACTORS, LEEDS POS');
  ok('NatWest: sign gives direction', r.ok && r.entries[0].amount === -128.9 && r.entries[1].amount === 640);
  ok('NatWest: City Electrical lands as materials through the real map', r.ok && r.entries[0].category === 'materials');
}

// HSBC. Three bare columns, signed Amount, checked LAST so it cannot claim richer exports.
const HSBC = [
  'Date,Description,Amount',
  '14/07/2026,SCREWFIX DIRECT,-42.60',
  '15/07/2026,CLIENT PAYMENT,500.00',
].join('\n');
{
  const r = parse(HSBC);
  ok('HSBC is detected', r.ok && r.bank === 'HSBC');
  ok('HSBC: sign gives direction', r.ok && r.entries[0].amount === -42.6 && r.entries[1].amount === 500);
  ok('HSBC is the LAST format in the list, so the generic shape cannot shadow a specific one',
    BANKS[BANKS.length - 1].code === 'hsbc');
}

// Santander. Signed Amount: the format has no direction column.
const SANTANDER = [
  'Date,Description,Amount,Balance',
  '14/07/2026,CARD PAYMENT TO TOOLSTATION,-74.25,500.00',
  '15/07/2026,FASTER PAYMENTS RECEIPT,980.00,1480.25',
].join('\n');
{
  const r = parse(SANTANDER);
  ok('Santander is detected, not read as HSBC, because Balance narrows it', r.ok && r.bank === 'Santander');
  ok('Santander: sign gives direction', r.ok && r.entries[0].amount === -74.25 && r.entries[1].amount === 980);
}

// Nationwide. Direction from the Paid Out and Paid In pair, worded dates, pound marks in the
// cells, and a preamble above the header, all real habits of theirs.
const NATIONWIDE = [
  '"Account Name:","Mr J Chahil"',
  '"Account Balance:","£1,326.01"',
  'Date,Transaction type,Description,Paid out,Paid in,Balance',
  '14 Jul 2026,Visa purchase,B&Q WAREHOUSE,£23.99,,£976.01',
  '15 Jul 2026,Bank credit,J SMITH PAYMENT,,£350.00,£1326.01',
].join('\n');
{
  const r = parse(NATIONWIDE);
  ok('Nationwide is detected below its preamble lines', r.ok && r.bank === 'Nationwide');
  ok('🔴 Nationwide: a figure in Paid out lands negative, pound mark and all', r.ok && r.entries[0].amount === -23.99);
  ok('🔴 Nationwide: a figure in Paid in lands positive', r.ok && r.entries[1].amount === 350);
  ok('Nationwide: the worded date normalises', r.ok && r.entries[0].transaction_date === '2026-07-14');
  ok('Nationwide: B&Q lands as materials through the real map', r.ok && r.entries[0].category === 'materials');
}

// Revolut. Signed Amount (the Type column names the product, not the direction), a currency
// column held to GBP by the one engine, and pending rows left alone.
const REVOLUT = [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'CARD_PAYMENT,Current,2026-07-14 09:12:33,2026-07-14 10:00:00,Screwfix,-42.60,0.00,GBP,COMPLETED,857.40',
  'TOPUP,Current,2026-07-15 08:00:00,2026-07-15 08:00:05,Payment from client,500.00,0.00,GBP,COMPLETED,1357.40',
  'CARD_PAYMENT,Current,2026-07-16 12:00:00,2026-07-16 12:30:00,Cafe Podgorica,-8.40,0.00,EUR,COMPLETED,1349.00',
  'CARD_PAYMENT,Current,2026-07-17 12:00:00,,Pending thing,-10.00,0.00,GBP,PENDING,1339.00',
].join('\n');
{
  const r = parse(REVOLUT);
  ok('Revolut is detected', r.ok && r.bank === 'Revolut');
  ok('Revolut reads the two settled GBP rows', r.ok && r.entries.length === 2);
  ok('🔴 Revolut: the EUR row is refused by the one engine, not converted', r.ok && r.entries.every((e) => e.description !== 'Cafe Podgorica'));
  ok('🔴 Revolut: a PENDING row is left alone, it would double with its settled twin', r.ok && r.entries.every((e) => e.description !== 'Pending thing'));
  ok('Revolut: the two refusals are counted as skipped', r.ok && r.skipped === 2);
  ok('Revolut: sign gives direction', r.ok && r.entries[0].amount === -42.6 && r.entries[1].amount === 500);
}

// Tide. Direction from the Paid In and Paid Out pair, and the bank's own transaction id.
const TIDE = [
  'Date,Transaction ID,Description,Paid In,Paid Out',
  '14/07/2026,td-9001,SCREWFIX TRADE,,42.60',
  '15/07/2026,td-9002,INVOICE 1042 PAYMENT,1200.00,',
].join('\n');
{
  const r = parse(TIDE);
  ok('Tide is detected', r.ok && r.bank === 'Tide');
  ok('🔴 Tide: a figure in Paid Out lands negative', r.ok && r.entries[0].amount === -42.6);
  ok('🔴 Tide: a figure in Paid In lands positive', r.ok && r.entries[1].amount === 1200);
}

// Mettle. Signed Amount: the format has no direction column.
const METTLE = [
  'Date,Time,Type,Description,Amount,Balance',
  '14/07/2026,09:12,Card,TOOLSTATION LEEDS,-74.25,100.00',
  '15/07/2026,10:00,Payment,J WHITAKER,640.00,740.00',
].join('\n');
{
  const r = parse(METTLE);
  ok('Mettle is detected, and its Balance column does not make it Santander', r.ok && r.bank === 'Mettle');
  ok('Mettle: sign gives direction', r.ok && r.entries[0].amount === -74.25 && r.entries[1].amount === 640);
}

// ---------------------------------------------------------------------------------------------
// 3. 🔴 THE EXTERNAL ID DISCIPLINE.
// ---------------------------------------------------------------------------------------------
{
  const a = parse(MONZO);
  const b = parse(MONZO);
  ok('🔴 the same file re uploaded derives the same ids, so nothing can double',
    a.ok && b.ok && JSON.stringify(a.entries.map((e) => e.external_id)) === JSON.stringify(b.entries.map((e) => e.external_id)));

  const other = parse(MONZO, '9c1b2a3d-0000-4000-8000-00000000bbbb');
  ok('🔴 THE TENANCY RULE: the same statement under another account derives entirely different ids, because the unique index on external_id is global and a joint account must never leak between its holders',
    a.ok && other.ok && a.entries.every((e, i) => e.external_id !== other.entries[i].external_id));

  ok('every id carries the statement prefix inside the bank namespace',
    a.ok && a.entries.every((e) => e.external_id.startsWith('bank:stmt:')));
  ok('every id fits the column', a.ok && a.entries.every((e) => e.external_id.length <= 180));
  ok('ids are unique within a file', a.ok && new Set(a.entries.map((e) => e.external_id)).size === a.entries.length);
}

{
  // Two identical coffees on the same day are TWO purchases. Collapsing them would delete a
  // real cost from a man's books, so they get distinct, deterministic ids instead.
  const twoCoffees = [
    'Date,Description,Amount',
    '14/07/2026,GREGGS LEEDS,-3.20',
    '14/07/2026,GREGGS LEEDS,-3.20',
  ].join('\n');
  const r1 = parse(twoCoffees);
  const r2 = parse(twoCoffees);
  ok('🔴 two identical lines are two transactions with two different ids',
    r1.ok && r1.entries.length === 2 && r1.entries[0].external_id !== r1.entries[1].external_id);
  ok('and both ids are stable across a re upload',
    r1.ok && r2.ok
    && r1.entries[0].external_id === r2.entries[0].external_id
    && r1.entries[1].external_id === r2.entries[1].external_id);
}

{
  // A repeated bank issued transaction id is the bank saying "same transaction". One row, ever.
  const tideDupe = [
    'Date,Transaction ID,Description,Paid In,Paid Out',
    '14/07/2026,td-9001,SCREWFIX TRADE,,42.60',
    '14/07/2026,td-9001,SCREWFIX TRADE,,42.60',
  ].join('\n');
  const r = parse(tideDupe);
  ok('🔴 a repeated bank transaction id within one file lands once', r.ok && r.entries.length === 1);
  ok('and the drop is counted, not hidden', r.ok && r.duplicatesInFile === 1);
}

// ---------------------------------------------------------------------------------------------
// 4. HONEST REFUSALS.
// ---------------------------------------------------------------------------------------------
{
  const r = parse('hello there\n1,2,3\nthis is not a statement');
  ok('an unrecognised file is refused, never guessed at', !r.ok && r.reason === 'unrecognised');
  ok('and the refusal names every bank we expected',
    !r.ok && ['Monzo', 'Starling', 'Barclays', 'Lloyds', 'NatWest', 'HSBC', 'Santander', 'Nationwide', 'Revolut', 'Tide', 'Mettle']
      .every((b) => r.message.includes(b)));
  ok('the refusal is the ONE sentence the page also prints', !r.ok && r.message === UNRECOGNISED_LINE);

  const empty = parse('   \n  ');
  ok('an empty file says so plainly', !empty.ok && empty.reason === 'empty');

  const headerOnly = parse('Date,Description,Amount\nnot-a-date,words,also-words');
  ok('a recognised bank with no readable money is refused, not saved as nothing', !headerOnly.ok && headerOnly.reason === 'no_rows');

  const rows = ['Date,Description,Amount'];
  for (let i = 0; i <= MAX_STATEMENT_LINES; i++) rows.push(`14/07/2026,LINE ${i},-1.00`);
  const huge = parse(rows.join('\n'));
  ok('a file past the line cap is refused with advice, not half imported', !huge.ok && huge.reason === 'too_many');

  ok('bank codes turn back into names for the result screen', bankNameFor('monzo') === 'Monzo');
  ok('and an invented code turns into nothing, never printed', bankNameFor('<script>') === null);
}

// ---------------------------------------------------------------------------------------------
// 5. THE MODULE ITSELF: no AI, no network, no sibling imports Node cannot strip.
// ---------------------------------------------------------------------------------------------
{
  const lib = read('lib/statementimport.ts');
  const code = codeOnly(lib);
  ok('🔴 NO AI ANYWHERE IN IT: the importer never touches lib/claude or a model', !/claude|anthropic/i.test(code));
  ok('🔴 no network and no database: pure functions the route composes', !/\bfetch\s*\(|rest\/v1/.test(code));
  const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
  ok('its only import is node:crypto, so the test runner can load it directly',
    imports.length === 1 && imports[0] === 'node:crypto');
  ok('the provider history is written into the header', /TrueLayer declined/.test(lib) && /GoCardless/.test(lib));
}

// ---------------------------------------------------------------------------------------------
// 6. THE ROUTE, AND THE WALK IT CALLS. Session only, gated, one insert path, and nothing is
// ever confirmed. The walk itself (parse, enrich, split, insert, count) moved whole into
// lib/statementingest.ts on 12 August 2026, when the one upload door became its second caller,
// so the pipeline assertions below read the WALK and the door assertions read the ROUTE.
// ---------------------------------------------------------------------------------------------
const route = read('app/api/money/import/route.ts');
const walk = read('lib/statementingest.ts');
const G = await import(pathToFileURL(path.join(root, 'lib/gate.ts')).href);
{
  ok('the route takes the account from the session', /sessionUser\(req\)/.test(route));
  ok('🔴 AND NEVER FROM THE REQUEST', !/body\.user|f\.get\(\s*['"]user/i.test(codeOnly(route)));
  ok('🔴 the rows are written for the session user through the one bulk path',
    /await ingestStatementCsv\(\{ userId: user\.id, text \}\)/.test(route)
    && /insertBankTransactions\(userId, fresh\)/.test(walk));
  ok('🔴 the route writes through lib/supabase.ts and nothing else',
    !/\bfetch\s*\(|rest\/v1/.test(codeOnly(route)) && !/\bfetch\s*\(|rest\/v1/.test(codeOnly(walk)));
  ok('🔴 THE ONE ENGINE IS INJECTED: the real mapper with the real keyword map',
    /parseStatement\(text, userId, \(line\) => mapBankTransaction\(line, categoriseBankLine\)\)/.test(walk));
  ok('🔴 NOTHING IN THE ROUTE EVER CONFIRMS A ROW', !/confirmed:\s*true/.test(codeOnly(route)) && !/confirmed:\s*true/.test(codeOnly(walk)));
  ok('🔴 and the sync\'s auto file is deliberately not imported: a statement lands months in one press', !/shouldAutoFile/.test(route) && !/shouldAutoFile/.test(walk));
  // ⚠️ LOOSENED 2 AUGUST 2026. This pinned the exact argument list, so adding the AMOUNT as a
  // fourth argument broke it while the property it is named for stayed true. The property is that
  // the check runs per line and the flag lands on the row.
  ok('the personal check runs on every line so the flag lands ON the row',
    /looksPersonal\(entry\.vendor, entry\.description, ownNames/.test(walk)
    && /entry\.looks_personal = true/.test(walk));
  // 🔴 AND THE DIRECTION GOES WITH IT. Without the amount, PERSON_NAME fires on a CREDIT, and a
  // person paying money into a trading account is a customer. Walking a real statement on
  // 2 August 2026 put three of an electrician's domestic customers in the careful pile, where the
  // only button is "not business money" and the SQL refuses a flagged row, so £3,050 of real
  // income could not be recorded by any route. See the block above looksPersonal in lib/personal.ts.
  ok('🔴 AND THE AMOUNT TRAVELS WITH IT, so a customer paying in is not read as a transfer',
    /looksPersonal\(entry\.vendor, entry\.description, ownNames, entry\.amount\)/.test(walk));
  ok('his taught vendors arrive as suggestions through the same recall the sync uses', /recall\(entry\.vendor, rules, patterns\)/.test(walk));
  ok('there is a size ceiling', /MAX_BYTES/.test(route) && /part\.size > MAX_BYTES/.test(route));
  ok('and a type check that falls back to the filename, because browsers disagree about CSV',
    /CSV_TYPES/.test(route) && /endsWith\('\.csv'\)/.test(route));
  ok('a form caller gets a 303, never JSON', /NextResponse\.redirect\([\s\S]{0,160}?,\s*303\)/.test(route) && !/,\s*302\)/.test(route));
  ok('a failed write is refused out loud, not reported as already known', /problem=unavailable/.test(route));
  ok('a re upload is asked of the database before writing, so the counts are facts', /knownExternalIds\(userId/.test(walk));
  ok('🔴 app/api/money/import has a gate decision and it is entitled', G.ruleFor('app/api/money/import') === 'entitled');
  ok('and the route actually consults the gate', /gateForUser/.test(route));
  ok('the route is rate limited', /rateLimitedShared\(`stmtimport:/.test(route));
}

// ---------------------------------------------------------------------------------------------
// 7. THE PAGE AND THE NAV.
// ---------------------------------------------------------------------------------------------
{
  const page = read('app/app/money/import/page.tsx');
  ok('the page posts a plain multipart form to the route',
    /action="\/api\/money\/import" method="post" encType="multipart\/form-data"/.test(page));
  ok('with a plain file input and no client script',
    /type="file" accept="\.csv,text\/csv" required/.test(page)
    && !/'use client'|onClick|onChange|useState|<script/.test(page));
  ok('the page says every row waits for his yes', /waiting for your yes/.test(page));
  ok('the result screen speaks in counts taken as integers, never echoed strings', /Number\.isInteger\(n\)/.test(page));
  ok('🔴 the bank name is looked up from the fixed list, never printed out of the query string', /bankNameFor\(one\('bank'\)/.test(page));
  ok('the unrecognised refusal is the ONE sentence from the lib', /UNRECOGNISED_LINE/.test(page));
  ok('a locked account sees the read only banner', /READONLY_TITLE/.test(page));
  // The one upload door superseded this page in the shell on 12 August 2026, so the page
  // lights the Money tab rather than naming a route the shell no longer lists.
  ok('the page carries the shell and lights Money', /<AppNav current="\/app\/money" \/>/.test(page));

  const nav = read('app/app/AppNav.tsx');
  const sections = nav.slice(nav.indexOf('export const SECTIONS'), nav.indexOf('export function AppNav'));
  ok('the nav offers the upload door under Money, which is where statements go now', /href: '\/app\/money\/upload'/.test(sections));
}

// ---------------------------------------------------------------------------------------------
// 8. 🔴 THE PILE NOW SHOWS EVERY WAITING CAPTURE, NOT ONLY THE BANK.
// ---------------------------------------------------------------------------------------------
{
  const supa = read('lib/supabase.ts');
  ok('🔴 pileEntries reads bank rows AND web receipts AND the three WhatsApp captures',
    /source_type=in\.\(bank_feed,web_image,whatsapp_image,whatsapp_voice,whatsapp_text\)/.test(supa));
  ok('🔴 and the structured WhatsApp claims stay out: their categories are engine owned and the pile\'s picker cannot represent them',
    !/source_type=in\.[^)]*whatsapp_mileage/.test(supa));
  const pileFn = supa.slice(supa.indexOf('export async function pileEntries'), supa.indexOf('export async function confirmPile'));
  ok('the pile still holds the two guards: unconfirmed and not already excluded',
    /confirmed=eq\.false/.test(pileFn) && /is_personal=eq\.false/.test(pileFn));
  ok('the widening decision is argued in the comment, callers named',
    /EVERY CALLER WAS READ BEFORE WIDENING/.test(supa));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
