import type { Metadata } from 'next';
import Link from 'next/link';
import Calc from './Calc';

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

export default function TaxCalculatorPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1c{font-size:48px;line-height:1.06;letter-spacing:-1.8px}@media(max-width:880px){.h1c{font-size:34px}}` }} />

      <nav style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', color: INK }}>Lekhio</Link>
        <Link href="/start" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
      </nav>

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
    </main>
  );
}
