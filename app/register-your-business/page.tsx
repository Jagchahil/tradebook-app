import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How to Register Your Business in the UK | Lekhio',
  description:
    'Starting out? A plain English guide to registering as a sole trader, when to go limited, and registering for VAT, PAYE and CIS. Free, with the real costs and deadlines for 2026.',
  openGraph: {
    title: 'How to Register Your Business in the UK',
    description: 'Sole trader, limited company, VAT, PAYE and CIS, explained simply. The real costs and deadlines for 2026.',
    type: 'website',
  },
};

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

const soleSteps = [
  { n: '1', t: 'Check you need to', b: 'Once you earn more than £1,000 a year from working for yourself, HMRC wants you registered for Self Assessment. Below that, the trading allowance covers you.' },
  { n: '2', t: 'Register with HMRC', b: 'It is free, online, and takes minutes. You will get a Unique Taxpayer Reference (UTR) in the post. Do it by 5 October after the tax year you started.' },
  { n: '3', t: 'Keep digital records', b: 'From day one, log your income and costs. Lekhio does this from a text, so you are ready for the quarterly updates Making Tax Digital now asks for.' },
];

const compareRows = [
  { label: 'Setup cost', sole: 'Free', ltd: '£100 online' },
  { label: 'Admin', sole: 'Simple, one return', ltd: 'More, annual accounts and a company return' },
  { label: 'Your liability', sole: 'You and the business are one', ltd: 'Limited to the company' },
  { label: 'Tax', sole: 'Income tax and Class 4 NI on profit', ltd: 'Corporation tax, then salary and dividends' },
  { label: 'Best when', sole: 'Starting out, most sole trades', ltd: 'Higher profits, or you want the protection' },
];

