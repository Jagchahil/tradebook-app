// THE READ LAYER for Khoji's Pocket (the khoji_history table the mini writes each night).
//
// This is what Rakha and Puchio call to remember what a number USED to be. Self-contained REST,
// service role, same posture as lib/todos.ts and the studio tables — kept out of the 200KB
// supabase.ts on purpose. NO customer data lives in khoji_history; it is public tax constants only,
// so reading it needs no per-user scoping.
//
// The pure functions (toTimelines, formatValue, valueOnFrom) carry no secrets and are unit-safe.

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

// The DB row, exactly as khoji_history stores it.
export interface PocketRow {
  id: string;
  fact_key: string;
  old_value: string | null;
  new_value: string;
  effective_from: string | null;
  tax_year: string | null;
  noticed_at: string;
  source: string | null;
  note: string | null;
}

// One transition in a constant's life, formatted for a human.
export interface PocketChange {
  from: string | null;   // formatted previous value (null = this was the first value we ever recorded)
  to: string;            // formatted new value
  fromRaw: string | null;
  toRaw: string;
  effectiveFrom: string | null; // the sourced legal commencement date, if we have it
  noticedAt: string;            // when Khoji recorded it
  taxYear: string | null;
  source: string | null;
  baseline: boolean;     // true = a first-known value, not a change
}

// A constant's whole timeline.
export interface FactTimeline {
  factKey: string;
  label: string;         // human label, e.g. "Class 4 NI main rate"
  current: string;       // formatted current value
  currentRaw: string;
  changes: PocketChange[]; // chronological
  hasHistory: boolean;   // true if it has ever actually moved (a real transition, not just a baseline)
}

// ── PURE: labels and units ─────────────────────────────────────────────────────────────────────
const LABELS: Record<string, string> = {
  class4MainRate: 'Class 4 NI main rate',
  class4UpperRate: 'Class 4 NI upper rate',
  class2WeeklyRate: 'Class 2 NI weekly rate',
  mileageCarFirst10k: 'Car mileage, first 10,000 miles',
  mileageCarOver10k: 'Car mileage, over 10,000 miles',
  mileageMotorcycle: 'Motorcycle mileage',
  mileageBicycle: 'Bicycle mileage',
  personalAllowance: 'Personal allowance',
  basicRate: 'Income tax basic rate',
  higherRate: 'Income tax higher rate',
  additionalRate: 'Income tax additional rate',
  basicRateBand: 'Basic rate band',
  additionalRateThreshold: 'Additional rate threshold',
  vatRegistrationThreshold: 'VAT registration threshold',
  vatDeregistrationThreshold: 'VAT deregistration threshold',
  vatStandardRate: 'VAT standard rate',
  tradingAllowance: 'Trading allowance',
  annualInvestmentAllowance: 'Annual Investment Allowance',
};

