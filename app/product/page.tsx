import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, PAPER, FONT, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'What Lekhio does. Snap it, say it, sorted.',
  description:
    'Text Lekhio like you text a mate. It reads it, sorts it, and it lands in your app, tidy and ready. Receipts, voice notes, mileage, invoices, CIS and quarterly tax, all from WhatsApp. You approve before anything reaches HMRC.',
};

const PRODUCT_CSS = `
.mkt .hero{padding:52px 0 20px}
.mkt .hero .cta-row{justify-content:center}
.mkt .hero .sub{font-size:20px;color:var(--tx-mut);max-width:560px;margin:20px auto 26px}
.wphone{width:290px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:30px;overflow:hidden;box-shadow:0 30px 70px rgba(17,17,17,.2)}
[data-theme="dark"] .wphone{box-shadow:0 30px 70px rgba(0,0,0,.6)}
.wahead{background:#075E54;color:#fff;padding:12px 15px;display:flex;align-items:center;gap:9px}
.wahead .a{width:32px;height:32px;border-radius:999px;background:var(--wa);display:grid;place-items:center;font-size:15px}
.wahead b{font-size:13px;display:block}.wahead small{font-size:10px;opacity:.85}
.wchat{background:#ECE5DD;padding:14px 12px;min-height:250px;display:flex;flex-direction:column;gap:8px}
[data-theme="dark"] .wchat{background:#0b141a}
.wb{max-width:84%;padding:8px 11px;font-size:13px;border-radius:12px;color:#111}
.wb.out{align-self:flex-end;background:#DCF8C6;border-bottom-right-radius:4px}
.wb.in{align-self:flex-start;background:#fff;border-bottom-left-radius:4px;box-shadow:0 1px 1px rgba(0,0,0,.08)}
[data-theme="dark"] .wb.out{background:#005c4b;color:#e8f0ee}
[data-theme="dark"] .wb.in{background:#202c33;color:#e8f0ee}
.wb .rc{background:#cde7b4;border-radius:8px;padding:12px;text-align:center;font-size:20px;margin-bottom:4px}
.journey{display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;justify-items:center;max-width:820px;margin:0 auto}
@media(max-width:820px){.journey{grid-template-columns:1fr;gap:30px}}
.jarrow{font-size:34px;color:var(--saffron);font-weight:900;animation:jarrowmv 1.8s ease-in-out infinite}
@keyframes jarrowmv{0%,100%{transform:translateX(0)}50%{transform:translateX(8px)}}
@media(max-width:820px){.jarrow{transform:rotate(90deg)}}
.jlabel{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--tx-mut);margin-bottom:12px;text-align:center}
.jphone{width:270px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:30px;overflow:hidden;box-shadow:0 30px 70px rgba(17,17,17,.2)}
[data-theme="dark"] .jphone{box-shadow:0 30px 70px rgba(0,0,0,.6)}
.appbar{padding:16px 16px 8px;display:flex;justify-content:space-between;align-items:center}
.appbar b{font-size:16px}
.appbody{padding:0 14px 16px;min-height:250px;background:var(--bg)}
.feedcard{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:11px;margin:8px 0;box-shadow:var(--shadow);display:flex;align-items:center;gap:10px}
.feedcard .fi{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:15px;background:var(--panel-2)}
.feedcard .fm{flex:1}.feedcard .fm b{font-size:12.5px;display:block}.feedcard .fm small{font-size:10.5px;color:var(--tx-mut)}
.feedcard .fa{font-weight:900;font-size:13px}
.jA{animation:jkA 6s infinite}
@keyframes jkA{0%,4%{opacity:0;transform:translateY(-8px)}9%,90%{opacity:1;transform:none}97%,100%{opacity:0}}
.jB{animation:jkB 6s infinite}
@keyframes jkB{0%,16%{opacity:0;transform:translateY(-8px)}21%,90%{opacity:1;transform:none}97%,100%{opacity:0}}
.jC{animation:jkC 6s infinite}
@keyframes jkC{0%,32%{opacity:0;transform:translateY(-12px) scale(.96)}39%,90%{opacity:1;transform:none}97%,100%{opacity:0}}
.ftabs{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:28px}
.ftab{display:flex;align-items:center;gap:8px;padding:11px 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--panel);font-weight:700;font-size:14px;cursor:pointer;transition:.2s;color:var(--tx)}
.ftab:hover{border-color:var(--river);transform:translateY(-2px)}
.ftab.on{background:var(--river);color:#fff;border-color:var(--river);box-shadow:0 8px 20px rgba(27,89,166,.3)}
.fstage{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center;max-width:900px;margin:0 auto;min-height:280px}
@media(max-width:820px){.fstage{grid-template-columns:1fr;gap:24px}}
.ftext h3{font-size:26px;margin:0 0 10px}
.ftext p{font-size:16px;color:var(--tx-mut)}
.fdemo{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:18px;box-shadow:var(--shadow);min-height:200px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.db{max-width:86%;padding:9px 12px;font-size:13.5px;border-radius:12px;margin:6px 0;opacity:0;transform:translateY(8px);animation:dbin .45s forwards}
.db.out{align-self:flex-end;margin-left:auto;background:#DCF8C6;color:#111;border-bottom-right-radius:4px}
.db.in{align-self:flex-start;background:var(--panel-2);border-bottom-left-radius:4px}
[data-theme="dark"] .db.out{background:#005c4b;color:#e8f0ee}
.db.d1{animation-delay:.15s}.db.d2{animation-delay:.7s}.db.d3{animation-delay:1.2s}
@keyframes dbin{to{opacity:1;transform:none}}
.wave{display:flex;align-items:flex-end;gap:3px;height:26px}
.wave i{width:4px;border-radius:2px;background:var(--river);animation:wv .8s ease infinite}
.wave i:nth-child(2n){animation-delay:.15s}.wave i:nth-child(3n){animation-delay:.3s}
@keyframes wv{0%,100%{height:6px}50%{height:24px}}
.tourwrap{display:flex;flex-direction:column;align-items:center;gap:20px}
.tourphone{width:290px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:34px;padding:10px;box-shadow:0 30px 70px rgba(17,17,17,.2)}
[data-theme="dark"] .tourphone{box-shadow:0 30px 70px rgba(0,0,0,.6)}
.tourscreen{background:var(--bg);border-radius:24px;overflow:hidden;height:440px}
.tslides{display:flex;height:100%;transition:transform .5s cubic-bezier(.2,.7,.3,1)}
.tslide{min-width:100%;height:100%;padding:20px 16px;overflow:hidden}
.ttabs{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.ttab{padding:9px 15px;border-radius:999px;border:1px solid var(--line);background:var(--panel);font-weight:700;font-size:13px;cursor:pointer;transition:.2s;color:var(--tx)}
.ttab.on{background:var(--river);color:#fff;border-color:var(--river)}
.bignum{background:linear-gradient(135deg,var(--river),var(--river-deep));border-radius:16px;padding:16px;color:#fff}
.bignum .l{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.85}
.bignum .v{font-size:30px;font-weight:900;letter-spacing:-.03em}
.trow{display:flex;justify-content:space-between;padding:11px 4px;border-bottom:1px solid var(--line);font-size:13px}
.trow:last-child{border:0}
.mini2{display:flex;gap:8px;margin:10px 0}
.mini2 div{flex:1;background:var(--panel-2);border-radius:12px;padding:10px}
.mini2 .l{font-size:9.5px;color:var(--tx-mut);font-weight:700}.mini2 .v{font-size:15px;font-weight:900}
.rbadge{font-size:10px;font-weight:900;letter-spacing:.05em;padding:4px 9px;border-radius:999px;display:inline-block}
.rbadge.soon{color:var(--saffron-deep);background:var(--saffron-tint)}
.rbadge.prog{color:var(--river);background:var(--river-tint)}
`;

