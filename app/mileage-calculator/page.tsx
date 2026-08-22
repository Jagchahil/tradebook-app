import type { Metadata } from 'next';
import Calc from './Calc';
import { A11Y_CSS } from '../../lib/tokens';
import { FACTS } from '../../lib/taxengine';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

// 🔴 EVEN THE PAGE TITLE READS THE RATE OUT OF FACTS.
// "55p a Mile" typed into a <title> is a second copy of the tax law, and it is the copy Google
// caches and an assistant quotes. This is not hypothetical here: lib/newsletter.ts was caught on
// 6 August 2026 still saying 45p, FOUR MONTHS after HMRC moved the rate, because it had the number
// in prose rather than reading it. Khoji watches lib/taxengine.ts and nothing else, so a rate typed
// into a component is a rate standing outside the watch. See test/onlyoneengine.test.mjs.
const p = (rate: number) => `${Math.round(rate * 100)}p`;
const band = FACTS.mileageFirstBandMiles.toLocaleString('en-GB');

export const metadata: Metadata = {
  alternates: { canonical: '/mileage-calculator' },
  title: `Mileage Claim Calculator 2026/27 | ${p(FACTS.mileageCarFirst10k)} a Mile | Lekhio`,
  description:
    'Free HMRC mileage calculator for UK sole traders. Work out what your business miles are worth at the 2026/27 rates, and whether mileage beats buying the vehicle through the business. No signup.',
  openGraph: {
    title: 'Mileage Claim Calculator 2026/27',
    description: 'What are your business miles worth? Free, no signup, 2026/27 rates.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const PAPER = 'var(--bg)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much can I claim per mile in 2026/27?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: `For a car or a van, ${p(FACTS.mileageCarFirst10k)} a mile for the first ${band} business miles in the tax year, then ${p(FACTS.mileageCarOver10k)} a mile after that. Motorcycles are ${p(FACTS.mileageMotorcycle)} a mile with no band, and a bicycle is ${p(FACTS.mileageBicycle)}. HMRC raised the car rate from 45p with effect from 6 April 2026.`,
      },
    },
    {
      '@type': 'Question',
      name: 'Can I claim mileage and my fuel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No, and this is the commonest mistake. The mileage rate is a simplified expense that already covers the fuel, the insurance, the servicing, the tax and the tyres. Claim mileage and then claim the fuel as well and you have claimed the fuel twice.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is mileage better than buying the vehicle through the business?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It depends on the vehicle and on how far you drive. For an ordinary petrol or diesel car on high business miles, mileage is usually worth more, because the car is written down at a small percentage each year while mileage pays the same every year. A van, or a brand new electric car, gets its whole cost off your profit in year one, which mileage cannot match. You have to pick one for a given vehicle and you cannot swap later.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need a mileage log?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. HMRC expects a record of the business journeys behind the claim: the date, where you went, why, and the miles. A total with nothing behind it is the first thing an enquiry asks about.',
      },
    },
  ],
};

export default function MileageCalculatorPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1m{font-size:46px;line-height:1.07;letter-spacing:-1.7px}@media(max-width:820px){.h1m{font-size:32px}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>FREE, NO SIGNUP · 2026/27</span>
          <h1 className="h1m" style={{ fontWeight: 700, margin: '0 0 14px' }}>What are your miles worth?</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Every business mile you drive comes off your profit at {p(FACTS.mileageCarFirst10k)} a mile. Most self employed people either forget to claim it or guess low. Put your miles in and see the figure.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px' }}>
        <Calc />
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '28px auto 0', lineHeight: 1.55 }}>
          This is a general estimate using 2026/27 rates for a sole trader. It is not tax advice and it is not a filed figure. What you can actually claim depends on your own records and circumstances, which HMRC settles when you file. Lekhio prepares your figures and you always approve them.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
