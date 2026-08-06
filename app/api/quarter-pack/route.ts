import { NextRequest, NextResponse } from 'next/server';
import { getConfirmedTransactionsForRange, getBusinessName, getBusinessProfile, readCircumstances, refreshFactsFromDb, preFilingAssurance, capitalAllowanceForYear } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { buildQuarterPack, quarterBounds, quarterForDate, renderQuarterPackHtml } from '../../../lib/quarterpack';
import { mtdStatedFrom } from '../../../lib/circumstances';
import { packUrl, verifyPackToken } from '../../../lib/packtoken';

// The quarter end pack. Two ways in:
//   1. The user's own Supabase Bearer token (the app, or a direct authed call).
//   2. A signed ?t= capability token, so the phone browser can open the branded
//      document and Save as PDF (a browser open cannot carry a Bearer header).
// The app gets a ?t= link by calling this route with ?mode=link and its Bearer,
// which returns a short lived signed URL bound to its own account and quarter.
//
// The document is a print ready HTML page with a Save as PDF button that uses the
// browser's own print, the same mechanism as the invoice pages. There is no
// server side PDF library in this codebase, by design.
//
// Scope is the caller's own account only. Only CONFIRMED entries are summarised.
// Nothing is ever submitted to HMRC.
//
// Query:
//   ?year=2026&q=1..4   an explicit tax year (opening year) and quarter
//   (both optional; defaults to the quarter that today falls in)
//   ?format=json        return the structured pack instead of the HTML document
//   ?mode=link          (Bearer only) return { url } a signed browser link
//   ?t=<token>          a signed capability token instead of a Bearer header

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // Two auth paths. A signed ?t= token fixes the account and quarter itself; a
  // Bearer token identifies the account and reads year and q from the query.
  const capToken = sp.get('t');
  const claim = capToken ? verifyPackToken(capToken) : null;

  let userId: string;
  let startYear: number;
  let quarter: 1 | 2 | 3 | 4;

  if (claim) {
    userId = claim.userId;
    startYear = claim.year;
    quarter = claim.quarter;
  } else {
    const user = await sessionUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    userId = user.id;

    // Resolve the target quarter. Default to whichever quarter today sits in.
    const today = quarterForDate(new Date());
    startYear = today.startYear;
    quarter = today.index;
    const yearParam = Number(sp.get('year'));
    if (Number.isInteger(yearParam) && yearParam >= 2024 && yearParam <= 2100) startYear = yearParam;
    const qParam = Number(sp.get('q'));
    if (qParam === 1 || qParam === 2 || qParam === 3 || qParam === 4) quarter = qParam;

    // The app asks for a browser openable link rather than the document itself.
    if (sp.get('mode') === 'link') {
      const url = packUrl({ userId, year: startYear, quarter });
      if (!url.includes('?t=') || url.endsWith('?t=')) {
        // No signing secret configured, so no capability link can be minted.
        return NextResponse.json({ error: 'link_unavailable' }, { status: 503 });
      }
      return NextResponse.json({ url });
    }
  }

  const bounds = quarterBounds(startYear, quarter);

  // Pull the whole tax year up to this quarter end, so the pack can show the
  // quarter itself and the year to date running position from one fetch.
  const taxYearStart = quarterBounds(startYear, 1).start;
  const [transactions, businessName, biz, circ] = await Promise.all([
    getConfirmedTransactionsForRange(userId, taxYearStart, bounds.end),
    getBusinessName(userId),
    // 🔴 WHO HE IS, so the document stops telling a director that his company's turnover puts him
    // over the Making Tax Digital for Income Tax threshold and that he owes Class 4 National
    // Insurance on his company's profit. The rule itself lives in lib/quarterpack.ts, never here: a
    // route that decided what a limited company means would be a second copy of it, and the copy
    // that drifts is always the one nobody is looking at.
    //
    // ⚠️ A FAILED READ IS NOT AN ANSWER. It comes back null, the pack treats null as unknown, and
    // unknown gets exactly the document it got before this line existed. Withholding a real
    // obligation from a sole trader because a profile read timed out is the worse failure by far.
    getBusinessProfile(userId).catch(() => null),
    // 🔴 AND WHETHER HMRC HAS WRITTEN TO HIM ABOUT MAKING TAX DIGITAL, which is the fact this
    // document cannot derive from a single figure it holds. HMRC decides mandation from a return
    // already filed, so his own answer is the only evidence there is. See mtdPosition() in
    // lib/taxengine.ts.
    //
    // ⚠️ A FAILED READ IS UNKNOWN, NOT A NO, for the same reason the profile read above is. null
    // reaches mtdPosition() and the document says plainly that it has not been told, which is
    // true. Reading a timeout as "he is not mandated" would print a false all clear on a document
    // an accountant relies on.
    readCircumstances(userId).catch(() => null),
  ]);
  const circAnswers = Object.fromEntries((circ ?? []).map((a) => [a.key, a.answer]));

  // If the fetch hit its 20000-row cap the summary may be short, so flag it and
  // the document shows a warning rather than passing an accountant a partial pack.
  const truncated = transactions.length >= 20000;
  // The pre-filing sweep: refresh the live facts so the year-end document computes on the very latest
  // approved figures, then compose the one-line assurance that says we just did (naming any overrides).
  await refreshFactsFromDb();
  const finalCheck = await preFilingAssurance();
  const capAllow = await capitalAllowanceForYear(userId, startYear).catch(() => 0);
  const pack = buildQuarterPack({
    transactions, startYear, quarter, businessName, truncated, finalCheck,
    structure: biz?.businessType ?? null,
    mtdStated: mtdStatedFrom(circAnswers),
    capitalAllowance: capAllow,
  });

  if (sp.get('format') === 'json') {
    return NextResponse.json(pack);
  }

  const html = renderQuarterPackHtml(pack);
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A private financial document: never cached by shared caches, never indexed.
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
