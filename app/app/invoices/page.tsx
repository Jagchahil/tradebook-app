import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../lib/webauth';
import { SESSION_COOKIE } from '../../../lib/websession';
import { readInvoices } from '../../../lib/supabase';
import { gbp2 } from '../../../lib/money';
import { invoiceRef } from '../invoiceref';
import {
  normaliseInvoiceRow, sortInvoices, invoiceState, statusWords, owedLine,
} from './words';
import { A11Y_CSS, APP_CSS, BREAK, FONT, RADIUS, SPACE, TYPE } from '../../../lib/tokens';
import {
  GREEN, INK, LINE, MUTED, ON_RIVER, PAPER, RED, RIVER, SURFACE,
} from '../../../lib/apptheme';
import { AppNav } from '../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// EVERY INVOICE. The screen a man opens to see who owes him, and how late they are.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ STATUS FIRST, NOT DATE FIRST. Money he is owed and late sits at the top, then money owed
// on time, then paid, because paid is history and late is a job. The judging and the ordering
// live in ./words.ts, pure and tested, so this file is a surface.
//
// ⚠️ THE READ IS readInvoices, AND THE RECORDED COMPROMISE IS PAID OFF (31 July 2026). This
// page used to read through exportUserData, the UK GDPR export, because lib held no scoped
// list: it over fetched every table a man has, and it could not tell a failed invoices query
// from an empty one, so a database bad minute rendered as "no invoices yet". readInvoices in
// lib/supabase.ts is the one small function that compromise asked for: his rows only, newest
// first, and null on a failed read, NEVER []. Null gets the "load it again" card; [] gets the
// honest empty state; the two are different sentences about a man's money and this page can
// finally tell them apart.
//
// ⚠️ EVERY ROW LINKS BY SEALED REFERENCE, app/app/invoiceref.ts, minted for THIS session. No id
// in any app URL, exactly as /app/money does it. No secret means no link and the row stays
// plain text.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  // The fallback confirmation when references are unconfigured and the create route could not
  // land him on the invoice itself.
  const said = one('done') === 'made' ? 'Made and saved. It is in the list below.' : null;

  // Null is a failed read and [] is an empty table: see the header, the whole point of the read.
  const raw = await readInvoices(user.id);
  const read = raw !== null;
  const rows = read
    ? raw.map(normaliseInvoiceRow).filter((r): r is NonNullable<typeof r> => r !== null)
    : [];

  const todayISO = new Date().toISOString().slice(0, 10);
  const sorted = sortInvoices(rows, todayISO);
  const owed = owedLine(rows, todayISO);

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/invoices" />

      {said ? <p style={S.said}>{said}</p> : null}

      {!read ? (
        <section className="lek-card">
          <p style={S.empty}>We could not read your invoices just now.</p>
          <p style={S.quiet}>Nothing is lost and nothing has changed. Load the page again in a minute.</p>
        </section>
      ) : sorted.length === 0 ? (
        <section className="lek-card">
          <p style={S.empty}>You have not made an invoice yet.</p>
          <p style={S.quiet}>
            Make one here and it comes out numbered, dated and ready to send, with a link your
            customer can pay from. You send it. We never contact your customer.
          </p>
          <a href="/app/invoices/new" className="lek-go">Make your first invoice</a>
        </section>
      ) : (
        <section className="lek-card">
          {/* The one sentence he came for, and only when there is money it applies to. All paid
              means nothing owed, and a "£0 owed" banner would be a row that says nothing. */}
          {owed ? <p style={S.owed}>{owed}</p> : null}

          <ul style={S.list}>
            {sorted.map((inv) => {
              const state = invoiceState(inv, todayISO);
              // ⚠️ THE ROW'S ID NEVER REACHES THE URL. Same shape as /app/money: a sealed
              // reference or plain text, never a dead link and never an id.
              const ref = invoiceRef(user.id, inv.id, 'invoice');
              const label = inv.customer || 'Customer';
              return (
                <li key={inv.id} className="lek-row">
                  <div style={S.rowMain}>
                    {ref ? (
                      <a
                        href={`/app/invoice?ref=${encodeURIComponent(ref)}`}
                        style={state === 'paid' ? S.labelLinkPaid : S.labelLink}
                      >
                        {label}
                      </a>
                    ) : (
                      <span style={state === 'paid' ? S.labelPaid : S.label}>{label}</span>
                    )}
                    <span style={state === 'paid' ? S.amountPaid : S.amount}>{gbp2(inv.total)}</span>
                  </div>
                  <div style={S.rowMeta}>
                    <span style={S.chip}>{inv.number}</span>
                    <span style={state === 'late' ? S.late : (state === 'paid' ? S.paidWord : undefined)}>
                      {statusWords(inv, todayISO)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p style={S.foot}>
        Every invoice has a link you send yourself, from your own phone. Nothing here goes to
        your customer unless you send it.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-row{border-top:1px solid ${LINE};padding:13px 0 0;margin-top:13px}`,
  `.lek-row:first-child{border-top:none;padding-top:0;margin-top:0}`,
  `.lek-go{display:inline-block;margin-top:${SPACE.md}px;padding:12px 20px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border-radius:${RADIUS.md}px;text-decoration:none}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-row{padding:${SPACE.md}px 0 0;margin-top:${SPACE.md}px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },

  owed: { fontSize: TYPE.lead, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.4, margin: '0 0 6px' },

  list: { listStyle: 'none', margin: 0, padding: 0 },
  rowMain: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' },
  label: { fontSize: TYPE.body, fontWeight: 700 },
  labelPaid: { fontSize: TYPE.body, fontWeight: 700, color: MUTED },
  // Ink with a quiet underline, the money log's own judgement: a column of blue names would
  // shout over the figures, and the underline is enough to say "this opens".
  labelLink: { fontSize: TYPE.body, fontWeight: 700, color: INK, textDecoration: 'underline', textDecorationColor: LINE, textUnderlineOffset: 3 },
  labelLinkPaid: { fontSize: TYPE.body, fontWeight: 700, color: MUTED, textDecoration: 'underline', textDecorationColor: LINE, textUnderlineOffset: 3 },
  amount: { fontSize: TYPE.body, fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  amountPaid: { fontSize: TYPE.body, fontWeight: 800, color: MUTED, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: TYPE.label, color: MUTED, marginTop: 6 },
  chip: { background: SURFACE, borderRadius: RADIUS.sm, padding: '2px 8px', fontWeight: 700 },
  late: { color: RED, fontWeight: 700 },
  paidWord: { color: GREEN, fontWeight: 700 },

  empty: { fontSize: TYPE.strong, fontWeight: 700, margin: 0 },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '10px 0 0' },
  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
