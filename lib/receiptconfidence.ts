// HOW SURE THE MACHINE IS THAT IT READ THE TOTAL RIGHT, AND THE ONE PLACE THAT DECIDES WHAT
// THAT MEANS.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A FADED RECEIPT WAS READ AS £110.55. THE PAPER SAYS £118.55. RUN 2, 12 August 2026.
//
// The reading was wrong by £8, which is nothing. What was wrong by more than £8 is that NOTHING
// ANYWHERE KNEW IT MIGHT BE. parseReceipt returned a number, and a number off a creased, sun
// bleached till roll came back through the same field, in the same shape, with the same silence,
// as a number off a crisp printed invoice. Every surface downstream then treated the two
// identically, because there was nothing to treat differently.
//
// R2-F3 fixed the half of this that was about CONSENT: a machine read amount no longer rides a
// press about somebody else's bank row, because the source class is part of the pile's group key.
// That stops the wrong reading being confirmed by accident. It does not stop the reading being
// wrong, and the report said so twice, in the same words, because it was the most important thing
// not done.
//
// This file is the other half. The model is now asked a question it can actually answer, about
// what it could SEE, and the answer travels.
//
// ⚠️ IT IS A PERCEPTUAL QUESTION, NOT A PROBABILITY, AND THAT IS THE WHOLE DESIGN. Asking a model
// "how confident are you, 0 to 1" produces a number that looks like calibration and is not: it
// clusters at 0.9 and moves for the wrong reasons. Asking "was every digit of the total crisply
// legible, or could any of them be read more than one way" is a question about the IMAGE, which is
// in front of it, and the answer is checkable by a human holding the same photograph.
//
// ⚠️ UNDEFINED MEANS WE NEVER ASKED, AND IT IS NOT THE SAME AS "CLEAR". Every row written before
// today, and every reading rescued out of a truncated reply, comes back with nothing here. Those
// must behave exactly as they always have, because retro-flagging a year of already confirmed
// receipts would ask a florist to re-check three hundred rows to no purpose. So ONLY AN EXPLICIT
// 'unsure' CHANGES ANYTHING. The signal can add caution and can never remove it, which is the only
// direction a new signal is allowed to move a book that people have already agreed to.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// What the model is allowed to say. Two values, because a scale invites a threshold and a
// threshold invites somebody moving it by 0.05 on a Friday.
export type AmountConfidence = 'clear' | 'unsure';

// ⚠️ THE COLUMN ALREADY EXISTED AND NOTHING HAD EVER WRITTEN TO IT. public.transactions has carried
// `confidence_score numeric` since the schema was first written, and NewTransaction has carried the
// optional field. Grep the repo before this file existed and the column is declared in two places
// and read in none. So this needs no migration: the shelf was built and left empty.
//
// The two values are 1 and 0.5 rather than 1 and 0 so that "we read it and were unsure" stays
// visibly different from any future "we could not read it at all", which is a third state this
// product may one day need and must not have to renumber for.
export const CONFIDENCE_CLEAR = 1;
export const CONFIDENCE_UNSURE = 0.5;

/** The score to store for a reading, or null when the model was never asked. */
export function scoreFor(confidence: AmountConfidence | null | undefined): number | null {
  if (confidence === 'clear') return CONFIDENCE_CLEAR;
  if (confidence === 'unsure') return CONFIDENCE_UNSURE;
  return null;
}

/**
 * Whether this row's AMOUNT should be treated as a reading somebody needs to look at.
 *
 * ⚠️ NULL AND UNDEFINED ARE FALSE, ON PURPOSE, AND THIS IS THE LINE THE WHOLE FILE TURNS ON. They
 * mean "not asked", which is every row in every book written before today. Treating them as
 * uncertain would flag a year of settled receipts, and a screen that asks a man to check three
 * hundred things he already checked is a screen he closes.
 *
 * ⚠️ AND ANYTHING BELOW CLEAR COUNTS, NOT JUST THE ONE KNOWN VALUE. If a future reading writes 0
 * for "could not read at all", it is at least as uncertain as 0.5 and must not fall through this
 * guard by not being equal to it.
 */
export function isUncertainAmount(score: number | null | undefined): boolean {
  if (score === null || score === undefined) return false;
  if (!Number.isFinite(score)) return false;
  return score < CONFIDENCE_CLEAR;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT HE IS TOLD, AND WHAT HE IS NOT TOLD.
//
// ⚠️ WE DO NOT SAY "WE MIGHT HAVE GOT THIS WRONG" AND LEAVE IT THERE. A warning with no action in
// it is anxiety, and doc 103's honesty test kills it: the point of saying so is that he looks at
// the one number that matters, on paper he still has in his van, and presses. So the sentence names
// the FIGURE and asks for one thing.
//
// ⚠️ AND IT NEVER BLAMES THE PHOTOGRAPH. "A clearer photograph usually does it" was the sentence
// this product told a florist twice about a perfectly printed till roll on 12 August, when the
// fault was our own token ceiling. Some receipts are faded because they are receipts. That is not
// something she did.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** The line on a single uncertain row. `amount` is already formatted, for example "£110.55". */
export function uncertainAmountLine(amount: string): string {
  return `The paper was hard to read, so ${amount} is our best reading of the total rather than a `
    + 'certainty. Worth a look at the receipt before you file it.';
}

/** The heading for the section that holds them, when there is more than one. */
export const UNCERTAIN_SECTION_TITLE = 'Worth checking the figure';

export const UNCERTAIN_SECTION_NOTE =
  'We read these off paper that was faded, creased or cut off, so the totals are our best reading '
  + 'rather than something we are sure of. They are kept on their own so a yes here is a yes about '
  + 'these amounts and nothing else.';
