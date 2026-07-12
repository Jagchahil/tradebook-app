import type { Metadata } from 'next';
import Link from 'next/link';
import { A11Y_CSS } from '../../lib/tokens';
import { SharedHead, SiteNav, SiteFooter, SITE } from '../_shared/site';

export const metadata: Metadata = {
  title: 'How to file your own tax return. A free step by step guide for the self employed | Lekhio',
  description:
    'File your own Self Assessment tax return without paying an accountant. A plain English, step by step guide for UK sole traders and tradespeople, with the expenses you can claim by trade, the deadlines, and what Making Tax Digital means for you. Free.',
  // SITE, not a hardcoded Vercel URL. This was declaring the canonical for this
  // page to be tradebook-app-five.vercel.app, which tells Google the preview
  // deployment is the real page rather than lekhio.app.
  metadataBase: new URL(SITE),
  alternates: { canonical: '/file-your-tax-return' },
  openGraph: {
    title: 'File your own tax return. Stop paying for a 15 minute job.',
    description:
      'A free, plain English guide for the UK self employed. The steps, the deadlines, the expenses you can claim by trade, and what Making Tax Digital means for you.',
    type: 'article',
  },
};

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const SAFFRON_DEEP = 'var(--saffron-deep)';
const SAFFRON_TINT = 'var(--saffron-tint)';
const GREEN = 'var(--green)';
const GREEN_TINT = 'var(--green-tint)';
const PAPER = 'var(--bg)';
const SURFACE = 'var(--surface)';
const LINE = 'var(--bd)';
const MUTED = 'var(--tx-mut)';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const steps = [
  {
    n: '1', key: 'utr', tint: RIVER_TINT, fg: RIVER,
    title: 'Register and get your UTR',
    lead: 'First time only. You tell HMRC you have started working for yourself.',
    does: [
      "On GOV.UK, search 'register for Self Assessment' and choose self employed.",
      'Enter your details and the date you started trading.',
      'HMRC posts your 10 digit UTR within 2 to 3 weeks.',
      'Set up your Government Gateway user ID and password. You need these every year.',
    ],
    tip: 'Registered before? Skip this. Just have your UTR and Gateway login ready.',
  },
  {
    n: '2', key: 'gather', tint: SAFFRON_TINT, fg: SAFFRON_DEEP,
    title: 'Gather your numbers',
    lead: 'Five things, in front of you before you start.',
    does: [
      'Your UTR and Government Gateway login.',
      'Your National Insurance number.',
      'Your total income for 6 April 2025 to 5 April 2026.',
      'Your total allowable expenses, ideally split by category.',
      'Any other income: a job (P60), interest, or dividends.',
    ],
    tip: 'With Lekhio, your income and expense totals are already added up and split by category.',
  },
  {
    n: '3', key: 'login', tint: GREEN_TINT, fg: GREEN,
    title: 'Log in and open the return',
    lead: 'Everything happens on the official HMRC website.',
    does: [
      'Sign in to the HMRC Self Assessment service with your Gateway login.',
      'Start the return for the 2025/26 tax year.',
      'Add the self employment section. This is the SA103.',
      'The system picks the short or full version from your turnover.',
    ],
    tip: 'Turnover under £90,000 uses the short pages, SA103S. It is quicker.',
  },
  {
    n: '4', key: 'form', tint: RIVER_TINT, fg: RIVER,
    title: 'Fill in your self employment pages',
    lead: 'The heart of it. Two figures, plus the detail.',
    does: [
      'Enter your turnover: everything you invoiced or were paid, before expenses.',
      'Enter your allowable expenses, by category: materials, travel, phone, insurance.',
      'Income under £1,000? Use the £1,000 trading allowance instead of real expenses.',
      'Buying big tools or equipment? Claim them as capital allowances.',
    ],
    tip: 'Split expenses into categories, do not lump them into one box. It is cleaner if HMRC asks.',
  },
  {
    n: '5', key: 'maths', tint: SAFFRON_TINT, fg: SAFFRON_DEEP,
    title: 'Let HMRC do the maths',
    lead: 'You do not work out the tax. The return does.',
    does: [
      'Add any other income, like a PAYE job from your P60.',
      'The return applies your £12,570 personal allowance automatically.',
      'It works out your Income Tax and your Class 4 National Insurance.',
      'It shows your final bill, and any payments on account.',
    ],
    tip: 'Class 2 NI changed recently. Most people no longer pay it separately but still build their state pension.',
  },
  {
    n: '6', key: 'submit', tint: GREEN_TINT, fg: GREEN,
    title: 'Check, submit, save the proof',
    lead: 'Slow down here for one minute.',
    does: [
      'Read the calculation. Check it matches your own records.',
      'Press submit. HMRC confirms on screen straight away.',
      'Save or screenshot the confirmation and your submission reference.',
      'That is your return filed. Done.',
    ],
    tip: 'Filed early? You still do not pay until 31 January. It just means no last minute panic.',
  },
  {
    n: '7', key: 'pay', tint: RIVER_TINT, fg: RIVER,
    title: 'Pay what you owe by 31 January',
    lead: 'The deadline that matters.',
    does: [
      'Pay your bill by 31 January, online, by bank transfer, or through your tax code.',
      'If your bill is over £1,000, you also make payments on account towards next year.',
      'That is half by 31 January and half by 31 July.',
      'Set aside roughly 30% of your profit as you go.',
    ],
    tip: 'Lekhio gives you a running set aside figure, so the money is always there when the bill lands.',
  },
];

