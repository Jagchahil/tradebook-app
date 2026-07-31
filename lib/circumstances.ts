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

  // ⚠️ A QUESTION THAT ONLY MAKES SENSE AFTER ANOTHER ONE.
  //
  // "Does your husband or wife earn less than £12,570?" is an absurd thing to ask a single man, and
  // asking it anyway is how he learns we are not really listening, just running a list at him.
  //
  // It also exists to stop us writing COMPOUND QUESTIONS, which is the mistake this file made on its
  // first day. The married question used to read: "Are you married? AND does your partner earn under
  // the personal allowance?" One tap, two facts. A Yes was fine. But a NO was a black hole: no to
  // which half? Not married, or married to someone who earns well? Those are completely different
  // men with completely different reliefs, and we would have recorded them identically AND NEVER
  // ASKED AGAIN. The log would have been useless the day we needed it, which is the day HMRC asks.
  //
  // One question, one fact. If you need two facts, you need two questions, and the second one waits.
  dependsOn?: { key: string; answer: Answer };

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 ARTICLE 9. THIS IS NOT A TAX QUESTION WITH A WARNING ON IT. IT IS A DIFFERENT KIND OF THING.
  //
  // "Are you registered blind?" is a health fact. UK GDPR Article 9 forbids processing it at all
  // unless a specific condition is met, and the only one realistically open to us is Article 9(2)(a),
  // EXPLICIT consent. Explicit means he was told it is health data, told what we do with it, and said
  // yes to THAT, specifically. It does not mean he tapped a button in a chat.
  //
  // ⚠️ AND IT MUST NEVER BE ASKED ON WHATSAPP. TWO REASONS, AND THE SECOND ONE IS WORSE.
  //
  //   1. A green button in a messaging thread is not explicit consent by any reading of the statute.
  //   2. THE QUESTION ITSELF IS A DISCLOSURE. It sits in his chat history for ever. His mate borrows
  //      his phone. His kid scrolls up. A WhatsApp notification lights up his lock screen on a
  //      building site and says "Are you registered blind or severely sight impaired?" We would have
  //      broadcast a man's disability to a room, on his behalf, to save him £3,130 of allowance.
  //
  // So a special-category question is not part of the chain, on ANY channel. unanswered() will not
  // return it. It lives behind its own consent gate in the app, and it can be erased on request,
  // because Article 17 is not optional and a tax app is not a medical record.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  specialCategory?: true;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE HOUSEHOLD FOUR. A GROUPING, NEVER A RE-ORDERING.
  //
  // Marriage, his wife's earnings, the kids, and whoever minds them. Four questions about the same
  // household, and every one of them is claimed by somebody who is not our customer, which is why
  // `claimant` on all four is his partner or both of them.
  //
  // ⚠️ IT IS HERE RATHER THAN IN THE ONBOARDING PAGE, AND THAT IS THE POINT.
  //
  // A surface holding its own list of "which of these are the household ones" is a second copy of a
  // fact about a question, sitting a directory away from the question. specialCategory already
  // proved the shape: put what a question IS next to the question, and let callers select. A page
  // with the keys hardcoded is a page that quietly stops matching the list the day one is added.
  //
  // ⚠️ AND IT CHANGES NO ORDER. askingOrder() still sorts by what a question is worth, inside this
  // group and outside it. worthOrder is a tax judgement and this is a screen, and a screen does not
  // get to decide that marriage is worth more than a terminal loss. See lib/onboarding.ts for why
  // the household screen nonetheless comes FIRST: it is not that they are worth more, it is that
  // they are the four a man can answer without looking anything up, and a man who leaves after four
  // questions must not be one who was never asked whether he is married.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  household?: true;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 NOT A RELIEF. A COMPLIANCE FACT, AND IT MUST NEVER ENTER THE MONEY QUEUE.
  //
  // "Have you signed up for Making Tax Digital" is worth no money to anybody. It changes what WE do
  // for him, not what he can claim. askingOrder() sorts by worthOrder, so an entry with a worthOrder
  // it does not deserve would push a real relief down the list, and unanswered() feeds the WhatsApp
  // chain and the app's own list, neither of which should ever ask a man about his filing status
  // between a question about his van and a question about his pension.
  //
  // So these are refused by unanswered() the same way a special category question is, and travel
  // only through mtdQuestions(). They keep a worthOrder because the field is required, and it is
  // 'small' precisely so that if one ever leaks into the money queue it leaks to the bottom.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  mtd?: true;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 WHO A QUESTION IS EVEN FOR. The product branches by business structure; the questions must too.
  //
  // Found by walking /app/setup as a limited company: it asked "What were you doing before you went
  // self employed", offered the voluntary Class 2 tick box, and asked about "£50,000 from self
  // employment and rent". Every one of those asserts the man is self employed. A director is not:
  // his company trades, he does not, and a question built on a premise that is false of him teaches
  // him in one screen that we are running a list at him rather than listening (the exact failure
  // dependsOn exists to prevent, one field up).
  //
  // Absent means EVERY structure, which is almost every question: VAT, pensions, marriage and the
  // kids do not care how a man trades. Set it only where the relief or the regime genuinely does
  // not exist for a structure, and write the reasoning on the entry, because the day HMRC asks why
  // we never asked a director something, the answer must be on the row.
  //
  // ⚠️ AN UNKNOWN STRUCTURE IS ASKED EVERYTHING. Callers that do not know how a man trades (an old
  // surface, a failed profile read) pass nothing and get the old behaviour whole. The wrong
  // direction here is the silent one: asking a director an inapplicable question is a nuisance he
  // can say no to, while never asking a sole trader about his old job because a read timed out is
  // money gone without a trace. So the filter only ever bites on a KNOWN structure.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  structures?: BusinessStructure[];
}

