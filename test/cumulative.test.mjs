// A QUARTERLY UPDATE IS THE WHOLE YEAR SO FAR, AND EVERY TEST WE HAD USED THE ONE QUARTER WHERE
// THAT MAKES NO DIFFERENCE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// From 2025-26 HMRC replaced the discrete quarterly "period" endpoint with a single CUMULATIVE
// summary per year. GOV.UK, to the taxpayer, in terms: "Each time you send a quarterly update it
// will cover from the start of the tax year to the end of the update period, not just the previous
// three months." So the update due 7 November covers 6 April to 5 October, and it REPLACES the one
// sent in August rather than continuing from it.
//
// 🔴 THE CODEBASE HELD BOTH MODELS AND THEY DISAGREED.
//
// lib/quarterpack.ts computes DISCRETE quarters, and its own comment called that figure "the content
// of an MTD quarterly update". lib/hmrc.ts knew better, but only in a comment: buildPeriodicUpdate
// totalled whatever rows it was handed over whatever window it was told to declare. Wire the two
// together for November and a man's submission reports July to October and silently omits April to
// July. His income understated to HMRC, which is the conduct Finance Act 2026 Sch 22 makes
// sanctionable, and no screen anywhere would have looked wrong.
//
// 🔴 AND EVERY EXISTING TEST WAS GREEN, BECAUSE EVERY EXISTING TEST USED Q1.
//
// All five call sites hardcoded 6 April to 5 July. Q1 is the one quarter of four where the
// cumulative window and the discrete window are the same dates, so the fixtures could not have
// caught this if they had tried. That is the lesson worth more than the fix: a suite that only
// exercises the degenerate case is not evidence, it is a coincidence.
//
// So this suite is built entirely on Q2, with real activity in April that a discrete window would
// drop, and it asserts the drop would be caught rather than merely that the sums add up.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'lib');

// quarterpack.ts imports the engine with an extensionless specifier (the Next convention), which
// Node's type stripping cannot resolve, so it is staged with that one import rewritten. Same
// approach as test/quarterpack.test.mjs and test/agent.test.mjs.
const stage = mkdtempSync(path.join(tmpdir(), 'cumul-'));
writeFileSync(path.join(stage, 'taxengine.ts'), readFileSync(path.join(lib, 'taxengine.ts'), 'utf8'));
// lib/scotland.ts, the pack's second import. One exported sentence, nothing imported into it.
writeFileSync(path.join(stage, 'scotland.ts'), readFileSync(path.join(lib, 'scotland.ts'), 'utf8'));
writeFileSync(
  path.join(stage, 'quarterpack.ts'),
  readFileSync(path.join(lib, 'quarterpack.ts'), 'utf8')
    .replace("from './taxengine'", "from './taxengine.ts'")
    .replace("from './scotland'", "from './scotland.ts'"),
);
const H = await import(pathToFileURL(path.join(lib, 'hmrc.ts')).href);
const Q = await import(pathToFileURL(path.join(stage, 'quarterpack.ts')).href);
const {
  buildCumulativeUpdate, cumulativePeriodEnds, taxYearStartDate, CumulativeWindowError,
} = H;
const { buildQuarterPack, quarterBounds } = Q;

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

console.log('\ncumulative: a quarterly update is the whole year so far');

// ---------------------------------------------------------------------------------------------
// THE WINDOW. Every cumulative period opens on 6 April; only the end moves.
// ---------------------------------------------------------------------------------------------
ok('the window opens on 6 April of the tax year', taxYearStartDate('2026-27') === '2026-04-06');
ok('there are four period ends and they are the quarter ends',
  JSON.stringify(cumulativePeriodEnds('2026-27')) === JSON.stringify(['2026-07-05', '2026-10-05', '2027-01-05', '2027-04-05']));

// 🔴 THE ONE JAG ASKED ABOUT. The update due 7 November is the SECOND, and it covers 6 April to
// 5 October. It is not the third, and it does not cover August to October.
ok('🔴 the update due 7 November is the second, and it runs 6 April to 5 October',
  cumulativePeriodEnds('2026-27')[1] === '2026-10-05' && taxYearStartDate('2026-27') === '2026-04-06');

