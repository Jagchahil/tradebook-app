import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import { verifyAccessToken, weeklyTotals, weeklyUpdateFactsFor } from '../../../lib/supabase';
import { weeklySummaryText, weeklyFigures, weeklyLine, weeklyInput } from '../../../lib/weeklyupdate';

export const runtime = 'nodejs';

// HIS WEEK, WHENEVER HE WANTS IT. The pull that replaced the Sunday push.
//
// Until 27 July 2026 this summary only existed as a paid WhatsApp template posted at everybody on a
// Sunday evening. It now lives here, and the surfaces that show it (the app, the web app, and a
// WhatsApp reply when he asks) all read this one route or the one function behind it.
//
// ⚠️ ONE RENDERER, THREE SURFACES. The text comes from lib/weeklyupdate.ts, not from this file and
// not from a component. Three renderers over one set of figures is three chances to disagree, and
// the one that disagrees is the one he believes. This codebase has been caught with two readers over
// the same money three separate times: see the headers on readBrain() and /api/ledger.
//
// EVERY FIGURE IS CONFIRMED MONEY. weeklyTotals reads confirmed, non personal rows only. Nothing
// counts towards his figures until he has ticked it, which is the same rule the ledger, the totals
// reply and the quarter pack already follow.
//
// FREE TO ASK, AND THAT IS THE POINT. A read costs us nothing, so there is no reason to ration it
// and no reason to push it. He looks when he wants to look.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('weekly', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  const totals = await weeklyTotals(user.id);

  // Best effort. Null means the RPC could not answer, and the branches that need these facts stay
  // shut, so he gets his figures and an honest quiet line rather than a guess. A missing fact is
  // never treated as a zero: "we do not know" and "it is nothing" are different sentences.
  const factsMap = await weeklyUpdateFactsFor([user.id]).catch(() => null);
  const facts = factsMap?.get(user.id);

  // ⚠️ THE SHAPING LIVES IN lib/weeklyupdate.ts, NOT HERE, for the same reason the text does. The
  // web app builds the identical input server side, and two places deciding what a missing fact
  // means is two places that can decide differently. A null is never quietly turned into a zero.
  const input = weeklyInput(totals, facts, new Date());

  return NextResponse.json({
    // The raw figures, for a surface that draws its own layout.
    ...weeklyFigures(input),
    // The one sentence about his own situation, or the honest nothing.
    line: weeklyLine(input),
    // The whole thing as words, which is what WhatsApp sends and what a plain surface can print
    // without deciding anything for itself.
    text: weeklySummaryText(input),
    // Whether the personal line had the facts it needed. The surface does not have to show this,
    // but a console or a support ticket should be able to tell "quiet week" from "could not read".
    factsAvailable: !!facts,
  });
}
