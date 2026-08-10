import type { Metadata } from 'next';
import Link from 'next/link';
import { bankFeedLive, filingBadge } from '../lib/features';
import { css } from '../lib/tokens';
import { controlChoice } from '../lib/control';
import { readPublishedTestimonials } from '../lib/supabase';
import {
  INK, PAPER, FONT, SITE, faqs,
  SharedHead, SiteNav, SiteFooter, StickyCta, HeroReport,
} from './_shared/site';

// The front door reads its testimonials from the database at render time. There is no hardcoded
// review array any more, so a quote nobody said cannot ship in the code. A short revalidate keeps a
// newly published quote appearing without a rebuild, while a build with no database still succeeds
// because readPublishedTestimonials returns an empty array on any failure and the section hides.
export const revalidate = 300;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE FRONT DOOR ASKS lib/features.ts LIKE EVERY OTHER PUBLIC PAGE.
//
// Until 31 July this was the one public page that did not, and it was the highest traffic page
// we have. It promised a bank feed in twelve places, including the JSON-LD that Google reads,
// while TrueLayer had declined production authorisation and bankFeedOffered() defaulted off.
//
// So the page leads with what a customer can actually do on day one, the bank feed is described
// as coming, never as the way it works today, and the day the flag flips the page upgrades itself.
//
// ⚠️ RESHAPED 5 AUGUST 2026, THE SALES AND BRAND PASS. Twelve sections became seven: hero, the
// argument, three steps, one demo section of two rows, reviews, one price card, one closing ask.
// Four identical asks, one wording, one micro line. What went: the trust strip, the shoebox
// grid, the app mock, three of five demo rows, the two helper cards (one line survives in the
// argument, the full cards live on /product), the second compliance strip, and the second price
// card. Doc 103: every row cut is a row he no longer has to read to reach what he came for.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The one phrase that describes how money gets in. Both wordings live side by side, the same
// discipline lib/features.ts uses, so the "before" and the "after" can never drift apart.
function captureLine(): string {
  return bankFeedLive()
    ? 'Connect your bank, snap a receipt, or just say what you spent'
    : 'Snap a receipt, import your bank statement, or just say what you spent';
}

// The one ask, worded once, and the identical micro line that sits under every instance of it.
const CTA_MICRO = '7 days free, no card. Cancel in one tap.';

// 🔴 THE SAME SENTENCE, SPLIT INTO THE THINGS IT ACTUALLY PROMISES. Hero only.
//
// The line was already there and already correct. It rendered as one grey sentence under the
// button and it landed ELEVEN PIXELS BELOW THE FOLD on a 775px viewport, so the three objections
// it answers were answered where nobody was looking. Broken into ticks it is read at a glance
// rather than parsed, and the padding above it was cut so it clears the fold.
//
// ⚠️ DERIVED, NOT RETYPED. A second hand written array is a second thing to keep in step, and the
// two would drift the first time the trial length or the cancel wording changed. This splits the
// one string, so there is still exactly one place the promise is written.
const CTA_POINTS = CTA_MICRO.replace(/\.\s*$/, '').split(/[.,]\s+/);

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  title: 'Lekhio. Your first employee. The one that saves you money.',
  description:
    `Lekhio is the first employee your business hires. It sorts your receipts, sends your invoices and writes the chase when they run late, works out your tax and finds the reliefs you are owed. ${captureLine()}, and it brings you the lot to approve. You press one button. 7 days free.`,
  openGraph: {
    title: 'Lekhio. Your first employee. The one that saves you money.',
    description: 'Not software you buy. The first employee your business hires. It sorts the receipts, sends the invoices and writes the chase for the late ones, works out the tax and finds the reliefs. You press one button. Approve.',
    type: 'website',
  },
};

