// Allowable expenses knowledge base for UK self employed sole traders.
//
// One source of truth, used by the WhatsApp webhook ("can I claim X?") and the
// web page. This is general information, not tax advice. Everything here is
// strictly within the law: the test is always HMRC's "wholly and exclusively
// for the purposes of the trade". We never suggest claiming what is not allowed,
// and we are honest about the grey areas where people get it wrong.
//
// Figures reflect the 2026/27 simplified expenses rates.

export type Verdict = 'yes' | 'partly' | 'depends' | 'no';

export interface ExpenseRule {
  key: string;
  title: string;
  verdict: Verdict;
  aliases: string[];
  // One plain line, used in the WhatsApp reply and the card.
  rule: string;
  // A touch more context for the web page.
  detail: string;
}

// Ordered so specific items (protective gear, uniform) are matched before the
// generic everyday clothing rule.
export const EXPENSE_RULES: ExpenseRule[] = [
  {
    key: 'protective',
    title: 'Boots, hi vis and protective gear',
    verdict: 'yes',
    aliases: ['boots', 'work boots', 'safety boots', 'steel toe', 'hi vis', 'hi-vis', 'high vis', 'ppe', 'hard hat', 'helmet', 'goggles', 'safety glasses', 'gloves', 'overalls', 'protective', 'knee pads', 'ear defenders', 'respirator', 'face mask'],
    rule: 'Yes, fully. Protective clothing and safety kit you need for the job are allowable in full.',
    detail: 'Anything you wear to protect yourself or your normal clothes on the job, boots, hi vis, hard hats, goggles, gloves, overalls, counts. Claim the full cost.',
  },
  {
    key: 'uniform',
    title: 'A branded uniform',
    verdict: 'yes',
    aliases: ['uniform', 'branded', 'logo top', 'logo shirt', 'logo', 'embroidered', 'workwear'],
    rule: 'Yes, if it is a real uniform. A top with your business name or logo permanently on it is allowable. A plain top is not.',
    detail: 'A uniform must carry your business name or logo, fixed on, not a clip on badge, and not be something you would wear day to day. Branded workwear is fine. Plain clothes are not, even with a stick on logo.',
  },
  {
    key: 'everyday_clothes',
    title: 'Everyday clothes',
    verdict: 'no',
    aliases: ['clothes', 'clothing', 'jeans', 'trousers', 'shirt', 'suit', 'shoes', 'jumper', 'jacket', 'coat', 'tracksuit', 't shirt', 't-shirt', 'outfit'],
    rule: 'No, sorry. Everyday clothing is not allowable, even if you only ever wear it for work. HMRC is strict on this one.',
    detail: 'This is the classic myth. Normal clothes are not claimable even if you bought them only for work and never wear them otherwise. Only a branded uniform or genuine protective clothing gets through.',
  },
  {
    key: 'tools',
    title: 'Tools and equipment',
    verdict: 'yes',
    aliases: ['tools', 'tool', 'drill', 'saw', 'ladder', 'equipment', 'machinery', 'kit', 'power tool', 'laptop', 'computer', 'printer', 'camera', 'machine'],
    rule: 'Yes, fully. Tools and equipment for the work are allowable. Big items can be claimed in full the year you buy them through the Annual Investment Allowance.',
    detail: 'Tools, machinery, a work laptop, all allowable. For larger purchases the Annual Investment Allowance lets you deduct the whole cost in the year you buy it, up to £1 million, so the full amount comes off your profit.',
  },
  {
    key: 'van',
    title: 'A van',
    verdict: 'yes',
    aliases: ['van', 'transit', 'pickup', 'flatbed'],
    rule: 'Yes. A van used for the business is allowable. You can claim the full cost the year you buy it, or run it on simplified mileage instead.',
    detail: 'A van is a clean claim. Either deduct the cost through the Annual Investment Allowance and claim the running costs, or keep it simple and claim 55p a mile for the first 10,000 business miles, then 25p. Use one method or the other, not both.',
  },
  {
    key: 'car',
    title: 'A car',
    verdict: 'depends',
    aliases: ['car', 'vehicle', 'motor'],
    rule: 'Part of it. Only the business share of a car counts. Simplest is 55p a mile for the first 10,000 business miles, then 25p.',
    detail: 'A car nearly always has private use, so you cannot claim all of it. The easy route is mileage, 55p a mile to 10,000 then 25p, which covers fuel and wear. The other route is actual running costs and capital allowances, but only the business portion, with records to back it.',
  },
  {
    key: 'fuel',
    title: 'Fuel',
    verdict: 'partly',
    aliases: ['fuel', 'diesel', 'petrol', 'unleaded'],
    rule: 'The business share. Either claim fuel as part of your actual vehicle costs, or use simplified mileage instead, not both.',
    detail: 'If you use mileage at 55p a mile, that already includes fuel, so do not claim fuel on top. If you claim actual running costs, claim only the business proportion of your fuel.',
  },
  {
    key: 'mileage',
    title: 'Mileage',
    verdict: 'yes',
    aliases: ['mileage', 'miles', 'mile'],
    rule: 'Yes. Business miles are 55p a mile for the first 10,000, then 25p. Just text me the miles and I log the claim.',
    detail: 'Simplified mileage is the easiest vehicle claim. 55p a mile for the first 10,000 business miles in the year, 25p after that. It covers fuel, insurance and wear, so you do not also claim those.',
  },
  {
    key: 'phone',
    title: 'Phone and broadband',
    verdict: 'partly',
    aliases: ['phone', 'mobile', 'broadband', 'internet', 'wifi', 'phone bill', 'data'],
    rule: 'The business share. Work out the business percentage of your bill and claim that. Text me, like "phone bill £45, 80% business".',
    detail: 'You cannot claim the whole bill unless the line is used only for business. Work out a fair business percentage and claim that slice. Same for broadband.',
  },
  {
    key: 'use_of_home',
    title: 'Working from home',
    verdict: 'yes',
    aliases: ['working from home', 'work from home', 'use of home', 'home office', 'wfh', 'home as office', 'study'],
    rule: 'Yes. Claim a flat rate by hours, £10, £18 or £26 a month, or a fair share of your actual home bills.',
    detail: 'If you do admin or work from home, claim it. The simple way is the HMRC flat rate by hours a month, £10 for 25 to 50 hours, £18 for 51 to 100, £26 for 101 plus. Or claim a fair proportion of your actual rent, heat, light and so on.',
  },
  {
    key: 'premises',
    title: 'Rent on business premises',
    verdict: 'yes',
    aliases: ['rent', 'workshop', 'unit', 'lockup', 'lock up', 'yard', 'storage', 'premises', 'shop rent', 'studio'],
    rule: 'Yes. Rent, rates, power and insurance on premises you use for the business are allowable.',
    detail: 'A workshop, unit, yard or storage you rent for the business is fully allowable, along with its rates, power and insurance.',
  },
  {
    // ═════════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THIS RULE WAS WRONG, AND IT WAS WRONG IN THE DIRECTION THAT COSTS HIM MONEY.
    //
    // What it used to say: "Training for a brand new trade or skill is not [allowable]."
    // That was the law until 2024. HMRC BROADENED IT, and nobody told us, because nothing was
    // watching this rule: it was one of the six we asserted on our own authority, and our authority
    // is nothing. corpus.mjs printed "UNCITED training" every night and it was right to.
    //
    // HMRC's live words, /expenses-if-youre-self-employed/training-courses, verified 14 July 2026.
    // You CAN claim for training that helps you:
    //   . improve skills and knowledge you currently use for your business
    //   . keep up-to-date with technology used in your industry
    //   . DEVELOP NEW SKILLS AND KNOWLEDGE RELATED TO CHANGES IN YOUR INDUSTRY
    //   . DEVELOP NEW SKILLS AND KNOWLEDGE TO SUPPORT YOUR BUSINESS, INCLUDING ADMINISTRATIVE SKILLS
    //
    // So the sparky who takes an EV charge-point course, and the plumber who takes a bookkeeping
    // course, are BOTH allowable now. We were telling both of them no.
    //
    // The line did not disappear. It MOVED. What you still cannot claim is training to START A NEW
    // BUSINESS, or to expand into an area NOT DIRECTLY RELATED to your industry.
    //
    // ⚠️ NOTE THE DIRECTION OF THE ERROR. Finance Act 2026 Sch 22 punishes helping a man claim MORE
    // than he is entitled to. This was the opposite: we were talking him out of a relief he was
    // owed. The law will never fine us for that, and it is still a failure of the only thing this
    // product is for. Doc 108: the maximiser answers "how much of my money am I giving away that I
    // did not have to". An over-cautious wrong answer is still a wrong answer.
    // ═════════════════════════════════════════════════════════════════════════════════════════
    key: 'training',
    title: 'Training and courses',
    verdict: 'depends',
    aliases: ['training', 'course', 'courses', 'qualification', 'certification', 'cscs', 'gas safe course', 'ticket', 'refresher'],
    rule: 'Mostly yes. Keeping your skills current, keeping up with the tech in your trade, and even new skills that support the business, like bookkeeping, are allowable. Training to start a different business is not.',
    detail: 'HMRC widened this in 2024 and most people have not caught up. Refreshers and tickets are allowable, obviously. But so is learning something NEW, as long as it relates to how your industry is changing or it supports the business you already run. An electrician taking an EV charging course, or any trade taking a bookkeeping or admin course, can claim it. What you cannot claim is training to start a different business, or to move into an area that has nothing to do with your trade.',
  },
  {
    key: 'meals',
    title: 'Food and meals',
    verdict: 'depends',
    aliases: ['meals', 'meal', 'lunch', 'food', 'dinner', 'breakfast', 'coffee', 'subsistence', 'sandwich'],
    rule: 'Depends. A meal on a genuine business trip or an overnight stay can be claimed. Your everyday lunch cannot.',
    detail: 'Subsistence on a real business journey away from your normal pattern, or while staying away overnight, is allowable. The ordinary lunch you would buy anyway is not, even on site.',
  },
  {
    key: 'travel',
    title: 'Travel',
    verdict: 'depends',
    aliases: ['travel', 'train', 'bus', 'taxi', 'flight', 'ferry', 'tube', 'public transport', 'congestion charge', 'toll'],
    rule: 'Depends. Travel to a job, a supplier or a client is allowable. Your normal commute to a regular place of work is not.',
    detail: 'Fares and tolls for business journeys are allowable. The everyday commute between home and a regular workplace is not. If you travel to different sites, those journeys usually count.',
  },
  {
    key: 'parking',
    title: 'Parking and fines',
    verdict: 'depends',
    aliases: ['parking', 'car park', 'parking ticket', 'fine', 'penalty', 'pcn'],
    rule: 'Parking on a business trip, yes. Parking and speeding fines, no, HMRC never allows penalties.',
    detail: 'Parking while you are working is fine to claim. Fines and penalties, parking tickets, speeding, late filing, are never allowable.',
  },
  {
    key: 'materials',
    title: 'Materials and stock',
    verdict: 'yes',
    aliases: ['materials', 'stock', 'supplies', 'parts', 'consumables', 'timber', 'cable', 'pipe', 'paint', 'fixings', 'screws'],
    rule: 'Yes, fully. Materials and stock you buy for jobs are allowable in full.',
    detail: 'Everything you buy in to do the work or to sell on, materials, parts, consumables, is fully allowable.',
  },
  {
    key: 'insurance',
    title: 'Insurance',
    verdict: 'yes',
    aliases: ['insurance', 'public liability', 'liability', 'tools insurance', 'van insurance', 'professional indemnity'],
    rule: 'Yes. Business insurance like public liability, tools and professional indemnity is allowable.',
    detail: 'Cover you take for the business, public liability, tools, professional indemnity, is allowable. Van insurance is covered if you claim actual vehicle costs rather than mileage.',
  },
  {
    // ═════════════════════════════════════════════════════════════════════════════════════════
    // 🔴 WE TOLD HIM OUR OWN FEE WAS ALLOWABLE. HMRC'S PAGE SAYS PART OF IT IS NOT.
    //
    // The old line ended: "Lekhio itself is allowable." Flat, confident, and about the invoice we
    // send him. Meanwhile GOV.UK's own legal and financial costs page, live today, lists under
    // "You cannot claim for":
    //
    //     "the cost of preparing and submitting your Self Assessment tax return"
    //
    // Read Finance Act 2026 Sch 22 and then read that sentence of ours again. Sanctionable conduct
    // is acting with intent to bring about a loss of tax revenue, and it expressly includes a client
    // "obtaining more tax relief than they are entitled to obtain by law". We were nudging a man
    // toward a deduction HMRC's own guidance excludes. FOR OUR OWN FEE. It is the single most
    // self-serving sentence in this codebase and I do not think anybody meant it that way, which is
    // exactly how these things happen: it reads like a nice fact about the product.
    //
    // ⚠️ THE FIX IS NOT TO ARGUE THE POINT. It is arguable. HMRC's own manual (BIM46435) is softer
    // than this page, and in practice most accountants put the whole subscription through and are
    // never challenged. That is precisely the reasoning we are not allowed to have. Doc 104, Q5:
    // "Is it TRUE? Not is it defensible. TRUE."
    //
    // So: say what HMRC says, tell him plainly which part is which, and let him decide. We do not
    // get to be the one who marks our own homework on our own invoice.
    // ═════════════════════════════════════════════════════════════════════════════════════════
    key: 'fees',
    title: 'Accountant and professional fees',
    verdict: 'yes',
    aliases: ['accountant', 'bookkeeper', 'accountancy', 'professional fees', 'solicitor', 'legal fees', 'software', 'subscription to software'],
    rule: 'Yes. Accountant and bookkeeping fees, and software you use for the business, are allowable.',
    detail: 'Accountancy, bookkeeping and most legal fees for running the business are allowable, as is business software. One thing HMRC is specific about, and it applies to us too: the cost of preparing and submitting your Self Assessment tax return itself is NOT allowable. The bookkeeping is. We are not going to tell you our own bill is fully deductible when HMRC\'s own page says that part of it is not.',
  },
  {
    // 🔴 WE WERE WARNING HIM ABOUT A CAP THAT NO LONGER EXISTS.
    //
    // The old text said "There is a cap on interest under the simpler cash basis, but most sole
    // traders are well inside it." That was the £500 cash-basis interest restriction, and it went
    // with the cash basis reform on 6 APRIL 2024. GOV.UK's cash basis page now lists "interest and
    // bank charges" as an allowable expense with no cap mentioned anywhere on it, and cash basis is
    // now the DEFAULT method, not the "simpler" alternative.
    //
    // Harmless? Not quite. A man who reads "there is a cap" and does not know the number stops
    // logging his loan interest, because he assumes he is near it. The vaguer the warning, the more
    // he leaves on the table. A caveat you cannot act on is not caution, it is noise.
    key: 'bankfinance',
    title: 'Bank charges and interest',
    verdict: 'yes',
    aliases: ['bank charges', 'bank fees', 'interest', 'overdraft', 'card fees', 'finance charges', 'loan interest'],
    rule: 'Yes. Business bank charges and interest on business borrowing are allowable. Repaying the loan itself is not.',
    detail: 'Charges on a business account, overdraft and card fees, interest on business loans, hire purchase interest and leasing payments are all allowable. What you cannot claim is the repayment of the loan itself, only the interest and the charges on it. The old cap on interest under the cash basis was removed on 6 April 2024.',
  },
  {
    key: 'marketing',
    title: 'Advertising and website',
    verdict: 'yes',
    aliases: ['advertising', 'marketing', 'website', 'leaflets', 'business cards', 'signage', 'facebook ads', 'google ads', 'flyers', 'van signage'],
    rule: 'Yes. Advertising, your website, business cards, signage and ads are allowable.',
    detail: 'Getting your name out, a website, cards, leaflets, van signage, paid ads, is fully allowable.',
  },
  {
    key: 'subscriptions',
    title: 'Trade body and subscriptions',
    verdict: 'yes',
    aliases: ['subscription', 'membership', 'trade body', 'union', 'professional body', 'gas safe registration', 'niceic', 'fmb'],
    rule: 'Yes, the relevant ones. Membership of a trade or professional body for your work is allowable.',
    detail: 'Fees to a recognised trade or professional body relevant to your work, and registrations like Gas Safe or NICEIC, are allowable.',
  },
  {
    key: 'entertainment',
    title: 'Entertaining clients',
    verdict: 'no',
    aliases: ['entertainment', 'entertaining', 'client lunch', 'taking a client', 'hospitality', 'corporate hospitality'],
    rule: 'No. Entertaining clients or customers is specifically not allowable, however good for business it feels.',
    detail: 'Client entertaining is blocked by law, even when it genuinely wins work. It is one of the few things HMRC names directly as not allowable.',
  },
  {
    key: 'grooming',
    title: 'Haircuts and grooming',
    verdict: 'no',
    aliases: ['haircut', 'grooming', 'gym', 'makeup', 'make up', 'cosmetics', 'personal care'],
    rule: 'No. Personal grooming, haircuts and gym are personal, not business, so they are not allowable.',
    detail: 'Anything that keeps you, the person, going is personal by HMRC’s eyes, not a business cost, so it is out.',
  },
  {
    key: 'pension',
    title: 'Pension contributions',
    verdict: 'depends',
    aliases: ['pension', 'sipp', 'retirement', 'pension contribution'],
    rule: 'Not an expense, but a tax saver. A personal pension is not a business cost, but it gets you tax relief and cuts your bill. Well worth it.',
    detail: 'You do not put a personal pension through as a business expense, but paying in gets you tax relief, 20% added automatically and more reclaimed if you are a higher rate payer. One of the best legal ways to cut your tax.',
  },
];

