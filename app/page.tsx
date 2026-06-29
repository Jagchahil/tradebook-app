import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Lekhio. Your books, handled. Just text it.',
  description:
    'Lekhio is the only complete tax assistant that lives in WhatsApp, for anyone self employed in the UK. Snap a receipt, leave a voice note, or just type it. Lekhio logs it, sorts it, invoices for you, claims your reliefs, and keeps you ready for tax. 30 days free.',
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
    body: 'Your income and expenses add up as you go. We prepare your quarterly summary. You approve it. Nothing is sent without you.',
  },
];

const stats = [
  { to: 30, prefix: '', suffix: 's', label: 'to log a receipt' },
  { to: 19.99, prefix: '£', suffix: '', label: 'a month, everything in' },
  { to: 4, prefix: '', suffix: '', label: 'short updates a year, not one big return' },
  { to: 0, prefix: '', suffix: '', label: 'spreadsheets for you to keep' },
];

const audience = [
  'Electricians', 'Plumbers', 'Builders', 'Plasterers', 'Roofers', 'Joiners',
  'Cafes', 'Barbers', 'Hairdressers', 'Cleaners', 'Drivers', 'Market traders',
  'Photographers', 'Tutors', 'Carers', 'Decorators', 'Gardeners', 'Freelancers',
];

