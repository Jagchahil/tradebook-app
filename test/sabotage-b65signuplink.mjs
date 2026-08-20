// SABOTAGE THE SIGNUP LINK WATCH. B65, 20 August 2026.
//
//   node test/sabotage-b65signuplink.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A WATCHER HAS THREE WAYS TO BE USELESS AND ONLY ONE OF THEM LOOKS BROKEN.
//
//   IT NEVER FIRES. The verdict stops depending on it, or the alarm stops being an alarm, and the
//   endpoint keeps answering 200 while a customer is locked out of his own books.
//
//   IT FIRES FOR EVER. The tell widens from "a proved address" to "a signup row with no user_id",
//   which is what an ABANDONED signup is, permanently. That watch is red within an hour of the
//   first pound of traffic and muted by the end of the week, and a muted alarm looks like cover.
//
//   IT ANSWERS THE WRONG QUESTION CONFIDENTLY. The join moves to email_norm, which strips plus tags
//   and gmail dots, so twenty two persona addresses become one row. Nothing errors. Every figure is
//   wrong in both directions at once.
//
// All three are sabotaged, plus the reader's own honesty about a read it could not finish, and the
// stageable tail rule that this session broke for real and the gate caught.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b65-'));
  for (const d of ['lib', 'test', 'app']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  // vercel.json is a FILE at the root and test/cronwatch.test.mjs reads it by name to check the
  // dispatchers against the ceilings. A tree without it does not fail that suite, it crashes it,
  // and a crash scores as a caught sabotage, which is a harness that lies in your favour.
  cpSync(path.join(root, 'vercel.json'), path.join(dir, 'vercel.json'));
  return dir;
}

const SUITES = ['test/b65signuplink.test.mjs', 'test/cronwatch.test.mjs', 'test/signindoor.test.mjs'];

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
    console.log('   1. lib/, app/ and test/ are all copied by scratch(), and the suites read all three');
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

const HL = 'app/api/health/route.ts';
const CW = 'lib/cronwatch.ts';
const DB = 'lib/supabase.ts';
const SUITE = 'test/b65signuplink.test.mjs';