export function checkExpense(query: string): ExpenseRule | null {
  const q = ' ' + query.toLowerCase().replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  for (const r of EXPENSE_RULES) {
    for (const a of r.aliases) {
      if (q.includes(' ' + a.toLowerCase() + ' ')) return r;
    }
  }
  return null;
}

export const VERDICT_ICON: Record<Verdict, string> = {
  yes: '✅',
  partly: '🟡',
  depends: '🟡',
  no: '❌',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  yes: 'Yes, claim it',
  partly: 'Part of it',
  depends: 'It depends',
  no: 'Usually not',
};

// The legal ways to keep more of what you earn. Used for the "pay less tax"
// reply and the web page. All strictly within the rules.
export const TAX_TIPS: { title: string; body: string }[] = [
  { title: 'Claim every allowable expense', body: 'The biggest one. Money you spend on the business that you forget to claim is tax you did not need to pay. Log it all, even the small stuff.' },
  { title: 'Working from home', body: 'Do your quotes and admin at home? Claim the flat rate, up to £26 a month, or a fair share of your actual bills.' },
  { title: 'Mileage', body: 'Every business mile is 55p for the first 10,000, then 25p. It adds up fast over a year of driving to jobs.' },
  { title: 'Tools in full, the year you buy them', body: 'The Annual Investment Allowance lets you deduct the whole cost of tools, equipment and a van in the year you buy, not spread over years.' },
  { title: 'Phone and broadband', body: 'Claim the business share of your phone and internet. For most trades that is most of the bill.' },
  { title: 'A pension', body: 'Paying into a pension gets you tax relief and cuts your bill. One of the most tax efficient moves there is for the self employed.' },
  { title: 'Claim your CIS back', body: 'If contractors deduct CIS from your pay, that is tax already handed over. It comes off your bill at tax time, and is often a refund.' },
  { title: 'The £1,000 trading allowance', body: 'If your costs are tiny, you can claim a flat £1,000 instead of your actual expenses. Lekhio uses whichever leaves you better off.' },
  // This used to be the WHOLE of our marriage allowance support: a sentence telling him free money
  // existed, and no help getting it. As of 14 July 2026 lib/taxengine.ts works out which side of the
  // transfer he is on and the optimiser tells him, with his own numbers and who has to apply.
  // The tip stays, because he may read it before he has any numbers at all, but it now says the
  // thing that actually unlocks it: THE LOWER EARNER MAKES THE CLAIM.
  { title: 'Marriage allowance', body: 'If your husband or wife earns under £12,570, they can pass you £1,260 of their tax free allowance. That is £252 off your bill every year, and you can backdate it four years. They have to apply, not you. HMRC will not take it from the person receiving it.' },
  { title: 'Time big buys before 5 April', body: 'A large tool or van bought just before the tax year ends brings the relief forward a whole year. Timing matters.' },
];
