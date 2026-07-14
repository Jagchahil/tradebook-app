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
        <p style={{ fontSize: 14, color: MUTED, margin: '0 0 8px' }}>Last updated 11 July 2026</p>
        <p style={para}>
          This policy explains what Lekhio collects, why we collect it, and what we do with it. We
          handle your data under the UK General Data Protection Regulation and the Data Protection Act
          2018. We keep this short and plain on purpose.
        </p>

        <h2 style={heading}>Who we are</h2>
        <p style={para}>
          Lekhio provides bookkeeping and tax preparation tools for UK self employed tradespeople.
          For data protection law, Lekhio is the data controller for the information described here.
          You can reach us any time at info@lekhio.app.
        </p>

        <h2 style={heading}>What we collect</h2>
        <ul style={{ paddingLeft: 20, margin: '0 0 14px' }}>
          <li style={li}>Your mobile number, so we can link your WhatsApp to your account.</li>
          <li style={li}>Your email, if you choose to give it.</li>
          <li style={li}>The receipts, photos, and voice notes you send us.</li>
          <li style={li}>The financial records we build from what you send, such as amounts, dates, merchants, and categories.</li>
          <li style={li}>Basic technical data needed to run the service, such as app version and error logs.</li>
          <li style={li}>If, and only if, you choose to connect a bank: your account information, balance and transactions, read only. See &quot;Connecting your bank&quot; below.</li>
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

        {/* ⚠️ THE SENTENCE THAT USED TO BE HERE WAS NOT TRUE.
            It read: "We do not store the content of your WhatsApp messages with any third party
            beyond our secure database." Meanwhile every voice note went to a transcription provider
            and every message we could not read with plain rules went to an AI provider. Both are
            third parties. The claim was false the day it was written and it was published.
            A privacy policy that overstates the protection is worse than one that admits the truth,
            because he makes decisions on it. He decides to send the voice note. */}
        <h2 style={heading}>How we store and protect your data</h2>
        <p style={para}>
          Your data is encrypted in transit and at rest. We store it with trusted infrastructure
          providers and limit access to the people and systems that need it. We do not sell your
          data and we never use it to train anybody&apos;s AI models.
        </p>

        <h2 style={heading}>Reading your receipts and voice notes (AI)</h2>
        <p style={para}>
          Lekhio uses AI to read a photo of a receipt and to understand what you tell it. Two
          providers do that work for us, under contract, on our instructions and nobody else&apos;s:
        </p>
        <p style={para}>
          <strong>Anthropic</strong> reads receipt photos and messages, and works out what you are
          asking. <strong>OpenAI</strong> turns a voice note into text, because that is the one
          thing our main AI provider cannot do. Both are processors: they may not use your data for
          their own purposes and they do not train their models on it.
        </p>
        <p style={para}>
          <strong>We do not keep the text of your voice notes.</strong> A voice note is transcribed,
          the amount, the vendor, the category and the date are taken from it, and the transcript is
          discarded. It is not stored and it is not shown back to you in your books. Messages you
          type yourself are stored, because they are your own words and you can see and correct
          them.
        </p>

        <h2 style={heading}>Health information</h2>
        <p style={para}>
          A small number of tax allowances depend on a health condition. The Blind Person&apos;s
          Allowance is the one that matters to our users. The law treats health information
          differently from everything else, and rightly so.
        </p>
        <p style={para}>
          We will never ask you about a health condition over WhatsApp. We ask in the app, on its
          own, and only after you have said yes to a separate request that explains exactly what we
          would do with the answer. If you say no, or say nothing, we do not ask and you lose
          nothing else. If you say yes and later change your mind, you can delete it in the app and
          it is erased, not hidden. Our lawful basis is your explicit consent, and nothing else.
        </p>

        <h2 style={heading}>Connecting your bank (optional)</h2>
        <p style={para}>
          You can choose to connect a bank account so your transactions arrive automatically
          instead of you sending each one. This is optional. Lekhio works fully without it.
        </p>
        <p style={para}>
          If you connect a bank, we use TrueLayer, a provider authorised and regulated by the
          Financial Conduct Authority to provide account information services. You give consent
          in your bank&apos;s own screens, not ours, and we never see your bank login details. The
          access we ask for is READ ONLY: we can see your account information, balance and
          transactions, and we cannot move money, make payments, or change anything in your
          account.
        </p>
        <p style={para}>
          We use that data for one purpose: to build your bookkeeping records so your tax figures
          are right. Incoming transactions arrive as unconfirmed entries and count toward nothing
          until you confirm them, exactly like a receipt you send us. The access tokens are
          encrypted and stored on our servers only. You can disconnect at any time, in the app or
          by emailing info@lekhio.app, and you can withdraw consent with your bank directly. Our
          lawful basis is your consent, and performance of the contract to deliver the service.
        </p>

        <h2 style={heading}>Where we process your data</h2>
        <p style={para}>
          Your records are stored in the United Kingdom, in a London data centre run by our database
          provider. Some processing happens on servers in the United States run by our hosting
          provider, so the app can run. These transfers to the United States are covered by the UK
          extension to the EU to US Data Privacy Framework, under which the provider is certified, so
          your data keeps an equivalent level of protection to the UK. We only use providers that are
          bound to protect your data and that act on our instructions.
        </p>

        <h2 style={heading}>Who we share it with</h2>
        <p style={para}>
          We do not sell your data. We share it only with the service providers that help us run
          Lekhio: our hosting, database, payment and messaging providers, and the two AI providers
          above. They act on our instructions and are bound to protect your data. If a recognised
          tax submission path is used, it only happens after you approve.
        </p>

        <h2 style={heading}>Sharing your books with someone (optional)</h2>
        <p style={para}>
          You can choose to give someone a read only view of your books, for example a mortgage broker, a
          lender, a landlord, or an accountant if you use one. This is entirely your decision, it is off
          unless you switch it on, and Lekhio works fully without it.
        </p>
        <p style={para}>
          When you create a link you choose who it is for, which dates it covers, which categories to leave
          out, and how long it lasts. You can turn it off at any time from the app and the link stops working
          immediately. Whoever holds it sees only the entries you confirmed, inside the dates you chose, minus
          the categories you excluded: the date, the merchant, the category and the amount. They cannot see
          your receipt photos, your voice notes, your WhatsApp messages, your phone number or your bank
          connection, and they cannot change anything. We show you how many times the link has been opened and
          when it was last used, so you can see it being used and spot it being used when you did not expect
          it.
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
          To use any of these rights, email info@lekhio.app. You can also complain to the
          Information Commissioner&apos;s Office at ico.org.uk if you are unhappy with how we handle your
          data.
        </p>

        <h2 style={heading}>Changes to this policy</h2>
        <p style={para}>
          If we change this policy, we will update the date at the top and, where the change is
          significant, we will tell you.
        </p>

        <h2 style={heading}>Contact</h2>
        <p style={para}>Questions about your privacy. Email info@lekhio.app and we will help.</p>

        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 40, paddingTop: 20 }}>
          <Link href="/terms" style={{ fontSize: 14, fontWeight: 500, color: INDIGO }}>
            Read our Terms of Service
          </Link>
        </div>
      </article>
    </main>
  );
}
