import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, RIVER, RIVER_TINT, SAFFRON_DEEP, SAFFRON_TINT, GREEN, GREEN_TINT, PAPER, LINE, MUTED, SURFACE,
  included, replaces, faqs,
  SharedHead, TrustBar, SiteNav, StickyCta, SiteFooter,
  PANEL,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'Pricing. One flat price, everything in.',
  description: 'One flat price for the whole back office. £19.99 a month or £199 a year, founder pricing for the first cohort, 30 days free with no card needed.',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function Page() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", overflowX: 'hidden' }}>
      <SharedHead />
      <TrustBar />
      <SiteNav />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* Hero */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px 20px', textAlign: 'center' }}>
        <span className="hero-pill" style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, color: RIVER, background: RIVER_TINT, padding: '6px 14px', borderRadius: 20, marginBottom: 18 }}>No tiers, no paywalls</span>
        <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 800, letterSpacing: '-1.4px', margin: '0 0 18px' }}>
          Pricing. One flat price, everything in.
        </h1>
        <p className="hero-sub" style={{ fontSize: 19, lineHeight: 1.6, color: MUTED, maxWidth: 620, margin: '0 auto' }}>
          One price for the whole back office. No receipt limits, no features held back for a higher tier.
        </p>
      </section>

      {/* Price card */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '24px 24px 46px' }}>
        <div className="reveal" style={{ maxWidth: 560, margin: '0 auto', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 24, padding: '40px 32px', textAlign: 'center', boxShadow: '0 18px 44px rgba(17,17,17,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 4 }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: INK, marginTop: 10 }}>£</span>
            <span style={{ fontSize: 68, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1, color: INK }}>19.99</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: MUTED, alignSelf: 'flex-end', marginBottom: 12, marginLeft: 4 }}>per month</span>
          </div>
          <div style={{ fontSize: 15.5, color: MUTED, marginTop: 8 }}>or £199 a year</div>

          <div style={{ marginTop: 22, background: SAFFRON_TINT, color: SAFFRON_DEEP, borderRadius: 14, padding: '12px 16px', fontSize: 14.5, fontWeight: 700 }}>
            Founder pricing for the first cohort: £15.99 a month or £159 a year
          </div>

          <Link href="/start" className="btn-primary" style={{ display: 'block', marginTop: 24, background: RIVER, color: '#fff', fontSize: 17, fontWeight: 700, padding: '16px 0', borderRadius: 14 }}>Start free trial</Link>
          <div style={{ fontSize: 14, color: MUTED, marginTop: 14 }}>30 days free, no card needed, cancel in one tap.</div>
        </div>
      </section>

      {/* What is included */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 46px' }}>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 24px', textAlign: 'center' }}>Everything is in the price</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {included.map((item) => (
              <li key={item} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '16px 18px' }}>
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: RIVER_TINT, color: RIVER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</span>
                <span style={{ fontSize: 16, lineHeight: 1.55, color: INK }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Replaces a stack of subscriptions */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ maxWidth: 720, margin: '0 auto 32px', textAlign: 'center' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Replaces a stack of subscriptions</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED, margin: 0 }}>All the tools you would pay for separately, in one place.</p>
        </div>
        <div className="grid3 reveal" style={{ display: 'grid', gap: 18, maxWidth: 900, margin: '0 auto' }}>
          {replaces.map((r) => (
            <div key={r.label} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{r.icon}</div>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>{r.label}</div>
                <div style={{ fontSize: 13.5, color: MUTED, marginTop: 2, textDecoration: 'line-through' }}>{r.cost} a month</div>
              </div>
            </div>
          ))}
        </div>
        <p className="reveal" style={{ fontSize: 17, fontWeight: 600, color: INK, textAlign: 'center', margin: '28px auto 0', maxWidth: 640 }}>
          Lekhio replaces all of it for one price. No juggling logins, no stacking bills.
        </p>
      </section>

      {/* Money back guarantee */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 24px 46px' }}>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto', background: GREEN_TINT, border: `1px solid ${GREEN_TINT}`, borderRadius: 18, padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', textAlign: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 26 }}>🛡️</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: GREEN }}>Backed by a 30 day money back guarantee. No quibble.</span>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto 28px', textAlign: 'center' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: 0 }}>Common questions</h2>
        </div>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {faqs.map((f) => (
            <details key={f.q} className="faq reveal" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: '20px 22px' }}>
              <summary>
                <span style={{ fontSize: 16.5, fontWeight: 700, color: INK }}>{f.q}</span>
                <span className="faq-plus">+</span>
              </summary>
              <div className="faq-body">
                <p style={{ fontSize: 15.5, lineHeight: 1.65, color: MUTED, margin: 0 }}>{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 70px' }}>
        <div className="reveal" style={{ borderRadius: 24, padding: '52px 32px', textAlign: 'center', background: `linear-gradient(135deg, ${RIVER}, #2E7BBF)`, color: '#fff' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', color: '#fff', margin: '0 0 14px' }}>One flat price. Everything in.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: '#DCEAF8', maxWidth: 560, margin: '0 auto 28px' }}>Try it free for 30 days. No card needed. Cancel in one tap.</p>
          <Link href="/start" className="btn-white" style={{ background: PANEL, color: RIVER, fontSize: 16, fontWeight: 700, padding: '15px 28px', borderRadius: 12, display: 'inline-block' }}>Start free trial</Link>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
