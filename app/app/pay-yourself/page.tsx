import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { getOptimiserInput, getBusinessProfile, readCircumstances } from '../../../lib/supabase';
import { payModel, type BusinessType, type PayPlan } from './plan';
import { bankFeedOffered } from '../../../lib/bankfeed';
import { gbp0 } from '../../../lib/money';
import { A11Y_CSS, APP_CSS, BREAK, FONT, SPACE, TYPE } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, PAPER, RIVER, RIVER_DEEP, RIVER_TINT, edge,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PAY YOURSELF. The most tax efficient way to take his own money out, said once, for the
// structure he actually trades under.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ EVERY FIGURE IS AN ENGINE'S, ROUTED THROUGH ./plan.ts, AND THE PAGE ADDS NOTHING.
//
// The structure comes from getBusinessProfile, the same source /app/tax/what-if and lib/agent.ts
// read, so this page cannot disagree with them about how he trades. A sole trader and a partner
// get taxPosition() on getOptimiserInput, the SAME call the Overview and /app/tax make, so the
// set aside here is the set aside there to the pound. A director gets payYourself() in
// lib/payyourself.ts, whole: the rungs, the reasons, and the wall. A page that priced a salary or
// a dividend for itself would be a second tax engine, and test/onlyoneengine.test.mjs fails the
// build over exactly that.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THIS PAGE PREPARES. IT NEVER MOVES MONEY. It runs no payroll, declares no dividend and
// touches no account. The footer says so in the customer's own language, because the approval
// doctrine (CLAUDE.md, doc 104) is the product, not a chore: nothing happens unless he does it.
//
// ⚠️ THE GATE: THIS IS A READ, AND READS STAY AVAILABLE. lib/gate.ts's doctrine: when a trial
// ends he can always SEE his books; what stops is anything that makes us do new work for him.
// This screen asks for nothing new. It is the same confirmed figures every other screen already
// shows, arranged around one question, with no form, no POST and no API route of its own. So it
// does not call gateForUser and it never locks, exactly like /app/tax and /app/tax/what-if.
// Locking a man out of understanding his own pay would be gating the way to his data.
//
// ⚠️ DOC 103'S ONCE TEST PLACES THIS SCREEN. He works out how to pay himself once a year, so it
// lives one tap away, never on the daily screens. Until the nav grows a row for it, it lights up
// the Tax tab the way the tools screens do, and the desired row is behind the Tax hub's Tools
// drawer, beside NI and CIS, where the once a year screens live.

