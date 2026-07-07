// Content and helpers for the WhatsApp "file your own tax return" walkthrough.
// One source of truth for the guided messages, kept in step with the website
// page and the app screen. The webhook owns the flow control, this owns the words.
// Figures are for the 2025/26 tax year, checked against GOV.UK June 2026.
// Brand rule: no dashes anywhere, full stops only.

export const TAXGUIDE_TRIGGER = /\b(tax return|self[-\s]?assessment|file my tax|do my tax|tax walkthrough)\b/i;

const HMRC_URL = 'https://www.gov.uk/log-in-file-self-assessment-tax-return';

export interface TradeInfo {
  name: string;
  cis: boolean;
  items: string[];
}

// Match a free text reply like "I'm a sparky" or "plumber" to a trade.
const TRADES: { keywords: RegExp; info: TradeInfo }[] = [
  { keywords: /electric|spark/i, info: { name: 'electrician', cis: false, items: ['cable, fittings and consumer units', 'test equipment and its calibration', '18th Edition and scheme fees', 'PAT testing kit', 'van racking'] } },
  { keywords: /plumb/i, info: { name: 'plumber', cis: false, items: ['pipe, fittings and stock', 'leak detection and testing kit', 'blow torch and consumables', 'WaterSafe membership', 'van racking'] } },
  { keywords: /build/i, info: { name: 'builder', cis: true, items: ['aggregates, cement and timber', 'plant hire', 'skip and waste disposal', 'scaffold hire', 'site PPE'] } },
  { keywords: /plaster/i, info: { name: 'plasterer', cis: true, items: ['plaster, beading and boards', 'mixing equipment and stilts', 'dust sheets', 'tower or scaffold hire', 'PPE and masks'] } },
  { keywords: /roof/i, info: { name: 'roofer', cis: true, items: ['tiles, felt, battens and lead', 'harnesses and fall arrest gear', 'scaffold and tower hire', 'ladders and roof ladders', 'PPE'] } },
  { keywords: /join|carpenter|carpentry/i, info: { name: 'joiner', cis: true, items: ['timber and sheet materials', 'ironmongery and fixings', 'power tools and blades', 'dust extraction', 'workshop costs'] } },
  { keywords: /decorat|paint/i, info: { name: 'decorator', cis: false, items: ['paint, fillers and sundries', 'brushes, rollers and trays', 'dust sheets', 'sanding and spray gear', 'access towers'] } },
  { keywords: /tile|tiling/i, info: { name: 'tiler', cis: false, items: ['tiles, adhesive and grout', 'trims and levelling systems', 'cutters and mixing kit', 'knee pads and PPE', 'access hire'] } },
  { keywords: /gas/i, info: { name: 'gas engineer', cis: false, items: ['parts and fittings', 'flue gas analyser and calibration', 'Gas Safe registration', 'tools and standards', 'van racking'] } },
  { keywords: /scaffold/i, info: { name: 'scaffolder', cis: true, items: ['tube, fittings and boards', 'harnesses and PPE', 'transport of materials', 'CISRS card and training', 'vehicle and trailer costs'] } },
  { keywords: /groundwork|grounds/i, info: { name: 'groundworker', cis: true, items: ['aggregates, concrete and drainage', 'plant and digger hire', 'fuel for plant', 'setting out kit', 'site welfare and PPE'] } },
  { keywords: /landscap|garden/i, info: { name: 'landscaper', cis: false, items: ['plants, turf and aggregates', 'paving and materials', 'mowers and machinery', 'green waste and tip fees', 'fuel and servicing'] } },
  { keywords: /hairdress|barber|salon/i, info: { name: 'hairdresser', cis: false, items: ['products and colour', 'scissors and clippers', 'chair or booth rent', 'gowns and towels', 'insurance and training'] } },
  { keywords: /cleaner|cleaning/i, info: { name: 'cleaner', cis: false, items: ['cleaning products', 'vacuums and equipment', 'mileage between jobs', 'gloves and PPE', 'insurance and DBS'] } },
  { keywords: /driver|courier|taxi|delivery|uber|deliveroo/i, info: { name: 'driver', cis: false, items: ['fuel or mileage', 'vehicle servicing', 'licensing and badges', 'phone and apps', 'insurance'] } },
  { keywords: /beautician|nail|lash|aesthetic/i, info: { name: 'beautician', cis: false, items: ['products and consumables', 'kit, lamps and tools', 'couch or room hire', 'PPE and sanitiser', 'insurance and training'] } },
  { keywords: /photograph/i, info: { name: 'photographer', cis: false, items: ['cameras and lenses', 'editing software', 'studio or location hire', 'travel to shoots', 'website and insurance'] } },
  { keywords: /personal train|fitness|gym instructor/i, info: { name: 'personal trainer', cis: false, items: ['equipment and weights', 'gym or studio hire', 'app subscriptions', 'insurance and quals', 'branded kit'] } },
  { keywords: /tutor|teacher|teaching/i, info: { name: 'tutor', cis: false, items: ['books and resources', 'printing and materials', 'room or platform hire', 'travel to students', 'DBS and memberships'] } },
  { keywords: /design|freelanc|developer|copywriter|writer|creative/i, info: { name: 'freelancer', cis: false, items: ['software subscriptions', 'laptop and equipment', 'website and hosting', 'home or co-working', 'training and assets'] } },
];

