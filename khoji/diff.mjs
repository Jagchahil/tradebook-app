// Khoji's differ. The reason Khoji exists (docs/105 section 0).
//
//   "Khoji's job is not to know things. It is to notice that WE are wrong."
//
// Anyone can scrape GOV.UK. What nobody else can do is read the live law, read OUR tax engine,
// and say: GOV.UK says 55p. Your code says 45p. Here is the line. Here is the source.
//
// ---------------------------------------------------------------------------------------------
// WHY watch.mjs COULD NEVER HAVE CAUGHT THE BUG WE ACTUALLY HAD
//
// watch.mjs is a CHANGE detector. It hashes a page and files a row when the hash moves. That is
// a fine way to notice news and a useless way to notice that you are wrong, for two reasons:
//
//   1. It compares GOV.UK to GOV.UK YESTERDAY. It never compares GOV.UK to US. Nothing in the
//      system had ever performed the subtraction.
//   2. It asked a language model, which had never seen our engine, to guess `engine_impact`.
//      On 8 July it read the mileage page, saw an employer's guide about employees' cars,
//      correctly judged it was not about our users, scored it 0.15 and marked it false. It was
//      answering the question we asked. The question was wrong.
//
// Meanwhile it fired `engine_impact: true` at 0.95 confidence on three pages that had not
// changed and where our engine was already right. Confidence was running backwards.
//
// So this file does not ask anybody's opinion. `55 !== 45` is arithmetic. No model gets a vote.
//
// ---------------------------------------------------------------------------------------------
// THE THREE OUTCOMES, AND WHY THE THIRD ONE IS THE IMPORTANT ONE
//
//   agree              our number equals GOV.UK's number. Say nothing. Silence here is earned.
//   drift              they disagree. An INCIDENT. A wrong constant walks a wrong number into a
//                      man's tax return and he signs it himself.
//   extractor_broken   we could not find the number on the page at all.
//
// A lesser differ treats the third case as "no disagreement found" and reports all clear. That is
// SILENCE, and silence is this codebase's actual disease: the digest cron that reached 200 users
// and returned 200 OK; the llms.txt that was tested and never served; the launchd job that fired
// into an empty folder for five days; the .env whose key had a stray letter on the front so the
// watcher wrote nothing and exited zero. Every one of them SUCCEEDED at doing nothing.
//
// So a broken extractor is as loud as a mismatch. If we cannot see the number, we do not know
// that we are right, and not knowing is not the same as being fine.
//
// ---------------------------------------------------------------------------------------------
// THE DECOY. READ THIS BEFORE YOU TOUCH AN EXTRACTOR.
//
// The live mileage page says, in one table cell:
//
//     Cars and vans | 55p from 6 April 2026 (45p before 6 April 2026) | 25p
//
// and then, further down, GOV.UK's OWN worked example is out of date:
//
//     "the approved amount for the year would be £5,000 (10,000 x 45p plus 2,000 x 25p)"
//
// So the string "45p" appears on that page TWICE and the correct figure appears once. A differ
// that greps for a mileage rate finds 45p, compares it to our 55p, and screams that we are wrong.
// It would reproduce, mechanically and nightly, the exact error two separate human audits have
// already made about this precise number.
//
// An alarm that is confidently wrong is worse than no alarm, because you switch it off, and then
// you have no alarm AND you think you have one. Hence: anchor on the table row, prefer the figure
// qualified "from 6 April 2026", and never take a number that sits next to the word "before".
// difftest.mjs holds the decoy as a fixture and fails the build if this regresses.
//
//   node diff.mjs             compare, write incidents to Supabase, resolve any that are fixed
//   node diff.mjs --dry-run   compare and print a table, write nothing
//   node diff.mjs --facts=URL override where the engine's constants are read from (tests)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTags } from './watch.mjs';

const DRY = process.argv.includes('--dry-run');
const DB_URL = process.env.KHOJI_DB_URL || '';
const FACTS_URL =
  (process.argv.find((a) => a.startsWith('--facts=')) || '').slice(8) ||
  process.env.KHOJI_FACTS_URL ||
  'https://lekhio.app/facts.json';

// lekhio.app. NEVER the .com: it belongs to Lacspace Corporation, a different company in an
// adjacent market, and we spent five days announcing THEIR domain to HMRC's servers on every
// request. The string is not written out here either: CLAUDE.md says never, and the exception you
// grant yourself while warning about the rule is exactly how it gets back in.
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';

function log(...a) { console.log('[khoji:diff]', ...a); }

// ---- little parsers ---------------------------------------------------------

