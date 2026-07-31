// WHAT A MAN'S BUSINESS INCOME ACTUALLY IS. Not how he trades. Whether he trades at all.
//
// ---------------------------------------------------------------------------------------------
// 🔴 THE HOLE THIS FILE FILLS, FOUND BY WALKING /app/setup AS A LANDLORD ON 31 JULY 2026.
//
// The product had exactly one axis for who a customer is: BusinessStructure, sole trader or
// partnership or limited company. A landlord signing up through the Landlord chip on /start is
// mapped to 'sole_trader', because he files a personal return and he is not a company. So he
// passed every guard in the codebase as a sole trader, and was shown the whole trade corpus.
//
// The worst of it: he was asked what he did before he went self employed, under a promise that a
// loss in his first four years can be carried back against the wages from his old job and HMRC
// send him a cheque. That is ITA 2007 s72, early TRADE losses relief. A UK property business loss
// cannot be carried back at all. GOV.UK: "Normally you can only offset that loss against any
// profits that arise from the same rental business in future years." We were promising a man
// money that does not exist for him, on the strength of a question we should never have asked.
//
// Structure answers HOW he trades. It cannot answer WHETHER he trades, and a great deal of UK tax
// law turns on exactly that: early trade losses, voluntary Class 2, simplified expenses, the
// trading allowance, the Annual Investment Allowance. All of them are trade provisions, and all of
// them were being offered to a man whose only business is letting.
// ---------------------------------------------------------------------------------------------
//
// ⚠️ NO IMPORTS, DELIBERATELY, for the same reason lib/circumstances.ts has none: a test must be
// able to load this module bare, and Node's type stripping cannot resolve an extensionless
// relative import. The IncomeShape type is declared in lib/circumstances.ts, which is the module
// that consumes it, and re-declared here rather than imported. test/persona.test.mjs pins the two
// literals against each other so they can never drift apart in silence.

// 'trade'          he carries on a trade, with or without rent alongside it
// 'property_only'  his business is letting property and there is no trade at all
export type IncomeShape = 'trade' | 'property_only';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 UNKNOWN IS A REAL ANSWER, AND IT IS THE ONE WE DEFAULT TO.
//
// Returning null means "we do not know what this man does", and every caller treats that as
// permission to ask him everything. That is the safe direction and it is the same judgement
// lib/circumstances.ts already made for structure: asking a landlord a trade question is a
// nuisance he can say no to, while refusing to ask a sparky about his old employed job because a
// read came back empty is four figures gone with no trace that it ever happened.
//
// So this function only ever answers 'property_only' when the man HIMSELF told us his business is
// letting. It never infers it from an absence, and it never infers it from a quiet spell in the
// money log: a roofer who logged no work for a month is not a landlord.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The trade word that means the letting IS the business, as it is spelled on the /start chips.
// Matched case insensitively and trimmed, because it travels through a form and a database.
const LETTING_TRADE = 'landlord';

export interface SignupShape {
  // The chip he picked on /start, or what he typed into "Something else".
  trade?: string | null;
  // The income streams he ticked at step 4: 'job', 'property', 'loan'.
  streams?: string[] | null;
}

// What his signup says his business income is. Null when it does not say.
//
// ⚠️ IT READS THE TRADE, NOT THE STREAMS, AND THE DIFFERENCE IS THE WHOLE POINT.
//
// Ticking "property" at step 4 means he has rent ALONGSIDE the work. Picking Landlord as his trade
// means the letting IS the work. app/start/page.tsx already knows this and says so in a comment
// over submitSignup: it adds 'property' to the streams when the Landlord chip is picked, so by the
// time a row is written the two facts overlap and streams alone can no longer tell them apart.
// A sparky with a flat and a full time landlord both arrive here with streams containing
// 'property'. Only the trade word separates them.
export function incomeShapeOfSignup(signup: SignupShape | null | undefined): IncomeShape | null {
  if (!signup) return null;
  const trade = typeof signup.trade === 'string' ? signup.trade.trim().toLowerCase() : '';
  if (!trade) return null;
  if (trade === LETTING_TRADE) return 'property_only';
  // Any other trade word is a trade. 'Something else' with free text is a trade too: he typed a
  // thing he does, and a man who does a thing carries on a trade.
  return 'trade';
}

// Read a stored value back into the type, refusing anything we did not write. An unrecognised
// string is null, never a guess, because a guess here silently stops asking a real trade his most
// valuable question.
export function toIncomeShape(value: unknown): IncomeShape | null {
  return value === 'trade' || value === 'property_only' ? value : null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE TRADE PROVISIONS THIS AXIS EXISTS TO WITHHOLD, WITH THEIR SOURCES.
//
// Written here rather than scattered over the entries that use them, so that the day HMRC asks
// why a landlord was never offered one of these, the answer is a single paragraph with citations
// rather than an archaeology exercise across four files.
//
//   EARLY TRADE LOSSES        ITA 2007 s72. A loss in the first four tax years of a TRADE carried
//                             back three years against total income. A UK property business loss
//                             carries forward against future property profits of the same
//                             business and nowhere else (GOV.UK, working out your rental income:
//                             "when your rental business ends, any losses that have been carried
//                             forward are usually lost as they cannot be set against any other
//                             income").
//
//   VOLUNTARY CLASS 2 NIC     NIM74250. "A person whose activities in managing the property are
//                             those generally associated with being a landlord would not meet the
//                             definition of gainful employment for self-employed NICs purposes."
//                             So there are no relevant profits, no small profits threshold to
//                             fall under, and no voluntary Class 2 to buy the year with. His
//                             route is Class 3, at several times the price, which is a different
//                             sentence from the one we were showing him.
//                             ⚠️ The same manual page carries the exception that makes 'unknown
//                             asks everything' the right default: a guest house or a hotel IS a
//                             trade. A man who lets and also trades is a trade, and this axis only
//                             ever says 'property_only' when he told us letting is all of it.
//
//   SIMPLIFIED EXPENSES       ITTOIA 2005 s94H, BIM75010. The use of home flat rate by hours is
//                             available to individuals and to partnerships of individuals only. A
//                             property business computes its own proportion of actual costs, and a
//                             company cannot use the flat rate at all.
//
//   ANNUAL INVESTMENT         CAA 2001 s35 denies plant and machinery allowances for expenditure
//   ALLOWANCE                 on plant in a dwelling house, which is most of what a residential
//                             landlord buys.
// ═══════════════════════════════════════════════════════════════════════════════════════════
