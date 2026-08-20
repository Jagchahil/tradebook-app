// SABOTAGE THE PROPERTY STREAM WATCH AND ITS REMEDY. B70, 20 August 2026.
//
//   node test/sabotage-b70propertystream.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THIS WATCH HAS THE TWO FAILURES OF EVERY WATCH AND ONE THAT IS ITS OWN.
//
//   IT NEVER FIRES. The verdict stops depending on it and the routing can regress on a real
//   customer's money while the endpoint answers 200.
//
//   IT FIRES FOR EVER. The historical count starts alarming, `+norah`'s three fixture rows put the
//   site at 503, and somebody turns the watch off inside a week. That is B65's lesson and it is
//   sabotaged three ways here: the wrong count, the boundary moved back, and a missing created_at
//   read as a regression.
//
//   ITS REMEDY BECOMES A WEAPON. The migration loses its user_id filter and one keystroke erases
//   the only surviving evidence of a P1 across the whole estate. Sabotaged, along with the warning
//   that says not to.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b70-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true, dereference: false });
  }
  // vercel.json is a FILE at the root and test/cronwatch.test.mjs reads it by name. A tree without
  // it does not fail that suite, it CRASHES it, and a crash scores as a caught sabotage: a harness
  // that lies in your favour is worse than none.
  cpSync(path.join(root, 'vercel.json'), path.join(dir, 'vercel.json'));
  return dir;
}

const SUITES = ['test/b70propertystream.test.mjs', 'test/cronwatch.test.mjs'];

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


const HL = 'app/api/health/route.ts';
const CW = 'lib/cronwatch.ts';
const DB = 'lib/supabase.ts';
const SQL = 'supabase/APPLY_2026-08-20_property_stream_backfill.sql';
const SUITE = 'test/b70propertystream.test.mjs';

