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

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const P = await import(pathToFileURL(path.join(root, 'lib/persona.ts')).href);
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const { incomeShapeOfSignup, toIncomeShape } = P;
const { CIRCUMSTANCES, unanswered, unansweredMtd, progressIn, household, notHousehold, mtdQuestions } = C;

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
const TRADE_ONLY = ['prior_employment', 'low_profit_year', 'start_date', 'premises', 'vehicle', 'home_working'];
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
    landlordMtd.includes('mtd_mandated'));
  ok('and a company still gets no MTD questions at all, on either axis',
    unansweredMtd([], { structure: 'limited_company', income: 'trade' }).length === 0);
  ok('the wording problem is written on the row rather than silently filtered',
    read('lib/circumstances.ts').includes('CARRIES NO `incomes` TAG'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 6. THE COUNT HE IS SHOWN. A question that is not for him is not waiting on him.
// ---------------------------------------------------------------------------------------------
{
  const all = [...household(), ...notHousehold(), ...mtdQuestions()];
  const landlord = progressIn(all, [], { structure: 'sole_trader', income: 'property_only' });
  const sparky = progressIn(all, [], { structure: 'sole_trader', income: 'trade' });
  ok('🔴 the landlord\'s denominator is exactly six questions lighter, not padded with ones he can never answer',
    landlord.askable === sparky.askable - 6);
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
    /income_shape: _dropped/.test(sb));
  ok('the other_job exhibit no longer asserts self employed work at a landlord',
    !sb.includes('alongside your self-employed work.'));
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
