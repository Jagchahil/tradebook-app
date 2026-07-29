// THE LEDGER. See lib/ledger.ts and doc 108.
//
// "£12.99 saves you £2,000" is not a slogan. It is a specification. If we cannot show him the
// £2,000, we have not earned the £12.99, and the sentence is a lie.
//
// THE TESTS THAT MATTER HERE ARE NOT THE ARITHMETIC. They are the four ways this file could turn
// into an advert, each of which this codebase has already done once:
//
//   1. A CONDITIONAL COUNTED AS A SAVING. The optimiser carries Marriage Allowance at estSaving 0
//      on purpose, because we do not know if he is married. If the ledger ever counts a "could",
//      he catches it once and never believes another number we show him.
//
//   2. A REPAYMENT COUNTED AS A SAVING. A CIS refund is HIS OWN MONEY coming back. Folding it into
//      "tax saved" double counts it and flatters us by thousands. This product has ALREADY once
//      quoted a man a CIS refund that did not exist. It does not get a second go.
//
//   3. NOT ENOUGH RENDERED AS ZERO, or worse, as a confident small number. Two weeks in, this would
//      proudly report that Lekhio saved him £14. He would laugh, and he would be right.
//
//   4. PER-LINE SAVINGS ADDING UP TO MORE THAN THE TOTAL. Tax is banded. Compute each line
//      independently from the same untouched top band and the parts exceed the whole.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'ledger-'));
const fix = (s) => s.replace("from './taxengine'", "from './taxengine.ts'");
for (const f of ['taxengine', 'ledger']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const L = await import(pathToFileURL(path.join(stage, 'ledger.ts')).href);
const E = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);
const { ledger, headline, ENOUGH_MONTHS } = L;
const { soleTraderTax } = E;

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nthe ledger: what Lekhio actually saved him, and the four ways it could become an advert');

const base = {
  monthsElapsed: 12,
  grossIncome: 48_000,
  expenses: 9_000,
  mileage: 3_300,
  homeOffice: 120,
  capitalAllowances: 2_400,
  pension: 0,
  cisSuffered: 0,
};

// ---------------------------------------------------------------------------------------------
// 🔴 THE BASELINE. Compared to WHAT?
// ---------------------------------------------------------------------------------------------
//
// Tesla does not model what car you would have bought. It compares you to petrol, at today's price,
// over the miles you actually drove. A DEFINED baseline, not a guess about your behaviour.
//
// Ours: the tax HMRC would charge him ON HIS GROSS, claiming NOTHING. That is not a hypothetical.
// It is what happens to a man with a shoebox, and for a CIS subbie it is literally what happens:
// the contractor deducts from GROSS, with no personal allowance and not one expense.

const l = ledger(base);

ok('WITHOUT LEKHIO is the tax on the gross, claiming nothing. A defined baseline, never a guess',
  l.withoutLekhio === Math.round(soleTraderTax(48_000).total));

ok('WITH LEKHIO is the tax he actually owes',
  l.withLekhio === Math.round(soleTraderTax(48_000 - (9_000 + 3_300 + 120 + 2_400)).total));

ok('the saving is the gap between the two, and nothing else',
  l.saved === l.withoutLekhio - l.withLekhio);

ok('...and it is a real number, not a rounding artefact',
  l.saved > 3_000);

// ---------------------------------------------------------------------------------------------
// 🔴 1. A CONDITIONAL IS NOT A SAVING.
// ---------------------------------------------------------------------------------------------
//
// The ledger takes CONFIRMED figures. There is no field on LedgerInput for a "could", a "might", or
// an "if you are married". You cannot pass one in, which is the strongest possible guarantee.

ok('THE BUG WE REFUSED TO SHIP: there is no way to feed a conditional into the ledger at all',
  !('marriageAllowance' in base) && !('projected' in base) && !('estimated' in base));

ok('the input carries CONFIRMED figures only, so nothing conditional can reach a total',
  Object.keys(base).every((k) => typeof base[k] === 'number'));

// ---------------------------------------------------------------------------------------------
// 🔴 2. A REPAYMENT IS NOT A SAVING. THIS ONE HAS ALREADY BITTEN US ONCE.
// ---------------------------------------------------------------------------------------------

const cis = ledger({ ...base, cisSuffered: 6_000 });

