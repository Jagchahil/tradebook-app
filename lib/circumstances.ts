// THE CIRCUMSTANCES. Every relief we cannot give him because we never asked.
//
// ---------------------------------------------------------------------------------------------
// THE INSIGHT THIS WHOLE FILE RESTS ON:
//
//   NONE OF THESE FACTS IS VISIBLE IN A BANK FEED OR A RECEIPT PHOTO.
//
// That is exactly why they are missed, by every app in this category, for every user, for ever.
// A receipt tells you he bought diesel. It does not tell you he is married, that he was a PAYE
// electrician until eighteen months ago, or that his mother-in-law minds the kids on a Friday.
//
// Marriage Allowance was money on the floor for one reason: THERE WAS NOWHERE IN THIS PRODUCT FOR
// A MAN TO TELL US HE WAS MARRIED. Not a bug. A hole where a question should be. (doc 108 §3.)
// ---------------------------------------------------------------------------------------------
//
// ASK ONCE. NEVER ASK AGAIN. THE TECH DISAPPEARS.
//
// He answers in onboarding, or in one line on WhatsApp, and from that second every figure in the
// product silently accounts for it. He does nothing else, ever. That is the Apple move, and it is
// the whole feel of the thing.
//
// ---------------------------------------------------------------------------------------------
// ⚠️ THE FOUR RULES. Read them before adding a single entry.
//
// 1. AN UNPROVEN CLAIM MAY TOUCH HIS ESTIMATE. IT MAY NEVER TOUCH A FILING.
//    Finance Act 2026 Sch 22 (in force 1 April 2026) makes it SANCTIONABLE CONDUCT to act with
//    intent to bring about a loss of tax revenue, and that expressly includes a client "obtaining
//    more tax relief than they are entitled to obtain by law". Penalties to £1m and naming. The
//    running "what do you owe" figure can carry an asserted claim. The RETURN cannot. (doc 108 §1.)
//
// 2. THE LOG IS THE DEFENCE. What we asked, in the exact words he saw. What he answered. When.
//    That record is the only thing that proves we did not intend a loss of tax revenue.
//
// 3. WE DO NOT ALWAYS CLAIM IT FOR HIM, AND SOMETIMES WE CANNOT.
//    Marriage Allowance must be claimed by the TRANSFEROR, who is his wife, who is not our customer.
//    Small Business Rate Relief goes to the COUNCIL, not HMRC. Specified Adult Childcare Credits
//    need TWO signatures. `claimant` says who, and if it is not him, our job is to TELL him and get
//    out of the way. A feature that tries to claim something it cannot is worse than no feature.
//
// 4. THE VALUE IS ORDER OF MAGNITUDE AND IT NEVER ENTERS A TOTAL.
//    It is here to SORT the questions, so we ask the £3,000 one before the £20 one. It is not a
//    promise. lib/ledger.ts counts only what was actually saved, and nothing in this file can reach
//    it. (See the ledger's four guards.)

export type Who = 'him' | 'his partner' | 'his council' | 'both of them' | 'his company';

export interface Circumstance {
  key: string;

  // ⚠️ THE QUESTION. This is the product.
  //
  // One sentence, in his language, that he can answer without looking anything up. If it needs a
  // form, it is wrong. If it needs him to know a tax term, it is wrong. "Were you employed before
  // you went self-employed?" is right. "Do you have carried-back trade losses under ITA 2007 s72?"
  // is a way of guaranteeing he never answers.
  ask: string;

  // What it unlocks, in his words, so the question is obviously worth answering.
  why: string;

  // Order of magnitude ONLY, for sorting the questions. Never a promise. Never in a total.
  worthOrder: 'huge' | 'large' | 'real' | 'small';

  // WHO actually has to make the claim. Get this wrong and every man who follows us gets rejected.
  claimant: Who;

  // How many years back it reaches. 0 = this year only. This is why asking EARLY matters: some of
  // these are worth four years of money the day he answers.
  backYears: number;

  // What HMRC would want if it ever asked. Note how many of these are "nothing".
  evidence: string;

