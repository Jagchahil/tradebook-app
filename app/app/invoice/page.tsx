import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { getPublicInvoice } from '../../../lib/supabase';
import { siteBase } from '../../../lib/packtoken';
import { gbp2 } from '../../../lib/money';
import { verifyInvoiceRef, invoiceRefUsable } from '../invoiceref';
import {
  type InvoiceListRow, invoiceState, statusWords, daysLate, daysSinceIssued, lateWords,
  chaserDraft, isChaserTone, CHASER_TONES, type ChaserTone,
} from '../invoices/words';
import { A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  GREEN, INK, LINE, MUTED, ON_WHATSAPP, PANEL, PAPER, RED, RIVER, RIVER_DEEP, RIVER_TINT, SURFACE,
  WHATSAPP,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ONE INVOICE, IN FULL. The page behind a row on /app/invoices, and the share step after
// /app/invoices/new.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE URL CARRIES A SEALED REFERENCE, NEVER AN ID. app/app/invoiceref.ts, the same design as
// the money detail view: the session is resolved first, and even a VALID reference is only
// honoured after invoiceRefUsable says it was minted for this session AND for this page. A
// stale, borrowed or tampered reference lands on his own invoice list, not an error page.
//
// The row itself is read through getPublicInvoice, the same one-invoice read the public page
// uses. That read is capability shaped rather than user scoped, so here the SEALED REFERENCE
// carries the tenancy: it is only ever minted from a man's own list or his own create, it names
// its owner inside the ciphertext, and it cannot be forged without the key. The public page
// hands the same rows to anyone holding the raw id, which is what these ids are for.
//
// ⚠️ NOTHING ON THIS PAGE SENDS ANYTHING, AND THE ONLY THING IT MUTATES IS HIS OWN RECORD
// (31 July 2026). The share step and the chaser still end in HIS apps: a WhatsApp share sheet,
// an email compose window, a block of text he can copy. A message to another human being always
// asks, and here the asking is the entire feature. The two forms that now exist post plain
// statements of fact to /api/invoices, id in the body never the URL: he sent this invoice, his
// customer paid it. Until they existed the only road to 'paid' was the Stripe webhook, so a
// bank transfer or cash left an invoice the list would call late for ever. Marking paid books
// the income the same way a card payment does, and the page says so before the press.
//
// ⚠️ THE CHASER APPEARS ONLY WHEN THE INVOICE IS LATE. Doc 103's empty test: a "chase this"
// button on an invoice that is not yet due is a nudge to harass a customer who owes nothing
// wrong. The drafts are deterministic templates from ./invoices/words.ts, in the same voice as
// the WhatsApp chaser, and the firmness is HIS choice, made with three links and no script.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function InvoiceDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  // A missing, stale, tampered or borrowed reference all land in the same place: his own
  // invoice list. Not an error page, for entryref's reason: every one of those is a bookmark
  // gone cold or someone else's link, and neither deserves a screen about it.
  const claim = verifyInvoiceRef(one('ref') ?? null);
  if (!claim || !invoiceRefUsable(claim, user.id, 'invoice')) redirect('/app/invoices');
  const { row } = claim;

  const made = one('made') === '1';
  const tone: ChaserTone = isChaserTone(one('tone')) ? (one('tone') as ChaserTone) : 'polite';

  // What a mark press came back saying. The row below already shows the new status, so these
  // are one line each, not a ceremony.
  const said = one('did') === 'sent'
    ? 'Noted as sent.'
    : one('did') === 'paid'
      ? 'Marked paid. The money is in your income figures.'
      : one('problem') === 'save'
        ? 'That did not save. Nothing has changed, so try it again.'
        : one('problem') === 'slow'
          ? 'That was a lot at once. Give it a minute and try again.'
          : null;

  const inv = await getPublicInvoice(row);

  // The public capability link, the one sanctioned place an invoice id lives in a URL: it is
  // the link his CUSTOMER opens, with no session and no account. See docs/93 and the header of
  // app/app/entryref.ts for the rule it is the exception to.
  const publicLink = `${siteBase()}/invoice/${row}`;

  const todayISO = new Date().toISOString().slice(0, 10);
  const asRow: InvoiceListRow | null = inv
    ? {
      id: row,
      number: inv.number,
      customer: inv.customer_name,
      total: inv.total,
      status: inv.status,
      issued: inv.issued_date,
      due: inv.due_date,
    }
    : null;
  const state = asRow ? invoiceState(asRow, todayISO) : null;
  const late = asRow && state === 'late' ? daysLate(asRow, todayISO) : 0;

  const shareText = inv
    ? `Invoice ${inv.number} for ${gbp2(inv.total)}. You can see it and pay it here: ${publicLink}`
    : '';
  const draft = asRow && late > 0
    ? chaserDraft(tone, {
      customer: asRow.customer,
      number: asRow.number,
      total: asRow.total,
      daysSinceIssued: daysSinceIssued(asRow, todayISO),
      daysLate: late,
      link: publicLink,
    })
    : '';

  // The ref travels with the tone links so the page can be re-rendered at a different firmness
  // with no script. It is the reference he already holds, not a new grant of anything.
  const refParam = encodeURIComponent(one('ref') ?? '');

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/invoices" />

      <p style={S.crumb}>
        <a href="/app/invoices" style={S.crumbLink}>&larr; Back to your invoices</a>
      </p>

      {!inv || !asRow ? (
        <section className="lek-card">
          <p style={S.lead}>We could not open that invoice just now.</p>
          <p style={S.quiet}>
            It may have been removed, or it may be us having a bad minute. Your list has the
            current picture, and nothing about your figures has changed.
          </p>
        </section>
      ) : (
        <>
          {made ? (
            <p style={S.said}>
              Invoice {inv.number} is made and saved. Nothing has gone to your customer: the link
              below is the invoice, and sending it is yours to do.
            </p>
          ) : null}

          {said ? <p style={S.said}>{said}</p> : null}

          <section className="lek-card">
            <h1 className="lek-title">{inv.customer_name || 'Customer'}</h1>
            <p className="lek-figure" style={state === 'paid' ? S.figurePaid : undefined}>
              {gbp2(inv.total)}
            </p>
            <div style={S.metaRow}>
              <span style={S.chip}>{inv.number}</span>
              <span style={state === 'late' ? S.lateWord : (state === 'paid' ? S.paidWord : S.stateWord)}>
                {statusWords(asRow, todayISO)}
              </span>
            </div>

            <ul style={S.items}>
              {inv.line_items.map((li, i) => (
                <li key={i} style={S.itemRow}>
                  <span style={S.itemDesc}>{li.description}</span>
                  <span style={S.itemAmount}>{gbp2(Number(li.amount) || 0)}</span>
                </li>
              ))}
              <li style={S.totalRow}>
                <span style={S.totalLabel}>Total</span>
                <span style={S.totalAmount}>{gbp2(inv.total)}</span>
              </li>
            </ul>

            {inv.notes ? <p style={S.quiet}>{inv.notes}</p> : null}
          </section>

          {state === 'paid' ? (
            <section className="lek-card">
              <p style={S.lead}>Paid. Nothing to chase.</p>
              <p style={S.quiet}>It stays here for your records, and it is in your income figures.</p>
            </section>
          ) : (
            <section className="lek-card">
              <h2 className="lek-h2">Send it</h2>
              {/* The pay wording returns with payouts. See hasInvoicePayoutRoute in lib/stripe.ts. */}
              <p style={S.sub}>
                This link is the invoice. Your customer opens it and sees it. It goes from you,
                never from us.
              </p>
              {/* One tap selects the whole link, which is the closest thing to a copy button that
                  needs no script. The green anchor opens his own messaging app's share screen
                  with the text written; test/frontdoor.test.mjs keeps the app's COPY from naming
                  the channel, because words about a channel age into instructions, and this
                  share sheet needs no bound number and no instruction. */}
              <p style={S.linkBlock}>{publicLink}</p>
              <div style={S.shareRow}>
                <a
                  className="lek-wa"
                  href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                >
                  Share the link
                </a>
                <a
                  className="lek-ghostlink"
                  href={`mailto:?subject=${encodeURIComponent(`Invoice ${inv.number}`)}&body=${encodeURIComponent(shareText)}`}
                >
                  Send by email
                </a>
              </div>
            </section>
          )}

          {state !== 'paid' ? (
            <section className="lek-card">
              {/* His record, kept straight by him. Two plain form posts, ids in the body, the
                  session naming the owner on the other side. Nothing here reaches his customer,
                  and the page says so before either press. The weight of "paid" is said too:
                  it books the income, so the sentence sits on the button that does it. */}
              <h2 className="lek-h2">What has happened with it</h2>
              <p style={S.sub}>
                These update your records only. Nothing goes to your customer.
              </p>
              <div style={S.shareRow}>
                {inv.status === 'draft' ? (
                  <form action="/api/invoices" method="post">
                    <input type="hidden" name="action" value="sent" />
                    <input type="hidden" name="id" value={row} />
                    <input type="hidden" name="ref" value={one('ref') ?? ''} />
                    <button type="submit" className="lek-mark">I have sent it</button>
                  </form>
                ) : null}
                <form action="/api/invoices" method="post">
                  <input type="hidden" name="action" value="paid" />
                  <input type="hidden" name="id" value={row} />
                  <input type="hidden" name="ref" value={one('ref') ?? ''} />
                  <button type="submit" className="lek-mark">I have been paid</button>
                </form>
              </div>
              <p style={S.quiet}>
                Paid means the money arrived. It goes into your income figures the moment you say
                so, the same as a card payment.
              </p>
            </section>
          ) : null}

          {late > 0 ? (
            <section className="lek-card">
              <h2 className="lek-h2">Chase it</h2>
              <p style={S.sub}>
                It is {lateWords(late)}. Here is the message, in your voice, ready to go. Pick how
                firm it should be.
              </p>
              <div style={S.toneRow}>
                {CHASER_TONES.map((t) => (
                  t.tone === tone ? (
                    <span key={t.tone} className="lek-tone on">{t.label}</span>
                  ) : (
                    <a
                      key={t.tone}
                      className="lek-tone"
                      href={`/app/invoice?ref=${refParam}&tone=${t.tone}`}
                    >
                      {t.label}
                    </a>
                  )
                ))}
              </div>
              <p style={S.draftBlock}>{draft}</p>
              <div style={S.shareRow}>
                <a className="lek-wa" href={`https://wa.me/?text=${encodeURIComponent(draft)}`}>
                  Share the message
                </a>
                <a
                  className="lek-ghostlink"
                  href={`mailto:?subject=${encodeURIComponent(`Invoice ${inv.number}`)}&body=${encodeURIComponent(draft)}`}
                >
                  Send by email
                </a>
              </div>
              <p style={S.quiet}>
                We never message your customer. This goes when you send it, and not before.
              </p>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.hair}px}`,
  `.lek-figure{font-size:${TYPE.stat}px;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px;font-variant-numeric:tabular-nums}`,
  // WhatsApp's own green, because this is the one button that opens their app. lib/tokens.ts
  // explains why it never follows our palette.
  `.lek-wa{display:inline-block;padding:12px 18px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_WHATSAPP};background:${WHATSAPP};border-radius:${RADIUS.md}px;text-decoration:none}`,
  `.lek-ghostlink{display:inline-block;padding:12px 18px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${MUTED};background:${PANEL};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;text-decoration:none;transition:color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-ghostlink:hover{color:${INK}}`,
  // The mark buttons: quiet, bordered, deliberately not the WhatsApp green or the primary river.
  // They change a record, they do not send anything, and the styling says which family they are in.
  `.lek-mark{padding:12px 18px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${INK};background:${PANEL};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-mark:hover{background:${SURFACE}}`,
  `.lek-tone{display:inline-block;padding:7px 14px;font-size:${TYPE.note}px;font-weight:700;font-family:${FONT};color:${MUTED};background:${SURFACE};border-radius:${RADIUS.pill}px;text-decoration:none;transition:color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-tone:hover{color:${INK}}`,
  `.lek-tone.on{color:${RIVER_DEEP};background:${RIVER_TINT}}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-title{font-size:${TYPE.stat}px}
    .lek-figure{font-size:${TYPE.title}px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  crumb: { margin: '0 0 12px' },
  crumbLink: { color: RIVER, fontSize: TYPE.note, fontWeight: 700, textDecoration: 'none' },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  figurePaid: { color: MUTED },
  metaRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: TYPE.label, color: MUTED, marginBottom: 14 },
  chip: { background: SURFACE, borderRadius: RADIUS.sm, padding: '2px 8px', fontWeight: 700 },
  stateWord: { fontWeight: 700 },
  lateWord: { color: RED, fontWeight: 700 },
  paidWord: { color: GREEN, fontWeight: 700 },

  items: { listStyle: 'none', margin: 0, padding: 0 },
  itemRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', borderTop: `1px solid ${LINE}`, padding: '10px 0' },
  itemDesc: { fontSize: TYPE.body, fontWeight: 600 },
  itemAmount: { fontSize: TYPE.body, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  totalRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', borderTop: `1px solid ${LINE}`, padding: '10px 0 0' },
  totalLabel: { fontSize: TYPE.body, fontWeight: 800 },
  totalAmount: { fontSize: TYPE.body, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },

  sub: { fontSize: TYPE.body, lineHeight: 1.55, color: MUTED, margin: '0 0 10px' },
  // userSelect all: one tap selects the whole thing, the closest a page with no script comes to
  // a copy button. break-all because a capability URL has no spaces to wrap on.
  linkBlock: { fontSize: TYPE.note, fontWeight: 600, lineHeight: 1.5, background: SURFACE, borderRadius: RADIUS.md, padding: '11px 13px', margin: '0 0 12px', wordBreak: 'break-all', userSelect: 'all' },
  draftBlock: { fontSize: TYPE.body, lineHeight: 1.6, background: SURFACE, borderRadius: RADIUS.md, padding: '13px 15px', margin: '0 0 12px', whiteSpace: 'pre-wrap', userSelect: 'all' },
  shareRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  toneRow: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 12px' },

  lead: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '12px 0 0' },
};
