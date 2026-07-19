// COMPANY MEMBERS, server side. The owners of a limited company under one paid company account,
// seeded from the Companies House register (lib/companieshouse.ts) and linked to each owner's own login
// once they accept an invite. Self-contained REST, service role, same posture as lib/todos.ts. No
// customer money or tax figures live here; it is a roster of names from a public register.
//
// This is the DATA layer only. It does not grant anyone a paid seat, change billing, or move auth —
// those are separate, deliberate steps. Recording who the owners are is safe and reversible.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function base(): string {
  if (!URL || !SERVICE_KEY) throw new Error('Supabase env vars are missing.');
  return URL;
}
function h(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY as string,
    Authorization: `Bearer ${SERVICE_KEY as string}`,
    ...extra,
  };
}

export type MemberStatus = 'pending' | 'invited' | 'active' | 'declined';

export interface CompanyMemberRow {
  id: string;
  company_number: string;
  owner_user_id: string;
  member_user_id: string | null;
  name: string;
  role: string | null;
  control_band: string | null;
  invite_email: string | null;
  status: MemberStatus;
  created_at: string;
}

export interface CompanyMemberDTO {
  id: string;
  name: string;
  role: string | null;
  controlBand: string | null;
  status: MemberStatus;
  linked: boolean; // true once this owner has their own Lekhio login attached
}

export function toMemberDTO(r: CompanyMemberRow): CompanyMemberDTO {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    controlBand: r.control_band,
    status: r.status,
    linked: Boolean(r.member_user_id),
  };
}

// The owners recorded for a paying company account, newest control first is not meaningful, so by name.
export async function listCompanyMembers(ownerUserId: string): Promise<CompanyMemberDTO[] | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/company_members?owner_user_id=eq.${encodeURIComponent(ownerUserId)}&select=*&order=name.asc&limit=50`,
      { headers: h() },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as CompanyMemberRow[];
    return rows.map(toMemberDTO);
  } catch {
    return null;
  }
}

export interface SeedOwner {
  name: string;
  role: string;
  controlBand: string;
}

// Record the company's owners against the paying account. Insert-ignore on the unique key, so calling
// it again after the register changes adds the new people and never duplicates the existing ones.
export async function seedCompanyMembers(
  ownerUserId: string,
  companyNumber: string,
  owners: SeedOwner[],
): Promise<boolean> {
  const rows = owners
    .filter((o) => o.name.trim())
    .map((o) => ({
      owner_user_id: ownerUserId,
      company_number: companyNumber,
      name: o.name.trim(),
      role: o.role || null,
      control_band: o.controlBand || null,
      status: 'pending' as MemberStatus,
    }));
  if (rows.length === 0) return true;
  try {
    const res = await fetch(
      `${base()}/rest/v1/company_members?on_conflict=owner_user_id,company_number,name`,
      {
        method: 'POST',
        headers: h({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
        body: JSON.stringify(rows),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