// CSS that powers the interactive walkthrough. The radios drive which panel
// shows; each panel's mock animations restart when it becomes visible.
const stepperCss =
  `.wt-panel{display:none}` +
  steps
    .map(
      (s) =>
        `#wt${s.n}:checked~.wt-stage .wtp-${s.n}{display:block}` +
        `#wt${s.n}:checked~.wt-tabs label[for="wt${s.n}"]{background:${RIVER};color:#fff;border-color:${RIVER}}` +
        `#wt${s.n}:focus-visible~.wt-tabs label[for="wt${s.n}"]{outline:2px solid ${RIVER};outline-offset:2px}`,
    )
    .join('') +
  `@keyframes wtRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}` +
  `@keyframes wtPop{0%{opacity:0;transform:scale(.4)}60%{transform:scale(1.12)}100%{opacity:1;transform:scale(1)}}` +
  `@keyframes wtFill{from{width:6%}to{width:100%}}` +
  `@keyframes wtPress{0%,55%{transform:scale(1)}68%{transform:scale(.93)}100%{transform:scale(1)}}` +
  `@keyframes wtBlink{0%,100%{opacity:1}50%{opacity:0}}` +
  `.wtA{opacity:0;animation:wtRise .45s ease forwards}` +
  `.wtP{opacity:0;animation:wtPop .5s ease forwards}` +
  `.wtF{animation:wtFill .7s ease forwards}` +
  `.wtPress{animation:wtPress 1.5s ease .25s forwards}` +
  `.wt-caret{display:inline-block;width:2px;height:14px;background:${RIVER};vertical-align:middle;animation:wtBlink .8s step-end infinite}` +
  `.wt-screen{background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;box-shadow:0 14px 36px rgba(17,17,17,.08)}` +
  `.wt-screenbar{background:${INK};color:#fff;font-size:11.5px;font-weight:600;letter-spacing:.3px;padding:9px 14px}` +
  `.wt-tabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:24px}` +
  `.wt-tab{cursor:pointer;width:40px;height:40px;border-radius:999px;border:1.5px solid ${LINE};background:#fff;color:${INK};font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;transition:all .15s}` +
  `.wt-tab:hover{border-color:${RIVER}}` +
  `.wt-stage{min-height:312px}` +
  `.wt-grid{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:center}` +
  `@media (max-width:720px){.wt-grid{grid-template-columns:1fr;gap:18px}.wt-stage{min-height:0}}`;

const universalExpenses = [
  'Materials and stock used on jobs',
  'Tools and equipment, often the full cost in the year you buy them',
  'Vehicle running costs, or the flat mileage rate',
  'Protective clothing and safety gear, boots, gloves, hi vis, hard hats',
  'Phone and broadband, the business share',
  'Insurance, public liability, tools, professional indemnity',
  'Trade body and certification fees',
  'A share of home costs for quotes and admin',
  'Accounting or bookkeeping software, including Lekhio',
  'Business bank charges',
  'Advertising and a website',
  'Training that maintains your trade skills',
];

