// Every page we ask to be indexed must say which URL it is. Run: node test/canonical.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 TWENTY FOUR OF TWENTY FIVE PAGES HAD NO CANONICAL, INCLUDING EVERY TRADE LANDING PAGE.
//
// Found on 30 July by reading the deployed HTML rather than the source. Only /file-your-tax-return
// declared one, and it had to set its own metadataBase to do it because the root layout had none
// to inherit.
//
// Without a canonical, lekhio.app/pricing, www.lekhio.app/pricing, and every ?utm= , ?fbclid= and
// ?gclid= variant are separate pages to a search engine, and each one gets a slice of the ranking
// instead of one page getting all of it. The entire free tools strategy is these pages climbing
// search results. It was leaking quietly, in a way no test and no green build would ever show.
//
// ⚠️ THE SITEMAP IS THE SOURCE OF TRUTH HERE, NOT A LIST TYPED INTO THIS FILE. Add a route to
// app/sitemap.ts without a canonical on the page and this fails, which is the only ordering that
// survives somebody adding the twenty third free tool in six months.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

const sitemap = readFileSync(path.join(root, 'app/sitemap.ts'), 'utf8');
const layout = readFileSync(path.join(root, 'app/layout.tsx'), 'utf8');

console.log('\n=== the base every canonical is resolved against ===\n');
ok('the root layout sets metadataBase', /metadataBase:\s*new URL\(/.test(layout));
ok('it falls back to the live domain rather than throwing', layout.includes('https://lekhio.app'));

console.log('\n=== every indexed route declares its canonical ===\n');
// The static list, read out of the sitemap itself.
const block = sitemap.slice(sitemap.indexOf('const ROUTES = ['), sitemap.indexOf('];', sitemap.indexOf('const ROUTES = [')));
const routes = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1]);
ok(`the sitemap still lists its routes where this test can read them (${routes.length})`, routes.length > 15);

const missing = [];
for (const r of routes) {
  const dir = r === '' ? 'app' : path.join('app', r);
  // metadata may live on the page or, for client component pages, on a sibling layout
  const candidates = [path.join(root, dir, 'page.tsx'), path.join(root, dir, 'layout.tsx')];
  const found = candidates.filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8'));
  if (!found.length) { missing.push(`${r || '/'} has no page.tsx at all`); continue; }
  const want = `canonical: '${r === '' ? '/' : '/' + r}'`;
  if (!found.some((src) => src.includes(want))) missing.push(`${r || '/'} is in the sitemap with no ${want}`);
}
missing.forEach((m) => console.log(`        ${m}`));
ok('no route in the sitemap is missing its canonical', missing.length === 0);

// The long tail. One template, so one assertion, but it covers every trade in lib/trades.ts.
const trade = readFileSync(path.join(root, 'app/for/[trade]/page.tsx'), 'utf8');
ok('the trade landing pages set a canonical from the slug',
  /alternates:\s*\{\s*canonical:\s*`\/for\/\$\{t\.slug\}`/.test(trade));

console.log('\n=== and pages we ask search engines to skip do not pretend otherwise ===\n');
// ⚠️ DOT DIRECTORIES AND SYMLINKS SKIPPED. app/.node/bin/corepack is a broken symlink committed
// into this repo and it takes down any walk that follows one. Same lesson as test/tokens.test.mjs.
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const full = path.join(dir, e);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(e) && !e.includes('fuse_hidden')) out.push(full);
  }
  return out;
}

// ⚠️ A canonical on a noindex page is noise, and noise is where real signals go to hide.
//
// 🔴 THIS WAS TWO PATHS TYPED BY HAND AND THIS FILE'S OWN BANNER SAYS NOT TO DO THAT. It opens
// with "THE SITEMAP IS THE SOURCE OF TRUTH HERE, NOT A LIST TYPED INTO THIS FILE", which is true
// of everything above and was not true of this. There are FIVE noindex surfaces, not two:
// app/account, app/app/layout and app/share/[token] were all outside it. All three are clean, so
// nothing was broken, but a rule enforced on two of the five it names is not enforced.
//
// The list is found the same way you would find it by hand, by looking for the thing itself.
const noindex = walk(path.join(root, 'app'))
  .filter((f) => /\/(page|layout)\.tsx$/.test(f))
  .filter((f) => /robots:\s*\{\s*index:\s*false/.test(readFileSync(f, 'utf8')))
  .map((f) => path.relative(root, f));
ok(`🔴 every noindex surface is found, and there are ${noindex.length}`,
  noindex.length >= 5 && noindex.includes('app/in/page.tsx') && noindex.includes('app/account/page.tsx'));
for (const p of noindex) {
  const src = readFileSync(path.join(root, p), 'utf8');
  ok(`${p} is noindex and carries no canonical`, !src.includes('canonical:'));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
