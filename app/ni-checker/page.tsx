import type { Metadata } from 'next';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'National Insurance Checker 2026/27 | Class 1, 2 and 4 | Lekhio',
  description:
    'Free National Insurance checker for the self employed and anyone with a side business. See your Class 1, Class 2 and Class 4 NI for 2026/27, and whether your State Pension year is safe. No signup.',
  openGraph: {
    title: 'National Insurance Checker 2026/27',
    description: 'See exactly what NI you pay and whether your State Pension year is covered. Free, no signup.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const PAPER = 'var(--bg)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// FAQPage structured data. Figures stay in step with lib/nistudentloan.ts and
// lib/taxengine.ts (Class 1 8% and 2%, Class 4 6% and 2%, Class 2 £3.65 a week
// voluntary, small profits threshold £7,105).
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What National Insurance do self employed people pay in 2026/27?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Class 4 contributions: 6% on profits between £12,570 and £50,270, then 2% on profits above that. Class 2 has been voluntary since April 2024, at £3.65 a week for those who choose to pay it.',
      },
    },
    {
      '@type': 'Question',
      name: 'Should I pay voluntary Class 2 National Insurance?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'If your profits are £7,105 or more you are treated as covered without paying. Below that, and with no job covering you, paying voluntary Class 2 at about £190 a year is usually the cheapest way to protect your State Pension record.',
      },
    },
    {
      '@type': 'Question',
      name: 'I have a job and a side business. Do I pay National Insurance twice?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You can pay Class 1 through your payroll and Class 4 on your self employed profits in the same year. There is an annual maximum, and HMRC can refund any excess, which matters mainly for higher earners with both.',
      },
    },
  ],
};

export default function NiCheckerPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1c{font-size:46px;line-height:1.07;letter-spacing:-1.7px}@media(max-width:820px){.h1c{font-size:32px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>FREE, NO SIGNUP · 2026/27</span>
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 14px' }}>What National Insurance do you actually pay?</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Employed, self employed, or both. Put your numbers in and see your Class 1, Class 2 and Class 4 for the year, and whether your State Pension record is safe.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>
        <Calc />
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '28px auto 0', lineHeight: 1.55 }}>
          A general estimate using 2026/27 rates for England, Wales and Northern Ireland. It is not tax advice or a filed figure. Your exact position depends on your full record, which HMRC settles when you file. Lekhio prepares your figures and you always approve them.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
