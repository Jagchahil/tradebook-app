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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE SANITISER ONLY EVER RAN ON THE MODEL'S OUTPUT.
//
// houseCopy() is wired into lib/claude.ts, announcements and the calendar, because an em dash from
// a language model was the failure everybody expected. Hand written strings were assumed to already
// follow the rule, and on 30 July twenty of them did not: a WhatsApp reply that read "Sorry, I could
// not write up that voice note" with an em dash in it, the footer of every email we send, and five
// lines of the newsletter.
//
// A rule the codebase cannot check is a rule nobody keeps, so it is checked here, at the source,
// for the copy that reaches a person. Comments are exempt: they are held to the same rule by hand
// but a dash in one has never reached a customer, and failing the build over a comment would teach
// people to stop reading the failure.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== no forbidden dash in copy that reaches a customer ===\n');
{
  const { readdirSync, lstatSync } = await import('node:fs');
  const repo = path.resolve(here, '..');
  const SKIP = ['node_modules', '.git', '.next', '_to_delete', '_scale_review', path.join('app', 'team'), 'test'];
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
      if (e.startsWith('.')) continue;
      const full = path.join(dir, e);
      const rel = path.relative(repo, full);
      if (SKIP.some((s) => rel === s || rel.startsWith(s + path.sep))) continue;
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(e)) out.push(full);
    }
    return out;
  };
  // Quoted strings and plain JSX text. Deliberately not a whole file scan: the sanitiser in this
  // very file has to contain the characters it removes.
  const spans = (line) => {
    const found = [];
    const q = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
    for (const m of line.matchAll(q)) found.push(m[1] ?? m[2] ?? m[3] ?? '');
    for (const m of line.matchAll(/>([^<>{}]{4,})</g)) found.push(m[1]);
    return found;
  };
  const offenders = [];
  for (const file of walk(repo)) {
    const rel = path.relative(repo, file);
    if (rel === path.join('lib', 'housestyle.ts')) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const s = line.trim();
      if (s.startsWith('//') || s.startsWith('*')) return;
      for (const str of spans(line)) {
        if (/[\u2014\u2013]/.test(str)) { offenders.push(`${rel}:${i + 1}  ${str.trim().slice(0, 70)}`); break; }
      }
    });
  }
  offenders.slice(0, 12).forEach((o) => console.log(`        ${o}`));
  ok('no em dash or en dash in any customer facing string', offenders.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
