import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, RIVER, RIVER_TINT, PAPER, LINE, MUTED,
  compareRows, Mark,
  SharedHead, TrustBar, SiteNav, StickyCta, SiteFooter,
  PANEL,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'Lekhio vs the other options.',
  description: 'How Lekhio compares to other apps and doing it yourself. WhatsApp capture, voice notes, CIS, invoices, and quarterly tax prep, side by side.',
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
          <span className="hero-pill" style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, color: RIVER, background: RIVER_TINT, padding: '6px 14px', borderRadius: 20, marginBottom: 18 }}>An honest look</span>
          <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 800, letterSpacing: '-1.4px', margin: '0 0 18px' }}>
            Lekhio vs the other options.
          </h1>
          <p className="hero-sub" style={{ fontSize: 19, lineHeight: 1.6, color: MUTED, maxWidth: 680, margin: 0 }}>
            You could use another app. You could do it all yourself. Here is a straight comparison of what you get, so you can decide.
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 46px' }}>
        <div className="reveal" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="cmp">
              <thead>
                <tr>
                  <th style={{ color: MUTED }}>What you get</th>
                  <th className="lekcol center" style={{ color: RIVER }}>Lekhio</th>
                  <th className="center" style={{ color: MUTED }}>Other apps</th>
                  <th className="center" style={{ color: MUTED }}>Doing it yourself</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <td className="rowlabel">{row.label}</td>
                    <td className="lekcol center"><Mark value={row.lekhio} /></td>
                    <td className="center"><Mark value={row.apps} /></td>
                    <td className="center"><Mark value={row.diy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: MUTED, margin: '18px 2px 0', maxWidth: 760 }}>
          We do not name competitors. These are the common gaps people describe. Some rivals do some of this in higher tiers.
        </p>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 70px' }}>
        <div className="reveal" style={{ borderRadius: 24, padding: '52px 32px', textAlign: 'center', background: `linear-gradient(135deg, ${RIVER}, #2E7BBF)`, color: '#fff' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', color: '#fff', margin: '0 0 14px' }}>See the difference for yourself.</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: '#DCEAF8', maxWidth: 560, margin: '0 auto 28px' }}>30 days free. No card needed. Cancel in one tap.</p>
          <Link href="/start" className="btn-white" style={{ background: PANEL, color: RIVER, fontSize: 16, fontWeight: 700, padding: '15px 28px', borderRadius: 12, display: 'inline-block' }}>Start free trial</Link>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
