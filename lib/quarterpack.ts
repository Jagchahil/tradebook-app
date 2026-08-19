// lib/quarterpack.ts. The quarter end pack: a shareable quarterly summary a
// tradesperson can hand to their accountant.
//
// This is deterministic and framework free, the same discipline as
// lib/bankfeed.ts and lib/waintents.ts. It takes confirmed transactions and a
// target tax year quarter, and produces both the structured pack and a print
// ready HTML document. There is no server side PDF library in this codebase, by
// design: documents are produced by the browser's own print to PDF, exactly as
// the invoice pages already work, so the accountant opens the pack and chooses
// Save as PDF. One source of numbers: every tax figure comes from the canonical
// engine in lib/taxengine.ts, never hand rolled here.
//
// Doctrine held: this is a summary of the user's own confirmed entries and the
// published HMRC figures. It is for the user and their accountant. It is not a
// filing to HMRC, and the tax figure is a clearly labelled running estimate, not
// a calculation submitted anywhere. Lekhio prepares, the user approves.

// 🔴 FACTS IS GONE FROM THIS IMPORT ON PURPOSE. The renderer used to print the whole 50k/30k/20k
// ladder in its own copy, which is a second statement of a rule the engine already owns. The three
// thresholds now reach this file only through mtdThresholdFor(), so there is one place to change
// when a Budget moves one.
// ⚠️ EXACTLY ONE EXTENSIONLESS ENGINE IMPORT IN THIS FILE, AND IT MUST STAY ONE. Six suites stage
// this module into a temp directory and add the .ts extension with String.replace and NO /g flag,
// so a second import line is left unrewritten and the whole suite dies on ERR_MODULE_NOT_FOUND.
// The MtdPosition type rides inside the value import below for that reason, not for tidiness.
//
// ⚠️ AND NOTHING ABOVE THAT IMPORT MAY QUOTE IT, EITHER. This comment first spelled the import out
// in full, which put a copy of the exact string the suites search for ABOVE the real one. Replace
// without /g takes the FIRST match, so the rewrite would have patched the comment and left the
// import untouched: a file that loads under tsc and dies in six suites, explained by a comment
// that reads as if it prevents the problem. Say what the line is, never quote it.
import { soleTraderTax, class2Voluntary, mtdPosition, mtdThresholdFor, mtdTestBaseReturn, type MtdPosition } from './taxengine';
// The one sentence saying which country's income tax rates the estimate below is worked at. See
// lib/scotland.ts for why it is a constant rather than a string typed into each surface.
import { SCOTLAND_LINE } from './scotland';

// A confirmed transaction, in the engine's sign convention: a positive amount is
// income, a negative amount is an expense. Everything is optional and read
// defensively because rows come from several capture paths.
export interface PackTxn {
  amount: number;
  category?: string | null;
  vendor?: string | null;
  transaction_date: string; // YYYY-MM-DD
  cis_deduction?: number | null;
  income_type?: string | null; // 'property' marks the property stream; anything else is trade
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A COST THAT IS RELIEVED OVER YEARS RATHER THAN TAKEN OFF NOW. TRUE FOR A CAR, FALSE FOR
  // EVERYTHING ELSE, AND IT KEEPS A £60,000 AUDI OUT OF A QUARTERLY UPDATE.
  //
  // ⚠️ IT ARRIVES AS A DECIDED BOOLEAN AND NOT AS capital_kind, ON PURPOSE, TWICE OVER. First,
  // the rule that turns a kind into this answer lives in lib/capital.ts and may only live there:
  // spelling it out a second time here is how the last one drifted. Second, this module holds
  // exactly one relative import and cannot take another, because suites stage it and add the .ts
  // extension with a single fixed string replace. lib/supabase.ts PackRow decides it and this
  // module obeys it, the same shape as income_type above.
  //
  // ⚠️ UNDEFINED READS AS FALSE, which is every fixture and every row written before anybody was
  // asked, and false is the behaviour this module has always had.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  writtenDown?: boolean;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A RESIDENTIAL LANDLORD'S MORTGAGE INTEREST, WHICH IS NOT AN ALLOWABLE EXPENSE AT ALL.
  // R2-F25, 13 August 2026.
  //
  // Section 24 stopped residential finance costs being deducted from rental profit in 2020. They
  // are relieved as a basic rate credit instead, and on a quarterly update they go in their own
  // field (`residentialFinancialCost`) precisely because they are not part of allowable expenses.
  // Netting them off property profit understates the profit and describes a different, wrong
  // submission.
  //
  // ⚠️ THIS EXACT BUG WAS FOUND LIVE ON 6 AUGUST 2026 AND FIXED ON ONE SURFACE ONLY. lib/supabase.ts
  // records it against the shared book: without the stream, that reader "counted it as a running
  // cost and the shared book printed a profit £15,000 lower than the proof of income document for
  // the same account". The fix was applied to getBookShareRows, which has handed a decided
  // `financeCost` boolean ever since. Its sibling twenty lines up, getConfirmedTransactionsForRange,
  // which is what feeds THIS module, never learned. One reader was taught the rule and the other
  // was not, and the difference stayed invisible for a week because no door existed through which a
  // property cost could be written. See R2-F5 and R2-F7 for that door.
  //
  // ⚠️ A DECIDED BOOLEAN, SAME AS writtenDown ABOVE, AND FOR BOTH OF ITS REASONS. The rule lives in
  // lib/propertyengine.ts (isResidentialFinanceCost) and may only live there. And this module holds
  // exactly one relative import and cannot take another, because three suites stage it without
  // propertyengine and the staging does a single fixed string replace.
  //
  // ⚠️ THE NAME MATCHES lib/supabase.ts's EXISTING FIELD ON THE BOOKSHARE ROW, deliberately. A
  // second name for one fact is the drift this file already warns about for capital_kind.
  //
  // ⚠️ UNDEFINED READS AS FALSE, which is every fixture and every trade row, and false is the
  // behaviour this module has always had.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  financeCost?: boolean;
}

