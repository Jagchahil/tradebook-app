// 🔴 THE BODIES-WATCH TEST. Runs in the web repo's run-all; the file it tests runs on the mini.
//
// It proves:
//   1. compare() behaves: first sight is a baseline, an unchanged body says nothing, a moved hash is
//      flagged as 'silent' with a note telling a human to go and look.
//   2. Every source in bodies.json is on a host the 27 Jul terms-of-use sweep actually cleared. A
//      watcher pointed at a source we may not scrape is a legal problem, not a bug, and fails the build.
//   3. textOf() strips the furniture (script, style, nav, header, footer, comments, tags) rather than
//      hashing raw HTML, so a stylesheet edit does not read as a content change.
//   4. 🔴 EVERY EXCLUDED SOURCE STAYS EXCLUDED. bodies.json's `_excluded` list names FCA/OPBAS/AAT/
//      ICAS/NICEIC and others with a reason each; this test fails if any of their hosts ever sneak
//      into ALLOWED_HOSTS, so a future careless edit cannot quietly start scraping a site whose terms
//      forbid it.
//   5. bodies.mjs actually persists (khoji_bodies + a kind='bodies' khoji_runs heartbeat), not just a
//      comment describing a write, the exact bug lawwatch.mjs shipped with once.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, isAllowed, textOf, loadSources, ALLOWED_HOSTS } from './bodies.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nkhoji-bodies: the professional/regulatory bodies stay fresh, or the console says so');

// --- 1. compare() ---------------------------------------------------------------------------
const prev = { bodyHash: 'aaaa' };

ok('FIRST SIGHT IS A BASELINE, NOT AN ALARM',
  compare(null, { bodyHash: 'aaaa' }).verdict === 'baseline');

ok('an unchanged page says nothing at all',
  compare(prev, { bodyHash: 'aaaa' }).verdict === 'unchanged');

ok('🔴 A MOVED HASH is raised as silent, with a note telling a human to look',
  (() => { const r = compare(prev, { bodyHash: 'bbbb' }); return r.verdict === 'silent' && /has to read it/i.test(r.note); })());

// --- 2. licensing -----------------------------------------------------------------------------
const raw = JSON.parse(readFileSync(path.join(HERE, 'bodies.json'), 'utf8'));
const sources = loadSources();

ok('bodies.json has at least one source (the sweep found real, clean ones)',
  sources.length > 0);

ok('🔴 EVERY watched source is on a host the 27 Jul sweep cleared',
  sources.every((s) => isAllowed(s.url)));

ok('...and an unlicensed/unrelated host is correctly refused',
  !isAllowed('https://www.icaew.com/technical/tax/tax-faculty')
  && !isAllowed('https://en.wikipedia.org/wiki/Value-added_tax'));

// --- 3. 🔴 THE EXCLUDED SOURCES NEVER SNEAK BACK IN --------------------------------------------
//
// Named explicitly, checked by host, so a future edit that adds "just one guidance page" from one
// of these cannot pass silently. FCA-family hosts are the one that matters most: their terms
// EXPLICITLY prohibit bots, and ICAS/NICEIC explicitly name-block AI crawlers in their robots.txt.
const EXCLUDED_HOSTS = [
  'www.fca.org.uk', 'fca.org.uk',
  'www.icaew.com', 'icaew.com',
  'www.iab.org.uk', 'iab.org.uk',
  'www.aat.org.uk', 'aat.org.uk',
  'www.icas.com', 'icas.com',
  'www.niceic.com', 'niceic.com',
  'www.tax.org.uk', 'tax.org.uk',
  'www.accaglobal.com', 'accaglobal.com',
  'www.ifa.org.uk', 'ifa.org.uk',
  'www.gassaferegister.co.uk', 'gassaferegister.co.uk',
  'www.trustmark.org.uk', 'trustmark.org.uk',
  'www.thepensionsregulator.gov.uk', 'thepensionsregulator.gov.uk',
  'www.gla.gov.uk', 'gla.gov.uk',
];

ok('🔴 an explicit test of `_excluded` in bodies.json actually lists something (the sweep is documented, not just remembered)',
  Array.isArray(raw._excluded) && raw._excluded.length >= 10);

ok('🔴 NONE of the excluded hosts are allowed, including the two with an explicit anti-AI-crawler stance (ICAS, NICEIC)',
  EXCLUDED_HOSTS.every((h) => !ALLOWED_HOSTS.includes(h)));

ok('...checked the other way too: no allowed URL resolves to an excluded host',
  sources.every((s) => !EXCLUDED_HOSTS.includes(new URL(s.url).host.toLowerCase())));

// --- 4. textOf() strips furniture, does not hash raw HTML --------------------------------------
const html = `<html><head><style>.x{color:red}</style></head><body><nav>Skip to content</nav>
<script>trackPageView();</script>
<header>Site Header</header>
<!-- a comment -->
<main><h1>VAT registration guidance</h1><p>The threshold is &pound;90,000.</p></main>
<footer>Copyright 2026</footer></body></html>`;

ok('script content is stripped', !textOf(html).includes('trackPageView'));
ok('style content is stripped', !textOf(html).includes('color:red'));
ok('nav/header/footer landmarks are stripped', !/Skip to content|Site Header|Copyright 2026/.test(textOf(html)));
ok('comments are stripped', !textOf(html).includes('a comment'));
ok('the actual content survives', /VAT registration guidance/.test(textOf(html)));
ok('tags themselves are gone', !textOf(html).includes('<') && !textOf(html).includes('>'));

ok('two pages with identical real content but different furniture hash the same',
  (() => {
    const a = textOf('<body><script>x=1</script><main>Same content here</main></body>');
    const b = textOf('<body><script>x=2</script><main>Same content here</main></body>');
    return a === b;
  })());

// --- 5. 🔴 IT ACTUALLY PERSISTS. The test that would have caught the lawwatch-shaped bug. -------
const src = readFileSync(path.resolve(HERE, 'bodies.mjs'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

ok('🔴 bodies.mjs WRITES per-source freshness to khoji_bodies (not a comment, real SQL)',
  /insert into public\.khoji_bodies/.test(src) && /on conflict \(url\) do update/.test(src));

ok('🔴 ...and writes a kind=\'bodies\' heartbeat to khoji_runs EVERY run',
  /insert into public\.khoji_runs/.test(src) && /'bodies'/.test(src));

ok('...and it opens a real db connection (withDb / pg), so those inserts can actually run',
  /async function withDb/.test(src) && /import\('pg'\)/.test(src));

ok('🔴 a change is written to knowledge_items with status=\'needs_distillation\', never trusted verbatim',
  /insert into public\.knowledge_items/.test(src) && /'needs_distillation'/.test(src)
  && !/'verbatim'/.test(src));

ok('🔴 a run that reads nothing exits loud (process.exit(1)), never a quiet green',
  /READ NOTHING/.test(src) && /process\.exit\(1\)/.test(src));

ok('🔴 an unlicensed host in bodies.json refuses to run at all',
  /REFUSING TO RUN/.test(src) && /isAllowed/.test(src));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
