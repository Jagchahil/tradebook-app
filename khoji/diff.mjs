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

  {
    fact: 'higherRateThreshold',
    label: 'Where the higher rate starts (personal allowance + basic rate band)',
    url: 'https://www.gov.uk/income-tax-rates',
    // Derived, like basicRateBand. It is the TOP of the basic rate band, which the table prints as
    // the second half of "£12,571 to £50,270".
    //
    // ⚠️ IT IS NOT class4UpperLimit, EVEN THOUGH BOTH ARE £50,270 TODAY. They are different things
    // that happen to be aligned, and an engine that treats them as one number will be wrong the
    // first year the Chancellor moves one and not the other. /facts.json publishes them separately
    // for exactly that reason.
    extract(text) {
      const row = between(text, /Basic rate/i, /Higher rate/i);
      if (!row) return { error: 'could not find the "Basic rate" row' };
      const band = row.match(/£\s*[\d,]+\s*to\s*£\s*([\d,]+)/i);
      return band ? { value: money(band[1]) } : { error: 'could not read the top of the basic rate band' };
    },
  },

  // ===============================================================================================
  // CORPORATION TAX AND DIVIDENDS. Added 14 July 2026.
  //
  // These sit under the sole trader vs limited company tool, which is not a calculator. It is a
  // recommendation. It tells a man whether to restructure his entire business.
  //
  // A wrong number here does not misstate a tax bill by a few pounds. It tells him to incorporate
  // when he should not, and he does it, and he cannot easily undo it. That is a different order of
  // harm from a mileage rate being 10p out, and it was unwatched.
  //
  // The engine is CORRECT today (checked 14 July: 19/25, £50k/£250k, 10.75/35.75/39.35, £500). The
  // point is not that it was wrong. The point is that nothing would have told us when it became so.
  // ===============================================================================================
  {
    fact: 'ctMainRate',
    label: 'Corporation Tax, main rate',
    url: 'https://www.gov.uk/corporation-tax-rates',
    extract(text) {
      // "The Corporation Tax rate for company profits is 25%"
      const m = text.match(/Corporation Tax rate for company profits is\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the main Corporation Tax rate' };
    },
  },
  {
    fact: 'ctSmallRate',
    label: 'Corporation Tax, small profits rate',
    url: 'https://www.gov.uk/corporation-tax-rates',
    extract(text) {
      // "you'll pay the 'small profits rate', which is 19%"
      // The quotes around 'small profits rate' are CURLY on the live page, so we never match on
      // them. Anchor on the words, and take the percentage that follows.
      const row = between(text, /small profits rate/i, /Marginal Relief|You may be entitled/i);
      if (!row) return { error: 'could not find the small profits rate sentence' };
      const m = row.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage after "small profits rate"' };
    },
  },
  {
    fact: 'ctSmallLimit',
    label: 'Corporation Tax, small profits threshold',
    url: 'https://www.gov.uk/corporation-tax-rates',
    extract(text) {
      // "If your company made a profit of £50,000 or less"
      const m = text.match(/profit of\s*£\s*([\d,]+)\s*or less/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the £50,000 small profits limit' };
    },
  },
  {
    fact: 'ctUpperLimit',
    label: 'Corporation Tax, where the main rate starts',
    url: 'https://www.gov.uk/corporation-tax-rates',
    extract(text) {
      // "If your company made more than £250,000 profit"
      const m = text.match(/more than\s*£\s*([\d,]+)\s*profit/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the £250,000 upper limit' };
    },
  },

  // ⚠️ ctMarginalFraction (3/200) IS DELIBERATELY NOT CHECKED. It is not on the rates page. It lives
  // on a separate Marginal Relief guidance page, and I will not point an extractor at a page I have
  // not read, nor invent a sentence for it. It stays in the "not yet checked" list that the differ
  // prints every night, by name, where it can be seen. An honest gap beats a confident guess.

  {
    fact: 'dividendAllowance',
    label: 'Dividend allowance',
    url: 'https://www.gov.uk/tax-on-dividends',
    extract(text) {
      // "You also get a dividend allowance of £500 each year."
      const m = text.match(/dividend allowance of\s*£\s*([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the dividend allowance' };
    },
  },
  {
    fact: 'dividendBasic',
    label: 'Dividend tax, basic rate',
    url: 'https://www.gov.uk/tax-on-dividends',
    // ⚠️ THE DECOY ON THIS PAGE. Further down there is a worked example containing "10.75% tax on
    // £2,500 of dividends" AND "20% tax on £17,000 of wages". A naive grep for the first percentage
    // could pick up the INCOME tax rate from the example. between() pins us to the table row, which
    // comes first and is bounded by the next row.
    extract(text) {
      const row = between(text, /Basic rate/i, /Higher rate/i);
      if (!row) return { error: 'could not find the "Basic rate" dividend row' };
      const m = row.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage in the basic rate dividend row' };
    },
  },
  {
    fact: 'dividendHigher',
    label: 'Dividend tax, higher rate',
    url: 'https://www.gov.uk/tax-on-dividends',
    extract(text) {
      const row = between(text, /Higher rate/i, /Additional rate/i);
      if (!row) return { error: 'could not find the "Higher rate" dividend row' };
      const m = row.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage in the higher rate dividend row' };
    },
  },
  {
    fact: 'dividendAdditional',
    label: 'Dividend tax, additional rate',
    url: 'https://www.gov.uk/tax-on-dividends',
    extract(text) {
      const row = between(text, /Additional rate/i, /To work out your tax band/i);
      if (!row) return { error: 'could not find the "Additional rate" dividend row' };
      const m = row.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage in the additional rate dividend row' };
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

  // ===============================================================================================
  // THE NINETEEN. Added 14 July 2026, and the reason they were added is the reason they are here.
  //
  // The console's Khoji panel had just been built, and the first thing it printed was the number we
  // liked least: 42 OF 62 CONSTANTS WATCHED, and the other twenty listed BY NAME. vatStandardRate,
  // unwatched. The capital gains block, unwatched. poaThreshold, which decides whether a man makes
  // payments on account, unwatched.
  //
  // "0 drift" had been reported every night for a week, and it meant: the ones we look at are right.
  //
  // Building a fourth screen while the third one says that would be avoiding the point.
  // ===============================================================================================

  // --- Capital allowances -------------------------------------------------------------------------
  //
  // ⚠️ THIS PAGE IS A DECOY, EXACTLY LIKE THE MILEAGE PAGE.
  //
  // It says, in a bullet: "main pool with a rate of 14% from April 2026, and 18% before". The 18 is
  // right there in the same sentence. An extractor that grabs the first percentage on the page reads
  // 18, disagrees with our (correct) 14, and screams DRIFT every night for ever. Which is worse than
  // useless: an alarm that is always wrong is an alarm everyone learns to close.
  //
  // So the anchor is the phrase that carries the CURRENT rate, and the historical one is left alone.
  {
    fact: 'wdaMainRate',
    label: 'Writing down allowance, main pool',
    url: 'https://www.gov.uk/work-out-capital-allowances/rates-and-pools',
    extract(text) {
      const m = text.match(/main pool with a rate of\s*(\d{1,2})\s*%/i);
      if (!m) return { error: 'could not find "main pool with a rate of N%"' };
      return { value: percent(m[1]) };
    },
  },
  {
    fact: 'wdaSpecialRate',
    label: 'Writing down allowance, special rate pool',
    url: 'https://www.gov.uk/work-out-capital-allowances/rates-and-pools',
    extract(text) {
      const m = text.match(/special rate pool with a rate of\s*(\d{1,2})\s*%/i);
      if (!m) return { error: 'could not find "special rate pool with a rate of N%"' };
      return { value: percent(m[1]) };
    },
  },

  // --- VAT ---------------------------------------------------------------------------------------
  {
    fact: 'vatStandardRate',
    label: 'VAT, standard rate',
    url: 'https://www.gov.uk/vat-rates',
    extract(text) {
      // The table: "Standard 20% Most goods and services".  The page also carries 5% and 0%, so the
      // row must be pinned or we would read the reduced rate.
      const row = between(text, /Standard/i, /Reduced rate|Zero rate/i, 120);
      if (!row) return { error: 'could not find the "Standard" VAT row' };
      const m = row.match(/(\d{1,2})\s*%/);
      return m ? { value: percent(m[1]) } : { error: 'no percentage in the standard rate row' };
    },
  },
  {
    fact: 'vatDeregistrationThreshold',
    label: 'VAT deregistration threshold',
    url: 'https://www.gov.uk/register-for-vat/cancel-your-registration',
    extract(text) {
      const m = text.match(/deregistration threshold[^£]{0,120}£([\d,]+)/i)
        || text.match(/(?:falls?|drops?|goes) below[^£]{0,80}£([\d,]+)/i)
        || text.match(/less than\s*£([\d,]+)[^.]{0,60}(?:next 12 months|cancel)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the deregistration threshold' };
    },
  },
  {
    fact: 'vatFlatRateLimitedCost',
    label: 'VAT flat rate scheme, limited cost business',
    url: 'https://www.gov.uk/vat-flat-rate-scheme/how-much-you-pay',
    extract(text) {
      // Verbatim on the page: "This means you pay a higher rate of 16.5%."
      const m = text.match(/higher rate of\s*(\d{1,2}(?:\.\d+)?)\s*%/i)
        || text.match(/limited cost business[^%]{0,240}?(\d{1,2}\.\d)\s*%/i);
      return m ? { value: Number(m[1]) / 100 } : { error: 'could not read the limited cost business rate' };
    },
  },

  // --- Capital gains -----------------------------------------------------------------------------
  //
  // A tradesman sells a van, or the workshop, or shares. We quote him a number. Nothing has ever
  // checked any of these.
  {
    fact: 'cgtAnnualExempt',
    label: 'Capital gains tax, annual exempt amount',
    url: 'https://www.gov.uk/capital-gains-tax/allowances',
    extract(text) {
      const m = text.match(/tax-free allowance[^£]{0,120}£([\d,]+)/i)
        || text.match(/annual exempt amount[^£]{0,80}£([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the CGT annual exempt amount' };
    },
  },
  {
    fact: 'cgtBasicRate',
    label: 'Capital gains tax, basic rate',
    url: 'https://www.gov.uk/capital-gains-tax/rates',
    extract(text) {
      const m = text.match(/basic rate[^%]{0,160}?(\d{1,2})\s*%/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the CGT basic rate' };
    },
  },
  {
    fact: 'cgtHigherRate',
    label: 'Capital gains tax, higher rate',
    url: 'https://www.gov.uk/capital-gains-tax/rates',
    extract(text) {
      const m = text.match(/higher(?: or additional)? rate[^%]{0,160}?(\d{1,2})\s*%/i);
      return m ? { value: percent(m[1]) } : { error: 'could not read the CGT higher rate' };
    },
  },
  {
    fact: 'badrRate',
    label: 'Business asset disposal relief, rate',
    url: 'https://www.gov.uk/business-asset-disposal-relief',
    extract(text) {
      // ⚠️ ANOTHER DECOY. The page reads:
      //     "you'll pay tax at either: 18% on all gains ... from 6 April 2026
      //                                14% on all gains ... between ..."
      // Both numbers are true. Only one of them is now. Anchor on the CURRENT sentence.
      const m = text.match(/(\d{1,2})\s*%\s*on all gains on qualifying assets disposed of from\s*6 April 2026/i);
      if (!m) return { error: 'could not find the "from 6 April 2026" BADR rate sentence' };
      return { value: percent(m[1]) };
    },
  },
  // badrLifetimeLimit: THE CHECK IS GONE BECAUSE THE CONSTANT IS GONE.
  //
  // GOV.UK's BADR guide carries the rates and, checked on 14 July 2026, not one £ figure anywhere in
  // it, on the landing page or the "work out your tax" page. So we could not source the £1,000,000
  // we were publishing at /facts.json. Then we looked at what used it: nothing. No calculation, no
  // test, no citation.
  //
  // A number we assert publicly, cannot source, cannot check, and do not use is not a harmless
  // leftover. It is a claim. It was deleted from lib/taxengine.ts rather than defended here.

  // --- Employer NI -------------------------------------------------------------------------------
  //
  // The moment a sole trader takes on his first apprentice, this is his bill. We answer that
  // question in the app, and nothing has ever checked the number we answer it with.
  {
    fact: 'employerNIRate',
    label: 'Employer National Insurance, secondary rate',
    url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027',
    // ⚠️ MY FIRST TWO ATTEMPTS AT THIS BOTH CRIED WOLF, and they cried it differently.
    //
    // The page holds a full category-letter table. Category A is the ordinary employer. But the same
    // table carries category D (Investment Zone deferment) at 0%, and several others at 0%, and it
    // carries the EMPLOYEE rates immediately above. So a loose regex can read 0, or 8, or 2, and
    // every one of those would report our correct 15% as ENGINE DRIFT, every night, for ever.
    //
    // Anchor on the employer heading, then take category A's first rate. Nothing looser survives.
    extract(text) {
      const m = text.match(/Employer \(secondary\) contribution rates[\s\S]{0,1500}?\sA\s+(\d{1,2}(?:\.\d+)?)\s*%/i);
      if (!m) return { error: 'could not find category A under "Employer (secondary) contribution rates"' };
      return { value: Number(m[1]) / 100 };
    },
  },
  {
    fact: 'employerSecondaryThreshold',
    label: 'Employer NI, secondary threshold',
    url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027',
    // ⚠️ THIS EXTRACTOR CRIED WOLF ON ITS FIRST RUN AND I ALMOST SHIPPED IT.
    //
    // The row on the page reads, in one unbroken line:
    //
    //     Secondary threshold £96 per week £417 per month £5,000 per year
    //
    // My first regex took the first £ after the words. That is £96, the WEEKLY figure. It compared
    // 96 to our 5000, and reported ENGINE DRIFT. Our engine was right. The differ was wrong.
    //
    // An alarm that is confidently wrong is worse than no alarm at all, because you switch it off,
    // and then you have no alarm AND you believe you have one. It is the same failure as the 45p
    // mileage decoy, arriving from the opposite direction.
    //
    // So: walk the whole row and take the figure that is explicitly PER YEAR. And the lookbehind is
    // load-bearing too, because the page also carries "Freeport upper secondary threshold" and
    // "Investment Zone upper secondary threshold", both £25,000, sitting two words away.
    extract(text) {
      const m = text.match(
        /(?<!upper )secondary threshold\s*£[\d,]+\s*per week\s*£[\d,]+\s*per month\s*£([\d,]+)\s*per year/i,
      );
      if (!m) return { error: 'could not find the secondary threshold row with a per-year figure' };
      return { value: money(m[1]) };
    },
  },

  // --- Simplified expenses -----------------------------------------------------------------------
  //
  // The flat rates a man claims for working from home. Small numbers, and he uses them every month.
  {
    fact: 'homeFlatRate25to50',
    label: 'Working from home flat rate, 25 to 50 hours',
    // ⚠️ A GOV.UK "guide" landing page is a TABLE OF CONTENTS, not the content. Three URLs in a row
    // gave a 200 and no number, which reads exactly like a working page with nothing on it.
    url: 'https://www.gov.uk/simpler-income-tax-simplified-expenses/working-from-home',
    extract(text) {
      const row = between(text, /25\s*(?:to|-|–|—)\s*50/i, /51/i, 160);
      if (!row) return { error: 'could not find the 25 to 50 hours row' };
      const m = row.match(/£\s*([\d.]+)/);
      return m ? { value: money(m[1]) } : { error: 'no amount in the 25 to 50 hours row' };
    },
  },
  {
    fact: 'homeFlatRate51to100',
    label: 'Working from home flat rate, 51 to 100 hours',
    url: 'https://www.gov.uk/simpler-income-tax-simplified-expenses/working-from-home',
    extract(text) {
      const row = between(text, /51\s*(?:to|-|–|—)\s*100/i, /101/i, 160);
      if (!row) return { error: 'could not find the 51 to 100 hours row' };
      const m = row.match(/£\s*([\d.]+)/);
      return m ? { value: money(m[1]) } : { error: 'no amount in the 51 to 100 hours row' };
    },
  },
  {
    fact: 'homeFlatRate101plus',
    label: 'Working from home flat rate, 101 hours or more',
    url: 'https://www.gov.uk/simpler-income-tax-simplified-expenses/working-from-home',
    extract(text) {
      // Verbatim: "Hours of business use per month | Flat rate per month | 25 to 50 £10 | 51 to 100
      // £18 | 101 and more £26". And DIRECTLY BELOW IT sits a worked Example repeating £10 and £18.
      // Stop at "Example" or the decoy is inside the window.
      const row = between(text, /101\s*(?:and more|or more|and over|\+)/i, /Example|Previous|Next/i, 120);
      if (!row) return { error: 'could not find the "101 and more" hours row' };
      const m = row.match(/£\s*([\d.]+)/);
      return m ? { value: money(m[1]) } : { error: 'no amount in the 101 or more hours row' };
    },
  },

  // --- Mileage: the band, not the rate -----------------------------------------------------------
  //
  // The RATES have been watched since the beginning. The BOUNDARY between them has not, and a man
  // who drives 12,000 miles is charged at two rates either side of this number.
  {
    fact: 'mileageFirstBandMiles',
    label: 'Mileage, first band boundary',
    url: 'https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles',
    extract(text) {
      const m = text.match(/first\s*([\d,]+)\s*miles/i)
        || text.match(/up to\s*([\d,]+)\s*miles/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the first mileage band boundary' };
    },
  },

  // --- Payments on account -----------------------------------------------------------------------
  //
  // Below this, he pays once. Above it, HMRC asks for half of next year's bill in January as well,
  // and a man who was not told that is a man who cannot pay it.
  {
    fact: 'poaThreshold',
    label: 'Payments on account, threshold',
    url: 'https://www.gov.uk/understand-self-assessment-bill/payments-on-account',
    extract(text) {
      const m = text.match(/less than\s*£([\d,]+)/i) || text.match(/under\s*£([\d,]+)/i);
      return m ? { value: money(m[1]) } : { error: 'could not read the payments on account threshold' };
    },
  },

  // --- ctMarginalFraction: DELIBERATELY NOT CHECKED, and here is why, in writing ---------------
  //
  // I wrote an extractor for it. It could not find the number, because GOV.UK's marginal relief
  // guidance does not print the standard fraction anywhere: it gives you a calculator instead.
  //
  // The tempting move is to leave the broken check in, so the coverage number goes up. That would
  // put a permanently BROKEN alarm on the board, every night, for ever. And an alarm that never
  // clears is an alarm everybody learns to ignore, which quietly poisons the ones that matter.
  //
  // So it stays UNWATCHED, and the console prints its name every night with the rest of the gap.
  // "We do not check this" is a true sentence. "We check this and it is broken" is a worse one.
  // See UNCHECKABLE below.
];

// ---- THE CONSTANTS WE CANNOT DIFF, AND THE REASON, IN WORDS ------------------
//
// A gap you can explain is not the same as a gap you have not noticed, and the console must be able
// to tell a human which one it is looking at. Otherwise every unwatched constant looks like neglect,
// the list stops being read, and the ones that ARE neglect hide inside it.
//
// These two are not neglect. They cannot be compared to a published number, because there is no
// published number to compare them to.
export const UNCHECKABLE = {
  cisGrossRate:
    'Gross payment status means NO deduction is made. GOV.UK states that as a sentence, not as a rate, '
    + 'so there is no number on any page to subtract ours from. The SENTENCE is watched by corpus.mjs instead.',
  ctMarginalFraction:
    'GOV.UK does not print the standard marginal relief fraction anywhere. It gives you a calculator. '
    + 'A check that can never succeed is a BROKEN alarm every night for ever, and an alarm that never '
    + 'clears is one everybody learns to mute.',
};

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

// KHOJI'S HEARTBEAT. Written EVERY RUN, whether or not anything is wrong.
//
// ⚠️ THE FAILURE THIS EXISTS TO CLOSE, AND IT IS THE HOUSE DISEASE.
//
// Everything below writes to knowledge_items ONLY WHEN SOMETHING IS WRONG. When all 42 constants
// agree with GOV.UK it writes nothing at all. That is right for an incident log, and it is
// catastrophic as a sign of life, because the health check upstream reads "no incident rows, and
// the feed watcher is fresh" and prints OK.
//
// So picture the differ dying tonight while the feed watcher carries on. No incident rows. Fresh
// knowledge. Light stays GREEN. And green now means: we have no idea whether a single one of our
// tax constants is right, and NOTHING IS LOOKING. That is not a hypothetical, it is precisely how
// this brain sat dead from 7 to 12 July while launchd reported success every single morning.
//
// NOT KNOWING IS NOT THE SAME AS BEING FINE. A run that does not happen leaves no row, the newest
// row goes stale, and the light goes red on its own. Nothing to remember. Nothing to maintain.
async function recordRun(db, row) {
  await db.query(
    `insert into public.khoji_runs
       (tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [row.taxYear, row.published, row.checked, row.agreed, row.drifted, row.blind,
     row.unwatched, row.durationMs, row.ok],
  );
}

// The heartbeat for a run that DIED, so a differ that cannot reach GOV.UK, or cannot parse its own
// engine's facts.json, still says so out loud instead of simply not existing that night. A silent
// absence and a loud failure look identical from the database if only the healthy path writes.
async function recordFailedRun(message) {
  if (!DB_URL || DRY) return;
  try {
    await withDb((db) => recordRun(db, {
      taxYear: null, published: 0, checked: 0, agreed: 0, drifted: 0, blind: 0,
      unwatched: [], durationMs: null, ok: false,
    }));
    log(`recorded a FAILED run: ${message}`);
  } catch (e) {
    // If we cannot even write the failure, the row is missing, the heartbeat goes stale, and the
    // light goes red anyway. The design degrades to the safe answer.
    console.error('[khoji:diff] could not record the failed run:', e.message);
  }
}

async function main() {
  const startedAt = Date.now();

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

    // THE HEARTBEAT. Last thing, unconditionally, whether the news was good or bad.
    //
    // Note what it carries beyond the counts: `unwatched`. The constants we publish and DO NOT
    // check, by name. "0 drift" does not mean our tax numbers are right, it means the ones we look
    // at are right, and the difference between those two sentences is a Budget. Printing the gap
    // every night is what stops us quietly starting to believe the first one.
    await recordRun(db, {
      taxYear: meta.taxYear ?? null,
      published: Object.keys(facts).length,
      checked: checked.size,
      agreed: agreed.length,
      drifted: drift.length,
      blind: broken.length,
      unwatched: unchecked,
      durationMs: Date.now() - startedAt,
      // A run is only OK if it both completed AND found nothing. A run that completed and found
      // drift is a successful run of a watcher and a failing tax engine, and `drifted` says so.
      ok: drift.length === 0 && broken.length === 0,
    });
  });

  // A non-zero exit so launchd records the failure and the log is not a wall of green.
  if (drift.length || broken.length) process.exit(2);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch(async (err) => {
    console.error('[khoji:diff] fatal:', err.message);
    // SAY SO IN THE DATABASE, NOT JUST IN A LOG FILE ON A MAC MINI UNDER A DESK.
    //
    // The whole reason the brain could die for five days is that its failures only ever existed
    // somewhere nobody was looking. A run that throws now leaves a row saying it threw.
    await recordFailedRun(err.message);
    process.exit(1);
  });
}
