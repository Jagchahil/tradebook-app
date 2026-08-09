// lib/proofyear.ts. Which tax year a proof of income document covers, decided in ONE place.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE GUARD THAT LET ZERO THROUGH, AND THE DOCUMENT A LENDER WAS HANDED.
//
// app/api/income-proof/route.ts used to read the year like this:
//
//     const q = Number(sp.get('year'));
//     year = Number.isInteger(q) ? q : currentTaxYear(now);
//
// searchParams.get() returns null when the parameter is ABSENT. Number(null) is 0.
// Number.isInteger(0) is true. So the guard PASSED, the documented default never ran, and the
// year became ZERO. Observed on production, signed in, at /api/income-proof with no query
// string at all, on an account holding 33000 of income and 8000 of expenses in 2026/27:
//
//     heading  "tax year 0-01 (NaN Invalid Date NaN to NaN Invalid Date NaN)"
//     Gross income £0.00, Allowable expenses £0.00, Net profit MINUS £832.50
//     Estimated Income Tax £0.00
//     footer   "guidance based on the published 0-01 rates"
//
// with a Save as PDF button on it. `?year=` empty does exactly the same, because Number('') is
// 0 as well. The MINUS £832.50 is the second effect and worth naming: the capital allowance is
// deliberately not scoped to the tax year, so it came back in full for year zero while income
// and expenses correctly came back empty, and the document then subtracted a real allowance
// from nothing at all.
//
// AND THE SAME VARIABLE MINTED THE SIGNED LINK. The ?mode=link branch puts `year` inside the
// signed body of a pack token, so a link asked for without a year carried year 0 INSIDE THE
// SIGNATURE. That is a correctly signed, shareable lender document that is garbage and that
// nothing outside the token can argue with. So the resolve happens HERE, before anything is
// signed, and the route also tests the year it reads back OUT of a token.
//
// Number.isInteger IS NOT A GUARD. IT IS A TYPE TEST. The RANGE is the guard. The two places
// that got this right both have one: app/app/proof-of-income/page.tsx bounds its ?y= at 2015
// and this tax year, and app/api/quarter-pack/route.ts defaults from the clock FIRST and only
// then applies a param that passes 2024 to 2100.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Opening year of the tax year that d falls in (6 April boundary). A date fact, not a rule that
// can drift. app/app/proof-of-income/page.tsx carries the same two lines for its own screen.
export function currentTaxYear(d: Date): number {
  return d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

// THE FLOOR, AND WHY IT IS THIS NUMBER.
//
// 2015 is the floor app/app/proof-of-income/page.tsx already applies to its own ?y=, and the
// screen and the printed document are ONE document: a year the screen will draw and this route
// will not print means a man reads one set of figures on his phone while his lender is handed
// another. Matching the screen is the whole reason to pick a number rather than invent one.
//
// It is comfortably older than anything these books can hold, so it never refuses a real year.
// What it refuses is nonsense: 0, 1, 1970, a timestamp somebody pasted into the wrong box.
export const PROOF_YEAR_MIN = 2015;

// THE CEILING IS THE CURRENT TAX YEAR, AND IT IS NOT NEGOTIABLE ON THIS DOCUMENT.
//
// A tax year that has not started is not a year anybody can prove income for. Accept 2035 here
// and the document heads itself with a period years away, totals his takings at zero, and goes
// to a lender looking exactly as authoritative as the true one. That is the same wrong document
// this file exists to stop, wearing a different number.
//
// The quarter pack allows up to 2100 and that is right THERE: it is his own working pack, a
// loose ceiling only has to catch a typo. A sheet that leaves the building cannot afford loose.
export function isProofYear(year: unknown, now: Date): boolean {
  return typeof year === 'number'
    && Number.isInteger(year)
    && year >= PROOF_YEAR_MIN
    && year <= currentTaxYear(now);
}

// Resolve the ?year= parameter. THE DEFAULT COMES OFF THE CLOCK FIRST, exactly as
// app/api/quarter-pack/route.ts does it, and the parameter only ever overwrites that default
// when it is a year we would print. Absent, empty, junk, fractional, out of range and hostile
// all land on the same answer: this tax year, which is what the route has always documented.
//
// Note the ORDER. Reading the parameter first and repairing it afterwards is how the original
// was written, and it is one missed case away from the same bug. Nothing here can leave `year`
// unset, so there is no state in which a caller has to remember to check it.
export function resolveProofYear(raw: string | null | undefined, now: Date): number {
  const fallback = currentTaxYear(now);
  const asked = Number(raw);
  return isProofYear(asked, now) ? asked : fallback;
}