const others = [
  { icon: '🧾', t: 'VAT', b: 'You must register once your turnover passes £90,000 in a 12 month period. Many trades never reach it. You can register voluntarily if it helps.', tint: RIVER_TINT, fg: RIVER },
  { icon: '👷', t: 'CIS', b: 'In construction, register for the Construction Industry Scheme. As a subcontractor it means 20% is deducted at source, and you usually get a refund. Lekhio tracks it.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '👥', t: 'PAYE', b: 'Taking on your first employee or apprentice? Register as an employer with HMRC for PAYE before their first payday.', tint: GREEN_TINT, fg: GREEN },
];

export default function RegisterPage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style dangerouslySetInnerHTML={{ __html: `*{box-sizing:border-box}body{margin:0}a{text-decoration:none}.h1b{font-size:50px;line-height:1.05;letter-spacing:-2px}.steps3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.other3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.ctab{width:100%;border-collapse:separate;border-spacing:0}.ctab td,.ctab th{padding:14px 16px;text-align:left;font-size:14.5px;border-top:1px solid ${LINE}}@media(max-width:820px){.h1b{font-size:34px}.steps3{grid-template-columns:1fr}.other3{grid-template-columns:1fr}.ctab{font-size:13px}}` }} />

      <nav style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1px', color: INK }}>Lekhio</Link>
        <Link href="/start" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
      </nav>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 8px' }}>
        <div style={{ maxWidth: 720 }}>
          <span style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>STARTING OUT</span>
          <h1 className="h1b" style={{ fontWeight: 700, margin: '0 0 16px' }}>Register your business the right way.</h1>
          <p style={{ fontSize: 18.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>
            Going self employed sounds like a mountain of forms. It is not. Here is the whole thing in plain English, with the real costs and deadlines, so you start on the right foot and stay on the good side of HMRC.
          </p>
        </div>
      </section>

      {/* Sole trader steps */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 24px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 8px' }}>Becoming a sole trader.</h2>
        <p style={{ fontSize: 16, color: MUTED, margin: '0 0 22px', maxWidth: 620 }}>The simplest way to work for yourself, and how most trades start. Three steps.</p>
        <div className="steps3">
          {soleSteps.map((s) => (
            <div key={s.n} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 24 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: RIVER, color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{s.n}</div>
              <h3 style={{ fontSize: 17.5, fontWeight: 800, margin: '0 0 8px' }}>{s.t}</h3>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sole trader vs Ltd */}
      <section style={{ background: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '46px 24px' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 8px', textAlign: 'center' }}>Sole trader or limited company?</h2>
          <p style={{ fontSize: 16, color: MUTED, margin: '0 auto 26px', maxWidth: 560, textAlign: 'center' }}>Most people start as a sole trader and go limited later, when the profits or the risk make it worth it. Here is the honest difference.</p>
          <div style={{ background: PAPER, border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
            <table className="ctab">
              <thead>
                <tr>
                  <th style={{ color: MUTED, fontWeight: 700 }}></th>
                  <th style={{ color: RIVER_DEEP, fontWeight: 800 }}>Sole trader</th>
                  <th style={{ color: INK, fontWeight: 800 }}>Limited company</th>
                </tr>
              </thead>
              <tbody>
                {compareRows.map((r) => (
                  <tr key={r.label}>
                    <td style={{ fontWeight: 600, color: INK }}>{r.label}</td>
                    <td style={{ color: INK }}>{r.sole}</td>
                    <td style={{ color: INK }}>{r.ltd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 14, textAlign: 'center' }}>Registering a company costs £100 online at Companies House and needs a name, a director, an address and your share details. General guidance, not advice. The right call depends on your numbers.</p>
        </div>
      </section>

      {/* VAT, CIS, PAYE */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '46px 24px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', margin: '0 0 8px' }}>The other registrations, when they apply.</h2>
        <p style={{ fontSize: 16, color: MUTED, margin: '0 0 24px', maxWidth: 620 }}>You only deal with these when you hit the trigger. Most sole traders need none of them at the start.</p>
        <div className="other3">
          {others.map((o) => (
            <div key={o.t} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: 13, background: o.tint, color: o.fg, fontSize: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{o.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px' }}>{o.t}</h3>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: 0 }}>{o.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Coming soon: register through Lekhio */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 10px' }}>
        <div style={{ background: SAFFRON_TINT, borderRadius: 18, padding: '24px 26px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ maxWidth: 640 }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px', color: SAFFRON_DEEP }}>Soon, register right here.</h3>
            <p style={{ fontSize: 15, color: '#7A5E2C', lineHeight: 1.6, margin: 0 }}>We are building guided registration into Lekhio, so you can get set up as a sole trader, for CIS, and more, without leaving the chat. For now, this guide and the links take you straight there.</p>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.5px', color: SAFFRON_DEEP, background: '#fff', padding: '6px 12px', borderRadius: 14 }}>COMING SOON</span>
        </div>
      </section>

      {/* CTA + links */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '34px 24px 50px' }}>
        <div style={{ background: INK, borderRadius: 20, padding: '40px 28px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, color: '#fff', fontWeight: 700, letterSpacing: '-0.5px', margin: '0 0 12px' }}>Registered? Now let Lekhio keep the books.</h2>
          <p style={{ fontSize: 16, color: '#B6BDC8', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 24px' }}>Snap a receipt, claim your costs, and stay ready for tax from your first day trading. You always approve before anything reaches HMRC.</p>
          <Link href="/start" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Start free trial</Link>
        </div>
        <div style={{ marginTop: 22, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>← Back to home</Link>
          <Link href="/resources" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>All free tools</Link>
          <Link href="/file-your-tax-return" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>File your own return</Link>
          <Link href="/can-i-claim" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Can I claim it?</Link>
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, marginTop: 18, maxWidth: 760 }}>General information for the UK, not tax or legal advice. Costs and thresholds are for 2026 and can change. Lekhio is an independent UK company, not HMRC or Companies House. Always check your own position on GOV.UK or with an accountant.</p>
      </section>
    </main>
  );
}
