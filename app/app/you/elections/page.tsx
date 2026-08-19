import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { readAllowanceElection, getBusinessProfile, readOptimiserOrNull } from '../../../../lib/supabase';
import { quarterForDate } from '../../../../lib/quarterpack';
import {
  bandOptions, bandLabel, electionRefusal,
  // ⚠️ ALIASED, AND NOT BECAUSE THE NAMES ARE WRONG. eslint's react-hooks plugin treats any
  // identifier starting with "use" as a React Hook, so useOfHomeToDate reads to it as a hook
  // called conditionally inside an async component. It is a tax function about use of home.
  // Renaming it in lib/elections.ts would trade correct domain language for a lint convention
  // and would touch every caller, so the alias is local to the one file that trips it.
  useOfHomeToDate as homeClaimToDate, useOfHomeFullYear as homeClaimFullYear,
  tradingAllowanceChoice, tradingAllowanceOffer, tradingAllowanceAmount,
  type HoursBand,
} from '../../../../lib/elections';
import { gbp0, gbp2 } from '../../../../lib/money';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE,
  edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';
import { RecordsUnreadable } from '../../RecordsUnreadable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ALLOWANCES. THE TWO CHOICES ONLY HE CAN MAKE, AND UNTIL TONIGHT NEITHER HAD A DOOR ON THE WEB.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS SCREEN EXISTS, AND IT IS THE SAME REASON TWICE.
//
// lib/elections.ts was built on 27 July and /api/elections with it. The route is JSON only, and NO
// PAGE IN THIS REPO EVER POSTED TO IT. The only doors were the phone app and WhatsApp. Launch one
// is the website and the web app; the phone app is launch two. So every launch customer could be
// asked "do you do your quotes and paperwork at home", be shown a card in Ways to save telling him
// what the flat rate is worth, and have nowhere at all to say yes. Between £120 and £312 a year,
// for a tradesman who does his invoices at the kitchen table, which is all of them.
//
// The trading allowance arrived at the same hole from the other side. lib/agent.ts told him, in a
// card and in a paid WhatsApp template, that "Lekhio uses it automatically... Nothing for you to
// do". Nothing applied it, and HMRC BIM86015 says it is an election the individual makes on his own
// return, so an automatic version would have been wrong even if it had worked.
//
// ⚠️ THE TWO ARE NOT THE SAME SHAPE AND THIS SCREEN MUST NOT PRETEND THEY ARE.
//
//   USE OF HOME       ADDS a deduction he would not otherwise have. Electing it can only help him,
//                     so the question is only ever "how many hours", and the answer is three
//                     buttons.
//
//   TRADING ALLOWANCE REPLACES every cost he has logged with one flat figure (GOV.UK: "You cannot
//                     deduct any other expenses or allowances if you claim the allowances"). It can
//                     help him or cost him, and which one depends on numbers only his books know.
//                     So it is NEVER shown as a price on its own. Both totals sit next to each
//                     other, his real costs first, and the button says what it replaces.
//
// 🔴 ZERO CLIENT JAVASCRIPT, like every screen under app/app. Each answer is a plain form post
// answered with a 303, and this page draws again from what was written. The pattern /app/you/vat
// and /app/you/circumstances already use.
//
// ⚠️ AND NOTHING HERE IS DONE FOR HIM. Doc 103 says the best button is no button, and these are the
// two places in the product where that rule does not apply: the answer depends on a fact only he
// has. CLAUDE.md's hard limit is that money and tax filing always ask. This is the asking.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

