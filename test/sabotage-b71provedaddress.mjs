// SABOTAGE THE PROVED ADDRESS. B71, 20 August 2026.
//
//   node test/sabotage-b71provedaddress.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THIS IS THE SIGNUP DOOR, SO THE SABOTAGES COME IN TWO KINDS AND THE SECOND KIND MATTERS MORE.
//
//   IT PROVES THE WRONG ADDRESS. Back to the typed string, or to the normalised one, or unsettled,
//   or the row stops carrying the address at all. Each mints an account at an address that is not
//   the one the code was delivered to, and each leaves a signups row nobody can sign in through.
//
//   IT WEAKENS THE PROOF ITSELF, WHICH THIS CHANGE MUST NOT HAVE DONE. The hash stops being bound
//   to an address, or a spent code stops being refused, or the address is decided before the code
//   is consumed. Those are not B71 regressions, they are the things B71 had to leave standing, and
//   a change to this route that quietly loosened one of them would be far worse than the bug it
//   fixed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b71-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  return dir;
}

const SUITES = ['test/b71provedaddress.test.mjs', 'test/signupcode.test.mjs'];

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
    console.log('   1. lib/, app/ and test/ are all copied by scratch(), and both suites read all three');
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


const RT = 'app/api/signup/verify/route.ts';
const DB = 'lib/supabase.ts';
const SC = 'lib/signupcode.ts';
const SUITE = 'test/b71provedaddress.test.mjs';

const LIVE = "  const verifiedEmail = String(row!.email ?? '').trim().toLowerCase() || email;";

const SABOTAGES = [
  // ── IT GOES BACK TO THE TYPED STRING. ────────────────────────────────────────────────────
  {
    name: '🔴 THE DEFECT RESTORED: the proved address is whatever he retyped, so a spelling variant'
      + ' mints an account at an address he never gave us',
    apply: (d) => edit(d, RT, LIVE, '  const verifiedEmail = email;'),
  },
  {
    name: '🔴 the NORM is proved instead of the address, so a plus tagged signup mints an account at'
      + ' the bare address and his own is never reachable',
    apply: (d) => edit(d, RT, LIVE, '  const verifiedEmail = emailNorm;'),
  },
  {
    name: '🔴 the address is taken from the row but never settled, so a stored capital letter files'
      + ' a bridge findContactAccount can never read',
    apply: (d) => edit(d, RT, LIVE, "  const verifiedEmail = String(row!.email ?? '') || email;"),
  },
  {
    name: '🔴 the empty fallback goes, so a row with no address mints an account for an empty string',
    apply: (d) => edit(d, RT, LIVE, "  const verifiedEmail = String(row!.email ?? '').trim().toLowerCase();"),
  },
  // ── THE ROW STOPS CARRYING IT. ───────────────────────────────────────────────────────────
  {
    name: '🔴 THE READER STOPS SELECTING THE ADDRESS, so the row cannot say where the code went and'
      + ' every proof falls back to the form',
    apply: (d) => edit(d, DB, '&select=id,email,code_hash,attempts,expires_at,consumed_at',
      '&select=id,code_hash,attempts,expires_at,consumed_at'),
  },
  {
    name: '🔴 the field goes off the type, so a caller has to guess whether it is there',
    apply: (d) => edit(d, DB, '  email: string;\n}', '}'),
  },
  // ── THE ORDER. ───────────────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE ADDRESS IS DECIDED BEFORE THE CODE IS SPENT, so a losing race could mint on a row'
      + ' another request already used',
    apply: (d) => {
      edit(d, RT, LIVE, '');
      edit(d, RT, '  const verdict = verifyStoredCode(row, emailNorm, code);',
        LIVE + '\n  const verdict = verifyStoredCode(row, emailNorm, code);');
    },
  },
  // ── THE VERDICT ITSELF, WHICH THIS MUST NOT HAVE WEAKENED. ───────────────────────────────
  {
    name: '🔴 the verdict checks the hash against the ROW\'S address rather than the norm it was'
      + ' built with, so no code ever verifies again',
    apply: (d) => edit(d, RT, '  const verdict = verifyStoredCode(row, emailNorm, code);',
      '  const verdict = verifyStoredCode(row, String(row?.email ?? \'\'), code);'),
  },
  {
    name: '🔴 the code stops being bound to an address at all, so a hash lifted from one row replays'
      + ' against another',
    apply: (d) => edit(d, SC, '  return crypto.createHmac(\'sha256\', SECRET).update(`${emailNorm}:${code}`).digest(\'hex\');',
      "  return crypto.createHmac('sha256', SECRET).update(String(code)).digest('hex');"),
  },
  {
    name: '🔴 a spent code stops being refused, so one proof opens two sessions',
    apply: (d) => edit(d, SC, "  if (row.consumed_at) return 'spent';", ''),
  },
  // ── THE SUITE'S OWN DERIVATION. ──────────────────────────────────────────────────────────
  {
    name: '🔴 THE VACUITY PROBE IS NEUTERED: the deliberately broken stage is handed the line that'
      + ' already ships, so the suite can no longer show that anything changed',
    apply: (d) => edit(d, SUITE, "    '  const verifiedEmail = email;\\n  const emailNorm = normaliseEmail(email) || email;');",
      "    '  const emailNorm = normaliseEmail(email) || email;');"),
  },
  {
    name: '🔴 THE SUITE MIRRORS normaliseEmail INSTEAD OF CALLING IT and the real one changes under'
      + ' it, so a harness bug starts wearing the costume of a product bug',
    apply: (d) => {
      edit(d, SUITE, '  const norm = N.normaliseEmail(typed) || typed;', '  const norm = typed;');
      edit(d, 'lib/trialidentity.ts', "  const plus = local.indexOf('+');", "  const plus = -1; const unusedPlus = local.indexOf('+');");
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: a COMMENT is reworded and it quotes verifiedEmail and row.email back, on purpose',
    apply: (d) => edit(d, RT, '  // 🔴 B71. THE ADDRESS HE PROVED IS THE ONE WE EMAILED, NOT THE ONE HE RETYPED.',
      '  // Reworded comment. It mentions verifiedEmail = email and row.email and emailNorm, and none'
      + ' of it is code.\n  // 🔴 B71. THE ADDRESS HE PROVED IS THE ONE WE EMAILED, NOT THE ONE HE RETYPED.'),
  },
  {
    name: 'CONTROL: whitespace is added above the proved address line',
    apply: (d) => edit(d, RT, LIVE, '\n' + LIVE),
  },
  {
    name: 'CONTROL: the select columns are REORDERED, which changes the request and no answer',
    apply: (d) => edit(d, DB, '&select=id,email,code_hash,attempts,expires_at,consumed_at',
      '&select=email,id,code_hash,attempts,expires_at,consumed_at'),
  },
  {
    name: 'CONTROL: a comment is reworded in lib/signupcode.ts, which owns the rules but not the address',
    apply: (d) => edit(d, SC, '// THE SIX DIGITS THAT MAKE AN ACCOUNT. Pure, so the rules can be attacked directly.',
      '// Reworded. THE SIX DIGITS THAT MAKE AN ACCOUNT. Pure, so the rules can be attacked directly.'),
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