const PRODUCT_JS = `
(function(){
  if(window.__lekProd)return;window.__lekProd=true;
  var FEAT=[
   {t:'Snap a receipt',p:'Photograph it on WhatsApp. Lekhio pulls the total, the VAT and the category, and logs it in seconds.',demo:'<div class="db out d1"><div style="background:#cde7b4;border-radius:8px;padding:12px;text-align:center;font-size:20px;margin-bottom:4px">🧾</div>Screwfix receipt</div><div class="db in d2">Logged. £42.60, materials ✅</div><div class="db in d3" style="background:transparent;font-size:12px;color:var(--tx-mut)">VAT £7.10 · Materials · 3 Jul</div>'},
   {t:'Say it out loud',p:'Hands full on the job? Leave a voice note. Lekhio hears it and logs it before you have put the phone down.',demo:'<div class="db out d1" style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">🎙️</span><span class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div><div class="db out d2">"spent forty on diesel"</div><div class="db in d3">£40 fuel, logged ✅</div>'},
   {t:'Mileage in a text',p:'Text the trip. Lekhio works out the claim at the HMRC rate and logs it. No fiddly logbook.',demo:'<div class="db out d1">drove 24 miles to the job</div><div class="db in d2">£13.20 mileage claimed at the HMRC rate ✅</div><div class="db in d3" style="background:transparent;font-size:12px;color:var(--tx-mut)">45p a mile · logged to travel</div>'},
   {t:'Invoice from a text',p:'Type it in plain words. Lekhio builds a clean invoice and sends it, then tracks who has paid.',demo:'<div class="db out d1">invoice Dave £450 for the rewire</div><div class="db in d2">Invoice #0043 sent to Dave ✅</div><div class="db in d3">Dave paid. +£450 income 💷</div>'},
   {t:'CIS done right',p:'Lekhio splits labour and materials, applies your deduction, and tracks the refund building up all year.',demo:'<div class="db out d1">£400 paid, £80 CIS deducted</div><div class="db in d2">Gross £400 logged, £80 CIS held 🏗️</div><div class="db in d3" style="background:transparent;font-size:12px;color:var(--tx-mut)">Refund building up: £1,120 ↗</div>'},
   {t:'Ask it anything',p:'Not sure what counts? Ask in plain words. Lekhio answers straight, the grey areas included.',demo:'<div class="db out d1">can I claim my work boots?</div><div class="db in d2">Yes 👍 protective boots for the job are allowable.</div><div class="db in d3">Want me to note them for you?</div>'}
  ];
  function showFeat(i){
    document.querySelectorAll('#ftabs .ftab').forEach(function(t){t.classList.toggle('on',+t.getAttribute('data-f')===i);});
    document.getElementById('ftext').innerHTML='<h3>'+FEAT[i].t+'</h3><p>'+FEAT[i].p+'</p>';
    document.getElementById('fdemo').innerHTML=FEAT[i].demo;
  }
  function showTour(i){
    document.querySelectorAll('#ttabs .ttab').forEach(function(t){t.classList.toggle('on',+t.getAttribute('data-t')===i);});
    var s=document.getElementById('tslides');if(s)s.style.transform='translateX(-'+(i*100)+'%)';
  }
  function wire(){
    document.querySelectorAll('#ftabs .ftab').forEach(function(t){t.addEventListener('click',function(){showFeat(+t.getAttribute('data-f'));});});
    document.querySelectorAll('#ttabs .ttab').forEach(function(t){t.addEventListener('click',function(){showTour(+t.getAttribute('data-t'));});});
    if(document.getElementById('ftext'))showFeat(0);
  }
  if(document.readyState!=='loading')wire();else document.addEventListener('DOMContentLoaded',wire);
})();
`;

