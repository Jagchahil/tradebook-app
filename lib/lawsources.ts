// THE LEGAL SOURCE REGISTRY. Khoji's law knowledge, and the rule that governs it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// We already watch the tax law that sits under our answers: the differ checks the numbers, corpus
// checks the sentences, tribunal watches the judges, amend watches the documents. This widens that
// same discipline to law generally, because the group is not only an accountant (doc 98: the pillars
// are bank, LAW, global), and because a self-employed person hits far more law than tax: the moment
// they hire, sell, sign, or handle a customer's data.
//
// 🔴 THE ONE RULE THAT KEEPS THIS SAFE. It is the same line we hold on tax.
//
//   BROAD to INGEST and to EXAMINE OURSELVES ON.  NARROW to ASSERT to a user.
//
// Khoji may read and be tested on the whole law. What Lekhio TELLS a user stays behind the approval
// gate, and stays inside what we can stand behind, exactly as tax does. We do not "give legal
// advice" any more than we "do your tax". Knowing the law is a moat. Dispensing it unbidden is a
// regulated activity, and this file does not cross that line: it holds SOURCES and CITATIONS, never
// a canned answer sent to anybody.
//
// ⚠️ AND WE ONLY LIST SOURCES WE ARE LICENSED TO USE. Proven on 14 July, not assumed:
//   . legislation.gov.uk  the statute itself, Crown copyright under the OPEN GOVERNMENT LICENCE,
//                         with a real API (data.xml / akn). Commercial + automated use permitted.
//   . www.gov.uk          HMRC and departmental guidance, OGL.
//   . caselaw.nationalarchives.gov.uk  judgments under the Open Justice Licence: free use expressly
//                         includes "incorporating judgments into your own products". The only thing
//                         needing a licence is BULK programmatic search across their whole record,
//                         which we do not do. (The week I spent believing otherwise is in the memory.)
//   . GOV.UK tax tribunal + employment tribunal decisions: published by GOV.UK under OGL, same search
//                         endpoint we already use for the TIINs.
//
// No source outside this list may be cited by a law exam question. The runner enforces it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** A body of law we track. Broad on purpose: the ambition is "all of it", the discipline is the
 *  assert/ingest line above. */
export type LegalField =
  | 'tax'
  | 'employment'
  | 'company'
  | 'consumer'
  | 'contract'
  | 'data_protection'
  | 'intellectual_property'
  | 'property'
  | 'construction'
  | 'health_and_safety'
  | 'tort'
  | 'insolvency';

/** The domains we are licensed to read and cite, and nothing else. */
export const ALLOWED_SOURCE_HOSTS = [
  'www.legislation.gov.uk',
  'legislation.gov.uk',
  'www.gov.uk',
  'gov.uk',
  'caselaw.nationalarchives.gov.uk',
] as const;

/** The professional exams whose SYLLABUS TOPICS shape the exam bank. We are examined on the same
 *  ground these qualifications cover. We ingest their PUBLISHED SYLLABI (freely available) as a map
 *  of what to be tested on; we do NOT reproduce their past papers, which are copyright. */
export const PROFESSIONAL_EXAMS: Record<LegalField, string[]> = {
  tax: ['ACCA TX/ATX', 'CIOT CTA', 'ATT', 'ICAEW Principles of Taxation'],
  employment: ['SQE1 FLK1', 'CILEX Employment Law', 'CIPD Employment Law'],
  company: ['SQE1 FLK1 Business Law', 'ICSA/CGI', 'ACCA LW (Corporate and Business Law)'],
  consumer: ['SQE1', 'CTSI Trading Standards'],
  contract: ['SQE1 FLK1', 'CILEX Contract Law'],
  data_protection: ['BCS/ISEB Data Protection', 'IAPP CIPP/E'],
  intellectual_property: ['SQE2', 'CIPA (patent attorney foundation)'],
  property: ['SQE1 FLK2', 'CILEX Conveyancing'],
  construction: ['CIOB', 'JCT contract administration'],
  health_and_safety: ['NEBOSH', 'IOSH'],
  tort: ['SQE1 FLK1', 'CILEX Law of Tort'],
  insolvency: ['JIEB (insolvency)', 'ACCA ATX'],
};

