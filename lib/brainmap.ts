// THE BRAIN MAP. The data behind the constellation view of Khoji.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// This is the SHAPE of what Khoji knows, assembled for the admin console: Khoji in the centre, the
// domains it watches orbiting it, and each domain's licensed sources as points of light around it.
//
// 🔴 IT OBEYS THE SAME LAW AS THE ORGANS: a node we cannot measure is drawn DIM, never green.
//
// The tax domain has a live heartbeat (the differ writes khoji_runs nightly), so it can be green,
// amber (drift or blind), or red. The legal domains are new: until lawwatch has run on the mini and
// written its rows, we do not KNOW their freshness, and the map says so by drawing them 'unmeasured'
// (dim), not by glowing over a thing we have not checked. The moment lawwatch reports, they light up.
//
// Pure data, no I/O, so the test runner loads it directly and the view stays a thin renderer.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { LEGAL_SOURCES, LEGAL_FIELDS, type LegalField, type LegalSource } from './lawsources';

export type NodePulse =
  /** Watched, fresh, and in agreement. */
  | 'fresh'
  /** Watched, and something wants a human: drift, a silent change, a coverage gap. */
  | 'attention'
  /** Watched, and it has gone wrong or stale. */
  | 'stale'
  /** 🔴 Not yet measured. NOT the same as fresh. Drawn dim. */
  | 'unmeasured';

export interface SourcePoint {
  title: string;
  host: string;
  kind: LegalSource['kind'];
}

export interface DomainNode {
  key: string;
  label: string;
  /** Which brain this belongs to: the one that does the books, or the one that reads the law. */
  family: 'accounting' | 'law';
  sources: SourcePoint[];
  pulse: NodePulse;
  /** One honest line under the node. Always a fact. */
  says: string;
}

export interface BrainMap {
  centre: { label: string; sub: string };
  domains: DomainNode[];
  /** True while any domain is unmeasured, so the view can say "this is what we can see, not a clean bill". */
  hasUnmeasured: boolean;
}

const HOST = (url: string): string => {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return 'unknown'; }
};

const TITLE_CASE: Record<LegalField, string> = {
  tax: 'Tax',
  employment: 'Employment',
  company: 'Company',
  consumer: 'Consumer',
  contract: 'Contract',
  data_protection: 'Data protection',
  intellectual_property: 'Intellectual property',
  property: 'Property',
  construction: 'Construction',
  health_and_safety: 'Health & safety',
  tort: 'Tort',
  insolvency: 'Insolvency',
};

/** How fresh is a legal field's watch? Keyed by field, supplied by whoever read khoji_runs
 *  (kind='lawwatch'). Absent = we have not measured it yet, and the map is honest about that. */
export interface LawFreshness {
  [field: string]: { pulse: Exclude<NodePulse, 'unmeasured'>; says: string } | undefined;
}

/** Live tax-domain state, from the differ. Absent = unmeasured. */
export interface TaxState {
  drifted?: number;
  blind?: number;
  agreed?: number;
  checked?: number;
  ranHoursAgo?: number | null;
}

export function buildBrainMap(input?: { tax?: TaxState; law?: LawFreshness }): BrainMap {
  const domains: DomainNode[] = [];

  // ── THE ACCOUNTING BRAIN. One domain, and it is the one with a real heartbeat today. ──
  const tax = input?.tax;
  const taxSources = LEGAL_SOURCES.tax.map((s) => ({ title: s.title, host: HOST(s.url), kind: s.kind }));
  domains.push({
    key: 'accounting',
    label: 'Tax & accounting',
    family: 'accounting',
    sources: taxSources,
    ...taxNode(tax),
  });

  // ── THE LAW BRAIN. One node per legal field, dim until lawwatch has reported. ──
  for (const field of LEGAL_FIELDS) {
    if (field === 'tax') continue; // tax is shown as the accounting node above
    const sources = LEGAL_SOURCES[field].map((s) => ({ title: s.title, host: HOST(s.url), kind: s.kind }));
    const fresh = input?.law?.[field];
    domains.push({
      key: field,
      label: TITLE_CASE[field],
      family: 'law',
      sources,
      pulse: fresh ? fresh.pulse : 'unmeasured',
      says: fresh
        ? fresh.says
        : `${sources.length} source${sources.length === 1 ? '' : 's'} registered. Not yet watched, so we cannot say it is current.`,
    });
  }

  return {
    centre: { label: 'Khoji', sub: 'reads the law so nobody has to remember to' },
    domains,
    hasUnmeasured: domains.some((d) => d.pulse === 'unmeasured'),
  };
}

function taxNode(tax?: TaxState): { pulse: NodePulse; says: string } {
  if (!tax || tax.checked === undefined) {
    return { pulse: 'unmeasured', says: 'No differ run read yet. We cannot say the tax numbers are current.' };
  }
  if ((tax.drifted ?? 0) > 0) {
    return { pulse: 'attention', says: `${tax.drifted} tax number${tax.drifted === 1 ? '' : 's'} no longer match GOV.UK.` };
  }
  if ((tax.blind ?? 0) > 0) {
    return { pulse: 'attention', says: `${tax.blind} page${tax.blind === 1 ? '' : 's'} could not be read. Not knowing is not being fine.` };
  }
  if (tax.ranHoursAgo != null && tax.ranHoursAgo > 36) {
    return { pulse: 'stale', says: `Nothing checked for ${Math.round(tax.ranHoursAgo)} hours.` };
  }
  return { pulse: 'fresh', says: `${tax.agreed ?? tax.checked} of ${tax.checked} tax constants matched GOV.UK.` };
}
