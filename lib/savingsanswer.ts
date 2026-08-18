// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT LEKHIO HAS SAVED HIM, READ ONCE, FOR EVERY DOOR THAT ASKS. B19, 18 August 2026.
//
// 🔴 THE FINDING. isSavingsQuestion has existed since Run 2, is unit tested, reads his own rows,
// and was dispatched by app/api/whatsapp/route.ts and by NOTHING ELSE. Run 3 found this shape as
// "the gate was on one channel", B16 wrote the rule down, B18 found it for VAT, B19 found it for
// the deadline lane and again for National Insurance, student loans and property. This is the last
// money lane that still had one door, and it is the one a man asks the month he is deciding
// whether to keep paying us.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY ITS OWN FILE AND NOT lib/laneanswers.ts, ARGUED RATHER THAN ASSUMED.
//
// lib/laneanswers.ts holds three lanes in one file, and its header says exactly why: they are three
// questions about ONE read, sharing totalsForUser, getStudentLoanSettings and the same two
// decisions. That argument is the test, and this lane fails it. It reads getOptimiserInput, which
// is a different read of a different shape (the whole person, plus his capital assets across every
// year, plus his goals and his profile), and its arithmetic is lib/ledger.ts, which is a shared
// assembler with a second caller on the web already. It shares neither the read nor the engine.
//
// So it is lib/vatanswer.ts's case: its own subject, its own window, its own file, and the same
// three line shape. Putting it in laneanswers.ts would have made that file's own stated reason for
// existing untrue, which is worse than a fourth file.
//
// ⚠️ AND IT DOES NO ARITHMETIC. ledgerFor() is the one assembler, for the reason its own header
// gives: app/api/ledger/route.ts and the WhatsApp reply already drifted once over use of home, and
// the copy that drifts is always the one he is looking at. This file reads and hands over. The
// words are lib/waintents.ts, the sum is lib/ledger.ts, and neither belongs to a router.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import { headline, ledgerFor } from './ledger';
import { LANE_UNREADABLE, formatGbp, savingsAnswer } from './waintents';
import { factUpdateNote, getOptimiserInput } from './supabase';

export async function savingsAnswerForUser(userId: string): Promise<string> {
  // 🔴 TWO SHAPES OF FAILED READ AND BOTH HAVE TO REACH THE SAME SENTENCE.
  //
  // A thrown fetch lands in the catch below. A non ok HTTP response does NOT throw: it used to
  // return an empty row set that was indistinguishable from a man with nothing, and it now arrives
  // as rowsUnreadable on the object. Before 18 August 2026 neither of them was caught here at all,
  // and both came out as "Nothing confirmed yet. Add your first entry or upload a bank statement,
  // and this fills itself in." See getConfirmedTransactionsForRangeOrNull in lib/supabase.ts.
  const input = await getOptimiserInput(userId).catch(() => null);
  if (input === null) return LANE_UNREADABLE;

  // ⚠️ NOT A FAILURE, DELIBERATELY. factUpdateNote never throws and answers '' when nothing has
  // moved, so a silent note is its ordinary state and not a read we could not make. Refusing a man
  // his figure because Khoji had nothing to add would be the guard eating the answer.
  const factNote = await factUpdateNote();

  const l = ledgerFor(input);

  return savingsAnswer(
    {
      unreadable: input.rowsUnreadable === true,
      enough: l.enough,
      note: l.note,
      headline: headline(l),
      withoutLekhio: l.withoutLekhio,
      withLekhio: l.withLekhio,
      lines: l.lines.map((x) => ({ label: x.label, saved: x.saved })),
      refundDue: l.refundDue,
      factNote,
    },
    formatGbp,
  );
}