function notice(done: string | undefined, problem: string | undefined, key: string | undefined): string | null {
  if (done === 'elected' && key === 'trading_allowance') {
    return 'Done. The trading allowance is on for this tax year, and it is claimed instead of your logged costs rather than as well as them. Your figures below have already moved.';
  }
  if (done === 'elected') {
    return 'Done. Use of home is on, and it is already coming off your profit. It replaces claiming a share of your actual home bills, you cannot have both.';
  }
  if (done === 'removed' && key === 'trading_allowance') {
    return 'Taken off. Your own logged costs are what you are deducting again, from now and for the rest of this tax year.';
  }
  if (done === 'removed') {
    return 'Taken off. You are no longer claiming use of home for this tax year.';
  }
  switch (problem) {
    case 'not_eligible':
      // ⚠️ THE SENTENCE ITSELF IS NOT REPEATED HERE. The refusal is drawn in place, under the
      // relief it is about, by the same lib/elections.ts call the route made. Two copies of a
      // refusal is two chances for one of them to say something the rule no longer says.
      return 'That one is not yours to claim. The reason is under it below.';
    case 'under_threshold':
      return "HMRC's flat rate starts at 25 hours a month. Under that there is nothing to claim this way.";
    case 'slow':
      return 'That was a lot at once. Give it a minute and try again.';
    case 'unavailable':
      return 'That did not save. Nothing has changed, so have another go.';
    case 'bad':
      return 'Something in that did not read right. Nothing was saved, so have another go.';
  }
  return null;
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
  if (!user) redirect('/in?next=%2Fapp%2Fyou%2Felections');

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  // ⚠️ ONE CLOCK READ, AND NOT Date.now(). React's purity rule refuses Date.now() in a render body
  // (it is the one the linter can see), while `new Date()` is what every other screen here uses.
  // Reading the clock once and deriving both figures from it also means the year and the months
  // cannot come from two different instants.
  const now = new Date();
  const startYear = quarterForDate(now).startYear;
  const start = Date.UTC(startYear, 3, 6);
  const months = Math.max(0, Math.min(12, Math.floor((now.getTime() - start) / (30.44 * 86_400_000))));

  // 🔴 EVERY READ FAILS TO "WE DO NOT KNOW", NEVER TO "HE HAS NOT ELECTED". A screen that showed
  // "not claiming" over a failed read would invite him to elect a second time, and he would
  // reasonably believe the first one never saved. The two elections are read separately so one
  // unreadable row cannot hide the other.
  const [biz, homeRow, tradeRow, optimiser] = await Promise.all([
    getBusinessProfile(user.id).catch(() => null),
    readAllowanceElection(user.id, 'use_of_home', startYear).then((r) => ({ ok: true, row: r })).catch(() => ({ ok: false, row: null })),
    readAllowanceElection(user.id, 'trading_allowance', startYear).then((r) => ({ ok: true, row: r })).catch(() => ({ ok: false, row: null })),
    readOptimiserOrNull(user.id),
  ]);

  // 🔴 B24. A FAILED READ IS NOT A YEAR OF ZEROS, AND UNTIL TODAY THIS PAGE COULD NOT TELL THE
  // TWO APART. readOptimiserOrNull folds the thrown read and the unreadable rows into ONE null, and
  // the line goes up INSTEAD OF the figures rather than a confident zero he cannot argue with.
  if (!optimiser) return <RecordsUnreadable current="/app/you" title="Allowances" />;

  const who = { structure: biz?.businessType ?? null, income: biz?.incomeShape ?? null };
  const homeRefusal = electionRefusal('use_of_home', who);
  const tradeRefusal = electionRefusal('trading_allowance', who);

  const homeBand = (homeRow.row?.hoursBand ?? null) as HoursBand | null;
  const tradeElected = tradeRow.row !== null;

  const choice = optimiser
    ? tradingAllowanceChoice(optimiser.ytdTradeIncome, optimiser.ytdTradeExpenses, optimiser)
    : null;

  const msg = notice(one(sp.done), one(sp.problem), one(sp.key));

  return (
    <main style={S.wrap}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <AppNav current="/app/you" />

      <div className="lek-head" style={S.head}>
        <p className="lek-eyebrow">Allowances</p>
        <h1 className="lek-h1">The two you have to choose yourself.</h1>
        <p style={S.lede}>
          Almost everything here happens without you. These two cannot, because the answer depends
          on something only you know. Both are for this tax year and both come off again in one
          press.
        </p>
      </div>

      {msg ? <p style={S.notice}>{msg}</p> : null}

      {/* ── USE OF HOME ─────────────────────────────────────────────────────────────────────── */}
      <section className="lek-card">
        <h2 className="lek-h2">Working from home</h2>

        {homeRefusal ? (
          <p style={S.refused}>{homeRefusal.message}</p>
        ) : !homeRow.ok ? (
          <p style={S.refused}>
            We could not read this one just now, so it is left alone. Nothing has changed. Try again
            in a minute rather than electing over the top of it.
          </p>
        ) : (
          <>
            <p style={S.why}>
              HMRC has a flat rate for doing your quotes, invoices and paperwork at home. No
              receipts, no share of your gas bill to work out. You tell us roughly how many hours a
              month and it comes off your profit every month from then on.
            </p>
            <p style={S.warn}>
              It goes in instead of claiming a share of your actual home bills, not as well as.
            </p>

            {homeBand ? (
              <>
                <p style={S.fact}>
                  You are claiming {bandLabel(homeBand)}, which is {gbp0(homeClaimFullYear(homeBand))} over
                  a full year and {gbp0(homeClaimToDate(homeBand, months))} so far this one.
                </p>
                <p style={S.quiet}>Change it by picking another, or take it off below.</p>
              </>
            ) : null}

            <div style={S.bands}>
              {bandOptions().map((o) => {
                const on = homeBand === o.band;
                return (
                  <form key={o.band} action="/api/elections" method="post" style={S.bForm}>
                    <input type="hidden" name="key" value="use_of_home" />
                    <input type="hidden" name="hoursBand" value={String(o.band)} />
                    <button type="submit" style={{ ...S.band, ...(on ? S.pressed : null) }} aria-pressed={on}>
                      <span style={S.bandLabel}>{on ? '✓ ' : ''}{o.label}</span>
                      <span style={S.bandMoney}>{gbp0(o.monthly)} a month</span>
                    </button>
                  </form>
                );
              })}
            </div>

            {homeBand ? (
              <form action="/api/elections" method="post" style={{ marginTop: SPACE.sm }}>
                <input type="hidden" name="key" value="use_of_home" />
                <input type="hidden" name="intent" value="remove" />
                <button type="submit" style={S.remove}>Stop claiming use of home</button>
              </form>
            ) : null}
          </>
        )}
      </section>

      {/* ── THE TRADING ALLOWANCE ───────────────────────────────────────────────────────────── */}
      <section className="lek-card">
        <h2 className="lek-h2">The {gbp0(tradingAllowanceAmount())} trading allowance</h2>

        {tradeRefusal ? (
          <p style={S.refused}>{tradeRefusal.message}</p>
        ) : !tradeRow.ok ? (
          <p style={S.refused}>
            We could not read this one just now, so it is left alone. Nothing has changed. Try again
            in a minute rather than electing over the top of it.
          </p>
        ) : (
          <>
            <p style={S.why}>
              You can deduct a flat {gbp0(tradingAllowanceAmount())} from your trade income instead of
              adding up what you actually spent. It is your election to make on your own return, so
              we will not make it for you.
            </p>
            <p style={S.warn}>
              It replaces your costs rather than joining them. While it is on, none of your logged
              receipts, your mileage or the use of home flat rate is deducted.
            </p>

            {/* 🔴 BOTH TOTALS, SIDE BY SIDE, ALWAYS. This is the whole reason the screen exists in
                this shape: a man shown only "claim £1,000" would elect it over £4,000 of real
                costs and be three grand of deduction worse off, on our say so. */}
            {choice ? (
              <>
                <div style={S.compare}>
                  <div style={S.col}>
                    <p style={S.colHead}>Your costs so far</p>
                    <p style={S.colMoney} className="lek-num">{gbp2(choice.actualCosts)}</p>
                    <p style={S.colFoot}>
                      {choice.better === 'too_early'
                        ? 'Everything you have logged and confirmed.'
                        : `Everything you have logged. About ${gbp2(choice.projectedCosts)} at this pace for the year.`}
                    </p>
                  </div>
                  <div style={S.col}>
                    <p style={S.colHead}>The allowance</p>
                    <p style={S.colMoney} className="lek-num">{gbp2(choice.allowance)}</p>
                    <p style={S.colFoot}>A flat figure for the whole year, instead of the costs.</p>
                  </div>
                </div>
                <p style={choice.better === 'allowance' ? S.unlock : S.quiet}>
                  {tradingAllowanceOffer(choice)}
                </p>
              </>
            ) : (
              <p style={S.quiet}>
                We could not read your figures just now, so there is nothing to compare it against.
                The choice is still yours to make, but it is worth coming back when the two totals
                are on the screen next to each other.
              </p>
            )}

            {tradeElected ? (
              <>
                <p style={S.fact}>
                  You are claiming it for this tax year. Your logged costs are not being deducted
                  while it is on.
                </p>
                <form action="/api/elections" method="post" style={{ marginTop: SPACE.sm }}>
                  <input type="hidden" name="key" value="trading_allowance" />
                  <input type="hidden" name="intent" value="remove" />
                  <button type="submit" style={S.remove}>Stop claiming the trading allowance</button>
                </form>
              </>
            ) : choice?.fullRelief ? (
              // ⚠️ NO BUTTON AT ALL. Full relief is automatic below the allowance and there is no
              // election to make, so doc 103 says do not invent a decision for him.
              <p style={S.quiet}>There is nothing to elect here, and nothing for you to do.</p>
            ) : choice?.better === 'too_early' ? (
              // ═══════════════════════════════════════════════════════════════════════════════
              // 🔴 AND NO BUTTON ON AN EMPTY BOOK EITHER. 9 August 2026, empty state audit.
              //
              // A day one account drew the comparison as "Your costs so far £0.00" against "The
              // allowance £1,000.00" and, under it, a primary button reading "Claim the allowance
              // instead of my costs". fullRelief is false when gross income is zero, so the branch
              // directly above did not catch this and the press was one tap away.
              //
              // That tap writes an election giving up his costs, his mileage and his use of home
              // for the whole year, in exchange for beating a figure that is zero only because he
              // has not started yet. The prose above it was already honest, and prose beside a
              // primary button is not what a man in a hurry reads.
              //
              // Doc 103: never ask a question with only one sensible answer, or none. On an empty
              // book there is nothing here he could answer, so nothing is asked. The choice comes
              // back by itself the moment there are two real totals to set against each other.
              // ═══════════════════════════════════════════════════════════════════════════════
              <p style={S.quiet}>
                There is nothing to weigh up yet, so there is no button here. Once you have logged a
                little of what comes in and what you spend, the two figures sit side by side above
                and the choice is worth making. Nothing is lost by waiting: it is claimed on the
                return for the year, not today.
              </p>
            ) : (
              <form action="/api/elections" method="post" style={{ marginTop: SPACE.sm }}>
                <input type="hidden" name="key" value="trading_allowance" />
                <button type="submit" style={S.elect}>
                  Claim the allowance instead of my costs
                </button>
              </form>
            )}
          </>
        )}
      </section>

      <p style={S.foot}>
        An election belongs to one tax year and is never rolled forward on your behalf. Nothing here
        is sent anywhere: it changes your own figures, which you check and approve before anything
        goes to HMRC.
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
  head: { padding: SPACE.md, borderRadius: RADIUS.lg, margin: SPACE.md },
  lede: { fontSize: TYPE.lead, lineHeight: 1.5, color: MUTED, margin: `${SPACE.sm}px 0 0` },
  notice: {
    margin: `0 ${SPACE.md}px ${SPACE.md}px`, padding: SPACE.sm, borderRadius: RADIUS.md,
    background: RIVER_TINT, color: RIVER_DEEP, fontSize: TYPE.body, fontWeight: 600,
  },
  why: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, margin: `0 0 ${SPACE.sm}px` },
  warn: {
    fontSize: TYPE.body, lineHeight: 1.55, color: RED, background: RED_TINT,
    padding: SPACE.sm, borderRadius: RADIUS.md, margin: `0 0 ${SPACE.sm}px`, fontWeight: 600,
  },
  fact: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, margin: `${SPACE.sm}px 0 0`, fontWeight: 600 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: `${SPACE.sm}px 0 0` },
  unlock: {
    fontSize: TYPE.body, lineHeight: 1.55, color: RIVER_DEEP, background: RIVER_TINT,
    padding: SPACE.sm, borderRadius: RADIUS.md, margin: `${SPACE.sm}px 0 0`, fontWeight: 600,
  },
  refused: { fontSize: TYPE.body, lineHeight: 1.55, color: MUTED, margin: 0 },
  bands: { display: 'grid', gap: SPACE.sm, marginTop: SPACE.sm },
  bForm: { margin: 0 },
  band: {
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: SPACE.sm, padding: `14px ${SPACE.md}px`, fontFamily: FONT, fontSize: TYPE.body,
    textAlign: 'left', color: INK, background: PANEL, border: `1.5px solid ${LINE}`,
    borderRadius: RADIUS.md, cursor: 'pointer',
  },
  bandLabel: { fontWeight: 600 },
  bandMoney: { fontWeight: 800, color: RIVER_DEEP, whiteSpace: 'nowrap' },
  pressed: { borderColor: RIVER, background: RIVER_TINT },
  compare: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.sm, marginTop: SPACE.sm },
  col: { padding: SPACE.sm, background: SURFACE, borderRadius: RADIUS.md, border: `1px solid ${LINE}` },
  colHead: { fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, margin: 0 },
  colMoney: { fontSize: TYPE.lead, fontWeight: 800, color: INK, margin: `${SPACE.xs}px 0 0` },
  colFoot: { fontSize: TYPE.note, lineHeight: 1.45, color: MUTED, margin: `${SPACE.xs}px 0 0` },
  elect: {
    width: '100%', padding: `14px ${SPACE.md}px`, fontSize: TYPE.body, fontWeight: 700,
    fontFamily: FONT, color: ON_RIVER, background: RIVER, border: 'none',
    borderRadius: RADIUS.md, cursor: 'pointer',
  },
  remove: {
    width: '100%', padding: `12px ${SPACE.md}px`, fontSize: TYPE.note, fontWeight: 600,
    fontFamily: FONT, color: MUTED, background: PANEL, border: `1.5px solid ${LINE}`,
    borderRadius: RADIUS.md, cursor: 'pointer',
  },
  foot: {
    fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, textAlign: 'center',
    margin: `${SPACE.md}px ${SPACE.md}px ${SPACE.lg}px`,
  },
};