// ---------------------------------------------------------------------------------------------
// 🔴 Q2, WHERE CUMULATIVE AND DISCRETE DIFFER. This is the case no fixture used to cover.
// ---------------------------------------------------------------------------------------------
const APRIL = [
  { amount: 4000, category: 'income', date: '2026-04-20' },
  { amount: -1000, category: 'materials', date: '2026-04-22' },
];
const SUMMER = [
  { amount: 6000, category: 'income', date: '2026-08-14' },
  { amount: -1500, category: 'materials', date: '2026-09-02' },
];
const YEAR = [...APRIL, ...SUMMER];

const q2 = buildCumulativeUpdate({ taxYear: '2026-27', periodEndDate: '2026-10-05', txns: YEAR });
ok('the November update declares 6 April as its start',
  q2.periodDates.periodStartDate === '2026-04-06' && q2.periodDates.periodEndDate === '2026-10-05');
ok('🔴 and it carries the WHOLE year so far, April included (10,000 not 6,000)',
  q2.periodIncome.turnover === 10000);
ok('expenses are cumulative too (2,500 not 1,500)', q2.periodExpenses.costOfGoods === 2500);

// The bug, reproduced: hand it only the quarter's rows and the April money is gone. Nothing can
// detect that from inside, which is why lib/quarterpack.ts now names the cumulative block
// `submission` and why this assertion exists to state the failure in plain numbers.
const q2Discrete = buildCumulativeUpdate({ taxYear: '2026-27', periodEndDate: '2026-10-05', txns: SUMMER });
ok('🔴 handing it one quarter of rows understates the man by exactly his April income',
  q2Discrete.periodIncome.turnover === 6000 && q2.periodIncome.turnover - q2Discrete.periodIncome.turnover === 4000);

// ---------------------------------------------------------------------------------------------
// THE WINDOW IS NOT THE CALLER'S TO GET WRONG.
// ---------------------------------------------------------------------------------------------
function refuses(fn) {
  try { fn(); return false; } catch (e) { return e instanceof CumulativeWindowError; }
}
ok('🔴 a discrete quarter end (6 July start) cannot even be expressed: there is no start argument',
  buildCumulativeUpdate.length === 1);
ok('🔴 an invented period end is refused',
  refuses(() => buildCumulativeUpdate({ taxYear: '2026-27', periodEndDate: '2026-09-30', txns: YEAR })));
ok('a quarter end from the WRONG tax year is refused',
  refuses(() => buildCumulativeUpdate({ taxYear: '2026-27', periodEndDate: '2027-10-05', txns: YEAR })));
ok('a nonsense tax year label is refused',
  refuses(() => buildCumulativeUpdate({ taxYear: 'next year', periodEndDate: '2026-10-05', txns: YEAR })));

// It windows the rows itself, so the figures and the dates can never describe two periods.
const withNextYear = [...YEAR, { amount: 99999, category: 'income', date: '2027-05-01' }];
ok('🔴 a row outside the declared window cannot reach the totals',
  buildCumulativeUpdate({ taxYear: '2026-27', periodEndDate: '2026-10-05', txns: withNextYear })
    .periodIncome.turnover === 10000);
const undated = [...YEAR, { amount: 5000, category: 'income' }];
ok('a row with no date cannot reach the totals either',
  buildCumulativeUpdate({ taxYear: '2026-27', periodEndDate: '2026-10-05', txns: undated })
    .periodIncome.turnover === 10000);

// Q1 still works, and still agrees with the discrete window, which is exactly why it proved nothing.
const q1 = buildCumulativeUpdate({ taxYear: '2026-27', periodEndDate: '2026-07-05', txns: YEAR });
ok('Q1 is unchanged, and is the case where the two models agree', q1.periodIncome.turnover === 4000);