const SABOTAGES = [
  // ── IT NEVER FIRES. ───────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the public verdict stops depending on it, so a locked out customer keeps a 200',
    // \u26a0\ufe0f RE ANCHORED 20 August 2026 BY B70, AND THE LESSON IS BIGGER THAN THE REPAIR.
    // These quoted the WHOLE `healthy =` conjunction, so the next check added to /api/health killed
    // them, silently, and a dead anchor throws before the tree runs and scores as a CATCH. That is
    // the backlog's "an anchor that quotes the edge of a list breaks" rule on a line that is
    // GUARANTEED to grow: every new watch adds a conjunct. The anchors are now the smallest stable
    // substring, so the next one costs nobody anything.
    apply: (d) => edit(d, HL, ' && signupsOk', ''),
  },
  {
    name: '🔴 the operator verdict stops depending on it, so the strict question answers ok too',
    apply: (d) => edit(d, HL, ' && strandedSignups === null', ''),
  },
  {
    name: '🔴 the alarm is dropped from the operator list, so whoever holds the pager is never told what it is',
    apply: (d) => edit(d, HL, ', ...(strandedSignups ? [strandedSignups] : [])', ''),
  },
  {
    name: '🔴 a stranded person stops being an alarm at all',
    apply: (d) => edit(d, CW, '  if (health.unlinked === 0) return null;', '  return null;'),
  },
  {
    name: '🔴 THE null READ SCORES AS HEALTHY, which is the blind spot this file has now had four times',
    apply: (d) => edit(d, CW, `  if (health === null) {
    return {
      job: 'signups',`, `  if (health === null) {
    return null;
  }
  if (false) {
    return {
      job: 'signups',`),
  },
  {
    name: '🔴 the alarm reason becomes never_run, which blockingAlarms filters out, so it exists and blocks nothing',
    apply: (d) => edit(d, CW, `    job: 'signups',
    reason: 'failed',`, `    job: 'signups',
    reason: 'never_run',`),
  },
  {
    name: '🔴 THE SECOND READ FAILING BECOMES A CLEAN ZERO, so an unreadable half reports nobody stranded',
    apply: (d) => edit(d, DB, '    if (!lres.ok) return null;',
      '    if (!lres.ok) return { proved, unlinked: 0, oldestProvedAt: null, ...shape, capped };'),
  },
  // ── IT FIRES FOR EVER. ────────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE TELL WIDENS TO EVERY CODE, CONSUMED OR NOT, so ordinary funnel abandonment turns'
      + ' the site red and the alarm is muted within a week',
    apply: (d) => edit(d, DB, '/signup_codes?select=email,consumed_at&consumed_at=not.is.null',
      '/signup_codes?select=email,consumed_at'),
  },
  {
    name: '🔴 the grace goes, so a person mid verify trips it between two of his own writes',
    apply: (d) => edit(d, DB, '&consumed_at=lte.${encodeURIComponent(youngest)}', ''),
  },
  {
    name: '🔴 the grace is cut to nothing, which is the same fault as a number rather than as a filter',
    apply: (d) => edit(d, CW, 'export const SIGNUP_LINK_GRACE_MINUTES = 10;', 'export const SIGNUP_LINK_GRACE_MINUTES = 0;'),
  },
  {
    name: '🔴 the lookback is cut to a day, so a red does not survive a weekend of nobody looking',
    apply: (d) => edit(d, CW, 'export const SIGNUP_LINK_LOOKBACK_DAYS = 14;', 'export const SIGNUP_LINK_LOOKBACK_DAYS = 1;'),
  },
  // ── IT ANSWERS THE WRONG QUESTION CONFIDENTLY. ────────────────────────────────────────────
  {
    name: '🔴 THE JOIN MOVES TO email_norm, so twenty two persona addresses become one row and every'
      + ' figure is wrong in both directions at once',
    apply: (d) => {
      edit(d, DB, '/signup_codes?select=email,consumed_at&consumed_at=not.is.null',
        '/signup_codes?select=email_norm,consumed_at&consumed_at=not.is.null');
      edit(d, DB, "      const key = String(r?.email ?? '').trim().toLowerCase();",
        "      const key = String(r?.email_norm ?? '').trim().toLowerCase();");
    },
  },
  {
    name: '🔴 the oldest proof becomes the newest, so a man locked out for a week is reported as minutes',
    apply: (d) => edit(d, DB, '      if (oldestProvedAt === null || at < oldestProvedAt) oldestProvedAt = at;',
      '      if (oldestProvedAt === null || at > oldestProvedAt) oldestProvedAt = at;'),
  },
  {
    name: '🔴 the second read stops filtering on a link, so every proved address looks linked',
    apply: (d) => edit(d, DB, '/rest/v1/signups?select=email&user_id=not.is.null', '/rest/v1/signups?select=email'),
  },
  // ── THE HONESTY OF A PARTIAL READ. ───────────────────────────────────────────────────────
  {
    name: '🔴 capped is hardcoded false, so a read that ran out of room reports a clean bill of health',
    apply: (d) => edit(d, DB, '    const capped = rows.length >= SIGNUP_LINK_READ_LIMIT;', '    const capped = false;'),
  },
  {
    name: '🔴 a capped read stops being an alarm, which is the answer that looks like good news',
    apply: (d) => edit(d, CW, '  if (health.capped) {', '  if (false) {'),
  },
  {
    name: '🔴 the operator body drops capped, so the one field that says the read was partial is gone',
    apply: (d) => edit(d, HL, '          capped: signupLinks.capped,', ''),
  },
  // ── THE HOUSE RULES THE ROW SITS UNDER. ──────────────────────────────────────────────────
  {
    name: '🔴 THE PUBLIC BODY LEAKS THE COUNTS, so a stranger learns how many of our customers are locked out',
    apply: (d) => edit(d, HL, "      signups: signupLinks === null ? 'unknown' : signupsOk ? 'ok' : 'stranded',",
      '      signups: signupLinks,'),
  },
  {
    name: '🔴 the reader widens to the code hash, on a row it had no reason to read',
    apply: (d) => edit(d, DB, '/signup_codes?select=email,consumed_at', '/signup_codes?select=email,consumed_at,code_hash'),
  },
  {
    name: '🔴 A VALUE IMPORT GOES BACK INTO THE STAGEABLE TAIL OF lib/supabase.ts, which is the'
      + ' mistake this session made for real and the gate caught',
    apply: (d) => edit(d, DB, 'export const SIGNUP_LINK_READ_LIMIT = 120;',
      "import { AUTH_SEND_MIN_ATTEMPTS } from './cronwatch';\nexport const SIGNUP_LINK_READ_LIMIT = 120 + AUTH_SEND_MIN_ATTEMPTS - 3;"),
  },
  // ── THE SUITE'S OWN DERIVATION. ──────────────────────────────────────────────────────────
  {
    name: '🔴 THE CAP BOUNDARY IS HARDCODED IN THE SUITE and the reader is given a different limit,'
      + ' so a derived test stops being derived',
    apply: (d) => {
      edit(d, DB, 'export const SIGNUP_LINK_READ_LIMIT = 120;', 'export const SIGNUP_LINK_READ_LIMIT = 200;');
      edit(d, SUITE, 'for (let i = 0; i < DB.SIGNUP_LINK_READ_LIMIT; i += 1)', 'for (let i = 0; i < 120; i += 1)');
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: an INTERNAL LOCAL is renamed inside the reader, and no guard here is about an identifier',
    apply: (d) => {
      edit(d, DB, '    const provedAt = new Map<string, string>();', '    const firstProof = new Map<string, string>();');
      edit(d, DB, '      const seen = provedAt.get(key);', '      const seen = firstProof.get(key);');
      edit(d, DB, '      if (!seen || at < seen) provedAt.set(key, at);', '      if (!seen || at < seen) firstProof.set(key, at);');
      edit(d, DB, '    const proved = provedAt.size;', '    const proved = firstProof.size;');
      edit(d, DB, '    const list = [...provedAt.keys()]', '    const list = [...firstProof.keys()]');
      edit(d, DB, '    for (const [email, at] of provedAt) {', '    for (const [email, at] of firstProof) {');
    },
  },
  {
    name: 'CONTROL: the two verdict conjuncts are REORDERED, which changes the source and no behaviour',
    apply: (d) => edit(d, HL, '&& signInOk && signupsOk', '&& signupsOk && signInOk'),
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it names email_norm, code_hash and the counts in prose, on purpose',
    apply: (d) => edit(d, CW, '// THE GRACE, AND THE ARGUMENT FOR THE NUMBER.',
      '// Reworded comment mentioning email_norm, code_hash, unlinked counts and never_run, none of which is code.\n// THE GRACE, AND THE ARGUMENT FOR THE NUMBER.'),
  },
  {
    name: 'CONTROL: whitespace is added inside the alarm body',
    apply: (d) => edit(d, CW, '  if (health.unlinked === 0) return null;\n', '  if (health.unlinked === 0) return null;\n\n'),
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
