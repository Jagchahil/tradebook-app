// Shared site chrome, tokens, content data, and helper components.
// Single source of truth so the lean homepage and every focused page
// (product, how-mtd-works, compare, pricing) look and behave identically.
// Server components only, no client boundary needed. The reveal + countup
// behaviour is injected as an idempotent inline script by <SharedHead />.
import Link from 'next/link';
import { TRADES } from '../../lib/trades';
import { A11Y_CSS } from '../../lib/tokens';

export const INK = '#111111';
export const RIVER = '#1B59A6';
export const RIVER_DEEP = '#134277';
export const RIVER_TINT = '#E9F1FA';
export const SAFFRON = '#E0A33E';
export const SAFFRON_DEEP = '#C9842A';
export const SAFFRON_TINT = '#FBEFD8';
export const GREEN = '#15803D';
export const GREEN_TINT = '#E7F5EC';
export const RED_INK = '#C0392B';
export const RED_BG = '#FDECEC';
export const PAPER = '#FBFAF7';
export const SURFACE = '#F2F0EA';
export const LINE = '#E7E3D9';
export const MUTED = '#5B6470';
export const WHATSAPP = '#25D366';
export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const SITE = 'https://tradebook-app-five.vercel.app';

// ---------- content data ----------
export const steps = [
  { n: '1', title: 'Snap it, say it, or text it', body: 'Photograph a receipt on WhatsApp. Or leave a voice note. Or just type what you spent or got paid. That is the whole job.' },
  { n: '2', title: 'Lekhio sorts it', body: 'It reads the receipt, pulls out the total, sorts the category, and logs it. You get a reply to confirm. It even writes your invoices.' },
  { n: '3', title: 'Tax time is already done', body: 'Your income and expenses add up as you go. We prepare your quarterly summary. You approve it. Nothing is sent without you.' },
];

export const stats = [
  { to: 30, prefix: '', suffix: 's', label: 'to log a receipt' },
  { to: 19.99, prefix: '£', suffix: '', label: 'a month, everything in' },
  { to: 4, prefix: '', suffix: '', label: 'short updates a year, not one big return' },
  { to: 0, prefix: '', suffix: '', label: 'spreadsheets for you to keep' },
];

export const audience = [
  'Electricians', 'Plumbers', 'Builders', 'Plasterers', 'Roofers', 'Joiners',
  'Cafes', 'Barbers', 'Hairdressers', 'Cleaners', 'Drivers', 'Market traders',
  'Photographers', 'Tutors', 'Carers', 'Decorators', 'Gardeners', 'Freelancers',
];

