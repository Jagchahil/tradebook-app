// 🔴 £420 OF A CUSTOMER'S INCOME WAS INVISIBLE, AND IT WAS INVISIBLE ON PURPOSE.
//
//   node test/wave9_income.test.mjs
//
// Found on 31 July 2026 by importing a real bank statement on the live site. Six rows landed. Four
// costs queued correctly. The two payments IN were read correctly, kept out of the expense queue
// correctly, and then described as: "2 of them are money in rather than money out. Those are kept
// separate and are not waiting on you here."
//
// They were not waiting on him anywhere else either. /app/money lists only what he has confirmed.
// The Overview counted four things, not six. No screen in the product listed unconfirmed income.
//
// ⚠️ IT WAS A DELIBERATE DEFERRAL WHOSE OTHER HALF WAS NEVER BUILT. The pile page said so itself:
// confirm_pile refuses a credit outright, so listing rows he cannot act on "would fail doc 103's
// empty test on every visit". Right about the screen, wrong about the money. A row he cannot act on
// ANYWHERE is not a tidy screen, it is income that never reaches his tax figures, and understating
// income is the one direction of error this product must never make easy.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// Staged rather than imported directly, because lib/reviewpile.ts imports lib/personal.ts and bare
// Node under type stripping cannot resolve an extensionless relative import. Same approach as
// test/reviewpile.test.mjs, which explains it at length.
const lib = path.join(root, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'wave9income-'));
writeFileSync(path.join(stage, 'personal.ts'), read('lib/personal.ts'));
writeFileSync(
  path.join(stage, 'reviewpile.ts'),
  read('lib/reviewpile.ts').replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'"),
);
void lib;
const R = await import(pathToFileURL(path.join(stage, 'reviewpile.ts')).href);
const { buildPile, partitionPile, waitingCount, summarisePile } = R;

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nmoney in: the door that did not exist');

const norm = (v) => String(v || '').trim().toLowerCase();
const cat = () => null;

// The exact statement that found this, from tradesman/_to_delete/lekhio_test_statement.csv.
const rows = [
  { id: 'a1', vendor: 'Screwfix',    amount: -46.20, looks_personal: false },
  { id: 'a2', vendor: 'J Henderson', amount: 180.00, looks_personal: false },
  { id: 'a3', vendor: 'Shell',       amount: -52.30, looks_personal: false },
  { id: 'a4', vendor: 'B&Q',         amount: -89.99, looks_personal: false },
  { id: 'a5', vendor: 'S Whitmore',  amount: 240.00, looks_personal: false },
  { id: 'a6', vendor: 'Greggs',      amount: -4.85,  looks_personal: false },
];

const groups = buildPile(rows, norm, [], cat);
const part = partitionPile(groups, 'mixed');

