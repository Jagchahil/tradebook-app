import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Lekhio. Your books, handled. Just text it.',
  description:
    'Lekhio is the WhatsApp back office for anyone self employed in the UK. Snap a receipt, leave a voice note, or just type it. Lekhio logs it, sorts it, invoices for you, and keeps you ready for tax. 30 days free.',
  openGraph: {
    title: 'Lekhio. Your books, handled. Just text it.',
    description:
      'The WhatsApp back office for the UK self employed. Snap it, say it, or text it. Lekhio does the books.',
    type: 'website',
  },
};

const INK = '#111111';
const RIVER = '#1B59A6';
const RIVER_DEEP = '#134277';
const RIVER_TINT = '#E9F1FA';
const SAFFRON = '#E0A33E';
const SAFFRON_DEEP = '#C9842A';
const SAFFRON_TINT = '#FBEFD8';
const GREEN = '#15803D';
const GREEN_TINT = '#E7F5EC';
const PAPER = '#FBFAF7';
const SURFACE = '#F2F0EA';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';
const WHATSAPP = '#25D366';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const steps = [
  {
    n: '1',
    title: 'Snap it, say it, or text it',
    body: 'Photograph a receipt on WhatsApp. Or leave a voice note. Or just type what you spent or got paid. That is the whole job.',
  },
  {
    n: '2',
    title: 'Lekhio sorts it',
    body: 'It reads the receipt, pulls out the total, sorts the category, and logs it. You get a reply to confirm. It even writes your invoices.',
  },
  {
    n: '3',
    title: 'Tax time is already done',
    body: 'Your income and expenses add up as you go. We prepare your quarterly Making Tax Digital summary. You approve it. Nothing is sent without you.',
  },
];

const audience = [
  'Electricians', 'Plumbers', 'Builders', 'Plasterers', 'Roofers', 'Joiners',
  'Cafes', 'Barbers', 'Hairdressers', 'Cleaners', 'Drivers', 'Market traders',
  'Photographers', 'Tutors', 'Carers', 'Decorators', 'Gardeners', 'Freelancers',
];

