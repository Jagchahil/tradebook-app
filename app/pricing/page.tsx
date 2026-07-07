import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, PAPER, FONT, faqs, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'Pricing. One flat price, everything in.',
  description:
    'Lekhio is £12.99 a month, or £129 a year with about two months free. No receipt limits, no tiers, no surprises. It replaces a whole shelf of subscriptions. 14 days free, no card needed.',
};

const STACK = [
  { e: '📒', label: 'Bookkeeping app', cost: '£10 to £20' },
  { e: '🧾', label: 'Invoicing tool', cost: '£10 to £25' },
  { e: '🚗', label: 'Mileage tracker', cost: '£5 to £10' },
  { e: '🧮', label: 'Tax software', cost: '£10 to £20' },
  { e: '🗓️', label: 'Diary and reminders', cost: '£5 to £15' },
  { e: '🧑‍💼', label: 'Accountant fees', cost: '£20 to £60' },
];

const PRICING_CSS = `
.mkt .hero{padding:52px 0 8px}
.mkt .final{background:var(--band)}
.mkt .final p{color:rgba(255,255,255,.8)}
.billtoggle{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:14px;padding:5px;gap:4px}
.billtoggle button{padding:11px 20px;border-radius:10px;border:0;background:transparent;font-family:inherit;font-weight:700;font-size:14px;color:var(--tx-mut);cursor:pointer;transition:.2s}
.billtoggle button.on{background:var(--panel);color:var(--tx);box-shadow:0 2px 8px rgba(0,0,0,.1)}
.billtoggle .savepill{font-size:10px;font-weight:900;color:#fff;background:var(--green);padding:2px 7px;border-radius:999px;margin-left:6px}
.pricebig{max-width:440px;margin:26px auto 0;border:1px solid transparent;border-radius:24px;padding:34px;text-align:center;box-shadow:0 24px 56px rgba(27,89,166,.18);position:relative;overflow:hidden;background:linear-gradient(180deg,var(--river-tint),var(--panel))}
.pricebig::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,var(--river),var(--saffron))}
.pamt{font-size:60px;font-weight:900;letter-spacing:-.04em;line-height:1}
.pamt span{font-size:20px;font-weight:700;color:var(--tx-mut);letter-spacing:0}
.pnote{font-size:14px;color:var(--tx-mut);margin:8px 0 0;min-height:20px}
.psave{display:inline-block;font-size:13px;font-weight:800;color:var(--green);background:var(--green-tint);padding:6px 14px;border-radius:999px;margin:14px 0 4px;transition:opacity .3s}
.pcta{margin-top:16px}.pcta .btn{width:100%}
.pmicro{font-size:12px;color:var(--tx-mut);margin-top:10px}
.stack{max-width:560px;margin:0 auto;background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:12px 22px 22px;box-shadow:var(--shadow)}
.srow{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line);animation:srowin .5s both}
.srow:nth-child(1){animation-delay:0s}.srow:nth-child(2){animation-delay:.08s}.srow:nth-child(3){animation-delay:.16s}
.srow:nth-child(4){animation-delay:.24s}.srow:nth-child(5){animation-delay:.32s}.srow:nth-child(6){animation-delay:.4s}
@keyframes srowin{0%{opacity:0;transform:translateX(-8px)}100%{opacity:1;transform:none}}
.srow .se{width:38px;height:38px;border-radius:11px;background:var(--panel-2);display:grid;place-items:center;font-size:18px}
.srow .sl{flex:1;font-size:14.5px;font-weight:600}
.srow .sc{font-size:14px;font-weight:800;color:var(--tx-mut)}
.stotal{display:flex;justify-content:space-between;align-items:center;padding:16px 0 6px}
.stotal .stl{font-size:15px;font-weight:800}
.stotal .stc{font-size:20px;font-weight:900;color:var(--red);text-decoration:line-through;opacity:.7}
.replace{margin-top:14px;background:linear-gradient(135deg,var(--river),var(--river-deep));border-radius:16px;padding:20px;text-align:center;color:#fff}
.replace .rt{font-size:14px;opacity:.9}
.replace .rp{font-size:34px;font-weight:900;letter-spacing:-.03em;margin-top:2px}
.cred{background:linear-gradient(135deg,var(--river-deep),var(--river));border-radius:24px;padding:44px 32px;color:#fff;text-align:center}
.cred h2{color:#fff;font-size:clamp(24px,3.6vw,36px)}
.credrow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:24px}
.credchip{background:rgba(255,255,255,.14);border-radius:14px;padding:14px 18px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:9px}
.credchip b{font-weight:900}
details.faq{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 20px;margin:10px 0;box-shadow:var(--shadow)}
details.faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:15.5px}
details.faq summary::-webkit-details-marker{display:none}
details.faq .fp{width:26px;height:26px;border-radius:999px;background:var(--river-tint);color:var(--river);display:grid;place-items:center;font-size:17px;transition:transform .25s}
details.faq[open] .fp{transform:rotate(45deg)}
details.faq .fa{font-size:14.5px;color:var(--tx-mut);margin-top:12px;line-height:1.6}
`;

