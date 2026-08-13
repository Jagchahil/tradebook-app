// WHAT A MAN SEES ON THE DAY HE JOINS, WHEN HE HAS TOLD US NOTHING YET.
//
//   node test/dayone.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT CLASS: EVERY TEST IN THIS REPO SEEDS DATA, SO NOBODY EVER SAW THE FIRST SCREEN.
//
// 15,445 assertions across 200 suites, and not one of them opened an account with nothing in it.
// Every fixture starts with transactions. So a whole family of defects lived in the one state
// that 100% of customers are in on day one, and every single one of them was found by reading
// rather than by anything going red.
//
// What was actually there on the evening before launch:
//
//   /app              "£0 in, £0 out. That leaves £0. All logged. Nothing new needs your
//                     attention this week." Told to a man who has logged nothing. WhatsApp and the
//                     trial email both refuse that sentence and are tested for refusing it. The
//                     most looked at screen in the product printed it, because it built its own.
//   /app              "Your business this year: In £0, Out £0, Profit £0", directly under a tax
//                     card deliberately withheld to avoid exactly that.
//   /app/tax/summary  "Your income since 6 April is £0, which is under the £50,000 line", one card
//                     below "Nothing confirmed since 6 April yet".
//   /app/tax/vehicle  "About £0 is genuinely free once your tax is put by, and you are looking at
//                     £40,000. That is £40,000 short."
//   /share/[token]    A lender facing sheet reading Income £0.00, Profit £0.00, Entries 0, under
//                     "Every figure below was reviewed and confirmed by the person who shared it".
//                     Its sibling /app/proof-of-income has refused to draw that since it was
//                     written, in as many words.
//   /app/you/elections  A primary button offering to give up his costs for the year, to beat a
//                     figure that is zero because he has not started.
//
// 🔴 AND UNDER ALL OF THEM, THE ONE THAT MATTERED MOST: THE CONFIDENCE GATE WAS MEASURED FROM
// 6 APRIL RATHER THAN FROM THE DATA.
//
// Launching in August means a brand new account reads "125 days elapsed, 4 months in" before its
// first entry, so every guard built to stop a confident number coming out of thin data was already
// open. One £300 job became a £876 projection for the year (15x under his real rate), the ledger
// unlocked "Lekhio has kept £X out of the taxman's hands", /app/pay-yourself started telling him
// what to draw, and ways-to-save started advising off a figure invented from one day.
//
// ⚠️ THIS FILE IS THE ONLY THING IN THE SUITE THAT RUNS THE ENGINE WITH AN EMPTY BOOK. Adding a
// screen without adding it here puts the class straight back, because nothing else will look.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

