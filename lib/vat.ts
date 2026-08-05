// ═══════════════════════════════════════════════════════════════════════════════════════════════
// VAT. The whole of it, in one file.
//
// 🔴 READ THIS BEFORE YOU ADD 20% TO ANYTHING.
//
// The single most common invoice this product's audience sends is a VAT registered subcontractor
// invoicing a main contractor for construction work. On that invoice the supplier charges NO VAT
// AT ALL. The customer accounts for it instead. That is the CIS domestic reverse charge, VAT Act
// 1994 section 55A, in force since 1 March 2021.
//
// So the naive change, "invoices are hardcoded to tax: 0, let us add the standard rate", makes
// this audience's most common invoice WORSE than leaving it alone. Everything below exists so that
// the decision is made properly, from facts, and written down with its source.
//
// ⚠️ ZERO IMPORTS, ON PURPOSE. A lib module a test loads directly may not import another lib
// module: Node's type stripping cannot resolve an extensionless relative import. So the few
// constants that also live in lib/taxengine.ts are re-declared here and pinned equal by
// test/vat.test.mjs, the same discipline lib/persona.ts uses. If you change one, the build fails
// until you change the other.
//
// ⚠️ WHAT THIS FILE IS NOT. It does not file anything. lib/hmrc.ts requests
// 'read:self-assessment write:self-assessment' and nothing else: there is no MTD for VAT here, no
// VAT return is submitted, and no screen may ever imply otherwise. We PREPARE. He APPROVES. And
// for VAT he still submits it himself, through whatever he uses today.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── Rates and limits ───────────────────────────────────────────────────────────────────────────
// Sources on each line. Every one of these is checkable against GOV.UK today.

// The standard rate. VATA 1994 s2(1).
export const VAT_STANDARD_RATE = 0.2;
// The reduced rate. VATA 1994 s29A and Schedule 7A. Domestic fuel and power, mobility aids for the
// elderly, certain residential conversions and renovations, energy saving materials.
export const VAT_REDUCED_RATE = 0.05;
// Zero rate. VATA 1994 s30 and Schedule 8. New build housing is the one this audience meets.
export const VAT_ZERO_RATE = 0;

// https://www.gov.uk/how-vat-works/vat-thresholds
export const VAT_REGISTRATION_THRESHOLD = 90000;
export const VAT_DEREGISTRATION_THRESHOLD = 88000;

// https://www.gov.uk/vat-flat-rate-scheme/eligibility and /join-or-leave-the-scheme
export const FLAT_RATE_JOIN_LIMIT = 150000;
export const FLAT_RATE_LEAVE_LIMIT = 230000;
// The limited cost trader rate. A business whose goods cost less than 2% of turnover, or less than
// £1,000 a year, pays this whatever its trade sector would otherwise give it.
export const FLAT_RATE_LIMITED_COST = 0.165;
// One percentage point off in the first year of registration. VAT Notice 733.
export const FLAT_RATE_FIRST_YEAR_DISCOUNT = 0.01;

// Reg 111, VAT Regulations 1995. What he can reclaim on things he already owned when he registered.
export const REG_111_GOODS_YEARS = 4;
export const REG_111_SERVICES_MONTHS = 6;

// ── Types ──────────────────────────────────────────────────────────────────────────────────────

// What rate a line of work carries. 'exempt' and 'outside' both charge nothing, and they are NOT
// the same thing: exempt supplies count against partial exemption, outside the scope supplies do
// not. We keep them apart because the difference is real, even though today nothing downstream
// treats them differently.
export type VatRateKey = 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside';

export type VatScheme = 'standard' | 'flat_rate' | 'cash' | 'annual';

// How an invoice treats VAT. Three states, and they are decided, never guessed.
//   none           he is not VAT registered, so the invoice shows no VAT anywhere.
//   charged        the ordinary case. VAT is added and he collects it.
//   reverse_charge the CIS domestic reverse charge. He charges nothing and says so.
export type VatTreatment = 'none' | 'charged' | 'reverse_charge';

