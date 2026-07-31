import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getOptimiserInput, getBusinessProfile } from '../../../../lib/supabase';
import { computePosition, type BusinessType, type OwnerInput } from '../../../../lib/position';
import { studentLoanForSA, type StudentPlan } from '../../../../lib/nistudentloan';
import { gbp0, gbpAbs0 } from '../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  GREEN, INK, LINE, MUTED, ON_GREEN_TINT, ON_RIVER, PAPER, RIVER, RIVER_DEEP, SURFACE,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// WHAT IF. One question a man actually asks, answered on his own figures: what happens to my tax
// if the year ends bigger or smaller than it is heading now.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE FORM IS A GET, AND THAT IS A DECISION, NOT AN OVERSIGHT.
//
// Nothing here changes anything. The question travels in the query string, the answer is computed
// server side and drawn into the HTML, and refreshing or sharing the URL re-asks the same
// question. A POST is for a change of state, and the tenancy suite is right to insist on it where
// books are touched. A pure question gets the idempotent verb, the same judgement as the month
// arrows on /app/money, and it means no new API route exists for this page at all.
//
// ⚠️ THE ANSWER COMES FROM lib/position.ts, ROUTED BY HIS ACTUAL STRUCTURE. A sole trader gets
// the whole-person stack, a director gets the company's Corporation Tax plus his own drawings, a
// partner gets his slice. The page never runs a band or a rate itself: the same computePosition
// the agent leans on answers both halves of the comparison, so the two figures cannot drift.
//
// ⚠️ AND THE BASE IS CONFIRMED FIGURES, SAID PLAINLY. This screen deliberately does not project
// the year the way the Overview's set aside does. A what if on top of a projection is a guess on a
// guess, and a man could not check either half. The base here is what he has actually confirmed
// since 6 April, labelled as exactly that, so the answer is "if the year ended with this change on
// top of what is real".
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The account holder as a position.ts owner, the same mapping lib/agent.ts's soloOwners makes: in
// a company, the salary and dividends he takes are the COMPANY'S; anywhere else they are outside
// income stacking on top. Property profit rides as other non savings income so a landlord's trade
// is taxed at the margin his rent has already set, exactly as lib/ledger.ts argues it must be.
function ownersFor(structure: BusinessType, opt: {
  employmentIncome: number; dividendIncome?: number; savingsIncome?: number;
  ytdPropertyIncome?: number; ytdPropertyExpenses?: number;
}): OwnerInput[] {
  const salary = Math.max(0, opt.employmentIncome);
  const dividends = Math.max(0, opt.dividendIncome ?? 0);
  const savings = Math.max(0, opt.savingsIncome ?? 0);
  const property = Math.max(0, (opt.ytdPropertyIncome ?? 0) - (opt.ytdPropertyExpenses ?? 0));
  return [{
    name: 'You',
    salary: structure === 'limited_company' ? salary : undefined,
    dividends: structure === 'limited_company' ? dividends : undefined,
    other: {
      employment: structure === 'limited_company' ? 0 : salary,
      otherNonSavings: property,
      savings,
      dividends: structure === 'limited_company' ? 0 : dividends,
    },
  }];
}

// The change he asked about, read defensively off the query string. Whole pounds, bounded, and
// anything unreadable is simply no question asked, never an error page about his own money.
function readDelta(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Math.round(Number(String(raw).replace(/[£,\s]/g, '')));
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.max(-1_000_000, Math.min(1_000_000, n));
}

