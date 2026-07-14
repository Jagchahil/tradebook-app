// PAY YOURSELF: salary, then dividends, then THE WALL.
//
// "Pay yourself £12,570, then dividends, and anything more will cost you THIS much in tax."
//
// The last clause is the feature. Every calculator in this market shows a man his total tax bill.
// Almost none shows him the price of the NEXT thousand pounds, which is the only figure attached to
// a decision he is actually about to make. He is not asking what his effective rate is. He is asking
// whether he can take four grand out for the holiday and what it costs.
//
// THREE THINGS THIS SUITE DEFENDS, AND EVERY ONE OF THEM WAS A REAL HOLE:
//
//   1. 🔴 THE RUNGS WERE THREE MAGIC NUMBERS IN A HARDCODED ARRAY, IN A HARDCODED ORDER.
//      salaryOptions: [12570, 6708, 5000]. The middle one is the LOWER EARNINGS LIMIT, the salary at
//      which a director's year still counts toward his STATE PENSION. It was written as a bare
//      literal in four files across two repos, published nowhere, watched by nothing, while every
//      other limited-company constant beside it was checked against GOV.UK nightly.
//
//   2. 🔴 THE SECONDARY THRESHOLD NOW SITS *BELOW* THE LOWER EARNINGS LIMIT. It has not always. They
//      can cross back. Any code that assumes an order will one day hand a director the wrong rung
//      with total confidence.
//
//   3. 🔴 AN UNLAWFUL DIVIDEND WAS COMPUTABLE. planLtd() will happily hand you a number. A dividend
//      can only come out of distributable profit (CA 2006 s830), and you cannot re-label it as
//      salary afterwards (Global Corporate v Hale, Court of Appeal). We BLOCK. We do not warn.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'pay-'));
const fix = (s) => s
  .replace(/from '\.\/taxengine'/g, "from './taxengine.ts'")
  .replace(/from '\.\/nistudentloan'/g, "from './nistudentloan.ts'")
  .replace(/from '\.\/ltdengine'/g, "from './ltdengine.ts'");
