// Tests for the Companies House OWNER parsers (parsePscs, parseOfficers) in lib/companieshouse.ts.
// Pure parsers against fixtures shaped like the real CH API. No network.
//   node test/companyowners.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'chowners-'));
writeFileSync(path.join(stage, 'companieshouse.ts'), readFileSync(path.join(lib, 'companieshouse.ts'), 'utf8'));
const CH = await import(pathToFileURL(path.join(stage, 'companieshouse.ts')).href);

let pass = 0, fail = 0;
function ok(desc, cond) {
  if (cond) { pass++; process.stdout.write(`  PASS  ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL  ${desc}\n`); }
}

// PSC register fixture (the beneficial owners).
const pscJson = {
  items: [
    { name: 'Mr John Smith', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-75-to-100-percent', 'voting-rights-75-to-100-percent'] },
    { name: 'Ms Jane Doe', kind: 'individual-person-with-significant-control', natures_of_control: ['ownership-of-shares-25-to-50-percent'], ceased_on: '2024-01-01' },
    { name: 'Holdco Ltd', kind: 'corporate-entity-person-with-significant-control', natures_of_control: ['ownership-of-shares-50-to-75-percent'] },
  ],
};
{
  const owners = CH.parsePscs(pscJson);
  ok('parses all three PSC entries', owners.length === 3);
  ok('reads the majority owner and their control band', owners[0].name === 'Mr John Smith' && owners[0].controlBand === 'over-75' && owners[0].isPerson === true);
  ok('reads a 25-50% owner and their ceased date', owners[1].controlBand === '25-to-50' && owners[1].ceasedOn === '2024-01-01');
  ok('flags a corporate PSC as not a person', owners[2].isPerson === false && owners[2].controlBand === '50-to-75');
  ok('every PSC is tagged as an owner', owners.every((o) => o.kind === 'person-with-significant-control' && o.role === 'owner'));
}

// Officers fixture (directors and a secretary and a corporate director).
const officerJson = {
  items: [
    { name: 'SMITH, John', officer_role: 'director' },
    { name: 'DOE, Jane', officer_role: 'secretary' },
    { name: 'OLD, Bob', officer_role: 'director', resigned_on: '2020-01-01' },
    { name: 'CORP DIRECTORS LTD', officer_role: 'corporate-director', identification: { identification_type: 'uk-limited-company' } },
  ],
};
{
  const officers = CH.parseOfficers(officerJson);
  ok('parses all officers', officers.length === 4);
  ok('a human director is a person', officers[0].role === 'director' && officers[0].isPerson === true);
  ok('a resigned director carries the resigned date', officers[2].ceasedOn === '2020-01-01');
  ok('a corporate director is flagged not a person', officers[3].isPerson === false);
}

// Guards: junk in, empty out (fails soft).
ok('empty/garbage PSC json yields no owners', CH.parsePscs(null).length === 0 && CH.parsePscs({}).length === 0 && CH.parsePscs({ items: 'nope' }).length === 0);
ok('empty/garbage officer json yields no officers', CH.parseOfficers(undefined).length === 0 && CH.parseOfficers({ items: {} }).length === 0);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
