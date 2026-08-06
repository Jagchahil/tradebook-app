// lib/incomeproof.ts. A clean, branded income summary a self employed person can
// hand to a mortgage broker, a landlord or a lender. Built only from their own
// confirmed figures. Pure, deterministic, no AI, no network.
//
// It is NOT an SA302 or a filed return, and it says so plainly. It is the summary
// an accountant would type on headed paper, generated in one tap from the records
// the user already keeps. No software rival offers this, and every self employed
// person needs one eventually. Unit tested in test/incomeproof.test.mjs.

import { incomeTaxOnProfit, class4NIC, FACTS, personalAllowance } from './taxengine';
// Section 24 lives in one file and this document obeys it rather than keeping its own copy.
import { isResidentialFinanceCost } from './propertyengine';

export interface IncomeProofTxn {
  amount: number; // signed: positive income, negative expense
  transaction_date: string; // YYYY-MM-DD
  // 🔴 WHICH STREAM THIS ROW IS, AND THE REASON A LANDLORD WAS SHOWN NATIONAL INSURANCE ON RENT.
  //
  // 'property' marks the property stream; anything else is trade. It was NOT on this interface, so
  // every row was totted up as one profit and run through soleTraderTax, which adds Class 4. Class 4
  // is a charge on the profits of a TRADE (SSCBA 1992 s15). Rent is not a trade, it does not carry
  // it, and we were printing it on a document a man hands to a lender.
  //
  // The rows have always carried it: lib/supabase.ts selects income_type and both callers pass their
  // rows straight through. This interface simply did not ask for it. Optional, and absent means
  // trade, so every existing trade only summary is identical to the penny.
  income_type?: string | null;

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A COST RELIEVED OVER YEARS RATHER THAN TAKEN OFF NOW. TRUE FOR A CAR, FALSE FOR EVERYTHING
  // ELSE, AND IT KEEPS A £60,000 CAR OUT OF A DOCUMENT A MAN HANDS A MORTGAGE LENDER.
  //
  // This interface did not ask for it, so this file summed every money out row into expenses, the
  // £60,000 car included. On a real account it drove net profit to a floored £0 and estimated tax
  // to £0, while /app/tax/summary, built from lib/quarterpack.ts, correctly read In £33,580, Out
  // £12,088, profit £21,492 off the same books. Three surfaces, one account, and the one that leaves
  // the building was the wrong one. GOV.UK, claim capital allowances, business cars: "Cars do not
  // qualify for: annual investment allowance (AIA)", so a car is not an allowable expense in the
  // year. lib/quarterpack.ts holds it out of expenses and reports it apart, and this file now does
  // the same off the same decided boolean.
  //
  // ⚠️ IT ARRIVES ALREADY DECIDED, exactly as lib/quarterpack.ts's PackTxn.writtenDown does.
  // lib/supabase.ts asks lib/capital.ts's isWrittenDown() once and every caller obeys the answer, so
  // the rule that turns a car into this boolean lives in one place and cannot drift. Undefined reads
  // as false, which is every fixture and every row written before anybody was asked, so every
  // existing summary is identical to the penny.
  writtenDown?: boolean;

  // What the row was filed as and who it was paid to. Present on every row lib/supabase.ts hands
  // this file already; the interface simply did not ask for them. They are here so the Section 24
  // test can run on the same two fields getOptimiserInput and propertyYtdTotals test, using the
  // same exported predicate, so the three cannot answer differently. Absent reads as trade cost,
  // which is every existing fixture, so every trade only summary is identical to the penny.
  category?: string | null;
  vendor?: string | null;
}

