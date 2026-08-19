// SABOTAGE THE ANALYTICS WIRING. B66, 20 August 2026.
//
//   node test/sabotage-b66analytics.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A MEASUREMENT HAS TWO WAYS TO FAIL AND NEITHER OF THEM ERRORS.
//
//   IT STOPS MEASURING. The mount goes, or moves out of the root layout into the signed in tree, or
//   the lockfile is not updated so npm ci installs nothing. The dashboard then reads ZERO, and zero
//   reads as NO TRAFFIC rather than as NOT WIRED. A founder reading it after a marketing push would
//   conclude the campaign failed.
//
//   IT MEASURES TWICE. A second mount anywhere under the root doubles every page view, and the
//   numbers a marketing spend is judged by are inflated by exactly the amount nobody can see.
//
// Both are sabotaged, along with the two things that must never arrive on the way past: Speed
// Insights, which is a purchase nobody made, and a cookie setting tracker in a product that holds
// tax records.
//
// ⚠️ AND THE CONTROLS MATTER MORE THAN USUAL HERE. This guard walks the whole app tree and reads
// source, so it is exactly the kind that reds on a reworded comment or a new page. One control adds
// a comment naming SpeedInsights, googletagmanager and gtag in prose, and it must stay green.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b66-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  // Both are FILES at the root and the suite reads them by name. A tree without them does not fail
  // that suite, it crashes it, and a crash scores as a caught sabotage: a harness that lies in your
  // favour is worse than none.
  for (const f of ['package.json', 'package-lock.json']) {
    cpSync(path.join(root, f), path.join(dir, f));
  }
  return dir;
}

const SUITES = ['test/b66analytics.test.mjs'];

function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\.?/.test(out)) return true;
      if (!/\d+ passed, 0 failed\.?/.test(out)) return true;
    } catch { return true; }
  }
  return false;
}

