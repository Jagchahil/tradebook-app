import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INK, PAPER, FONT, SITE, faqs, reviews,
  SharedHead, SiteNav, SiteFooter, StickyCta, HeroPhone,
} from './_shared/site';

export const metadata: Metadata = {
  title: 'Lekhio. Never do your books again. Just text it.',
  description:
    'Lekhio is the WhatsApp back office for the UK self employed. Snap a receipt, say an expense, or text what you got paid. Lekhio logs it, sorts it, writes your invoices, and keeps your tax ready. You just approve. 30 days free.',
  openGraph: {
    title: 'Lekhio. Never do your books again. Just text it.',
    description: 'The WhatsApp back office for the UK self employed. Snap it, say it, or text it. Lekhio does the books.',
    type: 'website',
  },
};

// Home page bespoke styling. Aliases the shared palette to the extra variable
// names these sections use, then defines every section class. Colours all come
// from the shared theme variables, so light and dark just work.
const HOME_CSS = `
:root{--panel-2:var(--surface);--line:var(--bd);--teal:#0E8C6E;--teal-tint:#E2F4EF}
[data-theme="dark"]{--teal:#3FC7A3;--teal-tint:#0F2A22}
.home .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.home .mut{color:var(--tx-mut)}
.home .center{text-align:center}
.home .center .lead{margin-inline:auto}
.home .lead{font-size:18px;color:var(--tx-mut);max-width:560px;margin-top:14px}
.home .eyebrow{font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--river);margin-bottom:12px}
.home .h2{font-size:clamp(28px,4.4vw,44px);letter-spacing:-.035em;line-height:1.05;font-weight:800;margin:0}
.home section{padding:64px 0}
.home .pill{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;padding:7px 14px;border-radius:999px;background:var(--river-tint);color:var(--river-deep)}
.home .dot{width:8px;height:8px;border-radius:999px;background:#22C55E;animation:hpulse 2s infinite}
@keyframes hpulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.home .btn{display:inline-block;font-weight:700;font-size:16px;padding:15px 30px;border-radius:13px;cursor:pointer;border:0;font-family:inherit;transition:transform .18s,box-shadow .25s}
.home .btn.primary{background:var(--river);color:#fff;box-shadow:0 10px 26px rgba(27,89,166,.32)}
.home .btn.primary:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(27,89,166,.4)}
.home .btn.ghost{background:transparent;color:var(--tx);border:1px solid var(--tx)}
.home .btn.ghost:hover{transform:translateY(-2px);background:var(--panel-2)}
.home .btn.white{background:#fff;color:var(--river)}

.mtdtop{background:var(--band);color:#fff}
.mtdtop a{display:flex;align-items:center;justify-content:center;gap:11px;flex-wrap:wrap;padding:10px 16px;font-size:13px;font-weight:500;color:rgba(255,255,255,.85)}
.mtdtop .tag{font-size:10px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;background:var(--saffron);color:#2a1e06;padding:3px 8px;border-radius:5px}
.mtdtop b{font-weight:700;color:#fff}
.mtdtop .go{font-weight:800;color:#fff;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(255,255,255,.4);transition:text-decoration-color .2s}
.mtdtop a:hover .go{text-decoration-color:#fff}

.truststrip{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--panel)}
.truststrip .row{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px 28px;padding:16px 24px;font-size:13px;font-weight:600;color:var(--tx-mut)}
.truststrip .row span{display:inline-flex;align-items:center;gap:8px}
.truststrip b{color:var(--tx);font-weight:800}

.home .hero{padding:56px 0 26px}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:54px;align-items:center}
.hero h1{font-size:clamp(40px,6.4vw,72px);letter-spacing:-.045em;line-height:1.05;font-weight:800;margin:22px 0 0}
.hero .gt{background:linear-gradient(100deg,var(--river),var(--saffron));-webkit-background-clip:text;background-clip:text;color:transparent;position:relative;display:inline-block}
.squig{position:absolute;left:-2%;bottom:-14px;width:104%;height:16px;overflow:visible}
.squig path{stroke:var(--saffron);stroke-width:6;fill:none;stroke-linecap:round;stroke-dasharray:340;stroke-dashoffset:340;animation:hdraw 1s ease forwards .6s}
@keyframes hdraw{to{stroke-dashoffset:0}}
.hero p.sub{font-size:20px;color:var(--tx-mut);max-width:520px;margin:22px 0 30px}
.cta-row{display:flex;gap:14px;flex-wrap:wrap}
.hero .micro{display:flex;align-items:center;gap:12px;margin-top:24px;font-size:13.5px;color:var(--tx-mut)}
.avs{display:flex}
.avs span{width:30px;height:30px;border-radius:999px;border:2px solid var(--bg);margin-left:-8px}
.avs span:first-child{margin-left:0}
@media(max-width:900px){.hero .grid{grid-template-columns:1fr;gap:34px;text-align:center}.cta-row,.hero .micro{justify-content:center}.hero p.sub{margin-inline:auto}}

.ba{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:stretch}
@media(max-width:760px){.ba{grid-template-columns:1fr}}
.ba .old{background:var(--band);color:#fff;border-radius:20px;padding:30px}
.ba .new{background:linear-gradient(150deg,var(--river),var(--river-deep));color:#fff;border-radius:20px;padding:30px}
.ba h3{font-size:21px;margin:0 0 16px}
.ba li{list-style:none;display:flex;gap:11px;align-items:flex-start;padding:8px 0;font-size:15px}
.ba .m{flex:0 0 22px;height:22px;border-radius:999px;display:grid;place-items:center;font-size:12px;font-weight:900;margin-top:1px}
.ba .old .m{background:rgba(224,121,107,.25);color:#ffb4a8}
.ba .new .m{background:rgba(255,255,255,.22);color:#fff}
.ba ul{padding:0;margin:0}

.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
@media(max-width:760px){.steps{grid-template-columns:1fr;gap:30px}}
.hstep{text-align:center}
.hstep h3{font-size:19px;margin:0 0 10px}
.stepn{width:62px;height:62px;border-radius:999px;margin:0 auto 18px;color:#fff;font-weight:900;font-size:23px;display:grid;place-items:center}

.numgrid{display:grid;grid-template-columns:.9fr 1.1fr;gap:48px;align-items:center}
@media(max-width:900px){.numgrid{grid-template-columns:1fr;gap:32px}}
.appmock{background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:20px;box-shadow:var(--shadow);max-width:360px;margin:0 auto;width:100%}
.setaside{background:linear-gradient(135deg,var(--river),var(--river-deep));border-radius:18px;padding:18px;color:#fff}
.setaside .l{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.setaside .big{font-size:38px;font-weight:900;letter-spacing:-.03em;margin-top:2px}
.setaside .s{font-size:12px;opacity:.85}
.mini3{display:flex;gap:8px;margin:12px 0}
.mini3 div{flex:1;border-radius:13px;padding:11px}
.mini3 .l{font-size:10px;font-weight:700}.mini3 .v{font-size:16px;font-weight:900;margin-top:3px}
.chartbox{background:var(--panel-2);border-radius:14px;padding:12px 12px 10px;margin-bottom:10px}
.chartrow{display:flex;align-items:flex-end;gap:7px;height:64px}
.cbar{flex:1;border-radius:5px 5px 0 0;height:8px;transition:height .9s cubic-bezier(.2,.7,.3,1)}
.reveal.in .cbar{height:var(--h)}
.cisbar{background:var(--saffron-tint);border-radius:14px;padding:13px}
.cisbar .top{display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:var(--saffron-deep)}
.track{height:9px;border-radius:999px;background:rgba(0,0,0,.08);margin-top:8px;overflow:hidden}
.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--saffron),var(--green));width:0;transition:width 1.3s cubic-bezier(.2,.7,.3,1)}
.reveal.in .fill{width:68%}

.drow{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;margin:0 0 44px}
.drow:last-of-type{margin-bottom:0}
.drow.flip .dtext{order:2}
@media(max-width:820px){.drow{grid-template-columns:1fr;gap:22px}.drow.flip .dtext{order:0}}
.dtext h3{font-size:26px;letter-spacing:-.03em;margin:0 0 12px}
.dtext p{font-size:16px;color:var(--tx-mut)}
.dvis{background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:20px;box-shadow:var(--shadow);min-height:186px;display:flex;flex-direction:column;justify-content:center;gap:9px}
.dbub{max-width:82%;padding:9px 13px;font-size:13.5px;border-radius:13px}
.dbub.out{align-self:flex-end;background:#DCF8C6;color:#111;border-bottom-right-radius:4px}
.dbub.in{align-self:flex-start;background:var(--panel-2);border-bottom-left-radius:4px}
[data-theme="dark"] .dbub.out{background:#005c4b;color:#e8f0ee}
.dbub .rc{background:#cde7b4;border-radius:8px;padding:12px;text-align:center;font-size:20px;margin-bottom:5px}
.wf{display:flex;align-items:flex-end;gap:3px;height:30px;padding:2px 0}
.wf i{width:4px;border-radius:2px;background:var(--river)}
.splitrow{display:flex;justify-content:space-between;padding:9px 2px;border-bottom:1px solid var(--line);font-size:14px}
.splitrow:last-child{border:0;font-weight:800}
.approvebtn{margin-top:4px;background:var(--green);color:#fff;border-radius:12px;padding:11px;font-weight:800;text-align:center;font-size:14px}
.diconrow{display:flex;align-items:center;gap:12px}
.dicon{width:44px;height:44px;border-radius:999px;background:var(--river);color:#fff;font-size:20px;display:grid;place-items:center}

.rev-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.rev-track{display:flex;gap:18px;width:max-content;animation:hslide 44s linear infinite}
.rev-marquee:hover .rev-track{animation-play-state:paused}
@keyframes hslide{to{transform:translateX(-50%)}}
.quote{width:360px;flex:0 0 auto;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px;box-shadow:var(--shadow)}
.quote .stars{color:var(--saffron);font-size:15px;margin-bottom:12px}
.quote p{font-size:16px;margin:0 0 18px}
.who{display:flex;align-items:center;gap:12px}
.who .a{width:42px;height:42px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:16px}
.who b{font-size:14.5px;display:block}.who small{font-size:13px;color:var(--tx-mut)}

.pricewrap{background:linear-gradient(180deg,var(--panel-2),var(--bg));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.prices{display:grid;grid-template-columns:1fr 1fr;gap:22px;max-width:800px;margin:0 auto;align-items:stretch}
@media(max-width:760px){.prices{grid-template-columns:1fr}}
.pcard{background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:32px 30px;box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column;transition:transform .3s,box-shadow .3s}
.pcard:hover{transform:translateY(-4px)}
.pcard.best{border:1px solid transparent;box-shadow:0 24px 56px rgba(27,89,166,.22);overflow:hidden;background:linear-gradient(180deg,var(--river-tint),var(--panel))}
.pcard.best::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,var(--river),var(--saffron))}
.pbadge{position:absolute;top:16px;right:16px;background:var(--saffron);color:#3a2a08;font-size:12px;font-weight:900;padding:5px 13px;border-radius:999px;white-space:nowrap}
.pname{font-size:13px;font-weight:800;color:var(--tx-mut);text-transform:uppercase;letter-spacing:.06em}
.pamt{font-size:52px;font-weight:900;letter-spacing:-.04em;margin:10px 0 2px;line-height:1}
.pamt span{font-size:18px;font-weight:700;color:var(--tx-mut);letter-spacing:0}
.pnote{font-size:13.5px;color:var(--tx-mut);margin:6px 0 0}
.psave{display:inline-block;font-size:12.5px;font-weight:800;color:var(--green);background:var(--green-tint);padding:5px 12px;border-radius:999px;margin-top:14px}
.pcta{margin-top:auto;padding-top:24px}
.pcta .btn{width:100%}
.pmicro{font-size:12px;color:var(--tx-mut);text-align:center;margin-top:10px}
.incl-panel{max-width:800px;margin:24px auto 0;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:26px 30px;box-shadow:var(--shadow)}
.incl-panel h4{font-size:14px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--tx-mut);text-align:center;margin:0 0 20px}
.incl-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 30px;margin:0;padding:0}
@media(max-width:640px){.incl-grid{grid-template-columns:1fr}}
.incl-grid li{list-style:none;display:flex;gap:12px;align-items:center;font-size:14.5px;font-weight:600}
.incl-grid .t{flex:0 0 24px;height:24px;border-radius:999px;background:var(--green-tint);color:var(--green);display:grid;place-items:center;font-weight:900;font-size:12px}

.final{background:linear-gradient(135deg,var(--river),var(--river-deep));border-radius:26px;padding:56px 32px;text-align:center;color:#fff}
.final h2{font-size:clamp(28px,4.4vw,44px);color:#fff;margin:0}
.final p{color:rgba(255,255,255,.86);font-size:18px;margin:14px auto 26px;max-width:460px}
`;

