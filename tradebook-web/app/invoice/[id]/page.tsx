import { getPublicInvoice } from '../../../lib/supabase';
import { hasStripeConfig } from '../../../lib/stripe';
import { A11Y_CSS } from '../../../lib/tokens';

const INK = '#111111';
const INDIGO = '#1B59A6';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';
const GREEN = '#15803D';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

function gbp(n: number): string {
  return `£${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function prettyDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = await getPublicInvoice(id).catch(() => null);

  if (!invoice) {
    return (
      <main style={{ backgroundColor: OFF_WHITE, color: INK, fontFamily: FONT, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Lekhio</div>
          <p style={{ color: MUTED }}>This invoice could not be found.</p>
        </div>
      </main>
    );
  }

  const isPaid = invoice.status === 'paid';

  return (
    <main style={{ backgroundColor: OFF_WHITE, color: INK, fontFamily: FONT, minHeight: '100vh', padding: '32px 16px' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <div
        style={{
          maxWidth: 640,
          margin: '0 auto',
          backgroundColor: '#FFFFFF',
          border: `1px solid ${BORDER}`,
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(17,17,17,0.06)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '28px 32px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Invoice</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', marginTop: 2 }}>{invoice.number}</div>
          </div>
          {isPaid ? (
            <span style={{ backgroundColor: '#DCFCE7', color: GREEN, fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8 }}>PAID</span>
          ) : invoice.due_date ? (
            <span style={{ color: MUTED, fontSize: 13 }}>Due {prettyDate(invoice.due_date)}</span>
          ) : null}
        </div>

        {/* From / To */}
        <div style={{ padding: '24px 32px', display: 'flex', gap: 32, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>From</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{invoice.business_name || 'Lekhio user'}</div>
            {invoice.business_contact ? <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{invoice.business_contact}</div> : null}
          </div>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>To</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{invoice.customer_name}</div>
            {invoice.customer_contact ? <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{invoice.customer_contact}</div> : null}
          </div>
          {invoice.issued_date ? (
            <div style={{ minWidth: 120 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Issued</div>
              <div style={{ fontSize: 15 }}>{prettyDate(invoice.issued_date)}</div>
            </div>
          ) : null}
        </div>

        {/* Lines */}
        <div style={{ padding: '8px 32px 0' }}>
          {invoice.line_items.map((li, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 15, color: INK, marginRight: 16 }}>{li.description}</span>
              <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{gbp(li.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{gbp(invoice.total)}</span>
          </div>
        </div>

        {invoice.notes ? (
          <div style={{ padding: '0 32px 24px' }}>
            <div style={{ backgroundColor: OFF_WHITE, borderRadius: 12, padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.6 }}>{invoice.notes}</div>
          </div>
        ) : null}

        {!isPaid && hasStripeConfig() ? (
          <div style={{ padding: '0 32px 28px' }}>
            <a
              href={`/api/pay/${id}`}
              style={{
                display: 'block',
                textAlign: 'center',
                backgroundColor: INDIGO,
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: 700,
                padding: '16px',
                borderRadius: 12,
                textDecoration: 'none',
              }}
            >
              Pay {gbp(invoice.total)} now
            </a>
            <p style={{ textAlign: 'center', fontSize: 12, color: MUTED, marginTop: 10 }}>Secure card payment by Stripe.</p>
          </div>
        ) : null}

        {/* Footer */}
        <div style={{ padding: '18px 32px', borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, color: MUTED }}>
            {isPaid ? 'This invoice has been paid. Thank you.' : 'Please pay by the due date.'}
          </span>
          <span style={{ fontSize: 13, color: MUTED }}>
            Made with <span style={{ fontWeight: 700, color: INK }}>Lekhio</span>
          </span>
        </div>
      </div>
    </main>
  );
}
