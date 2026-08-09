import { NextRequest, NextResponse } from 'next/server';
import { getConfirmedTransactionsForRange, getBusinessName, getBusinessProfile, capitalAllowanceForYear } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { buildIncomeProof, renderIncomeProofHtml } from '../../../lib/incomeproof';
import { packToken, verifyPackToken, siteBase } from '../../../lib/packtoken';
import { isProofYear, resolveProofYear } from '../../../lib/proofyear';

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

// WHICH YEAR THIS DOCUMENT IS ABOUT LIVES IN lib/proofyear.ts, NOT HERE.
//
// It used to be two lines in this file, and they read the parameter FIRST and repaired it
// afterwards: `Number.isInteger(Number(sp.get('year')))`. Number(null) is 0, Number.isInteger(0)
// is true, so an absent parameter passed the guard and this route printed tax year ZERO at a
// lender. The resolve, the range and the argument for both bounds are in that file, stated once,
// so this route and the test that watches it cannot hold different opinions about it.

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const now = new Date();

  // This route accepts only tokens minted FOR the proof of income: a quarter
  // pack link names a different audience and must not open this document.
  const capToken = sp.get('t');
  const claim = capToken ? verifyPackToken(capToken, 'income-proof') : null;

  let userId: string;
  let year: number;

  if (claim) {
    userId = claim.userId;
    // A SIGNATURE PROVES WE MINTED IT, NOT THAT WHAT WE MINTED WAS SANE.
    //
    // Every link the buggy build handed out for a year it was not given carries year 0 inside a
    // signed body, and lib/packtoken.ts verifies it happily: its own check is Number.isInteger,
    // which is what let zero through in the first place. Those links stay openable for the whole
    // twenty minute life of the token after this ships. So the year that comes out of a token
    // faces the SAME test as the year that comes off a query string, and one we would not accept
    // from a caller is refused here rather than printed on a lender's copy.
    //
    // REFUSED, NOT QUIETLY SWAPPED FOR THIS YEAR. The token names a year; substituting a
    // different one behind a signature would hand him a document about a period he never asked
    // for and never sees named. He taps the button again and gets a fresh, correct link, which
    // is the same twenty minute price lib/packtoken.ts already accepted for the audience field.
    if (!isProofYear(claim.year, now)) {
      return NextResponse.json({ error: 'bad_year' }, { status: 400 });
    }
    year = claim.year;
  } else {
    const user = await sessionUser(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    userId = user.id;
    // Absent, empty, junk or out of range all resolve to the current tax year. See
    // lib/proofyear.ts: the default comes off the clock first and the parameter only overwrites
    // it when it passes the range, which is the shape app/api/quarter-pack/route.ts uses.
    year = resolveProofYear(sp.get('year'), now);

    // The app asks for a signed browser link it can open to Save as PDF. The
    // token names this document as its audience, so the link opens the proof of
    // income and nothing else.
    if (sp.get('mode') === 'link') {
      // THE YEAR GOES INSIDE THE SIGNATURE, SO IT IS CHECKED ON THE WAY IN AS WELL.
      //
      // `year` came from resolveProofYear one statement ago and cannot fail this. The line is
      // here because of what a token is: signed, shareable, and beyond correction from outside
      // itself. A wrong year in a signed body is a wrong lender document that no later fix can
      // reach, so the last thing that happens before we sign is that we look. If somebody ever
      // moves the resolve, adds a second way to set `year`, or reorders this branch, this refuses
      // to mint instead of minting something permanent and wrong.
      if (!isProofYear(year, now)) {
        return NextResponse.json({ error: 'bad_year' }, { status: 400 });
      }
      const t = packToken({ userId, year, quarter: 1 }, 'income-proof', now);
      if (!t) return NextResponse.json({ error: 'links unavailable' }, { status: 503 });
      return NextResponse.json({ url: `${siteBase()}/api/income-proof?t=${encodeURIComponent(t)}` });
    }
  }

  const startISO = `${year}-04-06`;
  const yearEndISO = `${year + 1}-04-05`;
  const todayISO = now.toISOString().slice(0, 10);
  const endISO = todayISO < yearEndISO ? todayISO : yearEndISO;

  const [rows, businessName, biz] = await Promise.all([
    getConfirmedTransactionsForRange(userId, startISO, endISO),
    getBusinessName(userId),
    // The printable document and the screen must be the same document. If this route did not ask
    // who he is, a partner could print the firm's whole income from here after the page had
    // correctly shown him his share. See lib/incomeproof.ts.
    getBusinessProfile(userId).catch(() => null),
  ]);
  const capAllow = await capitalAllowanceForYear(userId, year).catch(() => 0);
  const proof = buildIncomeProof(rows, businessName, year, now, biz
    ? { type: biz.businessType, sharePercent: biz.partnershipShare }
    : null, capAllow);

  if (sp.get('format') === 'json') {
    return NextResponse.json(proof);
  }
  return new NextResponse(renderIncomeProofHtml(proof), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
  });
}
