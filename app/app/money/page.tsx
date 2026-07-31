import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import {
  transactionsInMonth, earliestTransactionDate, pileEntries, readOwnNames, readAccountUse,
} from '../../../lib/supabase';
import { buildPile, partitionPile } from '../../../lib/reviewpile';
import { normaliseVendor } from '../../../lib/memory';
import { categoriseBankLine } from '../../../lib/categories';
import {
  isMonthKey, logFor, monthKeyOf, monthTitle, stepMonth, dayLabel,
} from '../../../lib/moneylog';
import { gbp0 } from '../../../lib/money';
import { entryRef } from '../entryref';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, GREEN, INK, LINE, MOTION, MUTED, PANEL, PAPER, RADIUS, RIVER,
  SPACE, SURFACE, TYPE,
} from '../../../lib/tokens';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// EVERYTHING LOGGED. The screen a man opens to check our working, or to find one payment.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE LEDGER'S WHOLE CLAIM DEPENDS ON THIS PAGE EXISTING.
//
// The Overview tells him Lekhio kept £2,000 out of the taxman's hands. lib/ledger.ts's header says
// that is a specification and not a slogan: if we cannot show him the £2,000 we have not earned the
// £12.99. Every line of it comes from rows, and until now the web app had nowhere to look at a row.
// A figure a man cannot check is a figure he takes on trust, and trust is the thing we are selling.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ SERVER RENDERED, AND EVERY CORRECTION IS A FORM POST. He is on a cheap Android on a bad signal
// and a page that cannot act until JavaScript arrives is a page that cannot act. The cost is a full
// page load per correction, which on this screen is honest: he is fixing the odd row, not dragging
// a slider.
//
// ⚠️ AND NOTHING IS DECIDED HERE. lib/moneylog.ts groups the month and adds it up, /api/personal
// takes the correction and teaches the brain from it, lib/reviewpile.ts counts what is still
// waiting. This file is a surface.

