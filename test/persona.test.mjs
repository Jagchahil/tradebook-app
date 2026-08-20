// WHETHER HE TRADES AT ALL, which business structure has never been able to answer.
//
//   node test/persona.test.mjs
//
// 🔴 WHAT THIS SUITE IS DEFENDING, walked live on 31 July 2026 as a landlord signup.
//
// The Landlord chip on /start maps to 'sole_trader', because he files a personal return and he is
// not a company. So he passed every guard in the codebase as a sole trader and was shown the whole
// trade corpus, including this promise, on his own setup screen:
//
//   "If you lose money in your first four years, we can carry that loss back against the wages
//    from your old job. HMRC send you a cheque. Most people never claim it."
//
// That is ITA 2007 s72, early TRADE losses relief. A UK property business loss can only ever be
// carried FORWARD against future profits of the same letting business, and when the business ends
// the carried forward losses are lost. There is no carry back and there is no cheque.
//
// Every assertion below is either that rule, or the safety direction that keeps it from doing
// harm in the other direction: an unknown shape is asked EVERYTHING.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { stageLib } from './stagelib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const P = await import(pathToFileURL(path.join(root, 'lib/persona.ts')).href);
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const { incomeShapeOfSignup, toIncomeShape } = P;
const {
  CIRCUMSTANCES, unanswered, unansweredMtd, progressIn, household, notHousehold, mtdQuestions,
  appliesTo, writtenInFromSignup, TOLD_AT_SIGNUP,
} = C;