export interface QuarterBounds {
  index: 1 | 2 | 3 | 4;
  taxYear: string; // e.g. 2026/27
  label: string; // e.g. Quarter 1, 6 April to 5 July 2026
  start: string; // inclusive YYYY-MM-DD
  end: string; // inclusive YYYY-MM-DD
}

export interface StreamSummary {
  income: number;
  /** Allowable running costs. A written down purchase is NOT in here. See capitalCost. */
  expenses: number;
  net: number;
  expensesByCategory: Array<{ category: string; amount: number }>;
  // 🔴 WHAT LEFT HIS ACCOUNT ON THINGS THAT ARE RELIEVED OVER YEARS, AND IT IS REPORTED RATHER
  // THAN DROPPED. Taking a car out of expenses and saying nothing is how "Out £72,088" and
  // "Profit £22,776" ended up on two screens of one product with nothing joining them. Every
  // surface that prints expenses has this beside it and can say where the rest of the money went.
  capitalCost: number;
  /** How many payments make up capitalCost. Zero whenever capitalCost is zero. */
  capitalCount: number;
  // 🔴 RESIDENTIAL MORTGAGE INTEREST, OUT OF expenses AND REPORTED BESIDE IT. R2-F25.
  // Same shape and the same reason as capitalCost above: a cost that genuinely left his account,
  // that an update does NOT treat as an allowable expense, and that must therefore be visible
  // rather than dropped. Section 24 relieves it as a 20% credit, so it belongs in its own field on
  // an update and its own line on any screen that prints property expenses. Always 0 on the trade
  // stream: a trade's loan interest IS deductible and nothing here changes it.
  financeCost: number;
  /** How many payments make up financeCost. Zero whenever financeCost is zero. */
  financeCount: number;
}

export interface EstimatedTax {
  tradeProfit: number;
  incomeTax: number;
  class4: number;
  class2: number;
  total: number;
  propertyProfitExcluded: number; // property profit is taxed separately, shown but not folded in
  note: string;
  // 🔴 TRUE WHEN THE TRADE FIGURES ARE A COMPANY'S AND THIS IS THEREFORE NOT HIS PERSONAL TAX.
  //
  // A known limited company gets no personal tax estimate at all, so every figure above is zero and
  // the note says why. See the reasoning on `structure` in BuildInput. False for everybody else,
  // including an unknown structure, so nothing existing moves.
  companyProfitExcluded: boolean;
}