const features = [
  { icon: '📸', title: 'Receipt capture', body: 'Photograph a receipt and it is logged in seconds. No typing, no app to open.', tint: RIVER_TINT, fg: RIVER },
  { icon: '🎙️', title: 'Voice notes', body: 'Hands full on the job. Say the expense out loud and carry on.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '🧾', title: 'Invoices from a text', body: 'Type "create invoice" on WhatsApp. Lekhio asks what it needs and sends a clean invoice for you.', tint: GREEN_TINT, fg: GREEN },
  { icon: '✅', title: 'You approve everything', body: 'See every entry. Fix anything that looks off. Nothing counts toward your tax until you confirm it.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📊', title: 'Tax prepared for you', body: 'Quarterly Making Tax Digital figures, ready. You check them, you send them. We never imply HMRC backs us.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '💬', title: 'A real person in the chat', body: 'Stuck on something. Message us on the same WhatsApp and a human replies. No hold music.', tint: GREEN_TINT, fg: GREEN },
];

// Comparison. We do not name competitors. Columns speak for themselves.
const compareRows = [
  { label: 'Lives in WhatsApp, no new app to learn', lekhio: true, apps: false, diy: false },
  { label: 'Snap a receipt and it is logged for you', lekhio: true, apps: 'limit', diy: false },
  { label: 'Log an expense by voice note', lekhio: true, apps: false, diy: false },
  { label: 'Create and send an invoice from a text', lekhio: true, apps: 'extra', diy: false },
  { label: 'One flat price, everything included', lekhio: true, apps: false, diy: true },
  { label: 'Quarterly Making Tax Digital prepared', lekhio: true, apps: 'higher', diy: false },
  { label: 'A real human replies, fast', lekhio: true, apps: false, diy: 'maybe' },
  { label: 'Set up in minutes, not a weekend', lekhio: true, apps: false, diy: false },
];

const reviews = [
  {
    quote: 'I tried one of the big accounting apps and lost a whole Sunday just setting it up. With Lekhio I sent one photo and it was already working.',
    name: 'Jas',
    trade: 'Electrician, Birmingham',
    tint: RIVER_TINT,
    fg: RIVER,
  },
  {
    quote: 'My old app started charging me once I went over a receipt limit. Lekhio is one price and I snap as many as I like.',
    name: 'Sophie',
    trade: 'Mobile hairdresser, Leeds',
    tint: SAFFRON_TINT,
    fg: SAFFRON_DEEP,
  },
  {
    quote: 'The old software talked to me like I was an accountant. I am not. This one just speaks plain English.',
    name: 'Marcus',
    trade: 'Plasterer, Bristol',
    tint: GREEN_TINT,
    fg: GREEN,
  },
  {
    quote: 'Every time I had a question the other one put me through a robot. On Lekhio a real person answered on the same chat.',
    name: 'Priya',
    trade: 'Freelance designer, London',
    tint: RIVER_TINT,
    fg: RIVER,
  },
  {
    quote: 'I used to dread the quarter. Now the figures are sat there ready and I just check them over a brew.',
    name: 'Tom',
    trade: 'Plumber, Manchester',
    tint: SAFFRON_TINT,
    fg: SAFFRON_DEEP,
  },
  {
    quote: 'Voice notes are the best bit. Hands full on the roof, I just say what I spent and carry on.',
    name: 'Danny',
    trade: 'Roofer, Glasgow',
    tint: GREEN_TINT,
    fg: GREEN,
  },
];

const differences = [
  { title: 'One flat price', body: 'Twenty nine pounds a month. No tiers, no features held back, no surprise rises.' },
  { title: 'Unlimited everything', body: 'Snap as many receipts as you like. We never charge per receipt or make you buy credits.' },
  { title: 'Set up in seconds', body: 'Send your number and start. No long forms. No weekend lost to entering old data.' },
  { title: 'Leave any time', body: 'Cancel in one tap and take your records with you. No lock in, no dark patterns.' },
  { title: 'Built for you, not accountants', body: 'Plain English. Made for a busy self employed person, not someone who loves spreadsheets.' },
  { title: 'You stay in control', body: 'We prepare, you approve. Your data is yours and you can export it whenever you want.' },
];

const included = [
  'Unlimited receipt, voice, and text capture',
  'Automatic bookkeeping and categories',
  'Invoices created and sent from WhatsApp',
  'Quarterly MTD summaries prepared for you',
  'A real human on the other end',
  'Your records exported any time',
];

const faqs = [
  { q: 'Do I have to be a tradesperson?', a: 'No. Lekhio is for anyone self employed in the UK. A barber, a driver, a tutor, a freelancer, a plumber. If you keep receipts or send invoices, it is for you.' },
  { q: 'What is Making Tax Digital?', a: 'From April 2026, HMRC wants self employed people over a certain income to keep digital records and send a short update each quarter instead of one big return. Lekhio keeps those records as you work.' },
  { q: 'Does this mean paying tax four times a year?', a: 'No, that is a common myth. You send four short updates a year, but you still pay your tax on the normal dates.' },
  { q: 'Does Lekhio file my tax for me?', a: 'We prepare your figures and get them ready. You always review and approve before anything is sent, through an HMRC recognised route. You stay responsible for your tax.' },
  { q: 'What if a receipt is read wrong?', a: 'You see every entry and can fix the amount, the shop, or the category in a tap. Nothing counts until you confirm it.' },
  { q: 'Is my financial data safe?', a: 'Yes. Your data is encrypted in transit and at rest, you can only ever see your own records, and you can export or delete everything whenever you want.' },
];

function Stars() {
  return (
    <div aria-label="5 out of 5" style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ color: SAFFRON, fontSize: 15 }}>★</span>
      ))}
    </div>
  );
}

function Mark({ value }: { value: boolean | string }) {
  if (value === true) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 14, fontWeight: 800 }}>✓</span>;
  }
  if (value === false) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: '#F3F1EC', color: '#B8B2A6', fontSize: 14, fontWeight: 700 }}>✕</span>;
  }
  const labels: Record<string, string> = { limit: 'Up to a limit', extra: 'Costs extra', higher: 'Higher tiers', maybe: 'If you pay' };
  return <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{labels[value] ?? String(value)}</span>;
}

