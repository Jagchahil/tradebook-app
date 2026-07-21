// THE LIVE FACTS LAYER. Khoji learns, a human approves, and the number moves everywhere.
//
// lib/taxengine FACTS holds the hardcoded 2026/27 defaults. This layer lets an APPROVED, IN-FORCE
// change (a row in fact_overrides, written when a human approves a Khoji card) override a default at
// runtime, so the moment a human approves a new figure it is the figure EVERY calculation and EVERY
// answer uses, app and WhatsApp, with no deploy. An expense logged tomorrow is treated with tomorrow's
// approved facts; a tax return is computed on the latest approved facts before it goes out.
//
// FOUR SAFETIES, because this is the most consequential data in the product:
//   1. HUMAN GATE.   An override only exists because a human approved it (app/api/team/review).
//   2. KNOWN KEYS.   A row for a key the engine does not hold is ignored, never invented.
//   3. BOUNDS.       A value outside a sane range for its key is refused, so a bad scrape cannot walk
//                    a zero or a wild number into a man's tax bill even if it slipped past a human.
//   4. EFFECTIVE DATE. An override applies only from its effective_from, never before, so an
//                    announced-but-not-yet-law change waits for its date exactly as the law does.
//
// And it can only ever ADD: with no rows, resolveOverrides returns {} and FACTS is exactly the
// hardcoded defaults, byte for byte. On any read failure we keep the current FACTS, never clear them.

import { FACTS } from './taxengine';

export type Facts = typeof FACTS;

export interface FactOverride {
  key: string;
  value: number;
  effective_from: string | null; // ISO date. null is treated as not-yet-in-force (we do not guess a date).
  effective_to?: string | null;
  source_url?: string | null;
}

const asRecord = FACTS as unknown as Record<string, unknown>;

// A key is overridable only if the engine holds it as a NUMBER. taxYear (a string) is not overridable.
export function isOverridableKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(asRecord, key) && typeof asRecord[key] === 'number';
}

// Every overridable key, for the write side and the tests.
export function overridableKeys(): string[] {
  return Object.keys(asRecord).filter((k) => typeof asRecord[k] === 'number');
}

// Sane bounds per money key. Rates (a default strictly between 0 and 1) are bounded 0..1 automatically.
// Deliberately WIDE: we are catching a scrape that returned 0 or a threshold of 9, not second-guessing
// HMRC. A value outside these is refused, and the human gate is the primary defence anyway.
export const FACT_BOUNDS: Record<string, { min: number; max: number }> = {
  personalAllowance: { min: 5_000, max: 30_000 },
  personalAllowanceTaperFloor: { min: 50_000, max: 250_000 },
  personalAllowanceLostAt: { min: 80_000, max: 300_000 },
  basicRateBand: { min: 20_000, max: 80_000 },
  additionalRateThreshold: { min: 80_000, max: 300_000 },
  class4LowerLimit: { min: 5_000, max: 30_000 },
  class4UpperLimit: { min: 30_000, max: 100_000 },
  class2WeeklyRate: { min: 0, max: 20 },
  class2SmallProfitsThreshold: { min: 3_000, max: 15_000 },
  tradingAllowance: { min: 0, max: 5_000 },
  annualInvestmentAllowance: { min: 100_000, max: 5_000_000 },
  mileageFirstBandMiles: { min: 1_000, max: 100_000 },
  homeFlatRate25to50: { min: 0, max: 200 },
  homeFlatRate51to100: { min: 0, max: 200 },
  homeFlatRate101plus: { min: 0, max: 200 },
  vatRegistrationThreshold: { min: 50_000, max: 500_000 },
  vatDeregistrationThreshold: { min: 50_000, max: 500_000 },
  mtdThreshold2026: { min: 10_000, max: 200_000 },
  mtdThreshold2027: { min: 10_000, max: 200_000 },
  mtdThreshold2028: { min: 10_000, max: 200_000 },
  poaThreshold: { min: 0, max: 10_000 },
  cgtAnnualExempt: { min: 0, max: 50_000 },
  marriageAllowanceTransfer: { min: 0, max: 5_000 },
  savingsStartingRateBand: { min: 0, max: 20_000 },
  personalSavingsAllowanceBasic: { min: 0, max: 5_000 },
  personalSavingsAllowanceHigher: { min: 0, max: 5_000 },
};

function boundsFor(key: string): { min: number; max: number } {
  if (FACT_BOUNDS[key]) return FACT_BOUNDS[key];
  const def = asRecord[key];
  // A rate (a default strictly inside 0..1) is bounded to 0..1. Anything else gets a generous money
  // range; the explicit bounds above cover the figures that matter.
  if (typeof def === 'number' && def > 0 && def < 1) return { min: 0, max: 1 };
  return { min: 0, max: 100_000_000 };
}

export function isInBounds(key: string, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const b = boundsFor(key);
  return value >= b.min && value <= b.max;
}

// PURE. Given the override rows and 'now', return the {key: value} to apply. Known keys only, in
// bounds only, in force only (effective_from present and <= now, and no effective_to or effective_to
// > now). When two rows cover the same key, the one with the LATEST effective_from wins, so a newer
// change supersedes an older one.
export function resolveOverrides(rows: FactOverride[], now: Date): Record<string, number> {
  const nowMs = now.getTime();
  const winners = new Map<string, { value: number; fromMs: number }>();
  for (const r of rows) {
    if (!isOverridableKey(r.key)) continue;
    if (typeof r.value !== 'number' || !isInBounds(r.key, r.value)) continue;
    if (!r.effective_from) continue; // no date is not-yet-law; we never guess one
    const fromMs = Date.parse(r.effective_from);
    if (!Number.isFinite(fromMs) || fromMs > nowMs) continue; // not yet in force
    if (r.effective_to) {
      const toMs = Date.parse(r.effective_to);
      if (Number.isFinite(toMs) && toMs <= nowMs) continue; // expired
    }
    const prev = winners.get(r.key);
    if (!prev || fromMs >= prev.fromMs) winners.set(r.key, { value: r.value, fromMs });
  }
  const out: Record<string, number> = {};
  for (const [k, v] of winners) out[k] = v.value;
  return out;
}

// Apply resolved overrides onto the live FACTS object, in place, so every FACTS.x reader sees them.
// Returns the keys that were changed FROM their current value, for logging.
export function applyOverrides(rows: FactOverride[], now: Date = new Date()): string[] {
  const resolved = resolveOverrides(rows, now);
  const changed: string[] = [];
  for (const [k, v] of Object.entries(resolved)) {
    if (asRecord[k] !== v) { changed.push(k); }
    asRecord[k] = v;
  }
  return changed;
}

// The cached refresh. Reads approved, in-force overrides via the injected loader and applies them. A
// short TTL so a hot path does not hammer the database. On ANY failure it does nothing: FACTS keeps
// its current values, never cleared. The loader is injected so this file stays pure and testable and
// carries no database import.
let lastRefreshMs = 0;
const TTL_MS = 60_000;

export async function refreshFacts(
  loader: () => Promise<FactOverride[]>,
  opts: { now?: Date; force?: boolean } = {},
): Promise<string[]> {
  const now = opts.now ?? new Date();
  if (!opts.force && now.getTime() - lastRefreshMs < TTL_MS) return [];
  try {
    const rows = await loader();
    const changed = applyOverrides(rows, now);
    lastRefreshMs = now.getTime();
    return changed;
  } catch {
    return []; // keep current FACTS; a failed read must never blank the engine
  }
}

// For tests: reset the refresh cache so a test can force a fresh apply.
export function _resetFactsCacheForTest(): void {
  lastRefreshMs = 0;
}
