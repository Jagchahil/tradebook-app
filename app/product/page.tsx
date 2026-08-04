import type { Metadata } from 'next';
import ClientScript from '../_shared/ClientScript';
// alertChannels: the email half of this was never true. See lib/features.ts remindersLive().
import { filingBadge, bankBadge, alertChannels } from '../../lib/features';
import { css } from '../../lib/tokens';
import Link from 'next/link';
import OnboardingShow from './OnboardingShow';
import {
  INK, PAPER, FONT, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta, Ic,
} from '../_shared/site';

export const metadata: Metadata = {
  alternates: { canonical: '/product' },
  title: 'What Lekhio does. The first employee your business hires.',
  // ⚠️ THE SEARCH RESULT HAS TO MATCH THE PAGE. This said "Connect your bank" while the card
  // further down correctly badges that feature BUILT, SWITCHING ON SOON from bankBadge().
  description:
    'Lekhio keeps the books, works out the tax, chases the invoices and finds what you are owed, then brings it to you to sign off. Receipts, mileage, invoices, CIS and quarterly tax. £12.99 a month, and you approve before anything reaches HMRC.',
};

const PRODUCT_CSS = css`
.mkt .hero{padding:52px 0 20px}
.mkt .hero .cta-row{justify-content:center}
.mkt .hero .sub{font-size:20px;color:var(--tx-mut);max-width:560px;margin:20px auto 26px}
.featgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1000px;margin:0 auto}
@media(max-width:900px){.featgrid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.featgrid{grid-template-columns:1fr}}
.featcard{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;text-align:left;box-shadow:var(--shadow)}
.featcard .fe{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:20px;margin-bottom:12px}
.featcard h3{font-size:15.5px;margin:0 0 5px;letter-spacing:-.01em}
.featcard p{font-size:13px;color:var(--tx-mut);margin:0;line-height:1.5}
.compliance{margin:28px auto 0;max-width:880px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px 24px;display:flex;flex-wrap:wrap;gap:14px 34px;align-items:center;justify-content:center;box-shadow:var(--shadow)}
.compliance .ci{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:var(--tx-mut)}
.compliance b{color:var(--tx);font-weight:800}
.wphone{width:290px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:30px;overflow:hidden;box-shadow:0 30px 70px rgba(17,17,17,.2)}
[data-theme="dark"] .wphone{box-shadow:0 30px 70px rgba(0,0,0,.6)}
/* Own tokens, not Meta's. See the note on the hero in app/_shared/site.tsx: the illustration
   is the outcome and stays, the borrowed brand palette is the technology and goes. Tokens also
   delete the dark override that existed only to undo the borrowed green. */
.wahead{background:var(--river-deep);color:#fff;padding:12px 15px;display:flex;align-items:center;gap:9px}
.wahead .a{width:32px;height:32px;border-radius:999px;background:var(--river);display:grid;place-items:center;font-size:15px}
.wahead b{font-size:13px;display:block}.wahead small{font-size:10px;opacity:.85}
.wchat{background:var(--panel-2);padding:14px 12px;min-height:250px;display:flex;flex-direction:column;gap:8px}
.wb{max-width:84%;padding:8px 11px;font-size:13px;border-radius:12px;color:var(--tx)}
.wb.out{align-self:flex-end;background:var(--river-tint);color:var(--river-deep);border-bottom-right-radius:4px}
.wb.in{align-self:flex-start;background:var(--panel);border:1px solid var(--bd);border-bottom-left-radius:4px}
.wb .rc{background:var(--surface);border:1px solid var(--bd);border-radius:8px;padding:12px;text-align:center;font-size:20px;margin-bottom:4px}
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
.ftab{display:flex;align-items:center;gap:8px;font-family:inherit;padding:11px 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--panel);font-weight:700;font-size:14px;cursor:pointer;transition:.2s;color:var(--tx)}
.ftab:hover{border-color:var(--river);transform:translateY(-2px)}
.ftab.on{background:var(--river);color:var(--on-river);border-color:var(--river);box-shadow:0 8px 20px rgba(27,89,166,.3)}
.fstage{display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center;max-width:900px;margin:0 auto;min-height:280px}
@media(max-width:820px){.fstage{grid-template-columns:1fr;gap:24px}}
.ftext h3{font-size:26px;margin:0 0 10px}
.ftext p{font-size:16px;color:var(--tx-mut)}
.fdemo{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:18px;box-shadow:var(--shadow);min-height:200px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.db{max-width:86%;padding:9px 12px;font-size:13.5px;border-radius:12px;margin:6px 0;opacity:0;transform:translateY(8px);animation:dbin .45s forwards}
/* Own tokens, not Meta's. Same reason as .wb.out above. */
.db.out{align-self:flex-end;margin-left:auto;background:var(--river-tint);color:var(--river-deep);border-bottom-right-radius:4px}
.db.in{align-self:flex-start;background:var(--panel-2);border-bottom-left-radius:4px}
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
.ttab{padding:9px 15px;font-family:inherit;border-radius:999px;border:1px solid var(--line);background:var(--panel);font-weight:700;font-size:13px;cursor:pointer;transition:.2s;color:var(--tx)}
.ttab.on{background:var(--river);color:var(--on-river);border-color:var(--river)}
.bignum{background:linear-gradient(135deg,var(--river-panel),var(--river-panel-deep));border-radius:16px;padding:16px;color:#fff}
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
.rbadge.live{color:var(--green);background:var(--green-tint)}
.helpers{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:940px;margin:0 auto}
@media(max-width:820px){.helpers{grid-template-columns:1fr}}
.helpercard{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px;box-shadow:var(--shadow)}
.helpercard.rakha{border-top:3px solid var(--saffron)}
.helpercard.ai{border-top:3px solid var(--river)}
.helpercard .hic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-size:22px;margin-bottom:14px}
.helpercard.ai .hic{background:var(--river-tint)}
.helpercard.rakha .hic{background:var(--saffron-tint)}
.helpercard h3{font-size:20px;margin:0 0 4px;letter-spacing:-.02em}
.helpercard .htag{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--tx-mut);margin-bottom:12px}
.helpercard p{font-size:15px;color:var(--tx-mut);line-height:1.6;margin:0 0 10px}
.helpercard .hname{font-size:12.5px;color:var(--tx-mut);font-style:italic}
/* Content is visible by default; motion is an enhancement, never a gate. */
.mkt .reveal{opacity:1;transform:none}
`;