function RiverDivider() {
  return (
    <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 48 }} aria-hidden="true">
      <defs>
        <linearGradient id="rivdiv" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={RIVER} />
          <stop offset="0.6" stopColor="#2E7BBF" />
          <stop offset="1" stopColor={SAFFRON} />
        </linearGradient>
      </defs>
      <path d="M0 30 C 200 6, 360 54, 600 30 S 1000 6, 1200 30" stroke="url(#rivdiv)" strokeWidth="3" fill="none" className="riverflow" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main style={{ backgroundColor: PAPER, color: INK, fontFamily: FONT, overflowX: 'hidden' }}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          *{box-sizing:border-box} body{margin:0}
          a{text-decoration:none}
          @keyframes riseIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
          @keyframes flow{to{stroke-dashoffset:0}}
          @keyframes sheen{0%{background-position:0% 50%}100%{background-position:200% 50%}}
          @keyframes bubbleIn{0%{opacity:0;transform:translateY(10px) scale(.98)}100%{opacity:1;transform:none}}
          @keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
          @keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
          @keyframes pulseDot{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
          .reveal{opacity:0;transform:translateY(20px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
          .reveal.in{opacity:1;transform:none}
          .hero-h1,.hero-sub,.hero-cta,.hero-pill{opacity:0;animation:riseIn .8s cubic-bezier(.2,.7,.2,1) forwards}
          .hero-pill{animation-delay:.05s}.hero-h1{animation-delay:.15s}.hero-sub{animation-delay:.30s}.hero-cta{animation-delay:.45s}
          .btn-primary{transition:background-color .18s ease, transform .18s ease, box-shadow .18s ease}
          .btn-primary:hover{background-color:${RIVER_DEEP}!important;transform:translateY(-2px);box-shadow:0 12px 30px rgba(27,89,166,.30)}
          .btn-primary:active{transform:translateY(0)}
          .btn-ghost{transition:background-color .18s ease, border-color .18s ease, transform .18s ease}
          .btn-ghost:hover{background-color:${SURFACE}!important;transform:translateY(-2px)}
          .card{transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease}
          .card:hover{transform:translateY(-5px);box-shadow:0 18px 44px rgba(17,17,17,.10);border-color:${RIVER_TINT}}
          .icontile{transition:transform .2s ease}
          .card:hover .icontile{transform:scale(1.08) rotate(-3deg)}
          .chip{transition:transform .15s ease, background-color .15s ease, color .15s ease}
          .chip:hover{transform:translateY(-2px);background-color:${RIVER};color:#fff;border-color:${RIVER}}
          .navlink{transition:color .15s ease}.navlink:hover{color:${INK}!important}
          .riverflow{stroke-dasharray:1600;stroke-dashoffset:1600;animation:flow 2.6s ease forwards .3s}
          .gradtext{background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON},${RIVER});background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:sheen 8s linear infinite}
          .hero-h1-size{font-size:72px;line-height:1.04}
          .h2{font-size:38px;line-height:1.12}
          .grid3{grid-template-columns:repeat(3,1fr)}
          .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}
          .hero-left{text-align:left}
          .phone{animation:floaty 6s ease-in-out infinite}
          .bub{opacity:0;animation:bubbleIn .5s ease forwards}
          .bub1{animation-delay:.5s}.bub2{animation-delay:1.1s}.bub3{animation-delay:1.9s}.bub4{animation-delay:2.7s}
          .typing span{display:inline-block;width:6px;height:6px;border-radius:3px;background:#9aa3af;margin:0 2px;animation:blink 1.2s infinite}
          .typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}
          details.faq{transition:border-color .2s ease, box-shadow .2s ease}
          details.faq[open]{border-color:${RIVER_TINT};box-shadow:0 10px 30px rgba(17,17,17,.06)}
          details.faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px}
          details.faq summary::-webkit-details-marker{display:none}
          .faq-plus{flex-shrink:0;width:28px;height:28px;border-radius:14px;background:${RIVER_TINT};color:${RIVER};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;transition:transform .25s ease}
          details.faq[open] .faq-plus{transform:rotate(45deg)}
          .faq-body{overflow:hidden;max-height:0;opacity:0;transition:max-height .3s ease,opacity .3s ease,margin .3s ease}
          details.faq[open] .faq-body{max-height:300px;opacity:1;margin-top:12px}
          .cmp{width:100%;border-collapse:separate;border-spacing:0;min-width:640px}
          .cmp th,.cmp td{padding:16px 18px;text-align:left}
          .cmp thead th{font-size:13px;font-weight:700;letter-spacing:.3px}
          .cmp tbody tr td{border-top:1px solid ${LINE};font-size:14.5px}
          .cmp .lekcol{background:${RIVER_TINT}}
          .cmp .center{text-align:center}
          .rowlabel{font-weight:500;color:${INK}}
          @media (max-width:880px){
            .hero-h1-size{font-size:40px}.h2{font-size:27px}
            .grid3{grid-template-columns:1fr}
            .nav-cta{display:none}.price-split{flex-direction:column}
            .hero-grid{grid-template-columns:1fr;gap:30px}
            .hero-left{text-align:center}
            .hero-cta{justify-content:center}
          }
        `,
        }}
      />
      <noscript><style dangerouslySetInnerHTML={{ __html: `.reveal{opacity:1;transform:none}.bub{opacity:1;animation:none}` }} /></noscript>

      {/* Nav */}
      <nav style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <svg width="118" height="40" viewBox="0 0 300 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Lekhio">
          <defs>
            <linearGradient id="navriver" x1="20" y1="0" x2="280" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={RIVER} /><stop offset="0.6" stopColor="#2E7BBF" /><stop offset="1" stopColor={SAFFRON} />
            </linearGradient>
          </defs>
          <text x="150" y="58" textAnchor="middle" fontFamily={FONT} fontSize="54" fontWeight="700" letterSpacing="-1.8" fill={INK}>Lekhio</text>
          <path d="M34 78 C 90 64, 120 92, 150 78 S 230 64, 266 78" stroke="url(#navriver)" strokeWidth="5" strokeLinecap="round" fill="none" />
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="#how" className="navlink" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>How it works</a>
          <a href="#compare" className="navlink" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>Compare</a>
          <a href="#reviews" className="navlink" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>Reviews</a>
          <a href="#pricing" className="navlink" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>Pricing</a>
          <Link href="/early-access" className="btn-primary nav-cta" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 20px', borderRadius: 10 }}>Get early access</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '56px 24px 24px' }}>
        <div className="hero-grid">
          <div className="hero-left">
            <div className="hero-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 20, marginBottom: 24 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', display: 'inline-block', animation: 'pulseDot 2s infinite' }} />
              Works through WhatsApp. No new app to learn.
            </div>
            <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 700, letterSpacing: '-2.4px', margin: '0 0 20px' }}>
              Your books, handled.<br /><span className="gradtext">Just text it.</span>
            </h1>
            <p className="hero-sub" style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>
              Lekhio is the back office for anyone self employed in the UK. Snap a receipt, leave a voice note, or type it. Lekhio logs it, sorts it, invoices for you, and keeps you ready for tax. All on WhatsApp.
            </p>
            <div className="hero-cta" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link href="/early-access" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Get early access</Link>
              <a href="#how" className="btn-ghost" style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${INK}`, fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>See how it works</a>
            </div>
            <div className="hero-cta" style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
              <div aria-hidden="true" style={{ display: 'flex' }}>
                {['#1B59A6', '#E0A33E', '#15803D', '#134277'].map((c, i) => (
                  <span key={i} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, border: '2px solid #fff', marginLeft: i ? -8 : 0, display: 'inline-block' }} />
                ))}
              </div>
              <p style={{ fontSize: 13, color: MUTED, margin: 0 }}><span style={{ color: SAFFRON }}>★★★★★</span> &nbsp;Built with UK sole traders. 30 days free, no card needed.</p>
            </div>
          </div>

          {/* Animated WhatsApp demo */}
          <div className="hero-cta" style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="phone" style={{ width: 320, maxWidth: '100%', backgroundColor: '#fff', borderRadius: 28, border: `1px solid ${LINE}`, boxShadow: '0 30px 70px rgba(17,17,17,.16)', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#075E54', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: WHATSAPP, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💬</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Lekhio</div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>online</div>
                </div>
              </div>
              <div style={{ backgroundColor: '#ECE5DD', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 360 }}>
                <div className="bub bub1" style={{ alignSelf: 'flex-end', backgroundColor: '#DCF8C6', borderRadius: '14px 14px 4px 14px', padding: '10px 12px', maxWidth: '78%', fontSize: 13.5, color: INK }}>
                  <div style={{ backgroundColor: '#cde7b4', borderRadius: 8, padding: '18px 12px', textAlign: 'center', marginBottom: 6, fontSize: 22 }}>🧾</div>
                  Photo of receipt
                </div>
                <div className="bub bub2" style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: '14px 14px 14px 4px', padding: '10px 12px', maxWidth: '82%', fontSize: 13.5, color: INK, boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
                  Logged. Wickes, £84.20. Filed under materials. ✅
                </div>
                <div className="bub bub3" style={{ alignSelf: 'flex-end', backgroundColor: '#DCF8C6', borderRadius: '14px 14px 4px 14px', padding: '10px 12px', maxWidth: '78%', fontSize: 13.5, color: INK }}>
                  create invoice for Dave, £400 for the rewire
                </div>
                <div className="bub bub4" style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: '14px 14px 14px 4px', padding: '10px 12px', maxWidth: '82%', fontSize: 13.5, color: INK, boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
                  Invoice INV-0007 for £400 is ready. Sent to Dave and saved to your books. 👍
                </div>
                <div className="bub bub4 typing" style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.08)' }}>
                  <span /><span /><span />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px 30px' }}><RiverDivider /></div>

      {/* How it works */}
      <section id="how" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Three steps. That is the whole thing.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 540, margin: '0 auto' }}>No spreadsheets. No shoebox of receipts. No evenings lost to paperwork.</p>
        </div>
        <div className="grid3" style={{ display: 'grid', gap: 20 }}>
          {steps.map((s, i) => (
            <div key={s.n} className="reveal card" style={{ transitionDelay: `${i * 90}ms`, backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 28, position: 'relative' }}>
              <div className="icontile" style={{ width: 46, height: 46, borderRadius: 23, background: `linear-gradient(135deg, ${RIVER}, #2E7BBF)`, color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, boxShadow: '0 8px 20px rgba(27,89,166,.25)' }}>{s.n}</div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>{s.title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it is for */}
      <section id="who" style={{ backgroundColor: INK, color: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '84px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>If you work for yourself, it is for you.</h2>
            <p style={{ fontSize: 17, color: '#B6BDC8', maxWidth: 600, margin: '0 auto' }}>
              We started with the trades because they need it most. But Lekhio is for every sole trader in the UK. The van, the chair, the cab, the laptop, the market stall. Same receipts, same tax, same Lekhio.
            </p>
          </div>
          <div className="reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 860, margin: '0 auto' }}>
            {audience.map((a) => (
              <span key={a} className="chip" style={{ fontSize: 14, fontWeight: 500, color: '#fff', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', padding: '9px 16px', borderRadius: 22 }}>{a}</span>
            ))}
            <span style={{ fontSize: 14, fontWeight: 600, color: SAFFRON, padding: '9px 16px' }}>and everyone else.</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '84px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Everything your accountant nags you for.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>Done as you work, not at the end of the year.</p>
        </div>
        <div className="grid3" style={{ display: 'grid', gap: 20 }}>
          {features.map((f, i) => (
            <div key={f.title} className="reveal card" style={{ transitionDelay: `${(i % 3) * 90}ms`, backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
              <div className="icontile" style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: f.tint, color: f.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.2px' }}>{f.title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" style={{ backgroundColor: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '84px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>How Lekhio compares.</h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 560, margin: '0 auto' }}>The old way is an app that wants a weekend of setup, or a spreadsheet and a shoebox. Here is the honest side by side.</p>
          </div>
          <div className="reveal" style={{ backgroundColor: PAPER, border: `1px solid ${LINE}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 14px 40px rgba(17,17,17,.06)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="cmp">
                <thead>
                  <tr>
                    <th style={{ color: MUTED }}></th>
                    <th className="center lekcol" style={{ color: RIVER_DEEP, borderTopLeftRadius: 0 }}>Lekhio</th>
                    <th className="center" style={{ color: MUTED }}>Typical accounting apps</th>
                    <th className="center" style={{ color: MUTED }}>Spreadsheets and shoeboxes</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((r) => (
                    <tr key={r.label}>
                      <td className="rowlabel">{r.label}</td>
                      <td className="center lekcol"><Mark value={r.lekhio} /></td>
                      <td className="center"><Mark value={r.apps} /></td>
                      <td className="center"><Mark value={r.diy} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="reveal" style={{ textAlign: 'center', marginTop: 36 }}>
            <Link href="/early-access" className="btn-primary" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Switch to the easy way</Link>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section id="reviews" style={{ maxWidth: 1100, margin: '0 auto', padding: '84px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Why people leave the old tools.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 560, margin: '0 auto' }}>We read the one star reviews of the big accounting apps so you do not have to. These are the exact things people told us, and what Lekhio does instead.</p>
        </div>
        <div className="grid3" style={{ display: 'grid', gap: 20 }}>
          {reviews.map((r, i) => (
            <div key={r.name} className="reveal card" style={{ transitionDelay: `${(i % 3) * 90}ms`, backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column' }}>
              <Stars />
              <p style={{ fontSize: 15.5, color: INK, lineHeight: 1.6, margin: '0 0 20px', flex: 1 }}>“{r.quote}”</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="icontile" style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: r.tint, color: r.fg, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.name.charAt(0)}</span>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{r.name}</div>
                  <div style={{ fontSize: 13, color: MUTED }}>{r.trade}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="reveal" style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 28, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
          Illustrative, based on common complaints about other tools. We will replace these with real Lekhio customers as we launch.
        </p>
      </section>

      {/* Why different */}
      <section style={{ backgroundColor: INK, color: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '84px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>The things other tools get wrong.</h2>
            <p style={{ fontSize: 17, color: '#B6BDC8', maxWidth: 560, margin: '0 auto' }}>We built Lekhio so you never have these complaints.</p>
          </div>
          <div className="grid3" style={{ display: 'grid', gap: 20 }}>
            {differences.map((d, i) => (
              <div key={d.title} className="reveal card" style={{ transitionDelay: `${(i % 3) * 90}ms`, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: 26 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(224,163,62,0.18)', color: SAFFRON, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.2px', color: '#fff' }}>{d.title}</h3>
                </div>
                <p style={{ fontSize: 15, color: '#B6BDC8', lineHeight: 1.6, margin: 0 }}>{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: 1100, margin: '0 auto', padding: '84px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>One price. No surprises.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>Try it free for 30 days. Keep it for less than a tank of fuel a month.</p>
        </div>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto', backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 18px 50px rgba(17,17,17,.07)' }}>
          <div className="price-split" style={{ display: 'flex' }}>
            <div style={{ flex: 1, padding: 36, borderRight: `1px solid ${LINE}` }}>
              <div style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 8, marginBottom: 22 }}>30 DAYS FREE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 54, fontWeight: 800, letterSpacing: '-2px' }}>£29</span>
                <span style={{ fontSize: 17, color: MUTED }}>/ month</span>
              </div>
              <p style={{ fontSize: 14, color: MUTED, margin: '0 0 26px' }}>After your free trial. Cancel any time.</p>
              <Link href="/early-access" className="btn-primary" style={{ display: 'block', textAlign: 'center', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: 15, borderRadius: 12 }}>Start free trial</Link>
            </div>
            <div style={{ flex: 1, padding: 36 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 18px' }}>What you get</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {included.map((line) => (
                  <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 15, color: INK, lineHeight: 1.5 }}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ backgroundColor: '#fff', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '84px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Making Tax Digital, explained straight.</h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>The rules are changing and a lot of the advice out there is confusing. Tap a question for the plain version.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {faqs.map((f, i) => (
              <details key={f.q} className="faq reveal" style={{ transitionDelay: `${i * 50}ms`, backgroundColor: PAPER, border: `1px solid ${LINE}`, borderRadius: 14, padding: '20px 22px' }}>
                <summary>
                  <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>{f.q}</h3>
                  <span className="faq-plus" aria-hidden="true">+</span>
                </summary>
                <div className="faq-body">
                  <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Promise band */}
      <section style={{ backgroundColor: INK }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}><RiverDivider /></div>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 76px', textAlign: 'center' }}>
          <h2 className="h2" style={{ color: '#fff', fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 16px' }}>You are good at your trade. Let Lekhio do the paperwork.</h2>
          <p style={{ fontSize: 17, color: '#B6BDC8', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 32px' }}>
            HMRC keeps you responsible for your tax. Lekhio keeps you ready for it. We prepare your figures. You always approve before anything is sent.
          </p>
          <Link href="/early-access" className="btn-primary" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Get early access</Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: PAPER }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 4 }}>Lekhio</div>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Your books, handled. Just text it.</p>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Link href="/early-access" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Early access</Link>
            <Link href="/privacy" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Privacy</Link>
            <Link href="/terms" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Terms</Link>
            <a href="mailto:support@lekhio.com" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Support</a>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 36px' }}>
          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
            © {new Date().getFullYear()} Lekhio, a Satluj Ventures company. Built for the UK self employed. Lekhio prepares your records. You stay responsible for your tax with HMRC.
          </p>
        </div>
      </footer>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var els=document.querySelectorAll('.reveal');if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')});return;}var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}})},{threshold:0.12});els.forEach(function(e){io.observe(e)});}catch(e){document.querySelectorAll('.reveal').forEach(function(x){x.classList.add('in')});}})();`,
        }}
      />
    </main>
  );
}
