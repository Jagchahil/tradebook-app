import type { Metadata } from 'next';
import Link from 'next/link';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'Free Self Employed Tax Calculator 2026/27 | Lekhio',
  description:
    'Work out your income tax, National Insurance, take home pay and how much to set aside, in seconds. Free, no signup. See how much claiming your expenses saves you. Built for UK sole traders.',
  openGraph: {
    title: 'Free Self Employed Tax Calculator 2026/27',
    description: 'Income tax, National Insurance, take home and what to set aside. Free, no signup. See how much your expenses save you.',
    type: 'website',
  },
};

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const PAPER = '#FBFAF7';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// FAQPage structured data, so search and AI assistants can quote the answers.
// Figures must stay in step with lib/taxengine.ts (2026/27).
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much tax does a UK sole trader pay in 2026/27?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You pay income tax on profit above the £12,570 personal allowance: 20% on the first £37,700 of taxable income, 40% up to £125,140 and 45% above. You also pay Class 4 National Insurance: 6% on profits between £12,570 and £50,270 and 2% above. Class 2 is voluntary since April 2024.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much should a self employed person set aside for tax?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A common rule of thumb is 25 to 30 per cent of profit for basic rate earners, and this calculator gives you the exact figure for your numbers, including National Insurance and payments on account.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are payments on account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Once your Self Assessment bill is over £1,000, HMRC also asks for two advance payments towards next year, each half of this year’s bill, due 31 January and 31 July, on top of the balancing payment.',
      },
    },
  ],
};

export default function TaxCalculatorPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1c{font-size:48px;line-height:1.06;letter-spacing:-1.8px}@media(max-width:880px){.h1c{font-size:34px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 24px 6px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: GREEN_TINT, color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>FREE TOOL, NO SIGNUP</span>
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 16px' }}>The self employed tax calculator.</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: '0 0 8px' }}>
            See your tax, your National Insurance, your take home, and exactly how much to set aside. Then see how much claiming your expenses keeps in your pocket. No account needed.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px 10px' }}>
        <Calc />
      </section>

      {/* Tie-in to the product */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px 16px' }}>
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '28px 26px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.4px' }}>The number that matters is the expenses one.</h2>
            <p style={{ fontSize: 15.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
              Every pound of business cost you claim comes off your tax. Most people lose hundreds because they forget receipts or do not know what counts. Lekhio captures it all from a text, so the calculator above always works in your favour.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link href="/start" style={{ display: 'inline-block', textAlign: 'center', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '14px 26px', borderRadius: 12 }}>Start free trial</Link>
            <Link href="/can-i-claim" style={{ display: 'inline-block', textAlign: 'center', color: RIVER_DEEP, border: `1px solid ${LINE}`, fontSize: 15, fontWeight: 600, padding: '13px 26px', borderRadius: 12 }}>What can I claim?</Link>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '10px 24px 50px' }}>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 720 }}>
          This calculator is a free estimate to help you plan, not tax advice for your exact situation. Lekhio is an independent UK company, not HMRC. You stay responsible for your tax, and nothing is ever sent to HMRC without your approval.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>← Back to home</Link>
          <Link href="/can-i-claim" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Can I claim it?</Link>
          <Link href="/file-your-tax-return" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>File your own return</Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
