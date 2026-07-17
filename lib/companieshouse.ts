// COMPANIES HOUSE — auto-fill a limited company's details from its name, so a director types almost
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

// Is Companies House configured on this deployment? Onboarding can hide the auto-fill if not.
export function companiesHouseEnabled(): boolean {
  return Boolean(process.env.CH_API_KEY);
}
