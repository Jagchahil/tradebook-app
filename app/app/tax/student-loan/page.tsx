import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getOptimiserInput } from '../../../../lib/supabase';
import { taxPosition } from '../../../../lib/taxoptimiser';
import { STUDENT_PLANS, type StudentPlan } from '../../../../lib/nistudentloan';
import { asPercent } from '../../../../lib/taxengine';
import { gbp0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, SPACE, TYPE } from '../../../../lib/tokens';
import { INK, MUTED, PAPER, RIVER_DEEP } from '../../../../lib/apptheme';
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

export default async function StudentLoanPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const optimiser = await getOptimiserInput(user.id);
  const plans = (optimiser.studentPlans ?? []) as StudentPlan[];
  const tax = taxPosition(optimiser);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {plans.length === 0 ? (
        <section className="lek-card">
          <h1 className="lek-h2">Student loan</h1>
          <p style={S.body}>You have not told us about a student loan, so nothing is counted for one.</p>
          <p style={S.quiet}>
            If you do have one, it matters: Self Assessment collects the whole year&apos;s
            repayment in one lump with the January bill, and until we know your plan, the set aside
            figure on your Overview does not include it.
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
                <h2 className="lek-h2">{plan.label}</h2>
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
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns only the one figure.
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
};
