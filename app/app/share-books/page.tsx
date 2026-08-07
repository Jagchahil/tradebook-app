import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { listBookShares, getConfirmedTransactionsForUser } from '../../../lib/supabase';
import { categoriesIn, grantState, shareToken } from '../../../lib/bookshare';
import { siteBase } from '../../../lib/packtoken';
import { verifyInvoiceRef, invoiceRefUsable } from '../invoiceref';
import { A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, ON_WHATSAPP, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE, WHATSAPP,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// SHARE YOUR BOOKS. A read only link for the mortgage broker, the landlord, the lender, or the
// accountant, prepared here and sent by HIM.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ EVERY RULE ABOUT WHAT A SHARE MEANS LIVES IN lib/bookshare.ts AND IS ONLY OBEYED HERE. The
// scope, the redaction, the revocation design, the reason a share with no date range shares
// nothing: all decided once, in lib, tested there, and read by this page and /api/share alike.
//
// ⚠️ PREPARED, THEN APPROVED, THEN SENT BY HIM. Pressing the button mints the link and shows it
// to him ONCE. We never email it, whatever address he noted for the recipient: handing a man's
// books to a third party is exactly what the approval gate exists for, and the approval is him
// pressing send in his own apps.
//
// ⚠️ THE LINK IS SHOWN ONCE, AND THE ONCE IS ENFORCED BY A SEALED, SHORT LIVED REFERENCE. The
// create route redirects here with a fifteen minute 'share' reference from
// app/app/invoiceref.ts, so no grant id ever rides in an app URL and the link cannot be
// re-summoned from browser history over lunch. After that, a link that was lost is a link he
// revokes and re-makes, which is the safe direction to fail in.
//
// ⚠️ REVOCATION IS THE HEADLINE FEATURE, lib/bookshare's own design: the row is live truth, so
// killing a link here kills it on the recipient's next request, however long it had left.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function longDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}

// Opening year of the tax year that d falls in (6 April boundary), the same two lines the
// income proof surfaces use. A date fact, not a rule.
function currentTaxYear(d: Date): number {
  return d.getUTCMonth() > 3 || (d.getUTCMonth() === 3 && d.getUTCDate() >= 6) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

function notice(done: string | undefined, problem: string | undefined): string | null {
  if (done === 'revoked') return 'That link is dead. Whoever has it sees nothing from now on.';
  if (done === 'made') return 'The share is made. It is in the list below.';
  switch (problem) {
    case 'bad':
      return 'Something in that did not read right. Nothing was shared, so have another go.';
    case 'slow':
      return 'That is a lot of links at once. Give it an hour and try again.';
    case 'unavailable':
      return 'That did not save. Nothing was shared, so try it again.';
    case 'notfound':
      return 'We could not find that share to revoke. If it is still in the list, try again.';
    case 'off':
      return 'Sharing is not switched on in this build.';
    default:
      return null;
  }
}

export default async function ShareBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  // Carries him back here after he signs in, the /app/you/billing pattern: safeNext() in
  // lib/websession.ts allowlists /app and below, so this cannot become an open redirect.
  if (!user) redirect('/in?next=%2Fapp%2Fshare-books');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = notice(one('done'), one('problem'));

  // Presence only, never the value. The rule "no secret, no shares" is lib/bookshare's; this
  // page only asks whether to draw a form that could work (doc 103's honesty test: a form whose
  // submit can only ever fail is an advert for a broken build).
  const configured = (process.env.SHARE_TOKEN_SECRET || '').length > 0;

  const [shares, rows] = await Promise.all([
    listBookShares(user.id),
    getConfirmedTransactionsForUser(user.id),
  ]);
  const categories = categoriesIn(rows);

  // The once card. A sealed 'share' reference minted by the create route, honoured only for
  // this session, only for its purpose, and only for fifteen minutes.
  const madeClaim = verifyInvoiceRef(one('made') ?? null);
  const madeShare = madeClaim && invoiceRefUsable(madeClaim, user.id, 'share')
    ? shares.find((s) => s.id === madeClaim.row) ?? null
    : null;
  const madeUrl = madeShare && configured ? `${siteBase()}/share/${shareToken(madeShare.id)}` : null;

  const now = new Date();
  const ty = currentTaxYear(now);
  const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);

  const shareText = madeUrl
    ? `Here is a read only view of my business figures, from my bookkeeping: ${madeUrl}`
    : '';

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/share-books" />

      {said ? <p style={S.said}>{said}</p> : null}

      {madeUrl && madeShare ? (
        <section className="lek-card" style={S.onceCard}>
          <h2 className="lek-h2">The link is ready. This is the only time we show it.</h2>
          <p style={S.linkBlock}>{madeUrl}</p>
          {/* The green anchor opens his own messaging app's share screen with the text written.
              test/frontdoor.test.mjs keeps app copy from naming the channel, and this share
              sheet needs no bound number, so the label names the act instead. */}
          <div style={S.shareRow}>
            <a className="lek-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>
              Share the link
            </a>
            <a
              className="lek-ghostlink"
              href={`mailto:${madeShare.recipient_email ?? ''}?subject=${encodeURIComponent('My business figures')}&body=${encodeURIComponent(shareText)}`}
            >
              Send by email
            </a>
          </div>
          <p style={S.quiet}>
            It opens a read only view of what you chose, and nothing else. We do not send it
            anywhere: you do, and you can kill it below whenever you like. A link on a screen is
            a link anyone passing can read, which is why it will not be shown again.
          </p>
        </section>
      ) : null}

      {!configured ? (
        <section className="lek-card">
          <p style={S.lead}>Sharing is not switched on in this build yet.</p>
          <p style={S.quiet}>Your books have not changed and nothing has been shared.</p>
        </section>
      ) : (
        <section className="lek-card">
          <h1 className="lek-title">Share your books</h1>
          <p style={S.sub}>
            A mortgage broker, a landlord or a lender wants to see your figures. This makes a
            read only link showing exactly what you choose, and you can kill it at any time.
          </p>

          <form action="/api/share-books" method="post">
            <input type="hidden" name="action" value="create" />

            <label htmlFor="name" style={S.label}>Who it is for, so you remember later</label>
            <input id="name" name="name" type="text" maxLength={120} className="lek-field" />

            <label htmlFor="email" style={S.label}>Their email, if you want it kept with the share</label>
            <input id="email" name="email" type="text" maxLength={200} className="lek-field" />
            <p style={S.fieldNote}>Only a note for you. We never email them.</p>

            <label htmlFor="from" style={S.label}>What they see starts from</label>
            <select id="from" name="from" defaultValue={`${ty}-04-06`} className="lek-field">
              <option value={`${ty}-04-06`}>This tax year, 6 April on</option>
              <option value={`${ty - 1}-04-06`}>The last two tax years</option>
              <option value={threeMonthsAgo}>The last three months</option>
            </select>

            <label htmlFor="days" style={S.label}>How long the link lives</label>
            <select id="days" name="days" defaultValue="365" className="lek-field">
              <option value="30">A month</option>
              <option value="90">Three months</option>
              <option value="365">A year</option>
            </select>

            {/* His own real categories, from lib/bookshare's categoriesIn, never a guessed list.
                Drawn only when there is something to untick: an empty fieldset is a row that
                says nothing. */}
            {categories.length > 0 ? (
              <fieldset style={S.fieldset}>
                <legend style={S.label}>Keep any of these out of it</legend>
                <div style={S.catWrap}>
                  {categories.map((c) => (
                    <label key={c} style={S.catRow}>
                      <input type="checkbox" name="exclude" value={c} />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <p style={S.weight}>
              Pressing this prepares the link and shows it to you once. Nothing is sent by us,
              to anyone, ever. Sharing it is yours to do, and taking it back is one press here.
            </p>

            <button type="submit" className="lek-primary">Prepare the link</button>
          </form>
        </section>
      )}

      {shares.length > 0 ? (
        <section className="lek-card">
          <h2 className="lek-h2">Links you have made</h2>
          <ul style={S.list}>
            {shares.map((s) => {
              const state = grantState(s, now);
              const who = s.recipient_name || s.recipient_email || 'No name kept';
              const opened = s.view_count > 0
                ? `Opened ${s.view_count === 1 ? 'once' : `${s.view_count} times`}${s.last_viewed_at ? `, last on ${longDate(s.last_viewed_at)}` : ''}.`
                : 'Not opened yet.';
              return (
                <li key={s.id} className="lek-row">
                  <div style={S.rowMain}>
                    <span style={state === 'ok' ? S.who : S.whoDead}>{who}</span>
                    <span style={state === 'ok' ? S.stateLive : S.stateDead}>
                      {state === 'ok' ? `Live until ${longDate(s.expires_at)}` : state === 'revoked' ? 'Revoked' : 'Expired'}
                    </span>
                  </div>
                  <div style={S.rowMeta}>
                    {s.from_date ? <span>Figures from {longDate(s.from_date)}.</span> : null}
                    <span>{opened}</span>
                    {state === 'ok' ? (
                      <form action="/api/share-books" method="post" style={S.inlineForm}>
                        <input type="hidden" name="action" value="revoke" />
                        {/* The id travels in the post body, never a URL, and the route scopes
                            the revoke to this account whatever the field claims. */}
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="lek-kill">Kill this link</button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p style={S.foot}>
        Whoever opens a link sees figures only: no phone number, no email, no bank, nothing to
        press. Killing a link here kills it everywhere, at once.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
  `.lek-field{box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL};width:100%}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `.lek-wa{display:inline-block;padding:12px 18px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_WHATSAPP};background:${WHATSAPP};border-radius:${RADIUS.md}px;text-decoration:none}`,
  `.lek-ghostlink{display:inline-block;padding:12px 18px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${MUTED};background:${PANEL};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;text-decoration:none;transition:color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-ghostlink:hover{color:${INK}}`,
  `.lek-row{border-top:1px solid ${LINE};padding:13px 0 0;margin-top:13px}`,
  `.lek-row:first-child{border-top:none;padding-top:0;margin-top:0}`,
  `.lek-kill{border:1px solid ${LINE};background:${PANEL};color:${MUTED};font-family:inherit;font-size:${TYPE.label}px;font-weight:700;padding:4px 10px;border-radius:${RADIUS.pill}px;cursor:pointer;transition:color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-kill:hover{color:${INK}}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-title{font-size:${TYPE.stat}px}
    .lek-field{max-width:420px}
    .lek-primary{width:auto;min-width:264px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  onceCard: { borderLeft: `3px solid ${RIVER}` },
  linkBlock: { fontSize: TYPE.note, fontWeight: 600, lineHeight: 1.5, background: SURFACE, borderRadius: RADIUS.md, padding: '11px 13px', margin: '0 0 12px', wordBreak: 'break-all', userSelect: 'all' },
  shareRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },

  sub: { fontSize: TYPE.body, lineHeight: 1.55, color: MUTED, margin: '0 0 4px' },
  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '12px 0 6px' },
  fieldNote: { fontSize: TYPE.note, lineHeight: 1.5, color: MUTED, margin: '6px 0 0' },
  fieldset: { border: 'none', margin: 0, padding: 0 },
  catWrap: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  catRow: { display: 'flex', gap: 6, alignItems: 'center', background: SURFACE, borderRadius: RADIUS.pill, padding: '6px 12px', fontSize: TYPE.note, fontWeight: 600, cursor: 'pointer' },

  weight: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },

  list: { listStyle: 'none', margin: 0, padding: 0 },
  rowMain: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' },
  who: { fontSize: TYPE.body, fontWeight: 700 },
  whoDead: { fontSize: TYPE.body, fontWeight: 700, color: MUTED },
  stateLive: { fontSize: TYPE.note, fontWeight: 700 },
  stateDead: { fontSize: TYPE.note, fontWeight: 700, color: MUTED },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: TYPE.label, color: MUTED, marginTop: 6 },
  inlineForm: { margin: 0, marginLeft: 'auto' },

  lead: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '12px 0 0' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
