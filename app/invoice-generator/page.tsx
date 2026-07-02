import type { Metadata } from 'next';
import Link from 'next/link';
import Generator from './Generator';
import { A11Y_CSS } from '../../lib/tokens';

export const metadata: Metadata = {
  title: 'Free Invoice & Quote Generator for Tradespeople | Lekhio',
  description:
    'Make a clean, professional invoice or quote in two minutes. Free, no signup. Load a ready made template for your trade, fill it in, and save as PDF. Built for UK sole traders.',
  openGraph: {
    title: 'Free Invoice & Quote Generator',
    description: 'Professional invoices and quotes in two minutes. Free, no signup, ready made templates by trade. Save as PDF.',
    type: 'website',
  },
};

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const PAPER = '#FBFAF7';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export default function InvoiceGeneratorPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1g{font-size:46px;line-height:1.07;letter-spacing:-1.7px}@media(max-width:880px){.h1g{font-size:32px}}@media print{.site-nav,.site-hero,.site-foot{display:none !important;}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <nav className="site-nav" style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', color: INK }}>Lekhio</Link>
        <Link href="/start" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
      </nav>

      <section className="site-hero" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 24px 6px' }}>
        <div style={{ maxWidth: 760 }}>
          <span style={{ display: 'inline-block', backgroundColor: GREEN_TINT, color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>FREE TOOL, NO SIGNUP</span>
          <h1 className="h1g" style={{ fontWeight: 700, margin: '0 0 14px' }}>Free invoice and quote generator.</h1>
          <p style={{ fontSize: 18, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Pick your trade, tweak the lines, and save a clean PDF. Looks like it came from a proper business, takes two minutes, and never asks for a card. With Lekhio, you can do the same thing from a text.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 24px 30px' }}>
        <Generator />
      </section>

      <section className="site-foot" style={{ maxWidth: 1180, margin: '0 auto', padding: '10px 24px 50px' }}>
        <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '24px 24px', display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Want it to chase the payment too?</h2>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>This generator is free forever. Lekhio goes further: it builds the invoice from a text, sends it, logs the income when it is paid, and keeps you ready for tax.</p>
          </div>
          <Link href="/start" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '14px 26px', borderRadius: 12 }}>Start free trial</Link>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>← Back to home</Link>
          <Link href="/tax-calculator" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Tax calculator</Link>
          <Link href="/can-i-claim" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Can I claim it?</Link>
        </div>
      </section>
    </main>
  );
}