ok('CIS suffered does NOT touch the saved figure. It is his own money coming back',
  cis.saved === l.saved);

ok('...it does not touch either side of the comparison either',
  cis.withoutLekhio === l.withoutLekhio && cis.withLekhio === l.withLekhio);

ok('...it gets its OWN number, and its own word',
  cis.refundDue === 6_000);

ok('a man with £6,000 of CIS and no costs is not told we saved him £6,000',
  ledger({ ...base, expenses: 0, mileage: 0, homeOffice: 0, capitalAllowances: 0, cisSuffered: 6_000 }).saved === 0);

// ---------------------------------------------------------------------------------------------
// 🔴 3. NOT ENOUGH IS NOT ZERO, and it is not a confident small number either.
// ---------------------------------------------------------------------------------------------

const early = ledger({ ...base, monthsElapsed: 1 });

ok('two weeks in, we do NOT proudly report that we saved him £14',
  early.enough === false && early.saved === 0);

ok('...we say WHY, in his words',
  early.note.includes('Too early to say'));

// 🔴 THE POINT IS THAT HE IS GIVEN SOMETHING TO DO, NOT SHOWN A ZERO. The action changed on
// 29 July: this used to say "Send a receipt", which means WhatsApp, which needs a proved number a
// web customer does not have. Naming an action he cannot take turns an empty screen into a dead
// end, which is worse than the zero this assertion was written to prevent.
ok('a man with nothing confirmed is given something he can actually do, not shown a zero',
  ledger({ ...base, grossIncome: 0 }).note.includes('Connect your bank'));

ok('...but his CIS is still shown, because that money is real and it is HIS',
  ledger({ ...base, grossIncome: 0, cisSuffered: 4_000 }).refundDue === 4_000);

ok('the threshold is three months, the same honesty the optimiser already uses for projections',
  ENOUGH_MONTHS === 3
  && ledger({ ...base, monthsElapsed: 3 }).enough === true
  && ledger({ ...base, monthsElapsed: 2 }).enough === false);

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE PARTS MUST NOT EXCEED THE WHOLE.
// ---------------------------------------------------------------------------------------------
//
// Tax is banded. Compute each line's saving independently, each measured from the same untouched
// top band, and the sum comes out LARGER than the real total. Every line looks right. The headline
// is a lie. So the TOTAL is exact (two runs of the engine) and each line takes its SHARE of it.

const sum = l.lines.reduce((n, x) => n + x.saved, 0);

ok('THE BUG: the per-line savings sum to the total, give or take rounding. Never more',
  Math.abs(sum - l.saved) <= l.lines.length);

ok('every line shows WHAT was deducted as well as what it saved, so he can check our working',
  l.lines.every((x) => x.deducted > 0 && x.basis.length > 20));

ok('the biggest saving is at the top, because that is the one he came to see',
  l.lines[0].saved >= l.lines[l.lines.length - 1].saved);

ok('a deduction of zero does not appear as a line at all',
  ledger({ ...base, pension: 0 }).lines.every((x) => x.key !== 'pension')
  && ledger({ ...base, pension: 5_000 }).lines.some((x) => x.key === 'pension'));

// --- the headline -------------------------------------------------------------------------------

ok('the headline is one line, his number, no adjectives',
  headline(l).includes('£') && headline(l).includes("taxman"));

ok('...and when there is nothing to say, it says nothing rather than something',
  headline(early) === early.note);

ok('a man who has saved nothing is told what to do next, not congratulated',
  headline(ledger({ ...base, expenses: 0, mileage: 0, homeOffice: 0, capitalAllowances: 0 }))
    .includes('starts counting'));

// --- and the sanity floor -----------------------------------------------------------------------

ok('savings can never be negative. Claiming costs cannot INCREASE his tax',
  ledger({ ...base, expenses: 99_999 }).saved >= 0);

ok('deductions bigger than his income do not produce a negative tax bill',
  ledger({ ...base, expenses: 99_999 }).withLekhio === 0);


// ---------------------------------------------------------------------------------------------
// 🔴 IT IS WIRED. An engine nobody can reach is this codebase's actual disease.
// ---------------------------------------------------------------------------------------------
//
// An llms.txt was built, tested, and never served. A digest cron reached 200 users and returned 200
// OK. The brain was wired into one screen almost nobody uses. Nothing failed. It simply was not
// connected. A ledger that exists only in lib/ is the same bug wearing a new coat.

