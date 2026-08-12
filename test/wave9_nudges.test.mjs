// WAVE NINE, THE NUDGES: the landlord gate on the trade signals, and the two bank sentences that
// pointed at a door that does not open.
//
//   node test/wave9_nudges.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE PROTECTS, AND WHY EACH HALF IS WORTH A TEST OF ITS OWN.
//
// 1. THE VOLUNTARY CLASS 2 PROMISE A LANDLORD CANNOT USE. HMRC NIM74250: "A person whose activities
//    in managing the property are those generally associated with being a landlord would not meet
//    the definition of gainful employment for self-employed NICs purposes." No gainful employment
//    means no relevant profits, no small profits threshold to fall under, and NO voluntary Class 2
//    to buy a qualifying year with. His route is Class 3, at several times the price.
//
//    lib/agent.ts built that promise off a PROFIT test, and derive() sums every month bucket, which
//    contains the RENT. So a landlord having a lean year was quoted a cheap number for a thing that
//    is not on offer to him. lib/waintents.ts said the same in his WhatsApp NI answer. The same
//    axis withholds the trade only reliefs beside it: the s94H flat rate, the Part 6A trading
//    allowance, the trade shaped expense checklist, and the two Annual Investment Allowance nudges
//    that CAA 2001 s35 denies on plant in a dwelling house.
//
//    ⚠️ AND THE HALF THAT MATTERS MORE: UNKNOWN MUST BEHAVE EXACTLY AS TODAY. NIM74250 carries its
//    own exception, that a guest house or a hotel IS a trade, so an absence of information is never
//    evidence of letting. A landlord can ignore a sentence that does not fit him. A sparky silently
//    never told about his pension year loses a qualifying year he cannot get back cheaply. So most
//    of the assertions below are about the signals that must STILL fire.
//
// 2. THE BANK SENTENCES. There is no bank provider: TrueLayer declined production authorisation on
//    30 July and Finexer want £650 a month before a single connection. bankFeedOffered() went into
//    lib/bankfeed.ts, default OFF, and every dead bank sentence in app/ went behind it. Two did
//    not, both in lib/, because they are copy in a module rather than copy on a screen and a sweep
//    of the JSX found neither. They fire at the two worst moments to send a man nowhere: right
//    after we refused to read his receipt, and on the single message of his whole trial.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');

// The flag is read at CALL time in all three modules, so the suite owns it outright rather than
// inheriting whatever the shell had. Deleted first so the default under test is the real default.
delete process.env.BANK_FEED_OFFERED;