export interface IncomeProof {
  businessName: string;
  taxYear: string; // e.g. 2026-27
  periodLabel: string; // e.g. 6 April 2026 to 5 April 2027
  income: number;
  expenses: number;
  profit: number;
  /** The two streams behind `profit`, each floored at zero, because tax is charged on them apart. */
  tradeProfit: number;
  propertyProfit: number;
  // 🔴 WHAT LEFT THE ACCOUNT ON THINGS RELIEVED OVER YEARS, REPORTED RATHER THAN DROPPED. A car is
  // not in `expenses` above, so the document says where the rest of the money went instead of
  // leaving a lender to wonder. Zero for a man who bought no car. Mirrors StreamSummary in
  // lib/quarterpack.ts.
  capitalCost: number;
  /** How many payments make up capitalCost. Zero whenever capitalCost is zero. */
  capitalCount: number;
  /** The car's writing down allowance claimed this year, already deducted from profit above. */
  capitalAllowance: number;
  // \U0001F534 RESIDENTIAL MORTGAGE INTEREST, REPORTED APART AND NOT DEDUCTED. Section 24 makes it a
  // basic rate tax credit rather than an allowable expense, so it is NOT inside `expenses` and it
  // has NOT reduced `profit`. Zero for everyone who is not a mortgaged landlord, so every existing
  // summary is identical to the penny.
  financeCost: number;
  /** The Section 24 credit already taken off inside estimatedTax. Zero when financeCost is zero. */
  financeCredit: number;
  estimatedTax: number;
  /** The Class 4 inside estimatedTax. Zero for a pure landlord, which is the whole point. */
  nationalInsurance: number;
  /**
   * What to call estimatedTax on a screen, so no surface has to work out whether there is any
   * National Insurance in it and none of them can answer differently. app/app/proof-of-income
   * renders its own copy of this row and should read this rather than keep its own wording.
   */
  estimatedTaxLabel: string;
  txCount: number;
  generatedAt: string; // ISO

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // \u26a0\ufe0f WHO THESE FIGURES BELONG TO. Null for a sole trader, whose figures are simply his.
  //
  // `shareNote` is the sentence the document must carry when the numbers above are a SLICE of a
  // bigger set of books. `companyExcluded` says the opposite thing: these are not his personal
  // income at all and no personal tax estimate is offered on them.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  shareNote: string | null;
  companyExcluded: boolean;
}

// How he trades, for the one document a lender reads. Optional, and undefined is UNKNOWN, which
// gets the identical proof it got before this existed.
export interface ProofStructure {
  type: 'sole_trader' | 'partnership' | 'limited_company' | null;
  sharePercent?: number; // partnership only, 0 to 100
}

export function taxYearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