export default async function PayYourselfPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fpay-yourself');

  const [optimiser, biz, answers] = await Promise.all([
    getOptimiserInput(user.id),
    getBusinessProfile(user.id).catch(() => null),
    // ⚠️ NULL IS AN UNREADABLE READ, NEVER A "no". It falls through to the unsure wording below,
    // which is the direction that cannot tell him a bill is settled when it may not be.
    readCircumstances(user.id).catch(() => null),
  ]);
  const structure: BusinessType = biz?.businessType ?? 'sole_trader';
  // The one answer this screen needs, read the same way /app/you reads its answers. An answer we
  // do not have is null, and null is spelled "unsure" on the screen, never "no".
  const raw = answers?.find((a) => a.key === 'other_wages')?.answer ?? null;
  const otherWages: 'yes' | 'no' | null = raw === 'yes' || raw === 'no' ? raw : null;

  const model = payModel(structure, optimiser);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax" />

      {/* ── NOTHING CONFIRMED YET. An honest short state, naming the one thing that fills it. ──
          A DIRECTOR'S EMPTY STATE IS THE EXCEPTION, AND IT IS STILL NOT A FIGURE. The efficient
          shape of company pay does not depend on the profit, so a brand new director gets the
          shape now, from the engine's own rungs via ./plan.ts, with nothing priced: pricing needs
          a profit we do not hold, and an invented one would be a guess dressed as advice. */}
      {model.kind === 'nothing_yet' ? (
        model.rungs ? (
          <>
            <section className="lek-card">
              <h1 className="lek-h2">Paying yourself from the company</h1>
              <p style={S.body}>
                No confirmed money yet, so there are no figures here. The shape is still worth two
                minutes, because it is the same at any profit: a small salary first, then dividends
                out of what the company keeps after Corporation Tax.
              </p>
              <p style={S.quiet}>
                The salary is a company cost, so it comes off the profit before Corporation Tax is
                worked out. Dividends carry no National Insurance at all. That pairing is why
                salary first and dividends second is the efficient shape, and it is the order
                everything on this page will be priced in once your money arrives.
              </p>
            </section>
            <section className="lek-card">
              <h2 className="lek-h2">The three salaries worth knowing</h2>
              <p style={S.quiet}>
                Each is a line the tax rules draw, not a recommendation. Which one wins depends on
                figures you do not have yet, and the catch worth knowing early is the State
                Pension one.
              </p>
              {model.rungs.map((r) => (
                <div key={r.salary} style={S.owe}>
                  <div style={S.oweTop}>
                    <span style={S.oweLabel}>{gbp0(r.salary)} salary</span>
                  </div>
                  <p style={S.oweBasis}>{r.why}</p>
                </div>
              ))}
              {/* The bank half of the sentence returns with bankFeedOffered(). */}
              <p style={S.quiet}>
                Your own figures appear here the moment the money you confirm builds a profit:
                {bankFeedOffered()
                  ? ' connect the bank or log what the company has earned, and this page prices every rung,'
                  : ' log what the company has earned, and this page prices every rung,'}
                {' '}the dividends on top, and what the next thousand pounds would cost you.
              </p>
            </section>
          </>
        ) : (
          <section className="lek-card">
            <h1 className="lek-h2">Paying yourself</h1>
            <p style={S.empty}>Nothing to work out yet.</p>
            {/* The bank half of the sentence returns with bankFeedOffered(). */}
            <p style={S.quiet}>
              Once the money you have confirmed builds up a profit, this page shows the most tax
              efficient way to take it out, worked out for how you trade.
              {bankFeedOffered()
                ? ' Connect your bank or log what you have earned, and it fills in by itself.'
                : ' Log what you have earned, and it fills in by itself.'}
            </p>
          </section>
        )
      ) : null}

      {/* ── A SOLE TRADER OR A PARTNER. Drawings, not wages, and the truth said plainly. ─────── */}
      {model.kind === 'drawings' ? (
        <>
          <section className="lek-card">
            <h1 className="lek-h2">
              {model.structure === 'partnership' ? 'Paying yourself as a partner' : 'Paying yourself as a sole trader'}
            </h1>
            {model.structure === 'partnership' ? (
              <>
                <p style={S.body}>
                  Partners are not employees of the firm. What you take out is a drawing against
                  your share of the profit, it is not a wage, and it is never taxed as one. There
                  is no payroll to run and no PAYE. The tax follows your share of the profit,
                  whether you draw it or not.
                </p>
                {model.partnershipNote ? <p style={S.quiet}>{model.partnershipNote}</p> : null}
                {biz ? (
                  <p style={S.quiet}>
                    These figures are your share of the firm&apos;s books, which is what you are
                    taxed on. We have your share as {biz.partnershipShare}%.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p style={S.body}>
                  You and the business are the same person in law. What you take out is a drawing,
                  it is not a wage, and it is never taxed as one. There is no payroll to run and no
                  PAYE. The tax follows the profit, all of it, whether you draw it or not, so
                  moving money between accounts changes nothing.
                </p>
                <p style={S.quiet}>
                  Which means the most tax efficient way to pay yourself is also the simplest one:
                  keep the tax back first, then take what you need. There is no salary trick you
                  are missing.
                </p>
              </>
            )}
          </section>

          <section className="lek-card">
            <h2 className="lek-h2">What that means each month</h2>
            {model.monthly ? (
              <>
                <div className="lek-grid">
                  <div className="lek-tile">
                    <div className="lek-tile-label">
                      {model.structure === 'partnership' ? 'Your share makes about' : 'The business makes about'}
                    </div>
                    <div className="lek-tile-value">{gbp0(model.monthly.profit)}</div>
                  </div>
                  <div className="lek-tile">
                    <div className="lek-tile-label">Keep back for tax</div>
                    <div className="lek-tile-value">{gbp0(model.monthly.keepBack)}</div>
                  </div>
                  <div className="lek-tile">
                    <div className="lek-tile-label">Yours to draw, about</div>
                    <div className="lek-tile-value">{gbp0(model.monthly.draw)}</div>
                  </div>
                </div>
                <p style={S.body2}>
                  The keep back is one twelfth of the {gbp0(model.setAside)} the year is heading
                  for, the same set aside the Tax screen shows, so the two can never disagree.
                  {' '}{model.basis ?? ''}
                </p>
                {!model.monthly.covered ? (
                  <p style={S.quiet}>
                    This year the monthly keep back is bigger than the business&apos;s own monthly
                    profit, because the set aside also carries tax on income from outside the
                    business. Keep the whole set aside back first. What is left over after it, from
                    everything you earn, is what is safe to spend.
                  </p>
                ) : null}
              </>
            ) : (
              <p style={S.body}>
                Too early in the year to call a safe monthly figure: a projection needs about three
                months of confirmed money before it is honest. What the year so far has built up to
                set aside is {gbp0(model.setAside)}, and the monthly figure appears here as soon as
                it can be trusted.
              </p>
            )}
          </section>
        </>
      ) : null}

      {/* ── A COMPANY DIRECTOR. Salary, then dividends, then the wall, all the engine's own. ─── */}
      {model.kind === 'company' ? (
        <CompanyShape profit={model.profit} plan={model.plan} otherWages={otherWages} />
      ) : null}

      {/* THE STANDING LINE. This page prepares understanding, and that is all it does. Said at
          the bottom on every branch, because every branch raises the same question. */}
      <p style={S.foot}>
        Lekhio prepares these figures from what you have confirmed, so you can see the shape before
        you act. It never moves money. Nothing happens unless you do it.
      </p>
    </main>
  );
}

