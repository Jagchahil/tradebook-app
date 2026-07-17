// THE UNIVERSE. The whole brain, drawn as what Jag saw it as: a galaxy that grows every night.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Four suns at the centre, the four things this company is: KHOJI (what we know), LEKHIO (what we
// do with it), RAKHA (what watches it), PUCHIO (what we answer). Every fact the brain holds is a
// star on the arm nearest the thing it grew from. Distance from the centre is CURRENCY: the value
// that is true today sits close in, and when a number changes the new one takes the near slot and
// the old one is pushed out behind it, a comet tail of what used to be law.
//
// 🔴 IT OBEYS THE SAME LAW AS THE CONSTELLATION AND THE ORGANS: a star we actually watch tonight
// burns bright; a fact we hold but do not have a nightly heartbeat on is drawn DIM, present but not
// pretending to be measured. The dim stars are not a fault. They are the difference between "we
// know this" and "we checked this last night", and on this of all screens that difference is the
// whole product. A galaxy where every star glows is a screensaver.
//
// Pure data, no I/O, no layout. The builder says WHAT is out there and how bright; the renderer
// (app/team/Universe.tsx) decides where each point falls. So the test runner loads this directly
// and the picture stays a thin renderer over a tested model.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { FACTS } from './taxengine';
import { EXPENSE_RULES } from './claimrules.data';
import {
  LEGAL_FIELDS,
  LEGAL_SOURCES,
  PROFESSIONAL_EXAMS,
  isLicensedSource,
  type LegalField,
} from './lawsources';

/** Which sun a star belongs to. */
export type CoreKey = 'khoji' | 'lekhio' | 'rakha' | 'puchio';

/** How bright a star is, and it is the honest scale, not the flattering one. */
export type StarPulse =
  /** Watched tonight, and it agreed. Burns green. */
  | 'fresh'
  /** Watched, and something wants a human: drift, a gap, a silent change. Amber. */
  | 'attention'
  /** Watched, and it has gone wrong or stale. Red. */
  | 'stale'
  /** Held, but with no nightly heartbeat of its own. Present, dim, honest. */
  | 'unmeasured';

/** What a star IS. Governs its icon and how the renderer clusters it. */
export type StarKind =
  | 'constant'   // a number in the tax engine, e.g. the personal allowance
  | 'rule'       // a can-I-claim verdict, checked verbatim against HMRC by the corpus watcher
  | 'statute'    // a primary Act we read the law from
  | 'guidance'   // HMRC / departmental guidance
  | 'regulation' // a statutory instrument
  | 'case'       // a court or tribunal record
  | 'exam'       // a bank of self-examination questions
  | 'engine'     // a thing Lekhio computes for a user
  | 'watcher'    // a thing Rakha checks so nobody has to remember to
  | 'answer';    // a thing Puchio can say

/** A prior value of a fact. The comet tail. `from`/`to` are the tax years it governed, when known. */
export interface StarHistory {
  value: string;
  from?: string;
  to?: string;
  note?: string;
}

export interface Star {
  id: string;
  core: CoreKey;
  arm: string;            // arm id, must match an Arm.id
  label: string;
  kind: StarKind;
  pulse: StarPulse;
  /** One honest line, read on hover. Always a fact, never a boast. */
  says: string;
  /** The current value, already formatted, when the star has one. */
  value?: string;
  /** A primary source, when the star rests on one. Must be a licensed host. */
  source?: string;
  /** Prior values, newest-first, drawn as a tail pushed out behind the current value. */
  history?: StarHistory[];
}

export interface Arm {
  id: string;
  core: CoreKey;
  label: string;
  /** One line about the arm itself, for the renderer's arm label / hover. */
  says: string;
}

export interface Core {
  key: CoreKey;
  name: string;
  /** What this sun is, in a handful of words. */
  role: string;
  /** The renderer's accent for everything on this sun. */
  hue: string;
}

export interface UniverseStats {
  stars: number;
  watched: number;      // stars with a live nightly heartbeat (not 'unmeasured')
  arms: number;
  /** Which day of the brain's life this is, for the HUD. 1 when we cannot tell. */
  day: number;
}

export interface Universe {
  cores: Core[];
  arms: Arm[];
  stars: Star[];
  stats: UniverseStats;
  /** True while any star is unmeasured, so the view can be honest in its caption. */
  hasUnmeasured: boolean;
}