export const features = [
  { icon: '📸', title: 'Receipt capture', body: 'Photograph a receipt and it is logged in seconds. No typing, no app to open.', tint: RIVER_TINT, fg: RIVER },
  { icon: '🎙️', title: 'Voice notes', body: 'Hands full on the job. Say the expense out loud and carry on.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '🚗', title: 'Mileage in a text', body: 'Text "drove 24 miles to the job" and Lekhio logs the claim at the HMRC rate. No fiddly logbook.', tint: RIVER_TINT, fg: RIVER },
  { icon: '🧾', title: 'Invoices from a text', body: 'Type "create invoice" on WhatsApp. Lekhio asks what it needs and sends a clean invoice for you.', tint: GREEN_TINT, fg: GREEN },
  { icon: '👷', title: 'CIS done right', body: 'Subcontractor? Lekhio splits labour and materials, applies your CIS deduction, and tracks the refund building up. Other apps charge extra or get it wrong.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '✅', title: 'You approve everything', body: 'See every entry. Fix anything that looks off. Nothing counts toward your tax until you confirm it.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📊', title: 'Tax prepared for you', body: 'Quarterly figures, ready. You check them, you send them. We never imply HMRC backs us.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '💡', title: 'Can I claim it?', body: 'Not sure if something counts? Text "can I claim my work boots?" and Lekhio answers straight, the grey areas included.', tint: RIVER_TINT, fg: RIVER },
  { icon: '💬', title: 'A real person in the chat', body: 'Stuck on something. Message us on the same WhatsApp and a human replies. No hold music.', tint: GREEN_TINT, fg: GREEN },
];

export const mtdMeans = [
  { icon: '🗂️', title: 'Keep digital records', body: 'HMRC wants your income and costs kept digitally. Lekhio logs every receipt and payment as you go, so this is already done.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📨', title: 'Send four short updates', body: 'Instead of one big return in January, you send four quick summaries across the year. Lekhio prepares each one for you.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '🤝', title: 'You stay in control', body: 'Nothing goes to HMRC until you say yes. HMRC keeps you responsible for your tax. Lekhio just keeps you ready for it.', tint: GREEN_TINT, fg: GREEN },
];

export const compareRows = [
  { label: 'Lives in WhatsApp, no new app to learn', lekhio: true, apps: false, diy: false },
  { label: 'Snap a receipt and it is fully logged, not just matched', lekhio: true, apps: 'limit', diy: false },
  { label: 'Log an expense by voice note', lekhio: true, apps: false, diy: false },
  { label: 'Claim mileage, home, phone and CIS from a text', lekhio: true, apps: false, diy: false },
  { label: 'Create and send an invoice from a text', lekhio: true, apps: 'extra', diy: false },
  { label: 'CIS split and deduction done for you', lekhio: true, apps: 'higher', diy: false },
  { label: 'Quarterly MTD updates prepared for you', lekhio: true, apps: 'higher', diy: false },
  { label: 'A real human replies fast, in the same chat', lekhio: true, apps: false, diy: 'maybe' },
  { label: 'Plain English, built for the non accountant', lekhio: true, apps: false, diy: true },
  { label: 'One flat price, no receipt limits, no paywalls', lekhio: true, apps: false, diy: true },
  { label: 'Set up in minutes, cancel in one tap', lekhio: true, apps: false, diy: false },
  { label: 'File straight to HMRC', lekhio: 'soon', apps: true, diy: false },
  { label: 'Connect your bank, read only', lekhio: 'soon', apps: true, diy: false },
];

export const reviews = [
  { quote: 'I tried one of the big accounting apps and lost a whole Sunday just setting it up. With Lekhio I sent one photo and it was already working.', name: 'Jas', trade: 'Electrician, Birmingham', tint: RIVER_TINT, fg: RIVER },
  { quote: 'My old app started charging me once I went over a receipt limit. Lekhio is one price and I snap as many as I like.', name: 'Sophie', trade: 'Mobile hairdresser, Leeds', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { quote: 'The old software talked to me like I was an accountant. I am not. This one just speaks plain English.', name: 'Marcus', trade: 'Plasterer, Bristol', tint: GREEN_TINT, fg: GREEN },
  { quote: 'Every time I had a question the other one put me through a robot. On Lekhio a real person answered on the same chat.', name: 'Priya', trade: 'Freelance designer, London', tint: RIVER_TINT, fg: RIVER },
  { quote: 'I used to dread the quarter. Now the figures are sat there ready and I just check them over a brew.', name: 'Tom', trade: 'Plumber, Manchester', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { quote: 'Voice notes are the best bit. Hands full on the roof, I just say what I spent and carry on.', name: 'Danny', trade: 'Roofer, Glasgow', tint: GREEN_TINT, fg: GREEN },
];

export const claimExamples = [
  { text: 'drove 24 miles', result: '£13.20 of travel, logged' },
  { text: 'worked 90 hours from home', result: '£18 home office claimed' },
  { text: 'phone bill £45, 80% business', result: '£36 logged' },
  { text: '£400 paid, £80 CIS deducted', result: 'gross logged, refund tracked' },
];

export const comingSoon = [
  { icon: '📤', title: 'File straight to HMRC', body: 'Submit your quarterly updates and your return from Lekhio, when you approve, through a recognised route.' },
  { icon: '📊', title: 'Your HMRC balance, live', body: 'See exactly what you owe, what is due, and any refund building, right in the app.' },
  { icon: '🏦', title: 'Connect your bank', body: 'Money in and out logs itself, read only, so your books stay up to date with no effort.' },
  { icon: '🧑‍💼', title: 'A real accountant, on tap', body: 'For the tricky bits, a qualified accountant inside Lekhio. No leaving for help, ever.' },
];

export const fixes = [
  { stars: 1, who: 'A sole trader, reviewing another app', gripe: 'Tried for two days to reach a human. Every time I just got a bot going in circles.', fix: 'A real person replies on the same WhatsApp. No bots, no hold music.' },
  { stars: 1, who: 'A tradesperson, reviewing another app', gripe: 'They put the price up again, and capped how many receipts I could scan. Felt like a trap.', fix: 'One flat £19.99 a month. Unlimited receipts, voice notes and mileage. No tiers, no surprises.' },
  { stars: 1, who: 'A self employed driver, reviewing another app', gripe: 'The bank feed kept dropping. Half my month went missing and I had to relink it again and again.', fix: 'Lekhio never leans on a fragile feed. Snap it or text it and it is logged for good. Connecting your bank, when it lands, is a bonus, never a crutch.' },
  { stars: 2, who: 'A trades subcontractor, reviewing another app', gripe: 'I photographed a receipt and it would not even log it. It just tried to match it to something and gave up.', fix: 'Send a photo and Lekhio reads it and logs the lot, the amount, the VAT, the category, in seconds. No matching, no retyping.' },
  { stars: 1, who: 'A small business owner, reviewing another app', gripe: 'They held my own money for weeks with a copy and paste excuse. Never again.', fix: 'Lekhio never holds your money or touches your account. We keep the records, that is all. Your cash is only ever yours.' },
  { stars: 2, who: 'A freelancer, reviewing another app', gripe: 'It talks to me like I am an accountant. I am not. Half of it I do not understand.', fix: 'Plain English, and it lives in WhatsApp. If you can send a text, you can use Lekhio.' },
  { stars: 2, who: 'A self employed cleaner, reviewing another app', gripe: 'Once it auto sorted something wrong, fixing it was a proper faff. I gave up correcting it.', fix: 'Wrong category? Just say "that was fuel, not food" and it is fixed in one line. You are always in charge of every entry.' },
  { stars: 1, who: 'A small business owner, reviewing another app', gripe: 'Cancelling was a nightmare. I felt completely locked in.', fix: 'Cancel any time, in one tap. Your records export whenever you want.' },
];

export const freeTools = [
  { href: '/tax-calculator', icon: '🧮', title: 'Tax calculator', body: 'Your tax, National Insurance, take home and what to set aside, in seconds.' },
  { href: '/invoice-generator', icon: '🧾', title: 'Invoice and quote maker', body: 'A clean, professional invoice or quote in two minutes. Save as PDF, no signup.' },
  { href: '/can-i-claim', icon: '💡', title: 'Can I claim it?', body: 'The real rules on what you can and cannot claim, the grey areas included.' },
  { href: '/file-your-tax-return', icon: '📋', title: 'File your own return', body: 'A step by step walkthrough by trade, so you can do it yourself.' },
];

export const oldAccountant = [
  'A bill of £150 to £900 a year, just to file.',
  'You see them once, at year end, when it is too late to plan.',
  'A shoebox of receipts to dig out every January.',
  'Jargon and forms you do not follow.',
  'Days, sometimes weeks, for a simple answer.',
];

export const lekhioWay = [
  'One flat £19.99 a month, with everything in.',
  'With you every day, not once a year.',
  'Snap each receipt as you go. Nothing to dig out.',
  'Plain English, always. Ask it anything.',
  'A real person replies fast, on the same chat.',
];

export const moneyFlow = [
  { label: 'Money in', pct: '100%', color: GREEN, val: '£1,000' },
  { label: 'Costs you claim', pct: '22%', color: SAFFRON, val: '£220' },
  { label: 'Tax to set aside', pct: '18%', color: RED_INK, val: '£180' },
  { label: 'In your pocket', pct: '60%', color: RIVER, val: '£600' },
];

export const included = [
  'Unlimited receipt, voice, text, and mileage capture',
  'Automatic bookkeeping and categories',
  'Invoices created and sent from WhatsApp',
  'MTD ready quarterly summaries, you approve before anything is filed',
  'A real human on the other end, fast',
  'Records exported any time, and cancel in one tap',
];

export const replaces = [
  { icon: '📒', label: 'Bookkeeping app', cost: '£10 to £20' },
  { icon: '🧾', label: 'Invoicing tool', cost: '£10 to £25' },
  { icon: '🗓️', label: 'Diary and reminders', cost: '£5 to £15' },
  { icon: '🧮', label: 'Tax software', cost: '£10 to £20' },
  { icon: '🚗', label: 'Mileage tracker', cost: '£5 to £10' },
  { icon: '🧑‍💼', label: 'Accountant fees', cost: '£20 to £60' },
];

export const faqs = [
  { q: 'Do I have to be a tradesperson?', a: 'No. Lekhio is for anyone self employed in the UK. A barber, a driver, a tutor, a freelancer, a plumber. If you keep receipts or send invoices, it is for you.' },
  { q: 'What is Making Tax Digital?', a: 'From April 2026, HMRC wants self employed people over a certain income to keep digital records and send a short update each quarter instead of one big return. Lekhio keeps those records as you work.' },
  { q: 'Does this mean paying tax four times a year?', a: 'No, that is a common myth. You send four short updates a year, but you still pay your tax on the normal dates.' },
  { q: 'Does Lekhio file my tax for me?', a: 'We prepare your figures and get them ready. You always review and approve before anything is sent, through an HMRC recognised route. You stay responsible for your tax.' },
  { q: 'What if a receipt is read wrong?', a: 'You see every entry and can fix the amount, the shop, or the category in a tap. Nothing counts until you confirm it.' },
  { q: 'Is my financial data safe?', a: 'Yes. Your data is encrypted in transit and at rest, you can only ever see your own records, and you can export or delete everything whenever you want.' },
];

// The looping hero conversation, pure CSS.
export const chatMessages: { side: 'out' | 'in'; text: string; image?: string }[] = [
  { side: 'out', image: '🧾', text: 'Screwfix receipt' },
  { side: 'in', text: 'Logged. £42.60, materials ✅' },
  { side: 'out', text: 'drove 32 miles to the job' },
  { side: 'in', text: '£17.60 mileage claimed at the HMRC rate ✅' },
  { side: 'out', text: 'how much profit this month?' },
  { side: 'in', text: "You're £2,240 up this month 📈" },
  { side: 'out', text: 'invoice Dave £450 for the rewire' },
  { side: 'in', text: 'Sent ✅  Dave paid. +£450 income 💷' },
];
const HERO_CHAT_LOOP = 9.5;
const chatAppear = [2, 12, 23, 34, 45, 56, 67, 79];
export const chatCss =
  `.cmsg{opacity:0}` +
  `@media (prefers-reduced-motion: reduce){.cmsg{opacity:1 !important;animation:none !important;transform:none !important}}` +
  chatMessages
    .map((_, i) => {
      const a = chatAppear[i];
      return `@keyframes cmsg${i}{0%,${a}%{opacity:0;transform:translateY(8px)}${a + 3}%,93%{opacity:1;transform:none}98%,100%{opacity:0}}.cmsg${i}{animation:cmsg${i} ${HERO_CHAT_LOOP}s infinite}`;
    })
    .join('');

// ---------- helper components ----------
export function Stars() {
  return (
    <div aria-label="5 out of 5" style={{ display: 'flex', gap: 2, marginBottom: 14 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ color: SAFFRON, fontSize: 15 }}>★</span>
      ))}
    </div>
  );
}

export function Mark({ value }: { value: boolean | string }) {
  if (value === true) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 14, fontWeight: 800 }}>✓</span>;
  }
  if (value === false) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, backgroundColor: '#F3F1EC', color: '#B8B2A6', fontSize: 14, fontWeight: 700 }}>✕</span>;
  }
  if (value === 'soon') {
    return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', color: SAFFRON_DEEP, background: SAFFRON_TINT, padding: '4px 9px', borderRadius: 12 }}>Soon</span>;
  }
  const labels: Record<string, string> = { limit: 'Up to a limit', extra: 'Costs extra', higher: 'Higher tiers', maybe: 'If you pay' };
  return <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{labels[value] ?? String(value)}</span>;
}

