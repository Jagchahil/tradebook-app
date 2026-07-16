// lib/taxoptimiser.ts. The engine that answers "lower my tax as much as possible".
//
// It scans a user's confirmed figures and profile and returns every LEGITIMATE
// lever to reduce their tax, each with an estimated saving and an autonomy action
// class. It is deterministic maths on the canonical engine, no AI, no cost.
//
// The doctrine line, held here as everywhere: these are the real HMRC rules
// applied to the user's own numbers. It surfaces genuine reliefs the user is
// entitled to; it never invents a claim or coaches disguising personal as
// business. Every money lever (buying an asset, a pension contribution) is
// classed irreversible, so applyDial can never auto-execute it, only draft it
// for the user's yes. Timing and tax-treatment guidance only. You decide.

import { FACTS, soleTraderTax, homeOfficeFlatRateMonthly, marriageAllowance } from './taxengine';
import { compare } from './ltdengine';
import { combinedIncomeTax, type PersonalIncomeResult } from './personalincome';
import { decideAction, type AutonomyLevel } from './autonomy';
import { studentLoanForSA, type StudentPlan } from './nistudentloan';

export interface OptimiserInput {
  startYear: number;
  monthsElapsed: number; // full months into the tax year, for projection confidence
  ytdTradeIncome: number;
  ytdTradeExpenses: number;
  ytdCisSuffered: number;
  employmentIncome: number; // annual PAYE salary, 0 if none
  // The student loan plans he is on. CIS is credited against income tax, Class 4 AND the student
  // loan on the real return, so a refund figure that ignores the loan promises him money he will
  // not get. Default [] so a caller that has no plans behaves exactly as before.
  studentPlans?: StudentPlan[];
  categoriesLogged: string[]; // distinct trade expense categories seen this year, lowercased
  homeOfficeClaimed: boolean;
  mileageClaimed: boolean;
  purchaseGoal?: { title: string; amount: number } | null;
  // Property stream this year, for the property levers. Default 0.
  ytdPropertyIncome?: number;
  ytdPropertyExpenses?: number;

  // THE REST OF HIS INCOME, so the tax we show is his WHOLE tax and not just his trade. Default 0,
  // which means a caller that has not captured these behaves exactly as before: no savings, no
  // dividends, and the figure is the sole-trader figure. Employment is already carried above.
  //   savingsIncome    bank/building-society interest (NOT ISAs, which are tax free)
  //   dividendIncome   dividends, e.g. from his own company
  savingsIncome?: number;
  dividendIncome?: number;

  // WHAT HE HAS TOLD US ABOUT HIMSELF. { married: 'yes', partner_low_earner: 'no', ... }
  //
  // Optional, and absent means UNKNOWN, never NO. A caller that has not read the circumstances gets
  // exactly the behaviour it got before this field existed: the conditional wording, no promise, no
  // suppression. Silence from a caller must never be mistaken for an answer from a man.
  circumstances?: Record<string, string>;
}

export interface Optimisation {
  key: string;
  title: string;
  detail: string; // plain English, with the user's own numbers
  estSaving: number; // estimated £ saved this year, 0 when not quantifiable
  action: string; // maps to lib/autonomy classifyAction
  info?: boolean; // pure information, nothing to action (e.g. a refund building)
}

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
}

// The rate the next pound of profit is taxed at (income tax plus Class 4 NI),
// which is what each pound of extra allowable deduction actually saves. Mirrors
// lib/agent.ts so a saving quoted here matches a saving quoted there.
export function marginalRate(projectedTotalIncome: number): number {
  if (projectedTotalIncome >= FACTS.personalAllowanceTaperFloor) return 0.62; // taper: 40 + 2 + 20
  if (projectedTotalIncome >= FACTS.class4UpperLimit) return 0.42; // 40 + 2
  if (projectedTotalIncome > FACTS.personalAllowance) return 0.26; // 20 + 6
  return 0;
}