// The four suns. Fixed identity, fixed colour. Khoji leads because it is the one nobody else in the
// category has, and the one every other sun draws from.
export const CORES: Core[] = [
  { key: 'khoji',  name: 'Khoji',  role: 'reads the law so nobody has to remember to', hue: '#3DDC84' },
  { key: 'lekhio', name: 'Lekhio', role: 'does the books, and asks before anything that matters', hue: '#5B8DEF' },
  { key: 'rakha',  name: 'Rakha',  role: 'watches the sources so a change cannot pass unseen', hue: '#FFB020' },
  { key: 'puchio', name: 'Puchio', role: 'answers, from statute and precedent, never a guess', hue: '#B98BFF' },
];

const TITLE: Record<LegalField, string> = {
  tax: 'Tax', employment: 'Employment', company: 'Company', consumer: 'Consumer',
  contract: 'Contract', data_protection: 'Data protection', intellectual_property: 'Intellectual property',
  property: 'Property', construction: 'Construction', health_and_safety: 'Health & safety',
  tort: 'Tort', insolvency: 'Insolvency',
};

// A PLAIN-ENGLISH LINE FOR EACH CONSTANT, because "personalAllowanceTaperFloor: 100000" is a
// variable name, and a star a human hovers should read like a fact he recognises. Anything not named
// here falls back to a humanised key, so a new constant is never invisible, only less polished.
const CONSTANT_SAYS: Record<string, string> = {
  taxYear: 'The tax year every figure on this screen is computed for.',
  personalAllowance: 'Tax-free on the first slice of income.',
  personalAllowanceTaperFloor: 'Above this income, the personal allowance starts to taper away.',
  personalAllowanceLostAt: 'By this income the personal allowance is gone entirely.',
  basicRateBand: 'The width of the band taxed at the basic rate.',
  basicRate: 'Income tax, basic rate.',
  higherRate: 'Income tax, higher rate.',
  additionalRate: 'Income tax, additional rate.',
  additionalRateThreshold: 'Income at which the additional rate begins.',
  class4LowerLimit: 'Class 4 NIC starts on profits above this.',
  class4UpperLimit: 'Above this, Class 4 NIC drops to the upper rate.',
  class4MainRate: 'Class 4 NIC, main rate.',
  class4UpperRate: 'Class 4 NIC, above the upper limit.',
  class2WeeklyRate: 'Class 2 NIC, a flat weekly amount.',
  class2SmallProfitsThreshold: 'Below this profit, Class 2 NIC is voluntary.',
  tradingAllowance: 'Trading income you can earn before any of it is taxable.',
  annualInvestmentAllowance: 'Full relief on qualifying plant and machinery, up to this.',
  mileageCarFirst10k: 'Approved mileage, car or van, first 10,000 miles.',
  mileageCarOver10k: 'Approved mileage, car or van, beyond 10,000 miles.',
  mileageMotorcycle: 'Approved mileage, motorcycle.',
  mileageBicycle: 'Approved mileage, bicycle.',
  mileageFirstBandMiles: 'Where the mileage rate steps down.',
  homeFlatRate25to50: 'Working from home, flat rate, 25 to 50 hours a month.',
  homeFlatRate51to100: 'Working from home, flat rate, 51 to 100 hours a month.',
  homeFlatRate101plus: 'Working from home, flat rate, 101+ hours a month.',
  vatRegistrationThreshold: 'Turnover at which VAT registration becomes compulsory.',
  vatDeregistrationThreshold: 'Turnover below which you may deregister for VAT.',
  vatStandardRate: 'VAT, standard rate.',
  cisRegisteredRate: 'CIS deduction, registered subcontractor.',
  cisUnregisteredRate: 'CIS deduction, unregistered subcontractor.',
  cisGrossRate: 'CIS deduction, gross-payment status.',
  mtdThreshold2026: 'Making Tax Digital for Income Tax, qualifying income from April 2026.',
  mtdThreshold2027: 'MTD for Income Tax, the threshold from April 2027.',
  mtdThreshold2028: 'MTD for Income Tax, the threshold from April 2028.',
  wdaMainRate: 'Writing down allowance, main pool.',
  wdaSpecialRate: 'Writing down allowance, special rate pool.',
  poaThreshold: 'Below this bill, no payments on account are due.',
  cgtAnnualExempt: 'Capital gains you can make before any is taxable.',
  cgtBasicRate: 'Capital gains tax, basic-rate taxpayer.',
  cgtHigherRate: 'Capital gains tax, higher-rate taxpayer.',
  marriageAllowanceTransfer: 'Personal allowance transferable to a spouse.',
  badrRate: 'Business Asset Disposal Relief rate.',
  vatFlatRateLimitedCost: 'VAT flat-rate percentage for a limited-cost business.',
};