export interface VatProfile {
  registered: boolean;
  // The VAT registration number, digits only, no GB prefix. Null until he gives it.
  vrn: string | null;
  // YYYY-MM-DD. The anchor the whole Reg 111 lookback hangs off, which is why asking "are you VAT
  // registered, and when did you register?" and storing a boolean was never going to be enough.
  registeredOn: string | null;
  scheme: VatScheme;
  // Only meaningful on the flat rate scheme. The sector percentage HMRC gave him.
  flatRatePercent: number | null;
  flatRateFirstYear: boolean;
  // Does he do construction work reported under CIS? This is what makes the reverse charge
  // question worth asking on an invoice, and what keeps it off every other trade's invoice.
  cisSubcontractor: boolean;
  deregisteredOn: string | null;
}

export const EMPTY_VAT_PROFILE: VatProfile = {
  registered: false,
  vrn: null,
  registeredOn: null,
  scheme: 'standard',
  flatRatePercent: null,
  flatRateFirstYear: false,
  cisSubcontractor: false,
  deregisteredOn: null,
};

// ── Money ──────────────────────────────────────────────────────────────────────────────────────
// Everything works in pence. The free invoice generator computes VAT as `sub * (rate / 100)` and
// lets the float through to the total, which is how £41.30 at 20% becomes 8.259999999999998. On a
// document a customer pays from, that is not a rounding style, it is a wrong number.

function pence(pounds: number): number {
  return Math.round((Number(pounds) || 0) * 100);
}

function money(p: number): number {
  return Math.round(p) / 100;
}

// The VAT on a net amount, rounded to the penny, half up. HMRC permits rounding down on an invoice
// to a VAT registered customer, but half up is what every accounting package does and it is the
// one a customer checking on his phone will get.
export function vatOn(net: number, rate: number): number {
  return money(pence(net) * (Number(rate) || 0));
}

// The VAT inside a gross amount. This is the one a receipt needs: a till slip says £41.30 and the
// VAT is already in it.
export function vatFromGross(gross: number, rate: number): number {
  const r = Number(rate) || 0;
  if (r <= 0) return 0;
  return money((pence(gross) * r) / (1 + r));
}

export function netFromGross(gross: number, rate: number): number {
  return money(pence(gross) - pence(vatFromGross(gross, rate)));
}

export function rateFor(key: VatRateKey): number {
  if (key === 'standard') return VAT_STANDARD_RATE;
  if (key === 'reduced') return VAT_REDUCED_RATE;
  return 0;
}

export function rateLabel(key: VatRateKey): string {
  if (key === 'standard') return '20%';
  if (key === 'reduced') return '5%';
  if (key === 'zero') return '0%';
  if (key === 'exempt') return 'Exempt';
  return 'Outside the scope';
}

export function isVatRateKey(v: unknown): v is VatRateKey {
  return v === 'standard' || v === 'reduced' || v === 'zero' || v === 'exempt' || v === 'outside';
}

export function isVatScheme(v: unknown): v is VatScheme {
  return v === 'standard' || v === 'flat_rate' || v === 'cash' || v === 'annual';
}

// ── The registration number ────────────────────────────────────────────────────────────────────
// A UK VRN is nine digits and carries its own check digits, so a typo is catchable without asking
// anybody. Two algorithms are in use: the original modulus 97, and the "9755" variant used for
// numbers issued from late 2010. A number is well formed if either check passes.
//
// ⚠️ THIS PROVES THE SHAPE, NOT THE MAN. A number that passes here may still belong to somebody
// else or to nobody. We never say "verified", only that it looks right, because we do not check it
// against HMRC and pretending otherwise would be the same class of claim as implying recognition.

