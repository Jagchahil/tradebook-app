import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, PAPER, FONT, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'Security and Your Data | Lekhio',
  description:
    'How Lekhio keeps your money and tax data safe, and exactly how the AI is and is not used. Plain English. Your data is yours, encrypted, never sold, and you approve everything before it reaches HMRC.',
};

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
    a: 'Our tax engine is built on the rules taught in the leading tax qualifications and checked against an exam-style test suite of over one hundred cases every release. For anything complex it will tell you to speak to a qualified accountant.',
  },
];

const SECURITY_CSS = `
.mkt .hero{padding:52px 0 6px}
.sec-wrap{max-width:840px;margin:0 auto;padding:8px 24px 90px}
.sec-badge{display:inline-block;background:var(--teal-tint);color:var(--teal);font-size:12px;font-weight:800;letter-spacing:.06em;padding:6px 12px;border-radius:20px;margin-bottom:16px}
.sec-h{font-size:clamp(23px,3.4vw,30px);letter-spacing:-.03em;font-weight:800;margin:44px 0 16px;color:var(--tx)}
.sec-p{font-size:16px;line-height:1.7;color:var(--tx-mut);margin:0 0 14px}
.sec-p a{color:var(--river);font-weight:600}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:680px){.grid2{grid-template-columns:1fr}}
.sec-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:var(--shadow)}
.sec-card .i{font-size:26px}
.sec-card .t{font-size:16.5px;font-weight:800;margin:8px 0 6px;color:var(--tx)}
.sec-card p{font-size:14.5px;color:var(--tx-mut);line-height:1.6;margin:0}
.ai-list{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:var(--shadow)}
.ai-item{padding:18px 20px;border-top:1px solid var(--line)}
.ai-item:first-child{border-top:0}
.ai-item .q{font-size:16px;font-weight:800;color:var(--tx);margin-bottom:6px}
.ai-item p{font-size:15px;color:var(--tx-mut);line-height:1.65;margin:0}
.sec-line{margin-top:34px;background:var(--river-tint);border:1px solid var(--line);border-radius:16px;padding:22px 24px}
.sec-line .t{font-size:17px;font-weight:800;color:var(--river);margin-bottom:6px}
.sec-line p{font-size:15.5px;color:var(--tx);line-height:1.6;margin:0}
.sec-foot{border-top:1px solid var(--line);margin-top:42px;padding-top:20px;display:flex;gap:18px;flex-wrap:wrap}
.sec-foot a{font-size:14px;font-weight:600;color:var(--river)}
`;

export default function SecurityPage() {
  return (
    <main className="mkt" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: SECURITY_CSS }} />

      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for the self employed earning over £50k. <span className="go">See if it affects you →</span></Link></div>
      <SiteNav />

      {/* Hero */}
      <section className="hero center">
        <div className="wrap">
          <span className="sec-badge">SECURITY AND TRUST</span>
          <h1 style={{ maxWidth: 720, margin: '0 auto' }}>Your money data, kept safe.<br /><span className="gt">Said plainly.</span></h1>
          <p className="sub" style={{ maxWidth: 620, margin: '20px auto 0' }}>
            This is your livelihood and your tax, so you deserve to know exactly how it is protected and how the AI is used. No jargon, no hand-waving. Here is the truth.
          </p>
        </div>
      </section>

      <article className="sec-wrap reveal">
        <h2 className="sec-h">The four promises</h2>
        <div className="grid2">
          {promises.map((p) => (
            <div key={p.title} className="sec-card">
              <div className="i" aria-hidden="true">{p.icon}</div>
              <div className="t">{p.title}</div>
              <p>{p.body}</p>
            </div>
          ))}
        </div>

        <h2 className="sec-h">Straight answers about the AI</h2>
        <p className="sec-p">
          Plenty of people are wary of AI, and that is fair. It is early, the way the internet was once new. So we will be straight with you about what ours does and does not do.
        </p>
        <div className="ai-list">
          {aiPoints.map((it) => (
            <div key={it.q} className="ai-item">
              <div className="q">{it.q}</div>
              <p>{it.a}</p>
            </div>
          ))}
        </div>

        <h2 className="sec-h">How we run it</h2>
        <p className="sec-p">
          Payments are handled by Stripe, so we never see or store your full card number. Messages that come in are checked with a cryptographic signature before we act on them, so nobody can fake a request. Access inside the company follows least privilege, meaning systems only get the keys they actually need. We do not log the content of your WhatsApp messages to any outside service.
        </p>
        <p className="sec-p">
          We follow UK GDPR, and we are completing our registration with the Information Commissioner&apos;s Office. If you ever have a question about your data, email <a href="mailto:privacy@lekhio.com">privacy@lekhio.com</a>.
        </p>

        <div className="sec-line">
          <div className="t">The line that never moves</div>
          <p>
            Lekhio prepares. You approve. You stay in control of your money and your tax, always. Anything that moves money, files with HMRC, or sends a message on your behalf waits for your yes.
          </p>
        </div>

        <div className="sec-foot">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/">Back to home</Link>
        </div>
      </article>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
