import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TRADES, tradeBySlug } from '../../../lib/trades';
import { A11Y_CSS } from '../../../lib/tokens';

export const dynamicParams = false;

export function generateStaticParams() {
  return TRADES.map((t) => ({ trade: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ trade: string }> }): Promise<Metadata> {
  const { trade } = await params;
  const t = tradeBySlug(trade);
  if (!t) return { title: 'Lekhio' };
  const title = `Bookkeeping and Tax for ${t.plural.charAt(0).toUpperCase() + t.plural.slice(1)} | Lekhio`;
  const description = `Lekhio is the WhatsApp back office for UK ${t.plural}. Snap receipts, log mileage and jobs, claim every cost, and stay MTD ready. ${t.cis ? 'CIS handled. ' : ''}30 days free, no card.`;
  return { title, description, openGraph: { title, description, type: 'website' } };
}

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const SAFFRON_DEEP = '#C9842A';
const SAFFRON_TINT = '#FBEFD8';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const PAPER = '#FBFAF7';
const SURFACE = '#F2F0EA';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';
const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const tools = [
  { href: '/tax-calculator', icon: '🧮', label: 'Tax calculator' },
  { href: '/invoice-generator', icon: '🧾', label: 'Invoice generator' },
  { href: '/can-i-claim', icon: '💡', label: 'Can I claim it?' },
  { href: '/file-your-tax-return', icon: '📋', label: 'File your own return' },
];

export default async function TradePage({ params }: { params: Promise<{ trade: string }> }) {
  const { trade } = await params;
  const t = tradeBySlug(trade);
  if (!t) notFound();

  const Title = t.plural.charAt(0).toUpperCase() + t.plural.slice(1);

  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1t{font-size:50px;line-height:1.05;letter-spacing:-2px}.claimgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.toolrow{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}@media(max-width:820px){.h1t{font-size:34px}.claimgrid{grid-template-columns:1fr}.toolrow{grid-template-columns:1fr 1fr}}` }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />

      <nav style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', color: INK }}>Lekhio</Link>
        <Link href="/start" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
      </nav>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>{t.emoji} FOR {t.plural.toUpperCase()}</span>
          <h1 className="h1t" style={{ fontWeight: 700, margin: '0 0 16px' }}>The back office for UK {t.plural}.</h1>
          <p style={{ fontSize: 18.5, color: MUTED, lineHeight: 1.6, margin: '0 0 26px' }}>{t.blurb}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <Link href="/start" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Start free trial</Link>
            <Link href="/can-i-claim" style={{ color: INK, border: `1px solid ${INK}`, fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>What can I claim?</Link>
          </div>
        </div>
      </section>

      {/* What you can claim */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 8px' }}>What {t.plural} can claim.</h2>
        <p style={{ fontSize: 16, color: MUTED, margin: '0 0 22px', maxWidth: 620 }}>The everyday costs of the job, all allowable, all logged from a text. Claim them and you pay tax only on what is left.</p>
        <div className="claimgrid">
          {t.claims.map((c) => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '15px 16px' }}>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: GREEN_TINT, color: GREEN, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
              <span style={{ fontSize: 15, color: INK }}>{c}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 14 }}>Not sure about something specific? <Link href="/can-i-claim" style={{ color: RIVER, fontWeight: 600 }}>Check it on the expense checker</Link>. General guidance, not tax advice.</p>
      </section>

      {/* CIS note for construction trades */}
      {t.cis ? (
        <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 8px' }}>
          <div style={{ background: SAFFRON_TINT, borderRadius: 18, padding: '24px 26px', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ maxWidth: 600 }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px', color: SAFFRON_DEEP }}>CIS, sorted for {t.plural}.</h3>
              <p style={{ fontSize: 15, color: '#7A5E2C', lineHeight: 1.6, margin: 0 }}>Working as a subcontractor? Text &ldquo;Dave paid £400, £80 CIS deducted&rdquo; and Lekhio logs the gross, keeps the deduction separate, and tracks it toward your refund. Most subbies are owed money back.</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Free tools */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', margin: '0 0 18px' }}>Free tools for {t.plural}.</h2>
        <div className="toolrow">
          {tools.map((tool) => (
            <Link key={tool.href} href={tool.href} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '18px 16px', textAlign: 'center', color: INK }}>
              <div style={{ fontSize: 26 }}>{tool.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>{tool.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: INK }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, color: '#fff', fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 14px' }}>{Title}, your books are handled.</h2>
          <p style={{ fontSize: 16.5, color: '#B6BDC8', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 28px' }}>Snap it, say it, or text it. Lekhio logs it, claims it, and keeps you ready for tax. You always approve before anything reaches HMRC.</p>
          <Link href="/start" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Start free trial</Link>
        </div>
      </section>

      {/* Other trades, internal links */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px 50px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 14 }}>Lekhio for every trade</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {TRADES.filter((o) => o.slug !== t.slug).map((o) => (
            <Link key={o.slug} href={`/for/${o.slug}`} style={{ fontSize: 14, fontWeight: 600, color: INK, background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 20, padding: '9px 16px' }}>{o.emoji} {o.name}</Link>
          ))}
        </div>
        <div style={{ marginTop: 22, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>← Back to home</Link>
          <Link href="/resources" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>All free tools</Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${LINE}`, background: PAPER }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: MUTED }}>© {new Date().getFullYear()} Lekhio, a Satluj Ventures company. Not HMRC.</span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Link href="/start" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Sign up</Link>
            <Link href="/privacy" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Privacy</Link>
            <Link href="/terms" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Terms</Link>
            <a href="mailto:support@lekhio.com" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Support</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
