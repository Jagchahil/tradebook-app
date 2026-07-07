import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, PAPER, FONT, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'How Making Tax Digital works, in plain English.',
  description:
    'Making Tax Digital, explained simply. Drag your income to see if and when it affects you. Keep digital records, send four short updates, and approve everything before it reaches HMRC. Lekhio keeps you ready.',
};

const MTD_CSS = `
.mkt .hero{padding:52px 0 12px}
.mkt .final{background:var(--band)}
.mkt .final p{color:rgba(255,255,255,.8)}
.checker{max-width:640px;margin:0 auto;background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:30px;box-shadow:var(--shadow)}
.checker .ct{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--tx-mut);text-align:center}
.incomeval{font-size:44px;font-weight:900;letter-spacing:-.03em;text-align:center;margin:6px 0 4px}
.slider{width:100%;-webkit-appearance:none;appearance:none;height:10px;border-radius:999px;background:linear-gradient(90deg,var(--green),var(--saffron),var(--river));outline:none;margin:14px 0 8px}
.slider::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;border-radius:999px;background:#fff;border:3px solid var(--river);cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.slider::-moz-range-thumb{width:30px;height:30px;border-radius:999px;background:#fff;border:3px solid var(--river);cursor:pointer}
.ticks{display:flex;justify-content:space-between;font-size:11px;color:var(--tx-mut);font-weight:600;margin-bottom:18px}
.result{border-radius:16px;padding:18px;text-align:center;transition:.3s}
.result .rtitle{font-size:22px;font-weight:900;letter-spacing:-.02em}
.result .rdate{font-size:13px;font-weight:800;margin-top:2px}
.result .rnote{font-size:14px;color:var(--tx-mut);margin-top:8px;max-width:420px;margin-inline:auto}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:860px){.g3{grid-template-columns:1fr}}
.mcard{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:var(--shadow);transition:transform .3s,border-color .3s}
.mcard:hover{transform:translateY(-5px);border-color:var(--river)}
.mcard .ci{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;font-size:25px;margin-bottom:14px}
.mcard h3{font-size:18px;margin:0 0 8px}.mcard p{font-size:15px;color:var(--tx-mut);margin:0}
.seg{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:14px;padding:5px;gap:4px;margin-bottom:26px}
.seg button{padding:11px 20px;border-radius:10px;border:0;background:transparent;font-family:inherit;font-weight:700;font-size:14px;color:var(--tx-mut);cursor:pointer;transition:.2s}
.seg button.on{background:var(--panel);color:var(--tx);box-shadow:0 2px 8px rgba(0,0,0,.1)}
.onpanel{display:none;max-width:640px;margin:0 auto;animation:mfade .4s}
.onpanel.on{display:block}
@keyframes mfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bigcard{border-radius:22px;padding:34px;text-align:center}
.bigcard.old{background:var(--band);color:#fff}
.bigcard.new{background:linear-gradient(150deg,var(--river),var(--river-deep));color:#fff}
.bigcard .be{font-size:44px;margin-bottom:12px}
.bigcard h3{font-size:24px;margin:0 0 10px}
.bigcard p{font-size:15.5px;opacity:.9;max-width:440px;margin:0 auto}
.pantag{display:inline-block;margin-top:18px;font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px}
.bigcard.old .pantag{background:rgba(224,121,107,.2);color:#ffb4a8}
.bigcard.new .pantag{background:rgba(255,255,255,.2);color:#fff}
.tl{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;max-width:820px;margin:0 auto}
@media(max-width:760px){.tl{grid-template-columns:1fr 1fr}}
.tlnode{text-align:center}
.tldot{width:56px;height:56px;border-radius:999px;margin:0 auto 14px;display:grid;place-items:center;font-weight:900;font-size:20px;color:#fff;background:linear-gradient(135deg,var(--river),var(--river-deep));box-shadow:0 12px 26px rgba(27,89,166,.3);transform:scale(0);animation:tlpop .5s cubic-bezier(.2,1.6,.4,1) both}
.tlnode:nth-child(1) .tldot{animation-delay:.05s}
.tlnode:nth-child(2) .tldot{animation-delay:.17s}
.tlnode:nth-child(3) .tldot{animation-delay:.29s}
.tlnode:nth-child(4) .tldot{animation-delay:.41s}
@keyframes tlpop{to{transform:scale(1)}}
.tlnode b{font-size:15px;display:block}.tlnode small{font-size:12.5px;color:var(--tx-mut)}
.tlbar{height:4px;border-radius:2px;background:var(--line);max-width:660px;margin:0 auto 30px;position:relative;overflow:hidden}
.tlbar i{position:absolute;left:0;top:0;height:100%;width:0;background:linear-gradient(90deg,var(--river),var(--saffron));border-radius:2px;animation:tlgrow 1.4s cubic-bezier(.2,.7,.3,1) both .3s}
@keyframes tlgrow{to{width:100%}}
.flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:center;max-width:900px;margin:0 auto}
@media(max-width:820px){.flow{grid-template-columns:1fr;gap:12px}.farrow{transform:rotate(90deg);margin:0 auto}}
.fbox{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;text-align:center;box-shadow:var(--shadow)}
.fbox .fe{font-size:30px;margin-bottom:8px}.fbox b{font-size:15px;display:block;margin-bottom:4px}.fbox small{font-size:13px;color:var(--tx-mut)}
.farrow{font-size:24px;color:var(--saffron);font-weight:900;text-align:center}
.cred{background:linear-gradient(135deg,var(--river-deep),var(--river));border-radius:24px;padding:44px 32px;color:#fff;text-align:center}
.cred h2{color:#fff;font-size:clamp(24px,3.6vw,36px)}
.credrow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:24px}
.credchip{background:rgba(255,255,255,.14);border-radius:14px;padding:14px 18px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:9px}
.credchip b{font-weight:900}
`;