const features = [
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

// MTD quarterly updates, plain language. Kept seasonal, not exact dates, to stay simple.
const mtdQuarters = [
  { q: 'Update 1', when: 'Summer', note: 'A short summary of the last 3 months.' },
  { q: 'Update 2', when: 'Autumn', note: 'Another quick summary. A few taps.' },
  { q: 'Update 3', when: 'Winter', note: 'Same again. Already prepared for you.' },
  { q: 'Update 4', when: 'Spring', note: 'The last quarter of the year.' },
];

const mtdMeans = [
  { icon: '🗂️', title: 'Keep digital records', body: 'HMRC wants your income and costs kept digitally. Lekhio logs every receipt and payment as you go, so this is already done.', tint: RIVER_TINT, fg: RIVER },
  { icon: '📨', title: 'Send four short updates', body: 'Instead of one big return in January, you send four quick summaries across the year. Lekhio prepares each one for you.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '🤝', title: 'You stay in control', body: 'Nothing goes to HMRC until you say yes. HMRC keeps you responsible for your tax. Lekhio just keeps you ready for it.', tint: GREEN_TINT, fg: GREEN },
];

// Comparison. We do not name competitors. Columns speak for themselves.
const compareRows = [
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

const reviews = [
  { quote: 'I tried one of the big accounting apps and lost a whole Sunday just setting it up. With Lekhio I sent one photo and it was already working.', name: 'Jas', trade: 'Electrician, Birmingham', tint: RIVER_TINT, fg: RIVER },
  { quote: 'My old app started charging me once I went over a receipt limit. Lekhio is one price and I snap as many as I like.', name: 'Sophie', trade: 'Mobile hairdresser, Leeds', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { quote: 'The old software talked to me like I was an accountant. I am not. This one just speaks plain English.', name: 'Marcus', trade: 'Plasterer, Bristol', tint: GREEN_TINT, fg: GREEN },
  { quote: 'Every time I had a question the other one put me through a robot. On Lekhio a real person answered on the same chat.', name: 'Priya', trade: 'Freelance designer, London', tint: RIVER_TINT, fg: RIVER },
  { quote: 'I used to dread the quarter. Now the figures are sat there ready and I just check them over a brew.', name: 'Tom', trade: 'Plumber, Manchester', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { quote: 'Voice notes are the best bit. Hands full on the roof, I just say what I spent and carry on.', name: 'Danny', trade: 'Roofer, Glasgow', tint: GREEN_TINT, fg: GREEN },
];

// Common complaint themes from public reviews of other apps, paraphrased, never
// named. Each is paired with how Lekhio is built differently.
// The claim-by-text moat. Text the thing, it is claimed at the HMRC rate.
const claimExamples = [
  { text: 'drove 24 miles', result: '£13.20 of travel, logged' },
  { text: 'worked 90 hours from home', result: '£18 home office claimed' },
  { text: 'phone bill £45, 80% business', result: '£36 logged' },
  { text: '£400 paid, £80 CIS deducted', result: 'gross logged, refund tracked' },
];

// The platform roadmap, shown as coming soon. Signals ambition without
// overpromising. Locked until the HMRC recognition and bank provider land.
const comingSoon = [
  { icon: '📤', title: 'File straight to HMRC', body: 'Submit your quarterly updates and your return from Lekhio, when you approve, through a recognised route.' },
  { icon: '📊', title: 'Your HMRC balance, live', body: 'See exactly what you owe, what is due, and any refund building, right in the app.' },
  { icon: '🏦', title: 'Connect your bank', body: 'Money in and out logs itself, read only, so your books stay up to date with no effort.' },
  { icon: '🧑‍💼', title: 'A real accountant, on tap', body: 'For the tricky bits, a qualified accountant inside Lekhio. No leaving for help, ever.' },
];

const fixes = [
  { stars: 1, who: 'A sole trader, reviewing another app', gripe: 'Tried for two days to reach a human. Every time I just got a bot going in circles.', fix: 'A real person replies on the same WhatsApp. No bots, no hold music.' },
  { stars: 1, who: 'A tradesperson, reviewing another app', gripe: 'They put the price up again, and capped how many receipts I could scan. Felt like a trap.', fix: 'One flat £19.99 a month. Unlimited receipts, voice notes and mileage. No tiers, no surprises.' },
  { stars: 1, who: 'A self employed driver, reviewing another app', gripe: 'The bank feed kept dropping. Half my month went missing and I had to relink it again and again.', fix: 'Lekhio never leans on a fragile feed. Snap it or text it and it is logged for good. Connecting your bank, when it lands, is a bonus, never a crutch.' },
  { stars: 2, who: 'A trades subcontractor, reviewing another app', gripe: 'I photographed a receipt and it would not even log it. It just tried to match it to something and gave up.', fix: 'Send a photo and Lekhio reads it and logs the lot, the amount, the VAT, the category, in seconds. No matching, no retyping.' },
  { stars: 1, who: 'A small business owner, reviewing another app', gripe: 'They held my own money for weeks with a copy and paste excuse. Never again.', fix: 'Lekhio never holds your money or touches your account. We keep the records, that is all. Your cash is only ever yours.' },
  { stars: 2, who: 'A freelancer, reviewing another app', gripe: 'It talks to me like I am an accountant. I am not. Half of it I do not understand.', fix: 'Plain English, and it lives in WhatsApp. If you can send a text, you can use Lekhio.' },
  { stars: 2, who: 'A self employed cleaner, reviewing another app', gripe: 'Once it auto sorted something wrong, fixing it was a proper faff. I gave up correcting it.', fix: 'Wrong category? Just say "that was fuel, not food" and it is fixed in one line. You are always in charge of every entry.' },
  { stars: 1, who: 'A small business owner, reviewing another app', gripe: 'Cancelling was a nightmare. I felt completely locked in.', fix: 'Cancel any time, in one tap. Your records export whenever you want.' },
];

const freeTools = [
  { href: '/tax-calculator', icon: '🧮', title: 'Tax calculator', body: 'Your tax, National Insurance, take home and what to set aside, in seconds.' },
  { href: '/invoice-generator', icon: '🧾', title: 'Invoice and quote maker', body: 'A clean, professional invoice or quote in two minutes. Save as PDF, no signup.' },
  { href: '/can-i-claim', icon: '💡', title: 'Can I claim it?', body: 'The real rules on what you can and cannot claim, the grey areas included.' },
  { href: '/file-your-tax-return', icon: '📋', title: 'File your own return', body: 'A step by step walkthrough by trade, so you can do it yourself.' },
];

const oldAccountant = [
  'A bill of £150 to £900 a year, just to file.',
  'You see them once, at year end, when it is too late to plan.',
  'A shoebox of receipts to dig out every January.',
  'Jargon and forms you do not follow.',
  'Days, sometimes weeks, for a simple answer.',
];

const lekhioWay = [
  'One flat £19.99 a month, with everything in.',
  'With you every day, not once a year.',
  'Snap each receipt as you go. Nothing to dig out.',
  'Plain English, always. Ask it anything.',
  'A real person replies fast, on the same chat.',
];

const moneyFlow = [
  { label: 'Money in', pct: '100%', color: GREEN, val: '£1,000' },
  { label: 'Costs you claim', pct: '22%', color: SAFFRON, val: '£220' },
  { label: 'Tax to set aside', pct: '18%', color: '#C0392B', val: '£180' },
  { label: 'In your pocket', pct: '60%', color: RIVER, val: '£600' },
];

const included = [
  'Unlimited receipt, voice, text, and mileage capture',
  'Automatic bookkeeping and categories',
  'Invoices created and sent from WhatsApp',
  'MTD ready quarterly summaries, you approve before anything is filed',
  'A real human on the other end, fast',
  'Records exported any time, and cancel in one tap',
];

// The all-in-one value. One price replaces a stack of separate subscriptions.
const replaces = [
  { icon: '📒', label: 'Bookkeeping app', cost: '£10 to £20' },
  { icon: '🧾', label: 'Invoicing tool', cost: '£10 to £25' },
  { icon: '🗓️', label: 'Diary and reminders', cost: '£5 to £15' },
  { icon: '🧮', label: 'Tax software', cost: '£10 to £20' },
  { icon: '🚗', label: 'Mileage tracker', cost: '£5 to £10' },
];

const trustPillars = [
  { icon: '🔒', title: 'Your data is yours', body: 'Never sold. Never shared beyond the suppliers that run Lekhio. Encrypted, and only you can ever see your records. Export or delete everything whenever you want.', tint: RIVER_TINT, fg: RIVER },
  { icon: '✅', title: 'You approve everything', body: 'We prepare your figures. Nothing reaches HMRC until you check it and say yes. HMRC keeps you responsible for your tax, and we never pretend otherwise.', tint: GREEN_TINT, fg: GREEN },
  { icon: '💬', title: 'We never chase you', body: 'Lekhio only ever replies to a message you send first. We never text you out of the blue, and we never ask for your bank details, passwords, or login codes.', tint: SAFFRON_TINT, fg: SAFFRON_DEEP },
  { icon: '🇬🇧', title: 'A real UK company', body: 'Built by Satluj Ventures in the UK, registered for data protection and working under UK GDPR. A real person answers when you need help.', tint: RIVER_TINT, fg: RIVER },
];

const trustBadges = [
  { icon: '🔒', label: 'Encrypted' },
  { icon: '👁️', label: 'Only you can see it' },
  { icon: '🚫', label: 'Never sold' },
  { icon: '✅', label: 'You approve everything' },
  { icon: '🤝', label: 'Real human support' },
  { icon: '🇬🇧', label: 'Built in the UK' },
  { icon: '🛡️', label: 'UK GDPR' },
];

const willList = [
  'Only ever reply to messages you send us first',
  'Show you every entry and wait for you to approve it',
  'Let you check your tax figures before anything is sent',
  'Let you export or delete your data whenever you want',
];

const neverList = [
  'Text or call you out of the blue saying you owe tax',
  'Ask for your bank details, card number, or passwords',
  'Send anything to HMRC without your say so',
  'Sell your data or pretend to be HMRC',
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
  if (value === 'soon') {
    return <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', color: SAFFRON_DEEP, background: SAFFRON_TINT, padding: '4px 9px', borderRadius: 12 }}>Soon</span>;
  }
  const labels: Record<string, string> = { limit: 'Up to a limit', extra: 'Costs extra', higher: 'Higher tiers', maybe: 'If you pay' };
  return <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{labels[value] ?? String(value)}</span>;
}

function ReviewCard({ r }: { r: (typeof reviews)[number] }) {
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

const RED_INK = '#C0392B';
const RED_BG = '#FDECEC';

function MiniRiver() {
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
      <div style={{ width: 24, height: 3, borderRadius: 2, background: RIVER }} />
      <div style={{ width: 11, height: 3, borderRadius: 2, background: SAFFRON }} />
    </div>
  );
}

function AppDash() {
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

function AppTax() {
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

function AppInv() {
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

function OnbBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 6, borderRadius: 3, background: SURFACE, overflow: 'hidden', margin: '4px 0 16px' }}>
      <div style={{ height: 6, borderRadius: 3, width: `${pct}%`, background: `linear-gradient(90deg, ${RIVER}, ${SAFFRON})` }} />
    </div>
  );
}

function OnbHead({ n, title }: { n: number; title: string }) {
  return (
    <>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: RIVER, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Step {n} of 5</div>
      <OnbBar pct={[12, 40, 68, 100][n - 1]} />
      <div style={{ fontSize: 17, fontWeight: 800, color: INK, letterSpacing: '-0.4px', marginBottom: 14 }}>{title}</div>
    </>
  );
}

function OnbNum() {
  return (
    <div className="appscreen">
      <OnbHead n={1} title="Set up your account" />
      <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
        <span style={{ padding: '12px 11px', background: RIVER_TINT, color: RIVER, fontWeight: 700, fontSize: 13, borderRight: `1.5px solid ${LINE}` }}>🇬🇧 +44</span>
        <span style={{ padding: '12px 11px', fontSize: 13.5, color: INK }}>7700 900 000</span>
      </div>
      <div style={{ background: '#fff', border: `1.5px solid ${LINE}`, borderRadius: 12, padding: '12px 12px', fontSize: 13.5, color: MUTED, marginTop: 10 }}>you@example.com</div>
      <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10 }}>We never share your details.</div>
      <div style={{ background: RIVER, color: '#fff', textAlign: 'center', borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 700, marginTop: 16 }}>Continue</div>
    </div>
  );
}

function OnbTrade() {
  const rows: [string, string, boolean][] = [['👤', 'Just me', true], ['🏪', 'A business name', false], ['🏢', 'A limited company', false]];
  return (
    <div className="appscreen">
      <OnbHead n={2} title="How do you trade?" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map(([icon, label, active]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 11, background: active ? RIVER_TINT : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 12, padding: '12px 12px' }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: INK }}>{label}</span>
            <span style={{ width: 18, height: 18, borderRadius: 9, border: `2px solid ${active ? RIVER : LINE}`, background: active ? RIVER : 'transparent', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{active ? '✓' : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OnbDo() {
  const chips: [string, boolean][] = [['Electrician', true], ['Plumber', false], ['Builder', false], ['Cleaner', false], ['Driver', false], ['Hairdresser', false], ['Freelancer', false]];
  return (
    <div className="appscreen">
      <OnbHead n={3} title="What do you do?" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chips.map(([t, active]) => (
          <span key={t} style={{ fontSize: 13, fontWeight: 600, color: active ? '#fff' : INK, background: active ? RIVER : '#fff', border: `1.5px solid ${active ? RIVER : LINE}`, borderRadius: 20, padding: '9px 14px' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function OnbDone() {
  return (
    <div className="appscreen" style={{ textAlign: 'center' }}>
      <OnbBar pct={100} />
      <div style={{ width: 64, height: 64, borderRadius: 32, background: GREEN_TINT, color: GREEN, fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '14px auto 16px' }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK, marginBottom: 8 }}>You are all set</div>
      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5, marginBottom: 18, padding: '0 8px' }}>30 day free trial started. No card needed. Download the app and say hello on WhatsApp.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ background: INK, color: '#fff', borderRadius: 10, padding: '10px 0', fontSize: 12.5, fontWeight: 600 }}>  App Store</span>
        <span style={{ background: INK, color: '#fff', borderRadius: 10, padding: '10px 0', fontSize: 12.5, fontWeight: 600 }}>▶  Google Play</span>
      </div>
    </div>
  );
}

// The looping hero conversation. Tells the whole story: a receipt logged with
// its cost, profit answered, an invoice sent, then paid into income. The chat
// builds message by message, holds, then clears and repeats. Pure CSS, no JS.
const chatMessages: { side: 'out' | 'in'; text: string; image?: string }[] = [
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
const chatCss =
  `.cmsg{opacity:0}` +
  `@media (prefers-reduced-motion: reduce){.cmsg{opacity:1 !important;animation:none !important;transform:none !important}}` +
  chatMessages
    .map((_, i) => {
      const a = chatAppear[i];
      return `@keyframes cmsg${i}{0%,${a}%{opacity:0;transform:translateY(8px)}${a + 3}%,93%{opacity:1;transform:none}98%,100%{opacity:0}}.cmsg${i}{animation:cmsg${i} ${HERO_CHAT_LOOP}s infinite}`;
    })
    .join('');

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
          .navlink{transition:color .15s ease}.navlink:hover{color:${INK}!important}
          .riverflow{stroke-dasharray:1600;stroke-dashoffset:1600;animation:flow 1.4s ease forwards .15s}
          .gradtext{background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON},${RIVER});background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:sheen 5s linear infinite}
          .hero-h1-size{font-size:72px;line-height:1.04}
          .h2{font-size:38px;line-height:1.12}
          .grid3{grid-template-columns:repeat(3,1fr)}
          .grid4{grid-template-columns:repeat(4,1fr)}
          .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
          .hero-left{text-align:left}
          .phone{animation:floaty 6s ease-in-out infinite}
          .bub{opacity:0;animation:bubbleIn .5s ease forwards}
          .bub1{animation-delay:.5s}.bub2{animation-delay:1.1s}.bub3{animation-delay:1.9s}.bub4{animation-delay:2.7s}
          .typing span{display:inline-block;width:6px;height:6px;border-radius:3px;background:#9aa3af;margin:0 2px;animation:blink 1.2s infinite}
          .typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}
          /* Stepper */
          .stepper{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
          .stepper-line{position:absolute;top:30px;left:16%;right:16%;height:3px;background:linear-gradient(90deg,${RIVER},#2E7BBF,${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .2s}
          .step{text-align:center;position:relative}
          .step-num{width:60px;height:60px;border-radius:30px;background:linear-gradient(135deg,${RIVER},#2E7BBF);color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;box-shadow:0 10px 24px rgba(27,89,166,.3);position:relative;z-index:1;border:5px solid ${PAPER}}
          /* Stats band */
          .stat-num{font-size:48px;font-weight:800;letter-spacing:-1.5px;line-height:1}
          /* MTD */
          .mtd-radio{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
          .mtd-tabs{display:inline-flex;background:${SURFACE};border:1px solid ${LINE};border-radius:14px;padding:5px;gap:4px}
          .mtd-tab{padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600;color:${MUTED};cursor:pointer;transition:all .2s;user-select:none}
          .mtd-tab:hover{color:${INK}}
          #mtd-old:checked ~ .mtd-tabs label[for="mtd-old"],#mtd-new:checked ~ .mtd-tabs label[for="mtd-new"]{background:#fff;color:${INK};box-shadow:0 2px 8px rgba(0,0,0,.10)}
          .mtd-panel{display:none}
          #mtd-old:checked ~ .mtd-panels .mtd-old-panel{display:block;animation:riseIn .5s ease}
          #mtd-new:checked ~ .mtd-panels .mtd-new-panel{display:block;animation:riseIn .5s ease}
          .timeline{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:10px}
          .tl-line{position:absolute;top:18px;left:10%;right:10%;height:3px;background:linear-gradient(90deg,${RIVER},${SAFFRON});border-radius:2px;transform:scaleX(0);transform-origin:left;animation:grow .8s ease forwards .15s}
          .tl-step{text-align:center;position:relative}
          .tl-dot{width:38px;height:38px;border-radius:19px;background:#fff;border:3px solid ${RIVER};color:${RIVER};font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;position:relative;z-index:1;opacity:0;animation:popIn .5s ease forwards}
          .tl-step:nth-child(2) .tl-dot{animation-delay:.2s}
          .tl-step:nth-child(3) .tl-dot{animation-delay:.32s}
          .tl-step:nth-child(4) .tl-dot{animation-delay:.44s}
          .tl-step:nth-child(5) .tl-dot{animation-delay:.56s}
          .tl-step:nth-child(6) .tl-dot{animation-delay:.68s;border-color:${SAFFRON};color:${SAFFRON_DEEP}}
          /* Reviews marquee */
          .marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
          .marquee-track{display:flex;gap:20px;width:max-content;animation:marquee 48s linear infinite}
          .marquee:hover .marquee-track{animation-play-state:paused}
          .rev-card{width:340px;flex:0 0 auto}
          /* App demo phone */
          .appdemo-grid{display:grid;grid-template-columns:.95fr 1.05fr;gap:48px;align-items:center}
          .appphone{width:340px;max-width:100%;margin:0 auto;background:#fff;border-radius:40px;border:1px solid ${LINE};box-shadow:0 30px 70px rgba(17,17,17,.18);overflow:hidden}
          .appstatus{height:30px;display:flex;align-items:center;justify-content:center;background:#fff}
          .appstatus i{width:96px;height:6px;border-radius:3px;background:${LINE};display:block}
          .appview{position:relative;height:438px;overflow:hidden;background:${PAPER}}
          .apptrack{display:flex;width:400%;height:100%;animation:appslide 7s cubic-bezier(.65,0,.35,1) infinite}
          .appscreen{width:25%;flex:0 0 25%;height:100%;padding:18px 18px;overflow:hidden}
          @keyframes appslide{0%,22%{transform:translateX(0)}28%,47%{transform:translateX(-25%)}53%,72%{transform:translateX(-50%)}78%,100%{transform:translateX(-75%)}}
          .appdot{display:inline-block;width:7px;height:7px;border-radius:4px;background:${LINE};margin:0 3px}
          /* Why different checklist */
          .why-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 48px}
          .why-item{display:flex;gap:16px;padding:22px 4px;border-bottom:1px solid rgba(255,255,255,.10)}
          .why-bar{flex-shrink:0;width:4px;border-radius:2px;background:linear-gradient(${RIVER},${SAFFRON})}
          .nav-links{display:flex;align-items:center;gap:24px}
          .duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}
          .tbadges{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:780px;margin:0 auto 52px}
          .tbadge{display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid ${LINE};border-radius:999px;padding:11px 18px;font-size:14px;font-weight:600;color:${INK};box-shadow:0 10px 26px rgba(17,17,17,.07);animation:floaty 5s ease-in-out infinite;transition:transform .2s ease,box-shadow .2s ease}
          .tbadge:hover{transform:translateY(-3px) scale(1.03);box-shadow:0 16px 32px rgba(17,17,17,.12)}
          .trust-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
          .trust-card{position:relative;overflow:hidden}
          .trust-card::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,${RIVER},${SAFFRON})}
          /* Nav */
          .nav-toggle{display:none}
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
          .nav-panel a{padding:13px 2px;font-size:15.5px;font-weight:500;color:${INK};border-bottom:1px solid ${SURFACE}}
          .nav-panel a:last-of-type{border-bottom:none}
          /* Money flow bars */
          .moneyrow{display:flex;align-items:center;gap:14px;margin-bottom:14px}
          .moneylabel{width:140px;font-size:14.5px;font-weight:600;color:${INK};flex-shrink:0}
          .moneytrack{flex:1;height:26px;background:#fff;border:1px solid ${LINE};border-radius:9px;overflow:hidden}
          .moneyfill{height:100%;border-radius:8px;transform:scaleX(0);transform-origin:left;animation:grow 1.1s cubic-bezier(.2,.7,.2,1) forwards}
          .moneyval{width:82px;text-align:right;font-size:15.5px;font-weight:800;color:${INK};flex-shrink:0}
          @media(max-width:560px){.moneylabel{width:104px;font-size:13px}.moneyval{width:66px;font-size:13.5px}}
          .trustbar{background:linear-gradient(90deg,${RIVER_DEEP},${RIVER})}
          .trustbar-dot{opacity:.45;padding:0 2px}
          /* FAQ */
          details.faq{transition:border-color .2s ease, box-shadow .2s ease}
          details.faq[open]{border-color:${RIVER_TINT};box-shadow:0 10px 30px rgba(17,17,17,.06)}
          details.faq summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px}
          details.faq summary::-webkit-details-marker{display:none}
          .faq-plus{flex-shrink:0;width:28px;height:28px;border-radius:14px;background:${RIVER_TINT};color:${RIVER};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;transition:transform .25s ease}
          details.faq[open] .faq-plus{transform:rotate(45deg)}
          .faq-body{overflow:hidden;max-height:0;opacity:0;transition:max-height .3s ease,opacity .3s ease,margin .3s ease}
          details.faq[open] .faq-body{max-height:320px;opacity:1;margin-top:12px}
          /* Comparison */
          .cmp{width:100%;border-collapse:separate;border-spacing:0;min-width:640px}
          .cmp th,.cmp td{padding:16px 18px;text-align:left}
          .cmp thead th{font-size:13px;font-weight:700;letter-spacing:.3px}
          .cmp tbody tr td{border-top:1px solid ${LINE};font-size:14.5px}
          .cmp .lekcol{background:${RIVER_TINT}}
          .cmp .center{text-align:center}
          .rowlabel{font-weight:500;color:${INK}}
          .fixrow{display:grid;grid-template-columns:1fr 44px 1fr;align-items:center;gap:0;margin-bottom:18px}
          .fixarrow{display:flex;align-items:center;justify-content:center;color:${RIVER};font-size:22px;font-weight:700}
          @media (max-width:760px){.fixrow{grid-template-columns:1fr;gap:12px;margin-bottom:22px}.fixarrow{transform:rotate(90deg);margin:0 auto}}
          @media (max-width:880px){
            .hero-h1-size{font-size:40px}.h2{font-size:27px}
            .grid3{grid-template-columns:1fr}
            .grid4{grid-template-columns:1fr 1fr}
            .nav-inline{display:none}
            .nav-burger{display:inline-flex}
            .price-split{flex-direction:column}
            .why-grid{grid-template-columns:1fr;gap:0}
            .mtd-tab{padding:9px 13px;font-size:12.5px}
            .mtd-tabs{max-width:100%}
            .hero-grid{grid-template-columns:1fr;gap:30px}
            .hero-left{text-align:center}
            .hero-cta{justify-content:center}
            .stepper{grid-template-columns:1fr;gap:34px}.stepper-line{display:none}
            .timeline{grid-template-columns:1fr;gap:22px}.tl-line{display:none}
            .stats-grid{grid-template-columns:repeat(2,1fr)!important}
            .appdemo-grid{grid-template-columns:1fr;gap:30px}
            .duo{grid-template-columns:1fr}
            .trust-grid{grid-template-columns:1fr}
          }
        `,
        }}
      />
      <noscript><style dangerouslySetInnerHTML={{ __html: `.reveal{opacity:1;transform:none}.bub{opacity:1;animation:none}` }} /></noscript>

      {/* Trust bar */}
      <div className="trustbar">
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '9px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#fff' }}>
          <span>🔒 Encrypted and never sold</span>
          <span className="trustbar-dot">·</span>
          <span>✅ You approve everything</span>
          <span className="trustbar-dot">·</span>
          <span>🇬🇧 A real UK company, not HMRC</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ position: 'relative', maxWidth: 1320, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <svg width="118" height="40" viewBox="0 0 300 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Lekhio">
          <defs>
            <linearGradient id="navriver" x1="20" y1="0" x2="280" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor={RIVER} /><stop offset="0.6" stopColor="#2E7BBF" /><stop offset="1" stopColor={SAFFRON} />
            </linearGradient>
          </defs>
          <text x="150" y="58" textAnchor="middle" fontFamily={FONT} fontSize="54" fontWeight="700" letterSpacing="-1.8" fill={INK}>Lekhio</text>
          <path d="M34 78 C 90 64, 120 92, 150 78 S 230 64, 266 78" stroke="url(#navriver)" strokeWidth="5" strokeLinecap="round" fill="none" />
        </svg>

        <input type="checkbox" id="navtoggle" className="nav-toggle" aria-label="Toggle menu" />

        <div className="nav-right">
          <div className="nav-inline">
            <a href="#how" className="navtop">How it works</a>
            <a href="#app" className="navtop">The app</a>
            <Link href="/resources" className="navtop">Free tools</Link>
            <a href="#beat" className="navtop">Vs an accountant</a>
            <a href="#pricing" className="navtop">Pricing</a>
            <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 18px', borderRadius: 10 }}>Sign up now</Link>
          </div>
          <label htmlFor="navtoggle" className="nav-burger" aria-label="Open menu">Menu <span className="nav-burger-lines"><i /><i /><i /></span></label>
        </div>

        <div className="nav-panel">
          <a href="#how">How it works</a>
          <a href="#app">The app</a>
          <a href="#mtd">Tax changes</a>
          <a href="#compare">Compare</a>
          <a href="#reviews">Reviews</a>
          <a href="#trust">Trust</a>
          <a href="#pricing">Pricing</a>
          <Link href="/resources">Free tools</Link>
          <Link href="/can-i-claim">Can I claim it?</Link>
          <Link href="/tax-calculator">Free tax calculator</Link>
          <Link href="/invoice-generator">Invoice generator</Link>
          <Link href="/register-your-business">Register your business</Link>
          <Link href="/file-your-tax-return">Free tax return guide</Link>
          <Link href="/start" className="btn-primary" style={{ display: 'block', textAlign: 'center', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '14px 0', borderRadius: 12, marginTop: 16 }}>Sign up now</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 24px 16px' }}>
        <div className="hero-grid">
          <div className="hero-left">
            <div className="hero-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 20, marginBottom: 24 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', display: 'inline-block', animation: 'pulseDot 2s infinite' }} />
              The only complete tax assistant that lives in WhatsApp.
            </div>
            <h1 className="hero-h1 hero-h1-size" style={{ fontWeight: 700, letterSpacing: '-2.4px', margin: '0 0 20px' }}>
              Your books, handled.<br /><span className="gradtext">Just text it.</span>
            </h1>
            <p className="hero-sub" style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, maxWidth: 520, margin: '0 0 32px' }}>
              Lekhio is the back office for anyone self employed in the UK. Snap a receipt, leave a voice note, or type it. Lekhio logs it, sorts it, invoices for you, and keeps you ready for tax. All on WhatsApp.
            </p>
            <div className="hero-cta" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Link href="/start" className="btn-primary" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Sign up now</Link>
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
            <div style={{ position: 'relative' }}>
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
                  <div
                    key={i}
                    className={`cmsg cmsg${i}`}
                    style={{
                      alignSelf: m.side === 'out' ? 'flex-end' : 'flex-start',
                      backgroundColor: m.side === 'out' ? '#DCF8C6' : '#fff',
                      borderRadius: m.side === 'out' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      padding: '10px 12px',
                      maxWidth: m.side === 'out' ? '80%' : '84%',
                      fontSize: 13.5,
                      color: INK,
                      boxShadow: m.side === 'in' ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
                    }}
                  >
                    {m.image ? (
                      <div style={{ backgroundColor: '#cde7b4', borderRadius: 8, padding: '16px 12px', textAlign: 'center', marginBottom: 6, fontSize: 22 }}>{m.image}</div>
                    ) : null}
                    {m.text}
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 24px 30px' }}><RiverDivider /></div>

      {/* How it works (stepper) */}
      <section id="how" style={{ maxWidth: 1240, margin: '0 auto', padding: '34px 24px 46px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 54 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Three steps. That is the whole thing.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 540, margin: '0 auto' }}>No spreadsheets. No shoebox of receipts. No evenings lost to paperwork.</p>
        </div>
        <div className="stepper">
          <div className="stepper-line" aria-hidden="true" />
          {steps.map((s, i) => (
            <div key={s.n} className="step reveal" style={{ transitionDelay: `${i * 120}ms` }}>
              <div className="step-num">{s.n}</div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 10px', letterSpacing: '-0.3px' }}>{s.title}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Onboarding demo */}
      <section id="setup" style={{ maxWidth: 1320, margin: '0 auto', padding: '30px 24px 62px' }}>
        <div className="appdemo-grid">
          <div className="reveal">
            <span style={{ display: 'inline-block', backgroundColor: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>SET UP IN UNDER A MINUTE</span>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 16px' }}>A professional setup, in a few taps.</h2>
            <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.6, margin: '0 0 24px', maxWidth: 440 }}>
              Sign up on the web, answer a couple of quick questions, and you are ready to go. No long forms, no spreadsheets to import, and no card needed to start.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Tell us your number and your trade', 'We set up your invoices and tax records for you', 'Download the app and you are in'].map((line, i) => (
                <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: RIVER, color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
                  <span style={{ fontSize: 15.5, color: INK, lineHeight: 1.5 }}>{line}</span>
                </li>
              ))}
            </ul>
            <Link href="/start" className="btn-primary" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Start free trial</Link>
          </div>

          <div className="reveal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="appphone phone">
              <div className="appstatus"><i /></div>
              <div className="appview">
                <div className="apptrack">
                  <OnbNum />
                  <OnbTrade />
                  <OnbDo />
                  <OnbDone />
                </div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: MUTED, marginTop: 18 }}>A real look at signing up. Quick and clean.</p>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section style={{ background: `linear-gradient(120deg, ${RIVER_DEEP}, ${RIVER})`, color: '#fff' }}>
        <div className="reveal" style={{ maxWidth: 1240, margin: '0 auto', padding: '42px 24px' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div className="stat-num">
                  {s.prefix}<span className="countup" data-to={s.to}>0</span>{s.suffix}
                </div>
                <p style={{ fontSize: 14, color: '#CFE0F2', margin: '10px auto 0', maxWidth: 180, lineHeight: 1.45 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it is for */}
      <section id="who" style={{ backgroundColor: INK, color: '#fff' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
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
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
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

      {/* Beat the accountant */}
      <section id="beat" style={{ background: INK }}>
        <div className="reveal" style={{ maxWidth: 1320, margin: '0 auto', padding: '64px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <span style={{ display: 'inline-block', background: 'rgba(224,163,62,0.16)', color: SAFFRON, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 14px', borderRadius: 20, marginBottom: 16 }}>THE EXPERT IN YOUR POCKET</span>
            <h2 className="h2" style={{ color: '#fff', fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>The brains of an accountant. None of the bill.</h2>
            <p style={{ fontSize: 18, color: '#B6BDC8', maxWidth: 680, margin: '0 auto', lineHeight: 1.6 }}>
              An accountant trains for years in tax and bookkeeping, the ACCA exams, then charges you hundreds to see you once a year with a shoebox of receipts. Lekhio puts that knowledge in your chat, working every single day.
            </p>
          </div>
          <div className="duo">
            <div style={{ background: '#1B1B1B', border: '1px solid #2C2C2C', borderRadius: 20, padding: '28px 26px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 16px' }}>The old way. A traditional accountant.</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {oldAccountant.map((line) => (
                  <li key={line} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, background: '#3A2A2A', color: '#E0796B', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✕</span>
                    <span style={{ fontSize: 15, color: '#C7CDD6', lineHeight: 1.5 }}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ background: RIVER, borderRadius: 20, padding: '28px 26px' }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 16px' }}>The Lekhio way.</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {lekhioWay.map((line) => (
                  <li key={line} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, background: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 15, color: '#EAF1FA', lineHeight: 1.5 }}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p style={{ fontSize: 13, color: '#8A93A0', textAlign: 'center', marginTop: 26, maxWidth: 660, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Lekhio is software that prepares your figures, plain and simple, with a real human when you need one. For the rare complex case, a qualified accountant on tap is coming. We never imply HMRC backs us.
          </p>
        </div>
      </section>

      {/* App demo */}
      <section id="app" style={{ backgroundColor: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
          <div className="appdemo-grid">
            <div className="reveal">
              <span style={{ display: 'inline-block', backgroundColor: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>THE APP</span>
              <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 16px' }}>Your whole back office, in your pocket.</h2>
              <p style={{ fontSize: 17, color: MUTED, lineHeight: 1.6, margin: '0 0 24px', maxWidth: 440 }}>
                Everything Lekhio logs from WhatsApp shows up here, sorted and ready. Open the app to see your month, your tax, and your invoices, all kept up to date for you.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {['Income, expenses, and profit, updating as you go', 'Your quarterly tax figures, always ready to approve', 'Create, send, and track invoices from anywhere'].map((line) => (
                  <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: RIVER_TINT, color: RIVER, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 15.5, color: INK, lineHeight: 1.5 }}>{line}</span>
                  </li>
                ))}
              </ul>
              <Link href="/start" className="btn-primary" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 30px', borderRadius: 12 }}>Sign up now</Link>
            </div>

            <div className="reveal">
              <div className="appphone phone">
                <div className="appstatus"><i /></div>
                <div className="appview">
                  <div className="apptrack">
                    <AppDash />
                    <AppTax />
                    <AppInv />
                    <AppDash />
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 18 }}>
                <span className="appdot" /><span className="appdot" /><span className="appdot" />
                <p style={{ fontSize: 13, color: MUTED, marginTop: 10 }}>A live look at Dashboard, Tax, and Invoices.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Free tools showcase */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 40 }}>
          <span style={{ display: 'inline-block', backgroundColor: GREEN_TINT, color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 14 }}>FREE, NO SIGNUP</span>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Free tools you can use right now.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 560, margin: '0 auto' }}>No account, no card. Try the tools that do the maths for you, then let Lekhio do the rest by text.</p>
        </div>
        <div className="grid4" style={{ display: 'grid', gap: 18 }}>
          {freeTools.map((t, i) => (
            <Link key={t.href} href={t.href} className="card" style={{ transitionDelay: `${(i % 4) * 80}ms`, backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: 24, color: INK, display: 'flex', flexDirection: 'column' }}>
              <div className="icontile" style={{ width: 50, height: 50, borderRadius: 13, backgroundColor: RIVER_TINT, color: RIVER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25, marginBottom: 14 }}>{t.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{t.title}</h3>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.55, margin: '0 0 14px', flex: 1 }}>{t.body}</p>
              <span style={{ fontSize: 14, fontWeight: 700, color: RIVER }}>Open it &rarr;</span>
            </Link>
          ))}
        </div>
        <div className="reveal" style={{ textAlign: 'center', marginTop: 30 }}>
          <Link href="/resources" className="btn-ghost" style={{ display: 'inline-block', backgroundColor: 'transparent', color: INK, border: `1px solid ${INK}`, fontSize: 15.5, fontWeight: 600, padding: '13px 26px', borderRadius: 12 }}>See all free tools and guides</Link>
        </div>
      </section>

      {/* Register offer banner */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '8px 24px 34px' }}>
        <Link href="/register-your-business" className="reveal card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', background: INK, borderRadius: 20, padding: '26px 28px', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 30 }}>🏁</span>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800 }}>Just starting out? Register your business free.</div>
              <div style={{ fontSize: 14.5, color: '#B6BDC8', marginTop: 4, maxWidth: 640, lineHeight: 1.5 }}>Sole trader or limited, the exact steps, forms and codes. Set up with us and lock in first month free, then 20% off for life.</div>
            </div>
          </div>
          <span style={{ background: SAFFRON, color: INK, fontSize: 14.5, fontWeight: 800, padding: '12px 20px', borderRadius: 10, whiteSpace: 'nowrap' }}>Register free &rarr;</span>
        </Link>
      </section>

      {/* Claim it by text */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 30 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 12px' }}>Say it. It is claimed.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 580, margin: '0 auto', lineHeight: 1.6 }}>Text the thing. Lekhio works out the relief and logs it at the HMRC rate. No forms, no logbooks, no missed claims. No other app does this.</p>
        </div>
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          {claimExamples.map((c) => (
            <div key={c.text} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 18, textAlign: 'center', boxShadow: '0 10px 26px rgba(17,17,17,.05)' }}>
              <div style={{ display: 'inline-block', background: '#DCF8C6', color: INK, borderRadius: '14px 14px 4px 14px', padding: '10px 14px', fontSize: 14, fontWeight: 600 }}>&ldquo;{c.text}&rdquo;</div>
              <div style={{ fontSize: 20, color: RIVER, margin: '8px 0' }}>&darr;</div>
              <div style={{ fontSize: 14.5, color: RIVER_DEEP, fontWeight: 700 }}>{c.result}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 16 }}>Mileage, working from home, phone and broadband, and CIS, all from a text. The simplified rates apply, and the method that claims you more is the one that counts.</p>
      </section>

      {/* Where every pound goes */}
      <section style={{ background: `linear-gradient(180deg, #fff, ${RIVER_TINT})`, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '54px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 34 }}>
            <span style={{ display: 'inline-block', background: '#fff', border: `1px solid ${LINE}`, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 14 }}>SEE IT CLEARLY</span>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 12px' }}>Where every pound goes.</h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 560, margin: '0 auto' }}>Claim your costs, set aside for tax, keep the rest. Lekhio works the lot out as you go, so there are no nasty surprises.</p>
          </div>
          <div className="reveal" style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 18, padding: '28px 26px', boxShadow: '0 14px 40px rgba(17,17,17,.06)' }}>
            {moneyFlow.map((m, i) => (
              <div key={m.label} className="moneyrow">
                <span className="moneylabel">{m.label}</span>
                <div className="moneytrack"><div className="moneyfill" style={{ width: m.pct, background: m.color, animationDelay: `${0.15 + i * 0.18}s` }} /></div>
                <span className="moneyval">{m.val}</span>
              </div>
            ))}
            <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 10 }}>An illustration, for every £1,000 you bring in. Your real figures live in the app.</p>
          </div>
        </div>
      </section>

      {/* Can I claim it CTA */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '6px 24px 30px' }}>
        <Link href="/can-i-claim" className="reveal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '18px 22px', textDecoration: 'none', color: INK }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 26 }}>💡</span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 700 }}>Not sure what you can claim? Ask away.</div>
              <div style={{ fontSize: 13.5, color: MUTED }}>Boots, the van, training, meals. The real rules, the grey areas included, all legal.</div>
            </div>
          </div>
          <span style={{ backgroundColor: RIVER, color: '#fff', fontSize: 14.5, fontWeight: 600, padding: '11px 18px', borderRadius: 10, whiteSpace: 'nowrap' }}>Can I claim it? &rarr;</span>
        </Link>
      </section>

      {/* Bank connector showcase */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '44px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 30 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 20, marginBottom: 14 }}>Optional, coming soon</div>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 12px' }}>Connect your bank, books on autopilot.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>Link your account, read only, and every payment in and out logs itself, sorted and ready for tax. We can never move your money.</p>
        </div>
        <div className="reveal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ animation: 'floaty 3.2s ease-in-out infinite', backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '20px 22px', textAlign: 'center', minWidth: 150 }}>
            <div style={{ fontSize: 30 }}>🏦</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Your bank</div>
            <div style={{ fontSize: 12.5, color: MUTED }}>read only</div>
          </div>
          <div style={{ color: SAFFRON_DEEP, fontWeight: 700, fontSize: 13 }}>money in and out →</div>
          <div style={{ animation: 'floaty 3.2s ease-in-out infinite', animationDelay: '0.4s', backgroundColor: RIVER, color: '#fff', borderRadius: 16, padding: '20px 22px', textAlign: 'center', minWidth: 150 }}>
            <div style={{ fontSize: 30 }}>💬</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Lekhio sorts it</div>
            <div style={{ fontSize: 12.5, color: '#CFE0F2' }}>every payment</div>
          </div>
          <div style={{ color: GREEN, fontWeight: 700, fontSize: 13 }}>→ ready</div>
          <div style={{ animation: 'floaty 3.2s ease-in-out infinite', animationDelay: '0.8s', backgroundColor: GREEN_TINT, borderRadius: 16, padding: '20px 22px', textAlign: 'center', minWidth: 150 }}>
            <div style={{ fontSize: 30 }}>📊</div>
            <div style={{ fontWeight: 700, marginTop: 6, color: GREEN }}>Tax, done</div>
            <div style={{ fontSize: 12.5, color: MUTED }}>nothing to chase</div>
          </div>
        </div>
        <p className="reveal" style={{ fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 24 }}>Read only through your bank&apos;s own login. Optional, and you can switch it off any time.</p>
      </section>

      {/* Coming soon, the complete platform */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{ display: 'inline-block', backgroundColor: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 14 }}>COMING SOON</span>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 12px' }}>Soon, Lekhio does the lot.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 580, margin: '0 auto', lineHeight: 1.6 }}>We are building the complete platform, so your whole tax life lives in one text. Here is what is on the way.</p>
        </div>
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
          {comingSoon.map((c) => (
            <div key={c.title} style={{ position: 'relative', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 22, boxShadow: '0 10px 26px rgba(17,17,17,.05)' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{c.icon}</div>
              <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: '0 0 8px' }}>{c.title}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: '0 0 14px' }}>{c.body}</p>
              <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.5px', color: SAFFRON_DEEP, background: SAFFRON_TINT, padding: '4px 10px', borderRadius: 14 }}>COMING SOON</span>
            </div>
          ))}
        </div>
      </section>

      {/* MTD explainer (interactive) */}
      <section id="mtd" style={{ background: `linear-gradient(180deg, #fff, ${RIVER_TINT})`, borderTop: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '46px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 36 }}>
            <span style={{ display: 'inline-block', backgroundColor: '#fff', border: `1px solid ${LINE}`, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>NEW HMRC RULES</span>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>What HMRC is changing, in plain English.</h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 600, margin: '0 auto' }}>
              HMRC is moving the self employed onto something called Making Tax Digital. It sounds scary. It is not. Here is the whole thing on one screen. Tap to compare.
            </p>
          </div>

          <div className="reveal" style={{ textAlign: 'center' }}>
            <input className="mtd-radio" type="radio" name="mtd" id="mtd-old" />
            <input className="mtd-radio" type="radio" name="mtd" id="mtd-new" defaultChecked />
            <div className="mtd-tabs" role="tablist">
              <label className="mtd-tab" htmlFor="mtd-old">The old way</label>
              <label className="mtd-tab" htmlFor="mtd-new">The new way, from April 2026</label>
            </div>

            <div className="mtd-panels" style={{ marginTop: 28 }}>
              {/* Old way */}
              <div className="mtd-panel mtd-old-panel">
                <div style={{ maxWidth: 560, margin: '0 auto', backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 20, padding: 34, textAlign: 'center', boxShadow: '0 14px 40px rgba(17,17,17,.06)' }}>
                  <div style={{ fontSize: 40, marginBottom: 14 }}>📦</div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>One big return, once a year</h3>
                  <p style={{ fontSize: 15.5, color: MUTED, lineHeight: 1.6, margin: '0 auto', maxWidth: 420 }}>
                    A whole year of receipts saved up in a drawer. A scramble every January. Easy to miss things, easy to overpay, and a stressful evening you never look forward to.
                  </p>
                  <div style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: '#FDECEC', color: '#B4402F', fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 20 }}>
                    <span>📅</span> January: panic
                  </div>
                </div>
              </div>

              {/* New way */}
              <div className="mtd-panel mtd-new-panel">
                <div style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 20, padding: '34px 28px 30px', boxShadow: '0 14px 40px rgba(17,17,17,.06)' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 22px' }}>Your tax year, broken into four easy check ins</p>
                  <div className="timeline">
                    <div className="tl-line" aria-hidden="true" />
                    {mtdQuarters.map((q, i) => (
                      <div key={q.q} className="tl-step">
                        <div className="tl-dot">{i + 1}</div>
                        <h4 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 2px' }}>{q.q}</h4>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: RIVER, marginBottom: 6 }}>{q.when}</div>
                        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, margin: 0 }}>{q.note}</p>
                      </div>
                    ))}
                    <div className="tl-step">
                      <div className="tl-dot">★</div>
                      <h4 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 2px' }}>Year end</h4>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: SAFFRON_DEEP, marginBottom: 6 }}>Final figure</div>
                      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, margin: 0 }}>You confirm the year. Done.</p>
                    </div>
                  </div>
                  <div style={{ marginTop: 26, display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: GREEN_TINT, color: GREEN, fontSize: 13.5, fontWeight: 600, padding: '10px 16px', borderRadius: 20 }}>
                    <span>👍</span> You still pay your tax on the same dates as now. Nothing changes there.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* What it means for you */}
          <div className="grid3 reveal" style={{ display: 'grid', gap: 22, marginTop: 44 }}>
            {mtdMeans.map((m) => (
              <div key={m.title} className="card" style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 24 }}>
                <div className="icontile" style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: m.tint, color: m.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 14 }}>{m.icon}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>{m.title}</h3>
                <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{m.body}</p>
              </div>
            ))}
          </div>
          <p className="reveal" style={{ fontSize: 13, color: MUTED, textAlign: 'center', marginTop: 26 }}>
            Lekhio is built for these rules from day one. You keep working, Lekhio keeps the records, and the quarterly update is ready when it is due.
          </p>
          <Link href="/file-your-tax-return" className="reveal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', maxWidth: 760, margin: '28px auto 0', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '18px 22px', textDecoration: 'none', color: INK }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 26 }}>📋</span>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700 }}>Rather file it yourself? Here is the free guide.</div>
                <div style={{ fontSize: 13.5, color: MUTED }}>Step by step, by trade. Stop paying for a 15 minute job.</div>
              </div>
            </div>
            <span style={{ backgroundColor: RIVER, color: '#fff', fontSize: 14.5, fontWeight: 600, padding: '11px 18px', borderRadius: 10, whiteSpace: 'nowrap' }}>Read the guide →</span>
          </Link>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" style={{ backgroundColor: SURFACE, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '46px 24px' }}>
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
                    <th className="center lekcol" style={{ color: RIVER_DEEP }}>Lekhio</th>
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
            <Link href="/start" className="btn-primary" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Switch to the easy way</Link>
          </div>
        </div>
      </section>

      {/* Complaints to fixes, review panel style */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>The reviews that built Lekhio.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>These are the kinds of complaints people leave about other bookkeeping apps. Here is what we did about each one.</p>
        </div>
        {fixes.map((f, i) => (
          <div key={i} className="fixrow reveal">
            <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 20, boxShadow: '0 10px 26px rgba(17,17,17,.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 19, background: SURFACE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>😕</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{f.who}</div>
                  <div style={{ fontSize: 13, letterSpacing: 1 }}><span style={{ color: '#E04646' }}>{'★'.repeat(f.stars)}</span><span style={{ color: '#D9D2C4' }}>{'★'.repeat(5 - f.stars)}</span></div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 14.5, color: INK, lineHeight: 1.55, fontStyle: 'italic' }}>&ldquo;{f.gripe}&rdquo;</p>
            </div>
            <div className="fixarrow">&rarr;</div>
            <div style={{ background: RIVER_TINT, border: `1px solid ${RIVER_TINT}`, borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: 13, background: GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>&#10003;</span>
                <div style={{ fontSize: 13, fontWeight: 700, color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: '.5px' }}>The Lekhio fix</div>
              </div>
              <p style={{ margin: 0, fontSize: 14.5, color: INK, lineHeight: 1.55 }}>{f.fix}</p>
            </div>
          </div>
        ))}
        <p style={{ fontSize: 12.5, color: MUTED, textAlign: 'center', marginTop: 12 }}>Complaints are common themes from public reviews of other apps, paraphrased. We never name names.</p>
      </section>

      {/* Trust */}
      <section id="trust" style={{ backgroundColor: '#fff', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={{ display: 'inline-block', backgroundColor: GREEN_TINT, color: GREEN, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 20, marginBottom: 18 }}>BUILT TO BE TRUSTED</span>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Your money. Your data. Your call.</h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 600, margin: '0 auto' }}>
              You hear about fake HMRC texts and dodgy apps all the time. Lekhio is the opposite of that. Here is exactly how it works, and what we will never do.
            </p>
          </div>

          {/* Floating trust badges */}
          <div className="tbadges reveal">
            {trustBadges.map((b, i) => (
              <span key={b.label} className="tbadge" style={{ animationDelay: `${(i * 0.45).toFixed(2)}s`, animationDuration: `${(4.6 + (i % 3) * 0.7).toFixed(1)}s` }}>
                <span style={{ fontSize: 15 }}>{b.icon}</span>{b.label}
              </span>
            ))}
          </div>

          <div className="trust-grid reveal" style={{ marginBottom: 28 }}>
            {trustPillars.map((p) => (
              <div key={p.title} className="card trust-card" style={{ backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 20, padding: '30px 28px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <div className="icontile" style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 15, backgroundColor: p.tint, color: p.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>{p.icon}</div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.2px' }}>{p.title}</h3>
                  <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>{p.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="duo reveal">
            <div style={{ backgroundColor: GREEN_TINT, border: `1px solid #CFE9D8`, borderRadius: 18, padding: 28 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px', color: GREEN }}>Lekhio will</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {willList.map((line) => (
                  <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', color: GREEN, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✓</span>
                    <span style={{ fontSize: 15, color: INK, lineHeight: 1.5 }}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ backgroundColor: '#FDECEC', border: `1px solid #F3D2CE`, borderRadius: 18, padding: 28 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 16px', color: '#B23A2B' }}>Lekhio will never</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {neverList.map((line) => (
                  <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', color: '#B23A2B', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>✕</span>
                    <span style={{ fontSize: 15, color: INK, lineHeight: 1.5 }}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="reveal" style={{ fontSize: 13.5, color: MUTED, textAlign: 'center', marginTop: 30, maxWidth: 640, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            Lekhio is not HMRC and is not endorsed by HMRC. We are an independent UK company that prepares your records and keeps you ready. You always approve before anything is sent.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: 1320, margin: '0 auto', padding: '46px 24px' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>One price. No surprises.</h2>
          <p style={{ fontSize: 17, color: MUTED, maxWidth: 620, margin: '0 auto' }}>Try it free for 30 days. Keep it for less than a tank of fuel a month. Other apps look cheaper, then charge extra for receipts, CIS, filing and support. Lekhio is one price with all of it in.</p>
        </div>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto 22px', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 18, padding: '22px 24px' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: RIVER_DEEP, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 14px', textAlign: 'center' }}>One Lekhio replaces all of these</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
            {replaces.map((r) => (
              <div key={r.label} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '13px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 22 }}>{r.icon}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginTop: 5 }}>{r.label}</div>
                <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{r.cost} / mo</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13.5, color: MUTED, textAlign: 'center', margin: '16px auto 0', maxWidth: 560, lineHeight: 1.6 }}>
            Pay for those one by one and it is well over £40 a month, across five different logins. Lekhio is the lot, in one chat, for £19.99. Cheaper than a single one of the apps it replaces.
          </p>
        </div>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto', backgroundColor: '#fff', border: `1px solid ${LINE}`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 18px 50px rgba(17,17,17,.07)' }}>
          <div className="price-split" style={{ display: 'flex' }}>
            <div style={{ flex: 1, padding: 36, borderRight: `1px solid ${LINE}` }}>
              <div style={{ display: 'inline-block', backgroundColor: RIVER_TINT, color: RIVER_DEEP, fontSize: 12, fontWeight: 700, letterSpacing: '0.6px', padding: '6px 12px', borderRadius: 8, marginBottom: 22 }}>30 DAYS FREE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 54, fontWeight: 800, letterSpacing: '-2px' }}>£19.99</span>
                <span style={{ fontSize: 17, color: MUTED }}>/ month</span>
              </div>
              <p style={{ fontSize: 14, color: MUTED, margin: '0 0 6px' }}>After your free trial. Cancel any time.</p>
              <p style={{ fontSize: 14, color: INK, fontWeight: 600, margin: '0 0 6px' }}>Or £199 a year, two months free.</p>
              <Link href="/register-your-business" style={{ display: 'block', fontSize: 13.5, color: GREEN, fontWeight: 700, margin: '0 0 22px' }}>Set up with us first and lock in 20% off for life →</Link>
              <Link href="/start" className="btn-primary" style={{ display: 'block', textAlign: 'center', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: 15, borderRadius: 12 }}>Start free trial</Link>
              <p style={{ fontSize: 13, color: MUTED, textAlign: 'center', margin: '12px 0 0' }}>No card needed to start. Snap your first receipt in minutes.</p>
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

      {/* Reviews (marquee) */}
      <section id="reviews" style={{ padding: '46px 0' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 48, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto', padding: '0 24px' }}>
          <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Why people leave the old tools.</h2>
          <p style={{ fontSize: 17, color: MUTED, margin: 0 }}>We read the one star reviews of the big accounting apps so you do not have to. These are the exact things people told us, and what Lekhio does instead.</p>
        </div>
        <div className="marquee">
          <div className="marquee-track">
            {[...reviews, ...reviews].map((r, i) => (
              <ReviewCard key={i} r={r} />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ backgroundColor: '#fff', borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '46px 24px' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 className="h2" style={{ fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 14px' }}>Questions, answered straight.</h2>
            <p style={{ fontSize: 17, color: MUTED, maxWidth: 520, margin: '0 auto' }}>Tap a question for the plain version.</p>
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
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 24px' }}><RiverDivider /></div>
        <div className="reveal" style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 76px', textAlign: 'center' }}>
          <h2 className="h2" style={{ color: '#fff', fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 16px' }}>You are good at your trade. Let Lekhio do the paperwork.</h2>
          <p style={{ fontSize: 17, color: '#B6BDC8', lineHeight: 1.6, maxWidth: 540, margin: '0 auto 32px' }}>
            HMRC keeps you responsible for your tax. Lekhio keeps you ready for it. We prepare your figures. You always approve before anything is sent.
          </p>
          <Link href="/start" className="btn-primary" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12 }}>Sign up now</Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: PAPER }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '40px 24px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 4 }}>Lekhio</div>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Your books, handled. Just text it.</p>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            <Link href="/start" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Sign up</Link>
            <Link href="/resources" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Free tools</Link>
            <Link href="/can-i-claim" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Can I claim it?</Link>
            <Link href="/tax-calculator" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Tax calculator</Link>
            <Link href="/invoice-generator" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Invoice generator</Link>
            <Link href="/register-your-business" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Register a business</Link>
            <Link href="/file-your-tax-return" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Free tax guide</Link>
            <Link href="/privacy" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Privacy</Link>
            <Link href="/terms" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Terms</Link>
            <a href="mailto:support@lekhio.com" className="navlink" style={{ color: MUTED, fontSize: 14, fontWeight: 500 }}>Support</a>
          </div>
        </div>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 24px 36px' }}>
          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
            © {new Date().getFullYear()} Lekhio, a Satluj Ventures company. Built for the UK self employed. Lekhio prepares your records. You stay responsible for your tax with HMRC.
          </p>
        </div>
      </footer>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
            try{
              var els=document.querySelectorAll('.reveal');
              if(!('IntersectionObserver' in window)){els.forEach(function(e){e.classList.add('in')});}
              else{var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target);}})},{threshold:0.12});els.forEach(function(e){io.observe(e)});}
            }catch(e){document.querySelectorAll('.reveal').forEach(function(x){x.classList.add('in')});}
            try{
              var nums=document.querySelectorAll('.countup');
              function run(el){var to=parseFloat(el.getAttribute('data-to'))||0;var dur=1100,start=null;function step(ts){if(!start)start=ts;var p=Math.min((ts-start)/dur,1);el.textContent=Math.floor(p*to);if(p<1){requestAnimationFrame(step);}else{el.textContent=to;}}requestAnimationFrame(step);}
              if(!('IntersectionObserver' in window)){nums.forEach(function(n){n.textContent=n.getAttribute('data-to');});}
              else{var io2=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){run(x.target);io2.unobserve(x.target);}})},{threshold:0.5});nums.forEach(function(n){io2.observe(n);});}
            }catch(e){document.querySelectorAll('.countup').forEach(function(n){n.textContent=n.getAttribute('data-to');});}
            try{
              var navt=document.getElementById('navtoggle');
              document.querySelectorAll('.nav-panel a').forEach(function(a){a.addEventListener('click',function(){if(navt)navt.checked=false;});});
            }catch(e){}
          })();`,
        }}
      />
    </main>
  );
}
