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
// for the copy that reaches a person.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE EXEMPTION FOR COMMENTS, REOPENED ON 31 JULY 2026 AND KEPT, NARROWED.
//
// The old reasoning said comments are exempt because a dash in one has never reached a customer and
// failing the build over a comment would teach people to stop reading the failure. Both halves of
// that are still true. What it did not weigh is that CLAUDE.md does not offer the exemption: the no
// dash rule "Applies to all copy: UI, WhatsApp messages, docs, comments". A blanket exemption
// written into the checker is the checker disagreeing with the standing instruction in silence,
// which is worse than either answer taken openly.
//
// So it was measured rather than argued. Closing it outright would have failed the build on 47
// comment lines across 21 files, in a repo several agents were editing at that moment, and a red
// build that everybody has to fix before they can ship anything is precisely the build people learn
// to skim. That is not a handful.
//
// THE ANSWER IS THREE PARTS, and it is a ratchet rather than a truce:
//
//   1. THE BLOCKING CHECK STILL EXEMPTS COMMENTS, for the copy scan below. Its job is the sentence
//      a customer reads, and it should go red for that and for nothing else.
//   2. A NAMED LIST OF FILES IS HELD TO THE WHOLE RULE, comments included, and it BLOCKS. It starts
//      with the three cleaned on 31 July. A file goes on the list the day it is cleaned and it can
//      never regress. The list is the only part that can fail, and it can only fail on a file
//      somebody has already finished, which is a failure with an obvious owner and an obvious fix.
//   3. A SURVEY PRINTS EVERY REMAINING COMMENT OFFENDER, file and line, and NEVER FAILS. The debt
//      is counted out loud on every run instead of being invisible, so the next person to clean one
//      does not have to go looking for it, and nobody has to argue about how big it is.
// ═══════════════════════════════════════════════════════════════════════════════════════════
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
const DASH = /[\u2014\u2013]/;
const isComment = (line) => {
  const s = line.trim();
  return s.startsWith('//') || s.startsWith('*');
};
// lib/housestyle.ts is the sanitiser itself and has to contain the characters it removes.
const SANITISER = path.join('lib', 'housestyle.ts');
const files = walk(repo).map((f) => [path.relative(repo, f), readFileSync(f, 'utf8').split('\n')]);

console.log('\n=== no forbidden dash in copy that reaches a customer ===\n');
{
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
  for (const [rel, lines] of files) {
    if (rel === SANITISER) continue;
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      for (const str of spans(line)) {
        if (DASH.test(str)) { offenders.push(`${rel}:${i + 1}  ${str.trim().slice(0, 70)}`); break; }
      }
    });
  }
  offenders.slice(0, 12).forEach((o) => console.log(`        ${o}`));
  ok('no em dash or en dash in any customer facing string', offenders.length === 0);
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// PART 2 OF THE ANSWER ABOVE. THE FILES HELD TO THE WHOLE RULE, COMMENTS AND ALL.
//
// Add a file here the day its comments are clean. It can then never regress, and a file that is not
// on the list is not being let off, it is queued: the survey underneath prints exactly where it is.
//
// The three below were cleaned on 31 July 2026, named in the brief that reopened this question:
// a Stripe receipt comment, and one in each half of the voice worker handshake.
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
console.log('\n=== files held to the whole rule, comments included ===\n');
{
  const COMMENTS_TOO = [
    path.join('app', 'api', 'stripe', 'webhook', 'route.ts'),
    path.join('app', 'api', 'voice', 'complete', 'route.ts'),
    path.join('app', 'api', 'voice', 'pending', 'route.ts'),
  ];
  const known = new Map(files);
  for (const rel of COMMENTS_TOO) {
    const lines = known.get(rel);
    // A missing file is a FAILURE, not a skip. A list that silently shrinks when somebody renames a
    // route is a list that stops meaning anything, quietly, which is the whole failure mode here.
    if (!lines) { ok(`${rel} is on the list and exists`, false); continue; }
    const bad = lines
      .map((line, i) => (DASH.test(line) ? `${rel}:${i + 1}  ${line.trim().slice(0, 70)}` : null))
      .filter(Boolean);
    bad.forEach((b) => console.log(`        ${b}`));
    ok(`${rel}: no em dash or en dash anywhere, comments included`, bad.length === 0);
  }
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// PART 3. THE SURVEY. IT COUNTS THE DEBT OUT LOUD AND IT NEVER FAILS.
//
// Not an assertion. No ok(), no exit code, on purpose: the moment this can go red it is the blanket
// check that was already rejected two comments up. What it buys is that the number is on the screen
// of every run, so "how many are left" is never a question anybody has to go and measure again.
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
console.log('\n=== survey: dashes still sitting in comments (not a failure) ===\n');
{
  const byFile = new Map();
  for (const [rel, lines] of files) {
    if (rel === SANITISER) continue;
    lines.forEach((line, i) => {
      if (!isComment(line) || !DASH.test(line)) return;
      if (!byFile.has(rel)) byFile.set(rel, []);
      byFile.get(rel).push(i + 1);
    });
  }
  const total = [...byFile.values()].reduce((n, xs) => n + xs.length, 0);
  [...byFile.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([rel, ls]) => console.log(`        ${String(ls.length).padStart(3)}  ${rel}  (lines ${ls.slice(0, 6).join(', ')}${ls.length > 6 ? ', ...' : ''})`));
  console.log(`\n        ${total} comment ${total === 1 ? 'line' : 'lines'} in ${byFile.size} ${byFile.size === 1 ? 'file' : 'files'}. Clean one, then add the file to COMMENTS_TOO above.`);
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