const MTD_JS = `
(function(){
  if(window.__lekMtd)return;window.__lekMtd=true;
  function money(k){return '£'+(k*1000).toLocaleString('en-GB')+(k>=100?'+':'');}
  function checkMTD(){
    var slider=document.getElementById('slider');if(!slider)return;
    var k=+slider.value;var iv=document.getElementById('incomeVal');if(iv)iv.textContent=money(k);
    var r=document.getElementById('result');if(!r)return;var title,date,note,bg,col;
    if(k>=50){title='MTD applies to you now';date='FROM APRIL 2026';note='You send HMRC four short updates a year. Lekhio prepares every one, ready for your approval.';bg='var(--river-tint)';col='var(--river)';}
    else if(k>=30){title='MTD applies from April 2027';date='THE £30,000 THRESHOLD';note='You have time. Start now and your records are already ready when it kicks in.';bg='var(--saffron-tint)';col='var(--saffron-deep)';}
    else if(k>=20){title='MTD applies from April 2028';date='THE £20,000 THRESHOLD';note='Plenty of time. Lekhio keeps you ready either way, with zero effort.';bg='var(--saffron-tint)';col='var(--saffron-deep)';}
    else{title='Not required yet';date='UNDER £20,000';note='No MTD duty for now. Tidy books still save you money and stress, so Lekhio keeps you sorted.';bg='var(--green-tint)';col='var(--green)';}
    r.style.background=bg;
    r.innerHTML='<div class="rtitle" style="color:'+col+'">'+title+'</div><div class="rdate" style="color:'+col+'">'+date+'</div><div class="rnote">'+note+'</div>';
  }
  function wire(){
    var slider=document.getElementById('slider');
    if(slider){slider.addEventListener('input',checkMTD);checkMTD();}
    document.querySelectorAll('#seg button').forEach(function(b){b.addEventListener('click',function(){
      document.querySelectorAll('#seg button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');
      var p=b.getAttribute('data-p');
      document.querySelectorAll('.onpanel').forEach(function(pn){pn.classList.toggle('on',pn.getAttribute('data-panel')===p);});
    });});
  }
  if(document.readyState!=='loading')wire();else document.addEventListener('DOMContentLoaded',wire);
})();
`;

