import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken,
  readTeamMember,
  readTeamCustomers,
  listCronRuns,
  readKnowledgeState,
} from '../../../../lib/supabase';
import { isTeam, overview } from '../../../../lib/team';
import { cronAlarms } from '../../../../lib/cronwatch';
import { knowledgeAlarms, knowledgeStatus } from '../../../../lib/knowledgewatch';

export const runtime = 'nodejs';

// Everything the team dashboard knows.
//
// ⚠️ WHAT THIS ROUTE MAY NEVER RETURN: a customer's transactions, his income, his expenses, his tax
// bill, or his phone number. The app promises him "only you can see them" and that stays true. The
// allowlist is CUSTOMER_COLUMNS in lib/team.ts, the SQL select is built from it, and
// test/team.test.mjs fails the build if a financial column is ever added.
//
// AUTHORISATION IS CHECKED AGAINST THE DATABASE ON EVERY SINGLE REQUEST.
//
// Not from a claim in the JWT, not from a cached role, not from an env var full of email addresses.
// A row in team_members, read fresh, every time. So removing somebody from the team is a DELETE and
// it takes effect on their very next click, rather than whenever their token happens to expire.
// When you take a man's keys away you want them gone now, not in an hour.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) {
    // The same answer for "you are not on the team" and "you were removed". We do not tell a
    // stranger which one he is.
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const [customers, runs, brain] = await Promise.all([
    readTeamCustomers(),
    listCronRuns(),
    readKnowledgeState(),
  ]);

  if (customers === null) {
    // We could not read. That is not "you have no customers", and we will not draw a dashboard of
    // zeroes and let somebody believe it. The house failure mode is a green light with nothing
    // behind it, and a business dashboard showing a confident, wrong zero is the worst version of it.
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  const alarms = runs ? cronAlarms(runs) : [];
  const brainAlarms = brain ? knowledgeAlarms(brain) : [];

  return NextResponse.json({
    me: { email: member!.email, name: member!.name, role: member!.role },
    overview: overview(customers),
    customers,
    health: {
      crons: runs === null ? 'unknown' : alarms.length === 0 ? 'ok' : 'stale',
      cronAlarms: alarms,
      // The brain (docs/105). The team sees whether Lekhio's tax knowledge currently agrees with
      // GOV.UK, because if it does not, every figure in the product is wrong and that is the most
      // important fact in the company today.
      knowledge: brain === null ? 'unknown' : knowledgeStatus(brainAlarms),
      knowledgeAlarms: brainAlarms,
      brain: brain ?? null,
    },
  });
}