// lib/agent.ts composes the structure-aware spine, so stage the whole chain and rewrite every
// relative import to .ts, exactly as test/agent.test.mjs and test/agentstructure.test.mjs do.
const stage = mkdtempSync(path.join(tmpdir(), 'wave9nudge-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'money', 'nistudentloan', 'propertyengine', 'ltdengine', 'personalincome', 'partnership', 'position', 'rakhamoves', 'waintents', 'agent']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
// lib/trialnudge.ts imports lib/watemplates.ts with an extensionless specifier, so it is staged the
// same way test/trialnudge.test.mjs stages it.
writeFileSync(path.join(stage, 'watemplates.ts'), readFileSync(path.join(lib, 'watemplates.ts'), 'utf8'));
writeFileSync(
  path.join(stage, 'trialnudge.ts'),
  readFileSync(path.join(lib, 'trialnudge.ts'), 'utf8').replace("from './watemplates'", "from './watemplates.ts'"),
);

const A = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);
const W = await import(pathToFileURL(path.join(lib, 'waintents.ts')).href);
const P = await import(pathToFileURL(path.join(lib, 'persona.ts')).href);
const N = await import(pathToFileURL(path.join(lib, 'banknudge.ts')).href);
const BF = await import(pathToFileURL(path.join(lib, 'bankfeed.ts')).href);
const TN = await import(pathToFileURL(path.join(stage, 'trialnudge.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${name}`);
  }
};

console.log('\n=== wave9 nudges: the landlord gate and the bank sentences ===\n');

// --- helpers -------------------------------------------------------------------
// Contiguous months ending at (and including) the month of `today`, the same helper shape
// test/agent.test.mjs uses, so projections are stable and history exists.
function monthsFor(today, count, { incomePerMonth = 0, expensesPerMonth = 0, cisPerMonth = 0 } = {}) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    out.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      income: incomePerMonth,
      expenses: expensesPerMonth,
      cis: cisPerMonth,
    });
  }
  return out;
}
function input(today, months, extra = {}) {
  return {
    today,
    months,
    week: null,
    property: null,
    invoices: null,
    categories: null,
    unconfirmedCount: 0,
    equipmentSpendYtd: 0,
    studentLoanPlan: null,
    studentLoanPostgrad: false,
    employmentIncome: 0,
    goals: [],
    ...extra,
  };
}
const keys = (signals) => signals.map((s) => s.signalKey);
const has = (signals, key) => keys(signals).includes(key);
const landlord = (i) => A.computeSignalsForStructure({ ...i, incomeShape: 'property_only' });
const trade = (i) => A.computeSignalsForStructure({ ...i, incomeShape: 'trade' });
const NO_DASH = /[–—−]/;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1. THE TYPE ITSELF. Three modules re-declare the same literal union rather than importing it,
// because Node's type stripping cannot resolve an extensionless relative import and the suites that
// load them would break on module resolution rather than on anything real. Re-declaration is only
// safe while something pins the copies together, so this is that something.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const unionOf = (file) => {
  const m = readFileSync(path.join(lib, file), 'utf8').match(/export type IncomeShape = ([^;]+);/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
};
ok('lib/persona.ts declares the income shape union', unionOf('persona.ts') === "'trade' | 'property_only'");
ok('lib/agent.ts re-declares it identically', unionOf('agent.ts') === unionOf('persona.ts'));
ok('lib/waintents.ts re-declares it identically', unionOf('waintents.ts') === unionOf('persona.ts'));
// And the value side: what persona hands back is what the gates below actually match on.
ok('the Landlord chip resolves to property_only', P.incomeShapeOfSignup({ trade: 'Landlord' }) === 'property_only');
ok('any other trade resolves to trade', P.incomeShapeOfSignup({ trade: 'Electrician' }) === 'trade');
ok('an unanswered signup is unknown, never a guess', P.incomeShapeOfSignup({ trade: null }) === null);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2. THE CLASS 2 PENSION YEAR. NIM74250, the finding this whole gate exists for.
//
// A lean year late in the tax year. The signal's own guard is d.ytdProfit < the small profits
// threshold with no salary covering him, and derive() sums the rent into that profit, so a landlord
// reaches it on exactly the numbers a struggling sparky reaches it on.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const feb = new Date('2027-02-10T00:00:00Z');
const lean = input(feb, monthsFor(feb, 12, { incomePerMonth: 500, expensesPerMonth: 100 }), { categories: ['rent'] });

ok('🔴 a lean landlord is NOT offered voluntary Class 2', !has(landlord(lean), 'class2_pension_year'));
ok('a lean trade still is, on the same figures', has(trade(lean), 'class2_pension_year'));
ok('an UNKNOWN shape still is, because unknown asks everything',
  has(A.computeSignalsForStructure(lean), 'class2_pension_year'));
