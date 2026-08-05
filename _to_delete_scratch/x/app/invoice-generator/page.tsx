import type { Metadata } from 'next';
import Link from 'next/link';
import Generator from './Generator';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  alternates: { canonical: '/invoice-generator' },
  title: 'Free Invoice & Quote Generator for Tradespeople | Lekhio',
  description:
    'Make a clean, professional invoice or quote in two minutes. Free, no signup. Load a ready made template for your trade, fill it in, and save as PDF. Built for UK sole traders.',
  openGraph: {
    title: 'Free Invoice & Quote Generator',
    description: 'Professional invoices and quotes in two minutes. Free, no signup, ready made templates by trade. Save as PDF.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const GREEN_TINT = 'var(--green-tint)';
const PAPER = 'var(--bg)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';
const ON_GREEN_TINT = 'var(--on-green-tint)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS TOOL HAD NO FAQ SCHEMA, AND IT WAS THE ONLY ONE IN THE FAMILY WITHOUT.
//
// Found on 4 August by widening a guard that had been asserting "same pattern as the other tool
// pages" about exactly one page. Every other free tool carries an FAQPage block and this one, the
// most searched thing on the list, did not. Nothing looked wrong, nothing broke, and the page was
// simply not eligible for a result it was built to win. These pages exist to be found by a
// stranger with a question, so the schema is the feature and not decoration.
//
// ⚠️ THE ANSWERS ARE THIS PAGE'S OWN, and the invoice rules are the ones the generator actually
// applies. A FAQ that says something the page does not do is a rich result that misrepresents it.
//
// ⚠️ AND NOT ONE OF THEM MENTIONS VAT ON THE INVOICE ITSELF beyond what the tool does, because a
// VAT invoice has statutory particulars this generator does not collect. Saying otherwise here
// would be advice, on a page that gives none.
// ═══════════════════════════════════════════════════════════════════════════════════════
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What has to go on an invoice if I am self employed?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Your name or trading name and address, the customer\u2019s name and address, a unique invoice number, the date, a clear description of what you did, the amount owed, and how and when to pay you. If you are VAT registered there are extra particulars HMRC requires, so check those separately.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the difference between a quote and an invoice?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A quote is a price offered before the work, and it is not a request for money. An invoice comes after, and it asks to be paid. This tool makes either one, and the only thing that changes is the wording and whether payment terms appear.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is this invoice generator really free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, and there is no signup. Everything happens in your own browser, nothing is sent anywhere, and you save the finished invoice as a PDF using your browser\u2019s own print to PDF. There is no watermark and no limit on how many you make.',
      },
    },
  ],
};

export default function InvoiceGeneratorPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1g{font-size:46px;line-height:1.07;letter-spacing:-1.7px}@media(max-width:880px){.h1g{font-size:32px}}@media print{.site-nav,.site-hero,.site-foot{display:none !important;}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <div className="site-nav"><SiteNav /></div>

      <section className="site-hero" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 24px 6px' }}>
        <div style={{ maxWidth: 760 }}>
          <span style={{ display: 'inline-block', backgroundColor: GREEN_TINT, color: ON_GREEN_TINT, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 16 }}>FREE TOOL, NO SIGNUP</span>
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
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: '24px 24px', display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Want it to chase the payment too?</h2>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>This generator is free forever. Lekhio goes further: it builds the invoice from a text, sends it, logs the income when it is paid, and keeps you ready for tax.</p>
          </div>
          <Link href="/start" style={{ display: 'inline-block', backgroundColor: RIVER, color: 'var(--on-river)', fontSize: 16, fontWeight: 600, padding: '14px 26px', borderRadius: 12 }}>Start free trial</Link>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>← Back to home</Link>
          <Link href="/tax-calculator" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Tax calculator</Link>
          <Link href="/can-i-claim" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Can I claim it?</Link>
        </div>
      </section>
      <div className="site-foot"><SiteFooter /></div>
    </main>
  );
}
