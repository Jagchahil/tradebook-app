import type { Metadata } from 'next';
import Link from 'next/link';
import { TRADES } from '../../lib/trades';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter, Ic } from '../_shared/site';

export const metadata: Metadata = {
  title: 'Free Tools & Guides for the UK Self Employed | Lekhio',
  description:
    'Free tax tools and plain English guides for UK sole traders and tradespeople. A tax calculator, an invoice and quote generator, an expense checker, a file your own return guide, and the key tax dates. No signup.',
  openGraph: {
    title: 'Free Tools & Guides for the UK Self Employed',
    description: 'Tax calculator, invoice generator, expense checker, return guide, key dates. All free, no signup.',
    type: 'website',
  },
};

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const SAFFRON_DEEP = 'var(--saffron-deep)';
const SAFFRON_TINT = 'var(--saffron-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const PAPER = 'var(--bg)';
const SURFACE = 'var(--surface)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const tools = [
  { href: '/tax-calculator', icon: '🧮', title: 'Tax calculator', body: 'Your tax, National Insurance, take home and what to set aside. See how much your expenses save you.', tint: GREEN_TINT, fg: GREEN, tag: 'Calculator' },
  { href: '/cis-calculator', icon: '🧱', title: 'CIS tax refund estimator', body: 'Subcontractor? CIS is taken off your pay before you see it, and most subbies are owed money back. See your likely refund in seconds.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP, tag: 'Calculator' },
  { href: '/invoice-generator', icon: '🧾', title: 'Invoice & quote generator', body: 'A clean, professional invoice or quote in two minutes. Ready made templates by trade. Save as PDF.', tint: RIVER_TINT, fg: RIVER, tag: 'Generator' },
  { href: '/can-i-claim', icon: '💡', title: 'Can I claim it?', body: 'The real rules on what you can and cannot claim, the grey areas included. All within the law.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP, tag: 'Checker' },
  { href: '/ni-checker', icon: '🛡️', title: 'National Insurance checker', body: 'Class 1, 2 and 4 explained with your numbers, and whether your State Pension year is safe. The £190 decision nobody tells you about.', tint: GREEN_TINT, fg: GREEN, tag: 'Checker' },
  { href: '/student-loan-checker', icon: '🎓', title: 'Student loan checker', body: 'Every plan, the real thresholds, and the January lump the self employed never see coming. Know it before it lands.', tint: RIVER_TINT, fg: RIVER, tag: 'Checker' },
  { href: '/landlord-tax-calculator', icon: '🏠', title: 'Landlord tax calculator', body: 'Rent out property? Your bill under the current rules and under the new 22/42/47 property rates from April 2027, a year before they bite. Section 24 included.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP, tag: 'Calculator' },
  { href: '/rent-a-room-checker', icon: '🛏️', title: 'Rent a Room checker', body: 'A lodger in your own home can earn you £7,500 tax free. Over the limit there is an election most people never make. Check yours in seconds.', tint: GREEN_TINT, fg: GREEN, tag: 'Checker' },
  { href: '/sole-trader-vs-limited', icon: '⚖️', title: 'Sole trader vs limited', body: 'The honest 2026/27 comparison: corporation tax, the new dividend rates, employer NI, and the costs the folklore forgets. Your number decides.', tint: RIVER_TINT, fg: RIVER, tag: 'Calculator' },
  { href: '/file-your-tax-return', icon: '📋', title: 'File your own return', body: 'A step by step walkthrough by trade, so you can do your Self Assessment yourself and stop paying for a short job.', tint: RIVER_TINT, fg: RIVER, tag: 'Guide' },
  { href: '/free-mtd-filing', icon: '🆓', title: 'Free MTD filing', body: 'For a straightforward return, profits, losses and the essentials, we will prepare and file it free, forever. Join the list.', tint: GREEN_TINT, fg: GREEN, tag: 'Coming soon' },
  { href: '/register-your-business', icon: '🏁', title: 'Register your business', body: 'Sole trader, limited, VAT, PAYE and CIS, explained simply with the real 2026 costs and deadlines.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP, tag: 'Guide' },
];

const dates = [
  { date: '6 April 2026', label: 'New tax year begins. Making Tax Digital for Income Tax starts for anyone over £50,000.' },
  { date: '7 August 2026', label: 'First MTD quarterly update due, covering April to July.' },
  { date: '5 October 2026', label: 'Register for Self Assessment if you became self employed in the 2025/26 year.' },
  { date: '7 November 2026', label: 'Second MTD quarterly update due, covering August to October.' },
  { date: '31 January 2027', label: 'Self Assessment for 2025/26 due. Balancing payment and first payment on account due.' },
  { date: '7 February 2027', label: 'Third MTD quarterly update due, covering November to January.' },
  { date: '5 April 2027', label: 'The 2026/27 tax year ends.' },
  { date: '7 May 2027', label: 'Fourth MTD quarterly update due, covering February to April.' },
  { date: '31 July 2027', label: 'Second payment on account due.' },
];

export default function ResourcesPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1r{font-size:50px;line-height:1.06;letter-spacing:-1.9px}.toolgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.card{transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}.card:hover{transform:translateY(-4px);box-shadow:0 18px 42px rgba(17,17,17,.09);border-color:${RIVER_TINT}}@media(max-width:820px){.h1r{font-size:34px}.toolgrid{grid-template-columns:1fr}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 10px' }}>
        <div style={{ maxWidth: 700 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>FREE, NO SIGNUP</span>
          <h1 className="h1r" style={{ fontWeight: 700, margin: '0 0 16px' }}>Free tools for the self employed.</h1>
          <p style={{ fontSize: 18.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Everything a UK sole trader needs to stay on top of the money and the tax, free to use, no account, no card. Built by the team behind Lekhio, the back office that lives in WhatsApp.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 24px' }}>
        <div className="toolgrid">
          {tools.map((t) => (
            <Link key={t.href} href={t.href} className="card" style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column', gap: 12, color: INK }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ width: 50, height: 50, borderRadius: 13, background: t.tint, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}><Ic e={t.icon} color={t.fg} size={26} /></div>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.4px', color: MUTED, background: SURFACE, padding: '4px 10px', borderRadius: 12 }}>{t.tag}</span>
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 800, margin: '4px 0 0', letterSpacing: '-0.3px' }}>{t.title}</h2>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0, flex: 1 }}>{t.body}</p>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: RIVER }}>Open {t.title.toLowerCase()} &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      {/* By trade */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '6px 24px 26px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>Guides by trade</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {TRADES.map((t) => (
            <Link key={t.slug} href={`/for/${t.slug}`} style={{ fontSize: 14, fontWeight: 600, color: INK, background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 20, padding: '9px 16px' }}><Ic e={t.emoji} color="var(--tx-mut)" size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />{t.name}</Link>
          ))}
        </div>
      </section>

      {/* Key tax dates */}
      <section style={{ background: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '46px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <span style={{ display: 'inline-block', backgroundColor: 'var(--panel)', border: `1px solid ${LINE}`, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 14 }}>KEY DATES</span>
            <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 10px' }}>The tax dates that matter, 2026 to 2027.</h2>
            <p style={{ fontSize: 16, color: MUTED, maxWidth: 540, margin: '0 auto' }}>Miss one and HMRC charges a penalty. Lekhio reminds you well before each, so you never do.</p>
          </div>
          <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
            {dates.map((d, i) => (
              <div key={d.date} style={{ display: 'flex', gap: 16, padding: '16px 20px', borderTop: i ? `1px solid ${LINE}` : 'none', alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, width: 130, fontSize: 14, fontWeight: 800, color: RIVER_DEEP }}>{d.date}</div>
                <div style={{ fontSize: 14.5, color: INK, lineHeight: 1.55 }}>{d.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 16 }}>A general guide, not tax advice. MTD quarterly dates apply if you are within Making Tax Digital. Always check your own deadlines with HMRC.</p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'var(--band)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '50px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 30, color: '#fff', fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 14px' }}>Free tools are the start. Lekhio does the rest.</h2>
          <p style={{ fontSize: 16.5, color: '#B6BDC8', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 28px' }}>
            One chat that logs your receipts, claims your reliefs, sends your invoices, and keeps you ready for tax. You always approve before anything reaches HMRC.
          </p>
          <Link href="/start" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Start free trial</Link>
          <div style={{ marginTop: 20 }}>
            <Link href="/" style={{ color: '#CFE0F2', fontSize: 14, fontWeight: 500 }}>← Back to home</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
