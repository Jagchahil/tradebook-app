// THE YEAR TO DATE ROW SUM, PURE AND IN ONE PLACE, SO THE GUARD SUITE CAN DRIVE IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Three times in five days a tax rule reached taxPosition and missed a document a customer hands
// a lender: the £60,000 car through expenses (2 August), the Section 24 interest (6 August),
// the car's own allowance (6 August). Each time the drift began in a row loop that lived inside
// lib/supabase.ts's getOptimiserInput, where no test that stages pure engine files could reach
// it, so every reader of raw rows re-decided the rules by hand and one of them was always wrong.
//
// This file is that loop, extracted whole and unchanged, plus the three pure row predicates it
// depends on. lib/supabase.ts calls aggregateConfirmedRows for production; the guard suite
// (test/moneyspine.test.mjs) feeds the SAME function seeded random accounts and requires
// taxPosition, the quarter pack, the proof of income and the shared books to agree to the penny.
// A rule that lands here is seen by every reader at once. A rule that lands anywhere else fails
// the guard the moment it changes one figure.
//
// ⚠️ NOTHING IN HERE MAY READ THE DATABASE, THE ENVIRONMENT OR THE CLOCK. Pure data in, pure
// data out, or the guard suite is testing something other than what production runs.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { capitalRelief, isCapitalKind, isWrittenDown } from './capital';
import { isResidentialFinanceCost } from './propertyengine';
import { quarterForDate } from './quarterpack';
// The documented relationship between the two categories a tool can honestly land in. See the block
// beside its call below, and lib/categories.ts for why the categoriser refuses to guess.
import { couldBeToolSpend } from './categories';

// One confirmed money row, as the aggregation needs it. The fields are the ones
// getConfirmedTransactionsForRange selects; anything extra rides along untouched.
export interface YearRow {
  amount: number | string;
  income_type?: string | null;
  category?: string | null;
  vendor?: string | null;
  capital_kind?: string | null;
  cis_deduction?: number | string | null;
}

// A capital asset row, every year's, as getCapitalAssets returns them.
export interface CapitalAssetRow {
  capital_kind: string | null;
  transaction_date: string;
  amount: number | string;
  business_use_pct: number | null;
}

// The year to date figures every money surface starts from. Unrounded on purpose:
// getOptimiserInput rounds at its return exactly as it always has.
export interface YearToDate {
  ytdTradeIncome: number;
  ytdTradeExpenses: number;
  ytdCisSuffered: number;
  ytdPropertyIncome: number;
  ytdPropertyExpenses: number;
  ytdPropertyFinance: number;
  ytdMileage: number;
  ytdHomeOfficeLogged: number;
  ytdCapitalAllowances: number;
  categoriesLogged: string[];
  vehicleBoughtThroughBooks: boolean;
}

// 🔴 IS THIS ROW A MILEAGE CLAIM? THE CATEGORY CANNOT TELL YOU, AND THAT WAS A REAL BUG.
//
// A mileage claim is inserted (app/api/whatsapp/route.ts, handleMileage) as vendor 'Mileage' under
// category 'travel', because there IS no 'mileage' category in lib/categories.ts and never has been.
//
// getOptimiserInput used to decide `mileageClaimed` with categoriesLogged.some(c => c.includes('mile')).
// 'travel'.includes('mile') is FALSE. So mileageClaimed was false for EVERY user who has ever existed,
// including one who logs his miles religiously every week.
//
// That is not cosmetic. lib/taxoptimiser.ts rule 5 reads that flag and tells a man "You are logging
// fuel but no mileage, text log 24 miles whenever you drive for work." He gets nagged, forever, to do
// the thing he already does, by the feature whose entire job is proving we are paying attention to
// his money. The Maximiser is the differentiator; a Maximiser that cannot see what he already claimed
// is worse than no Maximiser, because it tells him we are not looking.
//
// So it is decided on the VENDOR, which is the literal the inserter writes, plus a category check
// kept only so that adding a real 'mileage' category later works without another bug.
export function isMileageRow(r: { vendor?: unknown; category?: unknown }): boolean {
  const vendor = String(r.vendor ?? '').trim().toLowerCase();
  const category = String(r.category ?? '').trim().toLowerCase();
  return vendor === 'mileage' || category.includes('mile');
}

