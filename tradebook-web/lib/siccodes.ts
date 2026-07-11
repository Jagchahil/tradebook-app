// UK SIC 2007 codes, mapped to the trades Lekhio serves, so the register flow can
// recommend the right code from a plain description of what someone does. A
// limited company must give Companies House at least one SIC code. Sole traders
// do not need one, but many like to know it. Codes verified against the ONS SIC
// 2007 condensed list.

export interface TradeSic {
  trade: string;
  code: string;
  label: string;
  keywords: string[];
  alt?: { code: string; label: string }; // a common secondary code
}

export const TRADE_SIC: TradeSic[] = [
  { trade: 'Electrician', code: '43210', label: 'Electrical installation', keywords: ['electric', 'electrical', 'sparky', 'rewire', 'wiring', 'ev charger', 'pat'] },
  { trade: 'Plumber, heating or gas', code: '43220', label: 'Plumbing, heat and air conditioning installation', keywords: ['plumb', 'plumber', 'heating', 'boiler', 'gas', 'bathroom', 'central heating', 'radiator'] },
  { trade: 'Plasterer', code: '43310', label: 'Plastering', keywords: ['plaster', 'plasterer', 'render', 'rendering', 'skim', 'skimming'] },
  { trade: 'Joiner or carpenter', code: '43320', label: 'Joinery installation', keywords: ['joiner', 'joinery', 'carpenter', 'carpentry', 'kitchen fitter', 'kitchen', 'wardrobe', 'stairs', 'doors'] },
  { trade: 'Tiler or flooring', code: '43330', label: 'Floor and wall covering', keywords: ['tiler', 'tiling', 'tiles', 'floor', 'flooring', 'carpet', 'laminate', 'lvt', 'wall covering'] },
  { trade: 'Painter and decorator', code: '43341', label: 'Painting', keywords: ['painter', 'painting', 'decorator', 'decorating'] },
  { trade: 'Glazier or windows', code: '43342', label: 'Glazing', keywords: ['glazier', 'glazing', 'window', 'windows', 'double glazing', 'glass'] },
  { trade: 'Roofer', code: '43910', label: 'Roofing activities', keywords: ['roof', 'roofer', 'roofing', 'guttering', 'fascia', 'leadwork'] },
  { trade: 'Builder or bricklayer', code: '41202', label: 'Construction of domestic buildings', keywords: ['builder', 'building', 'brick', 'bricklayer', 'bricklaying', 'extension', 'construction', 'block'], alt: { code: '43999', label: 'Other specialised construction' } },
  { trade: 'Groundworker or drainage', code: '43120', label: 'Site preparation', keywords: ['groundwork', 'ground work', 'site prep', 'digger', 'excavation', 'drainage', 'foundations', 'drains'] },
  { trade: 'Demolition', code: '43110', label: 'Demolition', keywords: ['demolition', 'demolish', 'strip out', 'soft strip'] },
  { trade: 'Scaffolder', code: '43999', label: 'Other specialised construction', keywords: ['scaffold', 'scaffolder', 'scaffolding'] },
  { trade: 'Landscaper or gardener', code: '81300', label: 'Landscape service activities', keywords: ['landscap', 'garden', 'gardener', 'grounds', 'turf', 'fencing', 'paving', 'patio', 'decking'] },
  { trade: 'Cleaner', code: '81210', label: 'General cleaning of buildings', keywords: ['clean', 'cleaner', 'cleaning', 'end of tenancy'], alt: { code: '81220', label: 'Other building and industrial cleaning' } },
  { trade: 'Handyman or property maintenance', code: '43390', label: 'Other building completion and finishing', keywords: ['handyman', 'handy man', 'maintenance', 'odd job', 'property maintenance', 'repairs', 'fixing'] },
  { trade: 'Hairdresser, barber or beauty', code: '96020', label: 'Hairdressing and other beauty treatment', keywords: ['hair', 'hairdresser', 'barber', 'beauty', 'nails', 'salon', 'lashes'] },
  { trade: 'Driver, courier or haulage', code: '49410', label: 'Freight transport by road', keywords: ['driver', 'courier', 'delivery', 'haulage', 'transport', 'van driver', 'removals'] },
  { trade: 'Mechanic or vehicle repair', code: '45200', label: 'Maintenance and repair of motor vehicles', keywords: ['mechanic', 'car repair', 'garage', 'mot', 'vehicle', 'bodywork'] },
  { trade: 'Window cleaner', code: '81220', label: 'Other building and industrial cleaning', keywords: ['window clean', 'window cleaner', 'gutter clean', 'pressure wash'] },
  // Beyond the trades. Lekhio is for everyone self employed, so the recommender is too.
  { trade: 'Tutor or teacher', code: '85590', label: 'Other education', keywords: ['tutor', 'tutoring', 'teacher', 'teaching', 'lessons', 'music teacher', 'driving instructor'] },
  { trade: 'Photographer or videographer', code: '74201', label: 'Portrait photographic activities', keywords: ['photographer', 'photography', 'photo', 'videographer', 'video', 'wedding photo'] },
  { trade: 'Personal trainer or fitness', code: '85510', label: 'Sports and recreation education', keywords: ['personal trainer', 'fitness', 'gym instructor', 'yoga', 'pilates', 'sports coach'] },
  { trade: 'Consultant or coach', code: '70229', label: 'Management consultancy', keywords: ['consultant', 'consulting', 'coach', 'advisor', 'adviser', 'business coach'] },
  { trade: 'Online seller or ecommerce', code: '47910', label: 'Retail sale via mail order or internet', keywords: ['online seller', 'ecommerce', 'etsy', 'ebay', 'amazon seller', 'shopify', 'reseller', 'dropship'] },
  { trade: 'Childminder or carer', code: '88910', label: 'Child day-care activities', keywords: ['childminder', 'childcare', 'child care', 'nanny', 'carer', 'care worker'] },
  { trade: 'Pet care or dog walker', code: '96090', label: 'Other service activities', keywords: ['dog walker', 'dog walking', 'pet', 'pet sitting', 'dog groomer', 'grooming'] },
  { trade: 'Virtual assistant or admin', code: '82990', label: 'Other business support services', keywords: ['virtual assistant', 'admin', 'typing', 'data entry', 'pa'] },
  { trade: 'Marketing or social media', code: '73110', label: 'Advertising agencies', keywords: ['marketing', 'social media', 'content creator', 'influencer', 'seo', 'ads'] },
  { trade: 'Web or software developer', code: '62012', label: 'Business and domestic software development', keywords: ['developer', 'web developer', 'software', 'programmer', 'coder', 'it support', 'web design'] },
  { trade: 'Taxi or private hire driver', code: '49320', label: 'Taxi operation', keywords: ['taxi', 'private hire', 'uber', 'cab', 'chauffeur'] },
  { trade: 'Mobile catering or food', code: '56103', label: 'Take-away and mobile food stands', keywords: ['catering', 'food van', 'street food', 'burger van', 'coffee van', 'baker', 'cakes'] },
  { trade: 'Bookkeeper or accountant', code: '69202', label: 'Bookkeeping activities', keywords: ['bookkeeper', 'bookkeeping', 'accountant', 'accounts', 'payroll'] },
  { trade: 'Other specialised trade', code: '43999', label: 'Other specialised construction', keywords: ['other', 'not sure', 'general'] },
];

// Best-match SIC suggestions from a free-text description. Returns up to `limit`
// trades, best first. Always returns at least the generic fallback so the user
// is never left with nothing.
export function findSic(query: string, limit = 3): TradeSic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = TRADE_SIC.map((t) => {
    let score = 0;
    if (t.trade.toLowerCase().includes(q)) score += 5;
    for (const k of t.keywords) {
      if (q.includes(k)) score += k.length >= 5 ? 3 : 2;
      else if (k.includes(q) && q.length >= 3) score += 1;
    }
    return { t, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.t);

  if (scored.length === 0) {
    return [TRADE_SIC[TRADE_SIC.length - 1]]; // the generic fallback
  }
  return scored.slice(0, limit);
}
