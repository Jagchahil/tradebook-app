// The house-style lock: the deterministic dash sanitiser every outgoing word passes through.
// Run: node test/housestyle.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'house-'));
writeFileSync(path.join(stage, 'housestyle.ts'), readFileSync(path.join(lib, 'housestyle.ts'), 'utf8'));
const H = await import(pathToFileURL(path.join(stage, 'housestyle.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

console.log('\n=== sanitiseDashes: removes forbidden dashes ===\n');
ok('em dash sentence -> comma', H.sanitiseDashes('You pay tax — a lot of it.') === 'You pay tax, a lot of it.');
ok('en dash sentence -> comma', H.sanitiseDashes('It is simple – text us.') === 'It is simple, text us.');
ok('em dash no spaces -> comma', H.sanitiseDashes('now—later') === 'now, later');
ok('en dash between digits -> to', H.sanitiseDashes('£12,570–50,270') === '£12,570 to 50,270');
ok('spaced en dash digits -> to', H.sanitiseDashes('12570 – 50270') === '12570 to 50270');
ok('spaced hyphen digits -> to', H.sanitiseDashes('5 - 10 miles') === '5 to 10 miles');
ok('spaced hyphen sentence -> comma', H.sanitiseDashes('Book now - it is free.') === 'Book now, it is free.');
ok('minus sign -> plain hyphen', H.sanitiseDashes('profit −500') === 'profit -500');

console.log('\n=== sanitiseDashes: preserves legitimate hyphens ===\n');
ok('hyphenated word untouched', H.sanitiseDashes('a self-employed plumber') === 'a self-employed plumber');
ok('list bullet at line start untouched', H.sanitiseDashes('Claims:\n- phone\n- van') === 'Claims:\n- phone\n- van');
ok('range already in words untouched', H.sanitiseDashes('£12,570 to £50,270') === '£12,570 to £50,270');
ok('plain text untouched', H.sanitiseDashes('Text us your receipt today.') === 'Text us your receipt today.');

console.log('\n=== hasForbiddenDash + houseCopy ===\n');
ok('detects em dash', H.hasForbiddenDash('tax — bill') === true);
ok('detects spaced sentence hyphen', H.hasForbiddenDash('now - later') === true);
ok('clean text is clean', H.hasForbiddenDash('self-employed, paid weekly') === false);
ok('bullets are clean', H.hasForbiddenDash('- one\n- two') === false);
ok('houseCopy trims and strips', H.houseCopy('  You owe tax — pay it.  ') === 'You owe tax, pay it.');
ok('houseCopy passes null through', H.houseCopy(null) === null);
ok('houseCopy passes empty through', H.houseCopy('') === null);
ok('NO_DASH_RULE names the rule', typeof H.NO_DASH_RULE === 'string' && H.NO_DASH_RULE.includes('em dash'));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