export function matchTrade(text: string): TradeInfo | null {
  for (const t of TRADES) {
    if (t.keywords.test(text)) return t.info;
  }
  return null;
}

const STEPS: { title: string; body: string }[] = [
  { title: 'Register and get your UTR', body: 'First time only. Tell HMRC you are self employed by registering for Self Assessment. They post you a Unique Taxpayer Reference, your UTR, which can take 2 to 3 weeks, so do it early. You also set up a Government Gateway login.' },
  { title: 'Gather your numbers', body: 'Your UTR and Gateway login, your National Insurance number, your total income for the year, your total expenses, and any other income such as a job. If you keep your records with me, these totals are already added up.' },
  { title: 'Log in and start the return', body: 'Sign in to the HMRC Self Assessment service. Pick the tax year. The return is the SA100 main form plus the self employment pages, the SA103. The website asks simple questions and picks the right version.' },
  { title: 'Fill in your self employment pages', body: 'Enter what your business does, your turnover before expenses, and your allowable expenses. If your self employed income is under £1,000 you may not need to report it, and can claim the flat £1,000 trading allowance instead.' },
  { title: 'Add other income, let HMRC do the maths', body: 'Add a PAYE job from your P60, savings interest, or dividends. The return works out your tax and National Insurance for you. You do not do the sums by hand.' },
  { title: 'Check, submit, save the proof', body: 'Review the figures against your records. When it looks right, submit. HMRC confirms on screen straight away. Save that confirmation.' },
  { title: 'Pay what you owe by 31 January', body: 'Pay your bill by 31 January. If it is over £1,000 you usually also make payments on account towards next year, half by 31 January and half by 31 July. Set the money aside as you go.' },
];

const UNIVERSAL = [
  'materials and stock',
  'tools and equipment',
  'vehicle costs or mileage',
  'protective clothing and PPE',
  'phone and broadband, the business share',
  'insurance and trade body fees',
  'a share of your home costs',
  'bookkeeping software, including Lekhio',
];

// 7 steps, then a claims card, then a closing card.
export function totalCards(): number {
  return STEPS.length + 2;
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export function cardText(idx: number, trade: TradeInfo | null): string {
  // Steps 1 to 7.
  if (idx >= 0 && idx < STEPS.length) {
    const s = STEPS[idx];
    return `Step ${idx + 1} of ${STEPS.length}. ${s.title}.\n\n${s.body}\n\nReply NEXT to carry on, or STOP to finish.`;
  }

  // Claims card.
  if (idx === STEPS.length) {
    const lines = ['What you can claim.', '', 'Every trade:'];
    for (const u of UNIVERSAL) lines.push(`• ${u}`);
    if (trade) {
      lines.push('', `As ${article(trade.name)} ${trade.name}, also:`);
      for (const it of trade.items) lines.push(`• ${it}`);
      if (trade.cis) {
        lines.push('', 'You are in construction, so under the CIS tax is taken off your pay at source. You still file, and that tax comes off your bill or is refunded. Keep your CIS statements.');
      }
    }
    lines.push('', 'Reply NEXT for the deadlines and to finish.');
    return lines.join('\n');
  }

  // Closing card.
  return [
    'Last thing, the deadlines for 2025/26.',
    '',
    '• Register by 5 Oct 2026, if it is your first return.',
    '• File online and pay by 31 Jan 2027. Miss it and it is an automatic £100 penalty.',
    '• Mileage on your 2025/26 return is 45p a mile for the first 10,000 business miles. It rises to 55p from 2026/27, which is what I use when you log a trip today.',
    '',
    'Heads up, from April 2026 if you turn over more than £50,000 you move to Making Tax Digital, four short updates a year instead of one return. I keep you ready for it.',
    '',
    `File at the official HMRC service: ${HMRC_URL}`,
    '',
    'Want a nudge before the deadline? Open the Lekhio app, go to Diary, and switch reminders on.',
    '',
    'That is the whole job. You have got this. 👍',
  ].join('\n');
}
