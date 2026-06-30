import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security and Your Data | Lekhio',
  description:
    'How Lekhio keeps your money and tax data safe, and exactly how the AI is and is not used. Plain English. Your data is yours, encrypted, never sold, and you approve everything before it reaches HMRC.',
};

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const MUTED = '#5B6470';
const BORDER = '#ECECEC';
const OFF_WHITE = '#FBFAF7';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const promises: { icon: string; title: string; body: string }[] = [
  {
    icon: '🔒',
    title: 'Encrypted, coming and going',
    body: 'Your data is encrypted in transit and at rest. Nobody can read it as it travels, and it is not sitting in plain text anywhere.',
  },
  {
    icon: '👁️',
    title: 'Only you can see your records',
    body: 'Your books are yours. Access is locked to your account at the database level, so one person can never see another person\'s figures. We do not sell your data, and we never share it beyond the trusted suppliers that run the service.',
  },
  {
    icon: '✅',
    title: 'You approve everything',
    body: 'We prepare your figures. Nothing is ever sent to HMRC until you check it and say yes. HMRC keeps you responsible for your tax, and we never pretend otherwise.',
  },
  {
    icon: '📤',
    title: 'Yours to take or delete',
    body: 'Export your records whenever you want, or ask us to delete your account, subject only to the record-keeping rules UK tax law places on both of us.',
  },
];

const aiPoints: { q: string; a: string }[] = [
  {
    q: 'Does the AI see all my data?',
    a: 'No. When you ask a question, the AI only ever sees your own figures, to answer your own question. It cannot see anyone else\'s data, and it is not given your passwords or card details.',
  },
  {
    q: 'Does my data train the AI?',
    a: 'No. Your figures are used to answer you in the moment. They are not used to train the AI model.',
  },
  {
    q: 'Can the AI move my money or file my tax?',
    a: 'No. The AI reads and explains and prepares. It cannot move money, and it cannot file anything. Every action that touches HMRC or money waits for you to approve it.',
  },
  {
    q: 'Is the AI accurate?',
    a: 'Our tax engine is built on the rules taught in the leading tax qualifications and checked against an exam-style test suite every release. It is expert and tested. For complex matters it will tell you to speak to a qualified accountant.',
  },
];

const heading: React.CSSProperties = { fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', margin: '40px 0 16px', color: INK };
const para: React.CSSProperties = { fontSize: 16, lineHeight: 1.7, color: '#374151', margin: '0 0 14px' };

export default function SecurityPage() {
  return (
    <main style={{ backgroundColor: OFF_WHITE, color: INK, fontFamily: FONT, minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:680px){.grid2{grid-template-columns:1fr}}` }} />

      <nav style={{ maxWidth: 820, margin: '0 auto', padding: '22px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: INK }}>Lekhio</Link>
        <Link href="/" style={{ fontSize: 14, fontWeight: 500, color: RIVER }}>Back to home</Link>
      </nav>

      <article style={{ maxWidth: 820, margin: '0 auto', padding: '20px 24px 80px' }}>
        <span style={{ display: 'inline-block', backgroundColor: GREEN_TINT, color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>SECURITY AND TRUST</span>
        <h1 style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-1.2px', margin: '0 0 14px', lineHeight: 1.1 }}>Your money data, kept safe. Said plainly.</h1>
        <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: '0 0 8px', maxWidth: 640 }}>
          This is your livelihood and your tax, so you deserve to know exactly how it is protected and how the AI is used. No jargon, no hand-waving. Here is the truth.
        </p>

        <h2 style={heading}>The four promises</h2>
        <div className="grid2">
          {promises.map((p) => (
            <div key={p.title} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 26 }}>{p.icon}</div>
              <div style={{ fontSize: 16.5, fontWeight: 800, margin: '8px 0 6px' }}>{p.title}</div>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>

        <h2 style={heading}>Straight answers about the AI</h2>
        <p style={para}>
          Plenty of people are wary of AI, and that is fair. It is early, the way the internet was once new. So we will be straight with you about what ours does and does not do.
        </p>
        <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
          {aiPoints.map((it, i) => (
            <div key={it.q} style={{ padding: '18px 20px', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: INK, marginBottom: 6 }}>{it.q}</div>
              <p style={{ fontSize: 15, color: '#374151', lineHeight: 1.65, margin: 0 }}>{it.a}</p>
            </div>
          ))}
        </div>

        <h2 style={heading}>How we run it</h2>
        <p style={para}>
          Payments are handled by Stripe, so we never see or store your full card number. Messages that come in are checked with a cryptographic signature before we act on them, so nobody can fake a request. Access inside the company follows least privilege, meaning systems only get the keys they actually need. We do not log the content of your WhatsApp messages to any outside service.
        </p>
        <p style={para}>
          We follow UK GDPR, and we are completing our registration with the Information Commissioner&apos;s Office. If you ever have a question about your data, email <a href="mailto:privacy@lekhio.com" style={{ color: RIVER, fontWeight: 600 }}>privacy@lekhio.com</a>.
        </p>

        <div style={{ marginTop: 32, background: RIVER_TINT, border: `1px solid #D4E4F4`, borderRadius: 16, padding: '22px 24px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: RIVER_DEEP, marginBottom: 6 }}>The line that never moves</div>
          <p style={{ fontSize: 15.5, color: INK, lineHeight: 1.6, margin: 0 }}>
            Lekhio prepares. You approve. You stay in control of your money and your tax, always. Anything that moves money, files with HMRC, or sends a message on your behalf waits for your yes.
          </p>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 40, paddingTop: 20, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ fontSize: 14, fontWeight: 600, color: RIVER }}>Privacy Policy</Link>
          <Link href="/terms" style={{ fontSize: 14, fontWeight: 600, color: RIVER }}>Terms of Service</Link>
          <Link href="/" style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>Back to home</Link>
        </div>
      </article>
    </main>
  );
}
