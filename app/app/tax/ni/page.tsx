import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getBusinessProfile, getOptimiserInput, getStudentLoanSettings } from '../../../../lib/supabase';
import { niPosition, NI_FACTS } from '../../../../lib/nistudentloan';
import { FACTS, asPercent } from '../../../../lib/taxengine';
import { gbp0, gbp2 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import { GREEN_TINT, INK, MUTED, ON_GREEN_TINT, ON_RIVER, PAPER, RIVER_DEEP } from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// NATIONAL INSURANCE. A tools screen, checked a few times a year, reached from the Tax hub's
// Tools row under doc 103's once test.
//
// ⚠️ EVERY FIGURE COMES FROM lib/nistudentloan.ts's niPosition(), the same engine the public NI
// checker runs, and every threshold printed is FACTS or NI_FACTS by name. Not one rate is typed
// here: test/onlyoneengine.test.mjs fails the build if a page ever carries the law itself.
//
// ⚠️ THE WINDOW IS SAID ON EVERY NUMBER. Class 4 here is on his profit SO FAR this year, because
// this screen is a breakdown he checks occasionally, not the projection the Overview's set aside
// already carries. Two screens showing different numbers with the same label is the drift this
// codebase keeps paying for, so the label does the work: "so far", never "for the year".
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND UNTIL 31 JULY 2026 IT OPENED BY TELLING EVERY READER HE WAS SELF EMPLOYED.
//
// Class 4 and Class 2 are both National Insurance on a TRADE, and two paying customers do not carry
// one. The page offered them to both, priced Class 4 off a profit that was not theirs, and pushed
// voluntary Class 2 at a man who cannot buy it.
//
//   A DIRECTOR      Class 4 is charged on the profits of a trade and collected through Self
//                   Assessment; Class 2 has been voluntary since April 2024 and buys a year on the
//                   State Pension record. Neither touches a company's profit. What he pays is
//                   Class 1 primary on the salary the company pays him, and the company pays
//                   Class 1 secondary on top. So the Class 4 card is not shown to him at all: it
//                   was pricing the company's profit as though it were his.
//
//   A LANDLORD      HMRC's NIM74250: "A person whose activities in managing the property are those
//   WITH NO TRADE   generally associated with being a landlord would not meet the definition of
//                   gainful employment for self-employed NICs purposes." So there are no relevant
//                   profits, nothing to fall under the small profits threshold, and no voluntary
//                   Class 2 at a few pounds a week. His route to a qualifying year is Class 3, at
//                   several times the price, and that is a different sentence from the one he was
//                   being shown. The same page carries the exception that makes caution right: a
//                   guest house or a hotel IS a trade, so the copy says so rather than closing a
//                   door on him.
//                   ⚠️ And his sentence is said on an empty year too, where a trader's is held
//                   back. A trader's answer changes when money arrives; a landlord's does not,
//                   because no amount of rent ever buys the year, so "nothing to weigh up yet"
//                   would be a promise that something is coming.
//
// ⚠️ UNKNOWN KEEPS TODAY'S PAGE, ON BOTH AXES. getBusinessProfile defaults an unset structure to
// sole trader and returns a null income shape when we were never told, and null falls through to
// the trade branch. Refusing a real sole trader his Class 2 sentence because a read failed would
// cost him a year of State Pension, which is the one failure here that cannot be undone later.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function NiPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fni');

  const sp = await searchParams;
  const savedIncome = (Array.isArray(sp.done) ? sp.done[0] : sp.done) === 'saved';
  const failedIncome = (Array.isArray(sp.e) ? sp.e[0] : sp.e) !== undefined;

  const [optimiser, biz, fin] = await Promise.all([
    getOptimiserInput(user.id),
    getBusinessProfile(user.id).catch(() => null),
    getStudentLoanSettings(user.id),
  ]);
  const profit = Math.max(0, optimiser.ytdTradeIncome - optimiser.ytdTradeExpenses);
  const salary = Math.max(0, optimiser.employmentIncome);
  const ni = niPosition(salary, profit);

  // Prefill the "other income" form from what he has already told us. Computed here, not inline in
  // the tag, because a `>` inside the JSX breaks the phone-width guard's tag matcher.
  const empDefault = fin && fin.employmentIncome > 0 ? String(fin.employmentIncome) : '';
  const savDefault = fin && fin.savingsIncome > 0 ? String(fin.savingsIncome) : '';
  const divDefault = fin && fin.dividendIncome > 0 ? String(fin.dividendIncome) : '';

  // The two axes, each biting only on an explicit answer, and the trade test written as two
  // inequalities so that undefined and null both fall through to the old behaviour. This is the
  // same shape lib/taxoptimiser.ts uses to withhold the use of home flat rate, for the same reason.
  const isCompany = biz?.businessType === 'limited_company';
  const propertyOnly = biz?.incomeShape === 'property_only';
  const hasTradeNic = !isCompany && !propertyOnly;

  // Said in two branches below, so it is written once. A year on the record through wages is true
  // for a director on his own payroll and for a landlord with a job, and it is the one State
  // Pension sentence that does not depend on carrying on a trade.
  const viaWages = `Your wages are over ${gbp0(NI_FACTS.class1LowerEarningsLimit)}, so this year `
    + 'counts towards your State Pension through your job. Nothing to do.';

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      <section className="lek-card">
        <h1 className="lek-h2">National Insurance</h1>
        {/* Who the two trade classes belong to, said before any figure, because the wrong opening
            sentence here is what made every figure under it read as his. */}
        {hasTradeNic ? (
          <p style={S.body}>
            Two classes matter to the self employed: Class 4, which is charged on profit and
            collected with your tax bill, and Class 2, which has been voluntary since April 2024 and
            only matters for your State Pension record.
          </p>
        ) : isCompany ? (
          <p style={S.body}>
            Class 4 is charged on the profits of a trade and Class 2 is the voluntary one behind a
            State Pension year. Neither touches your company&apos;s profit. What you pay is Class 1
            on the salary the company pays you, taken on the payslip, and the company pays its own
            Class 1 on top of it.
          </p>
        ) : (
          <p style={S.body}>
            Class 4 and Class 2 are both National Insurance on a trade, and letting property is not
            one, so there is no National Insurance on your rent. If what you run is a guest house or
            a hotel then that is a trade, and the trade rules apply instead.
          </p>
        )}
      </section>

      {/* ── CLASS 4. The one that costs money, and only for a man whose profit it is charged on.
          A director's trade figures are the company's, and a landlord has no trade profit at all,
          so neither is shown a Class 4 base that was never theirs. ──────────────────────────── */}
      {hasTradeNic ? (
        <section className="lek-card">
          <div style={S.figRow}>
            <div>
              <div className="lek-tile-label">Class 4 so far this year</div>
              <div className="lek-big">{gbp2(ni.class4)}</div>
            </div>
          </div>
          <p style={S.quiet}>
            On your confirmed profit of {gbp2(profit)}. Nothing below {gbp0(FACTS.class4LowerLimit)},
            then {asPercent(FACTS.class4MainRate)}% up to {gbp0(FACTS.class4UpperLimit)}, then{' '}
            {asPercent(FACTS.class4UpperRate)}% above that. It is collected through Self Assessment
            with your tax, never as a separate bill, and it is already inside the set aside figure on
            your Overview.
          </p>
        </section>
      ) : null}

      {/* ── CLASS 2. The £3.65 a week decision, and only when it is genuinely his to make. ───── */}
      <section className="lek-card">
        <h2 className="lek-h2">
          {hasTradeNic ? 'Class 2 and your State Pension' : 'Your State Pension record'}
        </h2>
        {hasTradeNic ? (
          ni.qualifiesViaProfits ? (
            <p style={S.good}>
              Your profits are over {gbp0(FACTS.class2SmallProfitsThreshold)}, so this year counts
              towards your State Pension without you paying a penny of Class 2. Nothing to do.
            </p>
          ) : ni.qualifiesViaEmployment ? (
            <p style={S.good}>{viaWages}</p>
          ) : ni.voluntaryClass2Suggested ? (
            <p style={S.body}>
              This year is not on course to count towards your State Pension: profits under{' '}
              {gbp0(FACTS.class2SmallProfitsThreshold)} and no wages doing it for you. You can pay
              Class 2 voluntarily, {gbp2(ni.class2Voluntary.weeklyRate)} a week, about{' '}
              {gbp2(ni.class2Voluntary.annual)} a year, to keep the record whole. Your decision, and
              worth a look before the year is settled.
            </p>
          ) : (
            <p style={S.quiet}>
              Nothing to weigh up yet. Once there is money in the year, this tells you whether the
              year counts towards your State Pension and what Class 2 could do about it.
            </p>
          )
        ) : ni.qualifiesViaEmployment ? (
          // A wage over the lower earnings limit counts the year whoever pays it, including his own
          // company. This is the whole reason the small salary rung on Pay yourself exists.
          <p style={S.good}>{viaWages}</p>
        ) : isCompany ? (
          <p style={S.body}>
            Class 2 belongs to a trade, and your company&apos;s profit is not one, so it is not a
            route open to you. What counts a year towards your State Pension is the salary the
            company pays you, and the Class 1 on that is taken on the payslip.
          </p>
        ) : (
          <p style={S.body}>
            Letting property is not gainful employment for National Insurance, so there are no
            profits here to fall under the small profits threshold and no Class 2 to pay at a few
            pounds a week. Filling a gap in your record means Class 3 instead, which costs several
            times more, so it is worth checking your record while the year can still be changed.
          </p>
        )}
      </section>

      {/* ── EMPLOYED TOO. Only drawn for a man with wages, doc 103's empty test. ─────────────── */}
      {salary > 0 ? (
        <section className="lek-card">
          <h2 className="lek-h2">Your job&apos;s National Insurance</h2>
          <p style={S.quiet}>
            About {gbp2(ni.class1)} of Class 1 comes off a {gbp2(salary)} salary across the year,
            taken by your employer on the payslip. Nothing for you to do with it here.
          </p>
          {/* The annual maximum is about paying Class 1 AND Class 4 in one year. Without a trade
              there is no Class 4 to stack, so the flag would be reading off a profit figure that is
              not his in the first place. */}
          {hasTradeNic && ni.annualMaximaMayApply ? (
            <p style={S.quiet}>
              Paying both Class 1 and Class 4 at your level can go over HMRC&apos;s annual maximum,
              and the excess is refundable. Working the exact figure needs your full contribution
              record, which we do not hold, so we flag it rather than guess it. Worth raising when
              your return is prepared.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── YOUR OTHER INCOME. The set aside and the marginal rate need a PAYE salary, savings
          interest and dividends, and until this form existed only the WhatsApp flow could set them,
          so a web only customer had them stuck at zero and his figure was too low. Posts to
          /api/you/financials, his own facts, ungated. ─────────────────────────────────────────── */}
      <section className="lek-card">
        <h2 className="lek-h2">Your other income</h2>
        <p style={S.quiet}>
          If you also take a wage from a job, or earn savings interest or dividends, tell us here so
          your set aside and your rate are worked out on your whole income, not just the trade. Leave
          a box empty if it does not apply.
        </p>
        {savedIncome ? <p style={S.saved}>Saved. Your figures now include it.</p> : null}
        {failedIncome ? <p style={S.quiet}>That did not save. Give it a moment and try again.</p> : null}
        <form method="post" action="/api/you/financials" style={S.form}>
          <input type="hidden" name="section" value="income" />
          <label style={S.label} htmlFor="ni-emp">PAYE salary from a job, per year</label>
          <input id="ni-emp" name="employment_income" inputMode="numeric" placeholder="0" defaultValue={empDefault} style={S.input} />
          <label style={S.label} htmlFor="ni-sav">Savings interest, per year</label>
          <input id="ni-sav" name="savings_income" inputMode="numeric" placeholder="0" defaultValue={savDefault} style={S.input} />
          <label style={S.label} htmlFor="ni-div">Dividends, per year</label>
          <input id="ni-div" name="dividend_income" inputMode="numeric" placeholder="0" defaultValue={divDefault} style={S.input} />
          <button type="submit" style={S.button}>Save</button>
        </form>
      </section>
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns only the figure row.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-big{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },
  good: { fontSize: TYPE.body, lineHeight: 1.6, color: ON_GREEN_TINT, background: GREEN_TINT, borderRadius: RADIUS.md, padding: '12px 14px', margin: 0 },

  figRow: { display: 'flex', gap: SPACE.lg, flexWrap: 'wrap' },

  saved: { fontSize: TYPE.note, color: RIVER_DEEP, fontWeight: 700, margin: '12px 0 0' },
  form: { display: 'flex', flexDirection: 'column', gap: `${SPACE.sm}px`, margin: `${SPACE.md}px 0 0`, maxWidth: '28rem' },
  label: { fontSize: TYPE.note, fontWeight: 700, color: INK, margin: '0 0 -6px' },
  input: { fontSize: 16, padding: '12px 14px', borderRadius: RADIUS.md, border: `1.5px solid ${MUTED}`, background: PAPER, color: INK, fontFamily: FONT, width: '100%' },
  button: { fontSize: 16, fontWeight: 700, padding: '13px 20px', borderRadius: RADIUS.md, border: 'none', background: RIVER_DEEP, color: ON_RIVER, fontFamily: FONT, cursor: 'pointer', marginTop: `${SPACE.hair}px` },
};
