import type { Metadata } from 'next';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'Landlord Tax Calculator 2026/27 and the April 2027 Rise | Lekhio',
  description:
    'Free landlord tax calculator. See the tax on your rental income for 2026/27 AND what the new 22%, 42% and 47% property rates from April 2027 will cost you. Section 24 relief included. Works for landlords with a job, self employed landlords and full time landlords. No signup.',
  openGraph: {
    title: 'Landlord Tax Calculator: your bill now vs April 2027',
    description: 'The new property income tax rates arrive April 2027. See what they cost you, a year early. Free, no signup.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const PAPER = 'var(--bg)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// FAQPage structured data. Figures stay in step with lib/propertyengine.ts,
// which encodes the HMRC technical note of 26 November 2025.
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How is rental income taxed in 2026/27?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Rental profit (rents less allowable expenses, or less the £1,000 property allowance if that is better) is added to your other income and taxed at 20%, 40% or 45%. Mortgage interest on residential lets is not an expense: you get a 20% tax credit on it instead, known as Section 24. Rental income carries no National Insurance.',
      },
    },
    {
      '@type': 'Question',
      name: 'What changes for landlords in April 2027?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'From 6 April 2027 property income gets its own tax rates in England, Wales and Northern Ireland: 22% property basic rate, 42% property higher rate and 47% property additional rate, two points above the normal rates. The Section 24 mortgage interest credit moves to 22%. The personal allowance must also be set against earned income first. Announced at Budget 2025, HMRC expects around 2.4 million landlords to pay more.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do landlords pay National Insurance on rent?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Rental income carries no National Insurance, which is the reason the government gave for the two point property rate rise from April 2027: to narrow the gap between tax on work and tax on income from assets.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the £1,000 property allowance?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You can deduct a flat £1,000 from rental income instead of actual expenses, whichever is better for you. If your total rents are under £1,000 there is usually nothing to tax and nothing to report. You cannot use both the allowance and actual expenses in the same year.',
      },
    },
  ],
};

export default function LandlordTaxCalculatorPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1c{font-size:46px;line-height:1.07;letter-spacing:-1.7px}@media(max-width:820px){.h1c{font-size:32px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>FREE, NO SIGNUP · INCLUDES THE APRIL 2027 RISE</span>
          <h1 className="h1c" style={{ fontWeight: 700, margin: '0 0 14px' }}>What does your rental really cost you in tax?</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Whether you have a day job, work for yourself, or property is your income. Your bill under this year&apos;s rules, and what the new 22/42/47 property rates from April 2027 will add, a year before they bite.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>
        <Calc />
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '28px auto 0', lineHeight: 1.55 }}>
          A general estimate using 2026/27 rules and the announced 2027/28 property rates for England, Wales and Northern Ireland (residential lets, individual landlords). It is not tax advice or a filed figure. Your exact position depends on your full circumstances, which HMRC settles when you file. Lekhio prepares your figures and you always approve them.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