// "£1,234" -> 1234. "£1 million" -> 1000000. GOV.UK writes the AIA as "£1 million" in prose.
export function money(s) {
  if (!s) return null;
  const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*(million|billion)?/i);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (/million/i.test(m[2] || '')) n *= 1_000_000;
  if (/billion/i.test(m[2] || '')) n *= 1_000_000_000;
  return n;
}

const pence = (s) => (s == null ? null : Number(s) / 100);   // "55" -> 0.55
const percent = (s) => (s == null ? null : Number(s) / 100); // "6"  -> 0.06

// The slice of text between two anchors. Used to pin an extractor to one table row so a number
// from the row below, or from a stale worked example further down the page, can never be picked up.
export function between(text, startRe, endRe, max = 300) {
  const s = text.search(startRe);
  if (s < 0) return null;
  const rest = text.slice(s);
  const e = endRe ? rest.slice(1).search(endRe) : -1;
  return rest.slice(0, e > 0 ? e + 1 : max);
}

// ---- the checks -------------------------------------------------------------
//
// Each check names ONE constant in FACTS, ONE primary GOV.UK page that publishes it, and how to
// read it off that page. The URLs here are deliberately NOT sources.json: the watcher watches for
// news, the differ goes to the page that actually publishes the figure. They overlap, they are
// not the same list, and conflating them is how the mileage rate got watched all year by a thing
// that was never looking at the number.

