import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';
import {
  readCustomerCostMonth,
  perMessageRegimeLive,
  SERVICE_REPLY_PENCE_INFERRED,
  MARGIN_FLOOR_PCT,
  PER_MESSAGE_PRICING_FROM,
} from '../../../../lib/messagecost';
import { costPerMessagePence, costPerAiCallPence, marginTargetPct } from '../../../../lib/margin';

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

  return NextResponse.json({
    month,
    rows,
    floorPct: MARGIN_FLOOR_PCT,
    targetPct: marginTargetPct(),
    perMessagePence: costPerMessagePence(),
    perMessageInferred: SERVICE_REPLY_PENCE_INFERRED,
    perAiCallPence: costPerAiCallPence(),
    regimeLive: perMessageRegimeLive(),
    regimeFrom: PER_MESSAGE_PRICING_FROM,
  });
}
