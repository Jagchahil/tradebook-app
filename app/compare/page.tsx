import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  INK, PAPER, FONT, MARKETING_CSS,
  SharedHead, SiteNav, SiteFooter, StickyCta,
  Ic,
} from '../_shared/site';

export const metadata: Metadata = {
  title: 'Lekhio vs the other options. An honest comparison.',
  description:
    'How Lekhio compares to other apps and doing it yourself. WhatsApp capture, voice notes, CIS, invoices and quarterly tax prep, side by side. We do not name competitors, and we show the gaps fairly.',
};

type Cell = boolean | 'soon' | 'limit' | 'extra' | 'higher' | 'maybe';
interface Row { label: string; lekhio: Cell; apps: Cell; diy: Cell }
const GROUPS: { cat: string; rows: Row[] }[] = [
  { cat: 'Capture and logging', rows: [
    { label: 'Lives in WhatsApp, no new app to learn', lekhio: true, apps: false, diy: false },
    { label: 'Snap a receipt and it is fully logged', lekhio: true, apps: 'limit', diy: false },
    { label: 'Log an expense by voice note', lekhio: true, apps: false, diy: false },
    { label: 'Claim mileage, home, phone and CIS from a text', lekhio: true, apps: false, diy: false },
  ] },
  { cat: 'Tax and MTD', rows: [
    { label: 'CIS split and deduction done for you', lekhio: true, apps: 'higher', diy: false },
    { label: 'Quarterly MTD updates prepared for you', lekhio: true, apps: 'higher', diy: false },
    { label: 'File straight to HMRC', lekhio: 'soon', apps: true, diy: false },
  ] },
  { cat: 'Invoicing and money', rows: [
    { label: 'Create and send an invoice from a text', lekhio: true, apps: 'extra', diy: false },
    { label: 'Connect your bank, read only', lekhio: 'soon', apps: true, diy: false },
  ] },
  { cat: 'Price and support', rows: [
    { label: 'Instant replies in the same chat', lekhio: true, apps: false, diy: 'maybe' },
    { label: 'Plain English, built for the non accountant', lekhio: true, apps: false, diy: true },
    { label: 'One flat price, no receipt limits', lekhio: true, apps: false, diy: true },
    { label: 'Set up in minutes, cancel in one tap', lekhio: true, apps: false, diy: false },
  ] },
];

function Mk({ v }: { v: Cell }) {
  if (v === true) return <span className="mk yes">✓</span>;
  if (v === 'soon') return <span className="mk soon">SOON</span>;
  if (v === false) return <span className="mk no">✕</span>;
  const L: Record<string, string> = { limit: 'Up to a limit', extra: 'Costs extra', higher: 'Higher tiers', maybe: 'If you pay' };
  return <span className="lbl">{L[v]}</span>;
}
const isWin = (r: Row) => r.lekhio === true && r.apps !== true && r.diy !== true;