const trades = [
  { id: 'electricians', name: 'Electricians', cis: false, items: ['Cable, fittings and consumer units', 'Test equipment and its calibration', '18th Edition and scheme fees (NICEIC, NAPIT)', 'PAT testing kit', 'Van racking and storage'] },
  { id: 'plumbers', name: 'Plumbers', cis: false, items: ['Pipe, fittings, copper and plastic stock', 'Leak detection and pressure testing kit', 'Blow torch and consumables', 'WaterSafe or scheme membership', 'Van racking'] },
  { id: 'builders', name: 'Builders', cis: true, items: ['Aggregates, cement, timber and fixings', 'Plant hire', 'Skip and waste disposal', 'Scaffold hire', 'Site PPE'] },
  { id: 'plasterers', name: 'Plasterers', cis: true, items: ['Plaster, beading and boards', 'Mixing equipment and stilts', 'Dust sheets', 'Tower or scaffold hire', 'PPE and masks'] },
  { id: 'roofers', name: 'Roofers', cis: true, items: ['Tiles, felt, battens and lead', 'Harnesses and fall arrest gear', 'Scaffold and tower hire', 'Ladders and roof ladders', 'PPE'] },
  { id: 'joiners', name: 'Joiners', cis: true, items: ['Timber and sheet materials', 'Ironmongery and fixings', 'Power tools and blades', 'Dust extraction', 'Workshop costs if you have one'] },
  { id: 'decorators', name: 'Decorators', cis: false, items: ['Paint, fillers and sundries', 'Brushes, rollers and trays', 'Dust sheets', 'Sanding and spray equipment', 'Access towers'] },
  { id: 'tilers', name: 'Tilers', cis: false, items: ['Tiles, adhesive and grout', 'Trims and levelling systems', 'Cutters and mixing kit', 'Knee pads and PPE', 'Tower or access hire'] },
  { id: 'gas', name: 'Gas engineers', cis: false, items: ['Parts and fittings', 'Flue gas analyser and its calibration', 'Gas Safe registration', 'Tools, manuals and standards', 'Van racking'] },
  { id: 'scaffolders', name: 'Scaffolders', cis: true, items: ['Tube, fittings and boards', 'Harnesses and PPE', 'Transport of materials', 'CISRS card and training', 'Vehicle and trailer costs'] },
  { id: 'groundworkers', name: 'Groundworkers', cis: true, items: ['Aggregates, concrete and drainage materials', 'Plant and digger hire', 'Fuel for plant', 'Setting out kit', 'Site welfare and PPE'] },
  { id: 'landscapers', name: 'Landscapers', cis: false, items: ['Plants, turf and aggregates', 'Paving and materials', 'Mowers and machinery', 'Green waste and tip fees', 'Fuel and machine servicing'] },
  { id: 'hairdressers', name: 'Hairdressers & barbers', cis: false, items: ['Products, colour and supplies', 'Scissors, clippers and tools', 'Chair or booth rent', 'Gowns, towels and PPE', 'Insurance and training'] },
  { id: 'cleaners', name: 'Cleaners', cis: false, items: ['Cleaning products and supplies', 'Vacuums and equipment', 'Mileage between jobs', 'Gloves and PPE', 'Insurance and DBS checks'] },
  { id: 'drivers', name: 'Drivers & couriers', cis: false, items: ['Fuel or the mileage rate', 'Vehicle running and servicing', 'Licensing and badges', 'Phone and delivery apps', 'Insurance'] },
  { id: 'beauticians', name: 'Beauticians & nail techs', cis: false, items: ['Products and consumables', 'Kit, lamps and tools', 'Couch or room hire', 'PPE and sanitiser', 'Insurance and training'] },
  { id: 'photographers', name: 'Photographers', cis: false, items: ['Cameras, lenses and gear', 'Editing software and storage', 'Studio or location hire', 'Travel to shoots', 'Website and insurance'] },
  { id: 'trainers', name: 'Personal trainers', cis: false, items: ['Equipment and weights', 'Gym or studio hire', 'App and music subscriptions', 'Insurance and qualifications', 'Branded kit'] },
  { id: 'tutors', name: 'Tutors', cis: false, items: ['Books and learning resources', 'Printing and materials', 'Room or online platform hire', 'Travel to students', 'DBS and memberships'] },
  { id: 'creatives', name: 'Designers & freelancers', cis: false, items: ['Software subscriptions', 'Laptop and equipment', 'Website and hosting', 'Home office or co-working', 'Training and stock assets'] },
];

const deadlines = [
  { date: '5 Oct 2026', label: 'Register for Self Assessment, if it is your first return for 2025/26.' },
  { date: '31 Oct 2026', label: 'Paper tax return deadline, if you file on paper.' },
  { date: '30 Dec 2026', label: 'File online if you want a small bill collected through your tax code.' },
  { date: '31 Jan 2027', label: 'File online and pay what you owe. The big one.' },
  { date: '31 Jul 2027', label: 'Second payment on account, if you make them.' },
];

const faqs = [
  { q: 'Do I really not need an accountant?', a: 'For a straightforward sole trader, no. The online return works out the tax for you, and once your records are in order the form takes about 15 minutes. If your affairs are complex, an accountant can still be worth it. The choice is yours, and now you can make it from an informed place.' },
  { q: 'What is a UTR?', a: 'Your Unique Taxpayer Reference. A 10 digit number HMRC gives you when you register for Self Assessment. You need it every time you file, so keep it somewhere safe.' },
  { q: 'I have a job and do this on the side. Do I still file?', a: 'Yes. Tax is taken from your job through PAYE, but your self employed income is not, so you report it on a Self Assessment return. You add your job from your P60, and HMRC works out the combined picture.' },
  { q: 'What if I earned under £1,000?', a: 'If your total self employed income for the year is under £1,000 you may not need to report it, thanks to the trading allowance. If you earned more but had tiny costs, you can claim the flat £1,000 instead of real expenses.' },
  { q: 'What about National Insurance?', a: 'Self employed people pay Class 4 National Insurance on their profits, and the online return calculates it automatically. You do not work it out yourself. Class 2 changed recently, most people no longer pay it separately but still build up their state pension entitlement.' },
  { q: 'What are payments on account?', a: 'If your tax bill is over £1,000, HMRC asks you to pay towards next year in advance, half on 31 January and half on 31 July. It catches first timers out, so set money aside. Lekhio gives you a running set aside figure.' },
  { q: 'When do I need to charge VAT?', a: 'Only once your turnover passes £90,000 in a 12 month period. Below that you do not register for VAT unless you choose to. Most sole traders are well under it.' },
  { q: 'What records do I need to keep?', a: 'Your sales and income, your business expenses with receipts, and your mileage if you claim it. Keep them for at least 5 years after the 31 January deadline. Lekhio stores all of this for you as you go.' },
  { q: 'What if I miss the deadline?', a: 'You get an automatic £100 penalty the day after, even if you owe no tax. After 3 months daily penalties start, and interest is charged on tax paid late. That is exactly why we send the reminder to your WhatsApp.' },
  { q: 'I am in construction and tax is taken off my pay. What then?', a: 'That is the Construction Industry Scheme, CIS. Contractors deduct tax from your pay at source. You still file a return, and that deducted tax comes off your final bill or is refunded to you. Keep your CIS statements.' },
  { q: 'Can I claim my van and fuel?', a: 'Yes. Either claim a share of your actual running costs, or use the flat mileage rate. For the 2026/27 tax year that rate is 55p a mile for the first 10,000 business miles, then 25p after that. HMRC raised it from 45p to 55p from 6 April 2026.' },
  { q: 'What is Making Tax Digital and does it affect me?', a: 'It is the biggest change to Self Assessment in years. From April 2026, if your turnover is over £50,000 you must keep digital records and send four short updates a year instead of one return. It reaches £30,000 turnover in 2027 and £20,000 in 2028, so it is coming for nearly everyone. Lekhio keeps the digital records both routes now expect.' },
];

