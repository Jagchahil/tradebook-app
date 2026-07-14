import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readTeamMember, reviewKnowledgeItem } from '../../../../lib/supabase';
import { isTeam } from '../../../../lib/team';

export const runtime = 'nodejs';

// THE APPROVAL GATE. One click, and it is the most consequential click in the company.
//
// ⚠️ READ THIS BEFORE YOU MAKE IT EASIER.
//
// A `reviewed` row is the ONLY kind that ever reaches a user's tax answer. So this endpoint is the
// exact moment a sentence Khoji scraped off GOV.UK, and a language model summarised, becomes
// something we will tell a self-employed man about the return he is legally responsible for.
//
// Everything that looks like friction here is load-bearing:
//
//   ONE AT A TIME. There is no bulk approve, and there will not be one. "Approve all" is how forty
//   unread items become forty things we have told our users, in one thoughtless second, and the
//   whole point of a human gate is that a human read it.
//
//   THE SERVER DECIDES THE STATUS. The client posts a DECISION ('approve' | 'dismiss'), never a
//   status string. A client that could post `status: 'anything'` could invent a state the system has
//   never heard of, and every downstream check would then be guessing.
//
//   MEMBERSHIP IS RE-CHECKED HERE, on this request, not once at sign in. A session is not a
//   permission. Somebody removed from team_members loses this on their very next click.
//
//   IT IS REVERSIBLE. Approve sets a status; so does dismiss; either can be set again. Nothing here
//   is a one-way door, which is the only reason a single click is acceptable at all. Compare the
//   rules in CLAUDE.md: money, tax filing and anything sent to another human ALWAYS ask twice.
//   This is not one of those. It is us deciding what WE know.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const member = await readTeamMember(user.email);
  if (!isTeam(member)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  let body: { id?: unknown; decision?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const decision = body.decision;

  // The allowlist. Two words, and nothing else gets through. Not a status, not a free string.
  if (!id || (decision !== 'approve' && decision !== 'dismiss')) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // ⚠️ NO EMAIL, NO APPROVAL. The typechecker caught this and it is not a formality.
  //
  // `user.email` is nullable. The entire value of this click is that it records WHO said yes: for the
  // day somebody asks why we told six thousand men something about their tax, and the only acceptable
  // answer is a name and a date.
  //
  // The lazy fix is `user.email ?? ''`. That would write an APPROVAL WE CANNOT ATTRIBUTE, which is
  // precisely the "the system decided" we are here to prevent, dressed as a passing build. So an
  // account with no email address cannot approve. It is not a gap in the gate, it IS the gate.
  if (!user.email) {
    return NextResponse.json({ error: 'no_identity' }, { status: 403 });
  }

  const done = await reviewKnowledgeItem(id, decision, user.email);

  // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. The page rolls the row back into the queue
  // on a non-ok, rather than leaving a human believing he approved something he did not. This whole
  // codebase's disease is silent success: a job that does nothing and exits 0.
  if (!done) return NextResponse.json({ error: 'write_failed' }, { status: 502 });

  return NextResponse.json({ ok: true, id, decision, by: user.email });
}
