import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, RIVER, RIVER_DEEP, RIVER_TINT, SAFFRON, SAFFRON_DEEP, SAFFRON_TINT,
  PAPER, SURFACE, LINE, MUTED, FONT, SITE,
  steps, stats, features, reviews, faqs,
  SharedHead, TrustBar, SiteNav, SiteFooter, StickyCta, HeroPhone, ReviewCard, RiverDivider,
  PANEL,
} from './_shared/site';

export const metadata: Metadata = {
  title: 'Lekhio. Your books, handled. Just text it.',
  description:
    'Lekhio is the WhatsApp back office for the UK self employed. Snap a receipt, leave a voice note, or type it. Lekhio logs it, sorts it, invoices for you, and keeps you ready for Making Tax Digital. You approve before anything reaches HMRC. 30 days free.',
  openGraph: {
    title: 'Lekhio. Your books, handled. Just text it.',
    description: 'The WhatsApp back office for the UK self employed. Snap it, say it, or text it. Lekhio does the books.',
    type: 'website',
  },
};

export default function HomePage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Lekhio', url: SITE, logo: `${SITE}/lekhio-logo.svg`, description: 'WhatsApp-first bookkeeping and Making Tax Digital prep for UK self-employed tradespeople.' },
              { '@type': 'SoftwareApplication', name: 'Lekhio', applicationCategory: 'FinanceApplication', operatingSystem: 'iOS, Android, Web', url: SITE, description: 'Text a receipt, voice note or invoice to WhatsApp. Lekhio logs it, categorises it, and keeps you ready for Making Tax Digital. You approve before anything reaches HMRC.', offers: [ { '@type': 'Offer', price: '19.99', priceCurrency: 'GBP', category: 'Monthly subscription' }, { '@type': 'Offer', price: '199', priceCurrency: 'GBP', category: 'Annual subscription' } ], publisher: { '@id': `${SITE}/#org` } },
              { '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
            ],
          }),
        }}
      />
      <SharedHead />
      <TrustBar />
      <SiteNav />

      {/* Hero */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 24px 16px' }}>
        <div className="hero-grid">
          <div className="hero-left">
            <div className="hero-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 20, marginBottom: 24 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', display: 'inline-block', animation: 'pulseDot 2s infinite' }} />
              The only complete tax assistant that lives in WhatsApp.
            </div>
            <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 700, letterSpacing: '-2.4px', margin: '0 0 20px' }}>
              Your books, handled.<br /><span className="gradtext">Just text it.</span>
            </h1>
            <p className="hero-sub" style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>
              Lekhio is the back office for anyone self employed in the UK. Snap a receipt, leave a voice note, or type it. Lekhio logs it, sorts it, invoices for you, and keeps you ready for tax. All on WhatsApp.
            </p>
            <div className="hero-cta" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Sign up now</Link>
              <Link href="/product" className="btn-ghost" style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${INK}`, fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>See how it works</Link>
            </div>
            <div className="hero-cta" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
              <div aria-hidden="true" style={{ display: 'flex' }}>
                {['#1B59A6', '#E0A33E', '#15803D', '#134277'].map((c, i) => (
                  <span key={i} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, border: '2px solid #fff', marginLeft: i ? -8 : 0, display: 'inline-block' }} />
                ))}
              </div>
              <p style={{ fontSize: 13, color: MUTED, margin: 0 }}><span style={{ color: SAFFRON }}>★★★★★</span> &nbsp;Built with UK sole traders. 30 days free, no card needed.</p>
            </div>
          </div>
          <div className="hero-cta" style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}><HeroPhone /></div>
          </div>
        </div>
      </section>

      {/* MTD urgency strip */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '14px 24px 0' }}>
        <Link href="/how-mtd-works" className="reveal card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between', background: SAFFRON_TINT, border: `1px solid #EAD6A8`, borderRadius: 16, padding: '16px 22px', color: INK }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260, flex: 1 }}>
            <span style={{ fontSize: 24 }}>⏳</span>
            <p style={{ fontSize: 15, color: INK, lineHeight: 1.5, margin: 0 }}>
              <strong>Making Tax Digital is live.</strong> Earn over £50,000 self employed? You now have to keep digital records and send HMRC four updates a year. Lekhio keeps you ready from a text, no spreadsheets.
            </p>
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: SAFFRON_DEEP, whiteSpace: 'nowrap' }}>What this means for me →</span>
        </Link>
      </section>

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 24px 30px' }}><RiverDivider /></div>

      {/* How it works (stepper) */}
      <section id="how" style={{ maxWidth: 1240, margin: '0 auto', padding: '34px 24px 46px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 54 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Three steps. That is the whole thing.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 540, margin: '0 auto' }}>No spreadsheets. No shoebox of receipts. No evenings lost to paperwork.</p>
        </div>
        <div className="stepper">
          <div className="stepper-line" aria-hidden="true" />
          {steps.map((s, i) => (
            <div key={s.n} className="step reveal" style={{ transitionDelay: `${i * 120}ms` }}>
              <div className="step-num">{s.n}</div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>{s.title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats band */}
      <section style={{ background: `linear-gradient(120deg, ${RIVER_DEEP}, ${RIVER})`, color: '#fff' }}>
        <div className="reveal" style={{ maxWidth: 1240, margin: '0 auto', padding: '42px 24px' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div className="stat-num">{s.prefix}<span className="countup" data-to={s.to}>0</span>{s.suffix}</div>
                <p style={{ fontSize: 14, color: '#CFE0F2', margin: '10px auto 0', maxWidth: 180, lineHeight: 1.45 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features teaser (link to /product for the full set) */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '54px 24px 46px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Everything your accountant nags you for.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>Done as you work, not at the end of the year.</p>
        </div>
        <div className="grid3" style={{ display: 'grid', gap: 20 }}>
          {features.slice(0, 6).map((f, i) => (
            <div key={f.title} className="reveal card" style={{ transitionDelay: `${(i % 3) * 90}ms`, backgroundColor: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
              <div className="icontile" style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: f.tint, color: f.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.2px' }}>{f.title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
        <div className="reveal" style={{ textAlign: 'center', marginTop: 34 }}>
          <Link href="/product" className="btn-primary" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '14px 28px', borderRadius: 12 }}>See everything Lekhio does →</Link>
        </div>
      </section>

      {/* Proof (reviews marquee) */}
      <section style={{ background: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, padding: '46px 0' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 30, padding: '0 24px' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 12px' }}>Built with people who work for themselves.</h2>
          <p style={{ fontSize: 16, color: MUTED, maxWidth: 520, margin: '0 auto' }}>The tradespeople and sole traders shaping Lekhio, in their words.</p>
        </div>
        <div className="marquee reveal">
          <div className="marquee-track">
            {[...reviews, ...reviews].map((r, i) => (<ReviewCard key={i} r={r} />))}
          </div>
        </div>
      </section>

      {/* Pricing CTA band */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '62px 24px' }}>
        <div className="reveal" style={{ background: `linear-gradient(135deg, ${RIVER}, ${RIVER_DEEP})`, borderRadius: 24, padding: '46px 34px', textAlign: 'center', color: '#fff' }}>
          <h2 className="h2" style={{ color: '#fff', fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>One flat price. Everything in.</h2>
          <p style={{ fontSize: 18, color: '#CFE0F2', maxWidth: 560, margin: '0 auto 10px', lineHeight: 1.6 }}>
            £19.99 a month, or £199 a year. No receipt limits, no tiers, no surprises. 30 days free, no card needed, cancel in one tap.
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 13.5, fontWeight: 700, padding: '6px 14px', borderRadius: 20, margin: '6px 0 24px' }}>🎉 Founder pricing for the first cohort: £15.99 a month or £159 a year</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link href="/start" className="btn-white" style={{ background: PANEL, color: RIVER, fontSize: 16, fontWeight: 700, padding: '15px 32px', borderRadius: 12 }}>Start free trial</Link>
            <Link href="/pricing" className="btn-ghost" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>See what is included</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