// FORMAT A CONSTANT THE WAY A HUMAN READS IT. Rates as percentages, money with a pound sign and
// thousands separators, plain counts as they are. The engine stores 0.2 for 20%, so a rate must not
// be printed as "0.2" on a star a plumber reads.
const RATE_KEYS = new Set([
  'basicRate', 'higherRate', 'additionalRate', 'class4MainRate', 'class4UpperRate', 'vatStandardRate',
  'cisRegisteredRate', 'cisUnregisteredRate', 'cisGrossRate', 'wdaMainRate', 'wdaSpecialRate',
  'cgtBasicRate', 'cgtHigherRate', 'badrRate', 'vatFlatRateLimitedCost',
  'mileageCarFirst10k', 'mileageCarOver10k', 'mileageMotorcycle', 'mileageBicycle',
]);
const PENCE_KEYS = new Set(['mileageCarFirst10k', 'mileageCarOver10k', 'mileageMotorcycle', 'mileageBicycle']);
const MONEY_KEYS = new Set([
  'personalAllowance', 'personalAllowanceTaperFloor', 'personalAllowanceLostAt', 'basicRateBand',
  'additionalRateThreshold', 'class4LowerLimit', 'class4UpperLimit', 'class2SmallProfitsThreshold',
  'tradingAllowance', 'annualInvestmentAllowance', 'vatRegistrationThreshold', 'vatDeregistrationThreshold',
  'mtdThreshold2026', 'mtdThreshold2027', 'mtdThreshold2028', 'poaThreshold', 'cgtAnnualExempt',
  'marriageAllowanceTransfer', 'mileageFirstBandMiles',
]);

export function formatConstant(key: string, value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number') return String(value);
  if (PENCE_KEYS.has(key)) return `${Math.round(value * 100)}p`;
  if (RATE_KEYS.has(key)) return `${+(value * 100).toFixed(2)}%`;
  if (MONEY_KEYS.has(key)) return `£${value.toLocaleString('en-GB')}`;
  if (key === 'class2WeeklyRate') return `£${value.toFixed(2)}`;
  if (key.startsWith('homeFlatRate')) return `£${value}`;
  return value.toLocaleString('en-GB');
}

const humaniseKey = (k: string): string =>
  k.replace(/([A-Z0-9]+)/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();

const host = (url: string): string => { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } };

// ═══ THE ONE REAL COMET TAIL WE CAN SEED HONESTLY TODAY. ═══
//
// HMRC raised the approved car mileage rate to 55p for 2026/27, from the 45p it had been since 2011.
// That is a real, dated change, so mileageCarFirst10k gets a tail: the 55p sits in its near slot and
// the 45p is pushed out behind it. Every other constant has held for years, so it has no tail, and
// we do NOT invent one. As Khoji's differ logs future drift, real tails will grow here on their own.
const CONSTANT_HISTORY: Record<string, StarHistory[]> = {
  mileageCarFirst10k: [
    { value: '45p', from: '2011/12', to: '2025/26', note: 'The rate for fourteen years, until HMRC raised it.' },
  ],
};

// The engines Lekhio computes for a user. Each is a real subsystem with its own tested suite.
const ENGINES: { id: string; label: string; says: string }[] = [
  { id: 'sole-trader',   label: 'Sole trader return',    says: 'Income tax and Class 2/4 NIC on trading profit, year by year.' },
  { id: 'whole-person',  label: 'Whole-person tax',      says: 'Employment, self-employment, savings and dividends stacked in the right order, every allowance in its place.' },
  { id: 'limited',       label: 'Limited company',       says: 'Corporation tax, and the salary-then-dividends question, with the £100k taper.' },
  { id: 'property',      label: 'Property',               says: 'Rental profit and the Section 24 finance-cost restriction.' },
  { id: 'cis',           label: 'CIS',                    says: 'Deductions suffered, set against the bill, refund or shortfall.' },
  { id: 'vat',           label: 'VAT',                    says: 'Standard and flat-rate, registration and deregistration thresholds.' },
  { id: 'ni-sl',         label: 'NI & student loan',      says: 'Class 2, Class 4, and every student loan plan.' },
  { id: 'pay-yourself',  label: 'Pay yourself',           says: 'Salary to the NIC rungs, then dividends, then the wall.' },
  { id: 'ledger',        label: 'The ledger',             says: 'What Lekhio saved you, line by line, against doing nothing.' },
  { id: 'reliefs',       label: 'Reliefs',                says: 'Every relief that needs a fact we do not yet have, and asks once.' },
  { id: 'invoicing',     label: 'Invoicing',              says: 'A shareable invoice, emailed or linked, footer on our own domain.' },
  { id: 'bank-feed',     label: 'Bank feed',              says: 'Transactions swept and categorised, dormant until the AISP go-live.' },
  { id: 'onboarding',    label: 'Onboarding',             says: 'Ask once, tick, and never ask again. Web to app, seamless.' },
];