export const CHECKS = [
  // ===============================================================================================
  // INCOME TAX RATES AND BANDS. Added 13 July 2026.
  //
  // THESE WERE UNWATCHED, AND THEY SIT UNDER EVERY SINGLE FIGURE THE PRODUCT PRODUCES.
  //
  // Khoji was checking mileage, NI, the trading allowance, VAT and CIS: all real, all worth
  // watching, and NONE of them touch the main income tax calculation. If basicRateBand or
  // higherRate had drifted at a Budget, every tax estimate, every quarterly summary and every
  // "what you owe" figure in the product would have been wrong, for every user, and Khoji would
  // have reported GREEN because it was not looking.
  //
  // A differ that watches the interesting numbers and not the load-bearing ones is a differ that
  // makes you feel watched. Doc 104, standing question 5: is it TRUE, not is it defensible.
  //
  // One page holds all of them: https://www.gov.uk/income-tax-rates
  // ===============================================================================================
  {
    fact: 'basicRate',
    label: 'Income tax, basic rate',
    url: 'https://www.gov.uk/income-tax-rates',
    extract(text) {
      // The table row: "Basic rate £12,571 to £50,270 20%"
      const row = between(text, /Basic rate/i, /Higher rate/i);
      if (!row) return { error: 'could not find the "Basic rate" row' };
      const m = row.match(/(\d{1,2})\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage in the basic rate row' };
    },
  },
  {
    fact: 'higherRate',
    label: 'Income tax, higher rate',
    url: 'https://www.gov.uk/income-tax-rates',
    extract(text) {
      const row = between(text, /Higher rate/i, /Additional rate/i);
      if (!row) return { error: 'could not find the "Higher rate" row' };
      const m = row.match(/(\d{1,2})\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage in the higher rate row' };
    },
  },
  {
    fact: 'additionalRate',
    label: 'Income tax, additional rate',
    url: 'https://www.gov.uk/income-tax-rates',
    extract(text) {
      const row = between(text, /Additional rate/i, /You can also see|If you.{0,3}re employed/i);
      if (!row) return { error: 'could not find the "Additional rate" row' };
      const m = row.match(/(\d{1,2})\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage in the additional rate row' };
    },
  },
  {
    fact: 'additionalRateThreshold',
    label: 'Income tax, where the additional rate starts',
    url: 'https://www.gov.uk/income-tax-rates',
    extract(text) {
      // "Additional rate over £125,140 45%"
      const row = between(text, /Additional rate/i, /You can also see|If you.{0,3}re employed/i);
      if (!row) return { error: 'could not find the "Additional rate" row' };
      const m = row.match(/over\s*£\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the additional rate threshold' };
    },
  },
  {
    fact: 'personalAllowanceTaperFloor',
    label: 'Where the personal allowance starts to taper',
    url: 'https://www.gov.uk/income-tax-rates',
    extract(text) {
      // "Your personal allowance goes down by £1 for every £2 that your adjusted net income is
      //  above £100,000."
      const m = text.match(/goes down by £1 for every £2[^.]{0,80}?above\s*£\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the £100,000 taper floor' };
    },
  },
  {
    fact: 'personalAllowanceLostAt',
    label: 'Where the personal allowance reaches nil',
    url: 'https://www.gov.uk/income-tax-rates',
    extract(text) {
      // "This means your allowance is zero if your income is £125,140 or above."
      const m = text.match(/allowance is zero if your income is\s*£\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read where the allowance hits nil' };
    },
  },
  {
    fact: 'basicRateBand',
    label: 'Income tax, width of the basic rate band',
    url: 'https://www.gov.uk/income-tax-rates',
    // ⚠️ THE ONLY DERIVED CHECK IN THE FILE, AND IT HAS TO BE.
    //
    // GOV.UK never prints "£37,700" anywhere. It prints the BAND: "£12,571 to £50,270". Our engine
    // stores the WIDTH, because that is what the tax calculation multiplies by 20%.
    //
    // So the check derives the width the way HMRC's own arithmetic does: the top of the basic band
    // minus the personal allowance. 50,270 - 12,570 = 37,700.
    //
    // This is exactly the kind of check that is worth having and easy to get wrong. If a Budget
    // moves EITHER number, this screams. And if HMRC ever restructure the table so we cannot read
    // both ends, it reports BROKEN rather than quietly agreeing, which is the whole doctrine: not
    // knowing is not the same as being fine.
    extract(text) {
      const row = between(text, /Basic rate/i, /Higher rate/i);
      if (!row) return { error: 'could not find the "Basic rate" row' };
      // "£12,571 to £50,270": the TOP of the band is the second figure.
      const band = row.match(/£\s*([\d,]+)\s*to\s*£\s*([\d,]+)/i);
      if (!band) return { error: 'could not read the basic rate band ("£x to £y")' };
      const top = money(band[2]);

      const pa = text.match(/standard Personal Allowance is\s*£\s*([\d,]+)/i);
      if (!pa) return { error: 'could not read the personal allowance to subtract' };
      const allowance = money(pa[1]);

      if (top === null || allowance === null) return { error: 'unreadable figures in the band' };
      return { value: top - allowance };
    },
  },

  // --- mileage. The one we got wrong. Note the decoy handling above. ---
  {
    fact: 'mileageCarFirst10k',
    label: 'Mileage, cars and vans, first 10,000 business miles',
    url: 'https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax',
    extract(text) {
      const row = between(text, /Cars and vans/i, /Motorcycles/i);
      if (!row) return { error: 'could not find the "Cars and vans" row' };
      // Prefer the figure explicitly dated to the current rules.
      const dated = row.match(/(\d{1,3})\s*p\b[^.)]{0,40}?from\s+6\s+April\s+2026/i);
      if (dated) return { value: pence(dated[1]) };
      // Otherwise the FIRST rate in the row, which is the first-10k column. Never a figure that
      // sits next to "before", which is always the superseded one.
      const first = row.match(/^[^\d]{0,20}(\d{1,3})\s*p\b(?![^.)]{0,20}before)/i);
      if (first) return { value: pence(first[1]) };
      return { error: 'found the row but no rate in it that is not a superseded one' };
    },
  },
  {
    fact: 'mileageCarOver10k',
    label: 'Mileage, cars and vans, above 10,000 miles',
    url: 'https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax',
    extract(text) {
      const row = between(text, /Cars and vans/i, /Motorcycles/i);
      if (!row) return { error: 'could not find the "Cars and vans" row' };
      const all = [...row.matchAll(/(\d{1,3})\s*p\b/gi)];
      if (!all.length) return { error: 'no rates in the "Cars and vans" row' };
      return { value: pence(all[all.length - 1][1]) }; // the last column on the row
    },
  },
  {
    fact: 'mileageMotorcycle',
    label: 'Mileage, motorcycles',
    url: 'https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax',
    extract(text) {
      const row = between(text, /Motorcycles/i, /Bikes/i);
      const m = row && row.match(/(\d{1,3})\s*p\b/i);
      return m ? { value: pence(m[1]) } : { error: 'could not read the motorcycle rate' };
    },
  },
  {
    fact: 'mileageBicycle',
    label: 'Mileage, bicycles',
    url: 'https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax',
    extract(text) {
      const row = between(text, /Bikes/i, /electric bike/i);
      const m = row && row.match(/(\d{1,3})\s*p\b/i);
      return m ? { value: pence(m[1]) } : { error: 'could not read the bicycle rate' };
    },
  },

  // --- self-employed National Insurance ---
  {
    fact: 'class2WeeklyRate',
    label: 'Class 2 National Insurance, weekly rate',
    url: 'https://www.gov.uk/self-employed-national-insurance-rates',
    extract(text) {
      const m = text.match(/Class 2 rate for tax year[^£]{0,40}£\s*([\d.]+)\s*a week/i);
      return m ? { value: Number(m[1]) } : { error: 'could not read the Class 2 weekly rate' };
    },
  },
  {
    fact: 'class2SmallProfitsThreshold',
    label: 'Class 2 small profits threshold',
    url: 'https://www.gov.uk/self-employed-national-insurance-rates',
    extract(text) {
      const m = text.match(/profits are £\s*([\d,]+) or more a year/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the small profits threshold' };
    },
  },
  {
    fact: 'class4MainRate',
    label: 'Class 4 National Insurance, main rate',
    url: 'https://www.gov.uk/self-employed-national-insurance-rates',
    extract(text) {
      const m = text.match(/(\d{1,2})%\s*on profits over £[\d,]+\s*up to £[\d,]+/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the Class 4 main rate' };
    },
  },
  {
    fact: 'class4LowerLimit',
    label: 'Class 4 lower profits limit',
    url: 'https://www.gov.uk/self-employed-national-insurance-rates',
    extract(text) {
      const m = text.match(/\d{1,2}%\s*on profits over £\s*([\d,]+)\s*up to £[\d,]+/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the Class 4 lower limit' };
    },
  },
  {
    fact: 'class4UpperLimit',
    label: 'Class 4 upper profits limit',
    url: 'https://www.gov.uk/self-employed-national-insurance-rates',
    extract(text) {
      const m = text.match(/\d{1,2}%\s*on profits over £[\d,]+\s*up to £\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the Class 4 upper limit' };
    },
  },
  {
    fact: 'class4UpperRate',
    label: 'Class 4 National Insurance, rate above the upper limit',
    url: 'https://www.gov.uk/self-employed-national-insurance-rates',
    extract(text) {
      // The second bullet: "2% on profits over £50,270", the one with no "up to" after it.
      //
      // The (?![\d,]) is not decoration. Without it the engine backtracks: it matches
      // "6% on profits over £12,57", leaving "0 up to £50,270", which satisfies a bare
      // (?!\s*up to), and we would read the Class 4 UPPER rate as 6%, disagree with our own
      // correct 2%, and raise a false incident against ourselves every single night. Anchoring
      // the end of the number is what stops it.
      const m = text.match(/(\d{1,2})%\s*on profits over £[\d,]+(?![\d,])(?!\s*up to)/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the Class 4 upper rate' };
    },
  },

  // --- allowances and thresholds ---
  {
    fact: 'personalAllowance',
    label: 'Income tax personal allowance',
    url: 'https://www.gov.uk/income-tax-rates',
    extract(text) {
      const m = text.match(/Personal Allowance[^£]{0,80}£\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the personal allowance' };
    },
  },
  {
    fact: 'tradingAllowance',
    label: 'Trading allowance',
    url: 'https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income',
    extract(text) {
      const m = text.match(/£\s*([\d,]+)\s*(?:of\s*)?(?:tax[- ]free\s*)?trading (?:income )?allowance/i)
        || text.match(/trading allowance[^£]{0,60}£\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the trading allowance' };
    },
  },
  {
    fact: 'annualInvestmentAllowance',
    label: 'Annual Investment Allowance',
    url: 'https://www.gov.uk/capital-allowances/annual-investment-allowance',
    // ⚠️ THIS CHECK WAS GREEN FOR SIX DAYS FOR THE WRONG REASON. READ BEFORE TOUCHING.
    //
    // The old extractor looked for the phrase "annual investment allowance" and then a £ within 120
    // characters. It reported `ok` every night. It was matching inside GOV.UK's JSON-LD <script>
    // block, because stripTags used to keep the CONTENTS of script tags.
    //
    // The phrase does not appear next to the figure on the actual page at all. GOV.UK writes the
    // expansion as an <abbr title="..."> ATTRIBUTE, and attributes die with the tag. So what the
    // mini really sees is:
    //
    //     "Claim writing down allowances instead. The AIA amount The AIA amount is £1 million."
    //
    // The moment stripTags was fixed to drop script contents, this check went BROKEN, which is how
    // we found out it had never been reading the page. A pass for the wrong reason is a lie that
    // gets quieter over time, and the only thing that exposed it was making something else honest.
    //
    // TWO DECOYS ON THAT PAGE, and "is £" defeats both:
    //   - a HISTORICAL TABLE: £1 million, £200,000, £500,000, £250,000, £25,000, £100,000, £50,000
    //   - a WORKED EXAMPLE:   "the AIA will be 9/12 x £1,000,000 = £750,000"
    // Neither says "amount is £". "has changed several times" does not either.
    extract(text) {
      // GOV.UK writes this as "£1 million" in prose, never "£1,000,000".
      const m = text.match(/The AIA amount is\s*£\s*([\d,.]+\s*(?:million)?)/i)
        // Fallback if HMRC ever stops abbreviating. Kept deliberately narrow: it must still be the
        // sentence that STATES the amount, not one that mentions it.
        || text.match(/annual investment allowance amount is\s*£\s*([\d,.]+\s*(?:million)?)/i);
      return m ? { value: money(m[1]) }
               : { error: 'could not read the AIA limit. The page says "The AIA amount is £X" and we cannot see it.' };
    },
  },
  {
    fact: 'vatRegistrationThreshold',
    label: 'VAT registration threshold',
    url: 'https://www.gov.uk/register-for-vat',
    extract(text) {
      const m = text.match(/(?:taxable turnover|threshold)[^£]{0,80}£\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the VAT registration threshold' };
    },
  },

  // --- MTD. THE NUMBERS THAT DECIDE WHO IS LEGALLY REQUIRED TO USE US. ---
  //
  // These are the most consequential unchecked constants we held. Get them wrong and we tell a man
  // he does not have to do this when he does, and he misses a legal duty. Or we tell him he must,
  // and bill him for a thing he did not need.
  //
  // ⚠️ AND THE PAGE WE HAVE BEEN WATCHING DOES NOT CONTAIN THEM.
  //
  // sources.json watches /guidance/using-making-tax-digital-for-income-tax. Two problems, found
  // today by actually opening it:
  //   1. GOV.UK REDIRECTS that URL. "using" became "use". Fetch follows redirects so nothing broke,
  //      and we were one rename away from watching a 404 and never being told.
  //   2. THE PAGE IS A TABLE OF CONTENTS. The thresholds are on a sub-page. So the watcher has been
  //      diligently checking a page every night that has never held the number.
  //
  // That is the mileage story in its purest form. The differ goes to the page with the figure on it.
  //
  // The anchor is the START DATE, not the tax year label, because the prose above the table also
  // says "income was over £50,000 ... from April 2026", and a regex that takes the first £50,000 it
  // finds would be reading a sentence instead of the schedule. Anchor on what makes the row unique.
  ...[
    ['mtdThreshold2026', '6 April 2026', 'first mandated year'],
    ['mtdThreshold2027', '6 April 2027', 'second mandated year'],
    ['mtdThreshold2028', '6 April 2028', 'third mandated year'],
  ].map(([fact, startDate, which]) => ({
    fact,
    label: `Making Tax Digital qualifying income threshold, ${which} (from ${startDate})`,
    url: 'https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/before-you-use-this-guide',
    extract(text) {
      const m = text.match(new RegExp(`more than £\\s*([\\d,]+)\\s*${startDate.replace(/ /g, '\\s+')}`, 'i'));
      return m ? { value: money(m[1]) }
               : { error: `no row in the MTD table with a start date of ${startDate}` };
    },
  })),

  // --- Student loans. The page that was sitting in the queue at 0.05, unchecked. ---
  //
  // THIS PAGE IS THE WORST DECOY FIELD ON GOV.UK. The threshold table has THREE money columns
  // (yearly, monthly, weekly), and then eleven worked examples below it stuffed with pound signs:
  // "£2,750 - £2,241", "£3,000 - £2,816", "£38,400 a year", "9% of £959". A regex that looks for
  // "Plan 1" and then the nearest number can land on a MONTHLY threshold, or on a salary out of an
  // example, and be confidently wrong about a deduction taken from a man's tax return.
  //
  // So every one of these pins itself INSIDE the threshold table and nowhere else. The table is
  // bounded by its own header and by the sentence that follows it.
  //
  // Our numbers are right. Nothing was checking that they stayed right, and this page is watched
  // by watch.mjs, which means it has been looked at every night by something that never once
  // compared it to us. That is the mileage story again, with a different number.
  ...[
    ['studentPlan1Threshold', 'Plan 1', /Plan 1/],
    ['studentPlan2Threshold', 'Plan 2', /Plan 2/],
    ['studentPlan4Threshold', 'Plan 4', /Plan 4/],
    ['studentPlan5Threshold', 'Plan 5', /Plan 5/],
    ['studentPostgradThreshold', 'Postgraduate Loan', /Postgraduate Loan/],
  ].map(([fact, label, rowRe]) => ({
    fact,
    label: `Student loan repayment threshold, ${label}`,
    url: 'https://www.gov.uk/repaying-your-student-loan/what-you-pay',
    extract(text) {
      const table = between(text, /Plan type\s+Yearly income threshold/i, /You.{0,3}ll repay either/i, 400);
      if (!table) return { error: 'could not find the threshold table' };
      // The YEARLY figure is the first of the three on the row. Take it, and nothing else.
      const m = table.match(new RegExp(`${rowRe.source}\\s*£\\s*([\\d,]+)`, 'i'));
      return m ? { value: money(m[1]) } : { error: `no row for ${label} in the threshold table` };
    },
  })),
  {
    fact: 'studentPlanRate',
    label: 'Student loan repayment rate, plans 1, 2, 4 and 5',
    url: 'https://www.gov.uk/repaying-your-student-loan/what-you-pay',
    extract(text) {
      // "you.{0,8}re" because the apostrophe arrives as a curly ’, a plain ', or the raw entity
      // &rsquo; depending on how the page was served and stripped. Three characters was not enough
      // and the check silently returned nothing, which the tests caught. Silence is the enemy.
      const m = text.match(/(\d{1,2})% of your income over the threshold if you.{0,8}re on Plan/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the plan repayment rate' };
    },
  },
  {
    fact: 'studentPostgradRate',
    label: 'Student loan repayment rate, postgraduate',
    url: 'https://www.gov.uk/repaying-your-student-loan/what-you-pay',
    extract(text) {
      // Anchored on "over the threshold", which the 6.2% postgraduate INTEREST rate further down
      // the page does not say. Grab the wrong one and we would tell a man he repays 6.2%.
      const m = text.match(/(\d{1,2})% of your income over the threshold if you.{0,8}re on a Postgraduate/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the postgraduate repayment rate' };
    },
  },

  // --- CIS. Construction is our core trade, so these are the last two we want to be blind on. ---
  //
  // The first pass at these two guessed the page said "20% if you're registered, 30% if you're
  // not". It does not. It never uses the word "registered" for the 20% at all: that rate is the
  // DEFAULT, and being unregistered is the exception.
  //
  //     "Under CIS, a contractor must deduct 20% from your payments..."
  //     "If you do not register for the scheme, contractors must deduct 30% ... instead."
  //
  // Both extractors came back BROKEN on the first live run, which is the system working. Had they
  // been written to grep for any "(\d+)%" near the word "deduct" they would have "worked", found
  // whichever number came first, and been quietly wrong. Anchor on the actual sentence.
  {
    fact: 'cisRegisteredRate',
    label: 'CIS deduction rate, registered subcontractor (net payment status)',
    url: 'https://www.gov.uk/what-you-must-do-as-a-cis-subcontractor',
    extract(text) {
      // "a contractor must deduct 20%". Singular "contractor must" cannot match the 30% sentence,
      // which reads "contractors must", so the two can never be confused for each other.
      const m = text.match(/a contractor must deduct\s*(\d{1,2})%/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the registered CIS rate' };
    },
  },
  {
    fact: 'cisUnregisteredRate',
    label: 'CIS deduction rate, unregistered subcontractor',
    url: 'https://www.gov.uk/what-you-must-do-as-a-cis-subcontractor',
    extract(text) {
      const m = text.match(/do not register[^.]{0,60}?deduct\s*(\d{1,2})%/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the unregistered CIS rate' };
    },
  },
];

// ---- the comparison ---------------------------------------------------------

// WHERE A PAGE HAS MOVED TO. fetch() follows redirects in silence, so a stale URL keeps working
// right up until the morning it 404s and we go blind on a constant.
//
// Not hypothetical: sources.json watched /guidance/USING-making-tax-digital-for-income-tax for six
// days. GOV.UK had renamed it to /USE-... and was quietly redirecting us the whole time. Nothing
// broke, nothing was said, and we were one cleanup away from watching nothing at all.
//
// This is NOT an incident, because nothing is wrong yet, and an alarm that fires when nothing is
// wrong is how alarms get muted. It is a line in the log with the new URL in it, so the fix is a
// copy and paste rather than an investigation.
export const MOVED = new Map();

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.url && res.url.split('#')[0] !== url) MOVED.set(url, res.url);
  return res.text();
}

// Compare one check against one page. Pure, so difftest.mjs can drive it with fixtures.
// `ours` is the value from FACTS. Returns exactly one of: agree | drift | extractor_broken.
export function compareOne(check, ours, pageText) {
  if (ours === undefined || ours === null) {
    // BE PRECISE ABOUT WHICH THING IS MISSING. This used to say "not in the engine's FACTS", which
    // sent whoever read it at 6am to look in lib/taxengine.ts. The first time it fired, the engine
    // held the constant perfectly well and /facts.json was serving a CACHED copy from before the
    // deploy. An alarm that points at the wrong file wastes the one thing an alarm is for.
    return { ...check, status: 'extractor_broken', ours, theirs: null,
             detail: `${check.fact} is not in the published /facts.json. Either the engine does not hold it, `
                   + `or /facts.json is stale and we just read an old copy of our own engine.` };
  }
  const got = check.extract(pageText);
  if (got.error || got.value == null || !Number.isFinite(got.value)) {
    return { ...check, status: 'extractor_broken', ours, theirs: null,
             detail: got.error || 'the extractor returned nothing usable' };
  }
  // Money and rates only. Compare on a tight epsilon so 0.1 + 0.2 style float noise cannot
  // manufacture an incident, while a real 1p move still lands.
  const same = Math.abs(got.value - ours) < 1e-9;
  return {
    ...check,
    status: same ? 'agree' : 'drift',
    ours,
    theirs: got.value,
    detail: same ? null : `GOV.UK says ${got.value}. Our engine says ${ours}.`,
  };
}

export async function runChecks(facts, fetcher = fetchText) {
  const pages = new Map();
  const results = [];
  for (const check of CHECKS) {
    if (!pages.has(check.url)) {
      try {
        pages.set(check.url, stripTags(await fetcher(check.url)));
      } catch (err) {
        pages.set(check.url, { fetchError: err.message });
      }
    }
    const page = pages.get(check.url);
    if (page && page.fetchError) {
      // A page we cannot READ is a page we cannot CHECK. That is not agreement either.
      results.push({ ...check, status: 'extractor_broken', ours: facts[check.fact], theirs: null,
                     detail: `could not fetch the page: ${page.fetchError}` });
      continue;
    }
    results.push(compareOne(check, facts[check.fact], page));
  }
  return results;
}

// ---- the incident record ----------------------------------------------------
//
// One row per DISTINCT disagreement, not one per night. The source_url carries the values, so a
// drift that is still there tomorrow dedupes onto the same row instead of filling the queue with
// copies of itself. Fix the engine, and the next run marks the row resolved and the alarm clears
// on its own. An alarm that cannot clear itself is one somebody eventually silences by hand.

const key = (r) => `${r.url}#${r.status === 'drift'
  ? `drift:${r.fact}:ours=${r.ours}:govuk=${r.theirs}`
  : `extractor:${r.fact}`}`;

export function incidentBody(r, meta) {
  if (r.status === 'drift') {
    return [
      `OUR ENGINE AND GOV.UK DISAGREE about ${r.label}.`,
      ``,
      `  GOV.UK says : ${r.theirs}`,
      `  Lekhio says : ${r.ours}   (FACTS.${r.fact})`,
      ``,
      `Source: ${r.url}`,
      ``,
      `Fix in ${meta.engineFile}, and in ${meta.parityFile} as well, or the app and the website will`,
      `quietly disagree about a man's tax bill. Re-run the exam suite before shipping.`,
      ``,
      `Khoji does not edit the engine. A person changes the number, against the primary source above.`,
    ].join('\n');
  }
  return [
    `KHOJI CANNOT CHECK ${r.label}, so we do not know whether we are right.`,
    ``,
    `  Reason      : ${r.detail}`,
    `  Lekhio says : ${r.ours}   (FACTS.${r.fact})`,
    ``,
    `Source: ${r.url}`,
    ``,
    `GOV.UK has probably restructured the page. Fix the extractor in diff.mjs.`,
    `This is not "no problem found". It is "no answer", and the two are not the same.`,
  ].join('\n');
}

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function main() {
  // NEVER READ A CACHED COPY OF OUR OWN ENGINE.
  //
  // /facts.json is force-static with max-age=3600, and the very first live run of the student loan
  // checks read a copy of facts.json from BEFORE the deploy that added them. It reported seven
  // constants missing that the engine holds perfectly well.
  //
  // It failed loudly, which is the design working. But think about the version of this that does
  // NOT fail loudly: a cached facts.json from last month, checked against this month's law, every
  // number matching, "0 DRIFT", green light, and our engine quietly a Budget out of date. That is
  // the sync step I said this design did not have, creeping back in through a CDN.
  //
  // So: cache-bust, and tell the CDN and the runtime not to serve us anything but the truth.
  const url = `${FACTS_URL}${FACTS_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;
  log(`reading the engine's constants from ${FACTS_URL} (cache busted)`);
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'cache-control': 'no-cache', pragma: 'no-cache' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`could not read the engine's facts: HTTP ${res.status}`);
  const meta = await res.json();
  const facts = meta.facts || {};

  // COVERAGE, SAID OUT LOUD. The differ checks what it has an extractor for, and a constant with
  // no extractor is not "fine", it is UNEXAMINED. Printing the number every night is what stops us
  // drifting into believing that "0 DRIFT" means "our tax numbers are right", when it means "the
  // ones we look at are right". Doc 104, standing question 5: is it TRUE, not is it defensible.
  const checked = new Set(CHECKS.map((c) => c.fact));
  const unchecked = Object.keys(facts).filter((k) => !checked.has(k) && k !== 'taxYear');
  log(`engine tax year ${meta.taxYear}: ${Object.keys(facts).length} constants published, ` +
      `${checked.size} checked against GOV.UK, ${unchecked.length} with no extractor yet`);
  if (unchecked.length) log(`  not yet checked: ${unchecked.join(', ')}`);

  const results = await runChecks(facts);
  const drift = results.filter((r) => r.status === 'drift');
  const broken = results.filter((r) => r.status === 'extractor_broken');
  const agreed = results.filter((r) => r.status === 'agree');

  for (const r of results) {
    const mark = r.status === 'agree' ? 'ok  ' : r.status === 'drift' ? 'DRIFT' : 'BROKEN';
    log(`${mark}  ${r.fact.padEnd(28)} ours=${String(r.ours).padEnd(10)} govuk=${String(r.theirs ?? '?').padEnd(10)} ${r.detail || ''}`);
  }
  log(`${agreed.length} agree, ${drift.length} DRIFT, ${broken.length} BROKEN`);

  // A page that has moved is not an incident, but it is a countdown. Print it with the new URL so
  // fixing it is a copy and paste, not an investigation.
  for (const [from, to] of MOVED) {
    log(`MOVED  GOV.UK has renamed a page we cite. Update the URL before it 404s.`);
    log(`         from: ${from}`);
    log(`         to:   ${to}`);
  }

  if (DRY) { log('dry run, nothing written'); return; }
  if (!DB_URL) {
    // Exit LOUD. A watcher that cannot reach its database has not succeeded, and a zero here is
    // how this thing sat dead for five days while launchd reported everything was fine.
    console.error('[khoji:diff] fatal: KHOJI_DB_URL not set. Nothing was checked against the record.');
    process.exit(1);
  }

  await withDb(async (db) => {
    const open = [...drift, ...broken];

    for (const r of open) {
      await db.query(
        `insert into public.knowledge_items
           (source_url, source_name, title, summary, affects, confidence, engine_impact, status, raw, distilled_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         on conflict (source_url) do nothing`,
        [
          key(r),
          'Khoji differ',
          r.status === 'drift'
            ? `ENGINE DRIFT: ${r.label}. GOV.UK ${r.theirs}, Lekhio ${r.ours}`
            : `CANNOT CHECK: ${r.label}`,
          incidentBody(r, meta),
          'the tax engine, and therefore every user',
          // No model guessed this. It is arithmetic, so it is certain, and it says so.
          r.status === 'drift' ? 1 : null,
          r.status === 'drift',
          r.status,
          { fact: r.fact, ours: r.ours, theirs: r.theirs, url: r.url, engineFile: meta.engineFile, parityFile: meta.parityFile },
        ],
      );
    }

    // SELF-CLEARING. Every fact that now agrees closes any incident still open against it. Fix the
    // engine, and tomorrow morning the alarm has gone out by itself. Nothing to remember, nothing
    // to tidy up, nobody tempted to silence it by hand.
    const healthy = agreed.map((r) => r.fact);
    if (healthy.length) {
      const r = await db.query(
        `update public.knowledge_items
            set status = 'resolved'
          where status in ('drift','extractor_broken')
            and raw->>'fact' = any($1)`,
        [healthy],
      );
      if (r.rowCount) log(`resolved ${r.rowCount} incident(s) that now agree`);
    }

    log(`${open.length} open incident(s) recorded`);
  });

  // A non-zero exit so launchd records the failure and the log is not a wall of green.
  if (drift.length || broken.length) process.exit(2);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => { console.error('[khoji:diff] fatal:', err.message); process.exit(1); });
}
