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
const PAPER = '#FBFAF7';
const SURFACE = '#F2F0EA';
const LINE = '#E7E3D9';
const MUTED = '#5B6470';

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
  { icon: '📸', title: 'Receipt capture', body: 'Photograph a receipt and it is logged in seconds. No typing, no app to open.' },
  { icon: '🎙️', title: 'Voice notes', body: 'Hands full on the job. Say the expense out loud and carry on.' },
  { icon: '🧾', title: 'Invoices from a text', body: 'Type "create invoice" on WhatsApp. Lekhio asks what it needs and sends a clean invoice for you.' },
  { icon: '✅', title: 'You approve everything', body: 'See every entry. Fix anything that looks off. Nothing counts toward your tax until you confirm it.' },
  { icon: '📊', title: 'Tax prepared for you', body: 'Quarterly Making Tax Digital figures, ready. You check them, you send them. We never imply HMRC backs us.' },
  { icon: '💬', title: 'A real person in the chat', body: 'Stuck on something. Message us on the same WhatsApp and a human replies. No hold music.' },
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
];

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
          .reveal{opacity:0;transform:translateY(20px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.7,.2,1)}
          .reveal.in{opacity:1;transform:none}
          .hero-h1,.hero-sub,.hero-cta,.hero-pill{opacity:0;animation:riseIn .8s cubic-bezier(.2,.7,.2,1) forwards}
          .hero-pill{animation-delay:.05s}.hero-h1{animation-delay:.15s}.hero-sub{animation-delay:.30s}.hero-cta{animation-delay:.45s}
          .btn-primary{transition:background-color .18s ease, transform .18s ease, box-shadow .18s ease}
          .btn-primary:hover{background-color:${RIVER_DEEP}!important;transform:translateY(-1px);box-shadow:0 10px 28px rgba(27,89,166,.28)}
          .btn-ghost{transition:background-color .18s ease}
          .btn-ghost:hover{background-color:${SURFACE}!important}
          .card{transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease}
          .card:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(17,17,17,.08);border-color:${RIVER_TINT}}
          .chip{transition:transform .15s ease, background-color .15s ease, color .15s ease}
          .chip:hover{transform:translateY(-2px);background-color:${RIVER};color:#fff}
          .navlink{transition:color .15s ease}.navlink:hover{color:${INK}!important}
          .riverflow{stroke-dasharray:1600;stroke-dashoffset:1600;animation:flow 2.6s ease forwards .3s}
          .gradtext{background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON},${RIVER});background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:sheen 8s linear infinite}
          .hero-h1-size{font-size:72px;line-height:1.04}
          .h2{font-size:38px;line-height:1.12}
          .grid3{grid-template-columns:repeat(3,1fr)}
          @media (max-width:880px){
            .hero-h1-size{font-size:42px}.h2{font-size:28px}
            .grid3{grid-template-columns:1fr}
            .nav-cta{display:none}.price-split{flex-direction:column}
          }
        `,
        }}
      />
      <noscript><style dangerouslySetInnerHTML={{ __html: `.reveal{opacity:1;transform:none}` }} /></noscript>

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
          <a href="#who" className="navlink" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>Who it is for</a>
          <a href="#pricing" className="navlink" style={{ color: MUTED, fontSize: 15, fontWeight: 500 }}>Pricing</a>
          <Link href="/early-access" className="btn-primary nav-cta" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 20px', borderRadius: 10 }}>Get early access</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 920, margin: '0 auto', padding: '70px 24px 30px', textAlign: 'center' }}>
        <div className="hero-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 20, marginBottom: 28 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', display: 'inline-block' }} />
          Works through WhatsApp. No new app to learn.
        </div>
        <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 700, letterSpacing: '-2.4px', margin: '0 0 22px' }}>
          Your books, handled.<br /><span className="gradtext">Just text it.</span>
        </h1>
        <p className="hero-sub" style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, maxWidth: 600, margin: '0 auto 36px' }}>
          Lekhio is the back office for anyone self employed in the UK. Snap a receipt, leave a voice note, or type it. Lekhio logs it, sorts it, invoices for you, and keeps you ready for tax. All on WhatsApp.
        </p>
        <div className="hero-cta" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/early-access" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Get early access</Link>
          <a href="#how" className="btn-ghost" style={{ backgroundColor: 'transparent', color: INK, border: `1px solid ${INK}`, fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>See how it works</a>
        </div>
        <p className="hero-cta" style={{ fontSize: 13, color: MUTED, marginTop: 18 }}>30 days free. No card needed to start.</p>
      </section>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '10px 24px 40px' }}><RiverDivider /></div>

      {/* How it works */}
      <section id="how" style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Three steps. That is the whole thing.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 540, margin: '0 auto' }}>No spreadsheets. No shoebox of receipts. No evenings lost to paperwork.</p>
        </div>
        <div className="grid3" style={{ display: 'grid', gap: 20 }}>
          {steps.map((s, i) => (
            <div key={s.n} className="reveal card" style={{ transitionDelay: `${i * 90}ms`, backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 28 }}>
              <div style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: RIVER_TINT, color: RIVER, fontWeight: 700, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>{s.n}</div>
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
              <div style={{ fontSize: 26, marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.2px' }}>{f.title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why different */}
      <section style={{ backgroundColor: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '84px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>The things other tools get wrong.</h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 560, margin: '0 auto' }}>We read a lot of reviews of the old accounting apps. These complaints come up again and again. We built Lekhio so you never have them.</p>
          </div>
          <div className="grid3" style={{ display: 'grid', gap: 20 }}>
            {differences.map((d, i) => (
              <div key={d.title} className="reveal card" style={{ transitionDelay: `${(i % 3) * 90}ms`, backgroundColor: PAPER, border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.2px' }}>{d.title}</h3>
                </div>
                <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{d.body}</p>
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
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✓</span>
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
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>The rules are changing and a lot of the advice out there is confusing. Here is the plain version.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {faqs.map((f, i) => (
              <div key={f.q} className="reveal" style={{ transitionDelay: `${i * 60}ms`, backgroundColor: PAPER, border: `1px solid ${LINE}`, borderRadius: 14, padding: 22 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.2px' }}>{f.q}</h3>
                <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>{f.a}</p>
              </div>
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
