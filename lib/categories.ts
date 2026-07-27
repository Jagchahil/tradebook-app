// What a thing bought with business money can be. ONE list, and the vendors that map to it.
//
// THE PROBLEM THIS SOLVES. The old CATEGORY_MAP was eight regexes covering about fifty shops:
// the fuel majors, the big merchants, a handful of phone networks. A real tradesman's bank
// statement is nothing like that. It is Amazon and eBay and PayPal, the local merchant nobody
// outside the county has heard of, the tool hire place, the skip, the accountant, the
// subcontractor he pays every Friday. All of it landed as "other".
//
// And "other" means NO SUGGESTION, which means he has to pick a category by hand. So the review
// deck we built to save him two hundred taps was going to hand him back a hundred and fifty of
// them. The grouping made the pile short; this is what makes the pile ANSWERABLE.
//
// IT IS ALL RULES. No AI call, no cost, no latency. A bank line is free to categorise and a
// receipt photo costs about half a penny (doc 100), which is exactly why the bank feed is the
// better capture channel and not just the easier one.
//
// ---------------------------------------------------------------------------------------------
// A WARNING ABOUT BEING CLEVER HERE.
//
// Every rule in this file is a GUESS PRESENTED AS AN ANSWER. He will see "I think this is
// materials" and, most of the time, agree without really checking, because that is what people
// do. So a confident wrong rule is worse than no rule: it does not just fail to help, it walks a
// wrong number into his tax return with his own consent.
//
// So the bar is not "would this usually be materials". It is "would this be materials so nearly
// always that a man nodding along is safe". Where a vendor is genuinely ambiguous (AMAZON is a
// bookshop and a tool shop and a birthday present) THERE IS NO RULE, on purpose, and he is asked.
// ---------------------------------------------------------------------------------------------

