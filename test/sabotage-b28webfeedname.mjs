// SABOTAGE B28 (WEB HALF). Put the other name back in front of a web customer and make it bite.
//
// Small on purpose: one line of product code, one guard, one thing to prove. The pass exists
// because the line it protects is the kind nobody re reads, and because "the feed says Lekhio" is
// the sort of claim that goes on being written down long after it stops being true.
//
//   node test/sabotage-b28webfeedname.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b28-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/feed.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return /[1-9]\d* failed/.test(out);
  } catch {
    return true;
  }
}

// 🔴 An UNMODIFIED tree must be GREEN before anything below is scored.
function baseline() {
  const dir = scratch();
  const red = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   1. every directory feed.test.mjs READS is copied by scratch()');
    console.log('   2. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};

const TITLE = "      title: m.role === 'user' ? 'You asked.' : 'Lekhio answered.',";

const SABOTAGES = [
  {
    name: 'the role branch comes back, so a stored puchio turn shows the other name',
    apply: (d) => edit(d, 'lib/supabase.ts', TITLE,
      "      title: m.role === 'user' ? 'You asked.' : m.role === 'puchio' ? 'Puchio answered.' : 'Lekhio answered.',"),
  },
  {
    name: 'every answer is renamed, not just the stored ones',
    apply: (d) => edit(d, 'lib/supabase.ts', TITLE,
      "      title: m.role === 'user' ? 'You asked.' : 'Puchio answered.',"),
  },
  {
    name: 'his own question stops being his',
    apply: (d) => edit(d, 'lib/supabase.ts', TITLE,
      "      title: 'Lekhio answered.',"),
  },
];

// NO OP CONTROLS. A rename of the row local, consistently, is invisible to a customer and is the
// only thing that can see a guard anchored on an identifier rather than on the work.
const CONTROLS = [
  {
    name: 'a comment is reworded above the title',
    apply: (d) => edit(d, 'lib/supabase.ts',
      '// 🔴 THE WEB FEED SAYS LEKHIO, WHATEVER ROLE THE ROW CARRIES.',
      '// 🔴 THE WEB FEED SAYS LEKHIO WHICHEVER ROLE THE ROW CARRIES.'),
  },
  {
    name: 'the two branches are reordered without changing either answer',
    apply: (d) => edit(d, 'lib/supabase.ts', TITLE,
      "      title: m.role !== 'user' ? 'Lekhio answered.' : 'You asked.',"),
  },
];

baseline();

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of SABOTAGES) {
  const dir = scratch();
  try { s.apply(dir); } catch (e) {
    missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`);
    rmSync(dir, { recursive: true, force: true }); continue;
  }
  if (runSuite(dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

let controlsOk = 0, controlsBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of CONTROLS) {
  const dir = scratch();
  try { c.apply(dir); } catch (e) {
    controlsBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`);
    rmSync(dir, { recursive: true, force: true }); continue;
  }
  if (runSuite(dir)) { controlsBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { controlsOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

console.log('');
console.log(`${caught}/${SABOTAGES.length} sabotages caught, ${controlsOk}/${CONTROLS.length} controls green.`);
if (missed > 0 || controlsBad > 0) process.exit(1);
