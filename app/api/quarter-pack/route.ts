import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getConfirmedTransactionsForRange, getBusinessName } from '../../../lib/supabase';
import { buildQuarterPack, quarterBounds, quarterForDate, renderQuarterPackHtml } from '../../../lib/quarterpack';
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
    const auth = req.headers.get('authorization') || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = bearer ? await verifyAccessToken(bearer) : null;
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
  const [transactions, businessName] = await Promise.all([
    getConfirmedTransactionsForRange(userId, taxYearStart, bounds.end),
    getBusinessName(userId),
  ]);

  const pack = buildQuarterPack({ transactions, startYear, quarter, businessName });

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