// 🔴 THE SIGNAL ENGINE, STAGED AND ACTUALLY RUN, because section 12 is about what a real landlord
// is sent rather than what a file says. lib/agent.ts has imports, so it cannot be loaded bare the
// way the two modules above are: the chain is copied into a temp directory with every extensionless
// relative import given its extension, exactly as test/agent.test.mjs does it.
const stage = stageLib('persona-');
const AGENT = await import(pathToFileURL(path.join(stage, 'agent.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nthe second axis: whether he trades at all');

// ---------------------------------------------------------------------------------------------
// 1. THE TWO MODULES MUST AGREE ON THE LITERALS, because neither imports the other.
// ---------------------------------------------------------------------------------------------
{
  const personaSrc = read('lib/persona.ts');
  const circSrc = read('lib/circumstances.ts');
  const shapeLine = /export type IncomeShape = 'trade' \| 'property_only';/;
  ok('🔴 lib/persona.ts declares IncomeShape as trade or property_only', shapeLine.test(personaSrc));
  ok('🔴 lib/circumstances.ts declares the SAME two literals, re-declared not imported',
    shapeLine.test(circSrc));
  ok('neither module imports the other, so a test can load either one bare',
    !/^import /m.test(personaSrc) && !/^import /m.test(circSrc));
}

// ---------------------------------------------------------------------------------------------
// 2. READING THE SIGNUP. The trade WORD is the only thing that says whether he trades.
// ---------------------------------------------------------------------------------------------
{
  ok('🔴 the Landlord chip means the letting IS the business',
    incomeShapeOfSignup({ trade: 'Landlord', streams: ['property'] }) === 'property_only');
  ok('case and whitespace cannot change the answer: it travels through a form and a database',
    incomeShapeOfSignup({ trade: '  landlord ' }) === 'property_only');
  ok('🔴 A SPARKY WITH A FLAT IS A TRADE, NOT A LANDLORD, though his streams say property too',
    incomeShapeOfSignup({ trade: 'Electrician', streams: ['property'] }) === 'trade');
  ok('...which is exactly why streams alone can never decide this: app/start adds property in BOTH cases',
    read('app/start/page.tsx').includes("trade === 'Landlord' && !streams.includes('property')"));
  ok('a typed trade under Something else is still a trade',
    incomeShapeOfSignup({ trade: 'Mobile dog groomer' }) === 'trade');
  ok('no trade word means UNKNOWN, never a guess', incomeShapeOfSignup({ streams: ['property'] }) === null);
  ok('an empty string is unknown too', incomeShapeOfSignup({ trade: '   ' }) === null);
  ok('no signup at all is unknown', incomeShapeOfSignup(null) === null && incomeShapeOfSignup(undefined) === null);

  ok('a stored value reads back as itself', toIncomeShape('property_only') === 'property_only' && toIncomeShape('trade') === 'trade');
  ok('🔴 anything we did not write reads as UNKNOWN, never as a guess',
    [null, undefined, '', 'Landlord', 'sole_trader', 42, {}].every((v) => toIncomeShape(v) === null));
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE FOUR TRADE PROVISIONS, EACH WITH ITS SOURCE ON THE ENTRY.
// ---------------------------------------------------------------------------------------------
const TRADE_ONLY = ['prior_employment', 'low_profit_year', 'start_date', 'premises', 'vehicle', 'home_working', 'cis'];
{
  ok('🔴 every trade only question carries incomes: [trade] on the entry',
    TRADE_ONLY.every((k) => {
      const c = CIRCUMSTANCES.find((x) => x.key === k);
      return Array.isArray(c.incomes) && c.incomes.length === 1 && c.incomes[0] === 'trade';
    }));
  ok('every other question is for every shape: absent means everyone',
    CIRCUMSTANCES.filter((c) => !TRADE_ONLY.includes(c.key)).every((c) => c.incomes === undefined));

  // The reasoning has to be ON THE ROW, because the day HMRC asks why a landlord was never asked
  // one of these, the answer must not be an archaeology exercise across four files.
  const circSrc = read('lib/circumstances.ts');
  ok('🔴 the carry back refusal cites the rule it rests on', circSrc.includes('ITA 2007 s72') || circSrc.includes('s72'));
  ok('🔴 the Class 2 refusal cites NIM74250', circSrc.includes('NIM74250'));
  ok('🔴 the flat rate refusal cites s94H and BIM75010',
    circSrc.includes('s94H') && circSrc.includes('BIM75010'));
  ok('lib/persona.ts holds the four provisions and their sources in one paragraph',
    ['ITA 2007 s72', 'NIM74250', 's94H', 'CAA 2001 s35'].every((s) => read('lib/persona.ts').includes(s)));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. WHAT EACH MAN IS ACTUALLY ASKED.
// ---------------------------------------------------------------------------------------------
{
  const landlord = unanswered([], { structure: 'sole_trader', income: 'property_only' }).map((c) => c.key);
  const sparky = unanswered([], { structure: 'sole_trader', income: 'trade' }).map((c) => c.key);
  const unknownShape = unanswered([], { structure: 'sole_trader' }).map((c) => c.key);
  const bareString = unanswered([], 'sole_trader').map((c) => c.key);

  ok('🔴 A LANDLORD IS NEVER ASKED WHAT HE DID BEFORE HE WENT SELF EMPLOYED',
    !landlord.includes('prior_employment'));
  ok('🔴 NOR OFFERED VOLUNTARY CLASS 2, WHICH HE CANNOT PAY', !landlord.includes('low_profit_year'));
  ok('🔴 NOR THE USE OF HOME FLAT RATE, WHICH IS A TRADE DEDUCTION', !landlord.includes('home_working'));
  ok('nor the trade start date, the trade premises, or the work van',
    !landlord.includes('start_date') && !landlord.includes('premises') && !landlord.includes('vehicle'));
  ok('a landlord KEEPS everything that does not care how his money arrives',
    ['vat_registered', 'pension', 'married', 'children', 'gift_aid', 'other_job', 'rental']
      .every((k) => landlord.includes(k)));
  ok('a trade keeps all six', TRADE_ONLY.every((k) => sparky.includes(k)));

  ok('🔴 AN UNKNOWN SHAPE IS ASKED EVERYTHING, the safe direction: a failed read must never cost a trade his old job question',
    TRADE_ONLY.every((k) => unknownShape.includes(k)) && unknownShape.length === sparky.length);
  ok('🔴 AND THE OLD CALL SHAPE IS UNCHANGED. A bare structure string still behaves exactly as it did',
    bareString.join(',') === unknownShape.join(','));

  // Both axes at once. A director who is also a landlord is refused on either ground.
  const ltdLandlord = unanswered([], { structure: 'limited_company', income: 'property_only' }).map((c) => c.key);
  ok('the two axes compose: a company that only lets is refused on both grounds at once',
    !ltdLandlord.includes('prior_employment') && !ltdLandlord.includes('home_working')
    && !ltdLandlord.includes('vehicle'));

  ok('a shape filter never leaks a special category question',
    unanswered([], { structure: 'sole_trader', income: 'property_only' }).every((c) => !c.specialCategory));
}

// ---------------------------------------------------------------------------------------------
// 🔴 5. MTD IS DELIBERATELY NOT FILTERED, because it counts property income too.
// ---------------------------------------------------------------------------------------------
{
  const landlordMtd = unansweredMtd([], { structure: 'sole_trader', income: 'property_only' }).map((c) => c.key);
  ok('🔴 A LANDLORD IS STILL ASKED THE MTD GATE: letting for over £50,000 IS mandated',
    landlordMtd.includes('mtd_mandated_letter'));
  ok('and a company still gets no MTD questions at all, on either axis',
    unansweredMtd([], { structure: 'limited_company', income: 'trade' }).length === 0);
  // 🔴 THE WORDING PROBLEM THIS SECTION WAS LOGGING IS NOW SOLVED, NOT FILTERED.
  // The retired gate opened "Do you expect to take more than £50,000 this year ... from SELF
  // EMPLOYMENT and rent put together", which named a stream a landlord does not have, and the row
  // said so in a comment because a stored exhibit cannot be reworded. Its successor asks about
  // HMRC's letter and names neither stream, so one sentence is true for a roofer, a landlord and a
  // man who is both. A guard that only checked the comment still existed would have gone on passing
  // while the thing it described was fixed, so it checks the sentence itself.
  const gateAsk = unansweredMtd([], { structure: 'sole_trader', income: 'property_only' })
    .find((c) => c.key === 'mtd_mandated_letter').ask;
  ok('🔴 AND THE GATE A LANDLORD READS NAMES NEITHER SELF EMPLOYMENT NOR RENT',
    !/self employment/i.test(gateAsk) && !/\brent\b/i.test(gateAsk));
  ok('the reasoning for leaving it untagged is written on the row, not left to be rediscovered',
    read('lib/circumstances.ts').includes('NO `incomes` TAG'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 6. THE COUNT HE IS SHOWN. A question that is not for him is not waiting on him.
// ---------------------------------------------------------------------------------------------
{
  const all = [...household(), ...notHousehold(), ...mtdQuestions()];
  const landlord = progressIn(all, [], { structure: 'sole_trader', income: 'property_only' });
  const sparky = progressIn(all, [], { structure: 'sole_trader', income: 'trade' });
  ok('🔴 the landlord\'s denominator is exactly seven questions lighter, not padded with ones he can never answer',
    landlord.askable === sparky.askable - 7);
  ok('🔴 an answer he gave before we knew his shape STILL COUNTS. The record is his, only the asking stops.',
    progressIn(notHousehold(), [{ key: 'prior_employment', answer: 'yes' }],
      { structure: 'sole_trader', income: 'property_only' }).answered === 1);
}

// ---------------------------------------------------------------------------------------------
// 🔴 7. THE RENT QUESTION HAS TO BE TRUE FOR BOTH MEN, because one question serves both.
// ---------------------------------------------------------------------------------------------
{
  const rental = CIRCUMSTANCES.find((c) => c.key === 'rental');
  ok('🔴 it no longer frames letting as a sideline: a property is named alongside the garage',
    /propert/i.test(rental.ask));
  ok('🔴 AND IT NO LONGER PROMISES AN ALLOWANCE THAT COVERS IT ENTIRELY, full stop',
    !/^There is an allowance that can cover it entirely/.test(rental.why));
  ok('the small case is still said, conditionally', /if it is small/i.test(rental.why));
  ok('🔴 and the real case is said too, in the same breath', /let properly/i.test(rental.why));
  ok('Rent a Room is qualified as needing a lodger in his OWN home, which a let property is not',
    /own home/i.test(rental.source) && /HS223/.test(rental.source));
  ok('the evidence line no longer says "nothing" to a man who must file SA105',
    /SA105/.test(rental.source) && /pages of its own/i.test(rental.evidence));
}

// ---------------------------------------------------------------------------------------------
// 🔴 8. THE COLUMN, AND THE DEGRADE UNTIL IT IS RUN.
// ---------------------------------------------------------------------------------------------
{
  const sql = read('supabase/APPLY_2026-07-31_income_shape.sql');
  ok('the migration adds the column idempotently', /add column if not exists income_shape/i.test(sql));
  ok('🔴 it is nullable with NO default and NO backfill: unknown is the safe direction',
    !/default '/i.test(sql) && !/update public\.users set income_shape/i.test(sql));
  ok('only the two values this codebase writes are accepted',
    /in \('trade', 'property_only'\)/.test(sql));

  const sb = read('lib/supabase.ts');
  ok('getBusinessProfile selects the column', /select=business_type,partnership_share,income_shape/.test(sb));
  ok('🔴 AND FALLS BACK TO THE OLD SELECT IF IT IS NOT THERE YET, so a missing migration cannot also lose the STRUCTURE',
    /getBusinessProfileLegacy/.test(sb));
  ok('the shape is read through toIncomeShape, never trusted verbatim', /toIncomeShape\(r\.income_shape\)/.test(sb));
  ok('🔴 reconcile writes it from the trade word through lib/persona.ts, not from a local rule',
    /incomeShapeOfSignup\(\{ trade: s\.trade/.test(sb));
  ok('🔴 and a profile patch that PostgREST rejects retries WITHOUT the new column, so his name and address still land',
    /delete withoutShape\.income_shape/.test(sb));
  ok('the other_job exhibit no longer asserts self employed work at a landlord',
    !sb.includes('alongside your self-employed work.'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 9. THE PROMISE HE WAS ALREADY GIVEN. The filter stopped the ASKING. It never touched the LOG.
//
// `incomes` stops a landlord being ASKED what he did before he went self employed. It does nothing
// at all for the landlord who ANSWERED that question in June, before the filter existed: his answer
// is drawn back at him on /app/you/circumstances with the `why` under it, and that `why` promises an
// ITA 2007 s72 early trade loss carried back against his old wages, and a cheque from HMRC. A
// property business loss carries forward against future profits of the same letting business and
// nowhere else. He is still reading a promise of money that cannot exist.
//
// THE RESOLUTION, and it is a split rather than a choice: the ROW is a record and stays, drawn and
// changeable and counted; the `why` is a promise and is withheld. Both halves are asserted here,
// because either one alone is the wrong product. Withhold the row and we have edited his history.
// Keep the promise and we are still lying to him.
// ---------------------------------------------------------------------------------------------
{
  const prior = CIRCUMSTANCES.find((c) => c.key === 'prior_employment');
  const married = CIRCUMSTANCES.find((c) => c.key === 'partner_low_earner');
  const pageSrc = read('app/app/you/circumstances/page.tsx');
  const circSrc = read('lib/circumstances.ts');

  ok('🔴 appliesTo says the carry back question is NOT for a landlord',
    appliesTo(prior, { structure: 'sole_trader', income: 'property_only' }) === false);
  ok('...and IS for a trade, and for a man whose shape we do not know',
    appliesTo(prior, { structure: 'sole_trader', income: 'trade' })
    && appliesTo(prior, { structure: 'sole_trader' })
    && appliesTo(prior, 'sole_trader') && appliesTo(prior, null) && appliesTo(prior));
  ok('it reads a bare structure string too, so no caller has to invent a shape it does not know',
    appliesTo(CIRCUMSTANCES.find((c) => c.key === 'home_working'), 'limited_company') === false);

  // 🔴 THE REASON unanswered() COULD NOT BE REUSED, ASSERTED RATHER THAN ARGUED. It also filters on
  // dependsOn, so a married man who has ANSWERED what his wife earns is absent from it, and a page
  // reading that absence as "not for him" would withhold a promise that is perfectly true of him.
  const answeredBoth = [{ key: 'married', answer: 'yes' }, { key: 'partner_low_earner', answer: 'yes' }];
  ok('🔴 unanswered() would wrongly drop partner_low_earner from an ANSWERED list',
    !unanswered(answeredBoth, { structure: 'sole_trader', income: 'trade' }).some((c) => c.key === 'partner_low_earner'));
  ok('🔴 appliesTo keeps it, because it asks one question and it is not "have you answered it"',
    appliesTo(married, { structure: 'sole_trader', income: 'trade' }) === true);

  // THE ROW STILL COUNTS. Section 6 pins the count; this pins that the two decisions are the same
  // decision, taken together, on the same man.
  const landlordWhoAnswered = progressIn(notHousehold(), [{ key: 'prior_employment', answer: 'yes' }],
    { structure: 'sole_trader', income: 'property_only' });
  ok('🔴 THE ROW STILL COUNTS as answered, because it is a record of what he told us',
    landlordWhoAnswered.answered === 1);

  // AND THE PROMISE IS WITHHELD, on the surface the brief named.
  ok('🔴 the page asks the module whether the question is even his', /appliesTo\(q, who\)/.test(pageSrc));
  // ⚠️ THE SHAPE OF THESE TWO LINES CHANGED ON 9 AUGUST 2026 AND THEIR MEANING DID NOT. Walking the
  // product as a non VAT registered sole trader found a promise that is untrue on a THIRD axis: not
  // how he trades and not whether he trades, but WHAT HE ANSWERED. appliesTo() cannot see that, so
  // the rule went on the row (lib/circumstances.ts, untrueOn) and the page now resolves both axes
  // into one `withheld`. test/vatpromise.test.mjs owns the new axis. These two assertions still own
  // OURS, and are written so that deleting `mine` from the page turns them red exactly as before.
  ok('🔴 and prints the `why` ONLY when it is',
    /const withheld = mine \? untrue : NOT_HIS;/.test(pageSrc)
    && /\{withheld \? <p style=\{S\.notHis\}>\{withheld\}<\/p> : <p style=\{S\.why\}>\{q\.why\}<\/p>\}/.test(pageSrc));
  ok('the plain sentence that stands in its place promises nothing and names no figure',
    /does not apply to a business like yours/.test(pageSrc) && !/£/.test(pageSrc.split('const NOT_HIS')[1].split(';')[0]));
  ok('the answer stays drawn and changeable, and the sentence says so',
    /Your answer stays on your record/.test(pageSrc));
  ok('the claimant line goes with the promise: it is the other half of a claim he cannot make',
    /\{!withheld && whose \?/.test(pageSrc));

  ok('🔴 THE RESOLUTION IS WRITTEN DOWN ON THE PAGE, not just implemented',
    pageSrc.includes('THE ROW STAYS, DRAWN AND CHANGEABLE AND COUNTED. THE PROMISE IS WITHHELD'));
  ok('...and the module says the same thing where appliesTo is defined',
    circSrc.includes('THE ROW STAYS, THE PROMISE GOES'));
  ok('the module records why unanswered() could not be reused for it',
    circSrc.includes('unanswered() CANNOT BE REUSED FOR THIS'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 10. THE PENSION PROMISE. Relief is capped by RELEVANT UK EARNINGS, and rent is not earnings.
//
// FA 2004 s189. A man whose only business is letting is limited to £3,600 gross a year and has no
// higher rate slice to reclaim, so "The higher rate slice does NOT go in automatically, you have to
// claim it" was us sending him after money he cannot have. The QUESTION is still worth asking him.
// The wording is what had to change, and it changed as ONE `why` rather than two, which is the
// decision this section pins so it cannot be quietly reversed into a second field nobody selects.
// ---------------------------------------------------------------------------------------------
{
  const pension = CIRCUMSTANCES.find((c) => c.key === 'pension');
  const circSrc = read('lib/circumstances.ts');

  ok('🔴 a landlord is STILL asked whether he pays into a pension',
    unanswered([], { structure: 'sole_trader', income: 'property_only' }).some((c) => c.key === 'pension'));
  ok('🔴 and the old unconditional higher rate promise is gone',
    !/The higher rate slice does NOT/.test(pension.why));
  ok('🔴 the why says relief comes off what he EARNS BY WORKING, which rent is not',
    /earn by working/i.test(pension.why) && /rent is not earnings/i.test(pension.why));
  ok('the higher rate is now conditional, not asserted', /Any higher rate does not/.test(pension.why));
  ok('the source cites FA 2004 s189 and the £3,600 cap a pure landlord is held to',
    /FA 2004 s189/.test(pension.source) && /3,600/.test(pension.source));

  // The DATA, not the file text: the comment above the entry argues the choice out loud and would
  // match any grep for a second field name. What matters is that no entry actually carries one.
  ok('🔴 ONE `why` PER QUESTION. No second wording field was added for a property only customer',
    CIRCUMSTANCES.every((c) => Object.keys(c).filter((k) => k.startsWith('why')).length === 1));
  ok('...and the reason that choice was made is on the entry, not in a commit message',
    circSrc.includes('AND THE FIX IS ONE REWORDED `why`, NOT A SECOND `why` FIELD'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 11. AN ANSWER WE WROTE IN FOR HIM IS NOT AN ANSWER HE GAVE.
//
// A Landlord signup ticks the property stream on /start and the signup reconcile writes
// `rental: yes` on his behalf, storing a STATEMENT as the exhibit because it never was a question.
// He never saw the rental question. Two surfaces then read it back as something he did: the reveal
// congratulated him for answering it and told him nobody ever asks him about it, and the
// circumstances page said "You said yes".
// ---------------------------------------------------------------------------------------------
{
  const sb = read('lib/supabase.ts');
  const rentalExhibit = 'You told us at signup that you have rental property.';
  const jobExhibit = 'You told us at signup that you also have a job on the payroll.';

  ok('🔴 the prefix this module recognises is the one lib/supabase.ts actually writes, both times',
    sb.includes(rentalExhibit) && sb.includes(jobExhibit)
    && rentalExhibit.startsWith(TOLD_AT_SIGNUP) && jobExhibit.startsWith(TOLD_AT_SIGNUP));
  ok('the rental and job exhibits are both recognised as written in for him',
    writtenInFromSignup(rentalExhibit) && writtenInFromSignup(jobExhibit));
  ok('a real question he was actually shown is not',
    !writtenInFromSignup(CIRCUMSTANCES.find((c) => c.key === 'rental').ask));
  ok('🔴 NOR IS THE VAT ONE, and that is the point of matching the sentence rather than the channel: '
    + 'he really did answer "are you VAT registered" on the web form, so it is his answer',
    !writtenInFromSignup('Are you VAT registered? (you answered this when you signed up on the Lekhio website)'));
  ok('a missing or junk exhibit is never treated as written in for him',
    [null, undefined, '', 42, {}].every((v) => writtenInFromSignup(v) === false));

  const pageSrc = read('app/app/you/circumstances/page.tsx');
  ok('🔴 the circumstances page no longer says "You said yes" to an answer he never gave',
    /writtenInFromSignup\(asked\)/.test(pageSrc) && /You told us this when you signed up/.test(pageSrc));
  ok('...and it says plainly that he has not been asked it there',
    /You have not been asked it here/.test(pageSrc));

  const setupSrc = read('app/app/setup/page.tsx');
  ok('🔴 the reveal no longer counts it among the questions he has just answered',
    /answer === 'yes' && !writtenInFromSignup\(r\.asked\)/.test(setupSrc));
  ok('and the reveal records why, so nobody puts it back',
    setupSrc.includes('THIS SCREEN IS A CONGRATULATION'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 12. THE MTD COMBINED TRAP, WHICH A PURE LANDLORD MUST KEEP GETTING AND COULD NOT READ.
//
// Making Tax Digital for Income Tax counts qualifying income from self employment AND property, so
// a man letting for more than the threshold with no trade at all is mandated and this ping is his.
// Its condition, "trade under the line, trade plus rent over it", is met by a trade of zero, and
// the copy then told him his trade alone was £0, that the combination crossed the line, and that
// most landlords with a day trade miss it. He has no trade and no combination.
// ---------------------------------------------------------------------------------------------
{
  const today = new Date('2026-12-15T00:00:00Z');
  const months = (count, perMonth) => {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      out.push({
        month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        income: perMonth, expenses: 0, cis: 0,
      });
    }
    return out;
  };
  const agentInput = (ms, property) => ({
    today, months: ms, week: null, property, invoices: null, categories: null,
    unconfirmedCount: 0, equipmentSpendYtd: 0, studentLoanPlan: null, studentLoanPostgrad: false,
    employmentIncome: 0, goals: [],
  });
  const trap = (sig) => sig.find((s) => s.signalKey === 'mtd_combined_trap');

  // A PURE LANDLORD. Nine months of the tax year at £6,200 of rent a month: £55,800, all of it rent,
  // so the trade is zero and the combined figure is the rent.
  const rents = 6200 * 9;
  const landlord = trap(AGENT.computeSignals(agentInput(
    months(9, 6200), { rents, expenses: 4000, finance: 0, rents12: rents },
  )));

  ok('🔴 THE LANDLORD IS STILL TOLD. The signal is not suppressed for him', Boolean(landlord));
  ok('and it still reaches him as a ping, not a card he may never open', landlord.priority === 'ping');
  ok('🔴 it no longer tells him his trade alone is £0', !/trade alone/i.test(landlord.body) && !/£0\b/.test(landlord.body));
  ok('🔴 nor calls him a landlord with a day trade', !/day trade/i.test(landlord.body));
  ok('nor claims a combination he does not have',
    !/together/i.test(landlord.title) && !/combined/i.test(landlord.body));
  ok('🔴 it says the true thing instead: property income counts, and his rent clears the line alone',
    /counts property income/i.test(landlord.body) && /on its own/i.test(landlord.body)
    && landlord.body.includes('£55,800') && landlord.body.includes('£50,000'));
  ok('the WhatsApp line says the same and never mentions a trade he has not got',
    /on its own/i.test(landlord.waText) && !/trade/i.test(landlord.waText.replace(/self employment/g, '')));

  // A SPARKY WITH A FLAT. The original case, and it must be untouched: the trap exists because each
  // stream on its own looks safe, so both figures have to stay on the screen.
  const both = trap(AGENT.computeSignals(agentInput(
    months(9, 6100), { rents: 24300, expenses: 3000, finance: 0, rents12: 24300 },
  )));
  ok('🔴 the trade case still fires and still names BOTH streams with both figures',
    both && both.body.includes('£30,600') && both.body.includes('£24,300'));
  ok('...and still says they cross it together, which is the whole point of the signal',
    /together/i.test(both.title) && /TOGETHER/.test(both.body));

  for (const s of [landlord, both]) {
    ok('no forbidden dash in either wording', !/[–—−]/.test(s.title + s.body + s.waText));
  }
}

// ---------------------------------------------------------------------------------------------
// 🔴 13. USE OF HOME: THE FLAT RATE REPLACES HIS ACTUAL BILLS, AND EVERY PLACE WE NAME MUST SAY SO.
//
// It lives in this suite because the flat rate is one of the four trade provisions lib/persona.ts
// exists to withhold, and because the honesty of the sentence is the same kind of fact as the rest
// of this file: what a man is told about a relief has to be true of the relief.
//
// HMRC allows the flat rate OR a share of his actual household bills, never both. lib/elections.ts
// used to assert in its header that "every place we describe it says plainly that it replaces
// claiming actual home bills". lib/ledger.ts's use of home line did not say it, and neither did the
// `why` under the home working question. A header claiming a property of the codebase that nothing
// checks is how a comment becomes something everybody believes.
// ---------------------------------------------------------------------------------------------
{
  const exclusive = /(cannot have both|never as well as|rather than as well as)/i;
  const replaces = /actual home bills/i;

  const homeWorking = CIRCUMSTANCES.find((c) => c.key === 'home_working').why;
  ok('🔴 the home working question says the flat rate replaces a share of his actual bills',
    replaces.test(homeWorking) && exclusive.test(homeWorking));

  const ledgerLine = (read('lib/ledger.ts').match(/key: 'home_office'[\s\S]{0,400}?basis: '([^']+)'/) || [])[1] || '';
  ok('🔴 THE LEDGER LINE SAYS IT TOO, which is the screen where he reads what he is claiming',
    replaces.test(ledgerLine) && exclusive.test(ledgerLine));

  const elections = read('lib/elections.ts');
  const confirmation = (elections.match(/'No receipts to keep\.([^']+)'/) || [])[1] || '';
  ok('the confirmation he gets the moment he elects still says it', replaces.test(confirmation) && exclusive.test(confirmation));

  // The LIVE claim is the tail of the header's own sentence. The old over claim is still in the
  // file, quoted, as the correction that explains why the sentence changed, which is the opposite
  // of the failure: what may not survive is the ASSERTION, not the record that we once made it.
  const liveClaim = (elections.match(/the election is flat rate\n\/\/ only, and ([^\n]+)/) || [])[1] || '';
  ok('🔴 and the header no longer claims a property of the whole codebase that nobody checks',
    liveClaim.length > 0 && !/every place/.test(liveClaim));
  ok('the over claim is kept as a quoted correction rather than quietly deleted',
    elections.includes('THAT SENTENCE USED TO END'));
  ok('...and it names the three places that do say it, and the two that still do not',
    elections.includes('lib/taxoptimiser.ts rule 4') && elections.includes('handleHomeOffice'));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
