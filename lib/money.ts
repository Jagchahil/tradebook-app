// lib/money.ts. THE POUND, AND THE EIGHT COPIES OF IT THAT ARE CHECKED AGAINST IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS FILE USED TO OPEN "ONE WAY TO WRITE A POUND" AND IT WAS NOT TRUE. B41, 19 August 2026.
//
// A doctrine comment that describes an intention rather than the code is how B26 stayed invisible
// for three weeks, and this line was one. Measured at head: EIGHT formatters live outside this
// file, in six other modules, and B41 was sized on a belief that there were two. THREE OF THE
// EIGHT WERE WRONG IN THE EXACT WAY THIS FILE WAS WRITTEN ON 28 JULY TO STOP, the sign inside the
// pound: lib/quarterpack.ts printed a loss making quarter as "£-1,200.00" on a document a man
// hands a lender, lib/invoicepdf.ts printed a credit note as "£-120.00" on a PDF going out under
// our user's own business name, and lib/payyourself.ts printed a cliff as "£-40". A fourth kind
// was worse and quieter: the three copies in lib/waintents.ts had no non number guard, so a figure
// that failed to compute reached a WhatsApp reply as "£NaN".
//
// THE EIGHT, AND THE ONE REASON THEY ARE COPIES RATHER THAN IMPORTS.
//
//   lib/waintents.ts    formatGbp = gbpAbs2, gbpShort = gbpAbs0, gbpOwed = gbpOwed
//   lib/quarterpack.ts  gbp = gbp2
//   lib/invoicepdf.ts   gbp = gbp2
//   lib/incomeproof.ts  gbp = gbp2
//   lib/trialnudge.ts   gbp = gbp0
//   lib/payyourself.ts  money = gbp0
//
// Every one of those modules is STAGED BY A SUITE with a hand written dependency list so the node
// runner can drive it with no bundler, and test/capitalwiring.test.mjs pins lib/quarterpack.ts's
// list at exactly two relative imports. Importing this file into them would rewrite six staging
// blocks to delete duplicates that now behave identically. That is the trade, and the honest half
// of it is test/moneyone.test.mjs: it lifts each copy's BODY out of its own source and runs it
// against the real function here over a table with a negative, a zero, a fraction, a thousands
// boundary and a NaN. A reformat cannot fool it and a comment cannot satisfy it. It proves it can
// see a difference before it reports there is none.
//
// ⚠️ SO THE RULE FOR THE NEXT SESSION IS: A NINTH COPY IS ALLOWED, AND HIDING IT IS NOT. Add it to
// the list in test/moneyone.test.mjs and to the list above, or delete it and import from here.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS, AND IT IS THE SAME REASON ledgerFor() EXISTS.
//
// On 28 July 2026 a sweep of every customer facing sentence found SEVENTEEN separate money
// formatters in lib/. Not one of them was wrong on its own. Together they were seventeen chances
// to write the same pound two different ways, and nine of them could print "£-33", which is a
// spreadsheet cell rather than a sentence a person would write.
//
// The pattern is the one this codebase keeps relearning: two readers over one number will drift,
// and the one that drifts is the one he believes. It was the ledger and the WhatsApp reply this
// morning. It is the money formatters this afternoon.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THE SIGN GOES OUTSIDE THE POUND, AND THAT IS NOT A STYLE PREFERENCE.
//
// "£-33" is how a machine prints a negative. "-£33" is how a person writes one, and it is the UK
// convention. On a screen whose entire job is to be believed, a number that looks like it came
// out of a debugger costs us more than the number is worth.
//
// PURE. No I/O, no clock, no rates. Rates live in lib/taxengine.ts with asPence and asPercent
// beside them, for the same reason: formatting belongs next to the thing being formatted.