const PRODUCT_JS = `
(function(){  var FEAT=[
   {t:'Snap a receipt',p:'Photograph it and Lekhio pulls the shop, the total and the date, and files it in seconds.',demo:'<div class="db out d1"><div style="background:var(--surface);border:1px solid var(--bd);border-radius:8px;padding:12px;text-align:center;font-size:20px;margin-bottom:4px">🧾</div>Screwfix receipt</div><div class="db in d2">Logged. £42.60, materials ✅</div><div class="db in d3" style="background:transparent;font-size:12px;color:var(--tx-mut)">Screwfix · Materials · 3 Jul</div>'},
   {t:'Say it out loud',p:'Hands full on the job? Leave a voice note. Lekhio hears it and logs it before you have put the phone down.',demo:'<div class="db out d1" style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">🎙️</span><span class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div><div class="db out d2">"spent forty on diesel"</div><div class="db in d3">£40 fuel, logged ✅</div>'},
   {t:'Mileage in a text',p:'Text the trip. Lekhio works out the claim at the HMRC rate and logs it. No fiddly logbook.',demo:'<div class="db out d1">drove 24 miles to the job</div><div class="db in d2">£13.20 mileage claimed at the HMRC rate ✅</div><div class="db in d3" style="background:transparent;font-size:12px;color:var(--tx-mut)">55p a mile · logged to travel</div>'},
   {t:'Invoice from a text',p:'Type it in plain words. Lekhio builds a clean invoice and sends it, then tracks who has paid.',demo:'<div class="db out d1">invoice Dave £450 for the rewire</div><div class="db in d2">Invoice #0043 sent to Dave ✅</div><div class="db in d3">Dave paid. +£450 income 💷</div>'},
   {t:'CIS done right',p:'Lekhio splits labour and materials, applies your deduction, and tracks the refund building up all year.',demo:'<div class="db out d1">£400 paid, £80 CIS deducted</div><div class="db in d2">Gross £400 logged, £80 CIS held 🏗️</div><div class="db in d3" style="background:transparent;font-size:12px;color:var(--tx-mut)">Refund building up: £1,120 ↗</div>'},
   {t:'Ask it anything',p:'Not sure what counts? Ask in plain words. Lekhio answers straight, the grey areas included.',demo:'<div class="db out d1">can I claim my work boots?</div><div class="db in d2">Yes 👍 protective boots for the job are allowable.</div><div class="db in d3">Want me to note them for you?</div>'}
  ];
  function showFeat(i){
    document.querySelectorAll('#ftabs .ftab').forEach(function(t){
      var on=+t.getAttribute('data-f')===i;
      t.classList.toggle('on',on);
      t.setAttribute('aria-selected',on?'true':'false');
    });
    document.getElementById('ftext').innerHTML='<h3>'+FEAT[i].t+'</h3><p>'+FEAT[i].p+'</p>';
    document.getElementById('fdemo').innerHTML=FEAT[i].demo;
  }
  function showTour(i){
    document.querySelectorAll('#ttabs .ttab').forEach(function(t){
      var on=+t.getAttribute('data-t')===i;
      t.classList.toggle('on',on);
      t.setAttribute('aria-selected',on?'true':'false');
    });
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

      <SiteNav />

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          🔴 THE HERO SOLD THE BUTTONS. "Snap it. Say it. Sorted." over "the whole back office, in
          one chat" describes what your THUMB does, and doc 104 is one line long about that: sell
          the outcome, never the technology. Lekhio is not software you buy, it is the first
          employee a business ever hires, and an employee is described by the job it does.
          ⚠️ THE PRICE IS IN THE HERO ON PURPOSE. It is the argument, not a detail: nobody else in
          this market will do this work for £12.99, and a man comparing us to an accountant or to
          an evening of his own time needs the number in front of him before the feature list.
          Doc 108 still holds, and this does not break it: we price on the WORK, never on the
          saving. There is no "saves you £600" here and there never will be.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      <section className="hero center">
        <div className="wrap">
          <span className="pill"><span className="dot" /> Your first employee</span>
          <h1 style={{ marginTop: 20 }}>Somebody to do<br /><span className="gt">the paperwork.</span></h1>
          <p className="sub">Lekhio is the first person your business hires. It keeps the books, works out the tax, finds what you are owed, and brings you the answer. You say yes. It costs £12.99 a month.</p>
          <div className="cta-row"><Link href="/start" className="btn primary">Start free</Link><Link href="/pricing" className="btn ghost">See pricing</Link></div>
        </div>
      </section>

      {/* App main features at a glance */}
      <section style={{ paddingTop: 8 }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 28 }}>
            {/* 🔴 "Everything it does" IS A SPEC SHEET, AND A SPEC SHEET IS THE WRONG DOCUMENT.
                Eight cards under "everything it does" is how software is sold. An employee is
                described by the job, so the heading is the job and the cards are the tasks in it.
                Not one card was cut and not one word of what it can do was lost: the same eight
                things, said as work somebody does for you rather than as features you operate. */}
            <div className="eyebrow">The job</div>
            <h2 className="h2">What it does all week, so you do not.</h2>
            <p className="lead">Ten seconds of yours. The rest is its problem, and it never clocks off.</p>
          </div>
          <div className="featgrid reveal">
            <div className="featcard"><div className="fe" style={{ background: 'var(--river-tint)' }}><Ic e="📸" color="var(--river)" size={26} /></div><h3>Files your receipts</h3><p>Photograph it and forget it. It reads the shop, the total and the date, and puts it where it belongs.</p></div>
            <div className="featcard"><div className="fe" style={{ background: 'var(--saffron-tint)' }}><Ic e="🎙️" color="var(--saffron-deep)" size={26} /></div><h3>Takes it down as you say it</h3><p>&quot;Spent 40 on diesel.&quot; Said out loud with your hands full, or typed. Either way it is logged.</p></div>
            <div className="featcard"><div className="fe" style={{ background: 'var(--green-tint)' }}><Ic e="🚐" color="var(--green)" size={26} /></div><h3>Claims your mileage</h3><p>&quot;Drove 24 miles.&quot; It knows the rate, does the sum, and puts the claim in for you.</p></div>
            <div className="featcard"><div className="fe" style={{ background: 'var(--river-tint)' }}><Ic e="🧾" color="var(--river)" size={22} /></div><h3>Sends the invoices</h3><p>Written, sent, and chased when they run late, which is the part everybody puts off.</p></div>
            <div className="featcard"><div className="fe" style={{ background: 'var(--saffron-tint)' }}><Ic e="👷" color="var(--saffron-deep)" size={26} /></div><h3>Watches your CIS refund</h3><p>Every deduction tracked all year, so the money you are owed back is counted and not forgotten.</p></div>
            <div className="featcard"><div className="fe" style={{ background: 'var(--river-tint)' }}><Ic e="📊" color="var(--river)" size={26} /></div><h3>Tells you what to put by</h3><p>One number, honest, kept up to date as you earn, so January is not a shock.</p></div>
            <div className="featcard"><div className="fe" style={{ background: 'var(--green-tint)' }}><Ic e="📈" color="var(--green)" size={26} /></div><h3>Goes looking for money</h3><p>Every legal relief you are entitled to, checked against your own figures, with the working shown.</p></div>
            <div className="featcard"><div className="fe" style={{ background: 'var(--saffron-tint)' }}><Ic e="✅" color="var(--saffron-deep)" size={26} /></div><h3>Brings it to you to sign off</h3><p>Your quarterly figures prepared and ready. Nothing goes anywhere until you say yes.</p></div>
          </div>
          <div className="compliance reveal">
            <div className="ci">Every figure <b>checked against HMRC&apos;s 2026/27 rules</b></div>
            <div className="ci"><b>2026/27 rates</b>, every one a published figure</div>
            <div className="ci"><b>Nothing filed</b> without your yes</div>
          </div>
        </div>
      </section>

      {/* Journey demo */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}>
            {/* Showing beats telling, so the demo stays exactly as it was. Only the framing
                moved: this is not "look how the messaging works", it is "look how little you do". */}
            <div className="eyebrow">Your half of the work</div>
            <h2 className="h2">You send one line. That is your job done.</h2>
            <p className="lead">Seconds later it is read, sorted, filed and counted, without you opening anything.</p>
          </div>
          <div className="journey reveal">
            <div>
              <div className="jlabel">1 · What you do</div>
              <div className="wphone">
                <div className="wahead"><span className="a">✅</span><div><b>Lekhio</b><small>your first employee</small></div></div>
                <div className="wchat">
                  <div className="wb out jA"><div className="rc">🧾</div>Screwfix receipt</div>
                  <div className="wb in jB">Logged. £42.60, materials ✅</div>
                </div>
              </div>
            </div>
            <div className="jarrow">→</div>
            <div>
              <div className="jlabel">2 · What it does</div>
              <div className="jphone">
                <div className="appbar"><b>Feed</b><Ic e="🔔" color="var(--tx-mut)" size={16} /></div>
                <div className="appbody">
                  <div className="feedcard jC" style={{ borderColor: 'var(--saffron)' }}><div className="fi" style={{ background: 'var(--saffron-tint)' }}><Ic e="🧾" color="var(--saffron-deep)" size={22} /></div><div className="fm"><b>Screwfix</b><small>Materials · just now</small></div><div className="fa">-£42.60</div></div>
                  <div className="feedcard"><div className="fi"><Ic e="⛽" color="var(--river)" size={22} /></div><div className="fm"><b>BP</b><small>Fuel · today</small></div><div className="fa">-£62.00</div></div>
                  <div className="feedcard"><div className="fi" style={{ background: 'var(--green-tint)' }}><Ic e="💷" color="var(--green)" size={22} /></div><div className="fm"><b>Dave Wilson</b><small>Invoice · today</small></div><div className="fa" style={{ color: 'var(--green)' }}>+£400</div></div>
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
            {/* "One chat" is the channel again, and the channel is not the product. What a man
                is choosing between is doing this himself and having it done. */}
            <div className="eyebrow">Tap one, watch it happen</div>
            <h2 className="h2">Handed over, not learned.</h2>
          </div>
          {/* Real buttons, not divs: a div is not focusable and cannot be reached
              or activated with a keyboard, so these tabs were invisible to anyone
              not using a mouse. Buttons also pick up the focus ring in A11Y_CSS. */}
          <div className="ftabs reveal" id="ftabs" role="tablist" aria-label="What Lekhio does" style={{ marginTop: 26 }}>
            <button type="button" className="ftab on" data-f="0" role="tab" aria-selected="true">Receipt</button>
            <button type="button" className="ftab" data-f="1" role="tab" aria-selected="false">Voice</button>
            <button type="button" className="ftab" data-f="2" role="tab" aria-selected="false">Mileage</button>
            <button type="button" className="ftab" data-f="3" role="tab" aria-selected="false">Invoice</button>
            <button type="button" className="ftab" data-f="4" role="tab" aria-selected="false">CIS</button>
            <button type="button" className="ftab" data-f="5" role="tab" aria-selected="false">Ask</button>
          </div>
          <div className="fstage reveal">
            <div className="ftext" id="ftext"><h3>Snap a receipt</h3><p>Photograph it and Lekhio pulls the shop, the total and the date, and files it in seconds.</p></div>
            <div className="fdemo" id="fdemo">
              <div className="db out d1"><div style={{ background: 'var(--surface)', border: '1px solid var(--bd)', borderRadius: 8, padding: 12, textAlign: 'center', fontSize: 20, marginBottom: 4 }}>🧾</div>Screwfix receipt</div>
              <div className="db in d2">Logged. £42.60, materials ✅</div>
              <div className="db in d3" style={{ background: 'transparent', fontSize: 12, color: 'var(--tx-mut)' }}>Screwfix · Materials · 3 Jul</div>
            </div>
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
            <div className="ttabs" id="ttabs" role="tablist" aria-label="A tour of the app"><button type="button" className="ttab on" data-t="0" role="tab" aria-selected="true">Feed</button><button type="button" className="ttab" data-t="1" role="tab" aria-selected="false">Money</button><button type="button" className="ttab" data-t="2" role="tab" aria-selected="false">Invoices</button></div>
            <div className="tourphone">
              <div className="tourscreen">
                <div className="tslides" id="tslides">
                  <div className="tslide">
                    <div className="appbar" style={{ padding: '6px 4px 12px' }}><b>Feed</b><Ic e="🔔" color="var(--tx-mut)" size={16} /></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--saffron-tint)' }}><Ic e="🧾" color="var(--saffron-deep)" size={22} /></div><div className="fm"><b>Screwfix</b><small>Materials · 2m</small></div><div className="fa">-£42.60</div></div>
                    <div className="feedcard"><div className="fi"><Ic e="⛽" color="var(--river)" size={22} /></div><div className="fm"><b>BP</b><small>Fuel · 1h</small></div><div className="fa">-£62.00</div></div>
                    <div className="feedcard" style={{ borderColor: 'var(--green)' }}><div className="fi" style={{ background: 'var(--green-tint)' }}><Ic e="💷" color="var(--green)" size={22} /></div><div className="fm"><b>Dave paid you</b><small>CIS £80 held · 3h</small></div><div className="fa" style={{ color: 'var(--green)' }}>+£500</div></div>
                    {/* 🔴 THIS WAS A "7-day streak! Keep it going" CARD, AND IT WAS THREE WRONGS AT
                        ONCE. There is no streak anywhere in the code, so it advertised a feature we
                        do not have. app/llms.txt/route.ts states publicly that there are no streaks,
                        no badges and no gamification, so the site contradicted our own published
                        answer. And docs/103's alignment test forbids rewarding him for the manual
                        work the product exists to remove. What belongs on the feed instead is the
                        review pile, which is real, is at /app/pile, and is the one thing on that
                        screen actually waiting on him. */}
                    <div className="feedcard" style={{ background: 'var(--river-tint)', borderColor: 'var(--river)' }}><div className="fi" style={{ background: '#fff' }}><Ic e="✅" color="var(--river)" size={22} /></div><div className="fm"><b>3 waiting on you</b><small>Grouped by shop. Answer once each.</small></div></div>
                  </div>
                  <div className="tslide">
                    <div className="appbar" style={{ padding: '6px 4px 12px' }}><b>Money</b><span style={{ fontSize: 12 }}>2026/27 ▾</span></div>
                    <div className="bignum"><div className="l">Tax set aside · this year</div><div className="v">£3,240</div><div style={{ fontSize: 11, opacity: 0.85 }}>81% ready for the quarter</div></div>
                    <div className="mini2"><div><div className="l">Income</div><div className="v" style={{ color: 'var(--green)' }}>£28.4k</div></div><div><div className="l">Profit</div><div className="v" style={{ color: 'var(--river)' }}>£19.3k</div></div></div>
                    <div className="trow"><span>CIS refund building</span><span style={{ color: 'var(--saffron-deep)', fontWeight: 800 }}>£1,120</span></div>
                    <div className="trow"><span>Next deadline</span><span style={{ fontWeight: 800 }}>31 Jan</span></div>
                  </div>
                  <div className="tslide">
                    <div className="appbar" style={{ padding: '6px 4px 12px' }}><b>Invoices</b><span style={{ color: 'var(--river)', fontWeight: 800, fontSize: 13 }}>＋ New</span></div>
                    <div className="mini2"><div><div className="l">Outstanding</div><div className="v" style={{ color: 'var(--saffron-deep)' }}>£1,450</div></div><div><div className="l">Paid this month</div><div className="v" style={{ color: 'var(--green)' }}>£3,900</div></div></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--river-tint)' }}><Ic e="🧾" color="var(--river)" size={22} /></div><div className="fm"><b>Dave · rewire</b><small>#0042</small></div><div className="fa" style={{ color: 'var(--green)' }}>Paid</div></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--river-tint)' }}><Ic e="🧾" color="var(--river)" size={22} /></div><div className="fm"><b>Miller Bros</b><small>#0041</small></div><div className="fa" style={{ color: 'var(--saffron-deep)' }}>Due 12d</div></div>
                    <div className="feedcard"><div className="fi" style={{ background: 'var(--river-tint)' }}><Ic e="🧾" color="var(--river)" size={22} /></div><div className="fm"><b>J. Okafor</b><small>#0040</small></div><div className="fa" style={{ color: 'var(--red)' }}>Overdue</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The two helpers: the reactive AI and Rakha, the proactive agent */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 38 }}>
            <div className="eyebrow" style={{ color: 'var(--saffron-deep)' }}>Who you are hiring</div>
            <h2 className="h2">Two of them. One answers, one watches.</h2>
            <p className="lead">Software waits to be opened. One of these speaks first, which is the difference between a tool and somebody working for you.</p>
          </div>
          <div className="helpers reveal">
            <div className="helpercard ai">
              <div className="hic"><Ic e="📊" color="var(--river)" size={26} /></div>
              <h3>Puchio</h3>
              <div className="htag">Answers when you ask</div>
              <p>Your AI tax helper, in the chat. Ask anything about your tax, expenses, CIS, VAT or your own numbers, and get a straight answer in plain English, in seconds. No jargon, no waiting days for a reply.</p>
              <p className="hname">Puchio comes from puchh: ask. Go on, puchho.</p>
            </div>
            <div className="helpercard rakha">
              <div className="hic"><Ic e="🛡️" color="var(--saffron-deep)" size={26} /></div>
              <h3>Rakha</h3>
              <div className="htag">Speaks before you ask</div>
              <p>Rakha watches your numbers all year: the VAT threshold creeping closer, a State Pension year about to slip, the January bill quietly building. When something needs you, Rakha tells you first, {alertChannels()}. It suggests, never acts. You decide everything.</p>
              <p className="hname">Rakha is Punjabi for guardian. Lekhio keeps your books. Rakha watches them.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The journey: signup to a system that runs itself, animated */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 34 }}>
            <h2 className="h2">From first click to running itself.</h2>
            <p style={{ fontSize: 17, color: 'var(--tx-mut)', maxWidth: 620, margin: '12px auto 0', lineHeight: 1.6 }}>
              Onboarding is one journey, and it happens in one place. Watch it play out: the website asks who you are, then you land in your Lekhio and it sets you up properly. Then it just runs.
            </p>
          </div>
          <div className="reveal">
            <OnboardingShow />
          </div>
        </div>
      </section>

      {/* 🔴 THIS BLOCK WAS COMMENTED "Beat the accountant" AND READ LIKE IT. Jag's steer, 3 August
          2026: do not pick a fight with accountants. They are a referral channel and a future
          partner, and a product that shames them on price invites the trouble they are well placed
          to cause. The pains are all still here, because they are real. The villain is the old way
          of doing it, not a profession. */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 36 }}>
            <div className="eyebrow">The expert in your pocket</div>
            {/* The compliment stays and the jab goes. "The brains of an accountant" is a good thing
                to be; "none of the bill" was the shot. */}
            <h2 className="h2">The brains of an accountant, on call all year.</h2>
          </div>
          <div className="ba reveal" style={{ maxWidth: 900, margin: '0 auto' }}>
            <div className="old"><h3>The old way</h3><ul>
              <li><span className="m">✕</span> A bill you only find out about in January.</li>
              <li><span className="m">✕</span> Looking at last year, when it is too late to plan.</li>
              <li><span className="m">✕</span> A shoebox to dig out every January.</li>
              <li><span className="m">✕</span> Waiting days for a simple answer.</li>
            </ul></div>
            <div className="new"><h3>The Lekhio way</h3><ul>
              <li><span className="m">✓</span> One flat price, everything in.</li>
              <li><span className="m">✓</span> With you every day, not once a year.</li>
              <li><span className="m">✓</span> Snap as you go. Nothing to dig out.</li>
              <li><span className="m">✓</span> Instant replies, right in the same chat.</li>
            </ul></div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          🔴 THE PAGE NEVER SAID WHAT THE JOB COSTS, WHICH IS THE WHOLE ARGUMENT.
          The word employee was on the page in July, inside a fake chat header, and nowhere else did
          the page do anything with it. Doc 104: the category is the business FOR businesses, and
          the pitch is that the first hire costs £12.99 rather than a salary. A man weighing this up
          is not comparing us to another app, he is comparing us to doing it himself on a Sunday.
          ⚠️ DOC 108 STILL HOLDS AND THIS DOES NOT BREAK IT. Not one number here is a SAVING. We
          never price on what we save him, because that figure is his and it moves. £12.99 is the
          price, the rest of the column is the WORK, and there is no arithmetic joining them.
          ⚠️ AND NOTHING HERE COUNTS HOURS FOR HIM EITHER. "Saves you 9 hours a month" is the same
          invented figure wearing a different hat. The list is what it does, not what that is worth.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 34 }}>
            <div className="eyebrow">What it costs you</div>
            <h2 className="h2">&pound;12.99 a month. That is the whole of it.</h2>
            <p className="lead">One price, everything in. No limit on receipts, no tier above you, and no bill at the end of the year for the busy months.</p>
          </div>
          <div className="ba reveal" style={{ maxWidth: 900, margin: '0 auto' }}>
            <div className="new"><h3>What you pay</h3><ul>
              <li><span className="m">&#10003;</span> &pound;12.99 a month, or &pound;129 a year.</li>
              <li><span className="m">&#10003;</span> 7 days free first, and no card to start.</li>
              <li><span className="m">&#10003;</span> Cancel in one tap, and take your records with you.</li>
              <li><span className="m">&#10003;</span> Unlimited receipts, voice notes and mileage.</li>
            </ul></div>
            <div className="new"><h3>What it does for it</h3><ul>
              <li><span className="m">&#10003;</span> Every receipt read and filed, all year.</li>
              <li><span className="m">&#10003;</span> Your invoices written, sent and chased.</li>
              <li><span className="m">&#10003;</span> Your tax worked out as you go, not in January.</li>
              <li><span className="m">&#10003;</span> Every relief you are owed, looked for and shown with the working.</li>
            </ul></div>
          </div>
          <p className="center mut" style={{ fontSize: 13, marginTop: 18 }}>
            The full breakdown, both plans and what is not included, is on <Link href="/pricing" style={{ color: 'var(--river)', fontWeight: 700 }}>pricing</Link>.
          </p>
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
            <div className="sooncard"><div className="se"><Ic e="📤" color="var(--river)" size={24} /></div><h3>File straight to HMRC</h3><p>Submit your quarterly updates and return from Lekhio, when you approve, through a recognised route.</p><span className={filingBadge().live ? 'rbadge live' : 'rbadge prog'}>{filingBadge().text}</span></div>
            <div className="sooncard"><div className="se"><Ic e="📊" color="var(--saffron-deep)" size={24} /></div><h3>Your HMRC balance, live</h3><p>See exactly what you owe, what is due, and any refund building, right in the app.</p><span className="rbadge soon">COMING SOON</span></div>
            <div className="sooncard"><div className="se"><Ic e="🏦" color="var(--green)" size={24} /></div><h3>Connect your bank</h3><p>Money in and out logs itself, read only, so your books stay up to date with no effort.</p><span className={bankBadge().live ? 'rbadge live' : 'rbadge soon'}>{bankBadge().text}</span></div>
            <div className="sooncard"><div className="se"><Ic e="🛡️" color="var(--river)" size={24} /></div><h3>Rakha gets sharper</h3><p>Rakha already watches your thresholds. Soon it reads HMRC updates and the Budget the moment they land, and tells you exactly what changes for you.</p><span className="rbadge soon">COMING SOON</span></div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Hire it for a week.</h2>
            <p>7 days free, no card. If it has not earned its keep, walk away in one tap.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
      <ClientScript js={PRODUCT_JS} />
    </main>
  );
}
