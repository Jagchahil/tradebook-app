import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import {
  readCircumstances, saveCircumstance, forgetCircumstance, getBusinessProfile,
} from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import { isStep, type Step } from '../../../lib/onboarding';
import {
  CIRCUMSTANCES, unanswered, notOurs, sensitive, hasSpecialConsent, CONSENT_KEY, CONSENT_ASK,
} from '../../../lib/circumstances';

export const runtime = 'nodejs';

// WHAT HE HAS TOLD US, AND WHAT WE STILL NEED TO ASK.
//
// The gap between those two things is the money. Marriage Allowance was £252 on the floor for one
// reason: there was nowhere in this product for a man to tell us he was married.

export async function GET(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('circumstances', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  // 🔴 WHO WE ARE ASKING, AND UNTIL 31 JULY 2026 THIS ROUTE ASKED ON BEHALF OF NOBODY.
  //
  // toAsk below is the phone app's whole question list, and it was computed with no persona at
  // all. So neither filter has ever run on this channel: not the structure one, which stops a
  // director being asked "what were you doing before you went self employed", and not wave nine's
  // income one, which stops a landlord being promised an early trade loss carried back against his
  // old wages that ITA 2007 s72 cannot give a property business.
  //
  // A failed profile read passes null on both axes, which lib/circumstances.ts treats as unknown
  // and asks everything. That is exactly today's behaviour, so a database blip can never be what
  // costs a sole trader the most valuable question on the list.
  const [rows, biz] = await Promise.all([
    readCircumstances(user.id),
    getBusinessProfile(user.id).catch(() => null),
  ]);

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
    // told us he has one. And WHO HE IS goes in beside them, both halves of it, so this channel
    // asks the same man the same questions the web does.
    toAsk: unanswered(rows, {
      structure: biz?.businessType ?? null,
      income: biz?.incomeShape ?? null,
    }),
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
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('circumstances', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE WEB ONBOARDING ANSWERS A QUESTION WITH A PLAIN FORM POST, AND LANDS BACK ON THE SAME SCREEN.
//
// /app/setup ships no client script, because he is on a cheap Android on a bad signal and a page
// that cannot act until JavaScript arrives is a page that cannot act. So each Yes and each No is a
// one field form, posted here, answered with a 303 back to the step he was on.
//
// ⚠️ TWO ENCODINGS, ONE WRITE. Everything below the parse is identical for the form and for the
// phone app's JSON, because a second route for the web would be a second implementation of "log the
// exact sentence he read", and the one that drifts is the one that has to stand up under Finance Act
// 2026 Sch 22.
//
// 🔴 THE REDIRECT TARGET IS A STEP NAME, NEVER A URL.
//
// A `back=/anywhere` field would be an open redirect sitting on an authenticated POST: a crafted
// form could answer a question on his behalf and land him on somebody else's page. So the field
// carries a step, lib/onboarding decides whether it is one, and this file builds the path itself.
// ═══════════════════════════════════════════════════════════════════════════════════════════
function backToSetup(req: NextRequest, step: Step) {
  return NextResponse.redirect(new URL(`/app/setup?step=${step}`, req.url), 303);
}

// The second surface that posts here, 31 July 2026: /app/you/circumstances, where answered
// questions are changed and open ones finally get asked outside the wizard. Same rule as the step
// field: the form names a SURFACE, this file builds the path itself, and nothing posted can carry
// a URL. The token is compared to one literal, so there is still no open redirect to craft.
function backToYou(req: NextRequest) {
  return NextResponse.redirect(new URL('/app/you/circumstances', req.url), 303);
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('circumstances', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  let body: { key?: unknown; answer?: unknown };
  // Where to send him afterwards, when this came from a form. Null for the phone app, which gets
  // JSON and decides its own navigation.
  let back: Step | null = null;
  // Whether the form asked to land back on /app/you/circumstances. A token checked against one
  // literal, never a path read from the request. See backToYou.
  let backYou = false;
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    body = { key: String(f.get('key') ?? ''), answer: String(f.get('answer') ?? '') };
    const step = String(f.get('step') ?? '');
    back = isStep(step) ? step : null;
    backYou = String(f.get('back') ?? '') === 'you';
  } else {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'bad_json' }, { status: 400 });
    }
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
    if (backYou) return backToYou(req);
    if (back) return backToSetup(req, back);
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
  // ⚠️ THE CHANNEL IS THE ONE HE REALLY USED. reconcileSignupToUser already logs 'web' for the
  // answers he gave on lekhio.app before he had an account, and a record that says 'app' for a man
  // who has never installed one is a record that cannot be relied on the day it matters.
  const ok = await saveCircumstance(user.id, key, answer, c.ask, isForm ? 'web' : 'app');

  // A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE. If we tell him "got it" and store nothing,
  // he believes we know he is married, we quietly do not, and he loses the money while thanking us.
  if (!ok) return NextResponse.json({ error: 'write_failed' }, { status: 502 });

  // ⚠️ THE 303 IS SENT ONLY AFTER THE WRITE SUCCEEDED. Redirecting first and writing after would
  // put him back on a screen with the question gone and nothing in the database, which is the exact
  // shape of the failure the comment above this write exists to prevent: he believes we know he is
  // married, we do not, and he loses the money while thanking us.
  if (backYou) return backToYou(req);
  if (back) return backToSetup(req, back);

  return NextResponse.json({ ok: true, key, answer, claimant: c.claimant });
}
