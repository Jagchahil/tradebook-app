import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { getOptimiserInput, getBusinessProfile } from '../../../../lib/supabase';
import { taxPosition, marginalRate } from '../../../../lib/taxoptimiser';
import {
  recommendVehicle, chargingLabel, type VehicleWant, type Charging,
} from '../../../../lib/capital';
import { gbp0 } from '../../../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE,
  edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// VEHICLES. THE ONE DECISION WHERE ASKING US FIRST IS WORTH FOUR FIGURES.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS SCREEN EXISTS, AND WHY IT IS A CALCULATOR RATHER THAN A RECORD.
//
// On 2 August 2026 a real statement walk put a £60,000 car through the pile and the whole cost
// came off his profit, because nothing in the product knew that HMRC keeps cars out of the Annual
// Investment Allowance. That defect is fixed at the filing end. This screen is the other end of
// it: the moment BEFORE he signs, which is the only moment the answer can still change anything.
//
// ⚠️ IT WRITES NOTHING. A GET form back to itself, no database, no gate row, no state. He is
// deciding, not filing, and a car he has not bought has no business in his books. That also means
// he can play with the numbers as many times as he likes without leaving a trail of half thoughts
// in his records.
//
// 🔴 THE FORK IS PERMANENT PER VEHICLE, WHICH IS THE WHOLE REASON TO ASK EARLY. HMRC's simplified
// mileage rate and capital allowances are mutually exclusive for a given vehicle. Claim the car
// and he can never switch to mileage on it. Use mileage and he can never start claiming it. He
// takes that fork on the day he signs, usually with nobody having mentioned it.
//
// 🔴 AND THE PRACTICAL QUESTIONS OVERRULE THE TAX ONES, WHICH IS THE POINT OF THE WHOLE SCREEN.
//
// A new electric car gets 100% of its cost in year one. Nothing else is close. Rank by tax alone
// and this product tells every customer to buy an electric car, including the plumber in a terrace
// with no driveway whose nearest charger is four miles away. He would do it once, hate us, and be
// right to. So lib/capital.ts lets a practical answer veto a tax answer, and the screen prints
// what he is turning down and why, rather than quietly hiding it.
//
// ⚠️ IT RECOMMENDS AND NEVER DECIDES. Doc 103's hard limit: money is always his. This says what
// each route is worth on his own figures and which is biggest. What he drives is his business.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const WANTS: ReadonlyArray<{ value: VehicleWant; label: string }> = [
  { value: 'car', label: 'A car' },
  { value: 'van', label: 'A van or pickup' },
];

const CHARGING: readonly Charging[] = ['home', 'street_near', 'street_far', 'unknown'];

const USE_CHOICES = [100, 75, 50, 25] as const;

