// Tests for lib/facts.ts, the live facts-override layer. The safety-critical logic: only known keys,
// only in-bounds values, only in-force dates, latest change wins, and a failed read never blanks the
// engine. Run: node test/facts.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'facts-'));
const fix = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'facts']) {
  writeFileSync(path.join(stage, f + '.ts'), fix(readFileSync(path.join(lib, f + '.ts'), 'utf8')));
}
const F = await import(pathToFileURL(path.join(stage, 'facts.ts')).href);
const { FACTS } = await import(pathToFileURL(path.join(stage, 'taxengine.ts')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : (fail++, console.error('FAIL ' + n)); };
const eq = (n, g, w) => { (Math.abs(g - w) < 1e-9 || g === w) ? pass++ : (fail++, console.error(`FAIL ${n}: got ${g} want ${w}`)); };
const now = new Date('2026-09-01T00:00:00Z');

// --- resolveOverrides: the guardrails --------------------------------------------------------
eq('empty rows resolve to nothing', Object.keys(F.resolveOverrides([], now)).length, 0);
eq('an in-force change applies', F.resolveOverrides([{ key: 'vatRegistrationThreshold', value: 100000, effective_from: '2026-04-06' }], now).vatRegistrationThreshold, 100000);
ok('a FUTURE effective_from does not apply yet', F.resolveOverrides([{ key: 'vatRegistrationThreshold', value: 100000, effective_from: '2027-04-06' }], now).vatRegistrationThreshold === undefined);
ok('an EXPIRED effective_to does not apply', F.resolveOverrides([{ key: 'vatRegistrationThreshold', value: 100000, effective_from: '2026-01-01', effective_to: '2026-06-01' }], now).vatRegistrationThreshold === undefined);
ok('a NULL date is treated as not-yet-law', F.resolveOverrides([{ key: 'vatRegistrationThreshold', value: 100000, effective_from: null }], now).vatRegistrationThreshold === undefined);
ok('an UNKNOWN key is ignored, never invented', F.resolveOverrides([{ key: 'notARealKey', value: 5, effective_from: '2026-01-01' }], now).notARealKey === undefined);
ok('an OUT-OF-BOUNDS money value is refused (VAT threshold of 5)', F.resolveOverrides([{ key: 'vatRegistrationThreshold', value: 5, effective_from: '2026-01-01' }], now).vatRegistrationThreshold === undefined);
ok('a rate above 1 is refused (basicRate 5)', F.resolveOverrides([{ key: 'basicRate', value: 5, effective_from: '2026-01-01' }], now).basicRate === undefined);
eq('a rate inside 0..1 applies (basicRate 0.25)', F.resolveOverrides([{ key: 'basicRate', value: 0.25, effective_from: '2026-01-01' }], now).basicRate, 0.25);

// latest in-force change wins; a future one is not counted
eq('a future change is ignored, the current one stands', F.resolveOverrides([
  { key: 'personalAllowance', value: 13000, effective_from: '2026-04-06' },
  { key: 'personalAllowance', value: 14000, effective_from: '2027-04-06' },
], now).personalAllowance, 13000);
eq('among two in-force, the latest effective_from wins', F.resolveOverrides([
  { key: 'personalAllowance', value: 13000, effective_from: '2025-04-06' },
  { key: 'personalAllowance', value: 13500, effective_from: '2026-04-06' },
], now).personalAllowance, 13500);

// --- key + bounds helpers ---------------------------------------------------------------------
ok('taxYear (a string) is NOT overridable', F.isOverridableKey('taxYear') === false);
ok('vatRegistrationThreshold IS overridable', F.isOverridableKey('vatRegistrationThreshold') === true);
ok('100000 is in bounds for the VAT threshold', F.isInBounds('vatRegistrationThreshold', 100000));
ok('5 is out of bounds for the VAT threshold', !F.isInBounds('vatRegistrationThreshold', 5));
ok('every overridable key is a number in FACTS', F.overridableKeys().every((k) => typeof FACTS[k] === 'number'));

// --- applyOverrides mutates FACTS, and NO rows leaves the defaults untouched -------------------
eq('default VAT threshold is 90000 before any override', FACTS.vatRegistrationThreshold, 90000);
eq('applying no rows changes nothing (VAT still 90000)', (F.applyOverrides([], now), FACTS.vatRegistrationThreshold), 90000);
eq('applying no rows reports no changed keys', F.applyOverrides([], now).length, 0);
{
  const changed = F.applyOverrides([{ key: 'vatRegistrationThreshold', value: 100000, effective_from: '2026-04-06' }], now);
  eq('after apply, FACTS.vatRegistrationThreshold is live at 100000', FACTS.vatRegistrationThreshold, 100000);
  ok('the changed-keys list names it', changed.includes('vatRegistrationThreshold'));
}

// --- refreshFacts: TTL cache and fail-safe ----------------------------------------------------
F._resetFactsCacheForTest();
let calls = 0;
const loader = async () => { calls++; return [{ key: 'tradingAllowance', value: 2000, effective_from: '2026-04-06' }]; };
await F.refreshFacts(loader, { now, force: true });
eq('refresh applied the loader rows (tradingAllowance 2000)', FACTS.tradingAllowance, 2000);
eq('loader was called once', calls, 1);
await F.refreshFacts(loader, { now });
eq('a second refresh within the TTL does not hit the loader again', calls, 1);
const boom = async () => { throw new Error('db down'); };
await F.refreshFacts(boom, { now, force: true });
eq('a FAILED read keeps the current FACTS, never blanks them', FACTS.tradingAllowance, 2000);

console.log(`\nfacts: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