export function ReviewCard({ r }: { r: (typeof reviews)[number] }) {
  return (
    <div className="rev-card" style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column' }}>
      <Stars />
      <p style={{ fontSize: 15.5, color: INK, lineHeight: 1.6, margin: '0 0 20px', flex: 1 }}>“{r.quote}”</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: r.tint, color: r.fg, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.name.charAt(0)}</span>
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{r.name}</div>
          <div style={{ fontSize: 13, color: MUTED }}>{r.trade}</div>
        </div>
      </div>
    </div>
  );
}

export function RiverDivider() {
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

export function MiniRiver() {
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
      <div style={{ width: 24, height: 3, borderRadius: 2, background: RIVER }} />
      <div style={{ width: 11, height: 3, borderRadius: 2, background: SAFFRON }} />
    </div>
  );
}

export function AppDash() {
  const cards: [string, string, string, string][] = [
    ['INCOME', '£2,450', GREEN, GREEN_TINT],
    ['EXPENSES', '£1,180', RED_INK, RED_BG],
    ['PROFIT', '£1,270', RIVER, RIVER_TINT],
  ];
  const rows: [string, string, string, string, string][] = [
    ['🏗️', 'Wickes', 'Materials', '-£84.20', RED_INK],
    ['⛽', 'BP', 'Fuel', '-£62.00', RED_INK],
    ['💷', 'Dave Wilson', 'Invoice', '+£400.00', GREEN],
  ];
  return (
    <div className="appscreen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: INK }}>Lekhio</div>
          <MiniRiver />
        </div>
        <span style={{ fontSize: 9, fontWeight: 700, color: RIVER, background: RIVER_TINT, padding: '3px 8px', borderRadius: 10, letterSpacing: '0.4px' }}>TRIAL</span>
      </div>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 9 }}>Good morning · June 2026</div>
      <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
        {cards.map(([l, v, fg, bg]) => (
          <div key={l} style={{ flex: 1, background: bg, borderRadius: 11, padding: '10px 9px' }}>
            <div style={{ fontSize: 7.5, fontWeight: 700, color: MUTED, letterSpacing: '0.5px' }}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: fg, marginTop: 5, letterSpacing: '-0.3px' }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, color: INK }}>Recent</div>
      <div className="appcard" style={{ marginTop: 8, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map(([e, n, c, a, col], i) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 11px', borderTop: i ? `1px solid ${SURFACE}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{e}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>{n}</div>
                <div style={{ fontSize: 10, color: MUTED }}>{c}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: col }}>{a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppTax() {
  return (
    <div className="appscreen">
      <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Tax</div>
      <MiniRiver />
      <div style={{ marginTop: 12, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: RIVER }}>Q2 2026/27 · Jul to Sep</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          {['1', '2', '3', '4'].map((q, i) => (
            <div key={q} style={{ textAlign: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: i === 1 ? '#fff' : i < 1 ? RIVER_TINT : SURFACE, border: i === 1 ? `2px solid ${RIVER}` : '2px solid transparent', color: i <= 1 ? RIVER : MUTED }}>{q}</div>
              <div style={{ fontSize: 9, color: i === 1 ? INK : MUTED, marginTop: 4, fontWeight: 600 }}>Q{q}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED }}>💰 Income</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: GREEN }}>£2,450.00</span>
      </div>
      <div style={{ marginTop: 9, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: MUTED }}>🧾 Expenses</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: RED_INK }}>£1,180.00</span>
      </div>
      <div style={{ marginTop: 9, paddingTop: 12, borderTop: `1px solid ${SURFACE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: INK }}>Estimated profit</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: RIVER }}>£1,270.00</span>
      </div>
      <div style={{ marginTop: 14, background: RIVER, color: '#fff', borderRadius: 12, padding: '12px 0', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>Prepare my summary</div>
    </div>
  );
}

export function AppInv() {
  const rows: [string, string, string, string, string, string][] = [
    ['Dave Wilson', 'INV-0007', '£400.00', 'Paid', GREEN, '#DCFCE7'],
    ['Sarah Khan', 'INV-0008', '£150.00', 'Sent', RIVER, RIVER_TINT],
  ];
  return (
    <div className="appscreen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Invoices</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: RIVER, padding: '7px 13px', borderRadius: 10 }}>+ New</span>
      </div>
      <div style={{ marginTop: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '15px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>Outstanding</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: INK }}>£550.00</span>
      </div>
      <div style={{ marginTop: 12, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map(([n, num, amt, st, fg, bg], i) => (
          <div key={num} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 14px', borderTop: i ? `1px solid ${SURFACE}` : 'none' }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>{n}</div>
              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>{num}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{amt}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: fg, background: bg, padding: '3px 7px', borderRadius: 7 }}>{st}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroPhone() {
  return (
    <div className="phone" style={{ width: 320, maxWidth: '100%', backgroundColor: '#fff', borderRadius: 28, border: `1px solid ${LINE}`, boxShadow: '0 30px 70px rgba(17,17,17,.16)', overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#075E54', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: WHATSAPP, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💬</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Lekhio</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>online</div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: chatCss }} />
      <div style={{ backgroundColor: '#ECE5DD', padding: '18px 14px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 380 }}>
        {chatMessages.map((m, i) => (
          <div key={i} className={`cmsg cmsg${i}`} style={{ alignSelf: m.side === 'out' ? 'flex-end' : 'flex-start', backgroundColor: m.side === 'out' ? '#DCF8C6' : '#fff', borderRadius: m.side === 'out' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', padding: '10px 12px', maxWidth: m.side === 'out' ? '80%' : '84%', fontSize: 13.5, color: INK, boxShadow: m.side === 'in' ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>
            {m.image ? <div style={{ backgroundColor: '#cde7b4', borderRadius: 8, padding: '16px 12px', textAlign: 'center', marginBottom: 6, fontSize: 22 }}>{m.image}</div> : null}
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- shared chrome ----------
const SHARED_CSS = `
*{box-sizing:border-box} body{margin:0}
a{text-decoration:none}
@keyframes riseIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes flow{to{stroke-dashoffset:0}}
@keyframes sheen{0%{background-position:0% 50%}100%{background-position:200% 50%}}
@keyframes bubbleIn{0%{opacity:0;transform:translateY(10px) scale(.98)}100%{opacity:1;transform:none}}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes pulseDot{0%{box-shadow:0 0 0 0 rgba(34,197,94,.5)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
@keyframes grow{to{transform:scaleX(1)}}
@keyframes popIn{0%{opacity:0;transform:scale(.4)}100%{opacity:1;transform:scale(1)}}
@keyframes marquee{to{transform:translateX(-50%)}}
.reveal{opacity:0;transform:translateY(16px);transition:opacity .4s ease,transform .4s cubic-bezier(.2,.7,.2,1)}
.reveal.in{opacity:1;transform:none}
.hero-h1,.hero-sub,.hero-cta,.hero-pill{opacity:0;animation:riseIn .5s cubic-bezier(.2,.7,.2,1) forwards}
.hero-pill{animation-delay:.04s}.hero-h1{animation-delay:.1s}.hero-sub{animation-delay:.2s}.hero-cta{animation-delay:.3s}
.btn-primary{transition:background-color .18s ease, transform .18s ease, box-shadow .18s ease}
.btn-primary:hover{background-color:${RIVER_DEEP}!important;transform:translateY(-2px);box-shadow:0 12px 30px rgba(27,89,166,.30)}
.btn-primary:active{transform:translateY(0)}
.btn-ghost{transition:background-color .18s ease, border-color .18s ease, transform .18s ease}
.btn-ghost:hover{background-color:${SURFACE}!important;transform:translateY(-2px)}
.btn-white{transition:transform .18s ease, box-shadow .18s ease}
.btn-white:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(0,0,0,.18)}
.card{transition:transform .2s ease, box-shadow .2s ease, border-color .2s ease}
.card:hover{transform:translateY(-5px);box-shadow:0 18px 44px rgba(17,17,17,.10);border-color:${RIVER_TINT}}
.icontile{transition:transform .2s ease}
.card:hover .icontile{transform:scale(1.08) rotate(-3deg)}
.chip{transition:transform .15s ease, background-color .15s ease, color .15s ease}
.chip:hover{transform:translateY(-2px);background-color:${RIVER};color:#fff;border-color:${RIVER}}
.riverflow{stroke-dasharray:1600;stroke-dashoffset:1600;animation:flow 1.4s ease forwards .15s}
.gradtext{background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON},${RIVER});background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:sheen 5s linear infinite}
.hero-h1-size{font-size:64px;line-height:1.05}
.h2{font-size:38px;line-height:1.12}
.grid3{grid-template-columns:repeat(3,1fr)}
.grid4{grid-template-columns:repeat(4,1fr)}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
.hero-left{text-align:left}
.phone{animation:floaty 6s ease-in-out infinite}
.stepper{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.stepper-line{position:absolute;top:30px;left:16%;right:16%;height:3px;background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .2s}
.step{text-align:center;position:relative}
.step-num{width:60px;height:60px;border-radius:30px;background:linear-gradient(135deg,${RIVER},#2E7BBF);color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;box-shadow:0 10px 24px rgba(27,89,166,.3);position:relative;z-index:1;border:5px solid ${PAPER}}
.stat-num{font-size:48px;font-weight:800;letter-spacing:-1.5px;line-height:1}
.timeline{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:10px}
.tl-line{position:absolute;top:18px;left:10%;right:10%;height:3px;background:linear-gradient(90deg,${RIVER},${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .15s}
.tl-step{text-align:center;position:relative}
.tl-dot{width:38px;height:38px;border-radius:19px;background:#fff;border:3px solid ${RIVER};color:${RIVER};font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;position:relative;z-index:1;opacity:0;animation:popIn .5s ease forwards}
.marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
.marquee-track{display:flex;gap:20px;width:max-content;animation:marquee 48s linear infinite}
.marquee:hover .marquee-track{animation-play-state:paused}
.rev-card{width:340px;flex:0 0 auto}
.appdemo-grid{display:grid;grid-template-columns:.95fr 1.05fr;gap:48px;align-items:center}
.appphone{width:340px;max-width:100%;margin:0 auto;background:#fff;border-radius:40px;border:1px solid ${LINE};box-shadow:0 30px 70px rgba(17,17,17,.18);overflow:hidden}
.appstatus{height:30px;display:flex;align-items:center;justify-content:center;background:#fff}
.appstatus i{width:96px;height:6px;border-radius:3px;background:${LINE};display:block}
.appview{position:relative;height:438px;overflow:hidden;background:${PAPER}}
.apptrack{display:flex;width:400%;height:100%;animation:appslide 7s cubic-bezier(.65,0,.35,1) infinite}
.appscreen{width:25%;flex:0 0 25%;height:100%;padding:18px 18px;overflow:hidden}
@keyframes appslide{0%,22%{transform:translateX(0)}28%,47%{transform:translateX(-25%)}53%,72%{transform:translateX(-50%)}78%,100%{transform:translateX(-75%)}}
.appdot{display:inline-block;width:7px;height:7px;border-radius:4px;background:${LINE};margin:0 3px}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.nav-right{display:flex;align-items:center;gap:22px}
.nav-inline{display:flex;align-items:center;gap:26px}
.nav-inline a.navtop{font-size:15px;font-weight:600;color:${MUTED};transition:color .15s ease}
.nav-inline a.navtop:hover{color:${INK}}
.nav-burger{display:none;align-items:center;gap:9px;height:42px;padding:0 15px;border-radius:12px;cursor:pointer;border:1px solid ${LINE};background:#fff;font-size:14px;font-weight:700;color:${INK};transition:background-color .15s ease}
.nav-burger:hover{background:${SURFACE}}
.nav-burger-lines{display:flex;flex-direction:column;gap:3.5px}
.nav-burger-lines i{display:block;width:18px;height:2px;border-radius:2px;background:${INK}}
.nav-panel{display:none;position:absolute;top:calc(100% - 6px);right:24px;left:auto;width:min(300px,calc(100vw - 48px));background:#fff;border:1px solid ${LINE};border-radius:16px;box-shadow:0 20px 42px rgba(17,17,17,.16);padding:10px 18px 18px;flex-direction:column;z-index:50}
#navtoggle:checked ~ .nav-panel{display:flex;animation:riseIn .25s ease}
.nav-toggle{display:none}
.nav-panel a{padding:13px 2px;font-size:15.5px;font-weight:500;color:${INK};border-bottom:1px solid ${SURFACE}}
.nav-panel a:last-of-type{border-bottom:none}
.moneyrow{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.moneylabel{width:140px;font-size:14.5px;font-weight:600;color:${INK};flex-shrink:0}
.moneytrack{flex:1;height:26px;background:#fff;border:1px solid ${LINE};border-radius:9px;overflow:hidden}
.moneyfill{height:100%;border-radius:8px;transform:scaleX(0);transform-origin:left;animation:grow 1.1s cubic-bezier(.2,.7,.2,1) forwards}
.moneyval{width:82px;text-align:right;font-size:15.5px;font-weight:800;color:${INK};flex-shrink:0}
@media(max-width:560px){.moneylabel{width:104px;font-size:13px}.moneyval{width:66px;font-size:13.5px}}
.trustbar{background:linear-gradient(90deg,${RIVER_DEEP},${RIVER})}
.trustbar-dot{opacity:.45;padding:0 2px}
details.faq{transition:border-color .2s ease, box-shadow .2s ease}
details.faq[open]{border-color:${RIVER_TINT};box-shadow:0 10px 30px rgba(17,17,17,.06)}
details.faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px}
details.faq summary::-webkit-details-marker{display:none}
.faq-plus{flex-shrink:0;width:28px;height:28px;border-radius:14px;background:${RIVER_TINT};color:${RIVER};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;transition:transform .25s ease}
details.faq[open] .faq-plus{transform:rotate(45deg)}
.faq-body{overflow:hidden;max-height:0;opacity:0;transition:max-height .3s ease,opacity .3s ease,margin .3s ease}
details.faq[open] .faq-body{max-height:360px;opacity:1;margin-top:12px}
.cmp{width:100%;border-collapse:separate;border-spacing:0;min-width:640px}
.cmp th,.cmp td{padding:16px 18px;text-align:left}
.cmp thead th{font-size:13px;font-weight:700;letter-spacing:.3px}
.cmp tbody tr td{border-top:1px solid ${LINE};font-size:14.5px}
.cmp .lekcol{background:${RIVER_TINT}}
.cmp .center{text-align:center}
.rowlabel{font-weight:500;color:${INK}}
.fixrow{display:grid;grid-template-columns:1fr 44px 1fr;align-items:center;gap:0;margin-bottom:18px}
.fixarrow{display:flex;align-items:center;justify-content:center;color:${RIVER};font-size:22px;font-weight:700}
.stickycta{display:none}
@media (max-width:760px){.fixrow{grid-template-columns:1fr;gap:12px;margin-bottom:22px}.fixarrow{transform:rotate(90deg);margin:0 auto}
  .stickycta{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:60;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-top:1px solid ${LINE};padding:10px 16px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 24px rgba(17,17,17,.08)}
}
@media (max-width:880px){
  .hero-h1-size{font-size:40px}.h2{font-size:27px}
  .grid3{grid-template-columns:1fr}
  .grid4{grid-template-columns:1fr 1fr}
  .nav-inline{display:none}
  .nav-burger{display:inline-flex}
  .duo{grid-template-columns:1fr}
  .hero-grid{grid-template-columns:1fr;gap:30px}
  .hero-left{text-align:center}
  .hero-cta{justify-content:center}
  .stepper{grid-template-columns:1fr;gap:34px}.stepper-line{display:none}
  .timeline{grid-template-columns:1fr;gap:22px}.tl-line{display:none}
  .stats-grid{grid-template-columns:repeat(2,1fr)!important}
  .appdemo-grid{grid-template-columns:1fr;gap:30px}
}
`;

// Idempotent reveal + countup. Safe to run even if a global layout script also runs.
const REVEAL_JS = `
(function(){
  if (window.__lekhioReveal) return; window.__lekhioReveal = true;
  var run = function(){
    var els = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window){
      var io = new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12,rootMargin:'0px 0px -40px 0px'});
      els.forEach(function(el){io.observe(el);});
    } else { els.forEach(function(el){el.classList.add('in');}); }
    document.querySelectorAll('.countup').forEach(function(el){
      var to = parseFloat(el.getAttribute('data-to')||'0'); var dec = (to % 1 !== 0) ? 2 : 0; var t0=null;
      var step=function(ts){ if(!t0)t0=ts; var p=Math.min(1,(ts-t0)/1100); el.textContent=(to*p).toFixed(dec); if(p<1)requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };
  if (document.readyState !== 'loading') run(); else document.addEventListener('DOMContentLoaded', run);
})();
`;

export function SharedHead() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHARED_CSS }} />
      <noscript><style dangerouslySetInnerHTML={{ __html: `.reveal{opacity:1;transform:none}.cmsg{opacity:1 !important}` }} /></noscript>
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: REVEAL_JS }} />
    </>
  );
}

export function TrustBar() {
  return (
    <div className="trustbar">
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '9px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#fff' }}>
        <span>🔒 Encrypted and never sold</span>
        <span className="trustbar-dot">·</span>
        <span>✅ You approve everything</span>
        <span className="trustbar-dot">·</span>
        <span>🇬🇧 A real UK company, not HMRC</span>
      </div>
    </div>
  );
}

const NAV_LINKS: [string, string][] = [
  ['/product', 'Product'],
  ['/how-mtd-works', 'How MTD works'],
  ['/resources', 'Free tools'],
  ['/compare', 'Compare'],
  ['/pricing', 'Pricing'],
];

export function SiteNav() {
  return (
    <nav style={{ position: 'relative', maxWidth: 1320, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Link href="/" aria-label="Lekhio home" style={{ display: 'inline-flex' }}>
        <svg width="118" height="40" viewBox="0 0 300 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Lekhio">
          <defs>
            <linearGradient id="navriver" x1="20" y1="0" x2="280" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={RIVER} /><stop offset="0.6" stopColor="#2E7BBF" /><stop offset="1" stopColor={SAFFRON} />
            </linearGradient>
          </defs>
          <text x="150" y="58" textAnchor="middle" fontFamily={FONT} fontSize="54" fontWeight="700" letterSpacing="-1.8" fill={INK}>Lekhio</text>
          <path d="M34 78 C 90 64, 120 92, 150 78 S 230 64, 266 78" stroke="url(#navriver)" strokeWidth="5" strokeLinecap="round" fill="none" />
        </svg>
      </Link>

      <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Toggle menu" />

      <div className="nav-right">
        <div className="nav-inline">
          {NAV_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="navtop">{label}</Link>
          ))}
          <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
        </div>
        <label htmlFor="navtoggle" className="nav-burger" aria-label="Open menu">Menu <span className="nav-burger-lines"><i /><i /><i /></span></label>
      </div>

      <div className="nav-panel">
        {NAV_LINKS.map(([href, label]) => (
          <Link key={href} href={href}>{label}</Link>
        ))}
        <Link href="/can-i-claim">Can I claim it?</Link>
        <Link href="/tax-calculator">Free tax calculator</Link>
        <Link href="/cis-calculator">CIS refund calculator</Link>
        <Link href="/invoice-generator">Invoice generator</Link>
        <Link href="/security">Security and trust</Link>
        <Link href="/start" className="btn-primary" style={{ display: 'block', textAlign: 'center', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '14px 0', borderRadius: 12, marginTop: 16 }}>Sign up now</Link>
      </div>
    </nav>
  );
}

export function StickyCta() {
  return (
    <div className="stickycta">
      <span style={{ fontSize: 14, fontWeight: 700, color: INK }}>30 days free. No card.</span>
      <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 700, padding: '11px 20px', borderRadius: 10 }}>Start free</Link>
    </div>
  );
}

export function SiteFooter() {
  const col = (title: string, links: [string, string][]) => (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.4px', textTransform: 'uppercase', color: '#fff', marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {links.map(([href, label]) => (
          <Link key={href + label} href={href} style={{ fontSize: 14.5, color: '#B6BDC8' }}>{label}</Link>
        ))}
      </div>
    </div>
  );
  return (
    <footer style={{ background: INK, color: '#fff' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '52px 24px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 32, marginBottom: 40 }}>
          {col('Product', [['/product', 'How it works'], ['/how-mtd-works', 'How MTD works'], ['/compare', 'Compare'], ['/pricing', 'Pricing'], ['/start', 'Sign up']])}
          {col('Free tools', [['/tax-calculator', 'Tax calculator'], ['/cis-calculator', 'CIS refund calculator'], ['/invoice-generator', 'Invoice maker'], ['/can-i-claim', 'Can I claim it?'], ['/file-your-tax-return', 'File your return'], ['/resources', 'All tools']])}
          {col('For your trade', TRADES.slice(0, 6).map((t) => [`/for/${t.slug}`, `For ${t.plural}`] as [string, string]))}
          {col('Company', [['/security', 'Security and trust'], ['/register-your-business', 'Register your business'], ['/privacy', 'Privacy'], ['/terms', 'Terms']])}
        </div>
        <div style={{ borderTop: '1px solid #2C2C2C', paddingTop: 24, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: '#8A93A0', maxWidth: 640, lineHeight: 1.6 }}>
            Lekhio prepares your figures and keeps you ready for Making Tax Digital. You approve everything before it reaches HMRC. HMRC keeps you responsible for your tax. We never imply HMRC backs us. Built in the UK.
          </div>
          <div style={{ fontSize: 13, color: '#8A93A0' }}>© {new Date().getFullYear()} Lekhio</div>
        </div>
      </div>
    </footer>
  );
}
