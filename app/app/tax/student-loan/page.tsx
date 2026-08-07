import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getOptimiserInput, getStudentLoanSettings, readCircumstances } from '../../../../lib/supabase';
import { taxPosition } from '../../../../lib/taxoptimiser';
import { STUDENT_PLANS, type StudentPlan } from '../../../../lib/nistudentloan';
import { asPercent } from '../../../../lib/taxengine';
import { gbp0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, SPACE, TYPE } from '../../../../lib/tokens';
import { INK, MUTED, ON_RIVER, PAPER, RIVER_DEEP } from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// STUDENT LOAN. A tools screen, checked about once a year, reached from the Tax hub's Tools row
// under doc 103's once test. He checks his plan once in his life; January is when it matters.
//
// ⚠️ THE JANUARY FIGURE IS taxPosition()'s OWN studentLoan FIELD, the same one already inside the
// set aside number on the Overview, netted for whatever payroll takes on any salary. This page
// computes nothing: two screens with two loan figures is how a man gets promised a refund that
// does not exist, and this product has done that once already.
//
// ⚠️ THE SHOCK THIS SCREEN EXISTS TO PREVENT: the self employed do not repay as they go. The
// whole year's repayment lands in one lump with the January bill, and most tax apps forget the
// loan exists until it does.
//
// 🔴 AND NOW HE CAN TELL US HIS PLAN FROM THE WEB. Until this form existed the plan could only be
// set over WhatsApp, so a web only customer read "we do not count it" with no way to fix it, and
// his set aside was quietly too low. The form writes to /api/you/financials, his own fact, ungated.

const PLAN_LABELS: Record<StudentPlan, string> = {
  plan1: 'Plan 1',
  plan2: 'Plan 2',
  plan4: 'Plan 4 (Scotland)',
  plan5: 'Plan 5',
  postgrad: 'Postgraduate loan',
};

