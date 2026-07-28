// lib/money.ts. ONE WAY TO WRITE A POUND.
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

// WHOLE POUNDS. What almost every conversational surface uses: the ledger, the weekly summary, the
// agent's signals, the WhatsApp replies. Nobody wants "£1,204.00" in a sentence.
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