const SABOTAGES = [
  // ── IT NEVER FIRES. ───────────────────────────────────────────────────────────────────────
  {
    name: '🔴 the public verdict stops depending on it, so a regression on a real customer keeps a 200',
    // \u26a0\ufe0f THE SMALLEST STABLE SUBSTRING, on purpose. Quoting the whole conjunction is what
    // killed four of B65's anchors when this very item added a conjunct to it. See that file.
    apply: (d) => edit(d, HL, ' && propertyOk', ''),
  },
  {
    name: '🔴 the operator verdict stops depending on it too',
    apply: (d) => edit(d, HL, ' && misfiledProperty === null', ''),
  },
  {
    name: '🔴 a regression stops being an alarm at all',
    apply: (d) => edit(d, CW, '  if (health.sinceFix === 0) return null;', '  return null;'),
  },
  {
    name: '🔴 THE null READ SCORES AS HEALTHY, the blind spot this file has now had five times',
    apply: (d) => edit(d, CW, `  if (health === null) {
    return {
      job: 'property',`, `  if (health === null) {
    return null;
  }
  if (false) {
    return {
      job: 'property',`),
  },
  {
    name: '🔴 the alarm reason becomes never_run, so it exists and blocks nothing',
    apply: (d) => edit(d, CW, `    job: 'property',
    reason: 'failed',`, `    job: 'property',
    reason: 'never_run',`),
  },
  // ── IT FIRES FOR EVER, WHICH IS HOW A WATCH GETS MUTED. ──────────────────────────────────
  {
    name: '🔴 THE HISTORICAL COUNT STARTS ALARMING, so Norah\'s three fixture rows put the site at'
      + ' 503 for ever and somebody turns the watch off within a week',
    apply: (d) => edit(d, CW, '  if (health.sinceFix === 0) return null;', '  if (health.misfiled === 0) return null;'),
  },
  {
    name: '🔴 the boundary moves back before B62 shipped, so every pre fix row is read as a regression',
    apply: (d) => edit(d, CW, "export const PROPERTY_STREAM_SINCE = '2026-08-20T00:00:00.000Z';",
      "export const PROPERTY_STREAM_SINCE = '2026-01-01T00:00:00.000Z';"),
  },
  {
    name: '🔴 the boundary moves a year forward, so a real regression can never be seen at all',
    apply: (d) => edit(d, CW, "export const PROPERTY_STREAM_SINCE = '2026-08-20T00:00:00.000Z';",
      "export const PROPERTY_STREAM_SINCE = '2027-08-20T00:00:00.000Z';"),
  },
  // ── IT COUNTS THE WRONG THING. ──────────────────────────────────────────────────────────
  {
    name: '🔴 every row is counted as a regression whatever its age, which is the same as no boundary',
    apply: (d) => edit(d, DB, '      if (at && at >= sinceISO) sinceFix += 1;', '      sinceFix += 1;'),
  },
  {
    name: '🔴 A ROW WITH NO created_at IS COUNTED AS A REGRESSION, so a missing field accuses the product',
    apply: (d) => edit(d, DB, '      if (at && at >= sinceISO) sinceFix += 1;', '      if (!at || at >= sinceISO) sinceFix += 1;'),
  },
  {
    name: '🔴 the read stops filtering on confirmed, so a receipt waiting in the pile is read as a misfile',
    apply: (d) => edit(d, DB, '?select=user_id,created_at&confirmed=eq.true', '?select=user_id,created_at'),
  },
  {
    name: '🔴 the read stops excluding rows that ARE in the property stream, so every correctly filed'
      + ' landlord cost is reported as misfiled',
    apply: (d) => edit(d, DB, '&income_type=neq.property&category=in.', '&category=in.'),
  },
  {
    name: '🔴 the accounts stop being deduplicated, so a to do list of one man reads as a fleet',
    apply: (d) => edit(d, DB, '    const accounts = new Set<string>();', '    const accounts = { add() {}, size: 0 } as unknown as Set<string>;'),
  },
  {
    name: '🔴 capped is hardcoded false, so a read that ran out of room reports clean',
    apply: (d) => edit(d, DB, '    const capped = rows.length >= PROPERTY_STREAM_READ_LIMIT;', '    const capped = false;'),
  },
  {
    name: '🔴 the reader widens to the amount and the vendor, on a row it had no reason to read',
    apply: (d) => edit(d, DB, '?select=user_id,created_at&confirmed=eq.true', '?select=user_id,created_at,amount,vendor&confirmed=eq.true'),
  },
  // ── THE PUBLIC BODY. ────────────────────────────────────────────────────────────────────
  {
    name: '🔴 THE PUBLIC BODY LEAKS THE COUNTS, so a stranger learns how many customers have a wrong bill',
    apply: (d) => edit(d, HL, "      property: propertyStream === null ? 'unknown' : propertyOk ? 'ok' : 'misfiled',",
      '      property: propertyStream,'),
  },
  {
    name: '🔴 the operator body drops the account count, so the to do list loses its length',
    apply: (d) => edit(d, HL, '          accounts: propertyStream.accounts,', ''),
  },
  // ── THE REMEDY THE WATCH POINTS AT. ─────────────────────────────────────────────────────
  {
    name: '🔴 THE MIGRATION BECOMES A SWEEP: the user_id filter goes and one keystroke erases the'
      + ' only surviving evidence of a P1',
    apply: (d) => edit(d, SQL, "   set income_type = 'property'\n where user_id = '00000000-0000-0000-0000-000000000000'   -- <<< REPLACE, and check it twice\n   and confirmed = true",
      "   set income_type = 'property'\n where confirmed = true"),
  },
  {
    name: '🔴 the migration stops returning what it touched, so a zero row update reads as success',
    apply: (d) => edit(d, SQL, 'returning id, category, amount, transaction_date, created_at;', ';'),
  },
  {
    name: '🔴 the migration moves UNCONFIRMED rows too, filing things he has never agreed to',
    apply: (d) => edit(d, SQL, "   and confirmed = true\n   and income_type <> 'property'\n   and lower(btrim(category))", "   and income_type <> 'property'\n   and lower(btrim(category))"),
  },
  {
    name: '🔴 THE CATEGORY LIST IN THE SQL DRIFTS FROM THE MODULE, which is the rot a typed list has',
    apply: (d) => edit(d, SQL, "and lower(btrim(category)) in ('mortgage interest', 'letting agent', 'property repairs', 'ground rent')",
      "and lower(btrim(category)) in ('mortgage interest', 'letting agent', 'property repairs')"),
  },
  {
    name: '🔴 the warning about Norah goes, so the next person runs it on the evidence',
    apply: (d) => edit(d, SQL, "-- ⚠️ NEVER RUN THIS WITHOUT A user_id FILTER, AND NEVER RUN IT FOR `+norah`. Her rows are the\n-- evidence.", '-- Run it.'),
  },
  // ── THE SUITE'S OWN DERIVATION. ─────────────────────────────────────────────────────────
  {
    name: '🔴 THE SUITE HARDCODES THE SQL LIST and the module gains a fifth category, so a derived'
      + ' test stops being derived and the remedy silently stops moving one of them',
    apply: (d) => {
      edit(d, SUITE, "const sqlList = `(${[...L.PROPERTY_CATEGORIES].map((c) => `'${c}'`).join(', ')})`;",
        "const sqlList = \"('mortgage interest', 'letting agent', 'property repairs', 'ground rent')\";");
      edit(d, 'lib/propertylanes.ts', "  'ground rent',\n] as const;", "  'ground rent',\n  'service charge',\n] as const;");
    },
  },
];

// NO OP CONTROLS. Each changes the files and changes NOTHING these guards are about.
const CONTROLS = [
  {
    name: 'CONTROL: an INTERNAL LOCAL is renamed inside the reader',
    apply: (d) => {
      edit(d, DB, '  const wanted = categories.map', '  const cats = categories.map');
      edit(d, DB, '  if (wanted.length === 0) return null;', '  if (cats.length === 0) return null;');
      edit(d, DB, '  const list = wanted.map', '  const list = cats.map');
    },
  },
  {
    name: 'CONTROL: the two verdict conjuncts are REORDERED',
    apply: (d) => edit(d, HL, '&& signupsOk && propertyOk', '&& propertyOk && signupsOk'),
  },
  {
    name: 'CONTROL: a COMMENT is reworded and it quotes the counts and the categories back, on purpose',
    apply: (d) => edit(d, CW, '// WHEN B62 SHIPPED, AND WHY IT IS MIDNIGHT RATHER THAN THE COMMIT MINUTE.',
      "// Reworded comment. It mentions sinceFix, misfiled, ground rent and income_type <> 'property',"
      + ' and none of it is code.\n// WHEN B62 SHIPPED, AND WHY IT IS MIDNIGHT RATHER THAN THE COMMIT MINUTE.'),
  },
  {
    name: 'CONTROL: a comment is reworded inside the migration, which owns the remedy but not the watch',
    apply: (d) => edit(d, SQL, '-- ── 3. WHAT HE LOOKS LIKE NOW. Changes nothing. ────────────────────────────────────────────',
      '-- ── 3. WHAT HE LOOKS LIKE NOW, reworded. Changes nothing. ──────────────────────────────────'),
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