export interface QuarterPack {
  businessName: string;
  taxYear: string;
  period: QuarterBounds;
  generatedAt: string; // ISO
  // ⚠️ THE QUARTER ON ITS OWN, FOR A HUMAN READING THE PACK, AND NOT WHAT HMRC RECEIVES.
  //
  // This comment used to read "this is the content of an MTD quarterly update", and that was wrong
  // from 2025-26 onward and dangerous from November onward. An MTD update is CUMULATIVE: 6 April to
  // the quarter end, every time. See `submission` below, and the header of buildCumulativeUpdate in
  // lib/hmrc.ts for what wiring this field to a submission would have done to a man's figures.
  //
  // It stays because it is genuinely useful: "what did I actually do these three months" is a
  // question a trader asks and the cumulative figure cannot answer.
  trade: StreamSummary;
  property: StreamSummary;
  cisSuffered: number;
  txCount: number;
  hasProperty: boolean;
  truncated: boolean; // the source data may be incomplete (row limit hit)
  finalCheck?: string; // pre-filing assurance line, set by the route after a live-facts refresh
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT HMRC ACTUALLY RECEIVES. Named so that the right figure is the one nearest to hand.
  //
  // Identical arithmetic to `ytd` below, over the identical window, and it exists anyway. `ytd` is
  // named for the running tax picture and reads like context; a person wiring up a submission
  // reaches for the block called `trade`, because that is what a quarterly update sounded like for
  // as long as quarterly updates were discrete. So the cumulative figures get a name that says what
  // they are for, and carry the window with them rather than leaving it to be reconstructed.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  submission: {
    // 6 April, always. A cumulative period never starts anywhere else.
    periodStartDate: string;
    // The quarter end. 5 Oct for the update due 7 November.
    periodEndDate: string;
    trade: StreamSummary;
    property: StreamSummary;
    cisSuffered: number;
    // How many confirmed entries stand behind it, across the WHOLE window, not the quarter.
    txCount: number;
  };
  // Year to date, up to and including this quarter, for the running tax picture.
  ytd: {
    trade: StreamSummary;
    property: StreamSummary;
    cisSuffered: number;
    // Trade gross plus property gross for THIS year to date. ⚠️ It is a proxy for the figure
    // HMRC actually reads, which is the same total off a return already filed. Never present it
    // as the test itself: see mtdPosition() in lib/taxengine.ts.
    grossQualifyingIncome: number;
    // 🔴 REPLACED mtdApplies: boolean ON 3 AUGUST 2026. The boolean could only say yes or no to a
    // question this product cannot answer on its own, so five surfaces read "his figures are over
    // the line" and printed "the law applies to you". The position keeps the two apart, and
    // because there is no boolean left, tsc named every one of them.
    mtdPosition: MtdPosition;
    // WHY the test base was zeroed, when it was. null means it was not: he is simply measured
    // against the line. The renderer needs this because "your gross income so far is £0.00" under a
    // page of his own takings reads as a broken screen, not as an exclusion.
    mtdExcluded: 'company' | 'partnership' | null;
    mtdThreshold: number; // the MTD gross threshold for this tax year (50k/30k/20k)
    // The Self Assessment return HMRC actually reads to decide this April, as a human reads it:
    // "2024 to 2025" for the 2026/27 year. Every surface that names the real test uses this
    // rather than working the arithmetic out in its own copy.
    mtdTestBaseReturn: string;
    estimatedTax: EstimatedTax;
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function isoDate(year: number, month1to12: number, day: number): string {
  const mm = String(month1to12).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function prettyDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// The tax year label for a start year: 2026 -> "2026/27".
export function taxYearLabel(startYear: number): string {
  const end = (startYear + 1) % 100;
  return `${startYear}/${String(end).padStart(2, '0')}`;
}

// The bounds of a UK tax year quarter, using the standard MTD periods that run
// from the 6th: Q1 6 Apr to 5 Jul, Q2 6 Jul to 5 Oct, Q3 6 Oct to 5 Jan,
// Q4 6 Jan to 5 Apr. startYear is the year the tax year opens (2026 for 2026/27).
export function quarterBounds(startYear: number, index: 1 | 2 | 3 | 4): QuarterBounds {
  let start: string;
  let end: string;
  switch (index) {
    case 1:
      start = isoDate(startYear, 4, 6);
      end = isoDate(startYear, 7, 5);
      break;
    case 2:
      start = isoDate(startYear, 7, 6);
      end = isoDate(startYear, 10, 5);
      break;
    case 3:
      start = isoDate(startYear, 10, 6);
      end = isoDate(startYear + 1, 1, 5);
      break;
    case 4:
    default:
      start = isoDate(startYear + 1, 1, 6);
      end = isoDate(startYear + 1, 4, 5);
      break;
  }
  return {
    index,
    taxYear: taxYearLabel(startYear),
    label: `Quarter ${index}, ${prettyDay(start)} to ${prettyDay(end)}`,
    start,
    end,
  };
}

// Which tax year quarter a date falls in. The tax year opens on 6 April, so a
// date before then belongs to the previous tax year. ISO date strings compare
// correctly with < and >, so bounds checks are plain string comparisons.
export function quarterForDate(date: Date): { startYear: number; index: 1 | 2 | 3 | 4 } {
  const y = date.getUTCFullYear();
  const iso = isoDate(y, date.getUTCMonth() + 1, date.getUTCDate());
  const startYear = iso >= isoDate(y, 4, 6) ? y : y - 1;
  for (const index of [1, 2, 3, 4] as const) {
    const b = quarterBounds(startYear, index);
    if (iso >= b.start && iso <= b.end) return { startYear, index };
  }
  // A date exactly on a boundary is caught above; this is unreachable in practice.
  return { startYear, index: 4 };
}

// Split and total one set of rows into a stream summary. `wantProperty` selects
// the property rows (income_type === 'property'); false selects everything else
// (the trade stream), so the two calls partition the rows with no overlap.
function summariseStream(txns: PackTxn[], wantProperty: boolean): StreamSummary {
  let income = 0;
  let expenses = 0;
  let capitalCost = 0;
  let capitalCount = 0;
  let financeCost = 0;
  let financeCount = 0;
  const byCat = new Map<string, number>();
  for (const t of txns) {
    const isProperty = (t.income_type ?? '').toLowerCase() === 'property';
    if (isProperty !== wantProperty) continue;
    const amt = Number(t.amount);
    if (!Number.isFinite(amt) || amt === 0) continue;
    if (amt > 0) {
      income += amt;
    } else {
      const mag = -amt;
      // 🔴 A CAR IS NOT A RUNNING COST AND AN UPDATE DOES NOT REPORT IT AS ONE. GOV.UK, claim
      // capital allowances, business cars: "Cars do not qualify for: annual investment allowance
      // (AIA)." So it leaves expenses and it leaves the category breakdown, and it is counted
      // where the reader can see it instead of vanishing. See writtenDown on PackTxn.
      if (t.writtenDown === true) {
        capitalCost += mag;
        capitalCount += 1;
        continue;
      }
      // 🔴 AND A RESIDENTIAL LANDLORD'S MORTGAGE INTEREST IS NOT AN ALLOWABLE EXPENSE EITHER.
      // R2-F25. Section 24 relieves it as a basic rate credit rather than a deduction, so it leaves
      // expenses and it leaves the category breakdown, exactly as a car does, and it is counted
      // where the reader can see it instead of being netted off the profit. Gated on wantProperty
      // as well as the flag: a TRADE's loan interest is deductible and must not be touched, and
      // belt and braces beyond the caller already deciding it, because the cost of getting this
      // one wrong in the trade direction is a real deduction silently disappearing.
      if (wantProperty && t.financeCost === true) {
        financeCost += mag;
        financeCount += 1;
        continue;
      }
      expenses += mag;
      const cat = (t.category ?? 'other').trim().toLowerCase() || 'other';
      byCat.set(cat, (byCat.get(cat) ?? 0) + mag);
    }
  }
  const expensesByCategory = [...byCat.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  income = round2(income);
  expenses = round2(expenses);
  return {
    income,
    expenses,
    net: round2(income - expenses),
    expensesByCategory,
    capitalCost: round2(capitalCost),
    capitalCount,
    financeCost: round2(financeCost),
    financeCount,
  };
}

function cisTotal(txns: PackTxn[]): number {
  let sum = 0;
  for (const t of txns) {
    const c = Number(t.cis_deduction);
    if (Number.isFinite(c) && c > 0) sum += c;
  }
  return round2(sum);
}

function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export interface BuildInput {
  transactions: PackTxn[];
  startYear: number; // tax year opening year, e.g. 2026 for 2026/27
  quarter: 1 | 2 | 3 | 4;
  businessName?: string | null;
  now?: Date; // for the generated timestamp, injectable for tests
  // True when the transaction fetch hit its row limit and may be incomplete, so
  // the document warns rather than silently handing an accountant a short summary.
  truncated?: boolean;
  // A one-line pre-filing assurance, filled in by the route once it has refreshed the
  // live facts, so the year-end document can say the numbers were just re-checked.
  finalCheck?: string;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 HOW HE TRADES. THIS FILE HAD NO IDEA, AND IT WAS HANDING A DIRECTOR'S ACCOUNTANT TWO
  // SENTENCES THAT WERE NOT TRUE OF HIM.
  //
  //   1. MAKING TAX DIGITAL. The threshold test runs on GROSS QUALIFYING INCOME, which is self
  //      employment plus property on a PERSONAL return. A company's turnover is neither: the
  //      company files its own return, and the director's qualifying income does not include a
  //      penny of it. The pack was totting up his company's sales and telling him quarterly
  //      updates apply. app/app/tax/page.tsx already withholds that row from a director for
  //      exactly this reason, in these words, and the document he prints was still saying it.
  //
  //   2. "YOUR TRADE PROFIT", RUN THROUGH soleTraderTax. That prints "Estimated Class 4 National
  //      Insurance" on a page a director hands his accountant. A company's profit is chargeable to
  //      Corporation Tax in the company; he pays income tax on what he takes out as salary and
  //      dividends, and none of that is in this pack.
  //
  // ⚠️ OPTIONAL, AND UNDEFINED IS UNKNOWN, WHICH IS NEVER AN ANSWER. Every existing caller passes
  // nothing and gets the identical pack, to the penny and to the character. Only a customer who
  // has told us he runs a company loses a sentence, and what he loses is a sentence that was
  // false. That is the same direction lib/taxoptimiser.ts and lib/elections.ts take: a real
  // obligation must never be hidden from a sole trader because a profile read came back empty.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  structure?: 'sole_trader' | 'partnership' | 'limited_company' | null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHAT HE TOLD US ABOUT HIS OWN MANDATION, AND IT BEATS EVERY FIGURE IN THIS FILE.
  //
  // HMRC decides Making Tax Digital from a RETURN ALREADY FILED (2024/25 for April 2026) and
  // writes to the people it has assessed. This pack holds current year gross, which is a proxy
  // for that return and is wrong in both directions. So his answer, from the
  // mtd_mandated_letter circumstance, is preferred over the proxy wherever the two disagree.
  // The full reasoning and the GOV.UK quotations are on mtdPosition() in lib/taxengine.ts.
  //
  // ⚠️ REQUIRED, NOT OPTIONAL. Every other field on this input that could be unknown is optional
  // because unknown is a safe direction for it: an unknown structure gets asked everything. This
  // one is different. An optional `mtdStated` defaulting to null would let a caller that never
  // heard of it keep printing a conclusion from the wrong year, silently, for ever, which is the
  // exact shape of the bug being fixed. Required means tsc names every call site, the way making
  // daysElapsed required on OptimiserInput named every caller of the projection.
  //
  // ⚠️ null IS A REAL VALUE AND MEANS "WE HAVE NOT ASKED HIM YET". It is not a no. mtdPosition()
  // returns unstated_over or unstated_under for it, and both of those say so out loud.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  mtdStated: 'yes' | 'no' | null;
  // The written down capital allowance for the year (a car's yearly relief). Deducted from the tax
  // ESTIMATE only, never from the submission block or the mandation test: capital allowances are a
  // year end adjustment, not part of a quarterly MTD update. Zero for everyone with no car.
  capitalAllowance?: number;
}

// Build the pack. Quarter figures cover the selected quarter only, for a human reading it. The
// SUBMISSION figures, and the year to date figures that drive the running tax estimate, both cover
// the tax year opening (6 April of startYear) up to and including the quarter end, because that is
// the window an MTD quarterly update actually reports.
export function buildQuarterPack(input: BuildInput): QuarterPack {
  const { transactions, startYear, quarter } = input;
  const period = quarterBounds(startYear, quarter);
  const taxYearStart = isoDate(startYear, 4, 6);

  const rows = Array.isArray(transactions) ? transactions.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t?.transaction_date))) : [];
  const quarterTx = rows.filter((t) => inRange(t.transaction_date, period.start, period.end));
  const ytdTx = rows.filter((t) => inRange(t.transaction_date, taxYearStart, period.end));

  const trade = summariseStream(quarterTx, false);
  const property = summariseStream(quarterTx, true);

  const ytdTrade = summariseStream(ytdTx, false);
  const ytdProperty = summariseStream(ytdTx, true);

  // Only an explicit company is treated as one. Undefined and null are unknown, and unknown gets
  // exactly the pack it got before this field existed. See the note on BuildInput.structure.
  const isCompany = input.structure === 'limited_company';
  const isPartnership = input.structure === 'partnership';

  // The MTD for Income Tax test is on GROSS qualifying income, trade plus
  // property, before expenses. We test the year to date gross, which is
  // conservative: if it already clears the threshold, mandation certainly applies.
  //
  // 🔴 EXCEPT THAT A COMPANY'S TURNOVER IS NOT HIS QUALIFYING INCOME. It is the company's, and the
  // company is outside Making Tax Digital for Income Tax altogether. His rent stays in the test,
  // because rent on a personal return does count towards the line whatever else he runs.
  //
  // 🔴 AND A PARTNER'S SHARE OF PARTNERSHIP TRADE IS NOT HIS QUALIFYING INCOME EITHER, FOR A
  // DIFFERENT REASON: MAKING TAX DIGITAL HAS NOT REACHED PARTNERSHIPS AT ALL.
  //
  // GOV.UK, "Find out if and when you need to use Making Tax Digital for Income Tax": "Partnerships
  // will also need to use Making Tax Digital for Income Tax in the future. We'll set out the
  // timeline for this at a later date." No date, so no obligation, so no threshold to be over.
  //
  // ⚠️ THIS IS NOT A NEW POSITION. lib/agent.ts already holds it and already acts on it:
  // PARTNERSHIP_SUPPRESSED_SIGNALS carries 'mtd_mandation' and 'mtd_combined_trap' with the note
  // that a partner's share "is NOT Making Tax Digital qualifying income". The agent was right and
  // this file did not know, so on 3 August 2026 a 50% partner read "Making Tax Digital applies to
  // you. Your income this year, £53,400 before costs, is over the £50,000 line" on /app/tax while his
  // WhatsApp stayed correctly silent. TWO SURFACES, ONE FACT, TWO ANSWERS. And worse than either
  // half alone: the £53,400 was the FIRM'S turnover, while his own share was £26,700.
  //
  // ⚠️ ONLY THE MANDATION TEST MOVES. A partner IS charged income tax and Class 4 on his share,
  // so isPartnership deliberately does NOT join isCompany in the estimatedTax branch below. And his
  // rent stays in the test for the same reason a director's does: rent on a personal return counts
  // towards the line whatever else he runs.
  const grossQualifying = round2((isCompany || isPartnership ? 0 : ytdTrade.income) + ytdProperty.income);
  const mtdThreshold = mtdThresholdFor(startYear);
  // 🔴 THE PACK NO LONGER DECIDES WHETHER HE IS MANDATED, BECAUSE IT CANNOT. It reports where his
  // figures sit and what he has told us, and keeps those two facts apart. mtdPosition() in
  // lib/taxengine.ts carries the GOV.UK quotations and the reason.
  const position = mtdPosition({
    excluded: isCompany || isPartnership,
    stated: input.mtdStated,
    grossQualifyingIncome: grossQualifying,
    startYear,
  });

  // The running tax estimate is on trade net profit only. Property profit is
  // taxed on its own schedule (and from April 2027 its own rates), so folding it
  // into soleTraderTax would misstate the number. We show it separately instead.
  // 🔴 THE CAR'S ALLOWANCE COMES OFF THE TAX ESTIMATE, so the summary's tax matches the Overview and
  // the lender documents. It does NOT touch ytdTrade.net above (the MTD submission figure, which is
  // rightly before capital allowances) or the mandation test. Zero for everyone with no car.
  const capitalAllowance = Math.max(0, input.capitalAllowance ?? 0);
  const tradeProfit = Math.max(0, ytdTrade.net - capitalAllowance);
  // 🔴 AND FOR A COMPANY THERE IS NO PERSONAL ESTIMATE TO GIVE. soleTraderTax over a company's
  // profit charges the director income tax and Class 4 National Insurance on money that is taxable
  // in the company, and prints the words "Estimated Class 4 National Insurance" on a document he
  // hands his accountant. There is no Corporation Tax figure offered in its place: this pack knows
  // his personal tax year, not the company's accounting period, and a plausible number on the wrong
  // period is worse than a plain sentence saying where the answer lives. lib/taxoptimiser.ts
  // taxPosition() reaches the same conclusion about the same money, and says so at length.
  const st = isCompany ? { incomeTax: 0, class4: 0, total: 0 } : soleTraderTax(tradeProfit);
  const c2 = class2Voluntary();
  const class2 = isCompany ? 0 : c2.compulsory ? c2.annual : 0;

  const estimatedTax: EstimatedTax = {
    tradeProfit: round2(isCompany ? 0 : tradeProfit),
    incomeTax: round2(st.incomeTax),
    class4: round2(st.class4),
    class2: round2(class2),
    total: round2(st.total + class2),
    propertyProfitExcluded: round2(Math.max(0, ytdProperty.net)),
    note: isCompany
      ? 'These are your company\'s figures, so there is no personal tax estimate on them here. A company pays Corporation Tax on its own return, for its own accounting period, and you pay tax on what you take out as salary or dividends. Your accountant works both out from the figures above.'
      : 'A running estimate on your trade profit so far this tax year, using the published ' +
        taxYearLabel(startYear) +
        ' figures. It is for guidance, not a filing. Property profit, where present, is taxed separately and is not included here. ' +
        // WHICH COUNTRY'S RATES. Income tax above the personal allowance is devolved and this engine
        // holds the England, Wales and Northern Ireland bands only. The note is the one place on the
        // pack that already explains what the estimate IS, so the sentence joins it rather than
        // taking a row of its own on a document a man hands his accountant. The company branch above
        // offers no personal estimate at all, so it gets no caveat about one. lib/scotland.ts owns
        // the words, so this pack, the lender document and the free tools cannot drift apart.
        SCOTLAND_LINE +
        (capitalAllowance > 0 ? ` It is worked out on your taxable profit after this year's £${Math.round(capitalAllowance).toLocaleString('en-GB')} car allowance, which is why it is lower than the tax on the figures above.` : ''),
    companyProfitExcluded: isCompany,
  };

  return {
    businessName: (input.businessName ?? '').trim() || 'Your business',
    taxYear: taxYearLabel(startYear),
    period,
    generatedAt: (input.now ?? new Date()).toISOString(),
    trade,
    property,
    cisSuffered: cisTotal(quarterTx),
    txCount: quarterTx.length,
    submission: {
      periodStartDate: taxYearStart,
      periodEndDate: period.end,
      trade: ytdTrade,
      property: ytdProperty,
      cisSuffered: cisTotal(ytdTx),
      txCount: ytdTx.length,
    },
    hasProperty: ytdProperty.income > 0 || ytdProperty.expenses > 0,
    truncated: Boolean(input.truncated),
    finalCheck: input.finalCheck,
    ytd: {
      trade: ytdTrade,
      property: ytdProperty,
      cisSuffered: cisTotal(ytdTx),
      grossQualifyingIncome: grossQualifying,
      mtdPosition: position,
      mtdExcluded: isCompany ? 'company' : isPartnership ? 'partnership' : null,
      mtdThreshold,
      mtdTestBaseReturn: mtdTestBaseReturn(startYear),
      estimatedTax,
    },
  };
}

