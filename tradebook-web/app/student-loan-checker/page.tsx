import type { Metadata } from 'next';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'Student Loan Repayment Checker 2026/27 | Plans 1, 2, 4, 5 and Postgrad | Lekhio',
  description:
    'Free student loan repayment checker for 2026/27. See what you repay on Plan 1, 2, 4, 5 or a postgraduate loan, and the Self Assessment lump the self employed get billed in January. No signup.',
  openGraph: {
    title: 'Student Loan Repayment Checker 2026/27',
    description: 'See your real student loan repayment for the year, including the Self Assessment bill if you work for yourself. Free, no signup.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const PAPER = 'var(--bg)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// FAQPage structured data. Thresholds stay in step with lib/nistudentloan.ts
// (2026/27: Plan 1 £26,900, Plan 2 £29,385, Plan 4 £33,795, Plan 5 £25,000,
// postgraduate £21,000; 9% rate, 6% postgraduate).
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the student loan repayment thresholds for 2026/27?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Plan 1: £26,900. Plan 2: £29,385. Plan 4: £33,795. Plan 5: £25,000. Postgraduate loan: £21,000. You repay 9% of income above your threshold, or 6% for a postgraduate loan, and a plan loan and a postgraduate loan repay at the same time.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do self employed people repay student loans?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Through Self Assessment. HMRC works out 9% of your total income above your threshold for the whole year and adds it to your January tax bill in one lump. Nothing is taken as you go, so it catches people out if they have not set money aside.',
      },
    },
    {
      '@type': 'Question',
      name: 'When is a student loan written off?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It depends on the plan: broadly 25 years for Plan 1, 30 years for Plans 2 and 4 and postgraduate loans, and 40 years for Plan 5, counted from the April you were first due to repay. Anything left is cancelled, so overpaying near the end can waste money.',
      },
    },
  ],
};

export default function StudentLoanCheckerPage() {
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
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 14px' }}>What will your student loan really cost this year?</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Pick your plan, put your income in, and see your repayment for the year. Self employed? See the January lump nobody warns you about.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>
        <Calc />
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '28px auto 0', lineHeight: 1.55 }}>
          A general estimate using the confirmed 2026/27 thresholds. It is not financial advice or a filed figure. PAYE calculates per pay period, so uneven pay can shift the in year amount. Your exact position is settled by HMRC and the Student Loans Company. Lekhio prepares your figures and you always approve them.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
