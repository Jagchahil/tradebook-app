// The domain guard.
//
// Our domain is lekhio.app. lekhio.com is NOT ours: it belongs to Lacspace
// Corporation Pvt. Ltd., who sell a B2B/B2C ERP that is also called Lekhio, in our
// adjacent market. It was taken before we could buy it, which is why we are on .app.
//
// The switch to lekhio.app was decided on 7 July 2026 and written down in docs/93,
// but nobody ever grepped the code for the old string. So for four days we shipped:
//
//   . Privacy Policy and Terms links pointing at lekhio.com, where both 404,
//     which on its own is an automatic App Store rejection
//   . "Made free with Lekhio . lekhio.com" printed on the footer of every invoice
//     our users send to their own customers
//   . every referral link
//   . support@lekhio.com, a mailbox we cannot read
//   . their origin in our CORS allowlist
//
// Four separate audits walked past it, because "lekhio.com" is exactly what our
// domain SHOULD have been. It reads as correct. No linter, type check or unit test
// catches a plausible looking wrong string, and a human skims straight over it.
//
// So this test exists. It is the cheapest possible check and it makes the mistake
// unrepeatable: if the string comes back anywhere in the code we ship, the suite
// goes red. If you need the site URL, use NEXT_PUBLIC_APP_URL or the SITE constant.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '..');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.expo', 'dist', 'build', 'out']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.css']);

// This file necessarily contains the forbidden string, in the explanation above.
const SELF = path.resolve(here, 'domain.test.mjs');

function walk(dir, hits) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return hits;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, hits);
      continue;
    }
    if (!CODE_EXT.has(path.extname(entry))) continue;
    if (full === SELF) continue;

    const text = readFileSync(full, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (!line.includes('lekhio.com')) return;
      // A comment that warns about the domain is the point, not a violation.
      const warns = /not lekhio\.com|NOT lekhio\.com|do not own|does not belong|unrelated ERP|Lacspace|belongs to|not a mailbox/i.test(line);
      if (warns) return;
      hits.push(`${path.relative(repoRoot, full)}:${i + 1}: ${line.trim()}`);
    });
  }
  return hits;
}

console.log('\nDomain guard: lekhio.app is ours, lekhio.com is not.\n');

// Scan the two things we actually ship: the website and the mobile app.
const hits = [];
walk(path.join(webRoot, 'app'), hits);
walk(path.join(webRoot, 'lib'), hits);
walk(path.join(webRoot, 'test'), hits);
const middleware = path.join(webRoot, 'middleware.ts');
try {
  statSync(middleware);
  walk(webRoot === path.dirname(middleware) ? path.dirname(middleware) : webRoot, []); // no-op guard
  readFileSync(middleware, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (!line.includes('lekhio.com')) return;
      if (/not lekhio\.com|NOT lekhio\.com|do not own|unrelated ERP|Lacspace|belongs to/i.test(line)) return;
      hits.push(`tradebook-web/middleware.ts:${i + 1}: ${line.trim()}`);
    });
} catch {
  /* middleware is optional */
}

const appRoot = path.join(repoRoot, 'tradebook-app');
try {
  statSync(appRoot);
  walk(path.join(appRoot, 'app'), hits);
  walk(path.join(appRoot, 'lib'), hits);
  walk(path.join(appRoot, 'components'), hits);
} catch {
  /* the mobile app is not always present in a partial copy */
}

if (hits.length) {
  console.log('\n  lekhio.com found in shipping code. It is NOT our domain:\n');
  for (const h of hits) console.log(`    ${h}`);
  console.log('\n  Use NEXT_PUBLIC_APP_URL or the SITE constant, never a hardcoded domain.\n');
}

ok('no lekhio.com anywhere in the website or the app', hits.length === 0);

// And prove the replacement is actually right, so this cannot be "fixed" by
// deleting the string and leaving nothing behind.
const site = readFileSync(path.join(webRoot, 'app/_shared/site.tsx'), 'utf8');
ok('the SITE constant is driven by NEXT_PUBLIC_APP_URL', /export const SITE\s*=\s*process\.env\.NEXT_PUBLIC_APP_URL/.test(site));

const mw = readFileSync(middleware, 'utf8');
ok('the CORS allowlist trusts lekhio.app', mw.includes('https://lekhio.app'));
ok('the CORS allowlist does not trust a domain we do not own', !/'https:\/\/(www\.)?lekhio\.com'/.test(mw));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
