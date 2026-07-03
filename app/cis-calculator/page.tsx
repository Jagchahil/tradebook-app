import type { Metadata } from 'next';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'CIS Tax Refund Calculator 2026/27 | Are You Owed Money? | Lekhio',
  description:
    'Free CIS tax refund estimator for UK construction subcontractors. See if HMRC owes you a refund on the CIS deducted from your pay, using 2026/27 rates. No signup.',
  openGraph: {
    title: 'CIS Tax Refund Calculator 2026/27',
    description: 'Subcontractor? See your likely CIS refund in seconds. Free, no signup.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const PAPER = 'var(--bg)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// FAQPage structured data for search and AI assistants. Figures stay in step
// with lib/taxengine.ts (CIS 20% registered, 30% unregistered, 0% gross).
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much CIS tax is deducted from subcontractors?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Contractors deduct 20% from registered subcontractors and 30% from unregistered ones, on the labour element only, never on materials. Subcontractors with gross payment status have nothing deducted.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I get CIS tax back?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Often, yes. CIS deductions are tax you have already paid. When your Self Assessment is worked out, the deductions come off your bill, and many subcontractors are due a refund because 20% was taken off their labour before expenses and the personal allowance were counted.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is CIS deducted on materials?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. CIS is deducted on the labour element only. If your invoice splits labour and materials, the contractor should deduct nothing on the materials part.',
      },
    },
  ],
};

export default function CisCalculatorPage() {
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
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 14px' }}>Are you owed a CIS refund?</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            On CIS, your contractor takes tax off your pay before you ever see it. Most subcontractors are owed some of it back. Put your numbers in and see your likely refund.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>
        <Calc />
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '28px auto 0', lineHeight: 1.55 }}>
          This is a general estimate using 2026/27 rates and assumes your subcontracting is your only income with standard 20% CIS. It is not tax advice or a filed figure. Your real refund depends on your full circumstances, which HMRC settles when you file. Lekhio prepares your figures and you always approve them.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
