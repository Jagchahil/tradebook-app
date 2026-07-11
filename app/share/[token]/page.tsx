import type { Metadata } from 'next';
import {
  verifyShareToken,
  grantState,
  shareTransactions,
  shareTotals,
  byCategory,
  normaliseScope,
} from '../../../lib/bookshare';
import {
  getBookShare,
  touchBookShare,
  getConfirmedTransactionsForUser,
} from '../../../lib/supabase';
import { A11Y_CSS } from '../../../lib/tokens';

// The shared books view. Public URL, no login, READ ONLY.
//
// THE SECURITY MODEL, IN ORDER. Both checks, every request, no exceptions:
//
//   1. verifyAccountantToken  proves WE issued this grant id (HMAC, constant time).
//      Without it, the id is a bare uuid that could be guessed or enumerated.
//   2. grantState             proves the grant is STILL GOOD (not revoked, not
//      expired). Without it, a signature issued months ago would outlive the
//      relationship it was issued for.
//
// A valid signature on a revoked grant is exactly the attack this defeats, so the
// row is loaded fresh on every request. There is no cache and there is no
// generateStaticParams: this page must never be prerendered or held.
//
// The data is fetched with the service role, scoped to the granting user's id at
// the query. The anon key is never used, so no policy mistake can widen this.
// The recipient sees CONFIRMED entries only, inside the date range the owner chose,
// with the categories they excluded removed, redacted: no user id, no receipt image,
// no WhatsApp message id, no phone number. The scope is applied in lib/bookshare.ts,
// in one tested place, NOT in this template, so a redesign here cannot widen it.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Never let a books page be indexed, however the URL leaks.
export const metadata: Metadata = {
  title: 'Shared books | Lekhio',
  robots: { index: false, follow: false, nocache: true },
};

const INK = 'var(--tx)';
const MUTED = 'var(--muted)';

function gbp(n: number): string {
  return `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <main
        style={{
          maxWidth: 940,
          margin: '0 auto',
          padding: '48px 22px 80px',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          color: INK,
        }}
      >
        {children}
      </main>
    </>
  );
}

function Dead({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <p style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px' }}>Lekhio</p>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginTop: 28 }}>{title}</h1>
      <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.6, marginTop: 10, maxWidth: 520 }}>{body}</p>
    </Shell>
  );
}

export default async function AccountantView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 1. Did we issue this?
  const shareId = verifyShareToken(decodeURIComponent(token));
  if (!shareId) {
    return (
      <Dead
        title="This link is not valid"
        body="Check you have the whole link, exactly as it was sent to you. If in doubt, ask them to send you a new one from the Lekhio app."
      />
    );
  }

  // 2. Is it still good? The row is the truth, not the token.
  const grant = await getBookShare(shareId);
  const state = grantState(grant);

  if (state === 'revoked') {
    return (
      <Dead
        title="This link has been turned off"
        body="The person who shared these books has turned the link off. If you still need them, ask them to share a new one."
      />
    );
  }
  if (state === 'expired') {
    return (
      <Dead
        title="This link has expired"
        body="Shared links do not last forever, on purpose. Ask for a fresh one from the Lekhio app."
      />
    );
  }
  if (state !== 'ok' || !grant) {
    return (
      <Dead
        title="This link is not valid"
        body="We could not find these books. Ask for a new link from the Lekhio app."
      />
    );
  }

  // Count the view so the owner can see their link being used, and see it being
  // used when they did not expect it.
  await touchBookShare(grant.id);

  const raw = await getConfirmedTransactionsForUser(grant.user_id);

  // The scope is the owner's, read from the row, never from the URL. Fails closed:
  // a share with no date range shows nothing at all.
  const scope = normaliseScope(grant);
  const rows = shareTransactions(raw, scope);
  const totals = shareTotals(rows);
  const cats = byCategory(rows);

  return (
    <Shell>
      <p style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px' }}>Lekhio</p>

      <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 26, letterSpacing: '-0.8px' }}>
        Shared books
      </h1>
      <p style={{ color: MUTED, fontSize: 15.5, lineHeight: 1.6, marginTop: 10, maxWidth: 640 }}>
        {grant.recipient_name ? `Shared with ${grant.recipient_name}. ` : ''}
        This is a read only view. Every figure below was reviewed and confirmed by the person who shared
        it, and they chose what to include. Nothing here can be changed from this page.
      </p>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 12,
          marginTop: 30,
        }}
      >
        {[
          { label: 'Income', value: gbp(totals.income) },
          { label: 'Expenses', value: gbp(totals.expenses) },
          { label: 'Profit', value: gbp(totals.profit) },
          { label: 'Entries', value: String(totals.count) },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 14,
              padding: '16px 18px',
              background: 'var(--panel)',
            }}
          >
            <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 700, letterSpacing: '0.4px' }}>
              {c.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{c.value}</div>
          </div>
        ))}
      </section>

      {cats.length > 0 ? (
        <>
          <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 40 }}>Expenses by category</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 15 }}>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '11px 0' }}>{c.category}</td>
                  <td style={{ padding: '11px 0', textAlign: 'right', fontWeight: 700 }}>{gbp(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 40 }}>Every confirmed entry</h2>

      {rows.length === 0 ? (
        <p style={{ color: MUTED, marginTop: 12 }}>
          There is nothing to show for the period that was shared. Anything captured but not yet reviewed,
          and anything outside the shared dates or categories, is deliberately not here.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 14.5 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
              <th style={{ padding: '10px 8px 10px 0', fontSize: 12.5, color: MUTED }}>DATE</th>
              <th style={{ padding: '10px 8px', fontSize: 12.5, color: MUTED }}>VENDOR</th>
              <th style={{ padding: '10px 8px', fontSize: 12.5, color: MUTED }}>CATEGORY</th>
              <th style={{ padding: '10px 0 10px 8px', fontSize: 12.5, color: MUTED, textAlign: 'right' }}>
                AMOUNT
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '11px 8px 11px 0', whiteSpace: 'nowrap', color: MUTED }}>{t.date ?? ''}</td>
                <td style={{ padding: '11px 8px' }}>{t.vendor ?? ''}</td>
                <td style={{ padding: '11px 8px', color: MUTED }}>{t.category ?? ''}</td>
                <td
                  style={{
                    padding: '11px 0 11px 8px',
                    textAlign: 'right',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    color: t.amount > 0 ? 'var(--green, #157F3B)' : INK,
                  }}
                >
                  {t.amount > 0 ? '+' : ''}
                  {gbp(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, marginTop: 40, maxWidth: 640 }}>
        Lekhio prepares figures. The taxpayer reviews and approves them, and remains responsible for their own
        tax. This view is read only, it shows only what its owner chose to share, and they can turn it off at
        any time.
      </p>
    </Shell>
  );
}