export function normaliseVrn(input: unknown): string | null {
  const raw = String(input ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const digits = raw.startsWith('GB') ? raw.slice(2) : raw;
  if (!/^[0-9]{9}$/.test(digits)) return null;
  return digits;
}

export function isValidVrn(input: unknown): boolean {
  const vrn = normaliseVrn(input);
  if (!vrn) return false;

  const d = vrn.split('').map(Number);
  const check = d[7] * 10 + d[8];
  const weights = [8, 7, 6, 5, 4, 3, 2];
  let total = 0;
  for (let i = 0; i < 7; i += 1) total += d[i] * weights[i];

  const modulus = (start: number): number => {
    let n = start;
    while (n > 0) n -= 97;
    return Math.abs(n);
  };

  // 000000000 passes the arithmetic and is not a VAT number.
  if (total === 0 && check === 0) return false;

  return modulus(total) === check || modulus(total + 55) === check;
}

// How it is printed on a document. HMRC's own style is spaced in threes.
export function formatVrn(input: unknown): string | null {
  const vrn = normaliseVrn(input);
  if (!vrn) return null;
  return `GB ${vrn.slice(0, 3)} ${vrn.slice(3, 7)} ${vrn.slice(7)}`;
}

// ── The CIS domestic reverse charge ────────────────────────────────────────────────────────────
// Sources:
//   VATA 1994 s55A
//   https://www.gov.uk/guidance/vat-reverse-charge-technical-guide
//   VATREVCON31000, VATREVCON33100 (end users), VATREVCON37100 (invoices)
//
// It applies when ALL of these hold:
//   1. the supplier is VAT registered
//   2. the customer is registered for BOTH VAT and CIS
//   3. the service is within the scope of CIS
//   4. the supply is standard or reduced rated (never zero rated)
//   5. it is not a supply of staff by an employment business
//   6. the customer has NOT confirmed in writing that he is an end user or intermediary supplier
//
// ⚠️ THE END USER RULE IS THE ONE PEOPLE GET WRONG. An end user is a customer who is having the
// work done for himself rather than selling it on as part of his own construction supply. A
// developer building to keep and let is an end user; a main contractor billing it onward is not.
// The customer has to SAY SO IN WRITING. That is why we ask rather than infer: nothing we can see
// from a bank line or a name tells us.

export type ReverseChargeBlocker =
  | 'supplier_not_registered'
  | 'not_within_cis'
  | 'customer_not_vat_registered'
  | 'customer_not_cis_registered'
  | 'zero_rated'
  | 'end_user'
  | 'employment_business';

export interface ReverseChargeFacts {
  supplierRegistered: boolean;
  withinCis: boolean;
  customerVatRegistered: boolean;
  customerCisRegistered: boolean;
  customerIsEndUser: boolean;
  employmentBusinessStaff?: boolean;
  // The highest rate on the invoice. A wholly zero rated supply, a new build, is outside it.
  rateKey: VatRateKey;
}

export interface ReverseChargeVerdict {
  applies: boolean;
  because: string;
  blocker: ReverseChargeBlocker | null;
}

export function reverseChargeApplies(f: ReverseChargeFacts): ReverseChargeVerdict {
  // Ordered so the reason he reads is the one that actually decides it for him.
  if (!f.supplierRegistered) {
    return {
      applies: false,
      blocker: 'supplier_not_registered',
      because: 'You are not VAT registered, so there is no VAT on this invoice either way.',
    };
  }
  if (!f.withinCis) {
    return {
      applies: false,
      blocker: 'not_within_cis',
      because: 'This work is not construction reported under CIS, so you charge VAT the normal way.',
    };
  }
  if (f.employmentBusinessStaff) {
    return {
      applies: false,
      blocker: 'employment_business',
      because: 'Supplying workers rather than construction work is outside the reverse charge, so you charge VAT the normal way.',
    };
  }
  if (f.rateKey === 'zero') {
    return {
      applies: false,
      blocker: 'zero_rated',
      because: 'Zero rated work, a new build for instance, is outside the reverse charge. It stays zero rated.',
    };
  }
  if (f.rateKey === 'exempt' || f.rateKey === 'outside') {
    return {
      applies: false,
      blocker: 'zero_rated',
      because: 'There is no VAT on this supply, so there is nothing for the reverse charge to move.',
    };
  }
  if (!f.customerVatRegistered) {
    return {
      applies: false,
      blocker: 'customer_not_vat_registered',
      because: 'Your customer is not VAT registered, so you charge VAT the normal way.',
    };
  }
  if (!f.customerCisRegistered) {
    return {
      applies: false,
      blocker: 'customer_not_cis_registered',
      because: 'Your customer is not registered for CIS, so you charge VAT the normal way.',
    };
  }
  if (f.customerIsEndUser) {
    return {
      applies: false,
      blocker: 'end_user',
      because: 'Your customer has told you in writing that he is an end user, so you charge VAT the normal way.',
    };
  }
  return {
    applies: true,
    blocker: null,
    because: 'Construction work for a VAT and CIS registered customer who is not the end user. You charge no VAT and he accounts for it.',
  };
}

// The wording HMRC accepts. VATREVCON37100 gives three forms and we use the plainest, with the
// legal reference alongside it so an accountant on the other end recognises it at a glance.
//
// ⚠️ DO NOT REWORD THIS FOR TONE. It is the one string in the product that exists to satisfy
// somebody else's rulebook, and "reverse charge" has to appear in it.
export const REVERSE_CHARGE_WORDING =
  'Reverse charge: VAT Act 1994 Section 55A applies. Customer to pay the VAT to HMRC.';

// ── Pricing an invoice ─────────────────────────────────────────────────────────────────────────

export interface VatLineInput {
  description: string;
  // The NET amount, before VAT. This is the number he types.
  amount: number;
  rate?: VatRateKey;
}

export interface VatLine {
  description: string;
  amount: number;
  rate: VatRateKey;
  vat: number;
}

export interface PricedInvoice {
  treatment: VatTreatment;
  lines: VatLine[];
  // Total before VAT.
  subtotal: number;
  // VAT actually CHARGED. Zero under the reverse charge, and that is the whole point of it.
  vat: number;
  // What he is owed.
  total: number;
  // The VAT the CUSTOMER must account for. Shown on the document, never added to the total.
  // VATREVCON37100: "should not be included in the amount shown as total VAT charged".
  reverseChargeVat: number;
  wording: string | null;
}

export function priceInvoice(lines: VatLineInput[], treatment: VatTreatment): PricedInvoice {
  const safe = (Array.isArray(lines) ? lines : []).map((li) => {
    const key: VatRateKey = isVatRateKey(li.rate) ? li.rate : 'standard';
    // A man who is not registered has no rates on his invoice at all. Storing 'standard' against
    // his lines would be a lie waiting to be rendered the day he registers.
    const rate: VatRateKey = treatment === 'none' ? 'outside' : key;
    const amount = money(pence(li.amount));
    return {
      description: String(li.description ?? ''),
      amount,
      rate,
      vat: treatment === 'charged' ? vatOn(amount, rateFor(rate)) : 0,
    };
  });

  const subtotal = money(safe.reduce((s, li) => s + pence(li.amount), 0));
  const vat = money(safe.reduce((s, li) => s + pence(li.vat), 0));

  const reverseChargeVat =
    treatment === 'reverse_charge'
      ? money(safe.reduce((s, li) => s + pence(vatOn(li.amount, rateFor(li.rate))), 0))
      : 0;

  return {
    treatment,
    lines: safe,
    subtotal,
    vat,
    total: money(pence(subtotal) + pence(vat)),
    reverseChargeVat,
    wording: treatment === 'reverse_charge' ? REVERSE_CHARGE_WORDING : null,
  };
}

// Which treatment an invoice gets, from the profile and the three facts about this job. Kept
// separate from priceInvoice so the decision can be shown to him before the maths happens.
export function treatmentFor(profile: VatProfile, facts: Omit<ReverseChargeFacts, 'supplierRegistered'>): {
  treatment: VatTreatment;
  verdict: ReverseChargeVerdict;
} {
  const verdict = reverseChargeApplies({ ...facts, supplierRegistered: !!profile.registered });
  if (!profile.registered) return { treatment: 'none', verdict };
  return { treatment: verdict.applies ? 'reverse_charge' : 'charged', verdict };
}

// ── What a VAT invoice legally has to carry ────────────────────────────────────────────────────
// VAT Regulations 1995 reg 14. Not every field, but every field we could plausibly be missing, so
// a screen can tell him what is not there rather than printing a document that is short of it.

export interface InvoiceDocumentFacts {
  supplierName: string | null;
  supplierAddress: string | null;
  supplierVrn: string | null;
  number: string | null;
  taxPoint: string | null;
  customerName: string | null;
  hasLineDescriptions: boolean;
  hasRates: boolean;
  hasTotals: boolean;
}

export interface DocumentGap {
  field: string;
  says: string;
}

export function vatInvoiceGaps(f: InvoiceDocumentFacts): DocumentGap[] {
  const gaps: DocumentGap[] = [];
  if (!f.supplierName) gaps.push({ field: 'name', says: 'Your business name is missing.' });
  if (!f.supplierAddress) gaps.push({ field: 'address', says: 'Your address is missing. A VAT invoice has to carry it.' });
  if (!f.supplierVrn) gaps.push({ field: 'vrn', says: 'Your VAT number is missing. Add it once in your settings and it goes on every invoice.' });
  if (!f.number) gaps.push({ field: 'number', says: 'The invoice number is missing.' });
  if (!f.taxPoint) gaps.push({ field: 'taxPoint', says: 'The date of supply is missing.' });
  if (!f.customerName) gaps.push({ field: 'customer', says: "Your customer's name is missing." });
  if (!f.hasLineDescriptions) gaps.push({ field: 'lines', says: 'A description of the work is missing.' });
  if (!f.hasRates) gaps.push({ field: 'rates', says: 'The VAT rate on each line is missing.' });
  if (!f.hasTotals) gaps.push({ field: 'totals', says: 'The totals before and after VAT are missing.' });
  return gaps;
}

// ── Input tax: what he can and cannot get back ─────────────────────────────────────────────────
// The VAT (Input Tax) Order 1992. Two hard blocks and a handful of things that carry no VAT to
// reclaim in the first place, which is a different fact and worth saying differently.
//
// ⚠️ THIS NEVER REFUSES A COST. Everything here is still deductible for income tax. The question
// is only whether the VAT on it comes back, and getting that wrong is a penalty on an inspection.

export type InputVatVerdict = 'reclaimable' | 'blocked' | 'no_vat' | 'depends';

export interface InputVatNote {
  verdict: InputVatVerdict;
  says: string;
  source: string;
}

const INPUT_VAT: Record<string, InputVatNote> = {
  meals: {
    verdict: 'depends',
    says: 'If this was your own meal while working away, the VAT comes back. If it was entertaining a customer, it does not.',
    source: 'VAT (Input Tax) Order 1992 art 5; VIT43200 business entertainment',
  },
  wages: {
    verdict: 'no_vat',
    says: 'Wages are outside the scope of VAT, so there is none to reclaim.',
    source: 'VATA 1994 s4, supply in the course of business',
  },
  insurance: {
    verdict: 'no_vat',
    says: 'Insurance is exempt, so there is no VAT on it to reclaim. The premium may carry Insurance Premium Tax, which is not VAT and never comes back.',
    source: 'VATA 1994 Sch 9 Group 2',
  },
  'bank charges': {
    verdict: 'no_vat',
    says: 'Most bank charges are exempt from VAT, so there is none to reclaim.',
    source: 'VATA 1994 Sch 9 Group 5',
  },
  'mortgage interest': {
    verdict: 'no_vat',
    says: 'Interest is exempt from VAT, so there is none to reclaim.',
    source: 'VATA 1994 Sch 9 Group 5',
  },
  rent: {
    verdict: 'depends',
    says: 'Rent on commercial premises only carries VAT if the landlord has opted to tax. Check the invoice: if it shows no VAT, there is none to reclaim.',
    source: 'VATA 1994 Sch 10, option to tax',
  },
  subcontractor: {
    verdict: 'depends',
    says: 'If his invoice says reverse charge, he charged you no VAT and you account for it yourself. There is nothing to reclaim as input tax on that line in the ordinary way.',
    source: 'VATA 1994 s55A',
  },
  van: {
    verdict: 'reclaimable',
    says: 'A van is a commercial vehicle, so unlike a car the VAT on it does come back.',
    source: 'VAT (Input Tax) Order 1992 art 7, which blocks cars and not vans',
  },
  fuel: {
    verdict: 'depends',
    says: 'Fuel VAT comes back in full only if there is no private use. Otherwise you either apportion it or pay the fuel scale charge.',
    source: 'VAT Notice 700/64; VATA 1994 s57 road fuel scale charges',
  },
  training: {
    verdict: 'depends',
    says: 'Most commercial training carries VAT and it comes back. Training from a college or university is often exempt, so check the invoice.',
    source: 'VATA 1994 Sch 9 Group 6',
  },
};

// The one HMRC blocks outright and people still try. There is no 'entertainment' category in
// lib/categories.ts, deliberately, so this is reached by the word rather than by a category.
export const ENTERTAINMENT_BLOCK: InputVatNote = {
  verdict: 'blocked',
  says: 'Entertaining customers is blocked for VAT. The cost may still come off your profit in some cases, but the VAT never comes back.',
  source: 'VAT (Input Tax) Order 1992 art 5; VIT43200',
};

export const CAR_BLOCK: InputVatNote = {
  verdict: 'blocked',
  says: 'The VAT on buying a car is blocked unless it is genuinely never available for private use, which in practice means a taxi, a driving school car or a hire car. A van is different and the VAT on that does come back.',
  source: 'VAT (Input Tax) Order 1992 art 7',
};

const CAR_WORDS = /\b(car|saloon|hatchback|estate car|bmw|audi|mercedes|tesla)\b/i;
const ENTERTAINING_WORDS = /\b(entertain|entertaining|entertainment|client lunch|client dinner|hospitality|corporate box)\b/i;

// What to tell him about the VAT on one cost. Null means nothing worth saying, which is most of
// them: doc 103's empty test applies here as much as anywhere.
export function inputVatNote(category: unknown, text?: unknown): InputVatNote | null {
  const blob = String(text ?? '');
  if (ENTERTAINING_WORDS.test(blob)) return ENTERTAINMENT_BLOCK;
  if (CAR_WORDS.test(blob) && !/\bvan\b/i.test(blob)) return CAR_BLOCK;
  const key = String(category ?? '').trim().toLowerCase();
  return INPUT_VAT[key] ?? null;
}

export const INPUT_VAT_RULE_COUNT = Object.keys(INPUT_VAT).length;

// ── The position ───────────────────────────────────────────────────────────────────────────────
// Output tax minus input tax, for a period. PREPARED, never sent: there is no MTD for VAT in this
// codebase and nothing here submits anything to anybody.

export interface VatPositionInput {
  profile: VatProfile;
  // VAT he has charged, from his own invoices.
  outputVat: number;
  // VAT on what he bought, only where he has confirmed it.
  inputVat: number;
  // VAT inclusive turnover, for the flat rate calculation.
  grossTurnover: number;
  // What he has bought that carries VAT he cannot reclaim, so the screen can say why.
  blockedVat: number;
  // How much of the input tax has a receipt behind it. The control doctrine: nothing is refused
  // for want of one, but every figure knows whether it has one.
  inputVatWithProof: number;
}

export interface VatPosition {
  scheme: VatScheme;
  outputVat: number;
  inputVat: number;
  blockedVat: number;
  due: number;
  // Set on the flat rate scheme, where the sum is a percentage of turnover and input tax is
  // generally not reclaimable at all.
  flatRateUsed: number | null;
  proofShare: number;
  notes: string[];
}

export function vatPosition(input: VatPositionInput): VatPosition {
  const notes: string[] = [];
  const outputVat = money(pence(Math.max(0, input.outputVat)));
  const inputVat = money(pence(Math.max(0, input.inputVat)));
  const blockedVat = money(pence(Math.max(0, input.blockedVat)));

  if (!input.profile.registered) {
    return {
      scheme: input.profile.scheme,
      outputVat: 0,
      inputVat: 0,
      blockedVat: 0,
      due: 0,
      flatRateUsed: null,
      proofShare: 1,
      notes: ['You are not VAT registered, so there is nothing to work out here.'],
    };
  }

  const withProof = money(pence(Math.max(0, input.inputVatWithProof)));
  const proofShare = inputVat > 0 ? Math.min(1, withProof / inputVat) : 1;

  if (input.profile.scheme === 'flat_rate') {
    const base = Math.min(0.165, Math.max(0, Number(input.profile.flatRatePercent) || 0) / 100);
    const rate = Math.max(0, base - (input.profile.flatRateFirstYear ? FLAT_RATE_FIRST_YEAR_DISCOUNT : 0));
    const due = money(pence(Math.max(0, input.grossTurnover)) * rate);
    notes.push('On the flat rate scheme you pay a percentage of your VAT inclusive turnover, and you do not reclaim the VAT on what you buy, apart from capital assets over £2,000.');
    if (!input.profile.flatRatePercent) {
      notes.push('We do not have your flat rate percentage yet, so this figure is not right until you add it.');
    }
    return {
      scheme: 'flat_rate',
      outputVat,
      inputVat: 0,
      blockedVat,
      due,
      flatRateUsed: rate,
      proofShare,
      notes,
    };
  }

  if (input.profile.scheme === 'cash') {
    notes.push('On cash accounting the VAT falls due when your customer pays you, not when you send the invoice.');
  }
  if (input.profile.scheme === 'annual') {
    notes.push('On the annual accounting scheme you pay instalments through the year and settle up once.');
  }
  if (blockedVat > 0) {
    notes.push('Some of the VAT you paid cannot be reclaimed, so it is not in this figure.');
  }

  return {
    scheme: input.profile.scheme,
    outputVat,
    inputVat,
    blockedVat,
    due: money(pence(outputVat) - pence(inputVat)),
    flatRateUsed: null,
    proofShare,
    notes,
  };
}

// ── Registration, and what it is worth ─────────────────────────────────────────────────────────

export function mustRegister(rolling12mTaxableTurnover: number): boolean {
  return (Number(rolling12mTaxableTurnover) || 0) > VAT_REGISTRATION_THRESHOLD;
}

export function mayDeregister(rolling12mTaxableTurnover: number): boolean {
  return (Number(rolling12mTaxableTurnover) || 0) < VAT_DEREGISTRATION_THRESHOLD;
}

export function mayJoinFlatRate(expectedTaxableTurnover: number): boolean {
  return (Number(expectedTaxableTurnover) || 0) <= FLAT_RATE_JOIN_LIMIT;
}

export function mustLeaveFlatRate(totalIncomeIncludingVat: number): boolean {
  return (Number(totalIncomeIncludingVat) || 0) > FLAT_RATE_LEAVE_LIMIT;
}

// The window Reg 111 opens. This is the promise lib/circumstances.ts has been making since 14 July
// ("going back four years"), and until now nothing could compute it because the registration date
// was asked for and thrown away.
export interface Reg111Window {
  goodsFrom: string;
  servicesFrom: string;
  registeredOn: string;
}

export function reg111Window(registeredOn: string | null | undefined): Reg111Window | null {
  const iso = String(registeredOn ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const at = Date.UTC(y, m - 1, d);
  if (!Number.isFinite(at)) return null;

  const goods = new Date(at);
  goods.setUTCFullYear(goods.getUTCFullYear() - REG_111_GOODS_YEARS);
  const services = new Date(at);
  services.setUTCMonth(services.getUTCMonth() - REG_111_SERVICES_MONTHS);

  const say = (dt: Date): string => dt.toISOString().slice(0, 10);
  return { goodsFrom: say(goods), servicesFrom: say(services), registeredOn: iso };
}

// Whether a cost falls inside the pre registration reclaim. Goods have to be STILL ON HAND at
// registration, which is a fact about his kit that no bank line can tell us, so this answers the
// date question only and the screen has to ask him the rest.
export function inReg111Window(spentOn: string, window: Reg111Window, kind: 'goods' | 'services'): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(spentOn ?? ''))) return false;
  const from = kind === 'goods' ? window.goodsFrom : window.servicesFrom;
  return spentOn >= from && spentOn < window.registeredOn;
}
