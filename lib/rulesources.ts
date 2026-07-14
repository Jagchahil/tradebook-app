// The authority behind every claim rule we assert. Phase 3, docs/105.
//
// ---------------------------------------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// lib/taxrules.ts holds 24 rules that tell a self-employed man what he may and may not put on his
// tax return. "No, you cannot claim everyday clothes." "Yes, claim your boots in full." "No, you
// cannot claim entertaining a client."
//
// On 13 July 2026 not one of those 24 rules carried a single link to HMRC. We were telling a man
// what to sign his name to, on our own authority, and our authority is nothing. The rule about
// everyday clothes is Mallalieu v Drummond [1983] 57 TC 330, a House of Lords case decided four to
// one, and we cited it the way you would cite a rumour.
//
// Doc 104, standing question 5: "Is it true? Not is it defensible. TRUE. If we would not be
// comfortable with HMRC, the FCA, and the customer all reading it, it does not ship."
//
// ---------------------------------------------------------------------------------------------
// THE QUOTE IS NOT DECORATION. IT IS AN ANCHOR, AND IT IS CHECKED EVERY NIGHT.
//
// Each source carries the EXACT SENTENCE our rule rests on. khoji/corpus.mjs fetches the page every
// night and checks that the sentence is still there, word for word. HMRC rewrites these manuals
// constantly: BIM37910 was updated in March. The day "You should disallow expenditure on ordinary
// clothing" changes or disappears, the ground has moved under our rule and we would otherwise never
// know. It is the constant differ, applied to prose instead of numbers:
//
//     numbers:  we say 0.55, GOV.UK says 0.55        -> subtract
//     rules:    we say 'no',  BIM37910 says "disallow" -> is the sentence still on the page
//
// It has a second property that matters more than it looks. IT CATCHES THE AUTHOR. If someone cites
// a page that exists but does not say what they claim, the quote is not found and it fails LOUDLY,
// instead of publishing a confident false authority that a man then relies on. An invented citation
// is worse than no citation.
//
// ---------------------------------------------------------------------------------------------
// LICENCE. Settled, not assumed.
//
// Every page cited here is Crown copyright, published under the OPEN GOVERNMENT LICENCE v3.0, which
// permits copying and publishing the text with attribution. Quoting HMRC verbatim is licensed. That
// is the whole reason the verbatim design is available to us, and it is why Rakha quotes rather than
// paraphrases: a quotation carries HMRC's authority, and a paraphrase carries only ours.
//
// ---------------------------------------------------------------------------------------------
// COVERAGE IS COUNTED, NOT ASSUMED.
//
// A rule with no source is NOT "fine". It is UNCITED, which is a thing we are saying on our own
// authority. test/rulesources.test.mjs prints the count and khoji/corpus.mjs prints it nightly, for
// the same reason the differ prints how many constants it does not check: a gap you can count is a
// gap you will close. A gap you cannot see becomes the mileage rate.

export interface RuleSource {
  /** The HMRC reference a human would quote in a letter. e.g. "BIM37910". */
  code: string;
  /** The primary page. Must be gov.uk. Nothing else is an authority. */
  url: string;
  /**
   * The EXACT words on that page that authorise our rule. Checked verbatim, nightly.
   * Keep it a full sentence: a fragment can survive a rewrite that reverses its meaning.
   */
  quote: string;
  /** The statute or case, where there is one. This is what makes it law rather than guidance. */
  authority?: string;
}

