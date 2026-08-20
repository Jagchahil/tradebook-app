// B69. THE FOUR PROPERTY CATEGORIES WERE OFFERED TO EVERYBODY. 20 August 2026.
//
//   node test/b69categorygate.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// app/app/money/add/page.tsx mapped the whole of CATEGORIES, so a plumber in a van was offered
// `mortgage interest`, `letting agent`, `property repairs` and `ground rent`: four rows he reads
// past to reach the one he wants, on the screen he uses most. Doc 103's empty test, on a list.
//
// 🔴 AND IT IS NOT ONLY TIDINESS, WHICH IS WHY IT IS FILED AGAINST B62. Those four were offered to
// EVERY customer and, until 20 August, filed into the TRADE stream for every one of them. The door
// was open on every account and led nowhere on all of them. A picker that had been gated would
// still have been a bug; it would have been a bug fewer people could reach.
//
// lib/propertylanes.ts has exported categoriesFor for exactly this since RUN 2 and
// app/app/pile/page.tsx has used it since then. This screen never got it.
//
// ⚠️ THE REGRESSION THIS GUARDS IS NOT THE LANDLORD'S LIST, IT IS THE PLUMBER'S. Section 2 asserts
// that a man with no property sees EXACTLY the list he saw before, in exactly the order, because a
// gate that quietly drops a trade category costs him a deduction.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const stage = mkdtempSync(path.join(tmpdir(), 'b69-lib-'));
const withExt = (src) => src.replace(/(from\s+')(\.[^']*?)(')/g, (m, a, spec, b) => (
  /\.[a-z]+$/.test(spec) ? m : `${a}${spec}.ts${b}`
));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (!f.endsWith('.ts')) continue;
  writeFileSync(path.join(stage, f), withExt(read(`lib/${f}`)));
}
ok('🔴 the staged lib/propertylanes.ts differs from the real one in nothing at all',
  readFileSync(path.join(stage, 'propertylanes.ts'), 'utf8') === read('lib/propertylanes.ts'));

const L = await import(pathToFileURL(path.join(stage, 'propertylanes.ts')).href);
const C = await import(pathToFileURL(path.join(stage, 'categories.ts')).href);

const ALL = [...C.CATEGORIES];
const PROPS = [...L.PROPERTY_CATEGORIES];
const shut = L.categoriesFor(ALL, false);
const open = L.categoriesFor(ALL, true);

// ---------------------------------------------------------------------------------------------
// 🔴 1. VACUITY. There must BE something to hide, or section 2 is a test of an empty set.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 1. vacuity: the four are really in the shared list ===\n');

ok('the shared list is a real list', ALL.length > 10);
ok('🔴 AND EVERY PROPERTY CATEGORY IS IN IT, which is why an ungated picker showed them to everyone',
  PROPS.length >= 4 && PROPS.every((c) => ALL.includes(c)));
ok('🔴 SO THE GATE HAS SOMETHING TO DO: the two lists differ by exactly the property ones',
  open.length - shut.length === PROPS.length);

// 🔴 AND THE MODULE SETTLES CASE AND PADDING BEFORE IT DECIDES, WHICH THIS SUITE OWNS BECAUSE
// NOTHING ELSE DOES. A category reaches isPropertyCategory from a typed form, a bank statement line
// and a voice note, and only the first of those is guaranteed to arrive lower case and trimmed. The
// picker's own list is already canonical, so a gate that stopped settling case would look perfectly
// healthy here and would silently stop routing a cost that came in any other way.
ok('🔴 THE MODULE SETTLES CASE AND PADDING, so a category is judged by what it says rather'
  + ' than by how it was typed',
  PROPS.every((c) => L.isPropertyCategory(` ${c.toUpperCase()} `) === true
    && L.isPropertyCategory(c) === true));
ok('...and it still says no to something that is not one of them',
  L.isPropertyCategory(' MATERIALS ') === false && L.isPropertyCategory('') === false);

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE PLUMBER'S LIST IS UNTOUCHED. This is the regression that would cost him money.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 2. a man with no property sees exactly what he saw before ===\n');

