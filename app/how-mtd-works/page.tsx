import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, RIVER, RIVER_TINT, GREEN_TINT, PAPER, LINE, MUTED,
  mtdMeans,
  SharedHead, TrustBar, SiteNav, StickyCta, SiteFooter,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'How Making Tax Digital works, in plain English.',
  description: 'Making Tax Digital, explained simply. Keep digital records, send four short updates a year, and approve everything before it reaches HMRC.',
};

const quarters: [string, string][] = [
  ['Update 1', 'Summer'],
  ['Update 2', 'Autumn'],
  ['Update 3', 'Winter'],
  ['Update 4', 'Spring'],
];

export default function Page() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", overflowX: 'hidden' }}>
      <SharedHead />
      <TrustBar />
      <SiteNav />

      {/* Hero */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px 30px' }}>
        <div style={{ maxWidth: 820 }}>
          <span className="hero-pill" style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, color: RIVER, background: RIVER_TINT, padding: '6px 14px', borderRadius: 20, marginBottom: 18 }}>Plain English</span>
          <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 800, letterSpacing: '-1.4px', margin: '0 0 18px' }}>
            How Making Tax Digital works, in plain English.
          </h1>
          <p className="hero-sub" style={{ fontSize: 19, lineHeight: 1.6, color: MUTED, maxWidth: 700, margin: 0 }}>
            Making Tax Digital, or MTD, is HMRC moving self employed tax online. Instead of one big return once a year, you keep your records digitally and send four short updates. It sounds like more work. With Lekhio it is less, because your records build themselves as you go.
          </p>
        </div>
      </section>

      {/* What MTD means, 3 cards */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 46px' }}>
        <div className="reveal" style={{ maxWidth: 720, marginBottom: 28 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>What it actually asks of you</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED, margin: 0 }}>Three simple things. Lekhio handles the first two, and keeps you in charge of the third.</p>
        </div>
        <div className="grid3" style={{ display: 'grid', gap: 20 }}>
          {mtdMeans.map((m) => (
            <div key={m.title} className="reveal card" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
              <div className="icontile" style={{ width: 52, height: 52, borderRadius: 14, background: m.tint, color: m.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>{m.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 8px' }}>{m.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: MUTED, margin: 0 }}>{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Old way vs new way */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ maxWidth: 720, marginBottom: 32 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>The old way, and the new way</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED, margin: 0 }}>The January scramble is going. In its place, four short check ins across the year.</p>
        </div>
        <div className="duo reveal">
          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 28 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📦</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 10px' }}>One big return, once a year</h3>
            <p style={{ fontSize: 15.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>
              A shoebox of receipts, a lost weekend, and the January panic. One deadline where everything has to be right at once, with no time left to fix it or plan ahead.
            </p>
          </div>
          <div style={{ background: RIVER_TINT, border: `1px solid ${RIVER_TINT}`, borderRadius: 18, padding: 28 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🗓️</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 18px', color: INK }}>Four short updates a year</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {quarters.map(([label, season], i) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: '#fff', border: `2px solid ${RIVER}`, color: RIVER, fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>{i + 1}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>{label}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{season}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: '18px 0 0' }}>Each one is a quick summary Lekhio prepares. You check it and send it. No panic, no shoebox.</p>
          </div>
        </div>
      </section>

      {/* Reassurance */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ background: GREEN_TINT, border: `1px solid ${GREEN_TINT}`, borderRadius: 20, padding: '40px 32px', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>🤝</div>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>You approve everything.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: INK, maxWidth: 620, margin: '0 auto' }}>
            Nothing goes to HMRC without your yes. Lekhio prepares the figures and keeps you ready. HMRC keeps you responsible for your tax, so the final say is always yours.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 70px' }}>
        <div className="reveal" style={{ borderRadius: 24, padding: '52px 32px', textAlign: 'center', background: `linear-gradient(135deg, ${RIVER}, #2E7BBF)`, color: '#fff' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', color: '#fff', margin: '0 0 14px' }}>Get ready for MTD without lifting a finger.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: '#DCEAF8', maxWidth: 560, margin: '0 auto 28px' }}>Start now and your records build themselves. 30 days free, no card needed.</p>
          <Link href="/start" className="btn-white" style={{ background: '#fff', color: RIVER, fontSize: 16, fontWeight: 700, padding: '15px 28px', borderRadius: 12, display: 'inline-block' }}>Start free trial</Link>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