export default function HowMtdWorksPage() {
  return (
    <main className="mkt" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: MTD_CSS }} />

      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for the self employed earning over £50k. <span className="go">See if it affects you →</span></Link></div>
      <SiteNav />

      {/* Hero */}
      <section className="hero center">
        <div className="wrap">
          <span className="pill"><span className="dot" /> Plain English, no jargon</span>
          <h1 style={{ marginTop: 20 }}>Making Tax Digital,<br /><span className="gt">without the stress.</span></h1>
          <p className="sub">HMRC is moving tax online. It sounds like more work. With Lekhio it is less, because your records build themselves.</p>
        </div>
      </section>

      {/* Interactive checker */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="checker reveal">
            <div className="ct">Does it affect you? Drag your income.</div>
            <div className="incomeval" id="incomeVal">£60,000</div>
            <input type="range" min="0" max="100" step="5" defaultValue="60" className="slider" id="slider" aria-label="Your income" />
            <div className="ticks"><span>£0</span><span>£20k</span><span>£30k</span><span>£50k</span><span>£100k+</span></div>
            <div className="result" id="result" style={{ background: 'var(--river-tint)' }}>
              <div className="rtitle" style={{ color: 'var(--river)' }}>MTD applies to you now</div>
              <div className="rdate" style={{ color: 'var(--river)' }}>FROM APRIL 2026</div>
              <div className="rnote">You send HMRC four short updates a year. Lekhio prepares every one, ready for your approval.</div>
            </div>
          </div>
          <p className="center mut" style={{ fontSize: 12.5, marginTop: 14 }}>A guide based on the announced thresholds. Your books stay ready with Lekhio either way.</p>
        </div>
      </section>

      {/* What it asks */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}><h2 className="h2">Three simple things.</h2><p className="lead">Lekhio does the first two. You stay in charge of the third.</p></div>
          <div className="g3 reveal">
            <div className="mcard"><div className="ci" style={{ background: 'var(--river-tint)', color: 'var(--river)' }}>🗂️</div><h3>Keep digital records</h3><p>HMRC wants income and costs kept digitally. Lekhio logs every receipt and payment as you go.</p></div>
            <div className="mcard"><div className="ci" style={{ background: 'var(--saffron-tint)', color: 'var(--saffron-deep)' }}>📨</div><h3>Send four short updates</h3><p>Four quick summaries across the year instead of one big return. Lekhio prepares each one.</p></div>
            <div className="mcard"><div className="ci" style={{ background: 'var(--green-tint)', color: 'var(--green)' }}>🤝</div><h3>You stay in control</h3><p>Nothing goes to HMRC until you say yes. Lekhio keeps you ready. The final say is always yours.</p></div>
          </div>
        </div>
      </section>

      {/* Old vs new toggle */}
      <section>
        <div className="wrap center">
          <div className="reveal" style={{ marginBottom: 8 }}><div className="eyebrow">The change, in one tap</div><h2 className="h2">The old way, and the new way.</h2></div>
          <div className="seg reveal" id="seg" style={{ marginTop: 24 }}><button className="on" data-p="old">The old way</button><button data-p="new">The new way</button></div>
          <div className="onpanel on" id="p-old" data-panel="old"><div className="bigcard old"><div className="be">📦</div><h3>One big return, once a year</h3><p>A shoebox of receipts, a lost weekend, and the January panic. One deadline where everything has to be right at once, with no time left to plan.</p><span className="pantag">📅 January: panic</span></div></div>
          <div className="onpanel" id="p-new" data-panel="new"><div className="bigcard new"><div className="be">✅</div><h3>Four short check-ins</h3><p>Four quick summaries across the year, each one prepared for you. You check it, you send it. No panic, no shoebox, no scramble.</p><span className="pantag">😌 Sorted, all year</span></div></div>
        </div>
      </section>

      {/* Timeline */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 38 }}><h2 className="h2">Your year, in four easy updates.</h2><p className="lead">Each one is a quick summary Lekhio prepares. You check it over a brew and send it.</p></div>
          <div className="reveal">
            <div className="tlbar"><i /></div>
            <div className="tl">
              <div className="tlnode"><div className="tldot">1</div><b>Update 1</b><small>Summer</small></div>
              <div className="tlnode"><div className="tldot">2</div><b>Update 2</b><small>Autumn</small></div>
              <div className="tlnode"><div className="tldot">3</div><b>Update 3</b><small>Winter</small></div>
              <div className="tlnode"><div className="tldot">4</div><b>Update 4</b><small>Spring</small></div>
            </div>
          </div>
        </div>
      </section>

      {/* Effortless flow */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}><div className="eyebrow">Effortless</div><h2 className="h2">You barely lift a finger.</h2></div>
          <div className="flow reveal">
            <div className="fbox"><div className="fe">💬</div><b>You text as you go</b><small>Receipts, voice notes, payments</small></div>
            <div className="farrow">→</div>
            <div className="fbox"><div className="fe">📊</div><b>Your summary builds itself</b><small>Sorted and ready, all year</small></div>
            <div className="farrow">→</div>
            <div className="fbox"><div className="fe">✅</div><b>You approve and send</b><small>Nothing goes without your yes</small></div>
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section>
        <div className="wrap">
          <div className="cred reveal">
            <h2>Built by the book. Better than the rest.</h2>
            <p style={{ color: 'rgba(255,255,255,.86)', fontSize: 17, maxWidth: 560, margin: '14px auto 0' }}>While others leave you to it, Lekhio keeps you ready and does the sums properly.</p>
            <div className="credrow">
              <div className="credchip">📐 <span>Checked against HMRC&apos;s <b>2026/27 rules</b>, 104 test cases</span></div>
              <div className="credchip">✅ <span>MTD-ready today</span></div>
              <div className="credchip">🏛️ <span>HMRC recognition <b>in progress</b></span></div>
              <div className="credchip">🇬🇧 <span>A real UK company</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Get ready for MTD without lifting a finger.</h2>
            <p>Start now and your records build themselves. 14 days free, no card needed.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
      <script dangerouslySetInnerHTML={{ __html: MTD_JS }} />
    </main>
  );
}
