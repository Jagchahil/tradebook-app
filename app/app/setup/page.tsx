import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import {
  readOnboardingProgress, getBusinessProfile, readCircumstances, listBankConnectionsForUser,
} from '../../../lib/supabase';
import { hasBankFeedConfig } from '../../../lib/bankfeed';
import { unanswered, household, notHousehold, type Circumstance } from '../../../lib/circumstances';
import {
  isStep, isDone, toStep, prevStep, stepNumber, stepCount, progressPct, stepTitle,
  HOW_LONG, HOW_LONG_WHY, type Step,
} from '../../../lib/onboarding';
import {
  A11Y_CSS, FONT, GREEN_TINT, INK, LINE, MUTED, PAPER, RADIUS, RED, RIVER, RIVER_DEEP,
  RIVER_TINT, SAFFRON_DEEP, SURFACE,
} from '../../../lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// SETTING UP, ON THE WEB, AND HE CAN BE INTERRUPTED AT ANY POINT WITHOUT LOSING A WORD OF IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS PAGE HOLDS NOTHING. EVERY ANSWER IS ALREADY SAVED BEFORE THE NEXT SCREEN DRAWS.
//
// A barber does this between customers and WILL be interrupted at minute eight. The old /start held
// six answers in the browser and committed at the end, which is survivable for ninety seconds and
// indefensible for fifteen minutes: one closed tab and he has told us everything and we know nothing,
// and he does not come back to do it twice.
//
// So there is no accumulated state anywhere. Each choice is its own form, posted to the route that
// owns that fact, written to its real home, and answered with a 303 back to this step:
//
//   the business structure -> /api/business    -> public.users.business_type
//   a relief               -> /api/circumstances -> public.circumstances, with the wording he saw
//   the account use        -> /api/bank/connect -> public.bank_connections
//   which step he is on    -> /api/onboarding   -> public.onboarding_progress, and nothing else
//
// Resuming is therefore not a restore. There is nothing to restore: this page re-reads what he has
// already told us and draws whatever is still open. Closing the tab costs him his place in the queue
// and not one answer. See lib/onboarding.ts, and the migration header for why there is no blob.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ AND IT SHIPS NO CLIENT SCRIPT, like every other screen in the web app.
//
// He is on a cheap Android on a bad signal. A wizard that cannot answer a question until JavaScript
// arrives is a wizard he abandons. The cost is a page load per answer, which on a screen where he is
// answering a handful of questions is the honest trade, and it buys something a client side wizard
// cannot have at any price: every answer is on the server the instant he gives it.
//
// ⚠️ NOTHING HERE DECIDES WHAT TO ASK, EITHER. The questions, their order, their wording and the
// refusal to ever hand out a special category one all come from lib/circumstances.ts, which is the
// same module the phone app and the WhatsApp chain read. This file is a surface.

// A local sentence for a step that could not read its own data. Said once, plainly, and never
// dressed up as an empty result: "you have nothing to claim" and "we could not check" are different
// things to tell a man, and confusing them is how he stops answering.
const UNREADABLE = 'We could not read your answers just this minute. Nothing is lost. Give it a moment and reload, or carry on and come back to this.';