// ---------------------------------------------------------------------------------------------
// 1. THE SHAPE OF THE PILE THAT FOUND IT.
// ---------------------------------------------------------------------------------------------
{
  ok('six rows in, and the two payments in are their own bucket',
    summarisePile(groups).entries === 6 && part.income.length === 2);
  ok('and they are the two that were actually money in',
    part.income.map((g) => g.vendor).sort().join(',') === 'J Henderson,S Whitmore');
  ok('the four costs are still the spending question',
    part.known.length + part.unknown.length + part.careful.length === 4);
  ok('🔴 and money in is STILL never in the bulk confirm plan. That rule does not change.',
    R.bulkConfirmPlan(groups, 'mixed').every((p) => !['J Henderson', 'S Whitmore'].includes(p.vendor)));
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE COUNT. Three screens worked this out for themselves and all three were wrong.
// ---------------------------------------------------------------------------------------------
{
  ok('🔴 waitingCount COUNTS THE MONEY IN. Six rows, four spending questions, two payers: six.',
    waitingCount(part) === 6);
  ok('the old arithmetic, kept here as the thing that was wrong, gives four',
    part.known.length + part.unknown.length + part.careful.length === 4);

  // The count now lives in the module, so the three screens cannot drift apart again.
  for (const f of ['app/app/page.tsx', 'app/app/money/page.tsx', 'app/app/pile/page.tsx']) {
    const src = read(f);
    ok(`${f} asks the module for the count`, /waitingCount\(/.test(src));
    ok(`${f} does not work it out for itself`,
      !/known\.length \+ unknown\.length \+ careful\.length/.test(src));
  }
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE DOOR ITSELF. A section on the page, a verdict on the route, a guard in the database.
// ---------------------------------------------------------------------------------------------
{
  const pile = read('app/app/pile/page.tsx');
  ok('🔴 the pile RENDERS the income groups rather than counting them in a sentence',
    /income\.map\(\(g\) =>/.test(pile));
  ok('and it no longer tells him they are not waiting on him',
    !pile.includes('are not waiting on you here'));
  ok('the confirming button is the plain one, because money in is his unless he says otherwise',
    /Yes, \{g\.count === 1 \? 'this is' : 'these are'\} money in/.test(pile));
  ok('striking it out is still possible, and it is the quiet one',
    /value="personal"[\s\S]{0,400}?Not business money/.test(pile.slice(pile.indexOf('income.map'))));
  ok('the rent door is drawn only for an account with a rental stream',
    /\{rental && \(/.test(pile) && /accountHasRental\(user\.id\)/.test(pile));

  const route = read('app/api/pile/route.ts');
  ok('the route has its own verdict for money in', /verdict === 'income'/.test(route));
  ok("🔴 THE CATEGORY NEVER COMES FROM THE BROWSER: it is 'rent' or it is 'income'",
    /=== 'rent' \? 'rent' : 'income'/.test(route));
  ok('it goes through confirmIncome, never confirmPile', /confirmIncome\(user\.id, ids, kind\)/.test(route));
  ok('no vendor rule is learned from a payer, because a customer paying him is not a rule',
    !/verdict === 'income'[\s\S]{0,900}?learnVendor/.test(route));
  ok('and it reports honestly when the guard files fewer than were asked',
    /applied < ids\.length\) return backToPile\(req, 'partial'/.test(route));

  const sb = read('lib/supabase.ts');
  ok('confirmIncome takes only the two kinds', /kind: 'income' \| 'rent'/.test(sb));
  ok('and a failed call is 0, never a silent success', /if \(!res\.ok\) return 0;/.test(sb));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE DATABASE GUARD, the mirror of confirm_pile's.
// ---------------------------------------------------------------------------------------------
{
  const sql = read('supabase/APPLY_2026-07-31_confirm_income.sql');
  ok('🔴 MONEY IN ONLY. It can never touch a cost.', /and t\.amount > 0/.test(sql));
  ok('🔴 and it refuses a flagged row, exactly as confirm_pile does',
    /and t\.looks_personal = false/.test(sql));
  ok('his rows only, whatever he posts', /and t\.user_id = p_user/.test(sql));
  ok('never one that is already confirmed', /and t\.confirmed = false/.test(sql));
  ok("🔴 the category is an ALLOWLIST of two words, not a length check",
    /not in \('income', 'rent'\)/.test(sql));
  ok('rent, and only rent, carries the property stream',
    /case when v_cat = 'rent' then 'property' else t\.income_type end/.test(sql));
  ok('it is service role only, like every other security definer function here',
    /revoke all on function public\.confirm_income/.test(sql) && /grant execute on function public\.confirm_income/.test(sql));

  // The rule it does NOT weaken.
  const old = read('supabase/review_pile.sql');
  ok('⚠️ AND confirm_pile STILL REFUSES A CREDIT. This did not loosen that.',
    /and t\.amount < 0/.test(old));
}

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE BANK FEED SENTENCE ON THE SCREEN HE READS MOST.
// ---------------------------------------------------------------------------------------------
{
  const dash = read('app/app/page.tsx');
  ok('🔴 the footer no longer branches on the pile being non empty and calls that a bank check',
    !/\{waiting > 0\n\s*\? 'Everything above is money you have confirmed\. New spending lands in your bank feed/.test(dash));
  ok('every "your bank feed" on the Overview sits inside the switch',
    dash.split('your bank feed').slice(0, -1).every((chunk) => chunk.slice(-300).includes('bankFeedOffered()')));

  const sweep = read('test/frontdoor.test.mjs');
  ok('🔴 and the sweep now catches the possessive, which is what the missed line used',
    /your bank feed\)\/g/.test(sweep));
  ok('but not the bare noun, because "the bank feed is on its way" is TRUE with the switch off',
    !/\|bank feed\)\/g/.test(sweep));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
