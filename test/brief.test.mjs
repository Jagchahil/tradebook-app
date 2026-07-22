// The brief composer (pure logic in lib/brief.ts). Run: node test/brief.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'brief-'));
// brief.ts imports only types from ./studio and ./studioagent, which type stripping erases at run
// time, so it stands alone. We stage it and import.
writeFileSync(path.join(stage, 'brief.ts'), readFileSync(path.join(lib, 'brief.ts'), 'utf8'));
const B = await import(pathToFileURL(path.join(stage, 'brief.ts')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };
const noDash = (s) => !/[–—−]|\S - \S/.test(s);

console.log('\n=== count is clamped ===\n');
ok('count 0 becomes 1', B.buildStrategy({ trades: ['electrician'], count: 0 }).slate.length === 1);
ok('count 100 clamps to MAX_SLATE', B.buildStrategy({ trades: ['electrician'], count: 100 }).slate.length === B.MAX_SLATE);
ok('count 5 yields 5', B.buildStrategy({ trades: ['electrician'], count: 5 }).slate.length === 5);

console.log('\n=== promises spread, money leads, honesty guaranteed ===\n');
const three = B.buildStrategy({ trades: ['electrician'], count: 3 }).slate;
ok('slot 1 is money', three[0].promise === 'money');
ok('default order carries all three promises', new Set(three.map((s) => s.promise)).size === 3);
const forcedMoney = B.buildStrategy({ trades: ['plumber'], promises: ['money'], count: 4 }).slate;
ok('a money only override still lands one honesty (doctrine)', forcedMoney.some((s) => s.promise === 'honesty'));
const two = B.buildStrategy({ trades: ['plumber'], promises: ['money'], count: 2 }).slate;
ok('under three assets the honesty guarantee does not force', two.every((s) => s.promise === 'money'));

console.log('\n=== trades round robin and any ===\n');
const multi = B.buildStrategy({ trades: ['Electrician', 'electrician', 'Plumber'], count: 4 }).slate;
ok('trades are de duplicated and lower cased', multi[0].trade === 'electrician' && multi[1].trade === 'plumber');
ok('trades cycle', multi[2].trade === 'electrician');
const anySlate = B.buildStrategy({ trades: [], count: 2 }).slate;
ok('empty trades speak to any, stored as null', anySlate[0].trade === null);

console.log('\n=== slots and shape ===\n');
const s5 = B.buildStrategy({ trades: ['roofer'], count: 5 }).slate;
ok('slots are 1..n in order', s5.every((s, i) => s.slot === i + 1));
ok('every slot has a title, format, promise', s5.every((s) => s.title && s.format && s.promise));

console.log('\n=== house style: titles and note carry no forbidden dash ===\n');
const big = B.buildStrategy({ trades: ['electrician', 'plumber', 'barber'], count: B.MAX_SLATE });
ok('all titles are dash free', big.slate.every((s) => noDash(s.title)));
ok('the note is dash free', noDash(big.note));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
