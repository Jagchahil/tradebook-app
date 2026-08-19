// B66. THE ANALYTICS SWITCH IS ON AND THE APP MUST ACTUALLY SEND IT SOMETHING. 20 August 2026.
//
//   node test/b66analytics.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Vercel Web Analytics was enabled on the project on 19 August at about 22:35, on the INCLUDED
// tier. Nothing in this codebase sent it a single event: six dependencies, none of them
// @vercel/analytics, and a root layout that returned a bare shell.
//
// A dashboard at zero reads as NO TRAFFIC. It does not read as NOT WIRED. That is this corpus's
// own silence is not honesty lesson wearing a business face, and it is the one measurement Jag will
// judge a marketing spend by.
//
// 🔴 GUARDED AS THE SHAPE, NOT AS THE PATH. This suite DERIVES which layout is the root, by finding
// the one that renders <html>, and then asserts THAT file mounts it. A later tidy that moves the
// root, or adds a second one, cannot silently un measure the product.
//
// ⚠️ AND IT ASSERTS AN ABSENCE TOO. @vercel/speed-insights is NOT bought. It is $10 per project
// per month plus $0.65 per 10,000 data points against zero visitors, and the orchestrator ruled it
// waits for traffic. A component for a product that is not enabled is dead code that reports
// nothing, so the absence is pinned rather than left to somebody's memory.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments argue at length and name the very strings this suite is about, so a check for CODE
// strips them first. Copied from test/landlord.test.mjs rather than reinvented: the comment
// stripping trap has been found seven times in this corpus and every one was a fresh helper.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// Every layout in the app tree, found rather than listed.
const layouts = [];
(function walk(rel) {
  for (const entry of readdirSync(path.join(root, rel))) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(root, rel, entry);
    if (statSync(full).isDirectory()) walk(path.join(rel, entry));
    else if (entry === 'layout.tsx') layouts.push(path.join(rel, entry));
  }
})('app');

console.log('\n=== which layout is the root, derived rather than trusted ===\n');

ok('the app tree has layouts to look at, so an empty walk cannot pass vacuously', layouts.length > 0);

// The ROOT layout is the one that renders the document itself. Next.js permits exactly one.
const roots = layouts.filter((f) => /<html[\s>]/.test(codeOnly(read(f))));
ok('🔴 EXACTLY ONE LAYOUT RENDERS <html>, which is what makes it the root', roots.length === 1);
ok('...and it is app/layout.tsx', roots[0] === path.join('app', 'layout.tsx'));

const rootSrc = read(roots[0]);
const rootCode = codeOnly(rootSrc);

console.log('\n=== the mount ===\n');

ok('🔴 THE ROOT LAYOUT IMPORTS THE ANALYTICS COMPONENT FROM THE NEXT ENTRY POINT',
  /import \{ Analytics \} from '@vercel\/analytics\/next';/.test(rootCode));
ok('🔴 AND IT ACTUALLY RENDERS IT', /<Analytics \/>/.test(rootCode));
ok('...inside the body, where the script belongs', /<body>[\s\S]*<Analytics \/>[\s\S]*<\/body>/.test(rootCode));
ok('...and the page still renders its children, which a careless edit could drop',
  /\{children\}/.test(rootCode));
ok('the lang attribute is still there, because it is a WCAG 2.1 Level A gap when it is not',
  /<html lang="en">/.test(rootCode));

// ONE MOUNT, NOT TWO. A second one anywhere would double count every page view.
{
  const mounts = [];
  (function walk(rel) {
    for (const entry of readdirSync(path.join(root, rel))) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = path.join(root, rel, entry);
      if (statSync(full).isDirectory()) walk(path.join(rel, entry));
      else if (/\.tsx?$/.test(entry) && /<Analytics \/>/.test(codeOnly(readFileSync(full, 'utf8')))) {
        mounts.push(path.join(rel, entry));
      }
    }
  })('app');
  ok('🔴 IT IS MOUNTED EXACTLY ONCE IN THE WHOLE APP TREE, so nothing is counted twice',
    mounts.length === 1 && mounts[0] === roots[0]);
}

console.log('\n=== the dependency ===\n');

const pkg = JSON.parse(read('package.json'));
ok('🔴 @vercel/analytics IS A REAL DEPENDENCY, not a dev one: it ships to the browser',
  Object.prototype.hasOwnProperty.call(pkg.dependencies ?? {}, '@vercel/analytics'));
ok('...and it is not also in devDependencies, which is how a build starts disagreeing with itself',
  !Object.prototype.hasOwnProperty.call(pkg.devDependencies ?? {}, '@vercel/analytics'));
ok('🔴 AND THE LOCKFILE CARRIES IT, because Vercel builds with npm ci and a lockfile that has not'
  + ' been updated installs nothing',
  /"node_modules\/@vercel\/analytics"/.test(read('package-lock.json')));

console.log('\n=== what is deliberately NOT here ===\n');

const appTree = [];
(function walk(rel) {
  for (const entry of readdirSync(path.join(root, rel))) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(root, rel, entry);
    if (statSync(full).isDirectory()) walk(path.join(rel, entry));
    else if (/\.tsx?$/.test(entry)) appTree.push(codeOnly(readFileSync(full, 'utf8')));
  }
})('app');

ok('🔴 SPEED INSIGHTS IS NOT A DEPENDENCY. It is a purchase, not a toggle, and it is not bought',
  !Object.prototype.hasOwnProperty.call(pkg.dependencies ?? {}, '@vercel/speed-insights')
  && !Object.prototype.hasOwnProperty.call(pkg.devDependencies ?? {}, '@vercel/speed-insights'));
ok('🔴 AND NOTHING MOUNTS IT, because a component for a product that is not enabled is dead code',
  appTree.every((s) => !/<SpeedInsights/.test(s) && !/speed-insights/.test(s)));

// 🔴 LEKHIO MEASURES NOTHING ELSE, AND THAT IS A DELIBERATE STATE NOBODY HAD WRITTEN DOWN.
// Vercel Web Analytics is cookieless and stores no personal data, which is the right answer for a
// product holding tax records. Every one of these alternatives sets a cookie or ships an identity
// graph, and adding one to a tax product is a decision, not a tidy.
const OTHER_TRACKERS = [
  'googletagmanager', 'google-analytics', 'gtag(', 'plausible.io', 'posthog',
  'mixpanel', 'segment.com', 'analytics.js', 'fathom', 'hotjar', 'fullstory',
];
{
  const found = OTHER_TRACKERS.filter((t) => appTree.some((s) => s.includes(t)));
  ok('🔴 NO OTHER TRACKER IS WIRED INTO THIS PRODUCT, which is cookieless by choice rather than by'
    + ' oversight', found.length === 0);
  if (found.length) console.log(`     found: ${found.join(', ')}`);
}

console.log(`\n  ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
