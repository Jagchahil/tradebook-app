// THE BRAIN MAP. It draws what it can measure, and it draws the rest DIM, never green.

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const stage = mkdtempSync(path.join(tmpdir(), 'brainmap-'));
for (const f of ['lawsources', 'brainmap']) {
  writeFileSync(
    path.join(stage, f + '.ts'),
    readFileSync(path.join(root, 'lib', f + '.ts'), 'utf8').replace("from './lawsources'", "from './lawsources.ts'"),
  );
}
const { buildBrainMap } = await import(pathToFileURL(path.join(stage, 'brainmap.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nbrainmap: the constellation draws only what it can measure');

// With no live data at all, the whole brain is honest about not knowing.
const cold = buildBrainMap();
ok('a cold map has Khoji at the centre', cold.centre.label === 'Khoji');
ok('🔴 EVERY domain with no reading is UNMEASURED, not fresh',
  cold.domains.every((d) => d.pulse === 'unmeasured'));
ok('...and the map flags the whole body as having unmeasured nodes',
  cold.hasUnmeasured === true);
ok('there is one node per legal field plus the accounting node',
  cold.domains.length === 12 && cold.domains.some((d) => d.family === 'accounting'));
ok('every domain carries at least one licensed source point',
  cold.domains.every((d) => d.sources.length >= 1 && d.sources.every((s) => /gov\.uk|nationalarchives/.test(s.host))));

// A live tax read lights the accounting node, and drift is told from freshness.
const green = buildBrainMap({ tax: { checked: 62, agreed: 62, drifted: 0, blind: 0, ranHoursAgo: 5 } });
const acct = green.domains.find((d) => d.family === 'accounting');
ok('🔴 A CLEAN TAX READ IS FRESH, and it says the numbers', acct.pulse === 'fresh' && /62 of 62/.test(acct.says));

const drift = buildBrainMap({ tax: { checked: 62, agreed: 60, drifted: 2, blind: 0, ranHoursAgo: 5 } });
ok('🔴 DRIFT IS ATTENTION, NOT FRESH',
  drift.domains.find((d) => d.family === 'accounting').pulse === 'attention');

const stale = buildBrainMap({ tax: { checked: 62, agreed: 62, drifted: 0, blind: 0, ranHoursAgo: 40 } });
ok('a tax read older than 36h is stale',
  stale.domains.find((d) => d.family === 'accounting').pulse === 'stale');

// A law field lights up only when lawwatch has reported it.
const lawLit = buildBrainMap({ law: { employment: { pulse: 'fresh', says: 'ERA 1996 unchanged since last night.' } } });
const emp = lawLit.domains.find((d) => d.key === 'employment');
ok('🔴 A LEGAL FIELD IS FRESH ONLY ONCE LAWWATCH REPORTS IT', emp.pulse === 'fresh' && /ERA 1996/.test(emp.says));
ok('...and a field lawwatch has NOT reported stays unmeasured on the same map',
  lawLit.domains.find((d) => d.key === 'company').pulse === 'unmeasured');

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