// ---------------------------------------------------------------------------------------------
// THE QUARTER PACK. The cumulative figures now have a name that says what they are for.
// ---------------------------------------------------------------------------------------------
const packRows = [
  { transaction_date: '2026-04-20', amount: 4000, category: 'income' },
  { transaction_date: '2026-04-22', amount: -1000, category: 'materials' },
  { transaction_date: '2026-08-14', amount: 6000, category: 'income' },
  { transaction_date: '2026-09-02', amount: -1500, category: 'materials' },
];
const pack = buildQuarterPack({ transactions: packRows, startYear: 2026, quarter: 2, businessName: 'Test' });

ok('the pack carries a submission block', Boolean(pack.submission));
ok('🔴 the submission window opens on 6 April, not on the quarter start',
  pack.submission.periodStartDate === '2026-04-06'
  && pack.submission.periodStartDate !== quarterBounds(2026, 2).start);
ok('the submission window ends at the quarter end', pack.submission.periodEndDate === '2026-10-05');
ok('🔴 the submission figures are cumulative (10,000), the quarter figures are not (6,000)',
  pack.submission.trade.income === 10000 && pack.trade.income === 6000);
ok('and the two are genuinely different, so this fixture actually tests something',
  pack.submission.trade.income !== pack.trade.income);
ok('the submission counts every entry in the window, not just the quarter',
  pack.submission.txCount === 4 && pack.txCount === 2);

// The pack feeds the payload correctly when the right block is used, and the totals agree.
const fromPack = buildCumulativeUpdate({
  taxYear: '2026-27',
  periodEndDate: pack.submission.periodEndDate,
  txns: packRows.map((r) => ({ amount: r.amount, category: r.category, date: r.transaction_date })),
});
ok('🔴 the pack and the payload agree on what HMRC receives',
  fromPack.periodIncome.turnover === pack.submission.trade.income);

// ---------------------------------------------------------------------------------------------
// AND THE COPY. A man told "covering August to October" leaves April out, correctly following us.
// ---------------------------------------------------------------------------------------------
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const resources = read('app/resources/page.tsx');
const howItWorks = read('app/how-mtd-works/page.tsx');
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

ok('🔴 no page describes a quarterly update as a discrete three month block',
  !/covering August to October|covering November to January|covering February to April/.test(codeOnly(resources)));
ok('the November date says what it actually covers',
  /covering 6 April to 5 October/.test(resources));
ok('🔴 and says each update replaces the one before it',
  /restates the year so far and replaces the one before it/.test(resources));
ok('the how it works page no longer sells four separate summaries',
  !/instead of one big return/.test(codeOnly(howItWorks)));
ok('and its timeline is dated rather than seasonal',
  /To 5 Oct/.test(howItWorks) && !/<small>Autumn<\/small>/.test(howItWorks));

// The old name is gone entirely. Two functions for one payload is how the two models survived.
const hmrcSrc = read('lib/hmrc.ts');
ok('🔴 there is one payload builder, not two', !/export function buildPeriodicUpdate/.test(hmrcSrc));
// ⚠️ THIS ONE IS DELIBERATELY FUSSY. The claim "this is the content of an MTD quarterly update" is
// still in lib/quarterpack.ts, because the comment that removed it QUOTES it in order to explain
// what was wrong. A plain absence check therefore goes red on the fix itself, which would teach the
// next person to delete the history rather than keep it. So: the phrase may appear, but only as
// something we are recording that we used to say.
const packSrc = read('lib/quarterpack.ts');
const claims = [...packSrc.matchAll(/this is the content of an MTD quarterly update/g)];
const asserted = claims.filter((m) => !/used to read/.test(packSrc.slice(Math.max(0, m.index - 300), m.index)));
ok('🔴 the quarter pack never states that the discrete figure is the update content',
  asserted.length === 0);
ok('and it says plainly which block HMRC actually receives',
  /WHAT HMRC ACTUALLY RECEIVES/.test(packSrc) && /submission: \{/.test(packSrc));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
