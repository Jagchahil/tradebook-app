// Trade specific landing page content. One entry per trade, used to generate a
// static page at /for/<slug>. Pure data, no AI, no network. The claims lists are
// general allowable expenses for that trade, in plain English.

export interface Trade {
  slug: string;
  name: string; // singular, capitalised, e.g. Electrician
  plural: string; // lowercase plural, e.g. electricians
  emoji: string;
  blurb: string; // hero sub line
  claims: string[]; // common allowable costs for this trade
  cis: boolean; // construction trade, CIS relevant
}

export const TRADES: Trade[] = [
  {
    slug: 'electricians',
    name: 'Electrician',
    plural: 'electricians',
    emoji: '⚡',
    blurb: 'Snap a receipt at the wholesaler, log a job from the van, and let Lekhio keep you ready for tax. All on WhatsApp.',
    claims: ['Cable, fittings and consumables', 'Test equipment and tools', 'Van running costs or 55p a mile', 'NICEIC or NAPIT registration', 'Part P and test certification', 'Public liability insurance'],
    cis: true,
  },
  {
    slug: 'plumbers',
    name: 'Plumber',
    plural: 'plumbers',
    emoji: '🔧',
    blurb: 'Photograph the merchant receipt, log the boiler job, and your books are done as you work. No laptop, no spreadsheets.',
    claims: ['Pipe, fittings and parts', 'Tools and test kit', 'Van costs or simplified mileage', 'Gas Safe registration', 'Public liability insurance', 'Workwear and protective gear'],
    cis: true,
  },
  {
    slug: 'builders',
    name: 'Builder',
    plural: 'builders',
    emoji: '🧱',
    blurb: 'Materials, labour, subbies and CIS, all logged from a text. Lekhio keeps the lot straight and tax ready.',
    claims: ['Materials, blocks, cement, timber', 'Plant and tool hire', 'Subcontractor payments and CIS', 'Skip hire and waste', 'Van and fuel or mileage', 'Site insurance and PPE'],
    cis: true,
  },
  {
    slug: 'plasterers',
    name: 'Plasterer',
    plural: 'plasterers',
    emoji: '🪣',
    blurb: 'Bags, beads and boards logged in seconds. Lekhio sorts your costs and keeps you ready for the quarterly update.',
    claims: ['Plaster, beads and boards', 'Tools, trowels and mixers', 'Van costs or 55p a mile', 'Protective clothing', 'Public liability insurance', 'Materials and consumables'],
    cis: true,
  },
  {
    slug: 'roofers',
    name: 'Roofer',
    plural: 'roofers',
    emoji: '🏠',
    blurb: 'Tiles, felt and scaffolding logged from the ground. Lekhio keeps your books tidy and your tax prepared.',
    claims: ['Tiles, felt and lead', 'Scaffolding and access hire', 'Tools and safety harness', 'Van and fuel or mileage', 'CIS on subcontract work', 'Insurance and PPE'],
    cis: true,
  },
  {
    slug: 'joiners',
    name: 'Joiner',
    plural: 'joiners',
    emoji: '🪚',
    blurb: 'Timber, fixings and tools logged by text. Lekhio does the bookkeeping so you stay on the tools.',
    claims: ['Timber, sheet goods and fixings', 'Power tools and blades', 'Workshop or unit rent', 'Van costs or mileage', 'Tool insurance', 'Protective gear'],
    cis: true,
  },
  {
    slug: 'painters-and-decorators',
    name: 'Painter and decorator',
    plural: 'painters and decorators',
    emoji: '🎨',
    blurb: 'Paint, sundries and dust sheets logged in a tap. Lekhio keeps you organised and ready for tax.',
    claims: ['Paint, sundries and dust sheets', 'Brushes, rollers and tools', 'Van costs or 55p a mile', 'Overalls and protective gear', 'Public liability insurance', 'Materials and consumables'],
    cis: true,
  },
  {
    slug: 'gas-engineers',
    name: 'Gas engineer',
    plural: 'gas engineers',
    emoji: '🔥',
    blurb: 'Parts, test gear and Gas Safe, all logged from the van. Lekhio keeps your books and tax in order.',
    claims: ['Boiler parts and consumables', 'Flue gas analyser and test kit', 'Gas Safe registration', 'Van costs or mileage', 'Tools and calibration', 'Public liability insurance'],
    cis: false,
  },
  {
    slug: 'gardeners',
    name: 'Gardener',
    plural: 'gardeners',
    emoji: '🌿',
    blurb: 'Fuel, green waste and kit logged in seconds. Lekhio keeps your records straight so tax is no stress.',
    claims: ['Petrol for mowers and tools', 'Green waste removal', 'Plants, seed and compost', 'Tools and machinery', 'Van costs or 55p a mile', 'Protective gear'],
    cis: false,
  },
  {
    slug: 'cleaners',
    name: 'Cleaner',
    plural: 'cleaners',
    emoji: '🧽',
    blurb: 'Products, mileage and kit logged by text. Lekhio sorts your costs and keeps you ready for tax.',
    claims: ['Cleaning products and supplies', 'Equipment and machines', 'Mileage between jobs', 'Uniform with your logo', 'Public liability insurance', 'Phone and booking apps'],
    cis: false,
  },
  {
    slug: 'mobile-hairdressers',
    name: 'Mobile hairdresser',
    plural: 'mobile hairdressers',
    emoji: '✂️',
    blurb: 'Stock, mileage and kit logged in a tap. Lekhio keeps the books while you keep your clients happy.',
    claims: ['Colour, product and stock', 'Scissors, dryers and tools', 'Mileage to clients', 'Insurance', 'Phone and booking system', 'Training that updates your skills'],
    cis: false,
  },
  {
    slug: 'drivers',
    name: 'Self employed driver',
    plural: 'drivers',
    emoji: '🚚',
    blurb: 'Fuel, tolls and vehicle costs logged from the cab. Lekhio keeps you ready for tax with no paperwork.',
    claims: ['Fuel or simplified mileage', 'Insurance and road tax', 'Vehicle servicing and repairs', 'Parking and tolls', 'Phone and platform fees', 'Cleaning and consumables'],
    cis: false,
  },
];

export function tradeBySlug(slug: string): Trade | undefined {
  return TRADES.find((t) => t.slug === slug);
}