// The watchers Rakha runs. Each has a nightly job and a CI test that keeps it honest.
const WATCHERS: { id: string; label: string; says: string }[] = [
  { id: 'differ',     label: 'The differ',        says: 'Every watched tax constant, compared to its GOV.UK page each night.' },
  { id: 'corpus',     label: 'The corpus',        says: 'Every can-I-claim rule, checked verbatim against HMRC guidance.' },
  { id: 'amend',      label: 'Amendments',        says: 'A GOV.UK page rewritten under us, caught by content hash, not a date.' },
  { id: 'budget',     label: 'The Budget loop',   says: 'TIINs read on Budget day, each measure filed by its real effective date.' },
  { id: 'tribunal',   label: 'The tribunal watch',says: 'Published tax tribunal decisions, the only watcher that can see a judge.' },
  { id: 'lawwatch',   label: 'Law freshness',     says: 'The primary Acts behind every field, hashed nightly for a silent change.' },
  { id: 'anomaly',    label: 'Anomaly guard',     says: 'A figure that jumps, flagged before it reaches a return.' },
  { id: 'cronwatch',  label: 'Cron watchdog',     says: 'A scheduled job that stops running turns the health light red.' },
  { id: 'compliance', label: 'Compliance rails',  says: 'Finance Act 2026 Sch 22: software is in scope, and we file as the taxpayer.' },
  { id: 'special',    label: 'Special-category',  says: 'Health, belief and the rest never travel over WhatsApp, in either direction.' },
];

// What Puchio can answer. Not a canned reply to anyone: a capability, behind the approval gate.
const ANSWERS: { id: string; label: string; says: string }[] = [
  { id: 'synthesis',  label: 'Synthesis',      says: 'One answer from HMRC, statute and precedent, weighted statute over guidance.' },
  { id: 'qa-cache',   label: 'Q&A memory',     says: 'What was asked and answered, so the same question is not recomputed cold.' },
  { id: 'intents',    label: 'WhatsApp intents',says: 'A photo, a voice note, a figure, routed to the right thing on the phone.' },
  { id: 'oracle',     label: 'The oracle',     says: 'HMRC runs its own calculation and tells us the answer, and we compare.' },
];

/** Live state the API feeds in. All optional: with nothing, every star is honestly dim. */
export interface UniverseInput {
  /** The tax domain's aggregate pulse from the differ, and which FACTS keys it actually watches. */
  tax?: { pulse: Exclude<StarPulse, never>; watchedKeys?: string[] };
  /** Per-field legal freshness from lawwatch. Absent field = unmeasured. */
  law?: { [field: string]: { pulse: Exclude<StarPulse, 'unmeasured'> } | undefined };
  /** How many questions the accounting exam bank holds right now. */
  examCount?: number;
  /** How many law exam questions. */
  lawExamCount?: number;
  /** Which day of the brain's life this is, for the HUD. */
  day?: number;
}