// Declared here rather than imported from lib/position.ts, deliberately: this module has no imports
// at all, which is what lets every test and the WhatsApp webhook load it bare. The three literals
// are pinned against the rest of the codebase by test/structurehonesty.test.mjs.
export type BusinessStructure = 'sole_trader' | 'partnership' | 'limited_company';

// The consent itself is stored as a circumstance, which is exactly right: Article 7(1) says we must
// be able to DEMONSTRATE that he consented, and the circumstances table already logs the verbatim
// wording he was shown, his answer, and the timestamp. That is the whole of Article 7 in one row.
export const CONSENT_KEY = 'special_category_consent';

export const CONSENT_ASK =
  'The next question is about a health condition. The law treats that differently from everything '
  + 'else you have told me, and I am not allowed to even ask it unless you say yes to this first. '
  + 'If you say yes: I store your answer, I use it only to work out the allowance you are owed, I '
  + 'never share it, and you can delete it whenever you like and I will forget it. Is that alright?';

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
    // 🔴 NOT FOR A COMPANY. Early trade losses relief belongs to an UNINCORPORATED trade: it is the
    // person's own loss going back against the person's own old wages. A company's loss is the
    // company's (CTA 2010 Part 4) and never reaches the director's P60. And the question itself,
    // "before you went self employed", asserts a director is self employed, which he is not.
    structures: ['sole_trader', 'partnership'],
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
    // still on hand, from four years back, on his very first return. And the invoices he needs
    // are exactly the ones Lekhio is built to store for him.
    //
    // ⚠️ The last line used to say "We have your receipts", which was read by every account,
    // including brand new ones that had sent us nothing. A claim about what we hold has to be
    // true for the man reading it, so the line now describes what logging a receipt does for
    // him, which is true whether he has logged a thousand or none yet.
    key: 'vat_registered',
    ask: 'Are you VAT registered, and when did you register?',
    why: 'When you registered you could have reclaimed the VAT on every tool and bit of kit you already owned, going back four years. Almost nobody does. Every receipt you put in your Lekhio is kept ready for exactly this.',
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
    household: true,
    ask: 'Are you married or in a civil partnership?',
    why: 'If you are, one of you may be able to hand the other part of their tax free allowance. It is worth £252 a year and it backdates four years.',
    worthOrder: 'real',
    claimant: 'his partner',
    backYears: 4,
    evidence: 'Nothing. HMRC asks for both National Insurance numbers, not a marriage certificate.',
    source: 'GOV.UK Marriage Allowance. The LOWER earner applies. ATT/Agent Update 111: do not also put it on the recipient’s return.',
  },
  {
    // ⚠️ ONE QUESTION. FOUR DIFFERENT MEN. AND IT ANSWERS ALL FOUR CORRECTLY.
    //
    // Marriage Allowance is not one relief, it is a direction of travel, and which way it flows
    // depends on two incomes. We already know HIS to the penny. So this single question about HERS
    // resolves every branch, and we never have to ask him a third thing:
    //
    //   He earns 12,570 to 50,270, she earns under 12,570  -> SHE transfers to HIM. £252 to him.
    //                                                          She claims it. Not ours. Hand off.
    //   He earns 12,570 to 50,270, she earns more          -> Nothing here. Say nothing. Never ask again.
    //   He earns under 12,570, she earns more              -> HE transfers to HER, and HE is the one
    //                                                          who claims, which makes it the one
    //                                                          branch we can actually walk him through.
    //   He earns under 12,570, she earns under 12,570      -> Neither of them pays tax. There is no
    //                                                          relief. A card here would be an advert.
    //
    // The old compound question could not tell these apart, and so it showed the same "if you are
    // married..." card to a single man for ever, which doc 103 calls the empty test and which teaches
    // him to stop reading the page.
    key: 'partner_low_earner',
    household: true,
    ask: 'Does your husband or wife earn less than £12,570 a year?',
    why: 'That is the personal allowance. Whichever of you is under it can hand the other £1,260 of it, and it is worth £252 a year to the one who receives it.',
    worthOrder: 'real',
    claimant: 'both of them',
    backYears: 4,
    evidence: 'Nothing. Two National Insurance numbers and ten minutes at gov.uk/marriage-allowance.',
    source: 'GOV.UK Marriage Allowance. ITA 2007 s55A to s55E. The TRANSFEROR, the lower earner, is the one who applies.',
    dependsOn: { key: 'married', answer: 'yes' },
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
    // 🔴 NOT FOR A COMPANY. Voluntary Class 2 is a SELF EMPLOYED provision: the tick box sits on the
    // self employment pages of the return, and a director has no such pages for the company's trade.
    // His qualifying years come through Class 1 on a payroll salary, which is precisely what the
    // lower earnings limit rung in lib/payyourself.ts exists to price for him.
    structures: ['sole_trader', 'partnership'],
  },
  {
    // The move nobody knows: claim Child Benefit, elect to receive ZERO. You keep the NI credit,
    // you never pay the charge. AND BACKDATING IS ONLY THREE MONTHS, so every month of delay is a
    // month of state pension gone for ever.
    key: 'children',
    household: true,
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
    household: true,
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
    // 🔴 THE ONLY ARTICLE 9 QUESTION IN THIS FILE, AND FOR AN HOUR TODAY IT WAS IN THE WHATSAPP CHAIN.
    //
    // The chain I shipped this morning walks the list and sends the next question as a green button.
    // It would, in time, have sent every man on the product a WhatsApp message reading "Are you
    // registered blind or severely sight impaired?" and stored his tap as a health record, with no
    // explicit consent, in a channel where the QUESTION ALONE is a disclosure to anyone holding his
    // phone. Nothing in the code was wrong. The list simply did not know that one row was different.
    //
    // specialCategory is that knowledge, and unanswered() now refuses to hand it to any channel.
    specialCategory: true,
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
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // MAKING TAX DIGITAL. Where he stands with HMRC, which is not the same as what he can claim.
  //
  // 🔴 THE GATE IS FIRST AND THE OTHER THREE HANG OFF IT. A barber turning over £28,000 is not in
  // MTD in 2026/27, and asking him whether he has signed up for it is doc 103's empty test in its
  // purest form: a question with no sensible answer, which teaches him our questions are not worth
  // reading. dependsOn already does exactly this job for the marriage follow up, so it does it here.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  {
    // ⚠️ THE £50,000 IS WRITTEN OUT, AND THAT IS DELIBERATE EVEN THOUGH lib/taxengine.ts HOLDS IT.
    //
    // Normally a figure in two places is the bug this codebase keeps producing. This is the one case
    // where it is not: `ask` is stored VERBATIM as the exhibit (Finance Act 2026 Sch 22), so the row
    // must carry the sentence he actually read, threshold and all, for ever. Nothing computes from
    // this string; the engine reads FACTS.mtdThreshold2026 as it always did.
    //
    // ⚠️ AND WHEN THE THRESHOLD DROPS TO £30,000 IN 2027, ADD A NEW KEY. Do NOT edit this sentence:
    // that would rewrite what we asked a man in 2026, which is the one thing the log exists to
    // prevent. test/onboardingweb.test.mjs fails the build if this literal and the engine's constant
    // ever disagree, so Khoji finding a change becomes a decision rather than a silent drift.
    mtd: true,
    key: 'mtd_mandated',
    ask: 'Do you expect to take more than £50,000 this year, before any expenses, from self employment and rent put together?',
    why: 'That is the line where Making Tax Digital applies to you, and it changes what HMRC wants from you during the year rather than just at the end of it.',
    worthOrder: 'small',
    claimant: 'him',
    backYears: 0,
    evidence: 'Nothing. It is your gross income, before expenses, from your trade and any rent added together.',
    source: 'GOV.UK, Making Tax Digital for Income Tax. Qualifying income over £50,000 from 6 April 2026, over £30,000 from April 2027, over £20,000 from April 2028.',
    // 🔴 NOT FOR A COMPANY, AND THE THREE FOLLOW UPS STOP WITH IT because they all hang off this
    // gate through dependsOn. Making Tax Digital for Income Tax is about self employment and rent
    // on a PERSONAL return; a company's trade is neither, it files its own CT600. A director who
    // also has rent of his own above the line is a real case, but this sentence cannot honestly
    // capture him: `ask` is stored verbatim as the exhibit, and his trade income is not "self
    // employment". If property only mandation is ever surfaced for directors it gets a NEW key with
    // its own wording, never an edit to this one.
    structures: ['sole_trader', 'partnership'],
  },
  {
    mtd: true,
    key: 'mtd_signed_up',
    ask: 'Have you signed up for Making Tax Digital with HMRC yet?',
    why: 'Being required to use it and being signed up for it are two different jobs, and plenty of people have done the first without the second. If you have not, we will show you where.',
    worthOrder: 'small',
    claimant: 'him',
    backYears: 0,
    evidence: 'Nothing. Your HMRC online account tells you, and so will your accountant if you have one.',
    source: 'GOV.UK, sign up for Making Tax Digital for Income Tax. Signing up is a separate act from being within scope.',
    // ⚠️ THE SAME STRUCTURES AS THE GATE, EXPLICITLY. dependsOn already holds this back while the
    // gate is unanswered, but a yes recorded before a man incorporated would release it: the
    // premise check reads his answers, not his structure. The question is as inapplicable to a
    // company as the gate itself, so it carries the same tag rather than relying on the gate's.
    structures: ['sole_trader', 'partnership'],
    dependsOn: { key: 'mtd_mandated', answer: 'yes' },
  },
  {
    // 🔴 THE ONE THAT ACTUALLY CHANGES WHAT WE DO. Two parties sending quarterly updates for one man
    // is not a tidiness problem, it is two sets of figures arriving at HMRC for the same business.
    // If somebody else is already doing it, we prepare and they send, and we say so plainly.
    mtd: true,
    key: 'mtd_agent',
    ask: 'Is an accountant or a tax agent already sending your quarterly updates for you?',
    why: 'If somebody else is already sending them, two sets of figures going to HMRC helps nobody. We would get your books straight and leave the sending to them.',
    worthOrder: 'small',
    claimant: 'him',
    backYears: 0,
    evidence: 'Nothing. Your accountant knows, and your HMRC account lists who is authorised to act for you.',
    source: 'GOV.UK, tax agents and advisers. An authorised agent can send quarterly updates on a client\'s behalf.',
    // ⚠️ THE SAME STRUCTURES AS THE GATE, EXPLICITLY. dependsOn already holds this back while the
    // gate is unanswered, but a yes recorded before a man incorporated would release it: the
    // premise check reads his answers, not his structure. The question is as inapplicable to a
    // company as the gate itself, so it carries the same tag rather than relying on the gate's.
    structures: ['sole_trader', 'partnership'],
    dependsOn: { key: 'mtd_mandated', answer: 'yes' },
  },
  {
    // ⚠️ ASKED FOR REASSURANCE, NEVER FOR HIS FIGURES. A quarterly update is cumulative: the one due
    // 7 November covers 6 April to 5 October and REPLACES the one sent in August. So his earlier
    // submission is not an input to anything we do, and asking him to dig out those figures would be
    // asking him to look up a number we are about to overwrite. See lib/hmrc.ts.
    mtd: true,
    key: 'mtd_already_filed',
    ask: 'Have you already sent a quarterly update to HMRC this tax year?',
    why: 'It does not change your figures: every update covers the whole year from 6 April and replaces the one before it. We ask so we know where you are, and so nobody worries about a deadline that has already gone.',
    worthOrder: 'small',
    claimant: 'him',
    backYears: 0,
    evidence: 'Nothing. There are no late submission penalties for quarterly updates in 2026/27 either way.',
    source: 'GOV.UK, use Making Tax Digital for Income Tax: updates are cumulative. Budget 2025: late submission penalties for quarterly updates waived for 2026/27, resuming 6 April 2027.',
    // ⚠️ THE SAME STRUCTURES AS THE GATE, EXPLICITLY. dependsOn already holds this back while the
    // gate is unanswered, but a yes recorded before a man incorporated would release it: the
    // premise check reads his answers, not his structure. The question is as inapplicable to a
    // company as the gate itself, so it carries the same tag rather than relying on the gate's.
    structures: ['sole_trader', 'partnership'],
    dependsOn: { key: 'mtd_mandated', answer: 'yes' },
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
//
// ⚠️ IT TAKES THE ANSWERS, NOT JUST THE KEYS, AND THAT IS NOT A CONVENIENCE.
//
// A dependent question is only a real question once its premise holds. Ask a single man whether his
// wife earns under the personal allowance and you have not asked him a question, you have read him a
// list. He will notice, and the price of him noticing is that he stops answering the ones that are
// worth thousands.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE CORE. "Which of these is it fair to ask him today", applied to whichever list you hand it.
//
// ⚠️ IT IS ONE FUNCTION BECAUSE THERE IS ONE RULE. unanswered() asks it about the money questions,
// the MTD path asks it about the compliance ones, and progressIn() asks it about whichever group is
// on screen. Three copies of "has he answered it, and does its premise hold" is three chances for a
// man to be asked something twice, and the copy that drifts is the one he is looking at.
//
// The special category REFUSAL does not live here, it lives in unanswered(), because it is a refusal
// rather than a rule: a caller must not be able to get a health question out of this file by passing
// the right list. sensitive() is the only door, and it is gated.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Is this question even FOR a man of this structure? See the `structures` field above for the two
// halves of the rule: absent on the entry means everyone, and an unknown structure from the caller
// means ask everything, because a failed profile read must never silently cost a sole trader the
// biggest relief on the list.
function forStructure(c: Circumstance, structure?: BusinessStructure | null): boolean {
  if (!c.structures || !structure) return true;
  return c.structures.includes(structure);
}

function openIn(
  list: Circumstance[],
  answered: Array<{ key: string; answer: string }>,
  structure?: BusinessStructure | null,
): Circumstance[] {
  const given = new Map(answered.map((a) => [a.key, a.answer]));
  return list.filter((c) => {
    if (c.specialCategory) return false;
    // ⚠️ A REFUSAL, NOT A HOLD. A question that is not for his structure is not waiting on a
    // premise, it does not apply to him at all, so it never enters the queue and never counts
    // against him in a progress denominator.
    if (!forStructure(c, structure)) return false;
    if (given.has(c.key)) return false;
    if (!c.dependsOn) return true;
    // The premise must be ANSWERED and answered the right way. An unanswered premise holds the
    // follow up back, it does not release it.
    return given.get(c.dependsOn.key) === c.dependsOn.answer;
  });
}

export function unanswered(
  answered: Array<{ key: string; answer: string }>,
  structure?: BusinessStructure | null,
): Circumstance[] {
  const given = new Map(answered.map((a) => [a.key, a.answer]));

  return askingOrder().filter((c) => {
    // 🔴 A SPECIAL CATEGORY QUESTION IS NEVER IN THE QUEUE. NOT ON WHATSAPP, NOT IN THE APP LIST.
    //
    // This is a REFUSAL, not a filter, and it lives here rather than in each caller for the reason
    // every rule in this codebase ends up in one place: a rule enforced in three call sites is a rule
    // that will one day be enforced in two. Health data does not get to depend on a new route
    // remembering. See sensitive() for the gated path it is allowed to travel instead.
    if (c.specialCategory) return false;

    // 🔴 AND THE COMPLIANCE QUESTIONS ARE REFUSED HERE TOO, FOR A DIFFERENT REASON.
    //
    // Not because they are dangerous, because they are not reliefs. This queue is the money queue:
    // it feeds the WhatsApp chain, the app's list and the setup wizard's relief screen, all of which
    // are sorted by what a question is worth. "Have you signed up for Making Tax Digital" is worth
    // nothing and belongs beside the bank step, not between the pension and the van. mtdQuestions()
    // is its door.
    if (c.mtd) return false;

    // 🔴 AND A QUESTION THAT IS NOT FOR HIS STRUCTURE IS REFUSED THE SAME WAY. A director asked
    // "before you went self employed" is being read a list, and he only needs to notice once to
    // stop answering the questions that are worth thousands. Unknown structure asks everything:
    // see forStructure for why that is the safe direction.
    if (!forStructure(c, structure)) return false;

    if (given.has(c.key)) return false;
    if (!c.dependsOn) return true;

    // The premise must be ANSWERED and it must be answered the right way. An unanswered premise
    // holds the follow-up back, it does not release it: we ask whether he is married before we ask
    // anything about his wife, and never the other way round.
    return given.get(c.dependsOn.key) === c.dependsOn.answer;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE WHATSAPP BUTTON ID. He taps Yes, and this is the entire round trip.
//
// ⚠️ IT LIVES HERE, NOT IN THE WEBHOOK, FOR ONE REASON: SO A TEST CAN RUN IT.
//
// The keys have underscores in them. `prior_employment`. `vat_registered`. `home_office`. A parser
// that splits on the FIRST underscore turns every one of the three most valuable questions we ask
// into an unknown button id, and an unknown button id in that handler falls through to the help
// menu. So a man taps "Yes, I was employed before", and gets sent a list of commands, and his answer
// is never written, and the single biggest relief in this product never fires. For anybody. Ever.
//
// It would not crash. It would not log. Nothing would go red. It would just quietly not work, and we
// would find out in a year when a customer's accountant asked why we never claimed his terminal loss.
//
// That is the entire class of bug this codebase keeps producing, and the only fix that has ever
// worked is: put the thing where a test can reach it, and write the test.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// THE GATED PATH. The questions unanswered() will not hand out.
//
// They are shown in ONE place, in the app, on their own, behind their own consent, with their own
// delete button. Never in the list with the others, because putting a health question between "do
// you pay into a pension" and "what do you drive" is precisely the move that makes it look ordinary,
// and it is not ordinary. It is the one question in this product that the law says we may not ask.
export function sensitive(): Circumstance[] {
  return CIRCUMSTANCES.filter((c) => c.specialCategory);
}

// THE HOUSEHOLD FOUR, AND EVERYTHING THAT IS NOT ONE OF THEM.
//
// Two selectors rather than one, because the caller that shows the household screen and the caller
// that shows the rest must partition the SAME list. One selector plus a negation written at the call
// site is how a question ends up asked twice, or asked never, and both of those are the cheapest way
// to teach a man we are not listening. test/onboardingweb.test.mjs asserts the two are disjoint and
// that together they account for every askable question.
export function household(): Circumstance[] {
  return askingOrder().filter((c) => c.household && !c.specialCategory && !c.mtd);
}

// ⚠️ AND IT EXCLUDES THE COMPLIANCE ONES TOO, WHICH IS EASY TO MISS.
//
// This is the reliefs screen. Without the `!c.mtd` clause every MTD question would land on it, in
// worthOrder position, between "do you give to charity" and "do you do your paperwork at home". The
// test asserts the three groups partition the list rather than merely not overlapping, so a fourth
// group added later cannot quietly fall through into this one.
export function notHousehold(): Circumstance[] {
  return askingOrder().filter((c) => !c.household && !c.specialCategory && !c.mtd);
}

// WHERE HE STANDS WITH HMRC. Its own door, its own screen, never in the money queue.
//
// The gate (`mtd_mandated`) comes first because the other three depend on it, and openIn() will not
// release them until he has said yes. A man under the threshold answers one question and is done.
export function mtdQuestions(): Circumstance[] {
  return CIRCUMSTANCES.filter((c) => c.mtd && !c.specialCategory);
}

// The MTD questions it is fair to ask him today. Same rule as the money queue, different list.
// A limited company gets an empty list by construction: the gate question carries `structures`
// and the three follow ups hang off it, so nothing here needs to know why.
export function unansweredMtd(
  answered: Array<{ key: string; answer: string }>,
  structure?: BusinessStructure | null,
): Circumstance[] {
  return openIn(mtdQuestions(), answered, structure);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HOW FAR THROUGH A GROUP HE IS, AND THE DENOMINATOR IS HIS, NOT THE MODULE'S.
//
// Found by walking the live site on 30 July, not by a test. The household screen greeted a brand new
// customer with "1 of 4 answered" before he had answered anything, and then still said "1 of 4"
// after he answered his first, so it was wrong, and then right by accident, which is worse: a number
// that agrees with the truth by coincidence is measuring something else.
//
// ⚠️ THE MISTAKE WAS COUNTING "NOT IN THE QUEUE" AS "ANSWERED", AND THOSE ARE DIFFERENT THINGS.
//
// unanswered() holds a question back until its premise is established: a single man is never asked
// what his wife earns. So partner_low_earner is absent from the queue of a man who has not said he is
// married, and absence was being read as done.
//
// The denominator grows instead. Answered plus still to ask is the only count that is true for THIS
// man, and saying "married, yes" turns 0 of 3 into 1 of 4, which is honest in both directions: he has
// answered one, and answering it revealed one more that is worth asking him.
//
// It lives here rather than in the page because a count derived at a call site is a rule that has to
// be got right again at the next call site, and because a function here is one a test can RUN
// against fixtures rather than grep for. See test/onboardingweb.test.mjs.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export interface AskProgress {
  // Questions in this group he has actually given us an answer to.
  answered: number;
  // Those, plus the ones still worth asking him. Never the module's total.
  askable: number;
}

export function progressIn(
  group: Circumstance[],
  answered: Array<{ key: string; answer: string }>,
  structure?: BusinessStructure | null,
): AskProgress {
  const given = new Set(answered.map((a) => a.key));
  // ⚠️ AN ANSWER HE GAVE IS COUNTED EVEN IF HIS STRUCTURE WOULD NOT BE ASKED TODAY. He may have
  // answered as a sole trader and incorporated since; the record of what he told us does not
  // evaporate because the question stopped applying, only the ASKING stops.
  const done = group.filter((c) => given.has(c.key)).length;
  // ⚠️ openIn RATHER THAN unanswered, AND THE DIFFERENCE IS NOT COSMETIC. unanswered() refuses the
  // compliance questions on purpose, so counting through it would tell a man on the MTD screen that
  // he has 0 of 0 to answer while three questions sit in front of him.
  const toAsk = openIn(group, answered, structure).length;
  return { answered: done, askable: done + toAsk };
}

// The pile's honest footnote about the questions still open, and it lives here because the count
// it describes is this module's count (progressIn over every group), never a page's own arithmetic.
//
// WHY IT EXISTS. /app/pile's empty state says "Nothing is waiting on you. Everything we have is
// filed and counted", and on 31 July that sentence sat on the screen of a man with open
// circumstances questions, each one money or standing we cannot get him until he answers. Two
// screens contradicting each other about what is waiting on him is the product lying to one of
// them.
//
// Returns null when nothing is open, so the page renders nothing extra. The sentence deliberately
// ends before the word Circumstances: the page finishes it with a link to /app/you/circumstances,
// so what a customer reads ends "waiting under Circumstances."
export function openQuestionsLead(openCount: number): string | null {
  if (!Number.isFinite(openCount) || openCount <= 0) return null;
  if (openCount === 1) {
    return 'Though one question about you is still open. It is money or standing we cannot get you until you answer, and it is waiting under ';
  }
  return `Though ${openCount} questions about you are still open. Each one is money or standing we cannot get you until you answer, and they are waiting under `;
}

// Has he given EXPLICIT consent to be asked at all? Nothing in sensitive() may be shown, asked,
// stored, or acted on until this is true.
export function hasSpecialConsent(answered: Array<{ key: string; answer: string }>): boolean {
  return answered.some((a) => a.key === CONSENT_KEY && a.answer === 'yes');
}

export type Answer = 'yes' | 'no' | 'skip';

const PREFIX = 'circ_';

export function buttonId(key: string, answer: Answer): string {
  return `${PREFIX}${key}_${answer}`;
}

export function parseButtonId(id: string): { key: string; answer: Answer } | null {
  if (!id.startsWith(PREFIX)) return null;

  const rest = id.slice(PREFIX.length);

  // lastIndexOf. NOT indexOf. Read the block above before you change this.
  const cut = rest.lastIndexOf('_');
  if (cut <= 0) return null;

  const key = rest.slice(0, cut);
  const answer = rest.slice(cut + 1);

  // The key must be one WE asked. Anything else is not a circumstance, and guessing what an unknown
  // key means is how a wrong fact walks into a tax return that a man then signs himself.
  const c = CIRCUMSTANCES.find((x) => x.key === key);
  if (!c) return null;

  // 🔴 AND IT MUST NOT BE A HEALTH QUESTION, EVEN IF THE ID IS PERFECTLY WELL FORMED.
  //
  // unanswered() will never SEND one, so no honest button can carry one back. But "we would never
  // send it" is not a control, it is a hope: an old message replayed, a hand-rolled id, a future
  // flow that reaches for buttonId() without reading any of this. The parser refuses at the door, so
  // that health data cannot enter through the WhatsApp webhook at all, by any route, ever.
  if (c.specialCategory) return null;

  if (answer !== 'yes' && answer !== 'no' && answer !== 'skip') return null;

  return { key, answer };
}