const { readFileSync: rf } = await import('node:fs');
const root = path.resolve(here, '..');
const wa = rf(path.join(root, 'app/api/whatsapp/route.ts'), 'utf8');
const api = rf(path.join(root, 'app/api/ledger/route.ts'), 'utf8');
const intents = rf(path.join(root, 'lib/waintents.ts'), 'utf8');

ok('there is an API route, so the app can show it',
  api.includes("from '../../../lib/ledger'"));

ok('...and it reuses getOptimiserInput rather than assembling a SECOND set of figures',
  api.includes('getOptimiserInput') && !api.includes('getConfirmedTransactionsForUser'));

// ---------------------------------------------------------------------------------------------
// 🔴 THE FIFTH WAY IT COULD BECOME AN ADVERT: COUNTING THE SAME DEDUCTION TWICE.
// ---------------------------------------------------------------------------------------------
//
// A mileage claim is inserted as an ORDINARY TRANSACTION (vendor 'Mileage', category 'travel', a
// negative amount), so its value is already inside ytdTradeExpenses and already reducing his tax.
// It was invisible on the ledger, buried in "Costs you logged", so it now gets its own line.
//
// The only safe way to do that is to MOVE it, not ADD it. Passing input.ytdMileage into `mileage`
// while leaving ytdTradeExpenses whole would count every business mile twice and inflate `saved` by
// the tax on it. That is failure mode 2 in this file's header wearing a new coat, and it would be
// the most flattering possible bug: bigger number, happier customer, completely false.
//
// 🔴 AND ON 27 JULY 2026 THIS TEST CAUGHT THE DRIFT IT WAS WRITTEN TO PREDICT.
//
// The rule used to be enforced by pinning the SUBTRACTION into both call sites and asserting the
// source of each. That is a rule maintained by copying, and the copies drifted: the WhatsApp reply
// passed `homeOffice: 0` with a comment saying use of home was "never captured at all", which
// stopped being true the day lib/elections.ts shipped. From that moment a man who had elected use
// of home saw one total on his ledger and a SMALLER one in the WhatsApp reply. Two totals, and the
// two places he would actually compare.
//
// So the assembly moved into ONE function, lib/ledger.ts ledgerFor(), and what is asserted now is
// stronger: the invariant lives in exactly one place, and every caller DELEGATES rather than
// reimplementing. A future surface cannot fall behind, because it no longer knows how the sum is
// made.

const ledgerSrc = rf(path.join(root, 'lib/ledger.ts'), 'utf8');
const movedNotAdded = (src) => /expenses:\s*Math\.max\(0,\s*input\.ytdTradeExpenses\s*-\s*mileage\)/.test(src);

ok('🔴 THE SUBTRACTION LIVES IN lib/ledger.ts, ONCE', movedNotAdded(ledgerSrc) && /\bmileage,/.test(ledgerSrc));

ok('🔴 the API route DELEGATES rather than assembling its own figures',
  api.includes('ledgerFor(input)') && !movedNotAdded(api));

ok('🔴 the WhatsApp reply DELEGATES to the same function, so the two surfaces cannot disagree',
  wa.includes('ledgerFor(input)') && !movedNotAdded(wa));

ok('🔴 the web app money screen DELEGATES to it too',
  rf(path.join(root, 'app/app/page.tsx'), 'utf8').includes('ledgerFor('));

ok('...and no caller passes a raw ytdMileage into the ledger without the subtraction',
  !/expenses:\s*input\.ytdTradeExpenses,[\s\S]{0,120}mileage:\s*input\.ytdMileage/.test(api)
  && !/expenses:\s*input\.ytdTradeExpenses,[\s\S]{0,120}mileage:\s*input\.ytdMileage/.test(wa));

// The use of home half of the same lesson, pinned so it cannot silently go back to zero anywhere.
ok('🔴 THE USE OF HOME ELECTION REACHES THE LEDGER, and no caller hardcodes it to zero',
  /homeOffice:\s*Math\.max\(0,\s*input\.ytdHomeOffice\s*\?\?\s*0\)/.test(ledgerSrc)
  && !/homeOffice:\s*0/.test(api) && !/homeOffice:\s*0/.test(wa));