const COMPARE_CSS = `
.mkt .hero{padding:52px 0 14px}
.mkt .final{background:var(--band)}
.mkt .final p{color:rgba(255,255,255,.8)}
.score{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:720px;margin:0 auto}
@media(max-width:640px){.score{grid-template-columns:1fr}}
.scard{border-radius:20px;padding:26px;text-align:center;border:1px solid var(--line);background:var(--panel);box-shadow:var(--shadow)}
.scard.lek{background:linear-gradient(150deg,var(--river),var(--river-deep));color:#fff;border:0}
.scard .snum{font-size:52px;font-weight:900;letter-spacing:-.03em;line-height:1}
.scard .slabel{font-size:14px;font-weight:800;margin-top:4px}
.scard .ssub{font-size:12.5px;opacity:.85;margin-top:4px}
.scard.lek .ssub{color:#CFE0F2}
.only{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
@media(max-width:860px){.only{grid-template-columns:1fr}}
.ocard{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:22px;box-shadow:var(--shadow)}
.ocard h3{font-size:18px;margin:0 0 4px}
.ocard .otag{font-size:11px;font-weight:900;letter-spacing:.05em;color:var(--green);background:var(--green-tint);padding:3px 9px;border-radius:999px;display:inline-block;margin-bottom:12px}
.ocard .demo{background:var(--panel-2);border-radius:14px;padding:14px;margin-top:12px;display:flex;flex-direction:column;gap:7px}
.bub{max-width:88%;padding:8px 11px;font-size:13px;border-radius:11px;animation:bin .5s both}
.bub.two{animation-delay:.5s}
.bub.out{align-self:flex-end;background:#DCF8C6;color:#111;border-bottom-right-radius:3px}
.bub.in{align-self:flex-start;background:var(--panel);border:1px solid var(--line);border-bottom-left-radius:3px}
[data-theme="dark"] .bub.out{background:#005c4b;color:#e8f0ee}
@keyframes bin{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}
.wave{display:flex;align-items:flex-end;gap:3px;height:22px}
.wave i{width:4px;border-radius:2px;background:var(--river);animation:wv .8s ease infinite}
.wave i:nth-child(2n){animation-delay:.15s}
@keyframes wv{0%,100%{height:5px}50%{height:20px}}
.filterbar{display:flex;justify-content:center;margin-bottom:22px}
.seg{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:5px;gap:4px}
.seg button{padding:9px 16px;border-radius:9px;border:0;background:transparent;font-family:inherit;font-weight:700;font-size:13.5px;color:var(--tx-mut);cursor:pointer;transition:.2s}
.seg button.on{background:var(--panel);color:var(--tx);box-shadow:0 2px 8px rgba(0,0,0,.1)}
.tablewrap{background:var(--panel);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:var(--shadow)}
.tscroll{overflow-x:auto}
table.cmp{width:100%;border-collapse:collapse;font-size:14.5px;min-width:640px}
.cmp th,.cmp td{padding:15px 16px;text-align:left}
.cmp thead th{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--tx-mut);border-bottom:1px solid var(--line)}
.cmp thead th.lekh{color:var(--river);background:var(--river-tint)}
.crown{font-size:9.5px;font-weight:900;letter-spacing:.04em;color:var(--saffron-deep);margin-top:3px}
.cmp td{border-top:1px solid var(--line)}
.cmp .lekcol{background:var(--river-tint)}
.cmp td.c{text-align:center;width:130px}
.cmp .rowlabel{font-weight:600}
.cmp .grouphdr td{background:var(--panel-2);font-size:11px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:var(--tx-mut);padding:11px 16px}
.cmp tbody tr.datarow{transition:background .15s}
.cmp tbody tr.datarow:hover{background:var(--panel-2)}
.cmp tbody tr.winrow td.rowlabel{box-shadow:inset 3px 0 0 var(--green)}
.mk-wrap{display:inline-block;animation:tickpop .4s cubic-bezier(.2,1.6,.4,1) both}
@keyframes tickpop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}
.mk{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:999px;font-size:14px;font-weight:900}
.mk.yes{background:var(--green);color:#fff}
.mk.no{background:var(--panel-2);color:#B8B2A6}
[data-theme="dark"] .mk.no{background:#242b35;color:#5b6470}
.mk.soon{width:auto;height:auto;padding:4px 9px;border-radius:12px;font-size:11px;font-weight:800;background:var(--saffron-tint);color:var(--saffron-deep)}
.lbl{font-size:12px;font-weight:600;color:var(--tx-mut)}
tr.hide{display:none}
.cred{background:linear-gradient(135deg,var(--river-deep),var(--river));border-radius:24px;padding:44px 32px;color:#fff;text-align:center}
.cred h2{color:#fff;font-size:clamp(24px,3.6vw,36px)}
.credrow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;margin-top:24px}
.credchip{background:rgba(255,255,255,.14);border-radius:14px;padding:14px 18px;font-size:14px;font-weight:700;display:flex;align-items:center;gap:9px}
.credchip b{font-weight:900}
`;

const COMPARE_JS = `
(function(){
  if(window.__lekCmp)return;window.__lekCmp=true;
  function applyFilter(f){
    var groups={};
    document.querySelectorAll('#cmp .datarow').forEach(function(tr){
      var win=tr.getAttribute('data-win')==='1';var show=(f!=='win')||win;
      tr.classList.toggle('hide',!show);if(show)groups[tr.getAttribute('data-cat')]=true;
    });
    document.querySelectorAll('#cmp .grouphdr').forEach(function(h){
      h.classList.toggle('hide', f==='win' && !groups[h.getAttribute('data-cat')]);
    });
  }
  function counts(){
    document.querySelectorAll('.snum').forEach(function(el){
      var t=+el.getAttribute('data-to');var v=0;var st=function(){v+=Math.ceil((t-v)/6);if(v>=t)v=t;el.textContent=v;if(v<t)setTimeout(st,60);};st();
    });
  }
  document.addEventListener('click',function(e){
    var b=(e.target&&e.target.closest)?e.target.closest('#seg button'):null;if(!b)return;
    document.querySelectorAll('#seg button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');
    applyFilter(b.getAttribute('data-f'));
  });
  if(document.readyState!=='loading')counts();else document.addEventListener('DOMContentLoaded',counts);
})();
`;

