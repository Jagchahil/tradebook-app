import type { Metadata } from 'next';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'Rent a Room Checker: the £7,500 Lodger Allowance | Lekhio',
  description:
    'Free Rent a Room checker. Taking in a lodger? See whether your rent is tax free under the £7,500 Rent a Room scheme, and whether opting in beats deducting your actual expenses. No signup.',
  openGraph: {
    title: 'Rent a Room Checker: is your lodger income tax free?',
    description: 'Up to £7,500 a year from a lodger can be tax free. Check your numbers in seconds. Free, no signup.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const PAPER = 'var(--bg)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// FAQPage structured data. Figures stay in step with lib/propertyengine.ts
// (Rent a Room limit £7,500, unchanged at Budget 2025).
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much can I earn from a lodger tax free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Up to £7,500 a year under the Rent a Room scheme, for furnished accommodation in your own home. The limit halves to £3,750 each if someone else also receives the rent. Under the limit there is usually nothing to pay and nothing to report.',
      },
    },
    {
      '@type': 'Question',
      name: 'What if my lodger pays more than £7,500 a year?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You choose: opt into Rent a Room and pay tax only on the amount above £7,500, or use the normal method and pay tax on rent less your actual expenses. Whichever gives the smaller taxable amount is allowed, and you can choose each year.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Rent a Room apply to a buy to let?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Rent a Room is only for letting furnished space in the home you live in. A separate property you rent out is normal rental income, with its own rules including the April 2027 property rate change.',
      },
    },
  ],
};

export default function RentARoomCheckerPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1c{font-size:46px;line-height:1.07;letter-spacing:-1.7px}@media(max-width:820px){.h1c{font-size:32px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>FREE, NO SIGNUP · THE £7,500 RULE</span>
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 14px' }}>Is your lodger&apos;s rent tax free?</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            The Rent a Room scheme makes up to £7,500 a year from a lodger in your own home tax free. Over the limit, there is a choice to make, and most people make it wrong. Check yours in seconds.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>
        <Calc />
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '28px auto 0', lineHeight: 1.55 }}>
          A general estimate. Rent a Room applies to furnished lettings in the home you live in; the £7,500 halves if the rent is shared with someone else. It is not tax advice. Lekhio prepares your figures and you always approve them.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
