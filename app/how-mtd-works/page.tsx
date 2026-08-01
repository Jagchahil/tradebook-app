import type { Metadata } from 'next';
import ClientScript from '../_shared/ClientScript';
import Link from 'next/link';
import {
  INK, PAPER, FONT, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta,
  Ic,
} from '../_shared/site';
import { FACTS } from '../../lib/taxengine';

export const metadata: Metadata = {
  alternates: { canonical: '/how-mtd-works' },
  title: 'How Making Tax Digital works, in plain English.',
  description:
    'Making Tax Digital, explained simply. Drag your gross income, turnover and rent before expenses, to see if and when it affects you. Keep digital records, send four short updates, and approve everything before it reaches HMRC. Lekhio keeps you ready.',
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE CHECKER ASKED FOR "YOUR INCOME" AND THEN TESTED IT AS IF IT WERE THE RIGHT NUMBER.
//
// The MTD for Income Tax test is on QUALIFYING INCOME: gross turnover plus gross rent, added
// together, before a single expense comes off. It is not profit. A sparky turning over £70,000 and
// keeping £45,000 read "your income", dragged to 45, and was told it starts for him in April 2027.
// He is in now, a year early, and we told him to relax. So the control names gross income, and says
// what that means, before he touches it.
//
// The thresholds come from lib/taxengine.ts, and the comparison is `>` because that is what
// mtdForIncomeTaxRequired does: qualifying income OVER £50,000, not £50,000 and up. Copying the
// figures out by hand is how the site and the engine end up disagreeing after a Budget.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const T26 = FACTS.mtdThreshold2026; // first mandated from April 2026
const T27 = FACTS.mtdThreshold2027; // April 2027
const T28 = FACTS.mtdThreshold2028; // April 2028
const gbp = (n: number) => `£${n.toLocaleString('en-GB')}`;

const MTD_CSS = `
.mkt .hero{padding:52px 0 12px}
.mkt .final{background:var(--band)}
.mkt .final p{color:rgba(255,255,255,.8)}
.checker{max-width:640px;margin:0 auto;background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:30px;box-shadow:var(--shadow)}
.checker .ct{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--tx-mut);text-align:center}
.checker .csub{font-size:13px;line-height:1.55;color:var(--tx-mut);text-align:center;max-width:430px;margin:8px auto 0}
.incomeval{font-size:44px;font-weight:900;letter-spacing:-.03em;text-align:center;margin:6px 0 4px}
.ltd{max-width:640px;margin:16px auto 0;background:var(--panel-2);border:1px solid var(--line);border-radius:14px;padding:15px 18px;font-size:13.5px;line-height:1.62;color:var(--tx-mut)}
.ltd b{color:var(--tx)}
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
.bigcard.new{background:linear-gradient(150deg,var(--river-panel),var(--river-panel-deep));color:#fff}
.bigcard .be{font-size:44px;margin-bottom:12px}
.bigcard h3{font-size:24px;margin:0 0 10px}
.bigcard p{font-size:15.5px;opacity:.9;max-width:440px;margin:0 auto}
.pantag{display:inline-block;margin-top:18px;font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px}
.bigcard.old .pantag{background:rgba(224,121,107,.2);color:#ffb4a8}
.bigcard.new .pantag{background:rgba(255,255,255,.2);color:#fff}
.tl{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;max-width:820px;margin:0 auto}
@media(max-width:760px){.tl{grid-template-columns:1fr 1fr}}
.tlnode{text-align:center}
.tldot{width:56px;height:56px;border-radius:999px;margin:0 auto 14px;display:grid;place-items:center;font-weight:900;font-size:20px;color:#fff;background:linear-gradient(135deg,var(--river-panel),var(--river-panel-deep));box-shadow:0 12px 26px rgba(27,89,166,.3);transform:scale(0);animation:tlpop .5s cubic-bezier(.2,1.6,.4,1) both}
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
.cred{background:linear-gradient(135deg,var(--river-panel-deep),var(--river-panel));border-radius:24px;padding:44px 32px;color:#fff;text-align:center}
.cred h2{color:#fff;font-size:clamp(24px,3.6vw,36px)}
.credrow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:24px}
.credchip{background:rgba(255,255,255,.14);border-radius:14px;padding:14px 18px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:9px}
.credchip b{font-weight:900}
`;

const MTD_JS = `
(function(){  function money(k){return '£'+(k*1000).toLocaleString('en-GB')+(k>=100?'+':'');}
  function checkMTD(){
    var slider=document.getElementById('slider');if(!slider)return;
    var k=+slider.value;var iv=document.getElementById('incomeVal');if(iv)iv.textContent=money(k);
    var r=document.getElementById('result');if(!r)return;var title,date,note,bg,col;
    var gross=k*1000;
    if(gross>${T26}){title='MTD applies to you now';date='FROM APRIL 2026';note='You send HMRC four short updates a year. Lekhio prepares every one, ready for your approval.';bg='var(--river-tint)';col='var(--river)';}
    else if(gross>${T27}){title='MTD applies from April 2027';date='THE ${gbp(T27)} THRESHOLD';note='You have time. Start now and your records are already ready when it kicks in.';bg='var(--saffron-tint)';col='var(--on-saffron-tint)';}
    else if(gross>${T28}){title='MTD applies from April 2028';date='THE ${gbp(T28)} THRESHOLD';note='Plenty of time. Lekhio keeps you ready either way, with zero effort.';bg='var(--saffron-tint)';col='var(--on-saffron-tint)';}
    else{title='Not required yet';date='${gbp(T28)} GROSS OR LESS';note='No MTD duty for now. Tidy books still save you money and stress, so Lekhio keeps you sorted.';bg='var(--green-tint)';col='var(--green)';}
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

      {/* Not "the self employed earning over £50k". The test catches landlords too, which is the
          whole point of our own /for-landlords page, and it runs on gross income rather than on
          what a man earns, which everybody reads as profit. Both wrong words are fixed here. */}
      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for sole traders and landlords with gross income over £{T26 / 1000}k. <span className="go">See if it affects you →</span></Link></div>
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
            <div className="ct">Does it affect you? Drag your gross income.</div>
            <div className="csub">Your turnover and any rent added together, before a single expense comes off. That is not your profit, which is the number most people reach for.</div>
            <div className="incomeval" id="incomeVal">£60,000</div>
            <input type="range" min="0" max="100" step="5" defaultValue="60" className="slider" id="slider" aria-label="Your gross income for the year, turnover and rent added together before expenses" />
            <div className="ticks"><span>£0</span><span>£{T28 / 1000}k</span><span>£{T27 / 1000}k</span><span>£{T26 / 1000}k</span><span>£100k+</span></div>
            <div className="result" id="result" style={{ background: 'var(--river-tint)' }}>
              <div className="rtitle" style={{ color: 'var(--river)' }}>MTD applies to you now</div>
              <div className="rdate" style={{ color: 'var(--river)' }}>FROM APRIL 2026</div>
              <div className="rnote">You send HMRC four short updates a year. Lekhio prepares every one, ready for your approval.</div>
            </div>
          </div>
          {/* Doc 103, and the standing question. Nothing was taken out to make room for this, so it
              has to earn a permanent place on its own: a director who reads the slider as his gets
              a due date for a return his company does not file, and he only finds out he was misled
              much later. One paragraph, no card, no section, and no company tax guide. The sentence
              is the one /app/setup and /app/tax/summary already give him, reused rather than
              reinvented, because one fact argued two ways is argued wrong once. */}
          <p className="ltd reveal">
            <b>Running a limited company?</b> Making Tax Digital for Income Tax covers self employment and rent on a personal return, and your company&apos;s trade is neither: the company files its own return. If you also have a sole trade or rent of your own, drag the slider for that income alone.
          </p>
          <p className="center mut" style={{ fontSize: 12.5, marginTop: 14 }}>A guide based on the announced thresholds, which are tested on gross qualifying income and never on profit. Your books stay ready with Lekhio either way.</p>
        </div>
      </section>

      {/* What it asks */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}><h2 className="h2">Three simple things.</h2><p className="lead">Lekhio does the first two. You stay in charge of the third.</p></div>
          <div className="g3 reveal">
            <div className="mcard"><div className="ci" style={{ background: 'var(--river-tint)', color: 'var(--river)' }}><Ic e="🗂️" color="var(--river)" size={24} /></div><h3>Keep digital records</h3><p>HMRC wants income and costs kept digitally. Lekhio logs every receipt and payment as you go.</p></div>
            <div className="mcard"><div className="ci" style={{ background: 'var(--saffron-tint)', color: 'var(--saffron-deep)' }}><Ic e="📨" color="var(--saffron-deep)" size={24} /></div><h3>Send four short updates</h3><p>Four times a year you send HMRC your figures for the year so far. Each one restates the year and replaces the last, so nothing has to be perfect first time. Lekhio prepares each one.</p></div>
            <div className="mcard"><div className="ci" style={{ background: 'var(--green-tint)', color: 'var(--green)' }}><Ic e="🤝" color="var(--green)" size={24} /></div><h3>You stay in control</h3><p>Nothing goes to HMRC until you say yes. Lekhio keeps you ready. The final say is always yours.</p></div>
          </div>
        </div>
      </section>

      {/* Old vs new toggle */}
      <section>
        <div className="wrap center">
          <div className="reveal" style={{ marginBottom: 8 }}><div className="eyebrow">The change, in one tap</div><h2 className="h2">The old way, and the new way.</h2></div>
          <div className="seg reveal" id="seg" style={{ marginTop: 24 }}><button className="on" data-p="old">The old way</button><button data-p="new">The new way</button></div>
          <div className="onpanel on" id="p-old" data-panel="old"><div className="bigcard old"><div className="be">📦</div><h3>One big return, once a year</h3><p>A shoebox of receipts, a lost weekend, and the January panic. One deadline where everything has to be right at once, with no time left to plan.</p><span className="pantag">📅 January: panic</span></div></div>
          <div className="onpanel" id="p-new" data-panel="new"><div className="bigcard new"><div className="be">✅</div><h3>Four short check-ins</h3><p>Four times a year, each one covering the year so far and each one prepared for you. You check it, you send it. No panic, no shoebox, no scramble.</p><span className="pantag">😌 Sorted, all year</span></div></div>
        </div>
      </section>

      {/* Timeline */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 38 }}><h2 className="h2">Your year, in four easy updates.</h2><p className="lead">Each one covers from 6 April up to the date shown, so every update restates the year so far and replaces the one before it. Lekhio prepares it, you check it over a brew and send it.</p></div>
          <div className="reveal">
            <div className="tlbar"><i /></div>
            <div className="tl">
              <div className="tlnode"><div className="tldot">1</div><b>Update 1</b><small>To 5 Jul</small></div>
              <div className="tlnode"><div className="tldot">2</div><b>Update 2</b><small>To 5 Oct</small></div>
              <div className="tlnode"><div className="tldot">3</div><b>Update 3</b><small>To 5 Jan</small></div>
              <div className="tlnode"><div className="tldot">4</div><b>Update 4</b><small>To 5 Apr</small></div>
            </div>
          </div>
        </div>
      </section>

      {/* Effortless flow */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}><div className="eyebrow">Effortless</div><h2 className="h2">You barely lift a finger.</h2></div>
          <div className="flow reveal">
            <div className="fbox"><div className="fe"><Ic e="💬" color="var(--river)" size={26} /></div><b>You text as you go</b><small>Receipts, voice notes, payments</small></div>
            <div className="farrow">→</div>
            <div className="fbox"><div className="fe"><Ic e="📊" color="var(--saffron-deep)" size={26} /></div><b>Your summary builds itself</b><small>Sorted and ready, all year</small></div>
            <div className="farrow">→</div>
            <div className="fbox"><div className="fe"><Ic e="✅" color="var(--green)" size={26} /></div><b>You approve and send</b><small>Nothing goes without your yes</small></div>
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
              <div className="credchip"><span>Checked against HMRC&apos;s <b>2026/27 rules</b></span></div>
              <div className="credchip"><span>MTD-ready today</span></div>
              <div className="credchip"><span>HMRC recognition <b>in progress</b></span></div>
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
            <p>Start now and your records build themselves. 7 days free, no card needed.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
      <ClientScript js={MTD_JS} />
    </main>
  );
}
