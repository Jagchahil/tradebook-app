import type { Metadata } from 'next';
import Link from 'next/link';
import { A11Y_CSS } from '../../lib/tokens';

export const metadata: Metadata = {
  title: 'Privacy Policy. Lekhio.',
  description: 'How Lekhio collects, uses, and protects your data under UK GDPR.',
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

export default function PrivacyPage() {
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
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1px', margin: '0 0 8px' }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: MUTED, margin: '0 0 8px' }}>Last updated 24 June 2026</p>
        <p style={para}>
          This policy explains what Lekhio collects, why we collect it, and what we do with it. We
          handle your data under the UK General Data Protection Regulation and the Data Protection Act
          2018. We keep this short and plain on purpose.
        </p>

        <h2 style={heading}>Who we are</h2>
        <p style={para}>
          Lekhio provides bookkeeping and tax preparation tools for UK self employed tradespeople.
          For data protection law, Lekhio is the data controller for the information described here.
          You can reach us any time at privacy@lekhio.com.
        </p>

        <h2 style={heading}>What we collect</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 14px' }}>
          <li style={li}>Your mobile number, so we can link your WhatsApp to your account.</li>
          <li style={li}>Your email, if you choose to give it.</li>
          <li style={li}>The receipts, photos, and voice notes you send us.</li>
          <li style={li}>The financial records we build from what you send, such as amounts, dates, merchants, and categories.</li>
          <li style={li}>Basic technical data needed to run the service, such as app version and error logs.</li>
        </ul>

        <h2 style={heading}>Why we collect it</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 14px' }}>
          <li style={li}>To log and categorise your expenses and income.</li>
          <li style={li}>To prepare your quarterly tax summaries for your approval.</li>
          <li style={li}>To answer your questions about your own figures.</li>
          <li style={li}>To keep the service secure and working.</li>
        </ul>
        <p style={para}>
          We rely on two legal bases. We process your data to deliver the service you signed up for,
          which is performance of a contract. We also process some data to meet our legal duties, such
          as keeping records.
        </p>

        <h2 style={heading}>Tax and HMRC</h2>
        <p style={para}>
          Lekhio prepares your figures. You always review and approve them. We never submit anything
          to HMRC without your explicit approval, and we never imply that HMRC endorses Lekhio. You
          remain legally responsible for your own tax at all times.
        </p>

        <h2 style={heading}>How we store and protect your data</h2>
        <p style={para}>
          Your data is encrypted in transit and at rest. We store it with trusted infrastructure
          providers and limit access to the people and systems that need it. We do not store the
          content of your WhatsApp messages with any third party beyond our secure database.
        </p>

        <h2 style={heading}>Who we share it with</h2>
        <p style={para}>
          We do not sell your data. We share it only with the service providers that help us run
          Lekhio, such as our hosting, database, payment, and messaging providers. They act on our
          instructions and are bound to protect your data. If a recognised tax submission path is used,
          it only happens after you approve.
        </p>

        <h2 style={heading}>How long we keep it</h2>
        <p style={para}>
          We keep your financial records for as long as your account is active, and afterwards for the
          period required by UK tax and accounting rules. When that period ends, we delete or anonymise
          your data.
        </p>

        <h2 style={heading}>Your rights</h2>
        <p style={para}>You have the right to:</p>
        <ul style={{ paddingLeft: 20, margin: '0 0 14px' }}>
          <li style={li}>Ask for a copy of the data we hold about you.</li>
          <li style={li}>Ask us to correct anything that is wrong.</li>
          <li style={li}>Ask us to delete your data, subject to our legal duty to keep some records.</li>
          <li style={li}>Ask us to export your data.</li>
          <li style={li}>Object to or restrict certain processing.</li>
        </ul>
        <p style={para}>
          To use any of these rights, email privacy@lekhio.com. You can also complain to the
          Information Commissioner's Office at ico.org.uk if you are unhappy with how we handle your
          data.
        </p>

        <h2 style={heading}>Changes to this policy</h2>
        <p style={para}>
          If we change this policy, we will update the date at the top and, where the change is
          significant, we will tell you.
        </p>

        <h2 style={heading}>Contact</h2>
        <p style={para}>Questions about your privacy. Email privacy@lekhio.com and we will help.</p>

        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 40, paddingTop: 20 }}>
          <Link href="/terms" style={{ fontSize: 14, fontWeight: 500, color: INDIGO }}>
            Read our Terms of Service
          </Link>
        </div>
      </article>
    </main>
  );
}
