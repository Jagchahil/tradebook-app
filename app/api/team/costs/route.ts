import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember, readWaOutMonth } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import {
  readCustomerCostMonth,
  perMessageRegimeLive,
  SERVICE_REPLY_PENCE_INFERRED,
  MARGIN_FLOOR_PCT,
  PER_MESSAGE_PRICING_FROM,
} from '../../../../lib/messagecost';
import {
  costPerMessagePence,
  costPerAiCallPence,
  marginTargetPct,
  preferObserved,
  usageForMargin,
  whatsappSpendPence,
  marginForUsage,
} from '../../../../lib/margin';

export const runtime = 'nodejs';

// Cost per customer, BY NAME, for the Numbers desk. The founder's settled policy: this number must
// be on /team before a Meta invoice says it in aggregate, the floor is 80 percent, and the answer
// to a heavy user is routing, never a cap on the customer.
//
// Team gated exactly like every team route: a Bearer from the console's own sign in, then the
// team_members row. What crosses this boundary is governed by COST_ROW_FIELDS in
// lib/messagecost.ts, the same allowlist discipline as CUSTOMER_COLUMNS: never a phone number,
// never a customer's own figures. A cost WE spent on him is OUR figure and is all this returns.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const month = new Date().toISOString().slice(0, 7);
  const rows = await readCustomerCostMonth(month);

  // WE COULD NOT READ. Not "nobody costs anything". The same rule as the metrics route: a cost
  // page that draws a confident zero because the database did not answer is a page that teaches
  // the team to stop looking in the one month it matters.
  if (rows === null) return NextResponse.json({ error: 'unreadable' }, { status: 503 });

  // OBSERVED AGAINST MODELLED (31 July 2026). Every send Meta accepts is now recorded in
  // public.wa_out, so when the month has rows the margin here is a measurement: the counted
  // freeform and template sends, priced by lib/margin.ts. When the table is empty or unreadable
  // (the founder pastes the SQL by hand, so it may not exist yet) the rows keep their modelled
  // figures, one reply per inbound, and say so. The count added to each row is OUR spend on him,
  // the same privacy posture as every other figure that crosses this boundary.
  const waOut = await readWaOutMonth(month);
  const observed = preferObserved(waOut?.total ?? null);
  const now = new Date();
  const octDate = new Date(`${PER_MESSAGE_PRICING_FROM}T12:00:00Z`);
  const shaped = rows.map((r) => {
    if (!observed || !waOut) return { ...r, sendsObserved: null };
    const counts = waOut.byUser[r.id] ?? { freeform: 0, template: 0 };
    const { usage } = usageForMargin(counts, r.inboundMessages, r.aiCalls);
    return {
      ...r,
      sendsObserved: counts.freeform + counts.template,
      messagePenceNow: whatsappSpendPence(usage, now),
      messagePenceFromOct: whatsappSpendPence(usage, octDate),
      marginNowPct: marginForUsage(usage, now),
      marginFromOctPct: marginForUsage(usage, octDate),
    };
  });
  // Keep the promise of the surface, heaviest first, under whichever mode produced the figures.
  if (observed) shaped.sort((a, b) => a.marginFromOctPct - b.marginFromOctPct || b.aiPence - a.aiPence);

  return NextResponse.json({
    month,
    rows: shaped,
    observed,
    floorPct: MARGIN_FLOOR_PCT,
    targetPct: marginTargetPct(),
    perMessagePence: costPerMessagePence(),
    perMessageInferred: SERVICE_REPLY_PENCE_INFERRED,
    perAiCallPence: costPerAiCallPence(),
    regimeLive: perMessageRegimeLive(),
    regimeFrom: PER_MESSAGE_PRICING_FROM,
  });
}
