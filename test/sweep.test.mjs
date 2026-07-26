// What "Confirm all" is allowed to touch (tradebook-app/lib/sweep.ts).
//
// THIS SUITE EXISTS BECAUSE OF A REAL BANK CONNECT, ON 26 JULY 2026.
//
// The first live connect pulled 41 lines into the books. Two were credits the account owner had
// moved between his own accounts — "J Chahil" +£4.00 and "Monzo-ZRQVF" +£520.00 — and both were
// categorised "income" because mapBankTransaction defaults every credit to income when it cannot
// identify it. Above them sat one button: "Confirm all 41 to review".
//
// One tap would have made both of them confirmed trading income and taxed him on his own money.
//
// The cases below are those exact rows. If someone ever loosens the sweep again, this suite
// names the man and the money it costs him.
//
//   node test/sweep.test.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const S = await import(pathToFileURL(path.resolve(here, '../../tradebook-app/lib/sweep.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

console.log('\n=== the rows from the 26 July live bank connect ===\n');

// The two that nearly became taxable income.
ok(
  'a credit from his own name is NOT swept',
  S.isSweepable({ confirmed: false, amount: 4.0, is_personal: null, looks_personal: null }) === false,
);
ok(
  'a £520 transfer credit is NOT swept',
  S.isSweepable({ confirmed: false, amount: 520.0, is_personal: null, looks_personal: null }) === false,
);

// The ordinary spending that SHOULD still go in one tap: that is the whole point of the button.
ok(
  'a Screwfix payment IS swept',
  S.isSweepable({ confirmed: false, amount: -22.0, is_personal: null, looks_personal: null }) === true,
);
ok(
  'a BP fuel payment IS swept',
  S.isSweepable({ confirmed: false, amount: -40.0, is_personal: null, looks_personal: null }) === true,
);

console.log('\n=== the two personal flags mean different things ===\n');

ok(
  'is_personal (his answer) blocks the sweep',
  S.isSweepable({ confirmed: false, amount: -30.0, is_personal: true }) === false,
);
ok(
  'looks_personal (our suspicion) ALSO blocks the sweep — this is the one that was missing',
  S.isSweepable({ confirmed: false, amount: -30.0, looks_personal: true }) === false,
);
ok(
  'a flagged benefit credit is blocked twice over',
  S.isSweepable({ confirmed: false, amount: 345.13, looks_personal: true }) === false,
);

console.log('\n=== already decided, or unknown ===\n');

ok('a confirmed row is not swept again', S.isSweepable({ confirmed: true, amount: -10 }) === false);
ok(
  'an unknown confirmed state fails towards asking',
  S.isSweepable({ confirmed: null, amount: -10 }) === false,
);
ok(
  'a missing confirmed field fails towards asking',
  S.isSweepable({ amount: -10 }) === false,
);

console.log('\n=== the count on the button must equal what it confirms ===\n');

const pile = [
  { id: 'a', confirmed: false, amount: -22.0 },                        // Screwfix
  { id: 'b', confirmed: false, amount: -40.0 },                        // BP
  { id: 'c', confirmed: false, amount: 4.0 },                          // J Chahil, money in
  { id: 'd', confirmed: false, amount: 520.0 },                        // Monzo transfer, money in
  { id: 'e', confirmed: false, amount: -12.0, looks_personal: true },  // flagged
  { id: 'f', confirmed: false, amount: -9.0, is_personal: true },      // he said no
  { id: 'g', confirmed: true, amount: -5.0 },                          // done already
];

const swept = S.sweepable(pile).map((t) => t.id);
ok('only the two plain payments are swept', JSON.stringify(swept) === JSON.stringify(['a', 'b']));
ok('the button number equals what it touches', S.sweepable(pile).length === 2);

// Everything still owed an individual yes, EXCLUDING what he has already settled as personal.
const left = S.needsIndividualReview(pile).map((t) => t.id);
ok(
  'the remainder is the two credits and the flagged row',
  JSON.stringify(left) === JSON.stringify(['c', 'd', 'e']),
);
ok(
  'a sweep plus the remainder covers every open row exactly once',
  S.sweepable(pile).length + S.needsIndividualReview(pile).length ===
    pile.filter((t) => t.confirmed === false && t.is_personal !== true).length,
);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);