// Home page bespoke styling. Aliases the shared palette to the extra variable
// names these sections use, then defines every section class. Colours all come
// from the shared theme variables, so light and dark just work.
//
// ⚠️ EVERY RULE THIS SHEET SHARES WITH MARKETING_CSS IS BYTE IDENTICAL TO IT, scope aside.
// test/sharedcss.test.mjs holds the two copies together; the one named exception left is the
// hero subhead, explained on its own rule below.
const HOME_CSS = css`
:root{--panel-2:var(--surface);--line:var(--bd);--teal:#0E8C6E;--teal-tint:#E2F4EF;--on-teal-tint:#0A6E56}
[data-theme="dark"]{--teal:#3FC7A3;--teal-tint:#0F2A22;--on-teal-tint:#3FC7A3}
.home .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.home .mut{color:var(--tx-mut)}
.home .center{text-align:center}
.home .center .lead{margin-inline:auto}
.home .lead{font-size:18px;color:var(--tx-mut);max-width:560px;margin-top:14px}
.home .h2{font-size:clamp(28px,4.4vw,44px);letter-spacing:-.035em;line-height:1.05;font-weight:800;margin:0}
.home section{padding:64px 0}
/* Buttons wear the app shell's border weight (GLASS.border, 2px) and the two step radius: 12 for
   buttons, 16 for cards. Hover is a 1px lift and a border shift to the river, never a glow. */
.home .btn{display:inline-block;text-align:center;font-weight:700;font-size:16px;padding:15px 30px;border-radius:12px;cursor:pointer;border:2px solid transparent;font-family:inherit;transition:transform .18s,border-color .18s,background-color .18s}
.home .btn.primary{background:var(--river);color:var(--on-river);border-color:var(--river-deep)}
.home .btn.primary:hover{transform:translateY(-1px);border-color:var(--river)}
.home .btn.ghost{background:transparent;color:var(--tx);border-color:var(--tx)}
.home .btn.ghost:hover{transform:translateY(-1px);border-color:var(--river)}
.home .btn.white{background:#fff;color:var(--on-white-river)}
.home .micro-note{font-size:13.5px;color:var(--tx-mut);margin-top:12px}

/* ⚠️ 46px OF PADDING CAME OUT OF THIS COLUMN AND NOTHING WAS RESIZED. The micro line sat 11px
   under the fold at 775px, which is the commonest laptop viewport we see. 56→40 here, 22→8 on the
   h1, 30→22 on the comparison line and 24→16 on the ticks. No type got smaller and no copy was
   cut: the promise simply arrived on the first screen instead of the second. */
.home .hero{padding:40px 0 26px}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:54px;align-items:center}
.hero h1{font-size:clamp(40px,6.4vw,72px);letter-spacing:-.045em;line-height:1.05;font-weight:800;margin:8px 0 0}
/* The gradient text and the animated squiggle are gone. Plain strong text, same palette. */
.hero h1 .hl{color:var(--river)}
/* ⚠️ THE ONE HERO ON THE SITE THAT IS NOT CENTRED, so it opts out of the shared default
   explicitly rather than relying on which stylesheet the browser read last. This hero is a
   two column grid: the words sit left, the phone sits right. margin-inline:0 is correct here
   and wrong everywhere else, which is exactly why the shared rule now centres by default. */
.hero p.sub{font-size:20px;color:var(--tx-mut);max-width:520px;margin:22px 0 18px;margin-inline:0}
/* The comparison line. Quieter than the sub and set on the ink colour rather than the muted
   one, because it is the argument rather than the description. Doc 103: it earns its place by
   changing what he compares us to, which nothing else above the fold did. */
.hero p.vs{font-size:16px;line-height:1.55;color:var(--tx);font-weight:600;max-width:520px;margin:0 0 22px;margin-inline:0}
.cta-row{display:flex;gap:14px;flex-wrap:wrap}
/* The three promises as ticks rather than a sentence. list-style is removed on purpose: the tick
   is the marker, and a browser bullet beside it would read as two. */
.hero .micro{display:flex;align-items:center;flex-wrap:wrap;gap:8px 18px;margin:16px 0 0;padding:0;list-style:none;font-size:13.5px;color:var(--tx-mut)}
.hero .micro li{display:flex;align-items:center;gap:6px}
.hero .micro .tick{color:var(--river);font-weight:800;font-size:12px;line-height:1}
@media(max-width:900px){.hero .grid{grid-template-columns:1fr;gap:34px;text-align:center}.cta-row,.hero .micro{justify-content:center}.hero p.sub,.hero p.vs{margin-inline:auto}}

/* The argument. One heading, one lead line, the deal as three rows he can look at rather than
   read, the control pair, one ask. Same 2px border language and 16px radius as every card. */
.argbody{font-size:17px;line-height:1.65;color:var(--tx);max-width:680px;margin:18px 0 0}
.argquiet{font-size:15.5px;line-height:1.65;color:var(--tx-mut);max-width:680px;margin:14px 0 0}
.argdeal{margin-top:20px;background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:6px 20px 16px;max-width:680px}
.argdeal .dealrow{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line);font-size:16px;font-weight:700}
.argdeal .dealn{flex:0 0 26px;height:26px;border-radius:999px;background:var(--river-tint);color:var(--river-deep);display:grid;place-items:center;font-size:13px;font-weight:900}
[data-theme="dark"] .argdeal .dealn{color:var(--river)}
.argdeal .dealseal{font-size:15px;font-weight:800;color:var(--tx);margin:13px 0 0}
.argrule{margin-top:20px;background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:18px 20px;max-width:680px}
.argrule .t{font-size:17px;font-weight:800;margin:0 0 8px}
.argrule p{font-size:14.5px;line-height:1.6;color:var(--tx-mut);margin:8px 0 0}
@media(max-width:640px){.argbody{font-size:15.5px;margin-top:14px}.argquiet{font-size:14px}.argdeal .dealrow{padding:11px 0;font-size:15px}.argrule{padding:16px 18px}.argrule p{font-size:14px}}

.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
@media(max-width:760px){.steps{grid-template-columns:1fr;gap:30px}}
.hstep{text-align:center}
.hstep h3{font-size:19px;margin:0 0 10px}
/* 🔴 WAS color:#fff HERE, ONE COLOUR FOR ALL THREE CIRCLES, WHILE THE FILL BEHIND IT CHANGES PER
   STEP. White on the saffron gradient reads 2.22:1 in light and 1.88:1 in dark; white on the green
   gradient's dark-mode end reads 2.37:1. lib/tokens.ts already says why: "white is not a safe
   default on a coloured fill". Each step's own ON token is correct for both its fill and both
   themes, so the ink now travels with the background at the call site instead of living once here
   for all three. See the three .stepn instances below. */
.stepn{width:62px;height:62px;border-radius:999px;margin:0 auto 18px;font-weight:900;font-size:23px;display:grid;place-items:center}

.drow{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center;margin:0 0 44px}
.drow:last-of-type{margin-bottom:0}
.drow.flip .dtext{order:2}
@media(max-width:820px){.drow{grid-template-columns:1fr;gap:22px}.drow.flip .dtext{order:0}}
.dtext h3{font-size:26px;letter-spacing:-.03em;margin:0 0 12px}
.dtext p{font-size:16px;color:var(--tx-mut)}
.dvis{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;min-height:186px;display:flex;flex-direction:column;justify-content:center;gap:9px}
.splitrow{display:flex;justify-content:space-between;padding:9px 2px;border-bottom:1px solid var(--line);font-size:14px;font-variant-numeric:tabular-nums}
.splitrow:last-child{border:0;font-weight:800}
.approvebtn{margin-top:4px;background:var(--green);color:var(--on-green);border-radius:12px;padding:11px;font-weight:800;text-align:center;font-size:14px}

/* The reviews row, in two shapes. Four or more published quotes run as the belt: a slow leftward
   loop that pauses on hover, seamless because the track carries a second aria-hidden copy of the
   run. A screen reader hears each quote once. Under four the belt would visibly roll the same
   person past again, which reads as padding, so small counts keep the static centred row, each
   card drawn exactly once. A reader who asks for reduced motion gets no animation at all: the
   duplicate copy is hidden and the row simply scrolls. These rules live twice, here and in
   MARKETING_CSS, byte identical; test/sharedcss.test.mjs holds the two copies together. */
.rev-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}
.rev-track{display:flex;gap:18px;width:max-content;animation:hslide 40s linear infinite}
.rev-marquee:hover .rev-track{animation-play-state:paused}
@keyframes hslide{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion: reduce){.rev-marquee{overflow-x:auto;-webkit-mask-image:none;mask-image:none}.rev-track{animation:none;padding:0 22px}.rev-track .quote[aria-hidden="true"]{display:none}}
.rev-static{display:flex;flex-wrap:wrap;justify-content:center;gap:18px;padding:0 22px}
.rev-static .quote{width:min(360px,100%)}
.quote{width:360px;flex:0 0 auto;background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:26px}
.rate{display:flex;gap:3px;margin-bottom:12px}
.rate svg{width:15px;height:15px;display:block}
.quote p{font-size:16px;margin:0 0 18px}
.who{display:flex;align-items:center;gap:12px}
.who .a{width:42px;height:42px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:16px}
.who b{font-size:14.5px;display:block}.who small{font-size:13px;color:var(--tx-mut)}

.pricewrap{background:linear-gradient(180deg,var(--panel-2),var(--bg));border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.pcard{background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:32px 30px;position:relative;display:flex;flex-direction:column;transition:transform .18s,border-color .18s}
.pcard:hover{transform:translateY(-1px);border-color:var(--river)}
.pname{font-size:13px;font-weight:800;color:var(--tx-mut);text-transform:uppercase;letter-spacing:.06em}
.pamt{font-size:52px;font-weight:900;letter-spacing:-.04em;margin:10px 0 2px;line-height:1;font-variant-numeric:tabular-nums}
.pamt span{font-size:18px;font-weight:700;color:var(--tx-mut);letter-spacing:0}
.pnote{font-size:13.5px;color:var(--tx-mut);margin:6px 0 0}
.pcta{margin-top:auto;padding-top:24px}
.pcta .btn{width:100%}
.pmicro{font-size:12px;color:var(--tx-mut);text-align:center;margin-top:10px}

.final{background:linear-gradient(135deg,var(--river-panel),var(--river-panel-deep));border-radius:16px;padding:56px 32px;text-align:center;color:#fff}
.final h2{font-size:clamp(28px,4.4vw,44px);color:#fff;margin:0}
.final p{color:rgba(255,255,255,.86);font-size:18px;margin:14px auto 26px;max-width:460px}
.final .micro-note{color:rgba(255,255,255,.8)}
/* ── The phone pass, 5 August 2026. Jag: people do not want to spend time reading, they want to
   look at things. Under 640px the page flows card to card: sections close up, the leads drop a
   size, and under 480px every h2 lands as a punch rather than a wall. These rules live twice,
   here and in MARKETING_CSS, byte identical apart from the scope; test/sharedcss.test.mjs holds
   the two copies together. */
@media(max-width:640px){
.home section{padding:38px 0}
.home .hero{padding:34px 0 12px}
.home .lead{font-size:16px}
.hero p.sub{font-size:17px}
.dtext h3{font-size:21px}
.dtext p{font-size:15px}
.quote{padding:20px}
.final{padding:40px 20px}
.drow{gap:16px;margin:0 0 30px}
.steps{gap:22px}
}
@media(max-width:480px){
.home .h2{font-size:24px;line-height:1.15;letter-spacing:-.025em}
.hero h1{font-size:clamp(34px,9.6vw,40px)}
.final h2{font-size:24px}
.pamt{font-size:44px}
}
`;