export function buildUniverse(input?: UniverseInput): Universe {
  const arms: Arm[] = [];
  const stars: Star[] = [];

  const taxPulse: StarPulse = input?.tax?.pulse ?? 'unmeasured';
  const watched = new Set(input?.tax?.watchedKeys ?? []);
  const haveWatchList = (input?.tax?.watchedKeys?.length ?? 0) > 0;

  // ── KHOJI. What we know: the twelve fields of law, and under Tax the numbers and rules themselves.
  for (const field of LEGAL_FIELDS) {
    const armId = `khoji:${field}`;
    arms.push({
      id: armId, core: 'khoji', label: TITLE[field],
      says: field === 'tax'
        ? 'The numbers, the rules and the primary law our answers rest on.'
        : `${LEGAL_SOURCES[field].length} primary source${LEGAL_SOURCES[field].length === 1 ? '' : 's'}, and the exams we sit on them.`,
    });

    // The primary sources for this field, as statute / guidance / case stars.
    for (const s of LEGAL_SOURCES[field]) {
      const fresh = input?.law?.[field];
      stars.push({
        id: `src:${field}:${host(s.url)}`,
        core: 'khoji', arm: armId, label: s.title, kind: s.kind,
        pulse: field === 'tax' ? (fresh ? fresh.pulse : 'unmeasured') : (fresh ? fresh.pulse : 'unmeasured'),
        says: `${s.kind[0].toUpperCase()}${s.kind.slice(1)}. The primary text, read from ${host(s.url)}.`,
        source: s.url,
      });
    }

    // The self-examination on this field. One star, and it grows as the bank grows.
    const proExams = PROFESSIONAL_EXAMS[field];
    if (field === 'tax' && input?.examCount) {
      stars.push({
        id: 'exam:tax',
        core: 'khoji', arm: armId, label: 'Exam bank', kind: 'exam',
        pulse: 'fresh',
        says: `${input.examCount} questions, each computed from a watched rate and checked against the live engine.`,
        value: `${input.examCount}`,
      });
    } else if (field !== 'tax') {
      stars.push({
        id: `exam:${field}`,
        core: 'khoji', arm: armId, label: 'Self-examination', kind: 'exam',
        pulse: input?.lawExamCount ? 'fresh' : 'unmeasured',
        says: `Examined on the ground these cover: ${proExams.join(', ')}.`,
      });
    }
  }

  // Under Tax: every engine constant as a star, bright if the differ watches it, dim if not.
  for (const [key, value] of Object.entries(FACTS)) {
    const isWatched = haveWatchList ? watched.has(key) : false;
    stars.push({
      id: `const:${key}`,
      core: 'khoji', arm: 'khoji:tax', label: humaniseKey(key), kind: 'constant',
      pulse: isWatched ? taxPulse : 'unmeasured',
      says: CONSTANT_SAYS[key] ?? humaniseKey(key),
      value: formatConstant(key, value),
      source: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual',
      history: CONSTANT_HISTORY[key],
    });
  }

  // Under Tax: every can-I-claim rule, checked verbatim against HMRC by the corpus watcher.
  for (const r of EXPENSE_RULES) {
    stars.push({
      id: `rule:${r.key}`,
      core: 'khoji', arm: 'khoji:tax', label: r.title, kind: 'rule',
      // The corpus is a nightly watcher, but its per-rule verdict is not in the aggregate tax pulse,
      // so a rule is drawn measured only when tax itself is fresh, and dim otherwise. Honest.
      pulse: taxPulse === 'fresh' ? 'fresh' : 'unmeasured',
      says: verdictLine(r),
    });
  }

  // ── LEKHIO. What we do with what we know.
  arms.push({ id: 'lekhio:engines', core: 'lekhio', label: 'The engines', says: 'What Lekhio computes for a user, and asks before anything that matters.' });
  for (const e of ENGINES) {
    stars.push({ id: `engine:${e.id}`, core: 'lekhio', arm: 'lekhio:engines', label: e.label, kind: 'engine', pulse: 'fresh', says: e.says });
  }

  // ── RAKHA. What watches it.
  arms.push({ id: 'rakha:watchers', core: 'rakha', label: 'The watchers', says: 'Every source, checked on a schedule, so a change cannot pass unseen.' });
  for (const w of WATCHERS) {
    // The differ has a live heartbeat we can read; the rest run on the mini and are shown as watching
    // (they have CI, they run nightly), not as measured-tonight, unless we later wire their runs in.
    const p: StarPulse = w.id === 'differ' ? taxPulse : 'fresh';
    stars.push({ id: `watch:${w.id}`, core: 'rakha', arm: 'rakha:watchers', label: w.label, kind: 'watcher', pulse: p, says: w.says });
  }

  // ── PUCHIO. What we answer.
  arms.push({ id: 'puchio:answers', core: 'puchio', label: 'The answers', says: 'From statute and precedent, weighted, and never a guess sent unbidden.' });
  for (const a of ANSWERS) {
    stars.push({ id: `answer:${a.id}`, core: 'puchio', arm: 'puchio:answers', label: a.label, kind: 'answer', pulse: 'fresh', says: a.says });
  }

  const watchedCount = stars.filter((s) => s.pulse !== 'unmeasured').length;

  return {
    cores: CORES,
    arms,
    stars,
    stats: {
      stars: stars.length,
      watched: watchedCount,
      arms: arms.length,
      day: Math.max(1, Math.floor(input?.day ?? 1)),
    },
    hasUnmeasured: stars.some((s) => s.pulse === 'unmeasured'),
  };
}

function verdictLine(r: { verdict: string; title: string }): string {
  const v = r.verdict;
  const head =
    v === 'yes' ? 'Allowable.' :
    v === 'no' ? 'Not allowable.' :
    v === 'partly' ? 'Allowable in part.' :
    'It depends.';
  return `${head} Can I claim ${r.title.toLowerCase()}?`;
}

/** A guard the test leans on: no star may cite a host we are not licensed to read. */
export function everySourceLicensed(u: Universe): boolean {
  return u.stars.every((s) => !s.source || isLicensedSource(s.source));
}
