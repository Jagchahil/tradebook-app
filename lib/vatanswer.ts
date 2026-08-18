// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHERE HE STANDS AGAINST THE VAT LINE, READ ONCE, FOR EVERY DOOR THAT ASKS. B18, 17 August 2026.
//
// 🔴 THE FINDING, WITH A PRODUCTION TRANSCRIPT BEHIND IT.
//
// isVatQuestion has existed since Run 2 and was dispatched by app/api/whatsapp/route.ts and by
// nothing else. So a VAT question typed into the web chat or into the in app accountant was
// answered by the MODEL. Asked "am in glasgow, is vat different up here" on 17 August, signed in as
// a sole trader with 77 confirmed entries, the web chat returned the statute, correctly, and never
// once mentioned his own turnover. The same question on WhatsApp reads his real rolling twelve
// months and opens with his figure and his headroom.
//
// That is the shape this codebase keeps finding: a lane built, proved, and wired to one channel out
// of three. Run 3 found it as "the gate was on one channel". B16 found it again five days ago and
// wrote the rule down: whenever you wire a lane, wire three and say three.
//
// ⚠️ SO THE READ LIVES HERE RATHER THAN IN THREE ROUTERS. Not for tidiness. The window, the
// exclusion of exempt rent, the registered flag and the honest refusal on a failed read are four
// decisions, and three copies of four decisions is how this product once shipped three different
// answers to one statutory question in one evening. lib/vatstanding.ts owns the arithmetic and the
// words; this file owns the reading; the routers own neither.
//
// ⚠️ WHY IT IS NOT IN lib/vatstanding.ts. That file is import free on purpose so the node test
// runner can drive the arithmetic directly with no bundler. This one touches lib/supabase.ts, so it
// has to be the other side of that line.
//
// ⚠️ THE WINDOW IS OPENED WIDE AND CLOSED BY THE ARITHMETIC. 400 days of rows are fetched and
// vatStanding decides what is inside twelve months. A query that is clever about the boundary is a
// second owner of the boundary, and there is exactly one.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { getConfirmedTransactionsForRangeOrNull, readVatProfile } from './supabase';
import { VAT_REGISTRATION_THRESHOLD } from './vat';
import { vatStanding, vatAnswer, VAT_UNREADABLE } from './vatstanding';
import { formatGbp, namesNation } from './waintents';

// Twelve months back plus a margin, so the window is closed by vatStanding rather than by the
// query being clever.
const LOOKBACK_DAYS = 400;

/**
 * The whole VAT answer for one customer, from his own confirmed rows.
 *
 * Always returns a sentence. A read that fails returns VAT_UNREADABLE, never a figure and never a
 * reassurance: the one answer that must not be given to a man near the line is a comfortable
 * sounding guess.
 *
 * ⚠️ THE MESSAGE COMES IN AS WELL AS THE ACCOUNT, AND ONLY FOR THE YES OR NO. B20, 17 August 2026.
 * A customer who names a nation asked whether VAT is different where he lives, and he is owed that
 * answer in the first breath rather than left to infer it from a figure. Nothing else in here reads
 * his words: the arithmetic is his rows and only his rows.
 *
 * @param body his message, used ONLY to decide whether he asked a nation question.
 */
export async function vatAnswerForUser(userId: string, body = ''): Promise<string> {
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const fromISO = new Date(today.getTime() - LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);

  const [rows, vatProfile] = await Promise.all([
    // 🔴 THE REFUSAL BELOW WAS HALF BLIND UNTIL 18 AUGUST 2026, AND B18 WROTE IT CORRECTLY.
    // This read `getConfirmedTransactionsForRange(...).catch(() => null)`. The catch is right and
    // the reader was not: a non ok HTTP response does not throw, it returned `[]`, so `rows` was
    // never null for a 401, a 500 or a 503 and VAT_UNREADABLE could only fire for a thrown fetch.
    // Measured before it was changed, on an empty row set: vatStanding returns `{ kind: 'nothing' }`
    // and a man whose read had just failed was told "I have nothing confirmed from you yet, so I
    // cannot tell you where you stand". It stops short of a false money figure, which is the honest
    // half, and it is still a settled false statement about his records. The catch STAYS: a thrown
    // fetch is still a failed read and still has to reach the same sentence.
    getConfirmedTransactionsForRangeOrNull(userId, fromISO, todayISO).catch(() => null),
    readVatProfile(userId).catch(() => null),
  ]);

  // 🔴 THE ROWS FAILING IS NOT THE SAME AS THE PROFILE FAILING. Without the rows there is no
  // figure and no honest answer. Without the profile we only lose the "already registered" short
  // cut, and the threshold answer below it is still true and still his, so a null profile falls
  // through as not registered rather than refusing a man an answer he can act on.
  if (rows === null) return VAT_UNREADABLE;

  const standing = vatStanding(
    rows,
    todayISO,
    VAT_REGISTRATION_THRESHOLD,
    vatProfile !== null && vatProfile.registered,
  );

  return vatAnswer(standing, formatGbp, { nationAsked: namesNation(body) });
}