export default async function HomePage() {
  // Read once, at the top, so every sentence below answers to the same switch.
  const filing = filingBadge();
  const capture = captureLine();
  // 🔴 THE CONTROL PAIR SHIPS TOGETHER, ALWAYS. lib/control.ts refuses to hand over the costs
  // sentence on its own, and test/control.test.mjs proves any screen using one renders both.
  const pair = controlChoice();
  // The reviews the founder has published on the /team desk. The section renders nothing while
  // the array is empty.
  const reviews = await readPublishedTestimonials();
  // The belt runs only when there are enough cards to loop honestly. A seamless loop needs a
  // second copy of the run, and with four or more cards the copy is never on screen beside its
  // original. With fewer, the same person visibly rolls past again, which reads as padding on
  // the one section whose entire point is honesty, so small counts keep the static centred row.
  const reviewBelt = reviews.length >= 4;
  return (
    <main className="home" style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Lekhio', url: SITE, logo: `${SITE}/lekhio-logo.svg`, description: `The first employee for the UK self employed. It sorts your receipts, sends your invoices and writes the chase when they run late, works out your tax and finds the reliefs you are owed, then brings you the lot to approve. ${capture}, and Lekhio keeps you ready for Making Tax Digital. For trades, freelancers, drivers, carers, consultants, limited company directors and landlords.` },
              { '@type': 'SoftwareApplication', name: 'Lekhio', applicationCategory: 'FinanceApplication', operatingSystem: 'Web', url: SITE, description: `${capture}, and Lekhio sorts every transaction, writes the chase when an invoice runs late, finds every legal way to lower your tax, and keeps you ready for Making Tax Digital. Lekhio prepares your figures. You approve them, and nothing reaches HMRC without your yes.`, offers: [ { '@type': 'Offer', price: '12.99', priceCurrency: 'GBP', category: 'Monthly subscription' }, { '@type': 'Offer', price: '129', priceCurrency: 'GBP', category: 'Annual subscription' } ], publisher: { '@id': `${SITE}/#org` } },
              { '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
            ],
          }),
        }}
      />
      <SharedHead />
      <style dangerouslySetInnerHTML={{ __html: HOME_CSS }} />

      <SiteNav />

      {/* 1. Hero. The pill, the gradient, the squiggle and the pulsing dot are gone: a heading
          carries itself, and the report beside it is the proof. One primary ask, one secondary
          link, one micro line. */}
      <section className="hero">
        <div className="wrap grid">
          <div>
            <h1>Your first<br />employee.<br />The one that <strong className="hl">saves you money.</strong></h1>
            <p className="sub">It sorts your receipts, sends your invoices and writes the chase when they run late, works out your tax and finds the reliefs you are owed. Then you press one button. Approve.</p>
            {/* 🔴 THE LINE THAT CHANGES WHAT WE ARE COMPARED TO, doc 104 section 9, angle 1. And
                it names nobody, on Jag's call, 3 August 2026: the price does the work on its own,
                because everybody already knows what the alternative costs. */}
            <p className="vs">Your first hire costs £12.99 a month, and it never clocks off.</p>
            {/* 🔴 ONE ASK. "See how it works" stood beside Start free as an equal sized button and
                its whole job was to send a man who had decided somewhere else. The route is not
                lost: Product is in the nav on every page and in the footer. A second button next
                to the primary one is not a helpful option, it is a door out of the ask. */}
            <div className="cta-row">
              <Link href="/start" className="btn primary">Start free</Link>
            </div>
            <ul className="micro" aria-label="What the trial costs you">
              {CTA_POINTS.map((point) => (
                <li key={point}><span aria-hidden="true" className="tick">✓</span>{point}</li>
              ))}
            </ul>
          </div>
          <div><HeroReport /></div>
        </div>
      </section>

      {/* 2. The argument. Why the approve button exists, said plainly, with the control pair
          from lib/control.ts, which only ever ships as a pair. */}
      <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="reveal" style={{ maxWidth: 760, margin: '0 auto' }}>
            <h2 className="h2">Any app that says it will do your tax for you is lying to you.</h2>
            <p className="argbody">HMRC holds you responsible. It always has.</p>
            {/* The deal, as three rows a man can look at rather than a paragraph he has to read.
                Jag, 5 August 2026: people do not want to spend time reading. The sentences are the
                same deal the old paragraph carried, and the seal line under them is unchanged. */}
            <div className="argdeal">
              <div className="dealrow"><span className="dealn">1</span>Lekhio prepares it.</div>
              <div className="dealrow"><span className="dealn">2</span>It shows you the working.</div>
              <div className="dealrow"><span className="dealn">3</span>You press approve.</div>
              <p className="dealseal">That is the deal, and it never changes.</p>
            </div>
            <p className="argbody">You always know your number. What you made, what you spent, what to put by.</p>
            {/* Puchio and Rakha in one line. Their full cards live on /product. */}
            <p className="argquiet">Two of them work at it all year. Puchio answers, Rakha watches. Meet them both on the <Link href="/product" style={{ color: 'var(--river)', fontWeight: 700 }}>product page</Link>.</p>
            <div className="argrule">
              <p className="t">Nothing enters your books that you did not put there.</p>
              <p>{pair.costs}</p>
              <p>{pair.income}</p>
            </div>
            <div style={{ marginTop: 30 }}>
              <Link href="/start" className="btn primary">Start free</Link>
              <div className="micro-note">{CTA_MICRO}</div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Three steps */}
      <section style={{ background: 'var(--river-tint)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 44 }}>
            <h2 className="h2">Three steps. That is the whole thing.</h2>
            <p className="lead">Set it up once. It works in the background from then on.</p>
          </div>
          {/* 🔴 STEP ONE IS SOMETHING HE CAN DO ON DAY ONE. It used to be "Connect your bank",
              which needs a provider we do not have. All three of these work the moment he signs
              up, and none of them waits on anybody else's approval. */}
          <div className="steps reveal">
            <div className="hstep"><div className="stepn" style={{ background: 'linear-gradient(135deg,var(--river),var(--river-deep))', color: 'var(--on-river)', boxShadow: '0 12px 26px rgba(27,89,166,.32)' }}>1</div><h3>Snap it, say it, or import it</h3><p className="mut" style={{ fontSize: 15 }}>A photo of a receipt, a line of plain words, or a statement straight from your bank.</p></div>
            <div className="hstep"><div className="stepn" style={{ background: 'linear-gradient(135deg,var(--saffron),var(--saffron-deep))', color: 'var(--on-saffron)', boxShadow: '0 12px 26px rgba(224,163,62,.32)' }}>2</div><h3>It finds your money</h3><p className="mut" style={{ fontSize: 15 }}>It reads it, files it, claims the reliefs you are owed, and keeps your tax ready as you go.</p></div>
            {/* 🔴 THE GREEN GRADIENT'S SECOND STOP, #0F5C2E, IS A ONE OFF LITERAL, NOT A TOKEN. It
                does not move with the theme, so in dark mode the fill runs from DARK_GREEN (light,
                minty) down to this same fixed dark green. var(--on-green) reads 7.11:1 against the
                DARK_GREEN end and only 2.08:1 against the #0F5C2E end: no single ink threads both
                ends of THAT particular dark mode gradient. Flagged for Jag rather than fixed
                silently, because the honest fix is either a new dark aware green-deep token or a
                flat fill for this one circle, and both are look decisions, not mine to make. What
                is fixed here is the worse fault: white text, which failed both ends in both
                themes (2.22:1 and 1.88:1 on the light end alone). var(--on-green) is right
                everywhere except that one sliver, which it was not before. */}
            <div className="hstep"><div className="stepn" style={{ background: 'linear-gradient(135deg,var(--green),#0F5C2E)', color: 'var(--on-green)', boxShadow: '0 12px 26px rgba(21,128,61,.32)' }}>3</div><h3>You approve</h3><p className="mut" style={{ fontSize: 15 }}>Your figures sit there ready. You check them and send them. Nothing reaches HMRC without your yes.</p></div>
          </div>
        </div>
      </section>

      {/* 4. The one demo section. Two rows: the job (finding money) and the button (approve).
          The CIS row lives on /product and the trade pages; the voice and three ways rows said
          what the steps above already say. */}
      <section>
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 44 }}>
            <h2 className="h2">Not another app. An employee.</h2>
            <p className="lead">It keeps the books, and then it does the bit that actually puts money back in your pocket.</p>
          </div>

          <div className="drow reveal">
            <div className="dtext">
              <h3>It finds you legal ways to pay less.</h3>
              <p>Lekhio reads your own numbers and surfaces the real reliefs you are entitled to: use of home, mileage, a pension to step out of the 40% band. The legitimate ones only, and always your call. Anyone can file a return. This finds the money inside it.</p>
            </div>
            <div className="dvis">
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx-mut)', marginBottom: 2 }}>WAYS TO SAVE · AN EXAMPLE</div>
              <div className="splitrow"><span>Claim use of home</span><span style={{ color: 'var(--on-green-tint)' }}>save ~£190</span></div>
              <div className="splitrow"><span>Mileage instead of fuel</span><span style={{ color: 'var(--tx-mut)' }}>worth a look</span></div>
              <div className="splitrow"><span>Pension, step out of 40%</span><span style={{ color: 'var(--on-green-tint)' }}>save ~£1,200</span></div>
              <div className="splitrow"><span>On the table this year</span><span style={{ color: 'var(--on-green-tint)' }}>£1,390</span></div>
              {/* An example, said on the card. A panel of specific pounds with no owner reads as
                  somebody's real month, and "is it true" is doc 104's fifth standing question. */}
              <div style={{ fontSize: 11.5, color: 'var(--tx-mut)', textAlign: 'center', marginTop: 2 }}>An example month. Yours are worked out on your own figures.</div>
            </div>
          </div>

          <div className="drow flip reveal">
            <div className="dtext">
              <h3>Prepared for you. Sent by you.</h3>
              <p>Your quarterly figures sit there ready. You check them and you send them. Nothing reaches HMRC without your yes. That is the line we never cross.{filing.live ? '' : ' Filing straight from Lekhio is coming, and our HMRC recognition is in progress. Until it lands, Lekhio prepares everything so filing takes minutes.'}</p>
            </div>
            <div className="dvis">
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--tx-mut)', marginBottom: 2 }}>Q2 SUMMARY · READY TO APPROVE</div>
              <div className="splitrow"><span>Income</span><span>£28,400</span></div>
              <div className="splitrow"><span>Expenses</span><span>£9,140</span></div>
              <div className="splitrow"><span>Tax to set aside</span><span style={{ color: 'var(--river)' }}>£3,240</span></div>
              {/* 🔴 THE BUTTON MAY NOT SAY "send to HMRC" WHILE RECOGNITION IS PENDING. Both
                  wordings come from filingBadge(), so the day it is granted this upgrades itself
                  and until then the caption underneath says exactly where we stand. */}
              <div className="approvebtn">{filing.live ? 'Approve and send to HMRC →' : 'Approve my figures →'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx-mut)', textAlign: 'center', marginTop: 2 }}>{filing.live ? 'Sent through a recognised route, only when you say so.' : 'HMRC recognition in progress. You approve, always.'}</div>
            </div>
          </div>

          <div className="center reveal" style={{ marginTop: 44 }}><Link href="/product" className="btn ghost">See everything Lekhio does →</Link></div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════════════════
          5. Reviews. ⚠️ THE QUOTES COME FROM THE DATABASE, NOT THE CODE. `reviews` above is the
          result of readPublishedTestimonials, filled only by the founder on the auth gated /team
          desk. When he has published nothing this renders NOTHING. No review text lives in this
          file, which is what makes the ban on invented quotes impossible to break by a paste.
          ⚠️ ONE REAL QUOTE IS NEVER READ TWICE. The belt needs a second copy of the run to loop
          seamlessly, so every duplicate card carries aria-hidden and a screen reader hears each
          person once. Reduced motion stops the loop and hides the duplicates outright. Under
          four quotes the belt would visibly roll the same person past again, so small counts
          keep the static row, each card drawn exactly once. See the note on reviewBelt above.
          ═══════════════════════════════════════════════════════════════════════════════════════ */}
      {reviews.length > 0 ? (
        <section style={{ background: 'var(--panel-2)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          <div className="wrap">
            <div className="center reveal" style={{ marginBottom: 38 }}><h2 className="h2">In their own words.</h2></div>
          </div>
          <div className={reviewBelt ? 'rev-marquee reveal' : 'reveal'}>
            <div className={reviewBelt ? 'rev-track' : 'rev-static'}>
              {(reviewBelt ? [...reviews, ...reviews] : reviews).map((r, i) => (
                <div className="quote" key={i} aria-hidden={i >= reviews.length ? true : undefined}>
                  <div className="rate" role="img" aria-label={`${r.rating} out of 5`}>
                    {Array.from({ length: 5 }).map((_, s) => (
                      <svg key={s} viewBox="0 0 20 20" aria-hidden="true" style={{ fill: s < r.rating ? 'var(--saffron)' : 'var(--line)' }}>
                        <path d="M10 15.27L16.18 19l-1.64-7.03L20 7.24l-7.19-.61L10 0 7.19 6.63 0 7.24l5.46 4.73L3.82 19z" />
                      </svg>
                    ))}
                  </div>
                  <p>&quot;{r.quote}&quot;</p>
                  <div className="who"><span className="a" style={{ background: r.tint, color: r.fg }}>{r.name.charAt(0)}</span><div><b>{r.name}</b><small>{r.trade}</small></div></div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 6. One price card. One price, one line, and the full breakdown lives on /pricing. */}
      <section className="pricewrap">
        <div className="wrap">
          <div className="center reveal" style={{ marginBottom: 42 }}><h2 className="h2">One price. Everything in.</h2></div>
          <div className="reveal" style={{ maxWidth: 440, margin: '0 auto' }}>
            <div className="pcard">
              <div className="pname">Your first employee</div>
              <div className="pamt">£12.99<span>/mo</span></div>
              <div className="pnote">No receipt limits, no tiers, no surprises.</div>
              <div className="pcta">
                <Link href="/start" className="btn primary">Start free</Link>
                <div className="pmicro">{CTA_MICRO}</div>
              </div>
            </div>
            <p className="center" style={{ fontSize: 14, marginTop: 16 }}>
              <Link href="/pricing" style={{ color: 'var(--river)', fontWeight: 700 }}>The full breakdown, and the yearly plan, on pricing →</Link>
            </p>
          </div>
        </div>
      </section>

      {/* 7. The closing ask, in /product's framing. */}
      <section style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Hire it for a week.</h2>
            <p>If it has not earned its keep, walk away in one tap.</p>
            <Link href="/start" className="btn white" style={{ fontSize: 17 }}>Start free</Link>
            <div className="micro-note">{CTA_MICRO}</div>
          </div>
        </div>
      </section>

      <SiteFooter />
      <StickyCta />
    </main>
  );
}