// 🔴 THE SAME BUG AS MILEAGE, IN THE OTHER DIRECTION, AND IT WAS COSTING A MAN MONEY TWICE.
//
// lib/ledger.ts:340 ADDS the use of home election on its own line, and its comment argues that
// adding rather than slicing is correct because "use of home is an ELECTION, not a transaction ...
// So it cannot be inside expenses". That premise was TRUE when it was written and FALSE by the time
// anybody read it: app/api/whatsapp/route.ts handleHomeOffice inserts a real transaction with
// vendor 'Use of home' and category 'use of home', which lands in ytdTradeExpenses like any other
// cost. That file admits it in a comment and left the fix for somebody else.
//
// So a man who makes the election AND texts his hours is deducted twice. This is the slice that
// stops it, and it is deliberately EXACT rather than a substring match: category.includes('home')
// would sweep up any future household category, and lib/categories.ts refuses to create one on
// purpose, because a rule on the word rent or on a household energy bill would claim tax relief on
// a man's own house.
//
// Both spellings, because lib/hmrc.ts:401 already carries both for the MTD mapping and a row
// written by either route has to be found by this one function.
export function isHomeOfficeRow(r: { vendor?: unknown; category?: unknown }): boolean {
  const vendor = String(r.vendor ?? '').trim().toLowerCase();
  const category = String(r.category ?? '').trim().toLowerCase();
  return vendor === 'use of home' || category === 'use of home' || category === 'use_of_home';
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE WRITTEN DOWN CAPITAL ALLOWANCE FOR A TAX YEAR, IN ONE PLACE SO IT CANNOT DRIFT.
//
// A car does not come off in the year like a van; it earns a writing down allowance every year it
// is held (lib/capital.ts). getOptimiserInput deducts this from the set aside, and until 6 August
// the tax summary and the lender documents did NOT, so a car owner read £3,232 of tax on one screen
// and £2,686 on another off the same books. This is the single sum all three now share: give it the
// assets and the year and it returns the same figure, so no surface can print a different one.
// Pure, so it is unit testable; the async wrapper reads the rows.
export function sumCapitalAllowances(
  assets: Array<{ capital_kind: string | null; transaction_date: string; amount: number | string; business_use_pct: number | null }>,
  startYear: number,
): number {
  let total = 0;
  for (const a of assets) {
    const kind = isCapitalKind(a.capital_kind) ? a.capital_kind : null;
    if (!kind || !isWrittenDown(kind)) continue;
    const boughtYear = quarterForDate(new Date(`${a.transaction_date}T00:00:00Z`)).startYear;
    const yearsHeld = Math.max(0, startYear - boughtYear);
    const use = a.business_use_pct == null ? 100 : a.business_use_pct;
    total += capitalRelief(Math.abs(Number(a.amount)), kind, use, yearsHeld).thisYear;
  }
  return Math.round(total * 100) / 100;
}

// The one row loop. Moved verbatim from lib/supabase.ts getOptimiserInput on 6 August 2026; the
// comments inside are its history and they moved with it.
export function aggregateConfirmedRows(
  rows: YearRow[],
  assets: CapitalAssetRow[],
  startYear: number,
  partnerFactor = 1,
): YearToDate {
  let ytdTradeIncome = 0;
  let ytdTradeExpenses = 0;
  let ytdCisSuffered = 0;
  let ytdPropertyIncome = 0;
  let ytdPropertyExpenses = 0;
  // Finance costs (mortgage interest) kept apart from ordinary expenses: they get the Section 24
  // credit, not a deduction. Same split propertyYtdTotals uses, so the Overview matches the tools.
  let ytdPropertyFinance = 0;
  const cats = new Set<string>();
  // 🔴 THE MILEAGE, COUNTED SEPARATELY BUT NOT COUNTED TWICE. See the note on OptimiserInput.ytdMileage.
  // This is a SLICE of ytdTradeExpenses, never an addition to it.
  let ytdMileage = 0;
  // The same shape as ytdMileage: a SLICE of ytdTradeExpenses, never an addition to it. See
  // isHomeOfficeRow above for why it exists at all.
  let ytdHomeOfficeLogged = 0;
  // The vehicle allowance. ⚠️ NOT a slice of ytdTradeExpenses like the two above it: the cost it
  // replaces has been taken OUT of that figure. See the branch in the loop below.
  let ytdCapitalAllowances = 0;
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    if ((r.income_type ?? '').toLowerCase() === 'property') {
      if (amt > 0) ytdPropertyIncome += amt;
      else if (amt < 0) {
        // Mortgage interest is not a deductible property expense; it earns the Section 24 basic
        // rate credit instead. Everything else is an ordinary property cost. taxPosition applies it.
        if (isResidentialFinanceCost(r.category, r.vendor)) ytdPropertyFinance += -amt;
        else ytdPropertyExpenses += -amt;
      }
      continue;
    }
    if (amt > 0) ytdTradeIncome += amt;
    else if (amt < 0) {
      // A category is a fact about the row whichever way it is relieved, so it is logged for both
      // branches: a car filed under Vehicle should still count as a category he has logged.
      if (r.category) cats.add(String(r.category).toLowerCase());

      // ═══════════════════════════════════════════════════════════════════════════════════════
      // 🔴 A DRILL BOUGHT AT SCREWFIX IS FILED AS MATERIALS, AND WAYS TO SAVE THEN TOLD A MAN WITH
      // A VAN FULL OF TOOLS THAT HE HAD LOGGED NONE. Found 11 August 2026, RUN 1.
      //
      // lib/categories.ts sends the five shops a UK tradesman actually buys tools from, Screwfix,
      // Toolstation, B&Q, Wickes and TradePoint, to `materials`, and it is right to: a bank line
      // reading SCREWFIX DIRECT £280 genuinely could be either and the merchant name alone cannot
      // settle it. Guessing is what that file exists to refuse.
      //
      // But findOptimisations asks a plain string equality question, "is 'tools' in the set", and
      // gets a No it then reads out loud as "You have nothing logged this year for phone, tools."
      // The question it is actually asking is whether he has logged ANY tool spend, and
      // couldBeToolSpend is how that question gets an honest answer without the categoriser having
      // to pretend it knows.
      //
      // ⚠️ HIS OWN CATEGORY OUTRANKS THIS, BOTH WAYS. couldBeToolSpend takes the stored category
      // and obeys it, so a man who has moved a row to materials himself is not overruled by a
      // vendor name. Nothing here changes a stored category, a total, or a penny of tax: it only
      // widens what a nudge is allowed to believe it can see.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      if (couldBeToolSpend(String(r.vendor ?? ''), r.category ?? null)) cats.add('tools');

      // ═══════════════════════════════════════════════════════════════════════════════════════
      // 🔴 A CAR DOES NOT GO INTO ytdTradeExpenses AT ALL, AND THIS IS THE WHOLE FIX.
      //
      // A real 78 row Monzo export, 2 August 2026: AUDI LEEDS, £60,000, one line. It landed here
      // like a bag of screws and took the whole £60,000 off his profit in the year he bought it.
      // A £22,800 profit was reported as a £37,224 LOSS and his set aside went to zero.
      //
      // GOV.UK, claim capital allowances, business cars: "Cars do not qualify for: annual
      // investment allowance (AIA)." So the COST is removed and the ALLOWANCE replaces it: about
      // £3,600 on that Audi in year one, and lib/capital.ts capitalRelief() is the only thing in
      // the codebase that decides which rate a given car earns.
      //
      // ⚠️ THE THREE SLICE COUNTERS ARE SKIPPED ON THIS BRANCH ON PURPOSE. ytdMileage and
      // ytdHomeOfficeLogged are slices OF ytdTradeExpenses, and lib/ledger.ts subtracts them back
      // out of it. A row that is not in that figure must not be in a slice of it either, or the
      // ledger takes money off a line it was never on.
      //
      // ⚠️ 'not_a_car' AND null BOTH FALL THROUGH TO THE ORDINARY PATH, and they mean different
      // things that happen to behave identically. null is "nobody asked him"; 'not_a_car' is "he
      // told us it was a van". A van is plant and machinery, inside the AIA, and correctly comes
      // off in full. Storing his answer is worth doing even where it changes no arithmetic.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠️ THE COST LEAVES EXPENSES HERE AND THE ALLOWANCE IS WORKED OUT SOMEWHERE ELSE. It used
      // to be added up on this line, which was right for a car bought this year and produced
      // nothing at all for one bought last year, because this loop only ever sees the current tax
      // year. getCapitalAssets reads every year and the sum is below, so this branch now has one
      // job: keep the purchase price out of his running costs.
      // ⚠️ THE TEST IS isWrittenDown() IN lib/capital.ts AND IT USED TO BE SPELLED OUT HERE.
      // Written out by hand it was invisible to every screen that prints a profit, and three of
      // them printed one that disagreed with this line by £61,284. See the header on that function.
      if (isWrittenDown(r.capital_kind)) continue;

      ytdTradeExpenses += -amt;
      if (isMileageRow(r)) ytdMileage += -amt;
      // Counted here so lib/ledger.ts can take it back off. See isHomeOfficeRow above: without
      // this, a man who elects and also texts his hours has the same deduction twice.
      if (isHomeOfficeRow(r)) ytdHomeOfficeLogged += -amt;
    }
    const c = Number(r.cis_deduction);
    if (Number.isFinite(c) && c > 0) ytdCisSuffered += c;
  }
  const categoriesLogged = [...cats];

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // WHAT EVERY VEHICLE HE OWNS IS WORTH THIS YEAR.
  //
  // yearsHeld is the gap between the tax year he bought it in and the one we are in now, so a car
  // bought in year one is on its second slice this year and its third the year after. Everything
  // else about the arithmetic lives in lib/capital.ts, which is the only file allowed to know a
  // rate.
  //
  // ⚠️ 'not_a_car' PRODUCES NOTHING HERE AND THAT IS CORRECT. A van is plant and machinery, its
  // whole cost came off in the year he bought it through the ordinary expenses line, and
  // capitalRelief returns zero for it from year two. It is in the list so that the row still
  // carries what he SAID, and so that the mileage lock-in below can see it.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  ytdCapitalAllowances = sumCapitalAllowances(assets, startYear);

  // 🔴 HAS HE PUT A VEHICLE THROUGH HIS BOOKS AT ALL. GOV.UK, simplified expenses, vehicles:
  // "You cannot claim simplified expenses for a vehicle you've already claimed capital allowances
  // for, or you've included as an expense when you worked out your business profits."
  //
  // Note the second half. It is not only a car with a writing down allowance: a VAN taken in full
  // under the AIA is "included as an expense", and the flat rate is closed to that vehicle too,
  // permanently. So this is true of every capital_kind, 'not_a_car' included.
  const vehicleBoughtThroughBooks = assets.some((a) => isCapitalKind(a.capital_kind));

  // 🔴 A PARTNERSHIP SHARES ONE SET OF BOOKS, so the caller passes this man's share as
  // partnerFactor (1 for a sole trader and a director) and his slice is taken here, before any
  // tax is worked out. See the note at the call site in lib/supabase.ts getOptimiserInput.
  ytdTradeIncome *= partnerFactor;
  ytdTradeExpenses *= partnerFactor;
  ytdCisSuffered *= partnerFactor;
  // A partnership's van is the partnership's, and so is its allowance. Scaled with everything else
  // for the same reason: this man is taxed on his share, not on the whole book he can see.
  ytdCapitalAllowances *= partnerFactor;

  return {
    ytdTradeIncome,
    ytdTradeExpenses,
    ytdCisSuffered,
    ytdPropertyIncome,
    ytdPropertyExpenses,
    ytdPropertyFinance,
    ytdMileage,
    ytdHomeOfficeLogged,
    ytdCapitalAllowances,
    categoriesLogged,
    vehicleBoughtThroughBooks,
  };
}