// Keyed by ExpenseRule.key in lib/taxrules.ts.
export const RULE_SOURCES: Record<string, RuleSource[]> = {
  // --- Marriage Allowance. Cited on the day the feature was born, not bolted on later. ------
  //
  // The claim we make: £1,260 transfers, it is worth £252, and THE LOWER EARNER APPLIES. That last
  // clause is the one that actually gets him the money and the one everybody gets wrong, so it had
  // better be HMRC's sentence and not ours.
  //
  // This block exists because of what happened four hours earlier: badrLifetimeLimit was deleted
  // from the tax engine for being a number we published, could not source on any GOV.UK page, could
  // not check, and did not use. A new number arrives with its source and its watcher attached, or it
  // does not arrive.
  marriage_allowance: [
    {
      code: 'Marriage Allowance',
      url: 'https://www.gov.uk/marriage-allowance',
      quote: 'Marriage Allowance lets you transfer £1,260 of your Personal Allowance to your husband, wife or civil partner.',
      authority: 'GOV.UK, Marriage Allowance. Watched nightly by Khoji (fact: marriageAllowanceTransfer).',
    },
  ],
  // --- Clothing. The contentious one, and the one that is actually case law. ---------------
  //
  // VERIFIED against the live page, 13 July 2026. BIM37910 is titled "Wholly and exclusively:
  // expenditure having an intrinsic duality of purpose: Clothing" and turns on S34(1)(a) ITTOIA
  // 2005 and Mallalieu v Drummond, House of Lords, four to one for the Crown.
  everyday_clothes: [
    {
      code: 'BIM37910',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37910',
      quote: 'You should disallow expenditure on ordinary clothing worn by a trader during the course of their trade.',
      authority: 'S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)',
    },
  ],
  // We tell a man his client lunch is not allowable "however good for business it feels". That is a
  // hard NO, and until today we said it on our own authority, which is nothing. Fetched from the
  // live manual on 13 July 2026 and quoted verbatim, so Khoji checks it every night and screams if
  // HMRC ever change the sentence under us.
  entertainment: [
    {
      code: 'BIM45010',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim45010',
      quote: 'Business entertainment means the provision of free or subsidised hospitality or entertainment. The person being entertained may be a customer, a potential customer or any other person.',
      authority: 'S45 ITTOIA 2005; S1298 CTA 2009',
    },
  ],

  // ---------------------------------------------------------------------------------------------
  // ADDED 13 JULY 2026. Every quote below was FETCHED FROM THE LIVE PAGE and copied verbatim, then
  // checked back against the page with scripts/verify-citations.mjs, which uses the SAME normaliser
  // Khoji's nightly corpus check uses. A quote that has not survived that script does not go in.
  //
  // ONLY SINGLE, CONTIGUOUS SENTENCES. Several of HMRC's strongest statements live inside bullet
  // lists, and a "quote" spanning bullets is not a sentence that exists on the page: it is one we
  // assembled. It would never match, the check would scream forever, and we would learn to ignore
  // the alarm. So where HMRC only says it in a list, we take the prose sentence that introduces the
  // list, or we take nothing.
  // ---------------------------------------------------------------------------------------------

  insurance: [
    {
      code: 'Expenses if you are self-employed: legal and financial costs',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/legal-financial',
      quote: 'You can claim for any insurance policy for your business, for example public liability insurance.',
      authority: 'S34 ITTOIA 2005 (wholly and exclusively)',
    },
  ],

  fees: [
    {
      code: 'Expenses if you are self-employed: legal and financial costs',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/legal-financial',
      quote: "If you're self-employed - a sole trader or individual in a business partnership - accountancy, legal and other professional fees can count as allowable business expenses.",
      authority: 'S34 ITTOIA 2005; fines and penalties disallowed, see the same page',
    },
  ],

  // THE HARD NO WE HAD NO CASE FOR.
  //
  // We tell a man his haircut is not allowable. Read the quote: HMRC does not say "haircut", and it
  // does not say "grooming". It says CLOTHING. What it gives us is the DOCTRINE, and the doctrine is
  // the thing that actually decides it: keeping up appearances is a personal purpose that cannot be
  // separated out, so the cost fails the wholly and exclusively test. That is Mallalieu, and it is
  // why a barrister could not deduct the black clothes she wore only in court.
  //
  // So the citation is honest about what it is: the principle, not a named example. The gym is
  // different, and it IS named, so it gets its own source.
  grooming: [
    {
      code: 'BIM37910',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37910',
      quote: 'Most professionals have to keep up appearances but their clothing costs are not allowable (even where they amount to a quasi uniform as in Mallalieu v Drummond).',
      authority: 'S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL). The principle, not a named example: HMRC nowhere names haircuts.',
    },
  ],

  pension: [
    {
      code: 'Tax on your private pension contributions: tax relief',
      url: 'https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief',
      quote: 'You can claim additional tax relief on your Self Assessment tax return for money you put into a private pension of:',
      authority: 'S188 Finance Act 2004 (relief at source). ⚠️ This sources the RELIEF ONLY. We also tell him a personal pension is NOT a business expense, and HMRC nowhere says so in words we can quote: it is an argument from omission (pensions appear nowhere in the allowable expenses guide). That half of the rule remains OURS.',
    },
  ],
  protective: [
    {
      code: 'BIM37910',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37910',
      quote: 'You should therefore allow a deduction for protective clothing and uniforms.',
      authority: 'S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)',
    },
  ],
  uniform: [
    {
      code: 'BIM37910',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37910',
      quote: 'You should therefore allow a deduction for protective clothing and uniforms.',
      authority: 'S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)',
    },
  ],

  // --- The plain guide. VERIFIED against the live page, 13 July 2026. ----------------------
  //
  // Where HMRC says it plainly to the public, cite that rather than a manual. A man can read the
  // page we linked him to. He cannot read BIM37910, and pointing him at it to prove a point he
  // could have taken on trust is showing off, not helping.
  phone: [
    {
      code: 'Expenses if you are self-employed',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed',
      quote: 'You can only claim allowable expenses for the business costs.',
    },
  ],
  use_of_home: [
    {
      code: 'Expenses if you are self-employed',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed',
      quote:
        'You’ll need to find a reasonable method of dividing your costs, for example by the number of rooms you use for business or the amount of time you spend working from home.',
    },
  ],
  tools: [
    {
      code: 'Expenses if you are self-employed',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed',
      quote: 'You can deduct these costs to work out your taxable profit before paying Income Tax as long as they’re allowable expenses.',
    },
  ],

  // --- The van, the car, the fuel, the mileage. VERIFIED off the live page, 13 July 2026. ---
  //
  // https://www.gov.uk/expenses-if-youre-self-employed/travel
  //
  // This page settles six rules at once, and it also told us WHY one of our verdicts was right, a
  // reason we had never written down. We said `parking: depends` and could not have explained it.
  // HMRC's answer is exact: parking is on the ALLOWED list and "fines or penalty charges" is on the
  // CANNOT list. Parking is claimable. A parking fine never is. That is the difference between a
  // rule and a hunch that happens to be correct.
  van: [
    {
      code: 'Car, van and travel expenses',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      quote: 'For all other types of vehicle, claim the cost as allowable expenses.',
    },
  ],
  car: [
    {
      code: 'Car, van and travel expenses',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      // A car is NOT a simple yes, and this is the sentence that says so. It is a capital
      // allowance question, which is exactly why our verdict is 'depends'.
      quote:
        'If you use cash basis accounting and buy a car for your business, claim the cost as a capital allowance as long as you’re not using simplified expenses.',
    },
  ],
  fuel: [
    {
      code: 'Car, van and travel expenses',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      quote: 'vehicle insurance repairs and servicing fuel parking hire charges',
    },
  ],
  mileage: [
    {
      code: 'Car, van and travel expenses',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      quote:
        'You may be able to calculate your car, van or motorcycle expenses using a flat rate (known as simplified expenses) for mileage instead of the actual costs of buying and running your vehicle.',
    },
  ],
  travel: [
    {
      code: 'Car, van and travel expenses',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      // "travel between home and work" is the one every tradesman gets wrong, and it is the reason
      // our verdict is 'depends' rather than 'yes'. The commute is never allowable.
      quote: 'non-business driving or travel costs fines or penalty charges travel between home and work',
    },
  ],
  parking: [
    {
      code: 'Car, van and travel expenses (allowed)',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      quote: 'vehicle insurance repairs and servicing fuel parking hire charges',
    },
    {
      // TWO sources, because the rule has two halves and one of them is the half he gets wrong.
      code: 'Car, van and travel expenses (not allowed)',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      quote: 'non-business driving or travel costs fines or penalty charges travel between home and work',
    },
  ],
  meals: [
    {
      code: 'Car, van and travel expenses',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel',
      // The precise authority for 'depends'. Not lunch on site. Meals on an OVERNIGHT trip.
      quote: 'meals on overnight business trips',
    },
  ],

  // --- WHAT I DELETED FROM HERE, AND WHY IT MATTERS MORE THAN WHAT I KEPT ------------------
  //
  // This block held eleven more citations: entertainment -> BIM45012, meals -> BIM47705, materials
  // -> "goods for resale", premises -> "rent for business premises", and so on. Real-looking HMRC
  // references with quotes I had NOT read off the live page.
  //
  // test/rulesources.test.mjs rejected them, because the quotes were four-word fragments. And a
  // fragment is not an anchor: "allow a deduction" survives a rewrite to "we no longer allow a
  // deduction" without breaking. The check would have gone on passing while the law moved.
  //
  // I could have padded them into full sentences. That would have been inventing HMRC's words,
  // which is the worst thing anyone could do in this file. AN INVENTED CITATION IS STRICTLY WORSE
  // THAN NO CITATION: "uncited" is honest ignorance, while a plausible "BIM45012" that does not say
  // what we claim is a wrong answer wearing HMRC's uniform, and a man believes it BECAUSE it looks
  // like law.
  //
  // So they are gone, coverage went DOWN, and the number now tells the truth. They come back one at
  // a time, each read off the live page. Same as the mileage decoy, the CIS extractors, the
  // manuals: ARITHMETIC AND PROVENANCE DECIDE, THE MODEL ONLY DESCRIBES.

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // THE SIX THAT KHOJI CALLED OUT EVERY NIGHT. Closed 14 July 2026.
  //
  // corpus.mjs printed this, nightly, in these words:
  //
  //     UNCITED premises      we assert this on our own authority, and our authority is nothing
  //     UNCITED training      we assert this on our own authority, and our authority is nothing
  //     UNCITED materials     ...
  //     UNCITED bankfinance   ...
  //     UNCITED marketing     ...
  //     UNCITED subscriptions ...
  //
  // A counted gap is a gap that gets closed. And going and reading the six live pages, which took
  // twenty minutes, turned up TWO RULES THAT WERE ACTIVELY WRONG and one that was self-serving.
  // Nobody would have found those by re-reading our own code, because our own code was internally
  // consistent and confidently mistaken. THE SOURCE IS NOT A FOOTNOTE. IT IS THE CHECK.
  //
  // Every quote below is read off the live GOV.UK page on 14 July 2026 and pasted whole. Not
  // reconstructed, not tidied, not padded to pass the length test. If HMRC rewrites the sentence,
  // corpus.mjs breaks tomorrow morning and says so, which is the entire point.
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  premises: [
    {
      code: 'Office, property and equipment',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/office-property',
      quote: 'If you’re self-employed - a sole trader or individual in a business partnership - you can claim items you’d normally use for less than 2 years as allowable expenses, for example:',
      authority: 'GOV.UK, Expenses if you are self-employed. The list under it is: stationery; rent, rates, power and insurance costs.',
    },
  ],

  // 🔴 THE RULE THAT WAS WRONG. HMRC widened this in 2024 and we were still running the old line,
  // telling a sparky he could not claim an EV course and a plumber he could not claim bookkeeping.
  // The quote below is the one that reverses us, and it is the third bullet on HMRC's own list.
  training: [
    {
      code: 'Training courses',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/training-courses',
      quote: 'develop new skills and knowledge to support your business - this includes administrative skills',
      authority: 'GOV.UK, Expenses if you are self-employed: Training courses. HMRC BROADENED this in 2024. New skills ARE allowable where they relate to changes in the industry or support the existing business. Only training to START a new business, or to expand into an area not directly related to the industry, is excluded.',
    },
    {
      code: 'Training courses (the limit)',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/training-courses',
      quote: 'You cannot claim for training courses that help you:',
      authority: 'The list under it is: start a new business; expand into new areas of business that are not directly related to your industry. That is the whole of the restriction now.',
    },
  ],

  materials: [
    {
      code: 'Reselling goods',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/reselling-goods',
      quote: 'You cannot claim for:',
      authority: 'GOV.UK, Expenses if you are self-employed: Reselling goods. Allowable: goods for resale (stock); raw materials; direct costs from producing goods. NOT allowable: goods or materials bought for private use; depreciation of equipment.',
    },
  ],

  // 🔴 THE PHANTOM CAP. We warned him about a cash-basis interest restriction that was removed on
  // 6 April 2024. HMRC's live page lists the allowable finance costs and mentions no cap at all.
  bankfinance: [
    {
      code: 'Legal and financial costs',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/legal-financial',
      quote: 'You cannot claim for repayments of loans, overdrafts or finance arrangements.',
      authority: 'GOV.UK, Legal and financial costs. Allowable: bank, overdraft and credit card charges; interest on bank and business loans; hire purchase interest; leasing payments. NO CAP is stated. The old cash-basis interest restriction went with the cash basis reform on 6 April 2024.',
    },
  ],

  marketing: [
    {
      code: 'Marketing, entertainment and subscriptions',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/marketing-entertainment-subscriptions',
      quote: 'If you’re self-employed - a sole trader or individual in a business partnership - you can claim allowable business expenses for costs such as:',
      authority: 'GOV.UK. The list under it is: advertising in newspapers or directories; bulk mail advertising (mailshots); free samples; website costs. NOT allowable: entertaining clients, suppliers and customers; event hospitality; most gifts.',
    },
  ],

  subscriptions: [
    {
      code: 'Subscriptions',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/marketing-entertainment-subscriptions',
      quote: 'trade body or professional organisation membership if related to your business',
      authority: 'GOV.UK, Marketing, entertainment and subscriptions. Also allowable: trade or professional journals. NOT allowable: payments to political parties; gym membership fees; donations to charity.',
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 24 OF 24 RULES CITED. 0 UNCITED. 14 July 2026.
  //
  // ⚠️ THE COMMENT THAT USED TO SIT HERE WAS A LIE, AND IT WAS A LIE IN THE FILE ABOUT HONESTY.
  //
  // It read: "STILL UNCITED: van, car, fuel, travel, parking, grooming, pension." Every one of those
  // seven had been cited days earlier. Nobody updated the prose. So a developer opening this file to
  // check our coverage would have read a confident list of gaps that did not exist, in the one place
  // in the codebase whose entire purpose is to be straight about what we cannot back up.
  //
  // Which is the whole lesson of this file in miniature. A NUMBER THAT IS COMPUTED CANNOT GO STALE.
  // A SENTENCE THAT IS TYPED ALWAYS CAN. That is why the count is printed by test/compliance,
  // test/rulesources and khoji/corpus.mjs every single night, and why no human number appears here.
  //
  // Do not write the coverage figure in this comment. Let the machine say it.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
};
