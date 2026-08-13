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

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A LANDLORD'S OTHER THREE COSTS, ADDED RUN 2, 12 August 2026.
  //
  // 'mortgage interest' has been here since the property work and was the ONLY property cost a
  // customer could name. Everything else a landlord actually pays had to go in 'other': the
  // letting agent's monthly fee, the boiler repair, the ground rent on a leasehold flat.
  //
  // That was not only untidy. lib/propertylanes.ts is the door that routes a cost to the property
  // STREAM, and it routes on the category, so a cost with no property category could not reach the
  // property stream at all. A florist letting the flat above her shop had £475 of agent fees
  // deducted against her TRADE, which leaks 6% Class 4 on money that carries no National Insurance.
  //
  // ⚠️ THESE FOUR ARE THE ONLY WAY INTO THE PROPERTY STREAM and they are drawn only for a customer
  // who has one. See offerPropertyCategories: four extra rows in a plumber's category list are
  // four decisions he has to read past, which is doc 103's whole argument.
  //
  // ⚠️ AND NO AUTO RULES, for the same reason 'mortgage interest' has none. A regex on "agent"
  // catches an estate agent selling his house and an insurance agent; a regex on "repairs" catches
  // his van. Property costs are his to place, once, and then recall remembers the shop.
  'letting agent',
  'property repairs',
  'ground rent',
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
  // 🔴 AND THE INDEPENDENTS, WHICH IS MOST OF THEM. Walking a real statement on 2 August 2026:
  // KIRKSTALL SELF STORAGE, £1,040 across four payments, filed under nothing at all because the
  // rule above is a brand list. A tradesman's storage unit is where his gear lives and it is one
  // of the most ordinary costs in this trade; we were making him hunt it out of twenty four
  // options every month. Unlike the bare word "rent" there is nothing ambiguous here, because
  // nobody lives in one.
  [/\b(self[ -]?storage|storage unit|storage centre|storage center)\b/i, 'rent'],
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

  // --- WHAT HE BOUGHT, WHICH BEATS WHERE HE BOUGHT IT ---------------------------------------
  //
  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A £280 SDS DRILL FROM SCREWFIX WAS FILED AS MATERIALS AND COULD NEVER BE ANYTHING ELSE.
  // Found 11 August 2026.
  //
  // The materials rule directly below opens with the five shops a UK tradesman actually buys his
  // TOOLS from: screwfix, toolstation, wickes, b&q, tradepoint. First match wins (see the note at
  // the top of this map), and the whole tools ruleset was two lines of niche retailers and brands
  // sitting UNDERNEATH it. So every tool bought at a tool shop was materials, for everybody, for
  // ever, and no wording of the line could rescue it: "SCREWFIX SDS DRILL 280.00" was materials.
  //
  // That is not tidiness. Tools and equipment are the two categories the capital allowance logic
  // reads (see the hire block below), and lib/agent.ts and lib/taxoptimiser.ts both ask whether he
  // has logged any tool spend this year, which is how a man with a van full of tools gets told
  // "You have nothing logged this year for phone, tools" by the feature whose whole job is proving
  // we are paying attention.
  //
  // ⚠️ THE MERCHANT NAME IS NOT MOVED AND MUST NOT BE. "SCREWFIX DIRECT £280" is genuinely either:
  // that is a shop where a man buys a drill and a shop where he buys a bag of screws, and the name
  // alone cannot settle it. Guessing tools there would be this file's own warning coming true, a
  // confident wrong rule that he nods along to. So the DEFAULT for a bare merchant line is
  // unchanged, and what changes is that the line's OWN WORDS now get read first.
  //
  // A drill is a drill wherever it was bought. A description carrying "makita" or "mitre saw" is
  // telling us what the thing IS, and a merchant name is only telling us where he was standing.
  // Words about the THING win over words about the PLACE, which is why this block sits here, above
  // the merchants, rather than where the tools rules used to sit.
  //
  // ⚠️ AND A BARE MERCHANT LINE IS NOT LEFT UNANSWERABLE EITHER. See TOOL_AND_MATERIAL_MERCHANTS
  // and couldBeToolSpend at the foot of this file: rather than guess a category the data does not
  // support, the relationship between the two categories is written down, so a reader asking "has
  // he logged tool spend" can be answered honestly without demanding the exact string 'tools'.
  //
  // ⚠️ HIRE IS EXCLUDED BY THE LOOKAHEAD, AND THAT GUARD IS LOAD BEARING. "SPEEDY HIRE BREAKER" is
  // a week's hire, which is a running cost, not a tool he owns. Without this it would be caught
  // here and never reach the hire rule below, and a hire charge sitting in a capital category is a
  // worse error than the one being fixed. The tool NOUNS are also deliberately narrow: no bare
  // "saw" (he saw Dave about a job), no bare "grinder" (a cafe buys a coffee one), no bare "tool"
  // (that is "tool hire" and "TOOLSTATION"). The bar is this file's own bar: not "is it usually a
  // tool" but "is it a tool so nearly always that a man nodding along is safe".
  //
  // ⚠️ THE BRAND LIST IS NOT COPIED, IT IS MOVED. It used to sit below the merchants where it
  // could only fire on a line that mentioned no shop at all. Two copies of a brand list would be
  // the drift this file already warns about, so there is still exactly one.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  [/^(?!.*\b(?:hire|hired|hiring|rental)\b).*\b(?:sds|drill|jigsaw|nail ?gun|nailer|chisel|planer|sander|angle grinder|impact (?:driver|wrench)|torque wrench|(?:circular|mitre|chop|table|recip(?:rocating)?) saw|socket set|spanner set|laser level|multi ?tool|power ?tools?|tool ?(?:box|bag|kit|chest)|dewalt|makita|milwaukee|festool|bosch pro|hikoki|stihl|husqvarna|snap[- ]?on|facom|knipex)\b/i, 'tools'],

  // --- MATERIALS: merchants, trade counters, wholesalers ----------------------------------
  // The chains first, then the regionals, then the trade words. This is the biggest single
  // category on a builder's statement and the one most worth getting right.
  [/\b(screwfix|toolstation|wickes|b ?& ?q|tradepoint|jewson|travis perkins|selco|buildbase|mkm|howdens|huws gray|lawsons|bradfords|covers timber|ridgeons|chandlers|elliotts|parker building|stamco|robert price|gibbs ?& ?dandy|keyline|jt atkinson|grafton)\b/i, 'materials'],
  [/\b(city plumbing|plumbase|plumb ?cent(er|re)|wolseley|graham plumb|williams plumb|bathroom ?village|victorian plumbing|screwfix plumb)\b/i, 'materials'],
  [/\b(cef\b|city electrical|edmundson|rexel|denmans|yesss electrical|newey ?& ?eyre|wf senate|electrical wholesal)\b/i, 'materials'],
  [/\b(topps tiles|tile giant|magnet|benchmarx|jayson|sig plc|encon|minster|insulation|plasterboard|british gypsum|knauf|celotex|kingspan)\b/i, 'materials'],
  [/\b(builders? merchant|timber|plywood|aggregates|readymix|concrete|cement|sand ?& ?gravel|brick|blocks?)\b/i, 'materials'],

  // --- TOOLS: the shops that sell nothing else --------------------------------------------
  //
  // These are safe to read as a category because there is nothing ambiguous about them: nobody
  // buys a bag of cement at Machine Mart. That is exactly what is NOT true of Screwfix, which is
  // why Screwfix stays in the materials rule above and is answered a different way.
  //
  // ⚠️ THE BRANDS MOVED UP, they were not deleted. A brand names the THING, so it has to be read
  // before the merchant list or a Makita bought at Screwfix is materials. This rule names SHOPS,
  // which say only where he was, so it stays below the merchants where it has always been.
  [/\b(machine mart|toolstop|d ?& ?m tools|powertool world|ffx\b|tooled ?up|axminster|protrade|itsuk|toolbank)\b/i, 'tools'],

  // --- EQUIPMENT and HIRE ------------------------------------------------------------------
  // Hire is not a tool you own, and it is not materials. It matters because tools and equipment
  // are the two categories the capital-allowance logic actually reads.
  [/\b(hss hire|speedy (hire|services)|brandon hire|hire ?station|national tool hire|gap (group|hire)|sunbelt|a-?plant|smiths hire|plant ?hire|tool ?hire|scaffold(ing)? hire|access hire|nationwide platforms)\b/i, 'equipment'],

  // --- THE VAN -----------------------------------------------------------------------------
  // Running it, fixing it, taxing it. Not the fuel: fuel has its own line above.
  [/\b(dvla|dvsa|mot\b|kwik ?fit|halfords|ats euromaster|national tyres|formula one autocentre|euro car parts|gsf car parts|motor ?parts|autoglass|national windscreens|rac\b|aa breakdown|green flag|vehicle tax|road tax|car parts)\b/i, 'van'],

  // --- TRAVEL (getting there, not driving there) -------------------------------------------
  // ⚠️ BOTH THE ABBREVIATION AND THE FULL NAME. Found on Jag's live pile, 28 July 2026.
  // "Transport for London, 3 payments" arrived as an unknown offering him a 24 option dropdown,
  // because this rule only knew "tfl". Banks do not agree on how they write a merchant: one
  // sends TFL TRAVEL CH, another spells it out in full. A merchant we claim to know and then
  // ask about anyway is worse than one we never claimed, because it is the moment he decides
  // the grouping does not work and goes back to a shoebox.
  [/\b(ringgo|justpark|paybyphone|ncp\b|apcoa|parkingeye|q-?park|parking|dartford|dart charge|congestion|ulez|clean air zone|tfl\b|transport for london|trainline|national rail|lner|avanti|northern rail|transpennine|megabus|national express|uber|bolt\b|addison lee|premier inn|travelodge|holiday inn)\b/i, 'travel'],

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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE FIVE SHOPS THAT SELL BOTH, AND THE ONE QUESTION THE CATEGORY ALONE CANNOT ANSWER.
//
// A bank line reading "SCREWFIX DIRECT 280.00" is a drill or it is a box of screws, and nothing in
// it says which. This file's whole doctrine is that we do not guess in that position, so it stays
// materials, which is the honest majority answer and the one he can correct in a tap.
//
// But downstream there is a question that is NOT "what category is this", and it was being asked
// by demanding the exact string 'tools':
//
//   lib/taxoptimiser.ts  COMMON_COSTS includes 'tools', and a man with none in categoriesLogged is
//                        told "You have nothing logged this year for phone, tools".
//   lib/agent.ts         has('tools', 'equipment'), same shape, same sentence.
//
// A groundworker who buys every tool he owns from Screwfix and Toolstation logs all of it, sees it
// filed as materials, and is then told by his own assistant that he has logged no tools all year.
// He is not being nagged because the data is missing. He is being nagged because the question was
// asked with the wrong word.
//
// ⚠️ SO THE RELATIONSHIP IS WRITTEN DOWN RATHER THAN THE CATEGORY BEING GUESSED. The category
// stays exactly what it was. What is new is that a reader can ask whether a line COULD hold tool
// spend and get an honest maybe, instead of a no that it has no way to check.
//
// ⚠️ FIVE NAMES, NOT THE WHOLE MATERIALS RULE. Jewson, Travis Perkins and Selco are builders
// merchants: they have a tool counter and nobody goes there for one. These five are where a UK
// tradesman genuinely buys his tools, which is the reason they were in the materials rule doing
// this damage in the first place.
//
// ⚠️ AND 'equipment' IS NOT IN IT. That category is hire (see the rule), and a week on a breaker
// is a running cost, not a tool he owns. Answering yes for it would put this file's own doctrine
// back the other way round.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export const TOOL_AND_MATERIAL_MERCHANTS = /\b(screwfix|toolstation|wickes|b ?& ?q|tradepoint)\b/i;

// Could this line be tool spend? Pass the stored category when the row has one, because HIS answer
// outranks our rules: a line he moved to materials himself is materials, and a line he moved to
// tools is tools, whatever the merchant is called. With no category given, the rules answer.
//
// True for anything already filed as tools, and for materials bought at one of the five above.
// Never a reason to change what is stored or shown, and never a claim: it is the difference
// between "he has logged no tools" and "he may well have, under materials, at a tool shop".
export function couldBeToolSpend(text: string, category?: string | null): boolean {
  const line = String(text ?? '');
  const c = (category ?? categoriseBankLine(line)).trim().toLowerCase();
  if (c === 'tools') return true;
  return c === 'materials' && TOOL_AND_MATERIAL_MERCHANTS.test(line);
}