// The canonical set. The APP DOES NOT KEEP ITS OWN COPY: /api/pile sends this list down, so
// there is exactly one place where a category can be added or renamed. Two lists that mean the
// same thing always drift, and tonight one of them (TX_COLS vs TX_SELECT) drifted far enough to
// break the undo entirely.
export const CATEGORIES = [
  'materials',
  'tools',
  'equipment',
  'fuel',
  'van',
  'travel',
  'subcontractor',
  'wages',
  'insurance',
  'phone',
  'software',
  'workwear',
  'waste',
  'training',
  'accountancy',
  'marketing',
  'bank charges',
  'meals',

  // 🔴 THE THREE THAT DID NOT EXIST, AND THE HOLE THEY LEFT.
  //
  // Everything above this line is a TRADESMAN'S cost sheet: materials, tools, van, workwear. It is a
  // good cost sheet, and for a plumber in a van it is close to complete. For anybody who works from
  // PREMISES it was missing the three biggest lines in their business, and they had nowhere to go
  // but 'other'.
  //
  // A coffee shop's two largest costs are the lease and the beans. A restaurant's are the lease and
  // the food. A barber's are the chair rent and the products. Not one of them had a category, so the
  // most important money in those businesses landed in a bucket named after not knowing.
  //
  // That is not a tidiness problem. 'other' is the category the review pile cannot reason about, the
  // optimiser cannot suggest against, and a man cannot check. We were quietly telling every
  // premises-based business that we did not understand their books.
  //
  // ⚠️ 'rent' IS BUSINESS PREMISES ONLY, AND THE AUTO RULES ARE DELIBERATELY NARROW FOR THE SAME
  // REASON 'mortgage interest' has none at all: a regex on the word "rent" would sweep up a man's own
  // HOUSE rent and claim tax relief on it. Use of home is a flat rate, not his rent. So the rules
  // below match commercial landlords, agents and serviced offices, never the bare word.
  'rent',
  // Light, heat, water, broadband at the business premises. Same caution: never his home bills.
  'utilities',
  // GOODS FOR RESALE. The single biggest line for retail, hospitality and ecommerce, and it is not
  // 'materials': materials get consumed doing a job, stock gets SOLD ON. They are different lines on
  // a return and different numbers for a stocktake.
  'stock',

  // A LANDLORD'S RESIDENTIAL MORTGAGE INTEREST. It is not an ordinary expense: Section 24
  // restricts it to a 20% tax CREDIT rather than a deduction, so it must be kept apart from the
  // other property costs or the relief is overstated.
  //
  // THERE IS NO AUTO RULE FOR IT, ON PURPOSE. A regex on "mortgage" would sweep up a man's OWN
  // HOME mortgage and quietly claim tax relief on it. That is not a small error, it is a wrong
  // claim on a real return. He chooses this one.
  'mortgage interest',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(c: string | null | undefined): boolean {
  return CATEGORIES.includes((c ?? '').trim().toLowerCase() as Category);
}

// Order matters: the FIRST match wins. So the specific rules come before the loose ones, and
// anything that could be caught by a generic word sits above it.
const CATEGORY_MAP: Array<[RegExp, Category]> = [
  // --- UTILITIES: the business premises bills --------------------------------------------
  //
  // Named suppliers only. There is no rule on the bare words "electric", "gas" or "water", and that
  // is deliberate: "gas" is a plumber's stock in trade and "electric" is half an electrician's
  // vocabulary, so a loose rule here would misfile the trades to serve the shops. Named energy and
  // telecoms suppliers are unambiguous.
  //
  // ⚠️ THESE MAY STILL BE HIS HOME BILLS. The auto rule proposes, the review pile disposes, exactly
  // like every other rule in this file. Use of home is a FLAT RATE, never his actual household
  // energy bill, so if this lands on a home supply he unticks it and lib/memory.ts learns.
  [/\b(british gas|edf energy|e\.?on|octopus energy|ovo energy|scottish power|sse\b|utilita|shell energy|so ?energy|bulb energy|npower|good energy|ecotricity|opus energy|crown gas|corona energy|smartest energy|total gas)\b/i, 'utilities'],
  [/\b(thames water|severn trent|anglian water|yorkshire water|united utilities|south west water|wessex water|northumbrian water|scottish water|affinity water|castle water|water plus|business stream)\b/i, 'utilities'],
  [/\b(bt business|btbusiness|virgin media business|sky business|talktalk business|zen internet|plusnet business|gigaclear|hyperoptic|community fibre)\b/i, 'utilities'],
  [/\b(business rates|water rates|standing charge)\b/i, 'utilities'],

  // --- RENT: BUSINESS PREMISES ONLY -------------------------------------------------------
  //
  // 🔴 THERE IS NO RULE ON THE BARE WORD "rent", AND THERE MUST NEVER BE ONE.
  //
  // Same reasoning that leaves 'mortgage interest' with no auto rule at all. A man's own house rent
  // is not a business cost, and a regex on "rent" would sweep it up and claim tax relief on it. That
  // is not a misfiling, it is a WRONG CLAIM ON A REAL RETURN, in his name, that he signed.
  //
  // So these match the commercial world only: agents and landlords who let business space, serviced
  // office and workspace operators, self storage, and the unambiguous compound phrases. "rent" on its
  // own reaches 'other' and he chooses, which is the correct outcome for a word that means two
  // completely different things depending on which door it is paying for.
  [/\b(regus|iwg\b|spaces works|wework|workspace group|bizspace|the office group|landmark space|orega|clockwise offices|huckletree|patch work)\b/i, 'rent'],
  [/\b(big yellow|safestore|access self storage|storage king|shurgard|lok'?n ?store)\b/i, 'rent'],
  [/\b(unit rent|shop rent|premises rent|office rent|studio rent|workshop rent|yard rent|rent (?:for|on) (?:the )?(?:unit|shop|premises|office|studio|workshop|yard)|commercial rent|ground rent|service charge)\b/i, 'rent'],

  // --- STOCK: GOODS FOR RESALE ------------------------------------------------------------
  //
  // Not 'materials'. Materials are consumed doing a job; stock is bought to be SOLD ON. A cafe's
  // beans, a shop's shelves, an online seller's inventory. Different line on the return, different
  // number at stocktake, and for anyone selling goods it is the largest cost in the business.
  //
  // Wholesalers and cash and carries first, then the food service names, then the plain words. Note
  // Costco already appears under fuel above for its PETROL specifically, which is why that rule is
  // narrowed to the pump: a Costco trolley is stock, a Costco fill up is fuel.
  [/\b(booker|bestway|batleys|dhamecha|parfetts|blakemore|landmark wholesale|today'?s group|sugro|confex)\b/i, 'stock'],
  [/\b(brakes\b|bidfood|bidvest|sysco|creed foodservice|turner price|jj foodservice|reynolds catering|total produce|smithfield|billingsgate|new covent garden)\b/i, 'stock'],
  [/\b(matthew algie|union hand|pact coffee|rave coffee|lavazza|illy\b|beans? supplier|coffee bean|roastery|roasters)\b/i, 'stock'],
  [/\b(stock purchase|goods for resale|wholesale|cash ?and ?carry|inventory purchase)\b/i, 'stock'],

  // --- FUEL ------------------------------------------------------------------------------
  // The forecourts, the supermarket pumps, and the chargers. EV charging is fuel: it is the
  // same expense doing the same job, and a man with an electric van should not have to argue.
  [/\b(shell|bp\b|esso|texaco|gulf|jet\b|murco|applegreen|essar|certas|harvest energy|ascona)\b/i, 'fuel'],
  [/\b(tesco|sainsburys?|asda|morrisons|costco|applegreen)\s*(petrol|fuel|filling)\b/i, 'fuel'],
  [/\b(pod ?point|instavolt|gridserve|bp pulse|osprey charging|char\.?gy|ubitricity|shell recharge|ionity|fastned|supercharger|zap ?map)\b/i, 'fuel'],
  [/\b(petrol|diesel|fuel|filling station|service station|forecourt|ev charg)/i, 'fuel'],

  // --- MATERIALS: merchants, trade counters, wholesalers ----------------------------------
  // The chains first, then the regionals, then the trade words. This is the biggest single
  // category on a builder's statement and the one most worth getting right.
  [/\b(screwfix|toolstation|wickes|b ?& ?q|tradepoint|jewson|travis perkins|selco|buildbase|mkm|howdens|huws gray|lawsons|bradfords|covers timber|ridgeons|chandlers|elliotts|parker building|stamco|robert price|gibbs ?& ?dandy|keyline|jt atkinson|grafton)\b/i, 'materials'],
  [/\b(city plumbing|plumbase|plumb ?cent(er|re)|wolseley|graham plumb|williams plumb|bathroom ?village|victorian plumbing|screwfix plumb)\b/i, 'materials'],
  [/\b(cef\b|city electrical|edmundson|rexel|denmans|yesss electrical|newey ?& ?eyre|wf senate|electrical wholesal)\b/i, 'materials'],
  [/\b(topps tiles|tile giant|magnet|benchmarx|jayson|sig plc|encon|minster|insulation|plasterboard|british gypsum|knauf|celotex|kingspan)\b/i, 'materials'],
  [/\b(builders? merchant|timber|plywood|aggregates|readymix|concrete|cement|sand ?& ?gravel|brick|blocks?)\b/i, 'materials'],

  // --- TOOLS (hand and power, bought not hired) -------------------------------------------
  [/\b(machine mart|toolstop|d ?& ?m tools|powertool world|ffx\b|tooled ?up|axminster|protrade|itsuk|toolbank)\b/i, 'tools'],
  [/\b(dewalt|makita|milwaukee|festool|bosch pro|hikoki|stihl|husqvarna|snap[- ]?on|facom|knipex)\b/i, 'tools'],

  // --- EQUIPMENT and HIRE ------------------------------------------------------------------
  // Hire is not a tool you own, and it is not materials. It matters because tools and equipment
  // are the two categories the capital-allowance logic actually reads.
  [/\b(hss hire|speedy (hire|services)|brandon hire|hire ?station|national tool hire|gap (group|hire)|sunbelt|a-?plant|smiths hire|plant ?hire|tool ?hire|scaffold(ing)? hire|access hire|nationwide platforms)\b/i, 'equipment'],

  // --- THE VAN -----------------------------------------------------------------------------
  // Running it, fixing it, taxing it. Not the fuel: fuel has its own line above.
  [/\b(dvla|dvsa|mot\b|kwik ?fit|halfords|ats euromaster|national tyres|formula one autocentre|euro car parts|gsf car parts|motor ?parts|autoglass|national windscreens|rac\b|aa breakdown|green flag|vehicle tax|road tax|car parts)\b/i, 'van'],

  // --- TRAVEL (getting there, not driving there) -------------------------------------------
  [/\b(ringgo|justpark|paybyphone|ncp\b|apcoa|parkingeye|q-?park|parking|dartford|dart charge|congestion|ulez|clean air zone|tfl\b|trainline|national rail|lner|avanti|northern rail|transpennine|megabus|national express|uber|bolt\b|addison lee|premier inn|travelodge|holiday inn)\b/i, 'travel'],

  // --- SUBCONTRACTOR and WAGES --------------------------------------------------------------
  // Deliberately narrow. A payment to "Dave" is NOT automatically a subcontractor: it might be
  // his brother paying him back for a curry. Only the unambiguous words.
  [/\b(cis (payment|deduction|sub)|subcontractor|sub ?contractor|labour only)\b/i, 'subcontractor'],
  [/\b(paye|hmrc paye|payroll|wages|salary|nest pensions|the peoples pension|smart pension)\b/i, 'wages'],

  // --- INSURANCE ----------------------------------------------------------------------------
  [/\b(axa|aviva|admiral|direct line|hiscox|simply business|zurich|allianz|ageas|lv=|churchill|rsa\b|tradesman ?saver|protectivity|public liability|insurance|insure)\b/i, 'insurance'],

  // --- PHONE and CONNECTIVITY ---------------------------------------------------------------
  [/\b(ee\b|o2\b|vodafone|three\b|giffgaff|tesco mobile|sky mobile|voxi|lebara|lycamobile|bt group|bt\b|plusnet|sky\b|virgin media|talktalk|hyperoptic|community fibre|broadband|mobile)\b/i, 'phone'],

  // --- SOFTWARE and SUBSCRIPTIONS ------------------------------------------------------------
  [/\b(microsoft|office ?365|google (workspace|cloud)|adobe|dropbox|apple\.com\/bill|icloud|zoom|slack|xero|quickbooks|freeagent|sage\b|lekhio|monday\.com|trello|canva|squarespace|wix|godaddy|ionos|123-?reg|namecheap|aws\b|amazon web services)\b/i, 'software'],

  // --- WORKWEAR and PPE ----------------------------------------------------------------------
  [/\b(arco\b|snickers|dickies|carhartt|site ?king|engelbert strauss|workwear|safety boots|hi ?vis|hard hat|ppe\b|screwfix workwear)\b/i, 'workwear'],

  // --- WASTE ----------------------------------------------------------------------------------
  [/\b(skip ?hire|biffa|veolia|suez|hippo ?bag|waste ?management|recycling centre|household waste|tip ?fee|grundon|enva)\b/i, 'waste'],

  // --- TRAINING and CERTIFICATION --------------------------------------------------------------
  // A real cost of being a tradesman, and one nobody remembers to claim.
  [/\b(cscs|nvq|city ?& ?guilds|gas safe|niceic|napit|elecsa|stroma|fensa|certass|competent person|ipaf|pasma|first aid (course|training)|training|course|exam fee)\b/i, 'training'],

  // --- ACCOUNTANCY and PROFESSIONAL ---------------------------------------------------------
  [/\b(accountants?|accountancy|bookkeep|companies house|solicitors?|legal fees|ico\b|information commissioner)\b/i, 'accountancy'],

  // --- MARKETING -------------------------------------------------------------------------------
  [/\b(checkatrade|rated ?people|mybuilder|trustatrader|yell\b|thomson local|google ads|meta platforms|facebook ads|instagram ads|vistaprint|instantprint|signs? ?express|van (wrap|signage)|leaflet)\b/i, 'marketing'],

  // --- BANK CHARGES -----------------------------------------------------------------------------
  [/\b(overdraft|arranged fee|unarranged fee|bank charge|account fee|monthly fee|card fee|stripe|sumup|zettle|square\b|paypal fee|worldpay|takepayments)\b/i, 'bank charges'],

  // --- MEALS ------------------------------------------------------------------------------------
  // Last, because a lot of these words are common. And note: subsistence is only allowable when
  // he is genuinely away from his normal place of work. We categorise it; we do not promise it.
  [/\b(greggs|mcdonald|costa|starbucks|subway|kfc|burger king|pret|caffe nero|coffee|cafe|canteen|sandwich)\b/i, 'meals'],

  // --- NO RULE, ON PURPOSE ------------------------------------------------------------------------
  //
  // AMAZON, EBAY, PAYPAL, and the supermarkets are DELIBERATELY ABSENT.
  //
  // They are the biggest lines on many statements and it is tempting to guess. But Amazon sells
  // drill bits and birthday presents from the same card, and a wrong guess here is not a small
  // wrong guess: it is a personal purchase walked into his business books, with a tick next to it
  // that he put there because we told him it was materials.
  //
  // He will teach us. The FIRST time he tells us that "AMAZON MKTPLACE" is materials, lib/memory.ts
  // remembers it FOR HIM, for good, and it never asks again. A rule he taught us beats a rule we
  // guessed, every time, and that is the whole design (see recall() in lib/memory.ts).
];

export function categoriseBankLine(text: string): Category {
  for (const [re, cat] of CATEGORY_MAP) if (re.test(text)) return cat;
  return 'other';
}

// How many rules we have, so a test can catch someone quietly deleting half the file.
export const RULE_COUNT = CATEGORY_MAP.length;
