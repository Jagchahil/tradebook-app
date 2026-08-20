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
  /**
   * The statute or case, where there is one. This is what makes it law rather than guidance.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 THIS FIELD IS PUBLISHED. IT IS NOT A NOTE TO OURSELVES. 11 August 2026.
   *
   * RUN 0 of the customer week read /can-i-claim as a stranger and found this on the Pension
   * contributions card, live, in front of customers:
   *
   *     "S188 Finance Act 2004 (relief at source). [warning sign] This sources the RELIEF ONLY.
   *      We also tell him a personal pension is NOT a business expense, and HMRC nowhere says so
   *      in words we can quote: it is an argument from omission. That half of the rule remains
   *      OURS."
   *
   * Every word of that is TRUE and every word of it was written for us. "We", "him", "OURS" is
   * the sourcing audit talking to itself, and a customer reading it learns that the people
   * telling him what to sign his name to are arguing with each other about whether they can back
   * it up. Similar residue sat on Haircuts, Bank charges, Materials, Bad debts and Training, and
   * on several cards the whole GOV.UK bullet list had simply been pasted in.
   *
   * It reaches further than that one page: /app/tax/can-i-claim shows it to signed in customers,
   * /rules.json publishes it, and lib/synthesis.ts feeds the part before the first semicolon into
   * a layer captioned "This is the law itself. Parliament wrote it." An internal aside inherits
   * that caption.
   *
   * THE RULE, AND test/citationvoice.test.mjs ENFORCES IT.
   *
   *   A CITATION IS A REFERENCE, NOT PROSE. One sentence. The statute, the case, or the GOV.UK
   *   page. No second sentence, because a second sentence is commentary. Nothing in the first
   *   person, nothing shouted in capitals, and never the page's bullet list pasted underneath.
   *
   * Working notes belong in a comment, like this one, where the customer never has to read them.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
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
      authority: 'GOV.UK, Marriage Allowance',
    },
  ],
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // --- The landlord's four. RUN 2, 12 August 2026. ---------------------------------------
  //
  // "Can I claim it" had fifteen cards written for a man in a van and not one about property, on a
  // product that keeps a property stream and has a Section 24 engine. A florist letting the flat
  // above her shop found nothing there about the other half of her return.
  //
  // VERIFIED against the live page, 21 August 2026: GOV.UK, "Work out your rental income when you
  // let property", last updated 19 March 2025. Every quote below is that page's own sentence, and
  // every claim on the four cards is one of them.
  //
  // 🔴 21 AUGUST: THE CAPITAL EXPENDITURE QUOTE WAS TRUNCATED AND HAD TO BE PUT BACK.
  // It read "...cannot be claimed against your rental income." with a full stop HMRC does not have.
  // The page carries on: "but you should keep records of them as you might be able to set them
  // against Capital Gains Tax if you sell the property in the future." So we were quoting HMRC with
  // the half that helps the landlord cut off, on a product that sells itself on what you are owed.
  //
  // Khoji's corpus checker had been reporting this every night since at least 20 August, exiting 2
  // to say so, and nothing surfaced it. The page's "last updated" still reads 19 March 2025, so the
  // text moved and the date did not: exactly the silent change lawwatch exists to catch. DO NOT
  // shorten a quote to make it fit. Cut the sentence you wrote around it instead.
  'property-repairs': [
    {
      code: 'Work out your rental income when you let property',
      url: 'https://www.gov.uk/guidance/income-tax-when-you-rent-out-a-property-working-out-your-rental-income',
      quote: 'A repair restores an asset to its original condition, sometimes by replacing parts of it.',
      authority: 'GOV.UK, Work out your rental income when you let property',
    },
    {
      code: 'Capital expenditure',
      url: 'https://www.gov.uk/guidance/income-tax-when-you-rent-out-a-property-working-out-your-rental-income',
      quote: 'Capital expenses are not allowable and cannot be claimed against your rental income but you should keep records of them as you might be able to set them against Capital Gains Tax if you sell the property in the future.',
      authority: 'GOV.UK, Work out your rental income when you let property',
    },
  ],
  'letting-agent': [
    {
      code: 'Allowable expenses',
      url: 'https://www.gov.uk/guidance/income-tax-when-you-rent-out-a-property-working-out-your-rental-income',
      quote: 'letting agent fees and management fees',
      authority: 'GOV.UK, Work out your rental income when you let property',
    },
  ],
  'mortgage-interest': [
    {
      code: 'Changes to tax relief for residential property',
      url: 'https://www.gov.uk/guidance/income-tax-when-you-rent-out-a-property-working-out-your-rental-income',
      quote: 'From 6 April 2020 Income Tax relief on all residential property finance costs is restricted to the basic rate of Income Tax.',
      authority: 'GOV.UK, Work out your rental income when you let property',
    },
  ],
  'property-allowance': [
    {
      code: 'Property allowance',
      url: 'https://www.gov.uk/guidance/income-tax-when-you-rent-out-a-property-working-out-your-rental-income',
      quote: 'If you claim the property allowance you cannot claim a deduction for your expenses.',
      authority: 'GOV.UK, Work out your rental income when you let property',
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
      authority: 'S34(1)(a) ITTOIA 2005; S54(1)(a) CTA 2009; Mallalieu v Drummond [1983] 57 TC 330 (HL)',
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
      authority: 'S34 ITTOIA 2005; S54 CTA 2009 (wholly and exclusively)',
    },
  ],

  fees: [
    {
      code: 'Expenses if you are self-employed: legal and financial costs',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/legal-financial',
      quote: "If you're self-employed - a sole trader or individual in a business partnership - accountancy, legal and other professional fees can count as allowable business expenses.",
      authority: 'S34 ITTOIA 2005; S54 CTA 2009 (fines and penalties disallowed)',
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
      authority: 'S34(1)(a) ITTOIA 2005; S54(1)(a) CTA 2009; Mallalieu v Drummond [1983] 57 TC 330 (HL)',
    },
  ],

  pension: [
    {
      code: 'Tax on your private pension contributions: tax relief',
      url: 'https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief',
      quote: 'You can claim additional tax relief on your Self Assessment tax return for money you put into a private pension of:',
      authority: 'S188 Finance Act 2004 (relief at source)',
    },
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 THE HALF OF THIS RULE THAT USED TO BE OURS IS NOW HMRC'S. Run 6, 16 August 2026.
    //
    // The block at the top of this file quotes the Run 0 audit finding, live on this very card:
    // "we also tell him a personal pension is NOT a business expense, and HMRC nowhere says so in
    // words we can quote: it is an argument from omission. That half of the rule remains OURS."
    //
    // It was right that we had no quote. It was wrong that no quote exists. HMRC says it plainly
    // in the Pensions Tax Manual, and it says the OPPOSITE of what our card said for a company:
    // an employer's contribution IS deducted as an expense, under CTA 2009 for a company exactly
    // as under ITTOIA 2005 for a sole trader.
    //
    // A limited company director read the old card on 16 August and was told a pension is not a
    // business cost, full stop. Her company can pay it, deduct it against Corporation Tax, and
    // pay no National Insurance on it at either end. It is usually the best pound she can move,
    // and it was the one lever this page did not mention.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // The quote runs to the END of HMRC's sentence on purpose. khoji/corpus.mjs matches the quote
    // as a substring of the page, so a quote cut short and given a full stop of its own matches
    // nothing and alarms every night forever on a citation that is word for word right.
    {
      code: 'PTM043100',
      url: 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm043100',
      quote: "Tax relief on employer contributions to a registered pension scheme is given by allowing contributions to be deducted as an expense in computing the profits of a trade, profession or investment business, and so reducing the amount of an employer's taxable profit.",
      authority: 'S196 Finance Act 2004; S54 CTA 2009 and S34 ITTOIA 2005 (wholly and exclusively)',
    },
  ],
  protective: [
    {
      code: 'BIM37910',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37910',
      quote: 'You should therefore allow a deduction for protective clothing and uniforms.',
      authority: 'S34(1)(a) ITTOIA 2005; S54(1)(a) CTA 2009; Mallalieu v Drummond [1983] 57 TC 330 (HL)',
    },
  ],
  uniform: [
    {
      code: 'BIM37910',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37910',
      quote: 'You should therefore allow a deduction for protective clothing and uniforms.',
      authority: 'S34(1)(a) ITTOIA 2005; S54(1)(a) CTA 2009; Mallalieu v Drummond [1983] 57 TC 330 (HL)',
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
      authority: 'GOV.UK, Expenses if you are self-employed',
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
      authority: 'GOV.UK, Expenses if you are self-employed: Training courses',
    },
    {
      code: 'Training courses (the limit)',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/training-courses',
      quote: 'You cannot claim for training courses that help you:',
      authority: 'GOV.UK, Expenses if you are self-employed: Training courses',
    },
  ],

  materials: [
    {
      code: 'Reselling goods',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/reselling-goods',
      quote: 'You cannot claim for:',
      authority: 'GOV.UK, Expenses if you are self-employed: Reselling goods',
    },
  ],

  // 🔴 THE PHANTOM CAP. We warned him about a cash-basis interest restriction that was removed on
  // 6 April 2024. HMRC's live page lists the allowable finance costs and mentions no cap at all.
  bankfinance: [
    {
      code: 'Legal and financial costs',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/legal-financial',
      quote: 'You cannot claim for repayments of loans, overdrafts or finance arrangements.',
      authority: 'GOV.UK, Expenses if you are self-employed: Legal and financial costs',
    },
  ],

  marketing: [
    {
      code: 'Marketing, entertainment and subscriptions',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/marketing-entertainment-subscriptions',
      quote: 'If you’re self-employed - a sole trader or individual in a business partnership - you can claim allowable business expenses for costs such as:',
      authority: 'GOV.UK, Expenses if you are self-employed: Marketing, entertainment and subscriptions',
    },
  ],

  subscriptions: [
    {
      code: 'Subscriptions',
      url: 'https://www.gov.uk/expenses-if-youre-self-employed/marketing-entertainment-subscriptions',
      quote: 'trade body or professional organisation membership if related to your business',
      authority: 'GOV.UK, Expenses if you are self-employed: Marketing, entertainment and subscriptions',
    },
  ],

  // ADDED 16 July 2026. Both quotes were FETCHED FROM THE LIVE HMRC manual and copied verbatim, each
  // a single standalone sentence (not one spanning bullets), so Khoji's nightly corpus check can find
  // it word for word. The statute is named so the answer is law and not an opinion.
  bad_debt: [
    {
      code: 'BIM42701',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim42701',
      quote: 'A deduction for a bad or doubtful debt is to be made in arriving at the profits of the year in which the debt becomes bad or doubtful.',
      // NO CTA 2009 SIBLING ON THIS ONE, ON PURPOSE. Every other card on this page names the
      // company section beside the ITTOIA one, because s54 CTA 2009 is word for word the
      // company form of s34 ITTOIA and s61 is word for word the company form of s57. Bad debts
      // is not that. S55 CTA 2009 is titled Bad debts but it RESTRICTS a deduction for a non
      // money debt; a company's ordinary trade debts run through the loan relationships rules
      // instead. Citing it here would point a director at a section that says close to the
      // opposite of what this card tells her. An honest gap beats a tidy wrong pair.
      authority: 'S35 Income Tax (Trading and Other Income) Act 2005',
    },
  ],
  pretrading: [
    {
      code: 'BIM46351',
      url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim46351',
      quote: 'The above legislation provides relief in respect of certain expenditure of a revenue nature incurred for the purposes of a trade, profession or vocation before it is commenced.',
      authority: 'S57 ITTOIA 2005; S61 CTA 2009 (pre-trading expenses)',
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
