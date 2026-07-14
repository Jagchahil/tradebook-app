// MARRIAGE ALLOWANCE. £252 a year, and the most commonly missed relief our customer is entitled to.
//
// Until 14 July 2026 the product's entire treatment of it was ONE SENTENCE in a tips list saying
// "free money many people miss". We were the ones missing it. No constant, no calculation, nothing
// watching it, no source recorded. We told him it existed and left him to it. That is a leaflet.
//
// THE TWO TESTS THAT MATTER IN THIS FILE, AND NEITHER IS ABOUT ARITHMETIC:
//
//   1. THE £252 MUST NEVER ENTER AN ESTIMATED-SAVING TOTAL. It is conditional on a fact we do not
//      hold: whether he is married at all. A total is a promise. This product has already once told
//      a man he was owed a CIS refund that did not exist, because a number went into a total on an
//      assumption. Never again.
//
//   2. THE LOWER EARNER APPLIES. HMRC will not take the claim from the partner receiving it. Get
//      that wrong and every man who follows our advice gets rejected, and blames us, correctly.

// The optimiser imports the engine extensionlessly (Next resolves that; bare node does not), so we
// stage a rewritten copy exactly as test/taxoptimiser.test.mjs does. One harness, not two.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'marriage-'));
const fix = (s) => s
  .replace("from './taxengine'", "from './taxengine.ts'")
  .replace("from './autonomy'", "from './autonomy.ts'")
  .replace("from './ltdengine'", "from './ltdengine.ts'")
  .replace("from './nistudentloan'", "from './nistudentloan.ts'");
for (const f of ['taxengine', 'autonomy', 'nistudentloan', 'ltdengine', 'taxoptimiser']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const E = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const O = await import(pathToFileURL(path.join(stage, 'taxoptimiser.ts')).href);
const { RULE_SOURCES } = await import(pathToFileURL(path.join(lib, 'rulesources.ts')).href);

const { marriageAllowance, FACTS } = E;
const { findOptimisations, totalEstimatedSaving } = O;

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nmarriage allowance: £252 he is entitled to, and we were not telling him how');

// --- who is on which side of the transfer -------------------------------------------------------

ok('a basic rate tradesman can RECEIVE it',
  marriageAllowance(30_000).role === 'receiver');

ok('a man earning under his own allowance can GIVE it: part of his allowance is going to waste',
  marriageAllowance(6_000).role === 'giver');

ok('a HIGHER rate taxpayer gets nothing, and is told nothing',
  marriageAllowance(60_000).role === 'none');

// ⚠️ THIS TEST CAUGHT A REAL BUG BEFORE THE TYPECHECKER DID.
//
// The first version of marriageAllowance() compared his income to `FACTS.higherRateThreshold`. That
// constant DOES NOT EXIST. In JavaScript `income <= undefined` is silently false, so every basic
// rate tradesman in Britain was told nothing at all, by a function that looked completely correct.
//
// The threshold is not a constant, it is a consequence: the personal allowance plus the basic rate
// band. Both halves are watched by Khoji, so a Budget that moves either one moves this with it.
const HIGHER_RATE_STARTS = FACTS.personalAllowance + FACTS.basicRateBand;

ok('the higher rate starts at £50,270, derived and not typed in from memory',
  HIGHER_RATE_STARTS === 50_270);

ok('the boundary is exact, not approximate: one pound over and it is gone',
  marriageAllowance(HIGHER_RATE_STARTS).role === 'receiver'
  && marriageAllowance(HIGHER_RATE_STARTS + 1).role === 'none');

ok('...and at exactly the personal allowance he is not yet a receiver',
  marriageAllowance(FACTS.personalAllowance).role !== 'receiver');

ok('a man with no income at all is not told to transfer an allowance he has no use for either way',
  marriageAllowance(0).role === 'none');

// --- the money ----------------------------------------------------------------------------------

ok('it is worth £252: the transfer at the basic rate, not a number typed in from memory',
  marriageAllowance(30_000).worth === Math.round(FACTS.marriageAllowanceTransfer * FACTS.basicRate * 100) / 100
  && marriageAllowance(30_000).worth === 252);

ok('the transferable amount comes from FACTS, so Khoji watches it',
  marriageAllowance(30_000).transfer === FACTS.marriageAllowanceTransfer
  && FACTS.marriageAllowanceTransfer === 1260);

// ---------------------------------------------------------------------------------------------
// 🔴 THE ONE THAT MATTERS: A CONDITIONAL SAVING IS NOT A SAVING.
// ---------------------------------------------------------------------------------------------

const base = {
  startYear: 2026, monthsElapsed: 6,
  ytdTradeIncome: 20_000, ytdTradeExpenses: 5_000, ytdCisSuffered: 0,
  employmentIncome: 0, categoriesLogged: ['fuel', 'phone', 'insurance', 'tools'],
  homeOfficeClaimed: true, mileageClaimed: true,
};

const opts = findOptimisations(base);
const ma = opts.find((o) => o.key === 'marriage_allowance_receive');

ok('a basic rate tradesman IS told about it',
  Boolean(ma));

ok('THE BUG WE REFUSED TO SHIP: its estSaving is ZERO, so £252 can never enter a headline total',
  ma.estSaving === 0);

ok('...and the proof: the total is identical whether or not the marriage tip is present',
  totalEstimatedSaving(opts) === totalEstimatedSaving(opts.filter((o) => o !== ma)));

ok('...because we do not know if he is married, and a total is a promise',
  ma.info === true);

ok('the £252 is in the WORDS, welded to its condition in the same breath',
  ma.detail.includes('£252') && ma.detail.includes('under £12,570'));

// --- the clause that actually gets him the money ------------------------------------------------

ok('THE LOWER EARNER APPLIES, and we say so in capitals-worthy plain English',
  ma.detail.includes('THEY have to make the claim, not you'));

ok('...and we say WHY, because "HMRC will not take it from you" is the bit that saves him a wasted evening',
  ma.detail.toLowerCase().includes('hmrc will not take it from the receiving partner'));

ok('we tell him it backdates four years, which is £1,008 he may be owed right now',
  ma.detail.includes('four years'));

ok('the giver is told HE is the one who applies. The advice reverses with the role',
  findOptimisations({ ...base, ytdTradeIncome: 5_000, ytdTradeExpenses: 1_000 })
    .find((o) => o.key === 'marriage_allowance_give')
    ?.detail.includes('You are the one who has to apply'));

ok('a higher rate earner is told NOTHING about it. An optimiser that suggests what you are barred from stops being read',
  findOptimisations({ ...base, ytdTradeIncome: 80_000, ytdTradeExpenses: 5_000 })
    .every((o) => !o.key.startsWith('marriage_allowance')));

// --- and it is SOURCED, on the day it was born --------------------------------------------------
//
// Four hours before this was written, badrLifetimeLimit was DELETED from the tax engine: a number we
// published to the world, could not source on GOV.UK, could not check, and did not use. A new number
// arrives with its source and its watcher attached, or it does not arrive.

ok('the claim carries a primary source, from birth, not bolted on in an audit later',
  RULE_SOURCES.marriage_allowance?.[0]?.url === 'https://www.gov.uk/marriage-allowance');

ok('...and the quote is HMRC\'s sentence, not ours',
  RULE_SOURCES.marriage_allowance[0].quote.includes('£1,260'));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
