import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, getConfirmedTransactionsForRange, getBusinessName } from '../../../lib/supabase';
import { buildIncomeProof, renderIncomeProofHtml } from '../../../lib/incomeproof';
import { packToken, verifyPackToken, siteBase } from '../../../lib/packtoken';

// Proof of income. A branded, print to PDF income summary from the user's own
// confirmed figures, for a mortgage broker, a landlord or a lender. Two ways in,
// the same pattern as the quarter pack:
//   1. The user's own Supabase Bearer token (the app).
//   2. A signed ?t= capability token, so the phone browser can open the document
//      and Save as PDF (a browser open cannot carry a Bearer header).
// The app gets a ?t= link by calling with ?mode=link and its Bearer.
//
// Scope is the caller's own account only. CONFIRMED entries only. Never filed.
//   ?year=2026     opening year of the tax year (optional, defaults to current)
//   ?format=json   the structured summary instead of the HTML document
//   ?mode=link     (Bearer only) return { url } a signed browser link
//   ?t=<token>     a signed capability token instead of a Bearer header

// Opening year of the tax year that d falls in (6 April boundary).
function currentTaxYear(d: Date): number {
  return d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const now = new Date();

  const capToken = sp.get('t');
  const claim = capToken ? verifyPackToken(capToken) : null;

  let userId: string;
  let year: number;

  if (claim) {
    userId = claim.userId;
    year = claim.year;
  } else {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const user = token ? await verifyAccessToken(token) : null;
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    userId = user.id;
    const q = Number(sp.get('year'));
    year = Number.isInteger(q) ? q : currentTaxYear(now);

    // The app asks for a signed browser link it can open to Save as PDF.
    if (sp.get('mode') === 'link') {
      const t = packToken({ userId, year, quarter: 1 }, now);
      if (!t) return NextResponse.json({ error: 'links unavailable' }, { status: 503 });
      return NextResponse.json({ url: `${siteBase()}/api/income-proof?t=${encodeURIComponent(t)}` });
    }
  }

  const startISO = `${year}-04-06`;
  const yearEndISO = `${year + 1}-04-05`;
  const todayISO = now.toISOString().slice(0, 10);
  const endISO = todayISO < yearEndISO ? todayISO : yearEndISO;

  const [rows, businessName] = await Promise.all([
    getConfirmedTransactionsForRange(userId, startISO, endISO),
    getBusinessName(userId),
  ]);
  const proof = buildIncomeProof(rows, businessName, year, now);

  if (sp.get('format') === 'json') {
    return NextResponse.json(proof);
  }
  return new NextResponse(renderIncomeProofHtml(proof), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
