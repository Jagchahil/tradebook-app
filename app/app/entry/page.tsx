import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { transactionsInMonth } from '../../../lib/supabase';
import { logFor, monthTitle, dayLabel } from '../../../lib/moneylog';
import { gbp0 } from '../../../lib/money';
import { verifyEntryRef, refBelongsTo } from '../entryref';
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

  const rows = await transactionsInMonth(user.id, month);
  // ⚠️ A FAILED READ IS NOT A MISSING ROW. Telling a man his payment is gone over a database
  // timeout is the kind of false he acts on, so the two get different screens.
  const read = rows !== null;
  const entry = read
    ? logFor(rows ?? [], month).entries.find((e) => e.id === row) ?? null
    : null;

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
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