function baseline() {
  const dir = scratch();
  const red = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   1. package.json and package-lock.json are copied by scratch(), and the suite reads both');
    console.log('   2. the tally line matches the regex in runSuite');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 70)}`);
  writeFileSync(p, s.split(from).join(to));
};

const RL = 'app/layout.tsx';
const AL = 'app/app/layout.tsx';
const PJ = 'package.json';
const PL = 'package-lock.json';
const SUITE = 'test/b66analytics.test.mjs';

const MOUNT = '        <Analytics />\n';
const IMPORT = "import { Analytics } from '@vercel/analytics/next';\n";

const SABOTAGES = [
  // ── THE MOUNT GOES, WHICH IS THE STATE THIS ITEM EXISTS TO END. ───────────────────────────
  {
    name: '🔴 THE MOUNT IS REMOVED and the dashboard goes back to reading as no traffic rather than as not wired',
    apply: (d) => edit(d, RL, MOUNT, ''),
  },
  {
    name: '🔴 the import goes while the mount stays, which is a build error nobody sees until deploy',
    apply: (d) => edit(d, RL, IMPORT, ''),
  },
  {
    name: '🔴 THE MOUNT MOVES OUT OF THE ROOT LAYOUT into the signed in one, so every marketing page'
      + ' a stranger meets stops being measured',
    apply: (d) => {
      edit(d, RL, MOUNT, '');
      edit(d, RL, IMPORT, '');
      edit(d, AL, "import type { ReactNode } from 'react';",
        "import type { ReactNode } from 'react';\nimport { Analytics } from '@vercel/analytics/next';");
      edit(d, AL, '  return children;', '  return (<>{children}<Analytics /></>);');
    },
  },
  {
    name: '🔴 A SECOND MOUNT IS ADDED, so every page view under it is counted twice and the numbers'
      + ' a marketing spend is judged by are inflated',
    apply: (d) => {
      edit(d, AL, "import type { ReactNode } from 'react';",
        "import type { ReactNode } from 'react';\nimport { Analytics } from '@vercel/analytics/next';");
      edit(d, AL, '  return children;', '  return (<>{children}<Analytics /></>);');
    },
  },
  {
    name: '🔴 the specifier moves to the plain react entry, which renders and loses Next route tracking',
    apply: (d) => edit(d, RL, "from '@vercel/analytics/next';", "from '@vercel/analytics/react';"),
  },
  // ── THE DEPENDENCY. ───────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the dependency moves to devDependencies, so the build that ships has no analytics in it',
    apply: (d) => {
      edit(d, PJ, '    "@vercel/analytics": ', '    "REMOVED_analytics": ');
      edit(d, PJ, '  "devDependencies": {', '  "devDependencies": {\n    "@vercel/analytics": "^2.0.1",');
    },
  },
  {
    name: '🔴 the dependency is dropped from package.json while the lockfile still carries it',
    apply: (d) => edit(d, PJ, '    "@vercel/analytics": ', '    "REMOVED_analytics": '),
  },
  {
    name: '🔴 THE LOCKFILE IS NOT UPDATED, which is the quiet one: npm ci installs nothing and the'
      + ' build fails on Vercel rather than here',
    apply: (d) => edit(d, PL, '"node_modules/@vercel/analytics"', '"node_modules/@vercel/analytics_NOT_LOCKED"'),
  },
  // ── WHAT MUST NOT ARRIVE. ────────────────────────────────────────────────────────────────
  {
    name: '🔴 SPEED INSIGHTS IS ADDED TO THE DEPENDENCIES, which is a purchase nobody made',
    apply: (d) => edit(d, PJ, '    "@vercel/analytics": ', '    "@vercel/speed-insights": "^1.0.0",\n    "@vercel/analytics": '),
  },
  {
    name: '🔴 a SpeedInsights component is mounted for a product that is not enabled, which is dead'
      + ' code advertising a roadmap',
    apply: (d) => {
      edit(d, RL, IMPORT, IMPORT + "import { SpeedInsights } from '@vercel/speed-insights/next';\n");
      edit(d, RL, MOUNT, MOUNT + '        <SpeedInsights />\n');
    },
  },
  {
    name: '🔴 GOOGLE ANALYTICS ARRIVES BESIDE IT, which sets a cookie in a product holding tax records',
    apply: (d) => edit(d, RL, MOUNT,
      MOUNT + '        <script async src="https://www.googletagmanager.com/gtag/js" />\n'),
  },
  // ── THE SHELL ITSELF, WHICH THIS EDIT COULD HAVE BROKEN. ─────────────────────────────────
  {
    name: '🔴 the children are dropped while the mount stays, so the site renders an empty page that measures itself',
    apply: (d) => edit(d, RL, '        {children}\n', ''),
  },
  {
    name: '🔴 the lang attribute goes, a WCAG 2.1 Level A gap, which is exactly what this file was written to fix',
    apply: (d) => edit(d, RL, '<html lang="en">', '<html>'),
  },
  // ── THE SUITE'S OWN DERIVATION. ──────────────────────────────────────────────────────────
  {
    name: '🔴 THE ROOT IS HARDCODED IN THE SUITE and the mount moves, so a derived test stops being'
      + ' derived and stays green while the marketing pages stop being measured',
    apply: (d) => {
      edit(d, SUITE, "const roots = layouts.filter((f) => /<html[\\s>]/.test(codeOnly(read(f))));",
        "const roots = [path.join('app', 'layout.tsx')];");
      edit(d, RL, MOUNT, '');
      edit(d, RL, IMPORT, '');
      edit(d, AL, "import type { ReactNode } from 'react';",
        "import type { ReactNode } from 'react';\nimport { Analytics } from '@vercel/analytics/next';");
      edit(d, AL, '  return children;', '  return (<>{children}<Analytics /></>);');
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: a COMMENT is reworded and it names SpeedInsights, googletagmanager and gtag in prose, on purpose',
    apply: (d) => edit(d, RL, '// Root layout for the live marketing site',
      '// Reworded comment naming SpeedInsights, googletagmanager, gtag and posthog, none of which is code.\n// Root layout for the live marketing site'),
  },
  {
    name: 'CONTROL: whitespace is added inside the body',
    apply: (d) => edit(d, RL, '      <body>\n', '      <body>\n\n'),
  },
  {
    name: 'CONTROL: the metadata export is reworded, which is nothing to do with measurement',
    apply: (d) => edit(d, RL, 'export const metadata: Metadata = {',
      '// The canonical base, unchanged.\nexport const metadata: Metadata = {'),
  },
  {
    name: 'CONTROL: an unrelated page gains a comment, so a guard that walks the tree must not red on tree size',
    apply: (d) => edit(d, 'app/pricing/page.tsx', 'export', '// An unrelated comment.\nexport'),
  },
];

const only = process.env.SAB_ONLY ? Number(process.env.SAB_ONLY) : null;
const from = process.env.SAB_FROM ? Number(process.env.SAB_FROM) : 0;
const to = process.env.SAB_TO ? Number(process.env.SAB_TO) : SABOTAGES.length;
const sliced = from !== 0 || to !== SABOTAGES.length || only !== null;

baseline();

let caught = 0;
const holes = [];
const list = only !== null ? [SABOTAGES[only]] : SABOTAGES.slice(from, to);
for (const s of list) {
  const dir = scratch();
  let applied = true;
  try { s.apply(dir); } catch (e) { applied = false; console.log(`  🔴 MISSED ANCHOR  ${s.name}\n     ${e.message}`); }
  if (applied) {
    if (runSuite(dir)) { caught += 1; console.log(`  CAUGHT  ${s.name}`); }
    else { holes.push(s.name); console.log(`  🔴 HOLE    ${s.name}`); }
  }
  rmSync(dir, { recursive: true, force: true });
}

let controlsGreen = 0;
const badControls = [];
const runControls = !process.env.SAB_SKIP_CONTROLS;
if (runControls) {
  for (const c of CONTROLS) {
    const dir = scratch();
    try {
      c.apply(dir);
      if (runSuite(dir)) { badControls.push(c.name); console.log(`  🔴 CONTROL RED  ${c.name}`); }
      else { controlsGreen += 1; console.log(`  control green  ${c.name}`); }
    } catch (e) { badControls.push(`${c.name} (anchor: ${e.message})`); }
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${caught}/${list.length} sabotages caught, ${controlsGreen}/${runControls ? CONTROLS.length : 0} controls green.`);
if (sliced) console.log('NOT THE WHOLE PASS: run with no SAB_FROM, SAB_TO or SAB_ONLY for the full figure.');
if (holes.length) { console.log('\nHOLES:'); for (const h of holes) console.log(`  ${h}`); }
if (badControls.length) { console.log('\nBAD CONTROLS:'); for (const b of badControls) console.log(`  ${b}`); }
process.exitCode = holes.length || badControls.length || caught !== list.length ? 1 : 0;
