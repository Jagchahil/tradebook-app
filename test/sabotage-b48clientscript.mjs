// SABOTAGE THE ARBITRARY CODE DOOR. B48, 19 August 2026.
//
//   node test/sabotage-b48clientscript.mjs
//
// ═══════════════════════════════════════════════════════════
// app/_shared/ClientScript.tsx takes a string and runs it. It is safe today because all five of
// its callers pass a module level constant, and until this packet nothing said it had to stay
// that way. The guard is section B48 of test/csp.test.mjs and every assertion in it is a SOURCE
// SCAN, so it is worth exactly what this pass proves.
//
// ⚠️ THE FINDING WORTH MORE THAN THE COMPONENT IS THE COUNT. The P4 trace said ONE caller,
// having scanned 62 files of about 250, and said so in its own coverage table one section
// earlier. So the sabotages below include the two shapes a wrong count takes: a SIXTH caller
// arriving, and the walk that finds them being narrowed until it can only see the first.
// ═══════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b48-'));
  // next.config.mjs is a FILE rather than a directory and test/csp.test.mjs reads the policy out
  // of it, so it is copied by name. A tree without it does not fail that suite, it crashes it.
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  cpSync(path.join(root, 'next.config.mjs'), path.join(dir, 'next.config.mjs'));
  return dir;
}

const SUITES = ['test/csp.test.mjs'];

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
    console.log('   1. every file and directory test/csp.test.mjs READS is copied by scratch()');
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

const COMP = 'app/_shared/ClientScript.tsx';
const PRICING = 'app/pricing/page.tsx';
const MTD = 'app/how-mtd-works/page.tsx';
const CFG = 'next.config.mjs';

const SABOTAGES = [
  {
    name: '🔴 a SIXTH caller arrives, so the count that forces the decision is out of date',
    apply: (d) => edit(d, PRICING, '      <ClientScript js={PRICING_JS} />',
      '      <ClientScript js={PRICING_JS} />\n      <ClientScript js={PRICING_JS} />'),
  },
  {
    name: '🔴 a caller stops passing a constant and passes something off the page instead',
    apply: (d) => edit(d, MTD, '      <ClientScript js={MTD_JS} />', '      <ClientScript js={sp.js} />'),
  },
  {
    name: '🔴 THE QUIET ONE: the constant becomes a let, so it can be reassigned before it is run',
    apply: (d) => edit(d, MTD, 'const MTD_JS = `', 'let MTD_JS = `'),
  },
  {
    name: '🔴 the constant moves inside the component, so it is no longer module level',
    apply: (d) => edit(d, MTD, '\nconst MTD_JS = `', '\n  const MTD_JS = `'),
  },
  {
    name: '🔴 the component switches to new Function, which the policy forbids and the header knows',
    apply: (d) => edit(d, COMP, "    const el = document.createElement('script');\n    el.textContent = js;",
      '    const el = document.createElement(\'script\');\n    new Function(js)();'),
  },
  {
    name: '🔴 the component stops running a script element at all, so the header stops being true',
    apply: (d) => edit(d, COMP, '    document.body.appendChild(el);', '    // no longer appended'),
  },
  {
    name: '🔴 unsafe-eval is added to script-src, which is the reason the component is shaped as it is',
    apply: (d) => edit(d, CFG, `"script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"`,
      `"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"`),
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: a COMMENT is reworded in ClientScript, and the absence check must not read prose',
    apply: (d) => edit(d, COMP, '// Runs a page\'s vanilla JS so it works on CLIENT SIDE NAVIGATION, not just on a',
      '// Reworded comment. It mentions new Function and eval on purpose, and neither is code.'),
  },
  {
    name: 'CONTROL: the constant is RENAMED on one caller, and a guard that reds here is about a name',
    apply: (d) => {
      edit(d, PRICING, 'const PRICING_JS = `', 'const PRICING_PAGE_JS = `');
      edit(d, PRICING, '<ClientScript js={PRICING_JS} />', '<ClientScript js={PRICING_PAGE_JS} />');
    },
  },
  {
    name: 'CONTROL: whitespace is added inside the effect body',
    apply: (d) => edit(d, COMP, '    el.textContent = js;', '    el.textContent = js;\n'),
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
