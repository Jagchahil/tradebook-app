// COMPANIES HOUSE, auto-fill a limited company's details from its name, so a director types almost
// nothing at onboarding. The public register is live, real-time and free; we read, never write.
//
// A director selects "Limited company" and types the business name. We search the register, show the
// matches, and when they pick one we fill the company number, registered office, incorporation date,
// SIC codes (a strong hint at their trade) and status. That is a page of typing removed, and it is
// verified against the official register rather than whatever they remember.
//
// ⚠️ SERVER SIDE ONLY. The API key is a secret and must never reach the browser or the app bundle. The
// onboarding screens call our own /api route, which calls this; the key lives in CH_API_KEY on the
// server. Auth is HTTP Basic with the key as the username and an EMPTY password (Companies House's
// scheme). Base: https://api.company-information.service.gov.uk. Rate limit: 600 requests / 5 minutes.
//
// Everything here fails SOFT: a search that errors returns an empty list, a profile that errors returns
// null. Onboarding must never be blocked because a lookup was slow or the register was down. The user
// can always type it by hand.

const BASE = 'https://api.company-information.service.gov.uk';

export interface CompanyMatch {
  companyNumber: string;
  name: string;
  status: string; // 'active', 'dissolved', ...
  addressSnippet: string;
}

export interface CompanyProfile {
  companyNumber: string;
  name: string;
  status: string;
  type: string; // 'ltd', 'plc', 'llp', ...
  incorporatedOn: string | null; // ISO date
  sicCodes: string[];
  registeredOffice: {
    line1: string;
    line2: string;
    locality: string;
    postcode: string;
    country: string;
  };
}

function authHeader(): string | null {
  const key = process.env.CH_API_KEY;
  if (!key) return null;
  // Basic auth: key as username, empty password. btoa is available in the Next.js runtime.
  const token = Buffer.from(`${key}:`).toString('base64');
  return `Basic ${token}`;
}

async function chGet(path: string): Promise<unknown | null> {
  const auth = authHeader();
  if (!auth) return null; // no key configured: behave as "no results", never throw
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
      // A slow register must not hang onboarding.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Pure parsers (tested against fixtures; no network) ──────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseSearch(json: unknown): CompanyMatch[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it): CompanyMatch => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        companyNumber: str(o.company_number),
        name: str(o.title),
        status: str(o.company_status),
        addressSnippet: str(o.address_snippet),
      };
    })
    .filter((m) => m.companyNumber && m.name);
}

export function parseProfile(json: unknown): CompanyProfile | null {
  const o = (json ?? {}) as Record<string, unknown>;
  const number = str(o.company_number);
  const name = str(o.company_name);
  if (!number || !name) return null;
  const roa = (o.registered_office_address ?? {}) as Record<string, unknown>;
  const sic = Array.isArray(o.sic_codes) ? o.sic_codes.filter((c): c is string => typeof c === 'string') : [];
  return {
    companyNumber: number,
    name,
    status: str(o.company_status),
    type: str(o.type),
    incorporatedOn: str(o.date_of_creation) || null,
    sicCodes: sic,
    registeredOffice: {
      line1: str(roa.address_line_1),
      line2: str(roa.address_line_2),
      locality: str(roa.locality),
      postcode: str(roa.postal_code),
      country: str(roa.country),
    },
  };
}

// ── Network wrappers ────────────────────────────────────────────────────────────────────────────

// Search the register by name. Returns the best matches, most relevant first. Empty on any failure.
export async function searchCompanies(query: string, limit = 8): Promise<CompanyMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const json = await chGet(`/search/companies?q=${encodeURIComponent(q)}&items_per_page=${Math.max(1, Math.min(20, limit))}`);
  return parseSearch(json);
}

// Fetch one company's full public profile by its registered number. Null on any failure.
export async function getCompany(companyNumber: string): Promise<CompanyProfile | null> {
  const n = companyNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!n) return null;
  const json = await chGet(`/company/${encodeURIComponent(n)}`);
  return parseProfile(json);
}

// ── THE OWNERS (doc: multi-owner accounts, 19 Jul) ──────────────────────────────────────────────
// A limited company belongs to its OWNERS, and Companies House publishes them: the persons with
// significant control (the beneficial owners, over 25% of shares or votes) and the officers (the
// directors who run it). This is how one paid company account learns how many people are entitled to
// a personal return under it, and who they are, without anyone typing it. Read-only, public, free.

export interface CompanyOwner {
  name: string;
  kind: 'person-with-significant-control' | 'officer';
  role: string;               // 'owner', or the officer role ('director', 'secretary', ...)
  controlBand: 'over-75' | '50-to-75' | '25-to-50' | 'under-25' | 'unknown';
  isPerson: boolean;          // false for a corporate owner (a holding company, not a human)
  ceasedOn: string | null;    // null = still active
}

// The PSC register reports control in bands, e.g. "ownership-of-shares-75-to-100-percent".
function shareBand(natures: string[]): CompanyOwner['controlBand'] {
  const j = natures.join(' ');
  if (j.includes('75-to-100')) return 'over-75';
  if (j.includes('50-to-75')) return '50-to-75';
  if (j.includes('25-to-50')) return '25-to-50';
  return natures.length ? 'under-25' : 'unknown';
}

export function parsePscs(json: unknown): CompanyOwner[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it): CompanyOwner => {
      const o = (it ?? {}) as Record<string, unknown>;
      const kind = str(o.kind);
      const natures = Array.isArray(o.natures_of_control) ? o.natures_of_control.filter((x): x is string => typeof x === 'string') : [];
      return {
        name: str(o.name),
        kind: 'person-with-significant-control',
        role: 'owner',
        controlBand: shareBand(natures),
        isPerson: kind.includes('individual'),
        ceasedOn: str(o.ceased_on) || null,
      };
    })
    .filter((p) => p.name);
}

export function parseOfficers(json: unknown): CompanyOwner[] {
  const items = (json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it): CompanyOwner => {
      const o = (it ?? {}) as Record<string, unknown>;
      const identification = (o.identification ?? {}) as Record<string, unknown>;
      return {
        name: str(o.name),
        kind: 'officer',
        role: str(o.officer_role) || 'officer',
        controlBand: 'unknown',
        // A corporate director carries an identification block; a human does not.
        isPerson: !identification || Object.keys(identification).length === 0,
        ceasedOn: str(o.resigned_on) || null,
      };
    })
    .filter((p) => p.name);
}

async function getPscs(n: string): Promise<CompanyOwner[]> {
  return parsePscs(await chGet(`/company/${encodeURIComponent(n)}/persons-with-significant-control`));
}

async function getOfficers(n: string): Promise<CompanyOwner[]> {
  return parseOfficers(await chGet(`/company/${encodeURIComponent(n)}/officers`));
}

// THE WORKING OWNER LIST. Prefers the beneficial owners (PSCs); when a company reports none, falls back
// to its active directors. Humans only, active only. This is the set of people who each get a personal
// return under the one paid company account. Empty on any failure (fails soft, like the rest).
export async function getCompanyOwners(companyNumber: string): Promise<CompanyOwner[]> {
  const n = companyNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!n) return [];
  const pscs = (await getPscs(n)).filter((p) => p.isPerson && !p.ceasedOn);
  if (pscs.length > 0) return pscs;
  return (await getOfficers(n)).filter((o) => o.isPerson && !o.ceasedOn && o.role === 'director');
}

// Is Companies House configured on this deployment? Onboarding can hide the auto-fill if not.
export function companiesHouseEnabled(): boolean {
  return Boolean(process.env.CH_API_KEY);
}