export default async function WhatIfPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const delta = readDelta(one('extra'));

  const [optimiser, biz] = await Promise.all([
    getOptimiserInput(user.id),
    getBusinessProfile(user.id).catch(() => null),
  ]);
  const structure: BusinessType = biz?.businessType ?? 'sole_trader';

  // The base: confirmed trade profit since 6 April. For a partner this is already HIS slice,
  // because getOptimiserInput scales the shared books by his share before anything is taxed.
  const base = Math.max(0, optimiser.ytdTradeIncome - optimiser.ytdTradeExpenses);
  const owners = ownersFor(structure, optimiser);

  const now = computePosition({ type: structure, profit: base, owners });
  const then = delta !== null
    ? computePosition({ type: structure, profit: Math.max(0, base + delta), owners })
    : null;
  const taxDiff = then ? Math.round(then.combinedTax - now.combinedTax) : 0;

  // The student loan moves with profit too, for a sole trader or a partner: Self Assessment
  // collects it with the same bill, so a what if that forgot it would understate the January
  // difference. Company profit is not the director's income, so his loan does not move with it.
  const plans = (optimiser.studentPlans ?? []) as StudentPlan[];
  const loanApplies = structure !== 'limited_company' && plans.length > 0;
  const loanNow = loanApplies ? studentLoanForSA(base, optimiser.employmentIncome, plans) : 0;
  const loanThen = then && loanApplies
    ? studentLoanForSA(Math.max(0, base + (delta ?? 0)), optimiser.employmentIncome, plans)
    : 0;
  const loanDiff = Math.round(loanThen - loanNow);

  const wholeDiff = taxDiff + loanDiff;
  const kept = delta !== null && delta > 0 ? Math.max(0, delta - wholeDiff) : 0;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax/what-if" />

      <section className="lek-card">
        <h1 className="lek-h2">What if</h1>
        <p style={S.body}>
          Your confirmed profit since 6 April is <b style={S.tab}>{gbp0(base)}</b>. That is the
          base: real figures, nothing projected. Ask what a change would do.
        </p>

        {/* One field, one button. Doc 103: a form is a queue of decisions, so this one has exactly
            one. The minus sign is how he asks about a smaller year, said in the hint rather than
            with a second control. */}
        <form action="/app/tax/what-if" method="get" style={S.form}>
          <label htmlFor="extra" style={S.label}>If my profit changed by</label>
          <div style={S.formRow}>
            <input
              id="extra"
              name="extra"
              type="number"
              inputMode="numeric"
              step={100}
              min={-1000000}
              max={1000000}
              defaultValue={delta ?? undefined}
              placeholder="5000"
              style={S.input}
            />
            <button type="submit" style={S.btn}>Work it out</button>
          </div>
          <p style={S.hint}>In pounds. Put a minus in front for a smaller year, like -2000.</p>
        </form>
      </section>

      {then && delta !== null ? (
        <section className="lek-card">
          <h2 className="lek-h2">
            {delta > 0 ? `Another ${gbpAbs0(delta)} of profit` : `${gbpAbs0(delta)} less profit`}
          </h2>
          <div className="lek-grid">
            <div className="lek-tile">
              <div className="lek-tile-label">Tax on the base</div>
              <div className="lek-tile-value">{gbp0(Math.round(now.combinedTax) + Math.round(loanNow))}</div>
            </div>
            <div className="lek-tile">
              <div className="lek-tile-label">Tax after the change</div>
              <div className="lek-tile-value">{gbp0(Math.round(then.combinedTax) + Math.round(loanThen))}</div>
            </div>
            <div className="lek-tile">
              <div className="lek-tile-label">Difference</div>
              <div className="lek-tile-value" style={{ color: wholeDiff > 0 ? RIVER_DEEP : ON_GREEN_TINT }}>
                {gbp0(wholeDiff)}
              </div>
            </div>
          </div>

          <p style={S.answer}>
            {delta > 0
              ? `About ${gbpAbs0(wholeDiff)} more would go to tax across the year, and you would keep about ${gbp0(kept)} of the extra ${gbpAbs0(delta)}.`
              : `About ${gbpAbs0(wholeDiff)} less tax across the year.`}
          </p>

          {/* The structure, said once, because the same delta lands in a different return for each.
              The wording of what each structure files lives in lib/position.ts's own notes. */}
          {structure === 'limited_company' ? (
            <p style={S.quiet}>
              As a limited company, the change lands on the company&apos;s own Corporation Tax
              return first: {gbp0(then.business.corporationTax)} of Corporation Tax after the
              change, against {gbp0(now.business.corporationTax)} now. Your personal tax only moves
              when what you draw out moves, and this comparison holds your salary and dividends
              still.
            </p>
          ) : null}
          {structure === 'partnership' ? (
            <p style={S.quiet}>
              These figures are on your share of the partnership&apos;s profit, which is what you
              are taxed on. The firm&apos;s other partners carry their own shares.
            </p>
          ) : null}
          {loanApplies && loanDiff !== 0 ? (
            <p style={S.quiet}>
              {gbpAbs0(loanDiff)} of the difference is your student loan, which Self Assessment
              collects with the same bill.
            </p>
          ) : null}

          <p style={S.quiet}>
            Worked out as if the tax year ended with this change on top of what you have confirmed.
            Nothing here changes your books, and nothing is promised: it moves as your real figures
            do.
          </p>
        </section>
      ) : null}
    </main>
  );
}

// The column, the card and the tiles come whole from APP_CSS. This screen owns nothing of its own.
const CSS = [A11Y_CSS, APP_CSS].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },
  tab: { fontVariantNumeric: 'tabular-nums' },

  form: { marginTop: SPACE.md },
  label: { display: 'block', fontSize: TYPE.note, fontWeight: 700, color: MUTED, marginBottom: 6 },
  formRow: { display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' },
  input: { flex: '1 1 160px', minWidth: 120, fontFamily: FONT, fontSize: TYPE.strong, fontWeight: 700, color: INK, background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: '10px 12px', fontVariantNumeric: 'tabular-nums' },
  btn: { flex: '0 0 auto', background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },
  hint: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '8px 0 0' },

  answer: { fontSize: TYPE.strong, lineHeight: 1.5, fontWeight: 700, margin: `${SPACE.md}px 0 0`, maxWidth: '56ch' },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0', maxWidth: '62ch' },
};
