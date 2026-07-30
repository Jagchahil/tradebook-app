// The duplication lock. Run: node test/sharedcss.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 app/page.tsx KEEPS ITS OWN COPY OF THE MARKETING STYLESHEET, AND THAT COPY HAS TWICE NOW
// SILENTLY IGNORED A FIX.
//
// MARKETING_CSS in app/_shared/site.tsx is scoped .mkt and HOME_CSS in app/page.tsx is scoped
// .home. Around a hundred and thirteen rules are identical between them once you rename the scope.
// On 30 July the "Approve and send to HMRC" button was fixed in one and stayed broken at 2.37:1 in
// the other, and .appphone turned out to be declared twice in one file with different values.
//
// THE OBVIOUS FIX IS TO MERGE THEM AND IT IS NOT SAFE TODAY. They have really diverged: .truststrip
// .row is a four column grid on the home page and a wrapping flex row everywhere else, same
// selector, different layout. Collapsing that is a visual change to the front door, not a tidy up,
// and it wants doing with eyes on it rather than five days before a launch.
//
// So until somebody merges them properly, the duplication is made SAFE instead of pretended away:
// any rule that appears in BOTH files must be identical. Fix one and forget the other and this
// fails, by name, with both versions printed. Rules that exist in only one file are that page's
// own business and are left alone.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

// Pull a tagged template literal out by the name it is assigned to.
function block(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const open = src.indexOf('`', i);
  const close = src.indexOf('`;', open + 1);
  return open < 0 || close < 0 ? null : src.slice(open + 1, close);
}

// Selector to declarations, with the page scope normalised away so .mkt .btn and .home .btn are
// recognised as the same rule. Media queries are kept whole and keyed by their own text.
function rules(css, scope) {
  const out = new Map();
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /(@media[^{]*\{(?:[^{}]*\{[^{}]*\}\s*)*\}|[^{}@]+\{[^{}]*\})/g;
  for (const m of flat.match(re) || []) {
    const chunk = m.trim();
    if (chunk.startsWith('@media')) { out.set(norm(chunk, scope), ''); continue; }
    const brace = chunk.indexOf('{');
    const sel = norm(chunk.slice(0, brace), scope);
    const body = chunk.slice(brace + 1, chunk.lastIndexOf('}')).trim().replace(/;\s*$/, '');
    if (sel) out.set(sel, body);
  }
  return out;
}
const norm = (s, scope) => s.replace(new RegExp(`\\.${scope}\\b`, 'g'), '.SCOPE').replace(/\s+/g, ' ').trim();

const site = readFileSync(path.join(root, 'app/_shared/site.tsx'), 'utf8');
const home = readFileSync(path.join(root, 'app/page.tsx'), 'utf8');
const mkt = block(site, 'export const MARKETING_CSS =');
const hom = block(home, 'const HOME_CSS =');

console.log('\n=== both stylesheets are still where the guard expects them ===\n');
ok('MARKETING_CSS found in app/_shared/site.tsx', typeof mkt === 'string' && mkt.length > 500);
ok('HOME_CSS found in app/page.tsx', typeof hom === 'string' && hom.length > 500);

if (mkt && hom) {
  const A = rules(mkt, 'mkt');
  const B = rules(hom, 'home');
  const shared = [...A.keys()].filter((k) => B.has(k));

  console.log('\n=== rules the two copies share must not disagree ===\n');
  ok(`the two stylesheets still share rules (${shared.length} of ${A.size} and ${B.size})`, shared.length > 40);

  // ⚠️ ONE DELIBERATE DIFFERENCE, NAMED. The home page lays the trust strip out as a four column
  // grid because it has the width for it above the fold. Every other page wraps it as a flex row.
  // Same selector, different layout, on purpose. This is the ONLY entry that belongs in here: if a
  // second one turns up, the honest move is almost always to make the two copies agree, not to
  // extend this list. Anything added here should say why, in a sentence, like this one.
  const ALLOWED_TO_DIFFER = new Set(['.truststrip .row']);

  const drift = shared.filter((k) => A.get(k) !== B.get(k) && !ALLOWED_TO_DIFFER.has(k));
  const excused = shared.filter((k) => A.get(k) !== B.get(k) && ALLOWED_TO_DIFFER.has(k));
  ok(`exactly the named exceptions differ (${excused.length} of ${ALLOWED_TO_DIFFER.size})`,
    excused.length === ALLOWED_TO_DIFFER.size);
  for (const k of drift) {
    console.log(`        ${k}`);
    console.log(`          site.tsx : ${A.get(k).slice(0, 110)}`);
    console.log(`          page.tsx : ${B.get(k).slice(0, 110)}`);
  }
  ok('no rule present in both copies has drifted apart', drift.length === 0);

  // The specific pair that was wrong for hours on the deployed site. Named so that a future merge
  // cannot quietly drop the check that caught it.
  const approve = [...A.keys()].find((k) => k.includes('approvebtn'));
  ok('.approvebtn exists in both and agrees',
    !!approve && B.has(approve) && A.get(approve) === B.get(approve));
  ok('.approvebtn does not write white on the green', !!approve && !/color:#fff\b/.test(A.get(approve)));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