  // The primary source. A claim with no source does not go in this file. badrLifetimeLimit was
  // deleted from the tax engine on 14 July for exactly that reason.
  source: string;
}

// ---------------------------------------------------------------------------------------------
// THE LIST. Sorted by what it is worth, because that is the order we should be asking.
// ---------------------------------------------------------------------------------------------
export const CIRCUMSTANCES: Circumstance[] = [
  {
    // 🔴 THE BIGGEST NUMBER ON THIS PAGE, AND IT IS INVISIBLE UNLESS YOU ASK ONE QUESTION.
    //
    // A sparky who packed in his employed job and lost money in his first year can carry that loss
    // back THREE YEARS against the WAGES HE EARNED AS AN EMPLOYEE. HMRC send him a cheque.
    // Almost nobody does it. It is not in a bank feed. It is not on a receipt. It is a sentence.
    key: 'prior_employment',
    ask: 'What were you doing before you went self-employed? Were you employed, and for how long?',
    why: 'If you lose money in your first four years, we can carry that loss back against the wages from your old job. HMRC send you a cheque. Most people never claim it.',
    worthOrder: 'huge',
    claimant: 'him',
    backYears: 3,
    evidence: 'Your P60s or P45s from the old job, plus the loss figure.',
    source: 'ITA 2007 s72 (early trade losses relief); HS227',
  },
  {
    // 7 YEARS. Not four. The van, the Gas Safe course, the first set of tools, all bought before he
    // ever registered, all deemed incurred on day one of trading.
    key: 'start_date',
    ask: 'When did you actually start trading, and what did you buy in the years before that? Tools, a van, courses, your first insurance?',
    why: 'You can claim things you bought up to SEVEN years before you started. Most people think it is nothing before day one.',
    worthOrder: 'huge',
    claimant: 'him',
    backYears: 7,
    evidence: 'The receipts. It must be a genuine business cost.',
    source: 'ITTOIA 2005 s57; BIM46351. Capital goes through CAA 2001 s12.',
  },
  {
    // A plumber who registers for VAT with a fully kitted van can reclaim the VAT on every tool
    // still on hand, from four years back, on his very first return. And the invoices he needs are
    // THE ONES WE ARE ALREADY STORING FOR HIM.
    key: 'vat_registered',
    ask: 'Are you VAT registered, and when did you register?',
    why: 'When you registered you could have reclaimed the VAT on every tool and bit of kit you already owned, going back four years. Almost nobody does. We have your receipts.',
    worthOrder: 'huge',
    claimant: 'him',
    backYears: 4,
    evidence: 'The original VAT invoices, and that the goods were still on hand at registration.',
    source: 'Reg 111, VAT Regulations 1995; VIT32000. Goods 4 years, services 6 months.',
  },
  {
    // The basic rate is added automatically. THE HIGHER RATE SLICE IS NOT. He has to claim it, and
    // vast numbers of people never do.
    key: 'pension',
    ask: 'Do you pay into a pension?',
    why: 'The basic rate relief goes in automatically. The higher rate slice does NOT. You have to claim it, and most people never do.',
    worthOrder: 'large',
    claimant: 'him',
    backYears: 4,
    evidence: 'Your pension provider’s annual statement showing gross contributions.',
    source: 'GOV.UK, tax on your private pension. Relief is capped by your relevant earnings.',
  },
  {
    // ⚠️ WE CANNOT CLAIM THIS ONE. HIS WIFE HAS TO. See doc 108 §3.
    //
    // The TRANSFEROR (the lower earner) makes the claim, and she is not our customer. Put it on HIS
    // return and we corrupt HMRC's own calculation. Our whole job here is to TELL HIM and get out
    // of the way. HMRC does not want a certificate either: it wants two NI numbers.
    key: 'married',
    ask: 'Are you married or in a civil partnership? And does your partner earn under the personal allowance?',
    why: 'If so, they can hand you part of their tax free allowance. It is worth £252 a year and it backdates four years.',
    worthOrder: 'real',
    claimant: 'his partner',
    backYears: 4,
    evidence: 'Nothing. HMRC asks for both National Insurance numbers, not a marriage certificate.',
    source: 'GOV.UK Marriage Allowance. The LOWER earner applies. ATT/Agent Update 111: do not also put it on the recipient’s return.',
  },
  {
    // A tick box that DEFAULTS TO OFF. A bad year silently costs him a state pension year, for ever.
    // It costs a few pounds a week. It is the cheapest financial product in Britain.
    key: 'low_profit_year',
    ask: 'Was this a lean year? Did you make less than the small profits threshold?',
    why: 'If so, a few pounds of voluntary National Insurance buys you a whole qualifying year toward your state pension. It is a tick box, and it is switched OFF by default. Miss it and that year is gone for ever.',
    worthOrder: 'large',
    claimant: 'him',
    backYears: 0,
    evidence: 'Nothing. It is a box on the return.',
    source: 'LITRG, National Insurance for the self-employed. Class 2 voluntary.',
  },
  {
    // The move nobody knows: claim Child Benefit, elect to receive ZERO. You keep the NI credit,
    // you never pay the charge. AND BACKDATING IS ONLY THREE MONTHS, so every month of delay is a
    // month of state pension gone for ever.
    key: 'children',
    ask: 'Do you have kids under 12? And does anyone in the house claim Child Benefit?',
    why: 'If you opted out because of the high income charge, the parent at home may have stopped building up their state pension without knowing. You can claim it and take zero pounds: you keep the pension credit and never pay the charge. It only backdates three months, so every month counts.',
    worthOrder: 'large',
    claimant: 'his partner',
    backYears: 0,
    evidence: 'The CH2 claim form. The LOWER earning parent must be the claimant, or the credit lands on the wrong record.',
    source: 'GOV.UK Child Benefit and the High Income Child Benefit Charge.',
  },
  {
    // A grandad who has minded the kids on a Friday since 2015 can pick up A DECADE of qualifying
    // years. Backdatable to 2011. Needs TWO signatures. HMRC does not advertise it.
    key: 'grandparent_childcare',
    ask: 'Does a grandparent, or an aunt or uncle, look after your kids while you work?',
    why: 'They can claim National Insurance credits for it, backdated all the way to 2011. It can be a decade of state pension. Hardly anybody knows it exists.',
    worthOrder: 'large',
    claimant: 'both of them',
    backYears: 15,
    evidence: 'Form CA9176, signed by BOTH the carer and whoever claims the Child Benefit.',
    source: 'GOV.UK, Specified Adult Childcare Credits. Back to April 2011.',
  },
  {
    // 🔴 GOES TO THE COUNCIL, NOT HMRC. Which is exactly why it is missed: there is no annual form
    // that reminds anyone, and no accountant raises it, because it is not on their form either.
    key: 'premises',
    ask: 'Do you rent a unit, a lock-up, a yard or a workshop?',
    why: 'You may be paying business rates you do not owe. Small Business Rate Relief can take the whole bill to zero, and councils will often backdate it years.',
    worthOrder: 'large',
    claimant: 'his council',
    backYears: 6,
    evidence: 'The rateable value and your lease. You apply to the COUNCIL, not to HMRC.',
    source: 'GOV.UK, Small Business Rate Relief. Council by council: there is no national backdating rule.',
  },
  {
    // Health data. Article 9. And a REAL document is genuinely required for this one, unlike marriage.
    key: 'blind',
    ask: 'Are you registered blind or severely sight impaired with your council?',
    why: 'There is an extra tax free allowance for it, and if you cannot use it all, it transfers to your husband or wife.',
    worthOrder: 'real',
    claimant: 'him',
    backYears: 4,
    evidence: 'The council’s registration letter or your certificate (CVI/BD8). ⚠️ THIS IS HEALTH DATA. Article 9. Explicit consent, and delete the image once checked.',
    source: 'GOV.UK Blind Person’s Allowance. Surplus transfers on form 575(T).',
  },
  {
    // ⚠️ A DATED LANDMINE FOR EXACTLY OUR AUDIENCE, and we need the ORDER DATE, not just the type.
    //
    // Double cab pickups became CARS on 6 April 2025 (Payne / Coca-Cola, Court of Appeal). Bought,
    // leased OR ORDERED before that date keeps the old van treatment to 2029.
    // And it is STILL A VAN FOR VAT. Same truck. Two answers. Both correct.
    key: 'vehicle',
    ask: 'What do you drive for work, and when did you buy or order it?',
    why: 'Double cab pickups were reclassified as cars in April 2025. If you ordered yours before then, you keep the old, much better treatment until 2029. The date matters more than the truck.',
    worthOrder: 'large',
    claimant: 'him',
    backYears: 0,
    evidence: 'The V5C and the purchase or order date.',
    source: 'EIM23151. Payne v HMRC (Coca-Cola), Court of Appeal. Transitional relief to 5 April 2029.',
  },
  {
    key: 'other_job',
    ask: 'Do you also have a job on the payroll alongside this?',
    why: 'It changes which of these you can claim, and it lets us get your tax code right instead of you overpaying all year.',
    worthOrder: 'real',
    claimant: 'him',
    backYears: 4,
    evidence: 'Your payslips or P60.',
    source: 'GOV.UK. Note: the EMPLOYEE working from home flat rate was abolished on 6 April 2026. The SELF-EMPLOYED one survives. Two different reliefs, one dead, one alive.',
  },
  {
    key: 'gift_aid',
    ask: 'Do you give to charity? Sponsorship, a church, a raffle at a fundraiser?',
    why: 'If you pay higher rate tax, part of it comes back to YOU, not just to the charity. And it can pull your income back under a threshold that is costing you a lot more.',
    worthOrder: 'real',
    claimant: 'him',
    backYears: 4,
    evidence: 'Your donation records.',
    source: 'GOV.UK Gift Aid. ⚠️ The carry-back election (ITA 2007 s426) must be in the ORIGINAL return. HMRC will NOT accept it in an amendment. A one-shot door.',
  },
  {
    key: 'rental',
    ask: 'Do you rent anything out? A room, a garage, a parking space, a bit of yard?',
    why: 'There is an allowance that can cover it entirely, and a much bigger one if a lodger lives in your house.',
    worthOrder: 'real',
    claimant: 'him',
    backYears: 4,
    evidence: 'Nothing, if it is under the limit and you claim no expenses against it.',
    source: 'GOV.UK, tax-free allowances on property and trading income. Rent a Room: HS223.',
  },
  {
    key: 'home_working',
    ask: 'Do you do your quotes, invoices and paperwork at home?',
    why: 'You can claim a flat rate every month with no receipts to keep at all.',
    worthOrder: 'small',
    claimant: 'him',
    backYears: 4,
    evidence: 'The hours you work at home each month. That is the whole evidence.',
    source: 'GOV.UK simplified expenses. ⚠️ NEVER advise exclusive business use of a room: it can cost him Private Residence Relief when he sells (HS283).',
  },
];