// Build the CSS that powers the trade selector and the route branch, no JavaScript needed.
const tradeCss = trades
  .map(
    (t) =>
      `#trade-${t.id}:checked ~ .trade-panels .tp-${t.id}{display:block}` +
      `#trade-${t.id}:checked ~ .trade-chips label[for="trade-${t.id}"]{background:${RIVER};color:#fff;border-color:${RIVER}}` +
      `#trade-${t.id}:focus-visible ~ .trade-chips label[for="trade-${t.id}"]{outline:2px solid ${RIVER};outline-offset:2px}`,
  )
  .join('\n');

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

// The animated mock screen for each walkthrough step. Pure CSS animations that
// restart when the panel becomes visible, so each step demonstrates the action.
function StepMock({ k }: { k: string }) {
  if (k === 'utr') {
    return (
      <div className="wt-screen">
        <div className="wt-screenbar">GOV.UK</div>
        <div style={{ padding: '18px 16px', minHeight: 168 }}>
          <div className="wtA" style={{ animationDelay: '.05s', fontSize: 12, color: MUTED }}>Self Assessment</div>
          <div className="wtA" style={{ animationDelay: '.15s', fontSize: 13.5, fontWeight: 700, marginTop: 6 }}>Your Unique Taxpayer Reference</div>
          <div className="wtP" style={{ animationDelay: '.5s', marginTop: 14, background: RIVER_TINT, color: RIVER_DEEP, borderRadius: 10, padding: '14px 12px', textAlign: 'center', fontSize: 22, fontWeight: 800, letterSpacing: '2px' }}>1234 567 890</div>
          <div className="wtA" style={{ animationDelay: '.8s', marginTop: 12, fontSize: 12, color: MUTED }}>Posted to you in 2 to 3 weeks.</div>
        </div>
      </div>
    );
  }
  if (k === 'gather') {
    const items = ['UTR and Gateway login', 'National Insurance number', 'Total income', 'Total expenses', 'Other income (P60)'];
    return (
      <div className="wt-screen">
        <div className="wt-screenbar">Before you start</div>
        <div style={{ padding: '12px 16px', minHeight: 168 }}>
          {items.map((t, i) => (
            <div key={t} className="wtA" style={{ animationDelay: `${0.1 + i * 0.12}s`, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
              <span className="wtP" style={{ animationDelay: `${0.2 + i * 0.12}s`, width: 22, height: 22, borderRadius: 11, background: GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>✓</span>
              <span style={{ fontSize: 13.5 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (k === 'login') {
    return (
      <div className="wt-screen">
        <div className="wt-screenbar">HMRC sign in</div>
        <div style={{ padding: '18px 16px', minHeight: 168 }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Government Gateway user ID</div>
          <div style={{ height: 34, borderRadius: 8, border: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 13 }}>
            <span>1357924680</span><span className="wt-caret" style={{ marginLeft: 2 }} />
          </div>
          <div style={{ fontSize: 12, color: MUTED, margin: '12px 0 4px' }}>Password</div>
          <div style={{ height: 34, borderRadius: 8, border: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 13, letterSpacing: 2 }}>••••••••</div>
          <div className="wtPress" style={{ marginTop: 14, background: RIVER, color: '#fff', borderRadius: 8, padding: '10px', textAlign: 'center', fontSize: 13.5, fontWeight: 700 }}>Sign in</div>
          <div className="wtP" style={{ animationDelay: '1.55s', marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: GREEN, fontSize: 12.5, fontWeight: 600 }}><span>✓</span> Tax year 2025 to 2026</div>
        </div>
      </div>
    );
  }
  if (k === 'form') {
    return (
      <div className="wt-screen">
        <div className="wt-screenbar">SA103 Self employment</div>
        <div style={{ padding: '16px 16px', minHeight: 168 }}>
          <div style={{ fontSize: 12, color: MUTED }}>Turnover</div>
          <div style={{ height: 30, borderRadius: 8, background: SURFACE, overflow: 'hidden', marginTop: 5, position: 'relative' }}>
            <div className="wtF" style={{ height: '100%', background: RIVER_TINT, width: '6%' }} />
            <span className="wtP" style={{ animationDelay: '.7s', position: 'absolute', right: 10, top: 5, fontSize: 13.5, fontWeight: 800, color: RIVER_DEEP }}>£38,400</span>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 12 }}>Allowable expenses</div>
          <div style={{ height: 30, borderRadius: 8, background: SURFACE, overflow: 'hidden', marginTop: 5, position: 'relative' }}>
            <div className="wtF" style={{ height: '100%', background: GREEN_TINT, width: '6%', animationDelay: '.5s' }} />
            <span className="wtP" style={{ animationDelay: '1.1s', position: 'absolute', right: 10, top: 5, fontSize: 13.5, fontWeight: 800, color: GREEN }}>£9,250</span>
          </div>
          <div className="wtA" style={{ animationDelay: '1.35s', marginTop: 14, fontSize: 12.5, color: MUTED }}>Net profit, worked out for you: <b style={{ color: INK }}>£29,150</b></div>
        </div>
      </div>
    );
  }
  if (k === 'maths') {
    const rows: [string, string][] = [['Profit', '£29,150'], ['Less personal allowance', '-£12,570'], ['Income tax, 20%', '£3,316'], ['Class 4 NI, 6%', '£995']];
    return (
      <div className="wt-screen">
        <div className="wt-screenbar">Your tax, worked out</div>
        <div style={{ padding: '14px 16px', minHeight: 168 }}>
          {rows.map((r, i) => (
            <div key={r[0]} className="wtA" style={{ animationDelay: `${0.1 + i * 0.18}s`, display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: `1px solid ${SURFACE}` }}>
              <span style={{ color: MUTED }}>{r[0]}</span><span style={{ fontWeight: 600 }}>{r[1]}</span>
            </div>
          ))}
          <div className="wtP" style={{ animationDelay: '1s', marginTop: 12, background: RIVER, color: '#fff', borderRadius: 10, padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13 }}>Your bill</span><span style={{ fontSize: 18, fontWeight: 800 }}>£4,311</span>
          </div>
        </div>
      </div>
    );
  }
  if (k === 'submit') {
    return (
      <div className="wt-screen">
        <div className="wt-screenbar">Submit your return</div>
        <div style={{ padding: '20px 16px', textAlign: 'center', minHeight: 168 }}>
          <div className="wtPress" style={{ background: RIVER, color: '#fff', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700 }}>Submit return</div>
          <div className="wtP" style={{ animationDelay: '1.55s', marginTop: 16 }}>
            <div style={{ width: 54, height: 54, borderRadius: 27, background: GREEN, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, margin: '0 auto' }}>✓</div>
            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>Submission received</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Reference IRMARK 9F2A7C</div>
          </div>
        </div>
      </div>
    );
  }
  // pay
  return (
    <div className="wt-screen">
      <div className="wt-screenbar">Pay by 31 January</div>
      <div style={{ padding: '16px 16px', display: 'flex', gap: 14, alignItems: 'center', minHeight: 168 }}>
        <div className="wtP" style={{ animationDelay: '.2s', width: 84, flexShrink: 0, border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', textAlign: 'center' }}>
          <div style={{ background: RIVER, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px' }}>JAN</div>
          <div style={{ fontSize: 30, fontWeight: 800, padding: '8px 0', color: RIVER_DEEP }}>31</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Set aside as you go</div>
          <div style={{ height: 26, borderRadius: 13, background: SURFACE, overflow: 'hidden', position: 'relative' }}>
            <div className="wtF" style={{ height: '100%', background: `linear-gradient(90deg,${GREEN},#3FB871)`, width: '6%' }} />
            <span className="wtP" style={{ animationDelay: '.8s', position: 'absolute', right: 10, top: 4, fontSize: 12.5, fontWeight: 800, color: '#fff' }}>£4,311 ready</span>
          </div>
          <div className="wtA" style={{ animationDelay: '1s', fontSize: 12, color: MUTED, marginTop: 8 }}>Roughly 30% of profit, saved already.</div>
        </div>
      </div>
    </div>
  );
}

export default function FileYourTaxReturnPage() {
  return (
    <main style={{ fontFamily: FONT, color: INK, background: PAPER, overflowX: 'hidden' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <style dangerouslySetInnerHTML={{ __html: A11Y_CSS }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
          *{box-sizing:border-box}
          a{color:inherit}
          .vh{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
          @keyframes riseIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
          @keyframes growLine{from{transform:scaleY(0)}to{transform:scaleY(1)}}
          .branch-panel{display:none;animation:riseIn .25s ease}
          #route-under:checked ~ .branch-panel.panel-under{display:block}
          #route-over:checked ~ .branch-panel.panel-over{display:block}
          #route-under:checked ~ .branch-tabs label[for="route-under"],
          #route-over:checked ~ .branch-tabs label[for="route-over"]{background:${RIVER};color:#fff;border-color:${RIVER}}
          #route-under:focus-visible ~ .branch-tabs label[for="route-under"],
          #route-over:focus-visible ~ .branch-tabs label[for="route-over"]{outline:2px solid ${RIVER};outline-offset:2px}
          .trade-panel{display:none;animation:riseIn .25s ease}
          ${tradeCss}
          ${stepperCss}
          details{border:1px solid ${LINE};border-radius:14px;background:#fff;margin-bottom:12px;overflow:hidden}
          details[open]{box-shadow:0 10px 30px rgba(17,17,17,.06)}
          summary{list-style:none;cursor:pointer;padding:18px 20px;font-weight:600;font-size:16.5px;display:flex;align-items:center;justify-content:space-between;gap:14px}
          summary::-webkit-details-marker{display:none}
          summary::after{content:'+';font-size:22px;color:${RIVER};font-weight:400;line-height:1}
          details[open] summary::after{content:'-'}
          .step-card{display:flex;gap:18px;padding:22px;background:#fff;border:1px solid ${LINE};border-radius:16px;margin-bottom:14px}
          .branch-tab{display:inline-block;cursor:pointer;border:1.5px solid ${LINE};background:#fff;color:${INK};font-weight:600;font-size:15px;padding:12px 20px;border-radius:999px}
          .chip{display:inline-block;cursor:pointer;border:1.5px solid ${LINE};background:#fff;color:${INK};font-weight:600;font-size:14px;padding:9px 15px;border-radius:999px;transition:all .15s}
          .chip:hover{border-color:${RIVER}}
          @media (max-width:640px){ .hide-sm{display:none} .step-card{flex-direction:column;gap:10px} }
          `,
        }}
      />

      {/* Trust bar */}
      <div style={{ background: RIVER_DEEP }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '9px 24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 500, color: '#fff' }}>
          <span>A free guide from Lekhio</span><span style={{ opacity: 0.5 }}>&middot;</span>
          <span>Plain English</span><span style={{ opacity: 0.5 }}>&middot;</span>
          <span>Checked against GOV.UK</span><span style={{ opacity: 0.5 }}>&middot;</span>
          <span>Not affiliated with HMRC</span>
        </div>
      </div>

      {/* Nav */}
      <SharedHead />
      <SiteNav />

      {/* Hero */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 20px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, backgroundColor: SAFFRON_TINT, color: SAFFRON_DEEP, fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 20, marginBottom: 22 }}>
          Free guide &middot; no sign up needed
        </div>
        <h1 style={{ fontSize: 40, lineHeight: 1.12, fontWeight: 700, letterSpacing: '-1px', margin: '0 0 18px' }}>
          File your own tax return.<br />Stop paying for a 15 minute job.
        </h1>
        <p style={{ fontSize: 19, color: MUTED, lineHeight: 1.6, maxWidth: 600, margin: '0 auto 14px' }}>
          An accountant charges a few hundred pounds to fill in a form that, once your records are in order, takes about 15 minutes. Here is exactly how to do it yourself, in plain English, for free.
        </p>
        <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, maxWidth: 600, margin: '0 auto 26px' }}>
          The honest bit: the 15 minutes is the form. The hard part was always the year of receipts behind it. That is the part Lekhio does for you, so the form really is 15 minutes.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="#steps" style={{ backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '14px 26px', borderRadius: 12, textDecoration: 'none' }}>Start the walkthrough</a>
          <Link href="/start" style={{ background: 'var(--panel)', color: RIVER, border: `1.5px solid ${RIVER}`, fontSize: 16, fontWeight: 600, padding: '14px 26px', borderRadius: 12, textDecoration: 'none' }}>Get WhatsApp reminders</Link>
        </div>
      </section>

      {/* Which route, the £50k branch */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '34px 24px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', margin: '0 0 6px' }}>First, which applies to you?</h2>
        <p style={{ fontSize: 16, color: MUTED, textAlign: 'center', maxWidth: 560, margin: '0 auto 22px' }}>
          The way you file depends on your turnover, the total you take before expenses.
        </p>
        <div style={{ position: 'relative' }}>
          <input type="radio" name="route" id="route-under" className="vh" defaultChecked />
          <input type="radio" name="route" id="route-over" className="vh" />
          <div className="branch-tabs" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
            <label htmlFor="route-under" className="branch-tab">Under £50k turnover</label>
            <label htmlFor="route-over" className="branch-tab">£50k or more</label>
          </div>
          <div className="branch-panel panel-under" style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: RIVER_DEEP }}>You file the normal Self Assessment return, once a year</h3>
            <p style={{ margin: 0, color: MUTED, fontSize: 15.5, lineHeight: 1.6 }}>
              This is most sole traders today. One return, due online by 31 January, covering the tax year that ran 6 April to 5 April. Follow the seven steps below and you are done. Keep your records tidy through the year and it is quick.
            </p>
          </div>
          <div className="branch-panel panel-over" style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: RIVER_DEEP }}>From April 2026 you use Making Tax Digital</h3>
            <p style={{ margin: '0 0 10px', color: MUTED, fontSize: 15.5, lineHeight: 1.6 }}>
              If your turnover is £50,000 or more, you must keep digital records and send four short quarterly updates plus a final declaration, instead of one return. The first quarter, 6 April to 5 July 2026, is due by 7 August 2026.
            </p>
            <p style={{ margin: 0, color: MUTED, fontSize: 15.5, lineHeight: 1.6 }}>
              This is exactly what Lekhio is built for. It keeps the digital records and prepares each update, so the change is no extra work for you. The seven steps below still help you understand the whole picture.
            </p>
          </div>
        </div>
      </section>

      {/* The walkthrough, interactive and animated */}
      <section id="steps" style={{ maxWidth: 920, margin: '0 auto', padding: '24px 24px 20px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', margin: '0 0 8px' }}>The walkthrough, click through it</h2>
        <p style={{ fontSize: 16, color: MUTED, textAlign: 'center', maxWidth: 560, margin: '0 auto 26px' }}>
          Exactly what to do at each step, with a look at the screen you will see.
        </p>
        <div className="wt" style={{ position: 'relative' }}>
          {steps.map((s, i) => (
            <input key={s.n} type="radio" name="wt" id={`wt${s.n}`} className="vh" defaultChecked={i === 0} />
          ))}
          <div className="wt-tabs">
            {steps.map((s) => (
              <label key={s.n} htmlFor={`wt${s.n}`} className="wt-tab" aria-label={`Step ${s.n}`}>{s.n}</label>
            ))}
          </div>
          <div className="wt-stage">
            {steps.map((s) => (
              <div key={s.n} className={`wt-panel wtp-${s.n}`}>
                <div className="wt-grid">
                  <div className="wt-mock"><StepMock k={s.key} /></div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '.5px' }}>Step {s.n} of 7</div>
                    <h3 style={{ fontSize: 21, fontWeight: 700, margin: '6px 0 8px' }}>{s.title}</h3>
                    <p style={{ fontSize: 15.5, color: MUTED, lineHeight: 1.55, margin: '0 0 14px' }}>{s.lead}</p>
                    <div style={{ display: 'grid', gap: 9 }}>
                      {s.does.map((d, j) => (
                        <div key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, lineHeight: 1.5 }}>
                          <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: s.tint, color: s.fg, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{j + 1}</span>
                          <span>{d}</span>
                        </div>
                      ))}
                    </div>
                    {s.tip ? <div style={{ marginTop: 14, background: SAFFRON_TINT, color: SAFFRON_DEEP, borderRadius: 10, padding: '11px 13px', fontSize: 13.5, lineHeight: 1.5 }}>💡 {s.tip}</div> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 14, color: MUTED, textAlign: 'center', marginTop: 24 }}>
          You make the actual submission on the official HMRC website. We are not HMRC and we never submit on your behalf.
        </p>
      </section>

      {/* Pick your trade */}
      <section style={{ background: SURFACE }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '54px 24px' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', margin: '0 0 8px' }}>What can you claim? Pick your trade</h2>
          <p style={{ fontSize: 16, color: MUTED, textAlign: 'center', maxWidth: 600, margin: '0 auto 24px' }}>
            Every trade claims the basics. Tap yours to see the extras that are specific to you. The rule is always the same, a cost must be wholly and exclusively for the business.
          </p>

          {/* Universal list */}
          <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: 22, marginBottom: 22 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, color: RIVER_DEEP }}>Every trade can claim</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '8px 18px' }}>
              {universalExpenses.map((e) => (
                <div key={e} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14.5, color: INK }}>
                  <span style={{ color: GREEN, fontWeight: 700 }}>&#10003;</span><span>{e}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            {trades.map((t, i) => (
              <input key={t.id} type="radio" name="trade" id={`trade-${t.id}`} className="vh" defaultChecked={i === 0} />
            ))}
            <div className="trade-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 9, justifyContent: 'center', marginBottom: 18 }}>
              {trades.map((t) => (
                <label key={t.id} htmlFor={`trade-${t.id}`} className="chip">{t.name}</label>
              ))}
            </div>
            <div className="trade-panels">
              {trades.map((t) => (
                <div key={t.id} className={`trade-panel tp-${t.id}`} style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: 24, maxWidth: 640, margin: '0 auto' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>{t.name}, on top of the basics</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '8px 18px' }}>
                    {t.items.map((it) => (
                      <div key={it} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14.5 }}>
                        <span style={{ color: RIVER, fontWeight: 700 }}>&#10003;</span><span>{it}</span>
                      </div>
                    ))}
                  </div>
                  {t.cis && (
                    <p style={{ margin: '14px 0 0', padding: '12px 14px', background: SAFFRON_TINT, borderRadius: 10, color: SAFFRON_DEEP, fontSize: 14, lineHeight: 1.5 }}>
                      Construction trade: if you work under the CIS, tax is deducted from your pay at source. You still file a return, and that tax comes off your final bill or is refunded. Keep your CIS statements.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Deadlines */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '54px 24px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', margin: '0 0 8px' }}>The deadlines for 2025/26</h2>
        <p style={{ fontSize: 16, color: MUTED, textAlign: 'center', maxWidth: 560, margin: '0 auto 26px' }}>
          The tax year ran 6 April 2025 to 5 April 2026. Miss the 31 January and it is an automatic £100 penalty, even if you owe nothing. So we remind you.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {deadlines.map((d) => (
            <div key={d.date} style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ flexShrink: 0, minWidth: 110, fontWeight: 700, color: RIVER_DEEP, fontSize: 15.5 }}>{d.date}</div>
              <div style={{ fontSize: 15.5, color: INK }}>{d.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* MTD heads up. The band stays the deep brand blue in BOTH themes, so it is
          hardcoded: var(--river-deep) flips to a light blue in dark mode and the
          white text on it became unreadable. */}
      <section style={{ background: '#134277', color: '#fff' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '54px 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 25, fontWeight: 700, margin: '0 0 14px' }}>The once a year return is changing</h2>
          <p style={{ fontSize: 16.5, color: '#CFE0F2', lineHeight: 1.65, margin: '0 0 14px' }}>
            Making Tax Digital is the biggest shake up to Self Assessment in years. From April 2026, if you turn over more than £50,000 you keep digital records and send four short updates a year instead of one return. It reaches £30,000 in 2027 and £20,000 in 2028, so it is coming for nearly every sole trader.
          </p>
          <p style={{ fontSize: 16.5, color: '#fff', lineHeight: 1.65, margin: 0 }}>
            You do not need to panic. If your records build themselves as you go, the quarterly bit is already done. That is the whole point of Lekhio.
          </p>
        </div>
      </section>

      {/* FAQ, every question */}
      <section style={{ maxWidth: 820, margin: '0 auto', padding: '54px 24px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', margin: '0 0 8px' }}>Every question, answered</h2>
        <p style={{ fontSize: 16, color: MUTED, textAlign: 'center', maxWidth: 560, margin: '0 auto 26px' }}>
          The things people actually ask before filing for the first time.
        </p>
        {faqs.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <div style={{ padding: '0 20px 20px', color: MUTED, fontSize: 15.5, lineHeight: 1.65 }}>{f.a}</div>
          </details>
        ))}
      </section>

      {/* Soft CTA */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '20px 24px 64px' }}>
        <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 22, padding: 36, textAlign: 'center', boxShadow: '0 14px 40px rgba(17,17,17,.06)' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>Make the 15 minutes actually 15 minutes</h2>
          <p style={{ fontSize: 16.5, color: MUTED, lineHeight: 1.65, maxWidth: 520, margin: '0 auto 22px' }}>
            Keep your records with Lekhio through the year. Snap a receipt, leave a voice note, or just text it. When the deadline comes, your numbers are already added up and ready, and we send the reminder to your WhatsApp. Your first 14 days are free.
          </p>
          <Link href="/start" style={{ display: 'inline-block', backgroundColor: RIVER, color: '#fff', fontSize: 16, fontWeight: 600, padding: '15px 32px', borderRadius: 12, textDecoration: 'none' }}>Start free for 14 days</Link>
        </div>
      </section>

      {/* Caveats footer */}
      <footer style={{ background: SURFACE, borderTop: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '34px 24px', fontSize: 13, color: MUTED, lineHeight: 1.65 }}>
          <p style={{ margin: '0 0 10px' }}>
            This is general guidance to help you understand Self Assessment, not personal tax advice, and your own circumstances may differ. You are responsible for your own tax return. Lekhio is not affiliated with HMRC and does not submit on your behalf, we point you to the official GOV.UK service for the actual submission.
          </p>
          <p style={{ margin: '0 0 14px' }}>
            Figures and dates are for the 2025/26 tax year and were checked against GOV.UK in June 2026. Rules change each year, so always confirm current details on GOV.UK before you file. If your affairs are complex, consider a qualified accountant.
          </p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: RIVER, fontWeight: 600, textDecoration: 'none' }}>Back to Lekhio</Link>
            <Link href="/start" style={{ color: RIVER, fontWeight: 600, textDecoration: 'none' }}>Start free trial</Link>
            <a href="https://www.gov.uk/log-in-file-self-assessment-tax-return" target="_blank" rel="noopener noreferrer" style={{ color: RIVER, fontWeight: 600, textDecoration: 'none' }}>The official HMRC service</a>
          </div>
        </div>
      </footer>
      <SiteFooter />
    </main>
  );
}
