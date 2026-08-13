import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { readCircumstances, getBusinessProfile } from '../../../../lib/supabase';
import {
  household, notHousehold, mtdQuestions, unanswered, unansweredMtd, progressIn, appliesTo,
  writtenInFromSignup, heldStudentLoan, type Circumstance, type Persona,
} from '../../../../lib/circumstances';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, RIVER_TINT, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// EVERY QUESTION, WHAT HE SAID, AND WHAT IS STILL WAITING. The "waiting for you inside" page.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS PAGE DECIDES NOTHING ABOUT THE QUESTIONS. The wording, the order, the partitions, the
// claimant, which follow up is fair to ask today: all of it comes from lib/circumstances.ts, the
// same module /app/setup, the phone app and the WhatsApp chain read. Every answer posts to
// /api/circumstances, the one route that logs the verbatim sentence he was shown, because under
// Finance Act 2026 Sch 22 that log is the defence. This file is a surface.
//
// ⚠️ ANSWERED ONES ARE SHOWN WITH HIS ANSWER, AND CHANGEABLE. People get married, buy vans and
// register for VAT, and a record he cannot correct is a record that rots. Changing is the same
// POST as answering: saveCircumstance keeps one live answer per question, so pressing the other
// button replaces what he said, with the new wording logged beside it.
//
// 🔴 THE ARTICLE 9 QUESTION IS NOT ON THIS PAGE, AND ITS ABSENCE IS DELIBERATE. The partitions
// this page draws from all refuse special category questions, exactly as setup's do. The gated
// consent path needs erasure to be as easy as consent (Article 7(3)), and a server rendered form
// page has no DELETE to offer, so drawing the consent gate here would be offering a door in with
// no door out. The phone app holds that surface, behind its own consent, with its own delete.
//
// ⚠️ UNANSWERED DEPENDENT QUESTIONS STAY HIDDEN until their premise is established, exactly as
// everywhere else: a single man is never asked what his wife earns. The counts come from
// progressIn, whose denominator is his, so answering one can honestly raise the total.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// One sentence saying who has to make the claim, shared by the open and answered cards. The same
// judgements /app/setup states, said once here rather than four times below.
function claimantLine(c: Circumstance): string | null {
  switch (c.claimant) {
    case 'his council':
      return 'This one is claimed from your council, not HMRC. Tell us and we will show you exactly what to ask them for.';
    case 'his partner':
      return 'This one has to be claimed by your husband or wife, not by you. Tell us and we will show you what they need to do.';
    case 'both of them':
      return 'This one needs two people to claim it. Tell us and we will show you both what to do.';
    case 'his company':
      return 'This one is claimed by your company rather than by you.';
    default:
      return null;
  }
}

