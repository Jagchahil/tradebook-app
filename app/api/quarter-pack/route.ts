import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getConfirmedTransactionsForRange, getBusinessName } from '../../../lib/supabase';
import { buildQuarterPack, quarterBounds, quarterForDate, renderQuarterPackHtml } from '../../../lib/quarterpack';

// The quarter end pack. The user calls this with their own Supabase token and
// gets back a print ready HTML document summarising a tax year quarter for their
// accountant: income and expenses by stream and category, CIS suffered, and the
// running tax picture. There is no server side PDF library by design; the
// document carries a Save as PDF button that uses the browser's own print, the
// same mechanism as the invoice pages.
//
// Scope is the caller's own account only (service role reads keyed to user.id).
// Only CONFIRMED entries are summarised. Nothing is ever submitted to HMRC.
//
// Query:
//   ?year=2026&q=1..4   an explicit tax year (opening year) and quarter
//   (both optional; defaults to the quarter that today falls in)
//   ?format=json        return the structured pack instead of the HTML document

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  // Resolve the target quarter. Default to whichever quarter today sits in.
  const today = quarterForDate(new Date());
  let startYear = today.startYear;
  let quarter: 1 | 2 | 3 | 4 = today.index;

  const yearParam = Number(sp.get('year'));
  if (Number.isInteger(yearParam) && yearParam >= 2024 && yearParam <= 2100) {
    startYear = yearParam;
  }
  const qParam = Number(sp.get('q'));
  if (qParam === 1 || qParam === 2 || qParam === 3 || qParam === 4) {
    quarter = qParam;
  }

  const bounds = quarterBounds(startYear, quarter);

  // Pull the whole tax year up to this quarter end, so the pack can show the
  // quarter itself and the year to date running position from one fetch.
  const taxYearStart = quarterBounds(startYear, 1).start;
  const [transactions, businessName] = await Promise.all([
    getConfirmedTransactionsForRange(user.id, taxYearStart, bounds.end),
    getBusinessName(user.id),
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
