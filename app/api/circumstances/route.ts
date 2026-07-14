import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, readCircumstances, saveCircumstance } from '../../../lib/supabase';
import { CIRCUMSTANCES, unanswered, notOurs } from '../../../lib/circumstances';

export const runtime = 'nodejs';

// WHAT HE HAS TOLD US, AND WHAT WE STILL NEED TO ASK.
//
// The gap between those two things is the money. Marriage Allowance was £252 on the floor for one
// reason: there was nowhere in this product for a man to tell us he was married.

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await readCircumstances(user.id);

  // ⚠️ NULL IS "WE COULD NOT READ", NOT "HE HAS ANSWERED NOTHING".
  //
  // Get this wrong and we ask a man a question he answered last month. He notices, and he learns that
  // we are not listening, and after that he stops answering. Which costs him the money and costs us
  // the customer. A 503 says we do not know; it does not invent a blank slate.
  if (rows === null) {
    return NextResponse.json({ error: 'unreadable' }, { status: 503 });
  }

  const answeredKeys = rows.map((r) => r.key);

  return NextResponse.json({
    answered: rows,
    // Sorted with the biggest money first, ALWAYS. A man will answer three questions on a good day,
    // and WHICH three decides whether this product is worth £12.99 to him. Asking about his home
    // office before asking what he did for a living last year is how you leave four figures on the
    // floor and feel thorough.
    toAsk: unanswered(answeredKeys),
    total: CIRCUMSTANCES.length,
    // The ones we can never claim for him: his wife has to, or his council does. We tell him and we
    // get out of the way. A feature that tries to claim what it has no standing to claim gets
    // rejected, wastes his evening, and he blames us. Correctly.
    notOurs: notOurs().map((c) => c.key),
  });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: { key?: unknown; answer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const key = typeof body.key === 'string' ? body.key : '';
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';

  // THE KEY MUST BE ONE WE ASKED. A client that could invent a key could write a circumstance the
  // system has never heard of, and every downstream check would then be guessing at what it means.
  const c = CIRCUMSTANCES.find((x) => x.key === key);
  if (!c || !answer || answer.length > 400) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // ⚠️ `c.ask` IS STORED VERBATIM, FROM THE SERVER, AND IT IS THE EXHIBIT.
  //
  // Not the client's idea of what it asked. Not a key to be resolved later. The exact sentence this
  // codebase put in front of him, captured at the moment he answered it. If we reword the question
  // next year, this row still carries the words HE read.
  //
  // Finance Act 2026 Sch 22: the log of what we asked and what he answered is the only thing that
  // proves we did not intend a loss of tax revenue.
  const ok = await saveCircumstance(user.id, key, answer, c.ask, 'app');

  // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. If we tell him "got it" and store nothing,
  // he believes we know he is married, we quietly do not, and he loses the money while thanking us.
  if (!ok) return NextResponse.json({ error: 'write_failed' }, { status: 502 });

  return NextResponse.json({ ok: true, key, answer, claimant: c.claimant });
}