// ---- HTML document rendering (print to PDF, branded like the invoice pages) --

const INK = '#111111';
const INDIGO = '#1B59A6';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// lib/money.ts gbp2, character for character, and it was NOT until 19 August 2026: it printed
// the sign inside the pound, so a loss making quarter's pack read "£-1,200.00" on a document a man
// may hand to a lender. A copy rather than an import because six suites stage this module with a
// hand written dependency list and test/capitalwiring.test.mjs pins that list at exactly two
// relative imports. test/moneyone.test.mjs runs this body against the real gbp2 on every gate.
function gbp(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-£${abs}` : `£${abs}`;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function streamRows(s: StreamSummary): string {
  if (s.expensesByCategory.length === 0) {
    return `<tr><td style="padding:6px 0;color:${MUTED}">No expenses logged in this period</td><td></td></tr>`;
  }
  return s.expensesByCategory
    .map(
      (e) =>
        `<tr><td style="padding:6px 0">${esc(titleCase(e.category))}</td>` +
        `<td style="padding:6px 0;text-align:right">${gbp(e.amount)}</td></tr>`,
    )
    .join('');
}

// A complete, self contained HTML document. No external assets, no scripts that
// matter to the content, print styled so Save as PDF yields a clean one document
// page. Safe to return straight from a route with Content-Type text/html.
export function renderQuarterPackHtml(pack: QuarterPack): string {
  const p = pack.property;
  const t = pack.trade;
  const showProperty = pack.hasProperty;
  const est = pack.ytd.estimatedTax;
  // Whether the trade half of this document is a company's. Read off the pack rather than a second
  // structure argument, so the document and the figures can never disagree about who he is.
  const isCompany = est.companyProfitExcluded;

  const propertyBlock = showProperty
    ? `
      <h3 style="margin:26px 0 6px;font-size:15px">Property, this quarter</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;font-weight:600">Rent received</td><td style="padding:6px 0;text-align:right;font-weight:600">${gbp(p.income)}</td></tr>
        ${streamRows(p)}
        <tr style="border-top:1px solid ${BORDER}"><td style="padding:8px 0;font-weight:700">Property profit this quarter</td><td style="padding:8px 0;text-align:right;font-weight:700">${gbp(p.net)}</td></tr>
      </table>
      ${p.financeCost > 0 ? `<p style="margin:8px 0 0;font-size:13px;color:${MUTED}">Residential mortgage interest of ${gbp(p.financeCost)} was paid in this period and is deliberately NOT deducted above. Since Section 24 it is relieved as a basic rate tax credit rather than an expense, and an update reports it in its own field for that reason.</p>` : ''}`
    : '';

  // 🔴 AND THE MAKING TAX DIGITAL SENTENCE IS NOT ADDRESSED TO A DIRECTOR AT ALL.
  //
  // Without this branch he read "your gross income so far this year is £0.00" underneath a page of
  // his own turnover, because the test base correctly excludes a company's trade and nothing said
  // why. The wording is app/app/tax/summary/page.tsx's, deliberately: a product that argues two ways
  // about one fact argues wrong once.
  const mtdLine = isCompany
    ? `Making Tax Digital for Income Tax covers self employment and rent on a personal return, and your company's trade is neither: the company files its own return.`
    // 🔴 AND A PARTNER NEEDS HIS OWN SENTENCE FOR THE SAME REASON THE DIRECTOR DOES. Without it
    // he fell to the threshold branch and read "Your gross income so far this year is £0.00" on a
    // document showing the firm's takings, because the test base is correctly zeroed for him. He is
    // not under the line, he is outside the regime, and those are different facts.
    : pack.ytd.mtdExcluded === 'partnership'
      ? `Making Tax Digital for Income Tax has not reached partnerships yet. GOV.UK says it will in the future and that the timeline comes at a later date, so there is no quarterly update to make and no date to keep. Your share goes on your own Self Assessment return, and the partnership files its own alongside it.`
    // 🔴 AND THE REMAINING THREE BRANCHES STOPPED STATING A CONCLUSION ON 3 AUGUST 2026.
    //
    // This document goes to an accountant and to a mortgage lender. It used to read "your gross
    // income so far this year is over the threshold, so quarterly updates apply", which is a legal
    // conclusion drawn from the wrong tax year: HMRC decides from the return already filed. So the
    // document now reports the figure it holds, names the test HMRC actually applies, and says
    // whose fact it is. See mtdPosition() in lib/taxengine.ts.
    : pack.ytd.mtdPosition === 'stated_in'
      ? `You have told us HMRC has confirmed you must use Making Tax Digital for Income Tax, so quarterly updates apply for ${esc(pack.taxYear)}. Your gross income so far this year is ${gbp(pack.ytd.grossQualifyingIncome)}, and these figures are kept the way an update wants them.`
    : pack.ytd.mtdPosition === 'stated_out'
      ? `You have told us HMRC has not confirmed you for Making Tax Digital for Income Tax, so there is no quarterly update to make for ${esc(pack.taxYear)}. Your gross income so far this year is ${gbp(pack.ytd.grossQualifyingIncome)}. HMRC decides this from your ${esc(pack.ytd.mtdTestBaseReturn)} Self Assessment return, so if that year was different, tell us and this changes.`
    : pack.ytd.mtdPosition === 'unstated_over'
      ? `Your gross income so far this year is ${gbp(pack.ytd.grossQualifyingIncome)}, which is over the ${gbp(pack.ytd.mtdThreshold)} Making Tax Digital for Income Tax line for ${esc(pack.taxYear)}. That is this year's figure, and it is not the test: HMRC decides from your ${esc(pack.ytd.mtdTestBaseReturn)} Self Assessment return and writes to you to confirm it. We have not been told whether that letter arrived, so this document does not state whether quarterly updates apply.`
      : `Your gross income so far this year is ${gbp(pack.ytd.grossQualifyingIncome)}, which is under the ${gbp(pack.ytd.mtdThreshold)} Making Tax Digital for Income Tax line for ${esc(pack.taxYear)}. That does not settle it either way: HMRC decides from your ${esc(pack.ytd.mtdTestBaseReturn)} Self Assessment return, not from this year, and writes to you to confirm it. If that letter arrived, quarterly updates apply however this year is going.`;

  // A safety banner if the underlying data may have been capped, so a truncated
  // summary is never presented to an accountant as complete.
  const truncatedBanner = pack.truncated
    ? `<div style="background:#FBEAE8;border:1px solid #F5B5B5;border-radius:10px;padding:12px 14px;margin:0 0 18px;font-size:13px;color:#8A1F1F">This summary may be incomplete: you have an unusually large number of entries and not all could be included. Please contact us before relying on these figures.</div>`
    : '';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Quarterly summary, ${esc(pack.businessName)}, ${esc(pack.period.label)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:${OFF_WHITE};color:${INK};font-family:${FONT};line-height:1.5}
  .wrap{max-width:820px;margin:0 auto;padding:32px 24px 64px}
  .paper{background:#fff;border:1px solid ${BORDER};border-radius:14px;padding:34px}
  h1{font-size:22px;margin:0 0 2px}
  h2{font-size:16px;margin:24px 0 6px}
  .muted{color:${MUTED}}
  .brand{color:${INDIGO};font-weight:800;letter-spacing:-0.3px}
  .kpis{display:flex;gap:14px;flex-wrap:wrap;margin:18px 0 6px}
  .kpi{flex:1 1 150px;border:1px solid ${BORDER};border-radius:12px;padding:14px 16px}
  .kpi .n{font-size:20px;font-weight:800}
  .kpi .l{font-size:12px;color:${MUTED}}
  table{width:100%;border-collapse:collapse;font-size:14px}
  .foot{margin-top:24px;font-size:12px;color:${MUTED}}
  .printbtn{display:inline-block;margin:0 0 18px;background:${INDIGO};color:#fff;border:none;border-radius:10px;padding:12px 18px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
  @media print{
    body{background:#fff}
    .no-print{display:none !important}
    .paper{border:none;border-radius:0;padding:0}
    .wrap{padding:0}
  }
</style>
</head>
<body>
  <div class="wrap">
    <button class="printbtn no-print" onclick="window.print()">Save as PDF or print</button>
    <div class="paper">
      <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">
        <div>
          <h1><span class="brand">Lekhio</span> quarterly summary</h1>
          <div class="muted">${esc(pack.businessName)}</div>
        </div>
        <div class="muted" style="text-align:right">
          <div>${esc(pack.period.label)}</div>
          <div>Tax year ${esc(pack.taxYear)}</div>
        </div>
      </div>

      ${truncatedBanner}

      <div class="kpis">
        <div class="kpi"><div class="n">${gbp(t.income)}</div><div class="l">${isCompany ? 'Company' : 'Trade'} income this quarter</div></div>
        <div class="kpi"><div class="n">${gbp(t.expenses)}</div><div class="l">${isCompany ? 'Company' : 'Trade'} expenses this quarter</div></div>
        <div class="kpi"><div class="n">${gbp(t.net)}</div><div class="l">${isCompany ? 'Company' : 'Trade'} profit this quarter</div></div>
        ${pack.cisSuffered > 0 ? `<div class="kpi"><div class="n">${gbp(pack.cisSuffered)}</div><div class="l">CIS suffered this quarter</div></div>` : ''}
      </div>

      <h2>${isCompany ? 'The company, this quarter' : 'Trade, this quarter'}</h2>
      <table>
        <tr><td style="padding:6px 0;font-weight:600">Income</td><td style="padding:6px 0;text-align:right;font-weight:600">${gbp(t.income)}</td></tr>
        ${streamRows(t)}
        <tr style="border-top:1px solid ${BORDER}"><td style="padding:8px 0;font-weight:700">${isCompany ? 'Company' : 'Trade'} profit this quarter</td><td style="padding:8px 0;text-align:right;font-weight:700">${gbp(t.net)}</td></tr>
        ${pack.cisSuffered > 0 ? `<tr><td style="padding:6px 0" class="muted">CIS deducted at source (tax already paid)</td><td style="padding:6px 0;text-align:right" class="muted">${gbp(pack.cisSuffered)}</td></tr>` : ''}
      </table>

      ${propertyBlock}

      <h2>${isCompany ? 'Your money since 6 April' : 'What your quarterly update reports'}</h2>
      <p class="muted" style="font-size:13px;margin:0 0 10px">
        ${isCompany
          ? `Your figures from <strong>${esc(prettyDay(pack.submission.periodStartDate))} to ${esc(prettyDay(pack.submission.periodEndDate))}</strong>, added up.
             This is not a quarterly update: your company files its own return, over its own accounting period, so read this as a
             running total rather than a set of accounts, and the quarter above as what these three months did on their own.`
          : `A Making Tax Digital update covers <strong>${esc(prettyDay(pack.submission.periodStartDate))} to ${esc(prettyDay(pack.submission.periodEndDate))}</strong>,
             the whole tax year so far, not just these three months. Each update restates the year and replaces the one before it,
             so the figures below are the ones that go on the update, and the quarter above is there so you can see what these
             three months did on their own.`}
      </p>
      <table>
        <tr><td style="padding:6px 0">${isCompany ? 'Company income, year so far' : 'Trade income, year so far'}</td><td style="padding:6px 0;text-align:right">${gbp(pack.submission.trade.income)}</td></tr>
        <tr><td style="padding:6px 0">${isCompany ? 'Company expenses, year so far' : 'Trade expenses, year so far'}</td><td style="padding:6px 0;text-align:right">${gbp(pack.submission.trade.expenses)}</td></tr>
        <tr style="border-top:1px solid ${BORDER}"><td style="padding:8px 0;font-weight:700">${isCompany ? 'Company profit, year so far' : 'Trade profit, year so far'}</td><td style="padding:8px 0;text-align:right;font-weight:700">${gbp(pack.submission.trade.net)}</td></tr>
      </table>

      <h2>${isCompany ? 'The profit so far' : 'The running tax picture'}</h2>
      <table>
        <tr><td style="padding:6px 0">${isCompany ? 'Company profit so far this year' : 'Trade profit so far this year'}</td><td style="padding:6px 0;text-align:right">${gbp(pack.ytd.trade.net)}</td></tr>
        ${showProperty ? `<tr><td style="padding:6px 0">Property profit so far this year</td><td style="padding:6px 0;text-align:right">${gbp(pack.ytd.property.net)}</td></tr>` : ''}
        ${isCompany ? '' : `
        <tr><td style="padding:6px 0">Estimated Income Tax on trade profit</td><td style="padding:6px 0;text-align:right">${gbp(est.incomeTax)}</td></tr>
        <tr><td style="padding:6px 0">Estimated Class 4 National Insurance</td><td style="padding:6px 0;text-align:right">${gbp(est.class4)}</td></tr>
        ${est.class2 > 0 ? `<tr><td style="padding:6px 0">Class 2 National Insurance</td><td style="padding:6px 0;text-align:right">${gbp(est.class2)}</td></tr>` : ''}
        <tr style="border-top:1px solid ${BORDER}"><td style="padding:8px 0;font-weight:700">Estimated tax set aside so far</td><td style="padding:8px 0;text-align:right;font-weight:700">${gbp(est.total)}</td></tr>`}
      </table>
      <p class="muted" style="font-size:13px;margin-top:8px">${esc(est.note)}</p>
      <p class="muted" style="font-size:13px">${esc(mtdLine)}</p>
      ${pack.finalCheck ? `<p style="font-size:13px;margin-top:12px;padding:10px 12px;background:${OFF_WHITE};border:1px solid ${BORDER};border-radius:8px;color:${INK}"><strong>Final check before you file.</strong> ${esc(pack.finalCheck)}</p>` : ''}

      <div class="foot">
        Prepared by Lekhio from ${pack.txCount} confirmed ${pack.txCount === 1 ? 'entry' : 'entries'} in this quarter and the published HMRC figures for ${esc(pack.taxYear)}. These figures are for your records and your accountant. Lekhio prepares, you approve. This is not a submission to HMRC.
      </div>
    </div>
  </div>
</body>
</html>`;
}