// HIS WHOLE TAX, not just his trade. The figure an accountant puts at the bottom of the return:
// income tax across employment, self-employment, property, savings and dividends, stacked in the
// legal order (lib/personalincome.ts), plus Class 4 NIC on the trade. Projected to the full year the
// same way the levers are, and it says so, because a projection dressed as a fact is a lie. When the
// only income is a trade it equals soleTraderTax, so nothing an existing user sees moves.
export function taxPosition(input: OptimiserInput): PersonalIncomeResult & { projected: boolean } {
  const tradeNet = Math.max(0, input.ytdTradeIncome - input.ytdTradeExpenses);
  const canProject = input.monthsElapsed >= 3;
  const factor = canProject ? 12 / Math.max(1, input.monthsElapsed) : 1;
  const projTradeNet = tradeNet * factor;
  const propertyNet = Math.max(0, (input.ytdPropertyIncome ?? 0) - (input.ytdPropertyExpenses ?? 0)) * factor;
  const result = combinedIncomeTax({
    employment: Math.max(0, input.employmentIncome),
    selfEmployment: projTradeNet,
    otherNonSavings: propertyNet,
    savings: Math.max(0, input.savingsIncome ?? 0),
    dividends: Math.max(0, input.dividendIncome ?? 0),
  });
  return { ...result, projected: canProject };
}

// The common allowable costs a tradesperson usually has. Missing two or more of
// these while trading is a strong signal of unclaimed, tax-reducing spend.
const COMMON_COSTS = ['fuel', 'phone', 'insurance', 'tools'];

