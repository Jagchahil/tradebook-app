import type { Metadata } from 'next';
import Link from 'next/link';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter } from '../_shared/site';

export const metadata: Metadata = {
  title: 'Lekhio for Landlords | Rent, Section 24 and April 2027, Sorted on WhatsApp',
  description:
    'Bookkeeping and tax prep for UK landlords, on WhatsApp. Text the rent as it lands, see Section 24 properly, and know what the April 2027 property rates cost you a year early. For landlords with a day job, self employed landlords, and full time landlords.',
  openGraph: {
    title: 'Lekhio for landlords: text the rent, tax sorted',
    description: 'Rent capture on WhatsApp, Section 24 made visible, and April 2027 priced on your numbers a year early.',
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
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const personas = [
  {
    icon: '🧰',
    title: 'A trade plus a rental',
    body: 'You are a sparky, a plumber, a builder, and a flat on the side pays for itself. Lekhio keeps the trade money and the rent in separate streams automatically, and warns you about the trap almost everyone misses: Making Tax Digital counts trade plus rent TOGETHER against the £50,000 line.',
  },
  {
    icon: '💼',
    title: 'A day job plus property',
    body: 'PAYE Monday to Friday, rent on the first of the month. Your salary decides the rate your rent is taxed at, and Section 24 means your mortgage interest earns a capped credit, not full relief. Lekhio shows the real arithmetic on your numbers, not the folklore.',
  },
  {
    icon: '🏠',
    title: 'Property is the income',
    body: 'A portfolio, joint ownerships, the January bill. Per property figures, your ownership share handled, the allowance election made automatically, and the incorporation comparison ready when you want it. No National Insurance on rent, and Lekhio never forgets that either.',
  },
];

const rows = [
  ['Text "rent 950 in from flat 2"', 'Logged to the right property, the right stream, ready for tax. Photos of repair receipts work the same way.'],
  ['Section 24, made visible', 'Your mortgage interest earns a 20% credit while rent can be taxed at 40%. Lekhio shows the gap in pounds on your actual interest, and what companies do differently.'],
  ['April 2027, a year early', 'Property income gets its own rates (22%, 42%, 47%) from 6 April 2027. Rakha prices the change on your numbers now, so rent reviews and planning happen with the real figure.'],
  ['The combined MTD test', 'Trade plus rent crosses the Making Tax Digital line together. Lekhio watches the combination, which is exactly the bit people find out about too late.'],
  ['The allowance election', 'The £1,000 property allowance or actual expenses, whichever is better, computed automatically every year with the reason in plain English.'],
  ['One set aside number', 'Job, trade, rent: one honest figure for what to put aside, so January is boring. That is the whole point.'],
];

export default function ForLandlordsPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden', minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1l{font-size:50px;line-height:1.06;letter-spacing:-1.9px}.pgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px}.rgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:820px){.h1l{font-size:34px}.pgrid,.rgrid{grid-template-columns:1fr}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <SharedHead />
      <SiteNav />

      {/* Hero */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 24px 12px' }}>
        <div style={{ maxWidth: 760 }}>
          <span style={{ display: 'inline-block', backgroundColor: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>FOR LANDLORDS · READY FOR APRIL 2027</span>
          <h1 className="h1l" style={{ fontWeight: 700, margin: '0 0 16px' }}>The rent comes in. The tax sorts itself.</h1>
          <p style={{ fontSize: 18.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Text the rent as it lands and Lekhio keeps your property money in its own stream: Section 24 shown honestly, the £1,000 allowance elected automatically, Making Tax Digital handled, and the new April 2027 property rates priced on your numbers a full year before they bite.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 22, flexWrap: 'wrap' }}>
            <Link href="/start" style={{ background: RIVER, color: '#fff', fontSize: 15.5, fontWeight: 700, padding: '13px 24px', borderRadius: 12 }}>Get started →</Link>
            <Link href="/landlord-tax-calculator" style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, color: INK, fontSize: 15.5, fontWeight: 700, padding: '13px 24px', borderRadius: 12 }}>Try the free calculator</Link>
          </div>
        </div>
      </section>

      {/* The three landlords */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '30px 24px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', margin: '0 0 6px' }}>Whichever landlord you are.</h2>
        <p style={{ fontSize: 15.5, color: MUTED, margin: '0 0 20px' }}>No landlord mode, no separate app. Your job, your trade and your rent are streams of one picture, taxed the way HMRC actually taxes them.</p>
        <div className="pgrid">
          {personas.map((p) => (
            <div key={p.title} style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 18, padding: 22 }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>{p.icon}</div>
              <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 8px' }}>{p.title}</h3>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* April 2027 urgency */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '10px 24px 30px' }}>
        <div style={{ background: SAFFRON_TINT, border: '1px solid #F1DBAE', borderRadius: 18, padding: '24px 26px' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px', margin: '0 0 8px', color: INK }}>April 2027 is the biggest landlord tax change since Section 24. Most will find out in 2028.</h2>
          <p style={{ fontSize: 15, color: INK, lineHeight: 1.65, margin: 0 }}>
            Budget 2025 gave property income its own tax rates from 6 April 2027: 22% basic, 42% higher, 47% additional, two points above the normal rates, with the mortgage interest credit moving to 22% and the personal allowance rules changing underneath. HMRC expects around 2.4 million landlords to pay more. Lekhio users see the exact cost on their own numbers today, and Rakha, the watching agent, keeps repricing it as the year moves.
          </p>
          <Link href="/landlord-tax-calculator" style={{ display: 'inline-block', marginTop: 14, color: SAFFRON_DEEP, fontSize: 15, fontWeight: 800 }}>Price it on your numbers now →</Link>
        </div>
      </section>

      {/* What it does */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '10px 24px 40px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.6px', margin: '0 0 20px' }}>What Lekhio does for a landlord.</h2>
        <div className="rgrid">
          {rows.map(([title, body]) => (
            <div key={title} style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>{title}</h3>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Free tools cross links */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 50px' }}>
        <div style={{ background: RIVER_TINT, border: '1px solid #D4E4F4', borderRadius: 18, padding: '22px 24px' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: RIVER_DEEP, margin: '0 0 10px' }}>Start with the free tools, no signup</h2>
          <p style={{ fontSize: 14.5, color: INK, lineHeight: 1.7, margin: 0 }}>
            The <Link href="/landlord-tax-calculator" style={{ color: RIVER, fontWeight: 700 }}>landlord tax calculator</Link> shows your bill now and after April 2027. The <Link href="/rent-a-room-checker" style={{ color: RIVER, fontWeight: 700 }}>Rent a Room checker</Link> handles the £7,500 lodger rule. And if you have wondered about a company, the <Link href="/sole-trader-vs-limited" style={{ color: RIVER, fontWeight: 700 }}>sole trader vs limited comparison</Link> runs the real 2026/27 numbers, remembering that companies still deduct mortgage interest in full.
          </p>
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 680, margin: '24px auto 0', lineHeight: 1.55 }}>
          Lekhio prepares your figures and you approve them, always. Information, not regulated advice: incorporation, Form 17 elections and complex structures need a qualified professional, and Lekhio says so rather than pretending.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