const tradeOnly = ALL.filter((c) => !PROPS.includes(c));
ok('🔴 EVERY TRADE CATEGORY SURVIVES THE GATE, so no deduction is quietly taken off his list',
  tradeOnly.every((c) => shut.includes(c)));
ok('🔴 AND IN EXACTLY THE ORDER lib/categories.ts PUTS THEM IN',
  JSON.stringify(shut) === JSON.stringify(tradeOnly));
ok('🔴 AND NOT ONE PROPERTY CATEGORY REACHES HIM',
  PROPS.every((c) => !shut.includes(c)));
ok('other is still on his list, because "nothing fits" is a real answer',
  shut.includes('other'));

// ---------------------------------------------------------------------------------------------
// 3. THE LANDLORD'S LIST.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 3. a man who lets something gets all four, as a group ===\n');

ok('every property category reaches him', PROPS.every((c) => open.includes(c)));
ok('and every trade category still does too', tradeOnly.every((c) => open.includes(c)));
ok('🔴 THE FOUR ARE APPENDED AS A SET rather than scattered through a cost sheet',
  JSON.stringify(open.slice(-PROPS.length).slice().sort()) === JSON.stringify(PROPS.slice().sort()));
ok('nothing is duplicated and nothing is invented', new Set(open).size === open.length
  && open.every((c) => ALL.includes(c)));

// ---------------------------------------------------------------------------------------------
// 4. THE WIRING, AND THE ONE GATE BOTH HALVES SHARE.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 4. the screen asks the module, and asks it once ===\n');

const add = read('app/app/money/add/page.tsx');
const addCode = codeOnly(add);

ok('🔴 THE ADD SCREEN ASKS lib/propertylanes.ts', /from '(\.\.\/)+lib\/propertylanes'/.test(addCode)
  && /categoriesFor\(/.test(addCode));
ok('🔴 AND IT NO LONGER MAPS THE WHOLE SHARED LIST STRAIGHT INTO THE PICKER',
  !/\{CATEGORIES\.map\(/.test(addCode));
ok('it keeps no list of its own, which was true before and must stay true',
  !/const CATEGORIES\s*=/.test(addCode));

// 🔴 ONE GATE, NOT TWO. The rent button and the category list must appear together or not at all,
// or a landlord gets somewhere to log rent and nowhere to log what it costs him.
{
  const gate = (addCode.match(/categoriesFor\(CATEGORIES, (\w+)\)/) ?? [])[1];
  ok('🔴 THE CATEGORY LIST IS GATED ON A NAMED CONDITION', !!gate);
  ok('🔴 AND IT IS THE SAME ONE THE RENT BUTTON USES, so the two halves of the property story'
    + ' appear together or not at all',
    !!gate && new RegExp(`\\{${gate} \\? \\(`).test(addCode));
  ok('...and that condition is the account\'s own rental stream, read from the database',
    !!gate && new RegExp(`${gate}[,\\]]`).test(addCode) && /accountHasRental\(user\.id\)/.test(addCode));
}

// ---------------------------------------------------------------------------------------------
// 5. THE OTHER SCREEN THAT ALREADY DID THIS, PINNED SO THE TWO CANNOT DRIFT.
// ---------------------------------------------------------------------------------------------
console.log('\n=== 5. the pile and the add screen now ask the same question ===\n');

const pile = codeOnly(read('app/app/pile/page.tsx'));
ok('🔴 THE PILE STILL GATES ITS OWN PICKER THE SAME WAY',
  /categoriesFor\(CATEGORIES, \w+\)/.test(pile));
ok('🔴 AND BOTH SCREENS TAKE THE SAME SHARED LIST INTO IT, so there is still ONE list in the product',
  /from '(\.\.\/)+lib\/categories'/.test(pile) && /from '(\.\.\/)+lib\/categories'/.test(addCode));
ok('the module is the only place the four are named, and no screen types them',
  PROPS.every((c) => !addCode.includes(c) && !pile.includes(c)));

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