export interface LegalSource {
  /** Where a human, or Khoji, goes to read the primary text. Must be an ALLOWED host. */
  url: string;
  /** What it IS, in one line, plain enough for the console. */
  title: string;
  /** statute | case | guidance | regulation. Governs how much weight it carries, per synthesis.ts:
   *  statute > case > guidance. Guidance binds nobody. */
  kind: 'statute' | 'case' | 'guidance' | 'regulation';
}

/** The spine of each field: the small number of primary sources everything else hangs off. Kept
 *  deliberately short. A watcher that follows forty documents per field is one nobody reads, and the
 *  exam bank cites the specific provision, not this list. This is the "where does this field live"
 *  map, and the freshness watcher (khoji/lawwatch.mjs) hashes exactly these. */
export const LEGAL_SOURCES: Record<LegalField, LegalSource[]> = {
  tax: [
    { url: 'https://www.legislation.gov.uk/ukpga/2005/5/contents', title: 'Income Tax (Trading and Other Income) Act 2005', kind: 'statute' },
    { url: 'https://www.legislation.gov.uk/ukpga/2007/3/contents', title: 'Income Tax Act 2007', kind: 'statute' },
    { url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual', title: 'HMRC Business Income Manual', kind: 'guidance' },
  ],
  employment: [
    { url: 'https://www.legislation.gov.uk/ukpga/1996/18/contents', title: 'Employment Rights Act 1996', kind: 'statute' },
    { url: 'https://www.legislation.gov.uk/ukpga/2010/15/contents', title: 'Equality Act 2010', kind: 'statute' },
    { url: 'https://www.gov.uk/national-minimum-wage-rates', title: 'GOV.UK National Minimum Wage rates', kind: 'guidance' },
  ],
  company: [
    { url: 'https://www.legislation.gov.uk/ukpga/2006/46/contents', title: 'Companies Act 2006', kind: 'statute' },
  ],
  consumer: [
    { url: 'https://www.legislation.gov.uk/ukpga/2015/15/contents', title: 'Consumer Rights Act 2015', kind: 'statute' },
  ],
  contract: [
    { url: 'https://www.legislation.gov.uk/ukpga/1980/58/contents', title: 'Limitation Act 1980', kind: 'statute' },
  ],
  data_protection: [
    { url: 'https://www.legislation.gov.uk/ukpga/2018/12/contents', title: 'Data Protection Act 2018', kind: 'statute' },
  ],
  intellectual_property: [
    { url: 'https://www.legislation.gov.uk/ukpga/1988/48/contents', title: 'Copyright, Designs and Patents Act 1988', kind: 'statute' },
  ],
  property: [
    { url: 'https://www.legislation.gov.uk/ukpga/1985/70/contents', title: 'Landlord and Tenant Act 1985', kind: 'statute' },
  ],
  construction: [
    { url: 'https://www.legislation.gov.uk/ukpga/1996/53/contents', title: 'Housing Grants, Construction and Regeneration Act 1996', kind: 'statute' },
  ],
  health_and_safety: [
    { url: 'https://www.legislation.gov.uk/ukpga/1974/37/contents', title: 'Health and Safety at Work etc. Act 1974', kind: 'statute' },
  ],
  tort: [
    { url: 'https://caselaw.nationalarchives.gov.uk/', title: 'The Judgments of the Senior Courts (National Archives)', kind: 'case' },
  ],
  insolvency: [
    { url: 'https://www.legislation.gov.uk/ukpga/1986/45/contents', title: 'Insolvency Act 1986', kind: 'statute' },
  ],
};

/** Is a URL on a host we are licensed to cite? The exam runner and the watcher both call this: a
 *  citation to a host not on the list is a defect, not a warning. */
export function isLicensedSource(url: string): boolean {
  try {
    const host = new URL(url).host.toLowerCase();
    return (ALLOWED_SOURCE_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
}

/** Every source URL in the registry, deduped. What the freshness watcher hashes each night. */
export function watchedLegalUrls(): string[] {
  const seen = new Set<string>();
  for (const field of Object.keys(LEGAL_SOURCES) as LegalField[]) {
    for (const s of LEGAL_SOURCES[field]) seen.add(s.url);
  }
  return [...seen];
}

export const LEGAL_FIELDS = Object.keys(LEGAL_SOURCES) as LegalField[];