// The director's shape, drawn whole from one payYourself() answer. A component rather than a
// second page so the footer, the nav and the gate reasoning stay written exactly once.
function CompanyShape(
  { profit, plan, otherWages }: { profit: number; plan: PayPlan; otherWages: 'yes' | 'no' | null },
) {
  const best = plan.best;
  // The winning rung, matched by identity: best IS one of the rung plans, never a re-derivation.
  const bestRung = plan.rungs.find((r) => r.plan === best) ?? plan.rungs[0];

  return (
    <>
      <section className="lek-card lek-position">
        <h1 className="lek-eyebrow">Paying yourself from the company</h1>
        <div className="lek-hero">{gbp0(best.takeHome)}</div>
        <p className="lek-heronote">
          What you would keep of the {gbp0(profit)} the company has made since 6 April: a salary of{' '}
          {gbp0(best.salary)} first, then {gbp0(best.dividends)} of dividends. Confirmed figures
          only, nothing projected, and worked out as if this is your only income.
        </p>
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">Why {gbp0(best.salary)} of salary</h2>
        <p style={S.body}>{bestRung.why}</p>
        <p style={S.quiet}>
          Dividends come on top, out of what is left after Corporation Tax. That order, salary
          first and dividends second, is what the whole comparison below is priced on.
        </p>
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">What the company owes</h2>
        <div style={S.owe}>
          <div style={S.oweTop}>
            <span style={S.oweLabel}>Corporation Tax</span>
            <span style={S.oweFig}>{gbp0(best.corpTax)}</span>
          </div>
          <p style={S.oweBasis}>
            On the {gbp0(best.ctProfit)}{' '}of profit left after your salary. The salary is a company
            cost, so it comes off before Corporation Tax is worked out, which is part of why paying
            one is efficient. This is the company&apos;s own bill, paid from the company&apos;s
            account, not yours.
          </p>
        </div>
        {best.employerNI > 0 ? (
          <div style={S.owe}>
            <div style={S.oweTop}>
              <span style={S.oweLabel}>Employer National Insurance</span>
              <span style={S.oweFig}>{gbp0(best.employerNI)}</span>
            </div>
            <p style={S.oweBasis}>
              The company owes this on salary above the employer threshold. It is already counted
              in the take home figure at the top, and it is the cost the lower salary rungs below
              exist to avoid.
            </p>
            {/* ═══════════════════════════════════════════════════════════════════════════════
                🔴 THE EMPLOYMENT ALLOWANCE, WHICH THIS PRODUCT DID NOT KNOW EXISTED UNTIL TODAY.
                Run 6, 14 August 2026. A cleaner with five staff read the figure above as settled.
                It is not: £10,500 a year of Employment Allowance covers her whole employer NI bill
                several times over, and grep returned NOTHING for the phrase anywhere in the repo.

                ⚠️ THE FIGURE ABOVE STILL DOES NOT TAKE IT OFF, AND THIS SAYS SO IN AS MANY WORDS.
                Applying it needs the answer to reach planLtd(), which is mirrored in the app and
                pinned by ltd-parity, and that is a two repo change. Saying nothing until then
                would leave a confident wrong number on a money screen for the sake of a tidy
                deploy. This module's rule, from its own comments: we would rather say something
                honest and incomplete than a confident wrong number.
                ═══════════════════════════════════════════════════════════════════════════════ */}
            <p style={S.oweBasis}>
              {otherWages === 'yes'
                ? 'Your company can claim the Employment Allowance, because somebody else draws a wage from it. That is up to £10,500 a year off this bill, and on these figures it covers the whole of it. The figures above do not take it off yet, so treat this line as the most you would pay rather than what you owe.'
                : otherWages === 'no'
                  ? 'A company whose only employee is its director cannot claim the Employment Allowance, so this one stands as it is. If you take somebody on, tell us and it changes.'
                  : 'If anybody else draws a wage from the business, your company can claim the Employment Allowance, up to £10,500 a year, and on these figures that would cover this bill entirely. We have to ask before we can count it, because a company whose only employee is its director cannot claim it.'}
            </p>
          </div>
        ) : null}
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">What you owe personally</h2>
        {best.divTax > 0 ? (
          <div style={S.owe}>
            <div style={S.oweTop}>
              <span style={S.oweLabel}>Tax on the dividends</span>
              <span style={S.oweFig}>{gbp0(best.divTax)}</span>
            </div>
            <p style={S.oweBasis}>
              Yours, not the company&apos;s, collected through your own Self Assessment. Nothing is
              taken off when a dividend is paid, so this is the part to set aside yourself.
            </p>
          </div>
        ) : null}
        {best.salaryTax > 0 ? (
          <div style={S.owe}>
            <div style={S.oweTop}>
              <span style={S.oweLabel}>Income tax on the salary</span>
              <span style={S.oweFig}>{gbp0(best.salaryTax)}</span>
            </div>
            <p style={S.oweBasis}>
              Your total income this year is high enough that the personal allowance no longer
              covers the whole salary, so part of it is taxed after all.
            </p>
          </div>
        ) : null}
        {best.divTax <= 0 && best.salaryTax <= 0 ? (
          <p style={S.body}>
            Nothing, at these figures. The salary and the dividends sit inside your personal
            allowance and the dividend allowance, so your own Self Assessment collects nothing on
            them this year.
          </p>
        ) : null}
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">The three salaries worth considering</h2>
        <p style={S.quiet}>
          The one that keeps the most cash this year is not always the right one for you: the
          State Pension year is the catch that never shows up in a take home number. So all three
          are here, each with its reason, and the choice stays yours.
        </p>
        {plan.rungs.map((r) => (
          <div key={r.salary} style={S.owe}>
            <div style={S.oweTop}>
              <span style={S.oweLabel}>
                {gbp0(r.salary)} salary{r.plan === best ? ', the one above' : ''}
              </span>
              <span style={S.oweFig}>keeps {gbp0(r.plan.takeHome)}</span>
            </div>
            <p style={S.oweBasis}>{r.why}</p>
          </div>
        ))}
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">Before you take more out</h2>
        <p style={S.body}>{plan.wall.says}</p>
        {plan.warning ? <p style={S.body2}>{plan.warning}</p> : null}
        <p style={S.quiet}>
          Dividends can only be paid out of profit the company has actually made and kept. On this
          year&apos;s confirmed figures, {gbp0(best.dividends)} is the most there is to pay one
          from: anything past that would be a loan from the company back to you, not pay, and it
          would have to be paid back. Profit kept back from earlier years is not counted here.
        </p>
      </section>
    </>
  );
}

// The column, the card and the tiles come whole from APP_CSS in lib/tokens.ts. Declared here is
// only what this screen alone owns: the position card, borrowed shape for shape from /app/tax so
// the two hero figures read as siblings.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-position{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  `.lek-hero{font-size:${TYPE.hero}px;line-height:1.02;font-weight:800;letter-spacing:-0.035em;color:${RIVER_DEEP};font-variant-numeric:tabular-nums}`,
  `.lek-heronote{font-size:${TYPE.note}px;line-height:1.55;color:${INK};margin:${SPACE.sm}px 0 0;max-width:56ch}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-position{padding:${SPACE.xxl}px}
    .lek-hero{font-size:${TYPE.display}px}
    .lek-heronote{font-size:${TYPE.body}px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  body2: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: `${SPACE.sm}px 0 0`, maxWidth: '62ch' },
  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },

  owe: { padding: '10px 0', borderTop: `1px solid ${RIVER_TINT}` },
  oweTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm },
  oweLabel: { fontSize: TYPE.body, fontWeight: 800, color: INK },
  oweFig: { fontSize: TYPE.body, fontWeight: 800, color: RIVER_DEEP, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  oweBasis: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '4px 0 0', maxWidth: '62ch' },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