// Build the summary for one tax year (opening year, 6 April startYear to 5 April
// the year after). Totals every confirmed stream, the same way the app screen
// does, because a lender wants total self employed income, not one slice.
export function buildIncomeProof(
  txns: IncomeProofTxn[],
  businessName: string | null,
  startYear: number,
  now: Date = new Date(),
  structure?: ProofStructure | null,
  // The written down capital allowance for the year (a car's yearly relief). Deducted from the
  // taxable profit so this document reads the same taxable figure as the Overview and the tax
  // summary. Zero for everyone with no car, so every existing summary is identical to the penny.
  capitalAllowance = 0,
): IncomeProof {
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // \U0001F534 THIS DOCUMENT WAS HANDING A PARTNER THE WHOLE FIRM'S INCOME AS HIS OWN.
  //
  // Found 3 August 2026 by setting a live account to "Me and somebody else" at 50%. /app/tax then
  // said "These figures are your 50% share of the firm's books" and showed £22,305. THIS page,
  // titled Income summary, for income verification, over our name, showed the FIRM'S £53,400 of
  // gross income and £52,190 of net profit with no share applied and nothing saying so.
  //
  // \U0001F534 IT IS THE WORST PLACE IN THE PRODUCT TO OVERSTATE A MAN'S INCOME. The whole job of this
  // page is to be believed by a mortgage broker or a lender who checks, and at a 50% share it
  // DOUBLED him. lib/supabase.ts's getOptimiserInput already scales by the partner factor and
  // /app/pay-yourself already reads partnershipShare, so the product knew his share everywhere
  // except on the one sheet that leaves the building.
  //
  // \U0001F534 AND A DIRECTOR'S COMPANY TURNOVER IS NOT HIS PERSONAL INCOME EITHER. His is salary and
  // dividends, which this file does not hold, so no personal tax estimate is offered on a company's
  // profit. That is the same conclusion lib/quarterpack.ts reached about the same money, in the
  // same words, for the same reason.
  //
  // \u26a0\ufe0f UNKNOWN IS NEVER AN ANSWER. No structure, a null type, or a failed profile read all
  // produce the proof this function produced before the parameter existed, to the penny and to the
  // character. Only a man who has TOLD US he shares a business, or runs a company, sees a change,
  // and what he loses is a figure that was not his.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const isPartnership = structure?.type === 'partnership';
  const isCompany = structure?.type === 'limited_company';
  const rawShare = Number(structure?.sharePercent);
  const sharePct = isPartnership && Number.isFinite(rawShare) && rawShare > 0 && rawShare <= 100
    ? rawShare
    : 100;
  const share = sharePct / 100;
  let income = 0;
  let expenses = 0;
  let capitalCost = 0;
  let capitalCount = 0;
  let tradeIncome = 0;
  let tradeExpenses = 0;
  let propertyIncome = 0;
  let propertyExpenses = 0;
  let financeCost = 0;
  for (const t of txns) {
    const a = Number(t.amount) || 0;
    const isProperty = String(t.income_type ?? '').toLowerCase() === 'property';
    if (a >= 0) {
      income += a;
      if (isProperty) propertyIncome += a; else tradeIncome += a;
    } else {
      const mag = -a;
      // 🔴 A CAR LEAVES EXPENSES AND IS COUNTED APART. GOV.UK, business cars: "Cars do not qualify
      // for: annual investment allowance (AIA)", so it does not come off in the year the way a van
      // or ordinary kit does. Same test lib/quarterpack.ts's summariseStream uses, off the same
      // decided boolean, so the document and /app/tax/summary cannot disagree.
      if (t.writtenDown === true) {
        capitalCost += mag;
        capitalCount += 1;
        continue;
      }
      // \U0001F534 MORTGAGE INTEREST IS NOT AN ALLOWABLE PROPERTY EXPENSE, AND THIS DOCUMENT SAID IT WAS.
      // Section 24 gives it a basic rate credit instead, which lib/taxoptimiser.ts already does for
      // the Overview and lib/propertyengine.ts already does for the free landlord tool. Found live
      // on 6 August 2026: £15,000 of interest sat inside "Allowable expenses" on the one sheet a
      // customer hands a lender, inflating the profit and cutting the tax estimate by £3,000. Same
      // predicate as the other two readers, so the three cannot drift apart again.
      if (isProperty && isResidentialFinanceCost(t.category, t.vendor)) {
        financeCost += mag;
        continue;
      }
      expenses += mag;
      if (isProperty) propertyExpenses += mag; else tradeExpenses += mag;
    }
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // 🔴 THE SLICE IS TAKEN HERE, before profit or any tax is derived, and IT IS THE FIRM'S
  // SLICE ONLY. share is 1 for a sole trader, an unknown structure and a company, so those three
  // are untouched arithmetic.
  //
  // 🔴 AND HIS RENT IS NOT THE FIRM'S. Found 6 August 2026 by the money spine guard
  // (test/moneyspine.test.mjs): this block scaled the PROPERTY stream by the partnership share
  // too, so a 35% partner with £70,000 of personal rent handed a lender a document showing
  // £24,500 of it. The partnership share he told us about at signup is his share of the TRADE.
  // Rent is his own income on his own return: lib/quarterpack.ts holds the same position in the
  // mandation test ("his rent stays in the test for the same reason a director's does") and
  // lib/taxoptimiser.ts taxes a partner's property stream in full. One doctrine, three files.
  tradeIncome = round2(tradeIncome * share);
  tradeExpenses = round2(tradeExpenses * share);
  capitalCost = round2(capitalCost * share);
  propertyIncome = round2(propertyIncome);
  propertyExpenses = round2(propertyExpenses);
  financeCost = round2(financeCost);
  income = round2(tradeIncome + propertyIncome);
  expenses = round2(tradeExpenses + propertyExpenses);
  // The headline the lender reads: everything in, everything out. Unchanged.
  // The car's yearly allowance, scaled to his share like everything else, taken off BEFORE profit
  // so the taxable figure this lender document shows matches the Overview to the penny.
  const capAllow = round2(Math.max(0, capitalAllowance) * share);
  // 🔴 A LOSS IS SHOWN AS A LOSS (6 August 2026, Jag's call). This floored at zero, while the
  // shared books page showed the true negative for the same books: two lender documents, two
  // stories. A lender reads the income and the costs anyway, so a zero here is a figure the rest
  // of the page contradicts. The tax lines below keep their floors, because tax is never negative.
  const profit = round2(income - expenses - capAllow);
  // The two streams, each floored at zero, because the tax below is charged on them apart, and what
  // a loss in one of them does to the other is a relief he CLAIMS rather than something a summary
  // may assume for him. For a trade only summary tradeProfit IS profit, to the penny.
  const tradeProfit = Math.max(0, round2(tradeIncome - tradeExpenses - capAllow));
  const propertyProfit = Math.max(0, round2(propertyIncome - propertyExpenses));

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 NATIONAL INSURANCE ON THE TRADE ONLY. THE LINE UNDER THIS USED TO SAY IT ON RENT.
  //
  // This was soleTraderTax(profit).total over every confirmed row. Class 4 is charged on the profits
  // of a trade, profession or vocation; rental income is property income and carries none of it. So
  // a landlord's proof of income, the document he hands a mortgage broker, showed him National
  // Insurance he does not owe, over our name, on the one page whose entire job is to be believed by
  // somebody who checks.
  //
  // ⚠️ INCOME TAX IS STILL WORKED OUT ON THE TWO TOGETHER, and that is not a detail. Both are non
  // savings income and they share ONE personal allowance. Taxing them separately and adding the
  // answers would hand him the allowance twice, which is the same bug lib/ledger.ts had to be
  // rescued from in July, and it would understate the tax on the document. So: income tax on the
  // pair, Class 4 on the trade alone.
  //
  // ⚠️ WHICH WAY THIS MOVES A FIGURE. A trade only summary is identical to the penny, because
  // incomeTaxOnProfit(p) + class4NIC(p) IS soleTraderTax(p).total. A landlord's estimated tax falls,
  // which is correct: he was being charged a tax that is not his. Nobody's income or profit moves.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  //
  // \U0001F534 AND NONE OF IT IS OFFERED ON A COMPANY'S PROFIT. Running these over a director's company
  // turnover charges him income tax and Class 4 on money that is taxable IN THE COMPANY, and prints
  // the words on a document he hands a lender. A plain sentence saying where the answer lives beats
  // a plausible number on the wrong money.
  const nationalInsurance = isCompany ? 0 : round2(class4NIC(tradeProfit));
  // \u26a0\ufe0f THE SECTION 24 CREDIT, WORKED THE WAY lib/taxoptimiser.ts WORKS IT, DELIBERATELY.
  // Relief at the basic rate on the LOWEST of the finance costs, the property profit, and taxable
  // income above the personal allowance, and it can never take the income tax below zero. That is
  // lib/propertyengine.ts combinedBill's reliefBase and taxoptimiser's s24Base, in the same order,
  // so the document, the Overview and the free landlord tool land on one number. A basic rate
  // landlord is unaffected either way, because a 20% deduction and a 20% credit come to the same.
  const taxableBeforeCredit = tradeProfit + propertyProfit;
  const incomeTaxBeforeCredit = isCompany ? 0 : incomeTaxOnProfit(taxableBeforeCredit);
  const s24Base = Math.min(
    financeCost,
    propertyProfit,
    Math.max(0, taxableBeforeCredit - personalAllowance(taxableBeforeCredit)),
  );
  const financeCredit = isCompany
    ? 0
    : round2(Math.min(FACTS.basicRate * Math.max(0, s24Base), incomeTaxBeforeCredit));
  const estimatedTax = isCompany
    ? 0
    : round2(Math.max(0, incomeTaxBeforeCredit - financeCredit) + nationalInsurance);

  return {
    businessName: (businessName ?? '').trim() || 'Your business',
    taxYear: taxYearLabel(startYear),
    periodLabel: `${longDate(`${startYear}-04-06`)} to ${longDate(`${startYear + 1}-04-05`)}`,
    income,
    expenses,
    profit,
    tradeProfit,
    propertyProfit,
    capitalCost,
    capitalAllowance: capAllow,
    capitalCount,
    financeCost,
    financeCredit,
    estimatedTax,
    nationalInsurance,
    // The words follow the figure. A man with no National Insurance in his number is not told there
    // is some, and nobody has to read the code to find out which he is.
    estimatedTaxLabel:
      nationalInsurance > 0 ? 'Estimated Income Tax and National Insurance' : 'Estimated Income Tax',
    txCount: txns.length,
    generatedAt: now.toISOString(),
    // The sentence a reader needs to understand what he is looking at. A sole trader gets null,
    // because a caption explaining a share he does not have is a line he reads and rejects.
    shareNote: isPartnership
      ? (propertyIncome > 0 || propertyExpenses > 0 || financeCost > 0
        ? `The trade figures are ${sharePct}% of the firm's books, this person's share of the partnership. The property figures are their own, in full: rent is personal income, not the firm's.`
        : `These figures are ${sharePct}% of the firm's books, this person's share of the partnership.`)
      : null,
    companyExcluded: isCompany,
  };
}

// ---- HTML document (print to PDF, branded like the quarter pack) -------------

const INK = '#111111';
const INDIGO = '#1B59A6';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function gbp(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // The sign in front of the symbol, the way lib/money.ts gbp2 writes it, so a loss year's
  // document reads -£1,200.00 rather than £-1,200.00.
  return v < 0 ? `-£${abs}` : `£${abs}`;
}

function row(label: string, value: string, opts: { bold?: boolean; muted?: boolean } = {}): string {
  const weight = opts.bold ? '700' : '400';
  const colour = opts.muted ? MUTED : INK;
  return (
    `<tr><td style="padding:11px 0;border-bottom:1px solid ${BORDER};font-weight:${weight};color:${colour}">${esc(label)}</td>` +
    `<td style="padding:11px 0;border-bottom:1px solid ${BORDER};text-align:right;font-weight:${weight};color:${colour};font-variant-numeric:tabular-nums">${esc(value)}</td></tr>`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS STYLESHEET SHIPPED 180 BYTES OF OUR OWN ENGINEERING NOTES TO A MORTGAGE LENDER.
//
// A CSS comment is not stripped by the compiler, it is characters inside a string, so the note
// explaining why .whose is in full ink went out inside the document a customer hands to a broker
// or a landlord. It is written as a TypeScript comment now, one line up, where the compiler
// deletes it and the reasoning still sits beside the rule it explains.
//
// ⚠️ AND IT IS NOT TAGGED WITH css`` LIKE EVERY OTHER STYLESHEET, ON PURPOSE, TWICE OVER.
//
// First, lib/ledger.ts says it out loud: a lib module may not take a new lib import, because three
// suites stage these files with a fixed dependency list and Node's type stripping cannot resolve
// an extensionless one. Second, and worse, this file is not a stylesheet, it is a whole document,
// and it interpolates a business name, a share note and transaction descriptions. A stripper that
// deletes everything between /* and */ would eat a customer's own sentence if he ever typed /* in
// his trading name. There is nothing to strip because there is nothing here to strip, and
// test/tokens.test.mjs goes red the moment somebody writes one in.
//
// .whose: whose figures these are. In the document's own ink, not muted: it states what the
// numbers ARE rather than footnoting them, and a lender must not be able to skim past it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const PROOF_CSS = `
  @media print { .noprint { display:none !important } @page { margin: 18mm } }
  body { font-family:${FONT}; color:${INK}; margin:0; background:${OFF_WHITE}; -webkit-print-color-adjust:exact; print-color-adjust:exact }
  .sheet { max-width:720px; margin:0 auto; padding:34px 30px 44px }
  .brand { display:flex; align-items:center; gap:10px; font-weight:800; font-size:18px; letter-spacing:-0.02em }
  .brand .l { width:28px; height:28px; border-radius:8px; background:${INDIGO}; color:#fff; display:grid; place-items:center; font-weight:900 }
  h1 { font-size:24px; letter-spacing:-0.03em; margin:26px 0 2px }
  .muted { color:${MUTED} }
  .card { background:#fff; border:1px solid ${BORDER}; border-radius:16px; padding:22px 24px; margin-top:20px }
  table { width:100%; border-collapse:collapse }
  .whose { margin-top:16px; font-size:13.5px; line-height:1.6; color:${INK}; max-width:62ch }
  .capital { margin-top:14px; font-size:13px; line-height:1.6; color:${MUTED}; max-width:62ch }
  .stamp { display:inline-block; margin-top:18px; background:${OFF_WHITE}; border:1px solid ${BORDER}; border-radius:10px; padding:8px 12px; font-size:12px; font-weight:700; color:${INDIGO} }
  .note { font-size:12px; color:${MUTED}; line-height:1.6; margin-top:22px }
  .btn { display:inline-block; margin-top:24px; background:${INDIGO}; color:#fff; text-decoration:none; font-weight:700; padding:12px 20px; border-radius:11px; border:0; cursor:pointer; font-family:inherit; font-size:15px }
`;

// A complete, self contained, print ready HTML document. No external assets.
export function renderIncomeProofHtml(p: IncomeProof): string {
  const generated = longDate(p.generatedAt.slice(0, 10));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Income summary ${esc(p.taxYear)} ${esc(p.businessName)}</title>
<style>${PROOF_CSS}</style></head>
<body><div class="sheet">
  <div class="brand"><span class="l">L</span> Lekhio</div>

  <h1>Income summary</h1>
  <div class="muted">${esc(p.businessName)} &middot; tax year ${esc(p.taxYear)} (${esc(p.periodLabel)})</div>

  <div class="card">
    <table>
      ${row('Gross income', gbp(p.income))}
      ${row('Allowable expenses', gbp(p.expenses), { muted: true })}
      ${row('Net profit', gbp(p.profit), { bold: true })}
      ${p.companyExcluded ? '' : row(p.estimatedTaxLabel, gbp(p.estimatedTax), { muted: true })}
    </table>
    ${p.capitalCost > 0 ? `<div class="capital">${gbp(p.capitalCost)} more left the account on ${p.capitalCount === 1 ? 'a car' : `${p.capitalCount} cars`}, which is not an allowable expense in one year. A car comes off over several years rather than all at once, so it is not in the figures above.</div>` : ''}
    ${p.financeCost > 0 ? `<div class="capital">${gbp(p.financeCost)} of residential mortgage interest is not an allowable expense either, so it is not in the figures above. Since Section 24 it is relieved as a basic rate tax credit instead${p.financeCredit > 0 ? `, and the credit of ${gbp(p.financeCredit)} is already taken off the estimated tax` : ''}.</div>` : ''}
    ${p.shareNote ? `<div class="whose">${esc(p.shareNote)}</div>` : ''}
    ${p.companyExcluded ? `<div class="whose">These are the company's figures, not this person's personal income. A company pays Corporation Tax on its own return, and the director is paid in salary and dividends, which are not shown here.</div>` : ''}
    <div class="stamp">Prepared by Lekhio &middot; ${esc(generated)} &middot; ${p.txCount} entries</div>
  </div>

  <button class="btn noprint" onclick="window.print()">Save as PDF</button>

  <p class="note">
    This is a summary prepared from the figures ${esc(p.businessName)} has recorded and confirmed in Lekhio, for income verification.
    It is not an HMRC document, an SA302, or a filed tax return, and it is only as complete as the records kept.
    The estimated tax figure, where one is shown, is guidance based on the published ${esc(p.taxYear)} rates and does not include any other income, reliefs or allowances the person may have.
    For an official SA302 or tax year overview, the person can log in to their HMRC account. Some lenders ask for HMRC documents as well as a summary like this.
  </p>
</div></body></html>`;
}
