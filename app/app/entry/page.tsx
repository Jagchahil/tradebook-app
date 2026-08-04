import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { transactionsInMonth } from '../../../lib/supabase';
import { logFor, monthTitle, dayLabel } from '../../../lib/moneylog';
import { gbp0 } from '../../../lib/money';
import { verifyEntryRef, refBelongsTo } from '../entryref';
import {
  CAPITAL_QUESTION_FROM, capitalOptions, capitalQuestion, capitalRelief, isCapitalKind,
  isWrittenDown, type CapitalKind,
} from '../../../lib/capital';
import { CarBands, CarVerdict, CAR_CSS } from '../CarQuestion';
import { A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import { GREEN, INK, LINE, MUTED, PAPER, RIVER, SURFACE } from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ONE LINE, IN FULL. The page behind a row on /app/money.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE URL CARRIES A SEALED REFERENCE, NEVER AN ID, AND THE REFERENCE GRANTS NOTHING.
//
// test/webauth.test.mjs's tenancy design is that there is nowhere in a web app URL to put an id,
// so there is nothing a customer can change to reach another customer's row. This page keeps
// that true: the ref is minted by /app/money with app/app/entryref.ts, encrypted and expiring,
// and even a VALID one is only honoured after refBelongsTo says it was minted for the session
// asking. The row itself is then read through transactionsInMonth, which is scoped by user_id
// like every read in lib/supabase.ts. Three fences, and none of them trusts the URL.
//
// ⚠️ NOTHING IS DECIDED HERE. The row comes back through the same logFor that draws the month,
// so this page cannot disagree with /app/money about a single figure, and the one correction on
// offer is the same form /app/money posts to /api/personal. A detail view with its own verbs
// would be a second implementation of correcting, and the one that drifts is the one he used.
//
// ⚠️ MONEY IN HAS NO BUTTON, BY THE SAME ONE WAY RULE AS THE MONTH PAGE. Striking out a payment
// INTO his account removes income from his own tax figures in one press, and understating
// income is the one direction of error this product never makes easy. The page says so plainly
// instead of hiding the absence.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  // A missing, stale, tampered or borrowed reference all land in the same place: his own month
  // log. Not an error page, because every one of those is either a bookmark gone cold or someone
  // else's link, and neither deserves a screen about it.
  const claim = verifyEntryRef(one('ref') ?? null);
  if (!claim || !refBelongsTo(claim, user.id)) redirect('/app/money');
  const { row, month } = claim;

  const askedKind = one('kind');
  const saved = one('saved') === '1';
  const failed = one('problem') === 'capital';

  const rows = await transactionsInMonth(user.id, month);
  // ⚠️ A FAILED READ IS NOT A MISSING ROW. Telling a man his payment is gone over a database
  // timeout is the kind of false he acts on, so the two get different screens.
  const read = rows !== null;
  const entry = read
    ? logFor(rows ?? [], month, (r) => isWrittenDown(r.capital_kind)).entries.find((e) => e.id === row) ?? null
    : null;

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE CAR HE HAS ALREADY FILED, WHICH THE PILE CANNOT REACH AND NEVER WILL.
  //
  // Walking the deployed site on 2 August 2026, an hour after the pile learned to ask: AUDI
  // LEEDS, £60,000, filed under 'van', confirmed, capital_kind null. The pile asks BEFORE a row
  // is confirmed, so it can only ever protect payments that have not been filed yet. Everything
  // already in his books, everything typed straight into /app/money/add, and everything that
  // arrives through WhatsApp is confirmed on the way in and is never asked at all.
  //
  // His two options on that row were: leave it as a £60,000 deduction, or press "Not business",
  // which takes the whole cost out. Both are wrong. He DID buy it for the business and he IS
  // entitled to the writing down allowance; what he is not entitled to is the lot in year one.
  //
  // ⚠️ SO THE CORRECTION LIVES HERE, ON THE SCREEN THE MONEY LOG ALREADY POINTS AT WHEN A LINE
  // LOOKS WRONG, and it covers every door at once rather than being bolted onto each writer.
  // The foot of this page has always promised "if it looks wrong, it is worth fixing". Until
  // now the only thing it could fix was whether the payment happened at all.
  //
  // ⚠️ MONEY OUT, OVER THE THRESHOLD, AND NOT ALREADY MARKED PERSONAL. A row he has taken out of
  // his books entirely has no allowance to argue about, and asking would be a question with no
  // consequence, which doc 103 says never to ask.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const raw = read
    ? ((rows ?? []).find((r) => r.id === row) as Record<string, unknown> | undefined) ?? null
    : null;
  const storedKind = isCapitalKind(raw?.capital_kind) ? raw.capital_kind : null;
  const storedPct = raw && raw.business_use_pct != null ? Number(raw.business_use_pct) : null;
  const cost = entry ? Math.abs(entry.amount) : 0;
  const canAsk = Boolean(entry) && entry!.amount < 0 && !entry!.personal && cost >= CAPITAL_QUESTION_FROM;

  // Step two of a two step question on ONE screen, with no client script anywhere: the kind form
  // is a GET back to this same page carrying his answer, and this page then draws the priced
  // bands instead of the select. A hidden field revealed on change would need JavaScript, and
  // a business use share defaulted to 100% because nobody asked is CAA 2001 s205 answered by a
  // machine on his behalf, in the direction that over claims.
  const asking: CapitalKind | null =
    canAsk && isCapitalKind(askedKind) && askedKind !== 'not_a_car' ? askedKind : null;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/money" />

      <p style={S.crumb}>
        <a href={`/app/money?m=${month}`} style={S.crumbLink}>&larr; Back to {monthTitle(month)}</a>
      </p>

      {!read ? (
        <section className="lek-card">
          <p style={S.lead}>We could not read that line just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : !entry ? (
        <section className="lek-card">
          <p style={S.lead}>That line is not in {monthTitle(month)} any more.</p>
          <p style={S.quiet}>
            The month page has the current picture, and everything on it is a line you can open.
          </p>
        </section>
      ) : (
        <section className="lek-card">
          <h1 className={entry.personal ? 'lek-title lek-off' : 'lek-title'}>{entry.label}</h1>
          <p
            className="lek-figure"
            style={entry.personal ? S.amountOff : (entry.amount >= 0 ? S.amountIn : undefined)}
          >
            {gbp0(entry.amount)}
          </p>

          <dl style={S.meta}>
            <dt style={S.dt}>When</dt>
            <dd style={S.dd}>{dayLabel(entry.date)} {month.slice(0, 4)}</dd>
            <dt style={S.dt}>Filed under</dt>
            <dd style={S.dd}>{entry.category ?? 'Nothing yet'}</dd>
          </dl>

          {entry.personal ? (
            <p style={S.quiet}>
              Marked as not business money, so it is not in your totals. It stays on your list,
              struck through, and you can put it back.
            </p>
          ) : null}

          {saved ? (
            <p style={S.saved}>
              Saved. Your figures have been worked out again with it.
            </p>
          ) : null}
          {failed ? (
            <p style={S.saved}>
              We could not save that just now, so nothing has changed. Try again in a minute.
            </p>
          ) : null}

          {/* ── WAS IT A CAR ────────────────────────────────────────────────────────────── */}
          {canAsk && asking ? (
            <section style={S.car}>
              <h2 className="lek-h2">
                {storedKind && storedKind !== 'not_a_car' ? 'Change what this was' : 'This changes what it is worth'}
              </h2>
              <CarVerdict cost={cost} kind={asking} />
              <p style={S.carAsk}>How much of the driving is for work?</p>
              <p style={S.quiet}>
                HMRC only lets you claim the business share of a vehicle. A rough answer is the
                right answer.
              </p>
              <CarBands
                cost={cost}
                kind={asking}
                action="/api/money/capital"
                hidden={{ ref: one('ref') ?? '', capital_kind: asking }}
                submitLabel="Save it"
              />
              <p style={S.carOut}>
                <a href={`/app/entry?ref=${encodeURIComponent(one('ref') ?? '')}`} style={S.crumbLink}>
                  It was not a car after all
                </a>
              </p>
            </section>
          ) : canAsk ? (
            <section style={S.car}>
              <h2 className="lek-h2">{capitalQuestion()}</h2>
              {/* ═══════════════════════════════════════════════════════════════════════════
                    🔴 THIS SENTENCE TOLD A MAN THAT £2,700 WAS "MOST OF" £60,000.
                    It read: "That is £2,700 off your profit this year, most of it, about three
                    quarters." The tail was bandLabel(75), which is written to be a DROPDOWN OPTION
                    answering how much of the driving is work. Bolted onto the end of a sentence it
                    modifies the nearest thing, and the nearest thing was a pound figure. £2,700 is
                    4.5% of that car, and this is the one screen in the product built to stop
                    exactly this misunderstanding.
                    ⚠️ SO THE SHARE IS STATED BEFORE THE FIGURE, NEVER AFTER IT, and the cost is
                    named alongside the relief so the two numbers cannot be mistaken for each other.
                    ═══════════════════════════════════════════════════════════════════════════ */}
              {storedKind ? (
                <p style={S.quiet}>
                  {storedKind === 'not_a_car'
                    ? 'You told us this was not a car, so it comes off your profit in full this year.'
                    : `You told us this was a car${storedPct && storedPct < 100 ? `, and ${storedPct}% of the driving is work` : ''}. ${gbp0(cost)} left your account and ${gbp0(capitalRelief(cost, storedKind, storedPct ?? 100).thisYear)} of it comes off your profit this year. The rest is not lost: a car is written down a little at a time, every year you own it.`}
                </p>
              ) : (
                <p style={S.quiet}>
                  A payment this size is worth one more question. A van, a digger or a tester comes
                  off your profit in full this year. A car cannot, and we have never asked you.
                </p>
              )}
              {/* ⚠️ A GET, NOT A POST, AND IT WRITES NOTHING. Choosing "a car" only redraws this
                  page with the bands on it. Nothing about his books changes until he presses Save
                  on the next step, so a man who opens the select and thinks better of it has
                  changed nothing. */}
              <form action="/app/entry" method="get" style={S.form}>
                <input type="hidden" name="ref" value={one('ref') ?? ''} />
                <label htmlFor="kind" style={S.label}>What was it</label>
                <select id="kind" name="kind" defaultValue={storedKind ?? 'not_a_car'} className="lek-select">
                  {capitalOptions().map((o) => (
                    <option key={o.kind} value={o.kind}>{o.label}</option>
                  ))}
                </select>
                <button type="submit" className="lek-ghost">Next</button>
              </form>
              {/* ═══════════════════════════════════════════════════════════════════════════
                  🔴 THIS BUTTON SAID "leave it as it is" WHILE MOVING £1,284 OF A MAN'S COSTS.
                  Found on 4 August walking a real row: MEGGER LTD, £1,284 of electrical test
                  equipment, answered at some point as "any other car". The screen correctly told
                  him "£1,284 left your account and £58 of it comes off your profit this year",
                  and the one button that fixes it read "It was not a car, leave it as it is".
                  The comment that used to sit here said why: "a van comes off in full, WHICH IS
                  WHAT THE ROW IS ALREADY DOING". True when nobody has been asked, and false in
                  the only case where a man needs this button, because then the row is being
                  written down at 6% a year and pressing it puts the whole cost back.
                  ⚠️ A LABEL WRITTEN FOR THE UNANSWERED CASE, LEFT ON THE ANSWERED ONE. Nobody
                  presses a button marked "leave it as it is" in order to change something, so
                  the correction screen was hiding its own correction. It says what it does now,
                  in pounds, and only where it does it.
                  ═══════════════════════════════════════════════════════════════════════════ */}
              {storedKind !== 'not_a_car' ? (
                <form action="/api/money/capital" method="post" style={S.form}>
                  <input type="hidden" name="ref" value={one('ref') ?? ''} />
                  <input type="hidden" name="capital_kind" value="not_a_car" />
                  <button type="submit" className="lek-ghost">
                    {storedKind
                      ? `It was not a car. Put the whole ${gbp0(cost)} in my costs`
                      : 'It was not a car, leave it as it is'}
                  </button>
                  {storedKind ? (
                    <p style={S.quiet}>
                      A van, a digger or a tester is plant and machinery, so the whole cost comes
                      off this year instead of a slice a year. Your figures update straight away.
                    </p>
                  ) : null}
                </form>
              ) : null}
            </section>
          ) : null}

          {/* The same correction, through the same route, with the same words as the month page.
              The month travels with it so /api/personal lands him back on the right month. */}
          {entry.amount < 0 ? (
            <form action="/api/personal" method="post" style={S.form}>
              <input type="hidden" name="id" value={entry.id} />
              <input type="hidden" name="m" value={month} />
              <input type="hidden" name="personal" value={entry.personal ? 'false' : 'true'} />
              <button type="submit" className="lek-ghost">
                {entry.personal ? 'Put it back' : 'Not business'}
              </button>
            </form>
          ) : (
            <p style={S.quiet}>
              Money in stays put. It is in your income figures, and no button here can quietly
              take it out. If it really is wrong, that is a conversation, not a tap.
            </p>
          )}
        </section>
      )}

      <p style={S.foot}>
        This line is part of what your tax figures are worked out from. If it looks wrong, it is
        worth fixing: the figures follow it.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  CAR_CSS,
  `.lek-select{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${SURFACE};margin-bottom:${SPACE.sm}px}`,
  `select:focus,button:focus{outline:3px solid ${RIVER};outline-offset:2px}`,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.hair}px}`,
  `.lek-off{color:${MUTED};text-decoration:line-through}`,
  `.lek-figure{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.md}px;font-variant-numeric:tabular-nums}`,
  `.lek-ghost{width:100%;padding:12px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${MUTED};background:transparent;border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;cursor:pointer;transition:color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-ghost:hover{color:${INK}}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-title{font-size:${TYPE.stat}px}
    .lek-figure{font-size:${TYPE.title}px}
    .lek-ghost{width:auto;min-width:264px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  crumb: { margin: '0 0 12px' },
  crumbLink: { color: RIVER, fontSize: TYPE.note, fontWeight: 700, textDecoration: 'none' },

  amountIn: { color: GREEN },
  amountOff: { color: MUTED, textDecoration: 'line-through' },

  meta: { margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px' },
  dt: { fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: 0 },
  dd: { fontSize: TYPE.body, fontWeight: 700, margin: 0 },

  lead: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '12px 0 0', background: SURFACE, borderRadius: RADIUS.md, padding: '10px 12px' },
  form: { margin: '16px 0 0' },
  // The car question, fenced off from the payment's own facts above it. It is a different kind of
  // thing: not what this line IS, but what it is worth.
  car: { marginTop: 20, paddingTop: 18, borderTop: `1px solid ${LINE}` },
  carAsk: { fontSize: TYPE.strong, fontWeight: 700, margin: '18px 0 0' },
  carOut: { margin: '14px 0 0', textAlign: 'center' },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '0 0 6px' },
  saved: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
