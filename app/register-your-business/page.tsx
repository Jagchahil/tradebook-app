import type { Metadata } from 'next';
import Link from 'next/link';
import Wizard from './Wizard';
import { A11Y_CSS, APP_THEME_CSS } from '../../lib/tokens';
// 🔴 APP_THEME_CSS, not THEME_CSS: nothing here sets data-theme, so THEME_CSS's dark half could
// never match. This page had neither, and rendered light whatever the device said.
import { GREEN_TINT, INK, LINE, MUTED, ON_GREEN_TINT, ON_RIVER, PAPER, RIVER } from '../../lib/apptheme';
// 🔴 THIS PAGE SAID "14 DAYS FREE" IN A CHIP AND "your first 7 days are free" IN THE PARAGRAPH
// TWO LINES BELOW IT, LIVE, ON A PUBLIC PAGE. Found by the sweep in test/trial.test.mjs on 30 July,
// not by anyone reading it. Both now come from the one place that knows.
import { TRIAL_DAYS } from '../../lib/entitlement';

export const metadata: Metadata = {
  alternates: { canonical: '/register-your-business' },
  title: 'Register Your Business: Free Step by Step Guide | Lekhio',
  description:
    'Setting up as a sole trader or a limited company? Our free, step by step guide gives you the exact process, the forms like the CWF1, the SIC codes and the GOV.UK links to register yourself. The guide is free. Start with Lekhio and get 7 days free.',
  openGraph: {
    title: 'Register Your Business: A Free Step by Step Guide',
    description: 'Sole trader or limited company, the exact steps, forms and codes to register yourself on GOV.UK. The guide is free. Start with Lekhio and get 7 days free.',
    type: 'website',
  },
};

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function RegisterPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1b{font-size:48px;line-height:1.06;letter-spacing:-1.9px}@media(max-width:820px){.h1b{font-size:33px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: APP_THEME_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <nav style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', color: INK }}>Lekhio</Link>
        <Link href="/start" style={{ backgroundColor: RIVER, color: ON_RIVER, fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Start free</Link>
      </nav>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px 4px' }}>
        <span style={{ display: 'inline-block', backgroundColor: GREEN_TINT, color: ON_GREEN_TINT, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>FREE GUIDE · {TRIAL_DAYS} DAYS FREE ON LEKHIO</span>
        <h1 className="h1b" style={{ fontWeight: 700, margin: '0 0 16px' }}>Set up your business, start to finish.</h1>
        <p style={{ fontSize: 18.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
          Tell us what you are setting up. We give you the exact steps, the forms and the codes to register yourself on GOV.UK, plus where to sort a bank, an email and insurance, in plain English. The guide is free. Start with Lekhio and your first {TRIAL_DAYS} days are free, then £12.99 a month or £129 a year.
        </p>
      </section>

      <section style={{ maxWidth: 760, margin: '0 auto', padding: '26px 24px 20px' }}>
        <Wizard />
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${LINE}`, background: PAPER }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: MUTED, maxWidth: 620, lineHeight: 1.6 }}>
            General guidance for the UK, not tax or legal advice. Costs and thresholds are for 2026 and can change. Lekhio is an independent UK company, not HMRC or Companies House. Always check your own position on GOV.UK.
          </span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Home</Link>
            <Link href="/resources" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Free tools</Link>
            <Link href="/privacy" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Privacy</Link>
            <Link href="/terms" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