const stage = mkdtempSync(path.join(tmpdir(), 'lekhio-dayone-'));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  const src = readFileSync(path.join(root, 'lib', f), 'utf8');
  writeFileSync(
    path.join(stage, f),
    src.replace(/from '(\.\/[^']+?)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`)),
  );
}
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'stub-service-key';

const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);
const ENGINE = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

const USER = '11111111-2222-3333-4444-555555555555';

// A transport that answers the reads getOptimiserInput makes, with whatever rows the case wants.
async function optimiserWith(rows) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const body = u.includes('/rest/v1/transactions') && u.includes('capital_kind=not.is.null') ? []
      : u.includes('/rest/v1/transactions') ? rows
        : [];
    return new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try { return await SB.getOptimiserInput(USER); } finally { globalThis.fetch = real; }
}

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return iso(d); };

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe window we project over is the elapsed YEAR. The evidence is a separate gate.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  // A man who joined this week and logged one job two days ago.
  const fresh = await optimiserWith([
    { amount: 300, category: 'income', vendor: 'job', transaction_date: daysAgo(2), cis_deduction: null, income_type: 'trade', capital_kind: null, business_use_pct: null },
  ]);
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 REVERSED IN RUN 3, 13 AUGUST 2026, AND THE OUTCOME THIS SUITE PROTECTS IS UNCHANGED.
  //
  // This block used to assert that daysElapsed ITSELF was the narrow window: a two day old book
  // was a two day year. That is a coherent position and it is the one that shipped, and it is only
  // safe at the extreme end, where the confidence gate catches it. In the middle it inflates
  // silently. Marcus Whitfield was trading from 6 April and his first bank row landed on 24 April.
  // 111 days of money went into a 111 day year on 13 August, his set aside came out 17 percent
  // high, and the "ways to save" panel told a basic rate man he was £52,472 into the 40 percent
  // band and should put £52,472 into a pension.
  //
  // The numerator is labelled "since 6 April" on the card. The denominator has to be too.
  //
  // ⚠️ SO THE TWO IDEAS ARE NOW TWO FIELDS, and every assertion below this one still passes
  // untouched: the factor is still exactly 1, his money is still counted in full, a backfilled
  // book still gets the wide window, a future dated row still cannot shrink anything. What moved
  // is WHICH FIELD carries the narrowness, not what a thin book is allowed to do.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  ok('🔴 A TWO DAY OLD BOOK IS TWO DAYS OF EVIDENCE, and the tax year is still the tax year',
    fresh.observedDays <= 3 && fresh.daysElapsed > fresh.observedDays);
  ok('🔴 SO THE CONFIDENCE GATE IS SHUT, which is the whole point of it existing',
    ENGINE.projectionFactor(fresh).canProject === false);
  ok('🔴 AND IT IS THE EVIDENCE THAT SHUTS IT, not a year that pretends to be two days long',
    ENGINE.projectionFactor({ ...fresh, observedDays: 200 }).canProject === true);
  ok('and the factor is exactly 1, so nothing is multiplied up',
    ENGINE.projectionFactor(fresh).factor === 1);
  ok('his money is still counted in full, because the window governs the RATE and not the total',
    fresh.ytdTradeIncome === 300);
}
{
  // The same man, having imported his statements back to the start of the tax year.
  // ⚠️ THIS IS WHY THE WINDOW IS THE EARLIEST ROW AND NOT users.created_at. His figures DO cover
  // the year, so a window measured from the day he signed up would over project him just as badly
  // in the other direction, and statement import exists precisely so he can do this.
  const backfilled = await optimiserWith([
    { amount: 4000, category: 'income', vendor: 'april job', transaction_date: '2026-04-10', cis_deduction: null, income_type: 'trade', capital_kind: null, business_use_pct: null },
    { amount: 300, category: 'income', vendor: 'job', transaction_date: daysAgo(2), cis_deduction: null, income_type: 'trade', capital_kind: null, business_use_pct: null },
  ]);
  ok('🔴 A BACKFILLED BOOK GETS THE WIDE WINDOW BACK, because the evidence really does cover it',
    backfilled.daysElapsed > 100);
  ok('and projects normally, so nothing changes for an established account',
    ENGINE.projectionFactor(backfilled).canProject === true);
}
{
  // ⚠️ A DATE IN THE FUTURE MUST NOT SHRINK THE WINDOW TO NOTHING. A mistyped year on one row would
  // otherwise switch a real customer's projection off with no explanation anywhere.
  const future = await optimiserWith([
    { amount: 500, category: 'income', vendor: 'typo', transaction_date: '2027-01-01', cis_deduction: null, income_type: 'trade', capital_kind: null, business_use_pct: null },
    { amount: 4000, category: 'income', vendor: 'april', transaction_date: '2026-04-10', cis_deduction: null, income_type: 'trade', capital_kind: null, business_use_pct: null },
  ]);
  ok('🔴 A FUTURE DATED ROW CANNOT SHRINK THE WINDOW', future.daysElapsed > 100);
}
{
  const empty = await optimiserWith([]);
  ok('an empty book does not crash the engine', typeof empty.daysElapsed === 'number');
  ok('and it has no income to project', empty.ytdTradeIncome === 0);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\nAnd every screen that used to print a zero now says it does not know.\n');
// ═══════════════════════════════════════════════════════════════════════════════════════════
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// ⚠️ TWO TRAPS THAT BOTH BIT THIS FILE BEFORE IT WENT GREEN, so both are handled once here.
//
//   1. COMMENTS COLLIDE WITH ORDERING. The header explaining a fix quotes the sentence the fix
//      guards, and it sits ABOVE the guard, so a raw indexOf finds the comment first and an
//      ordering assertion fails against code that is correct. Every ordering test below runs on
//      comment-stripped source.
//   2. JSX PROSE WRAPS. A sentence a customer reads as one line is stored across three, with
//      indentation in the middle, so a regex for the sentence fails on a screen that says exactly
//      the right thing. Every copy assertion runs on whitespace-flattened source.
//
// A guard that fails on correct code is a guard somebody weakens, and the weakening is what lets
// the real defect through later.
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flat = (s) => s.replace(/\s+/g, ' ');

// ── Home: the week, and the year. ────────────────────────────────────────────────────────────
{
  const home = read('app/app/page.tsx');
  ok('🔴 AN EMPTY WEEK SAYS SO INSTEAD OF PRINTING THREE ZEROS',
    /week\.income === 0 && week\.expenses === 0 \?/.test(home)
    && /Nothing logged this week\./.test(home));
  // ⚠️ ORDER, NOT PRESENCE. Both markers are checked for existence first: indexOf returns -1 for a
  // missing one and -1 is less than everything, so an ordering test on a missing marker cannot fail.
  const homeCode = codeOnly(home);
  const iGuard = homeCode.indexOf('week.income === 0 && week.expenses === 0 ?');
  const iZeros = homeCode.indexOf('{gbp0(week.income)} in, {gbp0(week.expenses)} out.');
  ok('both week markers exist, so the ordering below can actually fail', iGuard >= 0 && iZeros >= 0);
  ok('🔴 AND THE GUARD IS CHECKED BEFORE THE SENTENCE IT REPLACES', iGuard < iZeros);
  ok('🔴 THE "ALL LOGGED" REASSURANCE CANNOT REACH A MAN WHO HAS LOGGED NOTHING',
    /weeklyLine\(weekSaid\)/.test(home) && iGuard < homeCode.indexOf('weeklyLine(weekSaid)'));

  ok('🔴 AND THE YEAR CARD DOES NOT DRAW In £0, Out £0, Profit £0',
    /moneyIn === 0 && moneyOut === 0 \?/.test(home)
    && /Nothing confirmed since 6 April yet\./.test(home));
  const iYear = homeCode.indexOf('moneyIn === 0 && moneyOut === 0 ?');
  const iGrid = homeCode.indexOf('className="lek-grid"');
  ok('the year markers exist', iYear >= 0 && iGrid >= 0);
  ok('🔴 AND THAT GUARD COMES BEFORE THE GRID', iYear < iGrid);
  ok('it tells him the one thing he can do, rather than only that it is empty',
    /Photograph a receipt or tell Lekhio what came in/.test(home));
}

// ── The quarterly summary. ───────────────────────────────────────────────────────────────────
{
  const sum = read('app/app/tax/summary/page.tsx');
  ok('🔴 A ZERO WE WERE NEVER GIVEN IS NOT STATED AS HIS INCOME',
    /pack\.ytd\.grossQualifyingIncome <= 0 \?/.test(sum)
    && /You have not confirmed any income since 6 April/.test(sum));
  const sumCode = codeOnly(sum);
  const iZero = sumCode.indexOf('pack.ytd.grossQualifyingIncome <= 0 ?');
  const iClaim = sumCode.indexOf('Your income since 6 April is {gbp0(pack.ytd.grossQualifyingIncome)}');
  ok('both summary markers exist', iZero >= 0 && iClaim >= 0);
  ok('🔴 AND THE EMPTY ARM IS CHECKED FIRST, or the claim is made anyway', iZero < iClaim);
  ok('it still refuses to treat this year as the MTD test, which was always right',
    /HMRC decides it from your/.test(sum));
}

// ── The vehicle adviser. ─────────────────────────────────────────────────────────────────────
{
  const veh = read('app/app/tax/vehicle/page.tsx');
  ok('🔴 AN EMPTY BOOK IS AN UNKNOWN SPARE, NOT £0 SPARE',
    /ytdTradeIncome === 0 && optimiser\.ytdTradeExpenses === 0\s*\n?\s*\? null/.test(veh));
  // The null path is not new: lib/capital.ts has always had it for a FAILED optimiser read. This
  // is the assertion that it still exists, because the fix above is worth nothing without it.
  const cap = read('lib/capital.ts');
  ok('and lib/capital.ts still understands a null spendable, which is what that fix leans on',
    /spendable: number \| null/.test(cap));
}

// ── The lender facing share. ─────────────────────────────────────────────────────────────────
{
  const share = read('app/share/[token]/page.tsx');
  const proof = read('app/app/proof-of-income/page.tsx');
  ok('🔴 THE SHARED SHEET REFUSES TO DRAW ZEROS AT A LENDER',
    /totals\.count === 0/.test(share));
  ok('🔴 AND IT SAYS WHAT THE ZEROS ARE NOT, because a lender is the one drawing the conclusion',
    /This is not a statement that they earned nothing/.test(share));
  const shareCode = codeOnly(share);
  const iRefuse = shareCode.indexOf('totals.count === 0');
  const iConfirmed = shareCode.indexOf('Every figure below was reviewed and confirmed');
  ok('both share markers exist', iRefuse >= 0 && iConfirmed >= 0);
  ok('🔴 THE REFUSAL COMES BEFORE THE "reviewed and confirmed" CLAIM, which is what made it dangerous',
    iRefuse < iConfirmed);
  // The sibling document is why we know what the right answer is. If its guard ever goes, the two
  // drift apart again and the one that leaves the building is the one that will be wrong.
  ok('and its sibling still refuses too, which is where this rule came from',
    /proof\.txCount === 0 \?/.test(proof)
    && /would tell a lender something false about you/.test(proof));
}

// ── The election nobody can answer yet. ──────────────────────────────────────────────────────
{
  const el = read('app/app/you/elections/page.tsx');
  ok('🔴 NO BUTTON TO GIVE UP A YEAR OF COSTS ON AN EMPTY BOOK',
    /choice\?\.better === 'too_early' \?/.test(el)
    && /There is nothing to weigh up yet, so there is no button here/.test(el));
  const elCode = codeOnly(el);
  const iEarly = elCode.indexOf("choice?.better === 'too_early' ?");
  const iBtn = elCode.indexOf('Claim the allowance instead of my costs');
  ok('both election markers exist', iEarly >= 0 && iBtn >= 0);
  ok('🔴 AND IT IS CHECKED BEFORE THE BUTTON IS DRAWN', iEarly < iBtn);
  ok('it says nothing is lost by waiting, because that is the fact that makes it easy to wait',
    /claimed on the return for the year, not today/.test(flat(el)));
}

// ── House rules, on every sentence added here. ───────────────────────────────────────────────
{
  const added = [
    'app/app/page.tsx', 'app/app/tax/summary/page.tsx', 'app/app/tax/vehicle/page.tsx',
    'app/share/[token]/page.tsx', 'app/app/you/elections/page.tsx', 'lib/supabase.ts',
  ].map(read).join('\n');
  ok('no em dash, no en dash anywhere in the day one work',
    !/[–—]/.test(added));
  ok('and nothing added here claims we file tax or are HMRC approved',
    !/we file your tax|HMRC approved|approved by HMRC/i.test(added));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
