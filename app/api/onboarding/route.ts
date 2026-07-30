import { NextRequest, NextResponse } from 'next/server';
import { userBurst } from '../../../lib/ratelimit';
import { readOnboardingProgress, setOnboardingStep, completeOnboarding } from '../../../lib/supabase';
import { sessionUser } from '../../../lib/webauth';
import {
  isStep, nextStep, prevStep, toStep, isDone, stepIndex, LAST_STEP, type Step,
} from '../../../lib/onboarding';

export const runtime = 'nodejs';

// MOVING THROUGH SETUP. This route does exactly one thing: it changes which step he is on.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ IT WRITES NONE OF HIS ANSWERS, AND THERE IS NOWHERE HERE FOR ONE TO GO.
//
// The business type went to public.users when he tapped it. A relief went to public.circumstances,
// with the wording he saw. The account use went to public.bank_connections. Each was written by the
// route that owns that fact, at the moment he gave it, which is why an interruption at minute eight
// costs him nothing but his place in the queue. See lib/onboarding.ts.
//
// 🔴 AND THE NEXT STEP IS DECIDED HERE, NOT SENT BY THE BROWSER.
//
// The form posts which step he has just FINISHED. The server asks lib/onboarding what comes after it.
// A post carrying a destination would let anything skip to `done` and stamp a completed setup on an
// account that was never asked a question, which would then silently suppress the resume line on
// /app for ever: a man's setup marked finished when he never did it, and no screen anywhere left to
// tell him. Intent from the client, decision from the server, the same rule as the pile's one tap.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// 303 AND NOT 302. A 303 tells the browser to follow with a GET, so his back button and a refresh do
// not re-post and shunt him two steps on. Same reason /api/pile uses one.
function toSetup(req: NextRequest, step: Step) {
  const url = new URL(isDone(step) ? '/app' : `/app/setup?step=${step}`, req.url);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) {
  const user = await sessionUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (await userBurst('onboarding', user.id)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }

  // TWO ENCODINGS, ONE DECISION. The web page posts a plain HTML form because it ships no client
  // script; the phone app will post JSON when it moves onto this table. What must not happen is a
  // second route for the web, because then there are two implementations of "what comes next".
  const isForm = (req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded');
  let from = '';
  let direction = 'next';
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (!f) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    from = String(f.get('from') ?? '');
    direction = String(f.get('direction') ?? 'next');
  } else {
    try {
      const body = (await req.json()) as { from?: unknown; direction?: unknown };
      from = typeof body.from === 'string' ? body.from : '';
      direction = body.direction === 'back' ? 'back' : 'next';
    } catch {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }
  }

  if (!isStep(from)) return NextResponse.json({ error: 'bad_step' }, { status: 400 });

  // ⚠️ GOING BACK CHANGES NOTHING HE HAS RECORDED. It is navigation, and the page offers it as a
  // plain link for that reason. This branch exists only so a JSON caller has the same vocabulary,
  // and it deliberately does not write: if looking back moved his position, closing the tab on the
  // screen he had gone back to check would lose everything after it.
  if (direction === 'back') {
    const back = prevStep(from);
    return isForm
      ? toSetup(req, back ?? from)
      : NextResponse.json({ ok: true, step: back ?? from, moved: false });
  }

  const target = nextStep(from);

  // 🔴 HIS PLACE ONLY EVER MOVES FORWARD.
  //
  // He can look at any step by its link, so a Continue pressed on a step he had gone back to check
  // would otherwise rewind his recorded position and lose the ground he had already covered. Read
  // what we have, and refuse to write anything earlier than it.
  //
  // ⚠️ AND AN UNREADABLE ROW IS NOT A REASON TO REWIND HIM. readOnboardingProgress returns null when
  // the read itself failed, which is a different fact from a missing row, and treating it as a fresh
  // start is how a man eleven questions in gets walked back to the welcome screen. On null we move
  // him on the screen and write nothing, because being unable to remember where he is beats
  // remembering somewhere he has already been.
  const progress = await readOnboardingProgress(user.id);
  if (progress === null) {
    return isForm ? toSetup(req, target) : NextResponse.json({ ok: true, step: target, moved: false });
  }

  const recorded = toStep(progress.step);
  // stepIndex is lib/onboarding's own answer to "how far along is this". Comparing indexes here
  // rather than keeping a list of steps in this file is the difference between one order and two.
  const alreadyFurther = !isDone(recorded)
    && !isDone(target)
    && stepIndex(recorded) > stepIndex(target);
  const write = progress.completedAt || alreadyFurther ? null : target;

  let ok = true;
  if (write === LAST_STEP) ok = await completeOnboarding(user.id);
  else if (write) ok = await setOnboardingStep(user.id, write);

  // ⚠️ A FAILED WRITE STILL MOVES HIM ON THE SCREEN, AND THAT IS THE HONEST TRADE HERE.
  //
  // His answers are already saved: they went to their real homes on the way past. All that failed is
  // our note of where he is, so the cost of carrying on is that a later resume drops him a step early
  // and he passes a screen he has done. The cost of stopping him is an error page in the middle of
  // his setup over a bookkeeping column. Only a lost ANSWER would be worth blocking him for, and no
  // answer lives here.
  if (isForm) return toSetup(req, target);
  return NextResponse.json({ ok: true, step: target, moved: Boolean(write) && ok });
}