// What his stored answer reads as. Yes and no get plain words; anything longer came in over
// WhatsApp in his own words and is shown as he gave it, never paraphrased.
//
// 🔴 EXCEPT WHEN WE WROTE THE ANSWER IN FOR HIM, WHICH IS NOT THE SAME THING AND MUST NOT READ AS
// IF IT WERE. A Landlord signup ticks the property stream on /start and the signup reconcile writes
// `rental: yes` on his behalf. He never saw the rental question, so "You said yes" is us telling a
// man he answered something he was never shown, on the page whose whole job is to be the record of
// what he told us. lib/circumstances.ts owns the test for it, because the sentence it recognises is
// written in lib/supabase.ts and neither surface should be holding its own copy.
function saidLine(answer: string, asked: string | null): string {
  if (writtenInFromSignup(asked)) {
    return answer === 'no'
      ? 'You told us this when you signed up on the website. You have not been asked it here.'
      : 'You told us this when you signed up on the website, so we have put it down for you. You have not been asked it here.';
  }
  if (answer === 'yes') return 'You said yes.';
  if (answer === 'no') return 'You said no.';
  if (answer === 'skip') return 'You left this one.';
  return `You told us: ${answer}`;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE RESOLUTION. THE ROW STILL COUNTS. THE PROMISE DOES NOT GET SHOWN.
//
// A question can be a RECORD and a PROMISE at once, and on 31 July those two came apart. `incomes`
// stopped us ASKING a landlord what he did before he went self employed, because the `why` under
// that question offers an ITA 2007 s72 early trade loss carried back against his old wages and a
// cheque from HMRC, and a property business loss carries forward against future profits of the same
// letting business and nowhere else. But a man who ANSWERED it in June, before the filter existed,
// is still drawn his answer here, with that promise sitting underneath it.
//
// The two halves pull opposite ways and both of them are right:
//
//   THE ROW IS A RECORD, AND A RECORD OF WHAT HE TOLD US DOES NOT EVAPORATE. progressIn() counts
//   an answer he gave even when the question would not be asked today, and it says so on the line
//   that does it. He answered. Deleting the row, or dropping it out of "3 answered", would be the
//   product quietly editing his own history because our understanding of him improved. It would
//   also take away his only way to correct it, and people do incorporate, and do sell the van.
//
//   THE `why` IS A PROMISE, AND A PROMISE THAT IS NOT TRUE OF HIM MAY NOT BE PUT IN FRONT OF HIM.
//   It is not a footnote he can weigh. It is us naming money and telling him it is his.
//
// SO: THE ROW STAYS, DRAWN AND CHANGEABLE AND COUNTED. THE PROMISE IS WITHHELD AND SAID PLAINLY
// INSTEAD. Nothing is added to the screen (doc 103): one sentence stands where another stood, and
// he is left with the truth in the place he would have read the promise.
//
// ⚠️ THE REPLACEMENT NAMES NO AXIS. appliesTo() answers one question, "is this for him", and does
// not say whether it was refused for how he trades or for whether he trades at all. Guessing which
// on a surface would be a second copy of a rule that lives in the module, and it is the copy that
// drifts. The sentence is true either way and it does not pretend to know more than we asked.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const NOT_HIS =
  'This one does not apply to a business like yours. We are not going to tell you what it might have '
  + 'been worth, because it would not be true of you. Your answer stays on your record, and you can '
  + 'change it here whenever you like.';

function QuestionCard({ q, current, asked, mine }: {
  q: Circumstance;
  current: string | null;
  asked: string | null;
  mine: boolean;
}) {
  const whose = claimantLine(q);

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 A PROMISE CAN BE UNTRUE OF HIM IN TWO WAYS, AND ONLY ONE OF THEM IS ABOUT HIS BUSINESS.
  //
  // NOT_HIS above is decided by appliesTo(), which reads how he trades and whether he trades. It
  // cannot see what he ANSWERED, and vat_registered's `why` is false on exactly that axis: it
  // promises a four year Reg 111 reclaim "when you registered", and it sat above his own "You said
  // no." Found walking the product as a non VAT registered sole trader, 9 August 2026. The rule
  // lives on the row (lib/circumstances.ts, untrueOn) so this surface holds no copy of it.
  //
  // Same doctrine as NOT_HIS, one axis further in, and deliberately the SAME style on the page:
  // the row stays, drawn and changeable and counted, and one true sentence stands where the
  // promise stood. Nothing is added to the screen.
  //
  // ⚠️ ONLY ON AN ANSWER HE HAS GIVEN. `current` is null until he taps, and before he taps the
  // promise is the whole reason to answer at all. Withholding it from a man who has not yet said
  // anything would delete the question's point.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const untrue = q.untrueOn && current === q.untrueOn.answer ? q.untrueOn.instead : null;
  const withheld = mine ? untrue : NOT_HIS;

  return (
    <div style={S.q}>
      <p style={S.ask}>{q.ask}</p>
      {withheld ? <p style={S.notHis}>{withheld}</p> : <p style={S.why}>{q.why}</p>}
      {!withheld && whose ? <p style={S.whose}>{whose}</p> : null}
      {current !== null ? <p style={S.said}>{saidLine(current, asked)}</p> : null}
      <div style={S.answers}>
        {(['yes', 'no'] as const).map((a) => {
          const on = current === a;
          return (
            // One form per answer, same as setup: the tap is the save, and the 303 lands back
            // here. The `back` field is a token the route compares to one literal, never a path.
            <form key={a} action="/api/circumstances" method="post" style={S.aForm}>
              <input type="hidden" name="key" value={q.key} />
              <input type="hidden" name="answer" value={a} />
              <input type="hidden" name="back" value="you" />
              <button
                type="submit"
                style={{ ...(a === 'yes' ? S.yes : S.no), ...(on ? S.pressed : null) }}
                aria-pressed={on}
              >
                {on ? '✓ ' : ''}{a === 'yes' ? 'Yes' : 'No'}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function Group({
  title, blurb, group, open, rows, who,
}: {
  title: string;
  blurb: string;
  group: Circumstance[];
  open: Set<string>;
  // `asked` is the verbatim exhibit saveCircumstance stored beside his answer. It is optional so
  // that a caller holding only keys and answers still type checks, and progressIn() only ever
  // reads the two it has always read.
  rows: Array<{ key: string; answer: string; asked?: string | null }>;
  who: Persona;
}) {
  const given = new Map(rows.map((r) => [r.key, r.answer]));
  const exhibit = new Map(rows.map((r) => [r.key, r.asked ?? null]));
  // The persona keeps the denominator honest, both halves of it: a question lib/circumstances.ts
  // refuses for how he trades, or for whether he trades at all, is not "waiting for him", so it
  // never counts against him here. An answer he has already given stays drawn and changeable
  // whatever we now know about him, because the record is his. What it does NOT keep is the
  // promise: see NOT_HIS above for the row that counts while its `why` is withheld.
  const { answered, askable } = progressIn(group, rows, who);
  const drawable = group.filter((c) => open.has(c.key) || given.has(c.key));

  return (
    <section className="lek-card">
      <h2 className="lek-h2">{title}</h2>
      <p style={S.blurb}>{blurb}</p>
      {askable > 0 ? <p style={S.count}>{answered} of {askable} answered</p> : null}
      {drawable.length === 0 ? (
        <p style={S.quiet}>Nothing to ask you here yet.</p>
      ) : (
        <div style={S.stack}>
          {drawable.map((q) => (
            <QuestionCard
              key={q.key}
              q={q}
              current={given.get(q.key) ?? null}
              asked={exhibit.get(q.key) ?? null}
              mine={appliesTo(q, who)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE ONE THING HE TOLD US THAT THIS PAGE COULD NOT SHOW HIM.
//
// He ticks "A student loan" at /start and the signup reconcile writes it into his circumstances.
// Every group above is drawn from CIRCUMSTANCES, and `student_loan` is not in CIRCUMSTANCES and
// must not be (see the block above heldStudentLoan in lib/circumstances.ts: a key in that array is
// a question, and a new question moves the wizard's step count for everybody). So the answer was
// held and never rendered, on the page whose whole job is to be the record of what he told us.
//
// ⚠️ IT IS A RECORD, NOT A QUESTION, SO IT DRAWS NO BUTTONS AND SITS BELOW THE GROUPS.
//
// doc 103's honesty test: a control that cannot control is not a control. /api/circumstances
// refuses any key it cannot find in CIRCUMSTANCES, so a Yes and a No here would 400 every time a
// man pressed them. Worse, they would look exactly like the buttons ten rows above that do work.
// Putting it among the questions would read as one more thing waiting on him, which it is not.
//
// ⚠️ SO IT SAYS WHERE IT CAME FROM AND WHERE THE FIX LIVES, WHICH IS THE HONEST SUBSTITUTE.
//
// The fact is only half of it, and it is the half that is worth nothing on its own: the money
// hangs off the PLAN, which is on his users row and set at /app/tax/student-loan. That page is
// named and linked, because sending him to hunt for it is the same failure as no link at all.
//
// ⚠️ AND A MAN WHO NEVER TOLD US ANYTHING GETS NOTHING HERE. doc 103's empty test. A line saying
// "you have not told us about a student loan" would be true, useless, and on nearly every page on
// the product for ever, and a section that is usually empty is a section he stops reading. The
// man who does have one and never said so is already met on /app/tax/student-loan, in front of the
// plan setter, which is the screen that can actually do something about it.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const SL_SAID: Record<'yes' | 'no', string> = {
  yes: 'You told us you have a student loan.',
  no: 'You told us you do not have a student loan.',
};

// Where it came from, read off the exhibit stored beside his answer rather than assumed. The
// signup reconcile is the only writer today, but a sentence that says "at signup" about a row that
// came from somewhere else would be this page inventing provenance, which is the one thing the log
// exists to stop.
//
// ⚠️ THE TICK SENTENCE IS FOR A YES ONLY, AND THAT IS NOT FUSSINESS. What he did at signup was TICK
// a box, and the reconcile writes a row only when he ticked it, so there is no such thing as a no
// that came from a tick. If a no ever arrives carrying a signup exhibit, naming a tick would be us
// describing an act he never performed, on the page that exists to be the record of what he did.
const SL_FROM_SIGNUP = 'That came from the tick you put on the form when you signed up on the website.';
const SL_FROM_RECORD = 'That is what is on your record.';

// Said once, for both provenances, because it is the honesty of the whole card: there are no
// buttons on this one and he should be told why rather than left to wonder where they went.
const SL_NOT_ASKED_HERE = 'You have not been asked it here.';

// The plan is the half that pays, so a yes is sent to the screen that collects it. A no is sent
// nowhere except back, if it ever changes.
const SL_YES_PRE =
  'What we count is the plan you are on, because the thresholds differ by thousands between plans. '
  + 'Your ';
const SL_YES_POST = ' under Tax is where to set it, and where to put us right if this is wrong.';
const SL_NO_PRE = 'If that has changed, your ';
const SL_NO_POST = ' under Tax is where to tell us.';
const SL_LINK = 'student loan page';

function StudentLoanHeld({ rows }: {
  rows: Array<{ key: string; answer: string; asked?: string | null }>;
}) {
  const { state, asked } = heldStudentLoan(rows);
  // NOTHING AT ALL WHEN HE NEVER TOLD US. The empty test, and it is deliberate, not an oversight.
  if (state === 'untold') return null;
  const yes = state === 'yes';
  return (
    <section className="lek-card">
      <h2 className="lek-h2">Your student loan</h2>
      <p style={S.slSaid}>{SL_SAID[state]}</p>
      <p style={S.slNote}>
        {yes && writtenInFromSignup(asked) ? SL_FROM_SIGNUP : SL_FROM_RECORD}
        {' '}
        {SL_NOT_ASKED_HERE}
        {' '}
        {yes ? SL_YES_PRE : SL_NO_PRE}
        <a href="/app/tax/student-loan" style={S.slLink}>{SL_LINK}</a>
        {yes ? SL_YES_POST : SL_NO_POST}
      </p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE JOB HE TICKED AT SIGNUP, AND THE BOX THAT MAKES IT COUNT. Run 3, 13 August 2026.
//
// The student loan tick gets the section above: what he said, where it came from, and a LINK to
// the screen that collects the half that pays. The payroll job tick got none of that, and the half
// that pays is the salary AMOUNT, which lives on the National Insurance page inside a collapsed
// Tools row that nothing anywhere points at.
//
// Marcus Whitfield ticked "A PAYE job" on the website, was told "We ask for the exact figures once
// you are inside", and then read "16 answered, 0 still worth answering" on /app/you while the
// figure that sets the rate on every pound of his profit was still zero. He asked the chat in plain
// words, naming the amount, and was answered with a set aside that ignored it. On his own year that
// is a January bill of £3,492 shown against a true £7,234, and a student loan reading £0 against a
// true £1,320, because £25,649 of trade alone is under the Plan 2 threshold and £44,049 of total
// income is well over it. The engine stacks a salary correctly the moment it has one. Nothing asked.
//
// ⚠️ SAME SHAPE AS THE STUDENT LOAN, ON PURPOSE. A record and not a question, no buttons, the
// provenance said out loud, and the screen that can actually do something about it named and
// linked. Two ticks on one signup form should not get two different levels of care.
//
// ⚠️ AND NOTHING AT ALL FOR A MAN WHO SAID NO. doc 103's empty test, exactly as above.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const JOB_SAID = 'You told us you also have a job on the payroll.';
const JOB_PRE =
  'What we count is the salary, because a wage uses your allowance and your basic rate band before '
  + 'a penny of your profit is taxed, so it sets the rate your business is taxed at and it decides '
  + 'what January collects on your student loan. Your ';
const JOB_LINK = 'National Insurance page';
const JOB_POST = ' under Tax is where to put the figure in, and where to put us right if this is wrong.';

function EmploymentHeld({ rows }: {
  rows: Array<{ key: string; answer: string; asked?: string | null }>;
}) {
  const row = rows.find((r) => r.key === 'other_job');
  if (!row || row.answer !== 'yes') return null;
  return (
    <section className="lek-card">
      <h2 className="lek-h2">Your job on the payroll</h2>
      <p style={S.slSaid}>{JOB_SAID}</p>
      <p style={S.slNote}>
        {writtenInFromSignup(row.asked ?? null) ? SL_FROM_SIGNUP : SL_FROM_RECORD}
        {' '}
        {SL_NOT_ASKED_HERE}
        {' '}
        {JOB_PRE}
        <a href="/app/tax/ni" style={S.slLink}>{JOB_LINK}</a>
        {JOB_POST}
      </p>
    </section>
  );
}

export default async function CircumstancesPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fyou%2Fcircumstances');

  // 🔴 WHO HE IS COMES WITH THE ANSWERS, AND IT IS BOTH FACTS, NOT JUST THE STRUCTURE.
  //
  // Askability branches on both axes in lib/circumstances.ts, so a director is not shown "before
  // you went self employed" as a question still waiting on him, and neither is a landlord. Wave
  // nine: the Landlord chip on /start stores him as a sole trader, because he files a personal
  // return and is not a company, so the structure alone waved him through to a promise of an early
  // trade loss carried back against old wages that ITA 2007 s72 cannot give a property business.
  // Computed once here and handed to every gate and every count below. A failed profile read
  // passes null on both, which the module treats as unknown and asks everything.
  const [rows, biz] = await Promise.all([
    readCircumstances(user.id),
    getBusinessProfile(user.id).catch(() => null),
  ]);
  const who: Persona = { structure: biz?.businessType ?? null, income: biz?.incomeShape ?? null };

  // 🔴 A FAILED READ IS NEVER A BLANK SLATE. Drawing every question as open would ask a man
  // things he answered last month, and he only needs to notice once to stop answering the ones
  // worth thousands. Said plainly instead, with nothing else on the page to mislead.
  if (rows === null) {
    return (
      <main className="lek-wrap" style={S.wrap}>
        <style>{CSS}</style>
        <AppNav current="/app/you/circumstances" />
        <section className="lek-card">
          <h1 className="lek-eyebrow">Your circumstances</h1>
          <p style={S.warn}>
            We could not read your answers just this minute. Nothing is lost. Give it a moment and
            reload.
          </p>
        </section>
      </main>
    );
  }

  // The money queue and the compliance queue, asked of the module. unanswered() refuses the MTD
  // questions on purpose, so the MTD group has its own gate through unansweredMtd(). Both take the
  // whole persona, so what is "open" for this man is decided in one place for every surface.
  const open = new Set(unanswered(rows, who).map((c) => c.key));
  const openMtd = new Set(unansweredMtd(rows, who).map((c) => c.key));

  const overall = progressIn([...household(), ...notHousehold(), ...mtdQuestions()], rows, who);
  const waiting = overall.askable - overall.answered;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you/circumstances" />

      <section className="lek-card lek-head">
        <h1 className="lek-eyebrow">Your circumstances</h1>
        <p style={S.lede}>
          {overall.answered} answered{waiting > 0 ? `, ${waiting} waiting for you` : ', nothing waiting'}.
        </p>
        <p style={S.blurb}>
          None of this is on a receipt or in a bank feed, which is exactly why every app before us
          missed it. Answer what you can, change anything that has changed, and leave what you are
          not sure of. We never ask the same thing twice.
        </p>
      </section>

      <Group
        title="You and your household"
        blurb="You know every answer off the top of your head, and most of them are claimed by someone who is not you, so telling us is how they get claimed at all."
        group={household()}
        open={open}
        rows={rows}
        who={who}
      />

      <Group
        title="What you can claim"
        blurb="Each open one is a relief we cannot get you until you tell us. The biggest are at the top on purpose."
        group={notHousehold()}
        open={open}
        rows={rows}
        who={who}
      />

      <Group
        title="Where you stand with HMRC"
        blurb="These do not change a penny of your tax. They change what we do for you during the year."
        group={mtdQuestions()}
        open={openMtd}
        rows={rows}
        who={who}
      />

      {/* A RECORD, NOT A QUESTION, SO IT SITS AFTER THE QUESTIONS. Above the foot, because the foot
          is about answers he pressed and this is the one he never was asked. See StudentLoanHeld. */}
      <EmploymentHeld rows={rows} />
      <StudentLoanHeld rows={rows} />

      <p style={S.foot}>
        Every answer is saved the moment you press it, with the exact wording you read, so what we
        claim for you can always be shown to come from what you told us.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-head{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  lede: { fontSize: TYPE.lead, fontWeight: 800, letterSpacing: '-0.01em', margin: `0 0 ${SPACE.xs}px`, color: RIVER_DEEP },
  blurb: { fontSize: TYPE.note, lineHeight: 1.6, color: MUTED, margin: `0 0 ${SPACE.sm}px`, maxWidth: '62ch' },
  count: { fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: `0 0 ${SPACE.sm}px` },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0 },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: 0 },

  stack: { display: 'flex', flexDirection: 'column', gap: SPACE.xs },

  q: { border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: 15, background: PANEL },
  ask: { fontSize: TYPE.strong, lineHeight: 1.45, fontWeight: 700, margin: '0 0 7px' },
  why: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0 },
  // Deliberately the same weight and colour as `why`, not a warning. It is not an alarm, it is the
  // plain sentence that stands where the promise would have been.
  notHis: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0 },
  whose: { fontSize: TYPE.note, lineHeight: 1.5, color: RIVER_DEEP, background: RIVER_TINT, borderRadius: RADIUS.sm, padding: '9px 11px', margin: '10px 0 0' },
  said: { fontSize: TYPE.note, fontWeight: 700, color: INK, margin: '10px 0 0' },

  // The held answer. INK and MUTED on the card's own PANEL, and the link is RIVER on PANEL, never
  // an accent on its own tint. All three clear AA in both themes: see test/contrastapplication.
  slSaid: { fontSize: TYPE.body, lineHeight: 1.5, fontWeight: 700, color: INK, margin: 0, maxWidth: '62ch' },
  slNote: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '8px 0 0', maxWidth: '62ch' },
  slLink: { color: RIVER, fontWeight: 700, textDecoration: 'underline' },

  answers: { display: 'flex', gap: SPACE.xs, marginTop: 13 },
  aForm: { flex: 1, margin: 0 },
  yes: { width: '100%', background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '13px 0', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  no: { width: '100%', background: PANEL, color: MUTED, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '13px 0', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  pressed: { outline: `2px solid ${RIVER_DEEP}`, outlineOffset: 1 },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
