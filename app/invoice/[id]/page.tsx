import { getPublicInvoice } from '../../../lib/supabase';
import { A11Y_CSS } from '../../../lib/tokens';
import { REVERSE_CHARGE_WORDING, formatVrn, isVatRateKey, rateLabel } from '../../../lib/vat';
import { gbp2 } from '../../../lib/money';

// THE DOCUMENT. Not a screen: the thing his customer pays from and his customer's accountant
// checks, opened with no session and no account, months after it was sent.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT A UK VAT INVOICE HAS TO CARRY. VAT Regulations 1995 reg 14: the supplier's name,
// ADDRESS and VAT NUMBER, the invoice number, the tax point, the customer's name, a description
// of the work, the VAT RATE ON EACH LINE, the total before VAT, the total VAT, and the total
// including VAT. Until 1 August 2026 this page printed none of the ones in capitals, because
// nothing selected them: users.address had existed all along and no invoice surface had ever
// asked for it. So every invoice this product has ever produced was short of fields the law asks
// for, on the one page where being short of them matters.
//
// 🔴 AND vat_treatment === null IS AN INVOICE THAT PREDATES VAT SUPPORT. It prints exactly as it
// printed on the day he sent it: no rates, no VAT lines, no VAT number. A customer may have paid
// it and filed it, and a document does not get to change afterwards. 'none' is a different thing
// and is not null: it is the recorded answer that he was not VAT registered, and a man who is not
// registered must never show VAT on an invoice at all.
//
// 🔴 AND REG 14 IS NOT THE ONLY LIST. Run 6, 16 August 2026. Everything above is the VAT
// standard, which is the harder one, and it reaches only the minority of users who are
// registered. GOV.UK, "Invoices: what they must include", reaches all of them and asks for two
// things this document did not carry: THE CUSTOMER'S ADDRESS, and THE DATE THE WORK WAS DONE.
// The supply date existed in spirit as the tax point and was printed for VAT registered senders
// alone; the customer's address existed nowhere at all. A rule only holds where it is pointed.
//
// ⚠️ AND A NULL IN EITHER IS THE OLD WORLD, exactly like vat_treatment below. An invoice raised
// before 16 August 2026 prints with no supply line and no customer address, which is how it
// printed on the day it was sent. Nothing is backfilled and nothing is guessed.
//
// 🔴 UNDER THE REVERSE CHARGE THE VAT IS SHOWN AND IS NOT IN THE TOTAL. VATREVCON37100: the
// figure the customer accounts for "should not be included in the amount shown as total VAT
// charged". So the total charged is nil, the figure sits in its own block with the wording HMRC
// accepts, and the amount the customer pays is the total above it. VATA 1994 s55A.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// 🔴 LITERAL HEX ON PURPOSE, AND THIS FILE IS THE ONE PLACE THAT IS TRUE.
//
// This is paper. It is printed, attached to an email, and opened by somebody who has never heard of
// us, and it must look the same every time whatever their device is set to. So it gets NO theme
// sheet and it may not carry a var(): a var() with nothing declaring it resolves to nothing, and
// `color: var(--on-green-tint)` on this page silently painted the PAID badge black on mint.
// The number below is ON_GREEN_TINT's light value written out longhand, 6.01:1 on #DCFCE7.
const INK = '#111111';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';
const PAID_GREEN = '#136B34';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// 🔴 NOT A LOCAL toFixed(2), AND THIS PAGE IS WHY lib/money.ts EXISTS.
//
// The 28 July sweep found seventeen money formatters and replaced them with one, and gbp2's own
// comment names the invoice as its use: "Documents rather than conversation... A figure a man
// hands to a lender or an accountant shows its pence." That sweep read lib/. This formatter is
// in app/, so it was never swept, and it is on the ONE page in the product that leaves the
// building.
//
// Found by walking a reverse charge invoice live on 1 August 2026: the trader's own screen said
// £2,400.00 and the copy his customer opens said £2400.00. Neither is wrong. They are two readers
// over one number, on the document a main contractor's accounts payable checks, and a four figure
// invoice with no thousands separator reads as a typo rather than as a bill.
const gbp = gbp2;

function prettyDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 PRINTING IS NOT STYLING. THIS DOCUMENT IS THE ONE A MAN SAVES AS A PDF AND ATTACHES.
//
// The header above already says this page is paper rather than a screen, and until now it was
// paper that printed badly: a shadow and a rounded border that a printer renders as a grey smear,
// a page background that wastes a cartridge, and no page size at all, so a long invoice broke
// wherever the browser felt like breaking it.
//
// ⚠️ THE ONE RULE THAT MATTERS HERE: A PAGE BREAK MUST NEVER LAND INSIDE A ROW OR ACROSS THE
// TOTAL. An invoice whose total is orphaned on a second sheet, or whose line splits in half, is a
// document an accounts payable clerk queries rather than pays, and the tradesman never learns why
// he was not paid. `break-inside: avoid` on the rows and the totals block is the whole defence.
//
// ⚠️ AND THE SAVE BUTTON REMOVES ITSELF. `.lek-noprint` is display:none in print, so the button a
// man presses to make the PDF never appears in the PDF he made. His customer receives a document,
// not a screenshot of our interface.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #FFFFFF !important; }
  main { background: #FFFFFF !important; padding: 0 !important; min-height: 0 !important; }
  .lek-doc { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; max-width: none !important; }
  .lek-noprint { display: none !important; }
  .lek-line, .lek-totals { break-inside: avoid; page-break-inside: avoid; }
  a { text-decoration: none !important; color: inherit !important; }
}`;

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
  // Whether this document is a VAT invoice at all. Null is the old world, 'none' is a man who was
  // not registered when he raised it, and neither shows a rate, a VAT line or a VAT number.
  const carriesVat = invoice.vat_treatment === 'charged' || invoice.vat_treatment === 'reverse_charge';
  const reverseCharge = invoice.vat_treatment === 'reverse_charge';
  // His address goes on any invoice, VAT or not: it is who he is, and a customer paying a stranger
  // is entitled to it. The VAT number is different. Printing it on an invoice that shows no VAT
  // would make a claim about that document, and on a legacy one it would make a claim about a
  // paper he sent before he had a number at all.
  const vrn = carriesVat ? formatVrn(invoice.business_vrn) : null;
  // The tax point is the date of supply, and it is the date the law names on a VAT invoice.
  const dateLabel = carriesVat ? 'Tax point' : 'Issued';
  const dateValue = (carriesVat ? invoice.tax_point : null) || invoice.issued_date;
  // 🔴 SHOWN TO EVERYBODY, WHICH WAS THE WHOLE DEFECT. The tax point above answers the VAT
  // regulation and is a VAT figure with its own 14 day rule. This answers the GOV.UK bullet that
  // applies to every invoice in the country, and it is a different date whenever the work was not
  // done on the day it was billed, which for a cleaner or a sparks is most of the time.
  const workedOn = prettyDate(invoice.supply_date);

  return (
    <main style={{ backgroundColor: OFF_WHITE, color: INK, fontFamily: FONT, minHeight: '100vh', padding: '32px 16px' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div
        className="lek-doc"
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
            <span style={{ backgroundColor: '#DCFCE7', color: PAID_GREEN, fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8 }}>PAID</span>
          ) : invoice.due_date ? (
            <span style={{ color: MUTED, fontSize: 13 }}>Due {prettyDate(invoice.due_date)}</span>
          ) : null}
        </div>

        {/* From / To */}
        <div style={{ padding: '24px 32px', display: 'flex', gap: 32, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>From</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{invoice.business_name || 'Lekhio user'}</div>
            {invoice.business_address ? (
              <div style={{ fontSize: 14, color: MUTED, marginTop: 2, whiteSpace: 'pre-line' }}>{invoice.business_address}</div>
            ) : null}
            {vrn ? <div style={{ fontSize: 14, color: MUTED, marginTop: 4 }}>VAT number {vrn}</div> : null}
            {invoice.business_contact ? <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{invoice.business_contact}</div> : null}
          </div>
          <div style={{ minWidth: 180 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>To</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{invoice.customer_name}</div>
            {invoice.customer_address ? (
              <div style={{ fontSize: 14, color: MUTED, marginTop: 2, whiteSpace: 'pre-line' }}>{invoice.customer_address}</div>
            ) : null}
            {invoice.customer_contact ? <div style={{ fontSize: 14, color: MUTED, marginTop: 2 }}>{invoice.customer_contact}</div> : null}
          </div>
          {dateValue ? (
            <div style={{ minWidth: 120 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>{dateLabel}</div>
              <div style={{ fontSize: 15 }}>{prettyDate(dateValue)}</div>
            </div>
          ) : null}
          {workedOn ? (
            <div style={{ minWidth: 120 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Work done</div>
              <div style={{ fontSize: 15 }}>{workedOn}</div>
            </div>
          ) : null}
        </div>

        {/* Lines */}
        <div style={{ padding: '8px 32px 0' }}>
          {invoice.line_items.map((li, i) => (
            <div key={i} className="lek-line" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: 15, color: INK, marginRight: 16 }}>{li.description}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                {/* The rate on each line, which reg 14 asks for by name. Absent on a legacy row,
                    and absent is not the standard rate: it means the invoice was written when the
                    product had no VAT, so it prints without one. */}
                {carriesVat && isVatRateKey(li.rate) ? (
                  <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap', minWidth: 56, textAlign: 'right' }}>{rateLabel(li.rate)}</span>
                ) : null}
                <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{gbp(li.amount)}</span>
              </span>
            </div>
          ))}
          {carriesVat ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 0' }}>
                <span style={{ fontSize: 15, color: MUTED }}>Total before VAT</span>
                <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{gbp(invoice.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0' }}>
                <span style={{ fontSize: 15, color: MUTED }}>{reverseCharge ? 'VAT charged' : 'VAT'}</span>
                <span style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{gbp(invoice.tax)}</span>
              </div>
            </>
          ) : null}
          <div className="lek-totals" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0' }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{gbp(invoice.total)}</span>
          </div>
        </div>

        {/* 🔴 THE FIGURE THAT IS ON THE DOCUMENT AND NOT IN THE TOTAL. */}
        {reverseCharge ? (
          <div style={{ padding: '0 32px 24px' }}>
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>VAT to be accounted for by the customer</span>
                <span style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap' }}>{gbp(invoice.reverse_charge_vat)}</span>
              </div>
              <p style={{ fontSize: 14, color: INK, lineHeight: 1.6, margin: '10px 0 0' }}>{REVERSE_CHARGE_WORDING}</p>
              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: '8px 0 0' }}>
                This VAT is not included in the total above and is not payable to{' '}
                {invoice.business_name || 'the sender'}. It is the domestic reverse charge for
                building and construction services.
              </p>
            </div>
          </div>
        ) : null}

        {invoice.notes ? (
          <div style={{ padding: '0 32px 24px' }}>
            <div style={{ backgroundColor: OFF_WHITE, borderRadius: 12, padding: 16, fontSize: 14, color: MUTED, lineHeight: 1.6 }}>{invoice.notes}</div>
          </div>
        ) : null}

        {/* 🔴 NO PAY BUTTON, ON PURPOSE. READ THIS BEFORE PUTTING ONE BACK.
            Until 31 July 2026 this block drew "Pay now" and sent the payer through /api/pay to a
            Checkout session on OUR Stripe account, branded Lekhio Ltd. No user has any payout
            route, so every pound paid there would have landed in Lekhio's own balance with no way
            on earth to reach the tradesman who did the work. Money paid to the wrong account is
            the worst class of bug this product can have: the customer believes he has paid, the
            tradesman has not been paid, and we are holding a stranger's money. The rule lives in
            hasInvoicePayoutRoute in lib/stripe.ts, which also refuses to mint the session; the
            page stays the document, the tradesman's own payment details ride in the notes above,
            and the one line below is the honest amount of promise we can make. */}
        {!isPaid ? (
          <div style={{ padding: '0 32px 28px' }}>
            {/* The invoice itself carries no payment details unless the tradesman wrote them into
                his notes, so this line may not point at details that are not there. The pay
                wording returns with payouts. See hasInvoicePayoutRoute in lib/stripe.ts. */}
            <p style={{ textAlign: 'center', fontSize: 13, color: MUTED, margin: 0 }}>
              Card payment is coming. For now, please pay{' '}
              {invoice.business_name || 'the sender'} the way the two of you have agreed.
            </p>
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