export default function ComparePage() {
  const rows: ReactNode[] = [];
  let ti = 0;
  GROUPS.forEach((g) => {
    rows.push(<tr key={`g-${g.cat}`} className="grouphdr" data-cat={g.cat}><td colSpan={4}>{g.cat}</td></tr>);
    g.rows.forEach((r) => {
      const win = isWin(r);
      const d = `${(ti * 0.05).toFixed(2)}s`;
      ti += 1;
      rows.push(
        <tr key={r.label} className={`datarow${win ? ' winrow' : ''}`} data-win={win ? '1' : '0'} data-cat={g.cat}>
          <td className="rowlabel">{r.label}</td>
          <td className="c lekcol"><span className="mk-wrap" style={{ animationDelay: d }}><Mk v={r.lekhio} /></span></td>
          <td className="c"><span className="mk-wrap" style={{ animationDelay: d }}><Mk v={r.apps} /></span></td>
          <td className="c"><span className="mk-wrap" style={{ animationDelay: d }}><Mk v={r.diy} /></span></td>
        </tr>,
      );
    });
  });

  return (
    <main className="mkt" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: MARKETING_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: COMPARE_CSS }} />

      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for the self employed earning over £50k. <span className="go">See if it affects you →</span></Link></div>
      <SiteNav />

      {/* Hero */}
      <section className="hero center">
        <div className="wrap">
          <span className="pill"><span className="dot" /> An honest look</span>
          <h1 style={{ marginTop: 20 }}>Lekhio vs<br /><span className="gt">the other options.</span></h1>
          <p className="sub" style={{ maxWidth: 560, margin: '20px auto 26px', fontSize: 20, color: 'var(--tx-mut)' }}>Another app. Doing it all yourself. Here is a straight comparison, so you can decide for yourself.</p>
        </div>
      </section>

      {/* Score */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="score reveal">
            <div className="scard lek"><div className="snum" data-to="11">11</div><div className="slabel">Lekhio</div><div className="ssub">today, and always growing ↗</div></div>
            <div className="scard"><div className="snum" data-to="2">2</div><div className="slabel">Other apps</div><div className="ssub">and none in WhatsApp</div></div>
            <div className="scard"><div className="snum" data-to="2">2</div><div className="slabel">Doing it yourself</div><div className="ssub">and all the work is yours</div></div>
          </div>
          <p className="center mut" style={{ fontSize: 13, marginTop: 16 }}>Thirteen things people actually need. Lekhio leads on eleven today, and we ship more every month.</p>
        </div>
      </section>

      {/* Only Lekhio */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 40 }}><h2 className="h2">Three things only Lekhio does.</h2><p className="lead">No app we have found does all three.</p></div>
          <div className="only reveal">
            <div className="ocard"><span className="otag">ONLY LEKHIO</span><h3>Lives in WhatsApp</h3><p className="mut" style={{ fontSize: 14, margin: 0 }}>No new app to learn. Text it like you text a mate.</p><div className="demo"><div className="bub out">spent 42 on diesel</div><div className="bub in two">Logged, £42 fuel ✅</div></div></div>
            <div className="ocard"><span className="otag">ONLY LEKHIO</span><h3>Log by voice note</h3><p className="mut" style={{ fontSize: 14, margin: 0 }}>Hands full on the job? Just say it.</p><div className="demo"><div className="bub out" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 16 }}>🎙️</span><span className="wave"><i /><i /><i /><i /><i /></span></div><div className="bub in two">£40 fuel, logged ✅</div></div></div>
            <div className="ocard"><span className="otag">ONLY LEKHIO</span><h3>Claim by text</h3><p className="mut" style={{ fontSize: 14, margin: 0 }}>Say the thing, it is claimed at the HMRC rate.</p><div className="demo"><div className="bub out">drove 24 miles</div><div className="bub in two">£13.20 travel, logged ✅</div></div></div>
          </div>
        </div>
      </section>

      {/* Table */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 26 }}><h2 className="h2">The full comparison.</h2><p className="lead">We do not name competitors. These are the common gaps people describe.</p></div>
          <div className="filterbar reveal"><div className="seg" id="seg"><button className="on" data-f="all">Everything</button><button data-f="win">Where Lekhio wins</button></div></div>
          <div className="tablewrap reveal">
            <div className="tscroll"><table className="cmp" id="cmp">
              <thead><tr><th>What you get</th><th className="c lekh">Lekhio<div className="crown">BEST FOR YOU</div></th><th className="c">Other apps</th><th className="c">Doing it yourself</th></tr></thead>
              <tbody>{rows}</tbody>
            </table></div>
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section>
        <div className="wrap"><div className="cred reveal">
          <h2>Built by the book. Better than the rest.</h2>
          <p style={{ color: 'rgba(255,255,255,.86)', fontSize: 17, maxWidth: 560, margin: '14px auto 0' }}>The complete tax assistant that lives in WhatsApp, and it does the sums properly.</p>
          <div className="credrow">
            <div className="credchip"><span>Checked against HMRC&apos;s <b>2026/27 rules</b>, 104 tests</span></div>
            <div className="credchip"><span>Built for WhatsApp</span></div>
            <div className="credchip"><span>HMRC recognition <b>in progress</b></span></div>
            <div className="credchip">🇬🇧 <span>A real UK company</span></div>
          </div>
        </div></div>
      </section>

      {/* Final CTA */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>See the difference for yourself.</h2>
            <p>14 days free. No card needed. Cancel in one tap.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
      <script dangerouslySetInnerHTML={{ __html: COMPARE_JS }} />
    </main>
  );
}