const CBARS = [
  { h: 34, c: 'var(--river)', o: 0.85 },
  { h: 48, c: 'var(--river)', o: 0.85 },
  { h: 40, c: 'var(--river)', o: 0.85 },
  { h: 58, c: 'var(--green)', o: 1 },
  { h: 50, c: 'var(--river)', o: 0.85 },
  { h: 64, c: 'var(--green)', o: 1 },
];

export default function HomePage() {
  return (
    <main className="home" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Lekhio', url: SITE, logo: `${SITE}/lekhio-logo.svg`, description: 'WhatsApp-first bookkeeping and Making Tax Digital prep for UK self-employed tradespeople.' },
              { '@type': 'SoftwareApplication', name: 'Lekhio', applicationCategory: 'FinanceApplication', operatingSystem: 'iOS, Android, Web', url: SITE, description: 'Text a receipt, voice note or invoice to WhatsApp. Lekhio logs it, categorises it, and keeps you ready for Making Tax Digital. You approve before anything reaches HMRC.', offers: [ { '@type': 'Offer', price: '19.99', priceCurrency: 'GBP', category: 'Monthly subscription' }, { '@type': 'Offer', price: '199', priceCurrency: 'GBP', category: 'Annual subscription' } ], publisher: { '@id': `${SITE}/#org` } },
              { '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
            ],
          }),
        }}
      />
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: HOME_CSS }} />

      {/* One clean top bar: the MTD announcement CTA */}
      <div className="mtdtop"><Link href="/how-mtd-works"><span className="tag">New</span> <b>Making Tax Digital is now live</b> for the self employed. <span className="go">See if it affects you →</span></Link></div>

      <SiteNav />

      {/* Hero */}
      <section className="hero">
        <div className="wrap grid">
          <div>
            <span className="pill"><span className="dot" /> The tax assistant that lives in WhatsApp</span>
            <h1>Never do your<br />books again.<br /><span className="gt">Just text it.<svg className="squig" viewBox="0 0 320 16" preserveAspectRatio="none"><path d="M4 11 C 60 3, 110 3, 150 9 S 260 15, 316 6" /></svg></span></h1>
            <p className="sub">Snap a receipt, say an expense, or text what you got paid. Lekhio logs it, sorts it, writes your invoices, and keeps your tax ready. You just approve.</p>
            <div className="cta-row">
              <Link href="/start" className="btn primary">Start free</Link>
              <Link href="/product" className="btn ghost">See how it works</Link>
            </div>
            <div className="micro">
              <span className="avs"><span style={{ background: '#1B59A6' }} /><span style={{ background: '#E0A33E' }} /><span style={{ background: '#15803D' }} /><span style={{ background: '#134277' }} /></span>
              <span><b style={{ color: 'var(--saffron)' }}>★★★★★</b> &nbsp;Built with UK sole traders. 30 days free, no card.</span>
            </div>
          </div>
          <div><HeroPhone /></div>
        </div>
      </section>

      {/* Trust strip */}
      <div className="truststrip">
        <div className="row">
          <span>🔒 Encrypted, never sold</span>
          <span>✅ You approve everything</span>
          <span>📐 <b>Checked against HMRC&apos;s 2026/27 rules</b> across 104 tests</span>
          <span>🇬🇧 A real UK company</span>
        </div>
      </div>

      {/* Kill the shoebox */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 36 }}>
            <div className="eyebrow">The end of the dread</div>
            <h2 className="h2">The shoebox is dead.</h2>
            <p className="lead">No more lost Sunday nights. No January panic. No box of faded receipts to dig through. Just ten seconds a day, as you work.</p>
          </div>
          <div className="ba reveal">
            <div className="old">
              <h3>The old way 😩</h3>
              <ul>
                <li><span className="m">✕</span> A shoebox of receipts you dread opening.</li>
                <li><span className="m">✕</span> A lost weekend every January.</li>
                <li><span className="m">✕</span> Spreadsheets you forget to update.</li>
                <li><span className="m">✕</span> A £150 to £900 accountant bill just to file.</li>
                <li><span className="m">✕</span> Never quite knowing what you owe.</li>
              </ul>
            </div>
            <div className="new">
              <h3>The Lekhio way 😌</h3>
              <ul>
                <li><span className="m">✓</span> Snap it, say it, or text it. Done in seconds.</li>
                <li><span className="m">✓</span> Your books build themselves all year.</li>
                <li><span className="m">✓</span> Tax figures always sat there, ready.</li>
                <li><span className="m">✓</span> One flat price, everything in.</li>
                <li><span className="m">✓</span> Always know your number.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Three steps */}
      <section style={{ background: 'var(--river-tint)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 44 }}>
            <h2 className="h2">Three steps. That is the whole thing.</h2>
            <p className="lead">If you can send a text, you can run your books.</p>
          </div>
          <div className="steps reveal">
            <div className="hstep"><div className="stepn" style={{ background: 'linear-gradient(135deg,var(--river),var(--river-deep))', boxShadow: '0 12px 26px rgba(27,89,166,.32)' }}>1</div><h3>Snap it, say it, text it</h3><p className="mut" style={{ fontSize: 15 }}>A photo of a receipt, a voice note, or a quick line on WhatsApp. That is the whole job.</p></div>
            <div className="hstep"><div className="stepn" style={{ background: 'linear-gradient(135deg,var(--saffron),var(--saffron-deep))', boxShadow: '0 12px 26px rgba(224,163,62,.32)' }}>2</div><h3>Lekhio sorts it</h3><p className="mut" style={{ fontSize: 15 }}>It reads it, pulls the total, sorts the category, and logs it. It even writes your invoices.</p></div>
            <div className="hstep"><div className="stepn" style={{ background: 'linear-gradient(135deg,var(--green),#0F5C2E)', boxShadow: '0 12px 26px rgba(21,128,61,.32)' }}>3</div><h3>You approve</h3><p className="mut" style={{ fontSize: 15 }}>Your tax is prepared as you go. You check it and send it. Nothing reaches HMRC without your yes.</p></div>
          </div>
        </div>
      </section>

      {/* Know your number */}
      <section style={{ background: 'var(--green-tint)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap numgrid">
          <div className="reveal">
            <div className="appmock">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 4px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,var(--river),var(--saffron))', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 900, fontSize: 15 }}>L</span><b style={{ fontSize: 15 }}>Money</b></div>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--river)', background: 'var(--river-tint)', padding: '4px 9px', borderRadius: 999 }}>2026/27 ▾</span>
              </div>
              <div className="setaside"><div className="l">Tax set aside · this year</div><div className="big">£3,240</div><div className="s">On track · 81% ready for the quarter</div></div>
              <div className="mini3">
                <div style={{ background: 'var(--green-tint)' }}><div className="l" style={{ color: 'var(--tx-mut)' }}>Income</div><div className="v" style={{ color: 'var(--green)' }}>£28.4k</div></div>
                <div style={{ background: 'var(--red-tint)' }}><div className="l" style={{ color: 'var(--tx-mut)' }}>Expenses</div><div className="v" style={{ color: 'var(--red)' }}>£9.1k</div></div>
                <div style={{ background: 'var(--river-tint)' }}><div className="l" style={{ color: 'var(--tx-mut)' }}>Profit</div><div className="v" style={{ color: 'var(--river)' }}>£19.3k</div></div>
              </div>
              <div className="chartbox">
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx-mut)', marginBottom: 8 }}>PROFIT · LAST 6 MONTHS</div>
                <div className="chartrow">
                  {CBARS.map((b, i) => (<div key={i} className="cbar" style={{ background: b.c, opacity: b.o, ['--h']: `${b.h}px` } as any} />))}
                </div>
              </div>
              <div className="cisbar"><div className="top"><span>🏗️ CIS refund building up</span><span>£1,120</span></div><div className="track"><div className="fill" /></div></div>
            </div>
          </div>
          <div className="reveal">
            <div className="eyebrow" style={{ color: 'var(--green)' }}>Peace of mind, and money back</div>
            <h2 className="h2">Always know your number.</h2>
            <p className="lead" style={{ marginBottom: 16 }}>Your income, expenses, profit and tax set aside, updating as you work. No nasty surprises, ever.</p>
            <p className="mut" style={{ fontSize: 16 }}>And if you are a CIS subcontractor, Lekhio tracks the refund building up all year. Most subbies are owed money back. You get to watch it grow.</p>
          </div>
        </div>
      </section>

      {/* Feature demos */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 44 }}>
            <h2 className="h2">Everything your accountant nags you for.</h2>
            <p className="lead">Done as you work, not at the end of the year.</p>
          </div>

          <div className="drow reveal">
            <div className="dtext">
              <div className="eyebrow" style={{ color: 'var(--river)' }}>📸 Receipt capture</div>
              <h3>Snap it. It reads itself.</h3>
              <p>Photograph any receipt on WhatsApp. Lekhio pulls the total, the VAT and the category, and logs it in seconds. No typing, no app to open.</p>
            </div>
            <div className="dvis">
              <div className="dbub out"><div className="rc">🧾</div>Screwfix receipt</div>
              <div className="dbub in">Logged. £42.60, materials ✅</div>
              <div className="dbub in" style={{ background: 'transparent', fontSize: 12, color: 'var(--tx-mut)' }}>VAT £7.10 · category Materials · 3 Jul</div>
            </div>
          </div>

          <div className="drow flip reveal">
            <div className="dtext">
              <div className="eyebrow" style={{ color: 'var(--saffron-deep)' }}>🎙️ Voice notes</div>
              <h3>Hands full? Just say it.</h3>
              <p>On a roof or under a sink, talking is the only input that works. Say what you spent and carry on. It is logged before you have put the phone down.</p>
            </div>
            <div className="dvis">
              <div className="diconrow">
                <div className="dicon">🎙️</div>
                <div className="wf">{[10, 22, 14, 28, 18, 24, 12, 20, 10].map((h, i) => (<i key={i} style={{ height: h }} />))}</div>
              </div>
              <div className="dbub out">&quot;spent forty on diesel&quot;</div>
              <div className="dbub in">£40 fuel, logged ✅</div>
            </div>
          </div>

          <div className="drow reveal">
            <div className="dtext">
              <div className="eyebrow" style={{ color: 'var(--teal)' }}>👷 CIS done right</div>
              <h3>Your refund, tracked all year.</h3>
              <p>Lekhio splits labour and materials, applies your CIS deduction, and tracks the refund building up. Most subbies are owed money back. You get to watch it grow.</p>
            </div>
            <div className="dvis">
              <div className="splitrow"><span>Labour</span><span>£320.00</span></div>
              <div className="splitrow"><span>Materials</span><span>£80.00</span></div>
              <div className="splitrow"><span style={{ color: 'var(--saffron-deep)', fontWeight: 700 }}>CIS held (20%)</span><span style={{ color: 'var(--saffron-deep)' }}>£64.00</span></div>
              <div className="splitrow"><span>Refund building up</span><span style={{ color: 'var(--green)' }}>£1,120 ↗</span></div>
            </div>
          </div>

          <div className="drow flip reveal">
            <div className="dtext">
              <div className="eyebrow" style={{ color: 'var(--green)' }}>✅ You approve</div>
              <h3>Prepared for you. Sent by you.</h3>
              <p>Your quarterly figures sit there ready. You check them and send them. Nothing reaches HMRC without your yes. That is the line we never cross.</p>
            </div>
            <div className="dvis">
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx-mut)', marginBottom: 2 }}>Q2 SUMMARY · READY TO APPROVE</div>
              <div className="splitrow"><span>Income</span><span>£28,400</span></div>
              <div className="splitrow"><span>Expenses</span><span>£9,140</span></div>
              <div className="splitrow"><span>Tax to set aside</span><span style={{ color: 'var(--river)' }}>£3,240</span></div>
              <div className="approvebtn">Approve &amp; send to HMRC →</div>
            </div>
          </div>

          <div className="center reveal" style={{ marginTop: 44 }}><Link href="/product" className="btn primary">See everything Lekhio does →</Link></div>
        </div>
      </section>

      {/* Proof slider */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 38 }}><h2 className="h2">Built with people who work for themselves.</h2></div>
        </div>
        <div className="rev-marquee reveal">
          <div className="rev-track">
            {[...reviews, ...reviews].map((r, i) => (
              <div className="quote" key={i} aria-hidden={i >= reviews.length ? true : undefined}>
                <div className="stars">★★★★★</div>
                <p>&quot;{r.quote}&quot;</p>
                <div className="who"><span className="a" style={{ background: r.tint, color: r.fg }}>{r.name.charAt(0)}</span><div><b>{r.name}</b><small>{r.trade}</small></div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pricewrap">
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 42 }}><h2 className="h2">One price. Everything in.</h2><p className="lead">No receipt limits, no tiers, no surprises. Both plans start with 30 days free, no card needed.</p></div>
          <div className="prices reveal">
            <div className="pcard">
              <div className="pname">Monthly</div>
              <div className="pamt">£19.99<span>/mo</span></div>
              <div className="pnote">Billed monthly. Cancel any time.</div>
              <div className="pcta"><Link href="/start" className="btn primary">Start 30 days free</Link><div className="pmicro">No card needed</div></div>
            </div>
            <div className="pcard best">
              <span className="pbadge">🎉 2 months free</span>
              <div className="pname" style={{ color: 'var(--river)' }}>Yearly · best value</div>
              <div className="pamt">£199<span>/yr</span></div>
              <div className="pnote">Just £16.58 a month, billed once a year.</div>
              <span className="psave">You save £40 a year</span>
              <div className="pcta"><Link href="/start" className="btn primary">Start 30 days free</Link><div className="pmicro">No card needed</div></div>
            </div>
          </div>
          <div className="incl-panel reveal">
            <h4>Everything, in both plans</h4>
            <ul className="incl-grid">
              <li><span className="t">✓</span> Unlimited receipts, voice notes and mileage</li>
              <li><span className="t">✓</span> Invoices created and sent from WhatsApp</li>
              <li><span className="t">✓</span> MTD ready quarterly summaries, you approve</li>
              <li><span className="t">✓</span> CIS split, deduction and refund tracking</li>
              <li><span className="t">✓</span> A real human on the other end, fast</li>
              <li><span className="t">✓</span> Cancel in one tap, export any time</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Text it. It is in your Lekhio.</h2>
            <p>Your whole back office, sorted from a text. 30 days free, no card needed.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