// SORT THE QUESTIONS BY WHAT THEY ARE WORTH. Ask the £3,000 one before the £20 one.
//
// A man will answer three questions on a good day. Which three we ask decides whether this product
// is worth £12.99 to him. Asking about his home office before asking what he did for a living last
// year is how you leave four figures on the floor and feel thorough.
const ORDER: Record<Circumstance['worthOrder'], number> = { huge: 0, large: 1, real: 2, small: 3 };

export function askingOrder(): Circumstance[] {
  return [...CIRCUMSTANCES].sort((a, b) => ORDER[a.worthOrder] - ORDER[b.worthOrder]);
}

// THE ONES WE CANNOT CLAIM FOR HIM.
//
// A feature that tries to claim something it has no standing to claim is worse than no feature: it
// gets rejected, he wastes an evening, and he blames us, correctly. For these, our entire job is to
// TELL HIM, tell him WHO has to do it, and get out of the way.
export function notOurs(): Circumstance[] {
  return CIRCUMSTANCES.filter((c) => c.claimant !== 'him');
}

// WHAT HE HAS NOT TOLD US YET. The gap is the money.
export function unanswered(answered: string[]): Circumstance[] {
  const seen = new Set(answered);
  return askingOrder().filter((c) => !seen.has(c.key));
}