export function prettyKey(key: string): string {
  if (LABELS[key]) return LABELS[key];
  // camelCase / numbers -> spaced words, first letter up. A readable fallback, never a wrong one.
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Format a raw value into something a human reads, ONLY where we are sure of the unit. Everything else
// falls back to the raw string — a friendly-but-wrong number is worse than an honest raw one.
export function formatValue(factKey: string, raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const k = factKey.toLowerCase();

  // A '...miles' key is a COUNT (e.g. the 10,000-mile band), never money and never a rate. Leave it raw
  // so it can't be mistaken for £10,000. (This is the exact unit trap the mileage page taught us.)
  if (k.includes('miles')) return raw;

  // mileage rates are pounds-per-mile (0.55 -> 55p).
  if (k.includes('mileage')) return `${Math.round(n * 100)}p`;
  // a proportion expressed as a rate (0.06 -> 6%).
  if (k.includes('rate') && n > 0 && n <= 1) return `${+(n * 100).toFixed(2)}%`;
  // money thresholds/allowances/limits.
  if (/(threshold|allowance|limit|band|floor|exempt|transfer)/.test(k) && n >= 100) {
    return `£${n.toLocaleString('en-GB')}`;
  }
  // any remaining small proportion.
  if (n > 0 && n < 1) return `${+(n * 100).toFixed(2)}%`;
  return raw;
}

// ── PURE: build timelines from rows ─────────────────────────────────────────────────────────────
export function toTimelines(rows: PocketRow[]): FactTimeline[] {
  const byKey = new Map<string, PocketRow[]>();
  for (const r of rows) {
    const arr = byKey.get(r.fact_key) ?? [];
    arr.push(r);
    byKey.set(r.fact_key, arr);
  }

  const timelines: FactTimeline[] = [];
  for (const [factKey, group] of byKey) {
    const sorted = [...group].sort((a, b) => a.noticed_at.localeCompare(b.noticed_at));
    const changes: PocketChange[] = sorted.map((r) => ({
      from: r.old_value === null ? null : formatValue(factKey, r.old_value),
      to: formatValue(factKey, r.new_value),
      fromRaw: r.old_value,
      toRaw: r.new_value,
      effectiveFrom: r.effective_from,
      noticedAt: r.noticed_at,
      taxYear: r.tax_year,
      source: r.source,
      baseline: r.old_value === null,
    }));
    const last = sorted[sorted.length - 1];
    timelines.push({
      factKey,
      label: prettyKey(factKey),
      current: formatValue(factKey, last.new_value),
      currentRaw: last.new_value,
      changes,
      hasHistory: sorted.some((r) => r.old_value !== null),
    });
  }

  // Facts that have actually MOVED first (that is the interesting part), then alphabetical by label.
  timelines.sort((a, b) => {
    if (a.hasHistory !== b.hasHistory) return a.hasHistory ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return timelines;
}

// ── PURE: what a value was on a given date (for Rakha's prior-year answers) ──────────────────────
// Given a fact's rows and an ISO date, return the value in force on that date: the newest change whose
// effective_from (or, lacking one, noticed_at) is on or before the date. Null if we held no value yet.
export function valueOnFrom(rows: PocketRow[], factKey: string, isoDate: string): string | null {
  const mine = rows
    .filter((r) => r.fact_key === factKey)
    .map((r) => ({ when: r.effective_from ?? r.noticed_at.slice(0, 10), value: r.new_value }))
    .sort((a, b) => a.when.localeCompare(b.when));
  let held: string | null = null;
  for (const r of mine) {
    if (r.when <= isoDate) held = r.value;
    else break;
  }
  return held;
}

// ── READS ────────────────────────────────────────────────────────────────────────────────────────
export async function readPocketRows(): Promise<PocketRow[] | null> {
  try {
    const res = await fetch(
      `${base()}/rest/v1/khoji_history?select=*&order=fact_key.asc,noticed_at.asc&limit=5000`,
      { headers: h() },
    );
    if (!res.ok) return null;
    return (await res.json()) as PocketRow[];
  } catch { return null; }
}

export interface PocketSummary {
  timelines: FactTimeline[];
  totalConstants: number;
  changedConstants: number;
}

export async function readPocket(): Promise<PocketSummary | null> {
  const rows = await readPocketRows();
  if (rows === null) return null;
  const timelines = toTimelines(rows);
  return {
    timelines,
    totalConstants: timelines.length,
    changedConstants: timelines.filter((t) => t.hasHistory).length,
  };
}

// What a constant was on a date, straight from the DB (Rakha / Puchio helper).
export async function valueOn(factKey: string, isoDate: string): Promise<string | null> {
  const rows = await readPocketRows();
  if (rows === null) return null;
  return valueOnFrom(rows, factKey, isoDate);
}

// A compact, plain-English history of the figures that have actually MOVED, for Puchio to answer
// "what was the rate before / when did it change" from Khoji's memory rather than a guess. Empty
// string when the pocket is unreadable or nothing has changed yet, so the caller degrades safely.
export async function pocketHistoryBrief(maxFacts = 12): Promise<string> {
  const rows = await readPocketRows();
  if (rows === null) return '';
  const moved = toTimelines(rows).filter((t) => t.hasHistory).slice(0, maxFacts);
  const lines: string[] = [];
  for (const t of moved) {
    for (const c of t.changes.filter((x) => !x.baseline)) {
      const when = c.effectiveFrom ?? c.noticedAt.slice(0, 10);
      lines.push(`${t.label}: was ${c.from}, became ${c.to} (from ${when})`);
    }
  }
  return lines.join('\n');
}