export default function ProductPage() {
  return (
    <main className="mkt" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: PRODUCT_CSS }} />

      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for the self employed. <span className="go">See if it affects you →</span></Link></div>
      <SiteNav />

      {/* Hero */}
      <section className="hero center">
        <div className="wrap">
          <span className="pill"><span className="dot" /> The whole back office, in one chat</span>
          <h1 style={{ marginTop: 20 }}>Snap it. Say it.<br /><span className="gt">Sorted.</span></h1>
          <p className="sub">Text Lekhio like you text a mate. It reads it, sorts it, and it lands in your app, tidy and ready. Watch how.</p>
          <div className="cta-row"><Link href="/start" className="btn primary">Start free</Link><Link href="/pricing" className="btn ghost">See pricing</Link></div>
        </div>
      </section>

      {/* Journey demo */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}>
            <div className="eyebrow">From a text to your books</div>
            <h2 className="h2">You text it. It lands in your app.</h2>
            <p className="lead">One message on WhatsApp. Seconds later it is logged, sorted, and sat in your app.</p>
          </div>
          <div className="journey reveal">
            <div>
              <div className="jlabel">1 · You text on WhatsApp</div>
              <div className="wphone">
                <div className="wahead"><span className="a">💬</span><div><b>Lekhio</b><small>online</small></div></div>
                <div className="wchat">
                  <div className="wb out jA"><div className="rc">🧾</div>Screwfix receipt</div>
                  <div className="wb in jB">Logged. £42.60, materials ✅</div>
                </div>
              </div>
            </div>
            <div className="jarrow">→</div>
            <div>
              <div className="jlabel">2 · It appears in your app</div>
              <div className="jphone">
                <div className="appbar"><b>Feed</b><span style={{ fontSize: 16 }}>🔔</span></div>
                <div className="appbody">
                  <div className="feedcard jC" style={{ borderColor: 'var(--saffron)' }}><div className="fi" style={{ background: 'var(--saffron-tint)' }}>🧾</div><div className="fm"><b>Screwfix</b><small>Materials · just now</small></div><div className="fa">−£42.60</div></div>
                  <div className="feedcard"><div className="fi">⛽</div><div className="fm"><b>BP</b><small>Fuel · today</small></div><div className="fa">−£62.00</div></div>
                  <div className="feedcard"><div className="fi" style={{ background: 'var(--green-tint)' }}>💷</div><div className="fm"><b>Dave Wilson</b><small>Invoice · today</small></div><div className="fa" style={{ color: 'var(--green)' }}>+£400</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive feature tabs */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 8 }}>
            <div className="eyebrow">Tap one, watch it happen</div>
            <h2 className="h2">One chat. Everything handled.</h2>
          </div>
          <div className="ftabs reveal" id="ftabs" style={{ marginTop: 26 }}>
            <div className="ftab on" data-f="0">📸 Receipt</div>
            <div className="ftab" data-f="1">🎙️ Voice</div>
            <div className="ftab" data-f="2">🚗 Mileage</div>
            <div className="ftab" data-f="3">🧾 Invoice</div>
            <div className="ftab" data-f="4">👷 CIS</div>
            <div className="ftab" data-f="5">💡 Ask</div>
          </div>
          <div className="fstage reveal">
            <div className="ftext" id="ftext" />
            <div className="fdemo" id="fdemo" />
          </div>
        </div>
      </section>

      {/* App tour */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 34 }}>
            <div className="eyebrow">Your back office, in your pocket</div>
            <h2 className="h2">Everything, tidy and ready.</h2>
            <p className="lead">Open the app whenever you want the full picture. Tap through it.</p>
          </div>
          <div className="tourwrap reveal">
            <div className="ttabs" id="ttabs"><div className="ttab on" data-t="0">🏠 Feed</div><div className="ttab" data-t="1">📊 Money</div><div className="ttab" data-t="2">🧾 Invoices</div></div>
            <div className="tourphone">
              <div className="tourscreen">
                <div className="tslides" id="tslides">
                  <div className="tslide">
                    <div className="appbar" style={{ padding: '6px 4px 12px' }}><b>Feed</b><span>🔔</span></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--saffron-tint)' }}>🧾</div><div className="fm"><b>Screwfix</b><small>Materials · 2m</small></div><div className="fa">−£42.60</div></div>
                    <div className="feedcard"><div className="fi">⛽</div><div className="fm"><b>BP</b><small>Fuel · 1h</small></div><div className="fa">−£62.00</div></div>
                    <div className="feedcard" style={{ borderColor: 'var(--green)' }}><div className="fi" style={{ background: 'var(--green-tint)' }}>💷</div><div className="fm"><b>Dave paid you</b><small>CIS £80 held · 3h</small></div><div className="fa" style={{ color: 'var(--green)' }}>+£500</div></div>
                    <div className="feedcard" style={{ background: 'var(--saffron-tint)', borderColor: 'var(--saffron)' }}><div className="fi" style={{ background: '#fff' }}>🔥</div><div className="fm"><b>7-day streak!</b><small>Keep it going</small></div></div>
                  </div>
                  <div className="tslide">
                    <div className="appbar" style={{ padding: '6px 4px 12px' }}><b>Money</b><span style={{ fontSize: 12 }}>2026/27 ▾</span></div>
                    <div className="bignum"><div className="l">Tax set aside · this year</div><div className="v">£3,240</div><div style={{ fontSize: 11, opacity: 0.85 }}>81% ready for the quarter</div></div>
                    <div className="mini2"><div><div className="l">Income</div><div className="v" style={{ color: 'var(--green)' }}>£28.4k</div></div><div><div className="l">Profit</div><div className="v" style={{ color: 'var(--river)' }}>£19.3k</div></div></div>
                    <div className="trow"><span>🏗️ CIS refund building</span><span style={{ color: 'var(--saffron-deep)', fontWeight: 800 }}>£1,120</span></div>
                    <div className="trow"><span>Next deadline</span><span style={{ fontWeight: 800 }}>31 Jan</span></div>
                  </div>
                  <div className="tslide">
                    <div className="appbar" style={{ padding: '6px 4px 12px' }}><b>Invoices</b><span style={{ color: 'var(--river)', fontWeight: 800, fontSize: 13 }}>＋ New</span></div>
                    <div className="mini2"><div><div className="l">Outstanding</div><div className="v" style={{ color: 'var(--saffron-deep)' }}>£1,450</div></div><div><div className="l">Paid this month</div><div className="v" style={{ color: 'var(--green)' }}>£3,900</div></div></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--river-tint)' }}>🧾</div><div className="fm"><b>Dave · rewire</b><small>#0042</small></div><div className="fa" style={{ color: 'var(--green)' }}>Paid</div></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--river-tint)' }}>🧾</div><div className="fm"><b>Miller Bros</b><small>#0041</small></div><div className="fa" style={{ color: 'var(--saffron-deep)' }}>Due 12d</div></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--river-tint)' }}>🧾</div><div className="fm"><b>J. Okafor</b><small>#0040</small></div><div className="fa" style={{ color: 'var(--red)' }}>Overdue</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Beat the accountant, short */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 36 }}>
            <div className="eyebrow">The expert in your pocket</div>
            <h2 className="h2">The brains of an accountant. None of the bill.</h2>
          </div>
          <div className="ba reveal" style={{ maxWidth: 900, margin: '0 auto' }}>
            <div className="old"><h3>A traditional accountant 😩</h3><ul>
              <li><span className="m">✕</span> £150 to £900 a year, just to file.</li>
              <li><span className="m">✕</span> You see them once, when it is too late to plan.</li>
              <li><span className="m">✕</span> A shoebox to dig out every January.</li>
              <li><span className="m">✕</span> Days for a simple answer.</li>
            </ul></div>
            <div className="new"><h3>The Lekhio way 😌</h3><ul>
              <li><span className="m">✓</span> One flat price, everything in.</li>
              <li><span className="m">✓</span> With you every day, not once a year.</li>
              <li><span className="m">✓</span> Snap as you go. Nothing to dig out.</li>
              <li><span className="m">✓</span> A real person replies fast, same chat.</li>
            </ul></div>
          </div>
        </div>
      </section>

      {/* Coming soon */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 38 }}>
            <div className="eyebrow" style={{ color: 'var(--saffron-deep)' }}>On the way</div>
            <h2 className="h2">Soon, Lekhio does the lot.</h2>
            <p className="lead">Every one keeps you in control, and never sends a thing without your yes.</p>
          </div>
          <div className="soongrid reveal">
            <div className="sooncard"><div className="se">📤</div><h3>File straight to HMRC</h3><p>Submit your quarterly updates and return from Lekhio, when you approve, through a recognised route.</p><span className="rbadge prog">HMRC RECOGNITION IN PROGRESS</span></div>
            <div className="sooncard"><div className="se">📊</div><h3>Your HMRC balance, live</h3><p>See exactly what you owe, what is due, and any refund building, right in the app.</p><span className="rbadge soon">COMING SOON</span></div>
            <div className="sooncard"><div className="se">🏦</div><h3>Connect your bank</h3><p>Money in and out logs itself, read only, so your books stay up to date with no effort.</p><span className="rbadge soon">BUILT · SWITCHING ON SOON</span></div>
            <div className="sooncard"><div className="se">🤖</div><h3>Agentic accountant</h3><p>An AI accountant that works your books for you, checks the tricky bits, and answers your questions.</p><span className="rbadge soon">COMING SOON</span></div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Snap it. Say it. Sorted.</h2>
            <p>Your whole back office, from a text. 30 days free, no card needed.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
      <script dangerouslySetInnerHTML={{ __html: PRODUCT_JS }} />
    </main>
  );
}