// A non number is £0 and never "£NaN". A man whose figure failed to compute should see a zero and
// a quiet screen, not evidence that something broke.
function safe(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

// WHOLE POUNDS. The ledger panel, the weekly summary, most of the agent's signals, and every
// statutory figure: a threshold, an allowance, a band. Nobody wants "£1,204.00" in a sentence, and
// the law does not write £1,000 as £1,000.00.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS COMMENT USED TO NAME "THE WHATSAPP REPLIES" AS A gbp0 SURFACE. B26, 18 August 2026.
//
// They never were. lib/waintents.ts carries its own formatGbp, which is gbpAbs2 by another name,
// and B18 (VAT) and B19 (savings, and the three lanes) each deliberately standardised a lane on
// two places. So the chat has printed pence since long before this line was written, and the line
// was a description of an intention rather than of the code.
//
// ⚠️ THE RULE, DECIDED BY JAG AND APPLIED BY B26: THE COSTUME BELONGS TO THE FIGURE, NOT THE DOOR.
// One figure, one costume, wherever it is printed. The Self Assessment bill is the figure this was
// found on: the chat said "£10,492.00" and the Tax page hero said "£10,492" under a sentence
// promising they were the same figure. Both heroes and the 08:00 alert now say £10,492.00 too.
//
// Nobody is misled by pence. People are misled by one product quoting one number two ways.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function gbp0(n: number): string {
  const v = safe(n);
  // Math.round(-0.4) is -0, and String(-0) is "0", but toLocaleString on some inputs is not so
  // forgiving. Normalise it away rather than rely on that.
  const r = Math.round(v) || 0;
  const abs = Math.abs(r).toLocaleString('en-GB');
  return r < 0 ? `-£${abs}` : `£${abs}`;
}

// TO THE PENNY. Documents rather than conversation: the quarter pack, an invoice, proof of income.
// A figure a man hands to a lender or an accountant shows its pence.
export function gbp2(n: number): string {
  const v = safe(n);
  const abs = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-£${abs}` : `£${abs}`;
}

// THE MAGNITUDE ONLY, for the places that word the sign themselves.
//
// ⚠️ USE THIS ONLY WHERE THE SENTENCE CARRIES THE DIRECTION. lib/weeklyupdate.ts says "that is £140
// more out than in" rather than "that leaves -£140", which is better English and clearer to a man
// on a roof. That wording is only honest because the sentence says "out". Reaching for these to
// make a loss look like a gain is the one thing they must never be used for.
export function gbpAbs0(n: number): string {
  return `£${Math.round(Math.abs(safe(n))).toLocaleString('en-GB')}`;
}

export function gbpAbs2(n: number): string {
  return `£${Math.abs(safe(n)).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A DEMAND FOR PAYMENT. WHOLE POUNDS WHEN THE FIGURE IS WHOLE, PENCE WHEN THERE ARE PENCE.
//
// The third family, and the only one with a customer of the customer on the other end of it. It
// was argued and built on 1 August 2026 inside app/app/invoices/words.ts as a private owedFigure,
// and the argument is this: before VAT a total was whatever the tradesman typed, whole pounds
// nearly every time, so rounding was invisible. VAT makes pence ordinary. £127 of work at the
// standard rate is £152.40, and a message saying "invoice INV-0004 for £152" against a document
// that reads £152.40 invites a payment 40p short, which leaves the invoice unpaid, the list
// calling it late, and a man chasing his own customer over our rounding.
//
// 🔴 IT LIVES HERE RATHER THAN THERE BECAUSE ONE OF THE TWO CHASERS NEVER GOT IT. B39's tail,
// 19 August 2026. words.ts's own comment claimed "the two voices stay identical on every figure
// the WhatsApp chaser has ever met", and the parity test proved it at £450 only, which is the one
// figure where the bug cannot show. lib/waintents.ts chaseMessage was still printing gbpShort, so
// the SAME invoice a man chased from the web for £152.40 he chased from WhatsApp for £152.
// ═══════════════════════════════════════════════════════════════════════════════════════════
export function gbpOwed(n: number): string {
  const v = safe(n);
  return Math.round(v * 100) % 100 === 0 ? gbp0(v) : gbp2(v);
}
