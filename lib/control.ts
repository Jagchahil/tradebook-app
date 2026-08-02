// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONTROL DOCTRINE, IN WORDS, IN ONE PLACE.
//
// Jag, 2 August 2026: "part of our philosophy is giving your employee the control that has been
// taken away from you by connecting the bank." That is the product's whole shape, and until now it
// was a shape without a sentence: the app BEHAVED this way on every screen and never once said so.
// A man cannot value a thing nobody told him he had.
//
// 🔴 WHAT THE CONTROL ACTUALLY IS, AND WHERE IT STOPS. Both halves belong together and neither is
// safe on its own.
//
//   HIS COSTS ARE HIS.  Nobody is made to claim a deduction. A man who would rather leave a cost
//                       off his return may leave it off, and the only consequence is that he pays
//                       MORE tax. There is nothing to police and nothing to warn him about.
//
//   HIS INCOME IS NOT.  What he was paid is what HMRC checks. Leaving some of it out is not a
//                       tidiness decision, it is an inaccurate return with his name on it, and
//                       Finance Act 2026 Sch 22 now reaches the people who help bring one about.
//                       app/app/money/add already calls understating income "the one direction of
//                       error this product must never make easy". This file says it to HIM.
//
// ⚠️ THE TWO SENTENCES SHIP TOGETHER, ALWAYS. "You decide what goes in" on its own, on a screen
// about a bank statement, reads as an offer to leave a few payments out. It is not one, and a
// product that leaves the reader to work that out for himself has chosen to be misunderstood.
// controlCopy() returns them as one block for exactly that reason.
//
// ⚠️ AND IT IS COPY, NOT A RULE. Nothing here gates anything. The rules live in SQL (confirm_pile
// refuses a credit, confirm_income takes two categories and no others) and in the routes. This
// file exists so that four screens saying the same thing cannot end up saying four things.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const CONTROL_TITLE = 'Nothing lands in your figures until you say so';

// Why the product is built the way it is, in the shape of the thing he already resents.
export const CONTROL_WHY =
  'A bank connection works the other way round. Every payment goes into your books the moment it '
  + 'leaves your account, and your evening goes on taking things back out. Here you hand over the '
  + 'statement and every line waits for you. Keep it, drop it, or leave it for another day.';

// His costs. Plain, and with the consequence stated so it cannot be read as a wink.
// 🔴 NOT EXPORTED, AND THAT IS THE ENFORCEMENT RATHER THAN A COMMENT ASKING NICELY.
// The costs sentence on its own, on a screen about a bank statement, reads as an offer to leave a
// few payments out. A rule written in a comment is a rule somebody follows until the afternoon
// they are in a hurry. So the only ways to reach these two strings are controlCopy() and
// controlChoice(), and both of them hand over the pair.
const CONTROL_COSTS =
  'What you claim is yours to decide. If you would rather not put a cost through, leave it out. '
  + 'Nobody is made to claim a deduction, and leaving one out only ever means you pay more tax.';

// 🔴 His income. The boundary, said once, plainly, without a lecture attached.
const CONTROL_INCOME =
  'Money coming in is different, and we would rather say so now than have you find out later. '
  + 'What you were paid is the part HMRC checks. So: every cost is yours to keep or drop, and '
  + 'every payment in gets counted.';

export interface ControlCopy {
  title: string;
  why: string;
  costs: string;
  income: string;
}

// The whole block, for a screen that is ABOUT how his money gets in: the CSV upload, where he is
// holding the thing a bank connection would have taken off him.
export function controlCopy(): ControlCopy {
  return { title: CONTROL_TITLE, why: CONTROL_WHY, costs: CONTROL_COSTS, income: CONTROL_INCOME };
}

// The two sentences that draw the line, without the bank connection framing around them. For a
// screen where he is already typing an entry: the title and the why belong to the upload page,
// but which way each kind of money cuts belongs anywhere he is putting a figure in by hand.
//
// ⚠️ IT RETURNS BOTH OR IT RETURNS NOTHING, which is the whole reason it exists as a function
// rather than as two exported strings a caller could pick one of.
export function controlChoice(): { costs: string; income: string } {
  return { costs: CONTROL_COSTS, income: CONTROL_INCOME };
}