export default async function StudentLoanPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fstudent-loan');

  const sp = await searchParams;
  const one = (k: string): string | undefined => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const saved = one('done') === 'saved';
  const failed = one('e') !== undefined;

  // 🔴 WHETHER HE ALREADY TOLD US, WHICH IS NOT THE SAME QUESTION AS WHICH PLAN HE IS ON.
  //
  // He can tick "A student loan" at /start, and until 7 August 2026 that tick was dropped on the
  // floor: this page then told a man who had told us that he had not told us, and his set aside
  // silently missed the repayment until he found this screen himself. The tick now writes a
  // circumstance (reconcileSignupToUser) and this page reads it, so the sentence below is true
  // either way. The PLAN is still only ever his to give: the thresholds differ by thousands between
  // plans, so guessing one would put a wrong figure on his Overview under our name.
  const [optimiser, fin, circumstances] = await Promise.all([
    getOptimiserInput(user.id),
    getStudentLoanSettings(user.id),
    readCircumstances(user.id).catch(() => []),
  ]);
  // ⚠️ null IS "WE COULD NOT READ", NEVER "HE ANSWERED NOTHING", and the sentence below has to
  // respect that or a database wobble turns into us telling a man he never mentioned his loan.
  const answersKnown = Array.isArray(circumstances);
  const toldUsAtSignup = (circumstances ?? []).some((c) => c.key === 'student_loan' && c.answer === 'yes');
  const plans = (optimiser.studentPlans ?? []) as StudentPlan[];
  const tax = taxPosition(optimiser);
  const currentPlan = fin?.plan ?? '';
  const currentPostgrad = fin?.postgrad ?? false;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {plans.length === 0 ? (
        <section className="lek-card">
          <h1 className="lek-h2">Student loan</h1>
          <p style={S.body}>
            {!answersKnown
              ? 'We could not check what you have already told us just now, so nothing is counted for a student loan yet.'
              : toldUsAtSignup
                ? 'You told us when you signed up that you have a student loan. We still need to know which plan you are on before we can count it.'
                : 'You have not told us about a student loan, so nothing is counted for one.'}
          </p>
          <p style={S.quiet}>
            {answersKnown && toldUsAtSignup ? 'Set your plan below. ' : 'If you do have one, set your plan below. '}
            Self Assessment collects the whole year&apos;s repayment in one lump with the January
            bill, and until we know your plan, the set aside figure on your Overview does not
            include it.
          </p>
        </section>
      ) : (
        <>
          <section className="lek-card">
            <h1 className="lek-h2">What January collects</h1>
            <div className="lek-big" style={S.figure}>{gbp0(tax.studentLoan)}</div>
            <p style={S.quiet}>
              {tax.studentLoan > 0
                ? 'Collected with the January tax bill, not month by month. It is already inside the set aside figure on your Overview, so putting that by covers this too.'
                : 'Your income is on course to stay under your threshold, so nothing is collected this year. If the year grows, this figure moves with it.'}
              {optimiser.employmentIncome > 0
                ? ' Whatever payroll already takes on your wages is counted, so this is only what Self Assessment adds.'
                : ''}
            </p>
          </section>

          {/* His plan, and the facts of it, straight from the engine's own table. */}
          {plans.map((p) => {
            const plan = STUDENT_PLANS[p];
            return (
              <section key={p} className="lek-card">
                <h2 className="lek-h2">{PLAN_LABELS[p]}</h2>
                <p style={S.body}>
                  {asPercent(plan.rate)}% of income above {gbp0(plan.threshold)} a year. Below the
                  threshold, nothing is repaid at all.
                </p>
                <p style={S.quiet}>Written off {plan.writeOff}.</p>
              </section>
            );
          })}
        </>
      )}

      {/* The setter. No client script: a plain form POST that the route turns into a 303, so a
          refresh cannot save twice. */}
      <section className="lek-card">
        <h2 className="lek-h2">Your student loan plan</h2>
        <p style={S.quiet}>
          Tell us your plan and Lekhio counts the repayment inside your set aside, so January is not
          a surprise. Not sure which you are on? It is on your original student finance letters, or
          in your online student loan account.
        </p>
        {saved ? <p style={S.good}>Saved. Your set aside now reflects it.</p> : null}
        {failed ? <p style={S.warn}>That did not save. Give it a moment and try again.</p> : null}
        <form method="post" action="/api/you/financials" style={S.form}>
          <input type="hidden" name="section" value="studentloan" />
          <label style={S.label} htmlFor="sl-plan">Plan</label>
          <select id="sl-plan" name="plan" defaultValue={currentPlan} style={S.input}>
            <option value="none">No student loan</option>
            <option value="plan1">Plan 1</option>
            <option value="plan2">Plan 2</option>
            <option value="plan4">Plan 4 (Scotland)</option>
            <option value="plan5">Plan 5</option>
          </select>
          <label style={S.check}>
            <input type="checkbox" name="postgrad" defaultChecked={currentPostgrad} style={S.checkbox} />
            <span>I also have a postgraduate loan</span>
          </label>
          <button type="submit" style={S.button}>Save my plan</button>
        </form>
      </section>
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns the one figure and the form.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-big{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },
  figure: { color: RIVER_DEEP, margin: `${SPACE.hair}px 0 0` },

  good: { fontSize: TYPE.note, color: RIVER_DEEP, fontWeight: 700, margin: '12px 0 0' },
  warn: { fontSize: TYPE.note, color: INK, fontWeight: 700, margin: '12px 0 0' },
  form: { display: 'flex', flexDirection: 'column', gap: `${SPACE.sm}px`, margin: `${SPACE.md}px 0 0`, maxWidth: '28rem' },
  label: { fontSize: TYPE.note, fontWeight: 700, color: INK, margin: '0 0 -6px' },
  input: {
    fontSize: 16, padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${MUTED}`,
    background: PAPER, color: INK, fontFamily: FONT, width: '100%',
  },
  check: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: TYPE.body, color: INK, margin: '4px 0' },
  checkbox: { fontSize: 16, width: 20, height: 20 },
  button: {
    fontSize: 16, fontWeight: 700, padding: '13px 20px', borderRadius: 10, border: 'none',
    background: RIVER_DEEP, color: ON_RIVER, fontFamily: FONT, cursor: 'pointer', marginTop: `${SPACE.hair}px`,
  },
};
