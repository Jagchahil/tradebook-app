import type { Metadata } from 'next';
import Link from 'next/link';
import { A11Y_CSS } from '../../lib/tokens';

export const metadata: Metadata = {
  title: 'Terms of Service. Lekhio.',
  description: 'The terms for using Lekhio, including your free trial and billing.',
};

const INK = '#111111';
const INDIGO = '#1B59A6';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';

const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const heading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.3px',
  margin: '36px 0 12px',
  color: INK,
};

const para: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.7,
  color: '#374151',
  margin: '0 0 14px',
};

const li: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1.7,
  color: '#374151',
  marginBottom: 8,
};

export default function TermsPage() {
  return (
    <main style={{ backgroundColor: OFF_WHITE, color: INK, fontFamily: FONT, minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: `* { box-sizing: border-box; } body { margin: 0; } a { text-decoration: none; }` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <nav style={{ maxWidth: 760, margin: '0 auto', padding: '22px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: INK }}>
          Lekhio
        </Link>
        <Link href="/" style={{ fontSize: 14, fontWeight: 500, color: INDIGO }}>
          Back to home
        </Link>
      </nav>

      <article style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 80px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 8px' }}>Terms of Service</h1>
        <p style={{ fontSize: 14, color: MUTED, margin: '0 0 8px' }}>Last updated 24 June 2026</p>
        <p style={para}>
          These terms set out the deal between you and Lekhio when you use our service. By creating
          an account or using Lekhio, you agree to them. Please read them. We have kept them plain.
        </p>

        <h2 style={heading}>What Lekhio does</h2>
        <p style={para}>
          Lekhio helps you capture receipts and expenses, keeps your books in order, and prepares
          quarterly tax summaries for UK self employed trades. You send receipts and voice notes,
          usually through WhatsApp, and we turn them into organised records.
        </p>

        <h2 style={heading}>What Lekhio is not</h2>
        <p style={para}>
          Lekhio is a tool, not your accountant or tax agent. We prepare figures for you to check.
          You stay legally responsible for your tax and for what you submit to HMRC. We never submit
          anything on your behalf without your explicit approval, and we never claim that HMRC endorses
          Lekhio. If your affairs are complex, speak to a qualified accountant.
        </p>

        <h2 style={heading}>Your account</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 14px' }}>
          <li style={li}>You must be 18 or over and trading as a UK sole trader to use Lekhio.</li>
          <li style={li}>Keep your account secure and let us know if you think someone else has access.</li>
          <li style={li}>The information you give us should be accurate and your own.</li>
        </ul>

        <h2 style={heading}>Free trial and payment</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 14px' }}>
          <li style={li}>Your first 14 days are free. We will not charge you during the trial.</li>
          <li style={li}>After the trial, Lekhio costs £12.99 a month, or £129 a year, unless you cancel first.</li>
          <li style={li}>We will remind you before the trial ends.</li>
          <li style={li}>You can cancel any time. Your plan runs to the end of the period you have paid for.</li>
          <li style={li}>Payments are handled by our payment provider. We do not store your full card details.</li>
        </ul>

        <h2 style={heading}>Your data</h2>
        <p style={para}>
          Your data stays yours. We handle it as described in our{' '}
          <Link href="/privacy" style={{ color: INDIGO, fontWeight: 500 }}>Privacy Policy</Link>. You can
          export your records or ask us to delete your account at any time, subject to the record
          keeping rules that UK tax law places on both of us.
        </p>

        <h2 style={heading}>Approval before anything is sent</h2>
        <p style={para}>
          Any action that moves money, files tax, or sends a message on your behalf needs your explicit
          approval first. We build that approval step into the product. There are no exceptions.
        </p>

        <h2 style={heading}>Acceptable use</h2>
        <p style={para}>
          Use Lekhio for your own lawful business records. Do not use it to break the law, to
          mislead HMRC, or to upload content that is not yours to share. We may suspend accounts that
          are used in these ways.
        </p>

        <h2 style={heading}>Availability</h2>
        <p style={para}>
          We work hard to keep Lekhio running, but we cannot promise it will always be available or
          error free. We may update, pause, or change features as the product grows. Where a change is
          significant, we will tell you.
        </p>

        <h2 style={heading}>Our responsibility</h2>
        <p style={para}>
          We provide Lekhio with reasonable care and skill. As far as the law allows, we are not
          responsible for losses that we could not reasonably expect, or for tax decisions you make
          after reviewing your figures. Nothing in these terms limits liability that cannot be limited
          by law.
        </p>

        <h2 style={heading}>Ending your use</h2>
        <p style={para}>
          You can stop using Lekhio and close your account at any time. We may end your access if
          you break these terms. If we do, we will tell you why where we can.
        </p>

        <h2 style={heading}>Law</h2>
        <p style={para}>
          These terms are governed by the law of England and Wales, and the courts of England and Wales
          have jurisdiction.
        </p>

        <h2 style={heading}>Contact</h2>
        <p style={para}>Questions about these terms. Email support@lekhio.com.</p>

        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 40, paddingTop: 20 }}>
          <Link href="/privacy" style={{ fontSize: 14, fontWeight: 500, color: INDIGO }}>
            Read our Privacy Policy
          </Link>
        </div>
      </article>
    </main>
  );
}