// Find every lever, richest first. Pure: same input, same list.
export function findOptimisations(input: OptimiserInput): Optimisation[] {
  const out: Optimisation[] = [];

  const tradeNet = Math.max(0, input.ytdTradeIncome - input.ytdTradeExpenses);
  const canProject = input.monthsElapsed >= 3;
  const factor = canProject ? 12 / Math.max(1, input.monthsElapsed) : 1;
  const projTradeNet = tradeNet * factor;
  // His projected income across every stream we know about. Employment was always here; savings and
  // dividends are added so the marginal-rate levers below judge his rate on his WHOLE income, not
  // just the trade. All three default to zero, so nothing changes for a caller that has not set them.
  const projTotalIncome =
    projTradeNet +
    Math.max(0, input.employmentIncome) +
    Math.max(0, input.savingsIncome ?? 0) +
    Math.max(0, input.dividendIncome ?? 0);
  const mRate = marginalRate(projTotalIncome);
  const cats = input.categoriesLogged.map((c) => c.toLowerCase());

  // 1. Pension to step back out of the 40% band. The biggest lever for a higher
  //    earner. Irreversible (moving money), so it can only ever be drafted.
  if (projTotalIncome > FACTS.class4UpperLimit) {
    const over = round(projTotalIncome - FACTS.class4UpperLimit);
    const saving = round(over * 0.2); // higher-rate relief on income pulled below the threshold
    out.push({
      key: 'pension_higher_rate',
      title: 'Step out of the 40% band',
      detail: `Your income is heading about £${over.toLocaleString('en-GB')} into the 40% higher rate. A pension contribution of up to that amount brings you back under and can save up to about £${saving.toLocaleString('en-GB')} in higher-rate tax. Your provider sets the amount. We are not a financial adviser, you decide.`,
      estSaving: saving,
      action: 'make_payment',
    });
  }

  // 2. Buying a planned asset before 5 April, so the whole cost lands this year
  //    under the Annual Investment Allowance. Irreversible (a purchase): draft only.
  const g = input.purchaseGoal;
  if (g && g.amount > 0 && mRate > 0) {
    const saving = round(g.amount * mRate);
    out.push({
      key: 'aia_timing',
      title: `Timing on ${g.title}`,
      detail: `If you buy ${g.title} (about £${round(g.amount).toLocaleString('en-GB')}) before 5 April, the whole cost comes off this year's tax under the Annual Investment Allowance, saving about £${saving.toLocaleString('en-GB')} at your rate. You choose when to buy.`,
      estSaving: saving,
      action: 'purchase',
    });
  }

  // 3. Costs the user is likely paying but not logging. Reversible admin: at the
  //    auto level Lekhio can prompt for these itself.
  const missing = COMMON_COSTS.filter((c) => !cats.includes(c));
  if (input.ytdTradeIncome > 0 && missing.length >= 2 && mRate > 0) {
    out.push({
      key: 'missed_expenses',
      title: 'Costs you may not be claiming',
      detail: `You have nothing logged this year for ${missing.join(', ')}. If you pay for these for work, logging them lowers your tax: every £100 of allowable cost saves about £${round(100 * mRate)} at your rate. Snap the receipts or text them and Lekhio sorts the rest.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // 4. Use of home. A flat rate with no receipts, missed by almost everyone.
  if (!input.homeOfficeClaimed && projTradeNet > 0 && mRate > 0) {
    const monthly = homeOfficeFlatRateMonthly(25); // the 25 to 50 hours a month band
    const saving = round(monthly * 12 * mRate);
    out.push({
      key: 'home_office',
      title: 'Claim use of home',
      detail: `Do your quotes, invoices or admin from home? You can claim a flat £${monthly} a month with no receipts to keep. Over a year that is about £${saving.toLocaleString('en-GB')} off your tax.`,
      estSaving: saving,
      action: 'apply_allowance_election',
    });
  }

  // 5. Mileage instead of fuel, where they log fuel but no miles. Cannot quantify
  //    without the miles, so it is a prompt, not a number.
  if (!input.mileageClaimed && (cats.includes('fuel') || cats.includes('van')) && projTradeNet > 0) {
    out.push({
      key: 'mileage',
      title: 'Claim your mileage',
      detail: `You are logging fuel but no mileage. For a van or car you can often claim more by logging miles at 55p a mile for the first 10,000 instead. Text "log 24 miles" whenever you drive for work.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // 6. A CIS refund building. Pure information, no action, but a big reassurance
  //    for subbies who overpay through the year.
  const taxDue = soleTraderTax(tradeNet).total;
  // CIS pays off the student loan too. See the note in lib/agent.ts.
  const slDue =
    (input.studentPlans ?? []).length > 0
      ? studentLoanForSA(tradeNet, input.employmentIncome, input.studentPlans as StudentPlan[])
      : 0;
  const owedSoFar = taxDue + slDue;
  if (input.ytdCisSuffered > owedSoFar && input.ytdCisSuffered > 0) {
    const refund = round(input.ytdCisSuffered - owedSoFar);
    out.push({
      key: 'cis_refund',
      title: 'A CIS refund is building',
      detail: `Contractors have deducted about £${round(input.ytdCisSuffered).toLocaleString('en-GB')} of CIS tax from you, more than the £${round(owedSoFar).toLocaleString('en-GB')} your profit owes so far. The difference, about £${refund.toLocaleString('en-GB')}, comes back when you file. Keep every deduction statement.`,
      estSaving: 0,
      info: true,
      action: 'confirm_prompt',
    });
  }

  // 7. Incorporation. The question every higher earner eventually asks. We answer
  //    it honestly from our own maths rather than reflexively pushing a company.
  //    On 2026/27 rates a sole trader who draws all their profit is usually better
  //    off, so at a profit where the question is live we say so, name the figure,
  //    and flag the one thing that flips it (leaving money in the business). If
  //    the maths ever favours a company for this user, the message flips. Pure
  //    information, never summed into the headline (estSaving 0); accountant note
  //    on both sides because it is a structural decision with real admin.
  if (projTradeNet >= 50000) {
    const comp = compare(Math.round(projTradeNet));
    const profitStr = round(projTradeNet).toLocaleString('en-GB');
    if (comp.winner === 'ltd' && comp.delta >= 1000) {
      out.push({
        key: 'incorporation',
        title: 'A limited company could save you tax',
        detail: `At your projected profit of about £${profitStr}, running as a limited company could leave roughly £${round(comp.delta).toLocaleString('en-GB')} more in your pocket a year, mostly through the lower tax on dividends. It adds filing and admin duties, so it is a real decision. Speak to an accountant before you switch, we can show them your numbers.`,
        estSaving: 0,
        info: true,
        action: 'confirm_prompt',
      });
    } else {
      const gap = Math.max(0, round(-comp.delta));
      out.push({
        key: 'incorporation',
        title: 'Should you go limited? Not yet',
        detail: `People ask us this a lot at your level. On this year's rates, staying a sole trader is currently the better deal for you by about £${gap.toLocaleString('en-GB')} a year, because you draw all your profit out and dividend tax has risen. A limited company starts to pay off when you leave money in the business rather than taking it all. If that changes, we will tell you. Our free sole trader against limited tool shows the full picture, and any accountant can talk it through.`,
        estSaving: 0,
        info: true,
        action: 'confirm_prompt',
      });
    }
  }

  // 8. Property costs. Rental income with almost no expenses logged means likely
  //    unclaimed deductions (mortgage interest for the 20% credit, repairs, agent
  //    fees, insurance). Reversible admin: a prompt to log them.
  const propIncome = Math.max(0, input.ytdPropertyIncome ?? 0);
  const propExpenses = Math.max(0, input.ytdPropertyExpenses ?? 0);
  if (propIncome > 0 && propExpenses < propIncome * 0.1) {
    out.push({
      key: 'property_costs',
      title: 'Property costs you may not be claiming',
      detail: `You have rental income but very little logged against it. Mortgage interest (a 20% tax credit), repairs, agent fees, insurance and ground rent all reduce your property tax. Log them and Lekhio applies the £1,000 property allowance or your actual costs, whichever leaves you better off.`,
      estSaving: 0,
      action: 'log_entry',
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════════
  // MARRIAGE ALLOWANCE. £252 a year, and the whole point of having asked him anything.
  //
  // Until we had the facts, this block could only ever say "IF you are married, and IF they earn
  // little, THEN...". It said that to every man, married or not, for ever. Doc 103 calls that the
  // empty test: a row that does not apply to him most of the time teaches him to stop reading, and
  // then he misses the week it does apply.
  //
  // Now we have asked. So there are exactly three states, and the difference between them is the
  // difference between a tool and a leaflet:
  //
  //   HE SAID NO       -> say NOTHING. He is not married. It is not a relief, it is clutter.
  //   HE HAS NOT SAID  -> exactly what we did before: the conditional wording, and £0 in the total.
  //   HE SAID YES      -> the condition is gone, so we can finally be specific about HIS situation.
  // ═════════════════════════════════════════════════════════════════════════════════════════════
  const circ = input.circumstances ?? {};
  const married = circ.married;                       // 'yes' | 'no' | 'skip' | undefined
  const partnerLow = circ.partner_low_earner;         // 'yes' | 'no' | 'skip' | undefined
  const ma = marriageAllowance(projTotalIncome);

  // ⚠️ 'no' SUPPRESSES. 'skip' AND undefined DO NOT.
  //
  // "Not now" is not "no". A man who would not answer has not told us he is single, and treating his
  // silence as a denial quietly deletes £252 a year from a married man's product and he never learns
  // it was there. Only an explicit no closes the door, which is exactly why the answer column is
  // text and not a boolean.
  const notMarried = married === 'no';

  if (!notMarried && ma.role === 'receiver') {
    // He earns between the personal allowance and the higher rate threshold, so he is the one who
    // can RECEIVE. Whether there is anything to receive turns entirely on what she earns.
    const confirmed = married === 'yes' && partnerLow === 'yes';
    const ruledOut = married === 'yes' && partnerLow === 'no';

    if (!ruledOut) {
      out.push({
        key: 'marriage_allowance_receive',
        title: confirmed
          ? `Your partner can hand you £${ma.worth}. They have to be the one to do it.`
          : 'If your wife or husband earns little, they can hand you £252',
        detail: confirmed
          ? // THE CONDITION IS GONE. He told us he is married and that she earns under the allowance,
            // we logged both answers in his own words, and now we may finally say "can" instead of "if".
            `You told me you are married and that they earn under £${FACTS.personalAllowance.toLocaleString('en-GB')}. `
            + `That means they can transfer £${ma.transfer.toLocaleString('en-GB')} of their tax free allowance to you, `
            + `worth £${ma.worth} off your bill every year, and they can backdate it four years. `
            + `⚠️ THEY have to make the claim, not you and not me. HMRC will not accept it from the partner receiving it. `
            + `Ten minutes at gov.uk/marriage-allowance, and they need both of your National Insurance numbers. Nothing else. No certificate.`
          : `If you are married or in a civil partnership and they earn under £${FACTS.personalAllowance.toLocaleString('en-GB')} a year, `
            + `they can transfer £${ma.transfer.toLocaleString('en-GB')} of their tax free allowance to you. `
            + `That is £${ma.worth} off your tax bill, every year, and it can be backdated four years. `
            + `THEY have to make the claim, not you. HMRC will not take it from the receiving partner. `
            + `It takes about ten minutes at gov.uk/marriage-allowance and you need both National Insurance numbers.`,

        // ⚠️ THE ONE PLACE IN THIS FILE WHERE A CIRCUMSTANCE BECOMES A NUMBER.
        //
        // estSaving feeds totalEstimatedSaving(), and a total is a promise. It was 0 here from the
        // day this block was written, on purpose, because £252 hung on a fact we did not have. We
        // have it now: he was asked, in plain words, and his answer is on the record with the exact
        // question he read next to it.
        //
        // So it goes in the total ONLY when both facts are yes. Not on a skip. Not on a guess. Not
        // on his income alone. This is the difference between the maximiser and a repayment agent.
        estSaving: confirmed ? ma.worth : 0,
        info: !confirmed,
        action: 'log_entry',
      });
    }
  }

  if (!notMarried && ma.role === 'giver') {
    // He is under his own personal allowance, so part of it is going to waste. HE is the transferor,
    // and the transferor is the one HMRC takes the claim from. This is the ONE branch of Marriage
    // Allowance where our own customer is the claimant, which makes it the one we can actually walk
    // him through instead of handing off.
    //
    // But he is only the giver if she has tax to pay. If she is under the allowance too, neither of
    // them pays a penny of income tax and there is nothing to transfer to. Say nothing at all: an
    // optimisation that cannot possibly save him money is an advert.
    const bothSkint = married === 'yes' && partnerLow === 'yes';

    if (!bothSkint) {
      const askedAndMarried = married === 'yes';
      out.push({
        key: 'marriage_allowance_give',
        title: 'You are not using all of your tax free allowance',
        detail:
          `You are on course to earn under £${FACTS.personalAllowance.toLocaleString('en-GB')}, so part of your tax free allowance is going to waste. `
          + (askedAndMarried
            ? `You told me you are married, so you can transfer £${ma.transfer.toLocaleString('en-GB')} of it to them, `
            : `If you are married or in a civil partnership, you can transfer £${ma.transfer.toLocaleString('en-GB')} of it to them, `)
          // ⚠️ THE CONDITION WE HAVE NOT ASKED ABOUT IS WELDED TO THE SENTENCE, NOT DROPPED.
          //
          // A higher rate partner cannot receive it. We never asked whether she is a higher rate
          // payer, only whether she is under the allowance, so we do not know, so we say so in the
          // same breath and we do NOT quantify it. The moment we start filling gaps with optimism
          // this becomes a leaflet.
          + `as long as they pay basic rate tax and not higher rate. `
          + `It saves THEM about £${ma.worth} a year and costs you nothing, because you were not going to use it. `
          + `You are the one who has to apply, and that is the good news: gov.uk/marriage-allowance, ten minutes, both National Insurance numbers.`,
        estSaving: 0, // The saving lands on HER bill, not his. It is not his money, so it is not his total.
        info: true,
        action: 'log_entry',
      });
    }
  }

  // Richest quantified saving first; information items sink to the bottom.
  return out.sort((a, b) => b.estSaving - a.estSaving);
}

// The headline number: the total quantified saving on the table this year.
export function totalEstimatedSaving(opts: Optimisation[]): number {
  return opts.reduce((s, o) => s + Math.max(0, o.estSaving), 0);
}

export interface DialledOptimisation extends Optimisation {
  mode: 'auto' | 'draft' | 'suggest'; // what Lekhio may do about it at the user's dial setting
  requiresApproval: boolean; // always true for the money levers
}

// Apply the autonomy dial to each lever. The money levers (pension, purchase)
// come back requiresApproval true and mode never 'auto', enforced in lib/autonomy.
export function applyDial(opts: Optimisation[], level: AutonomyLevel): DialledOptimisation[] {
  return opts.map((o) => {
    const d = decideAction(o.action, level);
    return { ...o, mode: d.mode, requiresApproval: d.requiresApproval };
  });
}