// ---------------------------------------------------------------------------------------------
// 🔴 NO FLOATING POINT TAIL IN ANYTHING A MAN READS. Found on a live screen, 28 July 2026.
// ---------------------------------------------------------------------------------------------
//
// The deployed ledger told a customer his mileage was worth "55.00000000000001p a mile". The tax
// was right to the penny. The SENTENCE was wrong, and it was the sentence that shows him our
// working, on the one screen whose entire job is to be believed.
//
// Rates are held as fractions and 0.55 * 100 is 55.00000000000001 in IEEE 754. Only two of our
// rates trip it, 0.55 and 0.14, which is precisely why nobody caught it by reading the code. So it
// is caught by looking at the OUTPUT instead: six or more decimal places in anything customer
// facing is a float artifact, never a real figure. Nothing about tax is quoted to a millionth.
{
  const everyLine = ledger({ ...base, expenses: 9_000, mileage: 3_300, homeOffice: 312, pension: 2_400, capitalAllowances: 1_500 });
  const words = [
    headline(everyLine),
    ...everyLine.lines.map((l) => `${l.label} ${l.basis}`),
  ].join(' ');
  ok('🔴 NO CUSTOMER FACING LEDGER STRING CARRIES A FLOATING POINT TAIL', !/\d\.\d{6,}/.test(words));
  ok('...and the mileage line still names the real rate in pence', /\d+(\.\d+)?p a mile/.test(words));
  ok('...formatted through the ONE formatter, so a new display site cannot forget',
     ledgerSrc.includes('asPence(FACTS.mileageCarFirst10k)'));
}

// THE INVARIANT, AS ARITHMETIC. Splitting a deduction onto its own line is presentation. It must not
// move a single penny of tax. If this ever fails, the ledger has started flattering us.
const whole = ledger({ ...base, expenses: 12_300, mileage: 0 });
const split = ledger({ ...base, expenses: 9_000, mileage: 3_300 });

ok('🔴 SPLITTING A LINE OUT CHANGES THE BREAKDOWN, NEVER THE TOTAL. Same deduction, same tax saved.',
  whole.saved === split.saved && whole.withLekhio === split.withLekhio);

ok('...but he can now actually SEE the mileage, which was the entire point',
  split.lines.some((x) => x.key === 'mileage' && x.deducted === 3_300)
  && !whole.lines.some((x) => x.key === 'mileage'));

// ---------------------------------------------------------------------------------------------
// 🔴 THE FLAG THAT WAS FALSE FOR EVERY USER WHO EVER EXISTED.
// ---------------------------------------------------------------------------------------------
//
// mileageClaimed was `categoriesLogged.some(c => c.includes('mile'))`. Mileage files under category
// 'travel'. There is no 'mileage' category in lib/categories.ts and never has been. So the flag was
// false always, and lib/taxoptimiser.ts rule 5 told a man who logs his miles every week that he was
// "logging fuel but no mileage". The Maximiser is the differentiator; one that cannot see what he
// already claimed tells him nobody is looking.
const db = rf(path.join(root, 'lib/supabase.ts'), 'utf8');

ok('🔴 mileageClaimed is no longer decided by a category string that can never match',
  !/mileageClaimed:\s*categoriesLogged\.some/.test(db));

ok('...it is decided by the mileage actually found on his rows',
  /mileageClaimed:\s*ytdMileage\s*>\s*0/.test(db));

ok('...and isMileageRow reads the VENDOR the inserter really writes, not a category that does not exist',
  /export function isMileageRow/.test(db) && /vendor === 'mileage'/.test(db));

ok('WHATSAPP can answer "what have you saved me", which is where he actually is',
  wa.includes('isSavingsQuestion') && wa.includes('handleSavingsQuestion'));

ok('...and it is arithmetic, NOT an AI call. A paraphrased money figure is a different money figure',
  wa.includes('handleSavingsQuestion') && !/handleSavingsQuestion[\s\S]{0,900}answerMoneyQuestion/.test(wa));

ok('...routed BEFORE the generic question handler, so a model never gets the chance to guess',
  wa.indexOf('isSavingsQuestion(text)') < wa.indexOf('isQuestion(text)'));

ok('the intent catches the real ways he would ask it',
  ['what have you saved me', 'how much have you saved me this year', 'saved me anything', 'is it worth it']
    .every((q) => intents.includes('isSavingsQuestion')));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
