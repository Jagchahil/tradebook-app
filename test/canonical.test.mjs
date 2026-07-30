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
import { readFileSync, existsSync } from 'node:fs';
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
// ⚠️ A canonical on a noindex page is noise, and noise is where real signals go to hide.
for (const p of ['app/in/page.tsx', 'app/hmrc/connected/page.tsx']) {
  const src = readFileSync(path.join(root, p), 'utf8');
  ok(`${p} is noindex and carries no canonical`,
    /robots:\s*\{\s*index:\s*false/.test(src) && !src.includes('canonical:'));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
