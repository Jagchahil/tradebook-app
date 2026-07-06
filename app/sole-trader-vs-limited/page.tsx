import type { Metadata } from 'next';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'Sole Trader vs Limited Company Calculator 2026/27 | Lekhio',
  description:
    'Free sole trader vs limited company calculator for 2026/27. Real corporation tax with marginal relief, the new dividend rates, employer NI and the director salary points. See which leaves you more, and by how much. No signup.',
  openGraph: {
    title: 'Sole trader or limited company: which leaves you more?',
    description: 'The real 2026/27 comparison: corporation tax, the new dividend rates, employer NI. Free, no signup.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const PAPER = 'var(--bg)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// FAQPage structured data. Figures stay in step with lib/ltdengine.ts, which
// the ltd-parity test locks to the app engine.
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is it worth going limited in 2026/27?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It depends on profit and on whether you take everything out. Dividend rates rose two points from April 2026 (10.75% basic, 35.75% higher), which narrowed the gap. The advantage grows when profit is left in the company, and shrinks once you add accountancy costs of roughly £600 to £1,500 a year. Run your own number: for many trades under about £30,000 to £40,000 of profit the difference no longer covers the extra cost and admin.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is a limited company taxed compared to a sole trader?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A sole trader pays income tax plus Class 4 National Insurance on all profit. A company pays corporation tax (19% up to £50,000, marginal relief to 25% at £250,000), then the director typically takes a small salary plus dividends, which are taxed at the dividend rates. Employer National Insurance applies to salary above £5,000 for a sole director.',
      },
    },
    {
      '@type': 'Question',
      name: 'Why do landlords consider a limited company?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Companies deduct mortgage interest in full, while individual landlords only get a basic rate credit under Section 24. From April 2027 individuals also pay the new higher property income rates (22%, 42%, 47%), which companies do not. Incorporation has costs and capital gains and stamp duty considerations, so it needs proper advice, but the comparison is sharper than ever.',
      },
    },
  ],
};

export default function SoleTraderVsLimitedPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1c{font-size:46px;line-height:1.07;letter-spacing:-1.7px}@media(max-width:820px){.h1c{font-size:32px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>FREE, NO SIGNUP · 2026/27 RATES</span>
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 14px' }}>Sole trader or limited company?</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            The honest comparison on this year&apos;s real rates: corporation tax with marginal relief, the new dividend rates, employer NI, and the director salary points accountants actually use. Your number decides, not the folklore.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>
        <Calc />
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '28px auto 0', lineHeight: 1.55 }}>
          A general comparison assuming a single director taking all profit as a small salary plus dividends, 2026/27 rates. It is not advice: pensions, student loans, CIS, IR35, and money left in the company all change the answer, and incorporation has real costs. Lekhio prepares your figures and you always approve them.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
