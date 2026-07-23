import type { Metadata } from 'next';
import Link from 'next/link';
import LeadCapture from '../../components/LeadCapture';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';
import { filingFaqAnswer } from '../../lib/features';

// THE FREE MTD FILING MAGNET, THE PAGE ONLY. Board card: "Free MTD filing magnet" (Growth
// foundation). This is deliberately just the page and the lead capture, NOT the filing path
// itself. The actual basic filing tool (profits and losses in, HMRC's essentials, fully
// deterministic, no AI in the loop) is separate work, not started here.
//
// Doc 103, the honesty test: a button whose only function is an alert saying the feature does not
// exist yet is an advert for our roadmap, not a button. So there is no fake calculator here and no
// "file now" control. The one real, working thing on this page is the email capture: it actually
// saves a lead, actually tags them free-mtd-filing, and we actually will tell them when it is
// ready. Everything else is honest "this is coming, here is what it will be."

export const metadata: Metadata = {
  title: 'Free Making Tax Digital Filing, Coming Soon | Lekhio',
  description:
    'For straightforward UK sole trader returns, just profits, losses and the essentials, Lekhio will prepare and file your Making Tax Digital return for free. No AI in this path, so it costs us nothing to run. Join the list.',
  openGraph: {
    title: 'Free Making Tax Digital Filing, Coming Soon',
    description: 'Basic Self Assessment, prepared and filed free, forever. No AI, no catch. Join the list to be first.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const SAFFRON_DEEP = 'var(--saffron-deep)';
const SAFFRON_TINT = 'var(--saffron-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const PAPER = 'var(--bg)';
const SURFACE = 'var(--surface)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const steps = [
  { n: '1', title: 'Answer the basics', body: 'Your profits, your losses, and the few essentials HMRC needs from a straightforward return. Nothing more.' },
  { n: '2', title: 'We prepare it', body: 'A fully deterministic engine works out your figures. No AI touches this path, which is exactly why it can stay free.' },
  { n: '3', title: 'You approve, we send it', body: 'You review the numbers and say yes. HMRC holds your taxpayer relationship throughout, always. We never file anything without your say so.' },
];

const faqs = [
  { q: 'Is it actually free?', a: 'Yes, for the basic path: profits, losses, and the essentials HMRC asks for. It costs us nothing to run because no AI is involved, so there is no reason to charge for it.' },
  { q: 'Do I have to be a paying Lekhio customer?', a: 'No. This basic path is built to stand on its own. If your situation is simple, this alone may be all you need.' },
  { q: 'What if my situation is not simple, property income, a PAYE job alongside my trade, VAT?', a: 'The free basic path covers straightforward sole trader profit and loss only. Anything with more moving parts is exactly what the full Lekhio service, WhatsApp bookkeeping and tax prep all year, is built for.' },
  { q: 'Does Lekhio file my tax for me?', a: filingFaqAnswer() },
  { q: 'When can I actually use it?', a: 'It is not live yet. This page is here so you can join the list and hear the moment it opens, rather than us making a promise before it is ready.' },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function FreeMtdFilingPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1c{font-size:44px;line-height:1.08;letter-spacing:-1.6px}@media(max-width:820px){.h1c{font-size:31px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      {/* Hero */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '30px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>FREE, FOREVER &middot; COMING SOON</span>
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 16px' }}>Free Making Tax Digital filing. For the basics, at no cost, ever.</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            If your return is straightforward, just profits, losses and the essentials HMRC asks for, we will prepare and file it for free. Not a trial, not a taster. Free because it costs us nothing to run.
          </p>
        </div>
      </section>

      {/* How it will work */}
      <section style={{ background: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, marginTop: 30 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 24px', letterSpacing: '-0.5px' }}>How it will work</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
            {steps.map((s) => (
              <div key={s.n} style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
                <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 14, background: RIVER, color: '#fff', fontSize: 13, fontWeight: 800, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{s.n}</span>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: 0 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why free, and the honest boundary */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '44px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          <div>
            <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 10px' }}>Why it is free</h2>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              Every other part of Lekhio uses AI to read a photo of a receipt or answer a question on WhatsApp. This basic filing path does not. It is a fully deterministic engine working from numbers you type in, so it costs us nothing to run whether one person uses it or a million do. That is the whole reason we can keep it free rather than a promotion that ends.
            </p>
          </div>
          <div>
            <h2 style={{ fontSize: 21, fontWeight: 700, margin: '0 0 10px' }}>What it covers, honestly</h2>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              Straightforward sole trader profit and loss, nothing more, at least at first. Property income, a PAYE job alongside your trade, VAT, and the rest still need the fuller picture, which is what the full Lekhio service on WhatsApp is for. We would rather tell you the edge of it now than have you find out later.
            </p>
          </div>
        </div>
      </section>

      {/* Lead capture, the one real thing on this page */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '8px 24px 12px' }}>
        <LeadCapture
          source="free-mtd-filing"
          heading="Be first when free filing opens"
          sub="Pop your email in and we will tell you the moment you can file your basic return free, before anyone else, plus the odd genuinely useful nudge about deadlines. No spam, unsubscribe any time."
        />
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px 60px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 20px', letterSpacing: '-0.4px' }}>Questions people ask</h2>
        <div style={{ display: 'grid', gap: 14 }}>
          {faqs.map((f) => (
            <div key={f.q} style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 14, padding: '18px 20px' }}>
              <h3 style={{ fontSize: 15.5, fontWeight: 700, margin: '0 0 6px', color: RIVER_DEEP }}>{f.q}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 640, margin: '30px auto 0', lineHeight: 1.55 }}>
          General information, not tax advice for your exact situation. Lekhio is an independent UK company, not HMRC, and not endorsed by HMRC.
        </p>
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/start" style={{ color: RIVER, fontSize: 14, fontWeight: 600 }}>Or start the full Lekhio trial now &rarr;</Link>
        </div>
      </section>

      <div style={{ background: GREEN_TINT, borderTop: `1px solid ${LINE}` }}>
        <p style={{ maxWidth: 780, margin: '0 auto', padding: '14px 24px', fontSize: 12.5, color: GREEN, textAlign: 'center', fontWeight: 600 }}>
          We PREPARE. You APPROVE. HMRC always holds your taxpayer relationship. That does not change here or anywhere else on Lekhio.
        </p>
      </div>

      <SiteFooter />
    </main>
  );
}