ok('an explicit null shape still is, because null is unknown',
  has(A.computeSignalsForStructure({ ...lean, incomeShape: null }), 'class2_pension_year'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3. THE FLAT RATE, THE TRADING ALLOWANCE AND THE TRADE SHAPED CHECKLIST.
//
//   use of home            ITTOIA 2005 s94H is a simplified expense, a deduction in computing the
//                          profits of a TRADE, and BIM75010 restricts the hours based flat rate to
//                          individuals and partnerships of individuals carrying one on. A property
//                          business deducts a proportion of its actual costs instead (PIM2220).
//   trading allowance      ITTOIA 2005 Part 6A, set against TRADING income. Property income has its
//                          own separate £1,000 allowance with its own rules. Never the same relief.
//   expense completeness   its own copy says "Claims most trades have" and lists public liability
//                          or tool insurance, mileage or fuel, and tools and equipment.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const dec = new Date('2026-12-10T00:00:00Z');
const midYear = input(dec, monthsFor(dec, 12, { incomePerMonth: 3000, expensesPerMonth: 400 }), {
  categories: ['rent', 'materials'],
});
ok('🔴 a landlord is not sold the use of home flat rate', !has(landlord(midYear), 'home_office_saving'));
ok('a trade still gets it', has(trade(midYear), 'home_office_saving'));
ok('an unknown shape still gets it', has(A.computeSignalsForStructure(midYear), 'home_office_saving'));

ok('🔴 a landlord is not shown the trade expense checklist', !has(landlord(midYear), 'expense_completeness'));
ok('a trade still is', has(trade(midYear), 'expense_completeness'));
ok('an unknown shape still is', has(A.computeSignalsForStructure(midYear), 'expense_completeness'));

// Costs running under £1,000 against a real gross, six months in, is what surfaces the allowance.
const lowCost = input(dec, monthsFor(dec, 12, { incomePerMonth: 2500, expensesPerMonth: 30 }), {
  categories: ['rent', 'home office'],
});
ok('🔴 a landlord is never told the TRADING allowance beats his costs',
  !has(landlord(lowCost), 'trading_allowance_saving'));
ok('a trade still is', has(trade(lowCost), 'trading_allowance_saving'));
ok('an unknown shape still is', has(A.computeSignalsForStructure(lowCost), 'trading_allowance_saving'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4. THE TWO ANNUAL INVESTMENT ALLOWANCE NUDGES. CAA 2001 s35 denies plant and machinery allowances
// for expenditure on plant in a DWELLING HOUSE, which is most of what a residential landlord buys.
// Both signals state flatly that the whole cost comes off this year's profit, and one of them
// prices an exact after tax figure off a goal the man typed in his own words.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const mar = new Date('2027-03-15T00:00:00Z');
const strongYear = monthsFor(mar, 12, { incomePerMonth: 6000, expensesPerMonth: 500 });
const nearYearEnd = input(mar, strongYear, { categories: ['rent'] });
ok('🔴 a landlord is not told to buy kit before 5 April', !has(landlord(nearYearEnd), 'aia_timing'));
ok('a trade still is', has(trade(nearYearEnd), 'aia_timing'));
ok('an unknown shape still is', has(A.computeSignalsForStructure(nearYearEnd), 'aia_timing'));

const withGoal = input(mar, strongYear, {
  categories: ['rent'],
  goals: [{ id: 'aaaabbbb-0000-0000-0000-000000000000', kind: 'purchase', title: 'a new boiler', amount: 6000, targetDate: null }],
});
ok('🔴 a landlord is not given an after tax price for his goal under the AIA',
  !has(landlord(withGoal), 'goal_purchase_timing'));
ok('a trade still is', has(trade(withGoal), 'goal_purchase_timing'));
ok('an unknown shape still is', has(A.computeSignalsForStructure(withGoal), 'goal_purchase_timing'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5. THE GATE ONLY EVER REMOVES, AND IT REMOVES ONLY THE TRADE SET.
//
// The signals that watch a LANDLORD are the ones he most needs, so the first thing to prove is that
// the landlord gate did not take the landlord's own signals with it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A man whose only money in is the rent, so the engine's derived trade slice is genuinely nothing.
const withProperty = input(dec, monthsFor(dec, 12, { incomePerMonth: 7000, expensesPerMonth: 1000 }), {
  categories: ['rent'],
  property: { rents: 63000, expenses: 3000, finance: 6000, rents12: 84000 },
});
ok('🔴 Section 24 still reaches the landlord it was written for', has(landlord(withProperty), 's24_exposure'));
ok('🔴 and the April 2027 property rates preview does too', has(landlord(withProperty), 'property_rates_2027'));
// Making Tax Digital counts property income, so it must survive in whichever of its two forms the
// figures produce. Which one is the engine's business, not this gate's.
ok('so does Making Tax Digital, which counts property income too',
  keys(landlord(withProperty)).some((k) => k.startsWith('mtd_')));
ok('and the whole person thresholds, which a landlord crosses like anybody else',
  has(landlord(withProperty), 'higher_rate_approach') && has(landlord(withProperty), 'poa_cliff'));

// Nothing is ever added, reworded or reordered by the gate: it is a filter and only a filter.
for (const [label, i] of [['lean', lean], ['mid year', midYear], ['low cost', lowCost], ['near year end', withGoal], ['landlord facts', withProperty]]) {
  const all = A.computeSignalsForStructure(i);
  const gated = landlord(i);
  const allJson = all.map((s) => JSON.stringify(s));
  ok(`the gate only subtracts, never edits (${label})`,
    gated.length <= all.length && gated.every((s) => allJson.includes(JSON.stringify(s))));
  ok(`the survivors keep their order (${label})`,
    JSON.stringify(keys(gated)) === JSON.stringify(keys(all).filter((k) => keys(gated).includes(k))));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6. THE SAFETY RULE, PINNED WHOLE. An unknown shape must come out BYTE FOR BYTE as the raw engine,
// which is the same promise test/agentstructure.test.mjs makes for the sole trader baseline. This
// is the assertion that would go red if anybody ever made unknown mean "assume landlord".
// ═══════════════════════════════════════════════════════════════════════════════════════════
for (const [label, i] of [['lean', lean], ['mid year', midYear], ['low cost', lowCost], ['near year end', withGoal], ['landlord facts', withProperty]]) {
  const raw = JSON.stringify(A.computeSignals(i));
  ok(`🔴 undefined shape is byte identical to the raw engine (${label})`,
    JSON.stringify(A.computeSignalsForStructure(i)) === raw);
  ok(`🔴 null shape is byte identical to the raw engine (${label})`,
    JSON.stringify(A.computeSignalsForStructure({ ...i, incomeShape: null })) === raw);
  ok(`🔴 a known trade is byte identical to the raw engine (${label})`,
    JSON.stringify(trade(i)) === raw);
  ok(`an unrecognised value is treated as unknown, never as a guess (${label})`,
    JSON.stringify(A.computeSignalsForStructure({ ...i, incomeShape: 'lettings' })) === raw);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 7. THE WHATSAPP NI ANSWER. The same NIM74250 sentence, said out loud on the channel most of them
// actually use.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const niLow = (extra) => W.niAnswer({
  profit: 5000, salary: 0, class1: 0, class4: 0, class2Annual: 189.8,
  qualifies: false, voluntarySuggested: true, ...extra,
});
// Careful with the wording of these two. The new sentence has to SAY "voluntary Class 2" in order
// to say it is not open to him, so the thing to pin is the PRICE and the PROMISE, not the phrase.
ok('🔴 a landlord is never quoted the voluntary Class 2 price',
  !/189\.80/.test(niLow({ incomeShape: 'property_only' })));
ok('🔴 and never told it protects his year',
  !/protects it/.test(niLow({ incomeShape: 'property_only' })));
ok('he is told plainly that it is not open to him',
  /not open to you/.test(niLow({ incomeShape: 'property_only' })));
ok('and he is told the route that IS open to him', /Class 3/.test(niLow({ incomeShape: 'property_only' })));
ok('and where to check which years are short', /GOV\.UK/.test(niLow({ incomeShape: 'property_only' })));
ok('a trade still gets the Class 2 answer', /Voluntary Class 2/.test(niLow({ incomeShape: 'trade' })));
ok('an unknown shape still gets it, unchanged', niLow({}) === niLow({ incomeShape: 'trade' }));
ok('an unknown shape still carries the figure', /189\.80/.test(niLow({})));

// The other face of the same defect: qualifiesViaProfits is not a qualifying route for a landlord,
// so "your year looks covered" must not rest on rent alone. With no salary the flag can only have
// come from profits, which is what makes the salary test the honest discriminator.
const niCovered = (extra) => W.niAnswer({
  profit: 30000, salary: 0, class1: 0, class4: 1045.8, class2Annual: 189.8,
  qualifies: true, voluntarySuggested: false, ...extra,
});
ok('🔴 rent alone never counts as a covered pension year',
  !/looks covered/.test(niCovered({ incomeShape: 'property_only' })));
ok('and he is told why, not just left with nothing', /Class 3/.test(niCovered({ incomeShape: 'property_only' })));
ok('a landlord with a payslip keeps the true answer',
  /looks covered/.test(niCovered({ incomeShape: 'property_only', salary: 30000, class1: 2400 })));
ok('a trade is untouched', /looks covered/.test(niCovered({ incomeShape: 'trade' })));
ok('an unknown shape is untouched', niCovered({}) === niCovered({ incomeShape: 'trade' }));
ok('the NI answers never claim we file his tax',
  !/we will file|we file your|do your tax/i.test(niLow({ incomeShape: 'property_only' }) + niCovered({ incomeShape: 'property_only' })));
ok('and carry no forbidden dashes',
  !NO_DASH.test(niLow({ incomeShape: 'property_only' }) + niCovered({ incomeShape: 'property_only' })));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 8. THE BANK SENTENCES. Off is the default and the honest state today.
//
// The two modules keep their own copy of the flag read, because neither may import lib/bankfeed.ts
// without breaking the suite that loads it. So the first thing to prove is that all three copies
// answer the same question, and the rest is what the copy says on each side of it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const OFFERABLE = { available: true, connected: false };
const emptyWeek = { income: 0, expenses: 0, profit: 0, saved: null, hasAnything: false };

const readsTheFlag = (file) => /process\.env\.BANK_FEED_OFFERED === 'true'/.test(readFileSync(path.join(lib, file), 'utf8'));
ok('lib/banknudge.ts reads the same env var lib/bankfeed.ts reads', readsTheFlag('banknudge.ts'));
ok('lib/trialnudge.ts reads the same env var', readsTheFlag('trialnudge.ts'));
ok('and lib/bankfeed.ts is still the module that defines it', readsTheFlag('bankfeed.ts'));

delete process.env.BANK_FEED_OFFERED;
ok('🔴 the offer is OFF by default, which is the honest state today', BF.bankFeedOffered() === false);

const offOffer = N.bankOfferLine({ available: true, connected: false });
const offBusy = N.busyMessage('user_daily_cap', OFFERABLE);
const offMilestone = N.receiptMilestoneNudge(5, OFFERABLE);
const offTrial = TN.trialWeekMessage(emptyWeek).body;

for (const [label, copy] of [['the cap offer', offOffer], ['the busy message', offBusy], ['the milestone nudge', offMilestone], ['the trial week email', offTrial]]) {
  ok(`🔴 ${label} never names a bank we cannot connect`, !/connect your bank/i.test(copy));
  ok(`${label} names a door that opens today`, /upload a bank statement/i.test(copy));
  ok(`${label} carries no forbidden dashes`, !NO_DASH.test(copy));
}
ok('the trial email links the upload screen rather than describing it', offTrial.includes('/app/money/upload'));
ok('the trial email still names the eleven banks we can actually read', /eleven UK banks/.test(offTrial));
ok('the trial email keeps the rest of the message whole', offTrial.includes('/app/thread') && offTrial.includes('ends tomorrow'));
ok('the trial email never writes the rival domain', !/lekhio\.(?!app)/i.test(offTrial));
ok('the empty week still says plainly that there is nothing in his books yet',
  offTrial.includes('nothing in your books yet'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 9. AND ON. The day a provider signs, one env var puts every original sentence back, unchanged.
// ═══════════════════════════════════════════════════════════════════════════════════════════
process.env.BANK_FEED_OFFERED = 'true';
ok('the flag turns the offer on', BF.bankFeedOffered() === true);
ok('the cap offer returns to the original wording, to the letter',
  N.bankOfferLine({ available: true, connected: false }) === 'Want to stop hitting this? Connect your bank in the Lekhio app. Every payment in and out gets logged for you automatically, with no daily limit and no photos to remember.');
ok('the busy message offers the bank again', /Connect your bank/.test(N.busyMessage('user_daily_cap', OFFERABLE)));
ok('the milestone nudge returns to the original wording, to the letter',
  N.receiptMilestoneNudge(5, OFFERABLE) === 'That is five receipts today. You do not have to keep doing this. Connect your bank in the Lekhio app and anything you pay by card or transfer is logged for you the moment it happens.');
ok('the trial week email returns to the original sentence, to the letter',
  TN.trialWeekMessage(emptyWeek).body.includes('Connect your bank and everything you spend lands here on its own, with nothing for you to send us.'));

// Only the exact string switches it on. Anything else is off, the same way lib/bankfeed.ts reads it.
for (const wrong of ['TRUE', '1', 'yes', 'true ', '']) {
  process.env.BANK_FEED_OFFERED = wrong;
  ok(`only the exact string 'true' switches the offer on (tried ${JSON.stringify(wrong)})`,
    BF.bankFeedOffered() === false && !/connect your bank/i.test(N.bankOfferLine({ available: true, connected: false })) && !/connect your bank/i.test(TN.trialWeekMessage(emptyWeek).body));
}
delete process.env.BANK_FEED_OFFERED;

// The gate touches only the OFFERING of a new connection. A man who already has one is a different
// conversation and the flag has no business in it.
ok('an existing connection is never gated, whatever the flag says',
  N.busyMessage('user_daily_cap', { available: true, connected: true }).includes('still being logged'));
// And our own caps keep taking the blame, which was the original point of the file.
ok('our own caps still say we are busy rather than pitching anything',
  N.busyMessage('kill_switch', OFFERABLE).startsWith('I am a bit busy right now'));

console.log(`\nwave9 nudges: ${pass} passed, ${fail} failed.\n`);
if (fail > 0) process.exit(1);
