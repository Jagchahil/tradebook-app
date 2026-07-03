import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, RIVER, RIVER_DEEP, RIVER_TINT, SAFFRON_TINT, PAPER, LINE, MUTED,
  RED_INK, RED_BG,
  features, oldAccountant, lekhioWay, claimExamples, fixes, comingSoon,
  SharedHead, TrustBar, SiteNav, StickyCta, SiteFooter, AppDash, AppTax, AppInv,
  PANEL, INK_BG,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'What Lekhio does. Your whole back office, in a text.',
  description: 'Receipt capture, voice notes, mileage, invoices, CIS and quarterly tax prep. Everything runs from a WhatsApp text, one flat price.',
};

export default function Page() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", overflowX: 'hidden' }}>
      <SharedHead />
      <TrustBar />
      <SiteNav />

      {/* Hero */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px 30px' }}>
        <div style={{ maxWidth: 820 }}>
          <span className="hero-pill" style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, color: RIVER, background: RIVER_TINT, padding: '6px 14px', borderRadius: 20, marginBottom: 18 }}>The whole back office</span>
          <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 800, letterSpacing: '-1.4px', margin: '0 0 18px' }}>
            What Lekhio does. Your whole back office, in a text.
          </h1>
          <p className="hero-sub" style={{ fontSize: 19, lineHeight: 1.6, color: MUTED, maxWidth: 680, margin: 0 }}>
            Snap a receipt, say an expense, or type what you got paid. Lekhio reads it, sorts it, logs it, writes your invoices, and gets your quarterly tax ready. All from WhatsApp. Nothing to learn.
          </p>
        </div>
      </section>

      {/* Full features grid */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 46px' }}>
        <div className="grid3" style={{ display: 'grid', gap: 20 }}>
          {features.map((f) => (
            <div key={f.title} className="reveal card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
              <div className="icontile" style={{ width: 52, height: 52, borderRadius: 14, background: f.tint, color: f.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: MUTED, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Beat the accountant (dark) */}
      <section style={{ background: INK_BG }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '56px 24px' }}>
          <div className="reveal" style={{ maxWidth: 720, marginBottom: 34 }}>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', color: '#fff', margin: '0 0 14px' }}>Beat the accountant</h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: '#B6BDC8', margin: 0 }}>The brains of an accountant, none of the bill. Here is the old way, next to the Lekhio way.</p>
          </div>
          <div className="duo reveal">
            <div style={{ background: '#1B1B1B', border: '1px solid #2C2C2C', borderRadius: 18, padding: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: RED_INK, marginBottom: 6 }}>The old way</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 18px' }}>A traditional accountant.</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {oldAccountant.map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 12, background: RED_BG, color: RED_INK, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>✕</span>
                    <span style={{ fontSize: 15.5, lineHeight: 1.55, color: '#D6DAE1' }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ background: RIVER, borderRadius: 18, padding: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#BFD8F2', marginBottom: 6 }}>The better way</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 18px' }}>The Lekhio way.</h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {lekhioWay.map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 12, background: 'rgba(255,255,255,.18)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>✓</span>
                    <span style={{ fontSize: 15.5, lineHeight: 1.55, color: '#fff' }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* App demo */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '56px 24px' }}>
        <div className="appdemo-grid reveal">
          <div className="appphone">
            <div className="appstatus"><i /></div>
            <div className="appview">
              <div className="apptrack">
                <AppDash />
                <AppTax />
                <AppInv />
                <AppDash />
              </div>
            </div>
          </div>
          <div>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 16px' }}>Your whole back office, in your pocket.</h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED, margin: '0 0 24px' }}>
              You send it on WhatsApp. It all lands here, tidy and ready. Open the app whenever you want the full picture.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                'Income, expenses and profit, kept up to date as you go.',
                'Your quarterly tax figures, prepared and waiting for your yes.',
                'Invoices sent and tracked, so you know who has paid.',
              ].map((t) => (
                <li key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: RIVER_TINT, color: RIVER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</span>
                  <span style={{ fontSize: 16, lineHeight: 1.55, color: INK }}>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Say it. It is claimed. */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ maxWidth: 720, marginBottom: 32 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Say it. It is claimed.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED, margin: 0 }}>Text it in plain words. Lekhio works out the claim and logs it at the right rate.</p>
        </div>
        <div className="grid4" style={{ display: 'grid', gap: 18 }}>
          {claimExamples.map((c) => (
            <div key={c.text} className="reveal card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 22, textAlign: 'center' }}>
              <div style={{ background: '#DCF8C6', borderRadius: '14px 14px 14px 4px', padding: '12px 14px', fontSize: 14.5, color: INK, fontWeight: 500, display: 'inline-block' }}>“{c.text}”</div>
              <div style={{ fontSize: 22, color: RIVER, margin: '10px 0 8px' }}>↓</div>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: RIVER_DEEP }}>{c.result}</div>
            </div>
          ))}
        </div>
      </section>

      {/* From their complaints to our fixes */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ maxWidth: 720, marginBottom: 32 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>From their complaints to our fixes</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED, margin: 0 }}>The gripes people leave about other apps, and how Lekhio puts each one right.</p>
        </div>
        <div>
          {fixes.map((f) => (
            <div key={f.gripe} className="fixrow reveal">
              <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: MUTED }}>{f.who}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.3px', color: RED_INK, background: RED_BG, padding: '4px 9px', borderRadius: 10 }}>{f.stars} star{f.stars === 1 ? '' : 's'}</span>
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: INK, margin: 0 }}>“{f.gripe}”</p>
              </div>
              <div className="fixarrow" aria-hidden="true">→</div>
              <div style={{ background: RIVER_TINT, border: `1px solid ${RIVER_TINT}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: RIVER, marginBottom: 10 }}>The Lekhio fix</div>
                <p style={{ fontSize: 15, lineHeight: 1.55, color: INK, margin: 0 }}>{f.fix}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Coming soon */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ maxWidth: 720, marginBottom: 32 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Coming soon</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED, margin: 0 }}>Already on the way. Every one keeps you in control and never sends a thing without your yes.</p>
        </div>
        <div className="grid4" style={{ display: 'grid', gap: 18 }}>
          {comingSoon.map((c) => (
            <div key={c.title} className="reveal card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 24 }}>
              <div className="icontile" style={{ width: 48, height: 48, borderRadius: 13, background: SAFFRON_TINT, color: RIVER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 14 }}>{c.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', margin: '0 0 8px' }}>{c.title}</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: 0 }}>{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 70px' }}>
        <div className="reveal" style={{ borderRadius: 24, padding: '52px 32px', textAlign: 'center', background: `linear-gradient(135deg, ${RIVER}, #2E7BBF)`, color: '#fff' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', color: '#fff', margin: '0 0 14px' }}>Your whole back office, sorted from a text.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: '#DCEAF8', maxWidth: 560, margin: '0 auto 28px' }}>30 days free. No card needed. Cancel in one tap.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/start" className="btn-white" style={{ background: PANEL, color: RIVER, fontSize: 16, fontWeight: 700, padding: '15px 28px', borderRadius: 12 }}>Start free trial</Link>
            <Link href="/pricing" className="btn-ghost" style={{ background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 16, fontWeight: 700, padding: '15px 28px', borderRadius: 12, border: '1px solid rgba(255,255,255,.35)' }}>See pricing</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
