import { NextRequest, NextResponse } from 'next/server';
import {
  verifyAccessToken, readCircumstances, saveCircumstance, forgetCircumstance,
} from '../../../lib/supabase';
import {
  CIRCUMSTANCES, unanswered, notOurs, sensitive, hasSpecialConsent, CONSENT_KEY, CONSENT_ASK,
} from '../../../lib/circumstances';

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

  return NextResponse.json({
    answered: rows,
    // Sorted with the biggest money first, ALWAYS. A man will answer three questions on a good day,
    // and WHICH three decides whether this product is worth £12.99 to him. Asking about his home
    // office before asking what he did for a living last year is how you leave four figures on the
    // floor and feel thorough.
    // The ANSWERS go in, not just the keys: a question about his wife is not a question until he has
    // told us he has one.
    toAsk: unanswered(rows),
    total: CIRCUMSTANCES.length,
    // The ones we can never claim for him: his wife has to, or his council does. We tell him and we
    // get out of the way. A feature that tries to claim what it has no standing to claim gets
    // rejected, wastes his evening, and he blames us. Correctly.
    notOurs: notOurs().map((c) => c.key),

    // ─────────────────────────────────────────────────────────────────────────────────────────
    // THE GATED PATH. Health data, Article 9, and it travels alone.
    //
    // Sent as its OWN block, never folded into toAsk, so that no client can render it as just
    // another card in the list. The consent wording goes with it, because the app must show him the
    // exact sentence we will store as his consent, and the sentence must be about THIS, specifically.
    // ─────────────────────────────────────────────────────────────────────────────────────────
    special: {
      consented: hasSpecialConsent(rows),
      consentAsk: CONSENT_ASK,
      consentKey: CONSENT_KEY,
      questions: sensitive(),
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ERASURE. Article 17, and it is not a feature request.
//
// ⚠️ AND IT IS A REAL DELETE. NOT A FLAG, NOT AN "answer: no", NOT A TOMBSTONE ROW.
//
// Consent that cannot be withdrawn was never consent, and Article 7(3) says withdrawal must be as
// easy as giving it. A man who tells us he is registered blind and later thinks better of it must be
// able to take it back and have it GONE. Setting his answer to "no" would leave the fact that we
// once asked, and his old answer, sitting in an audit trail he cannot reach. That is not erasure.
// That is a filing cabinet with a note on the front saying we have stopped looking.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export async function DELETE(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const user = token ? await verifyAccessToken(token) : null;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = new URL(req.url).searchParams.get('key') || '';

  // Withdrawing the CONSENT takes the health answers with it. It would be an odd kind of consent
  // that could be withdrawn while we carried on holding the thing it permitted.
  const keys = key === CONSENT_KEY
    ? [CONSENT_KEY, ...sensitive().map((c) => c.key)]
    : [key];

  if (!keys.every((k) => k === CONSENT_KEY || CIRCUMSTANCES.some((c) => c.key === k))) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const results = await Promise.all(keys.map((k) => forgetCircumstance(user.id, k)));

  // A FAILED DELETE MUST NOT REPORT SUCCESS. He is entitled to be told the truth about whether his
  // data is gone, and "we tried" is not an answer a man can act on.
  if (results.some((r) => !r)) {
    return NextResponse.json({ error: 'delete_failed' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, forgotten: keys });
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

  if (!answer || answer.length > 400) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // THE CONSENT ITSELF. Stored as a circumstance, which is exactly right: Article 7(1) requires us to
  // be able to DEMONSTRATE consent, and this table already logs the verbatim wording he was shown,
  // his answer and the timestamp. The whole of Article 7 in one row, using machinery we built for a
  // different reason. The wording comes from the SERVER, so what we can prove is what we really said.
  if (key === CONSENT_KEY) {
    const ok = await saveCircumstance(user.id, CONSENT_KEY, answer, CONSENT_ASK, 'app');
    if (!ok) return NextResponse.json({ error: 'write_failed' }, { status: 502 });
    return NextResponse.json({ ok: true, key, answer, claimant: 'him' });
  }

  // THE KEY MUST BE ONE WE ASKED. A client that could invent a key could write a circumstance the
  // system has never heard of, and every downstream check would then be guessing at what it means.
  const c = CIRCUMSTANCES.find((x) => x.key === key);
  if (!c) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // 🔴 A HEALTH ANSWER WITHOUT CONSENT IS REFUSED AT THE SERVER, NOT PREVENTED BY THE SCREEN.
  //
  // The app will not show him the question until he has consented. That is UI, and UI is a promise
  // about the client, not a control over the data. The rule that matters is the one enforced where
  // the write actually happens: no explicit consent on record, no Article 9 data in the database.
  // If the screen ever gets it wrong, or a stale app build posts it, or someone curls the endpoint,
  // this line is what stands between us and processing health data with no lawful basis.
  if (c.specialCategory) {
    const rows = await readCircumstances(user.id);

    // ⚠️ AND AN UNREADABLE CONSENT RECORD IS A NO. We refuse, and we say why. Failing OPEN here would
    // mean a database blip is all it takes to write a health record we were not allowed to hold.
    // (Anon auth in this codebase once failed open. It is not a mistake we get to make twice.)
    if (rows === null || !hasSpecialConsent(rows)) {
      return NextResponse.json({ error: 'consent_required' }, { status: 403 });
    }
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
