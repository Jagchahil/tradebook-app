import type { Metadata } from 'next';
import ClientScript from '../_shared/ClientScript';
import Link from 'next/link';
import { css } from '../../lib/tokens';
import {
  INK, PAPER, FONT, faqs, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta,
  Ic,
} from '../_shared/site';
import { diaryRowLabel } from '../../lib/features';

export const metadata: Metadata = {
  alternates: { canonical: '/pricing' },
  title: 'Pricing. One flat price, everything in.',
  description:
    'Lekhio is £12.99 a month, or £129 a year with about two months free. No receipt limits, no tiers, no surprises. It replaces a whole shelf of subscriptions. 7 days free, no card needed.',
};

const STACK = [
  { e: '📒', label: 'Bookkeeping app', cost: '£10 to £20' },
  { e: '🧾', label: 'Invoicing tool', cost: '£10 to £25' },
  { e: '🚗', label: 'Mileage tracker', cost: '£5 to £10' },
  { e: '🧮', label: 'Tax software', cost: '£10 to £20' },
  // The same claim as app/_shared/site.tsx's `replaces` row, and it had the same problem. One
  // helper so the two tables cannot drift, and so both flip on the same env var.
  { e: '🗓️', label: diaryRowLabel(), cost: '£5 to £15' },
  { e: '🧑‍💼', label: 'Accountant fees', cost: '£20 to £60' },
];

// The css tag strips the comments below at build time, so they never ship to the browser.
const PRICING_CSS = css`
.mkt .hero{padding:52px 0 8px}
.mkt .final{background:var(--band)}
.mkt .final p{color:rgba(255,255,255,.8)}
.billtoggle{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:5px;gap:4px}
.billtoggle button{padding:11px 20px;border-radius:12px;border:0;background:transparent;font-family:inherit;font-weight:700;font-size:14px;color:var(--tx-mut);cursor:pointer;transition:.2s}
.billtoggle button.on{background:var(--panel);color:var(--tx)}
.billtoggle .savepill{font-size:10px;font-weight:900;color:var(--on-green);background:var(--green);padding:2px 7px;border-radius:999px;margin-left:6px}
/* No glow. The card carries on a 2px hairline, the same weight the app shell wears. */
.pricebig{max-width:440px;margin:26px auto 0;border:2px solid var(--river);border-radius:16px;padding:34px;text-align:center;position:relative;overflow:hidden;background:linear-gradient(180deg,var(--river-tint),var(--panel))}
.pricebig::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,var(--river),var(--saffron))}
.pamt{font-size:60px;font-weight:900;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.pamt span{font-size:20px;font-weight:700;color:var(--tx-mut);letter-spacing:0}
.pnote{font-size:14px;color:var(--tx-mut);margin:8px 0 0;min-height:20px}
.psave{display:inline-block;font-size:13px;font-weight:800;color:var(--on-green-tint);background:var(--green-tint);padding:6px 14px;border-radius:999px;margin:14px 0 4px;transition:opacity .3s}
.pcta{margin-top:16px}.pcta .btn{width:100%}
.pmicro{font-size:12px;color:var(--tx-mut);margin-top:10px}
.stack{max-width:560px;margin:0 auto;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:12px 22px 22px}
.srow{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line);animation:srowin .5s both}
.srow:nth-child(1){animation-delay:0s}.srow:nth-child(2){animation-delay:.08s}.srow:nth-child(3){animation-delay:.16s}
.srow:nth-child(4){animation-delay:.24s}.srow:nth-child(5){animation-delay:.32s}.srow:nth-child(6){animation-delay:.4s}
@keyframes srowin{0%{opacity:0;transform:translateX(-8px)}100%{opacity:1;transform:none}}
.srow .se{width:38px;height:38px;border-radius:11px;background:var(--panel-2);display:grid;place-items:center;font-size:18px}
.srow .sl{flex:1;font-size:14.5px;font-weight:600}
.srow .sc{font-size:14px;font-weight:800;color:var(--tx-mut)}
/* The strikethrough "you would pay £X to £Y" arithmetic went on 5 August 2026. A crossed out
   total we invented is the infomercial move, and the honest claim is simpler: the shelf above
   is the job, and one employee does the lot. */
.stotal{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;padding:16px 0 2px}
.stotal .stl{font-size:16px;font-weight:800}
.stotal .stc{font-size:14.5px;font-weight:600;color:var(--tx-mut)}
.cred{background:linear-gradient(135deg,var(--river-panel-deep),var(--river-panel));border-radius:16px;padding:44px 32px;color:#fff;text-align:center}
.cred h2{color:#fff;font-size:clamp(24px,3.6vw,36px)}
.credrow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:24px}
.credchip{background:rgba(255,255,255,.14);border-radius:14px;padding:14px 18px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:9px}
.credchip b{font-weight:900}
details.faq{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 20px;margin:10px 0}
details.faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15.5px}
details.faq summary::-webkit-details-marker{display:none}
details.faq .fp{width:26px;height:26px;border-radius:999px;background:var(--river-tint);color:var(--river);display:grid;place-items:center;font-size:17px;transition:transform .25s}
details.faq[open] .fp{transform:rotate(45deg)}
details.faq .fa{font-size:14.5px;color:var(--tx-mut);margin-top:12px;line-height:1.6}
/* The phone pass. This page's own rules outrank the shared mobile block (they come later in the
   cascade), so the ones that need to compress at phone width are compressed here. */
@media(max-width:640px){
.mkt .hero{padding:34px 0 6px}
.pricebig{padding:26px 20px}
.pamt{font-size:46px}
.cred{padding:32px 20px}
.stack{padding:8px 16px 16px}
}
`;