function bankNote(code: string | undefined): string | null {
  switch (code) {
    case 'unavailable':
      return 'Connecting a bank is not working just this minute. Nothing has been shared. Skip it for now and it is waiting for you inside.';
    default:
      return null;
  }
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const progress = await readOnboardingProgress(user.id);

  // ⚠️ AN EXPLICIT ?step= WINS OVER HIS RECORDED POSITION, AND IT IS SAFE THAT IT DOES.
  //
  // Back is a plain link, and so is the resume line on /app, so both arrive here naming a step. It
  // cannot be used to skip anything, because there is nothing to skip TO: every step draws only what
  // is still open, and jumping to the last one shows a man the bank question with all his relief
  // questions still unanswered and still waiting for him. The only thing that moves his recorded
  // position is /api/onboarding, on a POST, and only ever forwards.
  const asked = one('step');
  const step: Step = isStep(asked) ? asked : toStep(progress?.step);

  // Finished, and he came back to the URL. Nothing to draw, so he goes where a finished man belongs.
  if (isDone(step)) redirect('/app');

  // 🔴 A FAILED READ IS NOT A FRESH START, AND SAYING SO IS THE WHOLE POINT OF THIS LINE.
  //
  // readOnboardingProgress returns null when the read itself failed, which is a different fact from
  // a missing row. Silently drawing the welcome screen would tell a man eleven questions in that he
  // is at the beginning. He is not, and every step below re-reads what he has answered, so nothing
  // will be asked twice whatever this line says. What he needs is to be told, so that a screen he
  // did not expect is not a screen that makes him wonder what else we have lost.
  const lostOurPlace = progress === null && !isStep(asked);

  const back = prevStep(step);

  return (
    <main style={S.wrap}>
      <style>{A11Y_CSS}</style>

      <header style={S.head}>
        <span style={S.logo}>Lekhio</span>
        {/* ⚠️ ALWAYS ON SCREEN, AT EVERY STEP. His books are not held hostage by his setup. Leaving
            writes nothing, so the step he is on is still the step he comes back to. */}
        <a href="/app" style={S.later}>Do this later</a>
      </header>

      <div style={S.barRow}>
        <span style={S.barLabel}>Step {stepNumber(step)} of {stepCount()} &middot; {stepTitle(step)}</span>
        <span style={S.barTime}>{HOW_LONG}</span>
      </div>
      <div style={S.barTrack}>
        <div style={{ ...S.barFill, width: `${progressPct(step)}%` }} />
      </div>

      {lostOurPlace ? (
        <p style={S.warn}>
          We could not check where you had got to, so this starts at the beginning. Nothing you have
          already answered will be asked again.
        </p>
      ) : null}

      {/* One step draws per request, and each one reads only its own data. A wizard that loaded
          every step's data on every request would pay four round trips to show one screen, on the
          connection this whole surface exists to survive. */}
      {step === 'welcome' ? <Welcome /> : null}
      {step === 'business' ? <BusinessStep userId={user.id} /> : null}
      {step === 'household' ? <QuestionsStep userId={user.id} step="household" /> : null}
      {step === 'about' ? <QuestionsStep userId={user.id} step="about" /> : null}
      {step === 'bank' ? <BankStep userId={user.id} note={bankNote(one('bank'))} /> : null}

      <footer style={S.foot}>
        {/* THE ONLY THING THAT MOVES HIM. It posts which step he has FINISHED, never where to go:
            /api/onboarding asks lib/onboarding what comes next, so nothing sent from here can stamp
            a completed setup on an account that was never asked a question. */}
        <form action="/api/onboarding" method="post" style={S.nextForm}>
          <input type="hidden" name="from" value={step} />
          <button type="submit" style={S.next}>
            {step === 'bank' ? 'Finish and take me in' : step === 'welcome' ? 'Start' : 'Continue'}
          </button>
        </form>
        {back ? <a href={`/app/setup?step=${back}`} style={S.backLink}>Back</a> : null}
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------------------------
// THE WELCOME. One job: tell him the truth about what this costs him before he starts it.
// ---------------------------------------------------------------------------------------------
function Welcome() {
  return (
    <section style={S.card}>
      <h1 style={S.h1}>Right, let us set your Lekhio up properly.</h1>
      <p style={S.body}>
        This takes <b>{HOW_LONG}</b>. {HOW_LONG_WHY}
      </p>
      <p style={S.body}>
        Most of what you can claim has nothing to do with receipts, and nobody ever asks about it. So
        that is what the next few screens are: a handful of questions about you, not about your
        paperwork, and each one is money we cannot get you unless you tell us.
      </p>
      {/* THE PROMISE THAT MAKES A FIFTEEN MINUTE FORM POSSIBLE AT ALL, said before he starts rather
          than discovered when he comes back and finds it kept. */}
      <p style={S.reassure}>
        <b>Stop whenever you like.</b> Every answer saves the moment you give it, so if a customer
        walks in you can shut this and pick up exactly where you left off. Nothing gets asked twice.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// HOW HE TRADES. The one answer the tax engine branches on, and the reason it is asked second.
// ---------------------------------------------------------------------------------------------
async function BusinessStep({ userId }: { userId: string }) {
  const profile = await getBusinessProfile(userId);
  const chosen = profile?.businessType ?? null;

  // ⚠️ THIS STEP IS ASKED EVEN THOUGH WE ALREADY HOLD AN ANSWER, AND THAT IS DELIBERATE.
  //
  // reconcileSignupToUser maps the /start naming question onto a tax structure, and it can only map
  // it two ways: a registered company, or a sole trader. Partnership is not on /start at all. So a
  // coffee shop run by two people who chose "A business name" is sitting in the database as a SOLE
  // TRADER, silently, and lib/partnership.ts has been ready for him since 17 July with nowhere to
  // say so. What we hold here is a reasonable GUESS, not something he told us, so it is offered back
  // to him ticked rather than treated as answered.
  const options: Array<{ value: string; label: string; note: string }> = [
    {
      value: 'sole_trader',
      label: 'Just me',
      // Says the thing that stops him picking wrong. Trading as a name feels like a business and is
      // not one for tax, and a man who ticks the wrong box here gets the wrong engine for a year.
      note: 'Self employed. Trading under a name like Smith Electrical is still just you, so this is the one.',
    },
    {
      value: 'partnership',
      label: 'Me and somebody else',
      note: 'You share the business. You are taxed on your share of the profit, not all of it.',
    },
    {
      value: 'limited_company',
      label: 'A limited company',
      note: 'A company registered at Companies House, and you are a director of it.',
    },
  ];

  return (
    <section style={S.card}>
      <h1 style={S.h1}>How is your business set up?</h1>
      <p style={S.body}>
        This decides which tax rules we use for you, so it is the one that matters most. If we have
        guessed from your signup, it is ticked already. Change it if we have it wrong.
      </p>

      <div style={S.stack}>
        {options.map((o) => {
          const on = chosen === o.value;
          return (
            // ⚠️ ONE FORM PER CHOICE, AND IT SAVES ON THE TAP. Not a radio group waiting on a Save
            // button, because a man who taps his answer and then closes the tab has told us, and a
            // page that needed one more press would have thrown that away. The same reason the pile
            // puts a button on each group rather than a basket at the bottom.
            <form key={o.value} action="/api/business" method="post" style={S.optForm}>
              <input type="hidden" name="business_type" value={o.value} />
              <input type="hidden" name="step" value="business" />
              <button type="submit" style={{ ...S.opt, ...(on ? S.optOn : null) }} aria-pressed={on}>
                <span style={S.optLabel}>{on ? '✓ ' : ''}{o.label}</span>
                <span style={S.optNote}>{o.note}</span>
              </button>
            </form>
          );
        })}
      </div>

      {/* 🔴 ONLY ONCE HE HAS SAID PARTNERSHIP. A share box on screen for a sole trader is a question
          with no sensible answer, which doc 103 forbids, and getBusinessProfile defaults an unset
          share to 100 precisely so a half answered setup never quietly halves a man's tax. */}
      {chosen === 'partnership' ? (
        <form action="/api/business" method="post" style={S.shareForm}>
          <input type="hidden" name="business_type" value="partnership" />
          <input type="hidden" name="step" value="business" />
          <label htmlFor="share" style={S.label}>Your share of the profit</label>
          <div style={S.shareRow}>
            <input
              id="share"
              name="partnership_share"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              defaultValue={profile?.partnershipShare ?? 50}
              style={S.shareInput}
            />
            <span style={S.pct}>%</span>
            <button type="submit" style={S.shareSave}>Save</button>
          </div>
          <p style={S.hint}>
            A partner is taxed on their share, not on the whole profit. If you split it down the
            middle, that is 50.
          </p>
        </form>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// THE QUESTIONS. Two steps, one component, because they differ only in which questions they hold.
//
// 🔴 THE WHOLE GROUP IS ON SCREEN, NOT THE TOP THREE.
//
// The phone wizard shows three and calls itself a doorway, which is right for a screen whose job is
// to get out of the way. This is the fifteen minutes he was told about, and depth is the feature.
// Showing three has a worse problem than length, though: with only three on screen and each answer
// costing a page load, a man who does not want to answer the top one CANNOT REACH the fourth. He
// would have to answer a question he was avoiding to get past it. So the group is drawn in full, in
// lib/circumstances.ts's own order, and the list visibly shrinks as he goes.
// ---------------------------------------------------------------------------------------------
async function QuestionsStep({ userId, step }: { userId: string; step: 'household' | 'about' }) {
  const rows = await readCircumstances(userId);

  const intro = step === 'household'
    ? {
      title: 'You and your household.',
      // Says why the four cheapest questions we own come before the ones worth more. He knows every
      // answer without looking anything up.
      blurb: 'Four questions, and you know every answer off the top of your head. They are worth real money and no bookkeeping app has ever asked them.',
    }
    : {
      title: 'What you can claim.',
      blurb: 'None of these is on a receipt or in a bank statement, which is exactly why they get missed. Answer what you can. Anything you leave is waiting for you inside, and we will never ask you the same thing twice.',
    };

  if (rows === null) {
    return (
      <section style={S.card}>
        <h1 style={S.h1}>{intro.title}</h1>
        <p style={S.warn}>{UNREADABLE}</p>
      </section>
    );
  }

  // The partition comes from lib/circumstances.ts, both halves of it, and `unanswered` is the gate.
  // Nothing here knows which questions are household ones or which are special category: it asks.
  const open = new Set(unanswered(rows).map((c) => c.key));
  const group: Circumstance[] = step === 'household' ? household() : notHousehold();
  const list = group.filter((c) => open.has(c.key));

  // ⚠️ THE DENOMINATOR IS THIS MAN'S, NOT THE MODULE'S TOTAL.
  //
  // Some questions only exist once another is answered: a single man is never asked what his wife
  // earns. Counting against the full list gives him a bar he can never fill, so he answers every
  // question we have for him and is told he is on 3 of 4. Answered plus still to ask is the only
  // denominator that is true for HIM, and it grows as he goes.
  const answeredHere = group.filter((c) => !open.has(c.key)).length;
  const askable = answeredHere + list.length;

  return (
    <section style={S.card}>
      <h1 style={S.h1}>{intro.title}</h1>
      <p style={S.body}>{intro.blurb}</p>

      {askable > 0 ? (
        <p style={S.count}>{answeredHere} of {askable} answered</p>
      ) : null}

      {list.length === 0 ? (
        <p style={S.done}>
          {answeredHere > 0
            ? 'That is the lot. Everything here is answered and it is all counted.'
            : 'Nothing to ask you here.'}
        </p>
      ) : (
        <div style={S.stack}>
          {list.map((q) => (
            <div key={q.key} style={S.q}>
              <p style={S.ask}>{q.ask}</p>
              <p style={S.why}>{q.why}</p>
              {/* 🔴 WHO ACTUALLY HAS TO CLAIM IT, SAID BEFORE HE ANSWERS RATHER THAN AFTER.
                  Marriage Allowance is claimed by his wife. Small Business Rate Relief goes to his
                  council. A product that takes his Yes and lets him believe it is handled has cost
                  him the money and will be blamed for it, correctly. */}
              {q.claimant !== 'him' ? (
                <p style={S.whose}>
                  {q.claimant === 'his council'
                    ? 'This one is claimed from your council, not HMRC. Tell us and we will show you exactly what to ask them for.'
                    : q.claimant === 'his partner'
                      ? 'This one has to be claimed by your husband or wife, not by you. Tell us and we will show you what they need to do.'
                      : q.claimant === 'both of them'
                        ? 'This one needs two people to claim it. Tell us and we will show you both what to do.'
                        : 'This one is claimed by your company rather than by you.'}
                </p>
              ) : null}
              <div style={S.answers}>
                {(['yes', 'no'] as const).map((a) => (
                  // ⚠️ THE ANSWER IS THE ONLY THING POSTED. The question's wording is stored by the
                  // server from its own copy of the list, never from this page, because Finance Act
                  // 2026 Sch 22 makes the log of what we ASKED the only thing that proves we did not
                  // intend a loss of tax revenue, and a sentence the browser supplied proves nothing.
                  <form key={a} action="/api/circumstances" method="post" style={S.aForm}>
                    <input type="hidden" name="key" value={q.key} />
                    <input type="hidden" name="answer" value={a} />
                    <input type="hidden" name="step" value={step} />
                    <button type="submit" style={a === 'yes' ? S.yes : S.no}>
                      {a === 'yes' ? 'Yes' : 'No'}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 🔴 THERE IS NO "NOT NOW" BUTTON, AND ITS ABSENCE IS THE DECISION.
          A skip that records a skip is never asked again, and "he would not say" filed as an answer
          is how £252 a year disappears while we are certain we asked. A skip that records nothing is
          just Continue, which is already in the footer at every step. So the footer is the skip, and
          an unanswered question stays unanswered and stays waiting. */}
      {list.length > 0 ? (
        <p style={S.hint}>
          Not sure about one? Leave it. Continue at the bottom moves you on and it stays on your list.
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// THE BANK. The one capture route that works on day one for a web customer, and the only step that
// hands him to somebody else's website and hopes he comes back.
// ---------------------------------------------------------------------------------------------
async function BankStep({ userId, note }: { userId: string; note: string | null }) {
  const enabled = hasBankFeedConfig();
  const connections = enabled ? await listBankConnectionsForUser(userId) : [];
  const linked = connections.find((c) => c.status === 'linked') ?? null;

  return (
    <section style={S.card}>
      <h1 style={S.h1}>Connect your bank.</h1>

      {note ? <p style={S.warn}>{note}</p> : null}

      {linked ? (
        <p style={S.done}>
          {linked.bank_name ? `${linked.bank_name} is connected.` : 'Your bank is connected.'} Money in
          and out arrives on its own from here, marked to review. Nothing counts toward your tax until
          you say so.
        </p>
      ) : !enabled ? (
        // Doc 103's honesty test. A button whose only function is to say the feature does not exist
        // is an advert for our roadmap, so there is no button.
        <p style={S.body}>
          Bank connections are not switched on for your account yet. Carry on, and this is waiting for
          you inside when it is.
        </p>
      ) : (
        <>
          <p style={S.body}>
            Read only, and we can never move your money. Once it is connected your spending logs itself,
            which is the whole job done without you sending us anything.
          </p>

          <form action="/api/bank/connect" method="post">
            {/* ═══════════════════════════════════════════════════════════════════════════════
                🔴 THE QUESTION THAT WAS WIRED ON 28 JULY AND HAS HAD NO SURFACE SINCE.
                On a real pile, "we recognise these 5" read as a holiday train, holiday coffees and
                three months of overdraft fees, and one button would have filed all six into a man's
                tax figures. Every one of them was personal. The product had no idea what kind of
                account it was looking at, and nothing on the review screen could have known.
                It is asked HERE because this is the only moment he is thinking about this specific
                account, and the answer changes the default for every row that ever comes off it.
                ═══════════════════════════════════════════════════════════════════════════════ */}
            <fieldset style={S.fieldset}>
              <legend style={S.legend}>What is this account for?</legend>
              {([
                ['business', 'Business only', 'I keep this one for the work. Nothing personal goes through it.'],
                ['mixed', 'A bit of both', 'Work and home money go through the same account. Most sole traders.'],
                ['personal', 'Personal, mostly', 'This is my own account. Some work money passes through it.'],
              ] as const).map(([value, label, note2]) => (
                <label key={value} style={S.radioRow}>
                  {/* Defaults to the CAUTIOUS answer, never the permissive one. "A bit of both" makes
                      the review screen ask about everything; "business only" lets it be confident.
                      A man who does not read this must not be given the confident one by accident. */}
                  <input
                    type="radio"
                    name="accountUse"
                    value={value}
                    defaultChecked={value === 'mixed'}
                    style={S.radio}
                  />
                  <span>
                    <span style={S.radioLabel}>{label}</span>
                    <span style={S.radioNote}>{note2}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <button type="submit" style={S.connect}>Choose your bank</button>
          </form>

          <p style={S.hint}>
            {/* THE SKIPPABLE PROMISE, SAID BEFORE HE LEAVES. This step sends him to his bank for
                multi factor authentication, which is the most likely place in the whole journey for
                him to fall out. It must never be the thing standing between him and his account. */}
            Your bank will ask you to log in and approve it, then send you back here. If it does not
            work, or you would rather do it later, use Continue at the bottom. Nothing here is stopping
            you getting in.
          </p>
        </>
      )}
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK, padding: '18px 16px 40px', maxWidth: 640, margin: '0 auto' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  logo: { fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: RIVER_DEEP },
  later: { color: MUTED, fontSize: 13.5, fontWeight: 600, textDecoration: 'none' },

  barRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 7 },
  barLabel: { fontSize: 12, fontWeight: 700, color: RIVER, letterSpacing: '0.3px' },
  barTime: { fontSize: 12, color: MUTED },
  barTrack: { height: 6, borderRadius: 3, background: SURFACE, overflow: 'hidden', marginBottom: 18 },
  barFill: { height: 6, borderRadius: 3, background: SAFFRON_DEEP },

  card: { background: '#fff', border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '20px 18px', marginBottom: 14 },
  h1: { fontSize: 22, lineHeight: 1.28, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 12px' },
  body: { fontSize: 15.5, lineHeight: 1.6, color: MUTED, margin: '0 0 14px' },
  reassure: { fontSize: 14.5, lineHeight: 1.6, color: INK, background: GREEN_TINT, borderRadius: RADIUS.md, padding: 14, margin: '4px 0 0' },
  warn: { fontSize: 14.5, lineHeight: 1.6, color: INK, background: '#FBEAE8', border: `1px solid ${RED}33`, borderRadius: RADIUS.md, padding: 14, margin: '0 0 14px' },
  done: { fontSize: 15, lineHeight: 1.6, color: INK, background: GREEN_TINT, borderRadius: RADIUS.md, padding: 14, margin: 0 },
  hint: { fontSize: 13, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },
  count: { fontSize: 12.5, fontWeight: 700, color: MUTED, margin: '0 0 12px' },

  stack: { display: 'flex', flexDirection: 'column', gap: 10 },

  optForm: { margin: 0 },
  opt: { display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: RADIUS.md, padding: '14px 14px', cursor: 'pointer', fontFamily: FONT, color: INK },
  optOn: { borderColor: RIVER, background: RIVER_TINT },
  optLabel: { display: 'block', fontSize: 16, fontWeight: 700 },
  optNote: { display: 'block', fontSize: 13.5, lineHeight: 1.5, color: MUTED, marginTop: 3 },

  shareForm: { marginTop: 16, background: SURFACE, borderRadius: RADIUS.md, padding: 14 },
  label: { display: 'block', fontSize: 12.5, fontWeight: 700, color: MUTED, marginBottom: 8 },
  shareRow: { display: 'flex', alignItems: 'center', gap: 8 },
  shareInput: { width: 90, background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '11px 12px', fontSize: 16, fontFamily: FONT, color: INK },
  pct: { fontSize: 16, fontWeight: 700, color: MUTED },
  shareSave: { marginLeft: 'auto', background: RIVER, color: '#fff', border: 'none', borderRadius: RADIUS.sm, padding: '11px 18px', fontSize: 14.5, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  q: { border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: 15, background: '#fff' },
  ask: { fontSize: 16, lineHeight: 1.45, fontWeight: 700, margin: '0 0 7px' },
  why: { fontSize: 14, lineHeight: 1.55, color: MUTED, margin: 0 },
  whose: { fontSize: 13, lineHeight: 1.5, color: RIVER_DEEP, background: RIVER_TINT, borderRadius: RADIUS.sm, padding: '9px 11px', margin: '10px 0 0' },
  answers: { display: 'flex', gap: 10, marginTop: 13 },
  aForm: { flex: 1, margin: 0 },
  yes: { width: '100%', background: RIVER, color: '#fff', border: 'none', borderRadius: RADIUS.sm, padding: '13px 0', fontSize: 15, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  no: { width: '100%', background: '#fff', color: MUTED, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '13px 0', fontSize: 15, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },

  fieldset: { border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '12px 14px 14px', margin: '0 0 16px' },
  legend: { fontSize: 12.5, fontWeight: 700, color: MUTED, padding: '0 6px' },
  radioRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', cursor: 'pointer' },
  radio: { marginTop: 3, width: 18, height: 18, accentColor: RIVER, flexShrink: 0 },
  radioLabel: { display: 'block', fontSize: 15.5, fontWeight: 700 },
  radioNote: { display: 'block', fontSize: 13.5, lineHeight: 1.5, color: MUTED, marginTop: 2 },
  connect: { width: '100%', background: RIVER, color: '#fff', border: 'none', borderRadius: RADIUS.md, padding: '15px 0', fontSize: 16, fontWeight: 800, fontFamily: FONT, cursor: 'pointer' },

  foot: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 6 },
  nextForm: { width: '100%', margin: 0 },
  next: { width: '100%', background: RIVER, color: '#fff', border: 'none', borderRadius: RADIUS.lg, padding: '17px 0', fontSize: 17, fontWeight: 800, fontFamily: FONT, cursor: 'pointer' },
  backLink: { color: MUTED, fontSize: 13.5, fontWeight: 600, textDecoration: 'none' },
};
