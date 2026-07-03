import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, PAPER, FONT, MARKETING_CSS,
  features, claimExamples, oldAccountant, lekhioWay, fixes, comingSoon,
  SharedHead, SiteNav, SiteFooter, StickyCta, AppDash, AppTax, AppInv,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'What Lekhio does. Your whole back office, in a text.',
  description:
    'Receipt capture, voice notes, mileage, invoices, CIS, and quarterly tax prep, all from WhatsApp. See everything Lekhio does, and how it replaces the shoebox and the accountant bill. You approve before anything reaches HMRC.',
};

export default function ProductPage() {
  return (
    <main className="mkt" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />

      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for the self employed. <span className="go">See if it affects you →</span></Link></div>
      <SiteNav />

      {/* Hero */}
      <section className="hero">
        <div className="wrap grid">
          <div>
            <span className="pill"><span className="dot" /> The whole back office</span>
            <h1>What Lekhio<br />does. All from<br /><span className="gt">a text.<svg className="squig" viewBox="0 0 220 16" preserveAspectRatio="none"><path d="M4 11 C 45 3, 90 3, 120 9 S 190 15, 216 6" /></svg></span></h1>
            <p className="sub">Snap a receipt, say an expense, or type what you got paid. Lekhio reads it, sorts it, logs it, writes your invoices, and gets your quarterly tax ready. You just approve.</p>
            <div className="cta-row">
              <Link href="/start" className="btn primary">Start free</Link>
              <Link href="/pricing" className="btn ghost">See pricing</Link>
            </div>
          </div>
          <div className="apptour">
            <div className="appphone">
              <div className="status"><i /></div>
              <div className="appview"><div className="apptrack"><AppDash /><AppTax /><AppInv /></div></div>
            </div>
          </div>
        </div>
      </section>

      {/* Full feature grid */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 44 }}>
            <h2 className="h2">Everything, in one place.</h2>
            <p className="lead">Nine jobs your accountant nags you for, done as you work.</p>
          </div>
          <div className="fgrid reveal">
            {features.map((f) => (
              <div className="fcard" key={f.title}>
                <div className="fi" style={{ background: f.fg }}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Say it, it is claimed */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}>
            <div className="eyebrow">Nobody else does this</div>
            <h2 className="h2">Say it. It is claimed.</h2>
            <p className="lead">Text the thing. Lekhio works out the relief and logs it at the HMRC rate. No forms, no logbooks, no missed claims.</p>
          </div>
          <div className="claims reveal">
            {claimExamples.map((c) => (
              <div className="claim" key={c.text}>
                <span className="q">&quot;{c.text}&quot;</span>
                <div className="arr">↓</div>
                <div className="r">{c.result}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beat the accountant */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}>
            <div className="eyebrow">The expert in your pocket</div>
            <h2 className="h2">The brains of an accountant. None of the bill.</h2>
            <p className="lead">An accountant trains for years and charges you hundreds to see you once. Lekhio puts that knowledge in your chat, every day.</p>
          </div>
          <div className="ba reveal">
            <div className="old">
              <h3>A traditional accountant 😩</h3>
              <ul>{oldAccountant.map((l) => (<li key={l}><span className="m">✕</span> {l}</li>))}</ul>
            </div>
            <div className="new">
              <h3>The Lekhio way 😌</h3>
              <ul>{lekhioWay.map((l) => (<li key={l}><span className="m">✓</span> {l}</li>))}</ul>
            </div>
          </div>
          <p className="center mut reveal" style={{ fontSize: 13, marginTop: 20, maxWidth: 660, marginInline: 'auto' }}>Lekhio is software that prepares your figures, with a real human when you need one. We never imply HMRC backs us.</p>
        </div>
      </section>

      {/* Complaints to fixes */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}>
            <h2 className="h2">From their complaints to our fixes.</h2>
            <p className="lead">The gripes people leave about other apps, and how Lekhio puts each one right.</p>
          </div>
          <div className="fixgrid reveal">
            {fixes.map((f) => (
              <div className="fixcard" key={f.gripe}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx-mut)', marginBottom: 10 }}>{f.who}</div>
                <p className="g">&quot;{f.gripe}&quot;</p>
                <p className="f">{f.fix}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}>
            <div className="eyebrow" style={{ color: 'var(--saffron-deep)' }}>Coming soon</div>
            <h2 className="h2">Soon, Lekhio does the lot.</h2>
            <p className="lead">Every one keeps you in control, and never sends a thing without your yes.</p>
          </div>
          <div className="soongrid reveal">
            {comingSoon.map((c) => (
              <div className="sooncard" key={c.title}>
                <div className="se">{c.icon}</div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="badge">COMING SOON</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section>
        <div className="wrap">
          <div className="final reveal">
            <h2>Your whole back office, in a text.</h2>
            <p>Start now and your books build themselves. 30 days free, no card needed.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