const PRICING_JS = `
(function(){
  if(window.__lekPr)return;window.__lekPr=true;
  function setBill(b){
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

      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for the self employed earning over £50k. <span className="go">See if it affects you →</span></Link></div>
      <SiteNav />

      {/* Hero */}
      <section className="hero center">
        <div className="wrap">
          <span className="pill"><span className="dot" /> One price, everything in</span>
          <h1 style={{ marginTop: 20 }}>Simple pricing.<br /><span className="gt">No surprises.</span></h1>
          <p className="sub" style={{ maxWidth: 540, margin: '20px auto 0', fontSize: 20, color: 'var(--tx-mut)' }}>No receipt limits. No tiers. No hidden fees. Every plan starts with 14 days free, no card needed.</p>
        </div>
      </section>

      {/* Price card + toggle */}
      <section style={{ paddingTop: 14 }}>
        <div className="wrap center">
          <div className="billtoggle reveal" id="bill"><button className="on" data-b="month">Monthly</button><button data-b="year">Yearly <span className="savepill">SAVE 2 MONTHS</span></button></div>
          <div className="pricebig reveal">
            <div className="pamt" id="pamt">£12.99<span>/mo</span></div>
            <div className="pnote" id="pnote">Billed monthly. Cancel any time.</div>
            <div className="psave" id="psave" style={{ opacity: 0 }}>🎉 2 months free · save £27 a year</div>
            <div className="pcta"><Link href="/start" className="btn primary">Start 14 days free</Link></div>
            <div className="pmicro">14 day free trial · no card needed</div>
          </div>
          <div className="incl-panel reveal">
            <h4>Everything, in every plan</h4>
            <ul className="incl-grid">
              <li><span className="t">✓</span> Unlimited receipts, voice notes and mileage</li>
              <li><span className="t">✓</span> Invoices created and sent from WhatsApp</li>
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
              <div className="srow" key={s.label}><div className="se">{s.e}</div><div className="sl">{s.label}</div><div className="sc">{s.cost}</div></div>
            ))}
            <div className="stotal"><div className="stl">You would pay</div><div className="stc">£60 to £150 a month</div></div>
            <div className="replace"><div className="rt">All of it, in Lekhio, for</div><div className="rp">£12.99 a month</div></div>
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
            <div className="credchip">🎁 <span><b>14 days free</b>, no card needed</span></div>
            <div className="credchip">🔓 <span>Cancel in one tap</span></div>
            <div className="credchip">📤 <span>Export your data any time</span></div>
            <div className="credchip">🇬🇧 <span>A real UK company</span></div>
          </div>
        </div></div>
      </section>

      {/* Final CTA */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Try it free for 14 days.</h2>
            <p>No card needed. Snap your first receipt today and see it work.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
      <script dangerouslySetInnerHTML={{ __html: PRICING_JS }} />
    </main>
  );
}