function notice(code: string | undefined): string | null {
  switch (code) {
    case 'personal':
      return 'Marked as not business money. It stays in your list, struck through, and you can put it back.';
    case 'business':
      return 'Put back in your business figures.';
    case 'failed':
      return 'That did not save. Nothing has changed, so try it again.';
    default:
      return null;
  }
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = notice(one('done'));

  const now = new Date();
  const asked = one('m');
  // A month key we do not recognise is somebody editing the query string, and the answer to that is
  // this month rather than an error page about his own money.
  const month = isMonthKey(asked) ? asked : monthKeyOf(now);

  const [rows, since, pileRows, ownNames, accountUse] = await Promise.all([
    transactionsInMonth(user.id, month),
    earliestTransactionDate(user.id),
    pileEntries(user.id).catch(() => []),
    readOwnNames(user.id).catch(() => [] as string[]),
    readAccountUse(user.id).catch(() => 'mixed' as const),
  ]);

  // ⚠️ A READ THAT FAILED IS NOT A QUIET MONTH. Printing an empty April over a database timeout
  // tells a man something false about his own money, and it is the kind of false he acts on.
  const read = rows !== null;
  const log = logFor(rows ?? [], month);

  // ⚠️ AN ARROW ONLY EXISTS WHERE THERE IS SOMETHING TO GO TO. Doc 103's third test: a button whose
  // only function is to show him a month from before he started trading is an advert for the fact
  // that we have nothing. A failed read of the start date leaves the arrow ON: letting him step into
  // an empty month is a far smaller fault than refusing to let him reach a real one.
  const prev = stepMonth(month, -1);
  const next = stepMonth(month, 1);
  const canGoBack = since === null || prev >= since.slice(0, 7);
  const canGoForward = next <= monthKeyOf(now);

  // The pile, counted with the same three functions the Overview and /app/pile use, so the three
  // screens cannot disagree about how many questions he has left.
  const { known, unknown, careful } = partitionPile(
    buildPile(pileRows, normaliseVendor, ownNames, categoriseBankLine),
    accountUse,
  );
  const waiting = known.length + unknown.length + careful.length;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/money" />

      {said ? <p style={S.said}>{said}</p> : null}

      {/* What is still waiting comes FIRST, because everything below it is money that is already
          counted and everything in the pile is money that is not. A man reading a total needs to
          know it is incomplete before he reads it, not after. */}
      {waiting > 0 ? (
        <a href="/app/pile" style={S.waiting} className="lek-hit">
          <span style={S.waitingCount}>{waiting}</span>
          <span>
            <span style={S.waitingTop}>
              {waiting === 1 ? 'One thing is waiting on you' : `${waiting} things are waiting on you`}
            </span>
            <span style={S.waitingBody}>None of it is counted below until you answer it.</span>
          </span>
        </a>
      ) : null}

      <section className="lek-card">
        <div style={S.monthRow}>
          {canGoBack ? (
            <a href={`/app/money?m=${prev}`} style={S.arrow} aria-label={`Go to ${monthTitle(prev)}`}>&larr;</a>
          ) : <span style={S.arrowOff} aria-hidden="true">&larr;</span>}
          <h1 className="lek-month">{monthTitle(month)}</h1>
          {canGoForward ? (
            <a href={`/app/money?m=${next}`} style={S.arrow} aria-label={`Go to ${monthTitle(next)}`}>&rarr;</a>
          ) : <span style={S.arrowOff} aria-hidden="true">&rarr;</span>}
        </div>

        <div className="lek-grid">
          <div className="lek-tile">
            <div className="lek-tile-label">In</div>
            <div className="lek-tile-value" style={{ color: GREEN }}>{gbp0(log.income)}</div>
          </div>
          <div className="lek-tile">
            <div className="lek-tile-label">Out</div>
            <div className="lek-tile-value" style={{ color: RIVER }}>{gbp0(log.expenses)}</div>
          </div>
          <div className="lek-tile">
            <div className="lek-tile-label">Profit</div>
            <div className="lek-tile-value">{gbp0(log.profit)}</div>
          </div>
        </div>

        {/* Said once, and only when there is something it applies to. A permanent footnote about
            personal money on a page with none is a line he reads and rejects every visit. */}
        {log.personalCount > 0 ? (
          <p style={S.quiet}>
            {log.personalCount === 1
              ? 'One line below is marked as not business money, so it is not in these totals.'
              : `${log.personalCount} lines below are marked as not business money, so they are not in these totals.`}
          </p>
        ) : null}
      </section>

      {!read ? (
        <section className="lek-card">
          <p style={S.empty}>We could not read {monthTitle(month)} just now.</p>
          <p style={S.quiet}>
            Nothing is lost and nothing has changed. Load the page again in a minute.
          </p>
        </section>
      ) : log.entries.length === 0 ? (
        <section className="lek-card">
          <p style={S.empty}>Nothing logged in {monthTitle(month)}.</p>
          {/* ⚠️ THIS NAMES ONE THING HE CAN ACTUALLY DO, AND ONLY ONE.
              The first draft ended "anything you send us in a chat arrives here too", and
              test/frontdoor.test.mjs was right to fail the build over it. Inbound messages are
              resolved BY PHONE NUMBER and a web customer's number is deliberately unproved until he
              binds it, so on this screen that sentence is an instruction he may well be unable to
              follow. The Overview carries the offer to bind it, gated on whether he can. */}
          <p style={S.quiet}>Connect your bank and every payment lands here on its own.</p>
        </section>
      ) : (
        <section className="lek-card">
          <ul style={S.list}>
            {log.entries.map((e) => {
              // ⚠️ THE ROW'S ID NEVER REACHES THE URL. The link carries a sealed reference from
              // app/app/entryref.ts instead, minted for THIS session and this month, so there is
              // still nothing in any web app URL a customer could edit to reach another man's
              // row. No reference (secret unset) means no link, and the row stays the plain text
              // it always was rather than a dead button.
              const ref = entryRef(user.id, e.id, month);
              return (
              <li key={e.id} className="lek-row">
                <div style={S.rowMain}>
                  {ref ? (
                    <a
                      href={`/app/entry?ref=${encodeURIComponent(ref)}`}
                      style={e.personal ? S.labelOffLink : S.labelLink}
                    >
                      {e.label}
                    </a>
                  ) : (
                    <span style={e.personal ? S.labelOff : S.label}>{e.label}</span>
                  )}
                  {/* ⚠️ gbp0 AND NOTHING ELSE. The first draft of this line built the negative
                      itself, which is the eighteenth money formatter and exactly what the 28 July
                      sweep existed to stop. lib/money.ts puts the sign outside the pound, "-£42"
                      rather than "£-42", because that is how a person writes one. */}
                  <span style={e.personal ? S.amountOff : (e.amount >= 0 ? S.amountIn : S.amount)}>
                    {gbp0(e.amount)}
                  </span>
                </div>
                <div style={S.rowMeta}>
                  <span>{dayLabel(e.date)}</span>
                  {e.category ? <span style={S.chip}>{e.category}</span> : null}
                  {/* ⚠️ ONE BUTTON, AND IT GOES BOTH WAYS. Doc 103: acting for him is only kindness
                      when it is reversible and it is his. Marking a line personal is as small and as
                      personal as a decision gets, so it takes one press and no confirmation, and it
                      can be taken straight back.
                      MONEY IN IS NOT OFFERED THIS. A payment INTO his account that he strikes out is
                      him removing income from his own tax figures with one press, which is the one
                      direction of error this product must never make easy. lib/personal.ts and the
                      pile both already refuse it, and this agrees with them. */}
                  {e.amount < 0 ? (
                    <form action="/api/personal" method="post" style={S.inlineForm}>
                      <input type="hidden" name="id" value={e.id} />
                      {/* The month travels with the correction so he lands back where he was. */}
                      <input type="hidden" name="m" value={month} />
                      <input type="hidden" name="personal" value={e.personal ? 'false' : 'true'} />
                      <button type="submit" className="lek-mark">
                        {e.personal ? 'Put it back' : 'Not business'}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        </section>
      )}

      <p style={S.foot}>
        Everything here is money you have confirmed, and it is what your tax figures are worked out
        from. If a line looks wrong, it is worth fixing: the figures follow it.
      </p>
    </main>
  );
}

// The column, the card, the tile and the desk composition come whole from APP_CSS in
// lib/tokens.ts, shared with the Overview and the pile. This block holds only what this screen
// alone owns: the month title, the ledger rows, and the one button on a row.
const CSS = [
  A11Y_CSS,
  APP_CSS,
  // The month is the one thing this screen is about, so it is the thing that takes the step up on
  // a desk. The figures under it grow with the shared tile classes and nothing else grows at all.
  `.lek-month{font-size:${TYPE.lead}px;font-weight:800;letter-spacing:-0.02em;margin:0}`,
  `.lek-row{border-top:1px solid ${LINE};padding:13px 0 0;margin-top:13px}`,
  `.lek-mark{border:1px solid ${LINE};background:${PANEL};color:${MUTED};font-family:inherit;font-size:${TYPE.label}px;font-weight:700;padding:4px 10px;border-radius:${RADIUS.pill}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease},color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-mark:hover{background:${SURFACE};color:${INK}}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-month{font-size:${TYPE.title}px}
    .lek-row{padding:${SPACE.md}px 0 0;margin-top:${SPACE.md}px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  monthRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  arrow: { color: RIVER, fontSize: 20, fontWeight: 800, textDecoration: 'none', padding: '2px 10px', borderRadius: RADIUS.sm },
  arrowOff: { color: LINE, fontSize: 20, fontWeight: 800, padding: '2px 10px' },

  list: { listStyle: 'none', margin: 0, padding: 0 },
  rowMain: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  label: { fontSize: TYPE.body, fontWeight: 700 },
  labelOff: { fontSize: TYPE.body, fontWeight: 700, color: MUTED, textDecoration: 'line-through' },
  // The label as a link to its own line. Ink, not river: a column of blue vendor names would
  // shout over the figures, and the underline is enough to say "this opens".
  labelLink: { fontSize: TYPE.body, fontWeight: 700, color: INK, textDecoration: 'underline', textDecorationColor: LINE, textUnderlineOffset: 3 },
  labelOffLink: { fontSize: TYPE.body, fontWeight: 700, color: MUTED, textDecoration: 'underline line-through', textDecorationColor: LINE, textUnderlineOffset: 3 },
  amount: { fontSize: TYPE.body, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  amountIn: { fontSize: TYPE.body, fontWeight: 800, color: GREEN, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  amountOff: { fontSize: TYPE.body, fontWeight: 800, color: MUTED, textDecoration: 'line-through', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: TYPE.label, color: MUTED, marginTop: 6 },
  chip: { background: SURFACE, borderRadius: RADIUS.sm, padding: '2px 8px', fontWeight: 700 },
  inlineForm: { margin: 0, marginLeft: 'auto' },

  waiting: { display: 'flex', gap: 14, alignItems: 'center', textDecoration: 'none', background: PANEL, border: `1px solid ${LINE}`, borderLeft: `3px solid ${RIVER}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  waitingCount: { flex: '0 0 auto', minWidth: 40, height: 40, borderRadius: RADIUS.pill, background: SURFACE, color: RIVER, fontSize: TYPE.strong, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 10px', fontVariantNumeric: 'tabular-nums' },
  waitingTop: { display: 'block', fontSize: TYPE.body, fontWeight: 800, color: INK, marginBottom: 3 },
  waitingBody: { display: 'block', fontSize: TYPE.note, lineHeight: 1.5, color: MUTED },

  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