function num(v: string | undefined, fallback: number | null = null): number | null {
  if (v === undefined || v === null || v.trim() === '') return fallback;
  const n = Number(String(v).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Ftax%2Fvehicle');

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const want: VehicleWant = one(sp.want) === 'van' ? 'van' : 'car';
  const budget = num(one(sp.budget));
  const miles = num(one(sp.miles));
  const usePct = num(one(sp.use), 100) ?? 100;
  const running = num(one(sp.running), null);
  const rawCharging = one(sp.charging) ?? '';
  const charging: Charging = (CHARGING as readonly string[]).includes(rawCharging)
    ? (rawCharging as Charging) : 'unknown';
  const inBank = num(one(sp.bank), null);

  // Answered only when he has given us the two figures the whole thing turns on. Everything else
  // has a sensible default; these two do not, because a budget of nothing and no miles is not a
  // question, it is an empty form.
  const answered = budget !== null && budget > 0 && miles !== null;

  // ⚠️ HIS OWN FIGURES, AND THE READ IS BEST EFFORT. A man who has confirmed nothing still deserves
  // the tax comparison: it is the published rules against a price he typed. What he loses without
  // them is the affordability half and a marginal rate worked out from his real position, and the
  // copy says which is which rather than quietly using a default as though it were his.
  const [optimiser, biz] = await Promise.all([
    getOptimiserInput(user.id).catch(() => null),
    getBusinessProfile(user.id).catch(() => null),
  ]);

  let mRate = 0;
  let confirmedSpare: number | null = null;
  let setAside = 0;
  if (optimiser) {
    const pos = taxPosition(optimiser);
    setAside = Math.max(0, pos.setAside);
    mRate = marginalRate(Math.max(0, pos.totalIncome));
    // What the business has actually generated on confirmed figures, less what is already owed.
    // NOT a bank balance and it never claims to be: see the sentence printed under it.
    const generated = Math.max(0, optimiser.ytdTradeIncome - optimiser.ytdTradeExpenses);
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 🔴 AN EMPTY BOOK IS NOT "£0 SPARE", IT IS AN UNKNOWN. 9 August 2026, empty state audit.
    //
    // A man on his first day, nothing logged, was told this under "What I would do":
    //
    //     "About £0 is genuinely free once your tax is put by, and you are looking at £40,000.
    //      That is £40,000 short."
    //
    // Confident, specific, and computed entirely out of the absence of data. He has not told us
    // what is in his account and we have never seen his books, so we have no idea whether he is
    // forty thousand short or sitting on the cash. It reads as a finding because every other
    // number on the page is one.
    //
    // ⚠️ `spendable: number | null` ALREADY MEANS "WE DO NOT KNOW", and lib/capital.ts already
    // handles the null: it is what a FAILED optimiser read produces. A read that succeeded and
    // found nothing tells us exactly as much about his bank as a read that failed, and it was the
    // one case taking the confident branch. Same shape as the tax half of this page, which grew
    // noTaxToSaveYet for the same reason after somebody walked a real account and watched it print
    // £0, £0, £0.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    confirmedSpare = optimiser.ytdTradeIncome === 0 && optimiser.ytdTradeExpenses === 0
      ? null
      : Math.round(Math.max(0, generated - setAside));
  }

  // What he typed beats what we inferred, every time. He knows what is in his account and we do
  // not, and a figure he gave us is one he can argue with.
  const spendable = inBank !== null ? Math.max(0, inBank - setAside) : confirmedSpare;
  const spendableFromHim = inBank !== null;

  const rec = answered
    ? recommendVehicle({
      want,
      budget: budget as number,
      businessMilesPerYear: miles as number,
      businessUsePct: usePct,
      runningCostsPerYear: running,
      charging,
      marginalRate: mRate,
      spendable,
    })
    : null;

  const isCompany = biz?.businessType === 'limited_company';

  return (
    <main style={S.wrap}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <AppNav current="/app/tax" />

      <div className="lek-head" style={S.head}>
        <p className="lek-eyebrow">Vehicles</p>
        <h1 className="lek-h1">Before you buy it, not after.</h1>
        <p style={S.lede}>
          There are two ways to have a vehicle for work, they are worth very different amounts, and
          you only get to pick once per vehicle. Tell me what you are looking at and I will work out
          which one leaves you better off.
        </p>
      </div>

      {isCompany ? (
        <section className="lek-card">
          <p style={S.warn}>
            These figures are for a sole trader or a partnership. A company buying a vehicle is a
            different set of rules again, including a benefit in kind on you personally for the
            private use, and we have not built that. Take this as background rather than as your
            answer.
          </p>
        </section>
      ) : null}

      {/* ── THE QUESTIONS. Seven, all things he knows off the top of his head. ─────────────── */}
      <section className="lek-card">
        <h2 className="lek-h2">What are you looking at</h2>
        <form method="get" action="/app/tax/vehicle">
          <fieldset style={S.fs}>
            <legend style={S.legend}>What do you need</legend>
            <div style={S.row}>
              {WANTS.map((w) => (
                <label key={w.value} style={S.pick}>
                  <input type="radio" name="want" value={w.value} defaultChecked={want === w.value} />
                  <span>{w.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="budget" style={S.label}>What are you looking to spend</label>
          <input id="budget" name="budget" className="lek-field" inputMode="decimal"
            placeholder="40000" defaultValue={budget === null ? '' : String(budget)} />

          <label htmlFor="miles" style={S.label}>Business miles a year, roughly</label>
          <input id="miles" name="miles" className="lek-field" inputMode="decimal"
            placeholder="9000" defaultValue={miles === null ? '' : String(miles)} />
          <p style={S.hint}>
            Just the work driving. Getting to and from your own yard does not count, but every job
            after that does.
          </p>

          <fieldset style={S.fs}>
            <legend style={S.legend}>How much of the driving is work</legend>
            <div style={S.col}>
              {USE_CHOICES.map((u) => (
                <label key={u} style={S.pick}>
                  <input type="radio" name="use" value={String(u)} defaultChecked={usePct === u} />
                  <span>{u === 100 ? 'All of it, it never leaves the job' : u === 75 ? 'Most of it, about three quarters' : u === 50 ? 'About half' : 'A quarter or so'}</span>
                </label>
              ))}
            </div>
            <p style={S.hint}>
              If you buy it through the business, HMRC only lets you claim the business share. Being
              honest here is what keeps the figure defensible.
            </p>
          </fieldset>

          <label htmlFor="running" style={S.label}>Roughly what it costs a year to run</label>
          <input id="running" name="running" className="lek-field" inputMode="decimal"
            placeholder="4000" defaultValue={running === null ? '' : String(running)} />
          <p style={S.hint}>
            Fuel or charging, insurance, tax, servicing, tyres. A guess is fine. Leave it blank and I
            will leave running costs out of both sides.
          </p>

          <fieldset style={S.fs}>
            <legend style={S.legend}>Could you live with an electric one</legend>
            <div style={S.col}>
              {CHARGING.map((c) => (
                <label key={c} style={S.pick}>
                  <input type="radio" name="charging" value={c} defaultChecked={charging === c} />
                  <span>{chargingLabel(c)}</span>
                </label>
              ))}
            </div>
            <p style={S.hint}>
              This one changes the answer more than anything else on the page. An electric car is by
              far the best on tax and completely depends on charging it being something you never
              think about.
            </p>
          </fieldset>

          <label htmlFor="bank" style={S.label}>What have you got to spend, if you want me to check</label>
          <input id="bank" name="bank" className="lek-field" inputMode="decimal"
            placeholder="Leave blank and I will use your confirmed figures"
            defaultValue={inBank === null ? '' : String(inBank)} />
          <p style={S.hint}>
            Optional, and it is not stored anywhere. Whatever you put here I will take your tax set
            aside off it first, because that part is already owed.
          </p>

          <button type="submit" className="lek-primary">Work it out</button>
        </form>
      </section>

      {/* ── THE ANSWER ────────────────────────────────────────────────────────────────────── */}
      {rec ? (
        <>
          <section className="lek-card">
            <h2 className="lek-h2">What each one is worth</h2>
            {/* 🔴 THE HEADLINE IS A DEDUCTION TIMES HIS MARGINAL RATE, AND HIS RATE CAN BE NOUGHT.
                Walking this screen on 2 August with a real account carrying a loss printed "£0",
                "£0", "£0" and then picked a winner between them. The arithmetic was right and the
                screen was unreadable, which on a screen whose job is to be believed is the same as
                being wrong. So when there is no tax to save, it stops printing a tax figure and
                shows the DEDUCTION instead, which is real, differs between the options, and is the
                thing his decision actually turns on. */}
            {rec.noTaxToSaveYet ? (
              <p style={S.note}>
                These are what each one takes off your profit, not what it saves you in tax. On the
                figures you have confirmed you have no tax to pay this year, so none of them would
                save you any yet. The relief is not lost: claimed against no profit it makes a loss,
                and a loss carries forward to the years you do make money.
              </p>
            ) : (
              <p style={S.quiet}>
                First year, in tax, on {gbp0(budget as number)} and {Math.round(miles as number).toLocaleString('en-GB')} business
                miles. The bigger of the two routes for each, so nothing is judged on its weaker half.
              </p>
            )}
            <div style={S.opts}>
              {rec.options.map((o) => (
                <div key={o.kind} style={{ ...S.opt, ...(rec.best && rec.best.kind === o.kind ? S.optBest : null), ...(o.practical === 'no' ? S.optNo : null) }}>
                  <div style={S.optTop}>
                    <span style={S.optTitle}>{o.title}</span>
                    {/* The deduction when the tax figure would be a meaningless nought. */}
                    <span style={S.optMoney} className="lek-num">
                      {gbp0(rec.noTaxToSaveYet ? Math.max(o.firstYear, o.mileageFirstYear) : o.worthPerYearOne)}
                    </span>
                  </div>
                  <p style={S.optBody}>
                    {o.bestRoute === 'mileage'
                      ? `Best kept in your own name: ${gbp0(o.mileageFirstYear)} of mileage against ${gbp0(o.firstYear)} through the business.`
                      : `Best through the business: ${gbp0(o.firstYear)} in year one, then about ${gbp0(o.laterYear)}. Mileage would be ${gbp0(o.mileageFirstYear)} every year.`}
                  </p>
                  {o.practical === 'no' ? <p style={S.optVeto}>Not one I would put first for you</p> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="lek-card">
            <h2 className="lek-h2">What I would do</h2>
            {rec.lines.map((l, i) => (
              <p key={i} style={l.startsWith('🔴') ? S.verdict : S.body}>{l}</p>
            ))}
            {spendable !== null ? (
              <p style={S.hint}>
                {spendableFromHim
                  ? 'That is the figure you typed, less your tax set aside.'
                  : 'That is what your business has generated on the figures you have confirmed, less your tax set aside. It is not your bank balance, and if it is wrong, type what you actually have in the box above.'}
              </p>
            ) : null}
          </section>
        </>
      ) : null}

      <p style={S.foot}>
        Nothing on this page is saved and nothing here is advice. It is the published 2026/27 rules
        against a price you typed, so you can take the question to whoever does your return already
        knowing what it turns on.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-head{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
  `.lek-field{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};margin-bottom:${SPACE.xs}px}`,
  `.lek-primary{width:100%;margin-top:${SPACE.md}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },
  head: { padding: SPACE.md, borderRadius: RADIUS.lg, margin: SPACE.md },
  lede: { fontSize: TYPE.lead, lineHeight: 1.5, color: MUTED, margin: `${SPACE.sm}px 0 0` },
  fs: { border: 'none', padding: 0, margin: `${SPACE.md}px 0 0` },
  legend: { fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, padding: 0 },
  row: { display: 'flex', gap: SPACE.sm, marginTop: SPACE.sm, flexWrap: 'wrap' },
  col: { display: 'grid', gap: SPACE.xs, marginTop: SPACE.sm },
  pick: { display: 'flex', alignItems: 'center', gap: SPACE.xs, fontSize: TYPE.body, color: INK, cursor: 'pointer' },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, margin: `${SPACE.md}px 0 ${SPACE.xs}px` },
  hint: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: `${SPACE.xs}px 0 0` },
  quiet: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: `0 0 ${SPACE.sm}px` },
  // The no-tax-to-save note. Louder than `quiet`, because it is not an aside: it explains why
  // every figure beside it is a different kind of number from the one he expected.
  note: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: `0 0 ${SPACE.sm}px` },
  body: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, margin: `${SPACE.sm}px 0 0` },
  verdict: { fontSize: TYPE.strong, lineHeight: 1.5, fontWeight: 700, color: RIVER_DEEP, background: RIVER_TINT, padding: SPACE.sm, borderRadius: RADIUS.md, margin: `${SPACE.sm}px 0 0` },
  warn: { fontSize: TYPE.body, lineHeight: 1.55, color: RED, background: RED_TINT, padding: SPACE.sm, borderRadius: RADIUS.md, margin: 0, fontWeight: 600 },
  opts: { display: 'grid', gap: SPACE.sm },
  opt: { padding: SPACE.sm, background: SURFACE, borderRadius: RADIUS.md, border: `1.5px solid ${LINE}` },
  optBest: { borderColor: RIVER, background: RIVER_TINT },
  optNo: { opacity: 0.72 },
  optTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm },
  optTitle: { fontSize: TYPE.body, fontWeight: 700 },
  optMoney: { fontSize: TYPE.stat, fontWeight: 800, color: INK, whiteSpace: 'nowrap' },
  optBody: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: `${SPACE.xs}px 0 0` },
  optVeto: { fontSize: TYPE.note, fontWeight: 700, color: RED, margin: `${SPACE.xs}px 0 0` },
  foot: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, textAlign: 'center', margin: `${SPACE.md}px ${SPACE.md}px ${SPACE.lg}px` },
};