for (const f of ['taxengine', 'nistudentloan', 'ltdengine', 'payyourself']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const P = await import(pathToFileURL(path.join(stage, 'payyourself.ts')).href);
const L = await import(pathToFileURL(path.join(stage, 'ltdengine.ts')).href);
const N = await import(pathToFileURL(path.join(stage, 'nistudentloan.ts')).href);
const { wall, drawable, payYourself } = P;
const { LTD, salaryRungs, planLtd } = L;
const { NI_FACTS } = N;

const ltdSrc = readFileSync(path.join(lib, 'ltdengine.ts'), 'utf8');
const factsSrc = readFileSync(path.join(here, '../app/facts.json/route.ts'), 'utf8');

// ⚠️ KHOJI LIVES IN TWO DIFFERENT PLACES AND I HARDCODED ONE OF THEM.
//
// In the working copy the layout is  Tradesman/{tradebook-web, khoji}  so the differ is at ../../khoji.
// In the DEPLOY repo, khoji lives INSIDE the web repo, at tradebook/khoji. run-all.mjs already knew
// this and resolves repoRoot/khoji. This test did not, so it passed here and died on the gate.
//
// A test that only runs in one of the two places it is meant to run is not a test, it is a local
// habit. Try both, and say plainly if neither is there rather than throwing a raw ENOENT at somebody.
const differPath = [
  path.join(here, '../khoji/diff.mjs'),       // deploy repo: khoji is inside the web repo
  path.join(here, '../../khoji/diff.mjs'),    // working copy: khoji is a sibling
].find(existsSync);

if (!differPath) {
  console.error('\n🔴 Could not find khoji/diff.mjs in either layout. The Lower Earnings Limit check lives there and this suite cannot verify it is watched.');
  process.exit(1);
}
const differSrc = readFileSync(differPath, 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\npay yourself: salary, dividends, and the wall');

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE LOWER EARNINGS LIMIT. ONE HOME, PUBLISHED, WATCHED.
// ---------------------------------------------------------------------------------------------

ok('🔴 THE LEL IS IMPORTED, NOT RETYPED. One number, one home.',
  // It was 6708, written out four times across two repos. A number that decides a man's state
  // pension does not get to live in an anonymous array.
  LTD.lowerEarningsLimit === NI_FACTS.class1LowerEarningsLimit);

ok('...and the magic number is gone from the engine',
  // ⚠️ STRIP THE COMMENTS FIRST. The eighth time a test in this repo has been broken by prose, and
  // this time by MY OWN COMMENT explaining what the magic array used to look like. The rule that
  // keeps re-emerging: assert on the CODE or the SHAPE, never on the words around it.
  !/salaryOptions:\s*\[/.test(ltdSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));

ok('🔴 IT IS PUBLISHED, SO KHOJI CAN SEE IT',
  /lowerEarningsLimit: LTD\.lowerEarningsLimit/.test(factsSrc));

ok('🔴 AND IT IS WATCHED. A published number nobody checks is theatre.',
  /fact: 'lowerEarningsLimit'/.test(differSrc));

ok('...and the extractor takes the PER YEAR figure, not the weekly one sitting in front of it',
  // The row reads: "Lower earnings limit £129 per week £560 per month £6,708 per year". Take the
  // first £ and you get 129, and the differ screams drift at a perfectly correct engine. The
  // secondary threshold extractor already learned this the hard way, on the very same page.
  /lower earnings limit[\s\S]{0,200}?per year/i.test(differSrc));

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE RUNGS. DERIVED, AND SORTED AT RUNTIME.
// ---------------------------------------------------------------------------------------------

const rungs = salaryRungs();

ok('every rung is derived from a named constant, and there are three of them',
  rungs.length === 3
  && rungs.some((r) => r.salary === LTD.personalAllowance)
  && rungs.some((r) => r.salary === LTD.lowerEarningsLimit)
  && rungs.some((r) => r.salary === LTD.employerSecondaryThreshold));

ok('🔴 THEY ARE SORTED AT RUNTIME, not by the order somebody typed them',
  rungs.every((r, i) => i === 0 || rungs[i - 1].salary >= r.salary));

ok('🔴 THE SECONDARY THRESHOLD SITS BELOW THE LOWER EARNINGS LIMIT. Today. It has not always.',
  // £5,000 < £6,708. If a Budget swaps them back, the sort keeps this code right the next morning
  // and nobody has to remember anything. That is the whole reason it is a sort and not an array.
  LTD.employerSecondaryThreshold < LTD.lowerEarningsLimit);

ok('every rung says WHAT IT IS FOR, because the money alone does not tell him',
  rungs.every((r) => typeof r.why === 'string' && r.why.length > 40));

ok('🔴 THE PENSION RUNG SAYS SO, AND THE CHEAP RUNG SAYS WHAT IT COSTS HIM',
  // The £5,000 rung wins on take-home and silently costs him a qualifying year toward his state
  // pension, worth roughly £300 a year FOR LIFE, which appears in no take-home number anywhere. A
  // calculator that quietly optimises for this year's cash is one that sells his pension.
  rungs.find((r) => r.salary === LTD.lowerEarningsLimit).why.includes('State Pension')
  && rungs.find((r) => r.salary === LTD.employerSecondaryThreshold).why.includes('does NOT earn you a State Pension'));

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE WALL. What the next thousand actually costs.
// ---------------------------------------------------------------------------------------------

const w = wall(60_000, 12_570);

ok('the wall prices a SLICE, and the slice is a thousand pounds',
  w.slice === 1000);

ok('what he keeps plus what it costs equals the slice. It must, or one of them is a lie.',
  Math.abs((w.keeps + w.costs) - w.slice) < 0.02);

ok('the marginal rate is the cost over the slice, and it is NOT the headline rate',
  // The number he remembers, and the number no other calculator shows him.
  Math.abs(w.rate - (w.costs / w.slice) * 100) < 0.02);

ok('🔴 THE WALL IS COMPUTED BY RUNNING THE COMPANY TWICE AND SUBTRACTING. Never read off a table.',
  // You cannot get this from HMRC's dividend rates. The money is taxed TWICE on the way out and the
  // two taxes interact: corporation tax first, then dividend tax at whatever band his TOTAL income
  // has reached, with marginal relief in between. There is no closed form. There is only: plan it at
  // P, plan it at P + 1000, subtract. Slow, stupid, and exactly right, which beats clever.
  //
  // The proof: it agrees with the engine, on a number the engine never told it.
  (() => {
    const a = planLtd(60_000, 12_570);
    const b = planLtd(61_000, 12_570);
    return Math.abs(w.keeps - (b.takeHome - a.takeHome)) < 0.02;
  })());

ok('...and it stays right through a Budget, because it never knew what the rates were',
  // A rate table would need editing. This does not.
  !/0\.1075|0\.3575|dividendBasic|dividendHigher/.test(readFileSync(path.join(lib, 'payyourself.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));

ok('the man on a modest profit is told a lower marginal rate than the man on a big one',
  wall(30_000, 12_570).rate < wall(150_000, 12_570).rate);

ok('🔴 THE £100,000 TRAP IS IN THE WALL. The taper SPIKES his marginal rate, and now we say so.',
  // Before today the wall reported 52.78% at £65,000 of profit and 52.78% at £150,000, because the
  // Ltd engine used a FLAT personal allowance and had never heard of the taper. It is the single most
  // famous cliff in UK tax and the engine did not know it existed.
  //
  // The wall is what found it: a marginal rate that does not move as a man's income climbs through
  // the taper is a marginal rate that is wrong. A tax bill quietly too LOW is the one error he never
  // reports, and he signs the return himself.
  wall(150_000, 12_570).rate > wall(65_000, 12_570).rate + 5);

ok('...and it comes back DOWN once the allowance is fully gone, because that is the real shape of it',
  // Above £125,140 there is no allowance left to withdraw, so the spike ends. A model that only ever
  // ramps up would be just as wrong, in the other direction.
  wall(200_000, 12_570).rate < wall(150_000, 12_570).rate);

ok('it speaks in his words, with his numbers, not in percentages',
  /Every extra £1,000 you take out costs you £/.test(w.says) && /You keep £/.test(w.says));

ok('a CLIFF is flagged BEFORE he crosses it, not after',
  // Worth telling him while he can still act on it. At £59,000 of profit his total income is just
  // under £50,270, so the NEXT thousand is still cheap and the one after it is not: he keeps £723
  // now and £571 in a moment. That is the moment to say something, not afterwards.
  wall(59_000, 12_570).atACliff === true);

ok('...and a man nowhere near an edge is not warned about nothing',
  wall(30_000, 12_570).atACliff === false);

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE ILLEGAL DIVIDEND. WE BLOCK. WE DO NOT WARN.
// ---------------------------------------------------------------------------------------------

const plan = planLtd(60_000, 12_570);
const fine = drawable(60_000, 12_570, 1_000);
const over = drawable(60_000, 12_570, plan.dividends + 20_000);

ok('what he can lawfully take is the post-tax profit, plus anything retained from before',
  Math.abs(fine.available - plan.dividends) < 0.02
  && Math.abs(drawable(60_000, 12_570, 1_000, 5_000).available - (plan.dividends + 5_000)) < 0.02);

ok('a lawful draw goes through, and tells him what is left',
  fine.blocked === false && /there is £/.test(fine.says));

ok('🔴 AN UNLAWFUL DIVIDEND IS BLOCKED. Not warned about. BLOCKED.',
  // A man who reads "careful, this may be unlawful" and takes the money anyway has not been helped.
  // He has been handed a paper trail showing we told him and he did it anyway. And under FA26 Sch 22,
  // software that computes and PRESENTS an unlawful distribution as an option is assistance provided
  // in the knowledge it will be used in connection with tax affairs.
  over.blocked === true && /I cannot show you that as a dividend/.test(over.says));

ok('...and the refusal says WHY, because a block he does not understand is a block he routes around',
  /loan from the company to you/.test(over.says) && /33\.75%/.test(over.says));

ok('🔴 ...and it tells him he could NOT fix it afterwards by calling it wages',
  // Global Corporate Ltd v Hale [2018] EWCA Civ 2618. The director took payments described as
  // dividends, the company went under, he argued they were really salary. The Court of Appeal said
  // no: the label at the time of payment is what counts. He repaid the lot to the liquidator.
  /could not fix it later by calling it wages/.test(over.says)
  && /had to pay the money back/.test(over.says));

ok('...and it gives him the lawful way out instead of just saying no',
  // Doc 103: the best button is no button, and a refusal with no door is a dead end.
  /take it as salary, and I will show you what that costs/.test(over.says));

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE WHOLE ANSWER. Every rung priced. Nothing hidden.
// ---------------------------------------------------------------------------------------------

const answer = payYourself(60_000);

ok('EVERY rung is priced. We do not pick one and hide the rest.',
  answer.rungs.length === 3 && answer.rungs.every((r) => r.plan && r.plan.takeHome > 0));

ok('the best one on take-home is identified, but the others are still shown, with their consequences',
  answer.best.takeHome === Math.max(...answer.rungs.map((r) => r.plan.takeHome))
  && answer.rungs.every((r) => r.why.length > 40));

ok('the wall comes with the plan, because the plan is useless without the price of the next pound',
  answer.wall && typeof answer.wall.says === 'string' && answer.wall.says.length > 20);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