const PRICING_JS = `
(function(){  function setBill(b){
    document.querySelectorAll('#bill button').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-b')===b);});
    var amt=document.getElementById('pamt'),note=document.getElementById('pnote'),save=document.getElementById('psave');
    if(!amt)return;
    if(b==='year'){amt.innerHTML='£129<span>/yr</span>';note.textContent='Just £10.75 a month, billed once a year.';save.style.opacity='1';}
    else{amt.innerHTML='£12.99<span>/mo</span>';note.textContent='Billed monthly. Cancel any time.';save.style.opacity='0';}
    if(amt.animate)amt.animate([{transform:'scale(.92)',opacity:.4},{transform:'scale(1)',opacity:1}],{duration:280,easing:'cubic-bezier(.2,1.6,.4,1)'});
  }
  function wire(){document.querySelectorAll('#bill button').forEach(function(b){b.addEventListener('click',function(){setBill(b.getAttribute('data-b'));});});}
  if(document.readyState!=='loading')wire();else document.addEventListener('DOMContentLoaded',wire);
})();
`;

export default function PricingPage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <main className="mkt" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: PRICING_CSS }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <SiteNav />

      {/* Hero. One number, said once. The gradient treatment went with the rest of the AI tells. */}
      <section className="hero center">
        <div className="wrap">
          <span className="pill"><span className="dot" /> One price, everything in</span>
          <h1 style={{ marginTop: 20 }}>£12.99 a month.<br />That is the whole conversation.</h1>
          {/* No inline font size: it outranked every stylesheet, so the phone pass could never
              reach it. The size comes from .hero p.sub like every other subhead. */}
          <p className="sub" style={{ maxWidth: 540, margin: '20px auto 0' }}>No receipt limits. No tiers. No hidden fees. Every plan starts with 7 days free, no card needed.</p>
        </div>
      </section>

      {/* Price card + toggle */}
      <section style={{ paddingTop: 14 }}>
        <div className="wrap center">
          <div className="billtoggle reveal" id="bill"><button className="on" data-b="month">Monthly</button><button data-b="year">Yearly <span className="savepill">SAVE 2 MONTHS</span></button></div>
          <div className="pricebig reveal">
            <div className="pamt" id="pamt">£12.99<span>/mo</span></div>
            <div className="pnote" id="pnote">Billed monthly. Cancel any time.</div>
            <div className="psave" id="psave" style={{ opacity: 0 }}>2 months free · save £27 a year</div>
            <div className="pcta"><Link href="/start" className="btn primary">Start free</Link></div>
            <div className="pmicro">7 days free, no card. Cancel in one tap.</div>
          </div>
          <div className="incl-panel reveal">
            <h4>Everything, in every plan</h4>
            <ul className="incl-grid">
              <li><span className="t">✓</span> Unlimited receipts, voice notes and mileage</li>
              <li><span className="t">✓</span> Invoices created, sent and paid online</li>
              <li><span className="t">✓</span> MTD ready quarterly summaries, you approve</li>
              <li><span className="t">✓</span> CIS split, deduction and refund tracking</li>
              <li><span className="t">✓</span> Instant replies in the same chat</li>
              <li><span className="t">✓</span> Cancel in one tap, export any time</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Value stack */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 38 }}><div className="eyebrow">The real value</div><h2 className="h2">It replaces a whole shelf of subscriptions.</h2><p className="lead">Most people juggle five or six tools and an accountant. Lekhio is all of it, in one text.</p></div>
          <div className="stack reveal">
            {STACK.map((s) => (
              <div className="srow" key={s.label}><div className="se"><Ic e={s.e} color="var(--tx-mut)" size={22} /></div><div className="sl">{s.label}</div><div className="sc">{s.cost}</div></div>
            ))}
            {/* No strikethrough total. A crossed out figure we added up ourselves is the
                infomercial move. The shelf is the job, and the employee does the lot. */}
            <div className="stotal"><div className="stl">One employee. £12.99.</div><div className="stc">Everything above is its job.</div></div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div className="center reveal" style={{ marginBottom: 32 }}><h2 className="h2">Questions, answered.</h2></div>
          <div className="reveal">
            {faqs.map((f) => (
              <details className="faq" key={f.q}>
                <summary>{f.q}<span className="fp">+</span></summary>
                <div className="fa">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section>
        <div className="wrap"><div className="cred reveal">
          <h2>One honest price. Everything you need.</h2>
          <p style={{ color: 'rgba(255,255,255,.86)', fontSize: 17, maxWidth: 560, margin: '14px auto 0' }}>No paywalls, no receipt caps, no surprise upgrades. Start free and only pay when you are sure.</p>
          <div className="credrow">
            <div className="credchip"><span><b>7 days free</b>, no card needed</span></div>
            <div className="credchip"><span>Cancel in one tap</span></div>
            <div className="credchip"><span>Export your data any time</span></div>
            <div className="credchip"><span>A real UK company</span></div>
          </div>
        </div></div>
      </section>

      {/* Final CTA */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Hire it for a week.</h2>
            <p>Snap your first receipt today and see it work. If it has not earned its keep, walk away in one tap.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.8)', marginTop: 12 }}>7 days free, no card. Cancel in one tap.</div>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
      <ClientScript js={PRICING_JS} />
    </main>
  );
}
